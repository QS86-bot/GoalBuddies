import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Voortgang komt van het afvinken en niet van de invoer — QS8-353, migratie 0195.
 *
 * ⚠️ **De belofte is niet "de kolom staat niet in de grant".** Dat is een
 *    eigenschap van het onderdeel en die verhuist niet mee. De belofte is wat een
 *    gebruiker over zijn doel te zien krijgt: *een mijlpaal telt als gehaald
 *    doordat je hem afvinkt, niet doordat je dat invult.* Daarom toetst dit
 *    bestand de rij ná afloop en niet de rechten.
 *
 * ⚠️⚠️ **Er waren twee deuren en de tweede is de leerzame.** Het issue meldde de
 *    INSERT-kant: een mijlpaal aanmaken die meteen `done` is. 📏 Gemeten, en het
 *    klopte — HTTP 201 met een zelfgekozen `id`, `status = done` en een
 *    `completed_at` in 2020. Maar `completed_at` stond óók in de UPDATE-grant,
 *    want dát is het afvinken:
 *
 *      PATCH {status: 'done', completed_at: '2019-05-05'}  -> HTTP 200
 *
 *    Alleen de INSERT-deur sluiten had een test opgeleverd die de belofte
 *    uitspreekt terwijl je hem via PATCH nog steeds breekt — groen om de
 *    verkeerde reden (onwrikbare regel 18, vraag 3). Vandaar de trigger:
 *    `status` blijft van de gebruiker, `completed_at` is een servertijdstempel.
 *
 * ⚠️ **Wat een verzonnen mijlpaal wél en niet opleverde**, gemeten vóór de
 *    reparatie: geen groepsaankondiging en geen badge (`milestones_systeembericht`
 *    en `badges_na_mijlpaal` zijn `AFTER UPDATE`), en geen doel dat je zo kunt
 *    afronden (`rond_doel_af()` telt `todo`). Wél zichtbare voortgang die niet
 *    verdiend is: `groep_teller`, `group_overview`, `herbereken_risico`,
 *    `seizoensrecap_cijfers` en `goal_dashboard` lezen `milestones.status`.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart:
 *
 *   A  `revoke insert (id, status, completed_at)` uit 0195 halen
 *      → 1 rood: 'een mijlpaal begint op todo, wat de client ook meestuurt'
 *   B  `revoke update (completed_at)` uit 0195 halen
 *      → 1 rood: 'het tijdstempel komt van de server en niet uit de body'
 *   C  de trigger `mijlpaal_stempel` droppen
 *      → 1 rood: 'MUST-ALLOW: afvinken werkt en stempelt zelf'.
 *        ⚠️ Ik verwachtte er twee en dat was fout, en de reden is het opschrijven
 *        waard: zonder trigger kán `completed_at` nooit gevuld raken — de client
 *        mag hem niet schrijven — dus blijft hij overal `null`, en dan slaagt
 *        'terugzetten wist het tijdstempel' omdat null al null ís. Die vierde
 *        test bewaakt dus de trigger níet; hij bewaakt dat de twee takken van de
 *        trigger niet omgedraaid worden zolang die er staat.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  goalId: string;
}

let w: Wereld;

/** Een oplopende index, want `milestones_goal_order_uniq` staat op (goal_id, order_index). */
let volgende = 100;

describe.skipIf(!rlsTestsConfigured)('een mijlpaal wordt afgevinkt, niet ingevoerd', () => {
  beforeAll(async () => {
    const alice = await createTestUser('mijlpaal-alice');

    const doel = await alice.db
      .from('goals')
      .insert({
        owner_id: alice.id,
        title: 'Mijlpaaldoel',
        target_date: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10),
      })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);

    w = { alice, goalId: doel.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function maak(velden: Record<string, unknown> = {}) {
    volgende += 1;
    return w.alice.db
      .from('milestones')
      .insert({ goal_id: w.goalId, title: 'Mijlpaal', order_index: volgende, ...velden })
      .select('id, status, completed_at');
  }

  it(
    'een mijlpaal begint op todo, wat de client ook meestuurt',
    async () => {
      // ⚠️ Het gunstigste geval voor de aanvaller: zijn eigen doel, zijn eigen
      //    mijlpaal. Lukt het hier niet, dan lukt het nergens.
      const poging = await maak({ status: 'done', completed_at: '2020-01-01T00:00:00Z' });

      expect(poging.error, 'een client hoort deze kolommen niet te mogen zetten').not.toBeNull();
      expect(poging.error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'het tijdstempel komt van de server en niet uit de body',
    async () => {
      const gemaakt = await maak();
      if (gemaakt.error) throw new Error(`mijlpaal: ${gemaakt.error.message}`);
      const id = gemaakt.data?.[0]?.id as string;

      const poging = await w.alice.db
        .from('milestones')
        .update({ status: 'done', completed_at: '2019-05-05T00:00:00Z' })
        .eq('id', id)
        .select('id');

      expect(poging.error, 'een teruggedateerd tijdstempel hoort geweigerd te worden').not.toBeNull();
      expect(poging.error?.code).toBe('42501');

      const na = await adminDb().from('milestones').select('status').eq('id', id).single();
      expect(na.data?.status, 'de rij is toch veranderd').toBe('todo');
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: afvinken werkt en stempelt zelf',
    async () => {
      // ⚠️ **De must-allow draagt hier het meeste.** "Je kunt niets zetten" is
      //    gratis groen zodra de hele tabel dicht zit; deze helft bewijst dat de
      //    weg openstaat voor wat er wél doorheen hoort.
      const gemaakt = await maak();
      if (gemaakt.error) throw new Error(`mijlpaal: ${gemaakt.error.message}`);
      const id = gemaakt.data?.[0]?.id as string;
      expect(gemaakt.data?.[0]?.status, 'een nieuwe mijlpaal begint op todo').toBe('todo');
      expect(gemaakt.data?.[0]?.completed_at).toBeNull();

      const af = await w.alice.db
        .from('milestones')
        .update({ status: 'done' })
        .eq('id', id)
        .select('status, completed_at');

      expect(af.error).toBeNull();
      expect(af.data?.[0]?.status).toBe('done');
      expect(af.data?.[0]?.completed_at, 'de trigger hoort het tijdstempel te zetten').not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: terugzetten wist het tijdstempel, en een titelwijziging laat het staan',
    async () => {
      // ⚠️ De twee takken van de trigger die je makkelijk omdraait. Zonder deze
      //    test is "stempel altijd `now()`" ook groen, en dan schuift het moment
      //    van afronden op zodra iemand een typefout herstelt.
      const gemaakt = await maak();
      if (gemaakt.error) throw new Error(`mijlpaal: ${gemaakt.error.message}`);
      const id = gemaakt.data?.[0]?.id as string;

      const af = await w.alice.db
        .from('milestones')
        .update({ status: 'done' })
        .eq('id', id)
        .select('completed_at');
      const gestempeld = af.data?.[0]?.completed_at as string;

      const hernoemd = await w.alice.db
        .from('milestones')
        .update({ title: 'Andere titel' })
        .eq('id', id)
        .select('completed_at');
      expect(
        hernoemd.data?.[0]?.completed_at,
        'een titelwijziging hoort het moment van afronden niet te verschuiven',
      ).toBe(gestempeld);

      const terug = await w.alice.db
        .from('milestones')
        .update({ status: 'todo' })
        .eq('id', id)
        .select('completed_at');
      expect(terug.data?.[0]?.completed_at, 'terugzetten hoort het tijdstempel te wissen').toBeNull();
    },
    TEST_TIMEOUT,
  );
});
