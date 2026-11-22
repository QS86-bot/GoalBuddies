import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `mijn_klassementen()` en `groep_klassement()` houden dezelfde poort en dezelfde volgorde — QS8-666 (A57), deel 3c-db.
 *
 * ⚠️ **De belofte is dat de twee rangschikkingen niet uiteen kunnen lopen.** Ze bestaan allebei (besluit Quinten 22-11-2026:
 *    één RPC voor het scherm, geen N+1), en `registerdrift:controle` vergelijkt per functie, niet de twee met elkaar. Wie later de
 *    poort of de volgorde van de ene aanpast, ziet hier dat de andere hem ook nodig heeft. Dit draait zonder database en is dus
 *    de enige grendel die ook in een cloudsessie meetelt; `tests/rls/mijn-klassementen.test.ts` meet het op de database.
 *
 * IJKING (met de hand, 22-11-2026): `lid_van_levende_groep(` uit één van beide halen, de tiebreak `uid asc` weghalen of
 * `least(coalesce(p_limit, 10), 20)` veranderen -> de bijbehorende toets valt om.
 */
const MIGRATIES = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

function laatsteDefinitie(functie: string): { readonly naam: string; readonly lichaam: string; readonly bestand: string } {
  const bestanden = readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql')).sort();
  let gevonden: { naam: string; lichaam: string; bestand: string } | null = null;
  for (const naam of bestanden) {
    const sql = readFileSync(join(MIGRATIES, naam), 'utf8');
    const kop = new RegExp(`create (?:or replace )?function public\\.${functie}\\(`, 'g');
    let m: RegExpExecArray | null;
    while ((m = kop.exec(sql)) !== null) {
      const start = sql.indexOf('$function$', m.index);
      const eind = sql.indexOf('$function$', start + 10);
      if (start === -1 || eind === -1) continue;
      gevonden = { naam, lichaam: sql.slice(start, eind), bestand: sql };
    }
  }
  if (gevonden === null) throw new Error(`geen definitie van ${functie}`);
  return gevonden;
}

const groep = laatsteDefinitie('groep_klassement');
const mijn = laatsteDefinitie('mijn_klassementen');
const zonderCommentaar = (s: string): string => s.replace(/--[^\n]*/g, '');

describe('mijn_klassementen() en groep_klassement() delen één poort en één volgorde', () => {
  it.each([
    ['groep_klassement', groep],
    ['mijn_klassementen', mijn],
  ])('%s: lid van een levende groep, de schakelaar en de teamgrens', (_naam, d) => {
    const sql = zonderCommentaar(d.lichaam);
    expect(sql).toMatch(/lid_van_levende_groep\(/);
    expect(sql).toMatch(/klassement_aan/);
    expect(sql).toMatch(/organization_id is (not )?null/);
  });

  it.each([
    ['groep_klassement', groep],
    ['mijn_klassementen', mijn],
  ])('%s: dezelfde volgorde, met twee tiebreakers', (_naam, d) => {
    const sql = zonderCommentaar(d.lichaam);
    expect(sql).toMatch(/punten desc,\s*(\w+\.)?(display_name|naam) asc,\s*(\w+\.)?(user_id|uid) asc/);
  });

  it.each([
    ['groep_klassement', groep],
    ['mijn_klassementen', mijn],
  ])('%s: de eerste vijf worden in de volgorde geknipt, niet op rang', (_naam, d) => {
    const sql = zonderCommentaar(d.lichaam);
    // `mijn_klassementen` knipt op row_number(); `groep_klassement` heeft zijn eigen limit. Een `rank() <= 5` zou een gelijke
    // stand over de grens heen allemaal meenemen en zes of meer rijen opleveren.
    expect(sql).not.toMatch(/rank\(\)[^,]*<=\s*5/);
  });

  it('mijn_klassementen: toetst automatisch gevormde groepen zelf', () => {
    expect(zonderCommentaar(mijn.lichaam)).toMatch(/not g\.automatisch/);
  });

  it('mijn_klassementen: hoogstens 20 groepen per aanroep, standaard 10, en een vaste vijf', () => {
    const sql = zonderCommentaar(mijn.lichaam);
    expect(sql).toMatch(/least\(coalesce\(p_limit, 10\), 20\)/);
    expect(sql).toMatch(/greatest\(0, coalesce\(p_offset, 0\)\)/);
    expect(sql).toMatch(/volgnr <= 5/);
    expect(mijn.lichaam).not.toMatch(/p_top|p_aantal/);
  });

  it('mijn_klassementen: geen datum en geen delta in de uitvoer, en de woorden van de zichtbaarheidscontrole niet in het lichaam', () => {
    const sql = zonderCommentaar(mijn.lichaam);
    const uitvoer = sql.slice(sql.lastIndexOf('select\n    gr.'), sql.indexOf('from gerangschikt'));
    expect(uitvoer).not.toMatch(/sinds|joined_at|created_at|delta/);
    expect(mijn.lichaam).not.toMatch(/zichtbaarheid|open_groep/);
  });

  it('de migratie sluit anon en public af en geeft authenticated expliciet het recht', () => {
    expect(mijn.bestand).toMatch(/revoke all on function public\.mijn_klassementen\(integer, integer\) from public, anon, authenticated;/);
    expect(mijn.bestand).toMatch(/grant execute on function public\.mijn_klassementen\(integer, integer\) to authenticated;/);
    expect(mijn.bestand).toMatch(/security definer/i);
    expect(mijn.bestand).toMatch(/set search_path/i);
  });
});
