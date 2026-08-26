#!/usr/bin/env node
/**
 * Vergelijkt wat er in de Edge Functions **draait** met wat er in de repo staat.
 *
 * ⚠️ **Waarom dit bestaat.** Op 26-08-2026 bleek dat alle drie de functies
 *    gedeployd waren vanuit een lokale werkmap, en dat de gedeployde
 *    `notificaties` een module importeerde — `_shared/sentry/index.ts` — die op
 *    `main` niet bestond en op geen enkele remote branch stond. Er draaide dus
 *    productiecode die niemand kon uitchecken, en die bovendien de
 *    schoonmaaklaag miste waar QS8-24 criterium 3 om draait.
 *
 *    Dat was alleen te vinden door de gedeployde broncode met de hand op te
 *    vragen. Niets in dit project vergelijkt die twee, en daarom kon het weken
 *    zo staan zonder dat iets rood werd. Dezelfde vorm als het migratieregister
 *    vóór QS8-122: twee waarheden, en geen script dat er iets van zegt.
 *
 * ⚠️ **Wat dit script wél en niet bewijst.** Het vergelijkt de **modulelijst**:
 *    welke bestanden zitten er in de gedeployde bundel, en welke zou de repo
 *    er in stoppen. Dat vindt een verdwenen module, een module die de repo niet
 *    kent, en een functie die vanaf een andere boom is gedeployd.
 *
 *    Het vergelijkt **niet** de inhoud regel voor regel. Een bundel die dezelfde
 *    bestandsnamen draagt met andere inhoud komt hier groen doorheen. Dat is een
 *    bewuste grens: de bundel is een ESZip en de inhoud is er niet betrouwbaar
 *    uit te lezen zonder een parser die zelf onder test zou moeten staan.
 *    Zie `docs/DEPLOY.md` voor wat er dan wél nodig is.
 *
 * ⚠️ **Kan de bundel niet gelezen worden, dan zegt hij dat** — en meldt hij
 *    níét dat alles afwijkt. Een controle die bij een onbekend formaat "alles
 *    stuk" roept, leer je binnen een week te negeren.
 *
 * ⚠️ Vraagt een personal access token, niet de service-role-key. Zelfde als
 *    `auth-urls.mjs`: de Management API is een ander systeem dan je project.
 *    Maak er een op https://supabase.com/dashboard/account/tokens en zet hem in
 *    `.env` als `SUPABASE_ACCESS_TOKEN`.
 *
 * Gebruik:
 *   npm run edge:gedeployd
 */
import { Buffer } from 'node:buffer';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com';
const TIMEOUT_MS = 30_000;

/** De functies die dit project deployt. */
export const FUNCTIES = ['rollover', 'notificaties', 'doelcoach'];

// ---------------------------------------------------------------------------
// De pure kern — dit deel staat onder test
// ---------------------------------------------------------------------------

/**
 * Alle modules die één functie nodig heeft, transitief.
 *
 * ⚠️ Neemt een `lees`-functie in plaats van zelf de schijf op te gaan, zodat de
 *    test hem elke vorm kan voeren zonder bestanden aan te maken. Dat is
 *    dezelfde reden als bij `migratieregister-plan.mjs`.
 *
 * ⚠️ Alleen relatieve imports. `jsr:@supabase/supabase-js` en andere kale
 *    specifiers komen uit het netwerk en horen niet in deze vergelijking thuis:
 *    de vraag is of ónze bestanden kloppen.
 */
export function modulesVoor(lees, start) {
  const gezien = new Set();
  const wachtrij = [start];

  while (wachtrij.length > 0) {
    const pad = wachtrij.shift();
    if (gezien.has(pad)) continue;

    const inhoud = lees(pad);
    if (inhoud === null) {
      // Een import die nergens heen wijst. Hier niet stilzwijgend overslaan:
      // dat is precies het soort gat dat deze controle moet vinden.
      gezien.add(pad);
      continue;
    }

    gezien.add(pad);

    for (const treffer of inhoud.matchAll(/from\s+'(\.[^']+)'/g)) {
      wachtrij.push(normalize(join(dirname(pad), treffer[1])).replace(/\\/g, '/'));
    }
  }

  return [...gezien].sort();
}

/**
 * De modulepaden die in een gedeployde bundel voorkomen.
 *
 * ⚠️ Zoekt naar paden onder `functions/`, want zo staan ze in de bundel: als
 *    `file:///…/source/supabase/functions/notificaties/index.ts`. Het stuk vóór
 *    `functions/` verschilt per deploy (er zit een tijdelijke map in) en is
 *    daarom geen onderdeel van de vergelijking.
 */
export function modulesInBundel(tekst) {
  const gevonden = new Set();

  for (const treffer of tekst.matchAll(/functions\/[A-Za-z0-9_.\-/]+\.ts/g)) {
    // `normalize` haalt een eventuele `./` of dubbele slash weg.
    gevonden.add(normalize(treffer[0]).replace(/\\/g, '/'));
  }

  return [...gevonden].sort();
}

/**
 * Wat er tussen de twee lijsten scheelt.
 *
 * `ontbreekt` — de repo verwacht hem, de bundel heeft hem niet.
 * `onbekend`  — de bundel draagt hem, de repo kent hem niet. **Dit is de rij die
 *                op 26-08 gevonden had moeten worden.**
 */
export function vergelijk(verwacht, gevonden) {
  const inBundel = new Set(gevonden);
  const inRepo = new Set(verwacht);

  return {
    ontbreekt: verwacht.filter((p) => !inBundel.has(p)),
    onbekend: gevonden.filter((p) => !inRepo.has(p)),
  };
}

/**
 * Is deze bundel überhaupt te lezen?
 *
 * ⚠️ Los van `vergelijk()` en met opzet. Een bundel waar geen énkel modulepad in
 *    te vinden is, is geen bundel die overal van afwijkt — het is een bundel die
 *    we niet begrijpen. Die twee moeten verschillende meldingen geven, anders
 *    kost het eerste onbekende formaat je het vertrouwen in de hele controle.
 */
export function leesbaar(gevonden) {
  return gevonden.length > 0;
}

// ---------------------------------------------------------------------------
// De laag eromheen — netwerk en schijf
// ---------------------------------------------------------------------------

/** Leest `.env` zonder dependency; bestaande omgevingsvariabelen winnen. */
function leesEnv() {
  const uit = { ...process.env };
  try {
    for (const regel of readFileSync(join(WORTEL, '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(regel);
      if (m && !uit[m[1]]) uit[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Geen .env is prima zolang de variabelen in de omgeving staan.
  }
  return uit;
}

/**
 * Maakt er tekst van, ook als de bundel ingepakt is.
 *
 * ⚠️ Drie pogingen en dan opgeven. ESZip zelf is niet ingepakt, maar de API mag
 *    dat onderweg wel doen en `fetch` pakt niet alles uit. Lukt geen van
 *    drieën, dan zegt `leesbaar()` dat het formaat onbekend is.
 */
function naarTekst(buffer) {
  const pogingen = [
    () => buffer,
    () => gunzipSync(buffer),
    () => brotliDecompressSync(buffer),
    () => inflateSync(buffer),
  ];

  for (const poging of pogingen) {
    try {
      const tekst = poging().toString('utf8');
      if (modulesInBundel(tekst).length > 0) return tekst;
    } catch {
      // Volgende poging.
    }
  }

  return buffer.toString('utf8');
}

async function haalBundel(ref, token, slug) {
  const antwoord = await fetch(`${API}/v1/projects/${ref}/functions/${slug}/body`, {
    headers: { Authorization: `Bearer ${token}` },
    // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!antwoord.ok) {
    throw new Error(
      `GET functions/${slug}/body gaf HTTP ${antwoord.status}: ${(await antwoord.text()).slice(0, 300)}`,
    );
  }

  return naarTekst(Buffer.from(await antwoord.arrayBuffer()));
}

function leesUitRepo(pad) {
  try {
    return readFileSync(join(WORTEL, 'supabase', pad), 'utf8');
  } catch {
    return null;
  }
}

async function main() {
  const env = leesEnv();
  const token = env['SUPABASE_ACCESS_TOKEN'];
  const ref = env['SUPABASE_PROJECT_REF'] ?? 'wehgocadxehottiiyvsc';

  if (!token) {
    console.error(
      [
        'SUPABASE_ACCESS_TOKEN ontbreekt.',
        '',
        '⚠️ Dit is niet de service-role-key. De Management API vraagt een personal',
        '   access token: https://supabase.com/dashboard/account/tokens',
        '',
        'Zet hem daarna in .env als SUPABASE_ACCESS_TOKEN.',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log(`  · project    ${ref}\n`);

  let rood = 0;
  let onleesbaar = 0;

  for (const slug of FUNCTIES) {
    const verwacht = modulesVoor(leesUitRepo, `functions/${slug}/index.ts`);
    const tekst = await haalBundel(ref, token, slug);
    const gevonden = modulesInBundel(tekst);

    if (!leesbaar(gevonden)) {
      console.log(`  ? ${slug} — de bundel is niet te lezen; formaat onbekend`);
      onleesbaar += 1;
      continue;
    }

    const { ontbreekt, onbekend } = vergelijk(verwacht, gevonden);

    if (ontbreekt.length === 0 && onbekend.length === 0) {
      console.log(`  ✓ ${slug} — ${verwacht.length} modules, gelijk aan de repo`);
      continue;
    }

    rood += 1;
    console.log(`  ✗ ${slug}`);
    for (const p of ontbreekt) console.log(`      ontbreekt in de deploy : ${p}`);
    for (const p of onbekend) console.log(`      kent de repo niet      : ${p}`);
  }

  console.log('');

  if (onleesbaar === FUNCTIES.length) {
    console.error(
      [
        'Geen enkele bundel was te lezen. Dat is geen afwijking maar een onbekend',
        'formaat — waarschijnlijk is de ESZip-vorm veranderd. Deze controle zegt',
        'dan niets; repareer hem voordat je hem vertrouwt.',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (rood > 0) {
    console.error(
      [
        `edge-gedeployd: ${rood} van de ${FUNCTIES.length} functies draait iets anders dan de repo.`,
        '',
        'Deploy vanaf een gecommitte tak: `npm run edge:sync && npx supabase',
        'functions deploy ' + FUNCTIES.join(' ') + '`.',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log('edge-gedeployd: wat er draait komt overeen met wat er in de repo staat.');
  process.exit(0);
}

// ⚠️ Alleen draaien als dit bestand het startpunt is. Wordt hij geïmporteerd —
//    door de test — dan mag er geen netwerkaanroep gebeuren.
if (process.argv[1] && process.argv[1].endsWith('edge-gedeployd.mjs')) {
  main().catch((fout) => {
    console.error(`  ✗ ${fout instanceof Error ? fout.message : 'onbekende fout'}`);
    process.exit(1);
  });
}
