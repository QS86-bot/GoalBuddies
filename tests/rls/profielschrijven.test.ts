/**
 * Kan een gebruiker zijn eigen profiel daadwerkelijk opslaan?
 *
 * ⚠️ **Deze suite bestaat door een storing die vier maanden lang onzichtbaar had
 *    kunnen blijven.** Migratie 0089 gaf `authenticated` nog maar leesrecht op
 *    `id`, `display_name` en `avatar_url` van `profiles` — terecht, want RLS kan
 *    geen kolommen beperken en een groepsgenoot kon anders je dagritme uitlezen.
 *    De lééskant is uitgebreid getest. De schrijfkant niet, en `updateProfiel()`
 *    vroeg zijn rij terug met `.select('*')`. Een `returning *` vraagt leesrecht
 *    op élke kolom, dus vanaf 0089 viel élke profielopslag om met 42501.
 *
 * ⚠️ **De aanname die het in stand hield stond in een test opgeschreven:** dat
 *    PostgREST bij `select=*` stilletjes de kolommen weglaat waar je geen recht
 *    op hebt. Dat doet hij niet. Deze suite vervangt die aanname door een proef —
 *    en toetst daarom expliciet béide kanten: de brede selectie moet weigeren, de
 *    smalle moet slagen. Zonder die eerste helft bewijst de tweede niet dat de
 *    grens er nog staat.
 *
 * ⚠️ De statische helft staat in `npm run kolomrechten:controle`: die legt élke
 *    `select()` in `src/` en `app/` naast de echte grants. Deze suite toetst wat
 *    de database doet, dat script toetst wat de app vraagt. Je hebt ze allebei
 *    nodig — de storing zat precies tussen die twee in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

describe.skipIf(!rlsTestsConfigured)('Je eigen profiel opslaan', () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('profielschrijven-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'weigert de rij breed terug te geven — de grens van 0089 staat er nog',
    async () => {
      const { error } = await alice.db
        .from('profiles')
        .update({ locale: 'en' })
        .eq('id', alice.id)
        .select('*');

      // 42501 — insufficient_privilege. Slaagt dit ooit, dan is de kolomgrant
      // weg en leest elke groepsgenoot je dagritme weer mee.
      expect(error?.code).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **`week_start_day` stond hier tot 0139 bij, en is er bewust uit.** Die
   *    kolom is sinds die migratie voor de client niet meer schrijfbaar: hij
   *    gaat via `zet_week_startdag()`, dat de dag én de lopende `todo`-weekdoelen
   *    in één transactie verzet (QS8-138).
   *
   *    Deze test bleef hier staan met de kolom erin en werd terecht rood met
   *    42501 — de smalle weg is smaller geworden. **De belofte die eraan hing is
   *    niet weg maar verhuisd**, en wordt nu getoetst in
   *    `tests/rls/weekstart.test.ts`: dat de kolom dicht zit, dat de RPC hem zet,
   *    en dat de kolommen die de app wél schrijft open blijven. Zonder die
   *    verwijzing is dit precies de verhuizing waar regel 18 voor waarschuwt.
   */
  it(
    'slaat de taal en de tijdzone op langs de smalle weg',
    async () => {
      const { data, error } = await alice.db
        .from('profiles')
        .update({ locale: 'en', tz: 'Pacific/Auckland' })
        .eq('id', alice.id)
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBe(alice.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'leest het resultaat terug via `mijn_profiel`, zoals de app dat doet',
    async () => {
      // ⚠️ De naad. Schrijven kan smal, lezen kan alleen via de view die met de
      //    rechten van zijn eigenaar draait — en pas als die twee samen werken,
      //    kan een gebruiker zijn instelling zien staan.
      const { data, error } = await alice.db
        .from('mijn_profiel')
        .select('*')
        .eq('id', alice.id)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.locale).toBe('en');
      expect(data?.tz).toBe('Pacific/Auckland');
    },
    TEST_TIMEOUT,
  );

  it(
    'rondt de onboarding af zonder de brede selectie',
    async () => {
      // Zonder dit kon niemand ooit voorbij het onboardingscherm komen.
      const { error } = await alice.db
        .from('profiles')
        .update({ onboarded_at: 'now', wants_own_goal: true })
        .eq('id', alice.id)
        .select('id')
        .single();

      expect(error).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
