#!/usr/bin/env node
/**
 * poort — alles wat groen moet zijn vóór een push, in één commando.
 *
 * ⚠️ **Waarom dit bestaat.** Op 28-08-2026 ging PR #100 rood op
 *    `klokgrens:controle`, en niet omdat die controle iets nieuws vond: hij
 *    vond precies waar hij voor gemaakt is. De fout was dat er vóór de push
 *    **vier van de tweeëntwintig** controles gedraaid waren. Met tweeëntwintig
 *    losse commando's is "ik heb de poort gedraaid" geen uitspraak meer maar een
 *    inschatting, en een inschatting die je zelf maakt over je eigen werk.
 *
 * ⚠️ **Hij stopt niet bij de eerste rode.** Dat is met opzet: één ronde hoort je
 *    álles te vertellen wat er stuk is, niet het eerste dat toevallig vooraan
 *    staat. Drie keer pushen om drie fouten te vinden kost drie CI-rondes.
 *
 * ⚠️ **Een controle die geen database heeft, is niet groen.** Hij is
 *    *ongemeten*, en dat is iets anders. `klokgrens`, `functies`,
 *    `kolomrechten`, `pin` en `zichtbaarheid` lezen `pg_get_functiondef()` —
 *    zonder stack zeggen ze niets. Die staan apart in het overzicht, zodat
 *    "alles groen" zonder stack niet als bewijs telt. Start hem met
 *    `npm run rls:stack`.
 *
 * Draaien: `npm run poort`. Met `--snel` blijven de twee testsuites achterwege
 * — bedoeld om tussendoor te kijken, niet om op te pushen.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De stappen, in de volgorde waarin ze het snelst iets zeggen. */
export const STAPPEN = [
  { naam: 'typecheck', commando: 'typecheck', soort: 'basis' },
  { naam: 'lint', commando: 'lint', soort: 'basis' },
  { naam: 'tests', commando: 'test', soort: 'suite' },
  { naam: 'RLS-suite', commando: 'rls:lokaal', soort: 'suite', database: true },
];

/**
 * Elke `*:controle` uit `package.json` hoort hier automatisch bij.
 *
 * ⚠️ **Automatisch, en dat is het hele punt.** Een handmatige lijst raakt
 *    achter zodra iemand een controle toevoegt, en dan is die controle er wel
 *    maar draait hij niet mee. Dat is dezelfde fout als de vier van #100, alleen
 *    stiller.
 */
export function controlesUit(scripts) {
  return Object.keys(scripts)
    .filter((naam) => naam.endsWith(':controle'))
    .sort();
}

/** Welke controles een opgebouwde database nodig hebben om iets te bewijzen. */
export const HEEFT_DATABASE_NODIG = new Set([
  'klokgrens:controle',
  'functies:controle',
  'kolomrechten:controle',
  'pin:controle',
  'logboek:controle',
  'zichtbaarheid:controle',
  'register:controle',
  // ⚠️ Leest `pg_proc`, niet de migratiebestanden — zonder database meet hij niets.
  'definers:controle',
]);

/**
 * Deelt een uitkomst in.
 *
 * ⚠️ Drie uitkomsten en niet twee. Een controle die zijn database niet vond, is
 *    níét geslaagd — hij heeft niets gemeten. Dat verschil verdwijnt zodra je
 *    hem als groen telt, en dan meldt de poort "alles groen" over een schema dat
 *    niemand heeft aangeraakt.
 */
export function beoordeel({ code, uitvoer, heeftDatabaseNodig, soort = 'controle' }) {
  // ⚠️ **Eerst de overslag, en die staat bewust vóór de exitcode.**
  //    `functies:controle` en `register:controle` printen "OVERGESLAGEN" en
  //    geven daarna **exitcode 0**. Voor elke poort die alleen naar de exitcode
  //    kijkt, zijn ze dus groen terwijl ze niets gemeten hebben — precies de
  //    vorm die deze codebase al drie keer duur betaald heeft. CI draait ze niet
  //    (zie `.github/workflows/ci.yml`), dus daar loog niets; lokaal wél.
  //
  // ⚠️ **Alleen een controle mag zichzelf overslaan, en dat is de reparatie van
  //    31-08.** Een testsuite kan niet "geen sleutel" hebben; als daar
  //    `OVERGESLAGEN` in de uitvoer staat, is dat de ínhoud van een test — een
  //    diff, een fixture, een verwachting — en geen mededeling van de stap zelf.
  //
  //    Dit is de derde ronde op dezelfde val. Eerst stond het patroon op het
  //    kale woord en maskeerde het een rode suite. Toen is het verankerd op de
  //    regelvorm die een controle schrijft. Op 31-08 bleek dat nog steeds niet
  //    genoeg: `tests/scripts/adviseur-controle.test.ts` viel om, de diff toonde
  //    de regel `⚠ adviseur-controle: OVERGESLAGEN — ...` uit het script zelf,
  //    en die past exact op het verankerde patroon. De poort noemde een rode
  //    suite "ongemeten".
  //
  //    Een tekstpatroon kan dit niet oplossen: elk patroon dat de échte melding
  //    vindt, vindt ook een citaat ervan. De grens moet dus om de stapsoort
  //    liggen en niet om de tekst.
  if (soort === 'controle' && OVERGESLAGEN.test(uitvoer)) return 'ongemeten';

  if (code === 0) return 'groen';

  // ⚠️ **Een geweigerde gebruiker is rood en niet ongemeten, en dat is QS8-268.**
  //    `GEEN_DATABASE` hieronder matcht op `connection to server`, en élke
  //    psql-mislukking begint met die zin — ook die waarbij de server prima
  //    draait en alleen de rol of het wachtwoord niet klopt. Zonder deze regel
  //    heet zo'n kapotte instelling dus "zonder database", en dan herhaalt de
  //    poort precies de onwaarheid die de vijf controles zelf vertelden.
  //
  // ⚠️ **Hier staat géén `soort`-grens, en dat is nagemeten en niet vergeten.**
  //    `OVERGESLAGEN` hierboven heeft er wel een, omdat die regel een geslaagde
  //    stap alsnog kan omkatten en dus een citaat kan treffen. Deze staat ná
  //    `code === 0`, dus een suite die de melding alleen cíteert is dan al
  //    groen; en een suite die zelf faalt, is met of zonder deze regel rood.
  //    Een grens die geen enkel geval verandert, is geen grendel maar een
  //    geruststelling — de ijking van QS8-268 vond hem groen onder mutatie.
  if (GEWEIGERD.test(uitvoer)) return 'rood';

  if (heeftDatabaseNodig && GEEN_DATABASE.test(uitvoer)) return 'ongemeten';

  return 'rood';
}

/**
 * Hoe een stap eruitziet die zijn database niet vond.
 *
 * ⚠️ `fetch failed` en `lokale-stack` horen erbij omdat de RLS-suite zonder
 *    stack daarop afknapt en niet op een psql-melding. Zonder die twee is een
 *    suite die niets kon draaien "rood", en dan verdwijnt hij tussen de echte
 *    fouten in plaats van te zeggen dat er niets gemeten is.
 */
const GEEN_DATABASE =
  /geen database|kon niet verbinden|connection to server|fetch failed|lokale-stack/i;

/**
 * De eigen regel van een controle die wél verbond en werd geweigerd.
 *
 * ⚠️ **Het anker is de regelvorm die het script schrijft, niet de psql-tekst.**
 *    `verbindingsmelding()` in `scripts/psql.mjs` schrijft hem; wie hem hier
 *    verandert, verandert hem daar mee. Zie QS8-268.
 */
const GEWEIGERD = /^[^\n]*\b[\w-]+(?:-controle|:controle)?:\s*GEWEIGERD\b/m;

/**
 * De eigen overslag-regel van een controle, en niet het woord ergens in een lap
 * uitvoer.
 *
 * ⚠️ **Dit patroon stond eerst op het kale woord, en dat was fout op een manier
 *    die deze codebase kent: het maskeerde een échte rode test.** Een falende
 *    test toonde een diff van dít bestand, daar stond het woord in, en de poort
 *    noemde de hele suite "ongemeten" in plaats van rood. Een grendel die een
 *    fout in stilte omzet in een overslag is erger dan geen grendel. Daarom
 *    ankert hij nu op de regel die een controle zelf schrijft.
 */
const OVERGESLAGEN = /^[^\n]*\b[\w-]+(?:-controle|:controle)?:\s*OVERGESLAGEN\b/m;

/**
 * Draait één stap en geeft zijn exitcode én álle uitvoer terug.
 *
 * ⚠️ **`spawnSync` en niet `execFileSync`, en dat is een reparatie waar deze
 *    poort zijn eigen bestaansreden op verloor.** `execFileSync` geeft bij een
 *    geslaagde afloop alléén stdout terug; stderr komt er pas uit via de
 *    foutafhandeling, dus alleen als de stap rood is.
 *
 *    Precies de twee controles waarvoor `beoordeel()` hierboven geschreven is —
 *    `functies:controle` en `register:controle` — schrijven hun `OVERGESLAGEN`
 *    naar **stderr** en eindigen daarna met **exitcode 0**. Die regel werd dus
 *    weggegooid vóórdat `beoordeel()` hem kon zien, en de poort meldde ze als
 *    groen terwijl ze niets gemeten hadden. De drieverdeling stond er wel en
 *    kwam voor die twee gevallen nooit aan.
 *
 *    Nagemeten op 31-08-2026: `execFileSync` op een proces dat naar stderr
 *    schrijft en met 0 eindigt, geeft `""` terug; `spawnSync` geeft de regel.
 *    Zie QS8-239.
 */
export function draai(commando) {
  const uitkomst = spawnSync('npm', ['run', '--silent', commando], {
    cwd: WORTEL,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // ⚠️ Ging het spawnen zelf mis (npm niet gevonden), dan is er geen exitcode.
  //    Dat is rood en geen overslag: er is niets gedraaid en dus niets gemeten,
  //    maar het is ook geen bewuste overslag van de stap zelf.
  if (uitkomst.error) {
    return { code: 1, uitvoer: `poort: ${commando} kon niet starten — ${uitkomst.error.message}` };
  }

  return {
    code: uitkomst.status ?? 1,
    uitvoer: `${uitkomst.stdout ?? ''}${uitkomst.stderr ?? ''}`,
  };
}

async function hoofd() {
  const snel = process.argv.includes('--snel');
  // ⚠️ Met `readFileSync` en niet met een import-attribuut: die syntax slikt de
  //    ESLint-parser van dit project niet, en een script dat de poort bewaakt
  //    hoort zelf door de poort te komen.
  const pakket = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8'));

  const stappen = [
    ...STAPPEN.filter((s) => !(snel && s.soort === 'suite')),
    ...controlesUit(pakket.scripts).map((naam) => ({
      naam,
      commando: naam,
      soort: 'controle',
      database: HEEFT_DATABASE_NODIG.has(naam),
    })),
  ];

  const uitkomsten = [];
  for (const stap of stappen) {
    const { code, uitvoer } = draai(stap.commando);
    const oordeel = beoordeel({
      code,
      uitvoer,
      heeftDatabaseNodig: stap.database === true,
      soort: stap.soort,
    });
    uitkomsten.push({ ...stap, oordeel, uitvoer });
    const teken = oordeel === 'groen' ? '✓' : oordeel === 'ongemeten' ? '·' : '✗';
    process.stdout.write(`${teken} ${stap.naam}\n`);
  }

  const rood = uitkomsten.filter((u) => u.oordeel === 'rood');
  const ongemeten = uitkomsten.filter((u) => u.oordeel === 'ongemeten');

  for (const u of rood) {
    process.stderr.write(`\n──── ${u.naam} ────\n${u.uitvoer.trimEnd()}\n`);
  }

  process.stdout.write('\n');
  if (ongemeten.length > 0) {
    process.stdout.write(
      `· ${ongemeten.length} controle(s) zonder database: ${ongemeten.map((u) => u.naam).join(', ')}.\n` +
        '  Die hebben niets gemeten. Start de stack met `npm run rls:stack` en draai opnieuw.\n\n',
    );
  }

  if (rood.length > 0) {
    process.stderr.write(`✗ ${rood.length} van de ${stappen.length} staan rood.\n`);
    process.exit(1);
  }

  if (ongemeten.length > 0) {
    process.stderr.write(
      `✗ Niets staat rood, maar ${ongemeten.length} controle(s) hebben niets gemeten.\n` +
        '  Dat is geen groene poort. Zie hierboven.\n',
    );
    process.exit(1);
  }

  process.stdout.write(`poort: ${stappen.length} stappen, allemaal groen en allemaal gemeten.\n`);
}

// ⚠️ `pathToFileURL` en geen sjabloonstring: op Windows levert `file://${...}`
//    een pad met backslashes op en start het script zichzelf nooit. De CI-job
//    "Scripts op Windows" bewaakt dat, en hij ving deze fout hier ook echt.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await hoofd();
}
