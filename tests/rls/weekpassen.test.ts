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
  /**
   * Lid van dezelfde groep als alice, en haar doel is aan die groep gekoppeld.
   *
   * ⚠️ Dat lidmaatschap is geen decor. Bob was eerst "een willekeurige andere
   *    ingelogde gebruiker" zónder groep, en daardoor bewees de domeinregel-7-test
   *    hieronder niets: `shares_group_with_goal()` gaf altijd `false`, dus bob zag
   *    alice' rijen niet omdat hij een vreemde was — niet omdat de policy een
   *    status uitsluit. Je kon `'cancelled'` uit `weekly_goals_select` slopen en
   *    de test bleef groen. Gevonden door de security-review op 0045, en het is
   *    de derde keer in dit project dat een test net naast de bescherming keek.
   */
  bob: TestUser;
  aliceGoalId: string;
  bobGoalId: string;
  groupId: string;
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

/** De vorm die de statusovergang-RPC's teruggeven. */
function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
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

    // ⚠️ Een échte groep met bob erin, en alice' doel eraan gekoppeld. Zonder
    //    dit is elke "de groep mag dit niet zien"-test een lege huls: bob ziet
    //    dan sowieso niets van alice.
    const groep = await alice.db.rpc('create_group', { group_name: 'Weekpas-test' });
    if (groep.error) throw new Error(`groep aanmaken: ${groep.error.message}`);
    const groepData = (groep.data ?? {}) as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const meedoen = await bob.db.rpc('join_group_with_code', {
      code: groepData.group.invite_code,
    });
    if (meedoen.error) throw new Error(`bob werd geen lid: ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    const koppeling = await admin
      .from('goal_group_links')
      .insert({ goal_id: aliceGoalId, group_id: groupId });
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

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

    f = { alice, bob, aliceGoalId, bobGoalId, groupId, gemisteCyclus };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goal_group_links').delete().eq('group_id', f.groupId);
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

  // -------------------------------------------------------------------------
  // De reeks die de weekpas beschermt — A35 en A36, gedicht in 0043
  // -------------------------------------------------------------------------
  //
  // ⚠️ Allebei ouder dan QS8-81, allebei gevonden door de security-review erop,
  //    en allebei de bódem onder deze feature: een weekpas is een schaarse munt
  //    die een reeks beschermt, en als die reeks te verzinnen én gratis te
  //    repareren is, is de munt niets waard.
  //
  // ⚠️ Ze stonden hier eerst als `it.fails`, omdat een reparatie de RLS van
  //    `weekly_goals` raakt en dat volgens CLAUDE.md eerst een besluit van
  //    Quinten vraagt. Dat besluit is er (19-08) en 0043 heeft het gat gedicht,
  //    dus het zijn nu gewone tests.

  it(
    'laat een zelf aangemaakt weekdoel niet op approved zetten',
    async () => {
      // Zonder deze grens levert één POST per week een verzonnen reeks op die de
      // groep via `group_visible_streaks` te zien krijgt, plus gratis
      // weekpassen — `verdien_weekpassen()` telt goedgekeurde cycli.
      const { error } = await f.bob.db.from('weekly_goals').insert({
        goal_id: f.bobGoalId,
        title: 'zelf goedgekeurd',
        cycle_start_date: '2026-03-02',
        cycle_index: 900,
        status: 'approved',
      });

      // Een kolomgrant weigert luid: 42501. RLS kan geen kolommen beperken, dus
      // dit kón alleen een grant zijn.
      expect(error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een weekdoel zonder status gewoon aanmaken',
    async () => {
      // ⚠️ De keerzijde van de test hierboven, en de reden dat hij bestaat: een
      //    ingetrokken kolomrecht breekt de app stil (valkuil 17). Dit is exact
      //    wat `maakWeekdoel()` invult; gaat dit stuk, dan kan niemand meer een
      //    weekdoel aanmaken en blijft de typecheck groen.
      const { data, error } = await f.bob.db
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'gewoon weekdoel',
          floor_text: 'de slechte week',
          ceiling_text: 'de goede week',
          cycle_start_date: '2026-03-16',
          cycle_index: 902,
        })
        .select('id, status')
        .single();

      expect(error).toBeNull();
      // En hij begint op `todo`, want de standaardwaarde doet het werk.
      expect(data?.status).toBe('todo');

      await adminDb().from('weekly_goals').delete().eq('id', data?.id ?? '');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // A39 en A40 — de twee andere deuren naar dezelfde kamer, dicht in 0045
  // -------------------------------------------------------------------------

  it(
    'laat doorschuiven de reeks niet repareren',
    async () => {
      // ⚠️ Dit is de kern van A39. `markeer_doorgeschoven()` zette een gemiste
      //    week op `carried`, en `herbereken_reeks()` brak alleen op `missed` —
      //    dus één aanroep herstelde de reeks gratis, terwijl de rollover de
      //    weekpas al had verbruikt. Doorschuiven verplaatst sinds 0045 het
      //    wérk en niet de geschiedenis.
      const admin = adminDb();
      const cyclus = '2026-05-04';

      const gemist = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'gemist en doorgeschoven',
          cycle_start_date: cyclus,
          cycle_index: 910,
          status: 'missed',
        })
        .select('id')
        .single();
      if (gemist.error) throw new Error(`opbouw: ${gemist.error.message}`);

      // Een goedgekeurde week erna, zodat er iets te repareren valt.
      const goed = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'wel gehaald',
          cycle_start_date: '2026-05-11',
          cycle_index: 911,
          status: 'approved',
        })
        .select('id')
        .single();
      if (goed.error) throw new Error(`opbouw: ${goed.error.message}`);

      const doorgeschoven = await f.bob.db.rpc('markeer_doorgeschoven', {
        p_weekly_goal_id: gemist.data.id,
      });
      expect(doorgeschoven.error).toBeNull();
      expect(uitkomst(doorgeschoven.data).ok).toBe(true);

      await admin.rpc('herbereken_reeks', { p_user_id: f.bob.id, p_goal_id: f.bobGoalId });

      const { data } = await f.bob.db
        .from('user_streaks')
        .select('current_streak')
        .eq('goal_id', f.bobGoalId)
        .single();

      // De week ná de doorgeschoven week telt, de reeks dáárvoor niet: 1 en
      // niet 2. Vóór 0045 was dit 2.
      expect(data?.current_streak).toBe(1);

      await admin.from('weekly_goals').delete().in('id', [gemist.data.id, goed.data.id]);
      await admin.from('user_streaks').delete().eq('goal_id', f.bobGoalId);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een openstaande week niet doorschuiven vóór de rollover erbij was',
    async () => {
      // ⚠️ Zonder deze grens kon je het minpunt ontlopen: de rollover raakt
      //    uitsluitend `todo` en `cancelled`, dus een rij die al `carried` is
      //    wordt nooit meer `missed` en er wordt nooit iets geboekt.
      const admin = adminDb();
      const open = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'nog open',
          cycle_start_date: '2026-05-18',
          cycle_index: 912,
          status: 'todo',
        })
        .select('id')
        .single();
      if (open.error) throw new Error(`opbouw: ${open.error.message}`);

      const poging = await f.bob.db.rpc('markeer_doorgeschoven', {
        p_weekly_goal_id: open.data.id,
      });

      expect(poging.error).toBeNull();
      expect(uitkomst(poging.data).ok).toBe(false);
      expect(uitkomst(poging.data).reason).toBe('not_missed');

      await admin.from('weekly_goals').delete().eq('id', open.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een weekdoel afsluiten in plaats van verwijderen, en het spoor blijft',
    async () => {
      // A40: de rij verdwijnt niet, hij krijgt `cancelled`. De rollover veegt
      // hem daarna mee naar `missed`, dus afsluiten kost wat het hoort te kosten.
      const admin = adminDb();
      const gemaakt = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'toch maar niet',
          cycle_start_date: '2026-05-25',
          cycle_index: 913,
          status: 'todo',
        })
        .select('id')
        .single();
      if (gemaakt.error) throw new Error(`opbouw: ${gemaakt.error.message}`);

      const afgesloten = await f.bob.db.rpc('sluit_weekdoel_af', {
        p_weekly_goal_id: gemaakt.data.id,
      });

      expect(afgesloten.error).toBeNull();
      expect(uitkomst(afgesloten.data).ok).toBe(true);

      const { data } = await admin
        .from('weekly_goals')
        .select('status')
        .eq('id', gemaakt.data.id)
        .single();

      expect(data?.status).toBe('cancelled');

      await admin.from('weekly_goals').delete().eq('id', gemaakt.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand het weekdoel van een ander afsluiten',
    async () => {
      const admin = adminDb();
      const vanAlice = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.aliceGoalId,
          title: 'van alice',
          cycle_start_date: '2026-06-01',
          cycle_index: 914,
          status: 'todo',
        })
        .select('id')
        .single();
      if (vanAlice.error) throw new Error(`opbouw: ${vanAlice.error.message}`);

      const poging = await f.bob.db.rpc('sluit_weekdoel_af', {
        p_weekly_goal_id: vanAlice.data.id,
      });

      expect(uitkomst(poging.data).ok).toBe(false);
      expect(uitkomst(poging.data).reason).toBe('not_owner');

      await admin.from('weekly_goals').delete().eq('id', vanAlice.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'verbergt tegenslag voor een échte groepsgenoot, maar laat een goede week wél zien',
    async () => {
      // ⚠️ Domeinregel 7. Een afgesloten weekdoel is een opgegeven week, en dat
      //    is exact het tegenslagsignaal dat 0019 en 0020 voor `missed` en
      //    `carried` weghaalden. Zonder `cancelled` erbij lekt 0045 precies wat
      //    0020 dichtte.
      //
      // ⚠️ De positieve controle staat er niet voor de volledigheid maar omdat
      //    zonder haar niets bewezen is. Bob is lid van alice' groep en haar
      //    doel is eraan gekoppeld; ziet hij de goedgekeurde week ook niet, dan
      //    zegt "hij ziet de afgesloten week niet" alleen dat er iets anders
      //    stuk is. Dat was precies de fout in de eerste versie van deze test.
      const admin = adminDb();

      const verborgen: readonly ('missed' | 'carried' | 'cancelled')[] = [
        'missed',
        'carried',
        'cancelled',
      ];

      const gemaakt: string[] = [];
      let index = 915;

      for (const status of verborgen) {
        const rij = await admin
          .from('weekly_goals')
          .insert({
            goal_id: f.aliceGoalId,
            title: `${status} week van alice`,
            cycle_start_date: `2026-06-${String(index - 907).padStart(2, '0')}`,
            cycle_index: index,
            status,
          })
          .select('id')
          .single();
        if (rij.error) throw new Error(`opbouw ${status}: ${rij.error.message}`);
        gemaakt.push(rij.data.id);
        index += 1;
      }

      const zichtbaar = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.aliceGoalId,
          title: 'gehaalde week van alice',
          cycle_start_date: '2026-06-22',
          cycle_index: index,
          status: 'approved',
        })
        .select('id')
        .single();
      if (zichtbaar.error) throw new Error(`opbouw approved: ${zichtbaar.error.message}`);
      gemaakt.push(zichtbaar.data.id);

      const { data, error } = await f.bob.db
        .from('weekly_goals')
        .select('id, status')
        .in('id', gemaakt);

      expect(error).toBeNull();

      const gezien = (data ?? []).map((r) => r.status);

      // De positieve controle: bob is écht groepsgenoot en ziet de goede week.
      expect(gezien).toContain('approved');
      // En geen enkele vorm van tegenslag.
      expect(gezien).not.toContain('missed');
      expect(gezien).not.toContain('carried');
      expect(gezien).not.toContain('cancelled');

      await admin.from('weekly_goals').delete().in('id', gemaakt);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gemiste week niet verwijderen',
    async () => {
      // `herbereken_reeks()` loopt over de rijen die er zijn. Verdwijnt de
      // gemiste week, dan bestaat de onderbreking niet meer en loopt de reeks
      // door — zonder pas, zonder bovengrens, zo vaak als je wilt. Dat is ook
      // domeinregel 6: corrigeren gebeurt met een correctie-record, niet door
      // geschiedenis weg te gooien.
      const admin = adminDb();
      const gemaakt = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'gemiste week van bob',
          cycle_start_date: '2026-03-09',
          cycle_index: 901,
          status: 'missed',
        })
        .select('id')
        .single();

      if (gemaakt.error) throw new Error(`opbouw: ${gemaakt.error.message}`);

      await f.bob.db.from('weekly_goals').delete().eq('id', gemaakt.data.id);

      // ⚠️ Toetst de úítkomst en niet de foutcode. De DELETE-policy weigert door
      //    de rij weg te filteren, en een DELETE die niets raakt is geen fout —
      //    je krijgt HTTP 204 en een ongewijzigde tabel. Zelfde reden als bij
      //    `week_pass_events` hierboven.
      const { count } = await admin
        .from('weekly_goals')
        .select('*', { count: 'exact', head: true })
        .eq('id', gemaakt.data.id);

      expect(count).toBe(1);

      await admin.from('weekly_goals').delete().eq('id', gemaakt.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gemiste week nooit gratis een punt kosten van nul',
    async () => {
      // ⚠️ `points_miss` had de CHECK `between -5 and 0` en stond in de
      //    insert-grant van 0043. Nul zit in dat bereik, dus één insert met
      //    `points_miss: 0` maakte missen gratis — de rollover boekt letterlijk
      //    deze waarde. Dat is domeinregel 10 en het ondergraaft de weekpas:
      //    als missen niets kost, zegt de score niets. 0044 haalt de kolom uit
      //    de grant; de standaardwaarde −1 doet het werk.
      const { error } = await f.bob.db.from('weekly_goals').insert({
        goal_id: f.bobGoalId,
        title: 'gratis missen',
        cycle_start_date: '2026-04-06',
        cycle_index: 905,
        points_miss: 0,
      });

      expect(error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand een weekdoel aanmaken op het doel van een ander',
    async () => {
      // ⚠️ De `for all`-policy is in 0043 vervangen door drie losse policies, en
      //    dan is een vergeten eigenaarstoets de klassieke fout. Deze test staat
      //    er omdat alle andere tests op het éígen doel draaien en dus niets
      //    zeggen over de grens.
      const { error } = await f.bob.db.from('weekly_goals').insert({
        goal_id: f.aliceGoalId,
        title: 'op andermans doel',
        cycle_start_date: '2026-04-13',
        cycle_index: 906,
      });

      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand het openstaande weekdoel van een ander verwijderen',
    async () => {
      const admin = adminDb();
      const gemaakt = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.aliceGoalId,
          title: 'open week van alice',
          cycle_start_date: '2026-04-20',
          cycle_index: 907,
          status: 'todo',
        })
        .select('id')
        .single();

      if (gemaakt.error) throw new Error(`opbouw: ${gemaakt.error.message}`);

      await f.bob.db.from('weekly_goals').delete().eq('id', gemaakt.data.id);

      const { count } = await admin
        .from('weekly_goals')
        .select('*', { count: 'exact', head: true })
        .eq('id', gemaakt.data.id);

      expect(count).toBe(1);

      await admin.from('weekly_goals').delete().eq('id', gemaakt.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat ook een openstaand weekdoel niet meer verwijderen — afsluiten is de weg',
    async () => {
      // ⚠️ Dit was in 0043 nog wél toegestaan, en A40 heeft dat teruggedraaid:
      //    juist het verwijderen van een `todo`-rij vóór de rollover was de
      //    manier om een week nooit gemist te laten zijn. Sinds 0045 is het
      //    DELETE-recht ingetrokken, dus dit weigert lúid met 42501 in plaats
      //    van stil — precies wat je wilt bij iets dat een gebruiker bewust
      //    probeert.
      const admin = adminDb();
      const gemaakt = await admin
        .from('weekly_goals')
        .insert({
          goal_id: f.bobGoalId,
          title: 'per ongeluk',
          cycle_start_date: '2026-03-23',
          cycle_index: 903,
          status: 'todo',
        })
        .select('id')
        .single();

      if (gemaakt.error) throw new Error(`opbouw: ${gemaakt.error.message}`);

      const { error } = await f.bob.db
        .from('weekly_goals')
        .delete()
        .eq('id', gemaakt.data.id);

      expect(error?.code).toBe('42501');

      const { count } = await admin
        .from('weekly_goals')
        .select('*', { count: 'exact', head: true })
        .eq('id', gemaakt.data.id);

      expect(count).toBe(1);

      await admin.from('weekly_goals').delete().eq('id', gemaakt.data.id);
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
