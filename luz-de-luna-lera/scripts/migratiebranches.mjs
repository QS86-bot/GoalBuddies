#!/usr/bin/env node
/**
 * Welke migratienummers de remote branches dragen — QS8-238.
 *
 * ⚠️ **Waarom dit een eigen module is.** `migratie-nieuw.mjs` deed deze scan al,
 *    maar hield per branch alleen het **hoogste** nummer bij. Dat is genoeg om
 *    een nieuw nummer te kiezen en te weinig om een gat te zien: een branch die
 *    `0126` t/m `0130` draagt terwijl deze map op `0125` staat, geeft als hoogste
 *    `0130` — en dan weet je nog steeds niet dat 0126 t/m 0129 óók ontbreken.
 *
 * ⚠️ **Waarom dat ertoe doet.** `migraties:controle` telt de nummers tussen het
 *    laagste en het hoogste bestand. Ontbreekt er iets **boven** het hoogste, dan
 *    is de reeks netjes aaneengesloten tot waar hij ophoudt en meldt hij niets.
 *    Op 31-08-2026 meldde hij letterlijk "De nummering is aaneengesloten" terwijl
 *    er vijf migraties ontbraken die wél op productie draaiden — waaronder de
 *    migratie die het `auth.uid()`-lek in de uitnodigingslink dichtzette. De
 *    RLS-suite bouwde daar dus een ánder schema op dan productie draait, en
 *    niets zei dat.
 *
 * ⚠️ **Juist de bovenkant is het gevaarlijkst.** Een gat in het midden komt van
 *    een oude fout die iemand ooit maakte. Een gat aan de bovenkant komt van de
 *    níeuwste migraties — die net op productie zijn gedraaid en waarvan de
 *    bestanden nog op een branch staan. In dit project is dat de normale gang van
 *    zaken (`docs/DEPLOY.md`: toepassen, dán landen), en dus precies de plek waar
 *    dit het vaakst misgaat.
 *
 * ⚠️ **Wat dit niet kan.** Het echte antwoord staat in
 *    `supabase_migrations.schema_migrations` op productie, en dat vraagt een
 *    service-role-key die niet in een controle hoort die op elke machine draait
 *    (beveiligingsregel 4). Dit is de goedkope helft: alles wat een branch draagt
 *    en deze map mist, is een gat — of het nu al toegepast is of nog niet.
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MAP = 'supabase/migrations';

/**
 * De nummers uit een lijst bestandsnamen, als gesorteerde array.
 *
 * ⚠️ Een letter achter het nummer (`0052a`) is een deelmigratie en telt mee
 *    onder dat nummer — zelfde afspraak als in `migraties-controle.mjs`. Een
 *    naam die niet aan de vorm voldoet, telt niet mee: die wordt elders al als
 *    onleesbaar gemeld, en hier twee keer klagen levert twee meldingen op voor
 *    één fout.
 */
export function nummersUit(bestandsnamen) {
  const nummers = new Set();
  for (const naam of bestandsnamen) {
    const kaal = naam.split('/').pop() ?? '';
    const m = /^(\d{4})[a-z]?_[a-z0-9_]+\.sql$/.exec(kaal);
    if (m !== null) nummers.add(Number(m[1]));
  }
  return [...nummers].sort((a, b) => a - b);
}

/**
 * Welke nummers een branch draagt die deze map níet heeft.
 *
 * `lokaal` is een array nummers, `perBranch` een object van branchnaam naar
 * array nummers. Geeft één regel per branch die iets draagt wat hier ontbreekt,
 * met de ontbrekende nummers erbij.
 *
 * ⚠️ **Beide kanten op leeg is geen bevinding.** Een branch zonder migratiemap
 *    telt als nul en niet als "alles ontbreekt" — anders is elke docs-branch
 *    rood. En een lege werkkopie meldt niets: dan is er geen map om iets over te
 *    zeggen, en dat is een ander probleem dat elders al gevonden wordt.
 */
export function ontbrekendPerBranch({ lokaal, perBranch }) {
  const hier = new Set(lokaal);
  if (hier.size === 0) return [];

  const uit = [];
  for (const [branch, nummers] of Object.entries(perBranch)) {
    const mist = nummers.filter((n) => !hier.has(n)).sort((a, b) => a - b);
    if (mist.length > 0) uit.push({ branch, ontbreekt: mist });
  }
  return uit.sort((a, b) => a.branch.localeCompare(b.branch));
}

/** Vier cijfers, zoals de bestandsnamen ze schrijven. */
export function alsNummer(n) {
  return String(n).padStart(4, '0');
}

function git(...argumenten) {
  return execFileSync('git', argumenten, { cwd: WORTEL, encoding: 'utf8' });
}

/**
 * Elke remote branch met de migratienummers die hij draagt.
 *
 * ⚠️ Werkt op `refs/remotes/origin` en niet op de werkkopie: de vraag is juist
 *    wat er élders staat. Zonder `git fetch` is dit beeld zo oud als je laatste
 *    fetch — daarom noemt de melding dat met zoveel woorden in plaats van te
 *    doen alsof hij de waarheid kent.
 */
export function nummersPerBranch() {
  let branches = [];
  try {
    branches = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin')
      .split('\n')
      .filter((r) => r.trim() !== '' && !r.endsWith('/HEAD'));
  } catch {
    // Geen git, geen remote, geen oordeel.
    return null;
  }

  const perBranch = {};
  for (const ref of branches) {
    let namen = [];
    try {
      namen = git('ls-tree', '-r', '--name-only', ref, `${MAP}/`).split('\n');
    } catch {
      // Een branch zonder migratiemap telt gewoon als nul.
    }
    perBranch[ref.replace('refs/remotes/', '')] = nummersUit(namen);
  }
  return perBranch;
}

/* ---------------------------------------------------------------------------
 * Het beeld verversen — QS8-247
 * ------------------------------------------------------------------------- */

/**
 * ⚠️ **Waarom dit hieronder een eigen helft is, en niet in `nummersPerBranch()`
 *    zit.** De scan hierboven leest `refs/remotes/origin` en zegt in zijn eigen
 *    kop dat dat beeld zo oud is als je laatste fetch. Dat was eerlijk en het
 *    was niet genoeg: op 31-08-2026 botste een migratienummer voor de **vierde**
 *    keer, mét `migratie:nieuw`, om exact de reden die het script zelf al had
 *    opgeschreven. Een gereedschap dat bestaat om een botsing te voorkomen en
 *    waarvan de juistheid afhangt van een handeling die het zelf niet doet,
 *    verplaatst het probleem naar de gebruiker.
 *
 * ⚠️ **En de grens loopt tussen de twee soorten aanroepers.** Wie een nummer
 *    **uitdeelt** (`migratie:nieuw`, `migratie:hernummer`) fetcht: daar is een
 *    verouderd beeld een verkeerd antwoord. Wie **controleert**
 *    (`migraties:controle`) fetcht niet: die draait in de poort en in CI, waar
 *    een netwerkaanroep de uitslag afhankelijk zou maken van bereikbaarheid —
 *    en CI draait toch al op een verse checkout. Vandaar dat dit een losse
 *    export is die je aanroept en geen bijwerking van de scan.
 *
 *    `tests/scripts/migratiebranches-fetch.test.ts` meet beide kanten met een
 *    echte remote op schijf; die test is de enige die "wel gefetcht" van "niet
 *    gefetcht" kan onderscheiden.
 */

/** Rule 14: een netwerkaanroep zonder tijdslimiet is een hang die niemand ziet. */
const FETCH_TIJDSLIMIET_MS = 20_000;

/**
 * Het pad naar `FETCH_HEAD`, via git zelf.
 *
 * ⚠️ Niet `.git/FETCH_HEAD` met de hand plakken: in een worktree is `.git` een
 *    bestand en staat de echte map ergens anders. `rev-parse --git-path` weet
 *    dat wel.
 */
function fetchHeadPad() {
  try {
    const pad = git('rev-parse', '--git-path', 'FETCH_HEAD').trim();
    return pad === '' ? null : isAbsolute(pad) ? pad : join(WORTEL, pad);
  } catch {
    return null;
  }
}

/**
 * Wanneer er voor het laatst gefetcht is, of `null` als dat niet te zien is.
 *
 * ⚠️ `FETCH_HEAD` wordt bij élke fetch herschreven, ook als er niets nieuws was.
 *    Een verse kloon heeft hem nog niet — en "nog nooit gefetcht sinds de kloon"
 *    is precies de toestand waarin het beeld het meest achterloopt.
 */
export function laatsteFetch() {
  const pad = fetchHeadPad();
  if (pad === null) return null;
  try {
    return statSync(pad).mtime;
  } catch {
    return null;
  }
}

/**
 * `git fetch --prune origin`, met het oordeel of het gelukt is.
 *
 * Geeft `{ vers, sinds, fout }`: `vers` of het beeld nú opgehaald is, `sinds`
 * wanneer het beeld waar je mee wérkt vandaan komt, en `fout` de eerste regel
 * van wat git zei.
 *
 * ⚠️ **`sinds` wordt vóór de poging gelezen, en dat is een gemeten bevinding en
 *    geen voorzorg.** Git maakt `FETCH_HEAD` aan zodra hij begint — óók als hij
 *    de remote daarna niet kan bereiken. Las je de tijd erná, dan meldde een
 *    mislukte fetch "van zojuist" terwijl er niets was opgehaald: precies de
 *    valse zekerheid waar dit hele mechanisme tegen bestaat. Gevonden op
 *    01-09-2026 doordat `migratie-fetch.test.ts` rood ging op een fixture met
 *    een `FETCH_HEAD` van drie dagen oud.
 */
export function haalRemoteOp() {
  const voorheen = laatsteFetch();
  try {
    execFileSync('git', ['fetch', '--prune', 'origin'], {
      cwd: WORTEL,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: FETCH_TIJDSLIMIET_MS,
    });
    return { vers: true, sinds: laatsteFetch(), fout: null };
  } catch (fout) {
    return { vers: false, sinds: voorheen, fout: eersteRegel(fout) };
  }
}

/** De eerste regel van wat git op stderr zei — de rest is ruis in een melding. */
function eersteRegel(fout) {
  const tekst = String(fout?.stderr ?? fout?.message ?? fout ?? '').trim();
  return tekst === '' ? 'onbekende fout' : (tekst.split('\n')[0] ?? '').trim();
}

/**
 * Hoe oud een beeld is, in woorden.
 *
 * ⚠️ Grof met opzet. Het verschil dat telt is "van net" tegen "van gisteren", en
 *    niet 41 tegen 43 minuten. Een precieze duur leest als precisie die er niet
 *    is.
 *
 * @param {number} ms
 * @returns {string}
 */
export function ouderdomInWoorden(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'onbekend oud';
  const minuten = Math.floor(ms / 60_000);
  if (minuten < 1) return 'van zojuist';
  if (minuten < 60) return `${minuten} ${minuten === 1 ? 'minuut' : 'minuten'} oud`;
  const uren = Math.floor(minuten / 60);
  if (uren < 24) return `${uren} uur oud`;
  const dagen = Math.floor(uren / 24);
  return `${dagen} ${dagen === 1 ? 'dag' : 'dagen'} oud`;
}

/**
 * De regels die een uitdelend script afdrukt over de versheid van zijn beeld.
 *
 * ⚠️ **Het verschil tussen "net gefetcht" en "een dag oud" ís het risico**, en
 *    dat is de hele reden dat deze melding bestaat. De oude tekst noemde de
 *    onzekerheid wel, maar in beide gevallen dezelfde — en dan leest hij als
 *    een disclaimer in plaats van als een waarschuwing.
 *
 * ⚠️ **Mislukken is geen reden om te stoppen.** Zonder netwerk moet je nog
 *    steeds een migratie kunnen beginnen; weigeren maakt het werk niet af. Wat
 *    wél moet is dat de uitkomst niet meer als zeker gelezen kan worden — dus
 *    een `⚠`-regel met de leeftijd erbij en de opdracht om zelf te kijken.
 *
 * @param {{vers: boolean, sinds: Date | null, nu?: Date, fout?: string | null}} beeld
 * @returns {string[]}
 */
export function versheidsmelding({ vers, sinds, nu = new Date(), fout = null }) {
  if (vers) return ['✓ remote-beeld ververst (git fetch --prune origin)'];

  const ouderdom =
    sinds instanceof Date && !Number.isNaN(sinds.getTime())
      ? `van ${sinds.toISOString().slice(0, 16).replace('T', ' ')} UTC, ${ouderdomInWoorden(nu.getTime() - sinds.getTime())}`
      : 'nog nooit ververst sinds de kloon';

  return [
    `⚠ Kon niet fetchen: ${fout ?? 'onbekende fout'}`,
    `  Dit beeld is ${ouderdom}.`,
    '  Controleer zelf of er elders hoger genummerd is voordat je dit nummer gebruikt.',
  ];
}
