import { describe, expect, it } from 'vitest';

import {
  beslisRedenen,
  intrekRedenen,
  streefdatumRedenen,
  vraagRedenen,
} from '../../src/modules/goals/deadline-redenen';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Elke reden die de deadline-RPC's teruggeven, heeft een uitleg — QS8-311.
 *
 * ⚠️ **De belofte is niet "de tabel klopt".** Dat is een eigenschap van een
 *    onderdeel. De belofte is: *een gebruiker die geweigerd wordt, leest waaróm
 *    en wat hij kan doen* — en die belofte hangt aan een naad tussen twee
 *    dingen die allebei op zichzelf klopten. De functie gaf netjes een kenmerk
 *    terug; de tabel had netjes een zin. Wat niemand toetste is of het over
 *    dezelfde kenmerken ging.
 *
 * ⚠️ 📏 **Gemeten op 07-09-2026, vóór dit issue:** van de eenentwintig kenmerken
 *    die de drie functies teruggeven hadden er acht geen melding. Ze lazen alle
 *    acht als *"het versturen lukte niet"* — een storingsmelding voor een regel.
 *    Twee gevallen waren erger dan de rest, want de goede zin stónd er en was
 *    onbereikbaar:
 *
 *    | functie | geeft | tabel kende |
 *    |---|---|---|
 *    | `beslis_deadline_verzoek` | `not_yourself` | `own_request` |
 *    | `vraag_deadline_verschuiving` | — | `same_date` |
 *
 *    De eerste is precies de weg die QS8-311 beschrijft: wie in een groep van één
 *    zit en zijn eigen verzoek probeert goed te keuren, kreeg geen uitleg maar
 *    een storing.
 *
 * ⚠️ **Waarom dit tegen de gedeployde functie meet en niet tegen de
 *    migratiebestanden.** `pg_get_functiondef()` is in dit project de waarheid
 *    (CLAUDE.md, regel 19). Een nieuwe migratie die een kenmerk toevoegt, maakt
 *    deze test rood zonder dat iemand eraan hoeft te denken — en dát is het punt:
 *    het kenmerk erbij en de zin erbij zijn twee handelingen, en de tweede werd
 *    vergeten. Drie keer inmiddels (QS8-293, QS8-309, en dit issue).
 *
 * ⚠️ **Beide kanten op, en dat is niet symmetrisch te noemen maar wel nodig.** Een
 *    kenmerk zonder zin laat de gebruiker in het donker; een zin zonder kenmerk is
 *    dode code die suggereert dat er een geval afgedekt is. `same_date` en
 *    `own_request` waren allebei van de tweede soort, en de tweede maskeerde een
 *    gat van de eerste soort.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `not_yourself` uit `beslisRedenen()` halen
 *      → 1 rood: 'beslis_deadline_verzoek — elke reden heeft een uitleg'
 *   B  `own_request` er weer bij zetten
 *      → 1 rood: 'beslis_deadline_verzoek — geen zin zonder reden'
 *   C  `rate_limited` uit `vraagRedenen()` halen
 *      → 1 rood: 'vraag_deadline_verschuiving — elke reden heeft een uitleg'
 *   D  de afleiding niets laten vinden (een naam die niet bestaat)
 *      → 6 rood, waaronder alle vier de 'vindt ze daadwerkelijk'
 *
 * ⚠️ **D is er omdat A en C beide een lege-lijst-vorm hebben** en die blijven
 *    groen zodra de afleiding niets meer oplevert. Zonder D bewaakt deze suite
 *    niets zodra de regexp of een functienaam verschuift.
 *
 * ⚠️ **D leek eerst groen, en dat was een mislukte mutatie en geen uitslag.** De
 *    bewerking had het bestand niet geraakt. Opnieuw gedaan met een grep op de
 *    gewijzigde regel erbij, en toen werd hij rood. Een ijking telt pas als je
 *    gezien hebt dat de mutatie er stáát.
 */

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'vraag_deadline_verschuiving'",
  import.meta.url,
);

/**
 * De kenmerken die een functie kan teruggeven, uit de gedeployde bron.
 *
 * ⚠️ De vorm is `jsonb_build_object('ok', false, 'reason', '<kenmerk>')`, en de
 *    afleiding grijpt naar het paar `'reason', '…'`. Zou ze alleen naar het
 *    tweede argument kijken, dan telde ze elke tekenreeks in de functie mee.
 */
function redenenVan(functie: string): readonly string[] {
  const uit = psql(`
    select distinct m[1]
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
    lateral regexp_matches(p.prosrc, '''reason'',\\s*''([a-z_]+)''', 'g') m
    where n.nspname = 'public' and p.proname = '${functie}'
    order by 1
  `);

  return uit
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '');
}

const FUNCTIES = [
  {
    naam: 'vraag_deadline_verschuiving',
    tabel: vraagRedenen,
    /**
     * ⚠️ `not_signed_in` staat wél in de tabel: de app roept deze RPC alleen
     *    ingelogd aan, maar een sessie kan tussen twee schermen verlopen en dan
     *    is *"je bent niet meer ingelogd"* de enige uitleg die klopt.
     */
    minstens: 11,
  },
  { naam: 'beslis_deadline_verzoek', tabel: beslisRedenen, minstens: 7 },
  { naam: 'trek_deadline_verzoek_in', tabel: intrekRedenen, minstens: 4 },
  /**
   * ⚠️ **De ándere weg naar een nieuwe streefdatum, en de andere helft van de
   *    doodlopende weg van QS8-311.** Hij hoort in deze lijst omdat een
   *    gebruiker die de datum wil verzetten langs één van deze vier komt en niet
   *    weet welke; een uitleg die op drie ervan klopt, is er een die op de
   *    vierde ontbreekt.
   */
  { naam: 'zet_streefdatum', tabel: streefdatumRedenen, minstens: 6 },
] as const;

describe.skipIf(!beschikbaar)('de deadline-RPCs en hun meldingen', () => {
  for (const { naam, tabel, minstens } of FUNCTIES) {
    describe(naam, () => {
      it('vindt ze daadwerkelijk, en verzint ze niet', () => {
        // ⚠️ Zonder deze regel is alles hieronder groen zodra de afleiding niets
        //    meer vindt — een functienaam die verschuift, een andere schrijfwijze
        //    van `jsonb_build_object`. Dan bewaakt een `not.toContain` niets.
        expect(
          redenenVan(naam).length,
          `de afleiding vond geen enkel kenmerk in ${naam}`,
        ).toBeGreaterThanOrEqual(minstens);
      });

      it('elke reden heeft een uitleg', () => {
        const zonder = redenenVan(naam).filter((reden) => !(reden in tabel()));

        expect(
          zonder,
          `deze kenmerken van ${naam} lezen als "er ging iets mis" terwijl het ` +
            'regels zijn. Zet er een zin bij in src/modules/goals/deadline-redenen.ts.',
        ).toEqual([]);
      });

      it('geen zin zonder reden', () => {
        // ⚠️ **De andere kant, en die is geen netheid.** Een zin voor een kenmerk
        //    dat de functie nooit geeft, suggereert dat het geval afgedekt is —
        //    en `own_request` maskeerde op die manier het gat waar `not_yourself`
        //    doorheen viel.
        const gedeployd = new Set(redenenVan(naam));
        const dood = Object.keys(tabel()).filter((reden) => !gedeployd.has(reden));

        expect(
          dood,
          `deze zinnen bij ${naam} horen bij een kenmerk dat de functie niet geeft`,
        ).toEqual([]);
      });
    });
  }
});
