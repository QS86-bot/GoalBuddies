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
 *    - `OPEN`: draagt het patroon en wacht op een keuze. Gemeld, niet rood.
 *      Leeg sinds QS8-704: de acht die er stonden zijn omgezet.
 *    - `UITGEZONDERD`: draagt de vorm, maar niet de crash — de exit valt
 *      aantoonbaar vóór elke netwerkaanroep, of `fetch` is een eigen binding en
 *      niet de globale. Mét wat er gelezen is als reden. Een eigen binding wordt
 *      hier met opzet niet automatisch herkend: dat zou een blinde vlek zijn
 *      voor een globale `fetch` elders in hetzelfde bestand.
 *
 * ⚠️ **Wat hij níet ziet, en dat staat hier zodat niemand denkt dat de hele
 *    klasse bewaakt is:**
 *    - een netwerkaanroep via een **ander bestand** (een geïmporteerde helper
 *      die `fetch` doet) — hij leest één bestand tegelijk;
 *    - een andere client dan de globale `fetch`: `node:https`, `undici`, een
 *      alias als `const f = fetch`;
 *    - submappen van `scripts/` (die zijn er vandaag niet).
 *    `const { exit } = process` en `p = process;` volgt hij niet maar weigert hij.
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

/**
 * Draagt het patroon en is (nog) niet omgezet. Leeg sinds 18-11-2026: de acht
 * scripts die hier stonden zijn op Quintens besluit meteen omgezet naar
 * `process.exitCode` (QS8-704). Het register blijft bestaan voor de volgende
 * keer dat omzetten op een keuze moet wachten; een rij hier is gemeld, niet rood.
 *
 * @type {Record<string, string>}
 */
export const OPEN = {};

/**
 * Draagt de vorm, niet de crash — mét het aantal exits en fetches dat er bij het
 * lezen stond.
 *
 * ⚠️ **Het aantal is de grendel, niet de reden.** Een uitzondering per bestand
 *    zou ook een exit dekken die er ná deze lezing bijkomt — in `deploy-web.mjs`
 *    precies ná de upload, en dat is de crash van QS8-684 (code-critic,
 *    18-11-2026). Verandert een van beide aantallen, dan is de rij rood tot
 *    iemand opnieuw gelezen heeft en het aantal bijwerkt.
 */
export const UITGEZONDERD = {
  'branches-controle.mjs': {
    exits: 1,
    fetches: 1,
    reden:
      '`fetch` is hier een parameter van hoofd() (standaard haalRemoteOp, een git ' +
      'fetch via een child process) en niet de globale fetch; er is geen netwerk-await. ' +
      'Gelezen op 18-11-2026.',
  },
  'deploy-web.mjs': {
    exits: 5,
    fetches: 5,
    reden:
      'de exit alleen in de preflight (scanOpGeheimen 3×, eisEenSchoneBundel, ' +
      'eisDeDsnInDeBundel), die in main() vóór upload() en zetLive() draait; ná de ' +
      'fetches wordt er geworpen en zet het entrypoint process.exitCode. Gelezen op 18-11-2026.',
  },
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

/** De globale `fetch`, ook `fetch?.(`; een `.fetch(` op een object telt mee. */
const FETCH = /(?<![\w$])fetch\s*(?:\?\.\s*)?\(/g;

/**
 * Elke verwijzing naar `process.exit`, niet alleen een aanroep: ook
 * `.then(process.exit)`, `process?.exit` en `process['exit']`. `exitCode` niet.
 */
const EXIT = /\bprocess\s*\??\.\s*exit\b(?!Code)|\bprocess\s*\[\s*(['"`])exit\1\s*\]/g;

/**
 * `const { exit } = process` maakt van elke `exit(` een exit die geen regex
 * volgt. Die vorm volgen we niet, we weigeren hem — net als een alias.
 */
const ONTWIJKT = /\{[^}]*\bexit\b[^}]*\}\s*=\s*process\b|=\s*process\s*;/;

/** Hoe vaak komen netwerk en exit voor in deze bron, zonder commentaar? */
export function tel(bron) {
  const code = zonderCommentaar(bron);
  return {
    fetches: (code.match(FETCH) ?? []).length,
    exits: (code.match(EXIT) ?? []).length,
    ontwijkt: ONTWIJKT.test(code),
  };
}

/** Draagt deze bron het patroon: een `fetch(` én een `process.exit`? */
export function draagtPatroon(bron) {
  const { fetches, exits } = tel(bron);
  return fetches > 0 && exits > 0;
}

/** Klachten over de registers: verweesd, verdwenen, of een ander aantal. */
function registerklachten(tellingen, open, uitgezonderd) {
  const klachten = [];
  for (const [register, rijen] of [['OPEN', open], ['UITGEZONDERD', uitgezonderd]]) {
    for (const naam of Object.keys(rijen).sort()) {
      const t = tellingen.get(naam);
      if (!t) klachten.push(`${register} noemt ${naam}, maar dat script bestaat niet.`);
      else if (!(t.fetches > 0 && t.exits > 0)) {
        klachten.push(`${register} noemt ${naam}, maar dat draagt het patroon niet meer: haal de rij weg.`);
      }
    }
  }
  for (const [naam, rij] of Object.entries(uitgezonderd)) {
    const t = tellingen.get(naam);
    if (!t || (t.exits === rij.exits && t.fetches === rij.fetches)) continue;
    klachten.push(
      `UITGEZONDERD ${naam}: gelezen bij ${rij.exits} exit(s) en ${rij.fetches} fetch(es), ` +
        `nu ${t.exits} en ${t.fetches}. Lees opnieuw of de reden nog geldt, en werk het aantal bij.`,
    );
  }
  return klachten;
}

/**
 * @param {{ naam: string, bron: string }[]} scripts
 * @param {{ open?: Record<string, string>, uitgezonderd?: Record<string, { exits: number, fetches: number, reden: string }> }} [registers]
 * @returns {{ klachten: string[], open: string[] }}
 */
export function controleer(scripts, registers = {}) {
  const open = registers.open ?? OPEN;
  const uitgezonderd = registers.uitgezonderd ?? UITGEZONDERD;
  const tellingen = new Map(scripts.map((s) => [s.naam, tel(s.bron)]));
  const klachten = [];

  for (const [naam, t] of [...tellingen].sort(([a], [b]) => a.localeCompare(b))) {
    if (t.ontwijkt) {
      klachten.push(`${naam} haalt exit uit het process-object (destructuring of alias); zet process.exitCode.`);
    }
    const drager = t.fetches > 0 && t.exits > 0;
    if (!drager || naam in open || naam in uitgezonderd) continue;
    klachten.push(
      `${naam} combineert een fetch-aanroep met een proces-exit. Zet hem om naar ` +
        '`process.exitCode` (zie scripts/realtime-identiteit-controle.mjs), of zet hem ' +
        'met een gemeten reden en aantal in UITGEZONDERD.',
    );
  }

  klachten.push(...registerklachten(tellingen, open, uitgezonderd));
  const isDrager = (n) => (tellingen.get(n)?.fetches ?? 0) > 0 && (tellingen.get(n)?.exits ?? 0) > 0;
  return { klachten, open: Object.keys(open).filter(isDrager).sort() };
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
    console.log('netwerkexit-controle: geen nieuw script dat fetch en een proces-exit combineert.');
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
