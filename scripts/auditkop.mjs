#!/usr/bin/env node
/**
 * De kop van `/audit` leest dezelfde bron als CI — QS8-598.
 *
 * ⚠️⚠️ **Deze generator bestaat omdat de kop het zelf voorspelde.** Er stond,
 *    woordelijk: *"Wie zo'n opsomming met de hand onderhoudt, onderhoudt hem
 *    niet — dit hoort een gegenereerde regel te zijn, zoals het stand-blok in
 *    WERKVOORRAAD §2."* Die machinerie kwam er in QS8-417; de kop van `/audit`
 *    was het laatste stuk dat de bron niet las.
 *
 * 📏 **Wat dat kostte, gemeten op 24-09-2026.** De tabel was nagemeten op
 *    31-08 en zei: 23 van de 26 controles in CI, drie erbuiten, en
 *    `stand:controle` *"staat er gewoon niet in, en dat is waarschijnlijk een
 *    omissie"*. In werkelijkheid draaiden er **64 van de 74** in CI, stonden er
 *    **tien** buiten, en draait `stand:controle` sinds QS8-417 gewoon mee in
 *    baan `repo`. Die ene zin heeft de audit van die dag een verkeerde bevinding
 *    laten rapporteren.
 *
 * ⚠️ **De instantie bijwerken is niet de reparatie**, en dat is hier geen
 *    theorie: op 31-08 is dat gedáán — `register:controle` en `vapid:controle`
 *    eruit, het getal bijgesteld — en drie weken later stond er weer iets
 *    onwaars. Zelfde vorm als QS8-417 zelf: een reparatie die de instanties
 *    opruimt en het mechanisme laat staan, groeit terug.
 *
 * Draaien: `npm run auditkop` schrijft het blok, `npm run auditkop:controle`
 * zegt alleen of het achterloopt en draait mee in de poort en in CI.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verdeel, ZONDER_CI } from './ci-controles.mjs';
import { controlesUit } from './poort.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const DOCUMENT = '.claude/commands/audit.md';

export const BEGIN = '<!-- AUDITKOP:BEGIN — gegenereerd door `npm run auditkop` -->';
export const EINDE = '<!-- AUDITKOP:EINDE -->';

/**
 * De regels zoals ze in de kop horen te staan.
 *
 * ⚠️ Geen datum erin, om dezelfde reden als bij het stand-blok: een gegenereerd
 *    blok met "bijgewerkt op vandaag" verandert elke dag zonder dat er iets
 *    veranderd is, en dan is de conflictbron terug — alleen nu met een stempel
 *    die betrouwbaar oogt.
 *
 * ⚠️ De redenen komen letterlijk uit `ZONDER_CI` en worden hier niet
 *    herschreven. Twee plekken die hetzelfde uitleggen, lopen uiteen.
 */
export function auditkopRegels(controles, register = ZONDER_CI) {
  const { repo, database, zonder } = verdeel(controles, undefined, register);
  const inCi = repo.length + database.length;
  const rijen = zonder
    .slice()
    .sort()
    .map((naam) => `> | \`${naam}\` | ${(register[naam] ?? '').replace(/\|/g, '\\|')} |`);

  return [
    `> De meeste controles draaien in CI, bij elke push: **${inCi} van de ${controles.length}**`,
    `> (${repo.length} op de repo, ${database.length} op de database). Deze audit hoeft die`,
    '> niet over te doen; ga er langs als een uitkomst je verbaast, en besteed de tijd',
    `> aan de **${zonder.length}** die CI niet kan draaien.`,
    '>',
    '> | Niet in CI | Waarom |',
    '> |---|---|',
    ...rijen,
  ].join('\n');
}

export function blokUit(document) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1) return null;
  return document.slice(van + BEGIN.length, tot).trim();
}

export function vervangBlok(document, tekst) {
  const van = document.indexOf(BEGIN);
  const tot = document.indexOf(EINDE);
  if (van === -1 || tot === -1) {
    throw new Error(`De markeringen ${BEGIN} … ${EINDE} staan niet in ${DOCUMENT}.`);
  }
  return `${document.slice(0, van + BEGIN.length)}\n${tekst}\n${document.slice(tot)}`;
}

/* c8 ignore start */
function hoofd() {
  const alleenControleren = process.argv.includes('--controle');
  const pad = join(WORTEL, DOCUMENT);
  const document = readFileSync(pad, 'utf8');
  const scripts = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8')).scripts;
  const verwacht = auditkopRegels(controlesUit(scripts));
  const huidig = blokUit(document);

  if (huidig === verwacht) {
    if (!alleenControleren) process.stdout.write('auditkop: het blok klopt al.\n');
    return 0;
  }

  if (alleenControleren) {
    process.stderr.write(`✗ Het auditkop-blok in ${DOCUMENT} loopt achter op de poort.\n\n`);
    process.stderr.write(`  er staat:\n${(huidig ?? '(geen blok gevonden)').replace(/^/gm, '    ')}\n\n`);
    process.stderr.write(`  het hoort te zijn:\n${verwacht.replace(/^/gm, '    ')}\n\n`);
    process.stderr.write(
      'Draai `npm run auditkop`. Met de hand bijwerken heeft geen zin — dit blok is\n' +
        'een kopie van de indeling uit `scripts/ci-controles.mjs`, en hoort er ook een\n' +
        'te blijven. 📏 De vorige handmatige versie stond drie weken onwaar en liet een\n' +
        'audit een verkeerde bevinding rapporteren. Zie QS8-598.\n',
    );
    return 1;
  }

  writeFileSync(pad, vervangBlok(document, verwacht));
  process.stdout.write(`✓ auditkop-blok bijgewerkt in ${DOCUMENT}.\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
/* c8 ignore stop */
