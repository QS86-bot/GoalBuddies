#!/usr/bin/env node
/**
 * De uitrolstand in dossierproza naast `supabase/uitgerold.json` — QS8-560.
 *
 * ⚠️⚠️ **Waarom dit bestaat.** Rij 752 van `docs/ENGINEER-REVIEW.md` liet een
 *    vraag open: *is er een signaal dat wél onderscheidt tussen "geland" en
 *    "uitgerold"?* Zijn antwoord was nee — `migratieregister()` op productie is
 *    de enige kandidaat, en die vraagt een sleutel die in de poort en in CI niet
 *    bestaat.
 *
 *    Die conclusie is sinds QS8-517 achterhaald. `supabase/uitgerold.json` legt
 *    de productiestand **sleutelloos in de repo** vast, geschreven door de kant
 *    die de sleutel wél heeft. Twee getallen in dezelfde werkboom laten zich
 *    vergelijken zonder netwerk.
 *
 * ⚠️ **Wat dit níet dubbelt.** `dossierdrift:controle` (QS8-452) vraagt of het
 *    gemeten óbject door een latere migratie herschreven is. Hij heeft de regel
 *    *"de rij noemt een Done issue"* gemeten en afgewezen — 📏 48 van de 55,
 *    87% vals, want een issuenummer is hier een **citaat** en geen structurele
 *    verwijzing. Deze controle leunt op geen enkel issuenummer; hij legt twee
 *    getallen naast elkaar die allebei in de repo staan.
 *
 *    `docs:controle` bewaakt dezelfde vórm — één feit, twee plekken — maar zijn
 *    `DOCUMENTEN` zijn `CLAUDE.md`, `WERKVOORRAAD.md` en `VOLGENDE-SESSIE.md`.
 *    📏 `ENGINEER-REVIEW.md` staat er niet in.
 *
 * ---------------------------------------------------------------------------
 * Twee uitslagen, en ze zeggen iets verschillends
 * ---------------------------------------------------------------------------
 *
 * **1. Een rij noemt een productiestand die afwijkt.** Dat is een platte
 *    tegenspraak: het dossier beweert `0282` terwijl het vastgelegde getal iets
 *    anders zegt. Rood, zonder nuance.
 *
 * **2. Een rij zegt op de uitrol te wachten en alles wat hij noemt is geland.**
 *    Dan is de voorwaarde die hij zelf opschrijft ingetreden. Ook rood — want
 *    dit ís werk — maar de tekst zegt *kijk hier* en nooit *opgelost*.
 *
 * ⚠️⚠️ **Deze controle sluit nooit zelf een rij**, en dat is dezelfde keuze als
 *    bij `dossierdrift:controle`: een aanraking bewijst niet dat de bevinding
 *    vervallen is, hij bewijst dat iemand moet kijken. Een controle die zelf
 *    afsluit, verplaatst het probleem naar een stillere plek.
 *
 * ⚠️ **In de normale toestand is hij stil.** Tussen twee uitrollen loopt de map
 *    vóór en staan die rijen terecht open; dat is geen defect. Een controle die
 *    rood is in de normale toestand, leer je te negeren — zelfde reden als bij
 *    `uitrolstand:controle`, die het gat *noemt* in plaats van het te melden.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DOSSIER = 'docs/ENGINEER-REVIEW.md';
export const STANDBESTAND = 'supabase/uitgerold.json';

/** De risiconiveaus die als "open werk" tellen. Een doorgestreepte rij niet. */
const OPEN_RISICO = new Set(['Kritiek', 'Hoog', 'Middel', '**Kritiek**', '**Hoog**', '**Middel**', '**Laag**', 'Laag']);

/**
 * Een bewering over de productiestand.
 *
 * ⚠️ **Het woord `productie` moet er vlak voor staan**, en dat is geen
 *    slordigheid maar de grens. Een dossierrij noemt voortdurend migratie-
 *    nummers — van de lokale stack, van de map, van de reparatie. Alleen een
 *    nummer dat aan *productie* wordt opgehangen is een bewering over de
 *    uitrolstand; de rest is een verwijzing.
 */
const STANDCLAIM = /productie[^|]{0,24}?\b(?:staat op|stand)\s*\**\s*`?(0\d{3})`?/gi;

/**
 * Zinnen waarmee een rij zegt dat **hijzelf** op de uitrol wacht.
 *
 * ⚠️⚠️ **`terecht openstaat` stond hier eerst bij en is eruit gehaald**, en dat
 *    is met een geval gemeten. 📏 In rij 752 slaat die zin op een *ándere* rij
 *    die daar als voorbeeld besproken wordt, niet op de rij zelf. Hij zou dus
 *    een bevinding opleveren over een bewering die de rij niet doet — precies de
 *    trefzekerheid waarvan dit project weet wat ermee gebeurt (QS8-415): een
 *    controle die je leert overslaan.
 */
const WACHT_OP_UITROL = [
  'nog open tot de uitrol',
  'wordt lichter zodra de uitrol',
  'staan in de map en niet op productie',
  'in de map gedicht, op productie niet',
  'niet uitgerold',
];

/** De vastgelegde productiestand, of `null` als het bestand er niet is. */
export function leesStand(wortel = WORTEL) {
  const ruw = JSON.parse(readFileSync(join(wortel, STANDBESTAND), 'utf8'));
  if (typeof ruw?.hoogste !== 'string') throw new Error(`${STANDBESTAND} mist \`hoogste\``);

  return ruw.hoogste;
}

/** Elke plek in deze tekst waar een productiestand beweerd wordt. */
export function standClaims(tekst) {
  const uit = [];
  for (const m of tekst.matchAll(STANDCLAIM)) uit.push({ citaat: m[0].trim(), nummer: m[1] });

  return uit;
}

/**
 * Zegt deze rij op de uitrol te wachten, en wat is het hoogste migratienummer
 * dat hij noemt?
 *
 * ⚠️ **Het hóógste, en niet elk nummer apart.** Een rij noemt zijn hele
 *    geschiedenis; wat telt is of er nog iets boven de lijn staat. Ligt ook het
 *    hoogste getal op of onder de vastgelegde stand, dan is er niets meer om op
 *    te wachten.
 */
export function wachtOpUitrol(tekst) {
  const laag = tekst.toLowerCase();
  const wacht = WACHT_OP_UITROL.some((zin) => laag.includes(zin));
  if (!wacht) return { wacht: false, hoogste: null };

  const nummers = [...tekst.matchAll(/`?\**(0\d{3})\**`?/g)].map((m) => m[1]).sort();

  return { wacht: true, hoogste: nummers.at(-1) ?? null };
}

/** De open dossierrijen, met hun regelnummer. */
export function openRijen(inhoud) {
  const uit = [];
  inhoud.split(/\r?\n/).forEach((regel, i) => {
    const kolommen = regel.split('|');
    if (kolommen.length < 5) return;

    const risico = kolommen.at(-2).trim();
    if (!OPEN_RISICO.has(risico)) return;

    uit.push({ regel: i + 1, titel: kolommen[2].trim(), tekst: regel });
  });

  return uit;
}

/** Legt de rijen naast de vastgelegde stand. */
export function beoordeel(rijen, stand) {
  const afwijkend = [];
  const ingehaald = [];

  for (const rij of rijen) {
    for (const claim of standClaims(rij.tekst)) {
      if (claim.nummer !== stand) afwijkend.push({ ...rij, ...claim });
    }

    const { wacht, hoogste } = wachtOpUitrol(rij.tekst);
    if (wacht && hoogste !== null && hoogste <= stand) ingehaald.push({ ...rij, hoogste });
  }

  return { afwijkend, ingehaald };
}

function meldAfwijkend(afwijkend, stand) {
  console.error(`✗ ${afwijkend.length} rij(en) noemen een andere productiestand dan ${STANDBESTAND}:\n`);
  for (const a of afwijkend) {
    console.error(`  - r${a.regel}: "${a.citaat}" — vastgelegd is ${stand}`);
    console.error(`    ${a.titel.slice(0, 84)}`);
  }
  console.error(
    `\n  ${STANDBESTAND} is de bron; de proza hoort zich daarnaar te voegen.\n` +
      '  Klopt het getal in de rij wél en het bestand niet, draai dan\n' +
      '  `npm run register:controle` — dat is de kant die het écht meet.',
  );
}

function meldIngehaald(ingehaald, stand) {
  console.error(`✗ ${ingehaald.length} rij(en) wachten op een uitrol die inmiddels geland is:\n`);
  for (const i of ingehaald) {
    console.error(`  - r${i.regel}: hoogste genoemde migratie ${i.hoogste} ≤ productie ${stand}`);
    console.error(`    ${i.titel.slice(0, 84)}`);
  }
  console.error(
    '\n  Dit is "kijk hier" en niet "opgelost": de voorwaarde die de rij zelf\n' +
      '  opschrijft is ingetreden, dus de meting hoort opnieuw. Of de bevinding\n' +
      '  daarmee vervalt, bepaalt de meting en niet deze controle.',
  );
}

export function hoofd(wortel = WORTEL) {
  const stand = leesStand(wortel);
  const rijen = openRijen(readFileSync(join(wortel, DOSSIER), 'utf8'));
  const { afwijkend, ingehaald } = beoordeel(rijen, stand);

  if (afwijkend.length > 0) meldAfwijkend(afwijkend, stand);
  if (ingehaald.length > 0) {
    if (afwijkend.length > 0) console.error('');
    meldIngehaald(ingehaald, stand);
  }
  if (afwijkend.length + ingehaald.length > 0) return 1;

  console.log(
    `uitrolproza-controle: ${rijen.length} open rij(en) nagelopen; geen enkele noemt een andere ` +
      `productiestand dan ${stand}, en geen enkele wacht op een uitrol die al geland is.`,
  );

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
