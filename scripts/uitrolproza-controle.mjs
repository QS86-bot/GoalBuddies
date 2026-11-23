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
 * **1. Een rij noemt een productiestand zonder datum.** Tot QS8-786 was dit
 *    *"een rij noemt een stand die afwijkt"*; sinds dan is een kaal getal zelf
 *    de bevinding — zie het blok hieronder. Rood, zonder nuance.
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
 * ---------------------------------------------------------------------------
 * Een productiestand draagt een datum — QS8-786, besluit Quinten 22-11-2026
 * ---------------------------------------------------------------------------
 *
 * ⚠️⚠️ **Uitslag 1 was een rekening die bij élke uitrol opnieuw kwam.** De
 *    controle vergeleek elk kaal getal met `uitgerold.json`, dus elke uitrol
 *    maakte rood wat de dag ervoor klopte. 📏 Op 22-11-2026 gebeurde dat twee
 *    keer (0336 en 0337, zeven rijen), en elke keer werd per rij het getal
 *    overgetypt — terwijl de meting eronder niet herhaald werd.
 *
 *    **De bewering is nu "stand van <datum>" en geen kaal getal meer.** Een
 *    gedateerde stand is een meting op een moment en blijft waar na een uitrol;
 *    die laat de controle met rust. Een kaal getal is rood — óók als het vandaag
 *    gelijk is aan `uitgerold.json`, want dan is het morgen fout en dan is het
 *    te laat om te vragen wanneer het gemeten is. Wie naar de actuele stand wil
 *    verwijzen, noemt `supabase/uitgerold.json` en geen getal.
 *
 * ⚠️ **De datum hoort ván de bewering te zijn, niet ergens in de rij.** Een
 *    rij draagt in zijn eerste kolom al een datum, en in zijn tekst meestal
 *    tien. Een datum die overal mag staan, maakt elke rij gedateerd. Daarom
 *    moet `stand van DD-MM-JJJJ` direct ná het getal staan (eventueel tussen
 *    haakjes). Uitleg in
 *    `docs/decisions/2026-11-22-een-productiestand-draagt-de-datum-van-zijn-meting.md`.
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
 *
 * ⚠️ **`staat nu op` hoort erbij sinds QS8-786**, en met hem elk bijwoord
 *    (`staat al op`, `staat sinds 24-11 op`) en `productiestand`. 📏 Zes open
 *    rijen schreven *"Productie staat nu op **0294**"* en die zag de controle
 *    niet: de tegenwoordige tijd bij uitstek, onzichtbaar door één bijwoord.
 *    De verleden tijd (`stond op`) blijft er met opzet buiten — zie rij 851.
 */
const STANDCLAIM = /productie(?:stand\b|[^|]{0,24}?\b(?:staat(?: [\w-]+){0,2} op|stand))\s*\**\s*`?(0\d{3})`?\**/gi;

/**
 * De datummarkering, direct na het getal: `(stand van 22-11-2026)`, of na
 * één scheidingsteken (`,` `;` `—` `–` `-`).
 *
 * ⚠️ **Verankerd aan het begin** (`^`): dit wordt getoetst op de tekst die
 *    ná de bewering volgt, en een datum verderop in de rij telt niet.
 */
const MARKERING = /^\s*[(,;—–-]?\s*stand van (\d{2})-(\d{2})-(\d{4})\b/i;

/** Een datum die echt bestaat, als `DD-MM-JJJJ`; anders `null`. */
export function geldigeDatum(dag, maand, jaar) {
  const d = new Date(Date.UTC(Number(jaar), Number(maand) - 1, Number(dag)));
  const klopt =
    d.getUTCFullYear() === Number(jaar) && d.getUTCMonth() === Number(maand) - 1 && d.getUTCDate() === Number(dag);

  return klopt ? `${dag}-${maand}-${jaar}` : null;
}

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

/**
 * Elke plek in deze tekst waar een productiestand beweerd wordt, met de datum
 * van zijn meting als die er direct achter staat (anders `datum: null`).
 */
export function standClaims(tekst) {
  const uit = [];
  for (const m of tekst.matchAll(STANDCLAIM)) {
    const na = tekst.slice(m.index + m[0].length).match(MARKERING);
    const datum = na ? geldigeDatum(na[1], na[2], na[3]) : null;
    uit.push({ citaat: m[0].trim(), nummer: m[1], datum });
  }

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

/**
 * Legt de rijen naast de vastgelegde stand.
 *
 * ⚠️ **Een kaal getal is rood, ook als het gelijk is aan de stand** (QS8-786).
 *    Gelijk is het vandaag; na de volgende uitrol is het een tegenspraak, en
 *    dan weet niemand meer wanneer het gemeten is.
 */
export function beoordeel(rijen, stand) {
  const kaal = [];
  const ingehaald = [];

  for (const rij of rijen) {
    for (const claim of standClaims(rij.tekst)) {
      if (claim.datum === null) kaal.push({ ...rij, ...claim });
    }

    const { wacht, hoogste } = wachtOpUitrol(rij.tekst);
    if (wacht && hoogste !== null && hoogste <= stand) ingehaald.push({ ...rij, hoogste });
  }

  return { kaal, ingehaald };
}

function meldKaal(kaal, stand) {
  console.error(`✗ ${kaal.length} productiestand(en) zonder de datum van hun meting:\n`);
  for (const k of kaal) {
    const verschil = k.nummer === stand ? '' : ` — en ${STANDBESTAND} zegt ${stand}`;
    console.error(`  - r${k.regel}: "${k.citaat}"${verschil}`);
    console.error(`    ${k.titel.slice(0, 84)}`);
  }
  console.error(
    '\n  Schrijf de datum van de meting direct achter het getal:\n' +
      '    productie staat op **0337** (stand van 22-11-2026)\n' +
      `  of verwijs naar ${STANDBESTAND} en noem geen getal. De datum is die van\n` +
      '  de méting, niet van vandaag — tenzij je hem vandaag gemeten hebt.',
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
  const { kaal, ingehaald } = beoordeel(rijen, stand);

  if (kaal.length > 0) meldKaal(kaal, stand);
  if (ingehaald.length > 0) {
    if (kaal.length > 0) console.error('');
    meldIngehaald(ingehaald, stand);
  }
  if (kaal.length + ingehaald.length > 0) return 1;

  console.log(
    `uitrolproza-controle: ${rijen.length} open rij(en) nagelopen; elke productiestand draagt de datum ` +
      `van zijn meting, en geen enkele rij wacht op een uitrol die al geland is (productie: ${stand}).`,
  );

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
