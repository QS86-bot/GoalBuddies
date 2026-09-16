/**
 * De belofte: **de database en de client zijn het eens over wat een lege naam
 * is** — QS8-448, migratie 0256.
 *
 * ⚠️⚠️ **Dit is de naad en niet het onderdeel.** `schone_naam()` in SQL en
 *    `schoneNaam()` in TypeScript zijn dezelfde definitie in twee talen, en er
 *    is geen manier om er één van te maken. Elk van de twee is los triviaal te
 *    toetsen; wat kapot kan gaan is dat ze uit elkaar lopen — en dan krijg je
 *    precies het geval dat dit issue opleverde: een profiel dat de aanmeldtrigger
 *    aanmaakt en het eigen schema daarna afwijst.
 *
 * 📏 **Het gemeten geval.** Vóór 0256 deed de trigger `trim()` en het schema
 *    `.trim()`, en die twee zijn niet hetzelfde:
 *
 *      invoer          Postgres trim()        JS .trim()
 *      E'\n\n'         2 tekens, niet leeg    '' (leeg)
 *      E'\t\t'         2 tekens, niet leeg    ''
 *      U+00A0 (NBSP)   1 teken,  niet leeg    ''
 *      U+200B (ZWSP)   1 teken,  niet leeg    U+200B  ← allebei door
 *
 *    De eerste drie leverden een profiel op dat zijn eigen schema afwijst; het
 *    vierde kwam langs **beide** poorten en was daarmee het enige geval dat
 *    niets ving. `display_name` is groepszichtbaar, dus dat is een lid in het
 *    groepsoverzicht zonder leesbare naam.
 *
 * ⚠️⚠️ **De gevaarlijke reparatie staat hier als toets.** `U+200D` is de lijm in
 *    `👨‍👩‍👧‍👦` (`U+1F468 U+200D U+1F469 U+200D U+1F467 U+200D U+1F466`). Wie
 *    hem overal wegknipt in plaats van alleen aan de rand, houdt vier losse
 *    mensen over. Dat geval staat hieronder aan beide kanten.
 *
 * ⚠️⚠️ **Deze toets liep het hele codepuntbereik af omdat een steekproef het
 *    niet deed.** 📏 De eerste versie vergeleek zestien vaste invoeren, en die
 *    dekten 8 van de 29 codepunten die toen in de set stonden. Met U+205F uit de
 *    SQL-kant gehaald — een echte drift tussen de twee talen — bleef hij **groen
 *    op vier tests**, terwijl zowel de migratie als `src/shared/tekst/index.ts`
 *    met zoveel woorden beweerden dat hij dan rood zou worden.
 *
 *    Een bemonstering toetst de gevallen die je bedacht hebt; de belofte gaat
 *    over de hele verzameling. Daarom vraagt deze toets de verzameling **op** —
 *    aan allebei de kanten — in plaats van hem te bevragen met voorbeelden. Dat
 *    vangt ook een teken dat er in SQL bíj komt, en dat is de richting die een
 *    steekproef per definitie nooit ziet.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { isBidiStuurteken, schoneNaam, telTekens } from '../../src/shared/tekst';
import { PSQL_OMGEVING, psqlBasisArgumenten, stackBeschikbaarOfFaal } from './psql-stack';

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'schone_naam'",
  import.meta.url,
);

/**
 * De invoer die beide kanten krijgen.
 *
 * ⚠️ **Elk geval komt uit een meting en niet uit de fantasie.** De eerste vier
 *    zijn de rijen uit `docs/ENGINEER-REVIEW.md` 479/480; de rest zijn de vormen
 *    die een reparatie kapot zou maken — een naam met een spatie erin, een
 *    gezinsemoji, en een naam die aan beide kanten iets zichtbaars heeft.
 */
const GEVALLEN: readonly { readonly naam: string; readonly waarde: string }[] = [
  { naam: 'newline', waarde: '\n\n' },
  { naam: 'tab', waarde: '\t\t' },
  { naam: 'nbsp', waarde: ' ' },
  { naam: 'zwsp', waarde: '​' },
  { naam: 'spatie', waarde: '   ' },
  { naam: 'bom', waarde: '﻿' },
  { naam: 'word joiner', waarde: '⁠' },
  { naam: 'ideografische spatie', waarde: '　' },
  { naam: 'leeg', waarde: '' },
  { naam: 'gewone naam', waarde: 'Jan Jansen' },
  { naam: 'naam met dubbele spatie', waarde: 'Jan  Jansen' },
  { naam: 'naam met onzichtbare randen', waarde: '​ Jan ​' },
  { naam: 'gezinsemoji', waarde: '👨‍👩‍👧‍👦' },
  { naam: 'gezinsemoji met randen', waarde: ' 👨‍👩‍👧‍👦 ' },
  { naam: 'emoji en tekst', waarde: '😀 Jan' },
  { naam: 'alleen een streepje', waarde: '-' },
];

/**
 * Wat `schone_naam()` in de database van deze waarden maakt.
 *
 * ⚠️⚠️ **Via stdin en niet via `-c`, en dat staat al in `aanmelding.test.ts`
 *    opgeschreven.** 📏 Met `-c` laat psql `:'w0'` letterlijk staan en krijg je
 *    `syntax error at or near ":"` — variabelen worden alleen geïnterpoleerd in
 *    invoer die psql zélf inleest. Ik ben daar bij het schrijven van dit bestand
 *    ingelopen terwijl de meting drie mappen verderop stond; vandaar dat hij hier
 *    nóg een keer staat, bij de tweede plek die hem nodig heeft.
 *
 * ⚠️ Als parameters en niet geïnterpoleerd. Deze lijst draagt vandaag geen
 *    aanhalingsteken of backslash, maar de volgende die er een geval bij zet wel
 *    — en dan is een gebroken string een rode test die de verkeerde kant op
 *    wijst.
 *
 * ⚠️ `-d` en `-tA` staan al in `psqlBasisArgumenten()`; ze hier herhalen gaf een
 *    aanroep met dubbele vlaggen.
 */
function viaDeDatabase(waarden: readonly string[]): string[] {
  const argumenten = waarden.flatMap((w, i) => ['-v', `w${i}=${w}`]);
  const selects = waarden
    .map((_, i) => `select encode(convert_to(schone_naam(:'w${i}'), 'UTF8'), 'hex');`)
    .join('\n');

  const uit = execFileSync('psql', [...psqlBasisArgumenten(), ...argumenten], {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    input: selects,
  });

  // ⚠️ Niet `filter(Boolean)`: een lege uitkomst ís een geval, en wegfilteren
  //    zou de rijen laten verschuiven zodat elke vergelijking erna de verkeerde
  //    twee naast elkaar legt.
  return uit.split('\n').slice(0, waarden.length);
}

/**
 * Dezelfde waarde als hex, zodat de twee kanten vergelijkbaar zijn.
 *
 * ⚠️⚠️ **Hex en geen tekst, en dat is een reparatie.** 📏 `viaDeDatabase()` nam
 *    aan dat elke uitkomst één regel is. Gemeten met
 *    `['Jan Jansen','Jan\nJansen','Piet','Klaas']` vergeleek index 2 `'Piet'`
 *    met `'Jansen'` en schoof alles erna op. Een naam met een newline erin is
 *    precies wat dit bestand toetst, dus die aanname stond op de verkeerde plek.
 *    Hex garandeert één regel per geval — en een verschil in onzichtbare tekens
 *    wordt er meteen leesbaar van, in plaats van twee lege strings die gelijk
 *    lijken.
 */
function alsHex(waarde: string): string {
  return Buffer.from(waarde, 'utf8').toString('hex');
}

describe.runIf(beschikbaar)('SQL en TypeScript zijn het eens over een lege naam', () => {
  it('geeft voor elke invoer dezelfde uitkomst', () => {
    const waarden = GEVALLEN.map((g) => g.waarde);
    const uitDatabase = viaDeDatabase(waarden);

    for (const [i, geval] of GEVALLEN.entries()) {
      expect(
        uitDatabase[i],
        `${geval.naam}: de database en de client zijn het oneens — dat is precies ` +
          'de naad waar QS8-448 over gaat',
      ).toBe(alsHex(schoneNaam(geval.waarde)));
    }
  }, 30_000);

  /**
   * ⚠️ De must-allow. "Ze zijn het eens" is goedkoop te halen door allebei altijd
   *    een lege string te geven; dit geval eist dat er ook iets dóórkomt.
   */
  it('en laat een gewone naam staan', () => {
    expect(schoneNaam('Jan Jansen')).toBe('Jan Jansen');
    expect(viaDeDatabase(['Jan Jansen'])[0]).toBe(alsHex('Jan Jansen'));
  }, 30_000);
});

// ---------------------------------------------------------------------------

/**
 * De codepunten die de **database** als onzichtbare rand beschouwt.
 *
 * ⚠️ `chr()` weigert U+0000, en de surrogaten U+D800–U+DFFF zijn in Postgres
 *    geen geldige tekens. Allebei uitgesloten, want daar bestaat het geval niet —
 *    en een sweep die op een onmogelijke invoer omvalt, meet zichzelf.
 *
 * ⚠️ Eén regel per codepunt, als getal. Geen tekst, dus geen enkele kans dat een
 *    onzichtbaar teken de regelindeling van de uitvoer verstoort.
 */
function onzichtbaarVolgensDeDatabase(): Set<number> {
  const uit = execFileSync('psql', psqlBasisArgumenten(), {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    input:
      'select cp from generate_series(1, 1114111) cp ' +
      'where (cp < 55296 or cp > 57343) ' +
      "and public.schone_naam(chr(cp)) = '' order by cp;",
  });

  return new Set(
    uit
      .split('\n')
      .filter((regel) => regel.trim() !== '')
      .map((regel) => Number(regel.trim())),
  );
}

/**
 * Dezelfde vraag aan de TypeScript-kant.
 *
 * ⚠️⚠️ **Via `schoneNaam()` en niet via `isOnzichtbaar()`, en dat verschil is
 *    sinds QS8-495 wezenlijk.** De databasekant vraagt
 *    `schone_naam(chr(cp)) = ''`, en die functie doet sinds 0271 drie dingen:
 *    de bidi-tekens weg, de nul-pixeltekens weg, en dán de randen. `isOnzichtbaar`
 *    beantwoordt alleen dat derde stuk, dus de twee kanten stelden verschillende
 *    vragen en de sweep werd rood op 3748 codepunten die geen van beide kanten
 *    fout deed.
 *
 *    De belofte van deze sweep is *"beide talen doen hetzelfde met een los
 *    teken"*, en dan hoort aan allebei de kanten dezelfde functie te staan. Welke
 *    van de drie lijsten een codepunt draagt, is een vraag voor de sweep in het
 *    midden hieronder en voor `src/shared/tekst/index.test.ts`.
 */
function onzichtbaarVolgensDeClient(): Set<number> {
  const uit = new Set<number>();

  for (let cp = 1; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (schoneNaam(String.fromCodePoint(cp)) === '') uit.add(cp);
  }

  return uit;
}

describe.runIf(beschikbaar)('de twee talen kennen dezelfde verzameling', () => {
  /**
   * ⚠️⚠️ **Dit is de toets die de belofte draagt.** De test hierboven vergelijkt
   *    uitkomsten voor zestien invoeren; deze vergelijkt de verzámelingen. Het
   *    verschil is gemeten: met U+205F uit de SQL-kant bleef de eerste groen en
   *    wordt deze rood.
   *
   * ⚠️ **Beide richtingen apart benoemd.** Een teken dat alleen de database
   *    strijkt, is een naam die de client doorlaat en de database weigert — een
   *    formulier dat niets zegt. Een teken dat alleen de client strijkt, is een
   *    naam die de database accepteert en die groepszichtbaar onleesbaar is. Dat
   *    zijn twee verschillende fouten en ze horen niet in één melding.
   */
  it('strijkt aan beide kanten exact dezelfde codepunten', () => {
    const database = onzichtbaarVolgensDeDatabase();
    const client = onzichtbaarVolgensDeClient();

    const alleenDatabase = [...database].filter((cp) => !client.has(cp));
    const alleenClient = [...client].filter((cp) => !database.has(cp));

    expect(
      alleenDatabase.map(alsHexCodepunt),
      'de database strijkt deze tekens weg en de client niet — dan weigert de ' +
        'database een naam die het formulier net goedkeurde',
    ).toEqual([]);

    expect(
      alleenClient.map(alsHexCodepunt),
      'de client strijkt deze tekens weg en de database niet — dan staat er een ' +
        'groepszichtbare naam in de database die de client nooit zou insturen',
    ).toEqual([]);
  }, 60_000);

  /**
   * ⚠️ De must-allow van deze sweep. "Ze kennen dezelfde verzameling" is ook waar
   *    als allebei de verzameling leeg is, en dan strijkt niemand iets. Dit geval
   *    eist dat er daadwerkelijk iets in zit én dat het niet álles is.
   */
  it('en die verzameling is niet leeg en niet alles', () => {
    const database = onzichtbaarVolgensDeDatabase();

    expect(database.size).toBeGreaterThan(200);
    expect(database.has(0x200b), 'zero-width space hoort erin').toBe(true);
    expect(database.has(0x3164), 'hangul filler hoort erin').toBe(true);
    expect(database.has('J'.codePointAt(0) as number), 'een letter hoort er niet in').toBe(false);
    expect(database.has(0xfe0f), 'de variatieselector hoort er juist niet in').toBe(false);
  }, 60_000);
});

// ---------------------------------------------------------------------------

/**
 * De codepunten die de **database** ook in het **midden** van een naam weghaalt.
 *
 * ⚠️⚠️ **Dit is een tweede sweep en niet dezelfde nog een keer, en dat verschil
 *    is wat QS8-450 opleverde.** De sweep hierboven vraagt
 *    `schone_naam(chr(cp)) = ''` — dat is *"telt dit als onzichtbare rand"*. Elk
 *    bidi-stuurteken zat dáár al in, en toch kwam
 *    `display_name` = `gxp‮eterces` er ongehinderd door: `schone_naam()` strijkt
 *    met opzet alleen de randen.
 *
 *    📏 Die sweep bleef dus groen op een naam die als `secrete.pxg` rendert, in
 *    een kolom die groepszichtbaar is. Een verzameling die je aan de rand
 *    bevraagt, zegt niets over het midden — en de belofte van QS8-450 gaat over
 *    het midden.
 *
 * ⚠️ `'a' || chr(cp) || 'b'` en niet `chr(cp)` alleen: met zichtbare tekens
 *    eromheen is een rand per definitie geen rand meer, en dat is precies de
 *    invoer waar de bug op zat.
 */
function middenWegVolgensDeDatabase(): Set<number> {
  const uit = execFileSync('psql', psqlBasisArgumenten(), {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    input:
      'select cp from generate_series(1, 1114111) cp ' +
      'where (cp < 55296 or cp > 57343) ' +
      "and public.schone_naam('a' || chr(cp) || 'b') <> 'a' || chr(cp) || 'b' order by cp;",
  });

  return new Set(
    uit
      .split('\n')
      .filter((regel) => regel.trim() !== '')
      .map((regel) => Number(regel.trim())),
  );
}

/** Dezelfde vraag aan de TypeScript-kant. */
function middenWegVolgensDeClient(): Set<number> {
  const uit = new Set<number>();

  for (let cp = 1; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const teken = String.fromCodePoint(cp);
    if (schoneNaam(`a${teken}b`) !== `a${teken}b`) uit.add(cp);
  }

  return uit;
}

describe.runIf(beschikbaar)('de twee talen halen in het midden dezelfde tekens weg', () => {
  /**
   * ⚠️ **Beide richtingen apart benoemd**, om dezelfde reden als bij de
   *    randensweep. Een teken dat alleen de database weghaalt, is een naam die
   *    het formulier goedkeurt en de CHECK weigert. Een teken dat alleen de
   *    client weghaalt, is een naam die groepszichtbaar omgekeerd rendert.
   */
  it('haalt aan beide kanten exact dezelfde codepunten weg', () => {
    const database = middenWegVolgensDeDatabase();
    const client = middenWegVolgensDeClient();

    expect(
      [...database].filter((cp) => !client.has(cp)).map(alsHexCodepunt),
      'de database haalt deze tekens uit het midden en de client niet — dan ' +
        'weigert de CHECK een naam die het formulier net goedkeurde',
    ).toEqual([]);

    expect(
      [...client].filter((cp) => !database.has(cp)).map(alsHexCodepunt),
      'de client haalt deze tekens uit het midden en de database niet — dan ' +
        'staat er een groepszichtbare naam die omgekeerd rendert',
    ).toEqual([]);
  }, 60_000);

  /**
   * ⚠️⚠️ **De must-allow van deze sweep, en hij is scherper dan "niet leeg".**
   *    "Ze halen hetzelfde weg" is ook waar als allebei **alles** weghalen, en
   *    dan is er van een naam niets over. Deze toets pint daarom beide kanten:
   *    wat eruit gaat én wat er met reden in blijft.
   *
   * 📏 **Sinds QS8-495 (migratie 0271) is deze verzameling gegroeid van negen
   *    naar 3878**, en dat is de reparatie van een gat dat híer als bedoeld
   *    gedrag stond vastgespijkerd. De negen waren de bidi-stuurtekens
   *    (`zonder_bidi`, 0269); de rest komt uit `MIDDENIN_BEREIKEN`
   *    (`zonder_onzichtbaar_middenin`, 0271) — de tekens die overal als **nul
   *    pixels** renderen.
   *
   *    ⚠️ **Het getal ging onderweg van 225 naar 3878**, en dat is het verschil
   *       tussen een handgeschreven lijst en een afgeleide. 📏 De eerste dekte
   *       146 van de 4174 codepunten die Unicode `Default_Ignorable_Code_Point`
   *       noemt; de tweede dekt ze allemaal op acht benoemde uitzonderingen na.
   *       Gevonden in de security-review op dit issue.
   *
   * ⚠️⚠️ **De scheidslijn is "nul pixels" tegenover "witruimte", niet
   *    "onzichtbaar".** Een spatie is onzichtbaar en tóch betekenisvol: hij
   *    scheidt. Daarom staan de spaties er niet in, en `U+200D` (de lijm in
   *    `👨‍👩‍👧‍👦`) en `U+200C` (orthografisch verplicht in het Perzisch)
   *    evenmin.
   */
  it('en die verzameling is de negen bidi-tekens plus wat als nul pixels rendert', () => {
    const database = middenWegVolgensDeDatabase();

    expect(database.size, 'niet meer en niet minder').toBe(3878);

    // De negen van 0269 — die volgorde omkeren is een ander soort schade.
    expect(database.has(0x202e), 'de RIGHT-TO-LEFT OVERRIDE hoort erin').toBe(true);
    expect(database.has(0x2067), 'de RIGHT-TO-LEFT ISOLATE hoort erin').toBe(true);

    // 📏 Drie van de vier gevallen die de security-review op QS8-450 mat. Ze
    //    stonden hier tot QS8-495 op `false` — niet omdat het goed was, maar
    //    omdat dat was wat de code deed.
    expect(database.has(0x200b), 'de zero-width space hoort erin').toBe(true);
    expect(database.has(0xfeff), 'de byte order mark hoort erin').toBe(true);
    expect(database.has(0x00ad), 'de soft hyphen hoort erin').toBe(true);
    expect(database.has(0x3164), 'de hangul filler hoort erin').toBe(true);
    // ⚠️ De braille blank hoort er juist NIET in, en dat is een correctie uit de
    //    security-review. Een lege braillecel heeft **breedte** — hij is
    //    witruimte en geen nul pixels, en hij is dan ook geen
    //    `Default_Ignorable`. De handgeschreven lijst had hem er wél in staan,
    //    met een reden die de eigen scheidslijn tegensprak.
    expect(database.has(0x2800), 'de braille blank heeft breedte').toBe(false);
    expect(database.has(0x2065), 'een niet-toegewezen Default_Ignorable hoort erin').toBe(true);
    expect(database.has(0xe0100), 'de IVS blijft juist staan — Japanse namen').toBe(false);
    expect(database.has(0xe0067), 'en een tag ook — de subdivisievlaggen').toBe(false);
    expect(database.has(0xe0001), 'de language tag hoort erin').toBe(true);

    // ⚠️⚠️ **De must-allow, en die weegt hier zwaarder dan de weigering** —
    //    acceptatiecriterium 2 van QS8-495. Elk van deze vier breekt een echte
    //    naam als hij er wél in zou staan.
    expect(database.has(0x0020), 'een spatie in het midden blijft staan').toBe(false);
    expect(database.has(0x00a0), 'een no-break space blijft staan').toBe(false);
    expect(database.has(0x200d), 'de zero-width joiner blijft staan — de emoji-lijm').toBe(false);
    expect(database.has(0x200c), 'de zero-width non-joiner blijft staan — het Perzisch').toBe(
      false,
    );
    expect(database.has(0x200f), 'de RLM is een markering en geen override').toBe(false);
    expect(database.has(0x034f), 'de combining grapheme joiner blijft staan').toBe(false);
    // ⚠️ **De Khmer inherent vowels gáán er wél uit, en dat is een correctie.**
    //    De handgeschreven lijst hield ze buiten met "schriftgebonden". Unicode
    //    markeert `U+17B4`–`U+17B5` als **afgeschaft** én `Default_Ignorable`;
    //    de bewering dat een schrift ze nodig heeft, hield geen stand.
    expect(database.has(0x17b4), 'de afgeschafte Khmer inherent vowel gaat eruit').toBe(true);
    expect(database.has(0x180b), 'de Mongoolse variatieselector blijft — schriftgebonden').toBe(
      false,
    );
  }, 60_000);

  /**
   * ⚠️⚠️ **Het gat dat QS8-495 níet sluit, en het staat hier als toets zodat het
   *    een besluit blijft en geen vergeetpost.**
   *
   *    `U+200C` en `U+200D` renderen ook als nul pixels, dus `Ja<ZWNJ>n` is nog
   *    steeds niet van `Jan` te onderscheiden. Ze weghalen breekt het Perzisch
   *    en de gezinsemoji; ze houden vraagt een **contextregel** ("weg tussen
   *    twee ASCII-letters") in plaats van een lijst van codepunten, en die past
   *    niet in de vorm die deze sweep vergelijkt — hij legt beide kanten
   *    codepunt voor codepunt naast elkaar, los van hun buren.
   *
   *    Zie `docs/decisions/2026-09-14-onzichtbaar-in-het-midden.md` §4.
   */
  it('laat ZWNJ en ZWJ met reden staan, en dat is een open collisievector', () => {
    const database = middenWegVolgensDeDatabase();

    expect(database.has(0x200c), 'ZWNJ blijft — het Perzisch heeft hem nodig').toBe(false);
    expect(database.has(0x200d), 'ZWJ blijft — de gezinsemoji heeft hem nodig').toBe(false);
  }, 60_000);

  /**
   * 📏 Het geval dat de security-review mat, woordelijk, aan beide kanten.
   */
  it('maakt van de gemeten spoofnaam weer een gewone naam', () => {
    const spoof = 'gxp\u202Eeterces';

    expect(schoneNaam(spoof)).toBe('gxpeterces');
    expect(viaDeDatabase([spoof])[0]).toBe(alsHex('gxpeterces'));
  }, 30_000);

  /**
   * ⚠️⚠️ **Twee stuurtekens en niet één, en dat geval is met een ijking
   *    afgedwongen.** 📏 Bij het ijken van deze suite bleek de `g`-vlag uit
   *    `zonder_bidi()` halen **alle tien de toetsen groen** te laten: elk geval
   *    hierboven draagt precies één bidi-teken, en zonder `g` wordt de eerste
   *    treffer nog steeds weggehaald. De migratiekop noemt die vlag *"het hele
   *    punt van deze functie"* — en niets toetste hem.
   *
   *    Dat is dezelfde klasse als de bug die dit issue repareert: een bron die
   *    beweert dat er een grendel op staat, terwijl de toets er met één
   *    voorbeeld naast grijpt.
   */
  it('haalt ook een tweede en derde stuurteken weg', () => {
    const dubbel = `a${String.fromCodePoint(0x202e)}b${String.fromCodePoint(0x202e)}c`;

    expect(schoneNaam(dubbel)).toBe('abc');
    expect(viaDeDatabase([dubbel])[0]).toBe(alsHex('abc'));
  }, 30_000);

  /** De lijst in TypeScript is dezelfde als wat `schoneNaam()` doet. */
  it('en `isBidiStuurteken` kent precies diezelfde negen', () => {
    const uit: number[] = [];
    for (let cp = 1; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (isBidiStuurteken(cp)) uit.push(cp);
    }

    expect(uit.map(alsHexCodepunt)).toEqual([
      'U+202A', 'U+202B', 'U+202C', 'U+202D', 'U+202E',
      'U+2066', 'U+2067', 'U+2068', 'U+2069',
    ]);
  });
});

// ---------------------------------------------------------------------------

/**
 * De contexten waarin de sweep elk codepunt aanbiedt — QS8-499.
 *
 * ⚠️⚠️ **Dit is de grendel die met dit issue mee móest veranderen, en dat stond
 *    vooraf opgeschreven.** De sweeps hierboven bieden elk codepunt in precies
 *    één omgeving aan: `'a' || chr(cp) || 'b'`. Zolang elke regel per codepunt
 *    te beantwoorden was, volstond dat. QS8-499 voegt een **contextregel** toe —
 *    `U+200C` gaat weg tussen twee ASCII-letters en blijft tussen twee Perzische
 *    letters — en die is per definitie niet met één omgeving te meten.
 *
 *    Een sweep in één context zou dus groen blijven terwijl de twee talen het
 *    over de Perzische kant oneens zijn. Dát is waarom hier vier omgevingen
 *    staan en niet één.
 *
 * ⚠️ Elke omgeving heeft een eigen reden, en ze zijn met opzet niet inwisselbaar:
 *    de eerste is waar de regel moet vúren, de andere drie zijn waar hij met
 *    rust moet laten — en elk van die drie dekt een ander van de vier
 *    must-allows uit het issue.
 */
const CONTEXTEN: readonly { readonly naam: string; readonly voor: string; readonly na: string }[] = [
  { naam: 'tussen ASCII-letters', voor: 'a', na: 'b' },
  { naam: 'tussen Arabische letters', voor: '\u0645', na: '\u062E' },
  { naam: 'tussen emoji', voor: '\u{1F468}', na: '\u{1F469}' },
  { naam: 'na de vlagbasis', voor: '\u{1F3F4}', na: '' },
];

/** `'a' || chr(cp) || 'b'` als SQL-uitdrukking, met de context erin gebakken. */
function sqlUitdrukking(voor: string, na: string): string {
  const deel = (tekst: string): string =>
    tekst === ''
      ? "''"
      : [...tekst].map((t) => `chr(${t.codePointAt(0) as number})`).join(' || ');

  return `${deel(voor)} || chr(cp) || ${deel(na)}`;
}

/**
 * Per context: de codepunten die de **database** in die omgeving aanraakt.
 *
 * ⚠️ Eén psql-aanroep voor alle vier, met de context als kolom erbij. Vier losse
 *    aanroepen zouden vier keer de opstartkosten betalen én vier plekken geven
 *    waar de vraag net iets anders gesteld kan raken.
 */
function contextVolgensDeDatabase(): Map<string, Set<number>> {
  const takken = CONTEXTEN.map(({ naam, voor, na }) => {
    const uitdr = sqlUitdrukking(voor, na);
    return (
      `select '${naam}' as ctx, cp from generate_series(1, 1114111) cp ` +
      'where (cp < 55296 or cp > 57343) ' +
      `and public.schone_naam(${uitdr}) <> ${uitdr}`
    );
  });

  const uit = execFileSync('psql', psqlBasisArgumenten(), {
    env: PSQL_OMGEVING,
    encoding: 'utf8',
    input: `${takken.join(' union all ')} order by ctx, cp;`,
    maxBuffer: 256 * 1024 * 1024,
  });

  const perContext = new Map<string, Set<number>>();
  for (const { naam } of CONTEXTEN) perContext.set(naam, new Set());

  for (const regel of uit.split('\n')) {
    if (regel.trim() === '') continue;
    const [ctx = '', cp = ''] = regel.split('|');
    perContext.get(ctx)?.add(Number(cp));
  }

  return perContext;
}

/** Dezelfde vraag aan de TypeScript-kant. */
function contextVolgensDeClient(): Map<string, Set<number>> {
  const perContext = new Map<string, Set<number>>();

  for (const { naam, voor, na } of CONTEXTEN) {
    const gevonden = new Set<number>();

    for (let cp = 1; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const invoer = `${voor}${String.fromCodePoint(cp)}${na}`;
      if (schoneNaam(invoer) !== invoer) gevonden.add(cp);
    }

    perContext.set(naam, gevonden);
  }

  return perContext;
}

describe.runIf(beschikbaar)('de twee talen oordelen in élke context hetzelfde', () => {
  /**
   * ⚠️ **Beide richtingen apart benoemd**, om dezelfde reden als bij de twee
   *    sweeps hierboven — maar nu per context, zodat de melding zegt wáár ze uit
   *    elkaar lopen. "Ze zijn het oneens over U+200C" is een raadsel; "ze zijn
   *    het oneens over U+200C tussen Arabische letters" is een bevinding.
   */
  it('raakt in elke context aan beide kanten dezelfde codepunten', () => {
    const database = contextVolgensDeDatabase();
    const client = contextVolgensDeClient();

    for (const { naam } of CONTEXTEN) {
      const db = database.get(naam) ?? new Set<number>();
      const cl = client.get(naam) ?? new Set<number>();

      expect(
        [...db].filter((cp) => !cl.has(cp)).map(alsHexCodepunt),
        `${naam}: de database raakt deze tekens aan en de client niet — dan ` +
          'weigert de CHECK een naam die het formulier net goedkeurde',
      ).toEqual([]);

      expect(
        [...cl].filter((cp) => !db.has(cp)).map(alsHexCodepunt),
        `${naam}: de client raakt deze tekens aan en de database niet — dan ` +
          'staat er een groepszichtbare naam die niet is wat hij lijkt',
      ).toEqual([]);
    }
  }, 300_000);

  /**
   * ⚠️⚠️ **De must-allow van deze sweep, en hij is scherper dan "ze zijn het
   *    eens".** Twee identieke implementaties zijn het ook eens als ze allebei
   *    niets doen, of allebei álles weghalen. Dit geval eist dat de contexten
   *    daadwerkelijk **verschillen** — dat is de hele belofte van QS8-499.
   *
   *    📏 `U+200C` hoort weg tussen twee ASCII-letters en te blijven tussen twee
   *    Arabische; `U+200D` hoort te blijven tussen twee emoji; een tag hoort te
   *    blijven ná de vlagbasis. Zou de regel contextloos zijn, dan staat `U+200C`
   *    in alle drie of in geen.
   */
  it('en die verzamelingen zijn per context verschillend', () => {
    const db = contextVolgensDeDatabase();

    const ascii = db.get('tussen ASCII-letters') ?? new Set<number>();
    const arabisch = db.get('tussen Arabische letters') ?? new Set<number>();
    const emoji = db.get('tussen emoji') ?? new Set<number>();
    const vlag = db.get('na de vlagbasis') ?? new Set<number>();

    expect(ascii.has(0x200c), 'ZWNJ hoort weg tussen twee ASCII-letters').toBe(true);
    expect(arabisch.has(0x200c), 'ZWNJ is orthografisch verplicht in het Perzisch').toBe(false);
    expect(emoji.has(0x200d), 'de ZWJ is de lijm in een gezinsemoji').toBe(false);
    expect(ascii.has(0x200d), 'dezelfde ZWJ hoort wél weg tussen twee ASCII-letters').toBe(true);
    expect(vlag.has(0xe0067), 'een tag hoort te blijven ná de vlagbasis').toBe(false);
    expect(ascii.has(0x034f), 'de CGJ hoort weg tussen twee ASCII-letters').toBe(true);

    // ⚠️ En de andere kant van dezelfde must-allow: een gewone letter blijft
    //    overal staan. Zonder dit geval is "de contexten verschillen" ook waar
    //    als er ergens per ongeluk letters sneuvelen.
    for (const [naam, verzameling] of [
      ['ascii', ascii],
      ['arabisch', arabisch],
      ['emoji', emoji],
      ['vlag', vlag],
    ] as const) {
      expect(verzameling.has(0x4a), `${naam}: de letter J hoort nergens weg`).toBe(false);
    }
  }, 300_000);
});

/** `U+200B` leest als een bevinding; `8203` leest als een regelnummer. */
function alsHexCodepunt(cp: number): string {
  return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------

describe('de zero-width joiner blijft in het midden staan', () => {
  /**
   * ⚠️⚠️ **Dit is de reparatie die het erger had gemaakt.** Een
   *    `regexp_replace(..., 'g')` of een `.replace(/…/g, '')` haalt U+200D
   *    overal weg, en dan valt het gezin uit elkaar. `btrim()` en de
   *    randlus kunnen dat per constructie niet.
   */
  it('een gezinsemoji houdt zijn zeven codepunten', () => {
    const gezin = '👨‍👩‍👧‍👦';

    expect(telTekens(gezin), 'de invoer zelf klopt niet meer').toBe(7);
    expect(telTekens(schoneNaam(gezin))).toBe(7);
    expect(schoneNaam(` ${gezin} `)).toBe(gezin);
  });

  it('en een naam met een spatie erin houdt die spatie', () => {
    expect(schoneNaam('  Jan  Jansen  ')).toBe('Jan  Jansen');
  });
});
