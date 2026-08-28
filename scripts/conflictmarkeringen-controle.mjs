#!/usr/bin/env node
/**
 * Geen achtergebleven conflictmarkeringen in de repo.
 *
 * ⚠️ **Dit is geen theoretisch risico; het stond op `main`.** Op 28-08-2026 droeg
 *    `docs/ENGINEER-REVIEW.md` zes markeringsregels uit twee eerdere merges
 *    (`fix/tekstgrenzen-en-ai-invoer` en `fix/auth-uid-initplan`), plus twee
 *    dossierrijen die er elk **drie keer** in stonden — drie kopieën die alleen
 *    verschilden in het migratienummer dat ze noemden. Het is meegegaan door een
 *    merge, een PR en een CI-run, en pas opgevallen doordat een vólgende merge
 *    geneste markeringen opleverde.
 *
 * ⚠️ **Waarom geen enkele controle het zag.** `review:controle` leest tabelrijen,
 *    en `<<<<<<<` is geen tabelrij. `docs:controle` vergelijkt feiten tussen
 *    documenten, en een markering is geen feit. Typecheck en lint kijken niet
 *    naar `.md`. Elk stuk gereedschap deed precies zijn werk; er was geen stuk
 *    dat dít werk deed. Regel 18, vraag 3, op de verzameling controles in plaats
 *    van op één test.
 *
 * ⚠️ **`=======` telt niet mee, en dat is met opzet.** Een regel met alleen
 *    isgelijktekens is in Markdown een setext-kop (de onderstreping van een `H1`)
 *    en komt in gewone documenten voor. Alleen de drie vormen die een refnaam
 *    dragen zijn ondubbelzinnig: `<<<<<<<`, `>>>>>>>` en de diff3-variant
 *    `|||||||`. Een controle die setext-koppen meldt, leer je te negeren.
 *
 * ⚠️ **De patronen worden hier opgebouwd en niet uitgeschreven.** Anders bevat
 *    dit bestand ze zelf, en dan moet het zichzelf overslaan — een uitzondering
 *    die de controle precies zo groot maakt als hij niet moet zijn.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Mappen waar geen broncode van dit project in staat. */
export const OVERSLAAN = [
  /\/node_modules\//,
  /\/\.git\//,
  /\/dist\//,
  /\/build\//,
  /\/coverage\//,
  /\/\.expo\//,
];

/** Bestandsvormen die tekst zijn en dus een markering kunnen dragen. */
const VORMEN = /\.(md|tsx?|jsx?|mjs|cjs|json|sql|ya?ml|sh|css|html|txt)$/;

/**
 * De drie ondubbelzinnige markeringen, opgebouwd uit hun eigen teken.
 *
 * @returns {readonly string[]}
 */
export function markeringen() {
  return ['<', '>', '|'].map((teken) => teken.repeat(7));
}

/**
 * De regels met een achtergebleven conflictmarkering.
 *
 * ⚠️ **De markering moet vooraan staan en er moet iets achter komen.** Git
 *    schrijft `<<<<<<< HEAD` en `>>>>>>> tak`, altijd aan het begin van een regel
 *    en altijd met een naam erachter. Zonder die twee eisen meldt deze controle
 *    een reeks punthaken in een tekening of in een testfixture.
 *
 * @param {string[]} regels
 * @returns {{ regel: number, tekst: string }[]}
 */
export function markeringenIn(regels) {
  const uit = [];
  const vormen = markeringen();

  regels.forEach((regel, i) => {
    for (const vorm of vormen) {
      if (regel.startsWith(`${vorm} `) && regel.length > vorm.length + 1) {
        uit.push({ regel: i + 1, tekst: regel.slice(0, 60) });
        break;
      }
    }
  });

  return uit;
}

function bestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const vol = join(dir, naam);
    if (OVERSLAAN.some((r) => r.test(`${metSchuineStrepen(vol)}/`))) continue;
    if (statSync(vol).isDirectory()) bestanden(vol, uit);
    else if (VORMEN.test(naam)) uit.push(vol);
  }
  return uit;
}

function main() {
  const treffers = [];
  let gelezen = 0;

  for (const pad of bestanden(WORTEL)) {
    gelezen += 1;
    for (const { regel, tekst } of markeringenIn(readFileSync(pad, 'utf8').split('\n'))) {
      treffers.push(`${pad.replace(WORTEL, '')}:${regel}  ${tekst}`);
    }
  }

  if (treffers.length === 0) {
    console.log(
      `conflictmarkeringen-controle: geen achtergebleven merge-markeringen in ${gelezen} bestanden.`,
    );
    process.exit(0);
  }

  console.error(`conflictmarkeringen-controle: ${treffers.length} regel(s) met een markering.\n`);
  for (const t of treffers) console.error(`  ${t}`);
  console.error(
    '\nEen merge is halverwege blijven staan. Los het conflict op en haal de\n' +
      'markeringen weg — ze zijn een keer ongezien op `main` beland, zie de kop.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
