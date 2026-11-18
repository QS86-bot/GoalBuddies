import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Een script importeren doet niets — QS8-599, verscherpt in QS8-638.
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
 *    import**, en deze toets meet ze allemaal — ook de twaalf zonder guard
 *    (`psql.mjs`, `paden.mjs`, de twee knippen, …), want dat zijn echte modules
 *    en die horen even inert te zijn.
 *
 * ⚠️ **De grens blijft staan en de toets eronder ook**, want hij bewaakt nu iets
 *    anders: dat een nieuw script dat werk op moduleniveau zet, niet stilletjes
 *    buiten deze selectie valt. Zonder guard wordt het niet geïmporteerd en dus
 *    niet gemeten — en dát is het gat dat QS8-608 een keer heeft gekost.
 *
 * ⚠️⚠️ **Tot QS8-638 bewaakte deze toets maar één van de drie vormen, en de kop
 *    beweerde alle drie.** Er stond dat een script dat werk op moduleniveau zet
 *    *"er luid rood van wordt, maar ná de handeling"*. 📏 Nagemeten op
 *    05-10-2026, stand ervóór 3/3 groen, elke mutatie teruggezet en met
 *    `diff -q` bevestigd:
 *
 *    | mutatie | uitslag vóór QS8-638 |
 *    | -- | -- |
 *    | `process.exit(0);` bovenaan `auth-urls.mjs` | **3/3 groen** |
 *    | `process.exit(1);` bovenaan `auth-urls.mjs` | **3/3 groen** |
 *    | een stille `writeFileSync(…)` bovenaan `psql.mjs` | **3/3 groen**, en het bestand stond er |
 *    | `console.log('hallo');` bovenaan `psql.mjs` | rood — de énige vorm die hij zag |
 *
 *    Twee oorzaken, en ze versterkten elkaar. De `catch` rond `execFileSync`
 *    las alleen `stdout` en `stderr` en liet de **exitstatus** liggen, dus een
 *    exit zonder tekst was niet te onderscheiden van een schone run. En omdat
 *    de lus alle scripts in **één** proces importeert, kapt zo'n exit de rest
 *    van de lus af: alles wat alfabetisch ná de schuldige komt werd niet eens
 *    geïmporteerd, en de toets zei er niets over. De tien scripts van QS8-608
 *    déden precies deze twee dingen; dat ze óók printten, is geluk geweest en
 *    geen eigenschap van de grendel.
 *
 * ⚠️ **Daarom zijn het nu drie grendels met elk een eigen toets**, uit één
 *    kindproces zodat de prijs één run blijft:
 *
 *    1. *stdout en stderr leeg* — vangt printen en werpen.
 *    2. *elk script is bereikt, en de exitstatus is 0* — vangt de stille exit.
 *       De lus schrijft elke naam ná de import weg, dus een exit halverwege
 *       laat precies het voorvoegsel staan en de toets kan de schuldige
 *       **noemen**. Dat `finally` niet draait bij `process.exit()` is hier geen
 *       beperking maar het meetprincipe.
 *    3. *de werkboom is onveranderd, en de wegwerpmap leeg* — vangt de stille
 *       schrijfactie. Twee kanten, want een absoluut pad landt in de repo en
 *       een relatief pad in de `cwd` van het kind.
 *
 * ⚠️⚠️ **De schrijfgrens is sinds QS8-646 gesloten met Node's permissiemodel.**
 *    📏 Tot dan zag grendel 3 alleen de repo (`git status --porcelain`, en dus
 *    geen `.gitignore`-pad) en de `cwd` van het kind: een `writeFileSync` naar
 *    `/tmp` of `dist/` liet 5/5 groen en het bestand stond er. Het kind draait
 *    nu met `--permission --allow-fs-read=* --allow-fs-write=<wegwerpmap>`, dus
 *    elke andere schrijfactie is `ERR_ACCESS_DENIED` en komt als worp in grendel 1.
 *    De sonde meldt `PERMISSIEMODEL UIT` als het model niet werkt (te oude Node,
 *    vlag weg), want anders is de grens een aanname. Hij probeert twee paden
 *    (QS8-681): `tmpdir()` en een `.gitignore`-pad in de repo, zodat een
 *    verbreed schrijfrecht naar de repo ook rood wordt. De ondergrens van Node
 *    is **22.13**: daarvoor heette de vlag `--experimental-permission`, en
 *    `package.json` zegt `>=22`; de eerste toets hieronder zegt dat luid. Alleen `--permission`
 *    weghalen ijkt de sonde niet — haal alle drie de vlaggen weg.
 *    De boomkant en de lege-mapcontrole blijven: de wegwerpmap is toegestaan.
 *    Mutaties en uitslagen: `docs/decisions/2026-10-05-de-grendel-zag-alleen-de-luide-helft.md` §8.
 *    Leesrecht is `*`; een script dat bij import legitiem buiten de wegwerpmap
 *    moet schrijven vraagt een eigen pad in `--allow-fs-write`, mét reden.
 *    Hij leunt bovendien op de regel van QS8-442 dat een testbestand nooit buiten
 *    zijn eigen fixture schrijft.
 */
const WORTEL = process.cwd();
const MAP = join(WORTEL, 'scripts');
const GUARD = 'import.meta.url === pathToFileURL(';

/** Élk script in `scripts/`, want ze horen allemaal inert te zijn. */
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

/**
 * De stand van de werkboom, als één string om vóór en ná te vergelijken.
 *
 * ⚠️ Niet "is de boom schoon" maar "is de boom veránderd": tijdens een
 *    ontwikkelronde staan er altijd wijzigingen, en die horen de toets niet
 *    rood te maken.
 */
function boomstand(): string {
  return execFileSync('git', ['status', '--porcelain'], { cwd: WORTEL, encoding: 'utf8' });
}

/**
 * De paden waar het kind NIET mag schrijven, en dus waar de sonde op test.
 *
 * ⚠️ Twee soorten, elk een andere verbreding van `--allow-fs-write`:
 *    - `tmpdir()`: vangt `*` en `/` en de tijdelijke map zelf;
 *    - `node_modules/` in de repo: een `.gitignore`-pad, precies het gat van
 *      QS8-638 dat de boomkant niet ziet. Vangt een schrijfrecht dat naar de
 *      repo (`WORTEL`) of naar `node_modules` verbreed wordt. Het pad bestaat
 *      niet, en het permissiemodel weigert vóór het bestandssysteem kijkt; wordt
 *      de grens verbreed, dan gaat de sonde dóór of geeft hij `ENOENT`, en allebei
 *      is rood (`SONDE:` of `PERMISSIEMODEL UIT:`).
 */
function sondepaden(): string[] {
  return [
    join(tmpdir(), `hoofdwacht-sonde-${process.pid}`),
    join(WORTEL, 'node_modules', `.hoofdwacht-sonde-${process.pid}`),
  ];
}

/** De code die het kindproces draait: importeer alles, noteer wat je bereikt. */
function kindcode(namen: string[], bereiktPad: string, sondePaden: string[]): string {
  return [
    // ⚠️ De sonde: schrijf buiten de toegestane map, op elk pad dat de grens
    //    moet weigeren. Lukt dat, dan staat het permissiemodel niet aan (of is
    //    `--allow-fs-write` verbreed) en is de hele schrijfgrendel een aanname —
    //    dat meldt de toets dan als eigen fout in plaats van stil groen te blijven.
    //    Eén pad is niet genoeg (QS8-681): de sonde van QS8-646 schreef alleen naar
    //    `tmpdir()`, en een schrijfrecht dat naar de repo verbreed werd bleef dan groen.
    'const { writeFileSync: sondeSchrijf, rmSync: sondeWis } = await import("node:fs");',
    `for (const sonde of ${JSON.stringify(sondePaden)}) {`,
    '  try { sondeSchrijf(sonde, "x"); sondeWis(sonde); console.log("PERMISSIEMODEL UIT: " + sonde); }',
    '  catch (f) { if (f.code !== "ERR_ACCESS_DENIED") { console.log("SONDE: " + f.code + " " + sonde); } }',
    '}',
    // ⚠️ Dit is de oorspronkelijke belofte van QS8-599 en geen opsmuk: zonder
    //    argv wierp `poort.mjs` destijds uit `pathToFileURL(undefined)`.
    'process.argv.length = 1;',
    'const { appendFileSync } = await import("node:fs");',
    'const stuk = [];',
    `for (const naam of ${JSON.stringify(namen)}) {`,
    `  try { await import(${JSON.stringify(MAP)} + "/" + naam); }`,
    '  catch (f) { stuk.push(naam + ": " + f.constructor.name); }',
    `  finally { appendFileSync(${JSON.stringify(bereiktPad)}, naam + "\\n"); }`,
    '}',
    'if (stuk.length > 0) { console.log(stuk.join("\\n")); }',
  ].join('\n');
}

interface Run {
  namen: string[];
  uitvoer: string;
  status: number | null;
  bereikt: string[];
  boomVeranderd: boolean;
  rommel: string[];
}

/**
 * Eén kindproces, drie metingen eruit.
 *
 * ⚠️ `spawnSync` en niet `execFileSync`, en dat is de kern van de reparatie:
 *    `execFileSync` wérpt bij een exitcode ≠ 0, en de `catch` eromheen las
 *    alleen de twee tekststromen. De status viel daar stilletjes weg.
 */
function meet(): Run {
  const namen = alleScripts();
  const tuin = mkdtempSync(join(tmpdir(), 'hoofdwacht-'));
  const bereiktPad = join(tuin, 'bereikt.txt');
  const werkmap = join(tuin, 'werkmap');
  writeFileSync(bereiktPad, '');
  mkdirSync(werkmap);

  const voor = boomstand();
  const sondePaden = sondepaden();
  const r = spawnSync(
    process.execPath,
    [
      '--permission',
      '--allow-fs-read=*',
      `--allow-fs-write=${tuin}`,
      '--input-type=module',
      '-e',
      kindcode(namen, bereiktPad, sondePaden),
    ],
    {
      cwd: werkmap,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const na = boomstand();

  return {
    namen,
    uitvoer: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    status: r.status,
    bereikt: readFileSync(bereiktPad, 'utf8').split('\n').filter(Boolean),
    boomVeranderd: voor !== na,
    rommel: readdirSync(werkmap),
  };
}

describe('een script importeren doet niets', () => {
  let run: Run;

  beforeAll(() => {
    run = meet();
  });

  it('vindt genoeg scripts dat een lege uitkomst iets betekent', () => {
    // ⚠️ De kanarie. Een lege lijst is ook wat je krijgt als de zeef stuk is, en
    //    dat is in deze week twee keer voorgekomen.
    expect(alleScripts().length).toBeGreaterThan(100);
    expect(alleScripts()).toContain('poort.mjs');
    expect(alleScripts()).toContain('sync-edge-shared.mjs');
  });

  it('kent de permissievlag: Node 22.13 of nieuwer', () => {
    // ⚠️ `package.json` zegt `>=22` en dat is te ruim voor deze toets. Zonder deze
    //    controle krijgt wie op 22.0 t/m 22.12 draait "bad option" op stderr, en
    //    dat leest als "een script print bij import".
    expect(
      process.allowedNodeEnvironmentFlags.has('--permission'),
      `Node ${process.versions.node} kent --permission niet: gebruik 22.13 of nieuwer`,
    ).toBe(true);
  });

  it('geen enkel script werpt of print bij import', () => {
    expect(run.uitvoer, 'een script is niet stil bij import').toBe('');
  });

  it('elk script wordt bereikt, en het kind sluit met 0 af', () => {
    // ⚠️⚠️ De grendel tegen de stílle exit. Het eerste ontbrekende script is de
    //    schuldige: `process.exit()` slaat het `finally` over én kapt de lus af.
    const gemist = run.namen.filter((naam) => !run.bereikt.includes(naam));
    expect(gemist, 'een script kapte de importlus af — de eerste is de schuldige').toEqual([]);
    expect(run.status, 'het kindproces sloot niet met 0 af').toBe(0);
  });

  it('geen enkel script schrijft bij import', () => {
    // ⚠️ Twee kanten: een absoluut pad landt in de werkboom, een relatief pad in
    //    de `cwd` van het kind. Zie de kop voor wat dit níet dekt.
    expect(run.boomVeranderd, 'de werkboom is veranderd door een import').toBe(false);
    expect(run.rommel, 'een script schreef in de wegwerpmap').toEqual([]);
  });

  it("kent het onderscheid tussen modules en commando's, en meet ze allebei", () => {
    expect(metGuard()).toContain('sync-edge-shared.mjs');
    expect(metGuard()).not.toContain('psql.mjs');
    expect(alleScripts()).toContain('psql.mjs');
  });
});
