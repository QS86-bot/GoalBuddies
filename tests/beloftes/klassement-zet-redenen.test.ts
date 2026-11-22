import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';


import { klassementMeldingen } from '../../src/modules/buddies/klassement';

vi.mock('../../src/lib/supabase', () => ({ supabase: () => ({}) }));
vi.mock('../../src/lib/observability', () => ({ reportError: vi.fn() }));

/**
 * Elke weigerreden van `zet_groepsklassement()` heeft een klassementtekst — QS8-666 (A57), deel 3a.
 *
 * ⚠️ **Een naad en geen onderdeel.** De database en de meldingentabel zijn elk afzonderlijk
 *    correct, en ze lopen uit elkaar zodra een migratie een reden toevoegt: de gebruiker leest dan
 *    de korte terugvaltekst waar een uitleg hoort. Daarom leest deze toets de redenen uit de
 *    **laatste definitie** van de functie in `supabase/migrations/` en legt ze naast de sleutels.
 *
 * IJKING (met de hand, 22-11-2026): `unchanged` uit `klassementMeldingen()` halen → 'kent elke
 * reden' valt om; een reden toevoegen aan een kopie van de SQL → `redenenIn()` vindt hem en de
 * vergelijking valt om.
 */
const MIGRATIES = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

/** De redenen die één functiedefinitie teruggeeft. */
export function redenenIn(sql: string): readonly string[] {
  return [...new Set([...sql.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1] ?? ''))].sort();
}

/** Het lichaam van de laatste definitie van een functie, en dus niet van een oudere. */
export function laatsteDefinitie(bestanden: readonly { naam: string; sql: string }[], functie: string): string | null {
  const kop = `function public.${functie}(`;
  const gesorteerd = [...bestanden].sort((a, b) => b.naam.localeCompare(a.naam));
  for (const { sql } of gesorteerd) {
    const begin = sql.indexOf(kop);
    if (begin === -1) continue;
    const eind = sql.indexOf('$function$;', begin);
    return sql.slice(begin, eind === -1 ? undefined : eind);
  }
  return null;
}

describe('redenenIn', () => {
  it('vindt elke reden één keer', () => {
    expect(redenenIn(`'reason', 'a'  ... 'reason', 'b' ... 'reason',  'a'`)).toEqual(['a', 'b']);
  });

  it('negeert een reden in een ander formaat niet stilzwijgend', () => {
    expect(redenenIn(`jsonb_build_object('ok', false, 'reason', 'not_admin')`)).toEqual(['not_admin']);
  });
});

describe('laatsteDefinitie', () => {
  it('neemt de hoogste migratie en niet de eerste die de functie noemt', () => {
    const uit = laatsteDefinitie(
      [
        { naam: '0001_a.sql', sql: 'function public.f( ... \'reason\', \'oud\' $function$;' },
        { naam: '0009_b.sql', sql: 'function public.f( ... \'reason\', \'nieuw\' $function$;' },
      ],
      'f',
    );
    expect(redenenIn(uit ?? '')).toEqual(['nieuw']);
  });
});

describe('de weigerredenen van zet_groepsklassement', () => {
  const bestanden = readdirSync(MIGRATIES)
    .filter((n) => n.endsWith('.sql'))
    .map((naam) => ({ naam, sql: readFileSync(join(MIGRATIES, naam), 'utf8') }));
  const lichaam = laatsteDefinitie(bestanden, 'zet_groepsklassement');

  it('vindt de functie in de migraties', () => {
    expect(lichaam).not.toBeNull();
  });

  it('kent elke reden als klassementtekst, en niets wat de database nooit geeft', () => {
    expect(Object.keys(klassementMeldingen()).sort()).toEqual(redenenIn(lichaam ?? ''));
  });
});
