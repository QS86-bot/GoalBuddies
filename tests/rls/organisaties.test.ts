import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Organisaties en lidmaatschappen — QS8-652, migratie 0299.
 *
 * De beloftes van het issue, elk via PostgREST als een echte `authenticated`
 * (de route die een directe API-aanroeper neemt, buiten de UI om):
 *
 * - **Criterium 4 (naad).** Een lid van een ándere organisatie krijgt met de id
 *   van X exact hetzelfde antwoord als met een verzonnen id — op de tabel, de
 *   lidtabel, de ledenlijst, de code en elke schrijf-RPC. "Hetzelfde" betekent
 *   hier `data` én `error`, als JSON vergeleken, zodat een orakel in de vorm van
 *   een andere foutcode ook rood wordt.
 * - **Criterium 4, na vertrek.** Wie vertrekt is meteen een buitenstaander, en
 *   weer binnenkomen met de code geeft `removed`.
 * - **Criterium 5 (gedrag).** Beheerder en lid krijgen dezelfde rijen terug.
 *   Het structurele deel staat in `tests/rls/organisatierol-catalogus.test.ts`.
 * - **Criterium 10.** `invite_code` is via de tabel niet leesbaar, ook niet met
 *   `select=*`; alleen `organisatie_uitnodigcode()` geeft hem, aan een beheerder.
 * - **Criterium 12.** Dagtellers op lid worden (élke poging telt, ook een foute),
 *   op aanmaken en op een nieuwe code — mét de grens: de laatste toegestane
 *   poging lukt nog.
 *
 * ⚠️ De nieuwe tabellen en RPC's staan nog niet in `src/lib/database.types.ts`:
 *    dat bestand is een afschrift van productie, en 0299 staat daar pas na de
 *    uitrol. Vandaar de `as never` op de namen, zoals in
 *    `tests/rls/lidmaatschapsbesluit.test.ts`.
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

async function tabel(wie: TestUser, naam: string, kolommen: string, kolom: string, waarde: string): Promise<Antwoord> {
  const { data, error } = await wie.db
    .from(naam as never)
    .select(kolommen)
    .eq(kolom as never, waarde as never);
  return { data, error };
}

/** `{ok, reason}` uit een jsonb-antwoord, met de fout erbij als hij er is. */
function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

const aangemaakt: string[] = [];

async function maakOrganisatie(wie: TestUser, naam: string): Promise<string> {
  const a = await rpc(wie, 'maak_organisatie', { p_naam: naam });
  expect(a.error).toBeNull();
  const id = (a.data as { organization_id?: string }).organization_id;
  expect(id).toBeTruthy();
  aangemaakt.push(id!);
  return id!;
}

async function codeVan(beheerder: TestUser, org: string): Promise<string> {
  const a = await rpc(beheerder, 'organisatie_uitnodigcode', { p_organization_id: org });
  expect(a.error).toBeNull();
  return (a.data as { code: string }).code;
}

/** Alles wat een buitenstaander met een organisatie-id kan proberen. */
async function watEenBuitenstaanderZiet(wie: TestUser, org: string, slachtoffer: string): Promise<string> {
  const antwoorden = [
    await tabel(wie, 'organizations', 'id, name, status', 'id', org),
    await tabel(wie, 'organization_members', 'organization_id, user_id, role', 'organization_id', org),
    await rpc(wie, 'organisatieleden', { p_organization_id: org }),
    await rpc(wie, 'organisatie_uitnodigcode', { p_organization_id: org }),
    await rpc(wie, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: slachtoffer }),
    await rpc(wie, 'vernieuw_organisatiecode', { p_organization_id: org }),
    await rpc(wie, 'vernieuw_organisatiecode', { p_organization_id: org, p_intrekken: true }),
    await rpc(wie, 'verlaat_organisatie', { p_organization_id: org }),
  ];
  return JSON.stringify(antwoorden);
}

describe.runIf(rlsTestsConfigured)('organisaties en lidmaatschappen (QS8-652)', () => {
  let anna: TestUser; // beheerder van X
  let bert: TestUser; // lid van X
  let yara: TestUser; // beheerder van Y, buitenstaander voor X
  let org: string;

  beforeAll(async () => {
    [anna, bert, yara] = await Promise.all([
      createTestUser('org-anna'),
      createTestUser('org-bert'),
      createTestUser('org-yara'),
    ]);
    org = await maakOrganisatie(anna, 'Acme BV');
    await maakOrganisatie(yara, 'Andere Zaak');
    expect(uitkomst(await rpc(bert, 'word_organisatielid', { p_code: await codeVan(anna, org) }))).toBe('ok');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (aangemaakt.length > 0) {
      await admin.from('organization_members' as never).delete().in('organization_id' as never, aangemaakt as never);
      await admin.from('organizations' as never).delete().in('id' as never, aangemaakt as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Criterium 4
  // -------------------------------------------------------------------------

  it(
    'een lid van een andere organisatie krijgt met de id van X precies wat een verzonnen id geeft',
    async () => {
      const echt = await watEenBuitenstaanderZiet(yara, org, bert.id);
      const verzonnen = await watEenBuitenstaanderZiet(yara, randomUUID(), bert.id);
      expect(echt).toBe(verzonnen);
      // ⚠️ En die gelijkheid is niet die van twee keer een fout: de tabel geeft
      //    een lege lijst en geen 42501, anders bewaakt de vergelijking niets.
      expect(JSON.parse(echt)[0]).toEqual({ data: [], error: null });

      // Bert is nog lid, en de code is niet ingetrokken door yara's poging.
      const leden = (await rpc(bert, 'organisatieleden', { p_organization_id: org, p_limit: 50 })).data as {
        user_id: string;
      }[];
      expect(leden.map((r) => r.user_id)).toContain(bert.id);
      const naPoging = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: org });
      expect((naPoging.data as { ingetrokken: boolean }).ingetrokken).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'wie vertrekt is meteen een buitenstaander, en komt met de code niet terug',
    async () => {
      const carl = await createTestUser('org-carl');
      const code = await codeVan(anna, org);
      expect(uitkomst(await rpc(carl, 'word_organisatielid', { p_code: code }))).toBe('ok');
      const binnen = await tabel(carl, 'organizations', 'id', 'id', org);
      expect(binnen.data).toEqual([{ id: org }]);

      expect(uitkomst(await rpc(carl, 'verlaat_organisatie', { p_organization_id: org }))).toBe('ok');
      // `verlaat_organisatie` geeft geen_lid op zijn tweede aanroep, dus de
      // vergelijking hieronder draait op de toestand ná vertrek.
      const echt = await watEenBuitenstaanderZiet(carl, org, bert.id);
      const verzonnen = await watEenBuitenstaanderZiet(carl, randomUUID(), bert.id);
      expect(echt).toBe(verzonnen);

      expect(uitkomst(await rpc(carl, 'word_organisatielid', { p_code: code }))).toBe('removed');

      // En de anderen zien hem ook niet meer: inactief is voor niemand leesbaar.
      const leden = await rpc(anna, 'organisatieleden', { p_organization_id: org });
      expect((leden.data as { user_id: string }[]).map((r) => r.user_id)).not.toContain(carl.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'een uitgezet lid is niet te onderscheiden van een vertrokken lid',
    async () => {
      const dani = await createTestUser('org-dani');
      const codeVoor = await codeVan(anna, org);
      expect(uitkomst(await rpc(dani, 'word_organisatielid', { p_code: codeVoor }))).toBe('ok');
      expect(uitkomst(await rpc(bert, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: dani.id }))).toBe(
        'niet_toegestaan',
      );
      expect(uitkomst(await rpc(anna, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: dani.id }))).toBe(
        'ok',
      );
      expect(uitkomst(await rpc(dani, 'word_organisatielid', { p_code: await codeVan(anna, org) }))).toBe('removed');
      // Uitzetten sluit de deur ook voor een tweede account met de oude code
      // (security-ronde, M2): de code is geroteerd.
      const tweede = await createTestUser('org-dani-twee');
      expect(uitkomst(await rpc(tweede, 'word_organisatielid', { p_code: codeVoor }))).toBe('invalid');
      expect((await tabel(dani, 'organization_members', 'user_id', 'organization_id', org)).data).toEqual([]);
      // Een beheerder zet zichzelf niet uit, en ook niet een andere beheerder.
      expect(uitkomst(await rpc(anna, 'zet_organisatielid_uit', { p_organization_id: org, p_user_id: anna.id }))).toBe(
        'niet_toegestaan',
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'de laatste beheerder kan niet vertrekken',
    async () => {
      expect(uitkomst(await rpc(anna, 'verlaat_organisatie', { p_organization_id: org }))).toBe('laatste_beheerder');
      expect((await tabel(anna, 'organizations', 'id', 'id', org)).data).toEqual([{ id: org }]);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 5 — het gedrag; de catalogus staat in een eigen bestand
  // -------------------------------------------------------------------------

  it(
    'een beheerder krijgt van de organisatie en de ledenlijst precies wat een lid krijgt',
    async () => {
      for (const [naam, kolommen, kolom] of [
        ['organizations', 'id, name, status, created_at', 'id'],
      ] as const) {
        const beheerder = await tabel(anna, naam, kolommen, kolom, org);
        const lid = await tabel(bert, naam, kolommen, kolom, org);
        expect(beheerder.error).toBeNull();
        expect(beheerder.data).toEqual(lid.data);
      }
      const ledenBeheerder = await rpc(anna, 'organisatieleden', { p_organization_id: org, p_limit: 50 });
      const ledenLid = await rpc(bert, 'organisatieleden', { p_organization_id: org, p_limit: 50 });
      expect(ledenBeheerder.error).toBeNull();
      expect(ledenBeheerder.data).toEqual(ledenLid.data);
      // Naam en rol, en verder niets (002 rij 42).
      const eerste = (ledenLid.data as Record<string, unknown>[])[0]!;
      expect(Object.keys(eerste).sort()).toEqual(['display_name', 'role', 'user_id']);
    },
    TEST_TIMEOUT,
  );

  it(
    'de ledenlijst bladert met een cursor en slaat niemand over',
    async () => {
      const alles = (await rpc(bert, 'organisatieleden', { p_organization_id: org, p_limit: 50 })).data as {
        user_id: string;
      }[];
      const gebladerd: string[] = [];
      let na: string | null = null;
      for (let i = 0; i < 10; i++) {
        const pagina = (await rpc(bert, 'organisatieleden', { p_organization_id: org, p_limit: 1, p_na_user_id: na }))
          .data as { user_id: string }[];
        if (pagina.length === 0) break;
        gebladerd.push(pagina[0]!.user_id);
        na = pagina[0]!.user_id;
      }
      expect(gebladerd).toEqual(alles.map((r) => r.user_id));
      expect(gebladerd.length).toBeGreaterThanOrEqual(2);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 10
  // -------------------------------------------------------------------------

  it(
    'de uitnodigcode is niet leesbaar via de tabel, ook niet voor een beheerder',
    async () => {
      for (const wie of [anna, bert]) {
        for (const kolommen of ['invite_code', '*', 'id, invite_revoked', 'created_by']) {
          const a = await tabel(wie, 'organizations', kolommen, 'id', org);
          expect(a.error?.code, `${kolommen} als ${wie.email}`).toBe('42501');
          expect(a.data).toBeNull();
        }
      }
      expect(await codeVan(anna, org)).toMatch(/^[A-Z0-9]{6,}$/);
      const voorLid = await rpc(bert, 'organisatie_uitnodigcode', { p_organization_id: org });
      expect(voorLid).toEqual({ data: null, error: null });
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Criterium 12
  // -------------------------------------------------------------------------

  it(
    'lid worden: de twintigste poging lukt nog, en élke poging telt, ook een foute',
    async () => {
      const [eva, fred] = await Promise.all([createTestUser('org-eva'), createTestUser('org-fred')]);
      const code = await codeVan(anna, org);

      for (let i = 0; i < 19; i++) {
        expect(uitkomst(await rpc(eva, 'word_organisatielid', { p_code: `fout-${i}` }))).toBe('invalid');
      }
      expect(uitkomst(await rpc(eva, 'word_organisatielid', { p_code: code }))).toBe('ok');

      for (let i = 0; i < 20; i++) {
        expect(uitkomst(await rpc(fred, 'word_organisatielid', { p_code: `fout-${i}` }))).toBe('invalid');
      }
      expect(uitkomst(await rpc(fred, 'word_organisatielid', { p_code: code }))).toBe('rate_limited');
      const leden = (await rpc(anna, 'organisatieleden', { p_organization_id: org, p_limit: 50 })).data as {
        user_id: string;
      }[];
      expect(leden.map((r) => r.user_id)).toContain(eva.id);
      expect(leden.map((r) => r.user_id)).not.toContain(fred.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'aanmaken: drie organisaties per dag, de vierde is rate_limited',
    async () => {
      const gijs = await createTestUser('org-gijs');
      for (let i = 1; i <= 3; i++) await maakOrganisatie(gijs, `Zaak ${i}`);
      expect(uitkomst(await rpc(gijs, 'maak_organisatie', { p_naam: 'Zaak 4' }))).toBe('rate_limited');
    },
    TEST_TIMEOUT,
  );

  it(
    'uitnodigen: tien nieuwe codes per organisatie per dag, de elfde is rate_limited',
    async () => {
      const hans = await createTestUser('org-hans');
      const eigen = await maakOrganisatie(hans, 'Codezaak');
      const vorige = await codeVan(hans, eigen);
      for (let i = 0; i < 10; i++) {
        expect(uitkomst(await rpc(hans, 'vernieuw_organisatiecode', { p_organization_id: eigen }))).toBe('ok');
      }
      expect(await codeVan(hans, eigen)).not.toBe(vorige);
      expect(uitkomst(await rpc(hans, 'vernieuw_organisatiecode', { p_organization_id: eigen }))).toBe('rate_limited');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De naam: dezelfde grendels als een groepsnaam
  // -------------------------------------------------------------------------

  it(
    'een naam wordt gestreken zoals een groepsnaam, en wat niet te strijken is wordt geweigerd',
    async () => {
      const ines = await createTestUser('org-ines');
      for (const naam of ['x'.repeat(81), '   ', '', '\u200B\u200B']) {
        const a = await rpc(ines, 'maak_organisatie', { p_naam: naam });
        expect(a.error, JSON.stringify(naam)).toBeNull();
        expect(uitkomst(a), JSON.stringify(naam)).toBe('ongeldige_naam');
      }
      // Een bidi-teken en een losse tag landen niet: `schone_naam()` haalt ze
      // weg, en de zeven CHECKs eisen dat wat er staat een vast punt is.
      const id = await maakOrganisatie(ines, '\u202EAc\u{E0041}me');
      const rij = await tabel(ines, 'organizations', 'name', 'id', id);
      expect(rij.data).toEqual([{ name: 'Acme' }]);
      // 80 codepunten met emoji past nog: de grens telt codepunten, geen UTF-16.
      const lang = await rpc(ines, 'maak_organisatie', { p_naam: '\u{1F600}'.repeat(80) });
      expect(uitkomst(lang)).toBe('ok');
      aangemaakt.push((lang.data as { organization_id: string }).organization_id);
    },
    TEST_TIMEOUT,
  );
});
