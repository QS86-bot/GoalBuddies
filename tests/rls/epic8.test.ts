/**
 * EPIC 8 — De Ketting, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ De vraag die deze suite stelt is niet "werkt de gelukkige route" maar
 *    "kun je een schakel krijgen die je niet verdiend hebt". `chain_links` is de
 *    gedeelde teller van de groep; een verzonnen schakel maakt daar meer kapot
 *    dan een ontbrekende.
 *
 * ⚠️ **Eén schrijver sinds 31-08-2026 (migratie 0133, QS8-144).** Er waren er
 *    twee: de weekafsluiting via een trigger, en `ketting_schakel()` waarmee je
 *    hem zelf claimde. Die tweede had nul aanroepers en is weg.
 *
 * ⚠️ **Wat dat met deze suite deed, en waarom hier geen test zomaar geschrapt
 *    is.** Vier tests toetsten de argumentvalidatie van een functie die niet
 *    meer bestaat; die zijn weg. Maar drie ervan bewaakten de belofte in de kop
 *    hierboven — kun je een schakel krijgen die je niet verdiend hebt — en die
 *    belofte hangt niet aan een functie. Ze zijn omgeschreven naar de route die
 *    overblijft, niet verwijderd. Dat onderscheid is CLAUDE.md regel 18: een
 *    test die met zijn onderwerp meeverdwijnt, neemt een belofte mee die niemand
 *    mist tot ze breekt.
 *
 * ⚠️ Alle accounts worden één keer in `beforeAll` gemaakt. Supabase weigert na
 *    ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached"; zie je dat in de opbouw, wacht dan een minuut in plaats van in de
 *    policies te zoeken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `periods.ts`, niet via `modules/buddies/index.ts`: die
//    laatste trekt de Supabase-client en AsyncStorage mee, en daarmee React
//    Native, in een test die in Node draait.
import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import {
  addDays,
  localDateIn,
  now,
  userCycle,
  type IsoDate,
  type TimeZone,
} from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Oprichter, heeft een goedgekeurd weekdoel gekoppeld aan de groep. */
  alice: TestUser;
  /** Lid, heeft geen goedgekeurd weekdoel. */
  bob: TestUser;
  /** Lid van geen enkele groep van alice en bob. */
  carol: TestUser;
  groupId: string;
  /** De tijdzone van de groep — de klok waarop `groepsdatum()` het venster meet. */
  tz: TimeZone;
  /** De lopende groepsperiode. */
  periodStart: IsoDate;
  /** De persoonlijke cyclus waarin het goedgekeurde weekdoel staat. */
  cycleStart: IsoDate;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string; created?: boolean } {
  return (data ?? {}) as { ok?: boolean; reason?: string; created?: boolean };
}

function stand(data: unknown): { schakels?: number; in_aanmerking?: number; voltallig?: boolean } {
  return (data ?? {}) as { schakels?: number; in_aanmerking?: number; voltallig?: boolean };
}

describe.skipIf(!rlsTestsConfigured)('EPIC 8 — De Ketting', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('ketting-alice');
    const bob = await createTestUser('ketting-bob');
    const carol = await createTestUser('ketting-carol');

    const groep = await alice.db.rpc('create_group', { group_name: 'Ketting-test' });
    if (groep.error) throw new Error(`groep aanmaken (HTTP): ${groep.error.message}`);
    const groepData = uitkomst(groep.data) as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    const rij = await admin.from('groups').select('huddle_day, tz').eq('id', groupId).single();
    if (rij.error || rij.data === null) throw new Error(`groep uitlezen: ${rij.error?.message}`);

    const periode = groepsperiodeVan(rij.data, now());
    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    // Doel van alice, gekoppeld aan de groep, met één goedgekeurd weekdoel.
    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'KETTINGDOEL', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppeling = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId })
      .select('goal_id')
      .single();
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

    const weekdoel = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'KETTINGWEEKDOEL',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single();
    if (weekdoel.error || weekdoel.data === null) throw new Error(`weekdoel: ${weekdoel.error?.message}`);

    // ⚠️ Via de admin-client. `weekly_goals.status` staat sinds 0023 op slot voor
    //    de eigenaar zelf — precies de bedoeling, en hier alleen een omweg in de
    //    opbouw en niet in wat getest wordt.
    const goedkeuren = await admin
      .from('weekly_goals')
      .update({ status: 'approved' })
      .eq('id', weekdoel.data.id);
    if (goedkeuren.error) throw new Error(`goedkeuren: ${goedkeuren.error.message}`);

    f = {
      alice,
      bob,
      carol,
      groupId,
      tz: rij.data.tz as TimeZone,
      periodStart: periode.startDate,
      cycleStart: cycle.startDate,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('een schakel verdienen', () => {
    it(
      'schrijft een schakel bij een weekafsluiting, zonder dat de client iets doet',
      async () => {
        const review = await f.bob.db
          .from('week_reviews')
          .insert({
            group_id: f.groupId,
            user_id: f.bob.id,
            group_period_start: f.periodStart,
            did_text: 'iets gedaan',
          })
          .select('id')
          .single();
        expect(review.error).toBeNull();

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id)
          .eq('group_period_start', f.periodStart);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'levert bij twee weekafsluitingen in dezelfde periode één schakel op',
      async () => {
        // ⚠️ Deze test heette tot 31-08 'levert bij twee routes samen één
        //    schakel op' en zette de trigger naast `ketting_schakel()`. Die
        //    tweede route bestaat niet meer, maar de belofte wél: de tabel is de
        //    gedeelde teller van de groep, en twee keer afsluiten in dezelfde
        //    periode mag nooit twee schakels opleveren. `chain_links_one_per_period`
        //    dwingt dat af; hier staat dat het ook echt gebeurt.
        await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: f.periodStart,
          did_text: 'eerste afsluiting',
        });

        await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: f.periodStart,
          did_text: 'en nog een keer',
        });

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.alice.id)
          .eq('group_period_start', f.periodStart);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );
  });

  describe('een schakel die je niet verdiend hebt', () => {
    it(
      'weigert een buitenstaander',
      async () => {
        // ⚠️ Deze toets zat tot 31-08 in `ketting_schakel()` als `not_a_member`.
        //    Met die functie weg staat hij niet in de code maar in de policy:
        //    `week_reviews_write` eist `user_id = auth.uid() AND
        //    is_group_member(group_id)`. Verhuisd van functie naar policy is nog
        //    steeds bewaakt — maar alleen als iemand dat toetst, en dat is dit.
        const { error } = await f.carol.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.carol.id,
          group_period_start: f.periodStart,
          did_text: 'ik hoor hier niet',
        });

        expect(error).not.toBeNull();

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.carol.id);

        expect(schakels.data).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een periode in de toekomst',
      async () => {
        // ⚠️ Zelfde venster als `ketting_schakel()` had (+1 / −35), nu getoetst
        //    op de plek waar hij sinds 0133 nog staat: `bewaak_week_review_periode`.
        //    Een schakel dertig dagen vooruit zou een sluitende ketting opleveren
        //    voor weken die nog niet bestaan.
        const straks = addDays(f.periodStart, 30);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: straks,
          did_text: 'alvast',
        });

        expect(error).not.toBeNull();

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('group_period_start', straks);

        expect(schakels.data).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    // ⚠️ 'weigert een periode ver in het verleden' stond hier tot 31-08 en riep
    //    `ketting_schakel()` aan met −200 dagen. Hij is niet omgeschreven maar
    //    verwijderd, omdat 'laat geen weekafsluiting in een willekeurige week
    //    toe' verderop exact dezelfde grendel al toetst op de overgebleven route,
    //    met −364 dagen. Twee tests op één grendel maakt de suite trager zonder
    //    hem strenger te maken — maar dít commentaar hoort er wél te staan, want
    //    zonder deze regel leest de verwijdering als een verloren belofte.

    it(
      'laat niemand rechtstreeks een schakel in de tabel schrijven',
      async () => {
        // ⚠️ `chain_links` heeft alleen een SELECT-policy (0003). Zonder
        //    INSERT-policy weigert RLS, en dat is precies waarom beide
        //    schrijvers SECURITY DEFINER zijn. Slaagt deze insert, dan is de
        //    hele controle in ketting_schakel() een formaliteit geworden.
        const { error } = await f.alice.db.from('chain_links').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: addDays(f.periodStart, -7),
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });


  /**
   * De gaten die de reviewketen op 19-08-2026 vond en die 0037 dicht.
   *
   * ⚠️ Deze tests bestaan omdat de eerste suite ernaast mikte. Die toetste de
   *    buitenkant van het venster (30 dagen vooruit, 200 dagen terug) en niet de
   *    binnenkant — en de binnenkant was waar alles zat.
   */
  describe('de gaten uit de reviewronde', () => {
    it(
      'weigert een datum binnen het venster die geen periodestart is',
      async () => {
        // ⚠️ **Dit is de erfgenaam van twee geschrapte tests, en de belangrijkste
        //    van dit blok.** Er stonden hier tot 31-08 twee tests op
        //    `ketting_schakel()`: 'geen tweede schakel voor dezelfde cyclus' en
        //    'weigert een periode die niet bij de cyclus hoort'. Ze bewaakten de
        //    exploit van vóór 0037: één goedgekeurd weekdoel leverde tot 36
        //    schakels op, omdat de dedup op de periode zat én `p_period_start`
        //    niet op een periodegrens hoefde te liggen.
        //
        // ⚠️ Met `ketting_schakel()` weg vervalt het cyclusbegrip in deze tabel
        //    volledig: een schakel is voortaan strikt één per groepsperiode. De
        //    exploit kan dus niet meer via de cyclus — maar wél via een
        //    zelfgekozen datum, en dáár blijft hij denkbaar. `bewaak_week_review_periode`
        //    houdt dat tegen doordat hij een échte periodestart eist, een toets
        //    die `ketting_schakel()` niet eens had.
        //
        // ⚠️ De datum ligt bewust bínnen het venster (één dag terug). De test
        //    verderop die −364 dagen probeert, raakt de vensterrand en zou hier
        //    slagen op de verkeerde grendel. De binnenkant was waar alles zat.
        const geenPeriodestart = addDays(f.periodStart, -1);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: geenPeriodestart,
          did_text: 'net naast de grens',
        });

        expect(error).not.toBeNull();

        const schakels = await adminDb()
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('group_period_start', geenPeriodestart);

        expect(schakels.data).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat geen weekafsluiting in een willekeurige week toe',
      async () => {
        // ⚠️ Dit was de ernstigste vondst: `week_reviews_write` is `for all`, dus
        //    invoegen met een zelfgekozen datum, de schakel incasseren, je eigen
        //    rij verwijderen en herhalen gaf een sluitende ketting van twee jaar.
        //    Sinds 0037 weigert een trigger de rij zelf.
        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: addDays(f.periodStart, -364),
          did_text: 'verzonnen week',
        });

        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een groepsgenoot geen oude schakels lezen',
      async () => {
        // ⚠️ Hét lek. `chain_links_select` gaf elk lid élke rij, met naam en
        //    periode. Voor een afgesloten periode is een ontbrekende rij geen
        //    "nog niet" maar het bewijs van een gemiste week — precies wat
        //    domeinregel 7 verbiedt. Sinds 0037 zie je van een ander alleen de
        //    lopende periode; je eigen geschiedenis blijft van jou.
        const oud = addDays(f.periodStart, -60);
        await adminDb().from('chain_links').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: oud,
        });

        const doorBob = await f.bob.db
          .from('chain_links')
          .select('user_id, group_period_start')
          .eq('group_id', f.groupId)
          .eq('group_period_start', oud);
        expect(doorBob.data).toHaveLength(0);

        const doorAliceZelf = await f.alice.db
          .from('chain_links')
          .select('user_id')
          .eq('group_id', f.groupId)
          .eq('group_period_start', oud);
        expect(doorAliceZelf.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de rand van het venster dicht: zeven dagen oud is de vórige periode',
      async () => {
        // ⚠️ **Dit is de rand die tot 0116 onbeproefd was.** De test hierboven
        //    legt een schakel zestig dagen terug — ver genoeg om buiten élk
        //    redelijk venster te vallen, dus hij bleef groen terwijl het venster
        //    er één dag naast stond. Een huddleperiode duurt zeven dagen, dus
        //    een lópende periode is hoogstens zes dagen oud; zeven dagen oud is
        //    per definitie de afgesloten periode, en daar betekent een
        //    ontbrekende schakel "gemist".
        //
        // ⚠️ De data zijn relatief aan vandáág en niet aan `f.periodStart`: de
        //    policy vergelijkt met de dag van nu, en dat is de grens die hier
        //    getoetst wordt.
        //
        // ⚠️ **"Vandaag" is vandaag op de klok van de gróep** — de policy luidt
        //    `group_period_start >= groepsdatum(group_id) - 6`, en
        //    `groepsdatum()` rekent in `groups.tz`. Hier stond tot QS8-267 de
        //    UTC-datum, met een commentaarregel die beweerde dat de policy
        //    `current_date` gebruikte. Dat wás ooit zo; een latere migratie
        //    verplaatste de grens naar de groepsklok en deze test bleef groen
        //    omdat de twee klokken tweeëntwintig uur per dag dezelfde dag
        //    aanwijzen. De overige twee uur — de groep staat standaard in
        //    Europe/Amsterdam — was hij rood zonder dat er iets kapot was.
        //
        // ⚠️⚠️ **En de telling filtert op Alice, want `chain_links` is de gedeelde
        //    teller van de groep** — QS8-276. Zonder dat filter telde deze test de
        //    schakels mee die twee éérdere tests in dit bestand op `f.periodStart`
        //    neerleggen, en dat gaat één dag per week mis: `huddle_day` staat op
        //    zondag, dus op zaterdag ís `f.periodStart` gelijk aan `vandaag - 6`.
        //    📏 Gemeten op zaterdag 05-09-2026: `expected [ …(2) ] to have a
        //    length of 1`. Zes van de zeven dagen liggen die data uit elkaar en
        //    was hij groen — de belofte brak daar niet, de telling wel.
        //
        // ⚠️ **En de insert wordt op diezelfde dag geweigerd** door
        //    `chain_links_one_per_period`, want Alice heeft dan al een schakel op
        //    die datum. `upsert` met `ignoreDuplicates` maakt de opstelling
        //    idempotent; de foutcontrole eronder blijft daardoor betekenisvol in
        //    plaats van een botsing weg te slikken die er hoort te zijn.
        const vandaag = localDateIn(f.tz, now());
        const gesloten = addDays(vandaag, -7);
        const lopend = addDays(vandaag, -6);

        const neergelegd = await adminDb()
          .from('chain_links')
          .upsert(
            [
              { group_id: f.groupId, user_id: f.alice.id, group_period_start: gesloten },
              { group_id: f.groupId, user_id: f.alice.id, group_period_start: lopend },
            ],
            { onConflict: 'group_id,user_id,group_period_start', ignoreDuplicates: true },
          );
        expect(neergelegd.error, 'de opstelling landde niet').toBeNull();

        const zevenDagen = await f.bob.db
          .from('chain_links')
          .select('user_id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.alice.id)
          .eq('group_period_start', gesloten);
        expect(zevenDagen.data).toHaveLength(0);

        // De tegenhanger, en zonder haar bewijst de test hierboven niets: op zes
        // dagen mág de schakel wél zichtbaar zijn, anders is De Ketting stuk.
        const zesDagen = await f.bob.db
          .from('chain_links')
          .select('user_id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.alice.id)
          .eq('group_period_start', lopend);
        expect(zesDagen.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft via group_overview geen aanwezigheid van een afgesloten periode',
      async () => {
        // Hetzelfde raster, nettere verpakking: `p_period_start` was vrij te
        // kiezen, dus een lus over vijftig weken gaf het volledige overzicht.
        const { data, error } = await f.bob.db.rpc('group_overview', {
          p_group_id: f.groupId,
          p_period_start: addDays(f.periodStart, -60),
        });

        expect(error).toBeNull();
        for (const rij of (data ?? []) as { closed_this_period: boolean | null }[]) {
          // ⚠️ De belofte eerst: over een periode van zestig dagen terug mag hier
          //    van niemand een aanwezigheid uit komen.
          expect(rij.closed_this_period).not.toBe(true);

          // ⚠️ En sinds 0104 is het antwoord `null` — "daar zeg ik niets over" —
          //    en niet `false`, wat "niets afgerond" betekent. Deze test stond
          //    tot dan op `toBe(false)` en legde daarmee vast dat een weigering
          //    eruitziet als een gemiste week. Zie migratie 0104.
          expect(rij.closed_this_period).toBeNull();
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'haalt een lid met adempauze uit de noemer — maar alleen op een doel van deze groep',
      async () => {
        // Criterium 4 was voor de helft ongetest, en dat was precies de helft
        // die stuk was: de toets keek naar élk doel van een lid, ook doelen
        // buiten deze groep.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const doelId = doel.data?.id;
        if (doelId === undefined) throw new Error('geen doel voor de adempauze-test');

        const voor = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        const pauze = await admin
          .from('breathers')
          .insert({
            user_id: f.alice.id,
            goal_id: doelId,
            starts_cycle: addDays(f.cycleStart, -1),
            ends_cycle: addDays(f.cycleStart, 6),
          })
          .select('id')
          .single();

        const na = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(stand(na.data).in_aanmerking).toBe((stand(voor.data).in_aanmerking ?? 1) - 1);

        const pauzeId = pauze.data?.id;
        if (pauzeId !== undefined) await admin.from('breathers').delete().eq('id', pauzeId);
      },
      TEST_TIMEOUT,
    );
  });

  describe('de stand van de ketting', () => {
    it(
      'geeft een buitenstaander niets',
      async () => {
        const { data } = await f.carol.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(data ?? null).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'telt de schakels van de lopende periode',
      async () => {
        const { data, error } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(error).toBeNull();
        expect(stand(data).schakels).toBe(2);
        expect(stand(data).in_aanmerking).toBe(2);
        expect(stand(data).voltallig).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'noemt nooit wie er ontbreekt',
      async () => {
        // ⚠️ Domeinregel 7. De stand mag drie sleutels hebben en geen enkele
        //    daarvan mag naar een persoon te herleiden zijn — anders is "wie is
        //    er nog niet" met één API-verzoek te beantwoorden.
        const { data } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(Object.keys(stand(data)).sort()).toEqual(['in_aanmerking', 'schakels', 'voltallig']);
        expect(JSON.stringify(data)).not.toContain(f.bob.id);
        expect(JSON.stringify(data)).not.toContain(f.alice.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een uitgezet lid "voltallig" niet blokkeren',
      async () => {
        const admin = adminDb();
        await admin
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        const { data } = await f.alice.db.rpc('ketting_stand', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        // ⚠️ Deze assertie is op 19-08-2026 omgedraaid. Ze stond eerst op
        //    `schakels: 2, in_aanmerking: 1, voltallig: true` — "2 van de 1" —
        //    en legde daarmee vast dat teller en noemer verschillende mensen
        //    mochten tellen. Alle drie de reviewers noemden dat blokkerend, en
        //    terecht: een test die een tegenstrijdigheid vastlegt, beschermt hem.
        //
        //    Sinds 0037 tellen beide dezelfde verzameling. Bobs schakel blijft in
        //    de tabel staan (criterium 5) maar telt niet mee zolang hij uitgezet
        //    is, dus de stand kan nooit meer meer schakels dan leden tonen.
        expect(stand(data).in_aanmerking).toBe(1);
        expect(stand(data).schakels).toBe(1);
        expect(stand(data).voltallig).toBe(true);
        expect(stand(data).schakels).toBeLessThanOrEqual(stand(data).in_aanmerking ?? 0);

        await admin
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt de schakels van een vertrokken lid',
      async () => {
        // Criterium 5. Schakels hangen aan `profiles` en niet aan het
        // lidmaatschap, dus vertrek mag de ketting niet uitwissen.
        const admin = adminDb();
        await admin
          .from('group_members')
          .delete()
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        const schakels = await admin
          .from('chain_links')
          .select('id')
          .eq('group_id', f.groupId)
          .eq('user_id', f.bob.id);

        expect(schakels.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );
  });
  // -------------------------------------------------------------------------
  // QS8-82 — de adempauze, migratie 0048
  // -------------------------------------------------------------------------
  //
  // ⚠️ De vraag hier is niet "kun je een adempauze plannen" maar "kun je er een
  //    plannen die je niet zou mogen hebben". Vóór 0048 stond `breathers`
  //    wagenwijd open: `breathers_write` toetste alleen `user_id = auth.uid()`,
  //    er was geen CHECK en geen bovengrens. Eén verzoek en je had een adempauze
  //    van tien jaar over al je doelen — nooit meer een minpunt.
  describe('de adempauze', () => {
    /**
     * De cyclusstart `weken` weken ná de lopende. Testprofielen staan op de
     * standaard: maandag, Europe/Amsterdam.
     *
     * ⚠️ Rekent via `userCycle` en niet met de hand. Een testhelper die zelf een
     *    weekgrens uitrekent is de tweede kopie van `shared/time`, en dan toetst
     *    de test uiteindelijk zijn eigen rekenwerk.
     */
    function cyclusOverWeken(weken: number): IsoDate {
      const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
      return addDays(cyclus.startDate, 7 * weken);
    }

    /**
     * ⚠️ **Hier stonden tot 06-09-2026 twee weigeringen, en die zijn een besluit
     *    geworden en geen bug.** `niet_vooraf` hield de lopende cyclus tegen —
     *    tegen een zondagavondontsnapping uit het minpunt — en `te_lang` hield
     *    het bij twee cycli. Quinten heeft op 30-08 voor volledige vrijheid
     *    gekozen, mét het tegenadvies erbij; QS8-227 en
     *    `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`.
     *
     *    De tests zijn daarom niet weggehaald maar omgedraaid: wat eerst
     *    geweigerd moest worden, moet nu lukken én zijn gevolg hebben. Een
     *    verwijderde test laat niet zien dat er iets besloten is.
     */
    it(
      'staat een adempauze over de week die nu loopt toe',
      async () => {
        const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: cyclus.startDate,
          p_ends_cycle: cyclus.startDate,
        });

        expect(uitkomst(antwoord.data).ok).toBe(true);

        await adminDb()
          .from('breathers')
          .delete()
          .eq('id', (uitkomst(antwoord.data) as { id: string }).id);
      },
      TEST_TIMEOUT,
    );

    it(
      'staat een adempauze van vijf weken toe',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: cyclusOverWeken(10),
          p_ends_cycle: cyclusOverWeken(14),
        });

        expect(uitkomst(antwoord.data).ok).toBe(true);

        await adminDb()
          .from('breathers')
          .delete()
          .eq('id', (uitkomst(antwoord.data) as { id: string }).id);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een adempauze van langer dan een jaar',
      async () => {
        // ⚠️ **De enige grens die QS8-227 erbíj zet, en dat is een bewuste
        //    afwijking van "elke lengte".** Niet tegen misbruik — die deur staat
        //    met dit besluit open — maar omdat `annuleer_adempauze()` alles
        //    weigert waarvan `starts_cycle <= vandaag`. Een pauze die in het
        //    verleden begint is dus nooit meer te annuleren, en zonder plafond
        //    maakt één verkeerd getypt jaartal het doel permanent onbruikbaar
        //    voor elke volgende adempauze. Uit de security-review van 06-09-2026,
        //    die er een van 415853 weken inplande.
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: cyclusOverWeken(60),
          p_ends_cycle: cyclusOverWeken(60 + 52),
        });

        expect(uitkomst(antwoord.data).ok).toBe(false);
        expect(uitkomst(antwoord.data).reason).toBe('te_lang');
      },
      TEST_TIMEOUT,
    );

    it(
      'staat een adempauze van precies een jaar toe',
      async () => {
        // ⚠️ De must-allow bij de grens hierboven. Zonder dit geval bewijst die
        //    test ook een functie die alles langer dan een week weigert, en dan
        //    is de grens ergens anders komen te liggen dan hij zegt.
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: cyclusOverWeken(70),
          p_ends_cycle: cyclusOverWeken(70 + 51),
        });

        expect(uitkomst(antwoord.data).ok, JSON.stringify(antwoord.data)).toBe(true);

        await adminDb()
          .from('breathers')
          .delete()
          .eq('id', (uitkomst(antwoord.data) as { id: string }).id);
      },
      TEST_TIMEOUT,
    );

    it(
      'stelt ook een doorgeschoven week vrij en draait dat minpunt terug',
      async () => {
        // ⚠️ **`carried` hoorde hier eerst niet bij, en de motivering daarvoor
        //    was aantoonbaar onjuist.** De migratie schreef dat een
        //    doorgeschoven week "geen minpunt heeft om terug te draaien".
        //    Nagemeten: `schuif_weekdoel_door()` weigert alles wat niet `missed`
        //    is en zet díe rij op `carried`, zónder het al geboekte
        //    `cycle_missed` aan te raken — en `herbereken_reeks()` telt `carried`
        //    óók als gemist. Een adempauze over zo'n week deed dus niets terwijl
        //    het scherm zei dat het gelukt was. Uit de security-review van
        //    06-09-2026.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Doorgeschoven week', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        expect(
          (await admin.from('goal_group_links').insert({ goal_id: doelId, group_id: f.groupId }))
            .error,
        ).toBeNull();
        expect(
          (
            await admin
              .from('group_members')
              .upsert(
                { group_id: f.groupId, user_id: f.bob.id, role: 'member', status: 'active' },
                { onConflict: 'group_id,user_id' },
              )
          ).error,
        ).toBeNull();

        const week = await admin
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'doorgeschoven',
            cycle_start_date: cyclusOverWeken(-9),
            status: 'carried',
            points_miss: -1,
          })
          .select('id, beoordeelbaar')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);
        expect(week.data.beoordeelbaar).toBe(true);

        const punt = await admin.from('points_ledger').insert({
          user_id: f.alice.id,
          goal_id: doelId,
          delta: -1,
          reason: 'cycle_missed',
          ref_type: 'weekly_goal',
          ref_id: week.data.id,
        });
        if (punt.error) throw new Error(`minpunt: ${punt.error.message}`);

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(-9),
          p_ends_cycle: cyclusOverWeken(-9),
        });

        expect(uitkomst(antwoord.data).ok, JSON.stringify(antwoord.data)).toBe(true);
        expect((uitkomst(antwoord.data) as { hersteld: number }).hersteld).toBe(1);

        const na = await admin.from('weekly_goals').select('status').eq('id', week.data.id).single();
        expect(na.data?.status).toBe('excused');

        const rijen = await admin.from('points_ledger').select('delta').eq('ref_id', week.data.id);
        expect(
          (rijen.data ?? []).reduce((som, r) => som + (r.delta as number), 0),
          'het minpunt van een doorgeschoven week hoort net zo goed terug te gaan',
        ).toBe(0);

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een ingetrokken week met rust',
      async () => {
        // ⚠️ **De must-not-do naast `carried`.** `cancelled` heeft de gebruiker
        //    zelf ingetrokken; er staat geen minpunt onder. Zou de lus "elke
        //    afgesloten status" pakken, dan verandert een adempauze hier iets
        //    zonder reden en telt `hersteld` een week mee die niemand miste.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Ingetrokken week', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        const week = await admin
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'ingetrokken',
            cycle_start_date: cyclusOverWeken(-11),
            status: 'cancelled',
            points_miss: -1,
          })
          .select('id')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(-11),
          p_ends_cycle: cyclusOverWeken(-11),
        });

        expect(uitkomst(antwoord.data).ok).toBe(true);
        expect((uitkomst(antwoord.data) as { hersteld: number }).hersteld).toBe(0);

        const na = await admin.from('weekly_goals').select('status').eq('id', week.data.id).single();
        expect(na.data?.status, 'een ingetrokken week blijft ingetrokken').toBe('cancelled');

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'zet een al afgesloten gemiste week op excused en draait het minpunt terug',
      async () => {
        // ⚠️ **Het meeste werk van QS8-227 en het makkelijkst over het hoofd te
        //    zien.** Zonder dit blok verandert er niets aan een week die de
        //    rollover al heeft afgesloten: het scherm zegt "je pauzeert" en de
        //    score zegt het tegendeel.
        //
        // ⚠️ **Met een correctierij en niet door de `cycle_missed`-rij weg te
        //    halen.** Domeinregel 6 zegt dat de geschiedenis append-only is; het
        //    saldo klopt en het spoor blijft staan.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Adempauze achteraf', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        // ⚠️ **De koppeling aan de groep is geen versiering.**
        //    `zet_beoordeelbaar_bij_insert()` overschrijft een meegegeven
        //    `beoordeelbaar` altijd met `kan_beoordeeld_worden()`, en die vraagt
        //    of er iemand anders is die kán goedkeuren. Zonder groep blijft het
        //    weekdoel onbeoordeelbaar, weigert de trigger van QS8-110 de
        //    `cycle_missed`-boeking **zonder foutmelding**, en toetst deze test
        //    het terugdraaien van een minpunt dat er nooit stond.
        //
        // ⚠️ Bobs lidmaatschap wordt hier gezet en niet aangenomen: een eerdere
        //    test in dit bestand verwijdert die rij. Zelfde reden en zelfde vorm
        //    als bij "de groepsgenoot ziet de adempauze" verderop.
        expect(
          (
            await admin
              .from('group_members')
              .upsert(
                { group_id: f.groupId, user_id: f.bob.id, role: 'member', status: 'active' },
                { onConflict: 'group_id,user_id' },
              )
          ).error,
        ).toBeNull();

        const koppeling = await admin
          .from('goal_group_links')
          .insert({ goal_id: doelId, group_id: f.groupId });
        if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

        const week = await admin
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'gemiste week',
            cycle_start_date: cyclusOverWeken(-4),
            status: 'missed',
            points_miss: -1,
          })
          .select('id, beoordeelbaar')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);
        expect(
          week.data.beoordeelbaar,
          'zonder beoordelaar valt er niets terug te draaien en toetst deze test niets',
        ).toBe(true);

        const punt = await admin.from('points_ledger').insert({
          user_id: f.alice.id,
          goal_id: doelId,
          delta: -1,
          reason: 'cycle_missed',
          ref_type: 'weekly_goal',
          ref_id: week.data.id,
        });
        if (punt.error) throw new Error(`minpunt: ${punt.error.message}`);

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(-4),
          p_ends_cycle: cyclusOverWeken(-4),
        });

        expect(uitkomst(antwoord.data).ok).toBe(true);
        expect((uitkomst(antwoord.data) as { hersteld: number }).hersteld).toBe(1);

        const na = await admin.from('weekly_goals').select('status').eq('id', week.data.id).single();
        expect(na.data?.status, 'de afgesloten week hoort nu vrijgesteld te zijn').toBe('excused');

        const rijen = await admin
          .from('points_ledger')
          .select('delta, reason')
          .eq('ref_id', week.data.id);
        const saldo = (rijen.data ?? []).reduce((som, r) => som + (r.delta as number), 0);

        expect(saldo, 'het minpunt is teruggedraaid').toBe(0);
        expect(
          (rijen.data ?? []).some((r) => r.reason === 'cycle_missed'),
          'de oorspronkelijke boeking blijft staan — de geschiedenis is append-only',
        ).toBe(true);
        expect((rijen.data ?? []).some((r) => r.reason === 'correction')).toBe(true);

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'herberekent de reeks, zodat een herstelde week hem niet meer breekt',
      async () => {
        // ⚠️ **De derde helft van het herstel, en de stilste.** Status en punten
        //    kloppen na de lus; `user_streaks` is een afgeleide tabel die alleen
        //    verandert als iemand hem bijwerkt. Zonder de aanroep van
        //    `herbereken_reeks()` blijft de gebruiker een gebroken reeks zien
        //    terwijl de week die hem brak is vrijgesteld, en dat is precies het
        //    soort fout dat niemand meldt als bug.
        //
        // ⚠️ De reeks staat vooraf met opzet op de verouderde waarde. Zou de
        //    tabel leeg blijven, dan zou een test die "2" verwacht ook slagen op
        //    een implementatie die de rij per ongeluk opnieuw aanmaakt in plaats
        //    van te herberekenen.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Reeks na herstel', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        const weken = [
          { weken: -6, status: 'approved' },
          { weken: -5, status: 'missed' },
          { weken: -4, status: 'approved' },
        ];
        let index = 0;
        for (const w of weken) {
          index += 1;
          const rij = await admin.from('weekly_goals').insert({
            goal_id: doelId,
            title: `week ${index}`,
            cycle_start_date: cyclusOverWeken(w.weken),
            status: w.status,
            points_miss: -1,
          });
          if (rij.error) throw new Error(`weekdoel ${index}: ${rij.error.message}`);
        }

        const vooraf = await admin.from('user_streaks').upsert(
          {
            user_id: f.alice.id,
            goal_id: doelId,
            current_streak: 1,
            best_streak: 1,
            last_cycle_start: cyclusOverWeken(-4),
            total_points: 0,
          },
          { onConflict: 'user_id,goal_id' },
        );
        if (vooraf.error) throw new Error(`reeks vooraf: ${vooraf.error.message}`);

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(-5),
          p_ends_cycle: cyclusOverWeken(-5),
        });
        expect(uitkomst(antwoord.data).ok, JSON.stringify(antwoord.data)).toBe(true);

        const na = await admin
          .from('user_streaks')
          .select('current_streak')
          .eq('user_id', f.alice.id)
          .eq('goal_id', doelId)
          .single();

        expect(
          na.data?.current_streak,
          'de twee gehaalde weken sluiten nu op elkaar aan, want de week ertussen is vrijgesteld',
        ).toBe(2);

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'draait het minpunt van elk weekdoel in de cyclus apart terug',
      async () => {
        // ⚠️ **Vraag 6 van regel 18, en hij hoort hier.** Dit issue tilt de
        //    adempauze van "hoogstens twee cycli vooruit" naar "elke reeks weken,
        //    ook achteraf", en daarmee van "er is er hooguit één per cyclus" naar
        //    "er kunnen er meer zijn". `points_miss` staat op het wéékdoel, dus
        //    twee weekdoelen in dezelfde cyclus dragen elk hun eigen minpunt. Een
        //    herstel dat één vaste `+1` per cyclus boekt, is hier zichtbaar te
        //    weinig — en zonder deze test valt dat pas op aan iemands score.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Twee gemiste weekdoelen', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        expect(
          (await admin.from('goal_group_links').insert({ goal_id: doelId, group_id: f.groupId }))
            .error,
        ).toBeNull();
        expect(
          (
            await admin
              .from('group_members')
              .upsert(
                { group_id: f.groupId, user_id: f.bob.id, role: 'member', status: 'active' },
                { onConflict: 'group_id,user_id' },
              )
          ).error,
        ).toBeNull();

        const cyclus = cyclusOverWeken(-5);
        const weekIds: string[] = [];

        for (const index of [1, 2]) {
          const week = await admin
            .from('weekly_goals')
            .insert({
              goal_id: doelId,
              title: `gemist weekdoel ${index}`,
              cycle_start_date: cyclus,
              status: 'missed',
              points_miss: -1,
            })
            .select('id, beoordeelbaar')
            .single();
          if (week.error) throw new Error(`weekdoel ${index}: ${week.error.message}`);
          expect(week.data.beoordeelbaar).toBe(true);
          weekIds.push(week.data.id as string);

          const punt = await admin.from('points_ledger').insert({
            user_id: f.alice.id,
            goal_id: doelId,
            delta: -1,
            reason: 'cycle_missed',
            ref_type: 'weekly_goal',
            ref_id: week.data.id,
          });
          if (punt.error) throw new Error(`minpunt ${index}: ${punt.error.message}`);
        }

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclus,
          p_ends_cycle: cyclus,
        });

        expect(uitkomst(antwoord.data).ok, JSON.stringify(antwoord.data)).toBe(true);
        expect(
          (uitkomst(antwoord.data) as { hersteld: number }).hersteld,
          'beide weekdoelen horen hersteld te zijn, niet de cyclus als geheel',
        ).toBe(2);

        const rijen = await admin
          .from('points_ledger')
          .select('delta, reason, ref_id')
          .in('ref_id', weekIds);
        const saldo = (rijen.data ?? []).reduce((som, r) => som + (r.delta as number), 0);

        expect(saldo, 'beide minpunten horen teruggedraaid te zijn, niet één').toBe(0);
        expect(
          (rijen.data ?? []).filter((r) => r.reason === 'correction'),
          'één correctie per weekdoel',
        ).toHaveLength(2);

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'boekt geen correctie voor een gemiste week die geen minpunt kostte',
      async () => {
        // ⚠️ **De must-see, en hij komt uit een meting die eerst misging.** De
        //    trigger `geen_minpunt_zonder_beoordelaar` (QS8-110) slaat
        //    `cycle_missed` over voor een weekdoel zonder beoordelaar. Er staat
        //    dan niets om terug te draaien, en een vaste `+1` zou punten
        //    verzinnen die niemand verloren heeft.
        //
        // ⚠️ **Dit doel wordt met opzet niet aan een groep gekoppeld** — dat is
        //    precies het verschil met de test hierboven, en het enige verschil.
        const admin = adminDb();
        const doel = await admin
          .from('goals')
          .insert({ owner_id: f.alice.id, title: 'Adempauze zonder punt', target_date: cyclusOverWeken(20) })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);
        const doelId = doel.data.id as string;

        const week = await admin
          .from('weekly_goals')
          .insert({
            goal_id: doelId,
            title: 'gemist zonder beoordelaar',
            cycle_start_date: cyclusOverWeken(-6),
            status: 'missed',
            points_miss: -1,
          })
          .select('id')
          .single();
        if (week.error) throw new Error(`weekdoel: ${week.error.message}`);

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(-6),
          p_ends_cycle: cyclusOverWeken(-6),
        });

        expect(uitkomst(antwoord.data).ok).toBe(true);

        const na = await admin.from('weekly_goals').select('status').eq('id', week.data.id).single();
        expect(na.data?.status, 'de week wordt wél vrijgesteld').toBe('excused');

        const rijen = await admin.from('points_ledger').select('delta').eq('ref_id', week.data.id);
        expect(
          rijen.data ?? [],
          'er viel niets terug te draaien, dus er hoort ook niets bijgeboekt te worden',
        ).toHaveLength(0);

        await admin.from('goals').delete().eq('id', doelId);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat drie losse adempauzes naast elkaar bestaan',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();
        const doelId = doel.data?.id ?? '';

        const ids: string[] = [];
        for (const weken of [30, 34, 38]) {
          const antwoord = await f.alice.db.rpc('plan_adempauze', {
            p_goal_id: doelId,
            p_starts_cycle: cyclusOverWeken(weken),
            p_ends_cycle: cyclusOverWeken(weken + 1),
          });
          expect(uitkomst(antwoord.data).ok, `pauze vanaf week ${weken}`).toBe(true);
          ids.push((uitkomst(antwoord.data) as { id: string }).id);
        }

        expect(ids).toHaveLength(3);
        await adminDb().from('breathers').delete().in('id', ids);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een adempauze die over een bestaande heen ligt',
      async () => {
        // ⚠️ **De naad van QS8-227.** De overlapcontrole stond er al, maar was
        //    vóór dit issue nauwelijks te raken: een pauze duurde hoogstens twee
        //    cycli en moest vooruit gepland worden, dus botsen kostte moeite.
        //    Nu mag een pauze elke lengte hebben en mogen er meerdere naast
        //    elkaar staan, en dan is elkaar overlappen de gewone fout. De
        //    migratie noemt hem met zoveel woorden als iets dat blijft; dan
        //    hoort er ook iets te zijn dat rood wordt als hij verdwijnt.
        //
        // ⚠️ Geen van de twee botsingen deelt zijn begindatum met de bestaande
        //    pauze, dus `breathers_geen_dubbele_start` vangt ze allebei niet af.
        //    Zou die constraint het werk doen, dan toetste deze test de
        //    verkeerde grendel.
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();
        const doelId = doel.data?.id ?? '';

        const eerste = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclusOverWeken(50),
          p_ends_cycle: cyclusOverWeken(52),
        });
        expect(uitkomst(eerste.data).ok, JSON.stringify(eerste.data)).toBe(true);

        try {
          // Deels eroverheen: begint erin, eindigt erbuiten.
          const deels = await f.alice.db.rpc('plan_adempauze', {
            p_goal_id: doelId,
            p_starts_cycle: cyclusOverWeken(51),
            p_ends_cycle: cyclusOverWeken(54),
          });
          expect(uitkomst(deels.data).ok).toBe(false);
          expect(uitkomst(deels.data).reason).toBe('overlapt');

          // Er helemaal omheen: begint ervoor, eindigt erna.
          const omheen = await f.alice.db.rpc('plan_adempauze', {
            p_goal_id: doelId,
            p_starts_cycle: cyclusOverWeken(49),
            p_ends_cycle: cyclusOverWeken(53),
          });
          expect(uitkomst(omheen.data).ok).toBe(false);
          expect(uitkomst(omheen.data).reason).toBe('overlapt');

          const alles = await adminDb()
            .from('breathers')
            .select('id')
            .eq('goal_id', doelId)
            .gte('starts_cycle', cyclusOverWeken(49));
          expect(alles.data ?? [], 'er hoort er precies één te liggen').toHaveLength(1);
        } finally {
          await adminDb()
            .from('breathers')
            .delete()
            .eq('id', (uitkomst(eerste.data) as { id: string }).id);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een adempauze op het doel van een ander',
      async () => {
        const doelVanAlice = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const antwoord = await f.bob.db.rpc('plan_adempauze', {
          p_goal_id: doelVanAlice.data?.id ?? '',
          p_starts_cycle: cyclusOverWeken(1),
          p_ends_cycle: cyclusOverWeken(1),
        });

        expect(uitkomst(antwoord.data).ok).toBe(false);
        expect(uitkomst(antwoord.data).reason).toBe('not_owner');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een datum die geen cyclusstart is',
      async () => {
        // Zonder deze controle dekt een adempauze twee halve cycli, en dan doet
        // de rollover iets anders dan het scherm belooft.
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const antwoord = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: addDays(cyclusOverWeken(1), 2),
          p_ends_cycle: addDays(cyclusOverWeken(1), 2),
        });

        expect(uitkomst(antwoord.data).ok).toBe(false);
        expect(uitkomst(antwoord.data).reason).toBe('geen_cyclusstart');
      },
      TEST_TIMEOUT,
    );

    it(
      'kan de tabel niet meer rechtstreeks beschrijven',
      async () => {
        // ⚠️ De grenzen hierboven zijn alleen grenzen als de RPC de énige weg
        //    naar binnen is. 0048 trekt daarom het tabelrecht in.
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const poging = await f.alice.db.from('breathers').insert({
          user_id: f.alice.id,
          goal_id: doel.data?.id ?? '',
          starts_cycle: cyclusOverWeken(1),
          ends_cycle: cyclusOverWeken(40),
        });

        expect(poging.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De positieve controle. Zonder deze test blijft alles hierboven groen
     *    als `plan_adempauze()` domweg altijd `false` teruggeeft — en dan is de
     *    adempauze onbruikbaar in plaats van veilig.
     */
    it(
      'plant een adempauze van twee weken die wél mag, en annuleert hem weer',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .limit(1)
          .single();

        const start = cyclusOverWeken(6);
        const eind = cyclusOverWeken(7);

        const gepland = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: start,
          p_ends_cycle: eind,
        });

        expect(uitkomst(gepland.data).reason).toBeUndefined();
        expect(uitkomst(gepland.data).ok).toBe(true);

        const id = (gepland.data as { id?: string } | null)?.id;
        expect(id).toBeDefined();

        // Overlap moet daarna geweigerd worden — anders is het maximum van twee
        // cycli te omzeilen door er drie naast elkaar te leggen.
        const tweede = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doel.data?.id ?? '',
          p_starts_cycle: start,
          p_ends_cycle: start,
        });
        expect(uitkomst(tweede.data).reason).toBe('overlapt');

        // En annuleren kan, want hij is nog niet begonnen.
        const weg = await f.alice.db.rpc('annuleer_adempauze', { p_id: id ?? '' });
        expect(uitkomst(weg.data).ok).toBe(true);

        const na = await adminDb().from('breathers').select('id').eq('id', id ?? '');
        expect(na.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    /**
     * Oppervlak 21 — besluit A50, 25-08-2026.
     *
     * ⚠️ **Dit is een positieve controle op een besloten oppervlak, en dat is
     *    zeldzaam in deze suite.** Bijna alles hier bewijst dat de groep iets
     *    níét ziet; dit bewijst dat ze iets wél ziet, met opzet.
     *
     *    `docs/decisions/001-datamodel.md` zei tot 25-08 dat groepsleden "alleen
     *    dát er een pauze loopt" zagen, terwijl `breathers_select` altijd de hele
     *    rij gaf en `adempauze.ts` dat óók zo beschreef. Quinten heeft beslist
     *    welk document wijkt: de matrix. Aankondigen is de eigen handeling van de
     *    gebruiker, en dat is de uitzondering die domeinregel 7 zelf maakt.
     *
     * ⚠️ Zonder deze test zou een latere ronde de "afscherming" alsnog bouwen —
     *    hij ziet er immers uit als een lek. Nu wordt zo'n poging rood, en dan
     *    komt iemand langs dit commentaar.
     *
     * ⚠️ **Wat de groep hierdoor níét ziet, staat in de test daaronder:** welke
     *    weken in die periode gemist zijn blijft dicht (`weekly_goals.status`,
     *    sinds 0047, `excused` incluis). De pauze is zichtbaar, de weken niet.
     */
    it(
      'is voor een groepsgenoot zichtbaar, begin en eind incluis',
      async () => {
        // ⚠️ **Een eigen doel met een eigen koppeling, en niet die van de
        //    fixture.** De eerste versie pakte alice' gekoppelde doel en slaagde
        //    los, maar viel om in de volle run: eerdere tests in dit bestand
        //    veranderen de koppelingen, en dan meet je hun opruiming in plaats
        //    van deze policy.
        const doel = await adminDb()
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'A50 adempauzedoel',
            target_date: addDays(cyclusOverWeken(0), 120),
          })
          .select('id')
          .single();
        expect(doel.error).toBeNull();

        const doelId = doel.data?.id ?? '';
        expect(
          (await adminDb().from('goal_group_links').insert({ goal_id: doelId, group_id: f.groupId }))
            .error,
        ).toBeNull();

        // ⚠️ **De kijker wordt hier expliciet lid gemaakt en niet aangenomen.**
        //    Een eerdere test in dit bestand verwijdert bobs lidmaatschapsrij, en
        //    dan meet deze test die opruiming in plaats van de policy: hij slaagde
        //    los en viel om in de volle run, met `bob: null` als enige spoor. Een
        //    test die zijn eigen voorwaarde stelt, is niet afhankelijk van de
        //    volgorde waarin vitest hem draait.
        expect(
          (
            await adminDb()
              .from('group_members')
              .upsert(
                { group_id: f.groupId, user_id: f.bob.id, role: 'member', status: 'active' },
                { onConflict: 'group_id,user_id' },
              )
          ).error,
        ).toBeNull();

        const start = cyclusOverWeken(9);

        const gezet = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: start,
          p_ends_cycle: start,
        });
        const id = (gezet.data as { id?: string } | null)?.id;
        expect(id, `de adempauze is niet aangemaakt: ${JSON.stringify(gezet.data)}`).toBeDefined();

        try {
          const gezien = await f.bob.db
            .from('breathers')
            .select('id, goal_id, starts_cycle, ends_cycle, announced_at')
            .eq('id', id ?? '');

          expect(gezien.error).toBeNull();

          // ⚠️ De diagnose in de melding: valt deze test ooit om, dan wil je in
          //    één oogopslag zien of het de policy is of de fixture.
          const lid = await adminDb()
            .from('group_members')
            .select('status')
            .eq('group_id', f.groupId)
            .eq('user_id', f.bob.id)
            .maybeSingle();
          const links = await adminDb()
            .from('goal_group_links')
            .select('group_id')
            .eq('goal_id', doelId);

          expect(
            gezien.data ?? [],
            `de groepsgenoot ziet de adempauze niet — bob: ${JSON.stringify(lid.data)}, ` +
              `koppelingen: ${JSON.stringify(links.data)}, groep: ${f.groupId}`,
          ).toHaveLength(1);

          const rij = (gezien.data ?? [])[0];
          expect(rij?.starts_cycle, 'het begin is afgeschermd').toBe(start);
          expect(rij?.ends_cycle, 'het eind is afgeschermd').toBe(start);
        } finally {
          await adminDb().from('breathers').delete().eq('id', id ?? '');
          await adminDb().from('goals').delete().eq('id', doelId);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'is voor een groepsgenoot ook zichtbaar met terugwerkende kracht',
      async () => {
        // ⚠️ **Acceptatiecriterium van QS8-227, en het is een naad.** Sinds dit
        //    issue mag een adempauze over een week liggen die al voorbij is. De
        //    aankondiging aan de groep is de énige rem die op zo'n pauze
        //    overblijft — het besluit geeft de andere drie bewust op — dus een
        //    pauze achteraf die de groep níét bereikt, is niet een half gebouwde
        //    feature maar de rem die eraf valt.
        //
        // ⚠️ Deze test staat er los van de test hierboven en niet als tweede
        //    assertie erin. Ze toetsen twee beloftes: die hierboven dat de rij
        //    niet afgeschermd is, deze dat de richting in de tijd er niet toe
        //    doet. In één test zou de eerste de tweede kunnen dragen.
        const doel = await adminDb()
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'Adempauze achteraf, gedeeld',
            target_date: addDays(cyclusOverWeken(0), 120),
          })
          .select('id')
          .single();
        expect(doel.error).toBeNull();
        const doelId = doel.data?.id ?? '';

        expect(
          (await adminDb().from('goal_group_links').insert({ goal_id: doelId, group_id: f.groupId }))
            .error,
        ).toBeNull();
        expect(
          (
            await adminDb()
              .from('group_members')
              .upsert(
                { group_id: f.groupId, user_id: f.bob.id, role: 'member', status: 'active' },
                { onConflict: 'group_id,user_id' },
              )
          ).error,
        ).toBeNull();

        const start = cyclusOverWeken(-8);
        const eind = cyclusOverWeken(-7);

        const gezet = await f.alice.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: start,
          p_ends_cycle: eind,
        });
        const id = (gezet.data as { id?: string } | null)?.id;
        expect(id, `de adempauze is niet aangemaakt: ${JSON.stringify(gezet.data)}`).toBeDefined();

        try {
          const gezien = await f.bob.db
            .from('breathers')
            .select('id, starts_cycle, ends_cycle, announced_at')
            .eq('id', id ?? '');

          expect(gezien.error).toBeNull();
          expect(
            gezien.data ?? [],
            'een adempauze met terugwerkende kracht hoort net zo aangekondigd te zijn',
          ).toHaveLength(1);

          const rij = (gezien.data ?? [])[0];
          expect(rij?.starts_cycle).toBe(start);
          expect(rij?.ends_cycle).toBe(eind);
          expect(rij?.announced_at, 'zonder aankondigingsmoment is er niets aangekondigd').not.toBeNull();
        } finally {
          await adminDb().from('breathers').delete().eq('id', id ?? '');
          await adminDb().from('goals').delete().eq('id', doelId);
        }
      },
      TEST_TIMEOUT,
    );
  });
  // -------------------------------------------------------------------------
  // QS8-39 — mijlpalen herordenen, migratie 0049
  // -------------------------------------------------------------------------
  describe('mijlpalen herordenen', () => {
    it(
      'weigert een lijst die niet precies de bestaande mijlpalen is',
      async () => {
        // ⚠️ Met een deelverzameling zijn dubbele posities en gaten te maken, en
        //    dan is `order_index` geen volgorde meer maar een suggestie. De RPC
        //    toetst gelijkheid van twee verzamelingen en niet twee keer een kant
        //    — de valkuil die migratie 0032 een groene test opleverde.
        const admin = adminDb();

        // ⚠️ **Met een expliciete volgorde, en dat is geen netheid — QS8-285.**
        //    `limit(1)` zonder `order by` laat Postgres kiezen welke rij hij
        //    teruggeeft; dat mag per plan verschillen. Deze test kiest daarmee
        //    telkens mogelijk een ánder doel, en dan is "de poort weghalen geeft
        //    één rode test" niet gegarandeerd reproduceerbaar. `id` is een totale
        //    ordening, dus dit is altijd dezelfde rij.
        const doel = await admin
          .from('goals')
          .select('id')
          .eq('owner_id', f.alice.id)
          .order('id', { ascending: true })
          .limit(1)
          .single();
        if (doel.error) throw new Error(`doel kiezen: ${doel.error.message}`);

        const doelId = doel.data?.id ?? '';

        const een = await admin
          .from('milestones')
          .insert({ goal_id: doelId, title: 'Mijlpaal een', order_index: 101 })
          .select('id')
          .single();
        const twee = await admin
          .from('milestones')
          .insert({ goal_id: doelId, title: 'Mijlpaal twee', order_index: 102 })
          .select('id')
          .single();

        const idEen = een.data?.id ?? '';
        const idTwee = twee.data?.id ?? '';

        // Half: alleen de eerste.
        const half = await f.alice.db.rpc('herorden_mijlpalen', {
          p_goal_id: doelId,
          p_ids: [idEen],
        });
        expect(uitkomst(half.data).reason).toBe('lijst_klopt_niet');

        // Een ander mag hem sowieso niet herordenen.
        const vreemde = await f.bob.db.rpc('herorden_mijlpalen', {
          p_goal_id: doelId,
          p_ids: [idTwee, idEen],
        });
        expect(uitkomst(vreemde.data).reason).toBe('not_owner');

        // ⚠️ **De envelop is niet het effect — QS8-285.** Hier stond alleen de
        //    `reason`. Gemeten met een `herorden_mijlpalen` die de volgorde van
        //    een vreemde overschrijft en dáárna pas `not_owner` teruggeeft: deze
        //    test bleef groen terwijl de schrijfactie landde. Het enige rood was
        //    nevenschade in een buurtest, en wie dát als dekking telt, leest iets
        //    anders dan er staat.
        const naVreemde = await admin
          .from('milestones')
          .select('id, order_index')
          .in('id', [idEen, idTwee])
          .order('id', { ascending: true });
        if (naVreemde.error) throw new Error(`nameten: ${naVreemde.error.message}`);

        expect(
          Object.fromEntries((naVreemde.data ?? []).map((m) => [m.id as string, m.order_index])),
          'Bob kreeg `not_owner` te horen en de volgorde van Alice is tóch geschreven',
        ).toEqual({ [idEen]: 101, [idTwee]: 102 });

        // ⚠️ De positieve controle: de volledige lijst omgedraaid moet wél
        //    lukken, en de volgorde moet daarna echt anders zijn. Zonder dit
        //    blijven de twee weigeringen groen terwijl herordenen stuk is.
        const goed = await f.alice.db.rpc('herorden_mijlpalen', {
          p_goal_id: doelId,
          p_ids: [idTwee, idEen],
        });
        expect(uitkomst(goed.data).ok).toBe(true);

        const na = await admin
          .from('milestones')
          .select('id, order_index')
          .in('id', [idEen, idTwee])
          .order('order_index', { ascending: true });

        expect((na.data ?? []).map((m) => m.id)).toEqual([idTwee, idEen]);

        // ⚠️ **En op de posities zelf en niet alleen op de sortering — QS8-285.**
        //    Een assertie die `order by order_index` teruguitleest, bewijst alleen
        //    dat de rijen in díe volgorde staan; hij zegt niets over wat er in de
        //    kolom terechtkwam. `p_ids` is een lijst van twee, dus de contractuele
        //    uitkomst is 1 en 2 — precies de `ordinality` die de functie belooft
        //    te schrijven.
        //
        // ⚠️ **Wat hier níet meer staat, en waarom.** Er stond eerst een toets
        //    dat de twee posities van elkáár verschillen, tegen een aanvaller die
        //    élke mijlpaal op dezelfde waarde zet. Gemeten: dat kán niet.
        //    `milestones_goal_order_uniq` is UNIQUE op `(goal_id, order_index)`,
        //    dus zo'n schrijfactie valt om op de constraint en de RPC geeft een
        //    fout in plaats van een envelop. Een assertie die door geen enkele
        //    mutatie te bereiken is, bewaakt niets — en dit is er wél een die te
        //    voeden is.
        expect(
          Object.fromEntries((na.data ?? []).map((m) => [m.id as string, m.order_index])),
          'de functie belooft de positie uit `ordinality` te schrijven, dus 1 en 2',
        ).toEqual({ [idTwee]: 1, [idEen]: 2 });

        await admin.from('milestones').delete().in('id', [idEen, idTwee]);
      },
      TEST_TIMEOUT,
    );
  });
});
