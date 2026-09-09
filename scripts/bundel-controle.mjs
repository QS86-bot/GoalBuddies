#!/usr/bin/env node
/**
 * bundel-controle — of `in_bundel` in `NAGEKEKEN` nog klopt tegen een échte
 * bouw. QS8-382.
 *
 * ⚠️ **Waarom dit een eigen controle is en geen regel in `audit-controle`.**
 *    Elke regel in dat register draagt twee velden die samen één meting
 *    vastleggen: `marker` is de stringliteraal waarop in `dist/` gegrept is, en
 *    `in_bundel` is de uitkomst. `audit:controle` toetst `ernst`, `advisories`
 *    en `reparatie` tegen `npm audit` — en die drie worden dus rood zodra ze
 *    verlopen. `in_bundel` en `marker` werden alleen gelézen.
 *
 *    Gevolg: zet iemand er `true` neer waar `false` hoort, dan wordt er niets
 *    rood. En erger — verhuist een pakket van bouwtooling naar clientcode door
 *    een Expo-upgrade, dan blijft de regel groen staan met een meting van
 *    maanden geleden. De drie velden die wél getoetst worden vangen dat niet:
 *    een pakket kan in de bundel belanden zonder dat zijn advisory of ernst
 *    verandert.
 *
 *    `in_bundel` is precies het veld dat de **weging** draagt. De vier
 *    `false`-regels zijn alleen daarom laag ingeschaald. Dat is de vorm waar
 *    `CLAUDE.md` bij regel 18 voor waarschuwt: elk onderdeel klopt — de grep is
 *    goed gedaan, de marker goed gekozen — en het geheel bewaakt de eigenschap
 *    niet.
 *
 * ⚠️⚠️ **En daarom staat hij náást `audit:controle` en niet erín.** De poort
 *    noemt een controle *ongemeten* zodra het woord `OVERGESLAGEN` in zijn
 *    uitvoer staat — zie `beoordeel()` in `poort.mjs`. Deze controle heeft een
 *    `dist/` nodig en CI bouwt niet, dus hij slaat zich daar over. Zou hij in
 *    `audit-controle` zitten, dan sleept die overslag de **npm-uitslag mee de
 *    ongemeten-hoek in**, en dat is een controle die vandaag wél iets meet.
 *    Eén controle, één belofte.
 *
 * ⚠️ **Zonder `dist/` meet hij niets, en dat zegt hij.** Geen bouw afdwingen:
 *    `expo export` kost minuten, en een controle die dat elke keer eist wordt
 *    uitgezet. Zonder bundel gaat er een `OVERGESLAGEN` naar stderr en is de
 *    exitcode 0 — de poort telt hem dan als ongemeten, niet als groen.
 *
 * ⚠️⚠️ **De grep controleert zichzélf, en dat is de helft van de waarde.** Vier
 *    van de vijf markers hóren nul treffers te geven. Een kapotte zoekfunctie
 *    geeft óók nul, en meldt dan opgewekt dat het register klopt — precies de
 *    faalvorm die deze controle zou moeten uitsluiten. 📏 Bij QS8-375 is dat met
 *    de hand gedaan door dezelfde grep los te laten op strings die er zéker in
 *    staan; dat hoort in het script te zitten en niet in het hoofd van wie hem
 *    draait.
 *
 *    Vandaar `KANARIES`: twee die gevonden móeten worden en één die juist niet
 *    gevonden mag worden. Die laatste vangt de andere kant op — een zoekfunctie
 *    die alles vindt, meldt élke regel als afwijking en is net zo waardeloos.
 *
 * IJKING — met de hand gedraaid op 09-09-2026 tegen een verse bouw, mutatie per
 * grendel, en elke keer eerst met een grep bevestigd dat de mutatie er écht in
 * stond vóór de uitslag geloofd werd:
 *
 *   A  `js-yaml` op `in_bundel: true` zetten (hij zit er niet in)
 *      → rood: *"staat in NAGEKEKEN als in_bundel: true, maar zijn marker
 *        'maxTotalMergeKeys' geeft 0 treffer(s)"*
 *   B  `decode-uri-component` op `in_bundel: false` zetten (hij zit er wél in)
 *      → rood, de andere kant op, met 1 treffer in de melding
 *   C  een marker leegmaken
 *      → rood: *"heeft geen marker, dus zijn in_bundel is niet te meten"*
 *   D  `telTreffers()` altijd `0` laten geven
 *      → rood op **de kanaries**, niet op de vijf markers — en dat is het hele
 *        punt: vier van de vijf horen nul te geven, dus zonder kanaries had deze
 *        mutatie gemeld dat het register klopt
 *   E  `telTreffers()` alles laten vinden
 *      → rood op de negatieve kanarie
 *
 * ⚠️ **D en E zijn de reden dat dit script bestaat in de vorm die het heeft.**
 *    De vijf markers alleen toetsen is een controle die bij elke storing
 *    "klopt" zegt. Ze staan ook los onder test in
 *    `tests/scripts/bundel-controle.test.ts`, want een controle die je niet
 *    kunt voeden, kun je niet ijken.
 *
 * Gebruik:
 *   npm run build          # of: npx expo export --platform web
 *   npm run bundel:controle
 */

import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { NAGEKEKEN } from './audit-controle.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const BUNDEL = join(WORTEL, 'dist');

/**
 * De zelftoets van de zoekfunctie.
 *
 * ⚠️ **`verwacht` is het hele punt.** Twee strings die in élke geslaagde
 *    webbouw staan, en één die er onmogelijk in kan staan. 📏 Gemeten op de
 *    bouw van 09-09-2026: `Minified React error` 1 bestand, `__esModule` 1,
 *    en de onzinstring 0.
 *
 * ⚠️ Geen app-eigen tekst zoals een schermtitel: die verhuist met de eerste de
 *    beste copywijziging, en dan is de kanarie rood zonder dat er iets stuk is.
 *    Deze twee horen bij de bundelaar en bij React zelf.
 */
export const KANARIES = [
  { naald: 'Minified React error', verwacht: true },
  { naald: '__esModule', verwacht: true },
  { naald: 'zzz-deze-string-staat-nergens-qs8382', verwacht: false },
];

/**
 * Alle bestanden uit de bundel, als buffers.
 *
 * ⚠️ **Buffers en geen tekst.** `dist/` bevat ook lettertypen en afbeeldingen;
 *    die als UTF-8 inlezen vervangt bytes door `U+FFFD` en kan een marker
 *    kapotmaken die net over zo'n grens valt. `Buffer.includes` zoekt op bytes
 *    en heeft dat probleem niet — en het is hetzelfde wat `grep -r` doet.
 */
export function leesBundel(map = BUNDEL) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else uit.push({ pad: vol, inhoud: readFileSync(vol) });
    }
  };
  loop(map);
  return uit;
}

/**
 * In hoeveel bestanden `naald` letterlijk voorkomt.
 *
 * @param {ReadonlyArray<{pad: string, inhoud: Buffer}>} bestanden
 * @param {string} naald
 */
export function telTreffers(bestanden, naald) {
  const buf = Buffer.from(naald, 'utf8');
  return bestanden.filter((b) => b.inhoud.includes(buf)).length;
}

/**
 * De kanaries langs de zoekfunctie.
 *
 * @param {(naald: string) => number} zoek een functie `naald -> aantal bestanden`
 * @param {ReadonlyArray<{naald: string, verwacht: boolean}>} kanaries
 * @returns de kanaries die zich niet gedroegen zoals afgesproken
 */
export function kanariesDieFalen(zoek, kanaries = KANARIES) {
  return kanaries
    .map((k) => ({ ...k, gevonden: zoek(k.naald) > 0 }))
    .filter((k) => k.gevonden !== k.verwacht);
}

/**
 * Eén regel uit het register, voor zover deze controle hem nodig heeft.
 *
 * ⚠️ **Met opzet smaller dan `NAGEKEKEN`.** Zonder deze typedef leidt
 *    TypeScript het parametertype af uit de standaardwaarde, en dan is het de
 *    létterlijke vorm van het huidige register — inclusief de vijf pakketnamen.
 *    Een test kan er dan geen eigen regel in voeden, en dat is precies wat
 *    `CLAUDE.md` bij regel 18 eist: een controle die je niet kunt voeden, kun je
 *    niet ijken.
 *
 * @typedef {{ in_bundel: boolean, marker?: string }} Bundelregel
 */

/**
 * De regels waarvan `in_bundel` niet strookt met de bundel.
 *
 * ⚠️ Een regel zónder `marker` wordt overgeslagen en apart gemeld: zonder
 *    marker is er niets te meten, en stil doorlopen zou hem voor altijd
 *    onzichtbaar maken.
 *
 * @param {(naald: string) => number} zoek
 * @param {Record<string, Bundelregel>} register
 */
export function afwijkendeRegels(zoek, register = NAGEKEKEN) {
  const afwijkend = [];
  const zonderMarker = [];

  for (const [naam, regel] of Object.entries(register)) {
    if (typeof regel.marker !== 'string' || regel.marker === '') {
      zonderMarker.push(naam);
      continue;
    }
    const treffers = zoek(regel.marker);
    const werkelijk = treffers > 0;
    if (werkelijk !== regel.in_bundel) {
      afwijkend.push({ naam, marker: regel.marker, verwacht: regel.in_bundel, treffers });
    }
  }

  return { afwijkend, zonderMarker };
}

function bundelBestaat(map = BUNDEL) {
  try {
    return statSync(map).isDirectory() && readdirSync(map).length > 0;
  } catch {
    return false;
  }
}

/**
 * De melding als er niets te meten valt.
 *
 * ⚠️ Losgetrokken uit `hoofd()` om dezelfde reden als `meldUitslag()` in
 *    `poort.mjs`: deze functie beantwoordt één vraag — *wat zeg je tegen de
 *    lezer* — en `hoofd()` de andere: *wat meet je*. Ze veranderen ook om
 *    verschillende redenen.
 */
function meldOverslag() {
  console.error(
    '⚠ bundel-controle: OVERGESLAGEN — er is geen `dist/` om in te zoeken.\n' +
      '  Deze controle vergelijkt `in_bundel` uit NAGEKEKEN met een échte bouw, en\n' +
      '  dwingt die bouw niet af: `expo export` kost minuten en een controle die dat\n' +
      '  elke keer eist, wordt uitgezet. Draai `npm run build` met dummy-`EXPO_PUBLIC_*`\n' +
      '  waarden en daarna deze controle opnieuw.\n' +
      '  Dat is geen groene uitslag maar een ongemeten.',
  );
}

/** De melding als de zoekfunctie zelf niet deugt. */
function meldKanaries(stukke) {
  for (const k of stukke) {
    console.error(
      `✗ kanarie '${k.naald}' werd ${k.gevonden ? 'wél' : 'niet'} gevonden, ` +
        `en dat hoort ${k.verwacht ? 'wél' : 'niet'}.`,
    );
  }
  console.error(
    '\nDe zoekfunctie meet niet wat ze belooft, dus de uitslag over NAGEKEKEN\n' +
      'zegt niets. Een grep die overal nul geeft, meldt opgewekt dat het register\n' +
      'klopt — dat is precies waarom deze kanaries er staan.\n' +
      'Is de bundel wel compleet? Een halve `dist/` uit een afgebroken bouw geeft\n' +
      'dit beeld ook.',
  );
}

/** De melding als het register niet strookt met de bundel. */
function meldAfwijkingen(afwijkend, zonderMarker) {
  for (const a of afwijkend) {
    console.error(
      `✗ '${a.naam}' staat in NAGEKEKEN als in_bundel: ${a.verwacht}, maar zijn marker ` +
        `'${a.marker}' geeft ${a.treffers} treffer(s) in dist/.`,
    );
  }
  for (const naam of zonderMarker) {
    console.error(`✗ '${naam}' heeft geen marker, dus zijn in_bundel is niet te meten.`);
  }
  console.error(
    '\n⚠️ Een afwijking hier is geen reden om `in_bundel` even om te zetten.\n' +
      'Het veld draagt de wéging van de bevinding: een pakket dat de clientbundel\n' +
      'in komt, raakt gebruikers en niet alleen de bouwmachine. Zoek eerst uit\n' +
      'langs welke afhankelijkheid het binnenkomt (`npm ls <pakket>`), en of dat\n' +
      'terug te draaien is. Pas daarna het register bij, mét een reden.\n' +
      '\n⚠️ En kijk of de marker zelf nog deugt: een identifier wordt geminificeerd\n' +
      'en een pakketnaam staat er nooit in, dus die twee geven altijd nul. Alleen\n' +
      'een stringliteraal uit het pakket meet iets.',
  );
}

export function hoofd(lees = leesBundel, bestaat = bundelBestaat) {
  if (!bestaat()) {
    meldOverslag();
    return 0;
  }

  const bestanden = lees();
  const zoek = (naald) => telTreffers(bestanden, naald);

  // ⚠️ De kanaries eerst. Klopt de zoekfunctie niet, dan zegt élke uitspraak
  //    hieronder niets — en "nul treffers" leest dan als "het register klopt".
  const stukkeKanaries = kanariesDieFalen(zoek);
  if (stukkeKanaries.length > 0) {
    meldKanaries(stukkeKanaries);
    return 1;
  }

  const { afwijkend, zonderMarker } = afwijkendeRegels(zoek);
  if (afwijkend.length > 0 || zonderMarker.length > 0) {
    meldAfwijkingen(afwijkend, zonderMarker);
    return 1;
  }

  const inBundel = Object.values(NAGEKEKEN).filter((r) => r.in_bundel).length;
  console.log(
    `bundel-controle: ${Object.keys(NAGEKEKEN).length} markers nagemeten tegen ` +
      `${bestanden.length} bestanden in dist/ — ${inBundel} zit er in de bundel, ` +
      'precies zoals NAGEKEKEN zegt.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
