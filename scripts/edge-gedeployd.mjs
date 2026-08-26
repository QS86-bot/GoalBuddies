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
import { execFileSync } from 'node:child_process';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
 * Haalt commentaar weg vóór er naar imports gezocht wordt.
 *
 * ⚠️ Alleen blokcommentaar en regels die volledig commentaar zijn. Een `//`
 *    midden op een regel blijft staan, want dat zit ook in `https://` — en een
 *    URL doormidden knippen zou nieuwe rommel opleveren in plaats van minder.
 *
 * ⚠️ Dit bestaat omdat de bestanden in dit project veel commentaar dragen waarin
 *    het woord `import` gewoon voorkomt. Zonder deze stap telt een zin over een
 *    import mee als een import.
 */
export function zonderCommentaar(inhoud) {
  return inhoud
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((regel) => !/^\s*\/\//.test(regel))
    .join('\n');
}

/** Is dit een import die bij het bundelen helemaal verdwijnt? */
function isTypeOnly(clausule) {
  const c = clausule.trim();

  // `import type { X } from …` en `export type { X } from …`
  if (/^type\b/.test(c)) return true;

  // `import { type A, type B } from …` — alle specifiers type-only, dus ook weg.
  const accolades = /^\{([\s\S]*)\}$/.exec(c);
  if (!accolades) return false;

  const specifiers = accolades[1]
    .split(',')
    .map((stuk) => stuk.trim())
    .filter((stuk) => stuk !== '');

  return specifiers.length > 0 && specifiers.every((stuk) => /^type\s/.test(stuk));
}

/**
 * De relatieve modules die een bestand **in de bundel** trekt.
 *
 * ⚠️ **`import type` telt niet mee, en dat was een fout in de eerste versie.**
 *    Een type-only import wordt bij het bundelen volledig geëlimineerd; er
 *    blijft geen runtime-module van over. De eerste versie van deze controle
 *    matchte hem wél, en meldde daardoor dat `doelcoach` `_shared/time/types.ts`
 *    miste — terwijl die deploy gewoon klopte.
 *
 *    Waarom `rollover` en `notificaties` daar niet op stukliepen: die bereiken
 *    `types.ts` óók via `cycle.ts`, en dat bestand doet
 *    `import { GRACE_HOURS } from './types.ts'`. Eén waarde-import is genoeg om
 *    de module in de bundel te houden.
 *
 *    Dat verschil is precies waarom deze functie de hele graaf op wáárde-imports
 *    moet lopen en niet op tekstuele treffers. Gevonden op 26-08-2026, bij de
 *    eerste echte run van deze controle.
 *
 * ⚠️ Een side-effect-import (`import './x.ts';`) telt wél mee: die heeft geen
 *    specifiers maar blijft in de bundel staan. Vandaag komt hij in deze boom
 *    niet voor; hem overslaan zou later een module opleveren die de bundel wél
 *    draagt en de repo niet lijkt te kennen — een alarm zonder oorzaak.
 *
 * ⚠️ Kale specifiers (`jsr:@supabase/supabase-js`) blijven buiten beeld. De
 *    vraag die deze controle stelt is of ónze bestanden kloppen.
 */
export function waardeImports(inhoud) {
  const schoon = zonderCommentaar(inhoud);
  const uit = [];

  // `import … from '…'` en `export … from '…'`, ook over meerdere regels. De
  // clausule ertussen bevat nooit een quote of puntkomma.
  for (const treffer of schoon.matchAll(/\b(?:import|export)\b([^'";]*?)\bfrom\s*'(\.[^']+)'/g)) {
    if (!isTypeOnly(treffer[1])) uit.push(treffer[2]);
  }

  // `import '…';` — alleen voor het effect, geen specifiers.
  for (const treffer of schoon.matchAll(/\bimport\s*'(\.[^']+)'/g)) {
    uit.push(treffer[1]);
  }

  return uit;
}

/**
 * Alle modules die één functie nodig heeft, transitief — en alleen de modules
 * die het bundelen overleven.
 *
 * ⚠️ Neemt een `lees`-functie in plaats van zelf de schijf op te gaan, zodat de
 *    test hem elke vorm kan voeren zonder bestanden aan te maken. Dat is
 *    dezelfde reden als bij `migratieregister-plan.mjs`.
 */
export function modulesVoor(lees, start) {
  const gezien = new Set();
  const wachtrij = [start];

  while (wachtrij.length > 0) {
    const pad = wachtrij.shift();
    if (gezien.has(pad)) continue;

    gezien.add(pad);

    const inhoud = lees(pad);
    if (inhoud === null) {
      // Een import die nergens heen wijst. Hier niet stilzwijgend overslaan:
      // dat is precies het soort gat dat deze controle moet vinden.
      continue;
    }

    for (const specifier of waardeImports(inhoud)) {
      wachtrij.push(normalize(join(dirname(pad), specifier)).replace(/\\/g, '/'));
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

/**
 * Wat er te zeggen valt over een werkboom die niet schoon is.
 *
 * ⚠️ **Dit is de belangrijkste waarschuwing van het hele script, en hij ontbrak
 *    in de eerste versie.** De controle vergelijkt de deploy met de bestanden
 *    zoals ze op schijf liggen — niet met een commit. Ligt er ongecommit werk
 *    onder `supabase/functions/`, dan betekent groen alleen "gelijk aan wat er
 *    bij mij op schijf staat" en niet "gelijk aan wat er in de repo staat".
 *
 *    Dat is geen theoretisch geval. De drift van 26-08-2026 ontstond doordat er
 *    vanuit een werkboom gedeployd werd, en bij de eerste echte run van deze
 *    controle was diezelfde werkboom nog steeds niet schoon — dus stond er
 *    groen bij twee functies die code draaiden die op `main` niet bestond.
 *    Groen zonder deze regel eronder is precies het verkeerde antwoord.
 *
 * Geeft `null` als er niets aan de hand is.
 */
export function werkboomWaarschuwing(gitStatus) {
  const regels = gitStatus
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel !== '');

  if (regels.length === 0) return null;

  return [
    `⚠️ ${regels.length} ongecommitte wijziging(en) onder supabase/functions/.`,
    '   Groen betekent hieronder alleen: gelijk aan wat er bij jou op schijf',
    '   staat. Niet: gelijk aan wat er in de repo staat. Commit eerst, en',
    '   deploy nooit vanaf een werkboom — dat was de fout van 26-08-2026.',
  ].join('\n');
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

/**
 * De ongecommitte wijzigingen onder `supabase/functions/`, of een lege string.
 *
 * ⚠️ Geeft leeg terug als git er niet is of dit geen repo is. Dat is de
 *    conservatieve kant op: liever geen waarschuwing dan een script dat omvalt
 *    op een machine zonder git.
 */
function gitStatusVanFuncties() {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', 'supabase/functions'], {
      cwd: WORTEL,
      encoding: 'utf8',
      timeout: 10_000,
    });
  } catch {
    return '';
  }
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

  console.log(`  · project    ${ref}`);

  // ⚠️ Vóór de vergelijking en niet erna. Wie de uitkomst leest zonder deze
  //    regel gezien te hebben, leest hem verkeerd.
  const waarschuwing = werkboomWaarschuwing(gitStatusVanFuncties());
  console.log(waarschuwing === null ? '  · werkboom   schoon\n' : `\n${waarschuwing}\n`);

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
//
// ⚠️ Via `pathToFileURL` en niet met `endsWith`, want dat is het huispatroon in
//    vijf andere controlescripts. Een naamvergelijking zou bovendien ook aanslaan
//    op een bestand dat toevallig zo eindigt.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((fout) => {
    console.error(`  ✗ ${fout instanceof Error ? fout.message : 'onbekende fout'}`);
    process.exit(1);
  });
}
