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
  /**
   * ⚠️⚠️ **De belofte: je kunt je eigen naam niet onzichtbaar maken** — QS8-448,
   *    `profiles_display_name_zichtbaar` uit migratie 0256.
   *
   *    📏 Dit is de route die de eerste versie van dat issue **open liet**. Die
   *    repareerde `handle_new_user()`, dus de aanmelding, en liet de schrijfkant
   *    staan: één `PATCH /rest/v1/profiles?id=eq.<eigen id>` met een zero-width
   *    space zette je als naamloos lid in het groepsoverzicht. `profiles_update`
   *    toetst alleen `id = auth.uid()` en de enige inhoudelijke CHECK was
   *    `profiles_display_name_len` — één zero-width space is één codepunt.
   *
   *    Dat is bovendien de **makkelijkere** deur: om groepszichtbaar te zijn heb
   *    je toch al een account. `profielSchema` staat in de bundel en draait in de
   *    browser van de aanvaller, dus die is geen grens.
   *
   * ⚠️ **Deze toets gaat door PostgREST en niet over psql.** Dat is met opzet:
   *    hij moet de route nemen die een aanvaller neemt, niet de route waarop de
   *    CHECK toevallig ook zit. Een test die `schone_naam()` aanroept, toetst de
   *    functie; deze toetst de grens.
   */
  describe('een onzichtbare weergavenaam komt er niet in', () => {
    const ONZICHTBAAR: readonly { readonly naam: string; readonly waarde: string }[] = [
      { naam: 'zero-width space', waarde: String.fromCodePoint(0x200b) },
      { naam: 'no-break space', waarde: String.fromCodePoint(0x00a0) },
      { naam: 'hangul filler', waarde: String.fromCodePoint(0x3164) },
      { naam: 'braille blank', waarde: String.fromCodePoint(0x2800) },
      { naam: 'soft hyphen', waarde: String.fromCodePoint(0x00ad) },
      { naam: 'language tag', waarde: String.fromCodePoint(0xe0001) },
      { naam: 'alleen spaties', waarde: '   ' },
      { naam: 'newline en tab', waarde: '\n\t' },
    ];

    it.each(ONZICHTBAAR)(
      'weigert $naam',
      async ({ waarde }) => {
        const { error } = await alice.db
          .from('profiles')
          .update({ display_name: waarde })
          .eq('id', alice.id)
          .select('id')
          .single();

        // 23514 — check_violation. Slaagt dit, dan staat er een lid zonder
        // leesbare naam in het groepsoverzicht van iedereen die een groep deelt.
        expect(
          error?.code,
          'de database liet een onzichtbare weergavenaam toe — `display_name` is ' +
            'groepszichtbaar via `profiles_select`',
        ).toBe('23514');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De must-allow, en die is hier niet optioneel.** 📏 Gemeten: een CHECK
     *    die `public.schone_naam()` aanroept zónder `grant execute` aan
     *    `authenticated` laat **élke** profielschrijving omvallen op
     *    `permission denied for function schone_naam` — ook een doodgewone naam.
     *    Postgres toetst het uitvoerrecht op het moment van schrijven. Zonder dit
     *    geval was dat een dichte deur die als een veilige deur leest.
     */
    it.each([
      { naam: 'een gewone naam', waarde: 'Jan Jansen' },
      { naam: 'een naam met een spatie erin', waarde: 'Jan  Jansen' },
      { naam: 'een gezinsemoji', waarde: '👨‍👩‍👧‍👦' },
      { naam: 'een naam met onzichtbare randen eromheen', waarde: ' Jan ' },
    ])(
      'laat $naam wel toe',
      async ({ waarde }) => {
        const { error } = await alice.db
          .from('profiles')
          .update({ display_name: waarde })
          .eq('id', alice.id)
          .select('id')
          .single();

        expect(error, 'de CHECK weigert een naam die hij hoort door te laten').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * De belofte: **een weergavenaam kan niet als een ándere naam renderen** —
   * QS8-450, migratie 0269.
   *
   * ⚠️⚠️ **Dit is een andere klasse dan het blok hierboven, en de grens is een
   *    andere.** Daar ging het om een naam die als **niets** rendert, en die
   *    weigert `profiles_display_name_zichtbaar`. Hier gaat het om een naam die
   *    als **iets anders** rendert, en die weigert
   *    `profiles_display_name_geen_bidi`. 📏 Het gemeten geval uit de
   *    security-review: `display_name` = `gxp‮eterces` rendert als
   *    `secrete.pxg`, en `display_name` is groepszichtbaar via
   *    `profiles_select`.
   *
   * ⚠️⚠️ **Het verschil is dat deze tekens aan de rand al gestreken werden.** Ze
   *    stáán in de bereikenlijst van 0256 — met tekst eromheen bleven ze alleen
   *    staan, want die lijst wordt met opzet alleen op de randen toegepast. Een
   *    toets die alleen een kaal stuurteken instuurt, blijft dus groen op precies
   *    de bug: elk geval hieronder heeft zichtbare tekens aan **beide** kanten.
   *
   * ⚠️ Door PostgREST en niet over psql — de route die een aanvaller neemt.
   */
  describe('een weergavenaam die omkeert komt er niet in', () => {
    const OMKEREND: readonly { readonly naam: string; readonly waarde: string }[] = [
      { naam: 'de gemeten spoofnaam', waarde: 'gxp\u202Eeterces' },
      { naam: 'right-to-left override', waarde: `a${String.fromCodePoint(0x202e)}b` },
      { naam: 'left-to-right override', waarde: `a${String.fromCodePoint(0x202d)}b` },
      { naam: 'right-to-left embedding', waarde: `a${String.fromCodePoint(0x202b)}b` },
      { naam: 'pop directional formatting', waarde: `a${String.fromCodePoint(0x202c)}b` },
      { naam: 'right-to-left isolate', waarde: `a${String.fromCodePoint(0x2067)}b` },
      { naam: 'pop directional isolate', waarde: `a${String.fromCodePoint(0x2069)}b` },
    ];

    it.each(OMKEREND)(
      'weigert $naam',
      async ({ waarde }) => {
        const { error } = await alice.db
          .from('profiles')
          .update({ display_name: waarde })
          .eq('id', alice.id)
          .select('id')
          .single();

        expect(
          error?.code,
          'de database liet een naam toe die omgekeerd rendert — die staat in de ' +
            'ledenlijst van iedereen die een groep met je deelt',
        ).toBe('23514');

        // ⚠️ **De naam van de constraint erbij, en dat is geen sierlijkheid.**
        //    `23514` zegt alleen "een CHECK weigerde dit". `profiles` draagt er
        //    vijftien; een tweede die deze invoer toevallig ook weigert, houdt
        //    deze toets groen terwijl `profiles_display_name_geen_bidi` weg is.
        //    Dat is regel 18 vraag 3 — toets de belofte, niet het symptoom.
        expect(
          error?.message ?? '',
          'een CHECK weigerde dit, maar niet degene die deze toets bewaakt',
        ).toContain('profiles_display_name_geen_bidi');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De must-allow, en om dezelfde reden als hierboven niet optioneel.**
     *    📏 `profiles_display_name_geen_bidi` roept `public.zonder_bidi()` aan;
     *    zónder `grant execute` aan `authenticated` valt élke profielschrijving
     *    om op `permission denied for function zonder_bidi` — ook een naam die
     *    niets met bidi te maken heeft. Een dichte deur leest als een veilige
     *    deur.
     *
     * ⚠️ De laatste twee zijn de besluiten uit migratie 0269: de RLM is een
     *    *markering* en geen override, en homoglyphen worden hier niet opgelost.
     *    Ze staan hier zodat die twee besluiten zichtbaar zijn als besluit en
     *    niet als omissie — wie ze ooit omkeert, maakt deze toetsen rood en leest
     *    dan waarom ze er stonden.
     */
    it.each([
      { naam: 'een gewone naam', waarde: 'Jan Jansen' },
      { naam: 'een gezinsemoji', waarde: '👨‍👩‍👧‍👦' },
      { naam: 'een Arabische naam', waarde: 'محمد' },
      { naam: 'een naam met een right-to-left mark', waarde: `a${String.fromCodePoint(0x200f)}b` },
      { naam: 'een naam met een Cyrillische homoglyph', waarde: 'J\u0430n' },
    ])(
      'laat $naam wel toe',
      async ({ waarde }) => {
        const { error } = await alice.db
          .from('profiles')
          .update({ display_name: waarde })
          .eq('id', alice.id)
          .select('id')
          .single();

        expect(error, 'de CHECK weigert een naam die hij hoort door te laten').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
