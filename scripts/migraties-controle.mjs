#!/usr/bin/env node
/**
 * De migratiemap moet het schema kunnen opbouwen — QS8-122.
 *
 * ⚠️ **Waarom dit bestaat.** Op 23-08 bleek dat `0057` t/m `0061` wél waren
 *    toegepast op het project maar níét als bestand in de repo stonden. Op 24-08
 *    bleek datzelfde gat er nog steeds te zijn, en dat er bovendien een hele
 *    branch met eenentwintig commits buiten `main` stond (WERKVOORRAAD §2a).
 *    Beide keren is het met de hand gevonden, allebei bij toeval, en de tweede
 *    keer pas nadat er een issue op vastliep.
 *
 *    Een gat in de nummering is een patroon. Dat hoort een script te vinden en
 *    geen mens — de eigen regel uit `CLAUDE.md`: *schrijf je iets nieuws op,
 *    vraag dan eerst of het een controle kan worden in plaats van een zin.*
 *
 * ⚠️ **Waarom een gat erger is dan het lijkt.** Zowel een lokale Supabase-stack
 *    als een tweede cloudproject werkt door de migraties opnieuw af te spelen op
 *    een lege database. Ontbreekt er één, dan komt daar een schema uit dat niet
 *    gelijk is aan productie — en dan toetst de RLS-suite een verzinsel. Groen
 *    zonder iets te bewijzen is erger dan tegen productie draaien.
 *
 * ⚠️ **Deze controle is vandaag rood, en dat is de bedoeling.** `0057` t/m
 *    `0061` staan op de branch van QS8-131 en niet op `main`. Hij wordt groen op
 *    het moment dat die branch landt. Zet hem niet uit; dat is precies het gat
 *    dat hij moet bewaken.
 *
 * Wat hij níét kan: toetsen of de repo gelijkloopt met
 * `supabase_migrations.schema_migrations` op het echte project. Dat vraagt een
 * service-role-key, en die hoort niet in een controle die op elke machine draait
 * (beveiligingsregel 4). Dat is de tweede helft van QS8-122 en staat daar.
 *
 * Draaien: `npm run migraties:controle`. Hoort mee in `/audit`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAP = new URL('../supabase/migrations/', import.meta.url).pathname;

/**
 * ⚠️ Een letter achter het nummer is een deelmigratie en telt mee onder dat
 *    nummer. `0052a` is de tweede helft van 0052; de letter houdt de map in
 *    toepassingsvolgorde omdat de echte versie in `schema_migrations` een
 *    tijdstempel is. Zie de kop van `0052a_triggerfuncties_bewaking.sql`.
 */
const NAAM = /^(\d{4})([a-z]?)_[a-z0-9_]+\.sql$/;

/**
 * ⚠️ Bewust ruim. `ROLLBACK-PAD:` is de vorm die `CLAUDE.md` noemt, maar 0062
 *    t/m 0068 schrijven `ROLLBACK:` en 0001 schrijft
 *    `ROLLBACK-PAD (in deze volgorde, ...):`. Alle drie dragen het pad.
 *
 *    Een controle die op de spelling valt in plaats van op de inhoud, kost je
 *    drie valse meldingen en leert je vervolgens om hem te negeren. Het woord is
 *    de markering, niet de leestekens erachter.
 */
const ROLLBACK = /^--\s*ROLLBACK(-PAD)?\b/im;

const fouten = [];
const bestanden = readdirSync(MAP).filter((n) => n.endsWith('.sql')).sort();

// ---------------------------------------------------------------------------
// 1. Elke bestandsnaam is te lezen
// ---------------------------------------------------------------------------

const gezien = new Map();

for (const naam of bestanden) {
  const m = NAAM.exec(naam);
  if (m === null) {
    fouten.push(`Onleesbare bestandsnaam: ${naam} — verwacht NNNN[a-z]_kleine_letters.sql`);
    continue;
  }

  const nummer = Number(m[1]);
  const deel = m[2];

  const eerder = gezien.get(`${nummer}${deel}`);
  if (eerder !== undefined) {
    fouten.push(`Twee migraties met hetzelfde nummer: ${eerder} en ${naam}`);
  }
  gezien.set(`${nummer}${deel}`, naam);
}

// ---------------------------------------------------------------------------
// 2. Geen gaten in de reeks
// ---------------------------------------------------------------------------

const nummers = [...new Set([...gezien.keys()].map((k) => Number.parseInt(k, 10)))].sort(
  (a, b) => a - b,
);

if (nummers.length > 0) {
  const eerste = nummers[0];
  const laatste = nummers[nummers.length - 1];
  const gaten = [];

  for (let n = eerste; n <= laatste; n += 1) {
    if (!nummers.includes(n)) gaten.push(String(n).padStart(4, '0'));
  }

  if (gaten.length > 0) {
    fouten.push(
      `Gat in de nummering: ${gaten.join(', ')} ontbreken tussen ` +
        `${String(eerste).padStart(4, '0')} en ${String(laatste).padStart(4, '0')}. ` +
        'De map kan het schema dus niet opbouwen.',
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Elke migratie draagt een rollback-pad (onwrikbare regel 20)
// ---------------------------------------------------------------------------

for (const naam of bestanden) {
  if (!NAAM.test(naam)) continue;

  // Alleen het commentaarblok bovenaan. Staat het pad verderop tussen de SQL,
  // dan is het geen kop maar een losse opmerking.
  const regels = readFileSync(join(MAP, naam), 'utf8').split('\n');
  const kop = [];
  for (const regel of regels) {
    if (regel.trim() === '' || regel.trimStart().startsWith('--')) kop.push(regel);
    else break;
  }

  if (!ROLLBACK.test(kop.join('\n'))) {
    fouten.push(`Geen rollback-pad in de kop van ${naam} (onwrikbare regel 20).`);
  }
}

// ---------------------------------------------------------------------------

if (fouten.length === 0) {
  console.log(
    `migraties-controle: ${bestanden.length} migraties, aaneengesloten en elk met een rollback-pad.`,
  );
  process.exit(0);
}

console.error('migraties-controle: de migratiemap klopt niet.\n');
for (const f of fouten) console.error(`  - ${f}`);
console.error(
  '\nDe migratiebestanden zijn de enige manier om dit schema ergens anders op te\n' +
    'bouwen — een lokale stack, een tweede project, een herstel. Ontbreekt er één,\n' +
    'dan toetst de RLS-suite daar een ander schema dan productie. Zie QS8-122, en\n' +
    'voor het gat 0057–0061 zie QS8-131 en WERKVOORRAAD §2a.',
);
process.exit(1);
