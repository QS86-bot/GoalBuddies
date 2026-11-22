import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';
import { psql, psqlParallel, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een organisatiebeheerder benoemen en terugtreden — QS8-695, migratie 0318.
 *
 * De beloftes:
 *
 * - Een beheerder benoemt een actief lid tot beheerder; een lid, een
 *   buitenstaander en een verzonnen id krijgen allemaal hetzelfde
 *   `niet_toegestaan` (de vorm van criterium 4 van QS8-652).
 * - Een beheerder treedt terug zolang er een andere actieve beheerder is; de
 *   laatste krijgt `laatste_beheerder`.
 * - Een beheerder zet nog steeds geen andere beheerder uit (keuze 9 van 0316).
 * - Een benoemde beheerder ziet niet meer dan een lid (besluit 6).
 * - **Twee beheerders die tegelijk terugtreden of vertrekken, laten er nooit
 *   nul achter.** Dat is de naad van dit issue: elk van de twee functies klopt
 *   los, en het geheel lekt zodra één van beide niet eerst de organisatierij
 *   lockt. Die toets draait met twee echte psql-sessies, onderaan.
 *
 * ⚠️⚠️ **Wat deze suite níet belooft: accountverwijdering.**
 *    `verwijder_mijn_account()` is een derde schrijver die het aantal
 *    beheerders verlaagt, zonder lock en zonder `laatste_beheerder` — 📏 gemeten
 *    in de security-ronde, eindstand 0 beheerders. Dat is QS8-659; zie de kop van
 *    migratie 0318.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string } | null;
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

const aangemaakt: string[] = [];

async function maakOrganisatie(wie: TestUser, naam: string): Promise<string> {
  await laatOrganisatieAanmaken(wie);
  const a = await rpc(wie, 'maak_organisatie', { p_naam: naam });
  expect(a.error).toBeNull();
  const id = (a.data as { organization_id: string }).organization_id;
  aangemaakt.push(id);
  return id;
}

async function wordLid(wie: TestUser, beheerder: TestUser, org: string): Promise<void> {
  const code = (await rpc(beheerder, 'organisatie_uitnodigcode', { p_organization_id: org })).data as {
    code: string;
  };
  expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: code.code }))).toBe('ok');
}

async function rollen(wie: TestUser, org: string): Promise<Record<string, string>> {
  const leden = (await rpc(wie, 'organisatieleden', { p_organization_id: org, p_limit: 50 })).data as {
    user_id: string;
    role: string;
  }[];
  return Object.fromEntries(leden.map((r) => [r.user_id, r.role]));
}

describe.runIf(rlsTestsConfigured)('een organisatiebeheerder benoemen en terugtreden (QS8-695)', () => {
  let anna: TestUser; // aanmaker en beheerder
  let bert: TestUser; // lid, wordt beheerder
  let cas: TestUser; // gewoon lid
  let yara: TestUser; // beheerder van een andere organisatie
  let org: string;

  beforeAll(async () => {
    [anna, bert, cas, yara] = await Promise.all([
      createTestUser('orgbeheer-anna'),
      createTestUser('orgbeheer-bert'),
      createTestUser('orgbeheer-cas'),
      createTestUser('orgbeheer-yara'),
    ]);
    org = await maakOrganisatie(anna, 'Beheerzaak');
    await maakOrganisatie(yara, 'Andere Beheerzaak');
    await wordLid(bert, anna, org);
    await wordLid(cas, anna, org);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (aangemaakt.length > 0) {
      await admin.from('organization_role_events').delete().in('organization_id', aangemaakt as never);
      // De dagtellers van deze organisaties, en alleen die (tellerbereik).
      await admin
        .from('dagtellers')
        .delete()
        .in('domein', ['organisatierollen', 'organisatiecodes'] as never)
        .in('sleutel', aangemaakt as never);
      await admin.from('organization_members').delete().in('organization_id', aangemaakt as never);
      await admin.from('organizations').delete().in('id', aangemaakt as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een buitenstaander krijgt met de echte id precies wat een verzonnen id geeft',
    async () => {
      const vraag = async (id: string): Promise<string> =>
        JSON.stringify([
          await rpc(yara, 'benoem_organisatiebeheerder', { p_organization_id: id, p_user_id: bert.id }),
          await rpc(yara, 'treed_terug_als_organisatiebeheerder', { p_organization_id: id }),
        ]);
      const echt = await vraag(org);
      expect(echt).toBe(await vraag(randomUUID()));
      expect(JSON.parse(echt)[0]).toEqual({ data: { ok: false, reason: 'niet_toegestaan' }, error: null });
      expect((await rollen(anna, org))[bert.id]).toBe('member');
    },
    TEST_TIMEOUT,
  );

  it(
    'een gewoon lid benoemt niemand en treedt niet terug',
    async () => {
      expect(uitkomst(await rpc(cas, 'benoem_organisatiebeheerder', { p_organization_id: org, p_user_id: bert.id }))).toBe(
        'niet_toegestaan',
      );
      expect(uitkomst(await rpc(cas, 'treed_terug_als_organisatiebeheerder', { p_organization_id: org }))).toBe(
        'niet_toegestaan',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'de enige beheerder kan niet terugtreden',
    async () => {
      expect(uitkomst(await rpc(anna, 'treed_terug_als_organisatiebeheerder', { p_organization_id: org }))).toBe(
        'laatste_beheerder',
      );
      expect((await rollen(anna, org))[anna.id]).toBe('admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'jezelf, een buitenstaander of een verzonnen gebruiker benoemen geeft niet_toegestaan',
    async () => {
      for (const doel of [anna.id, yara.id, randomUUID()]) {
        expect(
          uitkomst(await rpc(anna, 'benoem_organisatiebeheerder', { p_organization_id: org, p_user_id: doel })),
        ).toBe('niet_toegestaan');
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'een benoemde beheerder beheert, ziet niet meer dan een lid, en wordt door de ander niet uitgezet',
    async () => {
      expect(uitkomst(await rpc(anna, 'benoem_organisatiebeheerder', { p_organization_id: org, p_user_id: bert.id }))).toBe(
        'ok',
      );
      expect((await rollen(cas, org))[bert.id]).toBe('admin');
      // Een bestaande beheerder opnieuw benoemen is geen idempotente ok.
      expect(uitkomst(await rpc(anna, 'benoem_organisatiebeheerder', { p_organization_id: org, p_user_id: bert.id }))).toBe(
        'niet_toegestaan',
      );

      // Bert beheert: hij krijgt de code, cas niet.
      expect((await rpc(bert, 'organisatie_uitnodigcode', { p_organization_id: org })).data).not.toBeNull();
      expect((await rpc(cas, 'organisatie_uitnodigcode', { p_organization_id: org })).data).toBeNull();

      // Besluit 6: de ledenlijst is voor beheerder en lid gelijk.
      const voorBert = await rpc(bert, 'organisatieleden', { p_organization_id: org, p_limit: 50 });
      const voorCas = await rpc(cas, 'organisatieleden', { p_organization_id: org, p_limit: 50 });
      expect(voorBert.data).toEqual(voorCas.data);

      // Keuze 9 blijft: geen beheerder zet een andere beheerder uit.
      expect(uitkomst(await rpc(anna, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: bert.id }))).toBe(
        'niet_toegestaan',
      );
      expect((await rollen(cas, org))[bert.id]).toBe('admin');
    },
    TEST_TIMEOUT,
  );

  it(
    'wie terugtreedt verliest het beheer meteen, en de laatste blijft zitten',
    async () => {
      expect(uitkomst(await rpc(anna, 'treed_terug_als_organisatiebeheerder', { p_organization_id: org }))).toBe('ok');
      expect((await rollen(cas, org))[anna.id]).toBe('member');

      expect(uitkomst(await rpc(anna, 'benoem_organisatiebeheerder', { p_organization_id: org, p_user_id: cas.id }))).toBe(
        'niet_toegestaan',
      );
      expect((await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org })).data).toBeNull();

      expect(uitkomst(await rpc(bert, 'treed_terug_als_organisatiebeheerder', { p_organization_id: org }))).toBe(
        'laatste_beheerder',
      );
      expect(uitkomst(await rpc(bert, 'verlaat_organisatie', { p_organization_id: org }))).toBe('laatste_beheerder');
    },
    TEST_TIMEOUT,
  );

  it(
    'elke rolwijziging laat een spoor na, en dat spoor is via de API niet leesbaar',
    async () => {
      const spoor = await adminDb()
        .from('organization_role_events')
        .select('actor_id, subject_id, event_type')
        .eq('organization_id', org as never)
        .order('created_at');
      expect(spoor.data).toEqual([
        { actor_id: anna.id, subject_id: bert.id, event_type: 'beheerder_benoemd' },
        { actor_id: anna.id, subject_id: anna.id, event_type: 'beheerder_teruggetreden' },
      ]);
      for (const wie of [anna, bert, cas]) {
        const a = await wie.db.from('organization_role_events').select('event_type');
        expect(a.error?.code, wie.email).toBe('42501');
      }
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// De naad: twee sessies tegelijk
// ---------------------------------------------------------------------------

const METEN = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'treed_terug_als_organisatiebeheerder'",
  import.meta.url,
);

/** Eigen id's per run, zodat twee gelijktijdige suite-runs niet botsen. */
const A = randomUUID();
const B = randomUUID();
const ORG = randomUUID();

function opzet(): void {
  psql(`
    insert into auth.users (id, email) values
      ('${A}', 'orgrace-${A}@proef.nl'),
      ('${B}', 'orgrace-${B}@proef.nl')
      on conflict (id) do nothing;
    delete from public.organization_role_events where organization_id = '${ORG}';
    delete from public.organization_members where organization_id = '${ORG}';
    insert into public.organizations (id, name, created_by)
      values ('${ORG}', 'Racezaak', '${A}')
      on conflict (id) do nothing;
    insert into public.organization_members (organization_id, user_id, role, status) values
      ('${ORG}', '${A}', 'admin', 'active'),
      ('${ORG}', '${B}', 'admin', 'active');
  `);
}

function ruimOp(): void {
  psql(`
    delete from public.organization_role_events where organization_id = '${ORG}';
    delete from public.organization_members where organization_id = '${ORG}';
    delete from public.organizations where id = '${ORG}';
    delete from public.dagtellers where domein = 'organisatierollen' and sleutel = '${ORG}';
    delete from auth.users where id in ('${A}', '${B}');
  `);
}

/** Een aanroep als `authenticated`, in een eigen transactie. */
function als(wie: string, aanroep: string, { vooraf = 0, achteraf = 0 } = {}): string {
  return `select pg_sleep(${vooraf});
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${wie}","role":"authenticated"}', true);
    select ${aanroep}::text;
    select pg_sleep(${achteraf});
    commit;`;
}

function actieveBeheerders(): string {
  return psql(`
    select count(*) from public.organization_members
     where organization_id = '${ORG}' and role = 'admin' and status = 'active';
  `).trim();
}

describe.skipIf(!METEN)('twee beheerders tegelijk (QS8-695, de naad)', () => {
  afterAll(() => {
    if (METEN) ruimOp();
  });

  // ⚠️ Sessie A houdt zijn transactie open met `pg_sleep`, zodat de aanroep van
  //    B er gegarandeerd binnen valt. Zonder de lock ziet B dan A nog als
  //    beheerder (READ COMMITTED leest alleen wat gecommit is) en treedt hij óók
  //    terug: twee keer ok en nul beheerders.
  it(
    'twee keer terugtreden: precies één lukt, en er blijft één beheerder over',
    async () => {
      opzet();
      const uit = await psqlParallel(
        [
          als(A, `public.treed_terug_als_organisatiebeheerder('${ORG}')`, { achteraf: 2 }),
          als(B, `public.treed_terug_als_organisatiebeheerder('${ORG}')`, { vooraf: 0.5 }),
        ],
        { gelijktijdig: 2 },
      );
      const samen = uit.join('\n');
      const gelukt = (samen.match(/"ok": true/g) ?? []).length;
      const laatste = (samen.match(/laatste_beheerder/g) ?? []).length;
      expect({ gelukt, laatste }).toEqual({ gelukt: 1, laatste: 1 });
      expect(actieveBeheerders()).toBe('1');
    },
    TEST_TIMEOUT,
  );

  it(
    'terugtreden terwijl de ander vertrekt: er blijft minstens één beheerder',
    async () => {
      opzet();
      await psqlParallel(
        [
          als(A, `public.treed_terug_als_organisatiebeheerder('${ORG}')`, { achteraf: 2 }),
          als(B, `public.verlaat_organisatie('${ORG}')`, { vooraf: 0.5 }),
        ],
        { gelijktijdig: 2 },
      );
      expect(actieveBeheerders()).toBe('1');
    },
    TEST_TIMEOUT,
  );

  // ⚠️ De autorisatie staat vóór de lock (L2 van 0316). Houdt een andere
  //    sessie de organisatierij vast, dan krijgt een buitenstaander meteen zijn
  //    weigering en wacht hij niet op een lock die hij nooit had mogen vragen.
  it(
    'een buitenstaander wacht niet op de lock van een ander',
    async () => {
      opzet();
      const buitenstaander = randomUUID();
      psql(`insert into auth.users (id, email) values ('${buitenstaander}', 'orgrace-${buitenstaander}@proef.nl');`);
      try {
        const uit = await psqlParallel(
          [
            `begin; select 1 from public.organizations where id = '${ORG}' for update; select pg_sleep(3); commit;`,
            `select pg_sleep(0.5); begin; set local lock_timeout = '500ms';
             set local role authenticated;
             select set_config('request.jwt.claims', '{"sub":"${buitenstaander}","role":"authenticated"}', true);
             select public.benoem_organisatiebeheerder('${ORG}', '${B}')::text;
             select public.treed_terug_als_organisatiebeheerder('${ORG}')::text;
             commit;`,
          ],
          { gelijktijdig: 2 },
        );
        expect((uit[1]!.match(/niet_toegestaan/g) ?? []).length).toBe(2);
      } finally {
        psql(`delete from auth.users where id = '${buitenstaander}';`);
      }
    },
    TEST_TIMEOUT,
  );
});
