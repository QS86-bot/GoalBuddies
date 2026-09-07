#!/usr/bin/env node
/**
 * `npm run tellers` — hoeveel tests er zijn, gemeten en niet onthouden. QS8-302.
 *
 * ⚠️ **Waarom dit bestaat.** `docs/WERKVOORRAAD.md` §2 droeg tot 06-09-2026 twee
 *    exacte getallen: hoeveel tests de RLS-suite en de hele suite geven. 📏 Die
 *    regel is op één dag **bij zeven van de zeven merges** een conflict geweest
 *    — QS8-290, QS8-294 (2×), QS8-170 (3×) en QS8-175 (2×) — en elke keer was
 *    het antwoord hetzelfde handwerk: beide suites opnieuw draaien en het getal
 *    terugschrijven.
 *
 * ⚠️ **QS8-284 had gelijk dat een generator dit níet oplost**, en dat is de
 *    reden dat dit script niets in een document schrijft. Een gegenereerd blok
 *    botst tekstueel net zo hard; het getal is pas juist ná een volledige run.
 *    Het probleem zat niet in het handwerk maar in het **exacte getal**: dat
 *    verandert bij elke test die erbij komt, en dus bij vrijwel elke merge.
 *
 * ⚠️ **Wat er in §2 voor terugkomt is grof met opzet.** Een orde van grootte
 *    verandert zelden en botst dus zelden, en voor de overdracht is dat genoeg —
 *    §2 is de stand en niet het archief. Wie het exacte getal nodig heeft,
 *    draait dit commando en heeft het bovendien van nú in plaats van van de
 *    laatste keer dat iemand het opschreef.
 *
 * ⚠️ **Hij verzint nooit een getal.** Kan de uitvoer van vitest niet gelezen
 *    worden, dan faalt dit script luid. Een teller die bij twijfel iets
 *    plausibels afdrukt, is erger dan geen teller: dan staat er een getal dat
 *    niemand kan navertellen.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';

const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** De laatste treffer van een globaal patroon, of `null`. */
function laatste(tekst, patroon) {
  const alle = [...tekst.matchAll(patroon)];
  return alle.length === 0 ? null : alle[alle.length - 1];
}

/**
 * De cijfers uit de samenvattingsregels van vitest.
 *
 * Vitest drukt twee regels af die er hier toe doen:
 *
 *     Test Files  253 passed (253)
 *          Tests  3543 passed | 1 skipped (3544)
 *
 * ⚠️ **Het getal tussen haakjes is het totaal en niet wat er slaagde**, en dat
 *    onderscheid is precies waar dit script voor bestaat: `3543 passed |
 *    1 skipped (3544)` betekent 3543 geslaagd van 3544. Wie het haakje leest
 *    als "geslaagd", telt een overgeslagen test mee als bewijs.
 *
 * @param {string} uitvoer
 * @returns {{ geslaagd: number, overgeslagen: number, totaal: number, bestanden: number }}
 */
export function tellersUit(uitvoer) {
  // ⚠️ **De láátste treffer en aan het begin van een regel**, en dat is geen
  //    voorzorg maar een gemeten reparatie. Vitest drukt de naam van elke test
  //    af, en een testnaam die de woorden `Tests  1 passed (1)` bevat kaapte de
  //    meting: de eerste versie las 1 in plaats van 7. Er staat een test op die
  //    precies dat geval voert.
  const tests = laatste(uitvoer, /^\s*Tests\s+(\d+) passed(?:\s*\|\s*(\d+) skipped)?\s*\((\d+)\)/gm);
  const files = laatste(uitvoer, /^\s*Test Files\s+(\d+) passed\s*\((\d+)\)/gm);

  if (tests === null || files === null) {
    throw new Error(
      'de samenvatting van vitest is niet gevonden.\n' +
        '  Dit script leest `Tests … passed` en `Test Files … passed` uit de uitvoer;\n' +
        '  staat daar iets anders, dan is er iets misgegaan in de run zelf. Er wordt\n' +
        '  met opzet géén getal geraden.',
    );
  }

  return {
    geslaagd: Number(tests[1]),
    overgeslagen: Number(tests[2] ?? 0),
    totaal: Number(tests[3]),
    bestanden: Number(files[2]),
  };
}

/** Eén suite draaien en zijn cijfers teruggeven. */
function meet(argumenten) {
  const uit = spawnSync('npx', ['vitest', 'run', ...argumenten], {
    cwd: WORTEL,
    encoding: 'utf8',
    env: { ...process.env, RLS_DOEL: process.env.RLS_DOEL ?? 'lokaal' },
  });
  const tekst = `${uit.stdout ?? ''}${uit.stderr ?? ''}`;
  if (uit.status !== 0) {
    throw new Error(
      `de suite is niet groen (exitcode ${uit.status}).\n` +
        '  Een teller van een rode suite zegt niets — repareer eerst de tests.',
    );
  }
  return tellersUit(tekst);
}

function regel(naam, { geslaagd, overgeslagen, totaal, bestanden }) {
  const staart = overgeslagen > 0 ? `, ${overgeslagen} overgeslagen` : '';
  return `${naam.padEnd(16)} ${geslaagd} geslaagd${staart} van ${totaal}, over ${bestanden} bestanden`;
}

function hoofd() {
  try {
    console.log(regel('RLS-suite', meet(['--project', 'rls'])));
    console.log(regel('hele suite', meet([])));
  } catch (fout) {
    console.error(`✗ tellers: ${fout instanceof Error ? fout.message : String(fout)}`);
    return 1;
  }

  console.log(
    '\n⚠️ Deze getallen horen niet in een document. Ze verschillen legitiem per\n' +
      '   branch en veranderen bij elke test die erbij komt — daarom botsten ze bij\n' +
      '   élke merge. Bij een samengaan met `main` is het antwoord dit commando en\n' +
      '   niet het hoogste van twee getallen. Zie QS8-302.',
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(hoofd());
