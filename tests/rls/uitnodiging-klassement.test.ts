import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  anonDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
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
 * IJKING — met de hand gedraaid op 23-11-2026 tegen de lokale stack (alle 344
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

  async function kaart(wie: TestUser | null): Promise<Record<string, unknown>> {
    const db = wie === null ? anonDb() : wie.db;
    const { data, error } = await db.rpc('invite_preview', { code });
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
    'anon leest precies de sleutels van vóór 0341 plus klassement_aan, en per lid niets nieuws',
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
