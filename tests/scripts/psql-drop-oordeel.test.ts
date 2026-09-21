import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { dropOordeel, dropmelding, zonderRuis } from '../../scripts/psql.mjs';

/**
 * De belofte onder een mislukte `drop database`: **de melding noemt de gemeten
 * oorzaak en niet de meest plausibele** — QS8-562.
 *
 * ⚠️⚠️ **Waarom dit bestaat.** `schema-opbouwen.sh` gooide de stderr van psql weg
 *    met `>/dev/null 2>&1` en hield één vaste diagnose over: *"${DB} kon niet
 *    weg"*, met een comment erboven over PostgREST dat op 24-08 elf verbindingen
 *    openhield. 📏 Op 19-09-2026 kwam die melding terwijl de database **niet
 *    eens bestond** en er nul sessies waren; de oorzaak was peer-authenticatie
 *    op de unix-socket. Drie rondes in de verkeerde hoek.
 *
 * ⚠️ **De tweede helft telt even zwaar: een bezette database moet bezet blíjven
 *    heten.** Zonder die kant is de reparatie niet te onderscheiden van "noem
 *    voortaan alles een verbindingsfout", en dan is de vaste diagnose alleen
 *    verhuisd.
 */

/**
 * Wat psql letterlijk zegt. **Gemeten tegen PostgreSQL 16 op 19-09-2026, niet
 * verzonnen** — elk van deze vijf is met de hand uitgelokt.
 */
const ECHT = {
  /** Zonder `PGHOST`, dus via de unix-socket: peer, en de sessie draait als root. */
  peer:
    'psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5433" failed: ' +
    'FATAL:  Peer authentication failed for user "postgres"',
  /** Dezelfde server over TCP, zonder wachtwoord. */
  geenWachtwoord:
    'psql: error: connection to server at "127.0.0.1", port 5433 failed: fe_sendauth: no password supplied',
  /** Een dode poort. */
  geenServer:
    'psql: error: connection to server at "127.0.0.1", port 5499 failed: Connection refused\n' +
    '\tIs the server running on that host and accepting TCP/IP connections?',
  /** Acht sessies die blijven terugkomen — de vorm van 24-08. */
  bezet:
    'ERROR:  database "goalbuddies_opbouw" is being accessed by other users\n' +
    'DETAIL:  There are 7 other sessions using the database.',
  /** Een rol die wel mag verbinden maar de database niet bezit. */
  geenEigenaar: 'ERROR:  must be owner of database goalbuddies_opbouw',
};

describe('dropOordeel — de vormen die hij uit elkaar moet houden', () => {
  const gevallen: readonly [string, string, string][] = [
    ['peer-authenticatie op de socket — het geval van QS8-562', ECHT.peer, 'geweigerd'],
    ['een ontbrekend wachtwoord over TCP', ECHT.geenWachtwoord, 'geweigerd'],
    ['een dode poort', ECHT.geenServer, 'geen-server'],
    ['een database met sessies erop', ECHT.bezet, 'bezet'],
    ['een rol die geen eigenaar is', ECHT.geenEigenaar, 'geen-eigenaar'],
    ['iets wat hier niemand kent', 'ERROR:  het regent', 'onbekend'],
  ];

  for (const [naam, melding, verwacht] of gevallen) {
    it(`${naam} → ${verwacht}`, () => {
      expect(dropOordeel(melding)).toBe(verwacht);
    });
  }

  it('⚠️ houdt bezet en geweigerd uit elkaar — dat ís het issue', () => {
    // De oude vorm noemde allebei "kon niet weg", en dat stuurde de lezer naar
    // de hangende verbinding die er niet was.
    expect([ECHT.bezet, ECHT.peer].map(dropOordeel)).toEqual(['bezet', 'geweigerd']);
  });

  it('valt niet om op niets', () => {
    expect(dropOordeel(undefined)).toBe('onbekend');
    expect(dropOordeel('')).toBe('onbekend');
  });
});

describe('zonderRuis — wat nooit de reden van een mislukking is', () => {
  /**
   * ⚠️ **Geen gemeten geval maar een gemeten patroon.** Vandaag schrijft psql
   *    `NOTICE: database "x" does not exist, skipping` alleen bij een drop die
   *    *slaagt*, dus deze combinatie is met de hand samengesteld. Wat wél gemeten
   *    is: die zin matcht het patroon `database "…" does not exist` uit
   *    `verbindingsoordeel()` woordelijk. Rijdt de notice ooit mee met een
   *    mislukking, dan heet een bezette database zonder deze knip opeens
   *    "bestaat niet".
   */
  it('laat een NOTICE het oordeel niet kapen', () => {
    // ⚠️⚠️ **Dit geval was eerst `NOTICE + bezet`, en toen bewaakte het niets.**
    //    📏 Geijkt: met de knip eruit bleven alle 22 toetsen groen, want het
    //    bezet-patroon staat vóór `verbindingsoordeel()` en vangt dat geval al
    //    af. Een ijking die zijn geval door een éérdere grendel voert, toetst
    //    die eerdere grendel. De fout moet dus een zijn die verder niemand
    //    herkent, zodat alleen de notice nog kan aanslaan.
    const samen = 'NOTICE:  database "goalbuddies_opbouw" does not exist, skipping\nERROR:  het regent';
    expect(dropOordeel(samen)).toBe('onbekend');
    // 📏 En zonder de knip is dit `geen-database` — gemeten, niet geredeneerd.
    expect(zonderRuis(samen)).not.toContain('does not exist');
  });

  it('laat DETAIL en HINT juist staan, want die dragen de reden', () => {
    expect(zonderRuis(ECHT.geenServer)).toContain('Is the server running');
    expect(zonderRuis(ECHT.bezet)).toContain('There are 7 other sessions');
  });

  it('knipt alleen aan het begin van een regel, niet midden in een zin', () => {
    const midden = 'ERROR:  kon geen NOTICE: schrijven';
    expect(zonderRuis(midden)).toBe(midden);
  });
});

describe('dropmelding — elk geval krijgt een eigen advies', () => {
  const melden = (melding: string, extra: Record<string, string> = {}) =>
    dropmelding({ db: 'goalbuddies_opbouw', melding, ...extra });

  it('⚠️ zet onder élk geval letterlijk wat psql zei — criterium 1', () => {
    for (const melding of Object.values(ECHT)) {
      const uit = melden(melding);
      expect(uit).toContain('psql zei letterlijk');
      expect(uit).toContain(melding.split('\n')[0] as string);
    }
  });

  it('stuurt bezet naar de stack en geweigerd juist niet', () => {
    expect(melden(ECHT.bezet)).toContain('lokale-stack.sh --stop');
    expect(melden(ECHT.peer)).not.toContain('lokale-stack.sh --stop');
  });

  it('⚠️ noemt bij een lege PGHOST de socket en peer — de drie rondes van QS8-562', () => {
    expect(melden(ECHT.peer, { host: '' })).toContain('unix-socket');
    expect(melden(ECHT.peer, { host: '' })).toContain('PGHOST=127.0.0.1');
  });

  it('laat die socketregel weg zodra er wél een PGHOST is', () => {
    expect(melden(ECHT.geenWachtwoord, { host: '127.0.0.1' })).not.toContain('unix-socket');
  });

  it('⚠️ noemt bij geen-server de poort die écht gebruikt is', () => {
    // Stond hier de standaard, dan adviseerde een mislukking op 5499 over 5433.
    expect(melden(ECHT.geenServer, { poort: '5499' })).toContain('poort `5499`');
    expect(melden(ECHT.geenServer, { poort: '' })).toContain('poort `5433`');
  });

  it('gokt niet bij een onbekende oorzaak', () => {
    const uit = melden('ERROR:  het regent');
    expect(uit).toContain('niet om een reden die hier bekend is');
    expect(uit).toContain('het regent');
  });

  /**
   * ⚠️⚠️ **Dit is een naad tussen twee correcte onderdelen.** `schema-opbouwen.sh`
   *    draait onder `idempotent:controle`, en `beoordeel()` in `poort.mjs`
   *    classificeert op **tekst**: één regel met `OVERGESLAGEN` erin maakt van
   *    een mislukte schemaopbouw een *ongemeten* controle in plaats van een rode.
   *    Er is hier ook geen derde uitkomst — een opbouw is gelukt of niet.
   */
  it('gebruikt nergens het woord dat de poort als "ongemeten" leest', () => {
    for (const melding of Object.values(ECHT)) {
      expect(melden(melding)).not.toContain('OVERGESLAGEN');
    }
  });
});

/**
 * De naad: **komt de stderr van psql daadwerkelijk bij de duiding aan?**
 *
 * ⚠️⚠️ De twee onderdelen hierboven zijn los correct en zeggen niets over de
 *    knoop ertussen: `2>&1 >/dev/null` in de verkéérde volgorde vangt stdout op
 *    en laat stderr lopen, en dan is elke duiding hierboven een duiding van een
 *    lege string. Dat is precies de vorm die CLAUDE.md bij regel 18 beschrijft —
 *    elk onderdeel klopt en het geheel lekt.
 *
 * ⚠️ **Deze toets heeft geen database nodig, en dat is opzet.** Een socketmap die
 *    niet bestaat geeft altijd en overal dezelfde fout; een poortnummer kan
 *    toevallig bezet zijn en het netwerk komt er niet aan te pas.
 */
describe('de naad: schema-opbouwen.sh geeft psql\'s stderr door', () => {
  const WORTEL = join(import.meta.dirname, '..', '..');

  function opbouwen(): { code: number; uitvoer: string } {
    try {
      const uitvoer = execFileSync('bash', [join(WORTEL, 'scripts', 'schema-opbouwen.sh')], {
        cwd: WORTEL,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DB: 'goalbuddies_naadtoets',
          PGHOST: '/qs562-deze-map-bestaat-niet',
          PGPASSWORD: '',
        },
      });
      return { code: 0, uitvoer };
    } catch (fout) {
      const f = fout as { status?: number; stdout?: string; stderr?: string };
      return { code: f.status ?? 1, uitvoer: `${f.stdout ?? ''}${f.stderr ?? ''}` };
    }
  }

  const uit = opbouwen();

  it('valt om in plaats van door te bouwen op een database die er niet is', () => {
    expect(uit.code).toBe(1);
  });

  it('⚠️ drukt letterlijk af wat psql zei — de regel die hiervóór weggegooid werd', () => {
    expect(uit.uitvoer).toContain('psql zei letterlijk');
    expect(uit.uitvoer).toContain('/qs562-deze-map-bestaat-niet');
  });

  it('duidt het als een onbereikbare server en niet als een bezette database', () => {
    expect(uit.uitvoer).toContain('er luistert geen Postgres');
    expect(uit.uitvoer).not.toContain('er zit nog een sessie op');
  });

  it('⚠️ telt geen sessies onder een melding die zegt dat er niet verbonden is', () => {
    expect(uit.uitvoer).not.toContain('nog verbonden:');
  });
});

/**
 * De sessietelling hoort alleen onder `bezet`, en dat is hier **statisch**
 * getoetst met opzet.
 *
 * ⚠️⚠️ **De toets hierboven kon dit niet, en dat is gemeten en niet geredeneerd.**
 *    📏 Met de grendel vervangen door `if true` bleven alle 22 toetsen groen: in
 *    de naadtoets staat er geen verbinding, dus de tellende `psql` faalt óók en
 *    is met `2>/dev/null || true` stil. Een geval dat langs een andere weg al
 *    stil is, ijkt niets.
 *
 * 📏 **Met de hand gemeten op een draaiende Postgres 16** (19-09-2026), op het
 *    geval waarin de verbinding wél staat en de drop toch faalt — een rol die
 *    geen eigenaar is:
 *
 *    ```
 *    met grendel     ->  0 regels met "nog verbonden:"
 *    zonder grendel  ->  nog verbonden: 0 sessie(s), o.a. (onbekend)
 *    ```
 *
 *    Die tweede regel is precies wat dit issue bestrijdt: een tweede, plausibele
 *    oorzaak onder een melding die zojuist zei dat de verbinding er wél was.
 *
 * ⚠️ Wat dit dus **niet** bewijst: dat de telling bij `bezet` ook echt komt. Dat
 *    is de handmeting hierboven (8 sessies, *"nog verbonden: 8 sessie(s), o.a.
 *    psql"*) en staat in het beslisdocument.
 */
describe('de sessietelling hangt aan het oordeel', () => {
  const bron = readFileSync(
    join(import.meta.dirname, '..', '..', 'scripts', 'schema-opbouwen.sh'),
    'utf8',
  );

  it('staat binnen een tak die op bezet toetst', () => {
    const tak = /if \[\[ "\$oordeel" == "bezet" \]\]; then([\s\S]*?)\n  fi/.exec(bron);

    expect(
      tak,
      'geen `bezet`-tak gevonden — is de duiding verhuisd? Dan verhuist deze ' +
        'belofte mee en deze toets niet.',
    ).not.toBeNull();
    expect(tak?.[1]).toContain('nog verbonden:');
  });

  it('en nergens anders in het bestand', () => {
    expect(bron.split('nog verbonden:').length - 1).toBe(1);
  });
});
