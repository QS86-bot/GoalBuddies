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
 * ## ⚠️⚠️ Het onderwerp van een merge is een titel, en een titel is vrij — QS8-611
 *
 * Tot 24-09-2026 las deze controle alleen het **onderwerp** van een landing, en
 * dat noemt het issuenummer alleen als iemand het in de PR-titel zette. 📏 Van
 * de 167 merges sinds 13-09 deden **24** dat niet, en **8** daarvan brachten wél
 * een claim-commit mee: QS8-589, 595, 596, 597, 598, 599, 606 en 608. Voor deze
 * controle waren alle acht vrij, en QS8-606 is zo op 24-09 opnieuw geclaimd.
 *
 * De claim-commit zelf is het signaal dat de merge meeneemt: elke branch die
 * met dit script begon draagt er een, en `git log origin/main` loopt ook door
 * de tweede ouder van een merge. Zo'n commit komt alleen op `main` als zijn
 * branch daar landt. 📏 Over de hele geschiedenis van `main` voegt die bron
 * precies die acht toe, en alle acht landden met werk (2 tot 13 bestanden).
 * Zie `claimVoor()`.
 *
 * ⚠️ **Waar hij blind is:** een *squash*- of *rebase-merge* laat geen
 *    claim-commit op `main` achter, en een rebase-merge ook geen merge-commit of
 *    `(#N)`. Dit project mergt met een merge-commit (CLAUDE.md), maar dat is één
 *    dashboardinstelling ver weg. Met een squash blijft alleen de titel over, en
 *    dan is het onderwerp weer de enige bron.
 *
 * Uitleg in `docs/decisions/2026-09-13-een-opgeruimde-branch-is-geen-vrij-issue.md`.
 *
 * ## ⚠️⚠️ Een branchnaam is vrij, en een vaste sessiebranch draagt nooit een nummer — QS8-620
 *
 * De eerste bron leest het **issuenummer in de branchnaam**. Een sessie die een
 * vaste branch opgelegd krijgt (`claude/…`) bouwt elk issue op een naam die per
 * constructie geen nummer draagt, dus haar werk was voor niemand zichtbaar. 📏 Op
 * 28-09-2026 is QS8-603 daardoor twee keer gebouwd.
 *
 * ⚠️ **En de oorzaak lag een laag lager dan de blinde leeskant.** `zetClaim()`
 *    doet `checkout -b … origin/main` en haalt zo'n sessie van haar eigen werk
 *    af — zij kón dit script niet draaien. Daarom zijn er twee helften:
 *    `--hier` claimt op de branch waar je al staat, en `meldVasteBranch()`
 *    weigert de standaardweg zodra die een sessie van haar branch zou halen.
 *
 * De derde bron is daarmee de **claim-commit op een andere branch dan `main`**:
 * `bezetteNaamlozeBranches()` leest wat er vóór `origin/main` op elke remote
 * branch staat. Geen extra netwerkaanroep — de fetch hierboven haalt élke branch
 * op.
 *
 * ⚠️⚠️ **Met een grens, en zonder die grens is de bron onbruikbaar.** 📏 Op
 *    05-10-2026 stonden er **176** unieke claim-commits vóór `main`, die over de
 *    34 branches samen **533** branch-claimparen opleveren — terwijl er **acht**
 *    issues echt in uitvoering waren. Vijf afgedwaalde branches dragen er 47 tot
 *    154 per stuk. Zie `MAX_ONAFGERONDE_CLAIMS`.
 *
 * Uitleg in `docs/decisions/2026-10-05-de-claim-ziet-een-vaste-sessiebranch-nooit.md`.
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
 * De gelande onderwerpregels die dít issuenummer noemen, plus zijn
 * claim-commit als die op `main` staat (`claimVoor()`, QS8-611).
 *
 * ⚠️ De linkergrens zit in het letterlijke `qs8-`: `qs8-1449` bevat geen
 *    `qs8-449`. De rechtergrens is `(?![0-9])`, anders is `QS8-4491` een
 *    treffer op 449.
 */
export function gelandVoor(nummer, onderwerpen) {
  const patroon = new RegExp(`${TEAM}-${nummer}(?![0-9])`, 'i');
  return onderwerpen.filter(
    (regel) => (isGelandeVorm(regel) && patroon.test(regel)) || claimVoor(nummer, regel),
  );
}

/**
 * Is deze onderwerpregel de claim-commit van dít issue? — QS8-611.
 *
 * Staat hij op `main`, dan is zijn branch daar geland: `zetClaim()` maakt hem
 * op een eigen branch, en alleen een merge brengt hem naar `main`. Dat hangt
 * niet af van hoe iemand zijn PR-titel schrijft.
 *
 * ⚠️ **Alleen het nummer direct na `claim: `.** Een gestapelde claim noemt ook
 *    de branch waar hij op staat (*"bezet, gestapeld op QS8-590"*); dat is geen
 *    claim op 590, en diens eigen claim-commit staat er dan toch al.
 *
 * ⚠️ **En alleen aan het begin van de regel.** Dit project citeert in
 *    commit-teksten volop andere commits; een onderwerp dat `claim: QS8-777`
 *    middenin noemt, is geen claim.
 */
export function claimVoor(nummer, onderwerp) {
  return new RegExp(`^claim: ${TEAM}-${nummer}(?![0-9])`, 'i').test(onderwerp);
}

/**
 * Hoeveel onafgeronde claims een branch mag dragen om nog een wérkbank te zijn
 * — QS8-620.
 *
 * ⚠️⚠️ **Zonder deze grens is de bron onbruikbaar, en dat is gemeten en niet
 *    gevreesd.** 📏 Op 05-10-2026 stonden er **176** unieke claim-commits vóór
 *    `main`. Per branch geteld — en dat is hoe deze grens kijkt — zijn het
 *    **533** paren over 34 branches, want de twee grootste delen bijna hun hele
 *    geschiedenis. Het overgrote deel zit in vijf afgedwaalde branches die nooit
 *    geland zijn:
 *
 *      qs8-438-…                          154 claims, 1832 commits vóór main
 *      overdracht-13-09                   153 claims, 1832
 *      qs8-388-…                           83 claims, 1466
 *      qs8-375-…                           70 claims, 1401
 *      claude/linear-backlog-plan-erjwv1   47 claims, 1269
 *
 *    Werk dat écht in uitvoering is, draagt er **één**, op 1 tot 3 commits —
 *    gemeten over qs8-631, qs8-624, qs8-623, qs8-621, qs8-606, qs8-603, qs8-525
 *    en qs8-233. Een regel zonder grens zou dus 176 bezettingen melden waar er
 *    acht zijn, en een controle die alles meldt leer je te negeren.
 *
 * ⚠️ **De grens is structureel en niet een datum, met opzet.** Een tipdatum zou
 *    hier vandaag ook werken, maar een datumdrempel wordt vanzelf onwaar zonder
 *    dat er iets rood van gaat — dezelfde klasse als de prijstabel die een datum
 *    in een commentaarregel droeg (QS8-187). Het aantal onafgeronde claims is
 *    een eigenschap van het ding zelf: een sessie werkt aan één issue, een
 *    kerkhof draagt er honderdvijftig.
 *
 * ⚠️ **En de bron ruimt zichzelf op.** `origin/main..<branch>` krimpt zodra werk
 *    landt, dus de claim van een afgerond issue valt er vanzelf uit. Dat is
 *    precies het verschil met `gelandVoor()`, die de ándere kant leest.
 */
export const MAX_ONAFGERONDE_CLAIMS = 3;

/**
 * De branches die dít issue bezet houden zonder het in hun naam te dragen —
 * QS8-620.
 *
 * `takken` is een lijst van `{ naam, claims }`, waarin `claims` de
 * onderwerpregels zijn die vóór `origin/main` op die branch staan. Puur en
 * apart geëxporteerd, want een grens die je niet los kunt aanbieden kun je niet
 * ijken.
 *
 * ⚠️ **Een branch die het nummer wél in zijn naam heeft, valt hier af.** Die
 *    vindt `botsendeBranches()` al, en twee meldingen over dezelfde branch maken
 *    de melding slechter in plaats van beter.
 *
 * ⚠️ `tip` staat in het type omdat `meldNaamlozeBezetting()` hem leest: een
 *    branchbevinding noemt de ouderdom van zijn bewijs (QS8-435). Deze functie
 *    gebruikt hem zelf niet — hij reist mee.
 *
 * @param {number} nummer
 * @param {Array<{naam: string, tip: string, claims: string[]}>} takken
 */
export function bezetteNaamlozeBranches(nummer, takken) {
  return takken.filter(
    (tak) =>
      botsendeBranches(nummer, [tak.naam]).length === 0 &&
      tak.claims.length <= MAX_ONAFGERONDE_CLAIMS &&
      tak.claims.some((regel) => claimVoor(nummer, regel)),
  );
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

/** Elke remote branch behalve `main` zelf. `origin/HEAD` is een verwijzing. */
function remoteTakken() {
  return git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'])
    .split('\n')
    .map((regel) => regel.trim())
    .filter((ref) => ref !== '' && ref !== 'origin/HEAD' && ref !== 'origin/main');
}

/**
 * Wat er per remote branch vóór `main` staat — QS8-620.
 *
 * ⚠️ **Geen netwerkaanroep.** `haalRemoteOp()` doet `git fetch --prune origin`
 *    en dat haalt élke branch op, dus de objecten staan al lokaal. Dat is
 *    dezelfde eigenschap waarop de tweede bron van QS8-449 leunt.
 *
 * ⚠️ **De claims worden hier in JS gefilterd en niet met `git log --grep`.** Die
 *    zoekt in het hele bericht, dus een commit die `claim: QS8-N` in zijn *body*
 *    citeert zou meetellen in de telling waar `MAX_ONAFGERONDE_CLAIMS` op
 *    beslist — en dan kan een citaat een échte bezetting onzichtbaar maken door
 *    de branch over de grens te duwen. `%s` is het onderwerp, en dat is wat
 *    `claimVoor()` leest.
 *
 * ⚠️ Eén `git log` per branch, lokaal. 📏 34 branches op 05-10-2026, waarvan de
 *    vijf grootste 1832 regels teruggeven; dat is onder een seconde en het staat
 *    naast een fetch die al over het netwerk ging.
 */
function takkenMetClaims() {
  return remoteTakken().map((ref) => ({
    naam: ref.replace(/^origin\//, ''),
    tip: git(['log', '-1', '--format=%cs', ref]).trim(),
    claims: git(['log', '--format=%s', `origin/main..${ref}`])
      .split('\n')
      .filter((regel) => /^claim: /i.test(regel)),
  }));
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

/**
 * Er zit iemand op een branch die het nummer niet in zijn naam draagt — QS8-620.
 *
 * Weigert hard, net als `meldBezet()`: dit is bezetting *nu* en geen gelande
 * geschiedenis. De tipdatum staat erbij omdat een branchbevinding zonder de
 * ouderdom van zijn bewijs een disclaimer is (QS8-435).
 */
function meldNaamlozeBezetting(nummer, takken) {
  console.error(
    `\n✗ claim: ${TEAM.toUpperCase()}-${nummer} is al bezet — ${takken.length} branch(es) zónder het nummer in hun naam:`,
  );
  for (const tak of takken) {
    console.error(`    ${tak.naam}  (laatste commit ${tak.tip}, ${tak.claims.length} onafgeronde claim(s))`);
  }
  console.error(
    '\n  Die naam draagt geen issuenummer, dus de branchlijst zag dit issue als\n' +
      '  vrij — maar de claim-commit op die branch zegt dat er iemand zit. Dat is\n' +
      '  het gat waardoor QS8-603 op 28-09 twee keer gebouwd is.\n' +
      '\n  Bouw dit issue niet. Een sessie die op één vaste branch werkt, claimt\n' +
      '  daar met `--hier`; dat is wat je hier ziet.',
  );
}

/**
 * De twee berichtdelen van een claim-commit. Puur, zodat een toets ze kan lezen
 * zonder een repo te bouwen.
 *
 * ⚠️ Het onderwerp is wat `claimVoor()` en `bezetteNaamlozeBranches()` straks
 *    lezen. Verander je de vorm hier, dan verandert hij daar mee — en dat is de
 *    reden dat beide kanten dezelfde functie delen in plaats van elk hun eigen
 *    letterlijke tekst te dragen.
 *
 * ⚠️ **Het returntype is een tuple en geen `string[]`, met opzet.** Onder
 *    `noUncheckedIndexedAccess` geeft `const [a, b] = …` op een array
 *    `string | undefined`, en dan moet elke aanroeper een `undefined` wegwerken
 *    die er niet kan zijn. Twee velden met een vaste volgorde zijn een tuple.
 *
 * @param {number} nummer
 * @param {string} nu Uur en minuut in UTC, als `HH:MM`.
 * @param {boolean} vervolg
 * @returns {[string, string]} Het onderwerp en de body.
 */
export function claimBericht(nummer, nu, vervolg) {
  const staart = vervolg
    ? '\n\nMet --vervolg gezet: er is al werk voor dit issue op main geland en de\nclaimende sessie heeft vastgesteld dat er een echt vervolg open staat.'
    : '';

  return [
    `claim: ${TEAM.toUpperCase()}-${nummer} — bezet sinds ${nu} UTC`,
    'Lege claim-commit, zie scripts/claim.mjs en QS8-294. Er werken twee sessies\n' +
      'in deze backlog; een branch op de remote is het enige signaal dat ze\n' +
      'allebei aantoonbaar lezen.' +
      staart,
  ];
}

/** De branch waar de sessie nu op staat. */
function huidigeBranch() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

/** Het uur en de minuut in UTC, zoals de claim-commit ze draagt. */
function nuInUtc() {
  return new Date().toISOString().slice(11, 16);
}

function zetClaim(naam, nummer, vervolg) {
  const [onderwerp, body] = claimBericht(nummer, nuInUtc(), vervolg);

  git(['checkout', '-b', naam, 'origin/main']);
  git(['commit', '--allow-empty', '-m', onderwerp, '-m', body]);
  git(['push', '-u', 'origin', naam]);
}

/**
 * De claim op de branch waar de sessie al staat — QS8-620.
 *
 * ⚠️ **Waarom dit nodig is.** Een sessie kan een vaste branch opgelegd krijgen
 *    en mag er niet af; `zetClaim()` doet `checkout -b … origin/main` en haalt
 *    zo'n sessie van haar eigen werk af. Die kan het gereedschap dus niet
 *    gebruiken, en gebruikte het ook niet: 📏 van de 33 merges sinds 13-09
 *    zonder claim-commit waren de zeven recentste issue-bouwen alle zeven van
 *    zo'n sessie.
 *
 * ⚠️ **En de claim moet gepusht worden om iets te zijn.** Een claim-commit die
 *    alleen lokaal staat, is voor de andere sessie niet te zien — dan is het een
 *    aantekening en geen claim.
 */
function zetClaimHier(nummer, vervolg) {
  const naam = huidigeBranch();
  const [onderwerp, body] = claimBericht(nummer, nuInUtc(), vervolg);

  git(['commit', '--allow-empty', '-m', onderwerp, '-m', body]);
  git(['push', '-u', 'origin', naam]);
  return naam;
}

function hoofd() {
  const argumenten = process.argv.slice(2);
  const vervolg = argumenten.includes('--vervolg');
  const hier = argumenten.includes('--hier');
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

  const naamloos = bezetteNaamlozeBranches(nummer, takkenMetClaims());
  if (naamloos.length > 0) {
    meldNaamlozeBezetting(nummer, naamloos);
    process.exit(1);
  }

  const gelande = gelandVoor(nummer, onderwerpenOpMain());
  if (gelande.length > 0 && !vervolg) {
    meldGeland(nummer, gelande);
    process.exit(1);
  }

  if (hier) {
    meldGeslaagd(nummer, zetClaimHier(nummer, gelande.length > 0), gelande.length, true);
    return;
  }

  const eigen = huidigeBranch();
  if (eigen !== 'main' && nummerUit(eigen) === null) {
    meldVasteBranch(eigen);
    process.exit(1);
  }

  const { naam, vanLinear } = claimNaam(argument, nummer);
  zetClaim(naam, nummer, gelande.length > 0);
  meldGeslaagd(nummer, naam, gelande.length, vanLinear);
}

/** Wat er na een geslaagde claim op het scherm hoort. */
function meldGeslaagd(nummer, naam, gelande, naamIsBesloten) {
  console.log(`\n✓ claim: ${TEAM.toUpperCase()}-${nummer} bezet op ${naam}`);
  if (gelande > 0) {
    console.log(`⚠ Met --vervolg gezet — ${gelande} regel(s) op main wijzen op geland werk voor dit issue.`);
  }
  if (!naamIsBesloten) {
    console.log(
      '⚠ Dit is een terugvalnaam. Linear koppelt branch, PR en issue alleen\n' +
        '  automatisch aan elkaar bij de naam die hij zelf voorstelt — plak die\n' +
        '  volgende keer mee als argument.',
    );
  }
  console.log('  Zet het issue nu ook op In Progress in Linear.');
}

/**
 * De sessie staat op een branch zonder issuenummer — QS8-620.
 *
 * ⚠️ **Weigeren en niet waarschuwen, want de standaardweg haalt zo'n sessie van
 *    haar eigen werk af.** `zetClaim()` doet `checkout -b … origin/main`. Dat is
 *    precies de reden dat een sessie met een opgelegde branch dit gereedschap
 *    niet kón gebruiken, en dus niet gebruikte.
 */
function meldVasteBranch(eigen) {
  console.error(
    `\n✗ claim: je staat op \`${eigen}\`, en die naam draagt geen issuenummer.\n` +
      '\n  De gewone weg maakt een branch per issue vanaf origin/main, en dat zou\n' +
      '  je van deze branch af halen. Twee uitwegen:\n' +
      '\n    npm run claim -- <issue> --hier     claim op déze branch, en push hem\n' +
      '    git checkout main                   en daarna de gewone weg\n' +
      '\n  Met --hier draagt je sessiebranch de claim-commit, en dan ziet de\n' +
      '  andere sessie je werk wél — dat is wat QS8-620 repareert.',
  );
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
