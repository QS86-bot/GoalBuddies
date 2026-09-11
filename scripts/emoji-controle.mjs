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
 * ⚠️⚠️ **Tot 11-09-2026 was de vraag "welke tekens" een handgeschreven lijst
 *    ranges, en die miste de helft van wat deze kop belooft** (QS8-420, gevonden
 *    in de weekaudit). Er stond:
 *
 *      /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}❤✅❌⭐]/u
 *
 *    📏 Gemeten door die regex los te draaien: `✨ ❗ ⏰ ✔ ☑ ☀ ⌛ ▶` kwamen er
 *    allemaal doorheen, en — het scherpste geval — **`🆕` (U+1F195) en `🅰`
 *    (U+1F170)** ook, want het bereik begint pas bij U+1F300. Dat `✅ ❌ ⭐ ❤`
 *    er met de hand bij stonden, is het bewijs dat de schrijver wist dat het
 *    blok ontbrak en er vier tekens uit geplukt heeft.
 *
 * ⚠️ **De reparatie is een Unicode-eigenschap en geen langere lijst.**
 *    `\p{Extended_Pictographic}` ís de vraag die deze kop stelt — "is dit een
 *    pictografische emoji" — en hij veroudert niet bij de volgende
 *    Unicode-versie. 📏 Nagemeten tegen élk teken boven U+2000 dat vandaag in
 *    `src/` en `app/` staat: hij vindt alle twintig emoji, en laat élk
 *    huisstijlteken met rust — `→ ← ─ ≥ − ⌈ ⌉ ‖ — … ’ “` zijn geen van alle
 *    pictografisch. Er is precies **één** uitzondering nodig, en dat is de ⚠
 *    zelf (U+26A0, 3215 keer in deze repo).
 *
 * ⚠️ **Twee dingen die de eigenschap níet dekt en die daarom apart staan.**
 *    De vlagletters (U+1F1E6–1F1FF) zijn `Regional_Indicator` en geen
 *    `Extended_Pictographic`; 📏 gemeten: `🇳🇱` komt er zonder dat bereik
 *    gewoon doorheen. En de vier vormen uit `src/shared/ui/risico.ts`
 *    (`● ◐ ◑ ▲`, Geometric Shapes) zijn géén emoji en blijven dus toegestaan —
 *    dat is een meting en geen omissie. Of een schermlezer die vier net zo
 *    hardop leest als een emoji, is een productvraag; hij staat als rij in
 *    `docs/ENGINEER-REVIEW.md` en niet als stille verbreding hier.
 *
 * Draaien: `npm run emoji:controle`. Hoort mee in `/audit`.
 * Geijkt in `tests/scripts/emoji-controle.test.ts`, twee grendels apart.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAPPEN = ['src', 'app'];

/**
 * De tekens die pictografisch zijn maar bij de huisstijl horen.
 *
 * ⚠️ Houd deze lijst kort en noem per teken de reden. Elke toevoeging is een
 *    stukje van de afspraak dat de controle niet meer bewaakt.
 */
const HUISSTIJL = new Set([
  '⚠', // ⚠ — de waarschuwingsdriehoek uit elke kop in dit project
]);

/**
 * Een verse regex per aanroep.
 *
 * ⚠️ **Geen gedeelde `/g`-constante.** `lastIndex` is statefull tussen
 *    aanroepen en slaat dan willekeurig een regel over — dezelfde val die
 *    `elke-soort-passeert-de-poort.test.ts` heeft gekost.
 */
const pictografisch = () => /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/gu;

/** De emoji in één regel, zonder de huisstijltekens. Leeg is goed. */
export function zoekEmoji(regel) {
  return [...regel.matchAll(pictografisch())]
    .map((t) => t[0])
    .filter((teken) => !HUISSTIJL.has(teken));
}

/**
 * Telt deze regel mee? Een commentaarregel en een testbestand niet — zie de kop.
 *
 * ⚠️ **Alleen een regel die met commentaar begínt**, en dat is een bewuste
 *    grens. Een knip op een `//` verderop in de regel eet alles op ná de `//`
 *    van een URL — precies de fout die QS8-412 gekost heeft. De prijs is dat
 *    `const t = 'Start'; // 🎉` wél gemeld wordt; dat is een valse melding de
 *    goede kant op, en hij is nog nooit voorgekomen.
 */
export function teltMee(pad, regel) {
  if (/\.test\.tsx?$/.test(pad)) return false;
  const kaal = regel.trimStart();
  return !(kaal.startsWith('*') || kaal.startsWith('//') || kaal.startsWith('/*'));
}

/**
 * De treffers in een lijst bronnen. Los te voeden, zodat de controle te ijken is.
 *
 * @param {readonly {pad: string, bron: string}[]} bronnen
 */
export function treffersIn(bronnen) {
  const gevonden = [];
  for (const { pad, bron } of bronnen) {
    bron.split('\n').forEach((regel, i) => {
      if (!teltMee(pad, regel)) return;
      const tekens = zoekEmoji(regel);
      if (tekens.length > 0) gevonden.push({ pad, regel: i + 1, tekens, tekst: regel.trim() });
    });
  }
  return gevonden;
}

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

export function hoofd() {
  const bronnen = MAPPEN.flatMap((map) =>
    bestanden(map).map((pad) => ({
      pad: pad.replace(WORTEL, ''),
      bron: readFileSync(pad, 'utf8'),
    })),
  );

  const treffers = treffersIn(bronnen);

  if (treffers.length === 0) {
    console.log('emoji-controle: geen emoji in app-tekst.');
    return 0;
  }

  console.error('emoji-controle: er staat emoji in tekst die de gebruiker leest.\n');
  for (const t of treffers) {
    console.error(`  - ${t.pad}:${t.regel}  ${t.tekens.join(' ')}  ${t.tekst.slice(0, 70)}`);
  }
  console.error(
    '\nDe app gebruikt zelf geen emoji in tekst (CLAUDE.md, 22-08-2026). De gebruiker\n' +
      'mag ze overal typen; reacties op een bericht zijn de enige plek waar de app ze\n' +
      'zelf toont. Zie QS8-111.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
