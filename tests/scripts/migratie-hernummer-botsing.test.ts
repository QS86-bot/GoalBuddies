import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Hernummeren tijdens een botsing — QS8-277.
 *
 * ⚠️ **De belofte is niet "het bestand krijgt een nieuwe naam".** Dat deed het
 *    script al. De belofte is: *bij het hernummeren verandert er niets aan de
 *    ándere migratie die hetzelfde nummer draagt, en aan geen enkele tekst die
 *    over háár gaat.*
 *
 * ⚠️⚠️ **En dat is het hóófdgeval van dit script en geen randgeval.**
 *    `migratie:hernummer` bestaat om het gevolg van een nummerbotsing op te
 *    ruimen, en de botsing ís de toestand waarin twee bestanden hetzelfde nummer
 *    dragen. 📏 Gemeten op 05-09-2026, bij de vierde botsing:
 *
 *      -- 0159_een_adempauze_telt_niet_als_gemiste_week.sql — …
 *      +-- 0160_een_adempauze_telt_niet_als_gemiste_week.sql — …
 *
 *    De kop van de buurman werd bijgeschreven, plus twee regels in
 *    `docs/ENGINEER-REVIEW.md` die bij het issue van die buurman hoorden. Het
 *    script wíst het zelfs — `kiesBron()` gaf `gedeeld` terug en de CLI drukte
 *    *"loop de lijst na"* — en herschreef daarna alles alsof er niets aan de
 *    hand was. Dat is de disclaimervorm die QS8-247 in `migratie:nieuw` al eens
 *    wegnam.
 *
 * ⚠️ **Waarom een integratietest en niet alleen units.** De regel zelf staat
 *    onder test in `migratie-hernummer.test.ts`, met alle vormen los. Wat die
 *    tests níét kunnen stellen is of de CLI die regel ook daadwerkelijk gebruikt
 *    op de plekken waar het misging — dat is precies vraag 3 uit CLAUDE.md, en
 *    de reden dat het gat er twee reparaties lang in bleef zitten. Er komt geen
 *    netwerk aan te pas: de "remote" is een bare repo op schijf.
 *
 * IJKING — met de hand gedraaid op 05-09-2026, één mutatie per grendel. Niet
 * één mutatie voor de hele controle: dan blijft een grendel die achter een
 * andere ligt ongemeten (CLAUDE.md, bij regel 18).
 *
 *   A  `gedeeld: bron.gedeeld === true` terug naar `false` in de CLI   → 4 rood
 *      (de kop van de buurman, de dossierregel, de melding, de slotregel)
 *   B  de `bekendeBases`-uitzondering eruit                            → 2 rood
 *      (de naam van de buurman wordt dan herschreven én gemeld)
 *   C  het meldblok onderaan stilzetten                                → 1 rood
 *   C' alleen de staart van de slotregel stilzetten                    → 1 rood
 *   E  de basisvervanging eruit                                        → 1 rood
 *      (de dossierregel mét naam blijft dan staan)
 *
 * ⚠️ **C en C' staan apart en dat is de les van de eerste poging.** Ik heb het
 *    meldblok eerst wéggeknipt in plaats van stilgezet, en toen vielen er vijf
 *    tests om — het script deed daarna iets anders dan alleen zwijgen. Een
 *    mutatie die meer breekt dan de grendel die je meet, meet die grendel niet.
 */

const HULPSCRIPTS = [
  'migratie-hernummer.mjs',
  'migratiebranches.mjs',
  'migratieregister-omgeving.mjs',
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

const ONZE = '0009_onze_migratie';
const ANDER = '0009_van_de_ander';

/**
 * ⚠️ De kop van de buurman noemt zijn éígen naam, en zijn body noemt een kaal
 *    0009 dat over hemzelf gaat. Allebei moeten ze blijven staan — dit bestand
 *    is de meetlat.
 */
const ANDER_INHOUD = [
  `-- ${ANDER}.sql — de migratie van de andere sessie`,
  '--',
  '-- ROLLBACK-PAD:',
  '--   n.v.t.',
  '--',
  '-- Deze migratie heet 0009 en dat hoort zo te blijven.',
  '',
].join('\n');

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-hernummer-'));
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

  // De botsing: twee migraties op 0009, allebei in de werkkopie.
  schrijf(
    join(kloon, 'supabase', 'migrations', `${ONZE}.sql`),
    [
      `-- ${ONZE}.sql — de onze`,
      '--',
      '-- ROLLBACK-PAD:',
      '--   Draai 0009 terug; dit nummer gaat over onszelf.',
      '--',
      `-- ⚠️ Niet te verwarren met ${ANDER}.sql, die toevallig hetzelfde nummer draagt.`,
      '',
    ].join('\n'),
  );
  schrijf(join(kloon, 'supabase', 'migrations', `${ANDER}.sql`), ANDER_INHOUD);

  // Een dossier met allebei de vormen op één plek.
  schrijf(
    join(kloon, 'docs', 'DOSSIER.md'),
    [
      '# Dossier',
      '',
      `1. Opgelost met ${ONZE}.sql — dit is de onze, met naam en al.`,
      '2. Opgelost met migratie 0009 (van de andere sessie) — kaal, en niet van ons.',
      '',
    ].join('\n'),
  );

  git(kloon, 'add', '-A');
  git(kloon, 'commit', '-m', 'de botsing');

  uitvoer = execFileSync(
    'node',
    [join(kloon, 'scripts', 'migratie-hernummer.mjs'), `${ONZE}.sql`, '0010', '--register-ongemeten'],
    { cwd: kloon, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

const migraties = () => join(kloon, 'supabase', 'migrations');
const lees = (...pad: string[]) => readFileSync(join(kloon, ...pad), 'utf8');

describe('hernummeren terwijl twee migraties hetzelfde nummer dragen', () => {
  it('hernoemt het aangewezen bestand en niet het andere', () => {
    const namen = readdirSync(migraties()).sort();
    expect(namen).toEqual(['0001_begin.sql', `${ANDER}.sql`, '0010_onze_migratie.sql'].sort());
  });

  it('laat de andere migratie byte-voor-byte met rust', () => {
    // ⚠️ **Dit is de assertie waar dit bestand voor bestaat.** Vóór QS8-277 werd
    //    hier de kopregel bijgeschreven en heette het bestand 0009 met een kop
    //    die 0010 zei — precies de leugen die `migraties:controle` bewaakt.
    expect(lees('supabase', 'migrations', `${ANDER}.sql`)).toBe(ANDER_INHOUD);
  });

  it('herschrijft in het gekozen bestand zowel de kop als zijn eigen nummer', () => {
    const inhoud = lees('supabase', 'migrations', '0010_onze_migratie.sql');

    expect(inhoud.split('\n')[0]).toBe('-- 0010_onze_migratie.sql — de onze');
    expect(inhoud).toContain('Draai 0010 terug');
  });

  it('laat de naam van de ander ook binnen ons eigen bestand staan', () => {
    // Een verwijzing naar een ánder bestand is geen verwijzing naar onszelf,
    // ook niet in het bestand dat we aan het hernummeren zijn.
    expect(lees('supabase', 'migrations', '0010_onze_migratie.sql')).toContain(`${ANDER}.sql`);
  });

  it('werkt in een dossier alleen de verwijzing bij die de volle naam noemt', () => {
    const dossier = lees('docs', 'DOSSIER.md');

    expect(dossier).toContain('Opgelost met 0010_onze_migratie.sql');
    // ⚠️ De kale regel gaat over de ánder en blijft dus staan. Vóór QS8-277 werd
    //    hier geschiedenis herschreven, stil.
    expect(dossier).toContain('Opgelost met migratie 0009 (van de andere sessie)');
  });

  it('meldt het kale nummer dat het niet aanraakte, met bestand en regel', () => {
    expect(uitvoer).toContain('niet aangeraakt');
    expect(uitvoer).toContain('docs/DOSSIER.md');
    expect(uitvoer).toMatch(/regel 4: .*van de andere sessie/);
  });

  it('en meldt de naam van de buurman júist niet als twijfelgeval', () => {
    // Een melding die je altijd wegwuift, leer je wegwuiven. De naam van een
    // bestand dat in de map staat, is geen twijfelgeval.
    expect(uitvoer).not.toContain(`${ANDER}.sql —`);
  });

  it('zegt in zijn slotregel dat er werk is blijven liggen', () => {
    expect(uitvoer).toMatch(/✓ hernummerd, maar \d+ kale verwijzing\(en\)/);
  });
});
