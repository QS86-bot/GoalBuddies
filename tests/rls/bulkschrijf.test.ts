import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Een geweigerde bulk-POST schrijft eerst — QS8-347, migratie 0199.
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
 *    melding het aantal uit dit verzoek; 0199 is de noodstop op tweemaal dat
 *    plafond. Zet iemand de noodstop lager, dan gaat die altijd als eerste af, is
 *    de handhaver dode code, en is de melding die de app toont een andere — zonder
 *    dat er iets rood wordt. Vandaar de derde test hieronder.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart:
 *
 *   A  `drop trigger doelen_rem on goals`
 *      → 1 rood: 'een geweigerde bulk-POST laat de tabel niet volschrijven'
 *   B  de noodgrens van `rem_doelen()` op `>= doelen_plafond()` zetten
 *      → 1 rood: 'de noodstop overstemt de handhaver niet'
 *
 * ⚠️ **B moet `>=` zijn en niet `>`, en dat verschil ís de ijking.** Met
 *    `> plafond` laat de rem er `plafond + 1` door en zwijgt hij bij precies deze
 *    batch — de handhaver komt dan gewoon aan het woord en er wordt niets rood.
 *    Een mutatie die het geval door een grens voert die het al afvangt, bewaakt
 *    niets; zie CLAUDE.md bij regel 18.
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
        `de tabel groeide met ${Math.round(groei / 1024)} kB; zonder de rem van 0199 is dat ` +
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
    'de noodstop overstemt de handhaver niet',
    async () => {
      // ⚠️⚠️ **Dit is de naadtoets.** Een batch van precies `plafond + 1` hoort
      //    door de handhaver van 0192 geweigerd te worden en niet door de
      //    noodstop van 0199 — die zit op tweemaal het plafond. Het verschil is
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
