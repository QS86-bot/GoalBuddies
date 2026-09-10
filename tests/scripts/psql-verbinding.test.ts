import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  psqlArgumenten,
  STANDAARD_DB,
  STANDAARD_GEBRUIKER,
  STANDAARD_POORT,
  verbindingsmelding,
  verbindingsoordeel,
} from '../../scripts/psql.mjs';

/**
 * De belofte onder de gedeelde psql-aanroep: **een controle die niets gemeten
 * heeft, zegt waaróm — en zegt het goed.**
 *
 * ⚠️ **Waarom dit bestaat.** Vijf controles riepen psql aan zonder `-U`, vielen
 *    terug op de OS-gebruiker (`root`), en meldden dan *"Geen database om tegen
 *    te meten — start de lokale stack"* terwijl die stack draaide. De poort
 *    telde ze bij de vier die écht productiesleutels vragen en meldde negen
 *    ongemeten controles waar er vier hoorden. QS8-268.
 *
 * ⚠️ **Élke psql-mislukking begint met `connection to server ... failed:`**, ook
 *    die waarbij de server prima draait. Dat is precies waarom de indeling niet
 *    op die zin mag hangen — en waarom de gevallen hier één voor één worden
 *    aangeboden in plaats van in één "hij faalt netjes"-test.
 *
 * ⚠️ **Tweezijdig.** Naast elk geval dat gemeld moet worden staat het geval dat
 *    ánders gemeld moet worden. Een indeling die alles "geen server" noemt, is
 *    even fout als een die niets herkent: de eerste is de bug van QS8-268 zelf.
 */

/** Wat psql letterlijk zegt. Gemeten tegen PostgreSQL 16, niet verzonnen. */
const ECHT = {
  geenServer:
    'psql: error: connection to server at "127.0.0.1", port 5499 failed: Connection refused\n' +
    '\tIs the server running on that host and accepting TCP/IP connections?',
  geenDatabase:
    'psql: error: connection to server at "127.0.0.1", port 5432 failed: FATAL:  database "bestaatniet" does not exist',
  verkeerdWachtwoord:
    'psql: error: connection to server at "127.0.0.1", port 5432 failed: FATAL:  password authentication failed for user "postgres"',
  geenWachtwoord:
    'psql: error: connection to server at "127.0.0.1", port 5432 failed: fe_sendauth: no password supplied',
  rolBestaatNiet:
    'psql: error: connection to server at "127.0.0.1", port 5432 failed: FATAL:  role "root" does not exist',
};

describe('psqlArgumenten — de aanroep zelf', () => {
  it('noemt een gebruiker, want anders wordt het de OS-gebruiker', () => {
    const args = psqlArgumenten('select 1', {});
    expect(args).toContain('-U');
    expect(args[args.indexOf('-U') + 1]).toBe(STANDAARD_GEBRUIKER);
  });

  it('laat een eigen PGUSER staan', () => {
    const args = psqlArgumenten('select 1', { PGUSER: 'iemand' });
    expect(args[args.indexOf('-U') + 1]).toBe('iemand');
  });

  it('vraagt nooit interactief om een wachtwoord — dat zou hangen in plaats van falen', () => {
    expect(psqlArgumenten('select 1', {})).toContain('-w');
  });

  it('leest de standaarddatabase van de lokale stack', () => {
    const args = psqlArgumenten('select 1', {});
    expect(args[args.indexOf('-d') + 1]).toBe(STANDAARD_DB);
  });

  it('laat DB en PGDATABASE voorgaan, in die volgorde', () => {
    expect(psqlArgumenten('select 1', { DB: 'a', PGDATABASE: 'b' })[
      psqlArgumenten('select 1', { DB: 'a', PGDATABASE: 'b' }).indexOf('-d') + 1
    ]).toBe('a');
    expect(psqlArgumenten('select 1', { PGDATABASE: 'b' })[
      psqlArgumenten('select 1', { PGDATABASE: 'b' }).indexOf('-d') + 1
    ]).toBe('b');
  });

  it('zet -h er alleen bij als er een PGHOST is', () => {
    expect(psqlArgumenten('select 1', { PGHOST: 'ergens' }).slice(0, 2)).toEqual(['-h', 'ergens']);
    expect(psqlArgumenten('select 1', {})).not.toContain('-h');
  });

  it('noemt de poort van de lokale stack en niet die van psql zelf', () => {
    // ⚠️ Dit stond tot QS8-270 andersom, met als reden "psql leest PGPORT zelf".
    //    Die reden klopte niet: psql's standaard is 5432 en dit project draait op
    //    5433, dus zonder deze regel keken de controles naar een lege poort.
    const args = psqlArgumenten('select 1', {});
    expect(args[args.indexOf('-p') + 1]).toBe(STANDAARD_POORT);
  });

  it('laat een eigen PGPORT staan', () => {
    const args = psqlArgumenten('select 1', { PGPORT: '5432' });
    expect(args[args.indexOf('-p') + 1]).toBe('5432');
  });
});

describe('verbindingsoordeel — geijkt op wat psql écht zegt', () => {
  const gevallen: readonly [string, string, string][] = [
    ['een server die er niet is', ECHT.geenServer, 'geen-server'],
    ['een database die niet bestaat', ECHT.geenDatabase, 'geen-database'],
    ['een verkeerd wachtwoord', ECHT.verkeerdWachtwoord, 'geweigerd'],
    ['een ontbrekend wachtwoord', ECHT.geenWachtwoord, 'geweigerd'],
    ['een rol die niet bestaat — het geval van QS8-268', ECHT.rolBestaatNiet, 'geweigerd'],
    ['iets wat hier niemand kent', 'psql: error: het regent', 'onbekend'],
  ];

  for (const [naam, melding, verwacht] of gevallen) {
    it(`${naam} → ${verwacht}`, () => {
      expect(verbindingsoordeel(melding)).toBe(verwacht);
    });
  }

  it('laat zich niet misleiden door de zin die in élke melding staat', () => {
    // Alle drie beginnen met `connection to server ... failed:` en toch zijn het
    // drie verschillende oordelen. Dít is de fout die QS8-268 was.
    expect(
      [ECHT.geenServer, ECHT.geenDatabase, ECHT.rolBestaatNiet].map(verbindingsoordeel),
    ).toEqual(['geen-server', 'geen-database', 'geweigerd']);
  });

  it('valt niet om op niets', () => {
    expect(verbindingsoordeel(undefined)).toBe('onbekend');
    expect(verbindingsoordeel('')).toBe('onbekend');
  });
});

describe('verbindingsmelding — alleen echt niets te meten heet OVERGESLAGEN', () => {
  const melden = (melding: string) =>
    verbindingsmelding({ naam: 'definers-controle', leest: 'Leest `pg_proc`.', melding });

  it('noemt een ontbrekende server OVERGESLAGEN en wijst naar de stack', () => {
    const uit = melden(ECHT.geenServer);
    expect(uit).toContain('OVERGESLAGEN');
    expect(uit).toContain('npm run rls:stack');
  });

  it('noemt een ontbrekende database OVERGESLAGEN, maar zegt dat de server er wél is', () => {
    const uit = melden(ECHT.geenDatabase);
    expect(uit).toContain('OVERGESLAGEN');
    expect(uit).toContain('de server draait');
  });

  it('noemt een geweigerde gebruiker GEWEIGERD en juist niet OVERGESLAGEN', () => {
    const uit = melden(ECHT.rolBestaatNiet);
    expect(uit).toContain('GEWEIGERD');
    expect(uit).not.toContain('OVERGESLAGEN');
  });

  it('stuurt een geweigerde gebruiker niet naar de stack — daar ligt het niet aan', () => {
    expect(melden(ECHT.verkeerdWachtwoord)).not.toContain('npm run rls:stack');
  });

  it('noemt PGUSER bij een weigering, want dat is de knop', () => {
    expect(melden(ECHT.geenWachtwoord)).toContain('PGUSER');
  });

  it('geeft bij een onbekende oorzaak letterlijk terug wat psql zei, en gokt niet', () => {
    const uit = melden('psql: error: het regent');
    expect(uit).not.toContain('OVERGESLAGEN');
    expect(uit).toContain('het regent');
  });

  it('zet in elk geval de eerste regel van psql eronder', () => {
    for (const melding of Object.values(ECHT)) {
      expect(melden(melding)).toContain(melding.split('\n')[0] as string);
    }
  });
});

/**
 * Er komt geen zevende kopie bij.
 *
 * ⚠️ **Dit is de eigenlijke reparatie van QS8-268.** De bug zat niet in één
 *    script maar in zes: iedereen bouwde zijn eigen `psql`-aanroep, en iedereen
 *    vergat dezelfde vlag. Een gedeelde helper repareert de zes van vandaag; hij
 *    houdt de zevende niet tegen. Deze test wel — en hij vraagt niet om
 *    zorgvuldigheid maar om een reden, net als de registers elders in dit
 *    project.
 *
 * ⚠️ **Met de hand rood gemaakt** door in `definers-controle.mjs` de oude
 *    argumentenlijst terug te zetten; hij noemt dat bestand dan met naam.
 */
const SCRIPTS = fileURLToPath(new URL('../../scripts', import.meta.url));

/** Elk `.ts`-bestand onder een map, met een pad relatief aan die map. */
function tsBestanden(wortel: string): { naam: string; inhoud: string }[] {
  const uit: { naam: string; inhoud: string }[] = [];
  const loop = (map: string, voorvoegsel: string): void => {
    for (const naam of readdirSync(map, { withFileTypes: true })) {
      const vol = join(map, naam.name);
      const pad = voorvoegsel === '' ? naam.name : `${voorvoegsel}/${naam.name}`;
      if (naam.isDirectory()) loop(vol, pad);
      else if (naam.name.endsWith('.ts')) uit.push({ naam: pad, inhoud: readFileSync(vol, 'utf8') });
    }
  };
  loop(wortel, '');
  return uit;
}

/** Een handgebouwde psql-argumentenlijst. */
const EIGEN_AANROEP = /\[[^\]]*'--no-psqlrc'/;

/**
 * Scripts die hun aanroep terecht zelf opbouwen, met de reden.
 *
 * ⚠️ Een reden en geen vinkje. Wie hier een naam neerzet zonder op te schrijven
 *    waaróm de gedeelde helper niet past, heeft de controle beantwoord in plaats
 *    van de vraag.
 */
const EIGEN_REDEN: Readonly<Record<string, string>> = {
  'psql.mjs': 'Dit ís de gedeelde aanroep.',
  'rls-dekking.mjs':
    'Richt zich op een gekozen bestemming en schrobt daarvoor de hele PG-omgeving ' +
    'leeg; hij mag juist níét overnemen wat er in de env staat. Noemt `-U` zelf, ' +
    'met dezelfde standaard.',
};

export function scriptsMetEigenPsql(
  bestanden: readonly { readonly naam: string; readonly inhoud: string }[],
): string[] {
  return bestanden
    .filter((b) => EIGEN_AANROEP.test(b.inhoud))
    .filter((b) => !(b.naam in EIGEN_REDEN))
    .map((b) => b.naam);
}

describe('scriptsMetEigenPsql — geijkt op losse vormen', () => {
  it('meldt een script dat zijn eigen aanroep bouwt', () => {
    expect(
      scriptsMetEigenPsql([
        { naam: 'nieuw-controle.mjs', inhoud: "const args = ['--quiet', '--no-psqlrc', '-At'];" },
      ]),
    ).toEqual(['nieuw-controle.mjs']);
  });

  it('laat een script met rust dat de gedeelde helper gebruikt', () => {
    expect(
      scriptsMetEigenPsql([
        { naam: 'nieuw-controle.mjs', inhoud: "execFileSync('psql', psqlArgumenten(vraag));" },
      ]),
    ).toEqual([]);
  });

  it('laat een geregistreerde uitzondering met rust', () => {
    expect(
      scriptsMetEigenPsql([
        { naam: 'rls-dekking.mjs', inhoud: "['--quiet', '--no-psqlrc', '-At', '-U', x]" },
      ]),
    ).toEqual([]);
  });
});

/**
 * ⚠️⚠️ **En de testboom, sinds QS8-414.** Het register hierboven scant
 *    `readdirSync(SCRIPTS)` op `.mjs` — dus alléén `scripts/`. De testboom roept
 *    `psql` óók aan, en die aanroepen zag niemand.
 *
 *    📏 Dat gat was al gevuld toen dit issue geschreven werd: er stonden **twee**
 *    handgebouwde lijsten in `tests/`, niet één. De tweede zat in
 *    `adempauze-grendels.test.ts` — een `spawn` met een open stdin voor de
 *    slottest, met een eigen `psqlArgs()` zónder `ON_ERROR_STOP`. Die kon
 *    `psql()` niet gebruiken (die wacht op het einde) en typte de lijst daarom
 *    over. Precies de vorm die QS8-270 dertig tests kostte.
 *
 * ⚠️ **De twee bomen mogen verschillende standaarden hebben, en dat is opzet.**
 *    `scripts/` zet `-h` en `-p` in de argumenten; `tests/` haalt ze uit
 *    `PSQL_OMGEVING`. Deze toets trekt de testboom dus **niet** naar
 *    `psqlArgumenten()` — hij eist alleen dat er in `tests/` óók maar één plek
 *    is, en dat is `psqlBasisArgumenten()`.
 */
const TESTBOOM = fileURLToPath(new URL('..', import.meta.url));

/** Een bestand dat zelf een psql-proces start. */
const START_PSQL = /(?:execFileSync|spawnSync|spawn)\(\s*'psql'/;

/** De gedeelde lijst uit `tests/rls/psql-stack.ts`. */
const GEDEELDE_LIJST = /psqlBasisArgumenten\s*\(/;

/**
 * Testbestanden die psql terecht zelf starten, met de reden.
 *
 * ⚠️ Twee rijen en twee soorten reden. `psql-stack.ts` **is** de gedeelde
 *    aanroep; `psql-verbinding.test.ts` is de ijking van deze controle en noemt
 *    de verboden vorm met opzet in zijn eigen fixtures. Zonder die tweede zou
 *    de controle zijn eigen voorbeeld melden — dezelfde val als bij
 *    `padverwijzing:controle`, en de reden dat een ijking anders zijn geval
 *    moet verdraaien om langs de grendel te komen.
 */
const TESTS_EIGEN_REDEN: Readonly<Record<string, string>> = {
  'rls/psql-stack.ts':
    'Dit ís de gedeelde aanroep van de testboom. `psqlBasisArgumenten()` staat ' +
    'hier, met `PSQL_OMGEVING` ernaast; één omgeving en één lijst voor de hele boom.',
  'scripts/psql-verbinding.test.ts':
    'De ijking van deze controle. Hij voedt de verboden vorm met opzet aan de ' +
    'functie hieronder; zou hij meetellen, dan meldt de controle zijn eigen ' +
    'voorbeeld en leer je hem negeren.',
};

export function testsMetEigenPsql(
  bestanden: readonly { readonly naam: string; readonly inhoud: string }[],
): string[] {
  return bestanden
    .filter((b) => START_PSQL.test(b.inhoud))
    .filter((b) => !GEDEELDE_LIJST.test(b.inhoud))
    .filter((b) => !(b.naam in TESTS_EIGEN_REDEN))
    .map((b) => b.naam);
}

describe('testsMetEigenPsql — geijkt op losse vormen', () => {
  it('meldt een testbestand dat zijn eigen lijst bouwt', () => {
    expect(
      testsMetEigenPsql([
        {
          naam: 'rls/nieuw.test.ts',
          inhoud: "execFileSync('psql', ['-U', 'postgres', '-d', PSQL_DB, '-tA']);",
        },
      ]),
    ).toEqual(['rls/nieuw.test.ts']);
  });

  /** De vorm van QS8-414 zelf: `spawn` voor een sessie die blijft staan. */
  it('meldt ook een spawn en een spawnSync', () => {
    expect(
      testsMetEigenPsql([
        { naam: 'rls/a.test.ts', inhoud: "spawn('psql', eigenArgs(), { env });" },
        { naam: 'rls/b.test.ts', inhoud: "spawnSync('psql', eigenArgs());" },
      ]),
    ).toEqual(['rls/a.test.ts', 'rls/b.test.ts']);
  });

  it('laat een bestand met rust dat de gedeelde lijst gebruikt', () => {
    expect(
      testsMetEigenPsql([
        { naam: 'rls/a.test.ts', inhoud: "spawn('psql', psqlBasisArgumenten(), { env });" },
      ]),
    ).toEqual([]);
  });

  it('laat een bestand met rust dat psql helemaal niet start', () => {
    expect(
      testsMetEigenPsql([{ naam: 'rls/a.test.ts', inhoud: "import { psql } from './psql-stack';" }]),
    ).toEqual([]);
  });

  it('laat een geregistreerde uitzondering met rust', () => {
    expect(
      testsMetEigenPsql([
        { naam: 'rls/psql-stack.ts', inhoud: "execFileSync('psql', ['-U', 'postgres']);" },
      ]),
    ).toEqual([]);
  });
});

describe('de testboom zelf', () => {
  const bestanden = tsBestanden(TESTBOOM);

  it('start psql nergens met een eigen argumentenlijst', () => {
    expect(testsMetEigenPsql(bestanden)).toEqual([]);
  });

  it('en elke geregistreerde uitzondering bestaat nog', () => {
    const namen = new Set(bestanden.map((b) => b.naam));
    for (const naam of Object.keys(TESTS_EIGEN_REDEN)) expect(namen.has(naam)).toBe(true);
  });

  /**
   * ⚠️ Zonder deze regel bewaakt de toets hierboven niets zodra iemand de
   *    gedeelde lijst weghaalt: nul bestanden die psql starten is dan ook groen.
   */
  it('start psql wél ergens, anders meet de toets hierboven niets', () => {
    expect(bestanden.filter((b) => START_PSQL.test(b.inhoud)).length).toBeGreaterThan(1);
  });
});

describe('de scriptmap zelf', () => {
  const bestanden = readdirSync(SCRIPTS)
    .filter((naam) => naam.endsWith('.mjs'))
    .map((naam) => ({ naam, inhoud: readFileSync(join(SCRIPTS, naam), 'utf8') }));

  it('bouwt nergens meer een eigen psql-aanroep', () => {
    expect(scriptsMetEigenPsql(bestanden)).toEqual([]);
  });

  it('en elke geregistreerde uitzondering bestaat nog — anders veroudert het register stil', () => {
    const namen = new Set(bestanden.map((b) => b.naam));
    for (const naam of Object.keys(EIGEN_REDEN)) expect(namen.has(naam)).toBe(true);
  });

  it('gebruikt er ook echt een paar, anders bewaakt dit niets', () => {
    const gedeeld = bestanden.filter((b) => /psqlArgumenten\s*\(/.test(b.inhoud));
    expect(gedeeld.length).toBeGreaterThan(5);
  });
});
