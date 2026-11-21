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
 * ⚠️⚠️ **Hij controleert zichzelf op drie manieren.** (1) Elke pagina moet een
 *    `<body` hebben en `index.html` en `aanmelden.html` moeten er zijn, anders is
 *    "geen tekst" een lege uitspraak (een halve of afgebroken `dist/`). (2) Een
 *    kanarie: `zichtbareTekst()` moet tekst vinden op een vaste pagina waar die
 *    staat (`kanarieFaalt()`), anders meldt een kapotte zoekfunctie bij elke run
 *    "geen tekst". (3) De bouw mag niet ouder zijn dan de bron
 *    (`bouwIsOuderDanBron()`): `npm run deploy` laat `dist/` staan, en een
 *    verouderde bouw groen meten is ongemeten als groen. `bundel-controle.mjs` draagt
 *    sinds QS8-767 dezelfde leeftijdscheck (via `bouwIsOuderDanBron`).
 *
 * ⚠️ **Twee pagina's meten niets.** `+not-found.html` en `_sitemap.html` worden
 *    zonder `RootLayout` geprerenderd (alleen `<div id="root"><div></div></div>`):
 *    ze zijn altijd groen. 📏 Gemeten: een tekst in `Shell` maakt **34 van de 36**
 *    pagina's rood, niet 36. Wie "36 pagina's bewaakt" leest, leest te veel.
 *
 * ⚠️ **"Geen tekst" is de goede maatstaf maar geen volledige.** #418 ontstaat in
 *    React 19 ook door een verschil in structuur zonder tekst (`{taal === 'en' &&
 *    <View />}` vóór de poort): de body blijft dan leeg en deze controle groen.
 *    Taalonafhankelijke tekst (een merknaam, een `<noscript>`) maakt hem juist
 *    rood zonder dat er een #418 is; dat is dan een bewuste uitzondering.
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
 *      → rood op 34 van de 36 pagina's, mét de tekst ("Loading") in de melding,
 *        op een echte export; de bron-test van QS8-740 bleef daarbij **groen**
 *        (6 van 6). Dat is de reden dat deze controle bestaat.
 *   A2 een `<Text>` in `Shell` vóór de poort → rood op dezelfde 34 pagina's
 *   A3 de export van `origin/main` zonder de QS8-740-reparatie → rood op 32 van
 *      de 36 pagina's (de andere vier hebben in die bouw een lege body), mét de
 *      Engelse tekst van de bouwmachine in de melding
 *   B  `zichtbareTekst()` altijd `''` → rood op de unittests én op de kanarie bij
 *      een echte run
 *   C  `zichtbareTekst()` alles laten vinden → rood: elke pagina meldt tekst
 *   D  de `<body`-eis weghalen → rood in 'een pagina zonder body is geen
 *      geslaagde meting'
 *   E  een `dist/` ouder dan de bron → OVERGESLAGEN met de leeftijd (en niet
 *      groen); zonder die check was dit een groene uitslag
 *
 * Gebruik:
 *   npm run build          # of: npx expo export --platform web (dummy EXPO_PUBLIC_*)
 *   npm run prerender:controle [-- <map met de export>]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(WORTEL, 'dist');
const BRONNEN = [join(WORTEL, 'app'), join(WORTEL, 'src')];

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

  // ⚠️ **Eén keer van links naar rechts**, niet drie opeenvolgende knippen: wat het
  //    eerst begint wint. Eerst commentaar en dan scripts slokte een tekst op die
  //    tussen een `<!--` in het ene en een `-->` in een ander script stond
  //    (code-critic, gemeten): `<script>var a="<!--";</script><p>Tekst</p>
  //    <script>/*-->*/</script>` gaf `''`.
  return html
    .slice(begin)
    .replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
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
 * @param {(html: string) => string | null} lees geïnjecteerd zodat een test hem kapot kan voeden
 * @returns {string[]}
 */
export function bezwaren(paginas, lees = zichtbareTekst) {
  const uit = [];

  for (const verplicht of VERPLICHT) {
    if (!paginas.some((p) => p.pad === verplicht)) {
      uit.push(`${verplicht} ontbreekt: de bouw is niet compleet, dus hier is niets te meten.`);
    }
  }

  for (const { pad, html } of paginas) {
    const tekst = lees(html);
    if (tekst === null) uit.push(`${pad} heeft geen <body>: niet te meten, en dus geen geslaagde meting.`);
    else if (tekst !== '') uit.push(`${pad} bevat tekst in de body: "${[...tekst].slice(0, 80).join('')}".`);
  }

  return uit;
}

/**
 * Bestaat er een bouw om te meten? Alleen "bestaat niet" heet ongemeten.
 *
 * ⚠️ **Elke andere fout (rechten, een bestand waar een map hoort) gooit.** Een
 *    `catch { return false }` maakte van `EACCES` een `OVERGESLAGEN`, en dus een
 *    ongemeten waar het een kapotte omgeving is (dezelfde klasse als QS8-268:
 *    alleen "er is geen server" mag zo heten).
 */
function bundelBestaat(map) {
  try {
    return statSync(map).isDirectory() && readdirSync(map).length > 0;
  } catch (fout) {
    if (fout.code === 'ENOENT' || fout.code === 'ENOTDIR') return false;
    throw fout;
  }
}

/** De nieuwste wijzigingstijd (ms) van een bestand onder deze mappen, of 0. */
export function nieuwsteWijziging(mappen) {
  let nieuwste = 0;
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      const stat = statSync(vol);
      if (stat.isDirectory()) loop(vol);
      else nieuwste = Math.max(nieuwste, stat.mtimeMs);
    }
  };
  // Een los bestand (`package-lock.json`) telt ook mee, QS8-767.
  for (const pad of mappen) {
    if (!existsSync(pad)) continue;
    if (statSync(pad).isDirectory()) loop(pad);
    else nieuwste = Math.max(nieuwste, statSync(pad).mtimeMs);
  }
  return nieuwste;
}

/**
 * Hoeveel ms is de bouw ouder dan de bron? `0` of minder: de bouw is vers genoeg.
 *
 * ⚠️ **Een oude `dist/` wordt anders groen gemeten.** `npm run deploy` laat `dist/`
 *    in de repo staan. Een sessie die daarna een laadtekst in een provider zet en
 *    de poort draait, leest dan de bouw van maandag en meldt "geen tekst": ongemeten
 *    als groen (code-critic, QS8-742). Is de bron nieuwer dan `index.html`, dan is
 *    de uitslag `OVERGESLAGEN` met de leeftijd erbij.
 *
 * ⚠️ Het meet de bronmappen (`app/`, `src/`) en niet git: een gewijzigd bestand
 *    dat nog niet gecommit is, telt ook, en dat is precies het geval waar het om
 *    gaat. `package.json` en configuratie tellen niet mee; die veranderen de
 *    prerender zelden, en een overslag die te vaak afgaat wordt uitgezet.
 */
export function bouwIsOuderDanBron(map, bronnen = BRONNEN) {
  const index = join(map, 'index.html');
  if (!existsSync(index)) return 0;
  return nieuwsteWijziging(bronnen) - statSync(index).mtimeMs;
}

/** Een pagina waar de zoekfunctie tekst in móét vinden. */
const KANARIE_HTML = '<html><head></head><body><div id="root"><p>kanarie</p></div></body></html>';

/**
 * Faalt de zoekfunctie zelf? Een `zichtbareTekst()` die altijd `''` geeft, meldt
 * bij elke echte run "geen tekst": het gevaarlijkste soort groen.
 *
 * ⚠️ Geïnjecteerd (`lees`) zodat de test hem met een kapotte versie kan voeden.
 */
export function kanarieFaalt(lees = zichtbareTekst) {
  return lees(KANARIE_HTML) !== 'kanarie';
}

function meldOverslag(reden) {
  console.error(
    `⚠ prerender-controle: OVERGESLAGEN — ${reden}\n` +
      '  Deze controle leest de geëxporteerde HTML en dwingt die bouw niet af:\n' +
      '  `expo export` kost minuten. Draai `npm run build` met dummy-`EXPO_PUBLIC_*`\n' +
      '  waarden en daarna deze controle opnieuw.\n' +
      '  Dat is geen groene uitslag maar een ongemeten.',
  );
}

/**
 * Draait de controle en geeft de exitcode terug.
 *
 * @param {string} map
 * @param {string[]} bronnen
 * @param {(html: string) => string | null} lees
 */
export function hoofd(map = DIST, bronnen = BRONNEN, lees = zichtbareTekst) {
  if (!bundelBestaat(map)) {
    meldOverslag('er is geen `dist/` om in te zoeken.');
    return 0;
  }

  const ouder = bouwIsOuderDanBron(map, bronnen);
  if (ouder > 0) {
    const uren = Math.max(1, Math.round(ouder / 3_600_000));
    meldOverslag(`de bron is ~${uren} uur nieuwer dan \`dist/index.html\`, dus die bouw zegt niets over de huidige code.`);
    return 0;
  }

  if (kanarieFaalt(lees)) {
    console.error('✗ de zoekfunctie vindt geen tekst op een pagina waar hij die móét vinden; elke uitslag zou nu "groen" zijn.');
    return 1;
  }

  const paginas = leesPaginas(map);
  const afwijkend = bezwaren(paginas, lees);

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
