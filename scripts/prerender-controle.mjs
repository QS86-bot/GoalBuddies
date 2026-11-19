#!/usr/bin/env node
/**
 * prerender-controle — staat er geen zichtbare tekst in de `<body>` van de
 * geëxporteerde pagina's? — QS8-742.
 *
 * ⚠️⚠️ **De belofte van QS8-740 is een eigenschap van de échte bouw.** De prerender
 *    van `expo export` tekent in Node, waar `navigator.language` de `LANG` van de
 *    bouwmachine volgt; elke client met een andere taal dan de prerender gaf
 *    React-fout #418. QS8-740 loste dat op door `Shell` tot de hydratie alleen de
 *    achtergrond te laten tekenen. De test `tests/beloftes/prerender-is-neutraal.test.ts`
 *    leest daarvoor de **bron** en laat zich niet voeden met wat er daadwerkelijk
 *    uit de export komt: een tekst in een provider of in `RootLayout` ernaast, vóór
 *    de poort, brengt #418 terug en laat die test groen (onwrikbare regel 18,
 *    vraag 3). Deze controle leest de **uitvoer**.
 *
 * ⚠️ **"Geen tekst" is de eigenschap, niet "dezelfde tekst".** Wat taalafhankelijk
 *    is, is tekst. Een lege `<body>` is in elke taal en op elke bouwmachine
 *    hetzelfde, dus er hoeft niets met een afwijkende `LANG` vergeleken te worden;
 *    dat zou een tweede bouw kosten voor dezelfde uitspraak.
 *
 * ⚠️ **Zonder `dist/` meet hij niets, en dat zegt hij** — precies zoals
 *    `bundel-controle`: `expo export` kost minuten en een controle die dat elke
 *    keer eist, wordt uitgezet. Zonder bundel gaat er een `OVERGESLAGEN` naar
 *    stderr en is de exitcode 0; de poort telt hem dan als ongemeten en niet als
 *    groen. CI bouwt niet, dus hij staat met reden in `ZONDER_CI`.
 *
 * ⚠️⚠️ **De zoekfunctie controleert zichzelf.** Een export zonder `<body>`, een
 *    halve `dist/` uit een afgebroken bouw, of een pagina waar de HTML anders is
 *    opgebouwd dan verwacht, geeft óók "geen tekst" en meldt dan opgewekt dat alles
 *    klopt. Vandaar: elke pagina moet een `<body` hebben, en `index.html` en
 *    `aanmelden.html` moeten er zijn. Dezelfde gedachte als `KANARIES` in
 *    `bundel-controle.mjs`.
 *
 * ⚠️ **Attributen tellen niet mee.** `aria-label` en `alt` staan niet in wat React
 *    vergelijkt bij een hydratiefout #418 (dat gaat over tekstknooppunten). Wat hier
 *    telt is tekst die een bezoeker leest.
 *
 * IJKING — met de hand gedraaid op 19-11-2026 tegen een verse bouw, mutatie per
 * grendel, en elke keer eerst bevestigd dat de mutatie er écht in stond (een eerste
 * poging stond er niet in, en gaf een groene uitslag die niets zei; zie A1):
 *
 *   A1 een `<Text>` met een catalogustekst naast `<Shell />` (buiten `Shell`)
 *      → rood op 34 pagina's, mét de tekst ("Loading") in de melding, op een
 *        echte export; de bron-test van QS8-740 bleef daarbij **groen** (6 van 6).
 *        Dat is de reden dat deze controle bestaat.
 *   A2 een `<Text>` in `Shell` vóór de poort → rood op dezelfde 34 pagina's
 *   A3 de export van `origin/main` zonder de QS8-740-reparatie → rood op de
 *      pagina's met de Engelse prerender (bouwmachine `en-US`), tekst in de melding
 *   B  `zichtbareTekst()` altijd `''` laten geven
 *      → rood op de kanarie-test in `tests/scripts/prerender-controle.test.ts`
 *   C  `zichtbareTekst()` alles laten vinden
 *      → rood: elke pagina meldt tekst
 *   D  de eis dat elke pagina een `<body` heeft weghalen
 *      → rood in de test 'een pagina zonder body is geen geslaagde meting'
 *
 * Gebruik:
 *   npm run build          # of: npx expo export --platform web (dummy EXPO_PUBLIC_*)
 *   npm run prerender:controle [-- <map met de export>]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(WORTEL, 'dist');

/** Pagina's die er altijd moeten zijn; ontbreken ze, dan is de bouw niet compleet. */
export const VERPLICHT = ['index.html', 'aanmelden.html'];

/**
 * De tekst die een bezoeker in de `<body>` leest, of `null` zonder `<body`.
 *
 * ⚠️ `null` en `''` zijn niet hetzelfde: `''` is de goede uitslag, `null` is "dit
 *    ben ik niet kunnen meten".
 *
 * @param {string} html
 * @returns {string | null}
 */
export function zichtbareTekst(html) {
  const begin = html.search(/<body[\s>]/i);
  if (begin === -1) return null;

  return html
    .slice(begin)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Alle `*.html` onder `map`, als relatieve paden met hun inhoud.
 *
 * @returns {Array<{pad: string, html: string}>}
 */
export function leesPaginas(map = DIST) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (naam.endsWith('.html')) uit.push({ pad: relative(map, vol), html: readFileSync(vol, 'utf8') });
    }
  };
  loop(map);
  return uit;
}

/**
 * De bezwaren tegen deze pagina's: tekst in de body, een ontbrekende body, of een
 * onvolledige bouw.
 *
 * @param {ReadonlyArray<{pad: string, html: string}>} paginas
 * @returns {string[]}
 */
export function bezwaren(paginas) {
  const uit = [];

  for (const verplicht of VERPLICHT) {
    if (!paginas.some((p) => p.pad === verplicht)) {
      uit.push(`${verplicht} ontbreekt: de bouw is niet compleet, dus hier is niets te meten.`);
    }
  }

  for (const { pad, html } of paginas) {
    const tekst = zichtbareTekst(html);
    if (tekst === null) uit.push(`${pad} heeft geen <body>: niet te meten, en dus geen geslaagde meting.`);
    else if (tekst !== '') uit.push(`${pad} bevat tekst in de body: "${tekst.slice(0, 80)}".`);
  }

  return uit;
}

function bundelBestaat(map) {
  try {
    return statSync(map).isDirectory() && readdirSync(map).length > 0;
  } catch {
    return false;
  }
}

/**
 * Draait de controle en geeft de exitcode terug.
 *
 * @param {string} map
 */
export function hoofd(map = DIST) {
  if (!bundelBestaat(map)) {
    console.error(
      '⚠ prerender-controle: OVERGESLAGEN — er is geen `dist/` om in te zoeken.\n' +
        '  Deze controle leest de geëxporteerde HTML en dwingt die bouw niet af:\n' +
        '  `expo export` kost minuten. Draai `npm run build` met dummy-`EXPO_PUBLIC_*`\n' +
        '  waarden en daarna deze controle opnieuw.\n' +
        '  Dat is geen groene uitslag maar een ongemeten.',
    );
    return 0;
  }

  const paginas = leesPaginas(map);
  const afwijkend = bezwaren(paginas);

  if (afwijkend.length > 0) {
    for (const regel of afwijkend) console.error(`✗ ${regel}`);
    console.error(
      '\nDe prerender hoort neutraal te zijn (QS8-740): tekst die van de taal afhangt en vóór\n' +
        'de hydratie getekend wordt, geeft React-fout #418 bij elke client met een andere\n' +
        'taal dan de bouwmachine. Zie `docs/decisions/2026-11-19-de-prerender-is-neutraal-en-de-app-start-na-de-hydratie.md`.',
    );
    return 1;
  }

  console.log(`prerender-controle: ${paginas.length} pagina's, geen zichtbare tekst in een body.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd(process.argv[2] ?? DIST));
}
