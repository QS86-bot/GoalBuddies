import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
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
 *    `nummersPerBranch` — en tóch botste het nummer op
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
  // ⚠️ **Deze ontbrak tot QS8-365, en dat was niet te zien.** Geen enkele test
  //    liet `migraties-controle.mjs` hier tot het eind lopen: `draai()` vangt de
  //    exitcode en de bestaande tests kijken alleen of er gefetcht is. De
  //    controle viel dus om op een ontbrekende import en telde als "rood zoals
  //    verwacht". Zodra een test zijn úítslag leest, moet de lijst kloppen.
  'letterversies.mjs',
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
      // Een pad dat niet bestaat: git leest dan geen enkele globale config, en
      // dat is draagbaarder dan `/dev/null`.
      GIT_CONFIG_GLOBAL: join(tmpdir(), 'gb-geen-git-config'),
      GIT_CONFIG_SYSTEM: join(tmpdir(), 'gb-geen-git-config'),
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
   * ⚠️⚠️ **Deze test toetste tot QS8-365 het tegenovergestelde**, en dat is de
   *    kern van dit issue: hij eiste `0010` — het maximum over álle branches —
   *    en dat is precies het nummer dat CI weigert. Met `0010` in een map die op
   *    `0001` staat, is er een gat van acht, en `actions/checkout@v4` ziet de
   *    branch die het zou vullen niet.
   *
   *    Het nummer sluit nu aan op de éigen map. De fetch is daarmee niet minder
   *    belangrijk geworden maar meet iets anders: hij levert de **waarschuwing**,
   *    en die is hieronder de ijking van hetzelfde mechanisme.
   */
  it('kiest een nummer dat aansluit op de eigen map', () => {
    const uit = draai('migratie-nieuw.mjs', 'iets', '--droog');

    expect(uit).toContain('0002_iets.sql');
    expect(uit).not.toContain('0010_iets.sql');
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
    // zonder ook maar iets van een netwerk aan te raken. ⚠️ `renameSync` en geen
    // `mv`: dit bestand hoort ook te draaien op een machine zonder coreutils.
    const opzij = `${afstand}.opzij`;
    renameSync(afstand, opzij);
    let uit = '';
    try {
      uit = draai('migratie-nieuw.mjs', 'iets', '--droog');
    } finally {
      renameSync(opzij, afstand);
    }

    expect(uit).toContain('Kon niet fetchen');
    expect(uit).toContain('3 dagen oud');
    expect(uit).toContain('Controleer zelf');
    // En hij stopt niet: er komt nog steeds een nummer uit. ⚠️ Sinds QS8-365 is
    // dat het nummer dat op de eigen map aansluit, en zonder fetch is dat
    // toevallig hetzelfde als mét — het nummer hangt er niet meer van af. Wat
    // er wél van afhangt is de waarschuwing, en die staat in de test hieronder.
    expect(uit).toContain('0002_iets.sql');
  });
});

// ---------------------------------------------------------------------------
// QS8-365 — het nummer dat CI weigert
// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De toestand waarin twee scripts een tegengesteld antwoord gaven.**
 *    `main` op N, een nog niet gelande branch op N+1, werkkopie op N. Tot
 *    08-09-2026 gaf `migratie:nieuw` daar N+2 — het maximum over álle branches —
 *    en dan staat er een gat van één in de eigen map. 📏 Drie keer op één dag
 *    gemeten (QS8-363, QS8-305, QS8-360), en drie keer met de hand hernummerd.
 *
 * ⚠️ **De ijking hoort aan de CI-kant en niet alleen aan de scriptkant**, want
 *    dát is waar het misgaat: lokaal ziet `migraties:controle` de branch die het
 *    gat vult en zwijgt erover, en in CI is die branch er niet.
 *    `actions/checkout@v4` haalt één branch op. Vandaar hieronder een tweede
 *    kloon met `--single-branch`: geen `origin/…`-refs behalve die ene.
 */
describe('QS8-365 — het nummer sluit aan op de eigen map', () => {
  let ciKloon = '';

  /** `node <script>` in een gegeven wortel, met de uitvoer én de exitcode. */
  function draaiIn(wortel: string, script: string): { uit: string; code: number } {
    try {
      const uit = execFileSync('node', [join(wortel, 'scripts', script)], {
        cwd: wortel,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { uit, code: 0 };
    } catch (fout) {
      const e = fout as { stdout?: string; stderr?: string; status?: number };
      return { uit: `${e.stdout ?? ''}${e.stderr ?? ''}`, code: e.status ?? 1 };
    }
  }

  beforeAll(() => {
    const bron = join(werkmap, 'bron');

    // `main` krijgt 0002 erbij, zodat de werkkopie op N staat en niet op 1.
    git(bron, 'checkout', 'main');
    migratie(bron, '0002_op_main');
    git(bron, 'add', '-A');
    git(bron, 'commit', '-m', 'op main');
    git(bron, 'push', 'origin', 'main');

    // En een tweede sessie claimt N+1 op een eigen branch, nog niet geland.
    git(bron, 'checkout', '-b', 'naast');
    migratie(bron, '0003_elders_geclaimd');
    git(bron, 'add', '-A');
    git(bron, 'commit', '-m', 'naast');
    git(bron, 'push', '-u', 'origin', 'naast');

    git(kloon, 'pull', 'origin', 'main');

    // ⚠️ De CI-kant: één branch, geen andere `origin/…`-refs.
    ciKloon = join(werkmap, 'ci');
    git(werkmap, 'clone', '--single-branch', '--branch', 'main', afstand, ciKloon);
    mkdirSync(join(ciKloon, 'scripts'), { recursive: true });
    for (const naam of HULPSCRIPTS) {
      cpSync(join(process.cwd(), 'scripts', naam), join(ciKloon, 'scripts', naam));
    }
    // ⚠️ `migraties:controle` leest ook `package.json` — hij toetst of de
    //    Supabase-CLI zichzelf niet tegenspreekt. Zonder dat bestand meldt hij
    //    "ongemeten" en dat is terecht rood, maar het is niet wat déze test
    //    meet. De echte uit de repo, want een verzonnen versie toetst zichzelf.
    cpSync(join(process.cwd(), 'package.json'), join(ciKloon, 'package.json'));
  });

  it('geeft N+1 en niet N+2, met een branch op N+1', () => {
    const uit = draai('migratie-nieuw.mjs', 'van_mij', '--droog');

    expect(uit).toContain('0003_van_mij.sql');
    expect(uit).not.toContain('0004_van_mij.sql');
  });

  it('noemt de branch die datzelfde nummer draagt', () => {
    // ⚠️ Dit is wat de fetch nu oplevert: niet het nummer maar de waarschuwing.
    //    Zonder fetch kent deze kloon `origin/naast` niet en zwijgt hij erover.
    const uit = draai('migratie-nieuw.mjs', 'van_mij', '--droog');

    expect(uit).toContain('origin/naast');
    expect(uit).toContain('hernummert');
  });

  it('en dat nummer is groen in een checkout zonder andere branches', () => {
    migratie(ciKloon, '0003_van_mij');
    const { uit, code } = draaiIn(ciKloon, 'migraties-controle.mjs');

    expect(uit, uit).toContain('aaneengesloten');
    expect(code, uit).toBe(0);
  });

  /**
   * ⚠️⚠️ **De énige toestand waarin het nieuwe nummer écht fout is, en hij ziet
   *    er van buiten hetzelfde uit als een botsing.** Loopt `origin/main` vóór
   *    op de werkkopie, dan is er niets te hernummeren: het nummer is op `main`
   *    al bezet en `git pull` is het antwoord. Vandaar een eigen melding — twee
   *    gevallen op één hoop leert een lezer ze allebei overslaan.
   *
   * ⚠️ Deze test staat als laatste omdat hij de werkkopie met opzet achter laat
   *    lopen; alles erboven rekent op een verse `pull`.
   */
  it('zegt dat je moet pullen als origin/main voorloopt', () => {
    const bron = join(werkmap, 'bron');
    git(bron, 'checkout', 'main');
    migratie(bron, '0005_verder_op_main');
    git(bron, 'add', '-A');
    git(bron, 'commit', '-m', 'verder');
    git(bron, 'push', 'origin', 'main');

    // ⚠️ Met opzet géén `pull` in de kloon: dat ís de toestand.
    const uit = draai('migratie-nieuw.mjs', 'van_mij', '--droog');

    expect(uit).toContain('origin/main staat op 0005');
    expect(uit).toContain('git pull origin main');
  });

  it('terwijl N+2 daar rood is op een gat — de fout die dit issue beschrijft', () => {
    // ⚠️ Dezelfde map, één nummer hoger. Dit is wat er drie keer gebeurd is.
    rmSync(join(ciKloon, 'supabase', 'migrations', '0003_van_mij.sql'), { force: true });
    migratie(ciKloon, '0004_van_mij');
    const { uit, code } = draaiIn(ciKloon, 'migraties-controle.mjs');

    expect(uit, uit).toContain('Gat in de nummering');
    expect(uit, uit).toContain('0003');
    expect(code, uit).toBe(1);
  });
});
