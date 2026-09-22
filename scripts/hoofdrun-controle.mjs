#!/usr/bin/env node
/**
 * Een run op `main` wordt niet afgebroken — QS8-318.
 *
 * ⚠️ **Waarom dit een controle is en geen zin.** Op 07-09-2026 landden er twee
 *    migraties met nummer `0182` op `main`. De post-merge controle dééd zijn
 *    werk — `migraties:controle` maakte run 1249 rood binnen drie minuten — maar
 *    de run over de commit ertússen is nooit afgerond:
 *
 *      09:07:34  #259  run 1247  CANCELLED
 *      09:07:46  #260  run 1248  CANCELLED   <- de eerste 0182 landt hier
 *      09:07:54  #261  run 1249  FAILURE     <- de tweede; main wordt rood
 *
 *    Dat komt door `cancel-in-progress: true`, en op een featurebranch is dat
 *    juist: een nieuwe push maakt de vorige commit achterhaald. Op `main` niet.
 *    Daar is elke commit een toestand die uitgerold wordt, en een toestand
 *    zonder uitslag is niet groen en niet rood — hij is er niet. 📏 Vijf van de
 *    24 main-runs van die dag zijn zo afgebroken.
 *
 * ⚠️ **De vorm van de fout is bekend in dit project:** een grendel die werkt,
 *    maar waarvan de uitslag verdwijnt. Zelfde klasse als een controle die
 *    `OVERGESLAGEN` print en exitcode 0 geeft (QS8-268) en als een suite die
 *    zichzelf stil oversloeg (QS8-270). Vandaar dat het een controle wordt: de
 *    regel in `ci.yml` is één expressie en een volgende bewerking zet hem zo
 *    terug op `true`.
 *
 * ⚠️⚠️ **Sinds 22-09-2026 toetst hij twee dingen, want de eerste was de halve
 *    belofte — QS8-582.** `cancel-in-progress: false` beschermt de **lopende**
 *    run. De **wachtende** beschermt hij niet: GitHub houdt per concurrency-groep
 *    maar één run in de wachtrij, en een volgende run in diezelfde groep
 *    annuleert die wachtende, ook met afbreken uit.
 *
 *    📏 Gemeten op 21-09-2026 op `main`, uit de GitHub-API:
 *
 *      20:28:42  run 2962  152c0321  LOOPT tot 20:36:36
 *      20:33:23  run 2965  e6cc6e2e  wacht  → afgebroken om 20:33:32 door 2966
 *      20:33:31  run 2966  339f6530  wacht  → afgebroken om 20:33:40 door 2967
 *      20:33:38  run 2967  28542c7c  wacht  → afgebroken om 20:36:37 door 2969
 *
 *    **Deze controle stond daarbij terecht op groen.** De regel die hij toetste
 *    was juist; de belofte eronder — *elke toestand van `main` krijgt een
 *    uitslag* — brak een laag verderop. Dat is vraag 3 van onwrikbare regel 18 in
 *    zijn zuiverste vorm: een toets die groen blijft terwijl de belofte breekt.
 *
 * ⚠️ **Daarom nu ook de `group:`, en tweezijdig.** Op `main` moet de groep per
 *    commit verschillen (dan is er geen wachtrij om uit geduwd te worden); buiten
 *    `main` moet hij dat juist **niet** (anders kan `cancel-in-progress` nooit
 *    iets afbreken en is die regel dode letter). Eén kant toetsen laat de andere
 *    vrij — zelfde rateleigenschap als `regel15:controle`.
 *
 * ⚠️ **Wat deze controle níet dekt:** een commit die zijn uitslag al kwijt is.
 *    Dat is een stand en geen regel, en die leest `npm run hoofdrun:stand` uit de
 *    GitHub-API — die meldt sinds QS8-582 elke commit op `main` zonder afgeronde
 *    uitslag. Een grendel die alleen in een comment staat is QS8-412; deze zin
 *    wijst naar een grendel die bestaat en die `tests/scripts/hoofdrun-stand.test.ts`
 *    ijkt.
 *
 * Draaien: `npm run hoofdrun:controle`. Hoort mee in `npm run poort`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(WORTEL, '.github', 'workflows');

/**
 * Draait deze workflow ooit op `main`?
 *
 * ⚠️ Bewust ruim: `branches: ['**']` dekt `main` óók, en dat is precies het
 *    geval dat `ci.yml` had. Een workflow die alleen op `pull_request` draait
 *    raakt `main` niet — daar is afbreken juist goed.
 */
export function draaitOpMain(inhoud) {
  const pushBlok = /(^|\n)\s{2}push:\s*\n([\s\S]*?)(?=\n\s{2}\S|\n\S|$)/.exec(inhoud);
  if (!pushBlok) return false;
  const branches = /branches:\s*\[([^\]]*)\]/.exec(pushBlok[2]);
  if (!branches) return true; // `push:` zonder branchfilter draait overal, dus ook op main
  return /(^|,)\s*'?"?(\*\*|main)'?"?\s*(,|$)/.test(branches[1]);
}

/**
 * De letterlijke waarde achter `cancel-in-progress:`, of `null` als hij ontbreekt.
 * Ontbreken is veilig: GitHub's standaard is niet afbreken.
 *
 * ⚠️⚠️ **Hij leest het `concurrency:`-blok en niet het hele bestand, en dat is
 *    sinds 22-09-2026 zo (QS8-582).** Hiervóór stond hier
 *    `/cancel-in-progress:\\s*(.+)/` over de volledige inhoud, en dat is precies
 *    de knip-klasse van QS8-412: 📏 toen deze ronde een kop in `ci.yml` bijzette
 *    die de sleutel uitlégt, werd de controle rood op zijn eigen uitleg —
 *    ``cancel-in-progress: false` beschermt de **lopende** run; de``. De uitslag
 *    wees de verkeerde kant op, maar de richting was veilig: een vals alarm, geen
 *    stil doorlaten. De grendel die dát vasthoudt staat in
 *    `tests/scripts/hoofdrun-controle.test.ts`.
 */
export function cancelRegel(inhoud) {
  return sleutelInBlok(inhoud, 'cancel-in-progress');
}

/**
 * Breekt deze waarde een run op `main` af?
 *
 * ⚠️ `true` is onvoorwaardelijk en dus fout zodra de workflow op `main` draait.
 *    `false` is altijd goed. Een expressie is goed **als hij `main` noemt** —
 *    dat is smal met opzet: een expressie die `main` niet noemt kan niet op
 *    `main` uitzonderen, hoe hij verder ook luidt.
 */
export function breektMainAf(waarde) {
  if (waarde === null || waarde === 'false') return false;
  if (waarde === 'true') return true;
  return !/refs\/heads\/main|'main'|"main"/.test(waarde);
}

/**
 * Het `concurrency:`-blok, zonder commentaarregels — of `null` als het ontbreekt.
 *
 * ⚠️ **Het blok en niet het hele bestand, en dat is geen netheid.** De kop van
 *    `ci.yml` legt `group:` en `cancel-in-progress:` uit en noemt ze dus
 *    letterlijk; een lezer die het hele bestand afzoekt, leest die uitleg als
 *    instelling. Dat is de klasse van QS8-412: de knip die een controle scherp
 *    houdt, is zelf een grendel.
 */
export function concurrencyBlok(inhoud) {
  const blok = /(^|\n)concurrency:[ \t]*\n((?:[ \t]+[^\n]*\n?)*)/.exec(inhoud);
  if (!blok) return null;
  return blok[2]
    .split('\n')
    .filter((regel) => !/^\s*#/.test(regel))
    .join('\n');
}

/** De letterlijke waarde achter een sleutel binnen dat blok, of `null`. */
export function sleutelInBlok(inhoud, sleutel) {
  const blok = concurrencyBlok(inhoud);
  if (blok === null) return null;
  const m = new RegExp(`^[ \\t]*${sleutel}:[ \\t]*(.+?)[ \\t]*$`, 'm').exec(blok);
  return m ? m[1] : null;
}

/** De letterlijke waarde achter `group:` binnen dat blok, of `null`. */
export function groepRegel(inhoud) {
  return sleutelInBlok(inhoud, 'group');
}

/**
 * De tokens van een GitHub-expressie, of `null` bij een vorm die we niet kennen.
 *
 * ⚠️ **`null` betekent hier "onbekend" en nooit "in orde".** Alles wat hierna op
 *    onbekend uitkomt, telt als bevinding — de controle faalt dicht, net als
 *    `sleutelzetters()`. Een expressie die dit stuk gereedschap niet leest, is
 *    een expressie waarvan niemand kan zeggen of hij de wachtrij dichthoudt.
 */
export function tokeniseer(tekst) {
  const patroon = /==|!=|&&|\|\||\(|\)|,|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.]*/g;
  const tokens = tekst.match(patroon) ?? [];
  return tekst.replace(patroon, '').trim() === '' ? tokens : null;
}

/** De waarheidswaarde zoals GitHub hem leest: '', false, 0 en null zijn onwaar. */
function waarheid(waarde) {
  return !(waarde === '' || waarde === false || waarde === 0 || waarde === null);
}

/** De tekstweergave zoals GitHub hem in een groepsnaam zet. */
function alsTekst(waarde) {
  return String(waarde);
}

/**
 * De waarde van een contextpad.
 *
 * ⚠️ Bewust smal: alleen wat de aanroeper meegeeft. Een onbekend pad maakt de
 *    expressie onleesbaar en dus een bevinding, want een groep die op iets leunt
 *    wat wij niet kunnen invullen, kunnen wij ook niet nalopen.
 */
function contextWaarde(pad, context) {
  if (!Object.hasOwn(context, pad)) throw new Error(`onbekend contextpad: ${pad}`);
  return context[pad];
}

function verwacht(staat, token) {
  if (staat.tokens[staat.i] !== token) throw new Error(`${token} verwacht`);
  staat.i += 1;
}

function formatAanroep(staat) {
  verwacht(staat, '(');
  const argumenten = [ofExpressie(staat)];
  while (staat.tokens[staat.i] === ',') {
    staat.i += 1;
    argumenten.push(ofExpressie(staat));
  }
  verwacht(staat, ')');
  const [sjabloon, ...rest] = argumenten;
  if (typeof sjabloon !== 'string') throw new Error('format() zonder tekstsjabloon');
  return sjabloon.replace(/\{(\d+)\}/g, (_, n) => alsTekst(rest[Number(n)]));
}

function primair(staat) {
  const token = staat.tokens[staat.i];
  staat.i += 1;
  if (token === undefined) throw new Error('expressie houdt te vroeg op');
  if (token === '(') {
    const waarde = ofExpressie(staat);
    verwacht(staat, ')');
    return waarde;
  }
  if (token.startsWith("'")) return token.slice(1, -1).replace(/''/g, "'");
  if (token === 'format') return formatAanroep(staat);
  if (token === 'true') return true;
  if (token === 'false') return false;
  return contextWaarde(token, staat.context);
}

function vergelijking(staat) {
  const links = primair(staat);
  const operator = staat.tokens[staat.i];
  if (operator !== '==' && operator !== '!=') return links;
  staat.i += 1;
  const rechts = primair(staat);
  return operator === '==' ? links === rechts : links !== rechts;
}

function enExpressie(staat) {
  let waarde = vergelijking(staat);
  while (staat.tokens[staat.i] === '&&') {
    staat.i += 1;
    const rechts = vergelijking(staat);
    waarde = waarheid(waarde) ? rechts : waarde;
  }
  return waarde;
}

function ofExpressie(staat) {
  let waarde = enExpressie(staat);
  while (staat.tokens[staat.i] === '||') {
    staat.i += 1;
    const rechts = enExpressie(staat);
    waarde = waarheid(waarde) ? waarde : rechts;
  }
  return waarde;
}

/**
 * De groepsnaam zoals GitHub hem voor deze context zou uitrekenen, of `null` als
 * de expressie niet te lezen is.
 *
 * ⚠️⚠️ **Dit rekent de expressie écht uit in plaats van hem op een woord te
 *    herkennen, en dat is het verschil tussen een grendel en een vinkje.** Een
 *    regel als *"de groep moet `github.sha` noemen"* laat
 *    `ci-${{ github.ref != 'refs/heads/main' && github.sha || '' }}` door: die
 *    noemt `github.sha` en splitst precies overál behalve op `main`. Dat is geen
 *    bedacht randgeval maar de meest waarschijnlijke misverbetering van de regel
 *    die er nu staat — de `!=` staat in `ci.yml` één regel lager.
 */
export function evalueerGroep(waarde, context) {
  try {
    return waarde.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expressie) => {
      const tokens = tokeniseer(expressie);
      if (tokens === null) throw new Error(`onleesbare expressie: ${expressie.trim()}`);
      const staat = { tokens, i: 0, context };
      const uitkomst = ofExpressie(staat);
      if (staat.i !== tokens.length) throw new Error('er blijft iets over');
      return alsTekst(uitkomst);
    });
  } catch {
    return null;
  }
}

const MAIN = 'refs/heads/main';
const TAK = 'refs/heads/quintenstrijdonk/qs8-0-een-tak';

/** Twee commits die alleen in hun sha en run-id verschillen. */
function commit(letter, nummer) {
  return { 'github.sha': letter.repeat(40), 'github.run_id': String(nummer) };
}

function groepenVoor(waarde, ref) {
  return [
    evalueerGroep(waarde, { 'github.ref': ref, ...commit('a', 1) }),
    evalueerGroep(waarde, { 'github.ref': ref, ...commit('b', 2) }),
  ];
}

/**
 * Delen twee verschillende commits op `main` dezelfde concurrency-groep?
 *
 * Zo ja, dan is er een wachtrij van één plek diep en duwt elke volgende merge
 * zijn voorganger eruit — de blinde vlek van QS8-582.
 *
 * ⚠️ Géén `concurrency:`-blok is hier goed: zonder groep is er niets om in te
 *    wachten. Dat is dezelfde vorm als `breektMainAf(null)`.
 */
export function deeltGroepOpMain(waarde) {
  if (waarde === null) return false;
  const [a, b] = groepenVoor(waarde, MAIN);
  if (a === null || b === null) return true;
  return a === b;
}

/**
 * Krijgen twee opeenvolgende pushes op dezelfde featurebranch elk een eigen
 * groep?
 *
 * Zo ja, dan kan `cancel-in-progress` daar nooit iets afbreken en is die regel
 * dode letter — de andere kant van dezelfde ratel.
 */
export function splitstGroepBuitenMain(waarde) {
  if (waarde === null) return false;
  const [a, b] = groepenVoor(waarde, TAK);
  if (a === null || b === null) return true;
  return a !== b;
}

/**
 * De drie eigenschappen die een workflow op `main` moet hebben, elk met de
 * sleutel die hem draagt.
 *
 * ⚠️ **`wachtrij` en `featurebranch` lezen dezelfde sleutel en zijn tóch twee
 *    toetsen.** Ze wijzen naar tegengestelde kanten: de groep moet op `main`
 *    splitsen en daarbuiten juist niet. Eén toets die beide kanten samenvat, laat
 *    de andere kant vrij zodra iemand de eerste repareert.
 */
const TOETSEN = Object.freeze([
  { soort: 'afbreken', sleutel: 'cancel-in-progress', lees: cancelRegel, fout: breektMainAf },
  { soort: 'wachtrij', sleutel: 'group', lees: groepRegel, fout: deeltGroepOpMain },
  { soort: 'featurebranch', sleutel: 'group', lees: groepRegel, fout: splitstGroepBuitenMain },
]);

function bevindingenVoor(naam, inhoud) {
  const uit = [];
  for (const toets of TOETSEN) {
    const waarde = toets.lees(inhoud);
    if (toets.fout(waarde)) uit.push({ naam, soort: toets.soort, sleutel: toets.sleutel, waarde });
  }
  return uit;
}

export function bevindingen() {
  const uit = [];
  for (const naam of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n))) {
    const inhoud = readFileSync(join(WORKFLOWS, naam), 'utf8');
    if (!draaitOpMain(inhoud)) continue;
    uit.push(...bevindingenVoor(naam, inhoud));
  }
  return uit;
}

const UITLEG = Object.freeze({
  afbreken: [
    'Op een featurebranch is afbreken juist — een nieuwe push maakt de vorige',
    'commit achterhaald. Op `main` is elke commit een toestand die uitgerold',
    'wordt, en een afgebroken run laat die toestand zonder uitslag achter: niet',
    'groen, niet rood, er niet. Zo bleef op 07-09-2026 de run over de commit',
    'waarin de eerste van twee migraties `0182` landde onafgerond. Zie QS8-318.',
    '',
    "De vorm die wél klopt:  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
  ],
  wachtrij: [
    'Twee verschillende commits op `main` krijgen dezelfde concurrency-groep, of',
    'de groep is niet te lezen. GitHub houdt per groep maar één run in de',
    'wachtrij, en een volgende run annuleert de wachtende — ook met',
    '`cancel-in-progress: false`. 📏 Zo verloren op 21-09-2026 drie commits op',
    '`main` binnen vijftien seconden hun uitslag (runs 2965, 2966, 2967). Zie',
    'QS8-582.',
    '',
    'De vorm die wél klopt:',
    "  group: ci-${{ github.ref }}${{ github.ref == 'refs/heads/main' && format('-{0}', github.sha) || '' }}",
  ],
  featurebranch: [
    'Buiten `main` krijgt elke push een eigen concurrency-groep, of de groep is',
    'niet te lezen. Dan kan `cancel-in-progress` daar nooit iets afbreken en is',
    'die regel dode letter: elke achterhaalde commit draait alsnog zijn volle',
    'suite uit. Dit is de andere kant van dezelfde ratel — zie QS8-582.',
    '',
    'Buiten `main` hoort de groep per ref te zijn en niet per commit.',
  ],
});

function main() {
  const gevonden = bevindingen();

  if (gevonden.length === 0) {
    console.log('hoofdrun-controle: geen workflow verliest een uitslag op main.');
    process.exit(0);
  }

  console.error('hoofdrun-controle: een commit op `main` kan zonder uitslag blijven.\n');
  for (const { naam, soort, sleutel, waarde } of gevonden) {
    console.error(`  - .github/workflows/${naam}  [${soort}]  ${sleutel}: ${waarde}`);
  }
  for (const soort of new Set(gevonden.map((b) => b.soort))) {
    console.error(['', ...UITLEG[soort]].join('\n'));
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
