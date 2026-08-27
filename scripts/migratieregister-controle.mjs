#!/usr/bin/env node
/**
 * Lopen `supabase/migrations/` en het echte project nog gelijk? — QS8-122.
 *
 * ⚠️ **Dit is de andere helft van** `migraties:controle`. Die kijkt naar de map
 *    alleen: nummering aaneengesloten, geen duplicaten, rollback-pad in de kop.
 *    Wat hij per definitie niet kan zien, is of het project diezelfde migraties
 *    ook echt heeft. Dat gat stond met zoveel woorden in `/audit` en is precies
 *    waar QS8-122 over gaat.
 *
 * ⚠️ **Waarom dit ertoe doet.** Een lokale stack en een tweede cloudproject
 *    werken allebei door de migraties opnieuw af te spelen op een lege database.
 *    Ontbreekt er één bestand, dan bouwt dat een ánder schema dan productie — en
 *    dan toetst een RLS-suite daar een verzinsel. Groen zonder iets te bewijzen
 *    is erger dan tegen productie draaien.
 *
 * ⚠️ **Zonder credentials slaat hij zichzelf over in plaats van rood te worden.**
 *    Zelfde afspraak als de RLS-suite: de service-role-key hoort niet in CI. Een
 *    controle die in CI omvalt op een ontbrekende sleutel, leert je om rood te
 *    negeren — en dat is duurder dan de controle waard is.
 *
 * Leest het register via de RPC `migratieregister()` (migratie 0072). Die staat
 * alleen voor `service_role` open; `supabase_migrations` zelf zit niet in de API.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vergelijk } from './migratieregister-vergelijk.mjs';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.log(
    'migratieregister-controle: overgeslagen — geen EXPO_PUBLIC_SUPABASE_URL en\n' +
      '  SUPABASE_SERVICE_ROLE_KEY in de omgeving. Dit is de enige controle die\n' +
      '  het échte project nodig heeft; zie docs/DEPLOY.md.',
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

async function uitHetProject() {
  const antwoord = await fetch(`${url}/rest/v1/rpc/migratieregister`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    // ⚠️ Elke externe call heeft een timeout — CLAUDE.md, coderegel 14.
    signal: AbortSignal.timeout(15_000),
  });

  if (!antwoord.ok) {
    throw new Error(
      `Het register lezen lukte niet (${antwoord.status}). Bestaat migratie 0072 ` +
        'al op dit project, en draai je met de service-role-key?',
    );
  }

  return antwoord.json();
}

const repo = uitDeRepo();
const project = await uitHetProject();

const klachten = vergelijk(repo, project);

if (klachten.length === 0) {
  console.log(
    `migratieregister-controle: ${repo.length} migraties, repo en project zeggen hetzelfde.`,
  );
  process.exit(0);
}

console.error(`migratieregister-controle: ${klachten.length} verschil(len).\n`);
for (const k of klachten) console.error(`  • ${k}`);
console.error('\nZie QS8-122 en docs/DEPLOY.md.');
process.exit(1);
