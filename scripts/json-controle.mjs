#!/usr/bin/env node
/**
 * json-controle — een sleutel die twee keer in een JSON-bestand staat.
 *
 * ⚠️ **Waarom dit bestaat.** De bevinding van 22-08-2026 ging over een
 *    hulpscript dat twee keer liep en een catalogusblok dubbel in `nl.ts` zette.
 *    De rij noteerde daarbij "nu is TypeScript het vangnet, en dat is toeval".
 *    Nagemeten op 28-08 klopt die zin niet: `tsc` (TS1117) én ESLint
 *    (`no-dupe-keys`) worden allebei rood op elke dubbele sleutel in elk
 *    object-literal, en dat is structureel en geen toeval. Wat wél toeval was,
 *    is de testsuite: met een dubbele sleutel die dezelfde parameters draagt
 *    blijven alle 1088 tests groen.
 *
 * ⚠️ **De rij noemde het echte gat wel, maar zocht het op de verkeerde plek.**
 *    ESLint leest alleen `**\/*.ts` en `**\/*.tsx` (zie `eslint.config.mjs`) en
 *    `tsc` leest helemaal geen JSON. En `JSON.parse` houdt bij een dubbele
 *    sleutel stilzwijgend de láátste — er is geen fout, geen waarschuwing, geen
 *    spoor. Voor de zes JSON-bestanden in deze repo bestond dus geen enkel
 *    vangnet.
 *
 * ⚠️ **En de controle die het manifest bewaakt, erfde die blindheid.**
 *    `pwa-controle.mjs` regel 139 leest `public/manifest.json` met `JSON.parse`.
 *    Staat `start_url` er twee keer, dan beoordeelt hij de tweede en meldt hij
 *    niets over de eerste — precies de vorm uit onwrikbare regel 18: elk
 *    onderdeel klopt en de keten lekt.
 *
 * ⚠️ **Waarom een eigen scanner en niet een pakket.** Een dependency erbij is
 *    hier duurder dan zestig regels: dit is een taal met zeven tokens, de
 *    scanner staat onder test, en `CLAUDE.md` vraagt een dependency te
 *    verantwoorden. Deze zou niets doen wat hieronder niet staat.
 *
 * ⚠️ **En hij moet JSONC lezen, wat `JSON.parse` niet kan.** `tsconfig.json` en
 *    `supabase/functions/deno.json` bevatten commentaar — TypeScript en Deno
 *    lezen ze zo. Een controle die daarop struikelt, zou twee van de zes
 *    bestanden overslaan en dat zijn precies de twee die niemand anders leest.
 *    Commentaar overslaan hoort daarom in de scanner en niet in een voorwas:
 *    `//` binnen een string is geen commentaar, en alleen wie de strings al
 *    kent, ziet dat verschil.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WITRUIMTE = ' \n\r\t';
const LEESTEKENS = '{}[]:,';

/**
 * Hakt JSON in tokens. Genoeg om structuur te zien, niet om waarden te kennen.
 *
 * ⚠️ Getallen, `true`, `false` en `null` worden één soort: `waarde`. Wat erin
 *    staat doet er niet toe — deze controle telt sleutels, hij leest geen data.
 */
function* tekens(tekst) {
  let i = 0;

  while (i < tekst.length) {
    const c = tekst[i];

    if (WITRUIMTE.includes(c)) {
      i += 1;
      continue;
    }

    if (c === '/' && tekst[i + 1] === '/') {
      while (i < tekst.length && tekst[i] !== '\n') i += 1;
      continue;
    }

    if (c === '/' && tekst[i + 1] === '*') {
      const eind = tekst.indexOf('*/', i + 2);
      i = eind === -1 ? tekst.length : eind + 2;
      continue;
    }

    if (c === '"') {
      // ⚠️ Escapes overslaan als paar, anders eindigt de string bij een `\"`.
      let j = i + 1;
      let ruw = '';
      while (j < tekst.length && tekst[j] !== '"') {
        if (tekst[j] === '\\') {
          ruw += tekst[j] + tekst[j + 1];
          j += 2;
          continue;
        }
        ruw += tekst[j];
        j += 1;
      }
      yield { soort: 'string', waarde: JSON.parse(`"${ruw}"`) };
      i = j + 1;
      continue;
    }

    if (LEESTEKENS.includes(c)) {
      yield { soort: c };
      i += 1;
      continue;
    }

    let j = i;
    while (j < tekst.length && !WITRUIMTE.includes(tekst[j]) && !LEESTEKENS.includes(tekst[j])) {
      j += 1;
    }
    yield { soort: 'waarde' };
    i = j;
  }
}

/**
 * De sleutels die binnen hetzelfde object twee keer voorkomen, met hun pad.
 *
 * Geeft een lege lijst als er niets dubbel staat. Kent geen geldigheidstoets:
 * dat doet `JSON.parse` in `hoofd()`, en die is er beter in.
 *
 * ⚠️ **Per object en niet per bestand.** Dezelfde naam in twee verschillende
 *    objecten is doodgewoon — `"version"` staat in `package.json` op vier
 *    plekken. Alleen twee keer dezelfde naam in hetzelfde object is de fout.
 */
export function dubbeleSleutels(tekst) {
  const treffers = [];
  const houders = []; // '{' of '['
  const gezien = []; // een Set per object, `null` per array
  const pad = [];

  let verwachtSleutel = false;
  let laatsteSleutel = null;

  for (const t of tekens(tekst)) {
    if (t.soort === '{' || t.soort === '[') {
      houders.push(t.soort);
      gezien.push(t.soort === '{' ? new Set() : null);
      pad.push(laatsteSleutel);
      verwachtSleutel = t.soort === '{';
      laatsteSleutel = null;
      continue;
    }

    if (t.soort === '}' || t.soort === ']') {
      houders.pop();
      gezien.pop();
      pad.pop();
      verwachtSleutel = false;
      continue;
    }

    if (t.soort === ',') {
      verwachtSleutel = houders[houders.length - 1] === '{';
      continue;
    }

    if (t.soort === ':') {
      verwachtSleutel = false;
      continue;
    }

    if (t.soort === 'string' && verwachtSleutel) {
      const set = gezien[gezien.length - 1];
      if (set) {
        if (set.has(t.waarde)) {
          const segmenten = [...pad.filter((p) => p !== null), t.waarde];
          treffers.push(segmenten.join('.'));
        }
        set.add(t.waarde);
      }
      laatsteSleutel = t.waarde;
      verwachtSleutel = false;
      continue;
    }

    laatsteSleutel = null;
  }

  return treffers;
}

/**
 * Sluit elk haakje dat opengaat? Geeft `null` als het klopt, anders de reden.
 *
 * ⚠️ **Dit staat in de plaats van een `JSON.parse`-geldigheidstoets, en met
 *    opzet.** Twee van de zes bestanden zijn JSONC en zouden daar altijd op
 *    stuklopen. Wat deze controle nodig heeft is smaller dan geldigheid: een
 *    scanner die halverwege een afgekapt bestand leest, vindt geen dubbele
 *    sleutel meer en zou groen melden. Dát is precies het geval uit de
 *    bevinding — een script dat halverwege stopt — dus het is de ene vorm van
 *    ongeldigheid die hier wél gemeld moet worden.
 *
 * ⚠️ Geldigheid zelf is elders al belegd: `tsc` leest `tsconfig.json`, npm de
 *    twee package-bestanden, Deno `deno.json`, `pwa:controle` het manifest en
 *    Expo `app.json`. Die hier overdoen zou een zevende mening zijn.
 */
export function sluitNiet(tekst) {
  const open = [];

  for (const t of tekens(tekst)) {
    if (t.soort === '{' || t.soort === '[') open.push(t.soort);
    if (t.soort === '}' || t.soort === ']') {
      const laatste = open.pop();
      if (laatste === undefined) return `een \`${t.soort}\` te veel`;
      if ((t.soort === '}') !== (laatste === '{')) {
        return `een \`${laatste}\` wordt gesloten met een \`${t.soort}\``;
      }
    }
  }

  if (open.length > 0) return `${open.length} haakje(s) gaan open en nooit dicht`;
  return null;
}

/**
 * De JSON-bestanden die git bijhoudt.
 *
 * ⚠️ `package-lock.json` doet mee, al schrijft npm hem. Een halve `npm install`
 *    is precies het geval uit de bevinding — een script dat halverwege stopt —
 *    en 470 kB scannen kost minder dan tien milliseconden.
 */
function bestanden() {
  return execFileSync('git', ['ls-files', '*.json'], { encoding: 'utf8' })
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

function hoofd() {
  const paden = bestanden();
  const fouten = [];

  for (const pad of paden) {
    const tekst = readFileSync(pad, 'utf8');

    const scheef = sluitNiet(tekst);
    if (scheef) {
      fouten.push(`${pad}: ${scheef} — afgekapt bestand?`);
      continue;
    }

    for (const sleutel of dubbeleSleutels(tekst)) {
      fouten.push(`${pad}: \`${sleutel}\` staat er twee keer in.`);
    }
  }

  if (fouten.length > 0) {
    console.error(`✗ ${fouten.length} probleem(en) in JSON-bestanden:\n`);
    for (const f of fouten) console.error(`    ${f}`);
    console.error(
      '\n`JSON.parse` houdt bij een dubbele sleutel stilzwijgend de laatste, dus\n' +
        'de eerste waarde is weg zonder dat iets rood wordt. ESLint leest alleen\n' +
        '`.ts` en `.tsx`, en `tsc` leest geen JSON — hier is deze controle het\n' +
        'enige vangnet dat er is.',
    );
    return 1;
  }

  console.log(`json-controle: ${paden.length} bestanden, geen dubbele sleutels.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
