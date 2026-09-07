#!/usr/bin/env node
/**
 * tijdzones-controle — elke tijdzone die deze repo noemt, bestaat aan béide
 * kanten: lokaal én op productie. QS8-170.
 *
 * ⚠️ **De les van QS8-122 in een nieuwe vorm: de RLS-suite bouwt het schéma van
 *    productie op, maar niet zijn ómgeving.** `pg_timezone_names` komt uit de
 *    tzdata van het besturingssysteem en niet uit een migratie. Een test die een
 *    tijdzone kiest, kiest daarmee een omgevingseigenschap — en dan toetst hij
 *    de omgeving in plaats van de regel.
 *
 * ⚠️⚠️ **Het gevaar loopt twee kanten op, en de tweede is de erge.** Tot
 *    06-09-2026 stond alleen de eerste opgeschreven:
 *
 *    1. Een zone die **alleen op productie** bestaat (`Asia/Calcutta`,
 *       `US/Eastern`, `Japan`, …) maakt een test **lokaal rood en op productie
 *       groen**. Vervelend, maar luid: je ziet hem meteen.
 *    2. Een zone die **alleen lokaal** bestaat maakt een test **lokaal groen en
 *       op productie kapot**. Die zie je niet, en dat is precies het soort stilte
 *       waar dit project regel 18 voor heeft.
 *
 *    📏 Er zijn er twee van soort 2, gemeten op 06-09-2026: `localtime` en
 *    `posixrules`. Zie `ALLEEN_LOKAAL`.
 *
 * ⚠️ **En de aanleiding van het issue klopte niet helemaal, wat het vermelden
 *    waard is.** De rij van 28-08 zegt "499 lokaal tegen 1196 op productie". 📏
 *    Nagemeten op de draaiende productiedatabase: van die 1196 zijn er **598 een
 *    `posix/`-spiegel van de andere 598**. De echte vergelijking is dus 499 tegen
 *    598 — een verschil van 99 namen en niet van 697, en die 99 zijn vrijwel
 *    allemaal terugwaartse aliassen (`Brazil/*`, `Canada/*`, `US/*`, `Japan`,
 *    `PRC`, `GB`). Een getal dat een orde van grootte te groot is, laat een
 *    probleem groter lijken dan het is — en dan schat de volgende lezer de
 *    reparatie ook verkeerd in.
 *
 * ⚠️ **Wat deze controle níet doet: hij praat niet met productie.** Dat vraagt
 *    een service-role-key, en die hoort niet in een controle die op elke machine
 *    draait (beveiligingsregel 4). De productiekant zit daarom als **gemeten
 *    lijst met datum** in `ALLEEN_LOKAAL` — dezelfde afspraak als bij het
 *    migratieregister: de goedkope helft draait overal, de dure helft is een
 *    meting die je opschrijft.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { metSchuineStrepen } from './paden.mjs';
import { psqlArgumenten, verbindingsmelding } from './psql.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Waar een tijdzonenaam kan staan. */
export const MAPPEN = ['src', 'app', 'tests', 'scripts', 'supabase/migrations', 'supabase/functions'];

/**
 * De twee bestanden die de verboden namen zélf moeten noemen.
 *
 * ⚠️ **Zonder deze uitzondering is de controle permanent rood op zijn eigen
 *    register**, en een controle die altijd rood staat, leer je uitzetten. Het
 *    register moet `localtime` en `posixrules` letterlijk noemen om ze te kunnen
 *    herkennen, en de test moet ze kunnen voeden om de controle te kunnen ijken.
 *
 * ⚠️ **Twee bestanden en geen patroon.** Een uitzondering als `alles onder
 *    scripts/` zou de volgende echte fout in die map mee wegpoetsen — en juist
 *    daar wonen de grendels van dit project.
 */
export const EIGEN_BESTANDEN = new Set([
  'scripts/tijdzones-controle.mjs',
  'tests/scripts/tijdzones.test.ts',
]);

/**
 * Zones die de lokale stack kent en productie **niet**.
 *
 * 📏 Gemeten op 06-09-2026 tegen `wehgocadxehottiiyvsc` (Postgres 17.6) naast de
 * lokale stack (Postgres 16.13 op Ubuntu-tzdata):
 *
 *     localtime   -> lokaal ja, productie nee
 *     posixrules  -> lokaal ja, productie nee
 *
 * ⚠️ **Dit is de lijst die de stille fout tegenhoudt.** Beide zijn geen echte
 *    zones maar artefacten van de Debian/Ubuntu-tzdata: `localtime` is de
 *    systeemzone van de machine en `posixrules` een oude compatibiliteitsstub.
 *    Een test die er een gebruikt, is lokaal groen en op productie stuk — en
 *    niets zou dat zeggen.
 */
export const ALLEEN_LOKAAL = new Map([
  ['localtime', 'de systeemzone van de máchine, geen IANA-zone — op productie bestaat hij niet'],
  ['posixrules', 'een compatibiliteitsstub uit oudere tzdata — op productie bestaat hij niet'],
]);

/**
 * Namen die eruitzien als een tijdzone maar het niet zijn.
 *
 * ⚠️ **Deze helft bepaalt of de controle bruikbaar is.** Het patroon matcht ook
 *    `Content-Type/json`, `modules/goals` en elk importpad — en een controle die
 *    daarover meldt, leer je wegklikken. Er wordt daarom alléén gemeld over een
 *    naam die in `ALLEEN_LOKAAL` staat; al het andere is voor deze controle geen
 *    tijdzone.
 *
 * ⚠️⚠️ **Het patroon eist géén schuine streep, en dat is de hele reparatie van
 *    mijn eerste versie.** Die eiste er minstens één — en `localtime` en
 *    `posixrules` hébben er geen. De controle kon dus precies het geval niet
 *    zien waarvoor hij bestaat: de ijking zette `export const ZONE =
 *    'localtime';` in een testbestand en de controle bleef **groen**.
 *
 *    Dat is regel 18 vraag 3 in zijn zuiverste vorm, en het is alleen aan het
 *    licht gekomen doordat de ijking de grendel voedde die hij noemt in plaats
 *    van een willekeurige. Was ik met `'Asia/Calcutta'` gaan ijken, dan had ik
 *    een groene controle gehad die niets bewaakt.
 *
 * ⚠️ **Commentaarregels tellen niet mee** — in `//`, `*`, `/*` en `--`. Zonder
 *    dat meldt de controle over élke alinea die uitlegt waaróm `localtime` niet
 *    mag, en dat zijn er hier meerdere: de kop van `tests/rls/tijdzone.test.ts`,
 *    de dossierrij, dit bestand. Een controle die klaagt over zijn eigen uitleg,
 *    leer je wegklikken. De prijs is dat een tijdzone in een uitgecommentarieerde
 *    regel ontsnapt; die draait ook niet.
 */
export function tijdzonekandidaten(bron) {
  return bron
    .split('\n')
    .filter((regel) => !/^\s*(\/\/|\*|\/\*|--)/.test(regel))
    .flatMap((regel) => [
      ...regel.matchAll(/['"`]([A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2})['"`]/g),
    ])
    .map((m) => m[1]);
}

/**
 * Het oordeel over één bestand.
 *
 * ⚠️ **Alleen de stille richting is hier te beslissen, en dat is een grens en
 *    geen omissie.** Een zone die *alleen op productie* bestaat (`Asia/Calcutta`)
 *    zou ook het melden waard zijn — maar uit tekst alleen is niet te zien of
 *    `'modules/goals'` een tijdzone bedóelt of een importpad. Zo'n regel zou over
 *    élk pad in de repo klagen. De andere richting is wél beslisbaar: staat de
 *    naam in `ALLEEN_LOKAAL`, dan is hij per definitie als tijdzone bedoeld.
 *
 *    En het is de goede helft om te hebben: de productie-only kant valt lokaal
 *    meteen rood om, de lokaal-only kant is stil.
 *
 * @param {string[]} kandidaten namen die op een zone lijken
 */
export function beoordeel(kandidaten) {
  const fout = [];
  for (const naam of new Set(kandidaten)) {
    const reden = ALLEEN_LOKAAL.get(naam);
    if (reden !== undefined) fout.push({ naam, reden });
  }
  return fout;
}

/** Elk bestand onder een map dat tekst draagt. */
function bestanden(map) {
  const uit = [];
  let inhoud;
  try {
    inhoud = readdirSync(map);
  } catch {
    return uit;
  }
  for (const naam of inhoud) {
    if (naam === 'node_modules' || naam.startsWith('.')) continue;
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (/\.(ts|tsx|mjs|js|sql)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

const VRAAG = 'select name from pg_timezone_names;';

/** Wat de lokale stack aan tijdzones kent. Werpt als er geen database is. */
function leesLokaleZones() {
  const uitvoer = execFileSync('psql', psqlArgumenten(VRAAG), { encoding: 'utf8' });
  return new Set(
    uitvoer
      .split('\n')
      .map((r) => r.trim())
      .filter((r) => r !== ''),
  );
}

/**
 * Loopt de repo langs en verzamelt wat er mis is.
 *
 * @param {Set<string>} lokaleZones alleen om te tellen hoevéél zones er genoemd worden
 */
export function scanRepo(lokaleZones) {
  const klachten = [];
  let gezien = 0;
  for (const map of MAPPEN) {
    for (const pad of bestanden(join(WORTEL, map))) {
      const relatief = metSchuineStrepen(relative(WORTEL, pad));
      const kandidaten = tijdzonekandidaten(readFileSync(pad, 'utf8'));
      gezien += kandidaten.filter((n) => lokaleZones.has(n)).length;
      if (EIGEN_BESTANDEN.has(relatief)) continue;
      for (const { naam, reden } of beoordeel(kandidaten)) {
        klachten.push({ bestand: relatief, naam, reden });
      }
    }
  }
  return { klachten, gezien };
}

/** De uitleg onder een rode uitslag — apart, want hij is langer dan de logica. */
function meldKlachten(klachten) {
  console.error(`✗ ${klachten.length} verwijzing(en) naar een zone die productie niet kent:\n`);
  for (const { bestand, naam, reden } of klachten) {
    console.error(`    ${bestand}  ->  ${naam}`);
    console.error(`        ${reden}`);
  }
  console.error(
    '\nDit is de stille kant van het verschil: lokaal groen, op productie stuk.\n' +
      '`at time zone` op een onbekende naam geeft geen NULL maar een fout, en die\n' +
      'landt bij de aanroeper — bij een medelid dus, niet bij de schrijver (0119).\n' +
      'Kies een zone die béide kanten kennen, of meet opnieuw en werk ALLEEN_LOKAAL\n' +
      'bij als productie hem intussen wél heeft.',
  );
}

function hoofd() {
  let lokaleZones;
  try {
    lokaleZones = leesLokaleZones();
  } catch (fout) {
    console.error(
      verbindingsmelding({
        naam: 'tijdzones-controle',
        leest:
          'Deze controle leest `pg_timezone_names` van de lokale stack. Die lijst komt\n' +
          'uit de tzdata van het besturingssysteem en staat in geen enkele migratie —\n' +
          'daarom is hij hier niet uit te rekenen.',
        melding: fout instanceof Error ? fout.message : String(fout),
      }),
    );
    return 1;
  }

  const { klachten, gezien } = scanRepo(lokaleZones);
  if (klachten.length > 0) {
    meldKlachten(klachten);
    return 1;
  }

  console.log(
    `tijdzones-controle: ${gezien} verwijzing(en) naar een tijdzone, en geen enkele staat ` +
      'alleen lokaal.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
