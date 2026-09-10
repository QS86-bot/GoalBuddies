#!/usr/bin/env node
/**
 * Welke `*:controle` in welke CI-baan draait — QS8-417.
 *
 * ⚠️⚠️ **Waarom dit bestaat: de poort ontdekt een nieuwe controle vanzelf en CI
 *    niet.** `scripts/poort.mjs` leest `package.json` en pikt élke `*:controle`
 *    op; `ci.yml` somde ze met de hand op. Het gevolg liep de verkeerde kant op:
 *    een nieuwe grendel stond **automatisch in de poort** — een commando dat een
 *    mens typt, en dat CLAUDE.md zelf *"de inschatting van een mens over zijn
 *    eigen werk"* noemt — en **automatisch niet in CI**, dat bij elke push draait.
 *
 *    📏 Gemeten op 10-09-2026: 52 controles, 26 genoemd in `.github/workflows/`,
 *    26 niet. Daaronder `schermingang:controle` (vond `/doel/plan` onbereikbaar),
 *    `registerdrift:controle` (redde `sleutelzetters()`), `exports:controle` en
 *    `hoofdrun:controle` — precies de grendels die dit project betaald heeft.
 *
 * ⚠️⚠️ **En het is een teruggegroeide reparatie.** De dossierrij van 27-08-2026
 *    *"CI toetste dát de controles werkten, en liet ze niets bewaken"* staat op
 *    opgelost; die ronde repareerde acht van de zeventien instanties en niet de
 *    klasse. De meeste van de 26 zijn ná die reparatie gebouwd. Vandaar dat hier
 *    een **lijst uit `package.json`** staat en geen tweede opsomming: een
 *    opsomming die je met de hand onderhoudt, onderhoud je niet.
 *
 * Gebruik:
 *   node scripts/ci-controles.mjs --baan repo        # namen, één per regel
 *   node scripts/ci-controles.mjs --baan database
 *   npm run cidekking:controle                       # de grendel op de klasse
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { controlesUit, HEEFT_DATABASE_NODIG } from './poort.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(WORTEL, '.github', 'workflows');

/**
 * De controles die CI niet kan draaien, met de reden per rij.
 *
 * ⚠️ **Op één plek, en dat was acceptatiecriterium 3.** Dit stond in twee
 *    comments in `ci.yml`, elk met een deel van de lijst — en twee halve lijsten
 *    is hoe je er een kwijtraakt.
 *
 * ⚠️ Een reden en geen vinkje. Wie hier een naam neerzet zonder op te schrijven
 *    waaróm CI hem niet kan draaien, heeft de controle beantwoord in plaats van
 *    de vraag.
 */
/** @type {Record<string, string>} */
export const ZONDER_CI = {
  'functies:controle':
    'Leest `pg_proc` van het échte project en vergelijkt de gedeployde functies ' +
    'met de map. Vraagt de productiesleutel.',
  'register:controle':
    'Leest `supabase_migrations.schema_migrations` op productie om te zien hoe ' +
    'ver die achterloopt. Vraagt de productiesleutel.',
  'adviseur:controle':
    'Haalt de Supabase-adviseurs op bij het echte project. Vraagt de ' +
    'productiesleutel, en meet iets dat per definitie over productie gaat.',
  'edge:gedeployd:controle':
    'Vergelijkt de gedéployde Edge-bundel met de repo. Vraagt de ' +
    'productiesleutel; zonder deploy is er niets om naast te leggen.',
  'vapid:controle':
    'Toetst het VAPID-sleutelpaar uit `.env`. Dat staat met opzet niet in CI, ' +
    'en een sleutel die er niet is kan niet fout zijn.',
  'wachtwoord:controle':
    'Leest `password_min_length` uit het Supabase-dashboard van het echte ' +
    'project. Vraagt de productiesleutel.',
  'bundel:controle':
    'Vraagt het npm-register naar de gepubliceerde bundelgroottes. Een ' +
    'netwerkaanroep maakt de uitslag afhankelijk van bereikbaarheid.',
  'pgversie:controle':
    'Legt de Postgres-major van productie naast die van de opstelling. De ' +
    'runner draait een andere major dan productie, dus hier meet hij niets.',
};

/**
 * Verdeelt de controles over de twee CI-banen en de lijst die eruit blijft.
 *
 * ⚠️ **De verdeling is totaal, en dat is het hele punt.** Elke controle valt in
 *    precies één van de drie; er is geen vierde bak waarin iets stil kan
 *    verdwijnen. Wil je er een buiten CI houden, dan moet je hem in `ZONDER_CI`
 *    zetten en er een reden bij schrijven — zichtbaar in de diff.
 */
export function verdeel(controles, heeftDatabaseNodig = HEEFT_DATABASE_NODIG, register = ZONDER_CI) {
  const zonder = [];
  const database = [];
  const repo = [];

  for (const naam of controles) {
    if (naam in register) zonder.push(naam);
    else if (heeftDatabaseNodig.has(naam)) database.push(naam);
    else repo.push(naam);
  }

  return { repo, database, zonder };
}

/**
 * De controles die een workflow bij naam als stap noemt.
 *
 * ⚠️ **Dit is de grendel op de klasse zelf.** De banen hierboven kunnen niet
 *    achterlopen — ze wórden uit `package.json` gelezen. Wat wél kan terugkomen
 *    is dat iemand er weer losse stappen naast zet; dan draait die controle twee
 *    keer en, erger, ontstaat opnieuw het idee dat `ci.yml` de lijst bijhoudt.
 */
export function handmatigGenoemd(yml, controles) {
  return controles.filter((naam) => new RegExp(`run:\\s*npm run ${naam}(?:\\s|$)`, 'm').test(yml));
}

/** De inhoud van alle workflowbestanden, aan elkaar. */
function workflowtekst() {
  return readdirSync(WORKFLOWS)
    .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
    .map((n) => readFileSync(join(WORKFLOWS, n), 'utf8'))
    .join('\n');
}

function scripts() {
  return JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8')).scripts;
}

/**
 * De bevindingen van de grendel.
 *
 * ⚠️ Geëxporteerd en zonder bestandssysteem, zodat élke vorm los te ijken is.
 */
export function bezwaren(controles, yml, register = ZONDER_CI) {
  const uit = [];

  for (const naam of handmatigGenoemd(yml, controles)) {
    uit.push(
      `${naam} staat met de hand als stap in een workflow. De banen komen uit ` +
        '`package.json`; een losse stap ernaast laat hem twee keer draaien en ' +
        'wekt de indruk dat de lijst daar bijgehouden wordt.',
    );
  }

  for (const naam of Object.keys(register)) {
    if (!controles.includes(naam)) {
      uit.push(`${naam} staat in ZONDER_CI maar bestaat niet meer als script.`);
    } else if (register[naam].length < 60) {
      uit.push(`${naam} staat in ZONDER_CI zonder een reden die iets uitlegt.`);
    }
  }

  return uit;
}

function baan(welke) {
  const { repo, database } = verdeel(controlesUit(scripts()));
  for (const naam of welke === 'database' ? database : repo) console.log(naam);
  return 0;
}

function grendel() {
  const controles = controlesUit(scripts());
  const { repo, database, zonder } = verdeel(controles);
  const gevonden = bezwaren(controles, workflowtekst());

  if (gevonden.length === 0) {
    console.log(
      `cidekking-controle: ${repo.length + database.length} van de ${controles.length} ` +
        `controles draaien in CI (${repo.length} op de repo, ${database.length} op de ` +
        `database); ${zonder.length} kunnen dat niet en zeggen waarom.`,
    );
    return 0;
  }

  console.error(`✗ cidekking-controle: ${gevonden.length} bevinding(en).\n`);
  for (const b of gevonden) console.error(`  - ${b}`);
  console.error(
    '\nCI leest de lijst uit `package.json` via `scripts/ci-controles.mjs --baan`.\n' +
      'Een controle hoort daar vanzelf in te vallen; kan CI hem niet draaien, zet\n' +
      'hem dan in ZONDER_CI mét de reden.',
  );
  return 1;
}

function hoofd() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--baan');
  if (i !== -1) return baan(argv[i + 1]);
  return grendel();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(hoofd());
}
