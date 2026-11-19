#!/usr/bin/env node
/**
 * De poort van `.github/workflows/deploy-web.yml` — QS8-718.
 *
 * Twee dingen, en alleen die twee:
 *
 *   1. de beslissingen die de workflow neemt vóór hij een geheim aanraakt
 *      (welke commit, staat hij op `main`, is `Alles groen` er geslaagd), als
 *      pure functies die los te voeden zijn;
 *   2. de bezwaren tegen de workflow zelf (`bezwaren()`), zodat een test hem kan
 *      inlezen en rood wordt als er een trigger of een lek bij komt.
 *
 * ⚠️ **Waarom dit een script is en geen `run:`-blok in de YAML.** Een beslissing
 *    in een shellregel is niet te ijken: je kunt haar niet voeden met "een
 *    mislukte run naast een geslaagde" zonder GitHub aan te roepen. Hier is de
 *    uitslag een functie van een lijst, en `tests/scripts/deploy-workflow.test.ts`
 *    biedt hem elke vorm aan. Dezelfde reden als `scripts/ci-controles.mjs`.
 *
 * ⚠️ **Dit script leest geen enkel geheim behalve `GITHUB_TOKEN`** (alleen lezen,
 *    `checks: read`), en schrijft nooit een waarde uit de omgeving naar de uitvoer.
 *    De deploy zelf — Hostinger-token, Supabase-sleutels — blijft
 *    `scripts/deploy-web.mjs`; er is geen tweede deploypad.
 *
 * Gebruik (alleen in de workflow):
 *   INVOER_SHA=… node scripts/deploy-workflow.mjs sha      # schrijft sha=<40 hex>
 *   REPO=… SHA=… GITHUB_TOKEN=… node scripts/deploy-workflow.mjs groen
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** De naam van de samenvattende job in `ci.yml`. */
export const POORT_NAAM = 'Alles groen';

/** Wat een sha-invoer mag zijn: `main`, of een (afgekorte) commit-hash. */
const HASH = /^[0-9a-f]{7,40}$/i;

/**
 * Leest het invoerveld `sha`.
 *
 * ⚠️ **Strenger dan git zelf, met opzet.** `git rev-parse` neemt ook `HEAD~3`,
 *    een tagnaam of `origin/andere-branch`; de invoer komt van een telefoon, en
 *    "alleen wat op `main` staat" begint bij een vorm die niets anders toelaat.
 *
 * @param {string | undefined} invoer
 * @returns {{ok: true, soort: 'main' | 'hash', waarde: string} | {ok: false, reden: string}}
 */
export function beoordeelShaInvoer(invoer) {
  const kaal = (invoer ?? '').trim();

  if (kaal === '' || kaal === 'main') return { ok: true, soort: 'main', waarde: 'main' };
  if (HASH.test(kaal)) return { ok: true, soort: 'hash', waarde: kaal.toLowerCase() };

  return {
    ok: false,
    reden: 'De sha moet `main` zijn of een commit-hash van 7 tot 40 hexadecimale tekens.',
  };
}

/**
 * Of `Alles groen` op een commit geslaagd is.
 *
 * ⚠️ **Eén rode weegt zwaarder dan een groene ernaast.** PR #583 droeg op één
 *    commit twee `Alles groen`-checks met tegengestelde uitslag en is zo gemerged
 *    (zie de kop van `poort` in `ci.yml`). Hier is dat het geval waarin je niet
 *    wilt dat de groene wint: er moet minstens één geslaagd zijn én er mag er
 *    geen enkele rood, onvoltooid of onbekend zijn.
 *
 * ⚠️ **`cancelled` en `skipped` tellen niet mee, in geen van beide richtingen.**
 *    Een afgebroken run heeft niets gemeten; `ci.yml` breekt op `main` bovendien
 *    nooit af. Ze mogen dus geen groen afdwingen, maar ook niet rood maken.
 *
 * ⚠️ **Alleen runs van GitHub Actions.** Wie `checks: write` heeft kan een check
 *    met deze naam aanmaken; zonder de app te toetsen is "Alles groen" een
 *    naam en geen uitslag.
 *
 * @param {{name?: string, status?: string, conclusion?: string | null,
 *          app?: {slug?: string} | null}[]} runs
 * @returns {{ok: boolean, reden: string}}
 */
export function beoordeelAllesGroen(runs) {
  const van = (runs ?? []).filter(
    (r) => r.name === POORT_NAAM && r.app?.slug === 'github-actions',
  );

  if (van.length === 0) {
    return { ok: false, reden: `Geen \`${POORT_NAAM}\` van GitHub Actions op deze commit.` };
  }
  if (van.some((r) => r.status !== 'completed')) {
    return { ok: false, reden: `\`${POORT_NAAM}\` loopt nog op deze commit. Wacht tot hij klaar is.` };
  }

  const telt = van.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const niet = telt.filter((r) => r.conclusion !== 'success');

  if (niet.length > 0) {
    const soorten = [...new Set(niet.map((r) => r.conclusion ?? 'onbekend'))].join(', ');
    return { ok: false, reden: `\`${POORT_NAAM}\` is niet groen op deze commit (${soorten}).` };
  }
  if (telt.length === 0) {
    return { ok: false, reden: `Alleen afgebroken of overgeslagen \`${POORT_NAAM}\`-runs: er is niets gemeten.` };
  }

  return { ok: true, reden: `\`${POORT_NAAM}\` is groen (${telt.length} run${telt.length === 1 ? '' : 's'}).` };
}

// ---------------------------------------------------------------------------
// De workflow inlezen
// ---------------------------------------------------------------------------

/** Commentaar eraf, zodat een uitgelegd `push:` geen trigger lijkt. */
export function zonderCommentaar(yml) {
  return yml
    .split(/\r?\n/)
    .map((regel) => regel.replace(/(^|\s)#.*$/, ''))
    .join('\n');
}

const inspringing = (regel) => regel.length - regel.trimStart().length;

/**
 * Welke triggers de workflow heeft.
 *
 * ⚠️ **Alle drie de schrijfwijzen van YAML**, want de ijking hoort niet af te
 *    hangen van hoe iemand de regel toevallig typt: `on: push`,
 *    `on: [push, schedule]` en het blok eronder.
 *
 * @param {string} yml
 * @returns {string[]}
 */
export function triggersUit(yml) {
  const regels = zonderCommentaar(yml).split('\n');
  const start = regels.findIndex((r) => /^["']?on["']?\s*:/.test(r));
  if (start === -1) return [];

  const rest = (regels[start] ?? '').replace(/^["']?on["']?\s*:/, '').trim();
  if (rest !== '') return rest.replace(/[[\]{}]/g, ' ').split(/[\s,]+/).filter(Boolean);

  const uit = [];
  let diepte = -1;
  for (const regel of regels.slice(start + 1)) {
    if (regel.trim() === '') continue;
    if (inspringing(regel) === 0) break;
    if (diepte === -1) diepte = inspringing(regel);
    const sleutel = inspringing(regel) === diepte ? /^\s*([\w-]+)\s*:/.exec(regel) : null;
    if (sleutel?.[1]) uit.push(sleutel[1]);
  }
  return uit;
}

/**
 * De inhoud van alle `run:`-blokken, per regel, met het regelnummer erbij.
 *
 * @param {string} yml
 * @returns {{nummer: number, tekst: string}[]}
 */
export function runRegels(yml) {
  const regels = zonderCommentaar(yml).split('\n');
  const uit = [];
  let blok = -1; // inspringing van de `run:`-sleutel zolang we in een blok zitten

  regels.forEach((regel, i) => {
    if (blok !== -1 && (regel.trim() === '' || inspringing(regel) > blok)) {
      uit.push({ nummer: i + 1, tekst: regel });
      return;
    }
    blok = -1;

    const m = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(regel);
    if (!m) return;
    const kaal = (m[2] ?? '').trim();
    if (/^[|>][-+]?$/.test(kaal)) blok = (m[1] ?? '').length + (regel.includes('- run:') ? 2 : 0);
    else uit.push({ nummer: i + 1, tekst: kaal });
  });

  return uit;
}

/**
 * De namen van de omgevingsvariabelen die uit `secrets.*` komen.
 *
 * ⚠️ **Afgeleid uit de workflow en niet bijgehouden**, om dezelfde reden als
 *    `bewaakteNamen()` in `deploy-web.mjs`: een tweede lijst gaat afwijken van
 *    wat de YAML werkelijk doorgeeft.
 *
 * @param {string} yml
 * @returns {string[]}
 */
export function geheimeNamen(yml) {
  const namen = new Set();
  for (const regel of zonderCommentaar(yml).split('\n')) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*\$\{\{\s*secrets\./.exec(regel);
    if (m?.[1]) namen.add(m[1]);
  }
  return [...namen];
}

// ---------------------------------------------------------------------------
// De bezwaren
// ---------------------------------------------------------------------------

/** Lekken van een geheim of van een invoerveld naar de shell. */
function lekBezwaren(yml) {
  const uit = [];
  const namen = geheimeNamen(yml);

  for (const { nummer, tekst } of runRegels(yml)) {
    const waar = `regel ${nummer}`;
    if (/\$\{\{\s*secrets\./.test(tekst)) uit.push(`${waar}: een secret staat in een run-blok; geef hem door via env:`);
    if (/\$\{\{\s*(github\.event\.)?inputs\./.test(tekst)) {
      uit.push(`${waar}: een invoerveld staat in een run-blok (scriptinjectie); geef hem door via env:`);
    }
    for (const naam of namen) {
      if (new RegExp(`\\$\\{?${naam}\\b`).test(tekst)) uit.push(`${waar}: het geheim ${naam} wordt in een run-blok gelezen`);
    }
    if (/\$\{!/.test(tekst) && /\b(echo|printf|cat|tee)\b|>/.test(tekst)) {
      uit.push(`${waar}: een indirecte variabele wordt geschreven; dat kan een geheim zijn`);
    }
    if (/\b(printenv|set\s+-x|bash\s+-x)\b|^\s*env\s*($|\|)/.test(tekst)) {
      uit.push(`${waar}: dit schrijft de omgeving of elke opdracht naar het log`);
    }
  }
  return uit;
}

/** Wat nergens in de workflow mag staan, ook niet buiten een run-blok. */
function verbodenBezwaren(yml) {
  const kaal = zonderCommentaar(yml);
  const regels = [
    [/ACTIONS_(STEP|RUNNER)_DEBUG/, 'debuglogging zet geheimen en omgeving in het log'],
    [/upload-artifact/, 'een artefact is downloadbaar en kan een geheim dragen'],
    [/toJSON\(\s*(secrets|env)/, 'toJSON(secrets/env) schrijft alles in één keer weg'],
    [/\bsecrets\s*\[/, 'secrets op naam uit een variabele lezen omzeilt de lijst'],
    [/secrets:\s*inherit/, 'secrets: inherit geeft alles door'],
    [/:\s*write(-all)?\b/, 'een schrijfrecht; deze workflow leest alleen'],
    [/\b(curl|wget|scp|sftp|ftp|rsync)\b/, 'een tweede deploypad naast `npm run deploy`'],
  ];
  return regels.filter(([patroon]) => patroon.test(kaal)).map(([, reden]) => `verboden: ${reden}`);
}

/** De stap die om `regelnummer` heen zit, als tekst. */
function stapRond(regels, index) {
  let begin = index;
  while (begin > 0 && !/^\s*-\s+(name|uses|id|run|if):/.test(regels[begin] ?? '')) begin -= 1;
  let eind = index + 1;
  while (eind < regels.length && !/^\s*-\s+(name|uses|id|run|if):/.test(regels[eind] ?? '')) eind += 1;
  return regels.slice(begin, eind).join('\n');
}

/** De volgorde en de grenzen van de deploy zelf. */
function deployBezwaren(yml) {
  const uit = [];
  const regels = zonderCommentaar(yml).split('\n');
  const droog = regels.findIndex((r) => /\bnpm run deploy:droog\b/.test(r));
  const echt = regels.findIndex((r) => /\bnpm run deploy(?![:\w-])/.test(r));

  if (droog === -1) uit.push('de workflow draait `npm run deploy:droog` niet');
  if (echt === -1) uit.push('de workflow draait `npm run deploy` niet');
  if (droog !== -1 && echt !== -1 && droog > echt) uit.push('de droge run staat ná de echte deploy');
  if (echt !== -1 && !/\bif:[^\n]*inputs\.modus\s*==\s*'echt'/.test(stapRond(regels, echt))) {
    uit.push("de echte deploy staat niet achter `if: inputs.modus == 'echt'`");
  }
  return uit;
}

/** Trigger, rechten, gelijktijdigheid en de grens met `main`. */
function kaderBezwaren(yml) {
  const uit = [];
  const kaal = zonderCommentaar(yml);
  const triggers = triggersUit(yml);

  if (triggers.length !== 1 || triggers[0] !== 'workflow_dispatch') {
    uit.push(`trigger(s) ${JSON.stringify(triggers)}; alleen workflow_dispatch is toegestaan`);
  }
  if (!/^permissions:\s*(\{\s*\}\s*)?$/m.test(kaal) && !/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(kaal)) {
    uit.push('geen minimale `permissions:` op het hoogste niveau');
  }
  if (!/^concurrency:/m.test(kaal) || !/cancel-in-progress:\s*false/.test(kaal)) {
    uit.push('geen `concurrency:` met `cancel-in-progress: false`');
  }
  if (!/refs\/heads\/main/.test(kaal)) uit.push('de workflow weigert een andere ref dan main niet');
  if (!/^\s+environment:\s*\S+/m.test(kaal)) uit.push('de deploy-job draait niet in een `environment:`');
  return uit;
}

/**
 * Alle bezwaren tegen de workflow, als zinnen. Leeg betekent: geen.
 *
 * ⚠️ Geëxporteerd en zonder bestandssysteem, zodat élke vorm los te ijken is —
 *    de vormen die hij moet vinden én de vormen die hij met rust moet laten.
 *
 * @param {string} yml
 * @returns {string[]}
 */
export function bezwaren(yml) {
  return [...kaderBezwaren(yml), ...lekBezwaren(yml), ...verbodenBezwaren(yml), ...deployBezwaren(yml)];
}

// ---------------------------------------------------------------------------
// De twee stappen die de workflow uitvoert
// ---------------------------------------------------------------------------

function git(...argumenten) {
  return execFileSync('git', argumenten, { encoding: 'utf8', timeout: 30_000 }).trim();
}

function stop(bericht) {
  console.error(`\n  ✗ ${bericht}\n`);
  return 1;
}

/** Vertaalt de invoer naar één commit op `main` en schrijft hem als stap-uitvoer. */
function opSha() {
  const invoer = beoordeelShaInvoer(process.env.INVOER_SHA);
  if (!invoer.ok) return stop(invoer.reden);

  const doel = invoer.soort === 'main' ? 'refs/remotes/origin/main' : invoer.waarde;
  let sha;
  try {
    sha = git('rev-parse', '--verify', '--end-of-options', `${doel}^{commit}`);
    git('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main');
  } catch {
    return stop(`${invoer.waarde} is geen commit die op main staat.`);
  }

  console.log(`Gedeployd wordt ${sha}.`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
  return 0;
}

/** Vraagt GitHub om de check-runs van de commit en past `beoordeelAllesGroen` toe. */
async function opGroen() {
  const REPO = process.env.REPO;
  const SHA = process.env.SHA;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!REPO || !SHA || !GITHUB_TOKEN) return stop('REPO, SHA of GITHUB_TOKEN ontbreekt.');

  const naam = encodeURIComponent(POORT_NAAM);
  const url = `https://api.github.com/repos/${REPO}/commits/${SHA}/check-runs?check_name=${naam}&per_page=100`;
  const antwoord = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!antwoord.ok) return stop(`GitHub antwoordde ${antwoord.status} op de check-runs van ${SHA}.`);

  const { check_runs: runs, total_count: totaal } = await antwoord.json();
  if (totaal > runs.length) return stop(`Er zijn ${totaal} runs en alleen ${runs.length} gelezen; dat durf ik niet te beoordelen.`);

  const uitslag = beoordeelAllesGroen(runs);
  console.log(uitslag.reden);
  return uitslag.ok ? 0 : 1;
}

async function hoofd() {
  const opdracht = process.argv[2];
  if (opdracht === 'sha') return opSha();
  if (opdracht === 'groen') return opGroen();
  if (opdracht === 'bezwaren') {
    const gevonden = bezwaren(readFileSync(process.argv[3] ?? '', 'utf8'));
    for (const b of gevonden) console.error(`  - ${b}`);
    return gevonden.length === 0 ? 0 : 1;
  }
  return stop('Gebruik: sha | groen | bezwaren <bestand>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await hoofd();
  } catch (fout) {
    console.error(`\n  ✗ ${fout instanceof Error ? fout.message : String(fout)}\n`);
    process.exitCode = 1;
  }
}
