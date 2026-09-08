/**
 * Ná de beheerderstak toetst de guard niets meer — QS8-356.
 *
 * ⚠️ **De belofte is niet "een uitgezet lid komt niet terug".** Dat was het
 *    eerste ontwerp van dit issue, en het repareert één van de vier gemeten
 *    handelingen. De belofte is breder en een eigenschap van het geheel:
 *
 *      Een beheerder verandert niets aan de rol of de status van een ánder lid
 *      buiten de RPC's om, en wat hij wél mag laat een spoor.
 *
 * ⚠️⚠️ **Waarom dit geen `revoke` is.** Bij QS8-351 stond `group_members` UPDATE
 *    op de intreklijst, en 📏 die revoke maakte 21 bestaande tests in zeven
 *    bestanden rood. Dit pad heeft een doel: 0102 en 0187 zijn er juist voor
 *    gebouwd. Het gat zit in de gúard en niet in de grant.
 *
 * ⚠️ **De trigger vuurt óók voor `SECURITY DEFINER`-functies**, en dat is de val
 *    van dit issue. `auth.uid()` blijft binnen een definer-functie de aanroeper,
 *    dus `verwijder_lid()`, `verlaat_groep()` en `beslis_lidmaatschapsverzoek()`
 *    lopen door dezelfde beheerderstak. Een grendel die alleen naar "wat
 *    verandert er" kijkt, breekt ze alle drie. Vandaar de benoemde
 *    uitzonderingen, in de vorm die `join_group_with_code()` al gebruikt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

let bram: TestUser;
let carol: TestUser;

interface Groep {
  id: string;
  code: string;
  /** De oprichter, en dus de actieve beheerder van deze groep. */
  beheerder: TestUser;
}

/**
 * ⚠️⚠️ **Elke destructieve test krijgt zijn eigen groep, en dat is een
 *    gerepareerde opzet.** De eerste versie deelde één groep en herstelde de
 *    toestand met `adminDb()` ná de assertie — en 📏 vóór de reparatie faalt die
 *    assertie juist, dus het herstel liep nooit. Gevolg: de degradatie uit test 2
 *    bleef staan, anna was geen beheerder meer, en de vier tests daarna vielen om
 *    op `not_admin` in plaats van op wat ze zeggen te meten.
 *
 *    **Een opruimstap achter een assertie is geen opruimstap.** Een verse groep
 *    per test heeft die volgorde niet nodig.
 */
async function verseGroep(naam: string, leden: readonly TestUser[]): Promise<Groep> {
  // ⚠️⚠️ **Een eigen beheerder per groep, en dat is geen netheid maar een
  //    gerepareerde opzet.** `create_group()` staat er 📏 tien per gebruiker per
  //    dag toe (`daily_limit`), en dit bestand maakt er meer. Met één vaste
  //    oprichter viel de elfde test om op die limiet — een rode test met een
  //    melding die niets met deze guard te maken heeft.
  const beheerder = await createTestUser(`beheersgrens-${naam.toLowerCase().replace(/[^a-z]/g, '')}`);

  const g = await beheerder.db.rpc('create_group', { group_name: naam });
  if (g.error) throw new Error(`groep: ${g.error.message}`);
  const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);

  for (const wie of leden) {
    const mee = await wie.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
  }
  return { id: uit.group.id, code: uit.group.invite_code, beheerder };
}

/** De rij zoals `service_role` hem ziet — buiten elke policy om. */
async function lid(groepId: string, userId: string) {
  const { data } = await adminDb()
    .from('group_members')
    .select('role, status')
    .eq('group_id', groepId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

describe.runIf(rlsTestsConfigured)('een beheerder raakt de rol van een ander niet aan', () => {
  beforeAll(async () => {
    bram = await createTestUser('beheersgrens-bram');
    carol = await createTestUser('beheersgrens-carol');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de vier handelingen die de guard doorliet', () => {
    it(
      'weigert een beheerder die een ander tot beheerder promoveert',
      async () => {
        const groep = await verseGroep('Promotie', [bram]);

        const { error } = await groep.beheerder.db
          .from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', groep.id)
          .eq('user_id', bram.id);

        expect(error, 'de promotie landde').not.toBeNull();
        expect((await lid(groep.id, bram.id))?.role, 'bram is alsnog beheerder').toBe('member');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De overnameroute, en de zwaarste van de vier.** De `last_admin`-
     *    grendel toetst `old.user_id = auth.uid()` — alléén jezelf. Een tweede
     *    beheerder kon daarmee de oprichter degraderen, en 📏 er is geen weg
     *    terug: één treffer op `set role` in álle functiedefinities, en die zit
     *    in de overdracht van `verlaat_groep()`.
     */
    it(
      'weigert een beheerder die een mede-beheerder degradeert',
      async () => {
        const groep = await verseGroep('Degradatie', [bram]);

        // ⚠️ Met `adminDb()` en niet met een PATCH van de beheerder: dát pad is precies
        //    wat de test hierboven afsluit, en een opzet die daarop leunt meet
        //    niets meer zodra die reparatie werkt.
        const promotie = await adminDb()
          .from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', groep.id)
          .eq('user_id', bram.id);
        if (promotie.error) throw new Error(`promotie: ${promotie.error.message}`);

        const { error } = await bram.db
          .from('group_members')
          .update({ role: 'member' })
          .eq('group_id', groep.id)
          .eq('user_id', groep.beheerder.id);

        expect(error, 'de degradatie landde').not.toBeNull();
        expect((await lid(groep.id, groep.beheerder.id))?.role, 'de oprichter is gedegradeerd').toBe('admin');
      },
      TEST_TIMEOUT,
    );

    // ⚠️⚠️ **Hier stond "weigert een beheerder die een ander op paused zet", en
    //    die test is verhuisd omdat zijn slót verhuisd is.** 0199 hield dat geval
    //    tegen met een `raise pauze_van_een_ander` in deze guard; 0203 haalde de
    //    waarde uit de CHECK (QS8-325), dus wat hem nu weigert is
    //    `group_members_status_valid` en niet meer deze trigger.
    //
    // ⚠️ **Een must-deny die stil van slot wisselt, bewaakt iets anders dan hij
    //    belooft.** 📏 Deze test bléév groen na 0203 — hij toetste alleen dát er
    //    een fout kwam, niet welke. Hij staat nu in
    //    `tests/rls/pauze-bestaat-niet.test.ts`, mét de foutcode erbij, naast het
    //    geval dat de belofte draagt: ook `service_role` schrijft die stand niet.

    it(
      'weigert een beheerder die een uitgezet lid rechtstreeks terugzet',
      async () => {
        const groep = await verseGroep('Terugzetten', [carol]);

        const weg = await groep.beheerder.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: carol.id,
          p_bevestigd: true,
        });
        if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);
        const wegUit = (weg.data ?? {}) as { ok?: boolean; reason?: string };
        if (wegUit.ok !== true) throw new Error(`uitzetten: ${wegUit.reason ?? '-'}`);

        const { error } = await groep.beheerder.db
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', groep.id)
          .eq('user_id', carol.id);

        expect(error, 'het terugzetten landde').not.toBeNull();
        expect((await lid(groep.id, carol.id))?.status, 'carol is terug').toBe('inactive');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * ⚠️⚠️ **Deze twee zijn er ná de security-review op deze branch bij gekomen.**
   *    De eerste opzet liet `* → inactive` van een ander bewust staan, met als
   *    reden "uitzetten blijft een beheerdershandeling". Dat was te snel: het is
   *    een handeling die méér doet dan de status zetten, en een kale PATCH doet
   *    alleen het laatste.
   */
  describe('uitzetten loopt óók maar langs één weg', () => {
    it(
      'weigert een beheerder die een lid rechtstreeks uitzet',
      async () => {
        const groep = await verseGroep('Kale kick', [bram]);

        const { error } = await groep.beheerder.db
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', groep.id)
          .eq('user_id', bram.id);

        expect(error, 'de kale uitzetting landde').not.toBeNull();
        expect((await lid(groep.id, bram.id))?.status, 'bram is alsnog uitgezet').toBe('active');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De belofte is de opruiming en niet de weigering**, en dat is het
     *    verschil tussen deze test en de vorige. 📏 Gemeten met de kale PATCH:
     *    het openstaande deadline-verzoek bleef `open`, en
     *    `beslis_deadline_verzoek()` toetst alleen het lidmaatschap van de
     *    **beslisser** — dus een lid dat nog wél in de groep zit kon de
     *    streefdatum van een ex-lid verzetten en een verschuldigde straf
     *    terugzetten. Domeinregel 5 en 11.
     *
     *    Deze test toetst daarom wat er ná het uitzetten in de database staat en
     *    niet welke foutcode de PATCH gaf. Een latere reparatie die de weigering
     *    verplaatst maar de opruiming laat vallen, wordt hier rood.
     */
    it(
      'ruimt bij verwijder_lid() het openstaande deadline-verzoek op',
      async () => {
        const groep = await verseGroep('Opruiming', [bram]);

        const doel = await bram.db
          .from('goals')
          .insert({ owner_id: bram.id, title: 'Opruimdoel', target_date: '2026-11-07' })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);

        const link = await bram.db
          .from('goal_group_links')
          .insert({ goal_id: doel.data.id, group_id: groep.id });
        if (link.error) throw new Error(`koppeling: ${link.error.message}`);

        const vraag = await bram.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doel.data.id,
          p_group_id: groep.id,
          p_new_date: '2027-01-06',
          // ⚠️ `reason_too_short` — de RPC eist een echte toelichting. 📏 De eerste
          //    poging gaf die melding en niet een fout over de guard.
          p_reason: 'Ik heb meer tijd nodig omdat het project is uitgelopen.',
        });
        if (vraag.error) throw new Error(`verzoek: ${vraag.error.message}`);
        const vUit = (vraag.data ?? {}) as { ok?: boolean; reason?: string };
        if (vUit.ok !== true) throw new Error(`verzoek: ${vUit.reason ?? '-'}`);

        const weg = await groep.beheerder.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: bram.id,
          p_bevestigd: true,
        });
        if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);

        const verzoek = await adminDb()
          .from('deadline_requests')
          .select('status')
          .eq('goal_id', doel.data.id)
          .maybeSingle();
        expect(verzoek.data?.status, 'het verzoek bleef open na het uitzetten').not.toBe('open');

        const koppeling = await adminDb()
          .from('goal_group_links')
          .select('goal_id')
          .eq('goal_id', doel.data.id)
          .eq('group_id', groep.id);
        expect(koppeling.data ?? [], 'de koppeling bleef staan').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('de must-allows: de wegen die er wél horen te zijn', () => {
    /**
     * ⚠️ Deze drie staan er even hard in als de weigeringen hierboven. Een guard
     *    die ná de beheerderstak op álles werpt, haalt de vier tests hierboven
     *    moeiteloos en breekt elke RPC die een lidmaatschap aanraakt — en dat is
     *    precies wat er gebeurt als je vergeet dat de trigger óók voor
     *    `SECURITY DEFINER` vuurt.
     */
    it(
      'laat verwijder_lid() een lid nog uitzetten',
      async () => {
        const groep = await verseGroep('Uitzetten', [bram]);

        const weg = await groep.beheerder.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: bram.id,
          p_bevestigd: true,
        });

        expect(weg.error, 'de RPC hoort te werken').toBeNull();
        expect((weg.data ?? {}) as { ok?: boolean }).toMatchObject({ ok: true });
        expect((await lid(groep.id, bram.id))?.status).toBe('inactive');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat beslis_lidmaatschapsverzoek() een uitgezet lid weer toelaten',
      async () => {
        const groep = await verseGroep('Toelaten', [bram]);

        const weg = await groep.beheerder.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: bram.id,
          p_bevestigd: true,
        });
        if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);

        // ⚠️ `vraag_lidmaatschap_aan()` eist `groups.ontdekbaar` — 📏 nagemeten:
        //    zonder dat geeft hij `not_open`, hetzelfde antwoord als voor "bestaat
        //    niet". De kolom is niet client-schrijfbaar (📏
        //    `has_column_privilege(...) = false`), dus dit gaat met `adminDb()`.
        const zichtbaar = await adminDb()
          .from('groups')
          // ⚠️ `categorie` moet mee: `groups_ontdekbaar_heeft_categorie` eist
          //    `not ontdekbaar or categorie is not null`. Zonder die kolom faalt
          //    de opzet op een CHECK, en dan is de test rood om een reden die
          //    niets met deze guard te maken heeft.
          .update({ ontdekbaar: true, categorie: 'fitness' })
          .eq('id', groep.id);
        if (zichtbaar.error) throw new Error(`ontdekbaar: ${zichtbaar.error.message}`);

        const verzoek = await bram.db.rpc('vraag_lidmaatschap_aan', {
          p_group_id: groep.id,
          p_bericht: 'graag terug',
        });
        if (verzoek.error) throw new Error(`aanvragen: ${verzoek.error.message}`);
        const vUit = (verzoek.data ?? {}) as { ok?: boolean; reason?: string };
        if (vUit.ok !== true) throw new Error(`aanvragen: ${vUit.reason ?? '-'}`);

        // ⚠️ De RPC geeft alleen `{ok:true}` terug en geen id — 📏 nagemeten op
        //    `pg_get_functiondef()`, niet aangenomen. Het verzoek zelf lezen we
        //    daarom met `adminDb()`; dit is opzet en geen bewijsvoering.
        const rij = await adminDb()
          .from('group_join_requests')
          .select('id')
          .eq('group_id', groep.id)
          .eq('user_id', bram.id)
          // ⚠️ `pending` en niet `open` — 📏 de standaardwaarde van de kolom,
          //    gelezen uit het schema. `open` gaf nul rijen en dus een
          //    misleidende `.single()`-fout.
          .eq('status', 'pending')
          .single();
        if (rij.error) throw new Error(`verzoek lezen: ${rij.error.message}`);

        const besluit = await groep.beheerder.db.rpc('beslis_lidmaatschapsverzoek', {
          p_request_id: rij.data.id,
          p_naar: 'accepted',
        });

        expect(besluit.error, 'de RPC hoort te werken').toBeNull();
        expect((besluit.data ?? {}) as { ok?: boolean }).toMatchObject({ ok: true });
        expect((await lid(groep.id, bram.id))?.status, 'het lid kwam niet terug').toBe('active');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat verlaat_groep() het beheer nog overdragen',
      async () => {
        const groep = await verseGroep('Overdracht', [bram]);

        // ⚠️ **Mét een opvolger, en dat is de hele must-allow.** Zonder
        //    `p_nieuwe_beheerder` geeft de RPC `last_admin` en meet deze test
        //    niets — 📏 dat was de eerste versie, en hij was rood om een reden
        //    die niets met de guard te maken had. De overdracht is juist het
        //    geval dat de nieuwe grendel moet doorlaten: `verlaat_groep()` zet
        //    de rol van een ánder lid, precies wat er hierboven geweigerd wordt.
        const weg = await groep.beheerder.db.rpc('verlaat_groep', {
          p_group_id: groep.id,
          p_bevestigd: true,
          p_nieuwe_beheerder: bram.id,
        });

        expect(weg.error, 'de RPC hoort te werken').toBeNull();
        const uit = (weg.data ?? {}) as { ok?: boolean; reason?: string };
        expect(uit.ok, `verlaten mislukte: ${uit.reason ?? '-'}`).toBe(true);
        expect((await lid(groep.id, bram.id))?.role, 'het beheer is niet overgedragen').toBe(
          'admin',
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Deze must-allow is er gekomen doordat de ijking hem miste, en dat is
     *    de reden dat hij hier staat.**
     *
     *    📏 De vijfde mutatie — de vroege `return new` voor de eigen rij van de
     *    beheerder weghalen — maakte **geen enkele test rood**. Dat betekende
     *    niet dat die regel overbodig is, maar dat niets toetste wat hij
     *    doorlaat: een beheerder die zijn éigen beheerderschap opgeeft terwijl
     *    er een tweede beheerder is. `last_admin` (0102) staat dat met zoveel
     *    woorden toe; zonder die vroege uitgang zou `rol_van_een_ander` het
     *    alsnog weigeren.
     *
     *    **Een mutatie die niets rood maakt is een bevinding**, en dit is hoe de
     *    bevinding eruitzag: geen overbodige regel, maar een ongetoetste.
     */
    it(
      'laat een beheerder zijn eigen beheerderschap opgeven als er een tweede is',
      async () => {
        const groep = await verseGroep('Zelf-degraderen', [bram]);

        const tweede = await adminDb()
          .from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', groep.id)
          .eq('user_id', bram.id);
        if (tweede.error) throw new Error(`tweede beheerder: ${tweede.error.message}`);

        const { error } = await groep.beheerder.db
          .from('group_members')
          .update({ role: 'member' })
          .eq('group_id', groep.id)
          .eq('user_id', groep.beheerder.id);

        expect(error, 'de eigen degradatie werd geweigerd').toBeNull();
        expect((await lid(groep.id, groep.beheerder.id))?.role, 'de rol is niet gewijzigd').toBe('member');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De belofte van QS8-314: een update die niets verandert is een no-op en
     *    geen geweigerd verzoek. Een guard die op álles werpt haalt de
     *    weigertoetsen hierboven en breekt dit.
     */
    it(
      'laat een beheerder zijn eigen rij met dezelfde waarden overschrijven',
      async () => {
        const groep = await verseGroep('Noop', [bram]);

        const { error } = await groep.beheerder.db
          .from('group_members')
          .update({ role: 'admin', status: 'active' })
          .eq('group_id', groep.id)
          .eq('user_id', groep.beheerder.id);

        expect(error, 'een no-op hoort geen fout te geven').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
