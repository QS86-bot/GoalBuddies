#!/usr/bin/env node
/**
 * De uurjobs hebben een hartslag — QS8-637.
 *
 * ⚠️⚠️ **Waarom dit bestaat: *niet draaien* produceert geen fout.**
 *    `rollover.yml` en `notificaties.yml` vragen elk om een run per uur, en
 *    GitHub's `schedule:` is best-effort. 📏 Gemeten op 05-10-2026 over de laatste
 *    zeven dagen: **31 runs per workflow in plaats van ~168**, dus 18,5%, met een
 *    gemiddeld interval van 5,3 uur en een grootste gat van 9,0 uur (rollover) en
 *    7,4 uur (notificaties). Elke run die wél vuurde was `success`. Geen enkel
 *    signaal dat dit project had, kon daar rood van worden: een run die er niet
 *    is, is dezelfde klasse als de uitslag die er niet was
 *    (`docs/decisions/2026-09-07-de-uitslag-die-er-niet-was.md`).
 *
 * ⚠️ **De hartslag is de runlijst van GitHub zelf, en dat is met opzet.** Een
 *    workflow is alleen `success` als de Edge Function `200` én `"ok":true`
 *    teruggaf (zie de laatste stap van `rollover.yml`), dus een geslaagde run ís
 *    het bewijs dat de job gelopen heeft. Een eigen hartslag in de database
 *    vraagt een migratie, een wijziging in beide functies en een deploy — en
 *    deployen kan vanuit een bouwsessie niet. De afweging staat in
 *    `docs/decisions/2026-10-05-schedule-is-best-effort-en-de-hartslag-is-de-runlijst.md`.
 *
 * ⚠️ **De getolereerde vertraging is `GETOLEREERDE_VERTRAGING_UUR` en dat is een
 *    ander budget dan `GRACE_HOURS`.** De coulance (12 uur) is er voor de
 *    gebruiker die zijn week te laat afsluit; de rollover mag een cyclus pas
 *    afschrijven ná die 12 uur (`closableUserCycle()`), en een trage job schuift
 *    het afschrijven dus *later* maar nooit *eerder*. De twee tellen op: het
 *    laatste moment waarop een gemiste week is afgeschreven ligt hoogstens
 *    `GRACE_HOURS` + `GETOLEREERDE_VERTRAGING_UUR` na de cyclusgrens.
 *
 * Wat hij vindt: de lijst uurjobs leidt hij **af** uit `.github/workflows/` — een
 * workflow met een `schedule:` waarvan de cron elk uur vuurt — en niet uit een
 * opsomming. Een derde uurjob wordt zo vanzelf bewaakt.
 *
 * Wat hij niet kan, en dat staat erbij: hij meet alleen als iemand hem draait.
 * Daarom staat hij naast een eigen geplande workflow (`uurjobs.yml`), waarvan een
 * rode run door GitHub gemaild wordt — dat is het signaal. Die workflow is zelf
 * een `schedule:` en dus zelf best-effort; wie bewaakt de bewaker? Niemand, en
 * dat is een gemeten grens en geen vergeten stap.
 *
 * Zonder netwerk (of met een afgewezen token, of een gedeeld IP dat tegen de
 * rate limit zit) meet hij niets: dan gaat er een `OVERGESLAGEN` naar stderr en
 * is de exitcode 0. De poort telt hem dan als *ongemeten*, niet als groen.
 *
 * Gebruik: `npm run uurjobs:controle` (optioneel `GITHUB_TOKEN`; in een
 * cloudsessie `NODE_USE_ENV_PROXY=1`, anders gaat Node niet langs de proxy).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(WORTEL, '.github', 'workflows');

/**
 * Hoe lang een uurjob mag uitblijven voordat dat een bevinding is.
 *
 * 📏 Gemeten op 05-10-2026 over zeven dagen: grootste gat 9,0 uur. Twaalf laat
 * drie uur marge zonder dat een gat van een halve dag onopgemerkt blijft.
 */
export const GETOLEREERDE_VERTRAGING_UUR = 12;

/** De workflow die de anderen bewaakt; die bewaakt zichzelf niet. */
export const BEWAKER = 'uurjobs.yml';

const UUR = 3_600_000;

/**
 * De uurjobs in een map: elke workflow met een `cron:`-regel die elk uur vuurt
 * (`<minuut> * * * *`).
 *
 * ⚠️ **De regel is verankerd aan het begin, en dat is wat een uitgecommentarieerde
 *    cron buiten houdt** — `# - cron: '0 * * * *'` begint met een `#` en matcht dus
 *    niet. 📏 Een aparte knip van commentaarregels was hier dode code: met de
 *    knip eruit blijft elke toets groen (gemeten bij de ijking, QS8-637). Wat
 *    wél moet kunnen is een commentaar *achter* de cron: een uurjob met
 *    `- cron: '5 * * * *' # elk uur` is er een, en een anker op het regeleinde
 *    zou hem missen.
 */
export function uurjobsUit(bestanden) {
  const gevonden = [];
  for (const [naam, tekst] of Object.entries(bestanden)) {
    if (naam === BEWAKER) continue;
    const elkUur = tekst
      .split('\n')
      .some((r) => /^\s*-?\s*cron:\s*['"]?\S+\s+\*\s+\*\s+\*\s+\*['"]?\s*(#.*)?$/.test(r));
    if (elkUur) gevonden.push(naam);
  }
  return gevonden.sort();
}

/**
 * Wat de runlijst van één workflow zegt.
 *
 * @param {{ event: string, created_at: string }[]} runs  alleen geslaagde runs
 * @param {number} nu  milliseconden
 */
export function beoordeelRuns(runs, nu, drempelUur = GETOLEREERDE_VERTRAGING_UUR) {
  const tijden = runs.map((r) => Date.parse(r.created_at)).sort((a, b) => b - a);
  if (tijden.length === 0) return { oordeel: 'geen', leeftijdUur: null };

  const leeftijdUur = (nu - tijden[0]) / UUR;
  const gepland = runs
    .filter((r) => r.event === 'schedule')
    .map((r) => Date.parse(r.created_at))
    .filter((t) => nu - t <= 7 * 24 * UUR)
    .sort((a, b) => a - b);
  const gaten = gepland.slice(1).map((t, i) => (t - gepland[i]) / UUR);
  const grootsteGatUur = gaten.length ? Math.max(...gaten) : null;

  return {
    oordeel: leeftijdUur > drempelUur ? 'te-oud' : 'ok',
    leeftijdUur,
    gepland7d: gepland.length,
    grootsteGatUur,
  };
}

/** Eén regel per workflow, in de vorm die de lezer nodig heeft om te besluiten. */
export function regelVoor(naam, b, drempelUur = GETOLEREERDE_VERTRAGING_UUR) {
  if (b.oordeel === 'geen') {
    return `✗ ${naam}: geen enkele geslaagde run gevonden — de job is nooit gelopen.`;
  }
  const leeftijd = b.leeftijdUur.toFixed(1);
  const ritme = `${b.gepland7d} geplande run(s) in 7 dagen (~168 verwacht)`;
  const gat = b.grootsteGatUur === null ? '' : `, grootste gat ${b.grootsteGatUur.toFixed(1)} u`;
  if (b.oordeel === 'te-oud') {
    return `✗ ${naam}: laatste geslaagde run is ${leeftijd} u geleden, getolereerd is ${drempelUur} u — ${ritme}${gat}.`;
  }
  return `  ${naam}: laatste geslaagde run ${leeftijd} u geleden (getolereerd ${drempelUur} u) — ${ritme}${gat}.`;
}

function leesWorkflows() {
  const uit = {};
  for (const naam of readdirSync(WORKFLOWS).filter((n) => /\.ya?ml$/.test(n))) {
    uit[naam] = readFileSync(join(WORKFLOWS, naam), 'utf8');
  }
  return uit;
}

/**
 * De geslaagde runs van één workflow, nieuwste eerst.
 *
 * ⚠️ Coderegel 14: elke externe call heeft een timeout. Een mislukte of
 *    afgewezen aanvraag wordt geen lege lijst maar een fout met de reden — een
 *    lege lijst is "de job is nooit gelopen", en dat is een bevinding die deze
 *    controle niet mag verzinnen.
 */
async function haalRuns(naam) {
  const repo = process.env.GITHUB_REPOSITORY || 'QS86-bot/GoalBuddies';
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${naam}/runs?status=success&per_page=100`;
  const antwoord = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const json = await antwoord.json().catch(() => ({}));
  if (!antwoord.ok || !Array.isArray(json.workflow_runs)) {
    throw new Error(`HTTP ${antwoord.status}: ${json.message ?? 'geen runlijst in het antwoord'}`);
  }
  return json.workflow_runs;
}

function meldOverslag(reden) {
  console.error(
    '⚠ uurjobs-controle: OVERGESLAGEN — de runlijst van GitHub was niet op te halen.\n' +
      `  Reden: ${reden}\n` +
      '  Zonder die lijst valt er niets te zeggen over de hartslag van de uurjobs. Dat is\n' +
      '  geen groene uitslag maar een ongemeten. Een verlopen `GITHUB_TOKEN` geeft 401\n' +
      '  (haal hem weg); zonder token geldt de anonieme limiet, en in een cloudsessie\n' +
      '  gaat Node alleen langs de proxy met `NODE_USE_ENV_PROXY=1`.',
  );
}

/**
 * @param {() => Record<string, string>} leesBestanden  de workflows, naam → tekst
 * @param {(naam: string) => Promise<object[]>} haal  de geslaagde runs van één workflow
 */
export async function hoofd(leesBestanden = leesWorkflows, haal = haalRuns, nu = Date.now()) {
  const jobs = uurjobsUit(leesBestanden());
  if (jobs.length === 0) {
    console.error('✗ uurjobs-controle: er is geen enkele uurjob gevonden in .github/workflows/.');
    return 1;
  }

  const regels = [];
  let rood = false;
  for (const naam of jobs) {
    let runs;
    try {
      runs = await haal(naam);
    } catch (fout) {
      meldOverslag(String(fout?.message ?? fout));
      return 0;
    }
    const b = beoordeelRuns(runs, nu);
    rood ||= b.oordeel !== 'ok';
    regels.push(regelVoor(naam, b));
  }

  for (const r of regels) (r.startsWith('✗') ? console.error : console.log)(r);
  if (!rood) console.log(`uurjobs-controle: ${jobs.length} uurjob(s) hebben binnen ${GETOLEREERDE_VERTRAGING_UUR} u gelopen.`);
  return rood ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  hoofd().then((code) => process.exit(code));
}
