import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * `te_beoordelen_voor()` — de enige autorisatiegrens die RLS niet bewaakt.
 *
 * ⚠️ **De meldingenjob roept hem aan als `service_role`, en dan kijkt RLS niet
 *    mee.** Dat is bewust: `openstaande_beoordelingen()` leunt op de RLS van de
 *    aanroeper en zou onder de service-rol élke openstaande voltooiing in het
 *    hele project teruggeven. De grens is daarom naar de functie zelf verhuisd —
 *    en daarmee ís die join de grens.
 *
 * ⚠️ **Er stond precies één test op, en die toetste iets anders.** *"is niet
 *    aanroepbaar door een gewone gebruiker"* bewaakt de grant, niet de inhoud. De
 *    groepsjoin met de hand losknippen liet de héle RLS-suite groen — 558 van
 *    558. Regel 18, vraag 3: kan deze test groen blijven terwijl de belofte
 *    breekt? Het antwoord was ja, en dit bestand is het antwoord daarop.
 *
 * ⚠️ **Wat er stukgaat als de join wegvalt, is domeinregel 7 en niet een
 *    lijstje.** Elke rij die deze functie teruggeeft, zegt *deze persoon heeft
 *    zijn week nog niet rond*. Wie hem voor een willekeurige gebruiker mag
 *    aanroepen, of wie hem als lid van een ándere groep antwoorden ziet geven,
 *    leest de gemiste week van een vreemde — en de meldingenjob zou er een
 *    bericht op sturen ook.
 *
 * ⚠️ **Alle toetsen hieronder lopen via `adminDb()`, dus als `service_role`.**
 *    Dat is met opzet en niet uit gemak: dat is precies de rol waaronder de job
 *    hem aanroept, en dus de enige stand waarin de functie de grens moet zijn.
 *    De grant-toets staat waar hij stond, in `notificaties.test.ts`.
 */

interface Fixture {
  /** Eigenaar van het doel. Wacht op een oordeel. */
  alice: TestUser;
  /** Lid van dezelfde groep. Hoort Alice' voltooiing te zien. */
  bob: TestUser;
  /** Tweede lid van dezelfde groep. Bewijst dat Bobs oordeel alleen Bob raakt. */
  eve: TestUser;
  /** Zit in een ándere groep. Hoort niets te zien. */
  carol: TestUser;
  /** Was lid van de groep en is vertrokken. Hoort niets meer te zien. */
  dave: TestUser;
  groepA: string;
  groepB: string;
  /** Groep met `approval_rule = 'quorum'` en twee vereiste bevestigingen. */
  groepQ: string;
  /** Alice' doel, gekoppeld aan groep A. */
  doelId: string;
  /** Alice' tweede doel, aan géén groep gekoppeld. */
  doelLos: string;
  /** De voltooiing op het gekoppelde doel. */
  voltooiing: string;
  /** De voltooiing op het losse doel. */
  voltooiingLos: string;
  /** Alice' doel in de drempelgroep. */
  doelQ: string;
  /** De voltooiing daarop. Vraagt twee bevestigingen. */
  voltooiingQ: string;
  /** Het weekdoel eronder — nodig om opnieuw in te dienen. */
  weekQ: string;
}

interface Rij {
  readonly completion_id: string;
  readonly owner_id: string;
  readonly owner_name: string | null;
}

describe.skipIf(!rlsTestsConfigured)('te_beoordelen_voor — de grens zit in de functie', () => {
  let f: Fixture;

  /** Wat de meldingenjob voor deze gebruiker te zien krijgt. */
  async function teBeoordelen(userId: string): Promise<readonly Rij[]> {
    const db = adminDb() as unknown as {
      rpc: (
        naam: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await db.rpc('te_beoordelen_voor', { p_user_id: userId });
    if (error) throw new Error(`te_beoordelen_voor: ${error.message}`);
    return (data ?? []) as readonly Rij[];
  }

  /** De voltooiings-id's die deze gebruiker te zien krijgt. */
  async function ids(userId: string): Promise<readonly string[]> {
    return (await teBeoordelen(userId)).map((r) => r.completion_id).sort();
  }

  async function maakGroep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    if (error) throw new Error(`groep ${naam}: ${error.message}`);

    const uit = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep ${naam} mislukte: ${JSON.stringify(data)}`);
    }
    return { id: uit.group.id, code: uit.group.invite_code };
  }

  async function laatMeedoen(gebruiker: TestUser, code: string): Promise<void> {
    const { data, error } = await gebruiker.db.rpc('join_group_with_code', { code });
    if (error) throw new Error(`meedoen: ${error.message}`);

    const uit = data as unknown as { ok?: boolean; reason?: string };
    if (uit.ok !== true) throw new Error(`meedoen mislukte: ${uit.reason ?? 'geen reden'}`);
  }

  beforeAll(async () => {
    const [alice, bob, eve, carol, dave] = await Promise.all([
      createTestUser('grens-alice'),
      createTestUser('grens-bob'),
      createTestUser('grens-eve'),
      createTestUser('grens-carol'),
      createTestUser('grens-dave'),
    ]);

    const groepA = await maakGroep(alice, 'Grens-A');
    const groepB = await maakGroep(carol, 'Grens-B');
    const groepQ = await maakGroep(alice, 'Grens-Q');

    await laatMeedoen(bob, groepA.code);
    await laatMeedoen(eve, groepA.code);
    await laatMeedoen(dave, groepA.code);
    await laatMeedoen(bob, groepQ.code);
    await laatMeedoen(eve, groepQ.code);

    // ⚠️ **De regel wordt bij het indienen bevroren** in
    //    `completion_approval_rules` (0111), dus hij moet staan vóór de
    //    voltooiing eronder. `approval_rule` is voor geen enkele client
    //    schrijfbaar — alleen `approval_quorum` is dat — dus dit gaat via de
    //    admin, net als het archiveren verderop.
    const drempel = await adminDb()
      .from('groups')
      .update({ approval_rule: 'quorum', approval_quorum: 2 })
      .eq('id', groepQ.id);
    if (drempel.error) throw new Error(`drempel zetten: ${drempel.error.message}`);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());

    /** Een doel met één weekdoel en één ingediende voltooiing. */
    async function maakKeten(
      titel: string,
      groepId: string | null,
    ): Promise<[string, string, string]> {
      const doel = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: cyclus.endDate })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);

      if (groepId !== null) {
        const koppel = await alice.db
          .from('goal_group_links')
          .insert({ goal_id: doel.data.id, group_id: groepId });
        if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);
      }

      const week = await alice.db
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `Week van ${titel}`,
          cycle_start_date: cyclus.startDate,
          cycle_index: 1,
        })
        .select('id')
        .single();
      if (week.error || week.data === null) throw new Error(`weekdoel ${titel}: ${week.error?.message}`);

      // De trigger `completions_mark_pending` (0023) zet het weekdoel hierdoor op
      // `pending`; dat is de status waar de functie op filtert.
      const voltooiing = await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: alice.id,
          achieved_level: 'ceiling',
          note: 'Grensproef',
          cycle_start_date: cyclus.startDate,
        })
        .select('id')
        .single();
      if (voltooiing.error || voltooiing.data === null) {
        throw new Error(`voltooiing ${titel}: ${voltooiing.error?.message}`);
      }

      return [doel.data.id, voltooiing.data.id, week.data.id];
    }

    const [doelId, voltooiing] = await maakKeten('Gekoppeld', groepA.id);
    const [doelLos, voltooiingLos] = await maakKeten('Los', null);
    const [doelQ, voltooiingQ, weekQ] = await maakKeten('Drempel', groepQ.id);

    f = {
      alice,
      bob,
      eve,
      carol,
      dave,
      groepA: groepA.id,
      groepB: groepB.id,
      groepQ: groepQ.id,
      doelId,
      doelLos,
      voltooiing,
      voltooiingLos,
      doelQ,
      voltooiingQ,
      weekQ,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    await admin.from('goals').delete().in('id', [f.doelId, f.doelLos, f.doelQ]);
    await admin.from('groups').delete().in('id', [f.groepA, f.groepB, f.groepQ]);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ **De bevestigende toets staat eerst, en dat is geen vormkwestie.** Elke
   *    weigering hieronder is gratis groen op een functie die niets teruggeeft —
   *    een tikfout in een kolomnaam levert precies hetzelfde beeld op. Zonder
   *    deze bewijst de rest van dit bestand niets.
   */
  it(
    'geeft een groepsgenoot de voltooiing die op zijn oordeel wacht',
    async () => {
      const rijen = await teBeoordelen(f.bob.id);
      const eigen = rijen.filter((r) => r.completion_id === f.voltooiing);

      expect(eigen).toHaveLength(1);
      expect(eigen[0]!.owner_id).toBe(f.alice.id);
      // De naam gaat mee naar de melding, dus hij hoort er te staan.
      expect(eigen[0]!.owner_name ?? '').not.toBe('');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dit is de toets waarvoor dit bestand bestaat.** Carol zit in een andere
   *    groep en heeft met Alice niets te maken. Knip de join
   *    `goal_group_links → group_members` los, en deze test is de enige in de
   *    hele suite die dat merkt.
   */
  it(
    'geeft een lid van een ándere groep niets',
    async () => {
      expect(await ids(f.carol.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Domeinregel 3: nooit jezelf. De functie is niet de plek waar dat wordt
   *    afgedwongen — dat doen de constraint en de policy — maar hij mag het ook
   *    niet vóórzeggen: een eigen week in je lijstje "wacht op jou" is een
   *    uitnodiging tot iets dat de database weigert.
   */
  it(
    'zet de eigenaar zijn eigen week niet op zijn lijstje',
    async () => {
      expect(await ids(f.alice.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Koppelen ís de toestemming.** Een doel dat aan geen enkele groep hangt,
   *    hoort in niemands lijstje te staan — ook niet in dat van een groepsgenoot
   *    die het ándere doel van dezelfde eigenaar wél mag zien. Zonder deze toets
   *    zou "Bob ziet iets" genoeg zijn, en dan zegt de eerste test alleen dat er
   *    rijen uitkomen.
   */
  it(
    'laat een doel zonder groepskoppeling buiten iedereens lijstje',
    async () => {
      for (const kijker of [f.bob, f.eve, f.carol, f.alice]) {
        expect(await ids(kijker.id), kijker.id).not.toContain(f.voltooiingLos);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De `not exists`-clausule geldt per beoordelaar, en dat is alleen te zien
   *    bij een drempel boven één.** De job stuurt per gebruiker een bericht; zou
   *    de functie de rij voor iederéén laten vallen zodra één lid heeft
   *    geoordeeld, dan valt bij `approval_rule = 'quorum'` de tweede beoordelaar
   *    stil en blijft de week hangen tot de rollover hem afkeurt.
   *
   * ⚠️ **Dit onderscheid is met deze test gevonden en niet vooraf bedacht.** De
   *    eerste versie deed hem op groep A, en die staat op de standaard
   *    `approval_rule = 'any'`: daar zet de eerste goedkeuring de wéék op
   *    `approved`, en dan valt de rij bij iedereen weg om een andere reden. De
   *    test was rood terwijl de functie klopte — en had ik hem "gerepareerd" door
   *    de assertie om te draaien, dan stond er een test die het tegenovergestelde
   *    bewaakte van wat de quorumregel nodig heeft.
   */
  it(
    'haalt de rij weg bij wie beoordeeld heeft, en laat hem staan bij de rest',
    async () => {
      expect(await ids(f.bob.id)).toContain(f.voltooiingQ);
      expect(await ids(f.eve.id)).toContain(f.voltooiingQ);

      const keur = await f.bob.db.from('completion_approvals').insert({
        completion_id: f.voltooiingQ,
        approver_id: f.bob.id,
        subject_id: f.alice.id,
        group_id: f.groepQ,
        status: 'approved',
      });
      expect(keur.error, JSON.stringify(keur.error)).toBeNull();

      expect(await ids(f.bob.id)).not.toContain(f.voltooiingQ);
      expect(await ids(f.eve.id)).toContain(f.voltooiingQ);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Een vervangen voltooiing hoort bij niemand meer op het lijstje.**
   *    `dien_opnieuw_in()` zet `superseded_by` op de oude rij en maakt een nieuwe
   *    (0022/0023). Zonder `c.superseded_by is null` staan ze er allebei, en dan
   *    krijgt de beoordelaar twee meldingen over dezelfde week en kan hij de
   *    verkeerde bevestigen — de versie die de eigenaar juist introk.
   *
   * ⚠️ Deze clausule was als enige van de zeven ongedekt: hem met de hand
   *    weghalen liet alle negen andere tests groen. Gemeten, niet vermoed.
   */
  it(
    'ruilt een opnieuw ingediende voltooiing om in plaats van er twee te tonen',
    async () => {
      const voor = await ids(f.eve.id);
      expect(voor).toContain(f.voltooiingQ);

      const opnieuw = await f.alice.db.rpc('dien_opnieuw_in', {
        p_weekly_goal_id: f.weekQ,
        p_achieved_level: 'floor',
        p_note: 'Toch de vloer',
      });
      expect(opnieuw.error, JSON.stringify(opnieuw.error)).toBeNull();

      const na = await ids(f.eve.id);
      expect(na, JSON.stringify(na)).not.toContain(f.voltooiingQ);
      // ⚠️ Omrúilen, niet verdwijnen én niet verdubbelen: even lang als eerst,
      //    met één nieuwe id op de plek van de oude. Zonder deze twee asserties
      //    is de regel hierboven ook waar als er niets meer overblijft.
      expect(na).toHaveLength(voor.length);
      const nieuweRijen = na.filter((id) => !voor.includes(id));
      expect(nieuweRijen).toHaveLength(1);

      // De vervanger draagt de rest van dit bestand; leg hem vast.
      f.voltooiingQ = nieuweRijen[0]!;
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De vertrektest hieronder dekt `m.status = 'active'` niet, en dat was
   *    niet te zien.** `verlaat_groep()` (0102) **verwijdert** de rij in plaats
   *    van hem op `inactive` te zetten, dus de clausule komt er niet aan te pas.
   *    Gemeten door hem met de hand weg te halen: alle acht tests bleven groen,
   *    ook die over het vertrek. Twee correcte tests naast elkaar, en de clausule
   *    ertussenin van niemand.
   *
   * ⚠️ **De toestand is wél bereikbaar, dus dit is geen hypothetische toets.**
   *    `authenticated` heeft een kolomgrant op `group_members.status`, de policy
   *    `group_members_update` laat `is_group_admin(group_id)` door, en
   *    `guard_group_member_update()` (0029) pint voor een beheerder alleen
   *    `group_id` en `user_id` vast. Een beheerder kan een lid dus vandaag op
   *    `paused` zetten; deze test neemt dezelfde weg.
   */
  it(
    'zwijgt tegen een lid dat niet actief is',
    async () => {
      const admin = adminDb();
      expect(await ids(f.dave.id)).toContain(f.voltooiing);

      const pauze = await admin
        .from('group_members')
        .update({ status: 'paused' })
        .eq('group_id', f.groepA)
        .eq('user_id', f.dave.id);
      expect(pauze.error, JSON.stringify(pauze.error)).toBeNull();

      expect(await ids(f.dave.id)).toEqual([]);

      // En terug, want de test hieronder rekent erop dat Dave hem nog ziet.
      const terug = await admin
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', f.groepA)
        .eq('user_id', f.dave.id);
      expect(terug.error, JSON.stringify(terug.error)).toBeNull();
      expect(await ids(f.dave.id)).toContain(f.voltooiing);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Vertrekken is een handeling (0102) en geen zichtbaarheidsinstelling. Wie
   *    weg is, hoort geen meldingen meer te krijgen over de weken van de mensen
   *    die hij achterlaat — dat is dezelfde belofte als bij het ontkoppelen.
   */
  it(
    'geeft een vertrokken lid niets meer',
    async () => {
      // Vóór het vertrek zag Dave hem wél; anders bewijst de regel eronder niets.
      expect(await ids(f.dave.id)).toContain(f.voltooiing);

      // `verlaat_groep()` uit 0102 — vertrekken is daar een handeling met een
      // bevestiging, geen `delete` op `group_members`.
      const weg = await f.dave.db.rpc('verlaat_groep', {
        p_group_id: f.groepA,
        p_bevestigd: true,
      });
      expect(weg.error, JSON.stringify(weg.error)).toBeNull();
      expect((weg.data as unknown as { ok?: boolean }).ok, JSON.stringify(weg.data)).toBe(true);

      expect(await ids(f.dave.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De tegenhanger, en de reden dat de test hierboven een eigen groep nodig
   *    had. Bij `approval_rule = 'any'` — de standaard — sluit één bevestiging de
   *    week, en dan verdwijnt de rij bij iedereen. Niet omdat de beoordelaar al
   *    geoordeeld heeft, maar omdat `w.status` niet meer `pending` is. Twee
   *    verschillende clausules met hetzelfde zichtbare gevolg; wie ze door elkaar
   *    haalt, schrijft de verkeerde test.
   */
  it(
    'sluit bij de standaardregel de week voor iedereen zodra één lid bevestigt',
    async () => {
      expect(await ids(f.eve.id)).toContain(f.voltooiing);

      const keur = await f.bob.db.from('completion_approvals').insert({
        completion_id: f.voltooiing,
        approver_id: f.bob.id,
        subject_id: f.alice.id,
        group_id: f.groepA,
        status: 'approved',
      });
      expect(keur.error, JSON.stringify(keur.error)).toBeNull();

      expect(await ids(f.eve.id)).not.toContain(f.voltooiing);
      expect(await ids(f.bob.id)).not.toContain(f.voltooiing);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Een gearchiveerde groep doet niets meer, en dat hoort ook voor de
   *    meldingenjob te gelden. Deze staat als laatste, want hij sluit de laatste
   *    groep waar nog iets open stond — de drempelgroep, waar Eve haar tweede
   *    bevestiging nog moest geven.
   */
  it(
    'zwijgt zodra de groep gearchiveerd is',
    async () => {
      expect(await ids(f.eve.id)).toContain(f.voltooiingQ);

      const { error } = await adminDb()
        .from('groups')
        .update({ status: 'archived' })
        .eq('id', f.groepQ);
      expect(error, JSON.stringify(error)).toBeNull();

      expect(await ids(f.eve.id)).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
