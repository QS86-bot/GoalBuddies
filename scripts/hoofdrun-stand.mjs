#!/usr/bin/env node
/**
 * Staat `main` groen? — QS8-390.
 *
 * ⚠️⚠️ **Waarom dit bestaat, met de meting erbij.** Op 09-09-2026 landden twee
 *    PR's binnen twee minuten van elkaar: #337 voegde een kale `await` toe, #338
 *    liet de grendel juist die vorm herkennen. Allebei terecht groen — toen de
 *    ene draaide bestond de andere nog niet — en samen rood.
 *
 *    📏 De uitslagen op `main`, uit de GitHub-API opgehaald:
 *
 *      11:44:07  run 1700  97555d5  #337  → success
 *      11:46:32  run 1702  3697305  #338  → **failure**, klaar om 11:51:06
 *      12:11:08  run 1709  90812f6  #340  → success (de reparatie)
 *
 *    **Detectie was er dus al, en gratis: CI zei het om 11:51.** Wat ontbrak was
 *    dat iemand keek. `main` stond vijfentwintig minuten rood, waarvan twintig
 *    minuten aantoonbaar-en-onopgemerkt.
 *
 * ⚠️ **Daarom detectie en niet preventie, en dat is tegen de eerste ingeving in.**
 *    De voor de hand liggende reparatie is "draai de suite nog eens tegen de
 *    huidige `main` vlak vóór je merget". Die zou dit geval **niet** gevangen
 *    hebben: #337 merde om 11:45 en #338 om 11:46, en zo'n verificatie duurt
 *    vier minuten. Preventie versmalt het venster; ze sluit het niet. Zie
 *    `docs/decisions/2026-09-09-twee-groene-prs-samen-rood.md`.
 *
 * ⚠️ **Nooit groen zonder bewijs.** Onbereikbaar, een onbekende vorm, of een run
 *    die nog draait — alle drie heten hier ONGEMETEN of DRAAIT en geven
 *    exitcode 1. Dezelfde doctrine als de poort: een controle zonder meting is
 *    niet geslaagd, hij heeft niets gemeten. Groen is alleen groen als er een
 *    afgeronde, geslaagde run op `main` tegenover staat.
 *
 * ⚠️ **Hij staat niet in de poort en dat is geen omissie.** De poort toetst jouw
 *    werk vóór een push; dit toetst de toestand van `main` ná een merge. In de
 *    poort zou hij bovendien een netwerkaanroep zijn in iets dat in CI draait —
 *    precies de grens die CLAUDE.md tussen de twee soorten scripts trekt.
 *
 * ⚠️⚠️ **Sinds 22-09-2026 leest hij een venster en niet één run — QS8-582.**
 *    Hij haalde `per_page=1` op en beoordeelde de nieuwste run. Dat beantwoordt
 *    *"staat `main` nu groen"*, en dat is niet dezelfde vraag als *"heeft elke
 *    toestand van `main` een uitslag gekregen"*. 📏 Op 21-09-2026 verloren drie
 *    commits binnen vijftien seconden hun uitslag doordat ze elkaar uit de
 *    concurrency-wachtrij duwden (runs 2965, 2966, 2967); de run erna was groen,
 *    en dit script zei dus groen. Niet onwaar — onvolledig, en dat is de klasse
 *    fout waar de grondwet over gaat.
 *
 * ⚠️ **Een venster en geen geschiedenis, en dat is een keuze met een prijs.**
 *    `VENSTER` staat op de laatste 20 runs op `main` — bij het tempo van 21-09
 *    (43 merges) is dat ruwweg een halve dag. Een commit die ouder is dan dat,
 *    valt uit het zicht zonder dat er iets rood wordt. Dat is bewust: een alarm
 *    over een commit die dertig merges terug ligt, is niet meer te beantwoorden
 *    met een herstart die iets betekent, en een alarm dat je niet kunt
 *    beantwoorden leer je negeren. **Maar het is wél de drift die zichzelf
 *    herstelt uit QS8-411** — hij staat hier opgeschreven in plaats van
 *    weggepoetst, en dat is het enige wat een venster eerlijk houdt.
 *
 * ⚠️ **Dit script is de detectiekant; de preventie staat in `ci.yml`.** Daar is
 *    de concurrency-groep op `main` per commit, zodat er niets in de wachtrij
 *    staat om uit geduwd te worden, en `npm run hoofdrun:controle` toetst die
 *    regel — aan beide kanten. Deze twee horen bij elkaar: de een houdt het
 *    tegen, de ander merkt het op als het tóch gebeurt.
 *
 * Draaien: `npm run hoofdrun:stand`, meteen na het mergen.
 */
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const voerUit = promisify(execFile);

const EIGENAAR = 'QS86-bot';
const REPO = 'GoalBuddies';
const WERKSTROOM = 'ci.yml';

/** Hoe lang we op de API wachten voordat we hem opgeven. */
const TIJDSLIMIET_MS = 15000;

/** Hoeveel runs op `main` we teruglezen op zoek naar een verloren uitslag. */
const VENSTER = 20;

/**
 * De uitslag van één run, ingedeeld.
 *
 * ⚠️ **Vier standen en niet twee.** "Draait nog" is geen groen en geen rood: er
 *    is nog niets te weten. Dat als groen tellen is precies de fout waar de
 *    poort zijn OVERGESLAGEN-onderscheid voor heeft.
 *
 * @param {{ status?: string, conclusion?: string|null, head_sha?: string,
 *           display_title?: string, html_url?: string, run_started_at?: string }
 *          | null | undefined} run
 */
export function beoordeel(run) {
  if (run === null || run === undefined) {
    return { stand: 'ongemeten', reden: 'geen run gevonden voor main' };
  }

  const kop = {
    sha: (run.head_sha ?? '').slice(0, 7),
    titel: run.display_title ?? '',
    url: run.html_url ?? '',
    gestart: run.run_started_at ?? '',
  };

  if (run.status !== 'completed') {
    return { stand: 'draait', ...kop };
  }

  if (run.conclusion === 'success') return { stand: 'groen', ...kop };
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out') {
    return { stand: 'rood', ...kop };
  }

  // ⚠️ `cancelled`, `skipped`, `stale`, `action_required` — geen van alle is een
  //    uitslag. Op `main` is een afgebroken run juist het geval waar QS8-318
  //    over gaat: een toestand die uitgerold is zonder dat iemand weet of hij
  //    klopt.
  return { stand: 'ongemeten', reden: `conclusie \`${run.conclusion}\` is geen uitslag`, ...kop };
}

/**
 * Exitcode die bij een stand hoort. Alleen groen is nul — en groen met een
 * commit zonder uitslag erachter is geen groen.
 */
export function exitcode(stand, verloren = []) {
  return stand === 'groen' && verloren.length === 0 ? 0 : 1;
}

/**
 * Heeft deze run iets afgerond waar je op kunt afgaan?
 *
 * ⚠️ Dezelfde driedeling als de poort: `cancelled`, `skipped`, `stale` en
 *    `action_required` zijn geen uitslag, en `queued`/`in_progress` nog niet.
 */
function isUitslag(run) {
  return (
    run?.status === 'completed' &&
    ['success', 'failure', 'timed_out'].includes(run?.conclusion ?? '')
  );
}

function looptNog(run) {
  return run?.status !== undefined && run.status !== 'completed';
}

/**
 * De commits in dit venster die geen afgeronde uitslag (meer) hebben.
 *
 * ⚠️ **Per commit en niet per run, want een sha kan meerdere runs hebben** — een
 *    herstart is een tweede poging op hetzelfde run-id, maar een `push` en de
 *    wekelijkse `schedule` zijn twee runs op dezelfde sha. Eén afgeronde uitslag
 *    is genoeg; dan is die toestand gemeten.
 *
 * ⚠️ Een commit waarvan nog een run **draait**, telt hier niet mee: die kan zijn
 *    uitslag nog krijgen. Dat is geen groen — de nieuwste run draagt die stand
 *    al — maar het is ook geen verlies.
 *
 * @param {Array<object>} runs nieuwste eerst, zoals de GitHub-API ze geeft
 */
export function commitsZonderUitslag(runs) {
  const perCommit = new Map();
  for (const run of runs ?? []) {
    const sha = run?.head_sha ?? '';
    if (sha === '') continue;
    const eerder = perCommit.get(sha) ?? { gemeten: false, draait: false, run };
    perCommit.set(sha, {
      gemeten: eerder.gemeten || isUitslag(run),
      draait: eerder.draait || looptNog(run),
      run: eerder.run,
    });
  }

  return [...perCommit.values()]
    .filter((c) => !c.gemeten && !c.draait)
    .map(({ run }) => ({
      sha: (run.head_sha ?? '').slice(0, 7),
      titel: run.display_title ?? '',
      url: run.html_url ?? '',
      reden: `conclusie \`${run.conclusion}\``,
    }))
    .reverse();
}

/**
 * De nieuwste run van de CI-werkstroom op `main`.
 *
 * ⚠️⚠️ **Via `curl` en niet via `fetch`, en dat is gemeten en niet gekozen.**
 *    📏 Dezelfde URL geeft vanuit dit project twee verschillende antwoorden:
 *
 *      curl                    → 200
 *      node, globale `fetch`   → 403
 *
 *    De reden is dat de uitgaande verbindingen van deze omgeving door een proxy
 *    lopen die de GitHub-credentials meegeeft. `curl` honoreert `HTTPS_PROXY`;
 *    de globale `fetch` van Node doet dat niet en gaat er rechtstreeks langs —
 *    ongeauthenticeerd, en dan geeft een privé repository 403. 📏 Te zien aan
 *    `/rate_limit`: via de proxy staat de limiet op 15000 (een geauthenticeerde
 *    limiet), rechtstreeks op 60.
 *
 *    Dit is vermoedelijk ook waarom `branches-controle.mjs` noteert dat de API
 *    hier "niet te bereiken" is en op `git ls-remote` uitwijkt. Dat blijft daar
 *    de betere keuze — die controle heeft geen API nodig. Hier wél: een
 *    CI-uitslag staat in geen enkele git-ref.
 *
 * ⚠️ **Werkt de authenticatie niet, dan is dat ONGEMETEN en geen groen.** Op een
 *    machine zonder die proxy en zonder token geeft dit script eerlijk "ik weet
 *    het niet" — dat is de enige uitkomst die hier niet mag liegen.
 */
async function haalRuns() {
  const url =
    `https://api.github.com/repos/${EIGENAAR}/${REPO}/actions/workflows/${WERKSTROOM}` +
    `/runs?branch=main&per_page=${VENSTER}`;

  // ⚠️ Elke externe call heeft een timeout (onwrikbare regel 14) — hier die van
  //    `curl` zelf plus een harde grens op het proces eromheen.
  const { stdout } = await voerUit(
    'curl',
    ['-sS', '--fail', '--max-time', String(Math.floor(TIJDSLIMIET_MS / 1000)), '-H', 'accept: application/vnd.github+json', url],
    { timeout: TIJDSLIMIET_MS + 5000, maxBuffer: 8 * 1024 * 1024 },
  );

  const lijf = JSON.parse(stdout);
  return lijf?.workflow_runs ?? [];
}

const TEKST = {
  groen: 'hoofdrun-stand: `main` is groen.',
  rood: '✗ `main` is ROOD.',
  draait: '· De run op `main` draait nog — nog niets gemeten.',
  ongemeten: '· ONGEMETEN: de stand van `main` is niet vast te stellen.',
};

/**
 * De regels over de commits die hun uitslag kwijt zijn.
 *
 * ⚠️ **Het verzoek is een herstart en geen "let volgende keer beter op".** Een
 *    melding die niet zegt wat je ermee doet, is een melding die je wegklikt.
 */
function verlorenRegels(verloren) {
  if (verloren.length === 0) return [];
  const regels = [
    '',
    `· ${verloren.length} commit(s) op \`main\` zonder uitslag — niet groen, niet rood, er niet.`,
  ];
  for (const { sha, titel, reden, url } of verloren) {
    regels.push(`    ${sha}  ${titel}`, `      ${reden} · ${url}`);
  }
  return regels.concat([
    '',
    'Herstart elke run hierboven — één tegelijk, want twee herstarts in dezelfde',
    'concurrency-groep duwen elkaar er weer uit. Dat is QS8-582; de preventie staat',
    'in `ci.yml` (de groep is op `main` per commit) en `npm run hoofdrun:controle`',
    'toetst die regel.',
  ]);
}

export function melding(uitslag) {
  const regels = [TEKST[uitslag.stand] ?? TEKST.ongemeten];

  if (uitslag.sha) regels.push(`    ${uitslag.sha}  ${uitslag.titel}`);
  if (uitslag.reden) regels.push(`    reden: ${uitslag.reden}`);
  if (uitslag.url) regels.push(`    ${uitslag.url}`);

  if (uitslag.stand === 'rood') {
    regels.push(
      '',
      'Dat is werk nu, en het is van wie als laatste merde. Twee PR\'s die elk',
      'terecht groen waren, kunnen samen rood zijn — hun runs kenden elkaar niet.',
      'Zie `docs/decisions/2026-09-09-twee-groene-prs-samen-rood.md`.',
    );
  }

  if (uitslag.stand === 'draait') {
    regels.push('', 'Draai dit commando zo nog een keer. Je bent klaar als het groen zegt.');
  }

  return regels.concat(verlorenRegels(uitslag.verloren ?? [])).join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let uitslag;

  try {
    const runs = await haalRuns();
    uitslag = { ...beoordeel(runs[0] ?? null), verloren: commitsZonderUitslag(runs) };
  } catch (fout) {
    uitslag = { stand: 'ongemeten', reden: fout instanceof Error ? fout.message : String(fout) };
  }

  const code = exitcode(uitslag.stand, uitslag.verloren ?? []);
  const uit = melding(uitslag);
  if (code === 0) process.stdout.write(`${uit}\n`);
  else process.stderr.write(`${uit}\n`);

  process.exit(code);
}
