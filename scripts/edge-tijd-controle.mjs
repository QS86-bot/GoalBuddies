#!/usr/bin/env node
/**
 * De twee kopieën van `shared/time` mogen niet uit elkaar lopen.
 *
 * ⚠️ **Waarom deze kopie bestaat.** De rollover en de notificatiejob draaien op
 *    Deno en kunnen niet uit `src/` importeren, dus `supabase/functions/_shared/`
 *    heeft een eigen exemplaar van de tijdmodule. Dat is geen slordigheid maar de
 *    prijs van twee runtimes.
 *
 * ⚠️ **Wat het wél is: precies de vorm die dit project keer op keer duur betaalt.**
 *    Correctheidsregel 7 zegt dat geen enkele week- of tijdberekening buiten
 *    `shared/time` gebeurt, en de reden staat erbij: een streak die om middernacht
 *    verkeerd breekt kost je een gebruiker. Met twee exemplaren geldt die regel
 *    twee keer, en houdt niets ze gelijk.
 *
 *    Repareert iemand een DST-fout in `src/shared/time/zoned.ts`, dan houdt de
 *    Edge-kopie stilletjes het oude gedrag — en de rollover rekent 's nachts met
 *    andere weekgrenzen dan de app. Niets wordt daar rood van.
 *
 * ⚠️ **De Edge-kopie is met opzet een subset**, en dat mag. Hij laat de helpers weg
 *    die `Intl` en de browser nodig hebben (`apparaatTijdzone`, `tijdzones`,
 *    `normaliseerZone`, `isGeldigeTijdzone`). Deze controle eist dus niet dat de
 *    bestanden identiek zijn, maar dat **elke functie die in béide staat er
 *    hetzelfde uitziet**. Weglaten mag; afwijken niet.
 *
 * ⚠️ Geëxporteerd en los te voeden — `tests/scripts/edge-tijd.test.ts` biedt hem
 *    elke vorm aan, want een controle die je niet kunt ijken, kun je niet
 *    vertrouwen.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const APP = 'src/shared/time';
const EDGE = 'supabase/functions/_shared/time';

/**
 * De broncode per geëxporteerde functie, op naam.
 *
 * ⚠️ Haakjes tellen en niet op een lege regel stoppen: een functie met een
 *    blok-commentaar of een lege regel erin zou anders halverwege afgekapt
 *    worden, en dan vergelijkt de controle twee halve functies — die net zo goed
 *    gelijk kunnen zijn terwijl de staart verschilt.
 *
 * @param {string} bron
 * @returns {Map<string, string>}
 */
export function functiesIn(bron) {
  const gevonden = new Map();
  const patroon = /export\s+function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\(/g;

  let match;
  while ((match = patroon.exec(bron)) !== null) {
    const naam = match[1];
    const open = bron.indexOf('{', match.index);
    if (open === -1) continue;

    let diepte = 0;
    let eind = -1;
    for (let i = open; i < bron.length; i += 1) {
      if (bron[i] === '{') diepte += 1;
      if (bron[i] === '}') {
        diepte -= 1;
        if (diepte === 0) {
          eind = i;
          break;
        }
      }
    }
    if (eind === -1) continue;

    gevonden.set(naam, normaliseer(bron.slice(match.index, eind + 1)));
  }

  return gevonden;
}

/**
 * Commentaar en witruimte eruit.
 *
 * ⚠️ Commentaar mag verschillen — de Edge-kopie legt terecht andere dingen uit,
 *    zoals waarom hij `clock.ts` niet via `index.ts` importeert. Wat gelijk moet
 *    zijn is wat er rékent.
 */
export function normaliseer(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((r) => r.replace(/\/\/.*$/, '').trim())
    .filter((r) => r !== '')
    .join('\n');
}

/**
 * Waar de twee kopieën uiteenlopen.
 *
 * ⚠️ **Twee soorten klacht, en de tweede is er op 25-08-2026 bij gekomen na een
 *    gat dat deze controle zelf had.** Hij vergeleek alleen de functies die in
 *    béide bestanden stonden — `if (!inApp.has(naam)) continue` — en meldde
 *    daarna "de twee kopieën rekenen hetzelfde". Een functie die alleen in `src/`
 *    bestond was per definitie niet gedeeld, dus zijn afwezigheid was
 *    onzichtbaar. Bij het bouwen van het web-push-verzendpad bleek de Edge-kopie
 *    van `zoned.ts` vier exports te missen en `clock.ts` de hele `ouderDan()`,
 *    terwijl deze controle groen stond.
 *
 *    Dat is de vorm uit onwrikbare regel 18: hij bewaakte een eigenschap van de
 *    ónderdelen (wat er in beide staat, staat er gelijk in) terwijl de belofte
 *    over het gehéél gaat (de Edge-kant ís de module). En het gevaarlijke geval
 *    is niet een ontbrekende functie — `deno check` valt daarover — maar een
 *    kopie die achterloopt op een gerepareerde weekberekening, met een groene
 *    controle erboven.
 *
 * @returns {{ bestand: string, functie: string, soort: 'anders' | 'ontbreekt' }[]}
 */
export function vergelijk(paren) {
  const klachten = [];

  for (const { bestand, app, edge } of paren) {
    const inApp = functiesIn(app);
    const inEdge = functiesIn(edge);

    for (const [naam, code] of inEdge) {
      if (!inApp.has(naam)) continue;
      if (inApp.get(naam) !== code) klachten.push({ bestand, functie: naam, soort: 'anders' });
    }

    for (const naam of inApp.keys()) {
      if (!inEdge.has(naam)) klachten.push({ bestand, functie: naam, soort: 'ontbreekt' });
    }
  }

  return klachten;
}

function main() {
  const paren = [];

  for (const naam of readdirSync(join(WORTEL, EDGE))) {
    if (!naam.endsWith('.ts')) continue;

    let app;
    try {
      app = readFileSync(join(WORTEL, APP, naam), 'utf8');
    } catch {
      // Een bestand dat alleen aan de Edge-kant bestaat, heeft geen tegenhanger.
      continue;
    }

    paren.push({ bestand: naam, app, edge: readFileSync(join(WORTEL, EDGE, naam), 'utf8') });
  }

  const klachten = vergelijk(paren);
  const gedeeld = paren.reduce((n, p) => {
    const a = functiesIn(p.app);
    return n + [...functiesIn(p.edge).keys()].filter((k) => a.has(k)).length;
  }, 0);

  if (klachten.length === 0) {
    console.log(
      `edge-tijd-controle: ${gedeeld} gedeelde functies in ${paren.length} bestanden, ` +
        'en de twee kopieën van shared/time rekenen hetzelfde.',
    );
    process.exit(0);
  }

  console.error(`edge-tijd-controle: ${klachten.length} functie(s) uit de pas.\n`);
  for (const k of klachten) {
    const wat = k.soort === 'ontbreekt' ? 'staat niet in de Edge-kopie' : 'rekent anders';
    console.error(`  ${k.bestand}: ${k.functie} — ${wat}`);
  }
  console.error(
    '\nDe rollover en de app rekenen hiermee verschillende weekgrenzen uit.\n' +
      'Correctheidsregel 7 geldt twee keer zolang er twee exemplaren zijn.\n' +
      'Draai `npm run edge:sync`; die kopieert de bestanden opnieuw.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
