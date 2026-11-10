#!/usr/bin/env node
/**
 * Bewaakt dat geen twee tracked bestanden alleen in hoofdletters verschillen — QS8-678.
 *
 * ⚠️⚠️ **Waarom dit een eigen controle is.** `src/shared/ui` droeg drie paren
 *    (component in PascalCase, logica in lowercase) waarvan de naam-stam alleen
 *    in hoofdletters verschilde. Op Linux, waar CI draait, zijn het losse
 *    bestanden en is alles groen. Op een hoofdletterongevoelig filesystem
 *    (Windows, standaard-macOS) resolvet TypeScript `./Taakbalk` naar
 *    `taakbalk.ts` en geeft `npm run typecheck` TS1149/TS1261/TS2305/TS2724.
 *    📏 Gemeten op 10-11-2026: 12 fouten, allemaal uit die drie paren, en geen
 *    enkele andere controle dekte de klasse.
 *
 * ⚠️ **De bron is `git ls-files` en geen wandeling over schijf.** Een
 *    hoofdletterongevoelig filesystem verbergt precies de botsing waar het om
 *    gaat: wie daar loopt ziet twee namen niet naast elkaar. De index kent ze
 *    allebei.
 *
 * Twee gevallen, en beide zijn een fout:
 *   - **exacte padbotsing** (`A/Foo.ts` en `a/foo.ts`): kan op zo'n filesystem
 *     niet eens uitgecheckt worden;
 *   - **stambotsing** (`Taakbalk.tsx` en `taakbalk.ts`): beide bestaan op schijf,
 *     maar de module-resolutie raakt ze kwijt.
 * Beide vallen onder één sleutel: het pad, kleingeschreven, zonder laatste
 * extensie. `Foo.tsx` en `foo.test.ts` botsen niet (stam `foo` tegen `foo.test`).
 *
 * Draaien: `npm run casing:controle`. Hoort mee in de poort en in CI.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/**
 * De groepen paden die alleen in hoofdletters verschillen.
 *
 * ⚠️ Geëxporteerd zodat hij te ijken is: een controle die je niet kunt voeden,
 *    kun je niet ijken.
 *
 * @param {readonly string[]} paden tracked paden, met `/` als scheidingsteken
 * @returns {string[][]} per botsing de paden die samenvallen, gesorteerd
 */
export function casingBotsingen(paden) {
  const groepen = new Map();
  for (const pad of new Set(paden)) {
    const laatste = pad.lastIndexOf('.');
    const streek = pad.lastIndexOf('/');
    const stam = laatste > streek + 1 ? pad.slice(0, laatste) : pad;
    const sleutel = stam.toLowerCase();
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), pad]);
  }
  return [...groepen.values()]
    .filter((groep) => groep.length > 1)
    .map((groep) => groep.sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function trackedPaden() {
  const uit = execFileSync('git', ['ls-files', '-z'], {
    cwd: WORTEL,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return uit.split('\0').filter(Boolean);
}

function main() {
  const paden = trackedPaden();
  const botsingen = casingBotsingen(paden);
  if (botsingen.length === 0) {
    console.log(`✓ casing: geen bestanden die alleen in hoofdletters verschillen (${paden.length} tracked).`);
    return 0;
  }
  console.error(`✗ casing: ${botsingen.length} botsing(en). Op Windows/macOS breekt hier typecheck op.`);
  for (const groep of botsingen) console.error(`    ${groep.join('  <->  ')}`);
  console.error('  Hernoem een van de twee naar een naam die ook zonder hoofdletters verschilt.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
