#!/usr/bin/env node
/**
 * Elke markdown-tabelrij telt evenveel cellen als zijn kop — QS8-500.
 *
 * ⚠️⚠️ **Waarom dit een eigen controle is en geen regel in `review:controle`.**
 *    Die telt de cellen al, en hij doet het goed — maar hij kijkt naar één
 *    bestand: `docs/ENGINEER-REVIEW.md`. 📏 Op 16-09-2026 stonden er drie
 *    kapotte rijen in `docs/decisions/002-domeinregel7-oppervlakken.md`, het
 *    document waar CLAUDE.md de lezer bij élk nieuw groepsoppervlak heen
 *    stuurt. Dat is QS8-417 nog een keer: *een reparatie die de instanties
 *    opruimt en het mechanisme laat staan, groeit terug* — QS8-415 ruimde de
 *    achttien rijen van dat ene bestand op en liet de klasse leven.
 *
 * ⚠️ **En het issue dat deze controle vroeg, meette er zelf twee van de drie.**
 *    QS8-500 noemt de hoofdtabel van 002 met zoveel woorden *"geen enkele
 *    afwijking"*; 📏 rij 9 had toen al vijf dagen een zesde cel, waarin de hele
 *    uitleg over het samenvouwen van systeemberichten stond. Een handmatige
 *    telling vindt wat je toevallig aankijkt.
 *
 * ---------------------------------------------------------------------------
 * Wat GFM doet, en waarom dit stil kapotgaat
 * ---------------------------------------------------------------------------
 *
 * Een rij met **méér** cellen dan de kop verliest de overtollige — aan het
 * **eind**. Een rij met **minder** krijgt er lege bij, ook aan het eind. In
 * allebei de gevallen is het de laatste kolom die eraan gaat, en dat is in dit
 * project stelselmatig de kolom die de stand draagt: `Risico`, `Stand`,
 * `Afgedwongen door`. De lezer ziet geen gat maar een andere waarde, of niets.
 *
 * ⚠️ **Backticks beschermen niets**, en dat is de val. `cellenVanRij()` in
 *    `scripts/review-controle.mjs` draagt die knip sinds QS8-415 en wordt hier
 *    hergebruikt in plaats van nagebouwd — twee knippen die uiteen kunnen lopen
 *    is precies het defect dat deze controle bewaakt.
 *
 * ---------------------------------------------------------------------------
 * De scope, en die is zelf een bewering
 * ---------------------------------------------------------------------------
 *
 * Alle `.md` onder `docs/`, plus `CLAUDE.md` en `PRD-accountability-app.md` —
 * de twee markdownbestanden in de wortel. 📏 Gemeten bij het bouwen: 573
 * tabellen en 3215 datarijen in 180 bestanden, en **nul** afwijkingen na de drie
 * reparaties van QS8-500. Daarom staat er geen register onder deze controle:
 * een uitzonderingslijst die niets dekt, is een lijst die volloopt.
 *
 * ⚠️ Wat hij niet ziet: een tabel in een `.ts`-comment of in een migratiekop.
 *    Die renderen nergens als tabel, dus daar bestaat dit defect niet.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { cellenVanRij } from './review-controle.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De bestanden die deze controle leest. Zie de kop: de scope is een bewering. */
export const BRONNEN = ['docs', 'CLAUDE.md', 'PRD-accountability-app.md'];

/**
 * De scheidingsregel onder een tabelkop: `|---|---|` of `| :-- | --: |`.
 *
 * ⚠️ Hij ís het anker en niet de kop zelf. Een regel die met `|` begint is nog
 *    geen tabel — in dit project staan er codeblokken en citaten vol met
 *    strepen. Pas een scheidingsregel maakt van de regel erbóven een kop, en
 *    dat is precies de regel die GFM ook hanteert.
 */
const SCHEIDING = /^\|[\s:|-]+\|$/;

/**
 * Een codefence. Binnen een codeblok is een `|` geen tabelcel maar tekst — daar
 * staan in dit project SQL-uitvoer en ASCII-tekeningen in.
 */
const FENCE = /^(```|~~~)/;

/** @typedef {{ pad: string, regel: number, gevonden: number, verwacht: number, tekst: string }} Cellenklacht */
/** @typedef {{ pad: string, regel: number, verwacht: number, aantal: number, tekst: string }} Weesklacht */
/** @typedef {Cellenklacht | Weesklacht} Klacht */

/**
 * @param {Klacht} k
 * @returns {k is Weesklacht}
 */
export function isWees(k) {
  return 'aantal' in k;
}

/**
 * De rijen in dit bestand die niet evenveel cellen tellen als hun kop, plus
 * wat er onderweg gezien is.
 *
 * ⚠️ De telling hoort bij de klacht en staat er niet naast. Nul klachten over
 *    nul tabellen is geen groen maar een kapotte zeef, en dan moet het getal
 *    dat je print over dezelfde rijen gaan als de controle.
 *
 * @param {string} inhoud
 * @param {string} pad  alleen voor de melding
 * @returns {{ klachten: Klacht[], tabellen: number, rijen: number }}
 */
export function klachtenVan(inhoud, pad = '') {
  /** @type {Klacht[]} */
  const uit = [];
  const telling = { tabellen: 0, rijen: 0 };
  const regels = inhoud.split('\n');
  const staat = { verwacht: null, verlaten: null, inCode: false, wees: null };

  for (let i = 0; i < regels.length; i += 1) {
    const regel = regels[i] ?? '';

    if (FENCE.test(regel.trim())) {
      sluitFence(uit, staat, pad);
      continue;
    }
    if (staat.inCode) continue;

    if (!regel.trimStart().startsWith('|')) {
      sluitTabel(uit, staat, pad, regel);
      continue;
    }

    if (SCHEIDING.test(regel.trim()) && regels[i - 1]?.trimStart().startsWith('|')) {
      sluitWees(uit, staat, pad);
      staat.verwacht = cellenVanRij(regels[i - 1] ?? '').length;
      staat.verlaten = null;
      telling.tabellen += 1;
      continue;
    }

    if (staat.verwacht === null) {
      // ⚠️ **Een regel met een scheidingsregel eronder is een kóp en geen wees.**
      //    Zo begint een tweede tabel onder een eerste, en dat is in dit project
      //    de gewone vorm: 📏 twee van de zes eerste treffers waren dit. Een
      //    controle die de normale vorm meldt, leer je negeren.
      const kop = SCHEIDING.test((regels[i + 1] ?? '').trim());
      if (staat.verlaten !== null && !kop) noteerWees(staat, regel, i, staat.verlaten);
      continue;
    }

    telling.rijen += 1;
    const gevonden = cellenVanRij(regel).length;
    if (gevonden !== staat.verwacht) {
      uit.push({ pad, regel: i + 1, gevonden, verwacht: staat.verwacht, tekst: kort(regel) });
    }
  }

  sluitWees(uit, staat, pad);
  return { klachten: uit, ...telling };
}

/** Een codefence zet de lezer aan of uit; alles wat liep, eindigt. */
function sluitFence(uit, staat, pad) {
  sluitWees(uit, staat, pad);
  staat.inCode = !staat.inCode;
  staat.verwacht = null;
  staat.verlaten = null;
}

/**
 * Een regel die geen tabelrij is, sluit de lopende tabel.
 *
 * ⚠️ **Alleen een lége regel houdt de verlaten kop in leven, en dat is de hele
 *    precisie van deze controle.** Staat er gewone tekst tussen, dan is de
 *    tabel echt afgelopen en is een rij erna geen weesrij maar een alinea die
 *    toevallig met een streep begint — die melden zou de controle laten
 *    volstromen met vals alarm.
 */
function sluitTabel(uit, staat, pad, regel) {
  if (regel.trim() === '') staat.verlaten = staat.verwacht ?? staat.verlaten;
  else {
    sluitWees(uit, staat, pad);
    staat.verlaten = null;
  }
  staat.verwacht = null;
}

/** @param {string} regel */
function kort(regel) {
  return regel.trim().slice(0, 90);
}

/**
 * Eén melding per **reeks** weesrijen, en niet per rij.
 *
 * ⚠️ 320 losse regels zijn geen bevinding maar een muur, en een controle die een
 *    muur print leer je overslaan. De reeks heeft één oorzaak — de lege regel
 *    erboven — dus hij hoort ook één melding te zijn, mét zijn lengte erin.
 */
function noteerWees(staat, regel, i, verwacht) {
  if (staat.wees === null) staat.wees = { regel: i + 1, verwacht, aantal: 0, tekst: kort(regel) };
  staat.wees.aantal += 1;
}

function sluitWees(uit, staat, pad) {
  if (staat.wees === null) return;
  uit.push({ pad, ...staat.wees });
  staat.wees = null;
}

/** Elk `.md`-bestand onder een map, of het bestand zelf. */
function markdownIn(pad) {
  const vol = join(WORTEL, pad);
  if (!statSync(vol).isDirectory()) return pad.endsWith('.md') ? [pad] : [];
  return readdirSync(vol).flatMap((naam) => markdownIn(join(pad, naam)));
}

/** @param {readonly string[]} bronnen */
export function loop(bronnen = BRONNEN) {
  const paden = bronnen.flatMap((b) => markdownIn(b));
  /** @type {Klacht[]} */
  const klachten = [];
  let tabellen = 0;
  let rijen = 0;

  for (const pad of paden) {
    const uitslag = klachtenVan(readFileSync(join(WORTEL, pad), 'utf8'), pad);
    klachten.push(...uitslag.klachten);
    tabellen += uitslag.tabellen;
    rijen += uitslag.rijen;
  }

  return { klachten, tabellen, rijen, bestanden: paden.length };
}

function meldCellen(cellen) {
  console.error(`\ntabelcellen-controle: ${cellen.length} rij(en) renderen hun laatste kolom niet.\n`);
  for (const k of cellen) {
    console.error(`  ${k.pad}:${k.regel}  ${k.gevonden} cellen in plaats van ${k.verwacht}`);
    console.error(`    ${k.tekst}\n`);
  }
  console.error(
    '  GFM knipt een rij op élke niet-ontsnapte `|`, ook binnen backticks, en\n' +
      '  laat de overtollige cellen aan het eind vallen — of vult aan met lege.\n' +
      '  In beide gevallen gaat de laatste kolom eraan, en dat is hier de kolom\n' +
      '  die de stand draagt. Schrijf een streep in celinhoud als `\\|`.\n',
  );
}

function meldWezen(wezen) {
  const rijen = wezen.reduce((n, k) => n + k.aantal, 0);
  console.error(
    `\ntabelcellen-controle: ${wezen.length} reeks(en) van samen ${rijen} rij(en) ` +
      'renderen helemaal niet als tabel.\n',
  );
  for (const k of wezen) {
    console.error(`  ${k.pad}:${k.regel}  ${k.aantal} rij(en), kop van ${k.verwacht} cellen`);
    console.error(`    ${k.tekst}\n`);
  }
  console.error(
    '  Er staat een lege regel tussen deze rijen en hun kop. GFM sluit een\n' +
      '  tabel op de eerste lege regel, en rijen zonder kop+scheidingsregel zijn\n' +
      '  een gewone alinea — één doorlopende muur tekst met strepen erin, geen\n' +
      '  kolommen. 📏 Gemeten met `cmark-gfm`, de renderer van GitHub zelf.\n' +
      '  Haal de lege regel weg, of geef het tweede stuk een eigen kop.\n',
  );
}

function main() {
  const { klachten, tabellen, rijen, bestanden } = loop();

  if (tabellen === 0) {
    console.error(
      'tabelcellen-controle: nul tabellen gevonden, en dat kan niet kloppen.\n' +
        '  Een zeef die niets ziet, meldt ook niets. Controleer BRONNEN.',
    );
    process.exit(1);
  }

  if (klachten.length === 0) {
    console.log(
      `tabelcellen-controle: ${tabellen} tabellen, ${rijen} rijen in ${bestanden} ` +
        'bestanden — elke rij telt evenveel cellen als zijn kop.',
    );
    process.exit(0);
  }

  const wezen = klachten.filter(isWees);
  const cellen = klachten.filter((k) => !isWees(k));

  if (cellen.length > 0) meldCellen(cellen);
  if (wezen.length > 0) meldWezen(wezen);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
