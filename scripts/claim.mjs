#!/usr/bin/env node
/**
 * Een issue bezetten met een lege branch op de remote — QS8-294, QS8-449.
 *
 * ⚠️ **Waarom dit bestaat.** Op 06-09-2026 hebben twee sessies **drie keer**
 *    hetzelfde issue gebouwd (QS8-287, QS8-286, QS8-214). Elke keer was het werk
 *    af voordat de botsing zichtbaar werd, en elke keer faalde een rem die er al
 *    was:
 *
 *    - *"Zet het issue op In Progress vóór je begint."* Bij QS8-214 is dat
 *      gedáán, om 11:34, vóór de eerste regel code — en de andere sessie begon
 *      daarna alsnog. **Een status die de ander niet leest, is geen rem.**
 *    - *"Kijk naar `git branch -r`."* Bij QS8-287 lág de branch er, mét PR, en
 *      is die PR gelezen als de éigen PR omdat het issuenummer klopte.
 *    - `migratie:nieuw` fetcht zelf en zou het gezien hebben — maar die draait
 *      alleen als er een migratie in het spel is, en QS8-214 had er geen.
 *
 * ⚠️ **Het signaal dat wél gelezen wordt, is de remote branchlijst.** Beide
 *    sessies draaien `git ls-remote` toch al, want `migratie:nieuw` en
 *    `migraties:controle` leunen erop. Een lege branch met de juiste naam is
 *    daarom de goedkoopste claim die aankomt.
 *
 * ⚠️ **Dit script fetcht, en dat is geen keuze.** CLAUDE.md deelt scripts in
 *    tweeën: wie een nummer *uitdeelt* fetcht, wie *controleert* niet. Een claim
 *    deelt uit — een verouderd beeld geeft hier het verkeerde antwoord, namelijk
 *    "vrij" terwijl er al iemand zit. Zelfde reden en dezelfde helpers als
 *    `migratie-nieuw.mjs`.
 *
 * ⚠️ **En de eerlijke helft: dit werkt alleen als de ánder kijkt.** Een claim is
 *    een afspraak en geen slot; niets in git houdt een tweede branch tegen. Zodra
 *    hij eenzijdig gebruikt wordt is hij geen rem meer maar een logboek. Daarom
 *    staat de stap ook in `CLAUDE.md` bij Versiebeheer en in de startprompt.
 *
 * ## ⚠️⚠️ Twee bronnen, want de branchlijst is een neveneffect — QS8-449
 *
 * De branchlijst beantwoordt *"zit hier iemand"*. Ze werd hier ook gelezen als
 * antwoord op *"is dit al gebouwd"*, en dat is ze niet: een gelande branch die
 * na de merge is opgeruimd, laat niets achter om tegenaan te botsen. 📏 Op
 * 13-09-2026 heeft deze claim daardoor twee keer een issue vrijgegeven dat de
 * dag ervoor af en gemerged was — QS8-437 en QS8-438. Van beide stond de branch
 * niet meer op de remote.
 *
 * ⚠️ **Dat is het spiegelbeeld van QS8-240**, waar een branch die níet weg kan
 *    juist bezetting voorwendt die er niet is. Twee foutrichtingen op dezelfde
 *    bron maken het een eigenschap van het mechanisme en niet twee ongelukken.
 *
 * De tweede bron is de **geschiedenis van `origin/main`**: een gelande PR laat
 * daar een onderwerpregel achter, en die verdwijnt niet als iemand opruimt.
 * Geen token, geen extra netwerkaanroep — de fetch hierboven staat er al.
 *
 * ⚠️ **En het verschil in gewicht is een besluit.** Een branch is bezetting
 *    *nu*: die weigert hard. Gelande geschiedenis kán ook een afgerond issue met
 *    een echt vervolg zijn — 📏 gemeten op 13-09-2026: van 22 open issues gaven
 *    er drie een treffer (QS8-216, QS8-243, QS8-433) en alle drie terecht, want
 *    daar ís werk voor geland. Die mag dus niet hard weigeren, maar hij mag de
 *    branch ook niet neerzetten: de schade van QS8-449 ontstond juist doordat de
 *    push vóór het lezen kwam. Dus: **niet pushen, melden, en `--vervolg` als
 *    expliciete uitweg** die in de claim-commit belandt.
 *
 * Uitleg in `docs/decisions/2026-09-13-een-opgeruimde-branch-is-geen-vrij-issue.md`.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

import { haalRemoteOp, versheidsmelding } from './migratiebranches.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Het teamvoorvoegsel dat Linear voor dit project uitdeelt. */
export const TEAM = 'qs8';

/**
 * Het issuenummer uit wat de gebruiker intypte.
 *
 * Slikt `QS8-123`, `qs8-123`, `#QS8-123`, een kaal `123`, en een volledige
 * branchnaam waar `qs8-123-` in staat.
 *
 * ⚠️ **Geen `parseInt` op de hele string.** `parseInt('qs8-123')` geeft `NaN`
 *    en `parseInt('123abc')` geeft `123` — allebei fout voor wat hier nodig is.
 */
export function nummerUit(argument) {
  const tekst = String(argument ?? '').trim();
  if (tekst === '') return null;

  const metTeam = new RegExp(`(?:^|[/#\\s])${TEAM}-(\\d+)(?=-|$|\\s)`, 'i').exec(tekst);
  if (metTeam !== null) return Number(metTeam[1]);

  return /^\d+$/.test(tekst) ? Number(tekst) : null;
}

/**
 * Welke van deze refs bij dít issue horen.
 *
 * ⚠️ **Op het nummer en niet op de naam.** Bij QS8-287 stonden er twee branches
 *    met verschillende slugs — `qs8-287-verdien-badges-zonder-autorisatietoets`
 *    naast `qs8-287-verdien_badges-heeft-geen-autorisatietoets` — omdat Linear
 *    zijn slug uit de titel maakt en die titel veranderd was. Een vergelijking
 *    op de volledige naam had die botsing gemist; dat is precies de botsing die
 *    dit script moet vinden.
 *
 * ⚠️ **En de andere kant op: `qs8-1234-` is niet `qs8-123`.** Zonder die grens
 *    slaat de claim alarm op een vreemd issue, en een claim die te vaak alarm
 *    slaat leer je overslaan — dezelfde afweging als bij elke controle hier.
 */
export function botsendeBranches(nummer, refs) {
  const patroon = new RegExp(`(?:^|/)${TEAM}-${nummer}(?:-|$)`, 'i');
  return refs.filter((ref) => patroon.test(ref));
}

/**
 * Is deze onderwerpregel er een van een **gelande** PR?
 *
 * Twee vormen, en dat zijn de enige twee waarin werk op `main` belandt:
 *
 *     Merge pull request #440 — <titel> (QS8-447)     <- merge-commit
 *     <titel> (QS8-294) (#232)                        <- squash
 *
 * ⚠️ **De smalte is het hele punt.** 📏 Gemeten op 13-09-2026 over 1109
 *    onderwerpregels: zonder deze twee vormen noemde **14 van de 22** open
 *    issues wel érgens een commit, want dit project verwijst in elke
 *    commit-tekst naar andere issues. Mét deze vormen zijn het er **drie**, en
 *    die drie zijn alle drie terecht. Een controle die alles meldt, leer je te
 *    negeren.
 *
 * ⚠️ **Een merge van `main` ín een branch valt hier buiten**, en dat hóórt: die
 *    draagt het nummer waar iemand *aan werkt*, niet wat er geland is. 📏 Er
 *    staan er 128 van op `main`.
 */
export function isGelandeVorm(onderwerp) {
  return /^Merge pull request /.test(onderwerp) || /\(#\d+\)\s*$/.test(onderwerp);
}

/**
 * De gelande onderwerpregels die dít issuenummer noemen.
 *
 * ⚠️ De linkergrens zit in het letterlijke `qs8-`: `qs8-1449` bevat geen
 *    `qs8-449`. De rechtergrens is `(?![0-9])`, anders is `QS8-4491` een
 *    treffer op 449.
 */
export function gelandVoor(nummer, onderwerpen) {
  const patroon = new RegExp(`${TEAM}-${nummer}(?![0-9])`, 'i');
  return onderwerpen.filter((regel) => isGelandeVorm(regel) && patroon.test(regel));
}

function git(argumenten) {
  return execFileSync('git', argumenten, { cwd: WORTEL, encoding: 'utf8' });
}

/**
 * Alle branchnamen die de remote kent.
 *
 * ⚠️ **Ook de gelande, en dat is een besluit — QS8-313.** `migraties:controle`
 *    slaat een branch die volledig in `origin/main` zit sinds die datum wél
 *    over, want daar is de vraag *"botst dit migratienummer met de map van nu"*
 *    en die map draagt zo'n migratie allang, onder zijn nieuwe nummer.
 *
 *    Hier is de vraag een ándere: *"heeft iemand dit issue al gebouwd"*. Een
 *    branch die er nog stáát is daar een sterk ja op.
 *
 * ⚠️⚠️ **Maar alleen zolang hij er staat, en dat stond hier eerst niet bij —
 *    QS8-449.** Hier heeft gestaan dat een gelande branch *"het sterkste ja is
 *    dat er is"*, met `npm run claim -- QS8-306` als meting eronder. Die meting
 *    klopte en bewees iets anders dan ze leek te bewijzen: ze werkte doordat
 *    díe branch na de merge was blijven staan. 📏 Bij QS8-437 en QS8-438 was
 *    dat niet zo, en toen gaf deze lijst allebei vrij. Daarom leest `hoofd()`
 *    er sinds dat issue `gelandVoor()` naast — zie de kop van dit bestand.
 *
 *    Uitleg in `docs/decisions/2026-09-07-een-gelande-branch-is-geen-botsing.md`.
 */
function remoteRefs() {
  return git(['ls-remote', '--heads', 'origin'])
    .split('\n')
    .map((regel) => regel.split('refs/heads/')[1])
    .filter((naam) => typeof naam === 'string' && naam !== '');
}

/** Elke onderwerpregel op `origin/main`, nieuwste eerst. */
function onderwerpenOpMain() {
  return git(['log', 'origin/main', '--format=%s']).split('\n').filter((regel) => regel !== '');
}

/** De branchlijst zegt dat hier iemand zit. Dat weigert hard. */
function meldBezet(nummer, botsingen) {
  console.error(`\n✗ claim: ${TEAM.toUpperCase()}-${nummer} is al bezet — ${botsingen.length} branch(es):`);
  for (const naam of botsingen) console.error(`    ${naam}`);
  console.error(
    '\n  Bouw dit issue niet. Kijk eerst wat daar staat; is het af of bijna af,\n' +
      '  dan is een tweede versie ervan weggegooid werk — dat is op 06-09 drie\n' +
      '  keer gebeurd. Blijkt er iets aan te ontbreken, dan is dat een\n' +
      '  vervolgissue op hún werk en geen eigen branch op hetzelfde issue.',
  );
}

/**
 * Er is werk voor dit issue geland. Dat weigert *deze keer*, zonder te pushen.
 *
 * ⚠️ De volgorde is het punt: geen branch op de remote vóór er gelezen is. Een
 *    claim-commit krijg je vanuit een cloudsessie niet meer weg (QS8-240).
 */
function meldGeland(nummer, gelande) {
  console.error(`\n✗ claim: er is al werk voor ${TEAM.toUpperCase()}-${nummer} op main geland.`);
  for (const regel of gelande) console.error(`    ${regel}`);
  console.error(
    '\n  Er staat geen branch meer — die is na de merge opgeruimd — dus de\n' +
      '  branchlijst zag dit issue als vrij. Op 13-09 is zo twee keer een af\n' +
      '  issue geclaimd (QS8-437, QS8-438).\n' +
      '\n  Er is nog niets gepusht. Lees eerst het issue ÉN zijn reacties (QS8-411):\n' +
      '  staat daar "af en gemerged", dan is dit issue klaar en zet je het op Done.\n' +
      '  Is er een echt vervolg — zoals bij QS8-243 en QS8-433, waar ook werk\n' +
      '  geland is terwijl het issue openstaat — claim dan met:\n' +
      `\n    npm run claim -- <branchnaam> --vervolg\n`,
  );
}

function zetClaim(naam, nummer, vervolg) {
  const nu = new Date().toISOString().slice(11, 16);
  const staart = vervolg
    ? '\n\nMet --vervolg gezet: er is al werk voor dit issue op main geland en de\nclaimende sessie heeft vastgesteld dat er een echt vervolg open staat.'
    : '';

  git(['checkout', '-b', naam, 'origin/main']);
  git([
    'commit',
    '--allow-empty',
    '-m',
    `claim: ${TEAM.toUpperCase()}-${nummer} — bezet sinds ${nu} UTC`,
    '-m',
    'Lege claim-commit, zie scripts/claim.mjs en QS8-294. Er werken twee sessies\n' +
      'in deze backlog; een branch op de remote is het enige signaal dat ze\n' +
      'allebei aantoonbaar lezen.' +
      staart,
  ]);
  git(['push', '-u', 'origin', naam]);
}

function hoofd() {
  const argumenten = process.argv.slice(2);
  const vervolg = argumenten.includes('--vervolg');
  const argument = argumenten.find((a) => !a.startsWith('--'));
  const nummer = nummerUit(argument);

  if (nummer === null) {
    console.error(
      '✗ claim: geen issuenummer herkend.\n' +
        '  Gebruik `npm run claim -- QS8-123`, of plak de branchnaam die Linear\n' +
        '  voorstelt: `npm run claim -- quintenstrijdonk/qs8-123-korte-titel`.',
    );
    process.exit(1);
  }

  for (const regel of versheidsmelding(haalRemoteOp())) console.log(regel);

  const botsingen = botsendeBranches(nummer, remoteRefs());
  if (botsingen.length > 0) {
    meldBezet(nummer, botsingen);
    process.exit(1);
  }

  const gelande = gelandVoor(nummer, onderwerpenOpMain());
  if (gelande.length > 0 && !vervolg) {
    meldGeland(nummer, gelande);
    process.exit(1);
  }

  const { naam, vanLinear } = claimNaam(argument, nummer);
  zetClaim(naam, nummer, gelande.length > 0);

  console.log(`\n✓ claim: ${TEAM.toUpperCase()}-${nummer} bezet op ${naam}`);
  if (gelande.length > 0) {
    console.log(`⚠ Met --vervolg gezet — er staat ${gelande.length} gelande PR op main voor dit issue.`);
  }
  if (!vanLinear) {
    console.log(
      '⚠ Dit is een terugvalnaam. Linear koppelt branch, PR en issue alleen\n' +
        '  automatisch aan elkaar bij de naam die hij zelf voorstelt — plak die\n' +
        '  volgende keer mee als argument.',
    );
  }
  console.log('  Zet het issue nu ook op In Progress in Linear.');
}

/**
 * De branchnaam om te claimen.
 *
 * Gaf de gebruiker een volledige naam mee (die van Linear), dan is dat de naam.
 * Anders een terugval — bruikbaar, maar Linear koppelt branch, PR en issue
 * alleen automatisch bij zíjn eigen naam, dus dat is het melden waard.
 */
export function claimNaam(argument, nummer) {
  const tekst = String(argument ?? '').trim();
  if (tekst.includes('/')) return { naam: tekst, vanLinear: true };
  return { naam: `quintenstrijdonk/${TEAM}-${nummer}-claim`, vanLinear: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hoofd();
