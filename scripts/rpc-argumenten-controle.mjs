#!/usr/bin/env node
/**
 * Elke `.rpc()` stuurt argumenten die de functie ook echt heeft.
 *
 * ⚠️ **Waarom dit een controle is en geen typecheck.** De kop van
 *    `src/modules/buddies/weekafsluiting.ts` beloofde dat de build breekt als
 *    een naam niet klopt. Dat is voor de **kolommen** waar — `Returns` wordt
 *    echt gebruikt — maar niet voor de **argumenten**. Alle drie de vormen zijn
 *    op 28-08 los gemeten tegen `npm run typecheck`, met de mutatie in een echt
 *    aanroepbestand en niet in een proefopstelling:
 *
 *      een verkeerd type op een bestaande parameter   → gevangen
 *      een weggelaten verplichte parameter            → gevangen
 *      een onbekende functienaam                      → gevangen
 *      een parameter die niet bestaat                 → komt erdoor
 *
 *    ⚠️ Die laatste komt er in béide vormen doorheen: als letterlijk object
 *       achter de naam, én via een `const` ertussen. Bij een letterlijk object
 *       zou je de excess-property-toets verwachten; die slaat hier niet aan
 *       omdat het `Args`-type van de generator alle sleutels optioneel maakt.
 *
 * ⚠️ **En dit script vergelijkt met iets ánders dan typecheck.** Typecheck leest
 *    `src/lib/database.types.ts`, dit script leest `supabase/migrations/` en
 *    `supabase/shim/`. Die twee kunnen uit elkaar lopen — de types zijn
 *    gegenereerd en worden in dit project ook met de hand bijgewerkt. Een
 *    aanroep die bij de types past maar niet bij de migraties, is precies wat er
 *    op productie omvalt, en dat is de enige plek waar dat zichtbaar wordt.
 *
 *    En dat is precies de vorm die een hernoeming oplevert. Het is deze sessie
 *    twee keer gebeurd: 0121 hernoemde `p_offset` in
 *    `weekafsluiting_reacties()` en 0125 deed hetzelfde in
 *    `openstaande_beoordelingen()`. In dat tweede geval bleef
 *    `tests/rls/besluiten.test.ts` `p_offset` sturen, kwam het door typecheck
 *    heen, en viel het pas om bij het draaien — met `PGRST202`, een foutcode die
 *    zegt dat PostgREST de functie met díé argumenten niet kent.
 *
 * ⚠️ **De ijking van dit script is de vraag "vindt hij de fout van 28-08?"**, en
 *    dat is niet retorisch: de eerste werkende versie hiervan meldde nul terwijl
 *    de fout er met de hand in gezet was. `bovensteSleutels()` kreeg toen de
 *    accolades ván het argumentenblok mee binnen, stond dus meteen op diepte 1,
 *    en gaf voor élke aanroep een lege sleutellijst. **Een lege lijst past altijd
 *    in elke handtekening**, dus het script was groen zonder iets te toetsen —
 *    exact de klasse fout die hij moet vangen, in zichzelf.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Waar de functies vandaan komen, in de volgorde waarin ze gedraaid worden. */
export const SQLMAPPEN = ['supabase/shim', 'supabase/migrations'];

/** Waar de aanroepen vandaan komen. */
export const BRONMAPPEN = ['src', 'app', 'supabase/functions', 'tests'];

/**
 * ⚠️ **`tests/scripts/` telt niet mee, en dat is geen gemak.** Dáár staan de
 *    ijkingsgevallen van de ándere controlescripts, en die zijn met opzet
 *    verzonnen: `tests/scripts/dode-keten.test.ts` voedt letterlijk
 *    `.rpc('create_group', { p_naam: … })` aan `rpcAanroepenIn()` om te toetsen
 *    dat díé de naam eruit haalt. Zulke fragmenten zijn geen aanroepen; ze zijn
 *    invoer. Zonder deze uitzondering meldt dit script ze, en een controle die
 *    andermans testmateriaal meldt, leer je te negeren.
 */
export const OVERSLAAN = [/\/tests\/scripts\//];

/** De inhoud van het haakjesblok dat op `start` opent, zonder de haakjes. */
function haakjesBlok(tekst, start) {
  let diep = 0;
  for (let i = start; i < tekst.length; i += 1) {
    if (tekst[i] === '(') diep += 1;
    else if (tekst[i] === ')') {
      diep -= 1;
      if (diep === 0) return tekst.slice(start + 1, i);
    }
  }
  return '';
}

/** De inhoud van het accoladeblok dat op `start` opent, zonder de accolades. */
function accoladeBlok(tekst, start) {
  let diep = 0;
  for (let i = start; i < tekst.length; i += 1) {
    if (tekst[i] === '{') diep += 1;
    else if (tekst[i] === '}') {
      diep -= 1;
      if (diep === 0) return tekst.slice(start + 1, i);
    }
  }
  return '';
}

/**
 * De parameternamen uit een argumentenlijst van een `create function`.
 *
 * ⚠️ Bij een `drop function` staan er **typen** in plaats van namen
 *    (`(integer, integer)`). Die worden hier net zo goed opgeleverd; ze dienen
 *    alleen om het áántal te tellen, want dat is het enige dat beide vormen
 *    delen. Zie `parametersUit()`.
 */
export function parameternamen(lijst) {
  const stukken = [];
  let diep = 0;
  let huidig = '';

  for (const teken of lijst) {
    if (teken === '(' || teken === '[') diep += 1;
    if (teken === ')' || teken === ']') diep -= 1;
    if (teken === ',' && diep === 0) {
      stukken.push(huidig);
      huidig = '';
      continue;
    }
    huidig += teken;
  }
  stukken.push(huidig);

  return stukken
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/)[0].toLowerCase())
    .filter((s) => /^[a-z_][a-z0-9_]*$/.test(s));
}

/**
 * Welke overloads er per functienaam overblijven.
 *
 * ⚠️ **In volgorde verwerken en `drop function` honoreren** — hetzelfde patroon
 *    als `functiesIn()` in `dode-keten-controle.mjs`, en om dezelfde reden. Een
 *    migratie die de vorm van een functie wijzigt dropt hem eerst; telt die drop
 *    niet mee, dan blijft de óude handtekening als geldige overload staan en
 *    keurt dit script precies de aanroep goed die stuk is.
 *
 *    Dat is hier gemeten en niet aangenomen: zonder de sortering op positie
 *    binnen een bestand meldde de eerste versie zeventien functies als
 *    "onbekend", omdat de drop bovenaan het bestand ná de create eronder werd
 *    toegepast.
 *
 * ⚠️ **De sleutel is het áántal parameters en niet de handtekening.** Een
 *    `create` noemt namen, een `drop` noemt typen — die twee zijn niet met
 *    elkaar te vergelijken, en het aantal is het enige dat ze delen. Grover dan
 *    Postgres zelf, en dat is de goede kant om op te leunen: twee overloads met
 *    hetzelfde aantal argumenten en verschillende namen zou dit script te
 *    ruimhartig maken, en die bestaan in dit schema niet.
 *
 * @param {readonly {pad: string, sql: string}[]} bestanden in draaivolgorde
 * @returns {Map<string, Map<number, readonly string[]>>}
 */
export function overloadsUit(bestanden) {
  /** @type {Map<string, Map<number, readonly string[]>>} */
  const perNaam = new Map();

  for (const { sql } of bestanden) {
    const gebeurtenissen = [];

    for (const m of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi,
    )) {
      const index = m.index ?? 0;
      gebeurtenissen.push({
        index,
        naam: m[1].toLowerCase(),
        maakt: true,
        params: parameternamen(haakjesBlok(sql, index + m[0].length - 1)),
      });
    }

    for (const m of sql.matchAll(
      /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi,
    )) {
      const index = m.index ?? 0;
      gebeurtenissen.push({
        index,
        naam: m[1].toLowerCase(),
        maakt: false,
        params: parameternamen(haakjesBlok(sql, index + m[0].length - 1)),
      });
    }

    gebeurtenissen.sort((a, b) => a.index - b.index);

    for (const g of gebeurtenissen) {
      const overloads = perNaam.get(g.naam) ?? new Map();
      perNaam.set(g.naam, overloads);
      if (g.maakt) overloads.set(g.params.length, g.params);
      else overloads.delete(g.params.length);
    }
  }

  return perNaam;
}

/**
 * De sleutels op het bovenste niveau van een objectliteraal.
 *
 * ⚠️ **Alleen het bovenste niveau, en dat is een gemeten eis.** `vraag_ai_job()`
 *    heeft één `p_input`-parameter van het type `jsonb`, en de aanroepers vullen
 *    daar een object in. Een regex die alle `sleutel:`-vormen pakt, meldt `doel`,
 *    `vraag` en `milestone_id` als onbekende parameters — acht valse meldingen
 *    bij de eerste meting, allemaal op aanroepen die kloppen.
 */
export function bovensteSleutels(inhoud) {
  const uit = [];
  let diep = 0;
  let i = 0;

  while (i < inhoud.length) {
    const teken = inhoud[i];

    if (teken === '{' || teken === '[' || teken === '(') {
      diep += 1;
      i += 1;
      continue;
    }
    if (teken === '}' || teken === ']' || teken === ')') {
      diep -= 1;
      i += 1;
      continue;
    }
    if (teken === "'" || teken === '"' || teken === '`') {
      const quote = teken;
      i += 1;
      while (i < inhoud.length && inhoud[i] !== quote) {
        if (inhoud[i] === '\\') i += 1;
        i += 1;
      }
      i += 1;
      continue;
    }

    if (diep === 0) {
      const m = /^([a-z_][a-z0-9_]*)\s*:/i.exec(inhoud.slice(i));
      // Een sleutel staat vooraan of achter een komma; alles anders is een
      // waarde die toevallig een dubbele punt draagt (een ternary bijvoorbeeld).
      const ervoor = inhoud.slice(0, i);
      if (m && (ervoor.trim() === '' || /,\s*$/.test(ervoor))) {
        uit.push(m[1].toLowerCase());
        i += m[0].length;
        continue;
      }
    }

    i += 1;
  }

  return uit;
}

/**
 * De `.rpc()`-aanroepen in één bestand.
 *
 * ⚠️ **Drie soorten, en ze worden apart geteld.** Een aanroep waarvan de
 *    argumenten uit een variabele komen (`rpc(naam, argumenten)`) is met een
 *    regex niet te lezen, en er zijn er zes. Die als "gecontroleerd" meetellen
 *    zou het getal onderaan laten liegen — dat is hoe de blinde vlek van
 *    `keten:controle` maandenlang onzichtbaar bleef. Ze staan er daarom als
 *    eigen getal onder.
 *
 * ⚠️ Eentje daarvan is deze sessie zelf ontstaan: `fetchBeoordelingen()` bouwt
 *    zijn argumenten in een `const` omdat `exactOptionalPropertyTypes` geen
 *    `undefined` op een optionele sleutel toestaat. De reparatie van 0125 heeft
 *    zijn eigen aanroep dus buiten het bereik van deze controle gezet, en dat
 *    hoort zichtbaar te zijn in plaats van weggerekend.
 */
export function aanroepenIn(bron) {
  const uit = [];

  for (const m of bron.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]\s*(,\s*)?/gi)) {
    const naam = m[1].toLowerCase();
    const na = (m.index ?? 0) + m[0].length;
    const regel = bron.slice(0, m.index ?? 0).split('\n').length;

    if (!m[2]) {
      uit.push({ naam, regel, soort: 'zonder' });
      continue;
    }
    if (bron[na] !== '{') {
      uit.push({ naam, regel, soort: 'indirect' });
      continue;
    }

    uit.push({ naam, regel, soort: 'inline', sleutels: bovensteSleutels(accoladeBlok(bron, na)) });
  }

  return uit;
}

/**
 * Wat er niet klopt. Lege lijst is goed nieuws.
 *
 * @param {Map<string, Map<number, readonly string[]>>} overloads
 * @param {readonly {pad: string, bron: string}[]} bestanden
 */
export function controleer(overloads, bestanden) {
  const meldingen = [];
  const geteld = { inline: 0, indirect: 0, zonder: 0 };

  for (const { pad, bron } of bestanden) {
    for (const aanroep of aanroepenIn(bron)) {
      geteld[aanroep.soort] += 1;
      if (aanroep.soort !== 'inline') continue;

      const vormen = overloads.get(aanroep.naam);
      if (vormen === undefined || vormen.size === 0) {
        meldingen.push(
          `${pad}:${aanroep.regel}  ${aanroep.naam}() bestaat niet in supabase/shim of supabase/migrations`,
        );
        continue;
      }

      const past = [...vormen.values()].some((params) =>
        aanroep.sleutels.every((s) => params.includes(s)),
      );
      if (!past) {
        const bekend = [...vormen.values()].map((p) => p.join(', ')).join('  |  ');
        meldingen.push(
          `${pad}:${aanroep.regel}  ${aanroep.naam}(${aanroep.sleutels.join(', ')})` +
            `  —  bestaat als: ${bekend}`,
        );
      }
    }
  }

  return { meldingen, geteld };
}

function bestandenIn(map, vorm) {
  const uit = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (vorm.test(naam)) uit.push(vol);
    }
  };
  loop(join(WORTEL, map));
  return uit.sort();
}

function main() {
  const sqlBestanden = SQLMAPPEN.flatMap((map) =>
    bestandenIn(map, /\.sql$/).map((pad) => ({ pad, sql: readFileSync(pad, 'utf8') })),
  );
  const overloads = overloadsUit(sqlBestanden);

  const bronBestanden = BRONMAPPEN.flatMap((map) =>
    bestandenIn(map, /\.(ts|tsx)$/)
      .filter((pad) => !OVERSLAAN.some((r) => r.test(metSchuineStrepen(pad))))
      .map((pad) => ({ pad: pad.replace(WORTEL, ''), bron: readFileSync(pad, 'utf8') })),
  );

  const { meldingen, geteld } = controleer(overloads, bronBestanden);

  if (meldingen.length === 0) {
    console.log(
      `rpc-argumenten-controle: ${geteld.inline} aanroepen met letterlijke argumenten ` +
        `sturen alleen parameters die bestaan, over ${overloads.size} functies. ` +
        `${geteld.indirect} aanroepen geven hun argumenten via een variabele door en zijn ` +
        `hiermee niet te lezen; ${geteld.zonder} sturen er geen.`,
    );
    process.exit(0);
  }

  console.error(`rpc-argumenten-controle: ${meldingen.length} aanroep(en) kloppen niet.\n`);
  for (const m of meldingen) console.error(`  ${m}`);
  console.error(
    '\nPostgREST kent een functie op zijn argumentnamen. Een naam die niet bestaat\n' +
      'geeft geen bouwfout maar een PGRST202 op het moment dat iemand de knop indrukt.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
