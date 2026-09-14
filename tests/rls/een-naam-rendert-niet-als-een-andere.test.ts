import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { schoneNaam, telTekens } from '../../src/shared/tekst';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Twee leden kunnen geen pixel-identieke naam dragen — QS8-495, migratie 0271.
 *
 * ⚠️⚠️ **Dit is de belofte-toets en niet de naadtoets.**
 *    `naamnormalisatie.test.ts` legt SQL en TypeScript codepunt voor codepunt
 *    naast elkaar; dat is een eigenschap van de twee **onderdelen**. Wat hier
 *    staat is de belofte van het gehéél: *een lid krijgt zijn naam niet door de
 *    eigen deur van de app naar binnen als die naam als een ándere naam
 *    rendert.* Die twee kunnen uit elkaar lopen — de functies kunnen het eens
 *    zijn terwijl de trigger niet draait, of terwijl een kolomgrant de
 *    schrijfactie langs een andere weg laat lopen.
 *
 *    📏 Dat is geen hypothese: QS8-448 had precies die vorm. De grens stond in
 *    `profielSchema` (de browser van de aanvaller) en niet in de database, en
 *    elke test op dat schema was groen.
 *
 * ⚠️ **Via PostgREST als een echte `authenticated`, en niet via `psql`.** Dat is
 *    acceptatiecriterium 3 van QS8-495 met zoveel woorden, en het is de enige
 *    manier waarop de trigger, de CHECK en de kolomgrant alle drie meedoen.
 */

const TEST_TIMEOUT = 30_000;

/** Het gemeten geval uit de security-review op QS8-450, woordelijk. */
const ZWSP = '​';
const BOM = '﻿';
const SOFT_HYPHEN = '­';
/** De twee die met reden blijven staan — zie §4 van het beslisdocument. */
const ZWNJ = '‌';
const ZWJ = '‍';

describe.skipIf(!rlsTestsConfigured)('een naam die als een andere naam rendert', () => {
  let jan: TestUser;
  let mallory: TestUser;

  beforeAll(async () => {
    jan = await createTestUser('spoofnaam-jan');
    mallory = await createTestUser('spoofnaam-mallory');
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  /** De naam zoals hij ná een geslaagde schrijfactie in de database staat. */
  async function schrijfEnLees(wie: TestUser, naam: string): Promise<string> {
    const geschreven = await wie.db.from('profiles').update({ display_name: naam }).eq('id', wie.id);
    if (geschreven.error) throw new Error(`schrijven (${naam}): ${geschreven.error.message}`);

    const gelezen = await adminDb().from('profiles').select('display_name').eq('id', wie.id).single();
    if (gelezen.error) throw new Error(`lezen: ${gelezen.error.message}`);
    return (gelezen.data as { display_name: string }).display_name;
  }

  /**
   * Of deze naam geweigerd wordt, en wat er daarna in de database staat.
   *
   * ⚠️⚠️ **Twee dingen en niet één, want "er kwam een fout" is hier niet genoeg.**
   *    Een `update` die op een filter niets raakt geeft óók geen fout en
   *    verandert óók niets (valkuil 5). Deze helper zet daarom eerst een naam
   *    die wél mag, en toetst daarna dat de weigering de rij op díé naam laat
   *    staan — dan staat vast dat de schrijfactie de rij echt probeerde te raken.
   */
  async function magNietLandenAlsNaam(wie: TestUser, naam: string): Promise<void> {
    const anker = `Anker${Math.random().toString(36).slice(2, 8)}`;
    expect(await schrijfEnLees(wie, anker), 'de opstelling zelf mislukte').toBe(anker);

    const poging = await wie.db.from('profiles').update({ display_name: naam }).eq('id', wie.id);

    expect(poging.error, `\`${JSON.stringify(naam)}\` had geweigerd moeten worden`).not.toBeNull();
    // 23514 = check_violation. De code staat erbij omdat een ándere fout — een
    // 42501 van een ontbrekende kolomgrant bijvoorbeeld — deze toets groen zou
    // houden zonder dat de CHECK er iets mee te maken had.
    expect(poging.error?.code, 'en wel door de CHECK').toBe('23514');

    const na = await adminDb().from('profiles').select('display_name').eq('id', wie.id).single();
    expect((na.data as { display_name: string }).display_name, 'de rij is onveranderd').toBe(anker);
  }

  describe('de gemeten gevallen komen er niet meer door', () => {
    it(
      'weigert `Ja<ZWSP>n`, ingestuurd via PostgREST',
      async () => {
        /**
         * 📏 **Woordelijk het geval uit het issue**, en vóór 0271 landde dit als
         *    een naam van vier codepunten die als `Jan` rendert en die béíde
         *    CHECKs haalde.
         *
         * 📏 IJKING A — de CHECK `profiles_display_name_geen_onzichtbaar_middenin`
         *    uit 0271 weggehaald en het schema opnieuw opgebouwd: deze toets werd
         *    rood — de naam landde met vier codepunten.
         */
        await magNietLandenAlsNaam(mallory, `Ja${ZWSP}n`);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert de byte order mark en de soft hyphen net zo goed',
      async () => {
        await magNietLandenAlsNaam(mallory, `Ja${BOM}n`);
        await magNietLandenAlsNaam(mallory, `Ja${SOFT_HYPHEN}n`);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat Jan zijn eigen naam houden terwijl Mallory die niet kan nadoen',
      async () => {
        /**
         * ⚠️⚠️ **Dit is de belofte in zijn eigen woorden, en niet "de functie
         *    strijkt een teken weg".** Jan zet zijn echte naam; Mallory probeert
         *    die na te doen met een onzichtbaar teken en komt er niet in.
         *
         * ⚠️ **Wat dit niet belooft:** twee échte Jannen mogen wél in één groep
         *    zitten. Een uniciteitseis per groep zou dat verbieden, en dat is
         *    precies waarom optie 2 van QS8-495 is afgevallen — zie §2 van het
         *    beslisdocument.
         */
        expect(await schrijfEnLees(jan, 'Jan')).toBe('Jan');
        await magNietLandenAlsNaam(mallory, `Ja${ZWSP}n`);

        const vanJan = await adminDb()
          .from('profiles')
          .select('display_name')
          .eq('id', jan.id)
          .single();
        expect((vanJan.data as { display_name: string }).display_name).toBe('Jan');
      },
      TEST_TIMEOUT,
    );
  });

  describe('en de must-allow houdt, want die weegt hier zwaarder', () => {
    /**
     * ⚠️⚠️ **Elke toets hier vraagt het aan béíde kanten, en dat is een
     *    reparatie van deze toetsen zelf.** 📏 Bij het ijken bleek dat een
     *    mutatie in `MIDDENIN_BEREIKEN` (TypeScript) deze toetsen **groen** liet:
     *    ze schreven via PostgREST en lazen terug, dus ze bevroegen uitsluitend
     *    de SQL-kant. De naadtest vángt zo'n divergentie wel — 📏 met de spatie
     *    erbij vielen daar vier toetsen om — maar dat is een andere toets in een
     *    ander bestand, en de melding wijst dan naar "SQL en TS zijn het oneens"
     *    en niet naar "het gezin viel uit elkaar".
     *
     *    Vandaar de `schoneNaam()`-assertie ernaast: de belofte is dat een
     *    legitieme naam blijft werken, en die geldt aan allebei de kanten.
     */
    it(
      'laat een gezinsemoji zijn zeven codepunten houden',
      async () => {
        // 📏 IJKING B — `[0x200b, 0x200b]` verruimd naar `[0x200b, 0x200d]` in
        //    `MIDDENIN_BEREIKEN` (de reparatie die het erger maakt): de
        //    `schoneNaam`-assertie hieronder werd rood met vier codepunten.
        //    ⚠️ Zonder die assertie bleef deze toets groen — de mutatie zat in
        //    TypeScript en de database was ongemoeid.
        const gezin = '👨‍👩‍👧‍👦';
        expect(telTekens(gezin), 'de invoer zelf klopt niet meer').toBe(7);

        expect(telTekens(schoneNaam(gezin)), 'TypeScript').toBe(7);
        expect(telTekens(await schrijfEnLees(mallory, gezin)), 'de database').toBe(7);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een Perzische naam met U+200C werken',
      async () => {
        // ⚠️ `می‌خواهم` — de ZWNJ hoort daar orthografisch, hij is geen sier.
        //    QS8-451 gaat over dezelfde letter aan de ránd.
        const perzisch = `می${ZWNJ}خواهم`;

        expect(schoneNaam(perzisch), 'TypeScript').toBe(perzisch);
        expect(await schrijfEnLees(mallory, perzisch), 'de database').toBe(perzisch);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een Arabische naam en een naam met spaties werken',
      async () => {
        // 📏 IJKING D — de spatie meegenomen in `MIDDENIN_BEREIKEN`
        //    (`[0x0001, 0x0020]`): de `schoneNaam`-assertie hieronder werd rood
        //    met `JandeVries`. ⚠️ Ook hier bleef de databasekant groen.
        expect(schoneNaam('Jan de Vries'), 'TypeScript, spaties').toBe('Jan de Vries');
        expect(await schrijfEnLees(jan, 'Jan de Vries'), 'de database, spaties').toBe(
          'Jan de Vries',
        );

        expect(schoneNaam('محمد'), 'TypeScript, arabisch').toBe('محمد');
        expect(await schrijfEnLees(mallory, 'محمد'), 'de database, arabisch').toBe('محمد');
      },
      TEST_TIMEOUT,
    );
  });

  describe('wat er open blijft, staat hier als toets en niet als vergeetpost', () => {
    /**
     * ⚠️⚠️ **`Ja<ZWNJ>n` komt er nog steeds door, en dat is een besluit.** Van
     *    de vier gemeten gevallen sluit 0271 er drie. De vierde vraagt een
     *    contextregel ("weg tussen twee ASCII-letters") en niet een lijst van
     *    codepunten; acceptatiecriterium 2 zegt dat de must-allow zwaarder weegt
     *    dan de weigering, en het Perzisch heeft deze letter nodig.
     *
     *    Deze toets staat op `4` omdat dát is wat de code vandaag doet. Wordt de
     *    contextregel ooit gebouwd, dan hoort hij rood te worden — en dan is dat
     *    het signaal dat deze aantekening mee moet veranderen. Zelfde vorm als
     *    de assertie die QS8-495 zelf opleverde.
     */
    it('laat `Ja<ZWNJ>n` nog wél door — de bekende rest van QS8-495', async () => {
      const uit = await schrijfEnLees(mallory, `Ja${ZWNJ}n`);

      expect(telTekens(uit), 'vier codepunten: de ZWNJ blijft staan').toBe(4);
      expect(schoneNaam(`Ja${ZWJ}n`), 'en de ZWJ net zo').toBe(`Ja${ZWJ}n`);
    }, TEST_TIMEOUT);
  });
});
