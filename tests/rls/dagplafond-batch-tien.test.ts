/**
 * Het dagplafond van 0192 op de zes tabellen die er nog geen hadden — QS8-344,
 * migratie 0194.
 *
 * ⚠️ **Elk geval biedt plafond + 1 rijen in één verzoek aan, vanaf nul.** Dat is
 *    het scherpst mogelijke geval: elke rij afzonderlijk mag, alleen het totaal
 *    is te veel. Een grens die hierop afgaat, gaat op elke grotere batch ook af.
 *    Een test met één rij raakt het geval niet dat vóór 0192 doorliet.
 *
 * ⚠️⚠️ **De valkuil van dit issue is een groene test om de verkeerde reden.** Elke
 *    andere CHECK op deze tabellen werpt óók `23514`, en een batch die daardoor
 *    geweigerd wordt ziet er identiek uit. 📏 Daarom is elk geval hieronder
 *    geijkt door zíjn eigen trigger te droppen en te kijken of hij rood wordt —
 *    één mutatie per grendel, niet één voor het hele bestand.
 *
 *    📏 Gedraaid op 08-09-2026, zes keer, telkens één trigger weg en daarna terug:
 *
 *      drop commitments_dagplafond      -> 1 rood: de commitments-test
 *      drop goedkeuringen_dagplafond    -> 1 rood: de goedkeuringen-test
 *      drop voltooiingen_dagplafond     -> 1 rood: de voltooiingen-test
 *      drop dagzetten_dagplafond        -> 1 rood: de dagzetten-test
 *      drop doelinterviews_dagplafond   -> 1 rood: de doelinterviews-test
 *      drop doelkoppelingen_dagplafond  -> 1 rood: de doelkoppelingen-test
 *
 *    Elke keer één, en elke keer de zijne — dus geen enkele van de zes is groen
 *    doordat een ándere grendel de batch al afving.
 *
 * ⚠️ **`week_reviews` staat hier met opzet niet bij, en dat is de vondst van dit
 *    issue.** Er zat een plafond van 100 in de eerste versie van 0194. 📏 Maar
 *    `week_reviews_periode_grens` laat maar vijf periodestarts per groep toe en
 *    `week_reviews_one_per_period` maakt er één rij per stuk van, dus je komt met
 *    tien groepen niet boven de ~50 rijen — ooit, niet per dag. Honderdéén rijen
 *    aanbieden vraagt honderdéén periodestarts, en dan weigert de periodetrigger
 *    met `22007`. Die test zou groen zijn geweest zonder het plafond ooit aan te
 *    raken. Het plafond is eruit; de meting staat in 0194.
 *
 * ⚠️ **De opbouw draait als `service_role` en dat is nodig, niet gemakzucht.** Om
 *    201 commitments te kunnen aanbieden moeten er 201 doelen staan, en `goals`
 *    heeft zelf een dagplafond van 200 (0192). Zou de opbouw als de gebruiker
 *    draaien, dan weigerde die grens de opbouw en was de test rood om iets
 *    anders. De rijen tellen wél mee in het venster — het venster kijkt naar de
 *    eigenaar, niet naar wie de insert deed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

const CYCLUS_START = '2026-09-07';

let alice: TestUser;
let bob: TestUser;
let groupId: string;
let aliceDoel: string;
let bobDoel: string;
let commitmentDoelen: string[] = [];
let koppelDoelen: string[] = [];
let voltooiWeekdoelen: string[] = [];
let goedkeurbareVoltooiingen: string[] = [];

/** Landde er iets, en zo nee met welke code? */
function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

/** Het enige doel uit een lijst van één — `noUncheckedIndexedAccess` staat aan. */
function eenDoel(doelen: readonly string[]): string {
  const eerste = doelen[0];
  if (eerste === undefined) throw new Error('geen doel aangemaakt');
  return eerste;
}

/** Doelen in bulk, als service_role — zie de kop. */
async function maakDoelen(ownerId: string, aantal: number, naam: string): Promise<string[]> {
  const { data, error } = await adminDb()
    .from('goals')
    .insert(
      Array.from({ length: aantal }, (_, i) => ({
        owner_id: ownerId,
        title: `${naam} ${i}`,
        target_date: '2027-01-01',
      })),
    )
    .select('id');
  if (error) throw new Error(`${naam}: ${error.message}`);
  return data.map((r) => r.id);
}

describe.runIf(rlsTestsConfigured)('het dagplafond op de zes tabellen van QS8-344', () => {
  beforeAll(async () => {
    alice = await createTestUser('plafond10');
    bob = await createTestUser('plafond10-buddy');

    aliceDoel = eenDoel(await maakDoelen(alice.id, 1, 'alice'));
    bobDoel = eenDoel(await maakDoelen(bob.id, 1, 'bob'));

    const groep = await alice.db.rpc('create_group', { group_name: 'Plafond10' });
    if (groep.error) throw new Error(`groep: ${groep.error.message}`);
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = g.group.id;

    const lid = await adminDb()
      .from('group_members')
      .insert({ group_id: groupId, user_id: bob.id, role: 'member', status: 'active' });
    if (lid.error) throw new Error(`lid: ${lid.error.message}`);

    // 201 doelen voor de commitments, 1001 voor de koppelingen.
    commitmentDoelen = await maakDoelen(alice.id, 201, 'commit');
    koppelDoelen = await maakDoelen(alice.id, 1001, 'koppel');

    // 501 weekdoelen voor de voltooiingen — `completions_active_uniq` staat één
    // levende voltooiing per weekdoel toe, dus 501 rijen vragen 501 weekdoelen.
    const wd = await adminDb()
      .from('weekly_goals')
      .insert(
        Array.from({ length: 501 }, (_, i) => ({
          goal_id: aliceDoel,
          title: `voltooi ${i}`,
          cycle_start_date: CYCLUS_START,
        })),
      )
      .select('id');
    if (wd.error) throw new Error(`weekdoelen: ${wd.error.message}`);
    voltooiWeekdoelen = wd.data.map((r) => r.id);

    // 201 voltooiingen ván Bob om te kunnen goedkeuren: `completion_approvals_insert`
    // eist dat de voltooiing van iemand anders is en dat zijn doel aan deze groep hangt.
    const koppeling = await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: bobDoel, group_id: groupId });
    if (koppeling.error) throw new Error(`koppeling bob: ${koppeling.error.message}`);

    const bobWd = await adminDb()
      .from('weekly_goals')
      .insert(
        Array.from({ length: 201 }, (_, i) => ({
          goal_id: bobDoel,
          title: `bob week ${i}`,
          cycle_start_date: CYCLUS_START,
        })),
      )
      .select('id');
    if (bobWd.error) throw new Error(`bob weekdoelen: ${bobWd.error.message}`);

    const bobVolt = await adminDb()
      .from('completions')
      .insert(
        // ⚠️ `note` hoort erbij: `completions_evidence` eist een notitie zodra het
        //    doel aan een groep hangt die daarom vraagt, en dat is hier het geval.
        bobWd.data.map((w, i) => ({
          weekly_goal_id: w.id,
          user_id: bob.id,
          achieved_level: 'ceiling',
          cycle_start_date: CYCLUS_START,
          note: `bob rondde week ${i} af`,
        })),
      )
      .select('id');
    if (bobVolt.error) throw new Error(`bob voltooiingen: ${bobVolt.error.message}`);
    goedkeurbareVoltooiingen = bobVolt.data.map((r) => r.id);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de belofte: één POST komt niet boven het dagplafond uit', () => {
    /** IJKING: `commitments_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 201 commitments in één verzoek — plafond 200',
      async () => {
        const nu = new Date().toISOString();
        const rijen = commitmentDoelen.map((id, i) => ({
          goal_id: id,
          type: 'reward',
          body: `beloning ${i}`,
          confirmed_at: nu,
        }));
        const { error } = await alice.db.from('commitments').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /** IJKING: `goedkeuringen_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 201 goedkeuringen in één verzoek — plafond 200',
      async () => {
        const rijen = goedkeurbareVoltooiingen.map((id) => ({
          completion_id: id,
          approver_id: alice.id,
          subject_id: bob.id,
          group_id: groupId,
          status: 'approved',
        }));
        const { error } = await alice.db.from('completion_approvals').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /** IJKING: `voltooiingen_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 501 voltooiingen in één verzoek — plafond 500',
      async () => {
        const rijen = voltooiWeekdoelen.map((id) => ({
          weekly_goal_id: id,
          user_id: alice.id,
          achieved_level: 'ceiling',
          cycle_start_date: CYCLUS_START,
        }));
        const { error } = await alice.db.from('completions').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /** IJKING: `dagzetten_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 501 dagzetten in één verzoek — plafond 500',
      async () => {
        const rijen = Array.from({ length: 501 }, (_, i) => ({
          user_id: alice.id,
          body: `dagzet ${i}`,
          local_date: CYCLUS_START,
        }));
        const { error } = await alice.db.from('daily_moves').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /** IJKING: `doelinterviews_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 201 doelinterviews in één verzoek — plafond 200',
      async () => {
        const rijen = Array.from({ length: 201 }, (_, i) => ({
          goal_id: aliceDoel,
          answers: { vraag: `antwoord ${i}` },
        }));
        const { error } = await alice.db.from('goal_interviews').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /** IJKING: `doelkoppelingen_dagplafond` gedropt → deze test rood, de rest groen. */
    it(
      'weigert 1001 doelkoppelingen in één verzoek — plafond 1000',
      async () => {
        const rijen = koppelDoelen.map((id) => ({ goal_id: id, group_id: groupId }));
        const { error } = await alice.db.from('goal_group_links').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de must-allows', () => {
    /**
     * ⚠️ Zonder deze is "niemand kan meer iets invoegen" ook groen. Bob heeft zijn
     *    eigen venster, dus hij lift niet mee op de uitkomst van de tests hierboven.
     */
    it(
      'laat een gewone invoeging onder het plafond gewoon door',
      async () => {
        const { error } = await bob.db
          .from('daily_moves')
          .insert({ user_id: bob.id, body: 'gewoon een dagzet', local_date: CYCLUS_START });

        expect(uitkomst(error)).toBe('toegelaten');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Dit is de test die 0083 bedoelde toen hij géén trigger koos.** Een
     *    trigger geldt ook voor `service_role`, en de rollover en de
     *    notificatiejob draaien daaronder. De grens hangt aan de aanwezigheid van
     *    een sessie (`auth.uid()`), niet aan een rolnaam — dus mogen ze erlangs.
     */
    it(
      'laat service_role ongehinderd voorbij élk van de zes plafonds schrijven',
      async () => {
        const nu = new Date().toISOString();
        const doelen = await maakDoelen(bob.id, 201, 'dienst');

        const commitments = await adminDb()
          .from('commitments')
          .insert(doelen.map((id, i) => ({ goal_id: id, type: 'reward', body: `d ${i}`, confirmed_at: nu })));
        expect(uitkomst(commitments.error)).toBe('toegelaten');

        const dagzetten = await adminDb()
          .from('daily_moves')
          .insert(
            Array.from({ length: 501 }, (_, i) => ({
              user_id: bob.id,
              body: `dienst ${i}`,
              local_date: CYCLUS_START,
            })),
          );
        expect(uitkomst(dagzetten.error)).toBe('toegelaten');

        const interviews = await adminDb()
          .from('goal_interviews')
          .insert(Array.from({ length: 201 }, (_, i) => ({ goal_id: bobDoel, answers: { a: `${i}` } })));
        expect(uitkomst(interviews.error)).toBe('toegelaten');

        const koppelingen = await adminDb()
          .from('goal_group_links')
          .insert(doelen.map((id) => ({ goal_id: id, group_id: groupId })));
        expect(uitkomst(koppelingen.error)).toBe('toegelaten');
      },
      TEST_TIMEOUT,
    );
  });
});
