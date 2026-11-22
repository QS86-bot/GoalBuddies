import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepSecties, type Groepsectie } from '@/schermen/groep/secties';

import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';

/**
 * De naad onder de secties Privé en Werk — QS8-775.
 *
 * ⚠️ **Er is geen nieuwe leesbron, en daarom toetst dit bestand de twee bestaande op hun naad.** De groepenlijst is
 *    een join in de client van `groups (…, organization_id)` en `organizations (id, name)` (besluit 22-11, optie A).
 *    Elk van beide is elders al getoetst; wat hier getoetst wordt is wat de join oplevert, met de JWT van elke
 *    gebruiker langs PostgREST, met precies de kolomlijsten van `fetchMijnGroepen()` en `fetchMijnOrganisaties()`, en
 *    door dezelfde pure functie `groepSecties()` die het scherm gebruikt.
 *
 * ⚠️ **Domeinregel 7, de twee vragen.**
 *    1. *Kan hieruit iemands gemiste week worden afgeleid?* De kop is de naam van je eigen organisatie; er komt geen
 *       kolom over een ander lid bij. "Alleen de eigen rij en alleen id en naam" staat hieronder als toets.
 *    2. *Kan iemand dat met één API-verzoek buiten de UI om uitlezen?* Dezelfde verzoeken als de app, plus de omweg
 *       die de UI niet doet: `select=*` en de uitnodigcode op `organizations`, en de ledenrijen van een ander.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 22-11-2026, lokale stack op 0337, telkens één mutatie, daarna
 *    hersteld en weer 7/7 groen):
 *
 *    1. `organizations_select` op `using (true)` → rood op zes van de zeven; alleen de kolomtoets bleef groen.
 *    2. `grant select (invite_code) on organizations to authenticated` → alleen "laat buiten de UI om geen kolom…"
 *       rood.
 *    3. Alleen `status = 'active'` uit `organizations_select` → **groen**, en dat is terecht: de subquery op
 *       `organization_members` loopt onder `organization_members_select`, en `is_organisatielid()` eist zelf ook
 *       `o.status = 'active'`. De grendel staat dubbel. Beide samen weg → alleen de laatste toets ("niet actief") rood.
 *    4. In `groepSecties()` een teamgroep zonder leesbare naam onder Privé zetten → hier alleen de laatste toets rood,
 *       en in `src/schermen/groep/secties.test.ts` de toetsen "Werk zonder naam" en "verliest geen groep".
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;

// Woordelijk de kolomlijsten van de client. Verandert een van beide daar, dan hoort deze toets mee te veranderen.
const GROEP_KOLOMMEN = 'id, name, icon, huddle_day, tz, status, created_at, created_by, zichtbaarheid, organization_id';
const ORGANISATIE_KOLOMMEN = 'id, name';

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

const organisaties: string[] = [];
const groepen: string[] = [];

async function maakOrganisatie(wie: TestUser, naam: string): Promise<string> {
  await laatOrganisatieAanmaken(wie);
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

async function maakGroep(wie: TestUser, naam: string): Promise<string> {
  const g = await rpc(wie, 'create_group', { group_name: naam });
  expect(uitkomst(g)).toBe('ok');
  const id = (g.data as { group: { id: string } }).group.id;
  groepen.push(id);
  registreerGroep(id);
  return id;
}

async function doeMee(wie: TestUser, groep: string): Promise<void> {
  const { data, error } = await adminDb().from('groups').select('invite_code').eq('id', groep).single();
  expect(error).toBeNull();
  expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (data as { invite_code: string }).invite_code }))).toBe(
    'ok',
  );
}

/** Wat het scherm ziet: dezelfde twee verzoeken als `laadGroepenlijst()`, en dezelfde join. */
async function lijstVan(wie: TestUser): Promise<{
  readonly groepIds: string[];
  readonly organisaties: { id: string; name: string }[];
  readonly secties: readonly Groepsectie[] | null;
}> {
  const [g, o] = await Promise.all([
    wie.db.from('groups').select(GROEP_KOLOMMEN).neq('status', 'archived').order('created_at').limit(50),
    wie.db.from('organizations' as never).select(ORGANISATIE_KOLOMMEN).order('name').limit(20),
  ]);
  expect(g.error).toBeNull();
  expect(o.error).toBeNull();
  const rijen = (g.data ?? []) as unknown as Parameters<typeof groepSecties>[0];
  const orgs = (o.data ?? []) as unknown as { id: string; name: string }[];
  return {
    groepIds: rijen.map((r) => r.id),
    organisaties: orgs,
    secties: groepSecties(rijen, orgs.map((r) => ({ id: r.id, naam: r.name }))),
  };
}

function koppen(secties: readonly Groepsectie[] | null): string[] {
  return (secties ?? []).map((s) => (s.soort === 'prive' ? 'Privé' : `Werk · ${s.organisatienaam ?? '(geen naam)'}`));
}

describe.runIf(rlsTestsConfigured)('de secties Privé en Werk op de naad (QS8-775)', () => {
  let anna: TestUser; // beheerder van X, geen lid van het team
  let bert: TestUser; // lid van X en van het team, en van een privégroep
  let yara: TestUser; // beheerder van Y, lid van het Y-team
  let zoe: TestUser; // in geen enkele organisatie, wel in een privégroep
  let dirk: TestUser; // lid van X en het team, verlaat X
  let x: string;
  let y: string;
  let teamX: string;
  let teamY: string;
  let prive: string;

  beforeAll(async () => {
    [anna, bert, yara, zoe, dirk] = await Promise.all([
      createTestUser('sectie-anna'),
      createTestUser('sectie-bert'),
      createTestUser('sectie-yara'),
      createTestUser('sectie-zoe'),
      createTestUser('sectie-dirk'),
    ]);
    x = await maakOrganisatie(anna, 'Acme BV');
    y = await maakOrganisatie(yara, 'Andere Zaak');
    await wordLid(anna, bert, x);
    await wordLid(anna, dirk, x);
    teamX = await maakTeam(anna, x, 'Team Zuid');
    teamY = await maakTeam(yara, y, 'Team Noord');
    await doeMee(bert, teamX);
    await doeMee(dirk, teamX);
    await doeMee(yara, teamY);
    prive = await maakGroep(bert, 'Hardloopmaten');
    await doeMee(zoe, prive);
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

  it(
    'geeft een lid zijn privégroep onder Privé en zijn teamgroep onder Werk met de naam van zijn eigen organisatie',
    async () => {
      const lijst = await lijstVan(bert);
      expect([...lijst.groepIds].sort()).toEqual([teamX, prive].sort());
      expect(lijst.organisaties).toEqual([{ id: x, name: 'Acme BV' }]);
      expect(koppen(lijst.secties)).toEqual(['Privé', 'Werk · Acme BV']);
      expect(lijst.secties?.map((s) => s.groepen.map((g) => g.id))).toEqual([[prive], [teamX]]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een niet-lid niets: geen teamgroep, geen organisatie, en dus geen koppen',
    async () => {
      const lijst = await lijstVan(zoe);
      expect(lijst.groepIds).toEqual([prive]);
      expect(lijst.organisaties).toEqual([]);
      expect(lijst.secties).toBeNull();

      // De omweg buiten de UI om: vragen op id.
      const groep = await zoe.db.from('groups').select('id').in('id', [teamX, teamY]);
      expect(groep.error).toBeNull();
      expect(groep.data).toEqual([]);
      const org = await zoe.db.from('organizations' as never).select('id, name').in('id' as never, [x, y] as never);
      expect(org.error).toBeNull();
      expect(org.data).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een lid van een andere organisatie niet de naam of het team van de eerste',
    async () => {
      const lijst = await lijstVan(yara);
      expect(lijst.groepIds).toEqual([teamY]);
      expect(lijst.organisaties).toEqual([{ id: y, name: 'Andere Zaak' }]);
      expect(koppen(lijst.secties)).toEqual(['Werk · Andere Zaak']);
      const org = await yara.db.from('organizations' as never).select('id').eq('id' as never, x as never);
      expect(org.data).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een beheerder die geen lid van het team is niet meer dan een lid: het team staat niet in zijn lijst',
    async () => {
      const lijst = await lijstVan(anna);
      expect(lijst.groepIds).toEqual([]);
      expect(lijst.organisaties).toEqual([{ id: x, name: 'Acme BV' }]);
      expect(lijst.secties).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat buiten de UI om geen kolom of rij over een ander lid los (domeinregel 7, vraag 2)',
    async () => {
      // `select=*` en de uitnodigcode: de kolomgrant op `organizations` weigert, hoe de vraag ook gesteld is.
      const ster = await bert.db.from('organizations' as never).select('*');
      expect(ster.error?.code).toBe('42501');
      const code = await bert.db.from('organizations' as never).select('id, invite_code');
      expect(code.error?.code).toBe('42501');
      // De lidmaatschappen: alleen de eigen rij, ook al zitten anna en dirk in dezelfde organisatie.
      const leden = await bert.db.from('organization_members' as never).select('organization_id, user_id');
      expect(leden.error).toBeNull();
      expect(leden.data).toEqual([{ organization_id: x, user_id: bert.id }]);
    },
    TEST_TIMEOUT,
  );

  it(
    'neemt een ex-lid de naam en het team af: na het verlaten van de organisatie geen Werk meer',
    async () => {
      expect(koppen((await lijstVan(dirk)).secties)).toEqual(['Werk · Acme BV']);
      expect(uitkomst(await rpc(dirk, 'verlaat_organisatie', { p_organization_id: x }))).toBe('ok');
      const lijst = await lijstVan(dirk);
      expect(lijst.groepIds).toEqual([]);
      expect(lijst.organisaties).toEqual([]);
      expect(lijst.secties).toBeNull();
    },
    TEST_TIMEOUT,
  );

  // ⚠️ Als laatste: zet organisatie X op archived en terug.
  it(
    'zet een teamgroep van een organisatie die niet actief is onder Werk zonder naam (besloten 22-11)',
    async () => {
      const zet = (status: string) =>
        adminDb()
          .from('organizations' as never)
          .update({ status } as never)
          .eq('id' as never, x as never);
      expect((await zet('archived')).error).toBeNull();
      try {
        const lijst = await lijstVan(bert);
        expect(lijst.organisaties).toEqual([]);
        expect(koppen(lijst.secties)).toEqual(['Privé', 'Werk · (geen naam)']);
        expect(lijst.secties?.at(-1)?.groepen.map((g) => g.id)).toEqual([teamX]);
      } finally {
        expect((await zet('active')).error).toBeNull();
      }
    },
    TEST_TIMEOUT,
  );
});
