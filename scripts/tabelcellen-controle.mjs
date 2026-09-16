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

/** @typedef {{ pad: string, regel: number, gevonden: number, verwacht: number, tekst: string }} Klacht */

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
  let tabellen = 0;
  let rijen = 0;
  const regels = inhoud.split('\n');
  let verwacht = null;

  for (let i = 0; i < regels.length; i += 1) {
    const regel = regels[i];

    // Geen tabelregel: de lopende tabel is afgelopen.
    if (!regel.trimStart().startsWith('|')) {
      verwacht = null;
      continue;
    }

    // Een scheidingsregel maakt van de regel erboven een kop.
    if (SCHEIDING.test(regel.trim()) && regels[i - 1]?.trimStart().startsWith('|')) {
      verwacht = cellenVanRij(regels[i - 1]).length;
      tabellen += 1;
      continue;
    }

    // Een tabelregel zonder kop erboven is geen tabel; die telt niet mee.
    if (verwacht === null) continue;

    rijen += 1;
    const gevonden = cellenVanRij(regel).length;
    if (gevonden !== verwacht) {
      uit.push({ pad, regel: i + 1, gevonden, verwacht, tekst: regel.trim().slice(0, 90) });
    }
  }

  return { klachten: uit, tabellen, rijen };
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

  console.error(`\ntabelcellen-controle: ${klachten.length} rij(en) renderen hun laatste kolom niet.\n`);
  for (const k of klachten) {
    console.error(`  ${k.pad}:${k.regel}  ${k.gevonden} cellen in plaats van ${k.verwacht}`);
    console.error(`    ${k.tekst}\n`);
  }
  console.error(
    '  GFM knipt een rij op élke niet-ontsnapte `|`, ook binnen backticks, en\n' +
      '  laat de overtollige cellen aan het eind vallen — of vult aan met lege.\n' +
      '  In beide gevallen gaat de laatste kolom eraan, en dat is hier de kolom\n' +
      '  die de stand draagt. Schrijf een streep in celinhoud als `\\|`.\n',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
