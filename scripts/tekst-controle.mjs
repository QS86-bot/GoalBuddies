#!/usr/bin/env node
/**
 * Geen Nederlandse UI-tekst meer hard in de code — QS8-115, criterium 1.
 *
 * ⚠️ **Waarom een controle en niet een test per scherm.** De belofte van dit
 *    issue is niet "dit scherm is vertaald" maar "er staat nergens meer tekst
 *    hard in de code". Dat is een eigenschap van het gehéél, en precies het
 *    soort belofte dat volgens regel 18 in `CLAUDE.md` een eigen slot verdient:
 *    per bestand testen laat de naad onbewaakt, en de naad is waar de volgende
 *    hardgecodeerde zin binnenkomt.
 *
 * ⚠️ **Hij is rood zolang QS8-115 loopt, en dat is de bedoeling.** Elke map die
 *    omgezet wordt, haalt er treffers af. Pas als hij groen is, hoort hij in
 *    `/audit` — een controle die je aanzet terwijl hij rood staat, leert je om
 *    rood te negeren.
 *
 * ## Wat als tekst telt
 *
 * Een letterlijke string met **twee of meer woorden achter elkaar** in
 * JSX-tekst of in een prop die de gebruiker leest. Eén woord telt niet mee: dat
 * is vaker een sleutel, een testid of een stijlwaarde dan een zin.
 *
 * Niet meegeteld:
 *
 *   * commentaar — het gaat om wat de gebruiker leest, niet de bouwer;
 *   * testbestanden — die zetten met opzet vaste teksten neer;
 *   * `src/shared/i18n/` — dat ís de catalogus;
 *   * alles wat door `t(...)` heen gaat.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORTEL = new URL('..', import.meta.url).pathname;
const MAPPEN = ['src', 'app'];

/** Props waarvan de waarde op het scherm belandt. */
const TEKSTPROPS = [
  'title',
  'label',
  'placeholder',
  'eyebrow',
  'melding',
  'hint',
  'uitleg',
  'bevestig',
  'annuleer',
  'accessibilityLabel',
  'accessibilityHint',
];

/** Twee woorden achter elkaar, met minstens één kleine letter — dus een zin. */
const ZIN = /[A-Za-zÀ-ÿ]{2,}[ ,][a-zà-ÿ]{2,}/;

const OVERSLAAN = [
  /\/shared\/i18n\//,
  /\.test\.tsx?$/,
  /\/database\.types\.ts$/,
];

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

/**
 * Loopt door een bestand en zegt per regel of hij commentaar is.
 *
 * ⚠️ **Blokcommentaar bijhouden is geen finesse maar de helft van het werk.**
 *    Een `{/* ... *\/}` in JSX loopt over meerdere regels, en die vervolgregels
 *    beginnen niet met `*`. Zonder deze toestand meldde de controle in zijn
 *    eerste versie zes uitleggende alinea's als hardgecodeerde tekst — en een
 *    controle die zes valse meldingen geeft, leert je om hem te negeren.
 */
function commentaarregels(regels) {
  const uit = new Array(regels.length).fill(false);
  let inBlok = false;

  regels.forEach((regel, i) => {
    const kaal = regel.trim();

    if (inBlok) {
      uit[i] = true;
      if (kaal.includes('*/')) inBlok = false;
      return;
    }

    if (kaal.startsWith('//')) {
      uit[i] = true;
      return;
    }

    const opent = kaal.indexOf('/*');
    if (opent !== -1 && !kaal.includes('*/', opent)) {
      uit[i] = true;
      inBlok = true;
      return;
    }

    uit[i] = kaal.startsWith('*') || kaal.startsWith('/*');
  });

  return uit;
}

/** De stukken van een regel die tekst zouden kunnen zijn. */
function kandidaten(regel) {
  const uit = [];

  // 1. Een prop met een letterlijke string: title="..." of title={'...'}
  for (const prop of TEKSTPROPS) {
    const m = new RegExp(`\\b${prop}=(?:\\{)?['"\`]([^'"\`]{4,})['"\`]`).exec(regel);
    if (m?.[1]) uit.push({ tekst: m[1], losseWoordenTellen: false });
  }

  // 2. Kale JSX-tekst: een regel die met een hoofdletter begint en niet met een
  //    haakje, accolade of punt-komma eindigt.
  //
  // ⚠️ **Hier geldt de tweewoordeneis niet, en dat is een correctie op de eerste
  //    versie.** Die miste "Terug", "Goedkeuren" en "Versturen" — losse woorden
  //    op een knop, en juist die moeten vertaald worden. Bij een prop is één
  //    woord vaker een sleutel of een stijlwaarde dan een zin, dus daar blijft de
  //    eis staan; kale tekst tussen JSX-tags is per definitie voor de lezer.
  //
  //    Gevonden door de controle één keer naast een handmatige telling te
  //    leggen. Een nieuw meetinstrument dat je niet ijkt, meet wat het toevallig
  //    ziet.
  const kaal = regel.trim();
  //    ⚠️ Geen haakjes: `AccessibilityInfo.isReduceMotionEnabled()` begint óók
  //    met een hoofdletter en staat óók alleen op een regel. Drie van die
  //    coderegels waren de eerste valse meldingen van deze variant. JSX-tekst mét
  //    een haakje bestaat, maar die wordt door de propregel hierboven gedekt.
  if (
    /^[A-ZÀ-Ý][^<>{}=()]*$/.test(kaal) &&
    !kaal.endsWith(';') &&
    !kaal.endsWith(',') &&
    !kaal.endsWith('.tsx')
  ) {
    return [...uit, { tekst: kaal, losseWoordenTellen: true }];
  }

  return uit;
}

const treffers = [];

for (const map of MAPPEN) {
  for (const pad of bestanden(map)) {
    if (OVERSLAAN.some((r) => r.test(pad))) continue;

    const regels = readFileSync(pad, 'utf8').split('\n');
    const commentaar = commentaarregels(regels);

    regels.forEach((regel, i) => {
        if (commentaar[i]) return;
        if (/\bt\(/.test(regel)) return;

        for (const { tekst, losseWoordenTellen } of kandidaten(regel)) {
          if (!losseWoordenTellen && !ZIN.test(tekst)) continue;
          if (losseWoordenTellen && !/[A-Za-zÀ-ÿ]{3,}/.test(tekst)) continue;
          treffers.push(`${pad.replace(WORTEL, '')}:${i + 1}  ${tekst.slice(0, 70)}`);
          return;
        }
    });
  }
}

if (treffers.length === 0) {
  console.log('tekst-controle: geen hardgecodeerde UI-tekst meer in src/ en app/.');
  process.exit(0);
}

/** Per map, want QS8-115 wordt map voor map afgewerkt. */
const perMap = new Map();
for (const t of treffers) {
  const map = t.slice(0, t.lastIndexOf('/'));
  perMap.set(map, [...(perMap.get(map) ?? []), t]);
}

console.error(`tekst-controle: ${treffers.length} regels hardgecodeerde UI-tekst.\n`);
for (const [map, regels] of [...perMap].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${map}  (${regels.length})`);
  if (process.argv.includes('--alles')) for (const r of regels) console.error(`      ${r}`);
}
console.error('\nZie QS8-115. Draai met --alles voor de regels zelf.');
process.exit(1);
