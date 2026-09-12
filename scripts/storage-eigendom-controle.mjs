#!/usr/bin/env node
/**
 * Geen kale `create index` op een tabel die we niet bezitten — QS8-439.
 *
 * ⚠️ **Waarom dit een controle is en geen zin in `DEPLOY.md`.** Er stónd al een
 *    zin: *"een migratie die `storage.objects` aanraakt kun je vanuit een
 *    bouwsessie niet toepassen"*. Die zin was twee dingen tegelijk — te ruim
 *    (policies en triggers gaan wél) en niet afdwingbaar — en het gevolg was dat
 *    `0222` op 09-09-2026 omviel en productie **drie dagen** op `0221` bleef
 *    staan terwijl de map doorliep naar `0255`. 📏 34 migraties achterstand,
 *    veroorzaakt door vier regels.
 *
 * ⚠️ **De vorm van de fout is die van QS8-417:** de instanties opruimen en het
 *    mechanisme laten staan. Zonder deze controle is de volgende opslagmigratie
 *    met een index precies dezelfde drie dagen, en niets wordt er rood van —
 *    de migratie is lokaal groen, want lokaal bezitten we `storage.objects` wél.
 *    **Dat is de kern: dit is een fout die alleen op productie bestaat.**
 *
 * 📏 **Gemeten op 12-09-2026**, per handeling apart, elk in een eigen
 *    terugrollende transactie tegen het echte project:
 *
 *      create policy  op storage.objects   -> gaat
 *      create trigger op storage.objects   -> gaat
 *      create index   op storage.objects   -> 42501: must be owner of table objects
 *
 *    Alleen de index. Vandaar dat deze controle smal is en niet élke aanraking
 *    van `storage.objects` meldt — een controle die te veel meldt, leer je uit
 *    te zetten.
 *
 * ⚠️ **De grens verschuift, en dat is opgeschreven.** Op 09-09-2026 gaven
 *    policies en triggers dezelfde fout; Supabase heeft de rechten daarna
 *    verruimd. Wordt ooit ook `create index` toegestaan, dan is deze controle
 *    overbodig en hoort hij weg — niet uitgezet, weg, met de meting erbij.
 *
 * Draaien: `npm run storage-eigendom:controle`. Hoort mee in `npm run poort`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIES = join(WORTEL, 'supabase', 'migrations');

/** Tabellen die dit project niet bezit; een index erop vraagt eigendom. */
export const VREEMDE_TABELLEN = ['storage.objects', 'storage.buckets'];

/**
 * Commentaar weghalen, zodat een rollback-pad in de kop niet als code telt.
 *
 * ⚠️ **De knip is zelf een grendel** — de les van QS8-412, waar een knip op
 *    `\/\/[^\n]*` alles opat ná de dubbele schuine streep van een URL. Hier is
 *    het `--` tot regeleinde, en een `--` binnen een tekstletterlijke waarde zou
 *    ten onrechte knippen. Dat is hier veilig omdat we uitsluitend naar
 *    `create index` zoeken en die vorm geen vrije tekst draagt; staat er ooit
 *    een indexnaam met `--` erin, dan is dát het moment om dit te verfijnen.
 */
export function zonderCommentaar(sql) {
  return sql.replace(/--[^\n]*/g, '');
}

/**
 * Zit deze positie binnen een `do $$ … end $$;`-blok?
 *
 * ⚠️ Bewust op de dollarquote en niet op `do` alleen: `do` komt ook als woord in
 *    gewone SQL voor, en een blok herkennen aan zijn quote is de eigenschap die
 *    telt.
 */
export function binnenDollarBlok(sql, positie) {
  const quotes = [...sql.matchAll(/\$\$/g)].map((m) => m.index);
  const ervoor = quotes.filter((i) => i < positie).length;
  return ervoor % 2 === 1;
}

/**
 * Elke `create index` op een vreemde tabel die **niet** in een dollarblok staat.
 *
 * Geeft `{ regelnummer, index, tabel }` per treffer.
 */
export function kaleIndexen(sql) {
  const schoon = zonderCommentaar(sql);
  const uit = [];
  const patroon = /create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+([a-z_]+\.[a-z_]+)/gi;

  for (const m of schoon.matchAll(patroon)) {
    const tabel = m[2].toLowerCase();
    if (!VREEMDE_TABELLEN.includes(tabel)) continue;
    if (binnenDollarBlok(schoon, m.index)) continue;
    uit.push({
      regelnummer: schoon.slice(0, m.index).split('\n').length,
      index: m[1],
      tabel,
    });
  }
  return uit;
}

export function bevindingen() {
  const uit = [];
  for (const naam of readdirSync(MIGRATIES).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIES, naam), 'utf8');
    for (const treffer of kaleIndexen(sql)) uit.push({ naam, ...treffer });
  }
  return uit;
}

function main() {
  const gevonden = bevindingen();

  if (gevonden.length === 0) {
    console.log('storage-eigendom-controle: geen kale index op een tabel die we niet bezitten.');
    process.exit(0);
  }

  console.error('storage-eigendom-controle: een index op een vreemde tabel stopt de reeks op productie.\n');
  for (const { naam, regelnummer, index, tabel } of gevonden) {
    console.error(`  - supabase/migrations/${naam}:${regelnummer}  ${index} op ${tabel}`);
  }
  console.error(
    '\n`storage.objects` is eigendom van `supabase_storage_admin`. Alles wat dit\n' +
      'project heeft draait als `postgres`, en die is geen lid van die rol — dus\n' +
      'een `create index` geeft daar `42501: must be owner of table objects` en de\n' +
      'hele migratiereeks stopt erop. Lokaal merk je er niets van: daar bezitten we\n' +
      'de tabel wel. 📏 Zo stond productie op 09-09-2026 stil op `0221` terwijl de\n' +
      'map doorliep naar `0255` — 34 migraties, door vier regels.\n' +
      '\nDe vorm die wél klopt (zie 0222, 0228, 0233, 0250):\n' +
      '\n  do $$\n  begin\n    create index if not exists <naam>\n      on storage.objects (…);\n' +
      '  exception when insufficient_privilege then\n' +
      "    raise notice '<naam> overgeslagen (42501) — geen eigenaar van storage.objects.';\n" +
      '  end $$;\n' +
      '\nDan legt hetzelfde bestand de index lokaal wél aan en slaat hij hem op\n' +
      'Supabase hoorbaar over. Zie docs/decisions/2026-09-12-een-index-op-een-tabel-die-niet-van-ons-is.md.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
