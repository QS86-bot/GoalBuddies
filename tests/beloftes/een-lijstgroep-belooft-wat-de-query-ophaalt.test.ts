import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const WORTEL = join(__dirname, '..', '..');
const API = join(WORTEL, 'src', 'modules', 'buddies', 'api.ts');

/**
 * `Lijstgroep` belooft precies wat `fetchMijnGroepen()` ophaalt — QS8-387.
 *
 * ⚠️⚠️ **De naad, en waarom een typecheck alleen hem niet dekt.** De query en het
 *    type staan twintig regels uit elkaar in hetzelfde bestand, en niets verbindt
 *    ze: supabase-js leidt de kolommen af uit de `select`-string, maar zodra
 *    iemand een sleutel aan `Lijstgroep` toevoegt zónder hem aan de `select` toe
 *    te voegen, is het type weer ruimer dan de gegevens — alleen in een nieuwe
 *    vorm. Dat is exact de fout die dit issue wegneemt, dus hij hoort bewaakt te
 *    zijn en niet opnieuw ontdekt.
 *
 * ⚠️ **Waarom het toen niet opviel.** Er stond `as unknown as Groep[]` onder de
 *    query. Een cast is geen controle: hij zegt tegen de compiler dat je het
 *    beter weet. `groep.invite_code` typecheckte als `string`, was `undefined`,
 *    en `normaliseerCode(undefined)` doet `.trim()` op undefined — een wit
 *    scherm. 📏 Bij QS8-229 was dat precies de knop waar dat issue over ging.
 *
 * ⚠️ **De andere kant telt ook.** Een kolom die de query wél ophaalt maar die
 *    niet in het type staat, is geen wit scherm maar wel een kolom die je voor
 *    niets over de lijn haalt — en bij `invite_code` zou het een deelbare code
 *    zijn in een lijstquery die overal draait. Daarom vergelijkt deze test twee
 *    kanten op en niet alleen "dekt het type de query".
 *
 * ⚠️ **Ijking, met de hand gedraaid op 09-09-2026:**
 *    - `'icon'` uit de `Pick` halen → rood ("in de query maar niet in het type").
 *    - `| 'invite_code'` aan de `Pick` toevoegen → rood (de fout van dit issue).
 *    - `icon` uit de `select`-string halen → rood, de andere kant op.
 */

const bron = readFileSync(API, 'utf8');

/** De kolommen die `fetchMijnGroepen()` daadwerkelijk opvraagt. */
function kolommenUitDeQuery(): readonly string[] {
  const na = bron.slice(bron.indexOf('export async function fetchMijnGroepen'));
  const treffer = /\.select\('([^']+)'\)/.exec(na);
  if (treffer === null) throw new Error('geen select gevonden in fetchMijnGroepen');

  return (treffer[1] ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k !== '');
}

/** De sleutels die `Lijstgroep` belooft. */
function sleutelsUitHetType(): readonly string[] {
  const na = bron.slice(bron.indexOf('export type Lijstgroep'));
  const blok = na.slice(0, na.indexOf('>;'));

  return [...blok.matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
}

describe('Lijstgroep en de query zeggen hetzelfde', () => {
  it('vindt allebei de kanten om te vergelijken', () => {
    // ⚠️ De positieve controle. Zou een van beide leeg zijn — hernoemde functie,
    //    ander formaat — dan zijn twee lege verzamelingen ook gelijk, en meldt
    //    deze test tevreden niets terwijl hij niets meer leest.
    expect(kolommenUitDeQuery().length).toBeGreaterThan(5);
    expect(sleutelsUitHetType().length).toBeGreaterThan(5);
  });

  it('belooft geen kolom die de query niet ophaalt', () => {
    // Dit is de fout van QS8-387: `invite_code` stond in het type en niet in de
    // gegevens.
    const query = new Set(kolommenUitDeQuery());
    const teveel = sleutelsUitHetType().filter((s) => !query.has(s));

    expect(teveel, `in het type maar niet in de query: ${teveel.join(', ')}`).toEqual([]);
  });

  it('laat geen kolom onbenoemd die de query wél ophaalt', () => {
    const type = new Set(sleutelsUitHetType());
    const teweinig = kolommenUitDeQuery().filter((k) => !type.has(k));

    expect(teweinig, `in de query maar niet in het type: ${teweinig.join(', ')}`).toEqual([]);
  });

  it('haalt de uitnodigingscode niet op in een lijstquery', () => {
    // ⚠️ Geen afgeleide van het bovenstaande maar een eigen belofte: een
    //    deelbare code hoort niet in een query die op elk groepsscherm draait.
    //    Wie hem nodig heeft, gebruikt `fetchGroep()`.
    expect(kolommenUitDeQuery()).not.toContain('invite_code');
    expect(kolommenUitDeQuery()).not.toContain('invite_revoked');
  });

  it('gebruikt geen cast om het verschil te overschreeuwen', () => {
    // ⚠️ De cast wás de fout. Komt hij terug, dan is deze hele test weer
    //    omzeilbaar: een cast maakt elk verschil tussen query en type onzichtbaar.
    const na = bron.slice(bron.indexOf('export async function fetchMijnGroepen'));
    const lichaam = na.slice(0, na.indexOf('\n}\n'));

    expect(lichaam).not.toContain('as unknown as');
  });
});
