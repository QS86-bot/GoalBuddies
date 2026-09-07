#!/usr/bin/env node
/**
 * Een issue bezetten met een lege branch op de remote — QS8-294.
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
 *    Hier is de vraag een ándere: *"heeft iemand dit issue al gebouwd"*. Op die
 *    vraag is een gelande branch juist het sterkste ja dat er is. 📏 Gemeten:
 *    `npm run claim -- QS8-306` weigert nadat dat issue gemerged en op Done
 *    gezet is, en dat hóórt. Blijkt er iets aan dat werk te ontbreken, dan is
 *    dat een vervolgissue en geen tweede branch op hetzelfde issue — zo is
 *    QS8-290 ontstaan.
 *
 *    Uitleg in `docs/decisions/2026-09-07-een-gelande-branch-is-geen-botsing.md`.
 */
function remoteRefs() {
  return git(['ls-remote', '--heads', 'origin'])
    .split('\n')
    .map((regel) => regel.split('refs/heads/')[1])
    .filter((naam) => typeof naam === 'string' && naam !== '');
}

function hoofd() {
  const argument = process.argv[2];
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
    console.error(
      `\n✗ claim: ${TEAM.toUpperCase()}-${nummer} is al bezet — ${botsingen.length} branch(es):`,
    );
    for (const naam of botsingen) console.error(`    ${naam}`);
    console.error(
      '\n  Bouw dit issue niet. Kijk eerst wat daar staat; is het af of bijna af,\n' +
        '  dan is een tweede versie ervan weggegooid werk — dat is op 06-09 drie\n' +
        '  keer gebeurd. Blijkt er iets aan te ontbreken, dan is dat een\n' +
        '  vervolgissue op hún werk en geen eigen branch op hetzelfde issue.',
    );
    process.exit(1);
  }

  const { naam, vanLinear } = claimNaam(argument, nummer);
  const nu = new Date().toISOString().slice(11, 16);

  git(['checkout', '-b', naam, 'origin/main']);
  git([
    'commit',
    '--allow-empty',
    '-m',
    `claim: ${TEAM.toUpperCase()}-${nummer} — bezet sinds ${nu} UTC`,
    '-m',
    'Lege claim-commit, zie scripts/claim.mjs en QS8-294. Er werken twee sessies\n' +
      'in deze backlog; een branch op de remote is het enige signaal dat ze\n' +
      'allebei aantoonbaar lezen.',
  ]);
  git(['push', '-u', 'origin', naam]);

  console.log(`\n✓ claim: ${TEAM.toUpperCase()}-${nummer} bezet op ${naam}`);
  if (!vanLinear) {
    console.log(
      '⚠ Dit is een terugvalnaam. Linear koppelt branch, PR en issue alleen\n' +
        '  automatisch aan elkaar bij de naam die hij zelf voorstelt — plak die\n' +
        '  volgende keer mee als argument.',
    );
  }
  console.log('  Zet het issue nu ook op In Progress in Linear.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hoofd();
