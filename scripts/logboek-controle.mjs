#!/usr/bin/env node
/**
 * logboek-controle — er staat geen persoon in de functielogs (QS8-206).
 *
 * ⚠️ **Waarom dit een controle is en geen opruimbeurt.** De dossierrij van 19-08
 *    zei dat er gebruikers-id's in de logs stonden, en telde er twee, in één
 *    functie. Bij het afwerken waren het er **elf, in twee functies** — en dat
 *    verschil is niet ontstaan doordat iemand slordig was, maar doordat er in de
 *    tussentijd code bij kwam en niets die regel bewaakte. Een tekstuele regel
 *    over logs verliest het van de volgende `console.error` die iemand erbij
 *    zet, want die is nuttig op het moment dat je hem schrijft.
 *
 * ⚠️ **Waarom logs en niet Sentry.** `meld()` stuurt naar Sentry en schoont
 *    onderweg (`scrubMessage()`); `console.error` gaat er rechtstreeks langs, de
 *    functielogs in. Dat is een ánder systeem met een ándere bewaartermijn dan
 *    de database, en `on delete set null` raakt het niet: een verwijderd account
 *    blijft daar staan. Geen domeinregel-7-lek — logs zijn niet groepszichtbaar
 *    — wel persoonsgegevens op een plek waar niemand ze beheert.
 *
 * ⚠️ **De toets kijkt naar wat een persoon aanwijst en niet naar elke `_id`.**
 *    Dat is de stelregel van `persoon-in-jsonb-controle`, en om dezelfde reden:
 *    `goal_id`, `group_id` en `weekly_goal_id` zijn geen personen, en een
 *    controle die op elke `_id` afgaat meldt zoveel dat je hem leert negeren.
 *    Een doel-id in een logregel is bovendien precies wat je nodig hebt om een
 *    mislukte stap terug te vinden.
 *
 * ⚠️ **Hij leest het hele argument en niet de eerste regel.** Drie van de elf
 *    treffers stonden over meerdere regels, en een regex per regel liep daar
 *    langs — dat is hoe deze bevinding op 28-08 op "twee" uitkwam.
 *
 * ⚠️⚠️ **Hij kijkt sinds 16-09-2026 naar drie klassen en niet naar één**
 *    (16-09-2026, ENGINEER-REVIEW-rij 07-09). Tot dan matchte hij uitsluitend **broncode-identifiers** — de
 *    id's die je zélf in een logregel zet — en niet de melding die de database
 *    teruggeeft. 📏 Gemeten door hem te voeden: ``console.error(`x:
 *    ${fout.message}`)`` gaf **0** treffers. De belofte in zijn naam was dus
 *    breder dan wat hij afdwong, en dat is de gevaarlijke richting: je leest de
 *    naam en gelooft de dekking.
 *
 *    De drie klassen, en waarom het er drie zijn:
 *
 *    1. **Een persoon die je zelf in de regel zet** — `PERSOONSVORMEN`. De
 *       oorspronkelijke klasse.
 *    2. **De rúwe melding van de database** — `RUWEVELDEN` en het kale
 *       foutobject. 📏 Gemeten via PostgREST op de lokale stack, met een
 *       CHECK-schending op `goals.title`:
 *
 *           message: new row for relation "goals" violates check constraint
 *                    "goals_title_geen_bidi"
 *           details: Failing row contains (…, 11111111-…, Mijn geheime doel‫, …)
 *
 *       `details` draagt de **hele rij** — de eigenaar én zijn privétekst — en
 *       een kaal foutobject in `console.error(…, fout)` draagt hem dus ook, want
 *       Deno inspecteert het object. `message` draagt vandaag alleen de
 *       constraintnaam; dát is de bewuste ruil van QS8-315 en die blijft staan.
 *    3. **De `%`-interpolatie aan de bronkant** — `GEBRUIKERSINHOUD`, tegen de
 *       migraties. Dit is de klasse die klasse 2 pas afmaakt, en `scrub.ts` zegt
 *       met zoveel woorden waarom: een `raise exception` met een `%` zet *de
 *       waarde die de fout veroorzaakte* in `message`, en `scrubMessage()` haalt
 *       die vorm er níét uit. Zolang geen enkele `raise exception` een persoon
 *       of gebruikerstekst interpoleert, is `${fout.message}` in een logregel
 *       veilig — en precies dát is wat deze klasse bewaakt. Zonder haar is
 *       "`.message` mag" een aanname over code die ergens anders staat.
 *
 *    📏 Alle drie stonden op **0** toen ze erbij kwamen. Dat is het goede moment:
 *    een grendel die bij aankomst al rood staat, wordt een opruimklus met een
 *    uitzonderingenlijst, en daarna een register dat niemand meer leest.
 *
 * ⚠️ **Geëxporteerd én los te voeden**, want een controle die je niet kunt
 *    ijken, kun je niet vertrouwen. `tests/scripts/logboek-controle.test.ts`
 *    biedt hem elke vorm los aan — de vormen die hij moet vinden én de vormen
 *    die hij met rust moet laten.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * Uitdrukkingen die een mens aanwijzen.
 *
 * ⚠️ `profiel.id` staat er met naam bij en niet als `\.id`: in deze twee
 *    functies heet de lus-variabele zo, en een kale `.id` zou `weekdoel.id` en
 *    `groep.id` meenemen — geen personen.
 */
export const PERSOONSVORMEN = [
  /\bprofiel\.id\b/,
  /\buser_id\b/,
  /\buserId\b/,
  /\bowner_id\b/,
  /\bsubject_id\b/,
  /\bactor_id\b/,
  /\bapprover_id\b/,
  /\bapproverId\b/,
  /\brequester_id\b/,
  /\.uid\(\)/,
];

/**
 * Velden van een foutobject die de melding van de database rúw doorgeven.
 *
 * ⚠️ **`message` staat hier bewust niet bij.** Die draagt vandaag de
 *    constraintnaam en verder niets — gemeten, zie de kop — en de volledige
 *    melding naar het functielog sturen is de bewuste ruil van QS8-315: een
 *    smaller publiek dan Sentry. Wat die ruil houdbaar maakt is de derde klasse
 *    hieronder, niet een aanname.
 */
export const RUWEVELDEN = [/\.details\b/, /\.hint\b/];

/** Hoe een foutvariabele in deze twee functies heet. */
const FOUTNAAM = /^(?:\w*[Ff]out|error|err)$/;

/** Het foutobject als geheel, in een sjabloon of door `JSON.stringify` heen. */
export const HEELFOUTOBJECT = [
  /\$\{\s*(?:\w*[Ff]out|error|err)\s*\}/,
  /JSON\.stringify\(\s*(?:\w*[Ff]out|error|err)\s*\)/,
];

/**
 * Uitdrukkingen die een persoon of zijn eigen tekst dragen, voor de bronkant.
 *
 * ⚠️ Ruimer dan `PERSOONSVORMEN`, en met reden: een `raise exception` die een
 *    doeltitel of een notitie interpoleert zet geen persoon in het log maar wél
 *    wat die persoon geschreven heeft, en domeinregel 7 gaat over allebei.
 *
 * ⚠️⚠️ **Geen `\b` aan de vóórkant, en dat is geen slordigheid maar het
 *    verschil tussen de twee bomen.** In JavaScript lees je een persoon als
 *    `rij.user_id`, en daar zet de punt de woordgrens. In PL/pgSQL heet
 *    diezelfde waarde `v_user_id` of `p_title`, en `_` is een woordteken — dus
 *    `\buser_id\b` matcht `v_user_id` **niet**. 📏 Dat is bij de ijking van deze
 *    lijst gebeurd: de mutatie stond in het bestand, de controle bleef groen, en
 *    zonder die tweede blik was hier een grendel geland die niets vindt. Een
 *    achtervoegseltoets is hier de juiste vorm; `PERSOONSVORMEN` houdt zijn
 *    `\b` omdat de JS-kant die punt wél heeft.
 */
export const GEBRUIKERSINHOUD = [
  /user_id\b/i,
  /owner_id\b/i,
  /subject_id\b/i,
  /actor_id\b/i,
  /approver_id\b/i,
  /requester_id\b/i,
  /display_name\b/i,
  /\.uid\(\)/,
  /title\b/i,
  /titel\b/i,
  /note\b/i,
  /notitie\b/i,
  /reason\b/i,
  /bericht\b/i,
  /floor_text\b/i,
  /ceiling_text\b/i,
];

/**
 * Waar het haakjespaar dat op `open` begint, sluit — de index ná het sluithaakje.
 * `null` als het niet sluit.
 *
 * ⚠️ Staat los omdat de teller anders vier niveaus diep zit (coderegel 15,
 *    QS8-291).
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

/**
 * Waar de tekenreeks die op `open` begint, sluit — de index ná het sluitteken.
 *
 * ⚠️ Telt de escape mee, zodat `\'` de reeks niet afsluit. Zonder dat loopt de
 *    scanner door tot het volgende aanhalingsteken en schuift alles één
 *    argument op.
 */
function tekenreeksEinde(bron, open) {
  const grens = bron[open];
  for (let i = open + 1; i < bron.length; i += 1) {
    if (bron[i] === '\\') i += 1;
    else if (bron[i] === grens) return i + 1;
  }
  return bron.length;
}

/**
 * De argumenten van een aanroep op het bovenste niveau.
 *
 * ⚠️ **Splitst niet op elke komma.** Een sjabloonliteral mag er een bevatten
 *    (`` `mislukt, opnieuw: ${x}` ``) en een objectargument ook; op zo'n komma
 *    splitsen levert twee halve argumenten op waarvan er geen enkele nog als
 *    kale variabelenaam leest — en dan mist de toets precies het geval waarvoor
 *    hij bestaat.
 */
export function argumenten(aanroep) {
  const binnen = aanroep.slice(aanroep.indexOf('(') + 1, aanroep.lastIndexOf(')'));
  const uit = [];
  let diepte = 0;
  let begin = 0;
  let i = 0;
  while (i < binnen.length) {
    const c = binnen[i];
    if (c === "'" || c === '"' || c === '`') {
      i = tekenreeksEinde(binnen, i);
      continue;
    }
    if ('([{'.includes(c)) diepte += 1;
    if (')]}'.includes(c)) diepte -= 1;
    if (c === ',' && diepte === 0) {
      uit.push(binnen.slice(begin, i));
      begin = i + 1;
    }
    i += 1;
  }
  uit.push(binnen.slice(begin));
  return uit.map((a) => a.trim()).filter((a) => a !== '');
}

/**
 * Elke `console.*`-aanroep in een bestand, compleet — inclusief de argumenten die
 * over meerdere regels lopen.
 *
 * ⚠️ Haakjes tellen en geen regex over het geheel: een sjabloonliteral mag zelf
 *    haakjes bevatten, en een niet-hebzuchtige regex knipt dan op de verkeerde.
 */
export function consoleAanroepen(bron) {
  const uit = [];
  const start = /console\.(?:error|warn|log|info|debug)\s*\(/g;

  let m;
  while ((m = start.exec(bron)) !== null) {
    const eind = haakjesEinde(bron, start.lastIndex - 1) ?? m.end ?? start.lastIndex;
    uit.push({
      regel: bron.slice(0, m.index).split('\n').length,
      tekst: bron.slice(m.index, eind),
    });
  }
  return uit;
}

/** Het oordeel over één console-aanroep, of `null` als er niets mis mee is. */
function oordeel(aanroep) {
  const persoon = PERSOONSVORMEN.find((r) => r.test(aanroep.tekst));
  if (persoon !== undefined) return { ...aanroep, soort: 'persoon', vorm: String(persoon) };

  const veld = RUWEVELDEN.find((r) => r.test(aanroep.tekst));
  if (veld !== undefined) return { ...aanroep, soort: 'melding', vorm: String(veld) };

  const heel = HEELFOUTOBJECT.find((r) => r.test(aanroep.tekst));
  if (heel !== undefined) return { ...aanroep, soort: 'melding', vorm: String(heel) };

  const kaal = argumenten(aanroep.tekst).find((a) => FOUTNAAM.test(a));
  return kaal === undefined ? null : { ...aanroep, soort: 'melding', vorm: `kaal argument: ${kaal}` };
}

/** De aanroepen die een persoon of een rúwe databasemelding in de logs zetten. */
export function beoordeel(bron) {
  return consoleAanroepen(bron)
    .map((aanroep) => oordeel(aanroep))
    .filter((t) => t !== null);
}

/**
 * Het argumentdeel van de `raise exception` die op `start` begint: alles ná de
 * opmaakstring tot de puntkomma, met de tekenreeksen leeggemaakt.
 *
 * ⚠️ **De tekenreeksen gaan er leeg in en niet weg.** De opmaakstring zelf mag
 *    `title` bevatten (`'doel % heeft geen title'`) zonder dat er iets lekt —
 *    wat lekt is de variabele erachter. Zou je de strings laten staan, dan meldt
 *    de toets zijn eigen meldingsteksten; zou je ze weghalen, dan plakken de
 *    argumenten aan elkaar.
 */
function raiseArgumenten(bron, start) {
  let uit = '';
  let i = start;
  let opmaakGehad = false;
  while (i < bron.length && bron[i] !== ';') {
    if (bron[i] === "'") {
      // ⚠️ De opmaakstring zelf gaat niet mee; elke vólgende tekenreeks wordt een
      //    lege, zodat de argumenten niet aan elkaar plakken.
      uit += opmaakGehad ? "''" : '';
      opmaakGehad = true;
      i = tekenreeksEinde(bron, i);
      continue;
    }
    if (bron.startsWith('--', i)) {
      i = bron.indexOf('\n', i) + 1 || bron.length;
      continue;
    }
    uit += opmaakGehad ? bron[i] : '';
    i += 1;
  }
  return uit;
}

/** De `raise exception`-regels die gebruikersinhoud in hun melding zetten. */
export function beoordeelRaise(bron) {
  const uit = [];
  const start = /raise\s+exception\b/gi;

  let m;
  while ((m = start.exec(bron)) !== null) {
    const args = raiseArgumenten(bron, start.lastIndex);
    const vorm = GEBRUIKERSINHOUD.find((r) => r.test(args));
    if (vorm !== undefined) {
      uit.push({ regel: bron.slice(0, m.index).split('\n').length, tekst: args.trim(), vorm: String(vorm) });
    }
  }
  return uit;
}

function bestanden(map, achtervoegsel) {
  const uit = [];
  for (const naam of readdirSync(map).sort()) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad, achtervoegsel));
    else if (naam.endsWith(achtervoegsel)) uit.push(pad);
  }
  return uit;
}

function logklachten() {
  const uit = { persoon: [], melding: [] };
  for (const pad of bestanden(join(WORTEL, 'supabase', 'functions'), '.ts')) {
    for (const t of beoordeel(readFileSync(pad, 'utf8'))) {
      uit[t.soort].push(`${relative(WORTEL, pad)}:${t.regel}  ${t.tekst.split('\n')[0].trim()}`);
    }
  }
  return uit;
}

function raiseklachten() {
  const uit = [];
  for (const pad of bestanden(join(WORTEL, 'supabase', 'migrations'), '.sql')) {
    for (const t of beoordeelRaise(readFileSync(pad, 'utf8'))) {
      uit.push(`${relative(WORTEL, pad)}:${t.regel}  raise exception …${t.tekst.split('\n')[0]}`);
    }
  }
  return uit;
}

const UITLEG = {
  persoon:
    'De functielogs zijn een ander systeem dan de database, met een andere\n' +
    'bewaartermijn, en `on delete set null` raakt ze niet. Haal het id eruit —\n' +
    'de foutmelding zelf is wat je nodig hebt — of stuur de regel via `meld()`,\n' +
    'die schoont onderweg. Een doel- of groeps-id mag blijven staan.',
  melding:
    '`details` draagt de héle rij die de fout veroorzaakte (`Failing row\n' +
    'contains (…)`) — de eigenaar én zijn privétekst — en een kaal foutobject\n' +
    'draagt hem dus ook. Log `.message` en `.code`; die zeggen wat er mis ging\n' +
    'zonder de rij mee te nemen. Wil je de rest, stuur hem dan via `meld()`.',
  raise:
    'De melding van een `raise exception` komt als `error.message` terug bij de\n' +
    'aanroeper, en die logt hem. Een `%` zet daar de waarde in die de fout\n' +
    'veroorzaakte, en `scrubMessage()` haalt die vorm er niet uit. Noem het\n' +
    'id van de rij of helemaal niets — niet de persoon of zijn tekst.',
};

function rapporteer(kop, regels, uitleg) {
  console.error(`✗ ${regels.length} ${kop}:\n`);
  for (const r of regels) console.error(`    ${r}`);
  console.error(`\n${uitleg}\n`);
}

function hoofd() {
  const logs = logklachten();
  const raise = raiseklachten();

  if (logs.persoon.length > 0) rapporteer('logregel(s) zetten een persoon in de functielogs', logs.persoon, UITLEG.persoon);
  if (logs.melding.length > 0) rapporteer('logregel(s) zetten een rúwe databasemelding in de functielogs', logs.melding, UITLEG.melding);
  if (raise.length > 0) rapporteer('raise exception-regel(s) zetten gebruikersinhoud in hun melding', raise, UITLEG.raise);

  if (logs.persoon.length + logs.melding.length + raise.length > 0) return 1;

  console.log(
    'logboek-controle: geen enkele console-regel in de Edge Functions draagt een\n' +
      'persoon of een rúwe databasemelding, en geen enkele `raise exception`\n' +
      'interpoleert gebruikersinhoud in zijn melding.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
