import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Badges — QS8-78 (PRD 8.4), migratie 0113.
 *
 * ⚠️ **Twee beloftes, en ze zijn allebei een ontwerpkeuze die het issue niet
 *    maakte.** QS8-78 is één PRD-zin zonder acceptatiecriteria; wat hier getoetst
 *    wordt, staat uitgeschreven in `docs/decisions/2026-08-27-badges-zijn-prive.md`.
 *
 *   1. **Een badge is privé.** Een badgemuur naast een ledenlijst is de zuiverste
 *      vorm van het probleem dat domeinregel 7 beschrijft: de badge die er níét
 *      staat, is het signaal.
 *   2. **Een badge verdwijnt nooit.** De reeksbadges hangen aan `best_streak` en
 *      niet aan `current_streak` — zou een badge weggaan als je reeks breekt, dan
 *      ís dat verdwijnen zelf de melding dat je een week gemist hebt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

describe.skipIf(!rlsTestsConfigured)('QS8-78 — badges', () => {
  let alice: TestUser;
  let bob: TestUser;
  let doelId: string;

  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  async function badgesVan(wie: TestUser): Promise<readonly string[]> {
    const { data, error } = await adminDb()
      .from('badges')
      .select('badge')
      .eq('user_id', wie.id)
      .order('badge', { ascending: true });
    if (error) throw new Error(`badges lezen: ${error.message}`);
    return (data ?? []).map((r) => r.badge);
  }

  beforeAll(async () => {
    alice = await createTestUser('badge-alice');
    bob = await createTestUser('badge-bob');

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Badgedoel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('goals').delete().eq('id', doelId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'begint leeg',
    async () => {
      expect(await badgesVan(alice)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een badge zodra de reeks vier haalt',
    async () => {
      const admin = adminDb();
      const zetten = await admin
        .from('user_streaks')
        .upsert({ user_id: alice.id, goal_id: doelId, current_streak: 4, best_streak: 4 });
      if (zetten.error) throw new Error(`reeks zetten: ${zetten.error.message}`);

      expect(await badgesVan(alice)).toContain('streak_4');
      expect(await badgesVan(alice), 'twaalf was nog niet gehaald').not.toContain('streak_12');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Deze test bewaakt minder dan zijn naam belooft, en dat staat er met
   *    opzet bij.** Hij is groen omdat `badges` geen DELETE-policy heeft — ook
   *    niet voor `service_role` — en niet omdat `verdien_badges()` op
   *    `best_streak` kijkt. Op 27-08 met de hand geprobeerd: `best_streak`
   *    vervangen door `current_streak` laat deze test gewoon groen, want de rij
   *    stond er al en niets haalt hem ooit weg.
   *
   *    Dat is onwrikbare regel 18 vraag 3 in het klein: hij kán groen blijven
   *    terwijl de belofte breekt. Hij blijft staan omdat hij het structurele slot
   *    bewaakt — verwijderen is onmogelijk — maar de belofte over `best_streak`
   *    staat in de test hieronder, en díé wordt wél rood.
   */
  it(
    'houdt de badge als de reeks daarna breekt',
    async () => {
      const admin = adminDb();
      const breken = await admin
        .from('user_streaks')
        .update({ current_streak: 0 })
        .eq('user_id', alice.id)
        .eq('goal_id', doelId);
      if (breken.error) throw new Error(`reeks breken: ${breken.error.message}`);

      expect(await badgesVan(alice), 'de badge verdween toen de reeks brak').toContain('streak_4');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dít is de test die `best_streak` bewaakt.** Een gebruiker die ooit vier
   *    haalde en nu op nul staat, hoort de badge alsnog te krijgen — hij heeft
   *    hem verdiend, en de reeks die intussen brak doet daar niets aan af.
   *
   *    Zonder deze test bewaakt niets de keuze voor `best_streak`: de test
   *    hierboven blijft groen omdat verwijderen structureel onmogelijk is.
   *    Met de hand gebroken op 27-08: `best_streak` vervangen door
   *    `current_streak` maakt precies deze test rood.
   */
  it(
    'geeft de badge ook aan wie vier ooit haalde en nu op nul staat',
    async () => {
      const admin = adminDb();
      const carol = await createTestUser('badge-carol');

      const doel = await carol.db
        .from('goals')
        .insert({ owner_id: carol.id, title: 'Gebroken reeks', target_date: cycle.endDate })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel carol: ${doel.error?.message}`);

      // Nooit eerder een badge gehad, en de reeks staat nú op nul.
      const zetten = await admin
        .from('user_streaks')
        .upsert({ user_id: carol.id, goal_id: doel.data.id, current_streak: 0, best_streak: 4 });
      if (zetten.error) throw new Error(`reeks carol: ${zetten.error.message}`);

      expect(
        await badgesVan(carol),
        'de badge hangt aan de huidige reeks in plaats van aan de beste',
      ).toContain('streak_4');

      await admin.from('goals').delete().eq('id', doel.data.id);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegenproef bij de vorige: de badge hangt aan `best_streak`, dus een
   *    gebruiker die nog nooit vier haalde, hoort hem niet te hebben. Zonder deze
   *    test zou "de badge blijft staan" ook groen zijn bij een functie die
   *    iedereen alles geeft.
   */
  it(
    'geeft hem niet aan iemand die vier nog nooit gehaald heeft',
    async () => {
      const admin = adminDb();
      const doel = await bob.db
        .from('goals')
        .insert({ owner_id: bob.id, title: 'Bobs doel', target_date: cycle.endDate })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel bob: ${doel.error?.message}`);

      const zetten = await admin
        .from('user_streaks')
        .upsert({ user_id: bob.id, goal_id: doel.data.id, current_streak: 3, best_streak: 3 });
      if (zetten.error) throw new Error(`reeks bob: ${zetten.error.message}`);

      expect(await badgesVan(bob)).not.toContain('streak_4');

      await admin.from('goals').delete().eq('id', doel.data.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een badge bij het afronden van een doel',
    async () => {
      const admin = adminDb();
      const af = await admin.from('goals').update({ status: 'completed' }).eq('id', doelId);
      if (af.error) throw new Error(`doel afronden: ${af.error.message}`);

      expect(await badgesVan(alice)).toContain('first_goal');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De privacybelofte, en de reden dat badges niet op een groepsscherm
   *    staan.** Bob deelt geen enkele groep met alice, maar zelfs als hij dat wél
   *    deed, hoort hij haar badges niet te zien: `badges_select` is
   *    `user_id = auth.uid()`, zonder groepstak.
   */
  it(
    'laat niemand anders je badges lezen',
    async () => {
      const { data, error } = await bob.db.from('badges').select('badge').eq('user_id', alice.id);
      if (error) throw new Error(`lezen: ${error.message}`);
      expect(data ?? [], 'een ander las de badges van alice').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest: jíj mag ze wél lezen, anders bewijst de vorige alleen dat de
   *    tabel onbereikbaar is.
   */
  it(
    'laat je je eigen badges wél lezen',
    async () => {
      const { data, error } = await alice.db.from('badges').select('badge');
      if (error) throw new Error(`lezen: ${error.message}`);
      expect((data ?? []).length, 'alice zag haar eigen badges niet').toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Structureel en niet met een regel code: `badges` heeft geen UPDATE- en
   *    geen DELETE-policy, ook niet voor `service_role`. Een badge die je kunt
   *    weghalen, is een gemiste week die je kunt tonen.
   */
  it(
    'laat niemand een badge weghalen of vervalsen',
    async () => {
      const admin = adminDb();
      const lees = () => admin.from('badges').select('badge').eq('user_id', alice.id);

      await magNietLanden(
        () => alice.db.from('badges').delete().eq('user_id', alice.id),
        lees,
      );
      await magNietLanden(
        () => alice.db.from('badges').update({ badge: 'streak_12' }).eq('user_id', alice.id),
        lees,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand zichzelf een badge geven die hij niet verdiend heeft',
    async () => {
      const { error } = await bob.db
        .from('badges')
        .insert({ user_id: bob.id, badge: 'streak_12' });

      expect(error, 'bob schreef zichzelf een badge toe').not.toBeNull();
      expect(await badgesVan(bob)).not.toContain('streak_12');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ `verdien_badges()` mag door een ingelogde gebruiker aangeroepen worden, en
   *    dat is veilig: hij schrijft alleen wat op grond van de data al verdiend ís.
   *    Deze test legt dat vast, want het is een grant die er raar uitziet.
   */
  it(
    'geeft via de RPC niets weg dat niet verdiend is',
    async () => {
      const { error } = await bob.db.rpc('verdien_badges', { p_user_id: bob.id });
      if (error) throw new Error(`verdien_badges: ${error.message}`);

      expect(await badgesVan(bob), 'de RPC deelde onverdiende badges uit').not.toContain(
        'first_goal',
      );
    },
    TEST_TIMEOUT,
  );
});
