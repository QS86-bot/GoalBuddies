#!/usr/bin/env node
/**
 * Geen `process.exit()` in een script dat netwerk gebruikt — QS8-704.
 *
 * ⚠️ **Waarom.** Op Windows crasht Node met `0xC0000409` (een assertie in
 *    `src\win\async.c`) als een script na een `await fetch` het proces met
 *    `process.exit()` afsluit terwijl libuv nog een handle van die fetch open
 *    heeft. 📏 Op Windows nagemeten op 18-11-2026 voor vier scripts (QS8-684):
 *    met `process.exit()` crasht hij, met `process.exitCode` niet. Die vier zijn
 *    omgezet; de **klasse** bewaakte niemand, en een brontoets op vier vaste
 *    bestanden ziet geen vijfde.
 *
 * ⚠️ **Wat dit meet is de vorm, niet de crash.** Een script "draagt het
 *    patroon" als zijn bron — zonder commentaar — zowel een `fetch(` als een
 *    `process.exit(` bevat. Of die exit bij het draaien ná de fetch komt, ziet
 *    deze controle niet; daarom staat er een register met een reden per script.
 *    De vorm is bewust ruim: `process.exit (1)` met spatie en `process['exit'](`
 *    tellen mee, en elke `fetch(`, niet alleen een ge-`await`-te.
 *
 * ⚠️⚠️ **Twee registers, en ze wegen anders.**
 *    - `OPEN`: draagt het patroon en is niet gemeten op Windows. Of ze eerst
 *      gemeten of meteen omgezet worden is een keuze van Quinten (QS8-704). Ze
 *      worden gemeld, niet rood. Komt er één bij, dan is dat rood — zo groeit de
 *      klasse niet stil verder.
 *    - `UITGEZONDERD`: draagt de vorm, maar niet de crash — de exit valt
 *      aantoonbaar vóór elke netwerkaanroep, of `fetch` is een eigen binding en
 *      niet de globale. Mét wat er gelezen is als reden. Een eigen binding wordt
 *      hier met opzet niet automatisch herkend: dat zou een blinde vlek zijn
 *      voor een globale `fetch` elders in hetzelfde bestand.
 *
 *    **De ratel slaat twee kanten op**, zoals `regel15:controle`: een
 *    registerrij voor een script dat het patroon niet (meer) draagt, of dat niet
 *    bestaat, is óók rood. Anders blijft een omgezet script in `OPEN` staan en
 *    glijdt het volgende er ongezien in.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Draagt het patroon, niet gemeten op Windows; de keuze ligt bij Quinten (QS8-704). */
export const OPEN = {
  'edge-gedeployd.mjs': 'niet gemeten op Windows (QS8-704)',
  'functies-controle.mjs': 'niet gemeten op Windows (QS8-704)',
  'migratie-hernummer.mjs': 'niet gemeten op Windows (QS8-704)',
  'migratieregister-controle.mjs': 'niet gemeten op Windows (QS8-704)',
  'migratieregister-uitlijnen.mjs': 'niet gemeten op Windows (QS8-704)',
  'rls-dekking.mjs': 'niet gemeten op Windows (QS8-704)',
  'sentry-proef.mjs': 'niet gemeten op Windows (QS8-704)',
  'uurjobs-controle.mjs': 'niet gemeten op Windows (QS8-704)',
};

/** Draagt de vorm, maar de exit valt vóór elke netwerkaanroep. */
export const UITGEZONDERD = {
  'branches-controle.mjs':
    '`fetch` is hier een parameter van hoofd() (standaard haalRemoteOp, een git ' +
    'fetch via een child process) en niet de globale fetch; er is geen netwerk-await. ' +
    'Gelezen op 18-11-2026.',
  'deploy-web.mjs':
    'process.exit() alleen in de preflight (scanOpGeheimen, eisEenSchoneBundel, de ' +
    'DSN-controle in main) die vóór upload() en zetLive() draait; ná de fetches ' +
    'wordt er geworpen en zet het entrypoint process.exitCode. Gelezen op 18-11-2026.',
};

/**
 * Haalt commentaar weg, en alleen commentaar — een eigen knip, met reden in
 * `MET_REDEN` van `scripts/knip-controle.mjs`.
 *
 * ⚠️⚠️ **Waarom niet de gedeelde knip uit `scripts/zonder-commentaar.mjs`.** Die
 *    vervangt elke `/* … *\/` waar hij ook staat, en dan leest hij de glob
 *    `` `${app}/**` `` in een template-string als begin van commentaar: alles tot
 *    de volgende `*\/` verdwijnt, en een `process.exit` daartussen ook. 📏 Gemeten
 *    op 18-11-2026: met de gedeelde knip viel de toets *"ziet code achter een
 *    string met /** erin"* om. Dat is de vorm van PR #688 (`scripts/auth-urls.mjs`),
 *    en globs staan juist in `scripts/`. Deze knip eist dat een blok aan het begin
 *    van een regel begint. Wat hij laat staan (een `/* … *\/` midden in een regel)
 *    blijft code en kan dus hoogstens te véél melden, niet te weinig.
 */
export function zonderCommentaar(bron) {
  return bron.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');
}

const FETCH = /(?<![\w$])fetch\s*\(/;
const EXIT = /\bprocess\s*(?:\.\s*exit|\[\s*(['"`])exit\1\s*\])\s*\(/;

/** Draagt deze bron het patroon: een `fetch(` én een `process.exit(`? */
export function draagtPatroon(bron) {
  const code = zonderCommentaar(bron);
  return FETCH.test(code) && EXIT.test(code);
}

/**
 * @param {{ naam: string, bron: string }[]} scripts
 * @param {{ open?: Record<string, string>, uitgezonderd?: Record<string, string> }} [registers]
 * @returns {{ klachten: string[], open: string[] }}
 */
export function controleer(scripts, registers = {}) {
  const open = registers.open ?? OPEN;
  const uitgezonderd = registers.uitgezonderd ?? UITGEZONDERD;
  const dragers = new Set(scripts.filter((s) => draagtPatroon(s.bron)).map((s) => s.naam));
  const bestaand = new Set(scripts.map((s) => s.naam));
  const klachten = [];

  for (const naam of [...dragers].sort()) {
    if (naam in open || naam in uitgezonderd) continue;
    klachten.push(
      `${naam} combineert een fetch-aanroep met process.exit. Zet de exit om naar ` +
        '`process.exitCode` (zie scripts/realtime-identiteit-controle.mjs), of zet hem ' +
        'met een gemeten reden in UITGEZONDERD.',
    );
  }

  for (const [register, rijen] of [['OPEN', open], ['UITGEZONDERD', uitgezonderd]]) {
    for (const naam of Object.keys(rijen).sort()) {
      if (!bestaand.has(naam)) klachten.push(`${register} noemt ${naam}, maar dat script bestaat niet.`);
      else if (!dragers.has(naam)) {
        klachten.push(`${register} noemt ${naam}, maar dat draagt het patroon niet meer: haal de rij weg.`);
      }
    }
  }

  return { klachten, open: Object.keys(open).filter((n) => dragers.has(n)).sort() };
}

function leesScripts() {
  const map = join(WORTEL, 'scripts');
  return readdirSync(map)
    .filter((naam) => /\.(?:mjs|js|cjs)$/.test(naam))
    .map((naam) => ({ naam, bron: readFileSync(join(map, naam), 'utf8') }));
}

function main() {
  const { klachten, open } = controleer(leesScripts());

  if (open.length > 0) {
    console.log(`netwerkexit-controle: ${open.length} script(s) open, keuze bij Quinten (QS8-704):`);
    for (const naam of open) console.log(`  · ${naam}`);
  }

  if (klachten.length === 0) {
    console.log('netwerkexit-controle: geen nieuw script dat fetch en process.exit combineert.');
    return 0;
  }

  console.error(`netwerkexit-controle: ${klachten.length} bevinding(en).\n`);
  for (const k of klachten) console.error(`  ✗ ${k}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // ⚠️ `process.exitCode` en geen `process.exit()`: dit script draagt anders
  //    zelf de vorm die het bewaakt (het leest geen netwerk, maar de regel is
  //    eenvoudiger zonder uitzondering voor zichzelf).
  process.exitCode = main();
}
