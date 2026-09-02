#!/usr/bin/env node
/**
 * Bewaakt de emoji-afspraak: de site en de mails gebruiken zelf geen emoji.
 *
 * ⚠️ **Wat de regel is.** Niet in knoppen, labels, foutmeldingen, systeemmails
 *    of UI-componenten. Ze renderen per platform anders, ze vertalen slecht, en
 *    een schermlezer leest "gezicht met vreugdetranen" midden in een zin.
 *    Vastgelegd in `CLAUDE.md`.
 *
 * ⚠️ **Wat er níét onder valt.** Content is geen app-tekst: een Instagram-post
 *    of nieuwsbrief mag emoji dragen als Evianne dat wil. Die staat in
 *    `docs/content/` en niet in de mappen hieronder.
 *
 * ⚠️ **Geleerd in GoalBuddies (QS8-111):** twee keer met de hand nagemeten dat
 *    er geen emoji stond, en toen pas de vraag gesteld die eerst had gemoeten —
 *    kan dit een controle zijn in plaats van een zin?
 *
 * Drie dingen die bewust **niet** meetellen:
 *
 *   1. **Commentaar.** De ⚠️ is huisstijl en staat in honderden koppen.
 *   2. **Testbestanden.** Die voeden juist emoji aan tellers en afkappers.
 *   3. **De waarschuwingsdriehoek en pijlen.** Leestekens uit dezelfde huisstijl.
 *
 * Draaien: `npm run emoji:controle`. Draait mee in de poort en in CI.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * Waar de tekst staat die een bezoeker of klant leest.
 *
 * ⚠️ Een map die (nog) niet bestaat, is geen klacht: `web/` komt er pas als Bolt
 *    de eerste export levert, `supabase/functions/` bij de eerste serverfunctie.
 */
export const MAPPEN = ['web/src', 'web/app', 'src', 'app', 'supabase/functions', 'n8n/templates'];

/** Bestanden waar app-tekst in kan staan. */
const VORMEN = /\.(tsx?|jsx?|html|vue|svelte|mjml|txt|md)$/;

/**
 * Pictografische emoji: de emoji-blokken, de vlaggen, de ster (U+2B50) en het
 * blok met dingbats en symbolen (✨ ✅ ❌ ❤). Bewust zonder U+26A0 (⚠) en zonder
 * pijlen: die horen bij de commentaarstijl van dit project en niet bij de
 * afspraak.
 */
export const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2B50}]|(?!\u{26A0})[\u{2600}-\u{27BF}]/u;

/** Een commentaarregel of een testbestand telt niet mee — zie de kop. */
export function overslaan(pad, regel) {
  if (/\.test\.[tj]sx?$/.test(pad)) return true;
  const kaal = regel.trimStart();
  return kaal.startsWith('*') || kaal.startsWith('//') || kaal.startsWith('/*') || kaal.startsWith('<!--');
}

/**
 * De regels met emoji in één bestand.
 *
 * ⚠️ Geëxporteerd en puur, zodat `tests/scripts/emoji-controle.test.ts` élke vorm
 *    los kan aanbieden. Een controle die je niet kunt voeden, kun je niet ijken.
 *
 * @param {string} pad
 * @param {string[]} regels
 * @returns {{ regel: number, tekst: string }[]}
 */
export function treffersIn(pad, regels) {
  const uit = [];
  regels.forEach((regel, i) => {
    if (overslaan(pad, regel)) return;
    if (EMOJI.test(regel)) uit.push({ regel: i + 1, tekst: regel.trim().slice(0, 80) });
  });
  return uit;
}

function bestanden(map) {
  const gevonden = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) {
        if (naam !== 'node_modules') loop(vol);
      } else if (VORMEN.test(naam)) gevonden.push(vol);
    }
  };
  const start = join(WORTEL, map);
  if (existsSync(start)) loop(start);
  return gevonden;
}

function hoofd() {
  const treffers = [];

  for (const map of MAPPEN) {
    for (const pad of bestanden(map)) {
      const regels = readFileSync(pad, 'utf8').split('\n');
      for (const t of treffersIn(pad, regels)) {
        treffers.push(`${pad.replace(WORTEL, '')}:${t.regel}  ${t.tekst}`);
      }
    }
  }

  if (treffers.length === 0) {
    console.log('emoji-controle: geen emoji in app-tekst.');
    return 0;
  }

  console.error('emoji-controle: er staat emoji in tekst die de bezoeker leest.\n');
  for (const t of treffers) console.error(`  - ${t}`);
  console.error(
    '\nDe site en de systeemmails gebruiken zelf geen emoji in tekst (CLAUDE.md).\n' +
      'Content in docs/content/ valt hier buiten; dat is van Evianne.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
