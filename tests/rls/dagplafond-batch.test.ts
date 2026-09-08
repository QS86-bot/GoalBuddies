/**
 * Een dagplafond begrenst ook de batch — QS8-343, migratie 0192.
 *
 * ⚠️ **De belofte is een eigenschap van het gehéél en niet van de teller.**
 *    `weekdoelen_over()` deed precies wat hij belooft: hij telde de gecommitte
 *    rijen en gaf de ruimte terug. De policy deed precies wat zíj belooft: ze
 *    eiste ruimte `> 0`. En tóch landden er 300 rijen tegen een plafond van 200,
 *    want binnen één INSERT-statement telt geen van beide de rijen van dat
 *    statement zelf. Twee correcte onderdelen, en de naad ertussen onbewaakt —
 *    onwrikbare regel 18, vraag 1.
 *
 * ⚠️⚠️ **Daarom voeren deze tests een échte bulk-POST uit en niet één rij.** Het
 *    geval dat vóór 0192 doorliet, is precies het geval dat een test met één rij
 *    níet raakt: die werd altijd al correct geweigerd zodra het plafond vol was.
 *    Een test die hier één rij aanbiedt, blijft groen terwijl de belofte breekt.
 *
 * ⚠️ De must-allows staan er even hard in. Zonder de eerste is "niemand kan meer
 *    iets invoegen" ook groen; zonder de tweede zou de rollover stilvallen —
 *    0083 koos destijds met zoveel woorden géén trigger omdat een trigger ook
 *    voor `service_role` geldt, en dát is de eigenschap die hier getoetst wordt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;

/** De cyclus waarin alle weekdoelen in dit bestand staan. */
const CYCLUS_START = '2026-09-07';

/** Dag 0..6 van die cyclus — `afvinking_binnen_de_cyclus` laat alleen die zeven toe. */
function dagInCyclus(dag: number): string {
  const d = new Date(`${CYCLUS_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dag);
  return d.toISOString().slice(0, 10);
}
const TEST_TIMEOUT = 240_000;

let alice: TestUser;
let bob: TestUser;
let bobDoel: string;
let goalId: string;
let groupId: string;
let weekReviewId: string;

/** Landde er iets, en zo nee met welke code? */
function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

async function aantal(tabel: string, kolom: string, waarde: string): Promise<number> {
  const { count } = await adminDb()
    .from(tabel as 'goals')
    .select('*', { count: 'exact', head: true })
    .eq(kolom, waarde);
  return count ?? 0;
}

describe.runIf(rlsTestsConfigured)('een dagplafond begrenst ook de batch', () => {
  beforeAll(async () => {
    alice = await createTestUser('dagplafond');

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Dagplafond', target_date: '2027-01-01' })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);
    goalId = doel.data.id;

    // ⚠️ Eén weekdoel in de opbouw, zodat de weekdoelentest hierboven een
    //    bestaande rij heeft om tegen af te tellen.
    const weekdoel = await alice.db
      .from('weekly_goals')
      .insert({ goal_id: goalId, title: 'week', cycle_start_date: CYCLUS_START });
    if (weekdoel.error) throw new Error(`weekdoel: ${weekdoel.error.message}`);

    // ⚠️ Via `create_group()` en niet met een rauwe insert: die zet ook het
    //    lidmaatschap en de uitnodigingscode, en dat is wat een echte groep heeft.
    const groep = await alice.db.rpc('create_group', { group_name: 'Dagplafond' });
    if (groep.error) throw new Error(`groep: ${groep.error.message}`);
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    groupId = g.group.id;

    // ⚠️⚠️ **De must-allows krijgen een eigen gebruiker, en dat is een
    //    gerepareerde ijking.** Het dagplafond telt per gebruiker, dus als een
    //    belofte-test hierboven zijn batch tóch laat landen — precies wat er
    //    gebeurt zodra iemand de trigger sloopt — dan zit Alice aan haar plafond
    //    en faalt de must-allow als gevólg daarvan. 📏 Gemeten: de trigger op
    //    `weekly_goals` weghalen maakte twee tests rood in plaats van één. Een
    //    must-allow die meelift op de uitkomst van de test die hij moet
    //    tegenwegen, meet niet wat hij belooft.
    bob = await createTestUser('dagplafond-mustallow');
    const bobsDoel = await bob.db
      .from('goals')
      .insert({ owner_id: bob.id, title: 'Must-allow', target_date: '2027-01-01' })
      .select('id')
      .single();
    if (bobsDoel.error) throw new Error(`bobs doel: ${bobsDoel.error.message}`);
    bobDoel = bobsDoel.data.id;

    // ⚠️ `group_period_start` moet een échte periodestart van deze groep zijn —
    //    een trigger toetst dat. De huddledag is de standaard van `create_group`.
    const periode = groepsperiodeVan({ huddle_day: 0, tz: 'Europe/Amsterdam' }, now());

    const review = await adminDb()
      .from('week_reviews')
      .insert({
        group_id: groupId,
        user_id: alice.id,
        group_period_start: periode.startDate,
        did_text: 'Deze week gedaan.',
      })
      .select('id')
      .single();
    if (review.error) throw new Error(`weekreview: ${review.error.message}`);
    weekReviewId = review.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de belofte: één POST komt niet boven het dagplafond uit', () => {
    /**
     * ⚠️ Elk geval biedt **plafond + 1** rijen in één verzoek aan, vanaf nul. Dat
     *    is het scherpst mogelijke geval: elke rij afzonderlijk mag, en alleen
     *    het totaal is te veel. Een grens die hierop afgaat, gaat op elke grotere
     *    batch ook af.
     */
    it(
      'weigert 201 weekdoelen in één verzoek — plafond 200',
      async () => {
        const rijen = Array.from({ length: 201 }, (_, i) => ({
          goal_id: goalId,
          title: `bulk ${i}`,
          cycle_start_date: CYCLUS_START,
        }));
        const { error } = await alice.db.from('weekly_goals').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        // het weekdoel uit de opbouw staat er nog; de 201 zijn geen van alle geland
        expect(await aantal('weekly_goals', 'goal_id', goalId)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 201 doelen in één verzoek — plafond 200',
      async () => {
        const rijen = Array.from({ length: 201 }, (_, i) => ({
          owner_id: alice.id,
          title: `doel ${i}`,
          target_date: '2027-01-01',
        }));
        const { error } = await alice.db.from('goals').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        expect(await aantal('goals', 'owner_id', alice.id)).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 1001 mijlpalen in één verzoek — plafond 1000',
      async () => {
        const rijen = Array.from({ length: 1001 }, (_, i) => ({
          goal_id: goalId,
          title: `mijlpaal ${i}`,
          order_index: i,
        }));
        const { error } = await alice.db.from('milestones').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        expect(await aantal('milestones', 'goal_id', goalId)).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 1001 doelgebeurtenissen in één verzoek — plafond 1000',
      async () => {
        const rijen = Array.from({ length: 1001 }, () => ({
          goal_id: goalId,
          actor_id: alice.id,
          event_type: 'created',
        }));
        const { error } = await alice.db.from('goal_events').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 201 weekplanstappen in één verzoek — plafond 200',
      async () => {
        // ⚠️ `order_index` moet 1..52 zijn (CHECK `weekly_plan_steps_order_bereik`)
        //    en hoeft niet uniek te zijn. 📏 Met een oplopende index was deze test
        //    groen om de verkeerde reden: hij werd door die CHECK geweigerd, met
        //    dezelfde 23514, en bleef groen toen de trigger weggehaald werd.
        const rijen = Array.from({ length: 201 }, (_, i) => ({
          goal_id: goalId,
          title: `stap ${i}`,
          order_index: (i % 52) + 1,
        }));
        const { error } = await alice.db.from('weekly_plan_steps').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        expect(await aantal('weekly_plan_steps', 'goal_id', goalId)).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 501 berichten in één verzoek — plafond 500',
      async () => {
        const rijen = Array.from({ length: 501 }, (_, i) => ({
          group_id: groupId,
          sender_id: alice.id,
          body: `bericht ${i}`,
          type: 'text',
        }));
        const { error } = await alice.db.from('chat_messages').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De opbouw is hier het halve werk, en dat is een gerepareerde valse
     *    groene.** Een afvinking moet binnen de week van zijn weekdoel vallen
     *    (`afvinking_binnen_de_cyclus`, zelfde foutcode 23514), en er mag er maar
     *    één per weekdoel per dag zijn. 📏 Met 501 oplopende datums op één
     *    weekdoel was deze test groen doordat díé trigger hem weigerde — hij
     *    bleef groen toen het dagplafond weggehaald werd.
     *
     *    Zeven geldige dagen per weekdoel betekent 72 weekdoelen voor 504 rijen.
     *    Die worden als `service_role` klaargezet: anders eet de opbouw het
     *    weekdoelplafond op dat een andere test in dit bestand juist meet.
     */
    it(
      'weigert 504 dagafvinkingen in één verzoek — plafond 500',
      async () => {
        const weekdoelen = await adminDb()
          .from('weekly_goals')
          .insert(
            Array.from({ length: 72 }, (_, i) => ({
              goal_id: goalId,
              title: `afvink ${i}`,
              cycle_start_date: CYCLUS_START,
            })),
          )
          .select('id');
        if (weekdoelen.error) throw new Error(`weekdoelen: ${weekdoelen.error.message}`);

        const rijen = weekdoelen.data.flatMap((w) =>
          Array.from({ length: 7 }, (_, d) => ({
            weekly_goal_id: w.id,
            local_date: dagInCyclus(d),
          })),
        );
        expect(rijen).toHaveLength(504);

        const { error } = await alice.db.from('day_checkins').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        const eerste = weekdoelen.data[0];
        if (eerste === undefined) throw new Error('geen weekdoelen aangemaakt');
        expect(await aantal('day_checkins', 'weekly_goal_id', eerste.id)).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert 101 weekreacties in één verzoek — plafond 100',
      async () => {
        const rijen = Array.from({ length: 101 }, (_, i) => ({
          week_review_id: weekReviewId,
          author_id: alice.id,
          body: `reactie ${i}`,
        }));
        const { error } = await alice.db.from('week_review_replies').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de must-allows', () => {
    it(
      'laat een gewone invoeging onder het plafond gewoon door',
      async () => {
        const { error } = await bob.db
          .from('weekly_goals')
          .insert({ goal_id: bobDoel, title: 'gewoon', cycle_start_date: CYCLUS_START });

        expect(uitkomst(error)).toBe('toegelaten');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Dit is de test die 0083 bedoelde toen hij géén trigger koos.** Een
     *    trigger geldt ook voor `service_role`, en de rollover en de
     *    notificatiejob draaien daaronder. Ze mogen hier niet door geraakt
     *    worden — de grens hangt aan de aanwezigheid van een sessie
     *    (`auth.uid()`), niet aan een rolnaam.
     */
    it(
      'laat service_role ongehinderd voorbij het plafond schrijven',
      async () => {
        const rijen = Array.from({ length: 250 }, (_, i) => ({
          goal_id: bobDoel,
          title: `dienst ${i}`,
          cycle_start_date: CYCLUS_START,
        }));
        const { error } = await adminDb().from('weekly_goals').insert(rijen);

        expect(uitkomst(error)).toBe('toegelaten');
      },
      TEST_TIMEOUT,
    );
  });
});
