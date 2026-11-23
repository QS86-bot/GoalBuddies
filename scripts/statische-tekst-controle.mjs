#!/usr/bin/env node
/**
 * Geen Nederlandse tekst in de statische bestanden buiten de catalogus — QS8-797.
 *
 * ⚠️ **Waarom een eigen controle.** `tekst:controle` leest `src/` en `app/` en ziet
 *    daardoor per definitie niet wat in `public/` en `app.json` staat: het
 *    manifest, de service worker en de iOS-toestemming. Die bestanden kunnen maar
 *    één taal dragen en vallen buiten de catalogus; een Nederlandse zin die er
 *    wordt bijgezet, bereikt ook de Engelse gebruiker en niemand werd er rood van.
 *
 * ⚠️ **Wat telt.** Een tekenreeks van twee of meer woorden waarin een Nederlands
 *    functiewoord voorkomt. Commentaar telt niet, sleutels en korte waarden
 *    (bundle-id, kleur, pad) ook niet. Een bestand dat bewust Nederlands is,
 *    staat in `BEWUST_NEDERLANDS`, mét reden.
 *
 * ⚠️ De woordenlijst is smal met opzet: een controle die Engelse zinnen meldt, leer
 *    je te negeren. Een Nederlandse zin zonder één van deze woorden ontsnapt dus;
 *    dat staat hier opgeschreven in plaats van weggelaten.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { zonderCommentaar } from './zonder-commentaar.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Elk tekstbestand in `public/`: een nieuw bestand valt zo vanzelf onder de controle. */
function tekstBestandenInPublic() {
  return readdirSync(`${WORTEL}public`)
    .filter((n) => /\.(json|js|html|txt|xml|webmanifest)$/.test(n))
    .map((n) => `public/${n}`)
    .sort();
}

/** De bestanden die één taal dragen en buiten de catalogus staan. */
export const BESTANDEN = [...tekstBestandenInPublic(), 'app.json'];

/** Bestand → reden. Leeg zolang er geen bewuste keuze voor Nederlands is. */
export const BEWUST_NEDERLANDS = {};

/** Nederlandse functiewoorden die in een Engelse zin niet voorkomen. */
const NEDERLANDS = new Set([
  'de', 'het', 'een', 'je', 'jouw', 'jij', 'voor', 'van', 'zodat', 'kunt', 'kun',
  'niet', 'geen', 'er', 'staat', 'klaar', 'vraagt', 'toegang', 'tot',
  'foto\'s', 'doelen', 'halen', 'samen', 'anderen', 'aan', 'om', 'ook', 'naar',
  'uit', 'bij', 'worden', 'wordt', 'moet', 'mag', 'dit', 'deze', 'maar', 'wel',
]);

/** Tekenreeksen in een JSON- of JS-bron, zonder commentaar. */
function tekenreeksen(bron) {
  const zonderC = zonderCommentaar(bron);
  const uit = [];
  const patroon = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  for (const m of zonderC.matchAll(patroon)) {
    // Geen regelnummer: de gedeelde knip vervangt een commentaarblok door één spatie.
    uit.push({ tekst: m[2] });
  }
  return uit;
}

/** `true` als de tekenreeks een Nederlandse zin is. */
export function isNederlandseZin(tekst) {
  const woorden = tekst.toLowerCase().match(/[a-zà-ÿ']+/g) ?? [];
  if (woorden.length < 2) return false;
  return woorden.some((w) => NEDERLANDS.has(w));
}

/**
 * De Nederlandse zinnen in een bron.
 * @param {string} bron
 * @returns {{ tekst: string }[]}
 */
export function treffersIn(bron) {
  return tekenreeksen(bron).filter((s) => isNederlandseZin(s.tekst));
}

/**
 * Het manifest mag geen taalgebonden velden dragen: één statisch bestand kan
 * maar één taal zijn, en voor élke gebruiker gelijk is dat de verkeerde.
 * @param {string} bron
 * @returns {string[]}
 */
export function manifestVelden(bron) {
  const manifest = JSON.parse(bron);
  return ['description', 'lang'].filter((veld) => veld in manifest);
}

export function hoofd() {
  const fouten = [];
  for (const pad of BESTANDEN) {
    if (pad in BEWUST_NEDERLANDS) continue;
    const bron = readFileSync(`${WORTEL}${pad}`, 'utf8');
    for (const t of treffersIn(bron)) fouten.push(`${pad}  ${t.tekst.slice(0, 80)}`);
    if (pad.endsWith('manifest.json')) {
      for (const veld of manifestVelden(bron)) fouten.push(`${pad}  veld \`${veld}\` is taalgebonden`);
    }
  }

  if (fouten.length === 0) {
    console.log('statische-tekst-controle: geen Nederlandse resten buiten de catalogus.');
    return 0;
  }
  console.error('statische-tekst-controle: Nederlandse tekst buiten de catalogus.\n');
  for (const f of fouten) console.error(`  - ${f}`);
  console.error(
    '\nDeze bestanden dragen één taal voor elke gebruiker. Kies tweetalig, taalneutraal\n' +
      'of bewust Nederlands (BEWUST_NEDERLANDS, met reden). Zie QS8-797.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
