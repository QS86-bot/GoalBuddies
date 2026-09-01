import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Scripts moeten ook op Windows starten — QS8-24, verbreed op 26-08-2026.
 *
 * ⚠️ **De aanleiding was één regel, de bevinding is een klasse.** `npm run
 *    sentry:proef` viel bij zijn eerste echte run om met `Received protocol
 *    'c:'`. Dat is gerepareerd. Maar bij het natrekken bleken er nog achttien
 *    bestanden onder `scripts/` te staan met een van twee vormen die op Windows
 *    niet werken — en de ergste faalt niet luid maar stil.
 *
 * ⚠️ **Vorm A: `import.meta.url === `file://${process.argv[1]}``.** Op Linux
 *    klopt dat toevallig. Op Windows is `import.meta.url` gelijk aan
 *    `file:///C:/Users/…` terwijl `process.argv[1]` gelijk is aan
 *    `C:\Users\…`, dus de vergelijking is nóóit waar en `main()` draait niet.
 *    Het script eindigt met exit 0 en zonder één regel uitvoer — en een controle
 *    die niets zegt, leest als een controle die niets vond. Acht bestanden,
 *    waaronder `deploy-web.mjs`.
 *
 * ⚠️ **Vorm B: `new URL('..', import.meta.url).pathname` als bestandspad.** Die
 *    geeft op Windows `/C:/Users/…` met een schuine streep ervoor, en houdt op
 *    élk platform de URL-codering vast: een repo in `Mijn Projecten` wordt
 *    `Mijn%20Projecten` en dan bestaat het pad niet. Tien bestanden.
 *    `fileURLToPath()` bestaat precies hiervoor.
 *
 * ⚠️ **Waarom geen enkele test dit ving.** Alles onder `scripts/` draait op de
 *    machine van de ontwikkelaar en niet in CI. Groene CI bewees dus alleen dat
 *    ze op Linux werken, en de énige machine waar ze echt gedraaid worden is
 *    Windows. Vandaar dat deze test de vórm toetst en niet de uitvoering: een
 *    Linux-runner kan dit verschil niet nabootsen, maar hij kan het wél lezen.
 *
 * ⚠️ **Vorm C, erbij op 01-09-2026 (QS8-258).** Een script dat een pad *bouwt*
 *    met `relative()` of `join()` en het daarna vergelijkt met een letterlijke
 *    `'map/bestand.ts'` uit zijn eigen uitzonderingslijst. Op Windows levert de
 *    bouwkant backslashes, de lijst schuine strepen, en dan matcht de
 *    uitzondering nóóit: het script meldt precies de bestanden die het moest
 *    overslaan, én meldt elke uitzonderingsregel als verlopen. `paden.mjs`
 *    bestaat sinds 26-08 precies hiervoor, en `kolomrechten-controle.mjs` was het
 *    derde script van deze klasse en het eerste dat het patroon niet volgde.
 *
 * ⚠️ **En dit is de enige van de drie die een Linux-runner kán zien.** Een test
 *    die `bronnaam()` aanroept en de schuine-streepvorm verwacht, is op Linux
 *    groen zonder iets te bewijzen — `metSchuineStrepen` is daar een no-op.
 *    Gemeten: hem uit `bronnaam()` slopen levert nul rode tests op. Alleen de
 *    vórm van de bron verraadt het verschil. Dat is dezelfde reden als hierboven,
 *    en de reden dat deze test hier woont en niet bij de controle zelf.
 *
 * ⚠️ Met de hand rood gemaakt door alle drie de vormen terug te zetten in
 *    `scripts/docs-controle.mjs` respectievelijk `kolomrechten-controle.mjs`;
 *    dan noemt hij dat bestand met naam.
 */

const SCRIPTS = fileURLToPath(new URL('../../scripts', import.meta.url));

/** `import.meta.url === `file://${process.argv[1]}`` — draait niet op Windows. */
const VORM_A = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;

/** `new URL(..., import.meta.url).pathname` als bestandspad. */
const VORM_B = /new URL\([^)]*import\.meta\.url\)\.pathname/;

/**
 * Een gebouwd pad dat met een `/`-literal vergeleken wordt, zonder normalisatie.
 *
 * ⚠️ **`relative()` en niet ook `join()`, en dat is precies de grens die
 *    `paden.mjs` zelf trekt:** *"Bouw je een pad om te lezen, dan hoeft het niet
 *    — `join()` en `readFileSync()` slikken beide vormen op elk platform."* Het
 *    is het vergelíjken dat misgaat, en `relative()` is wat een vergelijkbaar
 *    pad oplevert.
 *
 *    Met `join()` erbij meldde deze vorm vier bestaande scripts die niets
 *    mankeren — `db-types`, `docs-controle`, `stand` en `uitgang-controle`
 *    bouwen alleen een pad om te lézen, en drie van de vier werden bovendien
 *    gevonden op een `arr.join('\n')` die helemaal geen pad is. Een controle die
 *    vals alarm geeft, leer je uit te zetten.
 *
 * ⚠️ **Twee voorwaarden blijven het, en dat is geen slap aftreksel.**
 *    `relative()` alléén is onschuldig, een `'map/bestand'`-literal ook. De fout
 *    ontstaat pas als een script die twee náást elkaar legt.
 */
const BOUWT_PAD = /\brelative\(/;
const PADLITERAAL = /['"](?!\.{1,2}\/)[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+\.(?:tsx?|sql|md)['"]/;
/**
 * ⚠️ **De ímport en niet het woord.** Eerst stond hier `/metSchuineStrepen/`, en
 *    dat is groen zodra de naam ergens in een commentaarregel voorkomt — wat in
 *    dit project bijna gegarandeerd is, want de reden waaróm een script
 *    normaliseert staat er altijd bij. Gemeten: de normalisatie uit
 *    `kolomrechten-controle.mjs` slopen liet deze vorm groen, omdat de uitleg
 *    erboven bleef staan. Een grendel die op een woord in commentaar afgaat,
 *    bewaakt commentaar.
 */
const NORMALISEERT = /import \{[^}]*\bmetSchuineStrepen\b[^}]*\} from ['"][^'"]*paden\.mjs['"]/;

export interface Bevinding {
  readonly bestand: string;
  readonly vorm: 'A' | 'B' | 'C';
}

export function padvormen(
  bestanden: readonly { readonly naam: string; readonly inhoud: string }[],
): Bevinding[] {
  const gevonden: Bevinding[] = [];

  for (const b of bestanden) {
    if (VORM_A.test(b.inhoud)) gevonden.push({ bestand: b.naam, vorm: 'A' });
    if (VORM_B.test(b.inhoud)) gevonden.push({ bestand: b.naam, vorm: 'B' });
    if (
      BOUWT_PAD.test(b.inhoud) &&
      PADLITERAAL.test(b.inhoud) &&
      !NORMALISEERT.test(b.inhoud)
    ) {
      gevonden.push({ bestand: b.naam, vorm: 'C' });
    }
  }

  return gevonden;
}

function alleScripts(): { naam: string; inhoud: string }[] {
  return readdirSync(SCRIPTS)
    .filter((naam) => naam.endsWith('.mjs'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(SCRIPTS, naam), 'utf8') }));
}

describe('scripts starten ook op Windows', () => {
  it('geen enkel script gebruikt een vorm die op Windows breekt', () => {
    const bevindingen = padvormen(alleScripts());

    expect(
      bevindingen,
      bevindingen.map((b) => `${b.bestand} (vorm ${b.vorm})`).join(', '),
    ).toEqual([]);
  });

  it('en de scripts die een main-guard hébben, gebruiken de goede vorm', () => {
    // ⚠️ De positieve controle. Zonder deze helft is een map waarin élke
    //    main-guard verdwenen is net zo groen als een map waarin alles klopt —
    //    en dan draait er helemáál niets meer. Vraag 3 uit regel 18.
    const metGuard = alleScripts().filter((b) => b.inhoud.includes('process.argv[1]'));

    expect(metGuard.length).toBeGreaterThan(5);
    for (const b of metGuard) {
      expect(b.inhoud, b.naam).toContain('pathToFileURL(process.argv[1])');
    }
  });

  it.each([
    ['vorm A', 'if (import.meta.url === `file://${process.argv[1]}`) main();', ['A']],
    ['vorm B', "const W = new URL('..', import.meta.url).pathname;", ['B']],
    [
      'allebei',
      'if (import.meta.url === `file://${process.argv[1]}`) main();\n' +
        "const W = new URL('..', import.meta.url).pathname;",
      ['A', 'B'],
    ],
    [
      'de goede main-guard',
      'if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();',
      [],
    ],
    ['het goede wortelpad', "const W = fileURLToPath(new URL('..', import.meta.url));", []],
    ['een URL die geen pad wordt', "await fetch(new URL('/x', basis).href);", []],
    [
      'vorm C: een vergelijkbaar pad naast een padliteraal',
      "const naam = relative(W, pad);\nconst UIT = ['src/modules/goals/api.ts'];",
      ['C'],
    ],
    [
      'join zonder relative — dat pad wordt gelezen, niet vergeleken',
      "const p = join(W, 'docs/WERKVOORRAAD.md');\nconst D = 'docs/WERKVOORRAAD.md';",
      [],
    ],
    ['een array-join is geen padbouw', "const r = xs.join('\\n');\nconst D = 'src/a.ts';", []],
    [
      'de naam alleen in commentaar telt niet als normalisatie',
      '// we gebruiken hier metSchuineStrepen niet\n' +
        "const naam = relative(W, pad);\nconst UIT = ['src/a.ts'];",
      ['C'],
    ],
    [
      'vorm C genormaliseerd',
      "import { metSchuineStrepen } from './paden.mjs';\n" +
        "const naam = metSchuineStrepen(relative(W, pad));\n" +
        "const UIT = ['src/modules/goals/api.ts'];",
      [],
    ],
    ['een padliteraal zonder gebouwd pad', "const UIT = ['src/lib/x.ts'];", []],
    ['een gebouwd pad zonder padliteraal', 'const naam = join(W, map, bestand);', []],
    ['een .mjs-import is geen vergelijking', "import x from 'scripts/paden.mjs';\njoin(a, b);", []],
    [
      'een importpad is geen vergelijking',
      "import { x } from './paden.mjs';\nconst n = join(a, b);",
      [],
    ],
  ])('ijking: %s', (_naam, inhoud, verwacht) => {
    // Beide richtingen: wat hij moet vinden én wat hij met rust moet laten. Een
    // controle die alles meldt, leert je hem te negeren.
    expect(padvormen([{ naam: 'proef.mjs', inhoud }]).map((b) => b.vorm)).toEqual(verwacht);
  });
});
