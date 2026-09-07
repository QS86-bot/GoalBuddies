import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Hetzelfde nummer, een ander bestand — QS8-310.
 *
 * ⚠️ **Waarom dit een integratietest is naast de unit-tests in
 *    `migratiebranches.test.ts`.** Die voeden `botsendPerBranch()` hun eigen
 *    `perBranch`-object, en dan is de vraag *"klopt dat object"* per definitie
 *    niet te stellen — dezelfde reden waarom `migratie-fetch.test.ts` bestaat.
 *    De helft die hier onder test staat, is de git-scan: welke branches worden
 *    gelezen, en welke juist niet.
 *
 * ⚠️ **De uitsluiting van je eigen remote tak is de reden dat dit bestand er
 *    is.** Tussen het hernummeren van je eigen migratie en het pushen ervan
 *    draagt `origin/<jouw branch>` nog het oude nummer terwijl je werkkopie het
 *    nieuwe draagt. Zonder uitsluiting wijst de controle dan naar jóuw eigen
 *    achtergebleven push, precies op het moment dat je de poort draait om te
 *    mogen pushen — de melding die je leert wegklikken. Met de hand gemeten in
 *    de echte repo: zonder de uitsluiting stond de eigen branch als achtste rij
 *    in de lijst, met de uitsluiting niet.
 *
 * ⚠️ **Met de hand rood gemaakt, grendel voor grendel:**
 *
 *      1. de uitsluiting van je eigen remote tak eruit
 *         → 'telt niet mee als zusterbranch' rood, de andere twee groen
 *      2. stap 4b eruit uit `migraties-controle.mjs`
 *         → 'wordt gemeld, met beide namen' rood én de vorige, want zonder de
 *           stap wordt er niets meer gemeld om over te oordelen
 *
 *    Mutatie 1 raakt alleen de uitsluiting; dat is precies wat een aparte
 *    grendel hoort te doen.
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
 * ⚠️ Hij eindigt op deze verzonnen map met exitcode 1 om allerlei redenen die
 *    hier niet de vraag zijn (geen kopregel-conventie, geen register). Wat wij
 *    meten is één regel uit zijn uitvoer.
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
  werkmap = mkdtempSync(join(tmpdir(), 'gb-botsing-'));
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

  // Een zusterbranch claimt 0002 onder haar eigen naam.
  git(bron, 'checkout', '-b', 'zuster');
  migratie(bron, '0002_van_de_zuster');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'zuster');
  git(bron, 'push', '-u', 'origin', 'zuster');

  // De werkkopie kloont en gaat op een eigen branch 0002 óók gebruiken.
  git(werkmap, 'clone', afstand, kloon);
  mkdirSync(join(kloon, 'scripts'), { recursive: true });
  for (const naam of HULPSCRIPTS) {
    cpSync(join(process.cwd(), 'scripts', naam), join(kloon, 'scripts', naam));
  }

  git(kloon, 'checkout', '-b', 'mijn-tak');
  migratie(kloon, '0002_van_mij');
  git(kloon, 'add', '-A');
  git(kloon, 'commit', '-m', 'mijn');
  git(kloon, 'push', '-u', 'origin', 'mijn-tak');
  git(kloon, 'fetch', 'origin');
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

describe('een zusterbranch met hetzelfde nummer', () => {
  it('wordt gemeld, met beide namen en de weg terug erbij', () => {
    const uit = controle();

    expect(uit).toContain('origin/zuster');
    expect(uit).toContain('onder een andere naam');
    expect(uit).toContain('0002_van_mij.sql');
    expect(uit).toContain('0002_van_de_zuster.sql');
    expect(uit).toContain('migratie:hernummer');
  });

  it('en `main` wordt niet gemeld, want die draagt hetzelfde bestand', () => {
    // ⚠️ De must-allow. Elke branch die van `main` afstamt draagt al zijn
    //    migraties; zou dezelfde naam ook een botsing zijn, dan meldt de
    //    controle élke branch en leer je hem negeren.
    expect(controle()).not.toContain('origin/main draagt');
  });
});

describe('je eigen remote tak', () => {
  /**
   * ⚠️ **De toestand tussen hernummeren en pushen.** `origin/mijn-tak` draagt
   *    `0002_van_mij.sql`; de werkkopie hernoemt dat naar `0003_…` zonder te
   *    pushen. Zonder uitsluiting zou de controle je eigen achtergebleven push
   *    als zusterbranch melden.
   */
  it('telt niet mee als zusterbranch', () => {
    renameSync(
      join(kloon, 'supabase', 'migrations', '0002_van_mij.sql'),
      join(kloon, 'supabase', 'migrations', '0002_hernoemd.sql'),
    );

    const uit = controle();

    try {
      expect(uit).not.toContain('origin/mijn-tak');
      // En de zuster wordt nog steeds wél gemeld: de uitsluiting is smal en
      // legt de hele stap niet stil.
      expect(uit).toContain('origin/zuster');
    } finally {
      renameSync(
        join(kloon, 'supabase', 'migrations', '0002_hernoemd.sql'),
        join(kloon, 'supabase', 'migrations', '0002_van_mij.sql'),
      );
    }
  });
});
