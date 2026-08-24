#!/usr/bin/env node
/**
 * Elke Laag-bevinding zegt wanneer hij zwaarder wordt — QS8-123.
 *
 * ⚠️ **Waarom dit bestaat.** Op 17-08 stond in `docs/ENGINEER-REVIEW.md` de rij
 *    *"Bewijseis te omzeilen met ontkoppelen"*, bewust als **Laag** weggelegd
 *    omdat het zelfbedrog was en geen autorisatiegrens. Dat oordeel klopte. Vier
 *    dagen later liet migratie 0064 het minpunt afhangen van precies die
 *    handeling, en werd dezelfde bevinding een scoregat — gedicht in 0066.
 *
 *    Het project heeft het één keer wél goed gedaan: de A17-aantekening
 *    (*"herbevestigen vóór EPIC 12"*) werd bij het bouwen van EPIC 12 gelezen en
 *    het besluit ging om. Bij de rij van 17-08 stond er geen aantekening.
 *
 * ⚠️ **Waarom de voorwaarde en niet de datum.** De A17-vorm noemde een
 *    toekomstige feature. Dat kon bij de rij van 17-08 niet: QS8-110/optie C
 *    bestond toen nog niet als plan. Wat je wél altijd kunt opschrijven is
 *    **waaróm hij nu laag is** — welke aanname hem laag houdt. Zodra die aanname
 *    vervalt, is het geen Laag meer.
 *
 *    Vandaar de vaste vorm: `**Wordt zwaarder als:** …` in de derde kolom.
 *
 * Draaien: `npm run review:controle`. Hoort mee in `/audit`.
 */

import { readFileSync } from 'node:fs';

const PAD = new URL('../docs/ENGINEER-REVIEW.md', import.meta.url).pathname;
const MARKERING = 'Wordt zwaarder als:';

const zonder = [];
let laag = 0;

for (const regel of readFileSync(PAD, 'utf8').split('\n')) {
  if (!regel.startsWith('| 2026-')) continue;

  // ⚠️ Van rechts lezen. Een cel kan een `|` bevatten binnen backticks — dat is
  //    niet theoretisch, de rij over de twee voortgangsbalken doet het — en
  //    naïef splitsen op `|` zet dan de verkeerde kolom als risico.
  const laatste = regel.lastIndexOf('|');
  const daarvoor = regel.lastIndexOf('|', laatste - 1);
  if (daarvoor === -1) continue;

  const kop = regel.slice(0, daarvoor);
  const risico = regel.slice(daarvoor + 1, laatste);

  // Alleen open Laag-rijen. Een doorgestreepte rij is afgehandeld en hoeft geen
  // voorwaarde meer.
  if (!/^laag$/i.test(risico.trim())) continue;
  laag += 1;

  if (!kop.includes(MARKERING)) {
    const titel = kop.split('|')[2]?.trim() ?? kop.slice(0, 60);
    zonder.push(titel);
  }
}

if (zonder.length === 0) {
  console.log(`review-controle: alle ${laag} Laag-bevindingen zeggen wanneer ze zwaarder worden.`);
  process.exit(0);
}

console.error('review-controle: er staan Laag-bevindingen zonder herbeoordelingsvoorwaarde.\n');
for (const t of zonder) console.error(`  - ${t}`);
console.error(
  `\nZet er "${MARKERING} …" bij: welke aanname houdt hem laag? Zodra die vervalt,\n` +
    'is het geen Laag meer. Zie QS8-123 en onwrikbare regel 19 in CLAUDE.md.',
);
process.exit(1);
