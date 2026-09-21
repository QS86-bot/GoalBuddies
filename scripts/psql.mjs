/**
 * Eén psql-aanroep voor de controles die de dráaiende database lezen.
 *
 * ⚠️ **Waarom dit bestand bestaat.** Vijf controles — `definers`, `klokgrens`,
 *    `kolomrechten`, `pin` en `zichtbaarheid` — bouwden ieder hun eigen
 *    `psql`-aanroep, en alle vijf op dezelfde manier fout: zonder `-U`. Dan valt
 *    psql terug op de **OS-gebruiker**, en in de bouwomgeving is dat `root`,
 *    waar geen databaserol voor bestaat. De verbinding faalt en het script meldt
 *    *"Geen database om tegen te meten — start de lokale stack"* terwijl die
 *    stack draait en de RLS-suite er wél tegen meet.
 *
 *    De poort telde die vijf daarna bij de vier die écht productiesleutels
 *    vragen en meldde *"9 controle(s) zonder database"*. Die zin leest als een
 *    grens van de omgeving; het was een ontbrekende env-var. **De poort heeft dus
 *    meer overgeslagen dan iemand dacht** — en `CLAUDE.md` zegt bij de
 *    commando's juist dat een controle zonder database *ongemeten* is en geen
 *    bewijs. Zie QS8-268.
 *
 * ⚠️ **Een melding die de verkeerde oorzaak noemt, is duurder dan geen melding.**
 *    "Start de stack" terwijl de stack draait, stuurt de lezer weg van de
 *    oplossing, en de logische volgende stap is dan de uitslag accepteren.
 *    Daarom deelt `verbindingsoordeel()` de mislukking in vier gevallen in en
 *    schrijft `verbindingsmelding()` per geval wat er te doen valt.
 *
 * ⚠️ **`schema-opbouwen.sh` deed het al goed** (`-U "${PGUSER:-postgres}"`); de
 *    controles waren de uitzondering. Dat is precies waarom dit één gedeeld
 *    bestand is en geen vijfde kopie: elke definer-functie in dit project is ook
 *    een kopie van de vorige geworden.
 */

/** De database die de lokale stack opbouwt. */
export const STANDAARD_DB = 'goalbuddies_rls';

/**
 * De rol waaronder de lokale stack alles aanmaakt.
 *
 * ⚠️ **Dit is de hele reparatie van QS8-268.** Zonder deze regel valt psql terug
 *    op de OS-gebruiker, en die heet hier `root`.
 */
export const STANDAARD_GEBRUIKER = 'postgres';

/**
 * De poort waarop `scripts/lokale-stack.sh` draait.
 *
 * ⚠️ **5433 en niet psql's eigen 5432.** Dit getal staat ook in
 *    `scripts/lokale-stack.sh` en in `tests/rls/psql-stack.ts`; wie het hier
 *    verandert, verandert het daar mee.
 */
export const STANDAARD_POORT = '5433';

/**
 * De argumenten waarmee een controle psql aanroept.
 *
 * ⚠️ **`-w` staat er met opzet bij.** Zonder die vlag vraagt psql interactief om
 *    een wachtwoord zodra de rol er een nodig heeft, en een `execFileSync` die
 *    op een prompt wacht **hangt** in plaats van te falen. Een controle die
 *    hangt is erger dan een die rood wordt: in CI kost hij het hele budget van
 *    de job en de uitslag is "nog bezig", niet "fout".
 *
 * ⚠️ **De poort staat er sinds QS8-270 wél bij, en dat corrigeert de redenering
 *    die hier eerst stond.** Er stond: *psql leest `PGPORT` zelf; een eigen
 *    standaard zou stil afwijken van wat de rest van de omgeving doet.* Dat
 *    klopte niet — psql's eigen standaard is **5432**, en de rest van dit project
 *    draait op **5433** (`scripts/lokale-stack.sh` op `${PGPORT:-5433}`, en
 *    `tests/rls/psql-stack.ts` net zo). Zónder deze regel keken deze controles
 *    dus naar een poort waar niets staat en meldden ze "geen database" op een
 *    machine waar de stack gewoon draait — precies de fout die QS8-268 was, één
 *    dimensie verder. Gemeten: negen ongemeten controles zonder `PGPORT`, vier
 *    ermee.
 *
 * @param {string} sql
 * @param {Record<string, string | undefined>} [env]
 * @returns {string[]}
 */
export function psqlArgumenten(sql, env = process.env) {
  const db = env.DB ?? env.PGDATABASE ?? STANDAARD_DB;
  const args = [
    '--quiet',
    '--no-psqlrc',
    '-At',
    '-w',
    '-d',
    db,
    '-U',
    env.PGUSER ?? STANDAARD_GEBRUIKER,
    '-p',
    env.PGPORT ?? STANDAARD_POORT,
    '-c',
    sql,
  ];
  if (env.PGHOST) args.unshift('-h', env.PGHOST);
  return args;
}

/**
 * Waaróm de verbinding mislukte, uit wat psql erover zei.
 *
 * ⚠️ **`connection to server ... failed:` staat met opzet in géén enkel patroon,
 *    en dát is de hele verdediging.** Élke psql-mislukking begint met die zin —
 *    ook die waarbij de server prima draait. Een indeling die erop aanslaat,
 *    noemt een geweigerde gebruiker een ontbrekende database, en dat ís QS8-268.
 *    Elk patroon hieronder toetst dus op het stuk dat ná die zin komt.
 *
 * ⚠️ **De volgorde is een tweede riem en geen slot.** Nagemeten: de drie
 *    patronen sluiten elkaar vandaag uit, dus omdraaien verandert niets — de
 *    ijking van QS8-268 liet dat zien. Specifiek-voor-algemeen blijft staan
 *    omdat het de goedkoopste marge is zodra iemand een patroon verbreedt.
 */
/** @param {unknown} melding */
export function verbindingsoordeel(melding) {
  const tekst = String(melding ?? '');

  if (/database "[^"]*" does not exist/i.test(tekst)) return 'geen-database';

  if (
    /no password supplied|password authentication failed|authentication failed for user|role "[^"]*" does not exist|Peer authentication failed|permission denied for database/i.test(
      tekst,
    )
  ) {
    return 'geweigerd';
  }

  if (
    /Connection refused|Is the server running|could not connect to server|Connection timed out|No such file or directory|server closed the connection/i.test(
      tekst,
    )
  ) {
    return 'geen-server';
  }

  return 'onbekend';
}

/**
 * De regel waaraan de poort een geweigerde gebruiker herkent.
 *
 * ⚠️ **Dezelfde vorm als `OVERGESLAGEN` in `poort.mjs`, en om dezelfde reden.**
 *    Een patroon op de kále woorden vindt ook een citaat ervan — bijvoorbeeld in
 *    de uitvoer van de test die dit gedrag bewijst. Het anker is daarom de
 *    regelvorm die een controle zélf schrijft, en de poort past hem alleen toe
 *    op een stap van het soort `controle`.
 */
export const GEWEIGERD_REGEL = 'GEWEIGERD';

/**
 * Wat een controle op stderr zet als hij de database niet kon lezen.
 *
 * `naam` is de scriptnaam (`definers-controle`), `leest` één zin over wát hij
 * uitleest — die zin is de reden dat de migratiebestanden hier geen antwoord
 * geven.
 *
 * ⚠️ **Alleen `geen-server` en `geen-database` heten OVERGESLAGEN.** Dat zijn de
 *    twee gevallen waarin er werkelijk niets te meten valt. Een geweigerde
 *    gebruiker is een kapotte instelling: de database ligt er, en dan is
 *    "zonder database" dezelfde onwaarheid één laag hoger.
 */
/** @param {{ naam: string, leest: string, melding: unknown }} opties */
export function verbindingsmelding({ naam, leest, melding }) {
  const oordeel = verbindingsoordeel(melding);
  const eerste = String(melding ?? '').split('\n')[0] ?? '';
  const staart = `\n\npsql zei: ${eerste}`;

  if (oordeel === 'geweigerd') {
    return (
      `✗ ${naam}: ${GEWEIGERD_REGEL} — de server draait, maar deze gebruiker mag er niet in.\n\n` +
      `${leest}\n` +
      'Dit is geen ontbrekende database maar een instelling: psql verbond wel en\n' +
      'werd geweigerd. Draai je met een eigen `PGUSER` of `PGPASSWORD`, controleer\n' +
      `die dan; zonder \`PGUSER\` gebruikt deze controle \`${STANDAARD_GEBRUIKER}\`.` +
      staart
    );
  }

  if (oordeel === 'geen-database') {
    return (
      `⚠ ${naam}: OVERGESLAGEN — de server draait, maar deze database bestaat er niet.\n\n` +
      `${leest}\n` +
      'Bouw hem op met `npm run rls:stack`.' +
      staart
    );
  }

  if (oordeel === 'geen-server') {
    return (
      `⚠ ${naam}: OVERGESLAGEN — geen database om tegen te meten.\n\n` +
      `${leest}\n` +
      'Start de lokale stack met `npm run rls:stack`.' +
      staart
    );
  }

  return (
    `✗ ${naam}: psql kwam er niet doorheen, en niet om een reden die hier bekend is.\n\n` +
    `${leest}\n` +
    'Hieronder staat letterlijk wat psql zei; dat is meer waard dan een gok.' +
    staart
  );
}

/**
 * Regels die nooit de **reden** van een mislukking zijn.
 *
 * ⚠️ `drop database if exists` op iets wat er niet is, schrijft
 *    `NOTICE: database "x" does not exist, skipping` — en dat is tekst waar
 *    `verbindingsoordeel()` op aanslaat met zijn `database "…" does not exist`.
 *    Zou die notice blijven staan, dan heet een drop die om een héél andere
 *    reden omviel opeens "deze database bestaat niet". Een notice is per
 *    definitie geen fout; hij gaat er hier uit vóór het oordeel valt.
 *
 * ⚠️ `DETAIL:` en `HINT:` blijven staan. Die dragen juist de reden — *"Is the
 *    server running on that host"* is een HINT, en *"There is 1 other session
 *    using the database"* een DETAIL.
 */
const RUISREGEL = /^\s*(?:NOTICE|INFO):/;

/** @param {unknown} melding */
export function zonderRuis(melding) {
  return String(melding ?? '')
    .split('\n')
    .filter((regel) => !RUISREGEL.test(regel))
    .join('\n');
}

/**
 * Waaróm `drop database` mislukte — QS8-562.
 *
 * ⚠️⚠️ **Dit is een ándere vraag dan `verbindingsoordeel()`, en dat verschil is
 *    het hele issue.** Die functie beantwoordt *"kwamen we er überhaupt in"*.
 *    Een drop die faalt terwijl de verbinding prima stond, is daar per definitie
 *    `onbekend` — en `schema-opbouwen.sh` vertaalde dat jarenlang naar één vaste
 *    diagnose: *"${DB} kon niet weg"*, met een comment erboven over PostgREST dat
 *    elf verbindingen openhield. 📏 Op 19-09-2026 kwam die melding terwijl de
 *    database **niet eens bestond** en er nul sessies waren; de echte oorzaak was
 *    peer-authenticatie op de unix-socket, en het kostte drie rondes.
 *
 * ⚠️ **De volgorde is hier gedrag en geen smaak.** `bezet` en `geen-eigenaar`
 *    gaan vóór `verbindingsoordeel()`, want dat zijn de twee gevallen waarin de
 *    verbinding wél stond. Andersom zou werken zolang de patronen elkaar
 *    uitsluiten — en dat is precies het soort aanname dat hier al een keer
 *    misging.
 *
 * @param {unknown} melding wat psql op stderr zette
 * @returns {'bezet'|'geen-eigenaar'|'geen-server'|'geen-database'|'geweigerd'|'onbekend'}
 */
export function dropOordeel(melding) {
  const tekst = zonderRuis(melding);

  if (/is being accessed by other users/i.test(tekst)) return 'bezet';
  if (/must be owner of database|permission denied to drop database/i.test(tekst)) {
    return 'geen-eigenaar';
  }

  return verbindingsoordeel(tekst);
}

/**
 * Wat `schema-opbouwen.sh` op stderr zet als de drop mislukt.
 *
 * ⚠️⚠️ **Nergens het woord `OVERGESLAGEN`, en dat is een grendel en geen
 *    stijlkeuze.** Deze opbouw draait onder `idempotent:controle`, en
 *    `beoordeel()` in `poort.mjs` classificeert op **tekst**: één regel met
 *    `OVERGESLAGEN` erin maakt van een mislukte schemaopbouw een *ongemeten*
 *    controle. Er valt hier ook niets over te schrijven — een opbouw is gelukt
 *    of niet, er is geen derde uitkomst.
 *
 * ⚠️ **Elke tak eindigt met wat psql letterlijk zei.** Dat is acceptatiecriterium
 *    1 van QS8-562: de oude vorm gooide stderr weg met `2>&1` en hield één
 *    diagnose over. Een duiding die de lezer niet naast de bron kan leggen, is
 *    dezelfde gok in een ander jasje.
 *
 * @param {{ db: string, melding: unknown, host?: string | undefined,
 *           poort?: string | undefined }} opties
 *   `host` is de `PGHOST` waarmee de aanroep gedaan is; leeg betekent unix-socket.
 *   `poort` is de `PGPORT`; leeg betekent de standaard van deze opbouw.
 * @returns {string}
 */
export function dropmelding({ db, melding, host, poort }) {
  const oordeel = dropOordeel(melding);
  const letterlijk = String(melding ?? '').trimEnd();
  const staart = `\npsql zei letterlijk:\n${letterlijk === '' ? '  (niets)' : letterlijk}`;
  const advies = ADVIEZEN[oordeel] ?? ADVIEZEN.onbekend;

  return `${advies({ db, host, poort })}${staart}`;
}

/**
 * Eén advies per oordeel.
 *
 * ⚠️ **Een tabel en geen keten van `if`s.** Zo kan er geen oordeel bij komen
 *    zonder dat iemand hier een regel neerzet, en is elk advies los te lezen
 *    naast het geval waar het bij hoort. (De keten hiervóór telde 66 regels en
 *    liep tegen onwrikbare regel 15 aan; het splitsen is dus niet alleen netter.)
 *
 * @type {Record<string, (o: { db: string, host?: string | undefined,
 *   poort?: string | undefined }) => string>}
 */
const ADVIEZEN = {
  bezet: ({ db }) =>
    `✗ ${db} kon niet weg: er zit nog een sessie op.\n` +
    '  Dit is de bekende vorm — PostgREST uit een vorige ronde houdt een pool\n' +
    '  open. Stop hem met `scripts/lokale-stack.sh --stop` en draai opnieuw.',

  'geen-eigenaar': ({ db }) =>
    `✗ ${db} kon niet weg: deze rol is geen eigenaar van die database.\n` +
    '  De verbinding stond dus wél. Draai als de rol die hem aangemaakt heeft,\n' +
    `  of als superuser — zonder \`PGUSER\` is dat hier \`${STANDAARD_GEBRUIKER}\`.`,

  geweigerd: ({ db, host }) =>
    `✗ ${db}: de server draait, maar deze gebruiker mag er niet in.\n` +
    '  De drop is niet eens geprobeerd — dit is een instelling en geen bezette\n' +
    '  database.\n' +
    socketregel(host) +
    `  Zonder \`PGUSER\` verbindt deze opbouw als \`${STANDAARD_GEBRUIKER}\`; met een\n` +
    '  wachtwoordrol hoort er een `PGPASSWORD` bij.',

  'geen-server': ({ db, poort }) => `✗ ${db}: ${poortregel(poort)}`,

  'geen-database': ({ db }) =>
    `✗ ${db}: de server draait, maar de database waarin de drop gedaan wordt\n` +
    `  bestaat er niet. Dat is \`postgres\`, niet \`${db}\` zelf.`,

  onbekend: ({ db }) =>
    `✗ ${db} kon niet weg, en niet om een reden die hier bekend is.\n` +
    '  Hieronder staat letterlijk wat psql zei; dat is meer waard dan een gok.',
};

/**
 * Welke poort er geprobeerd is, en waar die vandaan komt.
 *
 * ⚠️ **De poort die er écht gebruikt is, niet de standaard.** Stond hier de
 *    standaard, dan adviseerde een mislukking op 5499 over 5433 — een melding
 *    die naast het geval praat, en dat is precies de klasse waar QS8-562 over
 *    gaat. 📏 Geijkt met `PGPORT=5499`.
 *
 * @param {string | undefined} poort
 * @returns {string}
 */
function poortregel(poort) {
  const gebruikt = poort === undefined || poort === '' ? STANDAARD_POORT : poort;
  const uitleg =
    gebruikt === STANDAARD_POORT
      ? `  \`${STANDAARD_POORT}\` is de standaard van deze opbouw: de poort van\n` +
        "  `scripts/lokale-stack.sh`, en niet psql's eigen 5432."
      : `  Dat komt uit \`PGPORT\`; zonder die variabele gaat het naar \`${STANDAARD_POORT}\`.`;

  return `er luistert geen Postgres op poort \`${gebruikt}\`.\n${uitleg}`;
}

/**
 * De regel over de unix-socket, en alleen als die ook echt gebruikt wordt.
 *
 * ⚠️⚠️ **Dit is het stuk dat QS8-562 drie rondes kostte.** Zonder `PGHOST` valt
 *    psql terug op de socket, en daar geldt `peer` — de sessie draait als `root`
 *    en vraagt om rol `postgres`. 📏 Gemeten op deze werkplek: via de socket
 *    *"Peer authentication failed for user \\"postgres\\""*, over TCP naar dezelfde
 *    server *"fe_sendauth: no password supplied"*. Twee verschillende oorzaken
 *    met één remedie die alleen bij de eerste helpt.
 *
 * ⚠️ **Het script forceert `-h` met opzet níet.** Wie als OS-gebruiker
 *    `postgres` draait, wérkt via de socket, en die zou dan opeens een
 *    wachtwoord moeten hebben. De verbinding ongevraagd omleggen repareert het
 *    ene geval door het andere te breken; de melding benoemen doet dat niet.
 *
 * @param {string | undefined} host
 * @returns {string}
 */
function socketregel(host) {
  if (host !== undefined && host !== '') return '';
  return (
    '  ⚠️ `PGHOST` is leeg, dus dit ging over de unix-socket — en daar geldt\n' +
    '     meestal `peer`: de databaserol moet dan de naam van je OS-gebruiker\n' +
    '     dragen. Over TCP gaat het met `PGHOST=127.0.0.1`.\n'
  );
}
