import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Hetzelfde doel in meer dan één groep — QS8-56 (PRD 5.5).
 *
 * ⚠️ **Het datamodel kon dit vanaf dag één; de vraag die QS8-56 opent is een
 *    andere.** `goal_group_links` heeft sinds migratie 0001 de sleutel
 *    `(goal_id, group_id)`, en EPIC 13 toetst al wat er gebeurt als een doel in
 *    een open én een beschermde groep staat. Wat er tot nu toe níét stond, is de
 *    vraag die pas ontstaat zodra de app dit ook aanbiedt:
 *
 *      **Leert groep A iets over groep B doordat jouw doel in allebei staat?**
 *
 *    Dat is geen vraag over één policy maar over de knoop tussen twee. Elke
 *    policy hieronder was al goed; de combinatie was van niemand. Precies de vorm
 *    uit onwrikbare regel 18.
 *
 * ⚠️ **De tegentests staan er bewust naast.** "Bob ziet de koppeling met groep B
 *    niet" is gratis groen als Bob helemaal niets kan lezen — een tikfout in een
 *    kolomnaam levert hetzelfde beeld. Bij elke ontkennende toets staat daarom de
 *    bevestigende ernaast.
 */

const SETUP_TIMEOUT = 120_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  code: string;
}

interface Fixture {
  /** Eigenaar van het doel, lid van A én B. */
  alice: TestUser;
  /** Alleen lid van groep A. */
  bob: TestUser;
  /** Alleen lid van groep B. */
  carol: TestUser;
  /** Nergens lid met Alice samen; maakt de groep waar Alice buiten staat. */
  dave: TestUser;
  groepA: Groep;
  groepB: Groep;
  /** Een groep waar Alice geen lid van is. */
  groepVreemd: Groep;
  /** Alice' doel, gekoppeld aan A én B. */
  doelId: string;
  /** Alice' tweede doel, alleen aan A. De controlegroep. */
  doelAlleenA: string;
}

describe.skipIf(!rlsTestsConfigured)('QS8-56 — één doel in meer dan één groep', () => {
  let f: Fixture;

  async function maakGroep(eigenaar: TestUser, naam: string): Promise<Groep> {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);

    const gelezen = data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (gelezen.ok !== true || !gelezen.group) {
      throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
    }

    return { id: gelezen.group.id, code: gelezen.group.invite_code };
  }

  async function laatMeedoen(gebruiker: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await gebruiker.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);

    const gelezen = data as unknown as { ok?: boolean; reason?: string };
    if (gelezen.ok !== true) throw new Error(`meedoen mislukte: ${gelezen.reason ?? 'geen reden'}`);
  }

  async function koppel(doelId: string, groep: Groep): Promise<void> {
    const { error } = await f.alice.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: groep.id });
    if (error) throw new Error(`koppelen: ${error.message}`);
  }

  /** De groeps-id's die déze kijker van dít doel te zien krijgt. */
  async function zichtbareGroepen(kijker: TestUser, doelId: string): Promise<readonly string[]> {
    const { data, error } = await kijker.db
      .from('goal_group_links')
      .select('group_id')
      .eq('goal_id', doelId);

    if (error) throw new Error(`koppelingen lezen: ${error.message}`);
    return (data ?? []).map((rij) => rij.group_id).sort();
  }

  beforeAll(async () => {
    const alice = await createTestUser('deling-alice');
    const bob = await createTestUser('deling-bob');
    const carol = await createTestUser('deling-carol');
    const dave = await createTestUser('deling-dave');

    f = {
      alice,
      bob,
      carol,
      dave,
      groepA: { id: '', code: '' },
      groepB: { id: '', code: '' },
      groepVreemd: { id: '', code: '' },
      doelId: '',
      doelAlleenA: '',
    };

    f.groepA = await maakGroep(alice, 'Deling-A');
    f.groepB = await maakGroep(alice, 'Deling-B');
    f.groepVreemd = await maakGroep(dave, 'Deling-vreemd');

    await laatMeedoen(bob, f.groepA);
    await laatMeedoen(carol, f.groepB);

    for (const [veld, titel] of [
      ['doelId', 'Twee groepen'],
      ['doelAlleenA', 'Eén groep'],
    ] as const) {
      const { data, error } = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: '2027-06-30' })
        .select('id')
        .single();
      if (error || data === null) throw new Error(`doel ${titel}: ${error?.message}`);
      f[veld] = data.id;
    }

    await koppel(f.doelId, f.groepA);
    await koppel(f.doelId, f.groepB);
    await koppel(f.doelAlleenA, f.groepA);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goals').delete().in('id', [f.doelId, f.doelAlleenA]);
    await admin.from('groups').delete().in('id', [f.groepA.id, f.groepB.id, f.groepVreemd.id]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'laat de eigenaar allebei de koppelingen zien',
    async () => {
      expect(await zichtbareGroepen(f.alice, f.doelId)).toEqual(
        [f.groepA.id, f.groepB.id].sort(),
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dit is de toets waarvoor dit bestand bestaat.** `goal_group_links_select`
   *    eist `is_group_member(group_id)`, dus de rij van groep B hoort onzichtbaar
   *    te zijn voor iemand die alleen in A zit — óók al gaat hij over een doel dat
   *    hij wél mag zien. Zonder dat slot zou het aanbieden van deze feature
   *    betekenen dat elke groep de ándere groepen van elk lid kan uitlezen, met
   *    één verzoek en buiten de UI om.
   */
  it(
    'vertelt een lid van groep A niet dat het doel ook in groep B staat',
    async () => {
      expect(await zichtbareGroepen(f.bob, f.doelId)).toEqual([f.groepA.id]);
      expect(await zichtbareGroepen(f.carol, f.doelId)).toEqual([f.groepB.id]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegentest bij de vorige. Zonder deze is "Bob ziet groep B niet" ook waar
   *    als Bob helemaal niets ziet, en dan bewijst de toets hierboven een leeg
   *    resultaat in plaats van een policy.
   */
  it(
    'laat datzelfde lid de koppeling met zijn eigen groep wél zien',
    async () => {
      expect(await zichtbareGroepen(f.bob, f.doelAlleenA)).toEqual([f.groepA.id]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De belofte van het scherm is "elke groep is een aparte toestemming". Dat is
   *    geen UI-tekst maar een eigenschap van de tabel: één rij per groep, en
   *    `goal_group_links_delete` kijkt naar één rij.
   */
  it(
    'laat de andere groep staan als je het doel van één groep ontkoppelt',
    async () => {
      const admin = adminDb();

      const weg = await f.alice.db
        .from('goal_group_links')
        .delete()
        .eq('goal_id', f.doelId)
        .eq('group_id', f.groepA.id);
      if (weg.error) throw new Error(`ontkoppelen: ${weg.error.message}`);

      expect(await zichtbareGroepen(f.alice, f.doelId)).toEqual([f.groepB.id]);

      // En terugzetten, want de tests hieronder rekenen op twee groepen.
      await koppel(f.doelId, f.groepA);
      const { count } = await admin
        .from('goal_group_links')
        .select('goal_id', { count: 'exact', head: true })
        .eq('goal_id', f.doelId);
      expect(count).toBe(2);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De naad tussen `koppelDoelAanGroep()` en de policies, en die was stuk.**
   *    De datalaag doet een `upsert`, en PostgREST vertaalt dat naar
   *    `on conflict do update`. `goal_group_links` heeft bewust geen
   *    UPDATE-policy — aan een koppeling valt niets bij te werken — dus liep een
   *    tweede koppeling van hetzelfde paar op `new row violates row-level
   *    security policy`, en zag de gebruiker "koppelen mislukt" terwijl de
   *    koppeling er gewoon stond.
   *
   * ⚠️ **Geen enkele test kón dit zien**, en dat is regel 18 vraag 5: elk
   *    onderdeel was af. De policies zijn juist, de datalaag is juist, en de
   *    tests hierboven koppelen altijd een paar dat er nog niet is. De fout zit
   *    in de vertaling ertussen, en die heeft geen eigen bestand.
   *
   * ⚠️ **Dit toetst de belofte en niet de vorm.** "Nog een keer koppelen doet
   *    geen kwaad" blijft kloppen als iemand `upsert` door `insert` vervangt, of
   *    de vlag anders noemt. Vandaar `ignoreDuplicates` hier ook echt aanroepen
   *    en niet de SQL naspelen.
   */
  it(
    'laat hetzelfde doel twee keer aan dezelfde groep koppelen zonder fout',
    async () => {
      const admin = adminDb();
      const voor = await admin
        .from('goal_group_links')
        .select('goal_id', { count: 'exact', head: true })
        .eq('goal_id', f.doelAlleenA);

      // Precies wat `koppelDoelAanGroep()` doet — inclusief de vlag, want díé is
      // het verschil tussen `do nothing` en `do update`.
      const { error } = await f.alice.db
        .from('goal_group_links')
        .upsert(
          { goal_id: f.doelAlleenA, group_id: f.groepA.id },
          { onConflict: 'goal_id,group_id', ignoreDuplicates: true },
        );

      expect(error, JSON.stringify(error)).toBeNull();

      // En er staat er niet ineens een tweede: `do nothing` hoort niets te doen.
      const na = await admin
        .from('goal_group_links')
        .select('goal_id', { count: 'exact', head: true })
        .eq('goal_id', f.doelAlleenA);
      expect(na.count).toBe(voor.count);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een groepsgenoot het doel van een ander niet aan zijn groep koppelen',
    async () => {
      const admin = adminDb();
      const lees = () =>
        admin.from('goal_group_links').select('group_id').eq('goal_id', f.doelAlleenA);

      await magNietLanden(
        () => f.bob.db.from('goal_group_links').insert({
          goal_id: f.doelAlleenA,
          group_id: f.groepA.id,
        }),
        lees,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een groepsgenoot een koppeling niet weghalen',
    async () => {
      const admin = adminDb();

      await magNietLanden(
        () =>
          f.bob.db
            .from('goal_group_links')
            .delete()
            .eq('goal_id', f.doelId)
            .eq('group_id', f.groepA.id),
        () => admin.from('goal_group_links').select('group_id').eq('goal_id', f.doelId),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de eigenaar niet koppelen aan een groep waar hij niet in zit',
    async () => {
      const { error } = await f.alice.db
        .from('goal_group_links')
        .insert({ goal_id: f.doelId, group_id: f.groepVreemd.id });

      expect(error?.code, 'koppelen aan een vreemde groep werd niet geweigerd').toBe('42501');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De tweede naad, en hij bestaat pas sinds deze feature.** Een verzoek om
   *    je streefdatum te verschuiven gaat naar één groep (A7), en de uitleg die je
   *    erbij schrijft is het enige stuk vrije tekst in de app waarin een gebruiker
   *    vertelt dat iets niet lukt. Met één groep was "de groep" ondubbelzinnig;
   *    met twee is het een keuze, en dan is de vraag of de níét-gekozen groep
   *    meeleest.
   *
   *    Dat mag niet: `deadline_requests_select` is `requester_id = auth.uid() or
   *    is_group_member(group_id)`. Zou hij op `shares_group_with_goal()` staan —
   *    en dat is de vorm die `goal_events_select` wél heeft — dan las groep A een
   *    bekentenis die aan groep B gericht was. Dat is domeinregel 7: tegenslag
   *    bereikt de groep alleen langs de gebruiker zelf, en hij wees hier een
   *    ándere groep aan.
   */
  it(
    'houdt een deadlineverzoek binnen de groep waar het aan gericht is',
    async () => {
      const { data, error } = await f.alice.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: f.doelId,
        p_group_id: f.groepB.id,
        p_new_date: '2027-09-30',
        p_reason: 'Het project op mijn werk is uitgelopen en dat eet mijn avonden op.',
      });
      if (error) throw new Error(`verzoek (HTTP): ${error.message}`);

      const uitkomst = data as unknown as { ok?: boolean; reason?: string };
      expect(uitkomst.ok, `verzoek mislukte: ${uitkomst.reason ?? 'geen reden'}`).toBe(true);

      const bijBob = await f.bob.db
        .from('deadline_requests')
        .select('id, reason')
        .eq('goal_id', f.doelId);
      if (bijBob.error) throw new Error(`Bob leest verzoeken: ${bijBob.error.message}`);

      const bijCarol = await f.carol.db
        .from('deadline_requests')
        .select('id, reason')
        .eq('goal_id', f.doelId);
      if (bijCarol.error) throw new Error(`Carol leest verzoeken: ${bijCarol.error.message}`);

      // ⚠️ Carol eerst. Ziet zíj het verzoek niet, dan bewijst Bobs lege lijst
      //    niets — dan is er gewoon geen verzoek.
      expect(bijCarol.data?.length, 'de gekozen groep leest het verzoek niet').toBe(1);
      expect(bijCarol.data?.[0]?.reason).toContain('uitgelopen');
      expect(bijBob.data ?? [], 'de niet-gekozen groep leest mee').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ En dezelfde grens vanaf de schrijfkant. `beslis_deadline_verzoek()` toetst
   *    lidmaatschap van `r.group_id` — de groep waar het verzoek aan gericht is,
   *    niet "een groep die dit doel deelt". Zonder die toets kon een buddy uit
   *    groep A akkoord geven op iets wat aan groep B gevraagd is, en dan is de
   *    keuze op het scherm een suggestie.
   */
  it(
    'laat een lid van de andere groep er niet over beslissen',
    async () => {
      const admin = adminDb();
      const { data: verzoeken } = await admin
        .from('deadline_requests')
        .select('id')
        .eq('goal_id', f.doelId)
        .eq('status', 'open');

      const verzoekId = verzoeken?.[0]?.id;
      expect(verzoekId, 'geen open verzoek om over te beslissen').toBeTypeOf('string');

      const { data, error } = await f.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId ?? '',
        p_akkoord: true,
      });
      if (error) throw new Error(`beslissen (HTTP): ${error.message}`);

      expect(data as unknown as Record<string, unknown>).toMatchObject({
        ok: false,
        reason: 'not_member',
      });

      // De tegentest: Carol zit er wél in en mag het wél.
      const carol = await f.carol.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId ?? '',
        p_akkoord: false,
      });
      if (carol.error) throw new Error(`Carol beslist (HTTP): ${carol.error.message}`);
      expect(carol.data as unknown as Record<string, unknown>).toMatchObject({ ok: true });
    },
    TEST_TIMEOUT,
  );
});
