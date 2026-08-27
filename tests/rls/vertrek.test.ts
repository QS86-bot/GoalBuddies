/**
 * QS8-57 / migratie 0102 — een groep verlaten zonder andere groepen te raken.
 *
 * ⚠️ **De belofte is niet "er is een RPC die een rij verwijdert".** Die zou
 *    zichzelf testen. De belofte van PRD 5.6 is een uitspraak over het gehéél:
 *    *vertrekken uit één groep verandert niets aan wat een ándere groep van je
 *    ziet, en wist bij niemand iets — niet bij de vertrekker en niet bij de
 *    groep.*
 *
 *    Die belofte kan breken terwijl elk onderdeel klopt. Eén `where` zonder
 *    `group_id` haalt je doel uit álle groepen. Eén `on delete cascade` die
 *    iemand later aan `group_members` hangt, wist geschiedenis. Een policy die
 *    te ruim blijft, laat de oud-groep meekijken. Geen van die drie is te zien
 *    aan een test die één tabel telt, en daarom staat `de naad` onderaan.
 *
 * ⚠️ **Elke "dit mag de groep niet meer zien"-toets heeft een positieve
 *    tegenhanger.** Zonder die tegenhanger bewijst een lege uitkomst alleen dat
 *    er iets anders stuk is — valkuil 10, drie keer misgegaan in dit project.
 *
 * ⚠️ **`magNietLanden()` en geen `expect(error).not.toBeNull()` bij de DELETE.**
 *    `group_members_delete` staat op `using (false)`, en RLS wéígert een DELETE
 *    niet: hij filtert de rij weg. De client krijgt 204 zonder fout (valkuil 5).
 *    De enige eigenschap die klopt is de uitkomst: staat de rij er nog?
 */
import { afterAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Groep {
  id: string;
  code: string;
}

function uitkomst(data: unknown): {
  ok?: boolean;
  reason?: string;
  gearchiveerd?: boolean;
  overgedragen_aan?: string | null;
  ontkoppelde_doelen?: number;
} {
  return (data ?? {}) as ReturnType<typeof uitkomst>;
}

describe.skipIf(!rlsTestsConfigured)('0102 — een groep verlaten', () => {
  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());
  /** Een streefdatum die verder weg ligt dan de huidige — anders is er niets te verschuiven. */
  const laterDanDeCyclus = addDays(cycle.endDate, 30);

  /**
   * ⚠️ **Elke test bouwt zijn eigen groep en zijn eigen mensen, en dat is geen
   *    verspilling.** Twee ingebouwde limieten maken een gedeelde opstelling
   *    onbruikbaar zodra deze suite groeit: `create_group()` staat tien groepen
   *    per gebruiker per dag toe (`daily_limit`) en `join_group_with_code()`
   *    tien actieve lidmaatschappen (`too_many_groups`). Beide zagen er in de
   *    eerste ronde uit als een kapotte policy en waren het niet — valkuil 17.
   *
   *    Het levert bovendien op wat `epic13.test.ts` in zijn kop vraagt: geen
   *    test die iets meet wat een vorige test heeft veranderd. Vertrekken ís een
   *    wijziging van de opstelling, dus dat risico is hier groter dan elders.
   *
   * ⚠️ Gebruikers zijn goedkoop sinds QS8-116: de harnas tekent zijn eigen
   *    tokens en logt niet in, dus er is geen aanmeldlimiet meer om rekening
   *    mee te houden.
   */
  interface Opstelling {
    /** Oprichter en enige beheerder. */
    readonly beheerder: TestUser;
    /** Gewoon lid van dezelfde groep. */
    readonly lid: TestUser;
    readonly groep: Groep;
  }

  async function maakGroep(
    eigenaar: TestUser,
    naam: string,
    zichtbaarheid?: 'beschermd' | 'open',
  ): Promise<Groep> {
    const { data, error } = await eigenaar.db.rpc(
      'create_group',
      zichtbaarheid === undefined ? { group_name: naam } : { group_name: naam, zichtbaarheid },
    );
    if (error) throw new Error(`groep ${naam} (HTTP): ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    return { id: g.group.id, code: g.group.invite_code };
  }

  async function doeMee(wie: TestUser, groep: Groep): Promise<void> {
    const { data, error } = await wie.db.rpc('join_group_with_code', { code: groep.code });
    if (error) throw new Error(`meedoen (HTTP): ${error.message}`);
    if (uitkomst(data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(data)}`);
  }

  async function opstelling(
    naam: string,
    zichtbaarheid?: 'beschermd' | 'open',
  ): Promise<Opstelling> {
    const beheerder = await createTestUser(`vertrek-beheerder-${naam}`);
    const lid = await createTestUser(`vertrek-lid-${naam}`);
    const groep = await maakGroep(beheerder, naam, zichtbaarheid);
    await doeMee(lid, groep);
    return { beheerder, lid, groep };
  }

  /**
   * Een gemiste week op een gekoppeld doel van `eigenaar`.
   *
   * ⚠️ `status` staat sinds 0023 op slot voor de eigenaar zelf, dus het zetten
   *    gaat via `adminDb()`. Dat is een omweg in de ópbouw en niet in wat
   *    getoetst wordt — precies zoals `epic13.test.ts` het doet.
   */
  async function gemisteWeek(eigenaar: TestUser, groupId: string): Promise<string> {
    const doel = await maakDoel(eigenaar, 'Doel met een gemiste week');
    await koppel(eigenaar, doel, groupId);

    const { data: week, error } = await adminDb()
      .from('weekly_goals')
      .insert({
        goal_id: doel,
        title: 'Deze week ging niet door',
        cycle_start_date: cycle.startDate,
        cycle_index: 1,
        status: 'missed',
      })
      .select('id')
      .single();
    if (error) throw new Error(`gemiste week: ${error.message}`);
    return week.id;
  }

  /** Hoeveel weekdoelen van dit doel ziet deze kijker? */
  async function zietWeken(kijker: TestUser, weekId: string): Promise<number> {
    const { data } = await kijker.db.from('weekly_goals').select('id').eq('id', weekId);
    return (data ?? []).length;
  }

  async function maakDoel(eigenaar: TestUser, titel: string): Promise<string> {
    const { data, error } = await eigenaar.db
      .from('goals')
      .insert({ owner_id: eigenaar.id, title: titel, target_date: cycle.endDate })
      .select('id')
      .single();
    if (error) throw new Error(`doel ${titel}: ${error.message}`);
    return data.id;
  }

  async function koppel(eigenaar: TestUser, goalId: string, groupId: string): Promise<void> {
    const { error } = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: groupId });
    if (error) throw new Error(`koppelen: ${error.message}`);
  }

  async function isLid(groupId: string, userId: string): Promise<boolean> {
    const { data } = await adminDb()
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
    return data !== null;
  }

  /** Ziet deze kijker dit doel? De vraag die `shares_group_with_goal()` beslist. */
  async function ziet(kijker: TestUser, goalId: string): Promise<boolean> {
    const { data } = await kijker.db.from('goals').select('id').eq('id', goalId).maybeSingle();
    return data !== null;
  }

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De poort
  // -------------------------------------------------------------------------

  it(
    'weigert zonder bevestiging, en laat het lidmaatschap staan',
    async () => {
      const o = await opstelling('bevestiging-verplicht');

      const { data, error } = await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id });

      expect(error).toBeNull();
      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('not_confirmed');
      expect(await isLid(o.groep.id, o.lid.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert iemand die geen lid is',
    async () => {
      const o = await opstelling('niet-jouw-groep');
      const vreemde = await createTestUser('vertrek-vreemde');

      const { data } = await vreemde.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('not_member');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gewoon lid vertrekken en legt het spoor in group_events',
    async () => {
      const o = await opstelling('gewoon-vertrek');

      const { data } = await o.lid.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });

      expect(uitkomst(data).ok).toBe(true);
      expect(await isLid(o.groep.id, o.lid.id)).toBe(false);

      const { data: gebeurtenissen } = await adminDb()
        .from('group_events')
        .select('event_type, actor_id')
        .eq('group_id', o.groep.id)
        .eq('event_type', 'member_left');
      expect(gebeurtenissen).toHaveLength(1);
      expect(gebeurtenissen?.[0]?.actor_id).toBe(o.lid.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'plaatst geen enkel systeembericht over het vertrek',
    async () => {
      const o = await opstelling('stil-vertrek');

      const voor = await adminDb()
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', o.groep.id);

      await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id, p_bevestigd: true });

      const na = await adminDb()
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', o.groep.id);

      // ⚠️ Domeinregel 7: de feed draagt uitsluitend positieve signalen. En zou
      //    "X is vertrokken" er wél in staan terwijl "X is eruit gezet"
      //    (`member_inactive`) verboden blijft, dan wordt de afwezigheid van het
      //    bericht zélf het signaal dat iemand eruit gezet is.
      expect(na.count).toBe(voor.count);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De laatste beheerder — het acceptatiecriterium dat er niet was
  // -------------------------------------------------------------------------

  it(
    'houdt de laatste beheerder tegen zolang er nog leden zijn',
    async () => {
      const o = await opstelling('laatste-beheerder');

      const { data } = await o.beheerder.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('last_admin');
      expect(await isLid(o.groep.id, o.beheerder.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een opvolger die geen lid is, en verandert niets',
    async () => {
      const o = await opstelling('vreemde-opvolger');
      const buitenstaander = await createTestUser('vertrek-buitenstaander');

      const { data } = await o.beheerder.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
        p_nieuwe_beheerder: buitenstaander.id,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('unknown_successor');
      expect(await isLid(o.groep.id, o.beheerder.id)).toBe(true);
      expect(await isLid(o.groep.id, buitenstaander.id)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert jezelf als opvolger',
    async () => {
      const o = await opstelling('opvolger-is-zelf');

      const { data } = await o.beheerder.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
        p_nieuwe_beheerder: o.beheerder.id,
      });

      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('successor_is_self');
      expect(await isLid(o.groep.id, o.beheerder.id)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'draagt over en vertrekt in één handeling',
    async () => {
      const o = await opstelling('overdracht');

      const { data } = await o.beheerder.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
        p_nieuwe_beheerder: o.lid.id,
      });

      expect(uitkomst(data).ok).toBe(true);
      expect(uitkomst(data).overgedragen_aan).toBe(o.lid.id);
      expect(uitkomst(data).gearchiveerd).toBe(false);

      const { data: opvolgerRij } = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id)
        .single();
      expect(opvolgerRij?.role).toBe('admin');
      expect(await isLid(o.groep.id, o.beheerder.id)).toBe(false);

      // ⚠️ De groep blijft levend. Zou hij hier archiveren, dan zou overdragen
      //    hetzelfde doen als weglopen zonder opvolger.
      const { data: g } = await adminDb()
        .from('groups')
        .select('status')
        .eq('id', o.groep.id)
        .single();
      expect(g?.status).toBe('active');

      const { data: gebeurtenissen } = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', o.groep.id)
        .in('event_type', ['admin_transferred', 'member_left']);
      expect(gebeurtenissen).toHaveLength(2);
    },
    TEST_TIMEOUT,
  );

  it(
    'archiveert de groep als het laatste lid vertrekt, zodat de code niemand meer binnenlaat',
    async () => {
      const eigenaar = await createTestUser('vertrek-eenzaam');
      const groep = await maakGroep(eigenaar, 'Laatste lid');
      const later = await createTestUser('vertrek-nakomer');

      const { data } = await eigenaar.db.rpc('verlaat_groep', {
        p_group_id: groep.id,
        p_bevestigd: true,
      });

      expect(uitkomst(data).ok).toBe(true);
      expect(uitkomst(data).gearchiveerd).toBe(true);

      const { data: g } = await adminDb()
        .from('groups')
        .select('status')
        .eq('id', groep.id)
        .single();
      expect(g?.status).toBe('archived');

      // ⚠️ Dit is waarom het archiveren erin zit en geen netjesheid is: zonder
      //    deze stap loopt een wildvreemde met de link binnen in een groep die
      //    niemand beheert.
      const { data: mee } = await later.db.rpc('join_group_with_code', { code: groep.code });
      expect(uitkomst(mee).ok).toBe(false);
      expect(uitkomst(mee).reason).toBe('archived');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Er is precies één route naar buiten
  // -------------------------------------------------------------------------

  it(
    'laat niemand een lidmaatschap wegschrijven met een kale DELETE',
    async () => {
      const o = await opstelling('geen-achterdeur');

      const rij = () =>
        adminDb()
          .from('group_members')
          .select('user_id, role')
          .eq('group_id', o.groep.id)
          .eq('user_id', o.lid.id);

      // Het gewone lid op zijn eigen rij.
      await magNietLanden(
        () =>
          o.lid.db
            .from('group_members')
            .delete()
            .eq('group_id', o.groep.id)
            .eq('user_id', o.lid.id),
        rij,
      );

      // En de beheerder op de rij van iemand anders — die tak zat óók in de oude
      // policy, en hij was zélf de bypass op de laatste-beheerder-eis.
      await magNietLanden(
        () =>
          o.beheerder.db
            .from('group_members')
            .delete()
            .eq('group_id', o.groep.id)
            .eq('user_id', o.lid.id),
        rij,
      );
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // `shares_group_with_goal()` — drie routes naar hetzelfde effect
  // -------------------------------------------------------------------------
  //
  // ⚠️ **Wat elk van deze drie bewijst, is niet hetzelfde — nagemeten.** Met het
  //    oude predicaat terug (en `verlaat_groep()` intact) blijft de eerste test
  //    hieronder groen en worden de tweede en de derde rood. De vertrekroute zit
  //    namelijk dubbel op slot: de RPC haalt de koppeling weg én het predicaat
  //    zou hem alsnog wegfilteren. Uitzetten en archiveren laten de koppeling
  //    staan en leunen dus volledig op het predicaat.
  //
  //    Dat verschil staat hier opgeschreven omdat het anders te makkelijk is om
  //    te denken dat deze drie tests hetzelfde slot bewaken. Haalt iemand later
  //    het ontkoppelen uit de RPC, dan is de eerste test de enige die dat merkt.

  it(
    'neemt het doel van een vertrokken eigenaar uit het zicht — en dat van een blijver niet',
    async () => {
      const o = await opstelling('zicht-na-vertrek');
      const blijver = await createTestUser('vertrek-blijver');
      await doeMee(blijver, o.groep);

      const doelVanVertrekker = await maakDoel(o.lid, 'Ik vertrek');
      const doelVanBlijver = await maakDoel(blijver, 'Ik blijf');
      await koppel(o.lid, doelVanVertrekker, o.groep.id);
      await koppel(blijver, doelVanBlijver, o.groep.id);

      // ⚠️ De positieve controle vóóraf. Zonder deze twee regels bewijst `false`
      //    hieronder alleen dat er iets anders stuk is (valkuil 10).
      expect(await ziet(o.beheerder, doelVanVertrekker)).toBe(true);
      expect(await ziet(o.beheerder, doelVanBlijver)).toBe(true);

      await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id, p_bevestigd: true });

      expect(await ziet(o.beheerder, doelVanVertrekker)).toBe(false);
      // ⚠️ En de tegenhanger ná afloop: een blijver blijft gewoon zichtbaar. Een
      //    reparatie die álles dichtzet, is even stuk als een die niets doet.
      expect(await ziet(o.beheerder, doelVanBlijver)).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'neemt het doel van een uitgezet lid uit het zicht van de groep',
    async () => {
      const o = await opstelling('zicht-na-uitzetten');

      const doel = await maakDoel(o.lid, 'Ik word uitgezet');
      await koppel(o.lid, doel, o.groep.id);
      expect(await ziet(o.beheerder, doel)).toBe(true);

      // ⚠️ Route (b) uit de kop van 0102: 0029 zette de `inactive`-toets op de
      //    kijker en vergat de eigenaar.
      await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id);

      expect(await ziet(o.beheerder, doel)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'neemt elk doel uit het zicht zodra de groep gearchiveerd is',
    async () => {
      const o = await opstelling('zicht-na-archiveren');

      const doel = await maakDoel(o.lid, 'Doel in een archief');
      await koppel(o.lid, doel, o.groep.id);
      expect(await ziet(o.beheerder, doel)).toBe(true);

      // ⚠️ Route (c): 0092 zette de archieftoets in `is_group_member()` en
      //    `is_group_admin()`, en `shares_group_with_goal()` gebruikt geen van
      //    beide — dus een archief bleef doelen uitdelen.
      await o.beheerder.db.rpc('archiveer_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });

      expect(await ziet(o.beheerder, doel)).toBe(false);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De open groep — waar de gevoeligste kolom van allemaal doorheen komt
  // -------------------------------------------------------------------------
  //
  // ⚠️ **Deze drie tests bestaan omdat de eerste versie ze niet had, en dat was
  //    precies de fout uit regel 18, vraag 3.** `ziet()` hierboven leest `goals`,
  //    en `opstelling()` maakte via `create_group(group_name)` altijd een
  //    **beschermde** groep. `weekly_goals_select` heeft sinds 0077 een dérde
  //    tak — `deelt_open_groep_met_doel()` — die alleen in een open groep afgaat
  //    en die de gemiste weken doorlaat. Die tak kon per constructie nooit rood
  //    worden, en de reparatie in `shares_group_with_goal()` liep er dus
  //    volledig omheen: 446 tests groen, en een uitgezet lid deelde nog steeds
  //    zijn gemiste weken met de groep.
  //
  //    Gevonden door de security-review van 27-08, niet door deze suite.

  it(
    'laat een open groep de gemiste week van een actief lid gewoon zien',
    async () => {
      const o = await opstelling('open-tegentest', 'open');
      const week = await gemisteWeek(o.lid, o.groep.id);

      // ⚠️ De positieve tegenhanger van de twee tests hieronder. Zonder deze zou
      //    een reparatie die de open-groepstak volledig dichttimmert er even
      //    groen uitzien als een reparatie die klopt — en dan is besluit A41
      //    stilletjes teruggedraaid.
      expect(await zietWeken(o.beheerder, week)).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'verbergt de gemiste week zodra de eigenaar uit de open groep gezet is',
    async () => {
      const o = await opstelling('open-uitgezet', 'open');
      const week = await gemisteWeek(o.lid, o.groep.id);
      expect(await zietWeken(o.beheerder, week)).toBe(1);

      await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id);

      expect(await zietWeken(o.beheerder, week)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'verbergt de gemiste week zodra de open groep gearchiveerd is',
    async () => {
      const o = await opstelling('open-archief', 'open');
      const week = await gemisteWeek(o.lid, o.groep.id);
      expect(await zietWeken(o.beheerder, week)).toBe(1);

      await o.beheerder.db.rpc('archiveer_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });

      expect(await zietWeken(o.beheerder, week)).toBe(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De deuren náást de knop
  // -------------------------------------------------------------------------
  //
  // ⚠️ **De belofte is niet "de RPC weigert netjes" maar "er blijft geen groep
  //    achter die niemand kan beheren".** Een test op de RPC alleen bewijst het
  //    eerste. Deze drie toetsen de andere bewerkingen die hetzelfde effect
  //    bereiken — en alle drie werkten ze tot de review van 27-08.

  it(
    'laat de enige beheerder zichzelf niet op inactief zetten — en weigert luid',
    async () => {
      const o = await opstelling('deur-inactief');

      const poging = await o.beheerder.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', o.groep.id)
        .eq('user_id', o.beheerder.id);

      // ⚠️ Hier mág op de foutcode getoetst worden, en dat is het verschil met de
      //    DELETE hierboven: dit is een `raise` uit een trigger (P0001) en geen
      //    rij die RLS wegfiltert. Een stille weigering zou hier het verkeerde
      //    faalgedrag zijn — de beheerder denkt dan dat hij weg is.
      expect(poging.error).not.toBeNull();
      expect(poging.error?.message).toContain('last_admin');

      const { data: na } = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', o.groep.id)
        .eq('user_id', o.beheerder.id)
        .single();
      expect(na?.status).toBe('active');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een beheerder wél een ánder lid uitzetten',
    async () => {
      const o = await opstelling('deur-ander-uitzetten');

      // ⚠️ De tegenhanger. De grendel hierboven mag alleen de eigen rij raken;
      //    zou hij breder zijn, dan is uitzetten kapot en merkt niemand het tot
      //    er iemand uitgezet moet worden.
      const poging = await o.beheerder.db
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id);
      expect(poging.error).toBeNull();

      const { data: na } = await adminDb()
        .from('group_members')
        .select('status')
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id)
        .single();
      expect(na?.status).toBe('inactive');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een gewoon lid geen overdracht verzinnen in de groepsgeschiedenis',
    async () => {
      const o = await opstelling('deur-valse-audit');
      const derde = await createTestUser('vertrek-derde');
      await doeMee(derde, o.groep);

      const { data } = await o.lid.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
        p_nieuwe_beheerder: derde.id,
      });

      // ⚠️ De `update` werd al tegengehouden door `guard_group_member_update()`,
      //    maar de `group_events`-rij ernaast werd wél geschreven en de RPC gaf
      //    `ok: true` met `overgedragen_aan` erin. Een vertrekker kon zo een
      //    bewering over iemand anders in de onveranderlijke geschiedenis zetten
      //    die hij daarna niet meer kon toelichten — hij is weg, en élk lid leest
      //    `group_events`.
      expect(uitkomst(data).ok).toBe(false);
      expect(uitkomst(data).reason).toBe('not_admin');

      const { data: gebeurtenissen } = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', o.groep.id)
        .eq('event_type', 'admin_transferred');
      expect(gebeurtenissen).toHaveLength(0);

      const { data: rol } = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', o.groep.id)
        .eq('user_id', derde.id)
        .single();
      expect(rol?.role).toBe('member');
    },
    TEST_TIMEOUT,
  );

  it(
    'archiveert de solo-groep van iemand die zijn account verwijdert',
    async () => {
      const solo = await createTestUser('vertrek-solo');
      const groep = await maakGroep(solo, 'Solo-groep');
      const vreemde = await createTestUser('vertrek-vreemde-na-solo');

      const { data } = await solo.db.rpc('verwijder_mijn_account');
      expect(uitkomst(data).ok).toBe(true);

      // ⚠️ Tweede route naar hetzelfde effect als §6b van 0102. Zonder deze stap
      //    bleef er een `active` groep staan met nul leden en een werkende
      //    uitnodigingscode, en liep een wildvreemde er als enig, niet-beherend
      //    lid binnen.
      const { data: g } = await adminDb()
        .from('groups')
        .select('status')
        .eq('id', groep.id)
        .single();
      expect(g?.status).toBe('archived');

      const { data: mee } = await vreemde.db.rpc('join_group_with_code', { code: groep.code });
      expect(uitkomst(mee).ok).toBe(false);
      expect(uitkomst(mee).reason).toBe('archived');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Openstaande goedkeuringen en verzoeken
  // -------------------------------------------------------------------------

  it(
    'laat de goedkeuringen staan die de vertrekker gegeven heeft',
    async () => {
      const o = await opstelling('gegeven-oordelen');

      const doel = await maakDoel(o.beheerder, 'Doel dat goedgekeurd wordt');
      await koppel(o.beheerder, doel, o.groep.id);

      const { data: week } = await o.beheerder.db
        .from('weekly_goals')
        .insert({
          goal_id: doel,
          title: 'Week die goedgekeurd wordt',
          cycle_start_date: cycle.startDate,
          cycle_index: 1,
        })
        .select('id')
        .single();

      const { data: voltooiing } = await o.beheerder.db
        .from('completions')
        .insert({
          weekly_goal_id: week?.id ?? '',
          user_id: o.beheerder.id,
          achieved_level: 'ceiling',
          note: 'Gedaan wat ik zei',
          cycle_start_date: cycle.startDate,
        })
        .select('id')
        .single();

      await adminDb().from('weekly_goals').update({ status: 'pending' }).eq('id', week?.id ?? '');

      const { error: oordeelFout } = await o.lid.db.from('completion_approvals').insert({
        completion_id: voltooiing?.id ?? '',
        approver_id: o.lid.id,
        subject_id: o.lid.id,
        group_id: o.groep.id,
        status: 'approved',
      });
      expect(oordeelFout).toBeNull();

      const puntenVoor = await adminDb()
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', o.beheerder.id);

      const { data: uit } = await o.lid.db.rpc('verlaat_groep', {
        p_group_id: o.groep.id,
        p_bevestigd: true,
      });
      expect(uitkomst(uit).ok).toBe(true);

      // ⚠️ Domeinregel 6: geschiedenis is append-only. Zou het vertrek de
      //    goedkeuring intrekken, dan valt de week van de ánder terug naar
      //    `pending` en verdwijnen zijn punten — dan verandert jouw vertrek zijn
      //    score.
      const { data: oordeel } = await adminDb()
        .from('completion_approvals')
        .select('approver_id, status')
        .eq('completion_id', voltooiing?.id ?? '')
        .single();
      expect(oordeel?.approver_id).toBe(o.lid.id);
      expect(oordeel?.status).toBe('approved');

      const { data: weekNa } = await adminDb()
        .from('weekly_goals')
        .select('status')
        .eq('id', week?.id ?? '')
        .single();
      expect(weekNa?.status).toBe('approved');

      const puntenNa = await adminDb()
        .from('points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', o.beheerder.id);
      expect(puntenNa.count).toBe(puntenVoor.count);
    },
    TEST_TIMEOUT,
  );

  it(
    'trekt een openstaand deadline-verzoek van de vertrekker in deze groep in',
    async () => {
      const o = await opstelling('deadline-verzoek');

      const doel = await maakDoel(o.lid, 'Doel met een verzoek');
      await koppel(o.lid, doel, o.groep.id);

      // ⚠️ Via de RPC en niet met een `insert`. `deadline_requests` heeft geen
      //    INSERT-policy voor een client — het verzoek loopt sinds 0032 langs
      //    `vraag_deadline_verschuiving()`, die de dagelijkse limiet en de
      //    eigendomstoets doet. Een `insert` hier gaf `42501` en dat was terecht.
      const { data: gevraagd, error: verzoekFout } = await o.lid.db.rpc(
        'vraag_deadline_verschuiving',
        {
          p_goal_id: doel,
          p_group_id: o.groep.id,
          p_new_date: laterDanDeCyclus,
          p_reason: 'Ik heb hier echt meer tijd voor nodig dan ik van tevoren dacht.',
        },
      );
      expect(verzoekFout).toBeNull();
      expect(uitkomst(gevraagd).ok).toBe(true);

      const { data: verzoek } = await adminDb()
        .from('deadline_requests')
        .select('id')
        .eq('goal_id', doel)
        .eq('group_id', o.groep.id)
        .single();

      await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id, p_bevestigd: true });

      const { data: na } = await adminDb()
        .from('deadline_requests')
        .select('status, decided_by')
        .eq('id', verzoek?.id ?? '')
        .single();

      // ⚠️ `withdrawn` en niet `rejected`: niemand heeft dit afgewezen.
      expect(na?.status).toBe('withdrawn');
      expect(na?.decided_by).toBeNull();

      // ⚠️ En dit is waarom het erin zit. `beslis_deadline_verzoek()` toetst het
      //    lidmaatschap van de béslisser, nooit dat van de aanvrager — nagemeten
      //    met `pg_get_functiondef()`, niet uit het migratiebestand gelezen.
      //    Bleef het verzoek `open`, dan kon de groep die je zojuist verlaten
      //    hebt je streefdatum nog verzetten.
      const { data: alsnog } = await o.beheerder.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoek?.id ?? '',
        p_akkoord: true,
      });
      expect(uitkomst(alsnog).ok).toBe(false);
      expect(uitkomst(alsnog).reason).toBe('already_decided');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat het minpunt staan: vertrekken zet de grendel van 0066 niet terug',
    async () => {
      const o = await opstelling('grendel');

      const doel = await maakDoel(o.lid, 'Doel met een lopende week');
      await koppel(o.lid, doel, o.groep.id);

      const { data: week } = await o.lid.db
        .from('weekly_goals')
        .insert({
          goal_id: doel,
          title: 'Week die nog loopt',
          cycle_start_date: cycle.startDate,
          cycle_index: 1,
        })
        .select('id, beoordeelbaar')
        .single();

      expect(week?.beoordeelbaar).toBe(true);

      await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id, p_bevestigd: true });

      // ⚠️ Dit is exact de vorm die 0066 moest dichten: ontkoppel op vrijdag,
      //    laat de rollover langsgaan, koppel maandag terug. Vertrekken mag geen
      //    tweede route naar hetzelfde effect zijn.
      const { data: na } = await adminDb()
        .from('weekly_goals')
        .select('beoordeelbaar')
        .eq('id', week?.id ?? '')
        .single();
      expect(na?.beoordeelbaar).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een vertrokken lid opnieuw meedoen, maar herstelt zijn koppeling niet',
    async () => {
      const o = await opstelling('terugkomen');

      const doel = await maakDoel(o.lid, 'Doel dat losgaat');
      await koppel(o.lid, doel, o.groep.id);

      await o.lid.db.rpc('verlaat_groep', { p_group_id: o.groep.id, p_bevestigd: true });
      await doeMee(o.lid, o.groep);

      const { data: lid } = await adminDb()
        .from('group_members')
        .select('role, status')
        .eq('group_id', o.groep.id)
        .eq('user_id', o.lid.id)
        .single();
      expect(lid?.status).toBe('active');
      expect(lid?.role).toBe('member');

      // ⚠️ Koppelen is een aparte handeling, want koppelen ís de toestemming.
      //    Zou toetreden hem herstellen, dan geef je toestemming door een deur
      //    binnen te lopen.
      const { data: koppelingen } = await adminDb()
        .from('goal_group_links')
        .select('goal_id')
        .eq('group_id', o.groep.id)
        .eq('goal_id', doel);
      expect(koppelingen).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De naad — regel 18
  // -------------------------------------------------------------------------
  //
  // ⚠️ **Waarom dit de naad is en de tests hierboven niet.** Die toetsen elk een
  //    ónderdeel: één tabel, één policy, één redencode. De belofte van QS8-57 is
  //    een uitspraak over het gehéél, en die kan breken terwijl elk onderdeel
  //    klopt: één `where` zonder `group_id` in de RPC, of een cascade die iemand
  //    later aan `group_members` hangt.
  //
  // ⚠️ **Met de hand rood gemaakt vóórdat hij groen verklaard werd** (CLAUDE.md,
  //    regel 18, vraag 3). `and l.group_id = p_group_id` uit `verlaat_groep()`
  //    gehaald: deze test werd rood op de koppeling met de tweede groep, en géén
  //    van de tests hierboven merkte er iets van. Dat is precies waar hij voor
  //    bestaat.

  it(
    'de naad: vertrekken uit één groep laat de andere groep letterlijk ongemoeid',
    async () => {
      const eerste = await opstelling('naad-een');
      const tweedeBeheerder = await createTestUser('vertrek-naad-twee');
      const tweede = await maakGroep(tweedeBeheerder, 'Naad groep twee');
      await doeMee(eerste.lid, tweede);

      // Eén doel, aan twee groepen.
      const doel = await maakDoel(eerste.lid, 'Doel in twee groepen');
      await koppel(eerste.lid, doel, eerste.groep.id);
      await koppel(eerste.lid, doel, tweede.id);

      const { data: week } = await eerste.lid.db
        .from('weekly_goals')
        .insert({
          goal_id: doel,
          title: 'Week die blijft bestaan',
          cycle_start_date: cycle.startDate,
          cycle_index: 1,
        })
        .select('id')
        .single();

      await eerste.lid.db.from('completions').insert({
        weekly_goal_id: week?.id ?? '',
        user_id: eerste.lid.id,
        achieved_level: 'ceiling',
        note: 'Deze mag niet verdwijnen',
        cycle_start_date: cycle.startDate,
      });

      await eerste.lid.db.from('chat_messages').insert({
        group_id: eerste.groep.id,
        sender_id: eerste.lid.id,
        body: 'Ik zeg hier iets, en dat blijft staan',
      });

      // De vingerafdruk van álles wat er aan geschiedenis is, vóór het vertrek.
      const vingerafdruk = async (): Promise<Record<string, number | null>> => {
        const db = adminDb();
        const tel = async (
          tabel: 'completions' | 'weekly_goals' | 'chat_messages' | 'points_ledger',
          kolom: string,
          waarde: string,
        ): Promise<number | null> =>
          (await db.from(tabel).select('*', { count: 'exact', head: true }).eq(kolom, waarde))
            .count;

        return {
          weken: await tel('weekly_goals', 'goal_id', doel),
          voltooiingen: await tel('completions', 'user_id', eerste.lid.id),
          berichtenInDeVerlatenGroep: await tel('chat_messages', 'group_id', eerste.groep.id),
          punten: await tel('points_ledger', 'user_id', eerste.lid.id),
        };
      };

      const voor = await vingerafdruk();

      // ⚠️ Wat de ándere groep van dit doel ziet, veld voor veld — dat is de
      //    belofte van PRD 5.6 op zijn smalst: "zonder dat mijn doel uit andere
      //    groepen verdwijnt".
      const rijInTweede = async (): Promise<unknown> => {
        const { data } = await tweedeBeheerder.db
          .from('goals')
          .select('id, title, target_date, status')
          .eq('id', doel)
          .maybeSingle();
        return data;
      };

      const tweedeVoor = await rijInTweede();
      expect(tweedeVoor).not.toBeNull();

      const { data: uit } = await eerste.lid.db.rpc('verlaat_groep', {
        p_group_id: eerste.groep.id,
        p_bevestigd: true,
      });
      expect(uitkomst(uit).ok).toBe(true);
      expect(uitkomst(uit).ontkoppelde_doelen).toBe(1);

      // 1. De andere groep ziet exact hetzelfde als daarvoor.
      expect(await rijInTweede()).toEqual(tweedeVoor);

      // 2. De koppeling met de andere groep staat er nog, die met deze niet.
      const { data: koppelingen } = await adminDb()
        .from('goal_group_links')
        .select('group_id')
        .eq('goal_id', doel);
      expect(koppelingen?.map((k) => k.group_id)).toEqual([tweede.id]);

      // 3. Er is geen enkele rij geschiedenis verdwenen.
      expect(await vingerafdruk()).toEqual(voor);

      // 4. En de groep die hij verliet, ziet hem niet meer.
      expect(await ziet(eerste.beheerder, doel)).toBe(false);
    },
    TEST_TIMEOUT,
  );
});
