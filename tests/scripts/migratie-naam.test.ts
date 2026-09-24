import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { keurBestandsnaam, normaliseerTitel } from '../../scripts/migratie-nieuw.mjs';
import { ontleedNaam } from '../../scripts/migratie-hernummer.mjs';
import { kopieerHulpscripts } from './hulpscripts.js';

/**
 * IJking van de bestandsnaam die `migratie:nieuw` uitdeelt — QS8-584.
 *
 * ⚠️⚠️ **De belofte is niet "koppeltekens worden streepjes".** Dat is de
 *    normalisatie, en die is een gewoonte: ze dekt de vormen waar iemand aan
 *    gedacht heeft en faalt stil op de vorm waar niemand aan dacht. De belofte
 *    is: *wat dit script schrijft, leest `migraties:controle` straks als een
 *    geldige migratie* — en die twee moeten het eens zijn omdat ze dezelfde
 *    regel gebruiken, niet omdat ze vandaag toevallig hetzelfde vinden.
 *
 * 📏 **Het geval.** Op 22-09-2026 gaf
 *    `npm run migratie:nieuw -- "… toetst elke bovenste or-tak apart"` het
 *    bestand `0295_…_or-tak_apart.sql`. `migraties:controle` weigert die naam,
 *    en `migratie-hernummer.test.ts` wordt er rood van — maar pás in de poort,
 *    dus ná de kop, het beslisdocument en de commit. Bij QS8-461 was het twee
 *    handelingen om terug te draaien; met één padverwijzing erbij waren het er
 *    meer geweest.
 *
 * ⚠️ **Waarom een integratiehelft en niet alleen units.** De regel zelf staat
 *    hieronder los onder toets. Wat een unit níét kan stellen is of de CLI die
 *    regel ook dáár toepast waar het misging — vraag 3 en vraag 5 uit CLAUDE.md.
 *    Daarom draait de tweede helft het echte script in een tijdelijke kloon, en
 *    legt hem de uitvoer van `migraties:controle` naast. Er komt geen netwerk
 *    aan te pas: de "remote" is een bare repo op schijf.
 *
 * IJKING — met de hand gedraaid op 24-09-2026, één mutatie per grendel, met de
 * stand ervóór gemeten: `tests/scripts/` groen op 112 bestanden en 2464 toetsen.
 *
 *   A  `[^a-z0-9]+` in `normaliseerTitel()` terug naar `\s+`   →  6 rood
 *      (de vier normalisatietoetsen, de CLI-schrijftoets en de kop)
 *   B  `keurBestandsnaam()` altijd `null` laten geven,          →  8 rood
 *      mét de normalisatie intact                                 (de zes
 *      grendeltoetsen plus de twee CLI-weigeringen)
 *   C  de aanroep van `keurBestandsnaam()` uit `hoofd()`        →  2 rood
 *      (alleen de twee CLI-weigeringen)
 *   D  de `oudeBasis === null`-poort uit `migratie-hernummer.mjs` → 1 rood,
 *      en de uitvoer is dan de `TypeError` in plaats van een melding
 *
 * ⚠️⚠️ **B is de mutatie die het issue vraagt en A is hem niet.** A zet de
 *    normalisatie uit, en dan is er niets meer te weigeren óók als de grendel
 *    werkt — wat er omvalt is de gewoonte. B doet het omgekeerde: normalisatie
 *    aan, grendel uit. Dan blijft er één soort toets rood, en dat is de toets
 *    die zegt dat het script zijn eigen uitvoer leest. Een mutatie die meer
 *    breekt dan de grendel die je meet, meet die grendel niet.
 *
 * 📏 **En de bestaande mapcontrole werd bij géén van de vier rood.**
 *    `migratie-hernummer.test.ts` toetst de echte migratiemap, en die is schoon;
 *    hij kan pas iets vinden nádat een kapotte naam geschreven én bewaard is. Dat
 *    is precies de te late detectie die QS8-584 vervangt, en het is de reden dat
 *    het issue vraagt om te kijken wélke toets omvalt.
 */

/** Wat de kloon mag draaien; de afhankelijkheden leidt `hulpscripts.ts` af. */
const ENTRIES = ['migratie-nieuw.mjs', 'migraties-controle.mjs', 'migratie-hernummer.mjs'];

let werkmap = '';
let kloon = '';

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
    },
  });
}

function migratie(map: string, naam: string) {
  mkdirSync(join(map, 'supabase', 'migrations'), { recursive: true });
  writeFileSync(
    join(map, 'supabase', 'migrations', `${naam}.sql`),
    `-- ${naam}.sql — ijking\n--\n-- ROLLBACK-PAD:\n--   n.v.t.\n`,
  );
}

/** Een script in de kloon, met exitcode en uitvoer als gewone waarden. */
function draai(script: string, ...argumenten: string[]) {
  try {
    const uit = execFileSync('node', [join(kloon, 'scripts', script), ...argumenten], {
      cwd: kloon,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, uitvoer: uit };
  } catch (fout) {
    const e = fout as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, uitvoer: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function migratiesIn(): string[] {
  return readdirSync(join(kloon, 'supabase', 'migrations')).sort();
}

beforeAll(() => {
  werkmap = mkdtempSync(join(tmpdir(), 'gb-migratienaam-'));
  const afstand = join(werkmap, 'afstand.git');
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

  git(werkmap, 'clone', afstand, kloon);
  kopieerHulpscripts(kloon, ENTRIES);
});

afterAll(() => {
  if (werkmap !== '') rmSync(werkmap, { recursive: true, force: true });
});

describe('normaliseerTitel', () => {
  // MUST-FIND: de vormen die hij móét omzetten.
  it('maakt van een koppelteken een liggend streepje', () => {
    expect(normaliseerTitel('leesroute_bewaking toetst elke bovenste or-tak apart')).toBe(
      'leesroute_bewaking_toetst_elke_bovenste_or_tak_apart',
    );
  });

  it('haalt hoofdletters en accenten weg', () => {
    expect(normaliseerTitel('Een Café-Meting, wéér')).toBe('een_cafe_meting_weer');
  });

  it('maakt van een groepje leestekens één streepje en niet één per teken', () => {
    // ⚠️ Anders geeft `a — b` drie streepjes achter elkaar, en dat leest als
    //    een tikfout in plaats van als een scheiding.
    expect(normaliseerTitel('a — b')).toBe('a_b');
    expect(normaliseerTitel('  ...voorop en achteraan!!!  ')).toBe('voorop_en_achteraan');
  });

  // MUST-ALLOW: de vormen die hij met rust moet laten.
  it('laat een naam die al goed is ongemoeid', () => {
    expect(normaliseerTitel('de_klok_van_de_groep')).toBe('de_klok_van_de_groep');
    expect(normaliseerTitel('weekpas_0039_nazorg')).toBe('weekpas_0039_nazorg');
  });

  it('geeft een lege naam bij een titel van louter leestekens', () => {
    // Niet "iets verzinnen" — dit is het geval dat de grendel hoort te vangen.
    expect(normaliseerTitel('— … !')).toBe('');
  });
});

describe('keurBestandsnaam', () => {
  // MUST-ALLOW.
  it('laat een geldige migratienaam door', () => {
    expect(keurBestandsnaam('0299_de_klok_van_de_groep.sql')).toBeNull();
    expect(keurBestandsnaam('0039a_weekpas_maximum_niet_voor_anon.sql')).toBeNull();
  });

  // MUST-FIND: elk van de vormen die de poort straks weigert.
  it.each([
    ['een koppelteken', '0299_or-tak_apart.sql'],
    ['een hoofdletter', '0299_Or_Tak.sql'],
    ['een accent', '0299_een_café.sql'],
    ['een lege slug', '0299_.sql'],
    ['geen nummer', 'or_tak_apart.sql'],
  ])('weigert %s', (_wat, naam) => {
    const bezwaar = keurBestandsnaam(naam);
    expect(bezwaar).not.toBeNull();
    expect(bezwaar).toContain(naam);
    expect(bezwaar).toContain('NNNN[a-z]_kleine_letters.sql');
  });

  it('meet met dezelfde regel waarmee de controle leest', () => {
    // ⚠️ Dít is de belofte van punt 2 uit QS8-584: geen tweede kopie van het
    //    patroon, maar `ontleedNaam()` — de functie die `migraties:controle`
    //    gebruikt om ditzelfde bestand te lezen.
    for (const naam of ['0299_goed.sql', '0299_fout-.sql', '0299_.sql', '0299a_goed.sql']) {
      expect(keurBestandsnaam(naam) === null).toBe(ontleedNaam(naam) !== null);
    }
  });
});

describe('de CLI in een echte kloon', () => {
  it('schrijft een geldige naam bij een titel met koppelteken, hoofdletter en accent', () => {
    const { code, uitvoer } = draai(
      'migratie-nieuw.mjs',
      'Leesroute-bewaking toetst elke bovenste or-tak apart, wéér',
    );

    expect(code).toBe(0);
    expect(migratiesIn()).toContain(
      '0002_leesroute_bewaking_toetst_elke_bovenste_or_tak_apart_weer.sql',
    );
    expect(uitvoer).not.toContain('or-tak');
  });

  it('noemt zichzelf in de kop met de naam die hij ook echt schreef', () => {
    // ⚠️ De naad die QS8-461 twee handelingen kostte: het sjabloon zet de naam
    //    in regel 1, dus een verkeerde naam staat er meteen twee keer.
    const naam = '0002_leesroute_bewaking_toetst_elke_bovenste_or_tak_apart_weer.sql';
    const kop = readFileSync(join(kloon, 'supabase', 'migrations', naam), 'utf8').split('\n')[0];
    expect(kop).toContain(naam);
  });

  it('wat het script schrijft, leest `migraties:controle` als een leesbare naam', () => {
    // ⚠️⚠️ **De naad, en de reden dat deze suite bestaat.** Beide onderdelen
    //    waren op 22-09 op zichzelf correct: het script schreef wat het beloofde
    //    en de controle weigerde wat ze beloofde te weigeren. Wat er niet was,
    //    was een toets op de knoop ertussen.
    const { uitvoer } = draai('migraties-controle.mjs');
    expect(uitvoer).not.toContain('Onleesbare bestandsnaam');
  });

  it('weigert te schrijven wanneer er na normalisatie niets overblijft', () => {
    const ervoor = migratiesIn();
    const { code, uitvoer } = draai('migratie-nieuw.mjs', '— … !');

    expect(code).toBe(1);
    expect(uitvoer).toContain('is geen geldige migratienaam');
    expect(uitvoer).toContain('Er is niets geschreven');
    // De harde helft: er is ook werkelijk niets geschreven.
    expect(migratiesIn()).toEqual(ervoor);
  });

  it('weigert al bij `--droog`, zodat de droge run niet iets anders zegt dan de echte', () => {
    const { code, uitvoer } = draai('migratie-nieuw.mjs', '--droog', '???');
    expect(code).toBe(1);
    expect(uitvoer).toContain('is geen geldige migratienaam');
    expect(uitvoer).not.toContain('zou aanmaken');
  });

  it('laat `migratie:hernummer` een onleesbare naam melden in plaats van erover struikelen', () => {
    // 📏 Vóór QS8-584: `TypeError: Cannot read properties of null (reading
    //    'slice')` — een stacktrace, op precies het bestand dat je komt
    //    repareren. Punt 4 van het issue.
    // ⚠️ Een nummer ver boven wat de toetsen hierboven uitdelen, zodat deze
    //    toets niet meet wat een vóórganger toevallig geschreven heeft — dat
    //    maakte hem bij mutatie B rood om de verkeerde reden.
    migratie(kloon, '0090_leesroute_or-tak_apart');
    // `--register-ongemeten`: er is hier geen Supabase, en het register is niet
    // de vraag van deze toets.
    const { code, uitvoer } = draai(
      'migratie-hernummer.mjs',
      '0090',
      '0091',
      '--droog',
      '--register-ongemeten',
    );

    expect(code).toBe(1);
    expect(uitvoer).toContain('0090_leesroute_or-tak_apart.sql');
    expect(uitvoer).toContain('NNNN[a-z]_kleine_letters.sql');
    expect(uitvoer).not.toContain('TypeError');
    expect(migratiesIn()).toContain('0090_leesroute_or-tak_apart.sql');
  });
});
