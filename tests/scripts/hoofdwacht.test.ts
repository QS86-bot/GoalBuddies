import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Een script importeren doet niets — QS8-599.
 *
 * ⚠️⚠️ **Dit toetst de belófte en niet de spelling, en dat verschil is hier
 *    gemeten.** De voor de hand liggende vorm is een regex op de huisregel
 *    `if (process.argv[1] && import.meta.url === pathToFileURL(…))`. 📏 Die had
 *    op 24-09-2026 **tien** scripts gevonden — en er wáren er **veertien** stuk.
 *    De andere vier (`auditkop`, `ci-controles`, `ci-controle-draai`,
 *    `migraties-controle`) droegen de wacht keurig en wierpen tóch, want ze
 *    importeren `poort.mjs` die hem miste. Een regel-voor-regel-controle ziet
 *    een importgraaf niet; deze toets wel.
 *
 * 📏 **De belofte is empirisch vastgesteld en niet afgeleid**: met
 *    `process.argv.length = 1` wierp `poort.mjs` een `TypeError
 *    [ERR_INVALID_ARG_TYPE]` uit `pathToFileURL(undefined)`, en `tekst-controle.mjs`
 *    — mét wacht — niet. Dát is wat hier bewaakt wordt.
 *
 * ⚠️ **Alleen scripts mét een main-guard worden geïmporteerd**, en dat is een
 *    veiligheidsgrens en geen gemak. 📏 Gemeten: tien scripts in `scripts/`
 *    hebben géén guard en dóen iets op moduleniveau — `sync-edge-shared.mjs`
 *    kopieert 19 bestanden, `maak-iconen.mjs` schrijft zes PNG's. Die importeren
 *    zou deze toets een schrijfactie op de repo maken. Ze staan alle tien in de
 *    lijst hieronder en worden met opzet niet aangeraakt; dat die klasse
 *    bestaat is een eigen bevinding (zie de dossierrij van 24-09).
 *
 * ⚠️ **De restrisico die blijft**, en die schrijf ik liever op dan dat ik hem
 *    wegpoets: zet iemand een guard-regel in zo'n script zónder het werk
 *    eronder te verplaatsen, dan importeert deze toets hem alsnog en draait dat
 *    werk één keer. Hij wordt er wél rood van — de uitvoer is dan niet leeg —
 *    maar de schrijfactie is dan al gebeurd.
 */
const WORTEL = process.cwd();
const MAP = join(WORTEL, 'scripts');
const GUARD = 'import.meta.url === pathToFileURL(';

/** De scripts die een main-guard dragen, en dus inert horen te zijn. */
function metGuard(): string[] {
  return readdirSync(MAP)
    .filter((naam) => naam.endsWith('.mjs'))
    .filter((naam) => readFileSync(join(MAP, naam), 'utf8').includes(GUARD))
    .sort();
}

describe('een script importeren werpt niet', () => {
  it('vindt genoeg scripts dat een lege uitkomst iets betekent', () => {
    // ⚠️ De kanarie. Een lege lijst is ook wat je krijgt als de zeef stuk is, en
    //    dat is in deze week twee keer voorgekomen.
    expect(metGuard().length).toBeGreaterThan(70);
    expect(metGuard()).toContain('poort.mjs');
  });

  it('geen enkel script met een main-guard werpt of print bij import', () => {
    const namen = metGuard();
    let uit = '';
    let fout = '';
    try {
      uit = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          [
            'process.argv.length = 1;',
            'const stuk = [];',
            `for (const naam of ${JSON.stringify(namen)}) {`,
            `  try { await import(${JSON.stringify(MAP)} + '/' + naam); }`,
            '  catch (f) { stuk.push(naam + ": " + f.constructor.name); }',
            '}',
            'if (stuk.length > 0) { console.log(stuk.join("\\n")); process.exitCode = 1; }',
          ].join('\n'),
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (f) {
      const e = f as { stdout?: string; stderr?: string };
      uit = e.stdout ?? '';
      fout = e.stderr ?? '';
    }

    expect(`${uit}${fout}`.trim(), 'een script is niet inert bij import').toBe('');
  });

  it('laat scripts zonder main-guard met rust — die doen soms écht iets', () => {
    // 📏 `sync-edge-shared.mjs` kopieert 19 bestanden en `maak-iconen.mjs`
    //    schrijft zes PNG's, allebei op moduleniveau. Ze horen niet in de
    //    selectie, en deze toets legt dat vast in plaats van erop te vertrouwen.
    const zonder = readdirSync(MAP)
      .filter((naam) => naam.endsWith('.mjs'))
      .filter((naam) => !readFileSync(join(MAP, naam), 'utf8').includes(GUARD));

    expect(zonder).toContain('sync-edge-shared.mjs');
    expect(zonder).toContain('maak-iconen.mjs');
    expect(metGuard()).not.toContain('sync-edge-shared.mjs');
    expect(metGuard()).not.toContain('maak-iconen.mjs');
  });
});
