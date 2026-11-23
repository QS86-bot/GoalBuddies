import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  anonDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';
import { psql } from './psql-stack';

/**
 * De uitnodiging noemt of het klassement in díe groep aan staat — QS8-801,
 * migratie 0341.
 *
 * ⚠️⚠️ **`invite_preview()` is het enige eindpunt dat zonder account bereikbaar
 *    is**, en wat erbij komt leest iedereen met de code. De belofte van dit
 *    bestand is daarom níét "het veld staat erin" maar: **anon leest precies
 *    één feit meer dan vóór 0341, en dat feit is de echte stand van de groep.**
 *    Daarom legt de toets de volledige sleutelset vast (bovenaan én per lid) en
 *    niet alleen de aanwezigheid van `klassement_aan`: een herdefinitie die er
 *    `organization_id` of een punt bij zet, wordt hier rood.
 *
 * ⚠️ **De stand wordt omgezet langs de échte knop** (`zet_groepsklassement()`,
 *    0336), niet met een `update` op `groups`. Anders toetst dit de functie
 *    gegeven een zelfgemaakte toestand, en niet de belofte "wat de beheerder
 *    instelt, staat op de uitnodiging" (regel 18, vraag 2 en 4).
 *
 * IJKING — met de hand gedraaid op 23-11-2026 tegen de lokale stack (alle
 * migraties), mutatie per grendel, telkens op de gedeployde functie en daarna
 * hersteld (5/5 groen):
 *
 *   A  `'klassement_aan', g.klassement_aan,` uit `invite_preview()` gehaald
 *      → 📏 4 rood: beide sleutelset-toetsen en beide standtoetsen.
 *   B  `'klassement_aan', true,` in plaats van de kolom
 *      → 📏 1 rood: alleen "uit". De sleutelset klopt dan, de stand niet.
 *   C  `'organization_id', g.organization_id,` erbij
 *      → 📏 2 rood: beide sleutelset-toetsen; de standtoetsen blijven groen.
 *   D  `grant execute on function zet_groepsklassement(…) to anon`
 *      → 📏 1 rood: alleen de plafondtoets.
 *
 * En voor `teamgroep` (besluit Quinten 23-11-2026, optie A), dezelfde dag, zelfde
 * werkwijze, met vijf rollen (teamlid, beheerder, anon, niet-lid, uitgezet lid):
 *
 *   E  de lidtoets weg (`'teamgroep', g.organization_id is not null`)
 *      → 📏 1 rood, op "anon: teamgroep". Dat is het orakel dat 0317 met
 *        `invalid` dichthoudt.
 *   F  `'teamgroep', false and …`
 *      → 📏 1 rood, op "teamlid: teamgroep".
 *   H  `actief_organisatielid()` vervangen door een `exists` zonder statustoets
 *      → 📏 1 rood, op "uitgezet organisatielid: teamgroep".
 *   I  alleen `and ingelogd` weg
 *      → 📏 0 rood, en dat is juist: `actief_organisatielid(org, null)` is al
 *        `false`. `ingelogd` is een kortsluiting en geen eigen grendel; de
 *        grendel tegen anon is de lidtoets, en die bewaakt E.
 *   G  het hele veld weg (eerdere ronde)
 *      → 📏 4 rood: beide sleutelset-toetsen, "gewone groep" en de teamtoets.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 120_000;

/** De sleutels die `invite_preview()` na 0341 teruggeeft — en geen andere. */
const SLEUTELS = [
  'detailed',
  'group_id',
  'group_name',
  'huddle_day',
  'icon',
  'klassement_aan',
  'member_count',
  'members',
  'teamgroep',
  'zichtbaarheid',
].sort();

/** De sleutels per lid, ongewijzigd sinds 0128. */
const LIDSLEUTELS = ['avatar_url', 'display_name', 'goal_title'].sort();

describe.skipIf(!rlsTestsConfigured)('de uitnodiging noemt de stand van het klassement', () => {
  let eigenaar: TestUser;
  let genodigde: TestUser;
  let groupId: string;
  let code: string;

  beforeAll(async () => {
    eigenaar = await createTestUser('klassement-uitnodiging-eigenaar');
    genodigde = await createTestUser('klassement-uitnodiging-genodigde');

    const groep = await eigenaar.db.rpc('create_group', {
      group_name: 'Klassement op de kaart',
      huddle_day: 1,
    });
    if (groep.error) throw new Error(`create_group: ${groep.error.message}`);
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`create_group: ${JSON.stringify(groep.data)}`);
    groupId = g.group.id;
    code = g.group.invite_code;
    registreerGroep(groupId);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function kaart(wie: TestUser | null, welke = code): Promise<Record<string, unknown>> {
    const db = wie === null ? anonDb() : wie.db;
    const { data, error } = await db.rpc('invite_preview', { code: welke });
    if (error) throw new Error(`invite_preview: ${error.message}`);
    expect(data, 'geen kaart voor een geldige code').not.toBeNull();
    return data as unknown as Record<string, unknown>;
  }

  async function zetKlassement(aan: boolean): Promise<void> {
    const { data, error } = await eigenaar.db.rpc('zet_groepsklassement', {
      p_group_id: groupId,
      p_aan: aan,
      p_bevestigd: true,
    });
    if (error) throw new Error(`zet_groepsklassement: ${error.message}`);
    // De knop moet het echt omzetten, niet `unchanged` zeggen over een stand die er al was.
    expect(data, 'zet_groepsklassement zette niets om').toEqual({ ok: true, klassement: aan });
    const stand = psql(`select klassement_aan from groups where id = '${groupId}'`).trim();
    expect(stand, `zet_groepsklassement(${aan}) gaf ${JSON.stringify(data)}`).toBe(aan ? 't' : 'f');
  }

  it(
    'anon leest precies de sleutels van vóór 0341 plus klassement_aan en teamgroep, en per lid niets nieuws',
    async () => {
      const uit = await kaart(null);
      expect(Object.keys(uit).sort()).toEqual(SLEUTELS);
      expect(uit.detailed).toBe(false);
      for (const lid of uit.members as Record<string, unknown>[]) {
        expect(Object.keys(lid).sort()).toEqual(LIDSLEUTELS);
        expect(lid.goal_title, 'anon hoort geen doeltitel te lezen').toBeNull();
        expect(lid.avatar_url).toBeNull();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'een ingelogde genodigde krijgt dezelfde sleutelset',
    async () => {
      const uit = await kaart(genodigde);
      expect(Object.keys(uit).sort()).toEqual(SLEUTELS);
      expect(uit.detailed).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet de beheerder het uit, dan zegt de kaart uit — ook zonder account',
    async () => {
      // ⚠️ Eerst uit: een nieuwe groep begint al met het klassement aan (0336), en dan
      //    gaf `zet_groepsklassement(true)` `unchanged` en toetste de aan-stap de knop niet
      //    (gevonden in de security-review).
      expect((await kaart(null)).klassement_aan, 'de standaard van een nieuwe groep').toBe(true);
      await zetKlassement(false);
      expect((await kaart(null)).klassement_aan).toBe(false);
      expect((await kaart(genodigde)).klassement_aan).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet de beheerder het weer aan, dan zegt de kaart aan — ook zonder account',
    async () => {
      await zetKlassement(true);
      expect((await kaart(null)).klassement_aan).toBe(true);
      expect((await kaart(genodigde)).klassement_aan).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'een gewone groep is geen teamgroep, voor niemand',
    async () => {
      expect((await kaart(null)).teamgroep).toBe(false);
      expect((await kaart(genodigde)).teamgroep).toBe(false);
      expect((await kaart(eigenaar)).teamgroep).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'een teamgroep: true alleen voor een actief organisatielid; anon, een niet-lid en een uitgezet lid lezen false (0317)',
    async () => {
      // ⚠️⚠️ Besluit Quinten 23-11-2026 (optie A). De belofte is tweezijdig. `join_group_with_code()` geeft een
      //    niet-organisatielid met opzet `invalid`, zodat het geen orakel is op codes van een organisatie; de kaart
      //    mag dat niet alsnog verraden. En wie wél kan joinen, hoort "geen klassement" te lezen en niet "gaat het
      //    later aan". Alle vier de rollen via de echte RPC's en met echte JWT's, geen handgezette rijen.
      const teamlid = await createTestUser('klassement-uitnodiging-teamlid');
      const uitgezet = await createTestUser('klassement-uitnodiging-uitgezet');

      await laatOrganisatieAanmaken(eigenaar);
      const o = await eigenaar.db.rpc('maak_organisatie' as never, { p_naam: 'Kaart BV' } as never);
      const org = (o.data as unknown as { organization_id?: string } | null)?.organization_id;
      expect(org, JSON.stringify(o.data)).toBeDefined();
      const oc = await eigenaar.db.rpc('organisatie_uitnodigcode' as never, { p_organization_id: org } as never);
      const orgcode = (oc.data as unknown as { code?: string } | null)?.code;
      expect(orgcode, JSON.stringify(oc.data)).toBeDefined();
      for (const wie of [teamlid, uitgezet]) {
        const w = await wie.db.rpc('word_organisatielid' as never, { p_code: orgcode } as never);
        expect((w.data as unknown as { ok?: boolean } | null)?.ok, JSON.stringify(w.data)).toBe(true);
      }

      const t = await eigenaar.db.rpc(
        'maak_teamgroep' as never,
        { p_organization_id: org, p_naam: 'Team Kaart' } as never,
      );
      const team = (t.data as unknown as { group_id?: string } | null)?.group_id;
      expect(team, JSON.stringify(t.data)).toBeDefined();
      registreerGroep(team as string);
      const rij = await adminDb().from('groups').select('invite_code').eq('id', team as string).single();
      const teamcode = (rij.data as { invite_code: string } | null)?.invite_code;
      expect(teamcode, 'een teamgroep zonder code toetst niets').toBeTruthy();

      // Het teamlid zit echt in de teamgroep, via de code; het uitgezette lid wordt daarna uit de organisatie gezet.
      const j = await teamlid.db.rpc('join_group_with_code', { code: teamcode as string });
      expect((j.data as { ok?: boolean } | null)?.ok, JSON.stringify(j.data)).toBe(true);
      const z = await eigenaar.db.rpc(
        'zet_organisatielid_uit' as never,
        { p_organization_id: org, p_user_id: uitgezet.id } as never,
      );
      expect(z.error, z.error?.message).toBeNull();
      const stand = psql(
        `select status from organization_members where organization_id = '${org}' and user_id = '${uitgezet.id}'`,
      ).trim();
      expect(stand, `zet_organisatielid_uit gaf ${JSON.stringify(z.data)}`).not.toBe('active');

      for (const [wie, naam, verwacht] of [
        [teamlid, 'teamlid', true],
        [eigenaar, 'organisatiebeheerder', true],
        [null, 'anon', false],
        [genodigde, 'niet-lid', false],
        [uitgezet, 'uitgezet organisatielid', false],
      ] as const) {
        const uit = await kaart(wie, teamcode);
        expect(Object.keys(uit).sort(), naam).toEqual(SLEUTELS);
        expect(uit.teamgroep, `${naam}: teamgroep`).toBe(verwacht);
        expect(uit.klassement_aan, `${naam}: een teamgroep heeft nooit een klassement`).toBe(false);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'anon kan nog steeds precies één security-definer-functie uitvoeren, en dat is deze',
    () => {
      // ⚠️ Hetzelfde plafond als `scripts/adviseur-controle.mjs` (anon: 1), maar
      //    hier op de catalogus en niet op de adviseur: 0341 is een
      //    `create or replace` en hoort geen tweede functie of grant te maken.
      const rijen = psql(
        `select p.oid::regprocedure from pg_proc p ` +
          `where p.pronamespace = 'public'::regnamespace and p.prosecdef ` +
          `and has_function_privilege('anon', p.oid, 'execute') order by 1`,
      )
        .trim()
        .split('\n')
        .filter((r) => r.length > 0);
      expect(rijen).toEqual(['invite_preview(text)']);
    },
    TEST_TIMEOUT,
  );
});
