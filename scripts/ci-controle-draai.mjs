#!/usr/bin/env node
/**
 * Draait één controle in CI en beoordeelt hem met **dezelfde classificatie als
 * de poort** — QS8-563.
 *
 * ## Het gat dat dit dicht
 *
 * De poort kent drie uitkomsten (groen, ongemeten, rood); de lus in `ci.yml`
 * kende er twee, want die keek alleen naar de exitcode. Dezelfde uitslag heette
 * daardoor op twee plekken iets anders.
 *
 * 📏 Op 19-09-2026 kostte dat een rode `main`: `npm audit` kreeg een
 * **400 Bad Request** van een endpoint die npm aan het uitfaseren is
 * (*"This endpoint is being retired"*, letterlijk in hetzelfde CI-log).
 * `audit-controle` deed precies het goede — hij meldde `OVERGESLAGEN` en
 * weigerde een ongemeten uitslag groen te noemen — maar gaf exitcode 1, en CI
 * las dat als rood. De merge die er toevallig onder lag had er niets mee te
 * maken, en het kostte een half uur om dat vast te stellen.
 *
 * ⚠️⚠️ **De classificatie staat met opzet niet hier maar in `poort.mjs`.** Een
 *    tweede kopie van het `OVERGESLAGEN`-patroon — één in JS en één in bash —
 *    loopt uit elkaar zodra iemand er één aanpast, en dan is de vraag *"is dit
 *    ongemeten of rood"* afhankelijk van wáár hij gesteld wordt. `beoordeel()`
 *    is geëxporteerd; die wordt hier hergebruikt en niet nagebouwd.
 *
 * ## ⚠️ Waarom ongemeten in CI níet faalt, terwijl het in de poort wél faalt
 *
 * Dat verschil is bewust en hoort opgeschreven (criterium 1 van QS8-563).
 *
 * De **poort** draait op een machine van een mens, en daar is *"ik heb geen
 * database"* of *"ik heb geen productiesleutel"* een toestand die die mens kan
 * verhelpen. Falen is daar het juiste signaal: ga het halen.
 *
 * In **CI** staat in de baan per definitie alleen wat er kán meten — dat is wat
 * `ZONDER_CI` garandeert. Komt zo'n controle tóch ongemeten terug, dan is dat
 * een storing **buiten** de commit. De committer kan er niets aan doen, en de
 * build rood maken schrijft andermans storing op zijn naam. Dat is precies de
 * verkeerde attributie die dit issue heeft opgeleverd.
 *
 * ⚠️ **Maar stil doorlaten is het óók niet.** Een ongemeten controle krijgt
 *    daarom een `::warning::`-annotatie, zodat hij bovenaan de run zichtbaar is
 *    in plaats van weg te zakken in een log, en de stap telt ze apart op aan het
 *    eind. De poort blijft er lokaal hard op falen.
 *
 * ⚠️ En een **échte** bevinding blijft onverkort rood: die draagt geen
 *    `OVERGESLAGEN` in zijn uitvoer, dus `beoordeel()` noemt hem rood en deze
 *    runner geeft exitcode 1. Dat is de helft die telt — zonder haar is de
 *    reparatie "zet de melder uit".
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { beoordeel, HEEFT_DATABASE_NODIG } from './poort.mjs';

/**
 * Voert één npm-script uit en vangt stdout én stderr op.
 *
 * ⚠️ `2>&1` in één buffer, want `OVERGESLAGEN` gaat bij meerdere controles naar
 *    **stderr** (`console.error`) — `audit-controle` is er een van. Alleen
 *    stdout lezen laat die melding vallen en maakt hem weer rood.
 *
 * @param {string} naam
 * @param {typeof spawnSync} [spawn] injecteerbaar, zodat de stdout+stderr-samenvoeging
 *   los te toetsen is — zonder dat blijft die regel onbewaakt.
 * @returns {{ code: number, uitvoer: string }}
 */
export function voerUit(naam, spawn = spawnSync) {
  const uit = spawn('npm', ['run', '--silent', naam], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: uit.status ?? 1,
    uitvoer: `${uit.stdout ?? ''}${uit.stderr ?? ''}`,
  };
}

/**
 * Draait een controle en zegt wat hij is.
 *
 * @param {string} naam
 * @param {(naam: string) => { code: number, uitvoer: string }} uitvoerder
 * @returns {{ naam: string, oordeel: 'groen'|'ongemeten'|'rood', uitvoer: string, code: number }}
 */
export function draaiControle(naam, uitvoerder = voerUit) {
  const { code, uitvoer } = uitvoerder(naam);
  const oordeel = beoordeel({
    code,
    uitvoer,
    heeftDatabaseNodig: HEEFT_DATABASE_NODIG.has(naam),
    soort: 'controle',
  });
  return { naam, oordeel, uitvoer, code };
}

/**
 * Zet een uitkomst om in de regels die CI te zien krijgt.
 *
 * ⚠️ De `::group::`- en `::warning::`-vormen zijn die van GitHub Actions. Een
 *    groep vouwt de uitvoer op zodat één rode controle de rest niet wegdrukt;
 *    een warning verschijnt bovenaan de run.
 *
 * @param {{ naam: string, oordeel: string, uitvoer: string, code: number }} uitkomst
 * @returns {string[]}
 */
export function regels({ naam, oordeel, uitvoer, code }) {
  if (oordeel === 'groen') return [`✓ ${naam}`];

  if (oordeel === 'ongemeten') {
    return [
      `::warning title=${naam} heeft niets gemeten::${eersteRegel(uitvoer)}`,
      `::group::· ${naam} — ONGEMETEN (exit ${code})`,
      uitvoer,
      '::endgroup::',
    ];
  }

  return [`::group::✗ ${naam} (exit ${code})`, uitvoer, '::endgroup::'];
}

/**
 * @param {string} uitvoer
 * @returns {string} de eerste niet-lege regel, voor in een annotatie
 */
function eersteRegel(uitvoer) {
  for (const regel of String(uitvoer).split('\n')) {
    if (regel.trim() !== '') return regel.trim();
  }
  return 'geen uitvoer';
}

/**
 * @param {string[]} namen
 * @param {(naam: string) => { code: number, uitvoer: string }} [uitvoerder]
 * @returns {{ rood: string[], ongemeten: string[], groen: string[] }}
 */
export function draaiAlle(namen, uitvoerder = voerUit) {
  /** @type {{ rood: string[], ongemeten: string[], groen: string[] }} */
  const uit = { rood: [], ongemeten: [], groen: [] };
  for (const naam of namen) {
    const uitkomst = draaiControle(naam, uitvoerder);
    for (const r of regels(uitkomst)) console.log(r);
    if (uitkomst.oordeel === 'rood') uit.rood.push(naam);
    else if (uitkomst.oordeel === 'ongemeten') uit.ongemeten.push(naam);
    else uit.groen.push(naam);
  }
  return uit;
}

/**
 * @param {{ rood: string[], ongemeten: string[], groen: string[] }} uitslag
 * @returns {number} exitcode — alleen rood faalt
 */
export function samenvatting(uitslag) {
  console.log('');
  console.log(
    `${uitslag.groen.length} groen, ${uitslag.ongemeten.length} ongemeten, ${uitslag.rood.length} rood.`,
  );
  if (uitslag.ongemeten.length > 0) {
    console.log(
      `⚠️ Ongemeten is geen groen: ${uitslag.ongemeten.join(', ')}. Deze baan draait ` +
        'alleen controles die hier kúnnen meten, dus dit is een storing buiten de commit — ' +
        'zie de kop van scripts/ci-controle-draai.mjs.',
    );
  }
  return uitslag.rood.length > 0 ? 1 : 0;
}

function hoofd() {
  const namen = process.argv.slice(2);
  if (namen.length === 0) {
    console.error('Gebruik: node scripts/ci-controle-draai.mjs <controlenaam>...');
    return 2;
  }
  return samenvatting(draaiAlle(namen));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
