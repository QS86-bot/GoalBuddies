#!/usr/bin/env node
/**
 * logboek-controle — er staat geen persoon in de functielogs (QS8-206).
 *
 * ⚠️ **Waarom dit een controle is en geen opruimbeurt.** De dossierrij van 19-08
 *    zei dat er gebruikers-id's in de logs stonden, en telde er twee, in één
 *    functie. Bij het afwerken waren het er **elf, in twee functies** — en dat
 *    verschil is niet ontstaan doordat iemand slordig was, maar doordat er in de
 *    tussentijd code bij kwam en niets die regel bewaakte. Een tekstuele regel
 *    over logs verliest het van de volgende `console.error` die iemand erbij
 *    zet, want die is nuttig op het moment dat je hem schrijft.
 *
 * ⚠️ **Waarom logs en niet Sentry.** `meld()` stuurt naar Sentry en schoont
 *    onderweg (`scrubMessage()`); `console.error` gaat er rechtstreeks langs, de
 *    functielogs in. Dat is een ánder systeem met een ándere bewaartermijn dan
 *    de database, en `on delete set null` raakt het niet: een verwijderd account
 *    blijft daar staan. Geen domeinregel-7-lek — logs zijn niet groepszichtbaar
 *    — wel persoonsgegevens op een plek waar niemand ze beheert.
 *
 * ⚠️ **De toets kijkt naar wat een persoon aanwijst en niet naar elke `_id`.**
 *    Dat is de stelregel van `persoon-in-jsonb-controle`, en om dezelfde reden:
 *    `goal_id`, `group_id` en `weekly_goal_id` zijn geen personen, en een
 *    controle die op elke `_id` afgaat meldt zoveel dat je hem leert negeren.
 *    Een doel-id in een logregel is bovendien precies wat je nodig hebt om een
 *    mislukte stap terug te vinden.
 *
 * ⚠️ **Hij leest het hele argument en niet de eerste regel.** Drie van de elf
 *    treffers stonden over meerdere regels, en een regex per regel liep daar
 *    langs — dat is hoe deze bevinding op 28-08 op "twee" uitkwam.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen. `tests/scripts/logboek-controle.test.ts`
 *    biedt hem elke vorm los aan — de vormen die hij moet vinden én de vormen
 *    die hij met rust moet laten.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * Uitdrukkingen die een mens aanwijzen.
 *
 * ⚠️ `profiel.id` staat er met naam bij en niet als `\.id`: in deze twee
 *    functies heet de lus-variabele zo, en een kale `.id` zou `weekdoel.id` en
 *    `groep.id` meenemen — geen personen.
 */
export const PERSOONSVORMEN = [
  /\bprofiel\.id\b/,
  /\buser_id\b/,
  /\buserId\b/,
  /\bowner_id\b/,
  /\bsubject_id\b/,
  /\bactor_id\b/,
  /\bapprover_id\b/,
  /\bapproverId\b/,
  /\brequester_id\b/,
  /\.uid\(\)/,
];

/**
 * Elke `console.*`-aanroep in een bestand, compleet — inclusief de argumenten die
 * over meerdere regels lopen.
 *
 * ⚠️ Haakjes tellen en geen regex over het geheel: een sjabloonliteral mag zelf
 *    haakjes bevatten, en een niet-hebzuchtige regex knipt dan op de verkeerde.
 */
export function consoleAanroepen(bron) {
  const uit = [];
  const start = /console\.(?:error|warn|log|info|debug)\s*\(/g;

  let m;
  while ((m = start.exec(bron)) !== null) {
    let diepte = 0;
    let eind = m.end ?? start.lastIndex;
    for (let i = start.lastIndex - 1; i < bron.length; i += 1) {
      if (bron[i] === '(') diepte += 1;
      else if (bron[i] === ')') {
        diepte -= 1;
        if (diepte === 0) {
          eind = i + 1;
          break;
        }
      }
    }
    uit.push({
      regel: bron.slice(0, m.index).split('\n').length,
      tekst: bron.slice(m.index, eind),
    });
  }
  return uit;
}

/** De aanroepen die een persoon in de logs zetten. */
export function beoordeel(bron) {
  return consoleAanroepen(bron)
    .map((aanroep) => {
      const vorm = PERSOONSVORMEN.find((r) => r.test(aanroep.tekst));
      return vorm === undefined ? null : { ...aanroep, vorm: String(vorm) };
    })
    .filter((t) => t !== null);
}

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(map).sort()) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (naam.endsWith('.ts')) uit.push(pad);
  }
  return uit;
}

function hoofd() {
  const klachten = [];

  for (const pad of bestanden(join(WORTEL, 'supabase', 'functions'))) {
    for (const treffer of beoordeel(readFileSync(pad, 'utf8'))) {
      klachten.push(
        `${relative(WORTEL, pad)}:${treffer.regel}  ${treffer.tekst.split('\n')[0].trim()}`,
      );
    }
  }

  if (klachten.length === 0) {
    console.log(
      'logboek-controle: geen enkele console-regel in de Edge Functions draagt een persoon.',
    );
    return 0;
  }

  console.error(`✗ ${klachten.length} logregel(s) zetten een persoon in de functielogs:\n`);
  for (const k of klachten) console.error(`    ${k}`);
  console.error(
    '\nDe functielogs zijn een ander systeem dan de database, met een andere\n' +
      'bewaartermijn, en `on delete set null` raakt ze niet. Haal het id eruit —\n' +
      'de foutmelding zelf is wat je nodig hebt — of stuur de regel via `meld()`,\n' +
      'die schoont onderweg. Een doel- of groeps-id mag blijven staan.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
