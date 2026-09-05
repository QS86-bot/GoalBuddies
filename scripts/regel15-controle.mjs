#!/usr/bin/env node
/**
 * regel15-controle — een ratel op de functies die boven de vijftig regels zitten.
 *
 * ⚠️ **Waarom deze controle bestaat, en waarom ESLint hem niet in zijn eentje
 *    kan doen** (QS8-190). `CLAUDE.md` coderegel 15 eist *functies <50 regels,
 *    nesting <3 diep*. De nesting is sinds deze ronde een gewone lintregel
 *    (`max-depth`) en daarmee klaar. De vijftig kan dat niet overal zijn:
 *
 *    📏 Gemeten op 05-09-2026, zonder testbestanden: **66 functies in `app/`
 *    boven de vijftig regels**, en negen in `src/shared/ui`. De langste is
 *    `GroepBeheer` op **523**.
 *
 *    Een lintregel op 50 zou dus 75 keer rood staan, en een lintregel op 523
 *    staat nooit rood. Allebei leer je negeren, en dat is precies de toestand
 *    die deze bevinding beschrijft: *"de regel bestaat alleen op papier, en dat
 *    is het slechtste van beide werelden."*
 *
 * ⚠️ **Wat er dan wél bindt: het áántal, en dat mag alleen dalen.** Zelfde vorm
 *    als `levend-controle` (QS8-219): rood als het erboven komt, én rood als het
 *    eronder zakt zonder dat het plafond meezakt. Een ratel die niet meezakt,
 *    houdt ruimte open voor een kopie die niemand ziet terugkomen.
 *
 * ⚠️ **Waarom een component anders geteld wordt dan een functie.** Het lichaam
 *    van een React-component is grotendeels JSX — één `return` met opmaak erin.
 *    Zestig regels opmaak zijn niet het probleem waar regel 15 voor bestaat;
 *    vertakking is dat wel, en dáár gaat `max-depth` over. Vandaar dat de
 *    logicalaag (`src/` buiten `shared/ui`) de vijftig gewoon als lintregel
 *    krijgt en de schermlaag deze ratel.
 *
 * ⚠️ **De meting komt uit ESLint zelf en niet uit een eigen teller.** Wie hier
 *    regels zou gaan tellen met een reguliere expressie, krijgt een tweede
 *    opvatting van "wat is een functie" naast die van de lintregel — en twee
 *    lijsten die hetzelfde horen te zeggen, lopen uiteen (0032/0034).
 *
 * Gebruik:
 *   npm run regel15:controle
 */

import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ESLint } from 'eslint';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De grens uit coderegel 15. */
export const GRENS = 50;

/**
 * Het plafond per laag: hoeveel functies er vandaag bóven de grens zitten.
 *
 * ⚠️ **Deze getallen horen omláág.** Splits je een scherm, verlaag ze dan — de
 *    controle wordt anders rood, en dat is het hele idee van een ratel.
 *
 * ⚠️ Het type staat er met zoveel woorden bij: zonder die annotatie leidt `tsc`
 *    uit `Object.freeze({ 'app/': 66 })` het lítérale type `66` af, en dan is
 *    elke test die een eigen plafond meegeeft rood op iets dat niets met de
 *    regel te maken heeft.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const PLAFOND = Object.freeze({
  'app/': 66,
  'src/shared/ui/': 9,
});

/** De lagen die deze ratel telt, in de volgorde waarin ze gemeld worden. */
export const LAGEN = Object.freeze(Object.keys(PLAFOND));

/** Bij welke laag hoort dit pad? `null` = telt niet mee. */
export function laagVan(pad) {
  const schoon = (pad ?? '').replace(/\\/g, '/');
  if (/\.test\.tsx?$/.test(schoon)) return null;
  // ⚠️ Langste eerst: `src/shared/ui/` zit ín `src/`, en wie op de eerste
  //    treffer stopt zonder te sorteren, telt hem bij de verkeerde laag.
  return [...LAGEN].sort((a, b) => b.length - a.length).find((l) => schoon.startsWith(l)) ?? null;
}

/**
 * Telt de overtredingen per laag.
 *
 * @param vondsten `[{ pad, regels }]` — als parameter, zodat deze controle te
 *   voeden is zonder de hele codebase te wijzigen (CLAUDE.md bij regel 18).
 */
export function tel(vondsten) {
  const perLaag = Object.fromEntries(LAGEN.map((l) => [l, 0]));
  const buiten = [];

  for (const { pad, regels } of vondsten ?? []) {
    if (regels <= GRENS) continue;
    const laag = laagVan(pad);
    if (laag === null) buiten.push(pad);
    else perLaag[laag] += 1;
  }

  return { perLaag, buiten };
}

/** Rood als een laag erboven komt, én rood als hij eronder zakt. */
export function beoordeel(vondsten, plafond = PLAFOND) {
  const { perLaag, buiten } = tel(vondsten);

  const teveel = LAGEN.filter((l) => perLaag[l] > (plafond[l] ?? 0));
  const teruim = LAGEN.filter((l) => perLaag[l] < (plafond[l] ?? 0));

  return { perLaag, buiten, teveel, teruim, ok: teveel.length === 0 && teruim.length === 0 };
}

/** Elke functie boven de grens, gemeten door ESLint zelf. */
async function meet() {
  const linter = new ESLint({
    cwd: WORTEL,
    overrideConfigFile: join(WORTEL, 'eslint.config.js'),
    overrideConfig: {
      files: ['app/**/*.tsx', 'app/**/*.ts', 'src/**/*.ts', 'src/**/*.tsx'],
      rules: {
        'max-lines-per-function': ['error', { max: GRENS, skipBlankLines: true, skipComments: true }],
      },
    },
  });

  const uitslagen = await linter.lintFiles(['app', 'src']);
  const vondsten = [];

  for (const uitslag of uitslagen) {
    const pad = uitslag.filePath.replace(WORTEL, '').replace(/\\/g, '/');
    for (const bericht of uitslag.messages) {
      if (bericht.ruleId !== 'max-lines-per-function') continue;
      const m = /has too many lines \((\d+)\)/.exec(bericht.message ?? '');
      if (m !== null) vondsten.push({ pad, regels: Number(m[1]), regel: bericht.line });
    }
  }

  return vondsten;
}

async function hoofd() {
  const vondsten = await meet();
  const { perLaag, teveel, teruim, ok } = beoordeel(vondsten);

  if (teveel.length > 0) {
    console.error('✗ Er zitten meer functies boven de vijftig regels dan het plafond toestaat.\n');
    for (const laag of teveel) {
      console.error(`    ${laag}  ${perLaag[laag]} boven de grens, plafond ${PLAFOND[laag]}`);
      for (const v of vondsten.filter((v) => laagVan(v.pad) === laag).sort((a, b) => b.regels - a.regels).slice(0, 5)) {
        console.error(`      ${String(v.regels).padStart(4)} regels  ${v.pad}:${v.regel}`);
      }
    }
    console.error(
      '\nSplits de functie, of — als dit er echt een is die niet kleiner kan — zet uit\n' +
        'waaróm in een commentaar en verhoog het plafond pas na dat gesprek.',
    );
    return 1;
  }

  if (teruim.length > 0) {
    console.error('✗ Een laag zakte onder zijn plafond, en dat is goed nieuws en toch rood.\n');
    for (const laag of teruim) {
      console.error(`    ${laag}  nog ${perLaag[laag]} boven de grens, plafond staat op ${PLAFOND[laag]}`);
    }
    console.error(
      '\nEen ratel die niet meezakt, houdt ruimte open voor een functie die niemand ziet\n' +
        'terugkomen. Zet PLAFOND bij in scripts/regel15-controle.mjs.',
    );
    return 1;
  }

  console.log(
    'regel15-controle: ' +
      LAGEN.map((l) => `${l} ${perLaag[l]}`).join(', ') +
      ` — precies het plafond. ${ok ? 'Nieuwe lange functies gaan niet meer door.' : ''}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().then((code) => process.exit(code));
}
