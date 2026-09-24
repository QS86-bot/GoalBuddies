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
 * ⚠️⚠️ **De veiligheidsgrens is sinds QS8-608 leeg, en dat is de opbrengst van
 *    dat issue.** Toen deze toets geschreven werd, hadden tien scripts géén
 *    guard en déden ze iets op moduleniveau — `sync-edge-shared.mjs` kopieerde
 *    19 bestanden, `maak-iconen.mjs` schreef zes PNG's, en zes andere riepen
 *    `process.exit()` aan (erger dan werpen: dat kun je niet vangen). Die
 *    importeren zou van deze toets een schrijfactie op de repo hebben gemaakt.
 *
 *    📏 Alle tien dragen nu een guard met hun werk in `hoofd()`, byte-identiek
 *    in uitvoer en exitcode. **Geen enkel script in `scripts/` doet nog iets bij
 *    import**, en deze toets selecteert er daarmee 93 van de 105 — de overige
 *    twaalf zijn echte modules zonder guard (`psql.mjs`, `paden.mjs`, de twee
 *    knippen, …) en zijn even inert.
 *
 * ⚠️ **De grens blijft staan en de toets eronder ook**, want hij bewaakt nu iets
 *    anders: dat een nieuw script dat werk op moduleniveau zet, niet stilletjes
 *    buiten deze selectie valt. Zonder guard wordt het niet geïmporteerd en dus
 *    niet gemeten — en dát is het gat dat QS8-608 een keer heeft gekost.
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
    expect(metGuard().length).toBeGreaterThan(85);
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

  // ⚠️⚠️ **Dit was tot QS8-608 de omgekeerde toets**, en het verschil is de hele
  //    opbrengst van dat issue. Hij legde toen vast dat `sync-edge-shared.mjs`
  //    en `maak-iconen.mjs` buiten de selectie vielen, want ze kopieerden 19
  //    bestanden en schreven zes PNG's zodra je ze importeerde. Nu dragen ze een
  //    guard, staat hun werk in `hoofd()`, en horen ze er juist **in**.
  it('neemt ook de twee scripts mee die vroeger bij import schreven', () => {
    expect(metGuard()).toContain('sync-edge-shared.mjs');
    expect(metGuard()).toContain('maak-iconen.mjs');
  });

  // ⚠️ De scripts zónder guard zijn er nog — twaalf echte modules — en die horen
  //    buiten de selectie te blijven. Niet omdat ze gevaarlijk zijn, maar omdat
  //    deze toets over main-guards gaat; hun inertheid volgt uit dat ze niets
  //    op moduleniveau doen, en dat is hierboven gemeten.
  it('laat de modules zonder main-guard buiten de selectie', () => {
    const zonder = readdirSync(MAP)
      .filter((naam) => naam.endsWith('.mjs'))
      .filter((naam) => !readFileSync(join(MAP, naam), 'utf8').includes(GUARD));

    expect(zonder).toContain('psql.mjs');
    expect(zonder).toContain('zonder-commentaar.mjs');
    expect(metGuard()).not.toContain('psql.mjs');
  });
});
