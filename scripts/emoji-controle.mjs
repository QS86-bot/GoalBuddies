#!/usr/bin/env node
/**
 * Bewaakt de emoji-afspraak — QS8-111.
 *
 * ⚠️ **De app zelf gebruikt geen emoji in tekst.** Niet in knoppen, statuslabels,
 *    systeemberichten, meldingen of UI-componenten. Ze vertalen slecht, ze
 *    renderen per platform anders, en een schermlezer leest "gezicht met
 *    vreugdetranen" midden in een zin. Vastgelegd in `CLAUDE.md` op 22-08-2026.
 *
 * ⚠️ **Waarom dit een script is en geen zin.** Op 20-08 en 22-08 is met de hand
 *    nagemeten dat er geen emoji in `src/` of `app/` stond. Dat is twee keer
 *    hetzelfde handwerk voor een uitkomst die een script in een seconde geeft —
 *    en de eigen regel uit `CLAUDE.md` is: *schrijf je iets nieuws op, vraag dan
 *    eerst of het een controle kan worden in plaats van een zin.*
 *
 * Drie dingen die bewust **niet** meetellen:
 *
 *   1. **Commentaar.** De ⚠️ is hier huisstijl en staat in honderden koppen.
 *      Het gaat om wat de gebruiker leest, niet om wat de bouwer leest.
 *   2. **Testbestanden.** Die voeden juist 😀 en 👨‍👩‍👧‍👦 aan `telTekens()` en
 *      `kapAf()`; zonder emoji zouden die tests niets bewijzen (QS8-118).
 *   3. **De waarschuwingsdriehoek en pijlen.** Geen pictografische emoji maar
 *      leestekens uit dezelfde huisstijl.
 *
 * Draaien: `npm run emoji:controle`. Hoort mee in `/audit`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORTEL = new URL('..', import.meta.url).pathname;
const MAPPEN = ['src', 'app'];

/**
 * Pictografische emoji. Bewust zonder U+26A0 (⚠) en zonder pijlen: die horen bij
 * de commentaarstijl van dit project en niet bij de afspraak.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}❤✅❌⭐]/u;

function bestanden(map) {
  const gevonden = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (/\.tsx?$/.test(naam)) gevonden.push(vol);
    }
  };
  loop(join(WORTEL, map));
  return gevonden;
}

/** Een commentaarregel of een testbestand telt niet mee — zie de kop. */
function overslaan(pad, regel) {
  if (/\.test\.tsx?$/.test(pad)) return true;
  const kaal = regel.trimStart();
  return kaal.startsWith('*') || kaal.startsWith('//') || kaal.startsWith('/*');
}

const treffers = [];

for (const map of MAPPEN) {
  for (const pad of bestanden(map)) {
    const regels = readFileSync(pad, 'utf8').split('\n');
    regels.forEach((regel, i) => {
      if (overslaan(pad, regel)) return;
      if (EMOJI.test(regel)) {
        treffers.push(`${pad.replace(WORTEL, '')}:${i + 1}  ${regel.trim().slice(0, 80)}`);
      }
    });
  }
}

if (treffers.length === 0) {
  console.log('emoji-controle: geen emoji in app-tekst.');
  process.exit(0);
}

console.error('emoji-controle: er staat emoji in tekst die de gebruiker leest.\n');
for (const t of treffers) console.error(`  - ${t}`);
console.error(
  '\nDe app gebruikt zelf geen emoji in tekst (CLAUDE.md, 22-08-2026). De gebruiker\n' +
    'mag ze overal typen; reacties op een bericht zijn de enige plek waar de app ze\n' +
    'zelf toont. Zie QS8-111.',
);
process.exit(1);
