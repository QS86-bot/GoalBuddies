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
      'weigert ook de tekens die een handgeschreven lijst niet had bedacht',
      async () => {
        /**
         * ⚠️⚠️ **Deze toets bestaat omdat de eerste versie er 146 van 4174
         *    dekte.** 📏 Gemeten in de security-review op dit issue: negen van
         *    de tien hieronder landden als een naam die als `Jan` rendert,
         *    terwijl de commit beweerde dat er nog twee open stonden.
         *
         *    Ze staan hier stuk voor stuk en niet als "de lijst klopt", want dat
         *    laatste toetst `src/shared/tekst/index.test.ts` al tegen de
         *    property. Wat híer bewezen wordt is dat ze ook echt niet meer door
         *    de deur van de app komen.
         */
        const gevallen: readonly [string, string][] = [
          ['U+2065 reserved', '\u2065'],
          ['U+FFF0 reserved', '\ufff0'],
          ['U+1D173 muziek', '\u{1d173}'],
          ['U+2060 word joiner', '\u2060'],
        ];

        for (const [naam, teken] of gevallen) {
          await magNietLandenAlsNaam(mallory, `Ja${teken}n`);
          expect(schoneNaam(`Ja${teken}n`), `${naam}, TypeScript`).toBe('Jan');
        }
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
      'laat een Perzische, Hindi- en Bengaalse naam met U+200C of U+200D werken',
      async () => {
        // ⚠️ `می‌خواهم` — de ZWNJ hoort daar orthografisch, hij is geen sier.
        //    QS8-451 gaat over dezelfde letter aan de ránd.
        const perzisch = `می${ZWNJ}خواهم`;

        expect(schoneNaam(perzisch), 'TypeScript').toBe(perzisch);
        expect(await schrijfEnLees(mallory, perzisch), 'de database').toBe(perzisch);

        // ⚠️⚠️ **Acceptatiecriterium 3 van QS8-499 noemt Hindi en Bengaals met
        //    zoveel woorden, en die stonden hier niet.** Het Perzisch alleen is
        //    één schrift; de regel van 0279 is *"tussen twee ASCII-
        //    alfanumerieken"* en die belofte gaat over álle andere schriften.
        //    Eén geval per schrift dat het issue noemt, want een must-allow die
        //    je niet aanbiedt, bewaak je niet.
        //
        //    `क्‍ष` — Devanagari, waar de ZWJ de conjunct-vorm afdwingt.
        const hindi = '\u0915\u094D\u200D\u0937';
        expect(schoneNaam(hindi), 'TypeScript, Hindi').toBe(hindi);
        expect(await schrijfEnLees(mallory, hindi), 'de database, Hindi').toBe(hindi);

        //    `ক্‌ষ` — Bengaals, waar de ZWNJ de conjunct juist verhindert.
        const bengaals = '\u0995\u09CD\u200C\u09B7';
        expect(schoneNaam(bengaals), 'TypeScript, Bengaals').toBe(bengaals);
        expect(await schrijfEnLees(mallory, bengaals), 'de database, Bengaals').toBe(bengaals);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een subdivisievlag heel — 🏴 houdt zijn zeven codepunten',
      async () => {
        /**
         * ⚠️⚠️ **De eerste versie brak deze vlag, en dat is dezelfde schade als
         *    een gezinsemoji die uit elkaar valt.** 🏴 is `U+1F3F4` plus zes
         *    tagtekens uit `U+E0020`–`U+E007F`; 📏 met die tags in de lijst werd
         *    zeven codepunten er één — een zwarte vlag zonder land.
         *
         * ⚠️⚠️ **Midden ín de naam én áán het eind, en die tweede is sinds
         *    QS8-499 pas waar.** `schone_naam()` streek tags aan de **randen**
         *    weg via `ONZICHTBARE_BEREIKEN` — ouder dan 0271, 📏 de versie van
         *    0269 deed het net zo hard — dus een naam die op 🏴 eindigde
         *    verloor zijn staart: zeven codepunten in, één uit. Migratie 0279
         *    versmalt die randenlijst en geeft de tags een eigen regel: een tag
         *    blijft als hij bij een `U+1F3F4` hoort en verdwijnt overal anders.
         */
        const vlag = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
        expect(telTekens(vlag), 'de invoer zelf klopt niet meer').toBe(7);

        expect(telTekens(schoneNaam(`Jan ${vlag} Vries`)), 'TypeScript').toBe(17);
        expect(telTekens(await schrijfEnLees(mallory, `Jan ${vlag} Vries`)), 'de database').toBe(17);

        // 📏 Dezelfde vlag áán het eind. ⚠️⚠️ **Wat deze twee regels bewijzen
        //    is smaller dan het lijkt, en dat is met IJKING H2 gemeten.** Er is
        //    geen CHECK die **gelijkheid** met `schone_naam()` eist; de enige
        //    die hem aanroept is `profiles_display_name_zichtbaar`
        //    (`schone_naam(display_name) <> ''`), en die vraagt alleen of er
        //    iets overblijft. De randstap zelf woont in de aanmeldtrigger en
        //    in de client. Een rechtstreekse
        //    `PATCH` wordt dus niet genormaliseerd, en de databaseregel hier
        //    zegt daarom *"geen CHECK weigert een naam die op een vlag eindigt"*
        //    en niet *"de randstap laat hem heel"*. Dat tweede staat in
        //    `tests/rls/naamnormalisatie.test.ts`, waar `schone_naam()`
        //    rechtstreeks wordt aangeroepen; de randenlijst verbreden maakt
        //    dáár twee toetsen rood en híer geen enkele.
        expect(telTekens(schoneNaam(`Jan Vries ${vlag}`)), 'TypeScript, aan het eind').toBe(17);
        expect(
          telTekens(await schrijfEnLees(mallory, `Jan Vries ${vlag}`)),
          'de database, aan het eind',
        ).toBe(17);

        // ⚠️ En de andere kant van diezelfde regel: een **losse** tag is nog
        //    steeds nul pixels en gaat weg, ook aan het eind. Zonder dit geval
        //    zou "de vlag blijft heel" ook waar zijn als er niets meer weggaat.
        expect(telTekens(schoneNaam('Jan\u{e0067}')), 'een losse tag gaat weg').toBe(3);
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

  describe('en de contextregel van 0279 sluit de rest', () => {
    /**
     * ⚠️⚠️ **Deze vier stonden tot QS8-499 in het blok hieronder, als het gat
     *    dat 0271 bewust openliet — en die omslag was vooraf aangekondigd.** Wat
     *    daar stond was: *"Deze toets staat op 4 omdat dát is wat de code vandaag
     *    doet. Wordt de contextregel ooit gebouwd, dan hoort hij rood te worden —
     *    en dan is dat het signaal dat deze aantekening mee moet veranderen."*
     *    Migratie 0279 bouwde hem, de toets werd rood, en dit is die aantekening.
     *
     *    Dat is de vorm die dit project van een weggelegde bevinding vraagt: geen
     *    TODO die verjaart, maar een assertie die omvalt op de dag dat de aanname
     *    eronder vervalt.
     *
     * ⚠️⚠️ **En ze verhuizen naar `magNietLandenAlsNaam()` en niet naar
     *    `schrijfEnLees()`, want de app heeft hier drie gedragingen op één
     *    waarde en geen twee** — 0269 schrijft ze uit: de aanmeldtrigger
     *    *strijkt*, de client *strijkt stilletjes*, en de rechtstreekse
     *    `PATCH /rest/v1/profiles` *weigert*. Deze toets is die derde route, en
     *    dus hoort hier een 23514 en geen schoongeveegde naam. 📏 Ik schreef hem
     *    eerst met `schrijfEnLees()` en verwachtte `Jan`; de CHECK weigerde, en
     *    dat wás het ontwerp.
     */
    it(
      'weigert `Ja<ZWNJ>n` en zijn drie familieleden — de rest van QS8-495',
      async () => {
        await magNietLandenAlsNaam(mallory, `Ja${ZWNJ}n`);
        await magNietLandenAlsNaam(mallory, `Ja${ZWJ}n`);
        // ⚠️ De combining grapheme joiner, die de security-review erbij vond.
        await magNietLandenAlsNaam(mallory, 'Ja\u034Fn');
        // ⚠️ `U+180E` hoorde bij dezelfde uitzonderingslijst: schriftgebonden
        //    voor het Mongools, en tussen twee ASCII-letters dus nul pixels en
        //    verder niets.
        await magNietLandenAlsNaam(mallory, 'Ja\u180En');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Dit is het geval dat de security-review vond, en het is het gewone
     *    geval.** De eerste versie van de regel eiste aan **beide** kanten een
     *    ASCII-alfanumeriek. Een spatie is ASCII maar niet alfanumeriek, dus hij
     *    blokkeerde de regel — en `Jan Jansen` is de vorm van vrijwel elke echte
     *    naam.
     *
     *    📏 Gemeten vóór de reparatie: van de **267** codepunten die de regel
     *    tussen twee letters weghaalt, haalde hij er naast een spatie **nul**
     *    weg. `Jan<ZWNJ> Jansen` landde ongehinderd naast `Jan Jansen`, met alle
     *    vier de CHECKs op `t`. Twee pixel-identieke namen in één goedkeurlijst,
     *    precies waar domeinregel 3 voor bestaat.
     *
     * ⚠️ De apostrof staat erbij omdat een leesteken dezelfde klasse is als een
     *    spatie: ASCII, niet alfanumeriek. Zonder dat geval bewaakt deze toets
     *    alleen de spatie en niet de regel.
     */
    it(
      'weigert een onzichtbaar teken naast een spatie of een leesteken',
      async () => {
        await magNietLandenAlsNaam(mallory, `Jan${ZWNJ} Jansen`);
        await magNietLandenAlsNaam(mallory, `O${ZWNJ}'Brien`);
        await magNietLandenAlsNaam(mallory, `Jan Jansen${ZWJ}`);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Een tagreeks die geen vlag ís, en dat was een kanaal en geen
     *    randgeval.** De eerste versie liet élke tag staan zodra er ergens een
     *    `U+1F3F4` vóór stond. 📏 `U+E0020`–`U+E007E` is een 1-op-1 afbeelding
     *    van ASCII `0x20`–`0x7E`, dus achter één zichtbare 🏴 pasten ~75 tekens
     *    willekeurige onzichtbare tekst binnen de grens van 80 codepunten — in
     *    een kolom die groepszichtbaar is en die als platte tekst in
     *    systeemberichten wordt ingebakken.
     *
     *    En `🏴` plus één sluittag rendert als de kále 🏴, dus het was óók een
     *    collisievector: `Jan 🏴` naast `Jan 🏴󠁿`.
     *
     * ⚠️ De must-allow ernaast staat hierboven: de Schotse vlag houdt zijn zeven
     *    codepunten, ook aan het eind van de naam.
     */
    it(
      'weigert een tagreeks achter een vlagbasis die geen geldige vlag vormt',
      async () => {
        // 🏴 plus één losse tag: rendert als de kale vlag.
        await magNietLandenAlsNaam(mallory, `Jan \u{1f3f4}\u{e0067}`);
        // 🏴 plus vlagletters zonder sluiter.
        await magNietLandenAlsNaam(mallory, `Jan \u{1f3f4}\u{e0067}\u{e0062}\u{e0073}`);
        // en het smokkelgeval: tagtekens die ASCII-tekst dragen.
        await magNietLandenAlsNaam(
          mallory,
          `Jan\u{1f3f4}\u{e0069}\u{e0067}\u{e006e}\u{e006f}\u{e0072}`,
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * 📏 De andere helft van 0279: een **losse** tag is nergens iets, ook niet
     *    aan de rand van een naam. De vlag die er wél bij hoort staat hierboven
     *    als must-allow; zonder dit geval zou "de vlag blijft heel" ook waar
     *    zijn als er van de tagregel niets meer over is.
     */
    it(
      'weigert een losse tag zonder vlag ervoor',
      async () => {
        await magNietLandenAlsNaam(mallory, 'Jan\u{e0067}Vries');
      },
      TEST_TIMEOUT,
    );
  });

  describe('wat er open blijft, staat hier als toets en niet als vergeetpost', () => {
    /**
     * ⚠️⚠️ **Wat er wél open blijft, en het staat hier met dezelfde scherpte als
     *    het geval hierboven stond.** De grens van 0279 is *"tussen twee
     *    **ASCII**-alfanumerieken"* en niet *"tussen twee letters uit een schrift
     *    dat dit teken niet gebruikt"* — die tweede vraagt Unicode-scriptdata die
     *    Postgres niet heeft. Dat is een bewuste versmalling en geen omissie.
     *
     *    📏 `Ján<ZWNJ>ös` blijft daarom **6** codepunten en rendert als `Jánös`.
     *    De prijs staat als rij in `docs/ENGINEER-REVIEW.md`; valt deze toets om,
     *    dan is de regel verbreed en hoort die rij mee te verdwijnen.
     */
    it('laat `Ján<ZWNJ>ös` nog wél door — de prijs van een ASCII-grens', async () => {
      const ontsnapt = `J\u00E1n${ZWNJ}\u00F6s`;

      expect(telTekens(await schrijfEnLees(mallory, ontsnapt)), 'de database').toBe(6);
      expect(telTekens(schoneNaam(ontsnapt)), 'TypeScript').toBe(6);
    }, TEST_TIMEOUT);
  });
});
