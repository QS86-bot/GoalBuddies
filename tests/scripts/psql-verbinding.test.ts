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
