import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CATEGORIEEN } from '../../src/modules/goals/schemas';
import {
  MINUTEN_OPTIES,
  MOMENTEN,
  VALKUILEN,
} from '../../src/modules/goals/vragenlijst-schemas';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * De vier antwoorden op het profiel — QS8-257, migratie 0143.
 *
 * ⚠️ **De belangrijkste toets hier is dat een groepsgenoot ze niet leest.**
 *    "Wat laat jouw gewoontes normaal gesproken stuklopen" gaat per definitie
 *    over eerdere mislukking, en domeinregel 7 houdt eigen tegenslag privé. Dat
 *    is geen policy maar een **kolomgrant** — RLS kan geen kolommen beperken, en
 *    0089 heeft `profiles` daarom teruggebracht tot drie leesbare kolommen.
 *
 * ⚠️ **En dat er überhaupt geschréven kan worden.** `profiles` heeft
 *    kolomgrants voor INSERT en UPDATE; een nieuwe kolom is niet schrijfbaar tot
 *    hij genoemd wordt. Dat ging op 01-09 bij QS8-224 precies één keer mis, met
 *    `goals`, en brak toen élk doel aanmaken.
 */

const SETUP_TIMEOUT = 120_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  anna: TestUser;
  /** Zit met Anna in één groep en mag haar antwoorden dus níét lezen. */
  bram: TestUser;
  groepId: string;
}

let f: Fixture;

describe.skipIf(!rlsTestsConfigured)('de korte vragenlijst', () => {
  beforeAll(async () => {
    const anna = await createTestUser('vragenlijst-anna');
    const bram = await createTestUser('vragenlijst-bram');

    const groep = await anna.db.rpc('create_group', { group_name: 'Vragenlijst' });
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
  // De lijsten in de app en de CHECKs in de database
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Dezelfde toets als bij `goals_category_valid` in QS8-224**, en om
   *    dezelfde reden: de lijst in de app is een kopie van de CHECK, en toen
   *    0032 en 0034 uit elkaar liepen vergeleek de test de app-lijst met
   *    zichzelf en bleef groen.
   */
  it(
    'laat precies de focusgebieden toe die een doel als categorie kent',
    async () => {
      const { data, error } = await adminDb().rpc('check_waarden', {
        p_tabel: 'profiles',
        p_constraint: 'profiles_focus_areas_geldig',
      });

      expect(error).toBeNull();
      const inDeDatabase = [...(data ?? [])].sort();

      expect(inDeDatabase.length, 'de constraint geeft geen waarden terug').toBeGreaterThan(0);
      expect(inDeDatabase).toEqual([...CATEGORIEEN].sort());
    },
    TEST_TIMEOUT,
  );

  it(
    'laat precies de momenten toe die de app kent',
    async () => {
      const { data } = await adminDb().rpc('check_waarden', {
        p_tabel: 'profiles',
        p_constraint: 'profiles_moment_geldig',
      });

      expect([...(data ?? [])].sort()).toEqual([...MOMENTEN].sort());
    },
    TEST_TIMEOUT,
  );

  it(
    'laat precies de valkuilen toe die de app kent',
    async () => {
      const { data } = await adminDb().rpc('check_waarden', {
        p_tabel: 'profiles',
        p_constraint: 'profiles_valkuilen_geldig',
      });

      expect([...(data ?? [])].sort()).toEqual([...VALKUILEN].sort());
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Schrijven
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De toets die QS8-224 miste.** Een nieuwe kolom op een tabel met
   *    kolomgrants is niet schrijfbaar tot hij genoemd wordt, en dat faalt niet
   *    bij het migreren maar pas als een client hem meestuurt.
   */
  it(
    'laat de eigenaar zijn eigen antwoorden schrijven',
    async () => {
      const uit = await f.anna.db
        .from('profiles')
        .update({
          focus_areas: ['fitness', 'learning'],
          minutes_per_day: 30,
          when_i_do_it: 'morning',
          what_breaks_it: ['all_or_nothing'],
        })
        .eq('id', f.anna.id);

      expect(uit.error, `schrijven: ${uit.error?.message}`).toBeNull();

      const na = await adminDb()
        .from('profiles')
        .select('focus_areas, minutes_per_day, when_i_do_it, what_breaks_it')
        .eq('id', f.anna.id)
        .single();

      expect(na.data?.focus_areas).toEqual(['fitness', 'learning']);
      expect(na.data?.minutes_per_day).toBe(30);
      expect(na.data?.when_i_do_it).toBe('morning');
      expect(na.data?.what_breaks_it).toEqual(['all_or_nothing']);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een vierde focusgebied',
    async () => {
      const uit = await f.anna.db
        .from('profiles')
        .update({ focus_areas: [...CATEGORIEEN].slice(0, 4) })
        .eq('id', f.anna.id);

      expect(uit.error?.code, 'vier gebieden werden gewoon opgeslagen').toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een verzonnen valkuil en een verzonnen moment',
    async () => {
      const valkuil = await f.anna.db
        .from('profiles')
        .update({ what_breaks_it: ['te_moe'] })
        .eq('id', f.anna.id);
      expect(valkuil.error?.code).toBe('23514');

      const moment = await f.anna.db
        .from('profiles')
        .update({ when_i_do_it: 'nachts' })
        .eq('id', f.anna.id);
      expect(moment.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een minutenwaarde die niet aangeboden wordt',
    async () => {
      const uit = await f.anna.db
        .from('profiles')
        .update({ minutes_per_day: 7 })
        .eq('id', f.anna.id);

      expect(uit.error?.code).toBe('23514');
      expect(MINUTEN_OPTIES).not.toContain(7);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // Lezen — en dit is waar het om gaat
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **De toets waarvoor dit bestand bestaat.** Rood gemaakt door in 0143 een
   *    `grant select (what_breaks_it) on public.profiles to authenticated` toe te
   *    voegen: Bram las meteen waar Anna's gewoontes op stuklopen, en geen
   *    enkele andere toets in de suite merkte het. RLS kan hier niets aan doen —
   *    hij beslist over rijen en dit is een kolom.
   */
  it(
    'laat een groepsgenoot de antwoorden niet lezen',
    async () => {
      const uit = await f.bram.db
        .from('profiles')
        .select('what_breaks_it, minutes_per_day, when_i_do_it, focus_areas')
        .eq('id', f.anna.id);

      // Een kolomgrant die ontbreekt levert `42501` op — de rij wordt niet
      // gefilterd, het verzoek wordt geweigerd.
      expect(uit.error?.code, 'een groepsgenoot kreeg de vragenlijst gewoon terug').toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een groepsgenoot wél lezen wat hij altijd al mocht',
    async () => {
      // ⚠️ De tegenproef: zonder deze helft is de toets hierboven gratis groen
      //    bij een tikfout in een kolomnaam of een gebroken lidmaatschap.
      const uit = await f.bram.db
        .from('profiles')
        .select('id, display_name')
        .eq('id', f.anna.id);

      expect(uit.error, `naam lezen: ${uit.error?.message}`).toBeNull();
      expect((uit.data ?? []).length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de eigenaar zijn eigen antwoorden wél terug, via mijn_profiel',
    async () => {
      const uit = await f.anna.db
        .from('mijn_profiel')
        .select('what_breaks_it, minutes_per_day, when_i_do_it, focus_areas')
        .single();

      expect(uit.error, `eigen profiel: ${uit.error?.message}`).toBeNull();
      expect(uit.data?.minutes_per_day).toBe(30);
    },
    TEST_TIMEOUT,
  );
});
