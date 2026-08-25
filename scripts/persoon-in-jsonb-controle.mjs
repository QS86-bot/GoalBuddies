#!/usr/bin/env node
/**
 * Er staat geen verwijzing naar een persoon in een jsonb-veld — 0059 en 0085.
 *
 * ⚠️ **Waarom dit een controle is en geen zin in een document.** De regel is op
 *    21-08-2026 opgeschreven na een bevinding bij het uitwerken van 0059: een
 *    uuid in jsonb heeft geen foreign key, dus `on delete set null` raakt hem
 *    niet. De naam van een verwijderd account blijft dan afleidbaar uit een rij
 *    die volgens 0031/0033 juist geanonimiseerd hoort te zijn.
 *
 *    Vier dagen later stond het er alsnog een tweede keer, in
 *    `goal_events.new_value` — en niemand zag het, want de regel stond in een
 *    document en niet in een script. 0085 haalde hem eruit; dit script zorgt
 *    ervoor dat er geen derde keer is.
 *
 * ⚠️ **De toets kijkt naar de wáárde en niet naar de sleutelnaam.** `group_id`,
 *    `request_id` en `goal_id` zijn geen personen, en een controle die op elke
 *    `_id` afgaat, meldt zoveel dat je hem leert negeren. Wat een persoon
 *    verraadt is wat er ingaat: `auth.uid()`, of een veld dat een mens aanwijst.
 *
 * ⚠️ Eén uitzondering op die stelregel: een sleutel die op `_by` eindigt. Dat is
 *    in dit schema altijd een persoon (`approved_by`, `decided_by`), en juist
 *    díé sleutel was de bevinding.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen. `tests/scripts/persoon-in-jsonb.test.ts`
 *    biedt hem elke vorm los aan — de vormen die hij moet vinden én de vormen
 *    die hij met rust moet laten.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORTEL = new URL('..', import.meta.url).pathname;

/**
 * Velden die een mens aanwijzen.
 *
 * ⚠️ `subject_id` en `actor_id` staan erbij en dat is met opzet: 0059 gaf
 *    `chat_messages` juist echte kolommen met die namen, dus zodra iemand ze
 *    alsnog in een payload propt, is dat een terugval naar precies de fout die
 *    toen gerepareerd is.
 */
const PERSOONSVELDEN = [
  'auth.uid()',
  'user_id',
  'owner_id',
  'actor_id',
  'sender_id',
  'requester_id',
  'reviewer_id',
  'approver_id',
  'subject_id',
  'decided_by',
  'member_id',
  'buddy_id',
  'profile_id',
];

/** Een sleutel die op `_by` eindigt, is in dit schema altijd een persoon. */
const SLEUTEL_IS_PERSOON = /^[a-z0-9_]*_by$/;

/**
 * Wat er in een oudere migratie stond en door een latere is rechtgezet.
 *
 * ⚠️ **Migratiebestanden worden nooit herschreven** — ze zijn de enige manier om
 *    dit schema ergens anders op te bouwen, en een bestand achteraf aanpassen
 *    maakt van de geschiedenis een leugen. De vondst hieronder is dus echt, staat
 *    er nog, en is toch geen bevinding meer: 0085 haalt de sleutel weg en zet de
 *    persoon in een kolom.
 *
 * ⚠️ **Elke regel draagt de migratie die hem rechtzette.** Zonder dat veld is
 *    dit een prullenbak waar een echte bevinding in verdwijnt zodra iemand hem
 *    lastig vindt; mét dat veld is elke uitzondering een verwijzing die je kunt
 *    nalopen. Er staat een test op dat het veld niet leeg is.
 */
export const RECHTGEZET = [
  {
    bestand: '0032_deadline_verschuiven_met_akkoord.sql',
    sleutel: 'approved_by',
    door: '0085_geen_persoon_meer_in_een_jsonb_veld.sql',
    waarom:
      'De goedkeurder van een deadline-verschuiving stond in new_value omdat ' +
      'actor_id al door de aanvrager bezet was. 0085 geeft hem een eigen kolom ' +
      'met een foreign key en haalt de sleutel uit bestaande rijen.',
  },
];

/**
 * Haalt de sleutel-waardeparen uit één `jsonb_build_object(...)`-aanroep.
 *
 * ⚠️ Handmatig haakjes tellen en geen reguliere expressie: de argumenten bevatten
 *    zelf haakjes (`auth.uid()`, geneste `jsonb_build_object`), en een expressie
 *    die op het eerste `)` stopt, leest het halve argument en meldt niets.
 */
function argumentenVan(sql, vanaf) {
  const open = sql.indexOf('(', vanaf);
  if (open === -1) return null;

  let diepte = 0;
  let inTekst = false;

  for (let i = open; i < sql.length; i += 1) {
    const teken = sql[i];

    if (teken === "'") {
      // Twee enkele quotes achter elkaar zijn een ontsnapte quote, geen einde.
      if (inTekst && sql[i + 1] === "'") {
        i += 1;
        continue;
      }
      inTekst = !inTekst;
      continue;
    }
    if (inTekst) continue;

    if (teken === '(') diepte += 1;
    if (teken === ')') {
      diepte -= 1;
      if (diepte === 0) return { inhoud: sql.slice(open + 1, i), einde: i };
    }
  }

  return null;
}

/** Splitst op komma's die niet binnen haakjes of tekst staan. */
function splitsArgumenten(inhoud) {
  const delen = [];
  let huidig = '';
  let diepte = 0;
  let inTekst = false;

  for (let i = 0; i < inhoud.length; i += 1) {
    const teken = inhoud[i];

    if (teken === "'") {
      if (inTekst && inhoud[i + 1] === "'") {
        huidig += "''";
        i += 1;
        continue;
      }
      inTekst = !inTekst;
      huidig += teken;
      continue;
    }
    if (!inTekst) {
      if (teken === '(') diepte += 1;
      if (teken === ')') diepte -= 1;
      if (teken === ',' && diepte === 0) {
        delen.push(huidig.trim());
        huidig = '';
        continue;
      }
    }
    huidig += teken;
  }

  if (huidig.trim() !== '') delen.push(huidig.trim());
  return delen;
}

/**
 * De bevindingen in één stuk SQL.
 *
 * @param {string} sql
 * @returns {{ sleutel: string, waarde: string, reden: string }[]}
 */
export function zonderCommentaar(sql) {
  return sql
    .split('\n')
    .map((regel) => (regel.trimStart().startsWith('--') ? '' : regel))
    .join('\n');
}

export function treffersIn(sql) {
  const gevonden = [];
  const schoon = zonderCommentaar(sql);

  let vanaf = 0;
  for (;;) {
    const start = schoon.indexOf('jsonb_build_object', vanaf);
    if (start === -1) break;

    const blok = argumentenVan(schoon, start + 'jsonb_build_object'.length);
    if (blok === null) break;

    const delen = splitsArgumenten(blok.inhoud);

    // Sleutel, waarde, sleutel, waarde, …
    for (let i = 0; i + 1 < delen.length; i += 2) {
      const sleutel = delen[i].replace(/^'|'$/g, '').trim();
      const waarde = delen[i + 1];

      // Een geneste aanroep wordt zelf ook gevonden door de buitenste lus.
      if (waarde.includes('jsonb_build_object')) continue;

      if (SLEUTEL_IS_PERSOON.test(sleutel)) {
        gevonden.push({ sleutel, waarde, reden: 'de sleutel eindigt op _by' });
        continue;
      }

      const veld = PERSOONSVELDEN.find((naam) =>
        naam === 'auth.uid()'
          ? waarde.replace(/\s+/g, '').includes('auth.uid()')
          : new RegExp(`(^|[^a-z0-9_])${naam}\\b`).test(waarde),
      );

      if (veld !== undefined) {
        gevonden.push({ sleutel, waarde, reden: `de waarde is ${veld}` });
      }
    }

    // ⚠️ **Verder net achter de naam en niet achter het hele blok.** Dat laatste
    //    stond er, en dan werd een geneste `jsonb_build_object` nooit bezocht:
    //    de buitenste lus sloeg hem over als waarde en sprong er meteen
    //    overheen. Ook dat ving de ijking.
    vanaf = start + 'jsonb_build_object'.length;
  }

  return gevonden;
}

/**
 * ⚠️ Alleen `insert`- en `update`-statements tellen. `jsonb_build_object` is in
 *    dit schema óók de gewone manier om een antwoord terug te geven
 *    (`return jsonb_build_object('ok', true, ...)`), en zo'n antwoord wordt
 *    nergens bewaard. Meldde de controle die ook, dan waren er honderden
 *    bevindingen en nul die ertoe deden.
 */
export function bewaardeTreffers(sql) {
  const stukken = [];
  const patroon = /\b(insert\s+into|update)\s+[a-z_.]+/gi;

  // ⚠️ **Commentaar gaat er hier weg en niet pas in `treffersIn`.** Dat stond
  //    andersom en toen glipte een uitgecommentarieerd statement erdoorheen: de
  //    knip begint bij `insert into`, en dat staat midden op de regel — de `--`
  //    aan het begin was er dan al af. De ijking ving het.
  const schoon = zonderCommentaar(sql);

  let match;
  while ((match = patroon.exec(schoon)) !== null) {
    // Tot de puntkomma die het statement afsluit.
    const eind = schoon.indexOf(';', match.index);
    stukken.push(schoon.slice(match.index, eind === -1 ? schoon.length : eind));
  }

  return stukken.flatMap((stuk) => treffersIn(stuk));
}

/** Staat deze vondst als rechtgezet geboekt, mét een migratie erbij? */
export function isRechtgezet(bestand, sleutel) {
  return RECHTGEZET.some(
    (r) =>
      r.bestand === bestand &&
      r.sleutel === sleutel &&
      typeof r.door === 'string' &&
      r.door.length > 0,
  );
}

function main() {
  const map = join(WORTEL, 'supabase/migrations');
  const klachten = [];

  for (const naam of readdirSync(map).sort()) {
    if (!naam.endsWith('.sql')) continue;

    for (const treffer of bewaardeTreffers(readFileSync(join(map, naam), 'utf8'))) {
      if (isRechtgezet(naam, treffer.sleutel)) continue;

      klachten.push(
        `${naam}: '${treffer.sleutel}' → ${treffer.waarde}  (${treffer.reden})`,
      );
    }
  }

  if (klachten.length === 0) {
    console.log('persoon-in-jsonb-controle: geen persoonsverwijzing in een jsonb-veld.');
    process.exit(0);
  }

  console.error(`persoon-in-jsonb-controle: ${klachten.length} bevinding(en).\n`);
  for (const k of klachten) console.error(`  ${k}`);
  console.error(
    '\nEen uuid in jsonb heeft geen foreign key, dus `on delete set null` raakt hem\n' +
      'niet en de persoon blijft afleidbaar na het verwijderen van dat account.\n' +
      'Maak er een echte kolom van, zoals 0059 en 0085 deden.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
