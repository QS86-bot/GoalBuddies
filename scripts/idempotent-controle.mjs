#!/usr/bin/env node
/**
 * Speelt élke migratie direct na zichzelf nog een keer af — QS8-413.
 *
 * ⚠️⚠️ **Waarom de statische grendel deze klasse niet kán zien.**
 *    `bezwarenIn()` in `tests/migraties/idempotentie.ts` vraagt per object of er
 *    een `drop … if exists` vóór de `create` staat. Bij migratie 0252 stond die
 *    er, voor allebei de constraints — en tóch viel het bestand bij een tweede
 *    run om:
 *
 *      ERROR: cannot drop constraint completions_id_gebruiker_uniek
 *             because other objects depend on it
 *
 *    De unieke constraint kon niet weg zolang de foreign key van hetzelfde
 *    bestand eraan hing. **De fout zit in de volgorde tussen twee objecten**, en
 *    dat is een eigenschap van het gehéél. Een per-object-regel blijft daar per
 *    definitie groen op — onwrikbare regel 18, vraag 2.
 *
 * ⚠️⚠️ **"Direct na zichzelf" is het hele ontwerp en niet een detail.** De
 *    uitzonderingsklasse die CLAUDE.md beschermt — een botsing doordat een
 *    **latere** migratie de vorm van hetzelfde object veranderde — kan hier niet
 *    optreden: die latere migratie heeft nog niet gedraaid. Vijf bestanden
 *    (0002, 0003, 0008, 0016, 0024) vallen bij een naïeve "speel alles nog eens
 *    af" om, en dat hóórt: die weigering is soms het enige dat een ongewenste
 *    terugzet tegenhoudt. Deze controle laat ze met rust omdat hij een andere
 *    vraag stelt.
 *
 * ⚠️ **Een eigen database, en niet die van de stack.** `goalbuddies_dubbel`
 *    wordt weggegooid en opnieuw opgebouwd; de stack waar de RLS-suite tegen
 *    draait blijft onaangeraakt. Dat scheelt ook een klasse verwarring: een
 *    migratie die twee keer draait mag geen rijen verdubbelen, en als dat toch
 *    gebeurt hoort dat híer om te vallen en niet in een RLS-test drie stappen
 *    verderop.
 *
 * ⚠️ 📏 Kost 2 seconden bovenop een gewone opbouw (23,3 s → 25,3 s): beide
 *    passes gaan in één psql-sessie, en de tweede is per definitie bijna
 *    helemaal no-op.
 *
 * Draaien: `npm run idempotent:controle`. Hoort mee in de poort.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const OPBOUW = fileURLToPath(new URL('schema-opbouwen.sh', import.meta.url));

/** De database die deze controle zelf aanmaakt en weggooit. */
export const DUBBEL_DB = 'goalbuddies_dubbel';

/**
 * De regel waarmee de opbouw zegt dat hij klaar is.
 *
 * ⚠️ Geëxporteerd en apart getoetst: zonder deze zin zou een opbouw die
 *    halverwege stil stopt met exitcode 0 als geslaagd tellen. Dat is dezelfde
 *    vorm als een controle die "OVERGESLAGEN" print en 0 teruggeeft.
 */
export const KLAAR = /✓ (\d+) migraties elk twee keer afgespeeld/;

/**
 * Wat de uitvoer van de opbouw betekent.
 *
 * ⚠️ Geëxporteerd zonder proces en zonder database, zodat élke vorm los te
 *    ijken is: geslaagd, omgevallen, en — de stille — geslaagd zonder slotregel.
 */
export function beoordeelOpbouw({ code, uitvoer }) {
  const treffer = KLAAR.exec(uitvoer);

  if (code === 0 && treffer !== null) {
    return { stand: 'groen', aantal: Number(treffer[1]) };
  }

  if (code === 0) {
    return {
      stand: 'rood',
      reden:
        'de opbouw gaf exitcode 0 maar geen slotregel — hij is ergens halverwege\n' +
        '  gestopt zonder dat te zeggen.',
    };
  }

  const omgevallen = /✗ (\S+) viel om/.exec(uitvoer);

  // ⚠️⚠️ **`soort` bestaat sinds QS8-562, en het is dezelfde les één laag hoger.**
  //    Hieronder stond één advies voor élke rode uitslag: *zet de opruiming van
  //    álle objecten bovenaan, in omgekeerde afhankelijkheidsvolgorde.* 📏 Gemeten
  //    op 19-09-2026 met een rol die geen eigenaar van de database is: de opbouw
  //    zei `ERROR: must be owner of database goalbuddies_dubbel`, en deze controle
  //    drukte dat advies af over constraints die er niets mee te maken hebben.
  //    Een plausibele oorzaak in plaats van de gemeten — precies waar QS8-562
  //    over gaat, en de opbouw eronder was er net voor gerepareerd.
  return omgevallen === null
    ? { stand: 'rood', soort: 'onbekend', reden: 'de opbouw viel om zonder te zeggen waar.' }
    : {
        stand: 'rood',
        soort: 'migratie',
        reden: `\`${omgevallen[1]}\` botst op zichzelf bij een tweede run.`,
      };
}

/**
 * De staart van de opbouw-uitvoer, want daar staat de fout.
 *
 * ⚠️ **Niet alles, en dat is een afweging.** Een geslaagde opbouw schrijft
 *    honderden `NOTICE`-regels; de fout staat altijd aan het eind, want de
 *    opbouw stopt erop. Alles afdrukken zou de melding begraven onder de ruis
 *    die deze controle juist wegfiltert.
 *
 * @param {string} uitvoer
 * @param {number} [regels]
 * @returns {string}
 */
export function staart(uitvoer, regels = 20) {
  const alle = String(uitvoer).split('\n').filter((r) => r.trim() !== '');
  return alle.slice(-regels).join('\n');
}

/** Het advies dat alleen klopt als er écht een migratie omviel. */
const OPRUIMVOLGORDE =
  'Een migratie hoort een tweede run te overleven tegen de toestand waarvoor hij\n' +
  'geschreven is. Zet de opruiming van álle objecten bovenaan, in omgekeerde\n' +
  'afhankelijkheidsvolgorde: een unieke constraint kan niet weg zolang een\n' +
  'foreign key uit hetzelfde bestand eraan hangt.\n\n' +
  'Botst hij met een **latere** migratie die de vorm van hetzelfde object\n' +
  'veranderde, dan hoort die weigering te blijven staan — maar dan valt hij hier\n' +
  'ook niet om, want die migratie heeft nog niet gedraaid.\n';

/**
 * Wat er op stderr komt bij een rode uitslag.
 *
 * ⚠️⚠️ **Los van `hoofd()` en zonder proces, met opzet.** 📏 Geijkt: zolang deze
 *    twee keuzes in `hoofd()` stonden, gaven twee mutaties — het advies weer
 *    onvoorwaardelijk, en de uitvoer van de opbouw weer weggooien — **nul** rode
 *    toetsen. Ze zaten in een functie die een database en een subproces vraagt,
 *    en dat is de vorm die CLAUDE.md afraadt: *een controle die je niet kunt
 *    voeden, kun je niet ijken.*
 *
 * ⚠️ **Twee keuzes, en allebei zijn het QS8-562.** Het advies hoort bij de
 *    gemeten oorzaak: viel er een migratie om, dan gaat het over opruimvolgorde;
 *    viel de opbouw op iets anders om, dan is datzelfde advies een gok. En de
 *    uitvoer van de opbouw gaat **altijd** mee — die duidt een mislukte drop tot
 *    op de psql-regel, en die duiding werd hiervóór helemaal weggegooid.
 *
 * @param {{ reden?: string, soort?: string }} oordeel
 * @param {string} uitvoer
 * @returns {string[]}
 */
export function roodregels(oordeel, uitvoer) {
  const uit = [`✗ idempotent-controle: ${oordeel.reden}\n`];
  if (oordeel.soort === 'migratie') uit.push(OPRUIMVOLGORDE);
  uit.push(`De opbouw zei, laatste regels:\n${staart(uitvoer)}`);
  return uit;
}

/** Draait de opbouw met `--dubbel` en vangt de uitvoer op. */
function opbouwen() {
  try {
    const uitvoer = execFileSync('bash', [OPBOUW, '--dubbel'], {
      cwd: WORTEL,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DB: DUBBEL_DB },
    });
    return { code: 0, uitvoer };
  } catch (fout) {
    const uit = `${fout?.stdout ?? ''}${fout?.stderr ?? ''}`;
    return { code: typeof fout?.status === 'number' ? fout.status : 1, uitvoer: uit };
  }
}

const LEEST =
  'Deze controle speelt de migratiebestanden af op een lege database en kan dat\n' +
  'zonder server niet.';

function hoofd() {
  // ⚠️ Eerst vragen of er überhaupt een server is. Zonder deze probe zou een
  //    ontbrekende Postgres een omgevallen opbouw heten, en dan meldt de poort
  //    rood waar ongemeten hoort te staan — de spiegelfout van QS8-268.
  try {
    execFileSync('psql', psqlArgumenten('select 1', { ...process.env, DB: 'postgres' }), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'idempotent-controle',
        leest: LEEST,
        melding: `${fout?.stderr ?? ''}${fout?.message ?? ''}`,
      }),
    );
    return 1;
  }

  const laatste = opbouwen();
  const oordeel = beoordeelOpbouw(laatste);

  if (oordeel.stand === 'groen') {
    console.log(
      `idempotent-controle: ${oordeel.aantal} migraties draaien elk twee keer achter ` +
        'elkaar zonder om te vallen.',
    );
    return 0;
  }

  for (const regel of roodregels(oordeel, laatste.uitvoer)) console.error(regel);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
