import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GEVOELENS as GEVOELENS_NOTIFICATIES } from '../../src/modules/notifications/regels';
import {
  GEVOELENS,
  MAX_EIGEN_GEVOEL,
} from '../../src/modules/goals/vragenlijst-schemas';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Hoe wil je je voelen — QS8-733, migratie 0311.
 *
 * ⚠️ **De toets waarvoor dit bestand bestaat is dat een groepsgenoot beide kolommen
 *    niet leest, ook niet met één API-verzoek.** Een gevoel en een eigen omschrijving
 *    zijn eigen zaken (domeinregel 7) en RLS kan geen kolommen beperken: het is de
 *    kolomgrant van 0089 (alleen `id`, `display_name`, `avatar_url`) die het dichthoudt.
 *    Rood gemaakt met de hand: `grant select (feeling, feeling_own) on public.profiles
 *    to authenticated;` in 0311 → "laat een groepsgenoot beide kolommen niet lezen"
 *    en "…ook niet met een ster" vallen om.
 *
 * ⚠️ **En de lengtegrens staat hier in codepunten**, zoals `char_length` telt: 60
 *    emoji gaan erdoor en 61 niet, ook al zijn het 120 en 122 UTF-16-eenheden.
 */

const SETUP_TIMEOUT = 120_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  anna: TestUser;
  /** Zit met Anna in één groep en mag haar gevoel dus níét lezen. */
  bram: TestUser;
  groepId: string;
}

let f: Fixture;

describe.skipIf(!rlsTestsConfigured)('hoe wil je je voelen', () => {
  beforeAll(async () => {
    const anna = await createTestUser('gevoel-anna');
    const bram = await createTestUser('gevoel-bram');

    const groep = await anna.db.rpc('create_group', { group_name: 'Gevoel' });
    const gelezen = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (gelezen.ok !== true || !gelezen.group) throw new Error('groep aanmaken mislukte');

    const mee = await bram.db.rpc('join_group_with_code', { code: gelezen.group.invite_code });
    if ((mee.data as unknown as { ok?: boolean }).ok !== true) throw new Error('meedoen mislukte');

    f = { anna, bram, groepId: gelezen.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('groups').delete().eq('id', f.groepId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // De lijsten: database, doelenmodule en notificatiemodule
  // -------------------------------------------------------------------------

  it(
    'laat precies de gevoelens toe die de app en de nudge kennen',
    async () => {
      const { data, error } = await adminDb().rpc('check_waarden', {
        p_tabel: 'profiles',
        p_constraint: 'profiles_feeling_bekend',
      });

      expect(error).toBeNull();
      const inDeDatabase = [...(data ?? [])].sort();

      expect(inDeDatabase.length, 'de constraint geeft geen waarden terug').toBeGreaterThan(0);
      expect(inDeDatabase).toEqual([...GEVOELENS].sort());
      expect(inDeDatabase).toEqual([...GEVOELENS_NOTIFICATIES].sort());
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Schrijven
  // -------------------------------------------------------------------------

  it(
    'laat de eigenaar zijn gevoel en eigen woorden schrijven',
    async () => {
      const uit = await f.anna.db
        .from('profiles')
        .update({ feeling: 'calm', feeling_own: 'stap voor stap' } as never)
        .eq('id', f.anna.id);

      expect(uit.error, `schrijven: ${uit.error?.message}`).toBeNull();

      const na = await adminDb()
        .from('profiles')
        .select('feeling, feeling_own')
        .eq('id', f.anna.id)
        .single();

      expect(na.data as unknown).toEqual({ feeling: 'calm', feeling_own: 'stap voor stap' });
    },
    TEST_TIMEOUT,
  );

  it(
    'telt de lengte in codepunten: 60 emoji mogen, 61 niet',
    async () => {
      const zestig = '\u{1F600}'.repeat(MAX_EIGEN_GEVOEL);

      const goed = await f.anna.db.from('profiles').update({ feeling_own: zestig } as never).eq('id', f.anna.id);
      expect(goed.error, `60 emoji: ${goed.error?.message}`).toBeNull();

      const fout = await f.anna.db
        .from('profiles')
        .update({ feeling_own: `${zestig}x` } as never)
        .eq('id', f.anna.id);
      expect(fout.error?.code, '61 tekens werden gewoon opgeslagen').toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een lege tekst, alleen spaties en een verzonnen gevoel',
    async () => {
      for (const feeling_own of ['', '   ']) {
        const uit = await f.anna.db.from('profiles').update({ feeling_own } as never).eq('id', f.anna.id);
        expect(uit.error?.code, `"${feeling_own}"`).toBe('23514');
      }

      const gevoel = await f.anna.db.from('profiles').update({ feeling: 'boos' } as never).eq('id', f.anna.id);
      expect(gevoel.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een groepsgenoot andermans gevoel niet schrijven',
    async () => {
      await f.bram.db.from('profiles').update({ feeling: 'proud' } as never).eq('id', f.anna.id);

      const na = await adminDb().from('profiles').select('feeling').eq('id', f.anna.id).single();
      expect((na.data as { feeling?: string } | null)?.feeling, 'Bram schreef in het profiel van Anna').toBe('calm');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Lezen — en dit is waar het om gaat
  // -------------------------------------------------------------------------

  it(
    'laat een groepsgenoot beide kolommen niet lezen',
    async () => {
      for (const kolom of ['feeling', 'feeling_own']) {
        const uit = await f.bram.db.from('profiles').select(kolom).eq('id', f.anna.id);
        expect(uit.error?.code, `${kolom}: een groepsgenoot kreeg hem gewoon terug`).toBe('42501');
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een groepsgenoot ze ook niet lezen met een ster',
    async () => {
      const uit = await f.bram.db.from('profiles').select('*').eq('id', f.anna.id);

      expect(uit.error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft een groepsgenoot via mijn_profiel alleen zijn eigen rij',
    async () => {
      const uit = await f.bram.db
        .from('mijn_profiel')
        .select('id, feeling, feeling_own')
        .eq('id', f.anna.id);

      expect(uit.error).toBeNull();
      expect(uit.data ?? [], 'Bram leest het profiel van Anna via de view').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de eigenaar zijn eigen gevoel wél terug, via mijn_profiel',
    async () => {
      const uit = await f.anna.db.from('mijn_profiel').select('feeling, feeling_own').single();

      expect(uit.error, `eigen profiel: ${uit.error?.message}`).toBeNull();
      expect((uit.data as { feeling?: string } | null)?.feeling).toBe('calm');
    },
    TEST_TIMEOUT,
  );
});
