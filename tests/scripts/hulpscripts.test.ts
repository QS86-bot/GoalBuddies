import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { zonderCommentaar } from '../../scripts/zonder-commentaar.mjs';

import { importsluiting, lokaleImports } from './hulpscripts.js';

/**
 * De ijking van de gedeelde scriptsluiting — QS8-585.
 *
 * ⚠️⚠️ **De belofte is niet "hij vindt de imports" maar "een harnas hoeft niets
 *    over te typen".** Dat onderscheid is de hele reden dat dit bestand er is:
 *    de vijf lijsten die hier vervangen worden, wáren juist — op het moment dat
 *    ze getypt werden. Wat ze brak was een import die er later bij kwam. Een
 *    ijking die alleen de huidige sluiting natelt, toetst dezelfde momentopname
 *    nog een keer.
 *
 * ⚠️ **Daarom staat de must-allow-helft hier zwaar aangezet:** een sluiting die
 *    álles meeneemt is ook een sluiting die nooit iets mist, en dan is de kloon
 *    een kopie van `scripts/` en bewijst de harnas niets meer.
 */
describe('lokaleImports: wat telt als een lokale import', () => {
  it('vindt een gewone named import', () => {
    expect(lokaleImports("import { x } from './paden.mjs';")).toEqual(['paden.mjs']);
  });

  it('vindt een bijwerking-import zonder binding', () => {
    expect(lokaleImports("import './opstart.mjs';")).toEqual(['opstart.mjs']);
  });

  it('vindt een dynamische import', () => {
    expect(lokaleImports("const m = await import('./laat.mjs');")).toEqual(['laat.mjs']);
  });

  it('noemt een script één keer, ook bij twee imports eruit', () => {
    const bron = "import { a } from './paden.mjs';\nimport { b } from './paden.mjs';";
    expect(lokaleImports(bron)).toEqual(['paden.mjs']);
  });

  // ⚠️ **Must-allows.** Alles hieronder hoort níet in de kloon.
  it('laat een bare specifier liggen — die komt uit node of node_modules', () => {
    expect(lokaleImports("import { join } from 'node:path';\nimport z from 'zod';")).toEqual([]);
  });

  it('laat een import uit een andere map liggen', () => {
    expect(lokaleImports("import { x } from '../src/shared/tekst.ts';")).toEqual([]);
  });

  // ⚠️⚠️ **De scherpste van de reeks.** Een uitgecommentarieerde import volgen
  //    kost geen fout maar maakt de bewering *"dit is de sluiting"* onwaar, en
  //    dan zoekt de volgende lezer uit waarom er iets in de kloon staat dat
  //    niemand nodig heeft. De knip is de gedeelde uit `zonder-commentaar.mjs`.
  it('laat een uitgecommentarieerde import liggen', () => {
    const bron =
      "// vroeger: import { oud } from './weg.mjs';\n" +
      "/* import { ook } from './ookweg.mjs'; */\n" +
      "import { echt } from './paden.mjs';";
    expect(lokaleImports(bron)).toEqual(['paden.mjs']);
  });

  it('laat een pad in een gewone string liggen — dat is geen import', () => {
    expect(lokaleImports("const uitleg = 'zie ./paden.mjs voor de rest';")).toEqual([]);
  });
});

describe('importsluiting: de transitieve sluiting', () => {
  /** Een verzonnen graafje, zodat de vorm los van de echte map te toetsen is. */
  const NEP: Record<string, string> = {
    'a.mjs': "import { b } from './b.mjs';\nimport { c } from './c.mjs';",
    'b.mjs': "import { d } from './d.mjs';",
    'c.mjs': "import { d } from './d.mjs';",
    'd.mjs': "import { join } from 'node:path';",
    'los.mjs': '',
  };
  const lees = (naam: string) => NEP[naam] ?? '';

  it('neemt de entry zelf mee', () => {
    expect(importsluiting(['los.mjs'], lees)).toEqual(['los.mjs']);
  });

  it('volgt twee niveaus diep', () => {
    expect(importsluiting(['a.mjs'], lees)).toEqual(['a.mjs', 'b.mjs', 'c.mjs', 'd.mjs']);
  });

  it('noemt een gedeelde afhankelijkheid één keer', () => {
    expect(importsluiting(['b.mjs', 'c.mjs'], lees)).toEqual(['b.mjs', 'c.mjs', 'd.mjs']);
  });

  // ⚠️ Zonder deze loopt de lus voor altijd, en een harnas dat hangt is erger
  //    dan een harnas dat omvalt — die laatste zie je tenminste.
  it('blijft niet hangen op een kring', () => {
    const kring = (naam: string) =>
      naam === 'x.mjs' ? "import './y.mjs';" : "import './x.mjs';";
    expect(importsluiting(['x.mjs'], kring)).toEqual(['x.mjs', 'y.mjs']);
  });

  it('geeft twee keer hetzelfde antwoord, in dezelfde volgorde', () => {
    expect(importsluiting(['a.mjs'], lees)).toEqual(importsluiting(['a.mjs'], lees));
  });
});

/**
 * ⚠️⚠️ **De echte map — en hier stond eerst de vérkeerde toets, gevonden door de
 *    ijking van dit issue zelf.**
 *
 *    De eerste versie pinde de sluiting als een lijst van acht namen vast, om te
 *    bewijzen dat de omzetting niets verloor. Dat bewijs klopte — 📏 de afgeleide
 *    sluiting gaf op 22-09-2026 exact de vijf handgetypte lijsten terug (8, 7, 7,
 *    4 en 4 scripts) — maar als **staande** toets deed hij precies het verkeerde:
 *    mutatie 1 van de ijking voegde één import toe aan `scripts/paden.mjs`, alle
 *    zes de harnassen bleven groen zoals beloofd, en déze toets werd rood.
 *
 *    Dat is een toets die de volgende persoon dwingt een handgetypte lijst
 *    `.mjs`-namen bij te werken zodra hij een import toevoegt — het probleem dat
 *    dit hele bestand weghaalt, teruggezet in een assertie. De eenmalige meting
 *    hoort in het beslisdocument; wat hier hoort is de **eigenschap**.
 */
describe('de echte scriptmap', () => {
  const ENTRIES = ['migratie-nieuw.mjs', 'migraties-controle.mjs', 'migratie-hernummer.mjs'];

  it('bevat elke entry en elk van zijn directe imports', () => {
    for (const entry of ENTRIES) {
      const sluiting = importsluiting([entry]);
      expect(sluiting, entry).toContain(entry);
      const direct = lokaleImports(readFileSync(join(process.cwd(), 'scripts', entry), 'utf8'));
      for (const buur of direct) expect(sluiting, `${entry} → ${buur}`).toContain(buur);
    }
  });

  it('gaat dieper dan één niveau — de sluiting is transitief en niet alleen direct', () => {
    // ⚠️ `migraties-controle` importeert `migratie-hernummer`, en díe importeert
    //    `paden`. Staat `paden` er niet in, dan is de sluiting één niveau diep en
    //    is precies de fout van QS8-580 terug.
    expect(importsluiting(['migraties-controle.mjs'])).toContain('paden.mjs');
  });

  it('neemt niet de hele map mee — dan bewees de krappe kloon niets', () => {
    const alles = readdirSync(join(process.cwd(), 'scripts')).filter((n) => n.endsWith('.mjs'));
    expect(alles.length).toBeGreaterThan(50);
    expect(importsluiting(['migratie-hernummer.mjs']).length).toBeLessThan(alles.length / 2);
  });
});

/**
 * De grendel tegen terugkomen — CLAUDE.md, QS8-417: *een reparatie die de
 * instanties opruimt en het mechanisme laat staan, groeit terug.*
 *
 * ⚠️⚠️ **Hij kijkt naar de hándeling en niet naar de lijst, en dat is een
 *    correctie op de eerste versie van deze toets.** Die zocht een array met
 *    twee of meer `.mjs`-namen erin, en meldde daarmee ook de `ENTRIES` van een
 *    harnas dat juist wél omgezet was — een lijst die daar hoort te staan. De
 *    regel is niet *typ geen lijst* maar **kopieer zelf geen scripts naar een
 *    kloon**; dat is dezelfde vorm als `psqlArgumenten()`, waar de regel ook
 *    niet *gebruik deze functie* luidt maar *bouw je eigen aanroep niet*.
 *
 * ⚠️⚠️ **En dat onderscheid vond meteen een zesde harnas.** 📏 Op 22-09-2026
 *    telden zowel de dossierrij van 21-09 als de eerste inventarisatie van deze
 *    ronde **vijf** harnassen. Het zijn er zes:
 *    `claim-gelande-geschiedenis.test.ts` draagt zijn lijst op **één regel**
 *    (`const HULPSCRIPTS = ['claim.mjs', 'migratiebranches.mjs'];`) en viel
 *    daardoor buiten een grep die op een meerregelige array zocht. Zijn lijst
 *    was toevallig compleet — `claim.mjs` importeert precies die ene — dus hij
 *    was niet stuk, alleen onzichtbaar. Woordelijk de les van QS8-414: *een
 *    regel die je met de hand handhaaft, handhaaf je op de vorm die je toevallig
 *    intypt.*
 */
const ZONDER_SLUITING: Record<string, string> = {
  // (leeg) — een reden hoort hier te staan mét de meting die haar draagt.
};

describe('geen enkel harnas kopieert zijn scripts nog zelf', () => {
  it('vindt geen kopieeractie uit scripts/ in de testboom', () => {
    const bevindingen = [];
    for (const pad of testbestanden(join(process.cwd(), 'tests'))) {
      const kort = pad.slice(process.cwd().length + 1);
      if (kort in ZONDER_SLUITING) continue;
      const bron = zonderCommentaar(readFileSync(pad, 'utf8')) as string;
      for (const aanroep of bron.matchAll(/\b(?:cpSync|copyFileSync)\([^;]*?'scripts'/g)) {
        bevindingen.push(`${kort}: ${aanroep[0].replace(/\s+/g, ' ').slice(0, 60)}`);
      }
    }
    expect(bevindingen, 'gebruik kopieerHulpscripts() uit tests/scripts/hulpscripts.ts').toEqual(
      [],
    );
  });

  // ⚠️ Must-allow. Een harnas dat `package.json` meekopieert doet iets anders —
  //    dat is geen script en heeft geen importsluiting.
  it('laat een kopie van iets anders dan een script met rust', () => {
    const bron = "cpSync(join(process.cwd(), 'package.json'), join(kloon, 'package.json'));";
    expect([...bron.matchAll(/\b(?:cpSync|copyFileSync)\([^;]*?'scripts'/g)]).toEqual([]);
  });
});

function testbestanden(map: string): string[] {
  const uit: string[] = [];
  for (const item of readdirSync(map, { withFileTypes: true })) {
    const pad = join(map, item.name);
    if (item.isDirectory()) uit.push(...testbestanden(pad));
    else if (item.name.endsWith('.test.ts')) uit.push(pad);
  }
  return uit;
}
