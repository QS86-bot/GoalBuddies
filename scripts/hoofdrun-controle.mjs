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
 */
export function cancelRegel(inhoud) {
  const m = /cancel-in-progress:\s*(.+)/.exec(inhoud);
  return m ? m[1].trim() : null;
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

export function bevindingen() {
  const uit = [];
  for (const naam of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n))) {
    const inhoud = readFileSync(join(WORKFLOWS, naam), 'utf8');
    if (!draaitOpMain(inhoud)) continue;
    const waarde = cancelRegel(inhoud);
    if (breektMainAf(waarde)) uit.push({ naam, waarde });
  }
  return uit;
}

function main() {
  const gevonden = bevindingen();

  if (gevonden.length === 0) {
    console.log('hoofdrun-controle: geen workflow breekt een run op main af.');
    process.exit(0);
  }

  console.error('hoofdrun-controle: een run op `main` kan worden afgebroken.\n');
  for (const { naam, waarde } of gevonden) {
    console.error(`  - .github/workflows/${naam}  cancel-in-progress: ${waarde}`);
  }
  console.error(
    '\nOp een featurebranch is afbreken juist — een nieuwe push maakt de vorige\n' +
      'commit achterhaald. Op `main` is elke commit een toestand die uitgerold\n' +
      'wordt, en een afgebroken run laat die toestand zonder uitslag achter: niet\n' +
      'groen, niet rood, er niet. Zo bleef op 07-09-2026 de run over de commit\n' +
      'waarin de eerste van twee migraties `0182` landde onafgerond. Zie QS8-318.\n' +
      "\nDe vorm die wél klopt:  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
