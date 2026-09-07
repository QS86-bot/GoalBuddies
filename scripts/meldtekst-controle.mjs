#!/usr/bin/env node
/**
 * meldtekst-controle — geen rúwe foutmelding in de tekst die naar Sentry gaat
 * (QS8-315).
 *
 * ⚠️ **Waarom dit een controle is en geen opgeruimde regel.** De dossierrij van
 *    04-09 telde twee plekken, in één functie, en noemde er één verkeerd (het
 *    inschuiven roept `meld()` helemaal niet aan). Nagemeten waren het er
 *    **drie, in twee functies** — `notificaties` stond er niet eens bij. Dat is
 *    letterlijk de vorm van QS8-206, waar de rij twee `console.error` telde en
 *    het er elf in twee functies bleken: niemand was slordig, er kwam code bij
 *    en niets bewaakte de regel. Een tekstuele afspraak verliest het van de
 *    volgende `meld()` die iemand erbij zet, want die is nuttig op het moment
 *    dat je hem schrijft.
 *
 * ⚠️ **Wat er precies fout aan is.** `scrubMessage()` haalt geciteerde waarden
 *    en de `Key (col)=(val)`-vorm uit een melding, maar **niet** een
 *    `%`-interpolatie — en dat is precies de vorm die onze eigen wachters
 *    gooien. 📏 Gemeten met de échte functie: `Europe/Bogus is geen bekende
 *    tijdzone` en `Te veel avatars voor deze gebruiker (12).` komen er
 *    onveranderd uit, terwijl `… constraint "groups_invite_code_key"` — de
 *    schemametadata die je bij het opzoeken juist nodig hebt — wél geschoond
 *    wordt. De veilige helft beschermd, de gevaarlijke doorgelaten.
 *
 * ⚠️ **Hij kijkt naar het éérste argument en niet naar de hele aanroep.** Dat
 *    argument wordt de tekst van de gebeurtenis in Sentry; de context erachter
 *    gaat door `scrubContext()`, en die heeft een allowlist. Een controle die de
 *    hele aanroep leest, zou `{ sqlstate: fout.code }` melden — precies de
 *    reparatie die dit script hoort af te dwingen.
 *
 * ⚠️ **En hij meldt bewust níét dat een foutobject rechtstreeks wordt
 *    doorgegeven** (`meld(fout, …)`). 📏 Dat zijn er 173, en die leunen allemaal
 *    op dezelfde `scrubMessage()` met hetzelfde gat — een echte bevinding, maar
 *    een ándere: die repareer je in de schoonmaaklaag en niet per aanroeper. Het
 *    staat als eigen issue met een meter, want een controle die 173 dingen
 *    meldt, leert je hem te negeren. Zelfde stelregel als bij
 *    `logboek-controle` en `persoon-in-jsonb-controle`.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen (CLAUDE.md regel 18).
 *    `tests/scripts/meldtekst-controle.test.ts` biedt hem elke vorm los aan — de
 *    vormen die hij moet vinden én de vormen die hij met rust moet laten.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De aanroepen die een gebeurtenis naar Sentry sturen.
 *
 * ⚠️ Allebei, en niet alleen `meld()`. De app en de Edge Functions delen de
 *    envelope-bouwer en de schoonmaak; ze horen ook dezelfde grens te hebben,
 *    anders is de belofte een eigenschap van de map waar je toevallig zit.
 */
const AANROEPEN = /(?<![.\w])(?:meld|reportError)\s*\(/g;

/**
 * Wat er in een `${…}` mag staan zonder dat het een foutmelding is.
 *
 * ⚠️ **`.message` is de bekende, maar niet de enige.** Een `PostgrestError`
 *    draagt naast `message` ook `details` en `hint`, en de `DETAIL`-regel is nu
 *    juist de plek waar Postgres de waarde zet die de constraint brak. `sqlerrm`
 *    staat erbij voor het geval een RPC hem doorgeeft.
 */
export const MELDINGSVORMEN = [/\.message\b/, /\.details\b/, /\.hint\b/, /\bsqlerrm\b/];

/**
 * Een kale verwijzing naar een foutobject, geïnterpoleerd in de tekst.
 *
 * ⚠️ **`${fout}` lekt net zo hard als `${fout.message}`**, en dat is niet
 *    vanzelfsprekend: een sjabloonliteral roept `String()` aan, en
 *    `String(new Error('Europe/Bogus is geen bekende tijdzone'))` geeft
 *    `Error: Europe/Bogus is geen bekende tijdzone`. De melding gaat dus
 *    voluit mee zónder dat het woord `message` in de code voorkomt.
 *
 * ⚠️ **Op de náám afgaan is hier de juiste maat, en dat is een besluit.**
 *    Of een identifier een fout draagt is niet uit de tekst af te lezen; wat
 *    wél kan is de conventie van dit project toetsen, en die is consequent
 *    `fout`, `error` of `…Fout`. Een controle die élke geïnterpoleerde
 *    identifier meldt, meldt ook `${aantal}` en `${groepId}` — en dan leer je
 *    hem te negeren. Zelfde stelregel als de `_id`-grens in
 *    `logboek-controle`.
 */
const FOUTOBJECT = /^(?:[a-z_$][\w$]*)?(?:fout|error|err)$/i;

/**
 * Waar het haakjespaar dat op `open` begint, sluit — de index ná het sluithaakje.
 * `null` als het niet sluit.
 *
 * ⚠️ Staat los omdat de teller anders te diep genest zit (coderegel 15).
 */
function haakjesEinde(bron, open) {
  let diepte = 0;
  for (let i = open; i < bron.length; i += 1) {
    if (bron[i] === '(') diepte += 1;
    else if (bron[i] === ')') {
      diepte -= 1;
      if (diepte === 0) return i + 1;
    }
  }
  return null;
}

/** Loopt één teken en geeft de nieuwe diepte terug. */
function diepteNa(teken, diepte) {
  if (teken === '(' || teken === '[' || teken === '{') return diepte + 1;
  if (teken === ')' || teken === ']' || teken === '}') return diepte - 1;
  return diepte;
}

/**
 * Het eerste argument van een aanroep, zonder de omhullende haakjes.
 *
 * ⚠️ **Geen `split(',')`.** Een sjabloonliteral mag zelf een komma bevatten —
 *    `new Error(\`a, b\`)` — en dan knipt een naïeve splitsing het argument
 *    middendoor en leest de controle de verkeerde helft. Tellen dus, tot de
 *    eerste komma op diepte nul.
 */
export function eersteArgument(aanroep) {
  const binnen = aanroep.slice(aanroep.indexOf('(') + 1, -1);
  let diepte = 0;

  for (let i = 0; i < binnen.length; i += 1) {
    if (binnen[i] === ',' && diepte === 0) return binnen.slice(0, i);
    diepte = diepteNa(binnen[i], diepte);
  }
  return binnen;
}

/**
 * De inhoud van elke `${…}` in een stuk broncode.
 *
 * ⚠️ Accolades tellen en geen regex: `${(fout as { message: string }).message}`
 *    draagt zelf een accolade, en `\$\{[^}]*\}` stopt dan bij de verkeerde. Dat
 *    is geen verzonnen geval — precies zo stond het in `rollover/index.ts`, en
 *    een eerste meting met die regex telde die plek daardoor níét mee.
 */
export function interpolaties(tekst) {
  const uit = [];

  for (let i = tekst.indexOf('${'); i !== -1; i = tekst.indexOf('${', i + 2)) {
    let diepte = 1;
    let j = i + 2;
    while (j < tekst.length && diepte > 0) {
      if (tekst[j] === '{') diepte += 1;
      else if (tekst[j] === '}') diepte -= 1;
      j += 1;
    }
    if (diepte === 0) uit.push(tekst.slice(i + 2, j - 1));
  }
  return uit;
}

/** Elke `meld()`- of `reportError()`-aanroep, compleet, met regelnummer. */
export function meldAanroepen(bron) {
  const uit = [];
  AANROEPEN.lastIndex = 0;

  let m;
  while ((m = AANROEPEN.exec(bron)) !== null) {
    // ⚠️ De definitie van `meld()` zelf is geen aanroep. Zonder deze regel
    //    meldt de controle `_shared/melden.ts` en is hij vanaf dag één rood op
    //    iets wat klopt — de snelste manier om een controle uitgezet te krijgen.
    if (/\b(?:function|const|let|var)\s+$/.test(bron.slice(Math.max(0, m.index - 24), m.index))) {
      continue;
    }
    const eind = haakjesEinde(bron, AANROEPEN.lastIndex - 1);
    if (eind === null) continue;

    uit.push({ regel: bron.slice(0, m.index).split('\n').length, tekst: bron.slice(m.index, eind) });
  }
  return uit;
}

/**
 * De vorm waarmee dit argument een rúwe melding meesmokkelt, of `undefined`.
 *
 * ⚠️ **`MELDINGSVORMEN` gaat over het héle argument en niet alleen over de
 *    interpolaties.** Anders glipt `'mislukt: ' + fout.message` erdoor — geen
 *    sjabloonliteral, wel dezelfde melding. Gemeten in de review op QS8-315:
 *    die vorm gaf nul treffers tegen één voor de sjabloonvariant.
 */
function smokkelvorm(arg) {
  const rechtstreeks = MELDINGSVORMEN.find((r) => r.test(arg));
  if (rechtstreeks !== undefined) return String(rechtstreeks);

  const kaal = interpolaties(arg).find((inhoud) => FOUTOBJECT.test(inhoud.trim()));
  return kaal === undefined ? undefined : `kaal foutobject: \${${kaal.trim()}}`;
}

/** De aanroepen die een rúwe foutmelding in de Sentry-tekst zetten. */
export function beoordeel(bron) {
  return meldAanroepen(bron)
    .map((aanroep) => {
      const vorm = smokkelvorm(eersteArgument(aanroep.tekst));
      return vorm === undefined ? null : { ...aanroep, vorm };
    })
    .filter((t) => t !== null);
}

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(map).sort()) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    // ⚠️ Testbestanden tellen niet mee — CLAUDE.md coderegel 15. Een test die de
    //    verboden vorm vóért, is het bewijs en niet de overtreding.
    else if (/\.tsx?$/.test(naam) && !naam.includes('.test.')) uit.push(pad);
  }
  return uit;
}

function hoofd() {
  const klachten = [];

  for (const map of ['supabase/functions', 'src', 'app']) {
    for (const pad of bestanden(join(WORTEL, map))) {
      for (const treffer of beoordeel(readFileSync(pad, 'utf8'))) {
        klachten.push(
          `${relative(WORTEL, pad)}:${treffer.regel}  ${treffer.tekst.split('\n')[0].trim()}`,
        );
      }
    }
  }

  if (klachten.length === 0) {
    console.log(
      'meldtekst-controle: geen enkele melding naar Sentry draagt een rúwe foutmelding.',
    );
    return 0;
  }

  console.error(`✗ ${klachten.length} melding(en) zetten een rúwe foutmelding in de Sentry-tekst:\n`);
  for (const k of klachten) console.error(`    ${k}`);
  console.error(
    '\n`scrubMessage()` haalt geciteerde waarden eruit, maar niet een\n' +
      '`%`-interpolatie — en dat is de vorm die onze eigen wachters gooien\n' +
      '(`Europe/Bogus is geen bekende tijdzone`). Splits het zoals 0158 en\n' +
      'QS8-171 het al doen: de volledige tekst naar `console.error`, en naar\n' +
      'Sentry een vaste zin plus `{ code, sqlstate }`.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
