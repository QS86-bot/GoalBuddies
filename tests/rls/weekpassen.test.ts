/**
 * QS8-81 — Weekpassen, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ De vraag die deze suite stelt is niet "werkt de gelukkige route" maar drie
 *    andere: kun je een pas krijgen die je niet verdiend hebt, kun je een pas
 *    inzetten op een week die nog loopt, en — de zwaarste — kun je zién dat een
 *    ánder een pas verbruikt heeft. Dat laatste is domeinregel 7: een verbruikte
 *    weekpas is het bewijs van een gemiste week.
 *
 * ⚠️ `week_pass_events` gaat met deze issue van leeg naar gevuld, en de
 *    werkvoorraad zegt wat je dan moet vragen: wat betekent een ontbrekende rij
 *    nu? Antwoord: "deze gemiste week is niet gered". Daarom staan hieronder
 *    zowel de tests dat je je eigen rijen ziet als de tests dat je die van een
 *    ander in geen enkele vorm te pakken krijgt — ook niet via `weekpas_stand()`,
 *    dat als SECURITY DEFINER draait en dus buiten RLS om leest.
 *
 * ⚠️ Alle accounts worden één keer in `beforeAll` gemaakt. Supabase weigert na
 *    ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached"; zie je dat in de opbouw, wacht dan een minuut in plaats van in de
 *    policies te zoeken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import {
  adminDb,
  anonDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Heeft zes goedgekeurde cycli en dus twee weekpassen. */
  alice: TestUser;
  /** Heeft niets. Staat voor "een willekeurige andere ingelogde gebruiker". */
  bob: TestUser;
  aliceGoalId: string;
  bobGoalId: string;
  /** De cyclus die alice gemist heeft en die door een pas gered is. */
  gemisteCyclus: IsoDate;
}

interface Stand {
  voorraad?: number;
  maximum?: number;
  voltooide_cycli?: number;
  tot_volgende?: number;
  laatst_verbruikt?: string | null;
}

function stand(data: unknown): Stand {
  return (data ?? {}) as Stand;
}

describe.skipIf(!rlsTestsConfigured)('QS8-81 — Weekpassen', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('weekpas-alice');
    const bob = await createTestUser('weekpas-bob');

    const maakDoel = async (userId: string, titel: string): Promise<string> => {
      const { data, error } = await admin
        .from('goals')
        .insert({
          owner_id: userId,
          title: titel,
          category: 'other',
          target_date: '2026-12-31',
        })
        .select('id')
        .single();
      if (error) throw new Error(`doel aanmaken: ${error.message}`);
      return data.id;
    };

    const aliceGoalId = await maakDoel(alice.id, 'Weekpasdoel alice');
    const bobGoalId = await maakDoel(bob.id, 'Weekpasdoel bob');

    // Zes voltooide cycli voor alice. De cyclus komt uit `shared/time` en wordt
    // hier niet nagerekend (correctheidsregel 7).
    const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    for (let i = 6; i >= 1; i -= 1) {
      const start = addDays(basis.startDate, -7 * (i + 1));
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: aliceGoalId,
        title: `week -${i}`,
        cycle_start_date: start,
        cycle_index: 100 - i,
        status: 'approved',
      });
      if (error) throw new Error(`weekdoel aanmaken: ${error.message}`);
      // Verdienen loopt normaal via de goedkeuringstrigger; hier rechtstreeks,
      // want die trigger hangt aan een volledige goedkeuringsketen.
      const verdiend = await admin.rpc('verdien_weekpassen', {
        p_user_id: alice.id,
        p_goal_id: aliceGoalId,
      });
      if (verdiend.error) throw new Error(`verdienen: ${verdiend.error.message}`);
    }

    // En één gemiste cyclus, die door een pas gered wordt.
    const gemisteCyclus = addDays(basis.startDate, -7);
    const gemist = await admin.from('weekly_goals').insert({
      goal_id: aliceGoalId,
      title: 'gemiste week',
      cycle_start_date: gemisteCyclus,
      cycle_index: 101,
      status: 'missed',
    });
    if (gemist.error) throw new Error(`gemist weekdoel: ${gemist.error.message}`);

    const verbruikt = await admin.rpc('verbruik_weekpas', {
      p_user_id: alice.id,
      p_goal_id: aliceGoalId,
      p_cycle_start_date: gemisteCyclus,
    });
    if (verbruikt.error) throw new Error(`verbruiken: ${verbruikt.error.message}`);
    if (verbruikt.data !== true) throw new Error('opbouw: de pas werd niet verbruikt');

    f = { alice, bob, aliceGoalId, bobGoalId, gemisteCyclus };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('week_pass_events').delete().in('goal_id', [f.aliceGoalId, f.bobGoalId]);
    await admin.from('weekly_goals').delete().in('goal_id', [f.aliceGoalId, f.bobGoalId]);
    await admin.from('user_streaks').delete().in('goal_id', [f.aliceGoalId, f.bobGoalId]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Domeinregel 7 — de belangrijkste tests in dit bestand
  // -------------------------------------------------------------------------

  it(
    'laat een ander niet bij de weekpasgebeurtenissen van alice',
    async () => {
      const { data, error } = await f.bob.db
        .from('week_pass_events')
        .select('*')
        .eq('goal_id', f.aliceGoalId);

      // Geen fout maar nul rijen: dat is hoe een SELECT-policy weigert.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een uitgelogde bezoeker er al helemaal niet bij',
    async () => {
      const { data, error } = await anonDb().from('week_pass_events').select('*');

      expect(error === null ? data : []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een ander geen weekpasstand via de RPC',
    async () => {
      // ⚠️ `weekpas_stand()` is SECURITY DEFINER en leest dus buiten RLS om. De
      //    eigenaarstoets zit in de functie zelf; zonder die toets zou dit de
      //    voorraad van alice teruggeven — en een gedaalde voorraad is een
      //    gemiste week.
      const { data, error } = await f.bob.db.rpc('weekpas_stand', {
        p_goal_id: f.aliceGoalId,
      });

      expect(error).toBeNull();
      expect(data).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een uitgelogde bezoeker geen weekpasstand',
    async () => {
      const { data, error } = await anonDb().rpc('weekpas_stand', {
        p_goal_id: f.aliceGoalId,
      });

      // Anon heeft geen EXECUTE; dat hoort een fout te zijn en geen leeg
      // antwoord dat je voor "niets te zien" kunt aanzien.
      expect(error === null ? data : null).toBeNull();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De tabel blijft dicht voor de client
  // -------------------------------------------------------------------------

  it(
    'laat niemand zichzelf een weekpas geven',
    async () => {
      const { error } = await f.alice.db.from('week_pass_events').insert({
        user_id: f.alice.id,
        goal_id: f.aliceGoalId,
        event: 'granted',
        cycle_start_date: f.gemisteCyclus,
      });

      // Er is geen INSERT-policy: 42501.
      expect(error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand een verbruikte pas wegpoetsen',
    async () => {
      // Append-only (domeinregel 6). Zonder dit slot kun je je gemiste week
      // uitwissen door de `spent`-rij te verwijderen en zo je reeks herstellen.
      //
      // ⚠️ Dit weigert stil en niet luid, en dat is de moeite van het opschrijven
      //    waard. `week_pass_events` heeft geen DELETE-policy, maar de tabel
      //    heeft wél de standaard Supabase-grants. Postgres weigert dan geen
      //    recht (42501) maar filtert de rijen weg, en een DELETE die niets
      //    raakt is geen fout. Je krijgt dus HTTP 204 en een ongewijzigde tabel.
      //
      //    Daarom toetst deze test de úítkomst en niet de foutcode: de rij moet
      //    er daarna nog staan. Dat is de eigenschap die telt, en hij blijft
      //    kloppen of de grants nu ooit ingetrokken worden of niet.
      const { error } = await f.alice.db
        .from('week_pass_events')
        .delete()
        .eq('goal_id', f.aliceGoalId)
        .eq('event', 'spent');

      // Geen fout, of een rechtenfout: allebei goed. Niet goed is een fout van
      // een andere soort, want dan is er iets anders stuk.
      if (error !== null) expect(error.code).toBe('42501');

      const { count } = await adminDb()
        .from('week_pass_events')
        .select('*', { count: 'exact', head: true })
        .eq('goal_id', f.aliceGoalId)
        .eq('event', 'spent');

      expect(count).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand een verbruikte pas terugdraaien naar verdiend',
    async () => {
      // Zou dit lukken, dan verandert een gemiste week in een tegoed: de reeks
      // blijft gered én de pas is terug.
      const { error } = await f.alice.db
        .from('week_pass_events')
        .update({ event: 'earned' })
        .eq('goal_id', f.aliceGoalId)
        .eq('event', 'spent');

      if (error !== null) expect(error.code).toBe('42501');

      const { data } = await adminDb()
        .from('week_pass_events')
        .select('event')
        .eq('goal_id', f.aliceGoalId)
        .eq('event', 'spent');

      expect(data).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gewone gebruiker de verdien- en verbruikfuncties niet aanroepen',
    async () => {
      // ⚠️ Zou dit wél kunnen, dan kan iemand een pas inzetten op een week die
      //    nog loopt — en dan beschermt hij niets. Verdienen zou ronduit
      //    zelfbediening zijn.
      const verdien = await f.alice.db.rpc('verdien_weekpassen', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
      });
      const verbruik = await f.alice.db.rpc('verbruik_weekpas', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
        p_cycle_start_date: f.gemisteCyclus,
      });

      expect(verdien.error).not.toBeNull();
      expect(verbruik.error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De eigenaar ziet wél wat van hem is
  // -------------------------------------------------------------------------

  it(
    'geeft alice haar eigen stand, met het maximum uit de database',
    async () => {
      const { data, error } = await f.alice.db.rpc('weekpas_stand', {
        p_goal_id: f.aliceGoalId,
      });

      expect(error).toBeNull();

      const s = stand(data);
      // Twee verdiend (cadeau na de eerste, één na de zesde), één verbruikt.
      expect(s.voorraad).toBe(1);
      expect(s.maximum).toBe(2);
      expect(s.voltooide_cycli).toBe(6);
      expect(s.laatst_verbruikt).toBe(f.gemisteCyclus);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft bob een lege stand op zijn eigen doel in plaats van een fout',
    async () => {
      const { data, error } = await f.bob.db.rpc('weekpas_stand', {
        p_goal_id: f.bobGoalId,
      });

      expect(error).toBeNull();

      const s = stand(data);
      expect(s.voorraad).toBe(0);
      expect(s.voltooide_cycli).toBe(0);
      // Zonder één voltooide cyclus is de eerstvolgende pas het cadeau.
      expect(s.tot_volgende).toBe(1);
      expect(s.laatst_verbruikt).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de reeks van alice overeind ondanks de gemiste week',
    async () => {
      // Dit is waar de hele issue om draait. Zonder de pas zou de reeks op nul
      // staan; met de pas loopt hij door — maar hij groeit er niet van.
      const admin = adminDb();
      const herberekend = await admin.rpc('herbereken_reeks', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
      });
      expect(herberekend.error).toBeNull();

      const { data, error } = await f.alice.db
        .from('user_streaks')
        .select('current_streak')
        .eq('goal_id', f.aliceGoalId)
        .single();

      expect(error).toBeNull();
      expect(data?.current_streak).toBe(6);
    },
    TEST_TIMEOUT,
  );

  it(
    'beschermt de reeks maar niet het punt',
    async () => {
      // Domeinregel 10, en het verschil tussen een weekpas die iets betekent en
      // een die missen gratis maakt. De rollover boekt het minpunt; de pas raakt
      // `points_ledger` niet aan.
      const admin = adminDb();
      const { data, error } = await admin
        .from('points_ledger')
        .select('reason')
        .eq('goal_id', f.aliceGoalId)
        .eq('reason', 'cycle_missed');

      expect(error).toBeNull();
      // De opbouw hierboven roept de rollover niet aan, dus er staat niets — het
      // punt dat telt is dat `verbruik_weekpas()` er zelf niets aan toevoegt of
      // afhaalt.
      expect(data).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft geen tweede pas voor dezelfde mijlpaal',
    async () => {
      const admin = adminDb();
      const voor = await admin
        .from('week_pass_events')
        .select('*', { count: 'exact', head: true })
        .eq('goal_id', f.aliceGoalId);

      // De rollover en de goedkeuringstrigger kunnen allebei vaker langskomen.
      await admin.rpc('verdien_weekpassen', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
      });
      await admin.rpc('verdien_weekpassen', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
      });

      const na = await admin
        .from('week_pass_events')
        .select('*', { count: 'exact', head: true })
        .eq('goal_id', f.aliceGoalId);

      expect(na.count).toBe(voor.count);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet geen tweede pas in op dezelfde gemiste week',
    async () => {
      // De rollover draait elk uur en moet idempotent zijn. Zonder de unieke
      // index kost een gemiste week zoveel passen als er runs zijn.
      const admin = adminDb();
      const nogmaals = await admin.rpc('verbruik_weekpas', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
        p_cycle_start_date: f.gemisteCyclus,
      });

      expect(nogmaals.error).toBeNull();
      expect(nogmaals.data).toBe(false);

      const { count } = await admin
        .from('week_pass_events')
        .select('*', { count: 'exact', head: true })
        .eq('goal_id', f.aliceGoalId)
        .eq('event', 'spent');

      expect(count).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft via de batchfunctie uitsluitend je eigen doelen terug',
    async () => {
      // ⚠️ `weekpas_standen()` is SECURITY DEFINER en draait dus buiten RLS om.
      //    De eigenaarstoets zit in de where-regel; zonder die regel geeft één
      //    aanroep zonder argumenten de weekpasstand van de hele database.
      const { data, error } = await f.bob.db.rpc('weekpas_standen', {
        p_goal_ids: [f.aliceGoalId, f.bobGoalId],
      });

      expect(error).toBeNull();

      const rijen = (data ?? []) as { goal_id: string }[];
      expect(rijen.map((r) => r.goal_id)).toEqual([f.bobGoalId]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft zonder argument alle eigen doelen en niets daarbuiten',
    async () => {
      const { data, error } = await f.alice.db.rpc('weekpas_standen', {});

      expect(error).toBeNull();

      const rijen = (data ?? []) as { goal_id: string; voorraad: number }[];
      expect(rijen.map((r) => r.goal_id)).toContain(f.aliceGoalId);
      expect(rijen.map((r) => r.goal_id)).not.toContain(f.bobGoalId);
      expect(rijen.find((r) => r.goal_id === f.aliceGoalId)?.voorraad).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een uitgelogde bezoeker geen enkele stand via de batchfunctie',
    async () => {
      const { data, error } = await anonDb().rpc('weekpas_standen', {});

      expect(error === null ? data : []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een pas op een week die niet gemist is',
    async () => {
      const admin = adminDb();
      const basis = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

      const uitkomst = await admin.rpc('verbruik_weekpas', {
        p_user_id: f.alice.id,
        p_goal_id: f.aliceGoalId,
        // De lopende week: bestaat niet als gemist weekdoel.
        p_cycle_start_date: basis.startDate,
      });

      expect(uitkomst.error).toBeNull();
      expect(uitkomst.data).toBe(false);
    },
    TEST_TIMEOUT,
  );
});
