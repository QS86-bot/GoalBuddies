import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Een gelande branch is geen botsing — QS8-313.
 *
 * ⚠️ **Waarom dit een integratietest is en geen unit-test.** De helft die hier
 *    onder test staat is de git-scan zelf: welke refs worden gelezen en welke
 *    vallen af. Een zelfgevoerd `perBranch`-object kan die vraag per definitie
 *    niet stellen — dezelfde reden waarom `migratie-fetch.test.ts` en
 *    `migratie-nummerbotsing.test.ts` bestaan.
 *
 * ⚠️ **Wat er misging.** 📏 Gemeten op `origin/main` (16b7c16) op 07-09-2026 in
 *    een verse worktree: `migraties:controle` gaf exitcode 1 met zes meldingen,
 *    alle zes over branches die al geland waren. Hun migraties stonden gewoon in
 *    de map, alleen onder een ánder nummer — want wie als tweede mergede had
 *    hernummerd. Wat er nog stond was de remote *branch*, met de nummering van
 *    vóór dat hernummeren.
 *
 *    De poort stond daardoor rood op een schone `main`, en dat rood ging over
 *    niemands werk. Dat is de vorm die dit project bij QS8-304 duur betaald
 *    heeft: *een rode uitslag die niet over jouw wijziging gaat, leert je de
 *    uitslag te negeren.* En hij groeit bij elke merge — hoe beter het project
 *    draait, hoe luider deze controle loog.
 *
 * ⚠️ **De belofte is niet "gelande branches worden overgeslagen".** Dat is een
 *    eigenschap van een onderdeel. De belofte heeft drie helften die los van
 *    elkaar kunnen breken, en daarom staan er drie tests:
 *
 *      1. een gelande zusterbranch meldt niets meer;
 *      2. een **open** zusterbranch meldt nog steeds — anders heb je de controle
 *         stiller gemaakt in plaats van scherper;
 *      3. de **stam** blijft meetellen — `origin/main` zit trivialiter in
 *         zichzelf, dus een filter die niet oppast neemt hem mee en dan verdwijnt
 *         de melding *main draagt migraties die jij mist*, het nuttigste geval
 *         van stap 4.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `remoteTakken()` de filter laten overslaan (`return branches`)
 *      → 1 rood: 'een gelande zusterbranch'
 *   B  de uitzondering `ref === stam` eruit
 *      → 1 rood: 'de stam blijft meetellen'
 *   C  de filter alles laten wegnemen (`=> false`)
 *      → 1 rood: 'een open zusterbranch'
 *
 * Drie mutaties, drie verschillende rode tests: de helften bewaken elkaar niet.
 */

const HULPSCRIPTS = [
  'migratiebranches.mjs',
  'migraties-controle.mjs',
  'migratie-hernummer.mjs',
  'migratieregister-omgeving.mjs',
  'letterversies.mjs',
];

let werkmap = '';
let afstand = '';
let kloon = '';

function git(cwd: string, ...argumenten: string[]) {
  return execFileSync('git', argumenten, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'IJking',
      GIT_AUTHOR_EMAIL: 'ijking@example.test',
      GIT_COMMITTER_NAME: 'IJking',
      GIT_COMMITTER_EMAIL: 'ijking@example.test',
    },
  });
}

function migratie(map: string, naam: string) {
  const pad = join(map, 'supabase', 'migrations', `${naam}.sql`);
  mkdirSync(join(map, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(pad, `-- ${naam}.sql — ijking\n--\n-- ROLLBACK-PAD:\n--   n.v.t.\n`);
}

/**
 * `migraties:controle` in de kloon, met zijn uitvoer als tekst.
 *
 * ⚠️ Hij eindigt op deze verzonnen map met exitcode 1 om redenen die hier niet
 *    de vraag zijn (geen register, geen kopregelconventie). Wat wij meten zijn
 *    de regels over branches.
 */
function controle(): string {
  try {
    return execFileSync('node', [join(kloon, 'scripts', 'migraties-controle.mjs')], {
      cwd: kloon,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (fout) {
    const e = fout as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
}

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-geland-'));
  afstand = join(werkmap, 'afstand.git');
  kloon = join(werkmap, 'kloon');

  git(werkmap, 'init', '--bare', '-b', 'main', afstand);

  const bron = join(werkmap, 'bron');
  mkdirSync(bron);
  git(bron, 'init', '-b', 'main');
  migratie(bron, '0001_begin');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'begin');
  git(bron, 'remote', 'add', 'origin', afstand);
  git(bron, 'push', '-u', 'origin', 'main');

  // ── De gelande zuster ──────────────────────────────────────────────────
  //
  // Ze claimde 0002 onder haar eigen naam, landde in `main`, en werd daar
  // hernummerd naar 0003 omdat er intussen een ander 0002 stond. Dat is
  // letterlijk wat er in dit project gebeurt: wie als tweede merget, hernummert.
  git(bron, 'checkout', '-b', 'zuster-geland');
  migratie(bron, '0002_van_de_zuster');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'zuster');
  git(bron, 'push', '-u', 'origin', 'zuster-geland');

  git(bron, 'checkout', 'main');
  git(bron, 'merge', '--no-ff', '-m', 'zuster geland', 'zuster-geland');
  git(
    bron,
    'mv',
    join('supabase', 'migrations', '0002_van_de_zuster.sql'),
    join('supabase', 'migrations', '0003_van_de_zuster.sql'),
  );
  git(bron, 'commit', '-m', 'hernummerd naar 0003');
  git(bron, 'push', 'origin', 'main');

  // ── De open zuster ─────────────────────────────────────────────────────
  //
  // Zelfde vorm, maar niet geland. Deze móet gemeld blijven worden.
  git(bron, 'checkout', '-b', 'zuster-open');
  migratie(bron, '0002_van_de_open_zuster');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'open zuster');
  git(bron, 'push', '-u', 'origin', 'zuster-open');

  // ── De werkkopie ───────────────────────────────────────────────────────
  //
  // Kloont `main` (0001 + 0003) en gebruikt 0002 zelf onder een eigen naam.
  git(werkmap, 'clone', afstand, kloon);
  mkdirSync(join(kloon, 'scripts'), { recursive: true });
  for (const naam of HULPSCRIPTS) {
    cpSync(join(process.cwd(), 'scripts', naam), join(kloon, 'scripts', naam));
  }
  migratie(kloon, '0002_van_mij');

  // ── En `main` loopt vooruit ────────────────────────────────────────────
  //
  // ⚠️ Ná het klonen, en dat is de hele opzet van de derde test: de kloon mist
  //    0004 en `origin/main` draagt hem. Zou de filter de stam meenemen, dan
  //    verdween die melding — en dat is precies het geval waarvoor stap 4
  //    gebouwd is (QS8-238).
  git(bron, 'checkout', 'main');
  migratie(bron, '0004_van_main');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'main loopt vooruit');
  git(bron, 'push', 'origin', 'main');

  git(kloon, 'fetch', 'origin');
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

describe('een gelande branch is geen botsing', () => {
  it('meldt een gelande zusterbranch niet meer', () => {
    // ⚠️ `origin/zuster-geland` draagt `0002_van_de_zuster.sql` en deze map
    //    draagt `0002_van_mij.sql`. Op de naam is dat een botsing; op de
    //    geschiedenis is het er geen, want die zuster zit volledig in
    //    `origin/main` en haar migratie staat hier gewoon, als 0003.
    expect(controle()).not.toContain('origin/zuster-geland');
  });

  it('maar meldt een open zusterbranch nog steeds', () => {
    // ⚠️ **De must-allow, en de reden dat deze suite meer dan één test heeft.**
    //    Zonder deze regel is de reparatie niet van "de controle uitzetten" te
    //    onderscheiden. Dit is de belofte waar `migraties:controle` voor bestaat.
    const uit = controle();

    expect(uit).toContain('origin/zuster-open');
    expect(uit).toContain('0002_van_mij.sql');
    expect(uit).toContain('0002_van_de_open_zuster.sql');
  });

  it('en de stam blijft meetellen, ook al zit die in zichzelf', () => {
    // ⚠️ `origin/main` is trivialiter een voorouder van `origin/main`. Een filter
    //    die dat niet uitzondert neemt de stam mee, en dan verdwijnt de melding
    //    *main draagt migraties die hier ontbreken* — het nuttigste geval van
    //    stap 4 en de reden dat die stap bestaat (QS8-238): je branch loopt
    //    achter en moet `main` binnenhalen.
    const uit = controle();

    expect(uit).toContain('origin/main draagt 1 migratie(s) die hier ontbreken: 0004');
  });
});
