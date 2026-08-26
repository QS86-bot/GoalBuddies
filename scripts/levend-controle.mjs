#!/usr/bin/env node
/**
 * levend-controle — een ratel op de hand-geschreven `levend`-vlag.
 *
 * De bevinding van 16-08 zei dat `let levend = true` "negen keer" in `app/`
 * stond; de meting van 25-08 zei "achttien bestanden". Geteld: **32 keer**, in
 * achttien bestanden. Sinds `src/shared/ui/useAsync.ts` bestaat er één plek waar
 * die bewaking staat, met een test die hem élke faalrichting voorhoudt.
 *
 * ⚠️ **Waarom een ratel en geen verbod.** Niet alle 32 zijn dezelfde vorm. Vijf
 *    waren een getrouwe `useAsync`-vervanger en zijn om; de rest niet:
 *
 *      - `groep/chat/[id].tsx` laadt eerst uit de cache en dán van de server —
 *        twee schrijfmomenten in één effect, geen `data`/`loading`/`error`.
 *      - `shared/ui/a11y.ts` en `voorkeuren.ts` combineren een eenmalige lezing
 *        met een abonnement dat óók opgeruimd moet worden.
 *      - Een reeks schermen zet uit één antwoord meerdere stukken state waar de
 *        gebruiker daarna zélf in typt (`beheer/[id].tsx` zet naam, huddledag en
 *        bewijseis als formuliervelden). Die door de hook persen zou de
 *        laadbeurt en het formulier aan elkaar knopen.
 *
 *    Ze allemaal in één vorm dwingen zou de code slechter maken, en een verbod
 *    zou twintig `eslint-disable`-regels opleveren die niemand meer leest. Wat
 *    wél moet: het aantal mag niet omhoog. **Een nieuwe kopie is vanaf nu een
 *    rode build; een bestaande mag blijven tot iemand hem aan de beurt laat
 *    komen.**
 *
 * ⚠️ **Het plafond hoort omláág te gaan.** Migreert er een, verlaag dan
 *    `PLAFOND`. Dat is het hele idee van een ratel: hij kan maar één kant op.
 *    Blijft hij jaren stilstaan, dan is dat zelf de bevinding.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Zoveel hand-geschreven vlaggen staan er nog, en niet meer.
 *
 * ⚠️ Alleen verlagen. Wie dit getal verhoogt om een build groen te krijgen,
 *    heeft de ratel omgedraaid in plaats van gebruikt.
 */
export const PLAFOND = 27;

/** Waar de vlag telt. `useAsync` zelf en zijn test horen er niet bij. */
export const UITGEZONDERD = ['src/shared/ui/useAsync.ts', 'src/shared/ui/useAsync.test.ts'];

export const PATROON = /let\s+levend\s*=\s*true/g;

function bestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bestanden(pad, uit);
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/**
 * Telt de vlaggen per bestand.
 *
 * @param bronnen `[{ pad, inhoud }]` — als parameter zodat deze controle te
 *   voeden is zonder de hele codebase te wijzigen.
 */
export function tel(bronnen) {
  const perBestand = [];
  let totaal = 0;

  for (const { pad, inhoud } of bronnen) {
    if (UITGEZONDERD.includes(pad)) continue;
    const aantal = (inhoud.match(PATROON) ?? []).length;
    if (aantal > 0) {
      perBestand.push({ pad, aantal });
      totaal += aantal;
    }
  }

  return { totaal, perBestand: perBestand.sort((a, b) => b.aantal - a.aantal) };
}

export function beoordeel(bronnen, plafond = PLAFOND) {
  const { totaal, perBestand } = tel(bronnen);
  return { totaal, perBestand, teveel: totaal > plafond, teruim: totaal < plafond };
}

function hoofd() {
  const bronnen = ['app', 'src']
    .flatMap((m) => bestanden(join(WORTEL, m)))
    .map((pad) => ({ pad: relative(WORTEL, pad), inhoud: readFileSync(pad, 'utf8') }));

  const { totaal, perBestand, teveel, teruim } = beoordeel(bronnen);

  if (teveel) {
    console.error(
      `✗ ${totaal} hand-geschreven \`levend\`-vlaggen, en het plafond is ${PLAFOND}.\n`,
    );
    for (const { pad, aantal } of perBestand) console.error(`    ${aantal}×  ${pad}`);
    console.error(
      '\nGebruik `useAsync(fn, deps)` uit `src/shared/ui` in plaats van de vlag met de hand.\n' +
        'Past die hier niet — een cache-dan-server-lading, een abonnement erbij, of\n' +
        'formuliervelden die uit het antwoord geseed worden — zet dan uit waaróm in een\n' +
        'commentaar en verhoog dit plafond alleen na dat gesprek.',
    );
    return 1;
  }

  if (teruim) {
    console.error(
      `✗ Nog maar ${totaal} vlaggen, en het plafond staat op ${PLAFOND}.\n\n` +
        'Dat is goed nieuws en toch rood: een ratel die niet meezakt, houdt ruimte\n' +
        'open voor een kopie die niemand ziet terugkomen. Zet PLAFOND op ' +
        `${totaal} in scripts/levend-controle.mjs.`,
    );
    return 1;
  }

  console.log(
    `levend-controle: ${totaal} hand-geschreven vlaggen, precies het plafond. ` +
      `Nieuwe kopieën gaan niet meer door.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
