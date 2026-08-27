#!/usr/bin/env node
/**
 * Trekt het migratieregister gelijk met de repo — QS8-122, stap 3 van docs/DEPLOY.md.
 *
 * ⚠️ **Waarom dit een commando is en geen zin in een document.** Stap 3 stond er
 *    al, als een UPDATE die je met de hand tikt na elke toepassing. Op 24-08 is
 *    hij zes keer op rij overgeslagen — op dezelfde dag dat QS8-122 hem
 *    opschreef. Een handeling die je bij élke migratie moet onthouden en die
 *    niets zichtbaars kapotmaakt als je hem vergeet, wordt vergeten.
 *
 *    De controle ernaast (`register:controle`) déed het wel: die was rood. Maar
 *    een controle die zegt wat je met de hand moet repareren, is een controle
 *    waarvan de reparatie ook weer vergeten wordt.
 *
 * ⚠️ **De grendels zitten in migratie 0081 en niet hier.** Een grendel die de
 *    aanroeper zelf moet aanhouden is geen grendel: dit script is één van de
 *    mogelijke aanroepers. Wat hier staat is de planning — welke naam hoort bij
 *    welk nummer — en die is los getest in `migratieregister-plan.test.ts`.
 *
 * ⚠️ **Draait de controle achteraf zelf.** Uitlijnen dat zegt dat het gelukt is
 *    zonder na te meten, is precies de vorm die dit project al twee keer heeft
 *    gekost. Slaagt het uitlijnen maar blijft de controle rood, dan eindigt dit
 *    script rood.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { plan } from './migratieregister-plan.mjs';
import { vergelijk } from './migratieregister-vergelijk.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.log(
    'migratieregister-uitlijnen: overgeslagen — geen EXPO_PUBLIC_SUPABASE_URL en\n' +
      '  SUPABASE_SERVICE_ROLE_KEY in de omgeving. Zie docs/DEPLOY.md §2.2.',
  );
  process.exit(0);
}

/** De migraties zoals ze in de repo staan: `0057_commitments_afwikkelen.sql`. */
function uitDeRepo() {
  return readdirSync(join(WORTEL, 'supabase', 'migrations'))
    .filter((naam) => naam.endsWith('.sql'))
    .map((naam) => {
      const stam = naam.slice(0, -4);
      const scheiding = stam.indexOf('_');
      return { versie: stam.slice(0, scheiding), naam: stam.slice(scheiding + 1), bestand: naam };
    })
    .sort((a, b) => a.versie.localeCompare(b.versie));
}

/**
 * @param {string} functie
 * @param {unknown} body
 */
async function rpc(functie, body) {
  const antwoord = await fetch(`${url}/rest/v1/rpc/${functie}`, {
    method: 'POST',
    headers: {
      apikey: /** @type {string} */ (serviceRoleKey),
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
    signal: AbortSignal.timeout(15_000),
  });

  if (!antwoord.ok) {
    throw new Error(
      `${functie} aanroepen lukte niet (${antwoord.status}). Staan migratie 0072 en ` +
        '0081 al op dit project, en draai je met de service-role-key?',
    );
  }

  return antwoord.json();
}

const repo = uitDeRepo();
const voor = await rpc('migratieregister', {});

const { paren, waarschuwingen } = plan(repo, voor);

for (const w of waarschuwingen) console.error(`  ⚠️  ${w}`);

if (paren.length === 0) {
  if (waarschuwingen.length > 0) {
    console.error('\nmigratieregister-uitlijnen: niets uit te lijnen, wel iets mis. Zie hierboven.');
    process.exit(1);
  }
  console.log(`migratieregister-uitlijnen: ${repo.length} migraties, alles droeg al een nummer.`);
  process.exit(0);
}

const uitkomsten = await rpc('lijn_migratieregister_uit', { p_paren: paren });

for (const r of uitkomsten) {
  const pijl = r.van === null ? '' : `${r.van} → ${r.naar}  `;
  console.log(`  ${pijl}${r.naam}: ${r.uitkomst}`);
}

// ⚠️ Nameten, niet aannemen. Een geweigerde rij komt hierboven netjes terug en
//    zou anders wegvallen tegen de geslaagde rijen ernaast.
const na = await rpc('migratieregister', {});
const klachten = vergelijk(repo, na);

if (klachten.length > 0) {
  console.error(`\nmigratieregister-uitlijnen: ${klachten.length} verschil(len) blijven staan.\n`);
  for (const k of klachten) console.error(`  • ${k}`);
  process.exit(1);
}

const uitgelijnd = uitkomsten.filter((/** @type {{uitkomst: string}} */ r) => r.uitkomst === 'uitgelijnd').length;
console.log(`\nmigratieregister-uitlijnen: ${uitgelijnd} uitgelijnd, repo en project zeggen hetzelfde.`);
