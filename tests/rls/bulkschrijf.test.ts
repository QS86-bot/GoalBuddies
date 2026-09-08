import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Een geweigerde bulk-POST schrijft eerst — QS8-347, migratie 0200.
 *
 * ⚠️ **De belofte is niet "de rijen blijven niet staan".** Dat deed 0192 al, en
 *    het is een eigenschap van het onderdeel. De belofte is: *één gebruiker kan
 *    de schijf niet volschrijven met verzoeken die tóch geweigerd worden.* Dat is
 *    een eigenschap van het geheel, en ze is alleen te toetsen door te meten wat
 *    de tabel op schijf doet — niet door te kijken of er rijen overblijven.
 *
 * ⚠️⚠️ **Wat er kon, gemeten op een verse database met één `authenticated`-sessie:**
 *
 *      pg_total_relation_size('goals')  136 kB
 *      insert 50.000 doelen        ->   23514 Te veel doelen in één dag
 *      rijen erna                       0
 *      pg_total_relation_size('goals') 9784 kB
 *
 *    De rijen zijn geweigerd en er staat er geen één; de tabel is 9,6 MB
 *    gegroeid en die ruimte komt pas terug bij een `vacuum full`. Op een gratis
 *    tier van 500 MB zonder backups is dat een gebruiker die de database van
 *    iedereen kan vullen.
 *
 * ⚠️ **De naad die dit bestand bewaakt zit tussen twee grendels die allebei
 *    kloppen** (regel 18, vraag 1). 0192 handhaaft het dagplafond en noemt in zijn
 *    melding het aantal uit dit verzoek; 0200 is de noodstop op tweemaal dat
 *    plafond. Zet iemand de noodstop lager, dan gaat die altijd als eerste af, is
 *    de handhaver dode code, en is de melding die de app toont een andere — zonder
 *    dat er iets rood wordt. Vandaar de derde test hieronder.
 *
 * ⚠️⚠️ **De rem telt de rijen van dít verzoek en niet het venster van een
 *    etmaal, en dat is een gerepareerde fout.** De eerste versie telde het
 *    venster, net als de teller van 0192 — maar dat venster is gedeeld: de
 *    rollover schrijft weekdoelen als `service_role`, die tellen mee voor de
 *    eigenaar, en dan ging de noodstop af op een handeling van één rij. 📏 Met
 *    450 rollover-weekdoelen gaf één eigen weekdoel `23514 (450 …)` in plaats van
 *    de `42501` van de policy: de verkeerde grendel sprak, met een melding die
 *    "in één verzoek" zei bij een verzoek van één rij. Gevonden in de
 *    security-review van 08-09; de derde test hieronder bewaakt het.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart:
 *
 *   A  `drop trigger doelen_rem on goals`
 *      → 1 rood: 'een geweigerde bulk-POST laat de tabel niet volschrijven'
 *   B  `rem_weekdoelen()` het venster laten tellen in plaats van dit verzoek
 *      → 1 rood: 'de rem telt dit verzoek en niet het gedeelde venster'
 *   C  de noodgrens van `rem_doelen()` op `> doelen_plafond()` zetten
 *      → 1 rood: 'de noodstop overstemt de handhaver niet'
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

/** Ver boven de noodgrens (2 × 200), en zonder rem groot genoeg om megabytes te kosten. */
const AANVALSBATCH = 10_000;

/** Het dagplafond op `goals` uit 0192. */
const DOELEN_PLAFOND = 200;

let alice: TestUser;
let cyclus: IsoDate;
/** ⚠️ In de toekomst: `goals_insert` eist `target_date >= mijn_datum()`. */
let streefdatum: IsoDate;

function tabelbytes(tabel: string): number {
  return Number(psql(`select pg_total_relation_size('public.${tabel}')`).trim());
}

describe.skipIf(!rlsTestsConfigured)('een geweigerde bulk-POST schrijft eerst', () => {
  beforeAll(async () => {
    alice = await createTestUser('bulk-alice');
    psql(`update profiles set tz = 'Europe/Amsterdam', week_start_day = 1 where id = '${alice.id}'`);
    cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' as TimeZone }, now()).startDate;
    streefdatum = addDays(cyclus, 90);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een geweigerde bulk-POST laat de tabel niet volschrijven',
    async () => {
      const vooraf = tabelbytes('goals');

      const rijen = Array.from({ length: AANVALSBATCH }, (_, i) => ({
        owner_id: alice.id,
        title: `bulkdoel ${i}`,
        target_date: streefdatum,
      }));
      const { error } = await alice.db.from('goals').insert(rijen);

      // De weigering zelf is niet nieuw — 0192 deed dat al. Hij staat hier omdat
      // een test die alleen naar de omvang kijkt, ook groen is als de insert
      // gewoon slaagt.
      expect(error, 'de bulk-POST hoort geweigerd te worden').not.toBeNull();
      expect(error?.code).toBe('23514');

      const gebleven = await adminDb()
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', alice.id);
      expect(gebleven.count ?? 0, 'er is een rij blijven staan').toBe(0);

      // ⚠️ **De grens is ruim, en dat is met opzet.** Deze suite draait parallel
      //    en andere bestanden schrijven ook in `goals`; een krappe grens meet
      //    dan hun ruis. 📏 Zonder rem kost deze batch ~1,9 MB, met rem blijft de
      //    aangroei onder de 200 kB. Alles daartussen is ondubbelzinnig.
      const groei = tabelbytes('goals') - vooraf;
      expect(
        groei,
        `de tabel groeide met ${Math.round(groei / 1024)} kB; zonder de rem van 0200 is dat ` +
          `een veelvoud daarvan, en die ruimte komt pas terug bij een vacuum full`,
      ).toBeLessThan(800 * 1024);
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: een AI-plan van twaalf mijlpalen in één POST gaat gewoon door',
    async () => {
      const doel = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: 'BULK-MUSTALLOW', target_date: streefdatum })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

      const mijlpalen = Array.from({ length: 12 }, (_, i) => ({
        goal_id: doel.data.id,
        title: `stap ${i + 1}`,
        order_index: i + 1,
      }));
      const { error } = await alice.db.from('milestones').insert(mijlpalen);

      expect(error, `twaalf mijlpalen in één keer hoort te lukken: ${error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de rem telt dit verzoek en niet het gedeelde venster',
    async () => {
      // ⚠️⚠️ **De naad tussen de rem en een schrijver die niet de gebruiker is.**
      //    De rollover zet weekdoelen neer als `service_role`. Die rijen staan in
      //    hetzelfde etmaalvenster als die van de eigenaar, dus een rem die het
      //    vénster telt, gaat af op een handeling van één rij die de gebruiker
      //    zelf doet — en overstemt daarmee de policy.
      //
      //    De belofte is dus niet "de rem weigert grote batches" (dat is de
      //    eerste test) maar: *de rem raakt niets aan wat een ánder in het
      //    venster heeft gezet.* Vandaar dat deze toets op de foutcode zit: de
      //    rij wordt allebei de keren geweigerd, alleen door een andere grendel.
      const carla = await createTestUser('bulk-carla');
      const doel = await adminDb()
        .from('goals')
        .insert({ owner_id: carla.id, title: 'BULK-VENSTER', target_date: streefdatum })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

      // Ruim boven de noodgrens van 2 × 200, geschreven door service_role.
      const rollover = Array.from({ length: 450 }, (_, i) => ({
        goal_id: doel.data.id,
        title: `rollover ${i}`,
        cycle_start_date: cyclus,
      }));
      const gezet = await adminDb().from('weekly_goals').insert(rollover);
      if (gezet.error) throw new Error(`opbouw: ${gezet.error.message}`);

      const { error } = await carla.db.from('weekly_goals').insert({
        goal_id: doel.data.id,
        title: 'eigen weekdoel',
        cycle_start_date: cyclus,
      });

      expect(error, 'het venster staat boven het plafond, dus dit hoort geweigerd').not.toBeNull();
      expect(
        error?.code,
        `42501 is de policy — die hoort dit te weigeren. 23514 betekent dat de rem het ` +
          `venster telt in plaats van dit verzoek (kreeg "${error?.message}")`,
      ).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'de noodstop overstemt de handhaver niet',
    async () => {
      // ⚠️⚠️ **Dit is de naadtoets.** Een batch van precies `plafond + 1` hoort
      //    door de handhaver van 0192 geweigerd te worden en niet door de
      //    noodstop van 0200 — die zit op tweemaal het plafond. Het verschil is
      //    zichtbaar in de melding: de handhaver noemt het aantal uit dit
      //    verzoek ('% erbij'), de noodstop niet.
      //
      //    Zonder deze toets kan iemand de noodgrens verlagen, gaat die overal
      //    als eerste af, is de teller van 0192 dode code, en blijft alles groen.
      const bob = await createTestUser('bulk-bob');

      const rijen = Array.from({ length: DOELEN_PLAFOND + 1 }, (_, i) => ({
        owner_id: bob.id,
        title: `randdoel ${i}`,
        target_date: streefdatum,
      }));
      const { error } = await bob.db.from('goals').insert(rijen);

      expect(error, 'plafond + 1 hoort geweigerd te worden').not.toBeNull();
      expect(
        error?.message,
        `de handhaver van 0192 hoort dit te weigeren en het aantal uit dit verzoek te noemen; ` +
          `kreeg "${error?.message}"`,
      ).toContain('erbij');
    },
    TEST_TIMEOUT,
  );
});
