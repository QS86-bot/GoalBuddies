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
 * ⚠️ Met de hand rood gemaakt door beide vormen terug te zetten in
 *    `scripts/docs-controle.mjs`; dan noemt hij dat bestand met naam.
 */

const SCRIPTS = fileURLToPath(new URL('../../scripts', import.meta.url));

/** `import.meta.url === `file://${process.argv[1]}`` — draait niet op Windows. */
const VORM_A = /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/;

/** `new URL(..., import.meta.url).pathname` als bestandspad. */
const VORM_B = /new URL\([^)]*import\.meta\.url\)\.pathname/;

export interface Bevinding {
  readonly bestand: string;
  readonly vorm: 'A' | 'B';
}

export function padvormen(
  bestanden: readonly { readonly naam: string; readonly inhoud: string }[],
): Bevinding[] {
  const gevonden: Bevinding[] = [];

  for (const b of bestanden) {
    if (VORM_A.test(b.inhoud)) gevonden.push({ bestand: b.naam, vorm: 'A' });
    if (VORM_B.test(b.inhoud)) gevonden.push({ bestand: b.naam, vorm: 'B' });
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
  ])('ijking: %s', (_naam, inhoud, verwacht) => {
    // Beide richtingen: wat hij moet vinden én wat hij met rust moet laten. Een
    // controle die alles meldt, leert je hem te negeren.
    expect(padvormen([{ naam: 'proef.mjs', inhoud }]).map((b) => b.vorm)).toEqual(verwacht);
  });
});
