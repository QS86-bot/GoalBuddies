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
 *
 * ---------------------------------------------------------------------------
 *
 * ⚠️ **Sinds 25-08 toetst dit script een tweede ding, en dat is een geleerde les
 *    van dezelfde dag.** Twee rijen die als **Hoog** open stonden, bleken al
 *    maanden gerepareerd — `is_group_member` had zijn `status`-toets, en
 *    `weekly_goals_select` schermde `excused` al af sinds 0047. De beschrijving
 *    zei het, de risicokolom niet.
 *
 *    Dat kost meer dan een rommelig document: **een lijst waarvan een deel al
 *    opgelost is, kost de lezer het vertrouwen in de rest.** De engineer die dit
 *    in november doorneemt, kan niet zien welke rijen nog echt iets betekenen.
 *
 * ⚠️ En een derde vorm: twee rijen droegen als risico letterlijk het woord
 *    `Gedicht`. Dat is geen open niveau en geen doorgestreepte afhandeling, dus
 *    het glipte langs élk filter — ook langs de mijne, tot ik ze met de hand
 *    tegenkwam. Daarom staat er nu ook een woordenlijst op de kolom.
 *
 * ⚠️ **De valkuil bij die eerste toets is de rij die zegt "gedicht" over iets
 *    ánders.** De rij van 17-08 over het ontkoppelen is bewust niet gerepareerd,
 *    maar noemt wel "Gedicht in 0066" — dat gaat over de escalatie, niet over de
 *    bevinding zelf. Daarom telt een expliciete open-markering zwaarder dan een
 *    reparatiemelding. `tests/scripts/review-controle.test.ts` voedt beide vormen.
 *
 * Draaien: `npm run review:controle`. Hoort mee in `/audit`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PAD = fileURLToPath(new URL('../docs/ENGINEER-REVIEW.md', import.meta.url));
const MARKERING = 'Wordt zwaarder als:';

/** De niveaus die "hier moet nog iets gebeuren" betekenen. */
const OPEN_NIVEAUS = ['laag', 'middel', 'hoog', 'kritiek'];

/**
 * Zegt de beschrijving zelf dat het opgelost is?
 *
 * ⚠️ Een expliciete open-markering wint van een reparatiemelding. Een rij mag
 *    best "gedicht in 0066" bevatten terwijl hij zelf openstaat — dat gaat dan
 *    over de escalatie en niet over de bevinding. Zie de rij van 17-08.
 */
function meldtReparatie(romp) {
  const open =
    /bewust niet gerepareerd|niet gerepareerd|nog niet gerepareerd|\*\*nog open|niet gedaan/i;
  if (open.test(romp)) return false;

  // ⚠️ **Alleen een ✅ of "gedicht in NNNN" telt, en `opgelost` juist níét.**
  //    Dat woord stond er eerst bij en leverde vier valse meldingen op één
  //    document: "gedeeltelijk opgelost", "kan opgelost worden door", "nog niet
  //    opgelost". Een controle die alles meldt, leer je te negeren — dus is de
  //    toets nu een markering die iemand bewust zet, geen woord dat toevallig
  //    langskomt.
  return /✅/.test(romp) || /\bgedicht in \d{4}\b/i.test(romp);
}

/**
 * Zegt de beschrijving dat dit géén openstaand werk (meer) is?
 *
 * ⚠️ **Dit is een ándere klasse dan `meldtReparatie()` en dat is de hele reden
 *    dat hij bestaat.** Die vraagt of er iets gerepareerd is. Dit vraagt of de
 *    rij zichzelf uit de agenda schrijft zónder reparatie: historische context,
 *    of een afweging die ooit bewust zo gemaakt is. Twee rijen deden dat op
 *    27-08-2026 terwijl ze **Middel** droegen — "blijft staan als context, niet
 *    als openstaand werk" (migratie op remote) en "geen bevinding maar een
 *    afweging die je opnieuw kunt maken" (systeemberichten zonder titels).
 *
 * ⚠️ **Waarom dat ertoe doet:** de rijen boven Laag zíjn de agenda voor de
 *    review in november. Staat daar iets tussen dat zelf zegt niet te hoeven,
 *    dan kost dat de lezer tijd bij precies het document dat zijn tijd moet
 *    besparen — dezelfde reden die bij `stale` staat.
 *
 * ⚠️ De zinnen staan er voluit in en niet als losse woorden. "Afweging" en
 *    "context" komen in dit document tientallen keren voor in een gewone zin;
 *    een controle die daarop aanslaat, leer je te negeren. Geijkt in
 *    `tests/scripts/review-controle.test.ts`, met de vormen die hij moet vinden
 *    én de vormen die hij met rust moet laten.
 */
function schrijftZichUitDeAgenda(romp) {
  return (
    /niet als openstaand werk/i.test(romp) ||
    /geen (openstaand werk|bevinding maar)/i.test(romp)
  );
}

/** Is dit risiconiveau als afgehandeld gemarkeerd? */
function isAfgehandeld(risico) {
  return risico.includes('~~');
}

/**
 * De bevindingen in een reviewdocument.
 *
 * @param {string[]} regels
 * @returns {{ soort: string, titel: string, risico: string }[]}
 */
export function controleer(regels) {
  const klachten = [];
  const gezien = new Set();

  for (const regel of regels) {
    if (!regel.startsWith('| 2026-')) continue;

    // ⚠️ Van rechts lezen. Een cel kan een `|` bevatten binnen backticks — dat is
    //    niet theoretisch, de rij over de twee voortgangsbalken doet het — en
    //    naïef splitsen op `|` zet dan de verkeerde kolom als risico.
    const laatste = regel.lastIndexOf('|');
    const daarvoor = regel.lastIndexOf('|', laatste - 1);
    if (daarvoor === -1) continue;

    const kop = regel.slice(0, daarvoor);
    const risico = regel.slice(daarvoor + 1, laatste).trim();
    const titel = kop.split('|')[2]?.trim() ?? kop.slice(0, 60);

    // 1 — het niveau moet een bekend woord zijn.
    const kaal = risico.replace(/[*~]/g, '').split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!OPEN_NIVEAUS.includes(kaal)) {
      klachten.push({ soort: 'onbekend-niveau', titel, risico });
      continue;
    }

    // 2 — zegt de beschrijving dat het klaar is, dan hoort de kolom dat ook te
    //     zeggen. Anders leest een gesloten bevinding als openstaand werk.
    if (!isAfgehandeld(risico) && meldtReparatie(kop)) {
      klachten.push({ soort: 'stale', titel, risico });
      continue;
    }

    // 3 — een rij die zegt geen openstaand werk te zijn, hoort niet op de
    //     agenda te blijven staan.
    if (!isAfgehandeld(risico) && schrijftZichUitDeAgenda(kop)) {
      klachten.push({ soort: 'geen-agendapunt', titel, risico });
      continue;
    }

    // 4 — elke open Laag-rij zegt wanneer hij zwaarder wordt.
    if (kaal === 'laag' && !isAfgehandeld(risico) && !kop.includes(MARKERING)) {
      klachten.push({ soort: 'geen-voorwaarde', titel, risico });
      continue;
    }

    // 5 — dezelfde bevinding hoort er één keer in te staan.
    //
    // ⚠️ **Dit stond er op 28-08 drie keer in, twee keer.** Een slecht opgelost
    //    merge-conflict liet twee rijen elk in drievoud achter, en de drie
    //    kopieën verschilden alleen in het migratienummer dat ze noemden — dus
    //    twee van de drie logen over waar de reparatie staat. Het is meegegaan
    //    door een merge, een PR en een CI-run.
    //
    // ⚠️ De sleutel is datum + titel en niet de hele rij. Juist omdat de kopieën
    //    van elkaar verschillen, zou een vergelijking op de volledige tekst er
    //    geen enkele vinden — en dat is precies het geval dat hier is gebeurd.
    const sleutel = `${regel.slice(0, regel.indexOf('|', 2))}|${titel}`;
    if (gezien.has(sleutel)) {
      klachten.push({ soort: 'dubbele-rij', titel, risico });
      continue;
    }
    gezien.add(sleutel);
  }

  return klachten;
}

const UITLEG = {
  'onbekend-niveau':
    'Het risico is geen bekend niveau. Gebruik Laag, Middel, Hoog of Kritiek —\n' +
    '  en zet er `~~` omheen zodra het afgehandeld is. Een eigen woord als\n' +
    '  "Gedicht" glipt langs elk filter, ook langs dit script.',
  stale:
    'De beschrijving zegt dat het opgelost is, de risicokolom niet. Streep het\n' +
    '  niveau door (`~~Hoog~~ opgelost`). Een lijst waarvan een deel al klaar is,\n' +
    '  kost de lezer het vertrouwen in de rest.',
  'geen-agendapunt':
    'De beschrijving zegt dat dit geen openstaand werk is, de risicokolom houdt\n' +
    '  hem op de agenda. Streep het niveau door met de reden erachter\n' +
    '  (`~~Middel~~ context`, `~~Middel~~ afweging`). De rijen boven Laag zijn de\n' +
    '  agenda voor november; wat daar staat en niet hoeft, kost de lezer tijd.',
  'dubbele-rij':
    'Deze bevinding staat er meer dan een keer in. Dat komt van een merge die\n' +
    '  halverwege is blijven staan; de kopieen verschillen dan net genoeg om\n' +
    '  elkaar tegen te spreken. Houd de rij met de juiste feiten en haal de rest weg.',
  'geen-voorwaarde':
    `Zet er "${MARKERING} …" bij: welke aanname houdt hem laag? Zodra die\n` +
    '  vervalt, is het geen Laag meer. Zie QS8-123 en onwrikbare regel 19.',
};

function main() {
  const regels = readFileSync(PAD, 'utf8').split('\n');
  const klachten = controleer(regels);
  const laag = regels.filter(
    (r) => r.startsWith('| 2026-') && /\|\s*laag\s*\|\s*$/i.test(r),
  ).length;

  if (klachten.length === 0) {
    console.log(
      `review-controle: ${laag} open Laag-bevindingen zeggen wanneer ze zwaarder ` +
        'worden, en geen enkele rij meldt een reparatie of schrijft zichzelf uit ' +
        'de agenda terwijl de risicokolom hem open houdt.',
    );
    process.exit(0);
  }

  console.error(`review-controle: ${klachten.length} bevinding(en).\n`);

  for (const soort of ['onbekend-niveau', 'stale', 'geen-agendapunt', 'geen-voorwaarde']) {
    const groep = klachten.filter((k) => k.soort === soort);
    if (groep.length === 0) continue;

    console.error(`  ${soort}:`);
    for (const k of groep) console.error(`    - [${k.risico}] ${k.titel}`);
    console.error(`  ${UITLEG[soort]}\n`);
  }

  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
