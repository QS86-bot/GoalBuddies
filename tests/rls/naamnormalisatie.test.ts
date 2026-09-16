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

import { beforeAll, describe, expect, it } from 'vitest';

import { isBidiStuurteken, schoneNaam, telTekens } from '../../src/shared/tekst';
import {
  PSQL_OMGEVING,
  psqlBasisArgumenten,
  psqlParallel,
  stackBeschikbaarOfFaal,
} from './psql-stack';

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

// ---------------------------------------------------------------------------
// De vegen: één meting voor het hele bestand
// ---------------------------------------------------------------------------

/**
 * De omgevingen waarin de vegen hieronder elk codepunt aanbieden — QS8-499.
 *
 * ⚠️⚠️ **Dit is de grendel die met dit issue mee móest veranderen, en dat stond
 *    vooraf opgeschreven.** Tot QS8-499 bood elke veeg een codepunt in precies
 *    één omgeving aan: `'a' || chr(cp) || 'b'`. Zolang elke regel per codepunt
 *    te beantwoorden was, volstond dat. QS8-499 voegt een **contextregel** toe —
 *    `U+200C` gaat weg tussen twee ASCII-letters en blijft tussen twee Perzische
 *    letters — en die is per definitie niet met één omgeving te meten.
 *
 *    Een veeg in één context zou dus groen blijven terwijl de twee talen het
 *    over de Perzische kant oneens zijn. Dát is waarom hier vier omgevingen
 *    staan en niet één.
 *
 * ⚠️ Elke omgeving heeft een eigen reden, en ze zijn met opzet niet inwisselbaar:
 *    de eerste drie zijn waar de regel moet vúren, de laatste drie zijn waar hij
 *    met rust moet laten — en elk van die drie dekt een ander van de vier
 *    must-allows uit het issue.
 *
 * ⚠️⚠️ **De twee middelste kwamen er pas na de security-review, en hun
 *    afwezigheid wás de blinde vlek.** De vier die er stonden waren gekozen als
 *    *"één waar de regel moet vuren plus drie must-allows"*. Wat ontbrak is de
 *    omgeving waar hij zou moeten vuren **en het niet deed**: naast een spatie
 *    of een leesteken.
 *
 *    📏 Gemeten vóór de reparatie: van de **267** codepunten die de regel tussen
 *    twee letters weghaalt, haalde hij er naast een spatie **nul** weg —
 *    `Jan<ZWNJ> Jansen` landde ongehinderd naast `Jan Jansen`, en dat is de vorm
 *    van vrijwel elke echte naam. Alle veertien toetsen in dit bestand bleven er
 *    groen onder. Dat is regel 18 vraag 3 in zijn zuiverste vorm.
 */
const CONTEXTEN: readonly { readonly naam: string; readonly voor: string; readonly na: string }[] = [
  { naam: 'tussen ASCII-letters', voor: 'a', na: 'b' },
  { naam: 'tussen een letter en een spatie', voor: 'Jan', na: ' Jansen' },
  { naam: 'tussen een letter en een leesteken', voor: 'O', na: "'Brien" },
  { naam: 'tussen Arabische letters', voor: 'م', na: 'خ' },
  { naam: 'tussen emoji', voor: '\u{1F468}', na: '\u{1F469}' },
  { naam: 'na de vlagbasis', voor: '\u{1F3F4}', na: '' },
];

/** De naam van de omgeving waarin de oudere vegen hun vraag stelden. */
const ASCII = 'tussen ASCII-letters';

/** Wat één kant — database of client — van het hele codepuntbereik vindt. */
type Vegen = {
  /** Losse codepunten die als onzichtbare **rand** wegvallen. */
  readonly rand: Set<number>;
  /** Per omgeving: de codepunten die `schone_naam()` dáár aanraakt. */
  readonly context: Map<string, Set<number>>;
};

/**
 * `'a' || chr(cp) || 'b'` als SQL-uitdrukking, met de omgeving erin gebakken.
 *
 * ⚠️ `chr()` van de buren en geen letterlijke string: de emoji-context draagt
 *    tekens buiten het BMP, en die als tekst door psql's argumentenlijst sturen
 *    maakt de uitslag afhankelijk van de codering van drie tussenschakels.
 */
function sqlUitdrukking(voor: string, na: string): string {
  const deel = (tekst: string): string =>
    tekst === ''
      ? "''"
      : [...tekst].map((t) => `chr(${t.codePointAt(0) as number})`).join(' || ');

  return `${deel(voor)} || chr(cp) || ${deel(na)}`;
}

/** Het bereik dat elke veeg aflegt, aan allebei de kanten identiek afgebakend. */
const BEREIK =
  'from generate_series(1, 1114111) cp where (cp < 55296 or cp > 57343) ';

/**
 * De randvraag, en die is met opzet **niet** in `contextVraag()` opgegaan.
 *
 * ⚠️⚠️ **`= ''` en niet `<> chr(cp)`, hoewel die twee vandaag hetzelfde
 *    antwoorden.** Voor één teken kan `schone_naam()` alleen wissen of laten
 *    staan, dus de uitkomst is gelijk — maar de twee *vragen* zijn het niet.
 *    Deze vraagt *"telt dit als onzichtbare rand"*; die ander vraagt *"raakt de
 *    functie dit aan"*. De dag dat een stap iets vervángt in plaats van wist,
 *    lopen ze uiteen, en dan hoort deze veeg te meten wat zijn naam belooft.
 *    Ze samenvoegen omdat het antwoord nu toevallig gelijk is, is precies de
 *    vorm waar onwrikbare regel 18 vraag 2 voor staat.
 */
const RANDVRAAG = `select cp ${BEREIK}and public.schone_naam(chr(cp)) = '' order by cp;`;

/** De vraag voor één omgeving: raakt `schone_naam()` dit codepunt hier aan? */
function contextVraag(voor: string, na: string): string {
  const uitdr = sqlUitdrukking(voor, na);
  return `select cp ${BEREIK}and public.schone_naam(${uitdr}) <> ${uitdr} order by cp;`;
}

/** Eén regel per codepunt, als getal. */
function alsCodepunten(uit: string): Set<number> {
  return new Set(
    uit
      .split('\n')
      .filter((regel) => regel.trim() !== '')
      .map((regel) => Number(regel.trim())),
  );
}

/**
 * De vijf vegen aan de databasekant, **tegelijk** en precies één keer.
 *
 * ⚠️⚠️ **Dit is de reden dat `psqlParallel()` bestaat, en het is geen
 *    optimalisatie maar een voorwaarde.** 📏 Gemeten op de lokale stack: één
 *    veeg over het hele codepuntbereik kost **74 s**. De oude vorm riep zijn
 *    vegen aan ín de toetsen, dus elke toets die er een nodig had betaalde hem
 *    opnieuw — met de contexten van dit issue erbij liep het bestand zijn
 *    timeout in. 📏 Vier tegelijk, één keer: **74 s**, want het is
 *    processorwerk in aparte backends en deze bak heeft vier kernen.
 *
 * ⚠️ **Maar niet méér tegelijk dan er kernen zijn.** `psqlParallel()` begrenst
 *    dat zelf, en dat is met een rode CI afgedwongen: een GitHub-runner heeft er
 *    twee, en zeven gelijktijdige vegen verdringen elkaar daar tot elke
 *    afzonderlijke veeg zijn timeout inloopt. Zie de kop van die functie.
 *
 * ⚠️ **Een grendel die te traag is, is een grendel die iemand uitzet.** Dat is
 *    dezelfde afweging als bij `CLAUDE.md` regel 18: een controle die je leert
 *    overslaan, bewaakt niets. De vorm hier houdt de belofte identiek — het
 *    hele bereik, alle vijf de vragen — en betaalt hem één keer.
 */
async function meetDeDatabase(): Promise<Vegen> {
  const [randUit = '', ...contextUit] = await psqlParallel([
    RANDVRAAG,
    ...CONTEXTEN.map(({ voor, na }) => contextVraag(voor, na)),
  ]);

  const context = new Map<string, Set<number>>();
  CONTEXTEN.forEach(({ naam }, i) => context.set(naam, alsCodepunten(contextUit[i] ?? '')));

  return { rand: alsCodepunten(randUit), context };
}

/**
 * Dezelfde vijf vragen aan de TypeScript-kant.
 *
 * ⚠️ **Eén lus over het bereik en vijf vragen per codepunt**, en niet vijf
 *    lussen. `String.fromCodePoint()` en de surrogaatsprong zijn dan werk dat
 *    één keer gedaan wordt. 📏 13,6 s voor het geheel.
 */
function meetDeClient(): Vegen {
  const rand = new Set<number>();
  const context = new Map<string, Set<number>>();
  for (const { naam } of CONTEXTEN) context.set(naam, new Set<number>());

  for (let cp = 1; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;

    const teken = String.fromCodePoint(cp);
    if (schoneNaam(teken) === '') rand.add(cp);

    for (const { naam, voor, na } of CONTEXTEN) {
      const invoer = `${voor}${teken}${na}`;
      if (schoneNaam(invoer) !== invoer) context.get(naam)?.add(cp);
    }
  }

  return { rand, context };
}

let gemetenDatabase: Vegen | undefined;
let gemetenClient: Vegen | undefined;

/**
 * ⚠️ **Werpen en niet leeg teruggeven.** Een toets die per ongeluk buiten
 *    `describe.runIf(beschikbaar)` belandt, zou met een lege verzameling groen
 *    worden — en dat is precies het soort stille nul waar QS8-270 over ging.
 */
function veegDatabase(): Vegen {
  if (gemetenDatabase === undefined) throw new Error('de databaseveeg is niet gedraaid');
  return gemetenDatabase;
}

function veegClient(): Vegen {
  if (gemetenClient === undefined) throw new Error('de clientveeg is niet gedraaid');
  return gemetenClient;
}

/** Eén omgeving uit een veeg, of een harde fout — nooit stilzwijgend leeg. */
function inContext(veeg: Vegen, naam: string): Set<number> {
  const gevonden = veeg.context.get(naam);
  if (gevonden === undefined) throw new Error(`onbekende context: ${naam}`);
  return gevonden;
}

/**
 * ⚠️⚠️ **Een halfuur, en dat getal komt van een rode CI en niet van een
 *    schatting.** 📏 Op deze bak (vier kernen) kost het geheel 108 s; op een
 *    GitHub-runner met twee kernen duurt het een veelvoud, en de eerste versie
 *    liep daar om. Het is één meting voor zeven vegen over het hele
 *    codepuntbereik — dat kóst tijd, en de marge hoort ruim genoeg te zijn dat
 *    hij alleen iets vangt wat écht vastzit.
 */
beforeAll(async () => {
  if (!beschikbaar) return;
  gemetenDatabase = await meetDeDatabase();
  gemetenClient = meetDeClient();
}, 1_800_000);

// ---------------------------------------------------------------------------

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
  return veegDatabase().rand;
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
  return veegClient().rand;
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
  });

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
  });
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
  return inContext(veegDatabase(), ASCII);
}

/** Dezelfde vraag aan de TypeScript-kant. */
function middenWegVolgensDeClient(): Set<number> {
  return inContext(veegClient(), ASCII);
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
  });

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
   *    scheidt. Daarom staan de spaties er niet in.
   *
   * ⚠️⚠️ **En sinds QS8-499 (migratie 0282) is dit niet langer een lijst maar
   *    een antwoord in een omgeving, en dát is de verandering die deze toets
   *    bewust meemaakte.** Hij bood zijn codepunten altijd al aan als
   *    `'a' || chr(cp) || 'b'` — tussen twee ASCII-letters dus — maar zolang
   *    elke regel per codepunt te beantwoorden was, deed die omgeving er niet
   *    toe. Nu wel: `U+200C` gaat hier weg en blijft tussen twee Perzische
   *    letters staan.
   *
   *    Daarom staan de must-allows voor `U+200C`, `U+200D`, de IVS en de tags
   *    niet meer híer op `false` maar in de contextveeg onderaan dit bestand.
   *    Ze hier laten staan zou beweren dat ze overal blijven, en dat is sinds
   *    0282 onwaar.
   *
   * 📏 **3878 → 4241, en dat verschil is met de hand nagemeten en uitgesplitst**
   *    (16-09-2026, lokale stack): **267** komen van
   *    `zonder_onzichtbaar_tussen_letters()` — `U+034F`, `U+061C`,
   *    `U+180B`–`U+180F`, `U+200C`–`U+200F`, `U+FE00`–`U+FE0F` en
   *    `U+E0100`–`U+E01EF` — en **96** van `zonder_losse_tags()`
   *    (`U+E0020`–`U+E007F`). Samen 363, en geen van de 363 zat al in de 3878.
   *    Dat laatste is geen aanname: het getal klópt alleen als de acht
   *    uitzonderingen van 0271 er volledig buiten stonden.
   */
  it('is in ASCII-context de 3878 van 0271 plus de 363 van de contextregel', () => {
    const database = middenWegVolgensDeDatabase();

    expect(database.size, 'niet meer en niet minder').toBe(4241);

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
    expect(database.has(0xe0001), 'de language tag hoort erin').toBe(true);

    // ⚠️⚠️ **Deze zeven stonden hier tot QS8-499 op `false`, en alle zeven zijn
    //    ze bewust omgedraaid.** Ze blijven staan waar ze iets kunnen betekenen
    //    — de contextveeg onderaan toetst precies dát — maar tussen twee
    //    ASCII-letters kan geen van de zeven iets anders zijn dan nul pixels
    //    met een naam eromheen. 📏 `Ja<ZWNJ>n` landde vóór 0282 als vier
    //    codepunten die als `Jan` renderen; nu als drie.
    expect(database.has(0x200c), 'de ZWNJ gaat weg tussen twee ASCII-letters').toBe(true);
    expect(database.has(0x200d), 'de ZWJ ook — geen ASCII-schrift lijmt hiermee').toBe(true);
    expect(database.has(0x200f), 'de RLM ook — hier stuurt hij niets').toBe(true);
    expect(database.has(0x034f), 'de CGJ ook — hij voegt hier niets samen').toBe(true);
    expect(database.has(0x180b), 'de Mongoolse variatieselector ook').toBe(true);
    expect(database.has(0xe0100), 'de IVS ook — ASCII heeft geen variantvormen').toBe(true);
    expect(database.has(0xe0067), 'en een losse tag, waar dan ook').toBe(true);

    // ⚠️⚠️ **De must-allow, en die weegt hier zwaarder dan de weigering** —
    //    acceptatiecriterium 2 van QS8-495. Wat hier blijft staan, blijft in
    //    **élke** omgeving staan: het is witruimte of het is een letter, en
    //    geen van beide raakt de contextregel van 0282 aan.
    expect(database.has(0x0020), 'een spatie in het midden blijft staan').toBe(false);
    expect(database.has(0x00a0), 'een no-break space blijft staan').toBe(false);
    expect(database.has(0x4a), 'en de letter J vanzelfsprekend ook').toBe(false);
    // ⚠️ **De Khmer inherent vowels gáán er wél uit, en dat is een correctie.**
    //    De handgeschreven lijst hield ze buiten met "schriftgebonden". Unicode
    //    markeert `U+17B4`–`U+17B5` als **afgeschaft** én `Default_Ignorable`;
    //    de bewering dat een schrift ze nodig heeft, hield geen stand.
    expect(database.has(0x17b4), 'de afgeschafte Khmer inherent vowel gaat eruit').toBe(true);
  });

  /**
   * ⚠️⚠️ **Dit wás het gat dat QS8-495 openliet, en QS8-499 sluit het voor het
   *    gemeten geval — maar niet voor de hele klasse.** De toets die hier stond
   *    legde `U+200C` en `U+200D` op `false` vast, met als reden dat een
   *    contextregel *"niet past in de vorm die deze sweep vergelijkt"*. Die
   *    reden was waar over de vórm en niet over de belofte; 0282 veranderde de
   *    vorm, en deze toets is daarom bewust vervangen in plaats van bijgewerkt.
   *
   * ⚠️⚠️ **Wat ervoor in de plaats komt is de rest die nog openstaat**, want een
   *    gat dat je dichtdoet zonder op te schrijven wat er over is, leest als een
   *    gat dat dicht is. De grens van 0282 is *"tussen twee **ASCII**-
   *    alfanumerieken"*, en die is met opzet nauwer dan het probleem: de
   *    correcte regel is *"tussen twee letters uit een schrift dat dit teken
   *    niet gebruikt"*, en die vraagt Unicode-scriptdata die Postgres niet heeft.
   *
   *    📏 Gemeten op de lokale stack (16-09-2026): `Ja<ZWNJ>n` wordt **3**
   *    codepunten, en `Ján<ZWNJ>ös` blijft **6** — want `ö` is geen ASCII.
   *    Twee leden met `Jánös` en `Ján<ZWNJ>ös` dragen dus nog steeds een
   *    pixel-identieke naam, en domeinregel 3 zegt dat de lezer uit de náám
   *    afleidt wie hij autoriseert.
   *
   *    Staat als rij in `docs/ENGINEER-REVIEW.md`. Zie
   *    `docs/decisions/2026-09-16-de-plek-is-het-probleem-en-niet-het-teken.md`.
   */
  it('sluit het ASCII-geval en laat het niet-ASCII-geval aantoonbaar open', () => {
    // Het geval dat dicht is — aan beide kanten, want een naad met één kant
    // dicht is geen naad.
    expect(telTekens(schoneNaam('Ja\u200Cn')), 'ZWNJ tussen ASCII gaat weg').toBe(3);
    expect(viaDeDatabase(['Ja\u200Cn'])[0]).toBe(alsHex('Jan'));

    // ⚠️ En het geval dat **open** staat, met dezelfde scherpte getoetst. Deze
    //    toets hoort rood te worden op de dag dat iemand de regel verbreedt —
    //    dan is dit geen bekende prijs meer maar een verouderde aanname, en
    //    hoort de rij in ENGINEER-REVIEW mee te verdwijnen.
    const ontsnapt = 'J\u00E1n\u200C\u00F6s';
    expect(telTekens(schoneNaam(ontsnapt)), 'ö is geen ASCII, dus de ZWNJ blijft').toBe(6);
    expect(viaDeDatabase([ontsnapt])[0]).toBe(alsHex(ontsnapt));
  }, 30_000);

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

describe.runIf(beschikbaar)('de twee talen oordelen in élke context hetzelfde', () => {
  /**
   * ⚠️ **Beide richtingen apart benoemd**, om dezelfde reden als bij de twee
   *    sweeps hierboven — maar nu per context, zodat de melding zegt wáár ze uit
   *    elkaar lopen. "Ze zijn het oneens over U+200C" is een raadsel; "ze zijn
   *    het oneens over U+200C tussen Arabische letters" is een bevinding.
   */
  it('raakt in elke context aan beide kanten dezelfde codepunten', () => {
    for (const { naam } of CONTEXTEN) {
      const db = inContext(veegDatabase(), naam);
      const cl = inContext(veegClient(), naam);

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
  });

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
    const db = veegDatabase();

    const ascii = inContext(db, ASCII);
    const spatie = inContext(db, 'tussen een letter en een spatie');
    const leesteken = inContext(db, 'tussen een letter en een leesteken');
    const arabisch = inContext(db, 'tussen Arabische letters');
    const emoji = inContext(db, 'tussen emoji');
    const vlag = inContext(db, 'na de vlagbasis');

    expect(ascii.has(0x200c), 'ZWNJ hoort weg tussen twee ASCII-letters').toBe(true);
    expect(arabisch.has(0x200c), 'ZWNJ is orthografisch verplicht in het Perzisch').toBe(false);
    expect(emoji.has(0x200d), 'de ZWJ is de lijm in een gezinsemoji').toBe(false);
    expect(ascii.has(0x200d), 'dezelfde ZWJ hoort wél weg tussen twee ASCII-letters').toBe(true);
    expect(ascii.has(0x034f), 'de CGJ hoort weg tussen twee ASCII-letters').toBe(true);

    // ⚠️⚠️ **Deze twee zijn het geval dat de security-review vond.** Ze stonden
    //    hier niet, en de regel deed er niets — 📏 `Jan<ZWNJ> Jansen` landde
    //    ongehinderd naast `Jan Jansen`. Een spatie en een apostrof zijn ASCII
    //    maar niet alfanumeriek, en de eerste versie eiste aan bèide kanten een
    //    alfanumeriek.
    expect(spatie.has(0x200c), 'een spatie mag de regel niet blokkeren').toBe(true);
    expect(leesteken.has(0x200c), 'een leesteken evenmin').toBe(true);

    // ⚠️⚠️ **En deze omsloeg mee met de tagreparatie.** Hier stond `false` met
    //    als reden *"een tag hoort te blijven ná de vlagbasis"* — maar
    //    `U+1F3F4` plus één losse tag is geen vlag, hij rendert als de kále 🏴,
    //    en achter die basis paste zo ~75 tekens onzichtbare ASCII-tekst. De
    //    regel toetst sinds de security-review de vórm van de reeks; de
    //    must-allow ernaast is de echte vlag, die zijn zeven codepunten houdt.
    expect(vlag.has(0xe0067), 'een losse tag vormt geen vlag en gaat weg').toBe(true);

    // ⚠️ En de andere kant van dezelfde must-allow: een gewone letter blijft
    //    overal staan. Zonder dit geval is "de contexten verschillen" ook waar
    //    als er ergens per ongeluk letters sneuvelen.
    for (const [naam, verzameling] of [
      ['ascii', ascii],
      ['spatie', spatie],
      ['leesteken', leesteken],
      ['arabisch', arabisch],
      ['emoji', emoji],
      ['vlag', vlag],
    ] as const) {
      expect(verzameling.has(0x4a), `${naam}: de letter J hoort nergens weg`).toBe(false);
    }
  });
});

describe.runIf(beschikbaar)('de volgorde van de vijf stappen is zelf een naad', () => {
  /**
   * ⚠️⚠️ **Hier knopen twee correcte onderdelen aan elkaar, en dat is precies
   *    waar vraag 1 van onwrikbare regel 18 naar vraagt.** `zonder_losse_tags()`
   *    klopt los, `zonder_onzichtbaar_tussen_letters()` klopt los, en de
   *    volgorde waarin `schone_naam()` ze aanroept is een derde feit dat geen
   *    van beide functies draagt.
   *
   * 📏 **En dat feit is dragend, anders dan de kop van 0282 eerst beweerde.**
   *    Daar stond dat stap 3 vóór stap 4 moet omdat stap 4 een tag anders per
   *    ongeluk zou raken. Nagemeten klopt dat niet: de tekenklasse van stap 4
   *    bevat geen enkel tagcodepunt, dus dat kan in geen van beide volgordes.
   *
   *    Wat er wél gebeurt is de spiegelzijde — stap 3 zet twee ASCII-letters
   *    naast elkaar die dat daarvoor niet waren:
   *
   *      `a<U+E0067><U+200C>b`   stap 3 dan 4  ->  `ab`
   *                              stap 4 dan 3  ->  `a<ZWNJ>b`
   *
   * ⚠️ **De toets grijpt naar de belofte en niet naar de volgorde.** Hij leest
   *    geen functielichaam en telt geen aanroepen; hij biedt de invoer aan waar
   *    de twee volgordes uit elkaar lopen en eist de goede uitkomst. Verhuist
   *    iemand de stappen, dan wordt dit rood — en dat is het enige signaal dat
   *    een comment over volgorde niet kan geven.
   */
  it('ruimt een tag op die twee ASCII-letters uit elkaar hield', () => {
    // `a` + een losse tag + ZWNJ + `b`. De tag houdt de ZWNJ van zijn linker
    // ASCII-buur af; pas als hij weg is, ziet stap 4 `a` en `b`.
    const geval = 'a\u{e0067}\u200Cb';

    expect(telTekens(geval), 'de invoer zelf klopt niet meer').toBe(4);
    expect(schoneNaam(geval), 'TypeScript').toBe('ab');
    expect(viaDeDatabase([geval])[0], 'de database').toBe(alsHex('ab'));
  }, 30_000);

  /**
   * ⚠️⚠️ **Acceptatiecriterium 2 van QS8-499 staat hier en niet in de
   *    end-to-end-toets, en dat is met een ijking rechtgezet.** 📏 IJKING H2 —
   *    de randenlijst van `schone_naam()` teruggezet van `U+E001F` naar
   *    `U+E007F` — liet `laat een subdivisievlag heel` in
   *    `een-naam-rendert-niet-als-een-andere.test.ts` **groen**.
   *
   *    De reden is dat geen enkele CHECK **gelijkheid** met `schone_naam()`
   *    eist. Er is er wel één die hem aanroept — `profiles_display_name_zichtbaar`
   *    doet `schone_naam(display_name) <> ''` — maar die vraagt alleen of er
   *    íets overblijft, en dat blijft het. De randstap woont in de
   *    aanmeldtrigger en in de client, niet in een constraint, dus een
   *    rechtstreekse `PATCH` wordt niet genormaliseerd. Die toets bewijst
   *    daarmee alleen dat géén CHECK een vlag weigert — waar, maar niet wat
   *    criterium 2 vraagt.
   *
   *    Hier wordt `schone_naam()` rechtstreeks aangeroepen, en dáár is de
   *    randstap wél te zien. 📏 Vóór 0282 hield deze naam 11 codepunten over in
   *    plaats van 17: zeven codepunten vlag in, één zwarte vlag uit.
   */
  it('laat een vlag heel áán het eind van een naam, waar de randstap woont', () => {
    const vlag = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
    const geval = `Jan Vries ${vlag}`;

    expect(telTekens(geval), 'de invoer zelf klopt niet meer').toBe(17);
    expect(schoneNaam(geval), 'TypeScript').toBe(geval);
    expect(viaDeDatabase([geval])[0], 'de database').toBe(alsHex(geval));
  }, 30_000);

  /**
   * ⚠️⚠️ **De must-allows van de verbrede buurregel, elk uit een andere hoek.**
   *    De reparatie uit de security-review laat de regel vuren zodra één buur
   *    ASCII-alfanumeriek is en de andere ASCII. Dat is strikt ruimer dan wat er
   *    stond, en ruimer betekent: meer kans om iets te breken dat heel moest
   *    blijven. Elk geval hier is een echt teken uit een echte naam.
   *
   * 📏 Alle vijf nagemeten aan beide kanten, vóór én na de reparatie.
   */
  it('laat een variatieselector staan waar hij iets doet', () => {
    // Een keycap: `1` + VS16 + de omsluitende toets. De VS16 heeft links een
    // ASCII-cijfer, maar rechts staat U+20E3 — niet ASCII, dus de regel zwijgt.
    const keycap = '1\uFE0F\u20E3';
    expect(telTekens(schoneNaam(keycap)), 'keycap').toBe(3);
    expect(viaDeDatabase([keycap])[0], 'keycap, database').toBe(alsHex(keycap));

    // Een hartje met emoji-presentatie: geen ASCII-buur, dus ook niets.
    const hartje = '\u2764\uFE0F';
    expect(telTekens(schoneNaam(hartje)), 'hartje').toBe(2);
    expect(viaDeDatabase([hartje])[0], 'hartje, database').toBe(alsHex(hartje));

    // Een Japanse naam met een ideografische variatieselector.
    const japans = '\u6E21\u{E0101}\u9088';
    expect(telTekens(schoneNaam(japans)), 'IVS').toBe(3);
    expect(viaDeDatabase([japans])[0], 'IVS, database').toBe(alsHex(japans));
  }, 30_000);

  /**
   * ⚠️⚠️ **De richtingsmarkeringen krijgen de stríktere voorwaarde, en dat gat
   *    is met een meting gevonden en niet met een ijking.** De verbreding uit de
   *    security-review haalde `Jan<U+200F> محمد` zijn markering weg — precies de
   *    plek waar hij de lay-out bepaalt van wat erop volgt. Geen enkele toets
   *    zag dat; de poort werd rood op een ánder geval (`a<RLM>b`) en dat leidde
   *    ernaartoe.
   *
   *    De andere vier groepen hangen aan een **teken** en zijn naast een spatie
   *    bewijsbaar inert. Een richtingsmarkering hangt aan een **grens**, en haar
   *    werk begint juist waar er iets niet-alfanumerieks naast staat.
   *
   * ⚠️ **En de prijs staat er als toets naast.** De uitzondering geldt voor de
   *    héle reeks, dus een reeks die een markering mengt met een ander teken
   *    ontsnapt naast een spatie. Staat als rij in `docs/ENGINEER-REVIEW.md`;
   *    valt dit geval om, dan is de regel verbreed en hoort die rij mee te
   *    verdwijnen.
   */
  it('laat een richtingsmarkering staan waar hij een grens markeert', () => {
    // Weg: strikt tussen twee ASCII-letters markeert hij niets.
    expect(schoneNaam('a\u200Fb'), 'tussen twee letters').toBe('ab');
    expect(viaDeDatabase(['a\u200Fb'])[0], 'tussen twee letters, database').toBe(alsHex('ab'));

    // Blijft: op de grens naar een ander schrift doet hij werk.
    const gemengd = 'Jan\u200F \u0645\u062D\u0645\u062F';
    expect(schoneNaam(gemengd), 'twee schriften').toBe(gemengd);
    expect(viaDeDatabase([gemengd])[0], 'twee schriften, database').toBe(alsHex(gemengd));

    // ⚠️ De bekende prijs: een gemengde reeks valt onder de strikte voorwaarde.
    const gemengdeReeks = 'Jan\u200C\u200F Jansen';
    expect(schoneNaam(gemengdeReeks), 'ZWNJ plus RLM ontsnapt naast een spatie').toBe(gemengdeReeks);
    expect(viaDeDatabase([gemengdeReeks])[0], 'idem, database').toBe(alsHex(gemengdeReeks));

    // ...maar dezelfde reeks tússen twee letters niet.
    expect(schoneNaam('a\u200C\u200Fb'), 'tussen twee letters wél weg').toBe('ab');
  }, 30_000);

  /**
   * ⚠️⚠️ **En het geval dat de regel wél raakt en dat een besluit is, geen
   *    omissie.** `c<CGJ>h` is de Slowaakse en Hongaarse digraafscheiding —
   *    twee ASCII-letters met een combining grapheme joiner ertussen, en een
   *    gedocumenteerd gebruik uit de Unicode Standard.
   *
   *    Het beslisdocument beweerde dat de regel geen enkel legitiem gebruik kon
   *    raken *"omdat de twee verzamelingen elkaar niet raken"*. 📏 De
   *    security-review mat het tegendeel. De regel blijft zoals hij is — de CGJ
   *    rendert daar óók als nul pixels, dus `ch` en `c<CGJ>h` zijn visueel
   *    identiek — maar het staat hier als toets zodat het een besluit blijft en
   *    niemand het als bewijs leest dat het niet gebeurt.
   */
  it('haalt de CGJ ook uit een Slowaakse digraaf, en dat is aanvaard', () => {
    expect(schoneNaam('c\u034Fh'), 'TypeScript').toBe('ch');
    expect(viaDeDatabase(['c\u034Fh'])[0], 'de database').toBe(alsHex('ch'));
  }, 30_000);

  /**
   * ⚠️ **En de must-allow ernaast**, want "de tag is weg" is ook te halen door
   *    álle tags te wissen — en dan is de vlag stuk. Dit geval eist dat dezelfde
   *    tag blíjft zodra hij bij een vlagbasis hoort, in dezelfde zin.
   */
  it('en laat dezelfde tag staan zodra er een vlagbasis voor staat', () => {
    const vlag = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
    const geval = `a${vlag}b`;

    expect(telTekens(geval), 'de invoer zelf klopt niet meer').toBe(9);
    expect(schoneNaam(geval), 'TypeScript').toBe(geval);
    expect(viaDeDatabase([geval])[0], 'de database').toBe(alsHex(geval));
  }, 30_000);
});

// ---------------------------------------------------------------------------

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
