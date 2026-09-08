#!/usr/bin/env node
/**
 * Bouwen de migraties nog wat er draait? — stap 20 van `/audit` als commando.
 *
 * ⚠️ **Dit was tot 27-08-2026 met de hand ingetypte SQL**, twee keer dezelfde
 *    query op twee databases en dan de uitkomsten met het oog vergelijken. Dat
 *    werkt zolang iemand het doet, en het is precies het soort stap dat je
 *    overslaat op de dag dat het ertoe doet — dezelfde reden waarom `db-dump.mjs`
 *    een script is en geen regel in de handleiding.
 *
 * ⚠️ **En hij meet nu ook het commentaar**, wat de handmatige versie met opzet
 *    niet deed. Op 27-08 zijn bij het toepassen van 0102 en 0103 vier functies
 *    met een ingekorte body in productie beland; de genormaliseerde vergelijking
 *    bleef daar gerust onder. Wie `pg_get_functiondef()` daarna leest — en
 *    CLAUDE.md zegt dat dát de waarheid is — mist juist de redenering die zegt
 *    waaróm er iets staat.
 *
 *    Een commentaarverschil is daarom een **melding** en geen fout: het is echt,
 *    het hoort opgeruimd, en het mag niets tegenhouden.
 *
 * ⚠️ **Twee bronnen, twee soorten toegang.** Productie via de RPC
 *    `functie_vingerafdrukken()` (migratie 0105, alleen `service_role`); de
 *    lokale stack via `psql`, net als `klokgrens-controle` en
 *    `kolomrechten-controle`.
 *
 * ⚠️ **Zonder credentials slaat hij zichzelf over — zichtbaar.** Zelfde afspraak
 *    en dezelfde vorm als `register:controle`: de melding gaat naar stderr met
 *    `OVERGESLAGEN` erin, want op stdout leest "overgeslagen" als "gelukt". Met
 *    `--streng` is een ontbrekende sleutel een fout.
 */

import { execFileSync } from 'node:child_process';

import { psqlArgumenten } from './psql.mjs';
import process from 'node:process';

import { config } from 'dotenv';

import { beoordeelOmgeving } from './migratieregister-omgeving.mjs';
import { bouwRapport, isFout, vergelijkFuncties } from './functies-vergelijk.mjs';

config({ path: '.env', quiet: true });

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const streng = process.argv.includes('--streng') || process.env.FUNCTIES_CONTROLE_STRENG === '1';

const ONTBREEKT =
  'geen EXPO_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in de omgeving.\n' +
  '  Deze controle legt productie naast de lokale stack; zie stap 20 van /audit.';

const oordeel = beoordeelOmgeving({ url, sleutel: serviceRoleKey, streng });

if (oordeel === 'ontbreekt') {
  console.error(`✗ functies-controle kon niet draaien — ${ONTBREEKT}`);
  process.exit(1);
}

if (oordeel === 'overslaan') {
  console.error(`⚠ functies-controle: OVERGESLAGEN — ${ONTBREEKT}`);
  process.exit(0);
}

async function uitProductie() {
  const antwoord = await fetch(`${url}/rest/v1/rpc/functie_vingerafdrukken`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
    signal: AbortSignal.timeout(20_000),
  });

  if (!antwoord.ok) {
    throw new Error(
      `Productie lezen lukte niet (${antwoord.status}). Bestaat migratie 0105 al ` +
        'op dit project, en draai je met de service-role-key?',
    );
  }

  return antwoord.json();
}

function uitLokaal() {
  const args = psqlArgumenten('select * from functie_vingerafdrukken();');

  const uitvoer = execFileSync('psql', args, { encoding: 'utf8' });

  return uitvoer
    .split('\n')
    .filter((regel) => regel.trim() !== '')
    .map((regel) => {
      const [naam, kaal, ruw] = regel.split('|');
      return { naam, kaal, ruw };
    });
}

let productie;
let lokaal;

try {
  productie = await uitProductie();
} catch (fout) {
  console.error(`✗ ${fout instanceof Error ? fout.message : String(fout)}`);
  process.exit(1);
}

try {
  lokaal = uitLokaal();
} catch (fout) {
  console.error(
    `✗ Geen lokale stack om tegen te meten (${process.env.DB ?? 'goalbuddies_rls'}).\n\n` +
      '  Deze controle vergelijkt twee databases; zonder de tweede valt er niets te\n' +
      '  vergelijken. Start hem met `npm run rls:stack`.\n\n' +
      `  psql zei: ${fout instanceof Error ? fout.message.split('\n')[0] : String(fout)}`,
  );
  process.exit(1);
}

const uitslag = vergelijkFuncties(productie, lokaal);

// ⚠️⚠️ **Eerst álles afdrukken, dan pas afsluiten** — QS8-220. Hier stond de
//    commentaarmelding ná `process.exit(1)`, en dus was hij onbereikbaar zodra er
//    óók een logicaverschil was. 📏 Met productie op 0186 en de map op 0213 zijn
//    dat er 75, dus de 21 functies zonder commentaar zijn nooit afgedrukt terwijl
//    de vergelijking ze al die tijd teruggaf. De volgorde staat nu vast in
//    `bouwRapport()` en onder test in `tests/scripts/functies-vergelijk.test.ts`.
for (const blok of bouwRapport(uitslag)) {
  console.error(`${blok.tekst}\n`);
  for (const naam of blok.namen) console.error(`    ${naam}()`);
  if (blok.uitleg !== undefined) console.error(`\n${blok.uitleg}\n`);
}

if (isFout(uitslag)) process.exit(1);

console.log(
  `functies-controle: ${productie.length} functies, logica overal gelijk` +
    (uitslag.commentaar.length > 0 ? ` (${uitslag.commentaar.length} zonder commentaar).` : '.'),
);
