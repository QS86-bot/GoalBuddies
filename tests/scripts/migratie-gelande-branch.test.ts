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
 *         van stap 4;
 *      4. een zuster die `main` nog niet binnengehaald heeft, draagt mijn
 *         migratie onder haar oude nummer — daar valt niets te hernummeren.
 *
 * ⚠️⚠️ **De eerste versie van deze ijking bewaakte haar eigen grendel niet, en
 *    dat is met QS8-323 rechtgezet.** De kop beweerde dat mutatie A één rood
 *    gaf; 📏 letterlijk uitgevoerd gaf hij er **nul**. Twee onafhankelijke
 *    oorzaken, allebei het onthouden waard:
 *
 *      · `expect(controle()).not.toContain(...)` is tevreden met élke uitvoer
 *        die die naam niet noemt — ook een lege, ook een stacktrace. Een
 *        kanarie bewees het: `remoteTakken()` laten werpen maakte test 2 en 3
 *        rood en test 1 **groen**. Vandaar `heeftGedraaid()` naast elke
 *        `not.toContain`.
 *      · De opstelling voerde het geval door een grendel die er al eerder lag.
 *        De gelande zuster draagt een romp die hier ook staat, dus
 *        `botsendPerBranch()` zweeg er al over — grendel 1 werd nergens geraakt.
 *        Vandaar de zuster die hernummerd landde (raakt alleen grendel 1, via
 *        stap 4) en de zuster die achterloopt (raakt alleen grendel 2).
 *
 *    `CLAUDE.md`: *breek de grendel die de ijking nóemt, niet zomaar iets —
 *    anders is de ijking zelf de aanname.*
 *
 * IJKING — met de hand gedraaid op 07-09-2026, gemeten en niet beoogd:
 *
 *   A  de filter overslaan (`return branches`)
 *      → 1 rood: 'meldt een gelande zuster met een hier onbekend nummer niet…'
 *   B  de `romps`-check uit `botsendPerBranch()`
 *      → 1 rood: 'zwijgt over een zuster die mijn migratie … oude nummer draagt'
 *   C  de uitzondering `ref === stam` eruit
 *      → 1 rood: 'en de stam blijft meetellen'
 *   D  de filter alles laten wegnemen (`=> false`)
 *      → 2 rood: 'een open zusterbranch' en 'de stam blijft meetellen'
 *   E  `remoteTakken()` laten werpen (de kanarie)
 *      → 5 rood: álles, want geen enkele test mag een stille controle overleven
 *
 * Vijf mutaties; A, B en C raken elk een ándere test. De helften bewaken elkaar
 * niet, en dát is wat er eerst niet klopte.
 */

const HULPSCRIPTS = [
  'migratiebranches.mjs',
  'migraties-controle.mjs',
  // ⚠️ `migraties-controle` importeert hem sinds QS8-405; zonder deze regel valt
  //    de kloon om op een ontbrekende module in plaats van op wat je toetst.
  'rollbackpad.mjs',
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

  // ── De gelande zuster met een nummer dat hier niet bestaat ─────────────
  //
  // ⚠️ **Deze zuster bestaat om grendel 1 alléén te raken** (QS8-323). De
  //    zuster hierboven wordt óók al door grendel 2 gedekt — haar romp staat
  //    hier immers, als 0003 — dus een mutatie op grendel 1 bleef daar groen.
  //
  //    Deze claimde 0006, landde, en werd hernummerd naar 0004. De werkkopie
  //    kloont `main` en heeft dus 0004; **0006 bestaat hier nergens**. Stap 4
  //    zou daarom melden dat deze branch een migratie draagt die hier
  //    ontbreekt — en stap 4 loopt niet langs `botsendPerBranch()`, dus alleen
  //    de filter in `remoteTakken()` houdt die melding tegen.
  git(bron, 'checkout', 'main');
  git(bron, 'checkout', '-b', 'zuster-hernummerd');
  migratie(bron, '0006_van_de_hernummerde_zuster');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'hernummerde zuster');
  git(bron, 'push', '-u', 'origin', 'zuster-hernummerd');

  git(bron, 'checkout', 'main');
  git(bron, 'merge', '--no-ff', '-m', 'hernummerde zuster geland', 'zuster-hernummerd');
  git(
    bron,
    'mv',
    join('supabase', 'migrations', '0006_van_de_hernummerde_zuster.sql'),
    join('supabase', 'migrations', '0004_van_de_hernummerde_zuster.sql'),
  );
  git(bron, 'commit', '-m', 'hernummerd naar 0004');
  git(bron, 'push', 'origin', 'main');

  // ── De zuster die main nog niet binnengehaald heeft ────────────────────
  //
  // ⚠️ **Deze bestaat om grendel 2 alléén te raken** (QS8-323). Ze vertakt van
  //    `zuster-geland` en heeft daarna een eigen commit, dus ze is géén
  //    voorouder van `main` — grendel 1 laat haar door. Ze draagt
  //    `0002_van_de_zuster.sql`, en diezelfde romp staat hier als 0003.
  //
  //    Er valt daar niets te hernummeren: zij heeft mijn hernummering alleen
  //    nog niet opgehaald. Alleen `botsendPerBranch()` kan daarover zwijgen.
  git(bron, 'checkout', 'zuster-geland');
  git(bron, 'checkout', '-b', 'zuster-achter');
  // ⚠️ **Geen eigen migratie**, met opzet: dan is de enige melding die deze
  //    branch kán opleveren de botsing op 0002, en die moet grendel 2 wegnemen.
  //    Een eigen migratie erbij zou een terechte stap-4-melding geven en de
  //    test onscherp maken — dat is bij het bouwen ook echt gebeurd.
  writeFileSync(join(bron, 'zuster-achter.txt'), 'werk dat geen migratie is\n');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'zuster loopt achter maar werkt door');
  git(bron, 'push', '-u', 'origin', 'zuster-achter');

  // ── De open zuster ─────────────────────────────────────────────────────
  //
  // Zelfde vorm, maar niet geland. Deze móet gemeld blijven worden.
  git(bron, 'checkout', 'main');
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
  migratie(bron, '0005_van_main');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'main loopt vooruit');
  git(bron, 'push', 'origin', 'main');

  git(kloon, 'fetch', 'origin');
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

/**
 * ⚠️ **Elke `not.toContain` staat naast een positief anker, en dat is QS8-323.**
 *
 * De eerste versie van deze suite toetste alleen `not.toContain(...)`. Zo'n
 * assertie is tevreden met élke uitvoer die die naam niet noemt — een lege
 * string, een stacktrace, een controle die helemaal niet draait. 📏 Bewezen met
 * een kanarie: `remoteTakken()` een `throw` geven maakte test 2 en 3 rood en
 * test 1 **groen**. De test die de reparatie bewaakte, overleefde het
 * uitschakelen van de functie die hij bewaakte.
 *
 * Dit anker is dat bewijs, als toets in plaats van als anekdote: crasht de
 * controle, dan ontbreekt deze regel en is élke test in dit bestand rood.
 */
function heeftGedraaid(uit: string): void {
  // Beide uitgangen van het script beginnen hun regel met deze naam — de groene
  // (`… migraties, aaneengesloten …`) en de rode (`… de migratiemap klopt niet`).
  // Een crash, een lege uitvoer of een stacktrace heeft hem niet.
  expect(uit, `de controle heeft niet gedraaid; uitvoer was:\n${uit}`).toContain(
    'migraties-controle:',
  );
}

describe('een gelande branch is geen botsing', () => {
  it('meldt een gelande zusterbranch niet meer', () => {
    // ⚠️ `origin/zuster-geland` draagt `0002_van_de_zuster.sql` en deze map
    //    draagt `0002_van_mij.sql`. Op de naam is dat een botsing; op de
    //    geschiedenis is het er geen, want die zuster zit volledig in
    //    `origin/main` en haar migratie staat hier gewoon, als 0003.
    //
    // ⚠️ **Dit geval wordt óók door grendel 2 gedekt** (`botsendPerBranch()`
    //    zwijgt over een romp die hier al staat), dus het onderscheidt de twee
    //    grendels niet. Daarvoor is de test hieronder over de hernummerde
    //    zuster. Deze blijft staan omdat hij de andere grendel bewaakt.
    const uit = controle();
    heeftGedraaid(uit);
    expect(uit).not.toContain('origin/zuster-geland');
  });

  it('meldt een gelande zuster met een hier onbekend nummer niet als ontbrekend', () => {
    // ⚠️⚠️ **Dit is de test die grendel 1 alléén raakt** — QS8-323.
    //
    //    `origin/zuster-hernummerd` draagt 0006; die landde en werd hernummerd
    //    naar 0007. De werkkopie kloont `main` en heeft dus 0007, en **0006
    //    bestaat hier nergens**. Stap 4 zou daarom melden dat deze branch een
    //    migratie draagt die hier ontbreekt — en stap 4 loopt niet langs
    //    `botsendPerBranch()`, dus alleen de filter in `remoteTakken()` houdt
    //    hem tegen.
    //
    //    📏 Zonder deze test bleef mutatie A (de filter overslaan) groen,
    //    terwijl de kop van dit bestand beweerde dat hij één rood gaf.
    const uit = controle();
    heeftGedraaid(uit);
    expect(uit).not.toContain('origin/zuster-hernummerd');
  });

  it('zwijgt over een zuster die mijn migratie onder haar oude nummer draagt', () => {
    // ⚠️⚠️ **Dit is de test die grendel 2 alléén raakt** — QS8-323.
    //
    //    `origin/zuster-achter` is niet geland, dus grendel 1 laat haar door.
    //    Ze draagt `0002_van_de_zuster.sql` terwijl die romp hier als 0003
    //    staat: zij heeft mijn hernummering alleen nog niet opgehaald. Er valt
    //    daar niets te hernummeren, dus een melding zou verkeerd advies zijn.
    //
    //    📏 Zonder deze test bleef mutatie B (de `romps`-check eruit) groen,
    //    omdat grendel 1 hetzelfde geval al wegfilterde. Twee grendels waar er
    //    één getest is, is er één te veel — de les van QS8-302.
    const uit = controle();
    heeftGedraaid(uit);
    expect(uit).not.toContain('origin/zuster-achter');
  });

  it('maar meldt een open zusterbranch nog steeds', () => {
    // ⚠️ **De must-allow, en de reden dat deze suite meer dan één test heeft.**
    //    Zonder deze regel is de reparatie niet van "de controle uitzetten" te
    //    onderscheiden. Dit is de belofte waar `migraties:controle` voor bestaat.
    const uit = controle();
    heeftGedraaid(uit);

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
    heeftGedraaid(uit);

    expect(uit).toContain('origin/main draagt 1 migratie(s) die hier ontbreken: 0005');
  });
});
