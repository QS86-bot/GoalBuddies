import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { naarKlassementenRij } from '../../src/modules/buddies/klassementen-vorm';

/**
 * De kolomnamen van de parser staan naast `RETURNS TABLE` van `mijn_klassementen()` — QS8-666 (A57b), 3c-ui.
 *
 * ⚠️ **De naad is de kolomnaam.** `naarKlassementenRij()` geeft `null` voor een rij waarvan een verplichte kolom ontbreekt, en een scherm met alleen
 *    `null`-rijen is stil leeg: geen fout, geen kaart. Wie in een latere migratie een kolom hernoemt, ziet hier dat de parser hem niet meer vindt.
 *
 * IJKING (met de hand, 22-11-2026): in de parser `group_name` als `groep_naam` lezen -> 'de parser leest elke kolom' valt om; een kolom in
 * `RETURNS TABLE` hernoemen -> 'de parser kent alle kolommen' valt om.
 */
const MIGRATIES = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

function laatsteKolommen(): readonly string[] {
  let uit: string[] | null = null;
  for (const naam of readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql')).sort()) {
    const inhoud = readFileSync(join(MIGRATIES, naam), 'utf8');
    const m = /function public\.mijn_klassementen\([^)]*\)\s*RETURNS TABLE\(([^)]*)\)/i.exec(inhoud);
    if (m?.[1] !== undefined) uit = m[1].split(',').map((k) => k.trim().split(/\s+/)[0] ?? '');
  }
  if (uit === null) throw new Error('geen definitie van mijn_klassementen');
  return uit;
}

describe('mijn_klassementen(): de kolommen en de parser', () => {
  it('de parser kent alle kolommen van RETURNS TABLE en geen andere', () => {
    const ruw = Object.fromEntries(laatsteKolommen().map((k) => [k, k === 'punten' || k === 'positie' || k.startsWith('total') ? 3 : `${k}-waarde`]));
    const rij = naarKlassementenRij(ruw as never);
    expect(rij, 'de parser gaf null voor een rij met alle kolommen').not.toBeNull();
    expect(rij).toMatchObject({ groupId: 'group_id-waarde', groepnaam: 'group_name-waarde', userId: 'user_id-waarde', naam: 'display_name-waarde', punten: 3, positie: 3, ledental: 3, totaalGroepen: 3 });
  });

  it('de kolommen zijn precies deze acht, geen datum en geen delta', () => {
    expect([...laatsteKolommen()].sort()).toEqual(['display_name', 'group_id', 'group_name', 'positie', 'punten', 'total_groups', 'total_members', 'user_id']);
  });
});
