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

/**
 * Bestandsnaam per nummer, uit een lijst bestandsnamen — QS8-310.
 *
 * ⚠️ **De sleutel is het nummer mét zijn letter** (`0052a` naast `0052`), en dat
 *    is dezelfde afspraak als de dubbelcheck in `migraties-controle.mjs`. Zou de
 *    letter wegvallen, dan zou een deelmigratie als botsing met haar eigen
 *    hoofdnummer gelden.
 *
 * ⚠️ **Waarom dit náást `nummersUit()` staat en die niet vervangt.** Die functie
 *    beantwoordt "welke nummers draagt deze branch"; deze beantwoordt "welk
 *    bestand draagt dit nummer daar". Voor het gat aan de bovenkant is de eerste
 *    genoeg en is een naam ruis; voor een botsing is juist de naam het hele
 *    verschil.
 */
export function namenPerSleutel(bestandsnamen) {
  const uit = {};
  for (const naam of bestandsnamen) {
    const kaal = naam.split('/').pop() ?? '';
    const m = /^(\d{4})([a-z]?)_[a-z0-9_]+\.sql$/.exec(kaal);
    if (m !== null) uit[`${m[1]}${m[2]}`] = kaal;
  }
  return uit;
}

/**
 * Welke nummers een branch draagt onder een ándere naam dan hier — QS8-310.
 *
 * `lokaal` en elke waarde in `perBranch` zijn objecten van sleutel naar
 * bestandsnaam, zoals `namenPerSleutel()` ze maakt.
 *
 * ⚠️ **Dit is het gat dat `ontbrekendPerBranch()` per constructie niet ziet.**
 *    Die vergelijkt nummers: draagt de zusterbranch 0175 en draag ik ook een
 *    0175, dan ontbreekt er niets en zwijgt hij — ongeacht of het hetzelfde
 *    bestand is. Erger nog, hij meldde het wél zolang mijn map het nummer nog
 *    niet had ("0175 ontbreekt hier"), en viel stil op het moment dat de
 *    botsing ontstónd. De melding verdween precies toen ze nodig werd.
 *
 * ⚠️ **Dezelfde naam is géén bevinding.** Elke branch die van `main` afstamt
 *    draagt al zijn migraties; die allemaal melden zou de controle waardeloos
 *    maken, en dat is de vorm waarvan CLAUDE.md zegt dat je hem leert negeren.
 *    Alleen een ándere naam onder hetzelfde nummer is een botsing.
 *
 * ⚠️ **Beide kanten op leeg is geen bevinding**, om dezelfde reden als hierboven
 *    bij `ontbrekendPerBranch()`: een branch zonder migratiemap telt als nul, en
 *    een lege werkkopie heeft geen map om iets over te zeggen.
 *
 * ⚠️ **En dezelfde migratie onder een ánder nummer is óók geen bevinding —
 *    QS8-313.** Landt jouw migratie en hernummert `main` hem van 0182 naar 0183,
 *    dan draagt elke zusterbranch die `main` nog niet binnengehaald heeft nog
 *    steeds `0182_jouw_migratie.sql`. Op nummer én naam is dat een botsing; in
 *    werkelijkheid kijk je naar je eigen bestand onder zijn oude nummer, en er
 *    is niets te hernummeren — die branch hoeft alleen `main` binnen te halen.
 *
 *    📏 Het geval deed zich meteen voor: `qs8-317` vertakte vóór de hernummering
 *    van 0182 naar 0183 en meldde daarna een botsing met een migratie die van
 *    mij was. Vandaar dat de romp van de naam meetelt: draag ik dat bestand al
 *    onder een ander nummer, dan is het hetzelfde bestand en geen tweede claim
 *    op dat nummer.
 *
 *    ⚠️ Dit is een **tweede** grendel naast de gelande-branchfilter in
 *    `remoteTakken()`, en ze vangen verschillende gevallen: die filter kijkt of
 *    de bránch geland is, deze of het béstand hier al staat. Een open branch met
 *    een oud nummer voor mijn bestand is geland noch afwezig.
 *
 * ⚠️ **Hier stond een `lokaal is leeg`-wacht zoals `ontbrekendPerBranch()` die
 *    heeft, en die is er bij het ijken uitgehaald.** Daar is hij dragend: die
 *    functie meldt wat híer ontbreekt, dus zonder wacht telt bij een lege map
 *    élk nummer als ontbrekend. Hier draait het om, want een botsing vraagt een
 *    naam aan béide kanten — bij een lege map is `hier` altijd `undefined` en
 *    valt de lus vanzelf leeg uit. De mutatie bewees het: met de wacht eruit
 *    bleven alle tests groen, ook de test die beweerde hem te bewaken. Twee
 *    grendels waarvan er één niets doet, is er één te veel (QS8-302).
 */
export function botsendPerBranch({ lokaal, perBranch }) {
  const romps = new Set(Object.values(lokaal).map(romp));

  const uit = [];
  for (const [branch, namen] of Object.entries(perBranch)) {
    const botsingen = [];
    for (const [sleutel, daar] of Object.entries(namen)) {
      const hier = lokaal[sleutel];
      if (hier === undefined || hier === daar) continue;
      if (romps.has(romp(daar))) continue;
      botsingen.push({ nummer: sleutel, hier, daar });
    }
    if (botsingen.length > 0) {
      uit.push({ branch, botsingen: botsingen.sort((a, b) => a.nummer.localeCompare(b.nummer)) });
    }
  }
  return uit.sort((a, b) => a.branch.localeCompare(b.branch));
}

/**
 * De naam van een migratie zonder zijn nummer — `0182_het_oppervlak.sql` wordt
 * `het_oppervlak.sql`.
 *
 * ⚠️ Bewust ruim: wat er niet uitziet als een genummerde migratie komt
 *    ongewijzigd terug. Een naam die de vorm mist wordt elders al als onleesbaar
 *    gemeld, en hier een tweede oordeel vellen levert twee meldingen op voor één
 *    fout.
 */
function romp(naam) {
  return String(naam).replace(/^\d{4}[a-z]?_/, '');
}

/** Vier cijfers, zoals de bestandsnamen ze schrijven. */
export function alsNummer(n) {
  return String(n).padStart(4, '0');
}

function git(...argumenten) {
  return execFileSync('git', argumenten, { cwd: WORTEL, encoding: 'utf8' });
}

/**
 * De hoofdbranch op de remote, of `null` als die niet te vinden is — QS8-313.
 *
 * ⚠️ **Eerst `origin/main`, dan pas `origin/HEAD`.** Dit project heeft `main` als
 *    hoofdbranch (CLAUDE.md), en 📏 in een cloudcheckout is `origin/HEAD` gemeten
 *    géén symbolische ref (`fatal: ref refs/remotes/origin/HEAD is not a
 *    symbolic ref`) — alleen daarop leunen zou de filter uitzetten op precies de
 *    machines waar de poort draait.
 */
function hoofdtak() {
  try {
    git('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main');
    return 'refs/remotes/origin/main';
  } catch {
    /* geen main; probeer HEAD */
  }
  try {
    const ref = git('symbolic-ref', 'refs/remotes/origin/HEAD').trim();
    return ref === '' ? null : ref;
  } catch {
    return null;
  }
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

/**
 * De remote branches waar een oordeel over te vellen valt — QS8-313.
 *
 * ⚠️ **Een gelande branch telt niet mee, en dat is geen zuinigheid maar de
 *    reparatie zelf.** Zit een branch volledig in `origin/main`, dan staan zijn
 *    migraties al in de map die deze controle als *hier* leest — alleen mogelijk
 *    onder een ander nummer, want wie als tweede mergede heeft hernummerd. Elke
 *    melding over zo'n branch is per definitie vals alarm.
 *
 * ⚠️ **En die klasse groeit bij elke merge.** 📏 Gemeten op `origin/main`
 *    (16b7c16) op 07-09-2026: zes meldingen, alle zes over branches die al
 *    geland waren — de poort stond dus rood op een schone `main`. Dat is de vorm
 *    die dit project bij QS8-304 duur betaald heeft: *een rode uitslag die niet
 *    over jouw wijziging gaat, leert je de uitslag te negeren*, en die gewoonte
 *    vangt de volgende échte rode op als ruis. Hoe beter het project draait, hoe
 *    luider deze controle loog.
 *
 * ⚠️ **De hoofdbranch zelf blíjft meetellen, en dat is de smalle helft van de
 *    filter.** `origin/main` zit trivialiter in zichzelf; zou hij eruit vallen,
 *    dan verdween de melding *main draagt migraties die hier ontbreken* — en dat
 *    is juist het nuttigste geval van stap 4: je branch loopt achter en moet
 *    `main` binnenhalen. De filter gaat over gelande zíjtakken, niet over de stam.
 *
 * ⚠️ **Zonder hoofdbranch geen filter.** Is er geen `origin/main` en geen
 *    bruikbare `origin/HEAD`, dan wordt er niets weggelaten: liever een melding
 *    te veel dan een controle die stil is om een reden die niemand gemeten heeft.
 *
 * Geeft `null` bij afwezigheid van git of remote, zoals de aanroepers verwachten.
 */
function remoteTakken() {
  let branches = [];
  try {
    branches = git('for-each-ref', '--format=%(refname)', 'refs/remotes/origin')
      .split('\n')
      .filter((r) => r.trim() !== '' && !r.endsWith('/HEAD'));
  } catch {
    // Geen git, geen remote, geen oordeel.
    return null;
  }

  const stam = hoofdtak();
  if (stam === null) return branches;

  return branches.filter((ref) => ref === stam || !zitIn(ref, stam));
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
  const branches = remoteTakken();
  if (branches === null) return null;

  const perBranch = {};
  for (const ref of branches) {
    perBranch[ref.replace('refs/remotes/', '')] = nummersUit(bestandenVan(ref));
  }
  return perBranch;
}

/** De migratiebestanden die een ref draagt; een ref zonder map telt als nul. */
function bestandenVan(ref) {
  try {
    return git('ls-tree', '-r', '--name-only', ref, `${MAP}/`).split('\n');
  } catch {
    return [];
  }
}

/**
 * De remote kopie van de branch waar je zélf op staat, of `null` — QS8-310.
 *
 * ⚠️ **Die telt niet als zusterbranch, en dat is een gemeten noodzaak.** Tussen
 *    het hernummeren van je eigen migratie en het pushen ervan draagt je remote
 *    kopie nog het oude nummer, terwijl je werkkopie het nieuwe draagt en `main`
 *    het oude onder een andere naam. De botsingscontrole zou dan naar jóuw eigen
 *    achtergebleven push wijzen, precies op het moment dat je de poort draait om
 *    te mogen pushen. Dat is de melding die je leert wegklikken.
 */
function eigenRemoteTak() {
  try {
    const tak = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
    return tak === '' || tak === 'HEAD' ? null : `origin/${tak}`;
  } catch {
    return null;
  }
}

/**
 * Elke remote branch met de bestandsnaam per migratienummer — QS8-310.
 *
 * Zelfde scan als `nummersPerBranch()`, maar met de namen erbij: voor een
 * botsing is de naam het hele verschil. Geeft `null` zonder git of remote, net
 * als die functie, zodat de aanroeper één manier heeft om te zwijgen.
 */
export function namenPerBranch() {
  const branches = remoteTakken();
  if (branches === null) return null;

  const eigen = eigenRemoteTak();
  const perBranch = {};
  for (const ref of branches) {
    const naam = ref.replace('refs/remotes/', '');
    if (naam === eigen) continue;
    perBranch[naam] = namenPerSleutel(bestandenVan(ref));
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
 *    `tests/scripts/migratie-fetch.test.ts` meet beide kanten met een
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
