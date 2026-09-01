import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * De naad tussen "een nummer uitdelen" en "weten wat er elders staat" — QS8-247.
 *
 * ⚠️ **Waarom dit een integratietest is en geen unit-test, en waarom dat hier
 *    geen luiheid is.** De belofte luidt: *het nummer dat `migratie:nieuw`
 *    uitdeelt, is vrij op elke branch die de remote op dít moment draagt.* Elk
 *    ónderdeel daarvan was al af en getoetst — `nummersUit`, `volgendVrijNummer`,
 *    `branchesVoorOp`, `nummersPerBranch` — en tóch botste het nummer op
 *    31-08-2026 voor de **vierde** keer. Er zat namelijk geen enkele test tussen
 *    het beeld en de werkelijkheid: alle bestaande tests voeden het script hun
 *    eigen `perBranch`-object, en dan is de vraag "klopt dat object" per definitie
 *    niet te stellen.
 *
 *    Dit is CLAUDE.md-vraag 3 in zijn zuiverste vorm: die tests bleven groen
 *    terwijl de belofte brak, want ze konden de belofte niet raken. Alleen een
 *    echte remote op schijf kan "wel gefetcht" van "niet gefetcht" onderscheiden.
 *
 * ⚠️ **En de tegenhelft weegt hier even zwaar.** `migraties:controle` mag juist
 *    **niet** fetchen: die draait in de poort en in CI, waar een netwerkaanroep
 *    de uitslag afhankelijk maakt van bereikbaarheid. Zonder een test op die
 *    kant is "de grens loopt tussen de twee scripts" een zin in een commentaar,
 *    en die overleeft de eerste refactor niet. `FETCH_HEAD` is de meting: git
 *    schrijft hem bij élke fetch, ook als er niets nieuws was.
 *
 * ⚠️ **Er komt geen netwerk aan te pas.** De "remote" is een bare repo op schijf
 *    en `git fetch` praat er via een pad mee. De test meet dus wat het script
 *    dóét, niet of deze machine online is.
 *
 * IJKING — met de hand gedraaid op 01-09-2026, één mutatie per grendel. Niet één
 * mutatie voor de hele controle: dan blijft een grendel die achter een andere
 * ligt ongemeten (CLAUDE.md, bij regel 18).
 *
 *   A  `haalRemoteOp()` uit `hoofd()` van `migratie-nieuw.mjs`   → 3 rood hier
 *   B  een `haalRemoteOp()` ín `migraties-controle.mjs`          → 1 rood hier
 *   C  `versheidsmelding()` neemt altijd de `vers`-tak           → 1 hier, 3 in
 *                                                                  migratiebranches
 *   D  `sinds` ná de poging lezen in plaats van ervóór           → 1 rood hier
 *   E  `ouderdomInWoorden()` geeft altijd "van zojuist"          → 1 hier, 6 in
 *                                                                  migratiebranches
 *
 * ⚠️ **D is geen verzonnen mutatie maar de bug die deze test daadwerkelijk
 *    ving.** De eerste versie las `laatsteFetch()` ná de poging, en git maakt
 *    `FETCH_HEAD` al aan vóórdat hij de remote bereikt: een mislukte fetch
 *    meldde daardoor "van zojuist". Dat is precies de valse zekerheid waar dit
 *    hele mechanisme tegen bestaat, en geen enkele unit-test kon hem zien.
 */

const HULPSCRIPTS = [
  'migratie-nieuw.mjs',
  'migratiebranches.mjs',
  'migraties-controle.mjs',
  'migratie-hernummer.mjs',
  'migratieregister-omgeving.mjs',
];

let werkmap = '';
let afstand = '';
let kloon = '';
let fetchHead = '';

/** Git zonder de instellingen van de omringende machine — en zonder ondertekening. */
function git(cwd: string, ...argumenten: string[]) {
  return execFileSync('git', argumenten, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'IJking',
      GIT_AUTHOR_EMAIL: 'ijking@example.invalid',
      GIT_COMMITTER_NAME: 'IJking',
      GIT_COMMITTER_EMAIL: 'ijking@example.invalid',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
}

function migratie(map: string, naam: string) {
  const pad = join(map, 'supabase', 'migrations', `${naam}.sql`);
  mkdirSync(join(map, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(pad, `-- ${naam}.sql — ijking\n--\n-- ROLLBACK-PAD:\n--   n.v.t.\n`);
}

/** `node <script>` met de werkkopie als wortel — de scripts leiden die zelf af. */
function draai(script: string, ...argumenten: string[]) {
  try {
    return execFileSync('node', [join(kloon, 'scripts', script), ...argumenten], {
      cwd: kloon,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (fout) {
    // `migraties:controle` eindigt met exitcode 1 op deze verzonnen map, en dat
    // is hier niet de vraag: wij meten of hij gefetcht heeft.
    const e = fout as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-fetch-'));
  afstand = join(werkmap, 'afstand.git');
  kloon = join(werkmap, 'kloon');

  // 1. Een bare repo als "origin", en een bron die erop pusht.
  git(werkmap, 'init', '--bare', '-b', 'main', afstand);
  const bron = join(werkmap, 'bron');
  mkdirSync(bron);
  git(bron, 'init', '-b', 'main');
  migratie(bron, '0001_begin');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'begin');
  git(bron, 'remote', 'add', 'origin', afstand);
  git(bron, 'push', '-u', 'origin', 'main');

  // 2. De werkkopie kloont — en weet vanaf nu niets meer van wat er later komt.
  git(werkmap, 'clone', afstand, kloon);
  mkdirSync(join(kloon, 'scripts'), { recursive: true });
  for (const naam of HULPSCRIPTS) {
    cpSync(join(process.cwd(), 'scripts', naam), join(kloon, 'scripts', naam));
  }

  // 3. Een parallelle sessie claimt 0009 op een eigen branch. Precies de
  //    toestand van 31-08: gepusht, maar niet in deze werkkopie.
  git(bron, 'checkout', '-b', 'parallel');
  migratie(bron, '0009_elders_geclaimd');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'elders');
  git(bron, 'push', '-u', 'origin', 'parallel');

  fetchHead = join(kloon, '.git', 'FETCH_HEAD');
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

describe('migratie:nieuw haalt het beeld zelf op', () => {
  /**
   * ⚠️ **De test die op 31-08 had moeten bestaan.** Zonder fetch kent de kloon
   *    alleen `origin/main` met 0001 en komt hij op `0002` — het nummer dat
   *    botst. Met fetch ziet hij `origin/parallel` met 0009 en komt hij op
   *    `0010`.
   */
  it('kiest een nummer boven wat een andere branch al geclaimd heeft', () => {
    const uit = draai('migratie-nieuw.mjs', 'iets', '--droog');

    expect(uit).toContain('0010_iets.sql');
    expect(uit).not.toContain('0002_iets.sql');
  });

  it('zegt dat het beeld ververst is', () => {
    expect(draai('migratie-nieuw.mjs', '--droog')).toContain('ververst');
  });

  it('laat een spoor achter dat er gefetcht is', () => {
    rmSync(fetchHead, { force: true });
    draai('migratie-nieuw.mjs', '--droog');
    expect(existsSync(fetchHead)).toBe(true);
  });
});

describe('migraties:controle fetcht juist niet', () => {
  /**
   * ⚠️ **De grens, gemeten en niet beloofd.** Deze controle draait in de poort
   *    en in CI; een netwerkaanroep zou de uitslag afhankelijk maken van
   *    bereikbaarheid, terwijl CI toch al op een verse checkout draait.
   *
   *    `FETCH_HEAD` is het bewijsstuk: git herschrijft hem bij élke fetch, ook
   *    als er niets nieuws binnenkwam.
   */
  it('raakt FETCH_HEAD niet aan', () => {
    rmSync(fetchHead, { force: true });
    draai('migraties-controle.mjs');
    expect(existsSync(fetchHead)).toBe(false);
  });
});

describe('een mislukte fetch', () => {
  /**
   * ⚠️ **Doortellen is de keuze, zwijgen niet.** Zonder netwerk moet je een
   *    migratie kunnen beginnen — weigeren maakt het werk niet af. Wat wél moet
   *    is dat het antwoord niet langer als zeker te lezen is: de leeftijd van
   *    het beeld hoort erbij, want juist het verschil tussen "van net" en "van
   *    eergisteren" ís het risico.
   */
  it('meldt de leeftijd van het beeld en telt daarna door', () => {
    draai('migratie-nieuw.mjs', '--droog'); // zorgt dat FETCH_HEAD bestaat
    const drieDagenTerug = Date.now() / 1000 - 3 * 86_400;
    utimesSync(fetchHead, drieDagenTerug, drieDagenTerug);

    // De remote wegtrekken is de goedkoopste manier om een fetch te laten falen
    // zonder ook maar iets van een netwerk aan te raken.
    const opzij = `${afstand}.opzij`;
    execFileSync('mv', [afstand, opzij]);
    let uit = '';
    try {
      uit = draai('migratie-nieuw.mjs', 'iets', '--droog');
    } finally {
      execFileSync('mv', [opzij, afstand]);
    }

    expect(uit).toContain('Kon niet fetchen');
    expect(uit).toContain('3 dagen oud');
    expect(uit).toContain('Controleer zelf');
    // En hij stopt niet: er komt nog steeds een nummer uit.
    expect(uit).toContain('0010_iets.sql');
  });
});
