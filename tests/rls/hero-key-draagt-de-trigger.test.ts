import { describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `helden.ts` en niet uit `index.ts`, om dezelfde reden als
//    `helden.test.ts`: die index trekt via `lib/supabase` de client mee en die
//    kan de testomgeving niet parsen.
import { HELDSLEUTELS, TRIGGERS, heldVoorTrigger } from '../../src/modules/helden/helden';

import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * `hero_key` draagt evenveel als `trigger`, en dat is een eigenschap van de
 * afbeelding — QS8-564, premisse onder rij 769 van `docs/ENGINEER-REVIEW.md`.
 *
 * ⚠️⚠️ **Waarom een premisse een eigen toets krijgt.** Die rij zegt dat een RPC
 *    die `trigger` wéglaat en `hero_key` teruggeeft precies hetzelfde lekt —
 *    `ignis ⇒ misser`, `lucerna ⇒ stilte`. Dat klopt **alleen zolang
 *    `heldVoorTrigger` een bijectie is**, en die eigenschap stond in geen enkele
 *    test.
 *
 *    Het gevaar is niet dat ze breekt maar dat ze **stil** breekt: dan blijft de
 *    rij staan met een onderbouwing die niet meer klopt, en de volgende lezer
 *    neemt de conclusie over zonder de premisse na te meten. Dezelfde vorm als
 *    QS8-558, waar een verlopen meting een bevinding verborg in plaats van
 *    ernaast te staan.
 *
 * ⚠️ **Hij kan twee kanten op breken en allebei doen ertoe.** Twee triggers naar
 *    één held: dan draagt `hero_key` mínder dan `trigger` en is rij 769 strenger
 *    dan nodig. Een zevende erbij: dan is de afbeelding opnieuw te wegen, en dat
 *    doet vandaag niemand.
 *
 * IJKING — met de hand gedraaid op 19-09-2026, mutatie per grendel. De
 * uitslagen zijn gemeten en niet voorspeld:
 *
 *   A  de held van `stilte` op `ignis` gezet (twee triggers, één held)
 *      -> **2 rood**: 'elke trigger heeft zijn eigen held' én 'elke held is de
 *         held van een trigger'
 *   B  een zevende heldsleutel aan `HELDSLEUTELS`
 *      -> **2 rood**: 'er zijn even veel helden als triggers' én 'elke held is
 *         de held van een trigger'
 *   C  `trigger` uit de `RETURNS TABLE` van `groep_helden()` gehaald
 *      -> **2 rood**: 'geen enkel oppervlak geeft hero_key zonder trigger' én de
 *         must-allow 'groep_helden geeft ze allebei'
 *   D  een wegwerpfunctie die `hero_key` als `held` teruggeeft
 *      -> **0 rood**, en dat is de gemeten grens hieronder en geen defect
 *
 * ⚠️⚠️ **C gaf eerst 0 rood, en de mutatie was fout — niet de test.** Mijn
 *    `drop function public.groep_helden(uuid)` sloeg over (de echte handtekening
 *    is `(uuid, integer, integer)`), waarna `create or replace` faalde met
 *    *cannot change return type of existing function*. Er verandérde dus niets
 *    en de suite bleef terecht groen. **Exact de valkuil die CLAUDE.md bij
 *    onwrikbare regel 20 opschrijft** — *een drop van `f(uuid, text, text)` dekt
 *    geen nieuwe `f` met zes argumenten* — en dezelfde die mutatie C in
 *    `getuigemelding.test.ts` al eens kostte. Kijk bij een ijking dus niet
 *    alleen wélke test omvalt maar eerst óf de mutatie er staat.
 *
 * ⚠️ A en B geven er allebei twee, en dat is geen ruis: de derde toets kijkt
 *    de andere kant op (elke held hoort bij een trigger) en die kant breekt bij
 *    allebei mee. Zonder die derde is "even veel" te halen met een held die
 *    nergens uit volgt plus twee triggers die er één delen.
 *
 * ⚠️ **Wat deze toets níet ziet, en dat is gemeten en geen aanname.** Hij leest
 *    `pg_get_function_result()`, dus hij kent de kolom onder de náám waaronder
 *    ze teruggegeven wordt. Een functie die `hero_key` als `held` of `sleutel`
 *    teruggeeft, komt er onveranderd langs — 📏 uitgeprobeerd met een wegwerp-
 *    functie `returns table(held text)`: nul bevindingen. Dat is de grens van
 *    een naamgebaseerde toets, en hij staat hier opgeschreven in plaats van
 *    weggelaten. Wie zo'n alias introduceert, omzeilt deze grendel; de rij in
 *    `docs/ENGINEER-REVIEW.md` blijft daarom open.
 */

const TEST_TIMEOUT = 30_000;

/**
 * Functies die `hero_key` teruggeven zónder `trigger`, mét een gemeten reden.
 *
 * ⚠️ **Een reden hoort het lek te weerleggen en niet te herhalen.** *"Deze RPC
 *    is alleen voor de eigenaar"* is een weerlegging; *"hier is `trigger` niet
 *    nodig"* is dat niet — dat gaat over gemak en niet over wie er meekijkt.
 */
const ZONDER_TRIGGER: Readonly<Record<string, string>> = {};

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'groep_helden'",
  import.meta.url,
);

describe('de afbeelding trigger → held is een bijectie', () => {
  it('er zijn even veel helden als triggers', () => {
    // ⚠️ Beide kanten, want een zevende trigger en een zevende held breken de
    //    bijectie allebei — en een test op één getal ziet er maar één.
    expect(TRIGGERS.length, `${TRIGGERS.length} triggers naast ${HELDSLEUTELS.length} helden`).toBe(
      HELDSLEUTELS.length,
    );
  });

  it('elke trigger heeft zijn eigen held', () => {
    const paren = TRIGGERS.map((t) => `${t}→${heldVoorTrigger(t).sleutel}`);
    const helden = new Set(TRIGGERS.map((t) => heldVoorTrigger(t).sleutel));

    expect(helden.size, `twee triggers delen een held: ${paren.join(', ')}`).toBe(TRIGGERS.length);
  });

  it('elke held is de held van een trigger', () => {
    // ⚠️ De andere kant op, en zonder deze is "even veel" te halen met een held
    //    die nergens uit volgt plus twee triggers die er één delen.
    const uitTriggers = new Set(TRIGGERS.map((t) => heldVoorTrigger(t).sleutel));

    for (const sleutel of HELDSLEUTELS) {
      expect(uitTriggers, `${sleutel} hoort bij geen enkele trigger`).toContain(sleutel);
    }
  });
});

describe.skipIf(!beschikbaar)('geen oppervlak geeft hero_key zonder trigger', () => {
  it(
    'geen enkel oppervlak geeft hero_key zonder trigger',
    () => {
      // ⚠️⚠️ **Dit is de voorwaarde van rij 769, mechanisch in plaats van met de
      //    hand.** Daar staat: *wordt zwaarder als er een oppervlak komt dat
      //    `hero_key` teruggeeft zónder `trigger` — dan is de kolomlijst een
      //    schijngrens*. `groepskolommen:controle` dekt de tábellen; juist de
      //    RPC met een expliciete kolomlijst is de vorm die 0264 voorschrijft.
      const uit = psql(`
        select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and pg_get_function_result(p.oid) ~ 'hero_key'
          and pg_get_function_result(p.oid) !~ '\\mtrigger\\M'
      `);

      const gevonden = uit.trim() === '' ? [] : uit.trim().split(', ');
      const onbekend = gevonden.filter((naam) => !(naam in ZONDER_TRIGGER));

      expect(
        onbekend,
        'een RPC geeft hero_key terug zonder trigger — de kolomlijst is dan een schijngrens',
      ).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'het register bevat geen regel die niets meer bewaakt',
    () => {
      // ⚠️ De andere kant, zelfde vorm als `definer_bewaking()` tak 5: een reden
      //    voor een toestand die er niet meer is, leest als een besluit en is er
      //    geen.
      const uit = psql(`
        select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and pg_get_function_result(p.oid) ~ 'hero_key'
          and pg_get_function_result(p.oid) !~ '\\mtrigger\\M'
      `);

      const gevonden = new Set(uit.trim() === '' ? [] : uit.trim().split(', '));

      for (const naam of Object.keys(ZONDER_TRIGGER)) {
        expect(gevonden, `${naam} staat in het register maar geeft trigger wél terug`).toContain(
          naam,
        );
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'groep_helden geeft ze allebei, en dat is de must-allow',
    () => {
      // ⚠️ Zonder dit geval is "niemand geeft hero_key zonder trigger" ook te
      //    halen met een schema waarin niemand hero_key teruggeeft — en dan
      //    bewaakt de toets hierboven een leegte.
      const uit = psql(
        `select pg_get_function_result(oid) from pg_proc ` +
          `where pronamespace = 'public'::regnamespace and proname = 'groep_helden'`,
      );

      expect(uit, 'groep_helden noemt hero_key niet meer').toContain('hero_key');
      expect(uit, 'groep_helden noemt trigger niet meer').toContain('trigger');
    },
    TEST_TIMEOUT,
  );
});
