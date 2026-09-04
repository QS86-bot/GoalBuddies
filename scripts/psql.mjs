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
