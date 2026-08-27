#!/usr/bin/env node
/**
 * storage-controle — de bevinding van 16-08 over Supabase Storage, omgezet in
 * iets dat afgaat op het moment dat het ertoe doet.
 *
 * `completions.attachment_url` en `chat_messages.attachment_url` bestaan sinds
 * migratie 0001, maar er is geen enkele migratie die een bucket of een
 * `storage.objects`-policy aanmaakt. Nagemeten op 25-08-2026: **nul buckets, nul
 * policies** — in productie én in de migraties.
 *
 * ⚠️ **Er valt vandaag dus niets te beveiligen, en dat is precies het probleem.**
 *    De bevinding zegt het zelf: "op de dag dat de eerste upload gebouwd wordt is
 *    het een open bucket tenzij iemand eraan denkt." De reparatie is daarom geen
 *    bucket met policies — dat zou vandaag ongebruikte infrastructuur zijn, en
 *    een bucket zonder schrijver is precies de dode keten waar
 *    `npm run keten:controle` sinds vandaag voor bestaat. De reparatie is dat
 *    "tenzij iemand eraan denkt" wordt vervangen door een rode build.
 *
 * ⚠️ **Twee controles, want er zijn twee volgordes waarin dit misgaat.**
 *
 *   1. **Een bucket zonder policies.** Wie een bucket aanmaakt en de policies
 *      vergeet, heeft een open emmer. Supabase' eigen standaard is dat
 *      `storage.objects` RLS aan heeft en er zonder policy niets mag — maar een
 *      bucket met `public = true` omzeilt dat volledig, en dat is één woord in
 *      een insert.
 *   2. **Een upload zonder bucket.** Dit is de volgorde die de bevinding
 *      beschrijft: eerst wordt de uploadknop gebouwd, en de bucket ontstaat
 *      daarna ergens in een dashboard — buiten de migraties om, en dus zonder dat
 *      `supabase/migrations/` het schema van productie nog kan opbouwen. Deze
 *      controle wordt rood zodra er code is die uploadt naar een bucket die geen
 *      enkele migratie aanmaakt.
 *
 * ⚠️ **Wat hij niet kan zien.** Een bucket die met de hand in het Supabase-
 *    dashboard is aangemaakt en waar geen code naar verwijst, staat nergens in
 *    deze repository en is hier dus onzichtbaar. Dat is dezelfde blinde vlek als
 *    bij het migratieregister vóór QS8-122, en de reden dat `docs/DEPLOY.md`
 *    voorschrijft dat buckets via een migratie gaan. Deze controle vangt de
 *    tweede helft: zodra er iets naar zo'n bucket schrijft, gaat hij af.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Mappen waarin een upload als "productie" telt. Tests en scripts niet. */
const PRODUCTIEMAPPEN = ['src', 'app', 'supabase/functions'];

function bronbestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    if (naam === 'node_modules' || naam === '.git') continue;
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) bronbestanden(pad, uit);
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(pad);
  }
  return uit;
}

/**
 * De buckets die de migraties aanmaken.
 *
 * Twee vormen, want Supabase kent er twee: een rechtstreekse insert in
 * `storage.buckets` en de helper `storage.create_bucket()`.
 */
export function bucketsIn(sql) {
  const namen = new Map();

  for (const m of sql.matchAll(
    /insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)'([\s\S]*?);/gi,
  )) {
    namen.set(m[1], { openbaar: /\btrue\b/i.test(m[2]) });
  }

  for (const m of sql.matchAll(/storage\.create_bucket\s*\(\s*'([^']+)'/gi)) {
    if (!namen.has(m[1])) namen.set(m[1], { openbaar: false });
  }

  return namen;
}

/** De buckets die in een policy op `storage.objects` genoemd worden. */
export function policyBucketsIn(sql) {
  const genoemd = new Set();

  for (const m of sql.matchAll(/create\s+policy[\s\S]*?on\s+storage\.objects[\s\S]*?;/gi)) {
    for (const lit of m[0].matchAll(/'([^']+)'/g)) genoemd.add(lit[1]);
  }

  return genoemd;
}

/**
 * De buckets waar productiecode naartoe schrijft of uit leest.
 *
 * ⚠️ `.storage.from('x')` is de enige ingang van de Supabase-client naar
 *    Storage. Een variabele in plaats van een letterlijke string ontsnapt hieraan
 *    — daarom staat in `docs/DEPLOY.md` dat een bucketnaam een constante is en
 *    geen berekening.
 */
export function uploadsIn(bron) {
  const namen = new Set();
  for (const m of bron.matchAll(/\.storage\s*\.\s*from\(\s*['"`]([^'"`]+)['"`]/g)) {
    namen.add(m[1]);
  }
  return namen;
}

export function controleer({ sql, prodBron }) {
  const buckets = bucketsIn(sql);
  const metPolicy = policyBucketsIn(sql);
  const gebruikt = uploadsIn(prodBron);

  const zonderPolicy = [...buckets.keys()].filter((naam) => !metPolicy.has(naam));
  const openbaar = [...buckets.entries()].filter(([, b]) => b.openbaar).map(([naam]) => naam);
  const zonderBucket = [...gebruikt].filter((naam) => !buckets.has(naam));

  return { buckets, zonderPolicy, openbaar, zonderBucket };
}

function hoofd() {
  const migMap = join(WORTEL, 'supabase/migrations');
  const sql = readdirSync(migMap)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((n) => readFileSync(join(migMap, n), 'utf8'))
    .join('\n');

  const prodBron = PRODUCTIEMAPPEN.flatMap((m) => bronbestanden(join(WORTEL, m)))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');

  const { buckets, zonderPolicy, openbaar, zonderBucket } = controleer({ sql, prodBron });

  if (zonderPolicy.length === 0 && openbaar.length === 0 && zonderBucket.length === 0) {
    console.log(
      buckets.size === 0
        ? 'storage-controle: geen buckets en geen uploads — er valt hier nog niets open te staan.'
        : `storage-controle: ${buckets.size} bucket(s), allemaal met een policy op storage.objects.`,
    );
    return 0;
  }

  for (const naam of zonderPolicy) {
    console.error(
      `✗ bucket '${naam}' wordt aangemaakt, maar geen enkele policy op storage.objects noemt hem. ` +
        'Zonder policy mag niemand erbij — of, als de bucket openbaar is, iedereen.',
    );
  }
  for (const naam of openbaar) {
    console.error(
      `✗ bucket '${naam}' staat op public = true. Dan is elk bestand erin met de URL alleen te ` +
        'lezen, buiten RLS om. Voor bijlagen bij voltooiingen en chatberichten is dat een lek: ' +
        'domeinregel 7 gaat over wie wát ziet, en een openbare bucket kent dat onderscheid niet.',
    );
  }
  for (const naam of zonderBucket) {
    console.error(
      `✗ productiecode gebruikt bucket '${naam}', maar geen enkele migratie maakt hem aan. ` +
        'Bestaat hij toch, dan is hij met de hand gemaakt — en dan kan supabase/migrations/ het ' +
        'schema van productie niet meer opbouwen, en weet niemand welke policies erop staan.',
    );
  }

  console.error(
    '\nEen bucket hoort in een migratie te staan, met policies op storage.objects erbij. ' +
      'Zie docs/DEPLOY.md en de bevinding van 16-08 in docs/ENGINEER-REVIEW.md.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
