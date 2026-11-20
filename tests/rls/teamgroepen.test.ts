import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Een teamgroep hoort bij een organisatie — QS8-653, criterium 8, 9 en 15.
 *
 * ⚠️ **Via PostgREST met het JWT van elke gebruiker**, dus langs dezelfde weg als
 *    de app. De teamgroep, het organisatielidmaatschap en `is_group_admin()` zijn
 *    elk apart correct; wat hier getoetst wordt is hun naad: wie mag erin, wie
 *    beheert, wie leest, en wat er gebeurt als iemand de organisatie verlaat.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 17-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0300 (nu 0317) opnieuw afgespeeld en weer
 *    15/15 groen):
 *
 *    1. `or public.is_teambeheerder(gid)` uit `is_group_admin()` → rood op
 *       "(a) beheert het team", "(a) zet een teamlid uit met verwijder_lid()"
 *       en "laat een beheerder geen verzoek van een buitenstaander aannemen"
 *       (die krijgt dan `not_admin` in plaats van `not_org_member`).
 *    2. `is_teambeheerder()` te breed: elke organisatiebeheerder overal
 *       beheerder → rood op 15(b) en 15(c), en alleen die twee.
 *    3. De controle in `join_group_with_code()` weg → alleen "geeft een
 *       buitenstaander met de code hetzelfde antwoord als een onbekende code"
 *       rood (de trigger vangt de insert nog, maar de weigering is niet meer
 *       gelijk aan die van een onbekende code).
 *    4. De trigger `group_members_teamlid` weg → "houdt een rechtstreekse
 *       insert van een buitenstaander tegen" rood, en daardoor ook de toets
 *       erna (de buitenstaander is dan al lid).
 *    5. De trigger `organization_members_vertrek_cascade` weg → beide toetsen
 *       van criterium 9 rood.
 *    6. De tak `is_teambeheerder()` uit `guard_group_member_update()` weg →
 *       alleen "(a) zet een teamlid uit met verwijder_lid()" rood.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string } | null;
}

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>): Promise<Antwoord> {
  const { data, error } = await wie.db.rpc(naam as never, args as never);
  return { data, error };
}

function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

async function rijen(wie: TestUser, tabel: string, kolom: string, waarde: string): Promise<number> {
  // ⚠️ Een expliciete kolom en geen `*`: `goals` heeft kolomgrants, en de app
  //    leest daar ook altijd een kolomlijst.
  const { data, error } = await wie.db.from(tabel as never).select(kolom).eq(kolom as never, waarde as never);
  expect(error).toBeNull();
  return (data as unknown[] | null)?.length ?? 0;
}

const organisaties: string[] = [];
const groepen: string[] = [];

async function maakOrganisatie(wie: TestUser, naam: string): Promise<string> {
  const a = await rpc(wie, 'maak_organisatie', { p_naam: naam });
  expect(a.error).toBeNull();
  const id = (a.data as { organization_id: string }).organization_id;
  organisaties.push(id);
  return id;
}

async function wordLid(beheerder: TestUser, wie: TestUser, org: string): Promise<void> {
  const code = await rpc(beheerder, 'organisatie_uitnodigcode', { p_organization_id: org });
  expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe('ok');
}

async function maakTeam(beheerder: TestUser, org: string, naam: string): Promise<string> {
  const a = await rpc(beheerder, 'maak_teamgroep', { p_organization_id: org, p_naam: naam });
  expect(uitkomst(a)).toBe('ok');
  const id = (a.data as { group_id: string }).group_id;
  groepen.push(id);
  registreerGroep(id);
  return id;
}

async function codeVanGroep(groep: string): Promise<string> {
  const { data, error } = await adminDb().from('groups').select('invite_code').eq('id', groep).single();
  expect(error).toBeNull();
  return (data as { invite_code: string }).invite_code;
}

async function lidStatus(groep: string, wie: TestUser): Promise<string | null> {
  const { data } = await adminDb()
    .from('group_members')
    .select('status')
    .eq('group_id', groep)
    .eq('user_id', wie.id)
    .maybeSingle();
  return (data as { status: string } | null)?.status ?? null;
}

/** Een doel van `wie`, door hemzelf gekoppeld aan `groep` (zoals delen met je team doet). */
async function deelDoel(wie: TestUser, groep: string): Promise<string> {
  const { data, error } = await wie.db
    .from('goals')
    .insert({ owner_id: wie.id, title: 'Aandeel', target_date: '2027-06-30' } as never)
    .select('id')
    .single();
  expect(error).toBeNull();
  const doel = (data as { id: string }).id;
  const link = await wie.db.from('goal_group_links').insert({ goal_id: doel, group_id: groep } as never);
  expect(link.error).toBeNull();
  return doel;
}

describe.runIf(rlsTestsConfigured)('een teamgroep hoort bij een organisatie (QS8-653)', () => {
  let anna: TestUser; // beheerder van organisatie X, geen lid van het team
  let bert: TestUser; // lid van X
  let cleo: TestUser; // lid van X
  let yara: TestUser; // beheerder van organisatie Y
  let zoe: TestUser; // in geen enkele organisatie
  let nina: TestUser; // maakt een gewone groep
  let dirk: TestUser; // lid van X, wordt door de organisatiebeheerder uit het team gezet
  let x: string;
  let team: string;
  let gewoon: string;

  beforeAll(async () => {
    [anna, bert, cleo, yara, zoe, nina, dirk] = await Promise.all([
      createTestUser('team-anna'),
      createTestUser('team-bert'),
      createTestUser('team-cleo'),
      createTestUser('team-yara'),
      createTestUser('team-zoe'),
      createTestUser('team-nina'),
      createTestUser('team-dirk'),
    ]);
    x = await maakOrganisatie(anna, 'Acme BV');
    await maakOrganisatie(yara, 'Andere Zaak');
    await wordLid(anna, bert, x);
    await wordLid(anna, cleo, x);
    await wordLid(anna, dirk, x);
    team = await maakTeam(anna, x, 'Team Zuid');

    const g = await rpc(nina, 'create_group', { group_name: 'Vrienden' });
    expect(uitkomst(g)).toBe('ok');
    gewoon = (g.data as { group: { id: string } }).group.id;
    groepen.push(gewoon);
    registreerGroep(gewoon);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('group_join_requests').delete().in('group_id', groepen);
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    if (organisaties.length > 0) {
      await admin.from('organization_members' as never).delete().in('organization_id' as never, organisaties as never);
      await admin.from('organizations' as never).delete().in('id' as never, organisaties as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('aanmaken', () => {
    it('laat alleen een organisatiebeheerder een team maken, en maakt hem geen lid', async () => {
      expect(uitkomst(await rpc(bert, 'maak_teamgroep', { p_organization_id: x, p_naam: 'Eigen' }))).toBe(
        'niet_toegestaan',
      );
      expect(uitkomst(await rpc(yara, 'maak_teamgroep', { p_organization_id: x, p_naam: 'Vreemd' }))).toBe(
        'niet_toegestaan',
      );
      expect(await lidStatus(team, anna)).toBeNull();
    }, TEST_TIMEOUT);

    it('pint de organisatie: niet weg te halen en niet later aan te hangen', async () => {
      const admin = adminDb();
      const weg = await admin.from('groups').update({ organization_id: null } as never).eq('id', team);
      expect(weg.error?.code).toBe('23514');
      const aan = await admin.from('groups').update({ organization_id: x } as never).eq('id', gewoon);
      expect(aan.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('maakt een teamgroep nooit vindbaar', async () => {
      const r = await adminDb()
        .from('groups')
        .update({ ontdekbaar: true, categorie: 'business' } as never)
        .eq('id', team);
      expect(r.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('geeft een teamgroep een plafond van 25 en een gewone groep 12', async () => {
      const admin = adminDb();
      expect((await admin.rpc('ledenplafond' as never, { gid: team } as never)).data).toBe(25);
      expect((await admin.rpc('ledenplafond' as never, { gid: gewoon } as never)).data).toBe(12);
    }, TEST_TIMEOUT);

    // ⚠️ De naad met 0309 (QS8-736), toegevoegd bij het hernummeren op 20-11-2026
    //    (security-ronde H1). 0309 liet `is_teamgroep()` een stub die altijd
    //    `false` gaf; 0317 maakt hem echt. Deze toets loopt de echte route: een
    //    organisatielid treedt met de code toe tot een team gemaakt met
    //    `maak_teamgroep()`, heeft de badge, en deelt toch niet.
    it('laat in een teamgroep geen prestatie delen (team_off, de stub van 0309 is vervangen)', async () => {
      const fien = await createTestUser('team-fien');
      await wordLid(anna, fien, x);
      const code = await codeVanGroep(team);
      expect(uitkomst(await rpc(fien, 'join_group_with_code', { code }))).toBe('ok');
      const badge = await adminDb().from('badges').insert({ user_id: fien.id, badge: 'first_goal' } as never);
      expect(badge.error).toBeNull();
      expect(uitkomst(await rpc(fien, 'deel_prestatie', { p_group_id: team, p_badge: 'first_goal' }))).toBe('team_off');
      const berichten = await adminDb()
        .from('chat_messages')
        .select('id')
        .eq('group_id', team)
        .eq('system_event', 'prestatie_gedeeld');
      expect(berichten.data ?? []).toHaveLength(0);
    }, TEST_TIMEOUT);
  });

  describe('criterium 8 — lid van het team vereist lid van de organisatie', () => {
    it('laat een organisatielid toe met de code', async () => {
      const code = await codeVanGroep(team);
      expect(uitkomst(await rpc(bert, 'join_group_with_code', { code }))).toBe('ok');
      expect(uitkomst(await rpc(cleo, 'join_group_with_code', { code }))).toBe('ok');
    }, TEST_TIMEOUT);

    it('geeft een buitenstaander met de code hetzelfde antwoord als een onbekende code', async () => {
      const code = await codeVanGroep(team);
      const metCode = await rpc(zoe, 'join_group_with_code', { code });
      const onbekend = await rpc(zoe, 'join_group_with_code', { code: 'BESTAATNIET99' });
      expect(uitkomst(metCode)).toBe('invalid');
      expect(JSON.stringify(metCode)).toBe(JSON.stringify(onbekend));
      expect(uitkomst(await rpc(yara, 'join_group_with_code', { code }))).toBe('invalid');
      expect(await lidStatus(team, zoe)).toBeNull();
    }, TEST_TIMEOUT);

    it('houdt een rechtstreekse insert van een buitenstaander tegen', async () => {
      const r = await adminDb()
        .from('group_members')
        .insert({ group_id: team, user_id: zoe.id, role: 'member', status: 'active' } as never);
      expect(r.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('laat een beheerder geen verzoek van een buitenstaander aannemen', async () => {
      const { data } = await adminDb()
        .from('group_join_requests')
        .insert({ group_id: team, user_id: zoe.id } as never)
        .select('id')
        .single();
      const verzoek = (data as { id: string }).id;
      expect(uitkomst(await rpc(anna, 'beslis_lidmaatschapsverzoek', { p_request_id: verzoek, p_naar: 'accepted' }))).toBe(
        'not_org_member',
      );
      expect(await lidStatus(team, zoe)).toBeNull();
    }, TEST_TIMEOUT);
  });

  describe('criterium 15 — een organisatiebeheerder beheert zonder te lezen', () => {
    it('(a) beheert het team: code roteren, verzoek beslissen, zichtbaarheid zetten', async () => {
      expect(uitkomst(await rpc(anna, 'rotate_invite_code', { p_group_id: team }))).toBe('ok');

      const { data } = await adminDb()
        .from('group_join_requests')
        .insert({ group_id: team, user_id: yara.id } as never)
        .select('id')
        .single();
      expect(
        uitkomst(await rpc(anna, 'beslis_lidmaatschapsverzoek', { p_request_id: (data as { id: string }).id, p_naar: 'declined' })),
      ).toBe('ok');

      // ⚠️ Sinds 0317 (vervroegd uit 0319 bij het hernummeren, 20-11-2026; H2 van de
      //    security-ronde) mag een teamgroep niet open tot QS8-661 landt. `unchanged`
      //    komt ná de beheerderspoort, dus bewijst dat anna erdoor mag; `open` stuit
      //    daarna op de CHECK, ook voor haar. Rood als 0317 de CHECK niet zet.
      expect(
        uitkomst(await rpc(anna, 'zet_groepszichtbaarheid', { p_group_id: team, p_naar: 'beschermd', p_bevestigd: true })),
      ).toBe('unchanged');
      expect(
        uitkomst(await rpc(anna, 'zet_groepszichtbaarheid', { p_group_id: team, p_naar: 'open', p_bevestigd: true })),
      ).toBe('fout 23514');
      // En de andere route: een team dat open aangemaakt wordt.
      expect(
        uitkomst(await rpc(anna, 'maak_teamgroep', { p_organization_id: x, p_naam: 'Open team', p_zichtbaarheid: 'open' })),
      ).toBe('fout 23514');
    }, TEST_TIMEOUT);

    it('(a) zet een teamlid uit met verwijder_lid(), zonder zelf lid te zijn', async () => {
      expect(uitkomst(await rpc(dirk, 'join_group_with_code', { code: await codeVanGroep(team) }))).toBe('ok');
      expect(
        uitkomst(await rpc(anna, 'verwijder_lid', { p_group_id: team, p_user_id: dirk.id, p_bevestigd: true })),
      ).toBe('ok');
      expect(await lidStatus(team, dirk)).toBe('inactive');
    }, TEST_TIMEOUT);

    it('(a) een organisatiebeheerder die zelf teamlid is, maakt zichzelf geen beheerder en zet zichzelf niet terug', async () => {
      // Security-review op QS8-653, H1 (gemeten): via de beheerderstak bereikte
      // hij de uitgang voor de eigen rij van een lid-beheerder.
      const tweede = await createTestUser('team-tweede-beheerder');
      await wordLid(anna, tweede, x);
      const { error: rolFout } = await adminDb()
        .from('organization_members' as never)
        .update({ role: 'admin' } as never)
        .eq('organization_id' as never, x as never)
        .eq('user_id' as never, tweede.id as never);
      expect(rolFout).toBeNull();

      expect(uitkomst(await rpc(anna, 'join_group_with_code', { code: await codeVanGroep(team) }))).toBe('ok');
      const promotie = await anna.db
        .from('group_members')
        .update({ role: 'admin' } as never)
        .eq('group_id', team)
        .eq('user_id', anna.id);
      expect(promotie.error).not.toBeNull();
      const { data: rol } = await adminDb()
        .from('group_members')
        .select('role')
        .eq('group_id', team)
        .eq('user_id', anna.id)
        .single();
      expect((rol as { role: string }).role).toBe('member');

      expect(
        uitkomst(await rpc(tweede, 'verwijder_lid', { p_group_id: team, p_user_id: anna.id, p_bevestigd: true })),
      ).toBe('ok');
      // ⚠️ **Zonder filter, met opzet.** Met een filter verbergt de leespolicy
      //    haar inactieve rij al en raakt de update nul rijen: dan is deze toets
      //    groen om een andere reden dan de bewaker. Zonder WHERE geldt alleen de
      //    USING van `group_members_update`, en dan moet de bewaker weigeren.
      const terug = await anna.db.from('group_members').update({ status: 'active' } as never);
      expect(terug.error).not.toBeNull();
      expect(await lidStatus(team, anna)).toBe('inactive');
    }, TEST_TIMEOUT);

    it('(a) leest er geen groep, geen leden, geen chat en geen overzicht', async () => {
      expect(await rijen(anna, 'groups', 'id', team)).toBe(0);
      expect(await rijen(anna, 'group_members', 'group_id', team)).toBe(0);
      expect(await rijen(anna, 'chat_messages', 'group_id', team)).toBe(0);
      const overzicht = await rpc(anna, 'group_overview', { p_group_id: team });
      const leeg = overzicht.error !== null || ((overzicht.data as unknown[] | null)?.length ?? 0) === 0;
      expect(leeg).toBe(true);
      // Ter vergelijking: een lid leest de groep wél.
      expect(await rijen(bert, 'groups', 'id', team)).toBe(1);
    }, TEST_TIMEOUT);

    it('(b) een beheerder van een andere organisatie heeft er geen enkel recht', async () => {
      expect(uitkomst(await rpc(yara, 'rotate_invite_code', { p_group_id: team }))).toBe('not_admin');
      expect(
        uitkomst(await rpc(yara, 'zet_groepszichtbaarheid', { p_group_id: team, p_naar: 'beschermd', p_bevestigd: true })),
      ).not.toBe('ok');
      expect(await rijen(yara, 'groups', 'id', team)).toBe(0);
    }, TEST_TIMEOUT);

    it('(c) voor een groep zonder organisatie verandert niets', async () => {
      expect(uitkomst(await rpc(anna, 'rotate_invite_code', { p_group_id: gewoon }))).toBe('not_admin');
      expect(uitkomst(await rpc(yara, 'rotate_invite_code', { p_group_id: gewoon }))).toBe('not_admin');
      expect(uitkomst(await rpc(nina, 'rotate_invite_code', { p_group_id: gewoon }))).toBe('ok');
    }, TEST_TIMEOUT);
  });

  describe('criterium 9 — wie de organisatie verlaat, is uit elk team', () => {
    it('zet een vertrekker inactief, ruimt zijn koppeling op, en niemand ziet zijn doel nog', async () => {
      const doel = await deelDoel(cleo, team);
      expect(await rijen(bert, 'goals', 'id', doel)).toBe(1);

      expect(uitkomst(await rpc(cleo, 'verlaat_organisatie', { p_organization_id: x }))).toBe('ok');

      expect(await lidStatus(team, cleo)).toBe('inactive');
      expect(await rijen(bert, 'goals', 'id', doel)).toBe(0);
      expect(await rijen(cleo, 'groups', 'id', team)).toBe(0);
      const { data } = await adminDb().from('goal_group_links').select('goal_id').eq('goal_id', doel);
      expect((data as unknown[]).length).toBe(0);
      // Zijn doel zelf blijft (besluit 14): alleen de koppeling vervalt.
      expect(await rijen(cleo, 'goals', 'id', doel)).toBe(1);
      // En het vertrek laat hetzelfde spoor na als verlaat_groep() (review, L3).
      const { data: spoor } = await adminDb()
        .from('group_events')
        .select('event_type')
        .eq('group_id', team)
        .eq('actor_id', cleo.id)
        .eq('event_type', 'member_left');
      expect((spoor as unknown[]).length).toBe(1);
    }, TEST_TIMEOUT);

    it('zet als organisatiebeheerder een teamlid uit, ook uit het team', async () => {
      expect(uitkomst(await rpc(anna, 'zet_organisatielid_uit', { p_organization_id: x, p_user_id: bert.id }))).toBe('ok');
      expect(await lidStatus(team, bert)).toBe('inactive');
      expect(await rijen(bert, 'groups', 'id', team)).toBe(0);
    }, TEST_TIMEOUT);
  });
});
