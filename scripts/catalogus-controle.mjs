#!/usr/bin/env node
/**
 * catalogus-controle — een tekst in de catalogus die niemand ooit toont.
 *
 * ⚠️ **Waarom dit bestaat, met het geval erbij.** Op 01-09-2026 bleek bij
 *    QS8-245 dat `auth.fout.uitloggen` ("Uitloggen lukte niet. Probeer het
 *    opnieuw.") in beide catalogi stond, op inhoud getest was, netjes door
 *    `signOut()` werd opgebouwd — en door geen enkel scherm werd getoond, want
 *    de aanroeper deed `void signOut()`. Elk schakeltje af, de keten nergens
 *    verbonden.
 *
 *    Dat is onwrikbare regel 18 vraag 5, en het is de variant zónder kapot
 *    onderdeel: er is niets rood te maken, dus geen enkele test kan het zien.
 *    Eerder gebeurde precies dit bij QS8-112, QS8-113 en QS8-106.
 *
 * ⚠️ **Wat dit níét is: een grep op de sleutelnaam.** Dat is de eerste versie die
 *    iedereen schrijft, en hij meldt hier **122 van de 1221 sleutels** — want de
 *    helft van deze catalogus wordt samengesteld:
 *
 *      t(`systeembericht.${invoer.system_event}` as Sleutel)
 *      t(`commitment.${type}.${status}.titel` as Sleutel)
 *      bouw('bevestiging.weekdoel_afsluiten')   →   t(`${sleutel}.titel`)
 *
 *    Een controle die honderd correcte gevallen meldt, leer je uitzetten. Deze
 *    kent daarom drie soorten aanroepers, en houdt er zes over.
 *
 * ⚠️ **De derde soort is de lastigste en het meest de moeite waard.** Bij
 *    `t(`${sleutel}.titel`)` staat de kóp van de sleutel niet in de aanroep maar
 *    ergens anders in de bron, als losse string. Het gat mag daar dus punten
 *    bevatten — en dat is geen blanco cheque, want de gevonden kop moet wél
 *    letterlijk in de bron staan.
 *
 * Draaien: `npm run catalogus:controle`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const CATALOGUS = join(WORTEL, 'src', 'shared', 'i18n', 'nl.ts');
const DOORZOEKEN = ['src', 'app', 'supabase/functions'];

/**
 * Sleutels die vandaag geen aanroeper hebben en dat mogen — mét de reden.
 *
 * ⚠️ **Een lijst met redenen en geen lijst met namen**, zelfde vorm als
 *    `MOET_EEN_SCHERM_HEBBEN` in `tests/beloftes/bereikbaar.test.ts` en
 *    `BEWUST_ONGESCHREVEN` in `dode-keten-controle.mjs`. Wie hier iets aan
 *    toevoegt zonder op te schrijven wát er ontbreekt en wanneer het weg mag,
 *    heeft een naam geparkeerd in plaats van een gat vastgelegd.
 *
 * ⚠️ **En een uitzondering die niet meer nodig is, is zelf een bevinding.** Deze
 *    controle wordt óók rood als een sleutel hier staat terwijl hij inmiddels
 *    een aanroeper heeft, of helemaal niet meer bestaat. Anders rot de lijst en
 *    dekt hij op een dag iets af wat niemand meer bedoeld heeft.
 */
export const NOG_NIET_AANGESLOTEN = {
  'beheer.melding_gearchiveerd':
    'Geschreven bij migratie 0092 (25-08). Een groep archiveren geeft nog geen ' +
    'bevestigingsmelding op het scherm. Weg zodra het beheerscherm hem toont.',
  'avatar.bezig':
    'Geschreven bij QS8-27 (28-08). De upload toont een `busy`-knop en geen tekst. ' +
    'Weg zodra de uploadkaart een eigen status krijgt, of de sleutel verdwijnt.',
  'goedkeuringsregel.nog_een':
    'De copy voor QS8-174 — de eigenaar ziet niet hoeveel bevestigingen zijn ' +
    'week nog nodig heeft. De tekst was er eerder dan de feature. Weg bij QS8-174.',
  'goedkeuringsregel.nog_meer':
    'Tweede helft van dezelfde melding. Zie QS8-174.',
  'weekdoelform.coach':
    'Geschreven bij QS8-41 (27-08) voor een knop "laat de coach weekstappen ' +
    'bedenken" die in het weekdoelformulier niet gebouwd is. Weg zodra die knop ' +
    'er is, of de sleutel verdwijnt.',
  'ritme.onder_de_vloer':
    'Kwam op 01-09 mee met QS8-253 (migratie 0140) van een parallelle sessie. ' +
    'Dat werk is nog in beweging — niet weghalen zonder QS8-253 na te lopen.',
};

/**
 * Elke sleutel in de catalogus, in de volgorde waarin hij staat.
 *
 * @param {string | undefined} bron
 * @returns {string[]}
 */
export function sleutelsUit(bron) {
  return [...String(bron ?? '').matchAll(/^\s*'([a-z0-9_.]+)':/gm)].map((m) => m[1] ?? '');
}

/**
 * Elke string in de bron die eruitziet als een sleutel of als een sleutelkop.
 *
 * ⚠️ Bewust ook koppen zonder punt erin: `bouw('bevestiging.weekdoel_afsluiten')`
 *    is de aanroeper van drie sleutels die geen van drieën letterlijk in de code
 *    staan.
 */
export function letterlijkeStrings(bron) {
  return new Set(
    [...String(bron ?? '').matchAll(/['"`]([a-z0-9_.]+)['"`]/g)].map((m) => m[1] ?? ''),
  );
}

/**
 * De vormen van elke `t(`…`)`-aanroep, als de vaste stukken rond elk gat.
 *
 * `t(`commitment.${a}.${b}.titel`)` geeft `['commitment.', '.', '.titel']`.
 *
 * ⚠️ **Een lijst en geen string met een sentinel erin.** De eerste versie plakte
 *    de delen aan elkaar met een onzichtbaar teken; de test die daarop viel
 *    toonde een diff waarin verwacht en gekregen er identiek uitzagen. Een
 *    controle waarvan de faalmelding niets zegt, kost een lezer meer tijd dan
 *    hij bespaart — en het stuurteken maakte het bronbestand nog binair ook.
 *
 * ⚠️ Alleen `t(`…`)` en niet elke backtick-string: een willekeurige template
 *    ergens in de code is geen sleutelaanroep, en meetellen maakt de controle
 *    ruimer dan hij mag zijn.
 */
export function sjabloonvormen(bron) {
  const uit = [];
  const gezien = new Set();

  for (const m of String(bron ?? '').matchAll(/\bt\(`([^`]*)`/g)) {
    if (!m[1].includes('${')) continue;
    const delen = m[1].split(/\$\{[^}]*\}/);
    const sleutel = JSON.stringify(delen);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(delen);
  }
  return uit;
}

/**
 * Of een sleutel ergens vandaan getoond kan worden, en langs welke route.
 *
 * Geeft `'letterlijk'`, `'samengesteld'`, `'prefix'` of `null`.
 *
 * ⚠️ **Een gat middenin is één segment, een gat aan het begin niet.** Bij
 *    `commitment.${type}.${status}.titel` staat op de plek van het gat precies
 *    één segment, dus `[a-z0-9_]+` — zou daar een punt mogen, dan dekt die ene
 *    vorm ook `commitment.a.b.c.d.titel` af en wordt de controle te ruim.
 *
 *    Bij `${sleutel}.titel` is het gat juist een hele sleutelkop en mág hij
 *    punten bevatten. Dat is geen blanco cheque: de kop die daaruit volgt moet
 *    zélf letterlijk in de bron staan, anders telt de vorm niet mee. Zonder die
 *    eis zou één zo'n aanroep élke sleutel op `.titel` levend verklaren.
 */
export function routeVan(sleutel, { letterlijk, vormen }) {
  if (letterlijk.has(sleutel)) return 'letterlijk';

  for (const delen of vormen) {
    const kopGat = delen[0] === '' ? '[a-z0-9_.]+' : '[a-z0-9_]+';
    const ontsnap = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patroon = delen
      .map(ontsnap)
      .reduce((acc, deel, i) => acc + (i === 1 ? kopGat : '[a-z0-9_]+') + deel);

    if (!new RegExp(`^${patroon}$`).test(sleutel)) continue;
    if (delen[0] !== '') return 'samengesteld';

    const staart = delen.slice(1).join('');
    const kop = sleutel.slice(0, sleutel.length - staart.length);
    if (letterlijk.has(kop)) return 'prefix';
  }
  return null;
}

/**
 * Het oordeel: welke sleutels niemand kan tonen, en welke uitzonderingen rotten.
 *
 * @param {{sleutels: string[], bron: string, uitzonderingen?: Record<string,string>}} invoer
 */
export function beoordeelCatalogus({ sleutels, bron, uitzonderingen = {} }) {
  const letterlijk = letterlijkeStrings(bron);
  const vormen = sjabloonvormen(bron);

  const dood = sleutels.filter((k) => routeVan(k, { letterlijk, vormen }) === null);
  const gedekt = new Set(Object.keys(uitzonderingen));

  return {
    /** Dood én niet op de lijst: dit is de bevinding. */
    onverwacht: dood.filter((k) => !gedekt.has(k)),
    /** Op de lijst maar inmiddels wél aangesloten — de uitzondering mag weg. */
    overbodig: [...gedekt].filter((k) => sleutels.includes(k) && !dood.includes(k)),
    /** Op de lijst maar de sleutel bestaat niet meer. */
    verdwenen: [...gedekt].filter((k) => !sleutels.includes(k)),
    aantalSleutels: sleutels.length,
    aantalDood: dood.length,
  };
}

function bestanden(map, exts) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, exts));
    else if (exts.some((e) => naam.endsWith(e))) uit.push(pad);
  }
  return uit;
}

/** De bron waarin een aanroeper kan staan — de catalogi zelf tellen niet mee. */
export function projectbron(wortel = WORTEL) {
  const paden = DOORZOEKEN.flatMap((d) => {
    try {
      return bestanden(join(wortel, d), ['.ts', '.tsx']);
    } catch {
      return [];
    }
  }).filter((p) => !p.includes(`${'i18n'}`));

  return paden.map((p) => readFileSync(p, 'utf8')).join('\n');
}

function hoofd() {
  const sleutels = sleutelsUit(readFileSync(CATALOGUS, 'utf8'));
  const uitkomst = beoordeelCatalogus({
    sleutels,
    bron: projectbron(),
    uitzonderingen: NOG_NIET_AANGESLOTEN,
  });

  let rood = false;

  if (uitkomst.onverwacht.length > 0) {
    rood = true;
    process.stdout.write(
      `✗ ${uitkomst.onverwacht.length} tekst(en) staan in de catalogus en worden nergens getoond:\n`,
    );
    for (const k of uitkomst.onverwacht) process.stdout.write(`    ${k}\n`);
    process.stdout.write(
      '\n  Sluit hem aan, haal hem weg, of zet hem met een réden in\n' +
        '  NOG_NIET_AANGESLOTEN in scripts/catalogus-controle.mjs.\n\n',
    );
  }

  for (const k of uitkomst.overbodig) {
    rood = true;
    process.stdout.write(`✗ ${k} staat als uitzondering maar heeft inmiddels een aanroeper.\n`);
  }
  for (const k of uitkomst.verdwenen) {
    rood = true;
    process.stdout.write(`✗ ${k} staat als uitzondering maar bestaat niet meer.\n`);
  }

  if (rood) process.exit(1);

  process.stdout.write(
    `catalogus-controle: ${uitkomst.aantalSleutels} sleutels, ` +
      `${uitkomst.aantalDood} zonder aanroeper en die staan alle ${uitkomst.aantalDood} ` +
      `met een reden op de lijst.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd();
}
