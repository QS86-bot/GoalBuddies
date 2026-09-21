import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Hernummeren raakt de dossierrij van een ánder issue niet — QS8-580.
 *
 * ⚠️⚠️ **De dossierrij van 07-09-2026 schreef het incident op als een blinde
 *    `sed` van een mens.** 📏 Nagespeeld op 21-09-2026 tegen de vorm van vóór dit
 *    issue: het script deed het **zelf**, en stil — `treffers: 2, gemeld: 0` op
 *    de echte rij van QS8-307. De `sed` was een tweede weg naar dezelfde schade,
 *    niet de oorzaak.
 *
 *    De reden zat in de regel die QS8-277 neerzette: *"een kaal nummer bij een
 *    **uniek** nummer valt er niets te verwarren, dus die wordt gewoon
 *    herschreven"*. Voor code klopt dat — de migratiemap is daar de waarheid.
 *    Voor `docs/ENGINEER-REVIEW.md` niet: dat register is **historisch**, en een
 *    nummer dat vandaag uniek is kan gisteren van een ander zijn geweest.
 *
 * ⚠️⚠️ **Waarom dit een integratietest is en niet alleen units.** De regel staat
 *    met alle vormen los in `tests/scripts/migratie-hernummer.test.ts`. Wat die
 *    toetsen niet kunnen stellen is of de CLI hem ook daadwerkelijk aanzet op
 *    het bestand waar het misging — de wiring `dossier: isDossier(pad)` is
 *    precies één regel, en precies de regel die je vergeet. Dat is vraag 1 uit
 *    onwrikbare regel 18: de naad tussen twee onderdelen die elk kloppen.
 *
 *    Er komt geen netwerk aan te pas: de "remote" is een bare repo op schijf,
 *    net als in `tests/scripts/migratie-hernummer-botsing.test.ts`.
 *
 * ⚠️ **Het nummer is hier met opzet uniek.** Bij een gedeeld nummer meldde het
 *    script al en raakte het niets aan; dan zou deze toets groen zijn zonder de
 *    reparatie. Het geval dat ertoe doet is juist dat ene bestand op 0174.
 *
 * IJKING — met de hand gedraaid op 21-09-2026, één mutatie per grendel, met
 * vooraf gemeten **0 rood** over de drie suites rond dit script samen
 * (`migratie-hernummer`, `-botsing` en dit bestand):
 *
 *   | # | Mutatie | units | integratie |
 *   |---|---|---|---|
 *   | A | `\|\| dossier` weg uit de kale tak | 3 | 4 |
 *   | B | `dossier: isDossier(pad)` weg uit de CLI | **0** | **4** |
 *   | C | `isDossier()` geeft altijd `false` | 1 | 4 |
 *   | D | de dossiertak slaat ook de volle naam over | 3 | 3 |
 *   | E | de titel niet meesturen in de melding | 1 | 0 |
 *   | F | `rijtitel()` leest de datumcel | 2 | 0 |
 *
 * ⚠️⚠️ **B is de mutatie waar dit bestand voor bestaat.** Haal je alleen de
 *    wiring uit de CLI, dan blijven álle unittoetsen groen — de regel klopt nog
 *    steeds, hij wordt alleen niet meer aangeroepen. Dat is dezelfde vorm als
 *    het gat dat QS8-277 twee reparaties lang openhield, en het is de reden dat
 *    een unittoets hier niet genoeg is.
 *
 * ⚠️ En `-botsing` bleef bij alle zes groen: de gedeeld-tak is niet verbouwd.
 */

const HULPSCRIPTS = [
  'migratie-hernummer.mjs',
  'migratiebranches.mjs',
  'migratieregister-omgeving.mjs',
  // ⚠️ Sinds QS8-580 importeert het script `metSchuineStrepen()` hiervandaan.
  //    Ontbreekt dit bestand, dan valt `beforeAll` om — en dan meldt vitest de
  //    toetsen als **skipped** en niet als failed. Ongemeten is niet groen.
  'paden.mjs',
];

let werkmap = '';
let kloon = '';
let uitvoer = '';

/** Git zonder de instellingen van de omringende machine. */
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
      GIT_CONFIG_GLOBAL: join(tmpdir(), 'gb-geen-git-config'),
      GIT_CONFIG_SYSTEM: join(tmpdir(), 'gb-geen-git-config'),
    },
  });
}

function schrijf(pad: string, inhoud: string) {
  mkdirSync(join(pad, '..'), { recursive: true });
  writeFileSync(pad, inhoud);
}

const ONZE = '0174_onze_migratie';

/** De echte rij van QS8-307, zoals hij op 07-09-2026 meeging. */
const VREEMDE_RIJ =
  '| 2026-09-05 | De begunstigde van een straf beslist mee over het respijt (QS8-307) ' +
  '| migratie 0174 zet er een `not exists` op | Middel |';

/** Onze eigen rij, met hetzelfde kale nummer. */
const EIGEN_RIJ = '| 2026-09-06 | Onze eigen rij (QS8-580) | migratie 0174 doet iets | Laag |';

/** En een rij die de volle naam noemt — die is bewijs en gaat wél mee. */
const NAAM_RIJ = `| 2026-09-06 | Met volle naam (QS8-580) | \`${ONZE}.sql\` doet iets | Laag |`;

const DOSSIER = ['# Dossier', '', VREEMDE_RIJ, EIGEN_RIJ, NAAM_RIJ, ''].join('\n');

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-dossier-'));
  const afstand = join(werkmap, 'afstand.git');
  kloon = join(werkmap, 'kloon');

  git(werkmap, 'init', '--bare', '-b', 'main', afstand);
  const bron = join(werkmap, 'bron');
  mkdirSync(bron);
  git(bron, 'init', '-b', 'main');
  schrijf(join(bron, 'supabase', 'migrations', '0001_begin.sql'), '-- 0001_begin.sql — ijking\n');
  git(bron, 'add', '-A');
  git(bron, 'commit', '-m', 'begin');
  git(bron, 'remote', 'add', 'origin', afstand);
  git(bron, 'push', '-u', 'origin', 'main');

  git(werkmap, 'clone', afstand, kloon);
  mkdirSync(join(kloon, 'scripts'), { recursive: true });
  for (const naam of HULPSCRIPTS) {
    cpSync(join(process.cwd(), 'scripts', naam), join(kloon, 'scripts', naam));
  }

  schrijf(
    join(kloon, 'supabase', 'migrations', `${ONZE}.sql`),
    [`-- ${ONZE}.sql — de onze`, '--', '-- ROLLBACK-PAD:', '--   n.v.t.', ''].join('\n'),
  );
  schrijf(join(kloon, 'docs', 'ENGINEER-REVIEW.md'), DOSSIER);

  git(kloon, 'add', '-A');
  git(kloon, 'commit', '-m', 'het dossier');

  uitvoer = execFileSync(
    'node',
    [join(kloon, 'scripts', 'migratie-hernummer.mjs'), `${ONZE}.sql`, '0182', '--register-ongemeten'],
    { cwd: kloon, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

const dossier = () => readFileSync(join(kloon, 'docs', 'ENGINEER-REVIEW.md'), 'utf8');

describe('hernummeren met een uniek nummer, met het dossier erbij', () => {
  it('laat de rij van een ánder issue byte-voor-byte staan', () => {
    // ⚠️ Dít is de assertie waar dit bestand voor bestaat.
    expect(dossier()).toContain(VREEMDE_RIJ);
  });

  it('laat ook de eigen rij staan, in plaats van te raden welke van wie is', () => {
    expect(dossier()).toContain(EIGEN_RIJ);
  });

  it('meldt allebei de rijen, met de titel erbij', () => {
    expect(uitvoer).toContain('kale verwijzing(en) naar 0174 niet aangeraakt');
    expect(uitvoer).toContain('De begunstigde van een straf beslist mee over het respijt (QS8-307)');
    expect(uitvoer).toContain('Onze eigen rij (QS8-580)');
  });

  it('zegt waaróm het dossier anders behandeld wordt', () => {
    expect(uitvoer).toContain('wordt een kaal nummer nóóit herschreven');
  });

  /**
   * ⚠️ **De tegenhelft, en zonder haar bewaakt de rest niets.** Een script dat
   *    het dossier helemáál overslaat haalt de vier gevallen hierboven ook
   *    groen, en laat dan een verwijzing met de volle naam verouderen.
   */
  it('neemt de volle naam wél mee', () => {
    expect(dossier()).toContain('`0182_onze_migratie.sql` doet iets');
    expect(dossier()).not.toContain(`\`${ONZE}.sql\``);
  });
});
