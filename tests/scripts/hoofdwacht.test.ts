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

/**
 * Élk script in `scripts/`, want ze horen allemaal inert te zijn.
 *
 * ⚠️⚠️ **Tot QS8-608 stonden hier alleen de scripts mét een main-guard**, en dat
 *    was een veiligheidsgrens: tien scripts déden toen iets op moduleniveau, en
 *    importeren zou van deze toets een schrijfactie op de repo hebben gemaakt.
 *    Die tien zijn gerepareerd, dus de grens kan weg — en dat moet ook, want
 *    zolang hij er stond viel een **nieuw** script zonder guard buiten de
 *    meting. 📏 Nagemeten bij het weghalen: alle 105 zijn inert.
 *
 * ⚠️ De restrisico verhuist mee en blijft opgeschreven: zet iemand werk op
 *    moduleniveau in een nieuw script, dan draait dat werk hier één keer. De
 *    toets wordt er luid rood van, maar ná de handeling.
 */
function alleScripts(): string[] {
  return readdirSync(MAP)
    .filter((naam) => naam.endsWith('.mjs'))
    .sort();
}

/** De scripts die een main-guard dragen — een commando en geen module. */
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
    expect(alleScripts().length).toBeGreaterThan(100);
    expect(alleScripts()).toContain('poort.mjs');
    expect(alleScripts()).toContain('sync-edge-shared.mjs');
  });

  it('geen enkel script werpt of print bij import', () => {
    const namen = alleScripts();
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

  // ⚠️ De twaalf zonder main-guard zijn echte modules — `psql.mjs`, `paden.mjs`,
  //    de twee knippen — en ze worden nu net zo goed geïmporteerd als de rest.
  //    Deze toets houdt het onderscheid zichtbaar: géén guard hebben is een
  //    eigenschap om te kennen, geen reden om niet te meten.
  it("kent het onderscheid tussen modules en commando's, en meet ze allebei", () => {
    expect(metGuard()).toContain('sync-edge-shared.mjs');
    expect(metGuard()).not.toContain('psql.mjs');
    expect(alleScripts()).toContain('psql.mjs');
  });
});
