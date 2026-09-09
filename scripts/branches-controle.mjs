#!/usr/bin/env node
/**
 * Welke branches op de remote nergens heen gaan — QS8-385.
 *
 * ⚠️ **Het gat dat dit dicht.** 📏 Op 09-09-2026 stonden er tien branches op de
 *    remote met afgerond werk — claim-commit, migratie, tests — tot 22 uur oud,
 *    zonder één pull request. Zes ervan droegen een migratienummer dat `main`
 *    intussen aan iets anders vergeven had. Niets in dit project meldde dat, en
 *    het is de derde keer van deze soort (QS8-131, QS8-237, QS8-384).
 *
 * ⚠️ **Waarom niets het zag.** Alles wat de remote branchlijst leest, leest de
 *    *inhoud* ervan en nooit de *leeftijd*: `claim` kijkt of een issuenummer al
 *    bezet is — een branch zonder PR ziet er voor hem uit als een gezonde claim;
 *    `migratie:nieuw` en `migraties:controle` kijken welke nummers er bezet zijn
 *    en melden de **botsing**, niet dat de branch nergens heen gaat. En CI draait
 *    op de branch zelf, dus een branch waar niemand een PR voor opent, draait
 *    geen uitslag die iemand leest.
 *
 * ## Hoe hij weet of er een PR is, zónder GitHub-API
 *
 * GitHub publiceert elke pull request als `refs/pull/<n>/head` op de remote, en
 * `git ls-remote` leest die met dezelfde credentials waarmee je pusht.
 *
 * 📏 Dat is hier gemeten en het is niet vrijblijvend: de GitHub-REST-API is uit
 *    deze omgeving **niet** te bereiken — de `GITHUB_TOKEN` in de omgeving is een
 *    proxy-plaatshouder (`401 Bad credentials`) en ongeauthenticeerd geeft het
 *    gedeelde proxy-IP `403 rate limit exceeded`. Een controle die daarop leunt,
 *    zou hier altijd `OVERGESLAGEN` printen en dus nooit iets meten. Via
 *    `ls-remote` werkt hij wél, ook op een privé repository, en hij heeft geen
 *    sleutel nodig die iemand moet zetten.
 *
 * ⚠️ **De toets is een exacte gelijkheid van de tip, en dat is met opzet.**
 *    `refs/pull/<n>/head` volgt de kop van de PR zolang die open staat en
 *    bevriest zodra hij dicht gaat. Een branch waarvan de tip precies een
 *    PR-head is, is dus *besloten* — open, gesloten of gemerged, alle drie
 *    tellen, want over alle drie is een besluit genomen.
 *
 *    ⚠️ **"Is een PR-head een vóórouder van de tip" is de verkeerde vraag, en dat
 *    is gemeten en niet bedacht.** Elke branch die van `main` afstamt draagt de
 *    kop van elke ooit gemergede PR in zijn geschiedenis: 📏 die toets wees voor
 *    álle vijf de geprobeerde branches naar `refs/pull/105/head`, een PR van
 *    weken terug. Hij zou dus nooit iets melden.
 *
 *    Het gevolg is dat een branch die ná zijn merge nog commits kreeg, hier
 *    weer opduikt. Dat is geen vals alarm maar de bedoeling: die commits staan
 *    buiten `main` en er hoort geen PR bij.
 *
 * ## Waarom hij fetcht, en waarom hij niet in de poort staat
 *
 * `CLAUDE.md` deelt de scripts in tweeën: wie een **antwoord uitdeelt** fetcht,
 * wie **controleert** in de poort niet — daar maakt een netwerkaanroep de
 * uitslag afhankelijk van bereikbaarheid. Deze hoort ondanks zijn naam bij de
 * eerste soort: hij zégt hoe oud een branch is, en dat antwoord is verkeerd op
 * een verouderd beeld. Hij draait dan ook **niet** in `npm run poort` en niet in
 * CI. Een controle die daar altijd `OVERGESLAGEN` print, telt als ongemeten en
 * is er een die niemand meer leest.
 *
 * ⚠️⚠️ **Daarom heet hij `branches:stand` en niet `branches:controle`, en dat is
 *    geen smaak maar de enige manier om hem eruit te houden.** `poort.mjs` leest
 *    *elke* `*:controle` uit `package.json` en draait hem — met zoveel woorden,
 *    want die lijst met de hand bijhouden liep achter zodra iemand een controle
 *    toevoegde. Een uitzonderingslijst erbij zou precies dat gat terugzetten voor
 *    iedereen ná mij. De naamconventie ís de opname; wie er niet in hoort, draagt
 *    de naam niet. Zelfde vorm als `stand`, `poortstand`, `rls:dekking` en
 *    `edge:gedeployd`.
 *
 *    📏 En het is vandaag niet theoretisch: deze controle staat **rood** — er
 *    liggen elf branches zonder PR (QS8-384). In de poort zou dat betekenen dat
 *    niemand meer kan pushen tot iemand anders zijn branches opruimt.
 *
 * ⚠️ Hij houdt wél het woord `OVERGESLAGEN` en exitcode 0 aan voor het geval dat
 *    hij niets kán meten. Niet omdat de poort dat hier leest, maar omdat dat in
 *    dit project het vaste onderscheid is tussen *groen* en *ongemeten* — en
 *    zodra deze ooit wél in een poort belandt, staat de betekenis er al goed in.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, mutatie per grendel, en elke keer
 * eerst met een `grep -c MUTATIE-<letter>` bevestigd dat de mutatie er écht in
 * stond vóór de uitslag geloofd werd. Nulmeting groen, elke mutatie apart
 * teruggedraaid, en na afloop opnieuw groen:
 *
 *   A  de PR-toets eruit          → 1 rood: *laat een branch met een PR met rust*
 *   B  de leeftijdsgrens eruit    → 2 rood: *jonger dan de grens* en *precies op de grens*
 *   C  het register eruit         → 2 rood: *met een reden in het register* en de groene run
 *   D  dode registerrijen weg     → 1 rood: *meldt een registerrij waarvan de branch weg is*
 *   E  migratiebranches niet meer → 1 rood: *zet de branches met een migratie bovenaan*
 *      bovenaan
 *   F  `ls-remote` leest ook      → 1 rood: *laat alles staan wat geen PR-kop is*
 *      `/merge`
 *   G  de overslag bij een        → 1 rood: *slaat zichzelf zichtbaar over*
 *      ontbrekende PR-lijst eruit
 *   H  een registerrij zonder     → 1 rood: *draagt bij elke rij een reden*
 *      reden
 *
 * ⚠️ **A en B zijn de twee die dit script van ruis onderscheiden**, en ze slaan
 *    allebei de kant op die je niet vanzelf test: A laat een branch met een PR
 *    met rust, B een branch die nog geen halve dag stil staat. Zonder die twee
 *    meldt dit ding elke branch die niet in `main` zit — vandaag eenendertig —
 *    en dat is de controle die je leert wegklikken.
 *
 * Gebruik:
 *   npm run branches:controle
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { haalRemoteOp, ouderdomInWoorden, versheidsmelding } from './migratiebranches.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const STAM = 'origin/main';

/**
 * Onder deze leeftijd is een branch zonder PR gewoon werk in uitvoering.
 *
 * ⚠️⚠️ **Twaalf uur, en dat getal is tegen het geval gehouden dat deze controle
 *    liet ontstaan — niet gekozen omdat het rond klinkt.** Op 24 uur, de eerste
 *    waarde, meldde hij 📏 **nul** van de tien branches uit QS8-384: hun tips
 *    liepen van 12:16 tot 20:18 UTC op 08-09 en het was 10:30 UTC op 09-09, dus
 *    14 tot 22 uur. De grens die precies de zaak mist waarvoor hij gemaakt is,
 *    is de duurste soort aanname die er is.
 *
 * ⚠️ **Waarom de tíjd van de laatste commit en niet die van de eerste.** Een
 *    branch begint hier met een lege claim-commit en krijgt daarna uren lang
 *    werk; op de aanmaaktijd zou elke lopende sessie na een halve dag rood staan.
 *    De tip beweegt zolang er gewerkt wordt en staat stil zodra dat ophoudt —
 *    en stilstand zónder PR is precies wat we zoeken.
 *
 * ⚠️ **Lager kan niet zomaar.** Onder een uur of acht ga je sessies melden die
 *    aan het bouwen zijn, en dan meldt hij de normale gang van zaken. Verlaag je
 *    dit ooit, hou het dan náást een echte dag werk aan en niet naast een
 *    gedachte.
 */
export const MAX_LEEFTIJD_UUR = 12;

/**
 * Branches die bewust buiten `main` staan, met per rij de reden.
 *
 * ⚠️ **Zonder dit register meldt dit script op dag één twintig dingen**, en dat
 *    is de vorm waarvan `CLAUDE.md` zegt dat je hem leert negeren. Wat hier
 *    hoort, is een branch waarover al besloten is dát hij blijft staan — niet
 *    een branch die nog gelandt moet worden. Die laatste hoort rood te zijn.
 *
 * ⚠️ **Een rij zonder branch is ook rood.** Anders groeit dit uit tot een
 *    verzameling dode uitzonderingen die niemand meer durft weg te halen, en dan
 *    onderdrukt het register op een dag een branch die toevallig dezelfde naam
 *    krijgt. Zelfde afspraak als het register in
 *    `tests/scripts/psql-verbinding.test.ts`.
 */
export const AANVAARD = [
  {
    branch: 'origin/fundering-16-08',
    reden:
      'De eerste opzet van 16-08-2026, met het navy-stelsel dat later los geland is. ' +
      'Bewaard als naslag bij het ontwerp; landt niet meer.',
  },
  {
    branch: 'origin/wip/werkboom-26-08',
    reden:
      '179 commits vangnet van 26-08-2026, ongesplitst. Het bruikbare deel is per issue ' +
      'opnieuw gebouwd; dit is de kopie waaruit dat gehaald wordt.',
  },
  {
    branch: 'origin/chore/linear-bijgewerkt-30-08',
    reden: 'Documentbranch van 30-08-2026 waarvan de tekst langs een andere weg geland is.',
  },
  {
    branch: 'origin/claude/goal-buddies-improvements-a1jbau',
    reden: 'Sessiebranch van 31-08-2026; het werk erin is via PR #128 geland.',
  },
  {
    branch: 'origin/claude/linear-backlog-plan-erjwv1',
    reden: 'Sessiebranch met de beslisronde over de strafvoorstellen; de besluiten staan in Linear.',
  },
  {
    branch: 'origin/claude/luz-de-luna-lera-setup-m2zt5y',
    reden: 'Hoort bij een ánder project en is hier per ongeluk gepusht. Zie QS8-240.',
  },
  {
    branch: 'origin/claude/qs8-252-besluiten-a53-a56',
    reden: 'Sessiebranch met A53 t/m A56; die besluiten staan in Linear en in de beslisdocumenten.',
  },
  {
    branch: 'origin/quintenstrijdonk/qs8-122-het-migratieregister-kent-twee-onverenigbare-nummeringen',
    reden:
      'De herstelbranch van de ontbrekende migraties 0057-0061, 176 commits achter. ' +
      'Het herstel zelf is geland; deze branch is de herkomst ervan.',
  },
];

/**
 * De PR-koppen uit de uitvoer van `git ls-remote origin` op `refs/pull/<n>/head`.
 *
 * ⚠️ Geeft een `Map` van SHA naar PR-nummer en niet een `Set`: het nummer staat
 *    in de melding, en zonder dat nummer moet de lezer zelf gaan zoeken welke PR
 *    er dan bij hoort.
 */
export function prHeadsUit(uitvoer) {
  const uit = new Map();
  for (const regel of String(uitvoer).split('\n')) {
    const m = /^([0-9a-f]{40})\s+refs\/pull\/(\d+)\/head$/.exec(regel.trim());
    if (m !== null) uit.set(m[1], Number(m[2]));
  }
  return uit;
}

/**
 * Welke branches nergens heen gaan, en welke registerrijen dood zijn.
 *
 * `branches` is een lijst `{ naam, sha, tip, commits, migraties }`; `tip` is een
 * `Date`. Geeft `{ zonderPr, dodeRijen }`.
 *
 * ⚠️ **Een branch die precies op een PR-head staat, telt als besloten** — ook
 *    als die PR gesloten is zonder merge. Dat is een besluit en geen vergeten
 *    branch, en het onderscheid daartussen is nu juist wat dit script maakt.
 */
export function beoordeel({
  branches,
  prHeads,
  register = AANVAARD,
  nu = new Date(),
  maxLeeftijdUur = MAX_LEEFTIJD_UUR,
}) {
  const aanvaard = new Set(register.map((r) => r.branch));
  const grens = maxLeeftijdUur * 3600_000;

  const zonderPr = branches
    .filter((b) => !aanvaard.has(b.naam))
    .filter((b) => !prHeads.has(b.sha))
    .map((b) => ({ ...b, leeftijdMs: nu.getTime() - b.tip.getTime() }))
    .filter((b) => b.leeftijdMs >= grens)
    .sort((a, b) => b.migraties.length - a.migraties.length || b.leeftijdMs - a.leeftijdMs);

  const bestaand = new Set(branches.map((b) => b.naam));
  const dodeRijen = register.filter((r) => !bestaand.has(r.branch)).map((r) => r.branch);

  return { zonderPr, dodeRijen };
}

function git(...argumenten) {
  return execFileSync('git', argumenten, { cwd: WORTEL, encoding: 'utf8' });
}

/** Zit `ref` volledig in `doel`? */
function zitIn(ref, doel) {
  try {
    git('merge-base', '--is-ancestor', ref, doel);
    return true;
  } catch {
    return false;
  }
}

/** De migratiebestanden die deze branch draagt en `main` niet. */
function migratiesVan(naam) {
  try {
    const basis = git('merge-base', STAM, naam).trim();
    return git('diff', '--name-only', basis, naam, '--', 'supabase/migrations')
      .split('\n')
      .filter((r) => r.trim() !== '')
      .map((r) => r.split('/').pop());
  } catch {
    return [];
  }
}

/**
 * Elke remote branch die niet in `main` zit, met alles wat de melding nodig heeft.
 *
 * ⚠️ **`origin/main` zelf valt eruit** omdat hij trivialiter in zichzelf zit, en
 *    `origin/HEAD` omdat dat geen branch is maar een verwijzing.
 */
export function ongelandeBranches() {
  let regels;
  try {
    regels = git(
      'for-each-ref',
      '--format=%(objectname)\t%(refname:short)\t%(committerdate:iso-strict)',
      'refs/remotes/origin',
    ).split('\n');
  } catch {
    return null;
  }

  const uit = [];
  for (const regel of regels) {
    const [sha, naam, datum] = regel.split('\t');
    if (!sha || !naam || naam === 'origin/HEAD' || zitIn(naam, STAM)) continue;
    uit.push({
      naam,
      sha,
      tip: new Date(datum),
      commits: Number(git('rev-list', '--count', `${STAM}..${naam}`).trim()),
      migraties: migratiesVan(naam),
    });
  }
  return uit;
}

/** De PR-koppen ophalen bij de remote, of `null` als dat niet lukt. */
export function leesPrHeads() {
  try {
    return prHeadsUit(
      execFileSync('git', ['ls-remote', 'origin', 'refs/pull/*/head'], {
        cwd: WORTEL,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      }),
    );
  } catch {
    return null;
  }
}

/** De melding als er niets te meten valt. */
function meldOverslag() {
  console.error(
    '⚠ branches-controle: OVERGESLAGEN — de PR-koppen zijn niet op te halen.\n' +
      '  Deze controle leest `git ls-remote origin refs/pull/*/head` om te zien over welke\n' +
      '  branch een besluit genomen is. Zonder netwerk of zonder leesrecht op de remote is\n' +
      '  er geen lijst, en dan is élke branch er een zonder PR — dat zou een melding zijn\n' +
      '  over de verbinding en niet over de branches.\n' +
      '  Dat is geen groene uitslag maar een ongemeten.',
  );
}

/** De melding over de branches die nergens heen gaan. */
function meldZonderPr(zonderPr) {
  for (const b of zonderPr) {
    const mig = b.migraties.length > 0 ? `, draagt ${b.migraties.join(', ')}` : '';
    console.error(
      `✗ ${b.naam}\n` +
        `    ${ouderdomInWoorden(b.leeftijdMs)}, ${b.commits} commit(s) vóór main${mig}`,
    );
  }
  console.error(
    '\n⚠️ Een branch zonder PR gaat nergens heen, en het werk erop rot terwijl het staat:\n' +
      'elke merge op main neemt een migratienummer in dat zo\'n branch nog nodig heeft, en\n' +
      'hernummeren wordt duurder met de dag. 📏 Op 09-09-2026 stonden er tien tegelijk,\n' +
      'waarvan zes met een nummer dat main intussen vergeven had (QS8-384).\n' +
      '\nPer branch is er één van drie antwoorden, en geen ervan is wachten:\n' +
      '  1. open er een PR en land hem;\n' +
      '  2. ruim hem op als het werk elders geland is;\n' +
      '  3. zet hem in AANVAARD in dit script, mét de reden waarom hij blijft staan.',
  );
}

/** De melding over registerrijen waarvan de branch weg is. */
function meldDodeRijen(dodeRijen) {
  for (const naam of dodeRijen) {
    console.error(`✗ AANVAARD noemt '${naam}', en die branch staat niet meer op de remote.`);
  }
  console.error(
    '\n⚠️ Een uitzondering zonder geval is een dode uitzondering. Laat je die staan, dan\n' +
      'groeit dit register uit tot een lijst die niemand meer durft op te schonen — en dan\n' +
      'onderdrukt hij op een dag een branch die toevallig dezelfde naam krijgt.',
  );
}

export function hoofd(leesBranches = ongelandeBranches, leesPr = leesPrHeads, fetch = haalRemoteOp) {
  for (const regel of versheidsmelding(fetch())) console.error(regel);

  const prHeads = leesPr();
  const branches = leesBranches();
  if (prHeads === null || branches === null) {
    meldOverslag();
    return 0;
  }

  const { zonderPr, dodeRijen } = beoordeel({ branches, prHeads });
  if (zonderPr.length > 0) meldZonderPr(zonderPr);
  if (dodeRijen.length > 0) meldDodeRijen(dodeRijen);
  if (zonderPr.length > 0 || dodeRijen.length > 0) return 1;

  console.log(
    `branches-controle: ${branches.length} branch(es) staan buiten main, ` +
      `${prHeads.size} pull requests nagelopen — elke branch zonder PR is jonger dan ` +
      `${MAX_LEEFTIJD_UUR} uur of staat met een reden in AANVAARD.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
