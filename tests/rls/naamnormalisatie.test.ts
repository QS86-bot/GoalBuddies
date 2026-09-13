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

import { isOnzichtbaar, schoneNaam, telTekens } from '../../src/shared/tekst';
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

/** Dezelfde vraag aan de TypeScript-kant. */
function onzichtbaarVolgensDeClient(): Set<number> {
  const uit = new Set<number>();

  for (let cp = 1; cp <= 0x10ffff; cp += 1) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    if (isOnzichtbaar(cp)) uit.add(cp);
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
