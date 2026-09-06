import { describe, expect, it } from 'vitest';

import {
  ALLEEN_LOKAAL,
  EIGEN_BESTANDEN,
  beoordeel,
  tijdzonekandidaten,
} from '../../scripts/tijdzones-controle.mjs';

/**
 * De tijdzone-doorsnede tussen de lokale stack en productie — QS8-170.
 *
 * ⚠️ **De belofte is niet "de lijsten verschillen".** Die is: *geen enkele
 *    tijdzone die deze repo noemt, ontbreekt aan één van beide kanten*. Het
 *    gevaar loopt twee kanten op, en de tweede is de stille:
 *
 *    - alleen op productie (`Asia/Calcutta`, `US/Eastern`) -> lokaal rood, luid;
 *    - alleen lokaal (`localtime`, `posixrules`) -> lokaal **groen** en op
 *      productie stuk.
 *
 * ⚠️⚠️ **Mijn eerste versie kon die tweede soort niet zien, en de ijking heeft
 *    dat gevonden.** Het patroon eiste minstens één schuine streep, en juist die
 *    twee namen hebben er geen: `export const ZONE = 'localtime'` in een
 *    testbestand liet de controle **groen**. Regel 18 vraag 3 in zijn zuiverste
 *    vorm — en het kwam alleen boven doordat de ijking de grendel voedde die hij
 *    noemt. Met `'Asia/Calcutta'` was ik weggekomen met een controle die niets
 *    bewaakt.
 */
describe('tijdzonekandidaten', () => {
  it('ziet een naam zónder schuine streep — de vorm die de eerste versie miste', () => {
    expect(tijdzonekandidaten("const z = 'localtime';")).toContain('localtime');
    expect(tijdzonekandidaten('const z = "posixrules";')).toContain('posixrules');
  });

  it('ziet de gewone vorm, in elk aanhalingsteken', () => {
    expect(tijdzonekandidaten("'Europe/Amsterdam'")).toContain('Europe/Amsterdam');
    expect(tijdzonekandidaten('"Pacific/Auckland"')).toContain('Pacific/Auckland');
    expect(tijdzonekandidaten('`Asia/Tokyo`')).toContain('Asia/Tokyo');
  });

  it('ziet een zone met drie delen', () => {
    expect(tijdzonekandidaten("'America/Argentina/Buenos_Aires'")).toContain(
      'America/Argentina/Buenos_Aires',
    );
  });

  it('zwijgt over een naam die alleen in commentaar staat', () => {
    // ⚠️ Zonder deze filter meldt de controle over élke alinea die uitlegt
    //    waaróm `localtime` niet mag — en dat zijn er in deze repo meerdere.
    //    Een controle die klaagt over zijn eigen uitleg, leer je wegklikken.
    const bron = [
      "// gebruik nooit 'localtime' — die bestaat alleen lokaal",
      " * en `posixrules` evenmin; zie 'posixrules' hierboven",
      "-- ook in SQL: 'localtime' is hier een uitleg en geen aanroep",
      "/* 'localtime' */",
    ].join('\n');
    expect(tijdzonekandidaten(bron)).toEqual([]);
  });

  it('ziet hem wél zodra hij in échte code staat', () => {
    // De must-see: zonder deze helft is "zwijgt over commentaar" ook te halen
    // met een functie die overal over zwijgt.
    expect(tijdzonekandidaten("const zone = 'localtime';")).toEqual(['localtime']);
  });
});

describe('beoordeel', () => {
  it('meldt een zone die alleen lokaal bestaat, mét de reden', () => {
    const uit = beoordeel(['localtime']);
    expect(uit).toHaveLength(1);
    expect(uit[0]?.naam).toBe('localtime');
    expect(uit[0]?.reden).toMatch(/productie bestaat hij niet/);
  });

  it('zwijgt over een zone die beide kanten kennen', () => {
    expect(beoordeel(['Europe/Amsterdam', 'Pacific/Auckland'])).toEqual([]);
  });

  it('zwijgt over alles wat op een pad lijkt en geen tijdzone is', () => {
    // ⚠️ De helft die bepaalt of de controle bruikbaar blijft. Het patroon matcht
    //    élk importpad; er wordt alleen gemeld over wat in ALLEEN_LOKAAL staat.
    //    Een controle die over `modules/goals` klaagt, leer je wegklikken.
    const kandidaten = tijdzonekandidaten(
      "import x from '../modules/goals'; const h = 'Content-Type/json'; const u = 'a/b/c';",
    );
    expect(beoordeel(kandidaten)).toEqual([]);
  });

  it('meldt elke naam één keer, ook als hij vaker voorkomt', () => {
    expect(beoordeel(['localtime', 'localtime', 'localtime'])).toHaveLength(1);
  });
});

describe('het register zelf', () => {
  it('noemt beide gemeten namen, met een reden erbij', () => {
    expect([...ALLEEN_LOKAAL.keys()].sort()).toEqual(['localtime', 'posixrules']);
    for (const [naam, reden] of ALLEEN_LOKAAL) {
      expect(reden.length, `${naam} hoort een reden te dragen`).toBeGreaterThan(20);
    }
  });

  it('zondert precies de twee bestanden uit die de namen zélf moeten noemen', () => {
    // ⚠️ Twee bestanden en geen patroon: een uitzondering als "alles onder
    //    scripts/" zou de volgende echte fout in die map mee wegpoetsen, en
    //    juist daar wonen de grendels van dit project.
    expect([...EIGEN_BESTANDEN].sort()).toEqual([
      'scripts/tijdzones-controle.mjs',
      'tests/scripts/tijdzones.test.ts',
    ]);
  });
});
