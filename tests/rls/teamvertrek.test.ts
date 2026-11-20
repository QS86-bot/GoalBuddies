import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, psqlParallel, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Vertrek en accountverwijdering met aandelen — QS8-659, migratie 0322.
 *
 * De beloftes:
 *
 * - **Acceptatie 9.** Na vertrek uit de organisatie (zelf of uitgezet) is de
 *   gebruiker inactief in élke teamgroep, ziet hij niets meer van het team, ziet
 *   niemand zijn aandeeldoel, en daalt de teambalk niet.
 * - **Accountverwijdering** laat geen persoonsspoor in de teller achter, en de
 *   balk daalt ook dan niet.
 * - **Besluit 2 van Quinten (18-11-2026).** Verdwijnt de laatste actieve
 *   beheerder, langs welke route ook, dan trekt de database de uitnodigcode in.
 *   Niemand krijgt een rol, en het wisrecht blijft onverkort: de verwijdering
 *   lukt altijd. Met twee beheerders blijft de code geldig (must-allow).
 * - **A1.** Accountverwijdering archiveert geen teamgroep meer; een gewone
 *   solo-groep nog wel.
 * - **De naad:** twee beheerders die tegelijk hun account verwijderen. Elk
 *   statement klopt los; zonder lock en hertelling ziet elk van beide de ander
 *   nog als beheerder, en blijft de code open. Met twee echte psql-sessies,
 *   onderaan.
 *
 * ⚠️ De organisatietabellen en -RPC's staan nog niet in
 *    `src/lib/database.types.ts` (een afschrift van productie), vandaar
 *    `as never` op de namen.
 */

const SETUP_TIMEOUT = 300_000;
const TEST_TIMEOUT = 120_000;

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string } | null;
}

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown> = {}): Promise<Antwoord> {
  const { data, error } = await wie.db.rpc(naam as never, args as never);
  return { data, error };
}

function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'} ${a.error.message ?? ''}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

function streefdatum(dagen: number): string {
  return new Date(Date.now() + dagen * 86_400_000).toISOString().slice(0, 10);
}

const organisaties: string[] = [];
const groepen: string[] = [];

async function maakOrganisatie(wie: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const o = await rpc(wie, 'maak_organisatie', { p_naam: naam });
  expect(uitkomst(o)).toBe('ok');
  const id = (o.data as { organization_id: string }).organization_id;
  organisaties.push(id);
  const c = await rpc(wie, 'organisatie_uitnodigcode', { p_organization_id: id });
  return { id, code: (c.data as { code: string }).code };
}

async function maakTeam(beheerder: TestUser, org: string, naam: string): Promise<{ id: string; code: string }> {
  const t = await rpc(beheerder, 'maak_teamgroep', { p_organization_id: org, p_naam: naam });
  expect(uitkomst(t)).toBe('ok');
  const id = (t.data as { group_id: string }).group_id;
  groepen.push(id);
  registreerGroep(id);
  const { data } = await adminDb().from('groups').select('invite_code').eq('id', id).single();
  return { id, code: (data as { invite_code: string }).invite_code };
}

async function codeStand(org: string): Promise<{ invite_revoked: boolean; created_by: string | null }> {
  const { data, error } = await adminDb()
    .from('organizations' as never)
    .select('invite_revoked, created_by')
    .eq('id' as never, org as never)
    .single();
  expect(error).toBeNull();
  return data as unknown as { invite_revoked: boolean; created_by: string | null };
}

async function beheerders(org: string): Promise<number> {
  const { count } = await adminDb()
    .from('organization_members' as never)
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id' as never, org as never)
    .eq('role' as never, 'admin' as never)
    .eq('status' as never, 'active' as never);
  return count ?? -1;
}

describe.runIf(rlsTestsConfigured)('vertrek en accountverwijdering met aandelen (QS8-659)', () => {
  let anna: TestUser; // organisatiebeheerder, geen teamlid
  let bert: TestUser; // blijft
  let cleo: TestUser; // vertrekt zelf
  let dirk: TestUser; // wordt uitgezet
  let eva: TestUser; // verwijdert haar account
  let org: string;
  let teamA: { id: string; code: string };
  let teamB: { id: string; code: string };
  let teamdoel: string;
  const aandeel: Record<string, string> = {};

  async function balk(wie: TestUser = bert): Promise<unknown> {
    const { data, error } = await wie.db.rpc('teambalk' as never, { p_team_goal_id: teamdoel } as never);
    expect(error).toBeNull();
    return data;
  }

  let volgnummer = 10;
  async function gedaneMijlpaal(wie: TestUser): Promise<string> {
    volgnummer += 1;
    const { data, error } = await wie.db
      .from('milestones')
      .insert({ goal_id: aandeel[wie.id], title: `Stap ${volgnummer}`, order_index: volgnummer } as never)
      .select('id')
      .single();
    expect(error).toBeNull();
    const id = (data as { id: string }).id;
    expect((await wie.db.from('milestones').update({ status: 'done' } as never).eq('id', id)).error).toBeNull();
    return id;
  }

  beforeAll(async () => {
    [anna, bert, cleo, dirk, eva] = await Promise.all([
      createTestUser('vertrek-anna'),
      createTestUser('vertrek-bert'),
      createTestUser('vertrek-cleo'),
      createTestUser('vertrek-dirk'),
      createTestUser('vertrek-eva'),
    ]);
    const o = await maakOrganisatie(anna, 'Vertrek BV');
    org = o.id;
    for (const wie of [bert, cleo, dirk, eva]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: o.code }))).toBe('ok');
    }
    teamA = await maakTeam(anna, org, 'Team A');
    teamB = await maakTeam(anna, org, 'Team B');
    for (const wie of [bert, cleo, dirk, eva]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: teamA.code }))).toBe('ok');
    }
    for (const wie of [bert, cleo, dirk]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: teamB.code }))).toBe('ok');
    }
    const td = await rpc(bert, 'maak_teamdoel', { p_group_id: teamA.id, p_titel: 'Samen', p_streefdatum: streefdatum(90) });
    expect(uitkomst(td)).toBe('ok');
    teamdoel = (td.data as { team_goal_id: string }).team_goal_id;
    for (const wie of [bert, cleo, dirk, eva]) {
      const a = await rpc(wie, 'neem_aandeel', { p_team_goal_id: teamdoel });
      expect(uitkomst(a)).toBe('ok');
      aandeel[wie.id] = (a.data as { goal_id: string }).goal_id;
      await gedaneMijlpaal(wie);
    }
    expect(await balk()).toBe(4);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('team_goals' as never).delete().in('group_id' as never, groepen as never);
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

  /** Wat de vertrekker na vertrek nog van het team ziet, en wat bert van hem ziet. */
  async function naVertrek(wie: TestUser): Promise<void> {
    const { data: lid } = await adminDb()
      .from('group_members')
      .select('group_id, status')
      .eq('user_id', wie.id)
      .in('group_id', [teamA.id, teamB.id]);
    for (const r of lid as { group_id: string; status: string }[]) expect(r.status, r.group_id).toBe('inactive');

    expect((await wie.db.from('team_goals' as never).select('id').eq('id' as never, teamdoel as never)).data).toEqual([]);
    expect(await balk(wie)).toBeNull();
    expect((await rpc(wie, 'organisatieleden', { p_organization_id: org })).data).toEqual([]);

    // Niemand ziet zijn aandeeldoel nog: niet het doel, niet de mijlpalen.
    expect((await bert.db.from('goals').select('id').eq('id', aandeel[wie.id]!)).data).toEqual([]);
    expect((await bert.db.from('milestones').select('id').eq('goal_id', aandeel[wie.id]!)).data).toEqual([]);
    expect(await balk()).toBe(4);
  }

  it(
    'wie zelf vertrekt is inactief in elke teamgroep, ziet niets meer, en de balk daalt niet',
    async () => {
      expect(uitkomst(await rpc(cleo, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
      await naVertrek(cleo);
      // Zijn doel blijft van hem (besluit 14).
      expect((await cleo.db.from('goals').select('id').eq('id', aandeel[cleo.id]!)).data).toEqual([
        { id: aandeel[cleo.id] },
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    'wie wordt uitgezet net zo',
    async () => {
      expect(uitkomst(await rpc(anna, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: dirk.id }))).toBe('ok');
      await naVertrek(dirk);
    },
    TEST_TIMEOUT,
  );

  it(
    'een verwijderd account laat geen spoor in de teller na, en de balk daalt niet',
    async () => {
      const mijlpalen = (await adminDb().from('milestones').select('id').eq('goal_id', aandeel[eva.id]!)).data as {
        id: string;
      }[];
      expect(mijlpalen.length).toBeGreaterThan(0);

      expect(uitkomst(await rpc(eva, 'verwijder_mijn_account'))).toBe('ok');
      expect(await balk()).toBe(4);

      const sporen = await adminDb()
        .from('team_progress_events' as never)
        .select('milestone_id')
        .in('milestone_id' as never, mijlpalen.map((m) => m.id) as never);
      expect(sporen.data).toEqual([]);
      for (const tabel of ['organization_members', 'team_goal_shares', 'group_members']) {
        const { count } = await adminDb()
          .from(tabel as never)
          .select('user_id', { count: 'exact', head: true })
          .eq('user_id' as never, eva.id as never);
        expect(count, tabel).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'met twee beheerders blijft de code geldig als er één verdwijnt (must-allow)',
    async () => {
      const [fien, gijs, nieuw] = await Promise.all([
        createTestUser('vertrek-fien'),
        createTestUser('vertrek-gijs'),
        createTestUser('vertrek-nieuw'),
      ]);
      const o = await maakOrganisatie(fien, 'Twee Beheer');
      expect(uitkomst(await rpc(gijs, 'word_organisatielid', { p_code: o.code }))).toBe('ok');
      // Een tweede beheerder via service_role: benoemen is QS8-695, een andere tak.
      const p = await adminDb()
        .from('organization_members' as never)
        .update({ role: 'admin' } as never)
        .eq('organization_id' as never, o.id as never)
        .eq('user_id' as never, gijs.id as never);
      expect(p.error).toBeNull();

      expect(uitkomst(await rpc(fien, 'verwijder_mijn_account'))).toBe('ok');
      expect((await codeStand(o.id)).invite_revoked).toBe(false);
      expect(uitkomst(await rpc(nieuw, 'word_organisatielid', { p_code: o.code }))).toBe('ok');
    },
    TEST_TIMEOUT,
  );

  it(
    'verwijdert de laatste beheerder zijn account, dan is de code ingetrokken en krijgt niemand de rol',
    async () => {
      const [hans, ines, nieuw] = await Promise.all([
        createTestUser('vertrek-hans'),
        createTestUser('vertrek-ines'),
        createTestUser('vertrek-nieuw2'),
      ]);
      const o = await maakOrganisatie(hans, 'Eén Beheer');
      expect(uitkomst(await rpc(ines, 'word_organisatielid', { p_code: o.code }))).toBe('ok');

      expect(uitkomst(await rpc(hans, 'verwijder_mijn_account'))).toBe('ok');
      // De naad: twee acties op dezelfde organisatierij in één cascade.
      expect(await codeStand(o.id)).toEqual({ invite_revoked: true, created_by: null });
      expect(await beheerders(o.id)).toBe(0);
      expect(uitkomst(await rpc(nieuw, 'word_organisatielid', { p_code: o.code }))).toBe('invalid');
      // Wie er al in zat houdt alles.
      expect((await rpc(ines, 'organisatieleden', { p_organization_id: o.id })).data).toEqual([
        expect.objectContaining({ user_id: ines.id, role: 'member' }),
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    'een lagere rol voor de laatste beheerder trekt de code ook in (de update-route)',
    async () => {
      const jan = await createTestUser('vertrek-jan');
      const o = await maakOrganisatie(jan, 'Rol Omlaag');
      const p = await adminDb()
        .from('organization_members' as never)
        .update({ role: 'member' } as never)
        .eq('organization_id' as never, o.id as never)
        .eq('user_id' as never, jan.id as never);
      expect(p.error).toBeNull();
      expect((await codeStand(o.id)).invite_revoked).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'accountverwijdering archiveert geen teamgroep, wel een gewone solo-groep (A1)',
    async () => {
      const kees = await createTestUser('vertrek-kees');
      const o = await maakOrganisatie(kees, 'Solo Team');
      const team = await maakTeam(kees, o.id, 'Alleen Kees');
      expect(uitkomst(await rpc(kees, 'join_group_with_code', { code: team.code }))).toBe('ok');
      const solo = await rpc(kees, 'create_group', { group_name: 'Kees alleen' });
      expect(uitkomst(solo)).toBe('ok');
      const soloId = (solo.data as { group: { id: string } }).group.id;
      groepen.push(soloId);
      registreerGroep(soloId);

      expect(uitkomst(await rpc(kees, 'verwijder_mijn_account'))).toBe('ok');
      const { data } = await adminDb().from('groups').select('id, status').in('id', [team.id, soloId]);
      const stand = Object.fromEntries((data as { id: string; status: string }[]).map((g) => [g.id, g.status]));
      expect(stand).toEqual({ [team.id]: 'active', [soloId]: 'archived' });
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// De teller kan geen persoon dragen — een eigenschap van de tabel
// ---------------------------------------------------------------------------

const METEN = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'trek_organisatiecode_in_zonder_beheerder'",
  import.meta.url,
);

describe.skipIf(!METEN)('de teamteller draagt geen persoon (QS8-659)', () => {
  it('heeft geen kolom die naar een persoon of een doel wijst, en geen persoonsnaam', () => {
    const uit = psql(`
      select string_agg(a.attname, ',' order by a.attname)
        from pg_attribute a
       where a.attrelid = 'public.team_progress_events'::regclass and a.attnum > 0 and not a.attisdropped
         and (a.attname ~ '(user|owner|actor|subject|profile)'
              or exists (select 1 from pg_constraint c
                          where c.conrelid = a.attrelid and c.contype = 'f' and a.attnum = any(c.conkey)
                            and c.confrelid in ('public.profiles'::regclass, 'public.goals'::regclass, 'auth.users'::regclass)));
    `).trim();
    expect(uit).toBe('');
  });
});

// ---------------------------------------------------------------------------
// De naad: twee beheerders die tegelijk hun account verwijderen
// ---------------------------------------------------------------------------

const A = randomUUID();
const B = randomUUID();
const ORG1 = randomUUID();
const ORG2 = randomUUID();

function opzet(): void {
  psql(`
    insert into auth.users (id, email) values
      ('${A}', 'vertrekrace-${A}@proef.nl'),
      ('${B}', 'vertrekrace-${B}@proef.nl')
      on conflict (id) do nothing;
    insert into public.organizations (id, name) values ('${ORG1}', 'Race Een'), ('${ORG2}', 'Race Twee')
      on conflict (id) do nothing;
    update public.organizations set invite_revoked = false where id in ('${ORG1}', '${ORG2}');
    insert into public.organization_members (organization_id, user_id, role, status) values
      ('${ORG1}', '${A}', 'admin', 'active'), ('${ORG1}', '${B}', 'admin', 'active'),
      ('${ORG2}', '${A}', 'admin', 'active'), ('${ORG2}', '${B}', 'admin', 'active')
      on conflict (organization_id, user_id) do nothing;
  `);
}

function ruimOp(): void {
  psql(`
    delete from public.organization_members where organization_id in ('${ORG1}', '${ORG2}');
    delete from public.organizations where id in ('${ORG1}', '${ORG2}');
    delete from auth.users where id in ('${A}', '${B}');
  `);
}

/** Accountverwijdering als `authenticated`, in een eigen transactie. */
function verwijder(wie: string, { vooraf = 0, achteraf = 0 } = {}): string {
  return `select pg_sleep(${vooraf});
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${wie}","role":"authenticated"}', true);
    select public.verwijder_mijn_account()::text;
    select pg_sleep(${achteraf});
    commit;`;
}

describe.skipIf(!METEN)('twee beheerders verwijderen tegelijk hun account (QS8-659, de naad)', () => {
  afterAll(() => {
    if (METEN) ruimOp();
  });

  // ⚠️ Sessie A houdt zijn transactie open met `pg_sleep`, zodat B er
  //    gegarandeerd binnen valt. Zonder lock en hertelling ziet B dan A nog als
  //    beheerder (READ COMMITTED leest alleen wat gecommit is), A zag B nog, en
  //    blijft de code open terwijl er nul beheerders over zijn. Twee gedeelde
  //    organisaties, zodat een lock in cascadevolgorde in een deadlock loopt.
  it(
    'beide verwijderingen lukken, en in beide organisaties is de code daarna ingetrokken',
    async () => {
      opzet();
      const uit = await psqlParallel([verwijder(A, { achteraf: 2 }), verwijder(B, { vooraf: 0.5 })], {
        gelijktijdig: 2,
      });
      expect((uit.join('\n').match(/"ok": true/g) ?? []).length).toBe(2);
      const stand = psql(`
        select string_agg(invite_revoked::text, ',' order by id) from public.organizations
         where id in ('${ORG1}', '${ORG2}');
      `).trim();
      expect(stand).toBe('true,true');
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// De naad met vertrek: accountverwijdering tegen verlaat_organisatie()
// ---------------------------------------------------------------------------

const D = randomUUID();
const V = randomUUID();
const PAUZE = randomUUID();

/**
 * D (beheerder, maker van een teamgroep) verwijdert zijn account terwijl V
 * (beheerder, lid van die teamgroep) de organisatie verlaat.
 *
 * ⚠️⚠️ **Gevonden in de security-ronde op QS8-659 (K1), en dit is de toets die
 *    hem vasthoudt.** De cascade vanuit `profiles` lockt eerst de teamgroep
 *    (`groups.created_by` set null) en vraagt pas daarna, in de statementtrigger,
 *    de organisatierij. `verlaat_organisatie()` doet het andersom: eerst de
 *    organisatie, dan (via de vertrek-trigger van 0317) de teamgroep. Dat is een
 *    cyclus, en Postgres breekt hem af met 40P01 — in de gemeten run viel de
 *    accountverwijdering om. Dat is het wisrecht dat besluit 2 onverkort wil.
 *
 * ⚠️ Een derde sessie houdt een `group_events`-rij van D vast, zodat D's cascade
 *    gegarandeerd ná de groepslock en vóór de organisatielock pauzeert. Zonder
 *    die pauze is de botsing een kwestie van timing, en dan meet de toets niets.
 */
function opzetVertrek(): string {
  return psql(`
    insert into auth.users (id, email) values
      ('${D}', 'vertrekdl-${D}@proef.nl'), ('${V}', 'vertrekdl-${V}@proef.nl')
      on conflict (id) do nothing;
    select set_config('request.jwt.claims', '{"sub":"${D}","role":"authenticated"}', false);
    create temp table ijk_org as select (public.maak_organisatie('Deadlock BV')->>'organization_id')::uuid as id;
    create temp table ijk_grp as select (public.maak_teamgroep((select id from ijk_org), 'Deadlock Team')->>'group_id')::uuid as id;
    select set_config('request.jwt.claims', '{"sub":"${V}","role":"authenticated"}', false);
    select public.word_organisatielid((select invite_code from public.organizations where id = (select id from ijk_org)));
    select public.join_group_with_code((select invite_code from public.groups where id = (select id from ijk_grp)));
    reset request.jwt.claims;
    update public.organization_members set role = 'admin'
     where organization_id = (select id from ijk_org) and user_id = '${V}';
    update public.organizations set created_by = null where id = (select id from ijk_org);
    insert into public.group_events (id, group_id, actor_id, event_type)
      values ('${PAUZE}', (select id from ijk_grp), '${D}', 'member_left');
    select 'ORG|' || (select id from ijk_org) || '|' || (select id from ijk_grp);
  `);
}

function ruimOpVertrek(org: string, grp: string): void {
  psql(`
    delete from public.group_events where group_id = '${grp}';
    delete from public.group_members where group_id = '${grp}';
    delete from public.groups where id = '${grp}';
    delete from public.organization_members where organization_id = '${org}';
    delete from public.organizations where id = '${org}';
    delete from public.dagtellers where sleutel in ('${D}', '${V}', '${org}');
    delete from auth.users where id in ('${D}', '${V}');
  `);
}

describe.skipIf(!METEN)('accountverwijdering tegen vertrek (QS8-659, review K1)', () => {
  it(
    'de verwijdering lukt, ook als een andere beheerder tegelijk vertrekt',
    async () => {
      const regel = opzetVertrek()
        .split('\n')
        .find((r) => r.startsWith('ORG|'))!;
      const [, org, grp] = regel.split('|') as [string, string, string];
      try {
        const uit = await psqlParallel(
          [
            `begin; select 1 from public.group_events where id = '${PAUZE}' for update; select pg_sleep(2); commit;`,
            `select pg_sleep(0.3); begin; set local role authenticated;
             select set_config('request.jwt.claims', '{"sub":"${D}","role":"authenticated"}', true);
             select 'D|' || public.verwijder_mijn_account()::text; commit;`,
            `select pg_sleep(0.8); begin; set local role authenticated;
             select set_config('request.jwt.claims', '{"sub":"${V}","role":"authenticated"}', true);
             select 'V|' || public.verlaat_organisatie('${org}')::text; commit;`,
          ],
          { gelijktijdig: 3 },
        );
        expect(uit[1]).toMatch(/D\|.*"ok": true/);
        expect(psql(`select count(*) from auth.users where id = '${D}';`).trim()).toBe('0');
      } finally {
        ruimOpVertrek(org, grp);
      }
    },
    TEST_TIMEOUT,
  );
});
