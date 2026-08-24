#!/usr/bin/env node
/**
 * Niemand opent zelf een verbinding met Postgres — QS8-22, het laatste punt.
 *
 * ⚠️ **Waarom dit een controle is en geen zin in een document.** `CLAUDE.md` zegt
 *    onder de gratie-tier-beperkingen: *"Geen read replicas; connection pooling
 *    vanaf dag één."* Vandaag is daaraan voldaan zonder dat iemand iets heeft
 *    ingesteld, en dat is precies het gevaar: het klopt bij toeval van de
 *    architectuur, niet door een keuze die iemand bewaakt.
 *
 *    De app en de Edge Functions praten met **PostgREST** over HTTPS. Die houdt
 *    zijn eigen pool aan en is het enige dat verbindingen opent. Er zit geen
 *    Postgres-driver in `package.json`, dus er ís niets dat een socket kan
 *    openen.
 *
 * ⚠️ **Dat verandert op de dag dat er een langdraaiende Node-server bijkomt**, en
 *    `CLAUDE.md` schrijft die dag zelf voor: *"Server-side code als gewone
 *    langdraaiende Node-server"* op Hostinger. Zo'n proces met een `pg`-pool op
 *    de **directe** poort is precies hoe een gratis tier omvalt: `max_connections`
 *    staat op **60**, en dat is voor de hele database — inclusief PostgREST, de
 *    Auth-server en alles wat Supabase zelf draait. Twee processen met een pool
 *    van tien zijn een derde van het budget.
 *
 *    Wat er dan moet gebeuren staat in `docs/DEPLOY.md` §2.7. Deze controle is er
 *    om ervoor te zorgen dat iemand dat leest vóórdat het misgaat, en niet erna.
 *
 * ⚠️ `scripts/` en `tests/` staan er bewust buiten. `db-dump.mjs` maakt één
 *    kortdurende verbinding voor `pg_dump`, en de lokale opstelling praat
 *    rechtstreeks met een database die hij zelf net heeft gemaakt. Dat zijn geen
 *    langdraaiende poolers en het zijn geen verbindingen met productie in een
 *    verzoekpad.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const WORTEL = new URL('..', import.meta.url).pathname;

/** Waar de app en de serverfuncties staan. */
const MAPPEN = ['src', 'app', 'supabase/functions'];

/**
 * Pakketten die een eigen verbinding met Postgres openen.
 *
 * ⚠️ Deze lijst is een deny-list en die is per definitie onvolledig. Hij vangt de
 *    gangbare gevallen; de controle hieronder op een verbindingsstring vangt de
 *    rest, want zonder zo'n string komt geen enkele driver ergens binnen.
 */
const DIRECTE_CLIENTS = [
  'pg',
  'pg-native',
  'pg-promise',
  'postgres',
  'knex',
  'drizzle-orm',
  'typeorm',
  'sequelize',
  '@prisma/client',
  'slonik',
  'porsager-postgres',
];

/** Een verbindingsstring naar Postgres, in welke vorm dan ook. */
const VERBINDINGSSTRING = /postgres(?:ql)?:\/\//;

/**
 * De klachten over deze bronnen.
 *
 * ⚠️ Geëxporteerd en puur, zodat `tests/scripts/verbindingen-controle.test.ts`
 *    élk faalgeval met de hand kan breken. Een controle die je niet kunt voeden,
 *    kun je niet ijken — dat is de les van QS8-115 en die geldt hier vanaf de
 *    eerste regel in plaats van pas na een half jaar.
 *
 * @param {{ afhankelijkheden: string[], bestanden: { pad: string, inhoud: string }[] }} bronnen
 * @returns {string[]}
 */
export function controleer(bronnen) {
  const klachten = [];

  for (const naam of bronnen.afhankelijkheden) {
    if (DIRECTE_CLIENTS.includes(naam)) {
      klachten.push(
        `${naam} staat in package.json en opent een eigen verbinding met Postgres. ` +
          'Zie docs/DEPLOY.md §2.7: een langdraaiend proces hoort op de transactiepooler ' +
          '(poort 6543) en niet op de directe poort.',
      );
    }
  }

  for (const { pad, inhoud } of bronnen.bestanden) {
    inhoud.split('\n').forEach((regel, i) => {
      // Commentaar telt niet mee: deze bestanden lééggen juist uit waarom er geen
      // directe verbinding is, en dat mag geen rode controle opleveren.
      if (regel.trim().startsWith('//') || regel.trim().startsWith('*')) return;
      if (!VERBINDINGSSTRING.test(regel)) return;

      klachten.push(
        `${pad}:${i + 1} bevat een verbindingsstring naar Postgres. ` +
          'De app en de Edge Functions praten uitsluitend via PostgREST.',
      );
    });
  }

  return klachten;
}

function bestanden(map) {
  const gevonden = [];
  const loop = (pad) => {
    for (const naam of readdirSync(pad)) {
      const vol = join(pad, naam);
      if (statSync(vol).isDirectory()) loop(vol);
      else if (/\.(?:tsx?|mjs|js)$/.test(naam) && !/\.test\.tsx?$/.test(naam)) gevonden.push(vol);
    }
  };

  try {
    loop(join(WORTEL, map));
  } catch {
    // Een map die er niet is, is geen klacht.
  }

  return gevonden;
}

function main() {
  const pakket = JSON.parse(readFileSync(join(WORTEL, 'package.json'), 'utf8'));

  const klachten = controleer({
    afhankelijkheden: [
      ...Object.keys(pakket.dependencies ?? {}),
      ...Object.keys(pakket.devDependencies ?? {}),
    ],
    bestanden: MAPPEN.flatMap((map) =>
      bestanden(map).map((pad) => ({
        pad: pad.replace(WORTEL, ''),
        inhoud: readFileSync(pad, 'utf8'),
      })),
    ),
  });

  if (klachten.length === 0) {
    console.log(
      'verbindingen-controle: niemand opent zelf een verbinding met Postgres ' +
        '(alles loopt via PostgREST).',
    );
    process.exit(0);
  }

  console.error(`verbindingen-controle: ${klachten.length} bevinding(en).\n`);
  for (const k of klachten) console.error(`  ${k}`);
  console.error('\nZie docs/DEPLOY.md §2.7 en CLAUDE.md, gratis tier.');
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
