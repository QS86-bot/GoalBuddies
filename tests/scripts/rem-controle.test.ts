import { describe, expect, it } from 'vitest';

import { AFWIJKENDE_GRENS, beoordeel, ontleed, ZONDER_REM } from '../../scripts/rem-controle.mjs';

/**
 * QS8-522 — de controle die bewaakt dat elke beschrijfbare tabel een rem draagt.
 *
 * ⚠️ **Deze tests voeren het script zijn gevallen met de hand aan.** De vraag
 *    zelf draait tegen een opgebouwde database en is daar niet los te breken; de
 *    beóórdeling is dat wel, en dat is de helft die kan verschuiven.
 *
 * ⚠️ **Elke tak apart, en niet één mutatie voor de hele controle.** Een tabel
 *    zonder rem en een rem met een afwijkende grens zijn twee beloften; een
 *    geval dat allebei tegelijk breekt, bewijst van geen van beide iets.
 */

/** Zoals de database ze oplevert: tabel | remfunctie | grens. */
const GOED = [
  { tabel: 'daily_moves', rem: 'rem_dagzetten', grens: 'dagzetten_plafond() * 2' },
  { tabel: 'goals', rem: 'rem_doelen', grens: 'doelen_plafond() * 2' },
];

describe('de nulmeting', () => {
  it('meldt niets over tabellen die allemaal een gewone rem dragen', () => {
    const u = beoordeel(GOED, {}, {});
    expect(u.kaal).toEqual([]);
    expect(u.anders).toEqual([]);
    expect(u.verdwenen).toEqual([]);
    expect(u.metRem).toBe(2);
  });
});

describe('grendel 1 — een lege uitslag is ongemeten en niet groen', () => {
  it('meldt `leeg` bij nul rijen', () => {
    // ⚠️ 📏 Dit is geen verzonnen geval. De eerste versie van dit script vroeg
    //    naar `has_table_privilege`, vond daardoor nul tabellen, en meldde
    //    "0 van de 0" met exitcode 0 — een schone uitslag op een lege vraag.
    expect(beoordeel([], {}, {}).leeg).toBe(true);
  });

  it('meldt `leeg` niet zodra er één rij is', () => {
    expect(beoordeel(GOED, {}, {}).leeg).toBe(false);
  });
});

describe('grendel 2 — een beschrijfbare tabel zonder rem', () => {
  it('wordt gemeld', () => {
    const rijen = [...GOED, { tabel: 'week_reviews', rem: '', grens: '' }];
    expect(beoordeel(rijen, {}, {}).kaal.map((r) => r.tabel)).toEqual(['week_reviews']);
  });

  it('zwijgt zodra de tabel mét een reden in het register staat', () => {
    // ⚠️ De tweede helft telt even zwaar: een controle die alles meldt, leer je
    //    te negeren. `week_reviews` is echt begrensd — door een unieke sleutel —
    //    en dat hoort een reden te zijn en geen melding.
    const rijen = [...GOED, { tabel: 'week_reviews', rem: '', grens: '' }];
    expect(beoordeel(rijen, { week_reviews: 'uniek per periode' }, {}).kaal).toEqual([]);
  });
});

describe('grendel 3 — een rem op een andere grens', () => {
  it('wordt gemeld', () => {
    const rijen = [...GOED, { tabel: 'reports', rem: 'rem_meldingen', grens: '50' }];
    expect(beoordeel(rijen, {}, {}).anders.map((r) => r.tabel)).toEqual(['reports']);
  });

  it('laat `plafond() * 2` met rust, ook met een andere naam ervoor', () => {
    const rijen = [{ tabel: 'x', rem: 'rem_x', grens: 'iets_heel_anders_plafond() * 2' }];
    expect(beoordeel(rijen, {}, {}).anders).toEqual([]);
  });

  it('meldt `plafond() * 3`, want dat is een andere grens', () => {
    const rijen = [{ tabel: 'x', rem: 'rem_x', grens: 'x_plafond() * 3' }];
    expect(beoordeel(rijen, {}, {}).anders).toHaveLength(1);
  });

  it('zwijgt zodra de afwijking mét een reden in het register staat', () => {
    const rijen = [{ tabel: 'reports', rem: 'rem_meldingen', grens: '50' }];
    expect(beoordeel(rijen, {}, { reports: 'vast plafond, gemeten' }).anders).toEqual([]);
  });

  it('meldt een tabel zonder rem niet óók als afwijkende grens', () => {
    // ⚠️ Anders wijst één gat naar twee reparaties, en dan leest de uitslag als
    //    ruis in plaats van als een opdracht.
    const u = beoordeel([{ tabel: 'x', rem: '', grens: '' }], {}, {});
    expect(u.kaal).toHaveLength(1);
    expect(u.anders).toEqual([]);
  });
});

describe('grendel 4 — een register dat achterloopt', () => {
  it('meldt een vrijbrief voor een tabel die niet meer bestaat', () => {
    expect(beoordeel(GOED, { verdwenen_tabel: 'reden' }, {}).verdwenen).toEqual([
      'verdwenen_tabel',
    ]);
  });

  it('meldt een vrijbrief voor een tabel die alsnog een rem kreeg', () => {
    // ⚠️ Goed nieuws en toch rood: de reden dekt niets meer, en een register vol
    //    redenen die niemand nodig heeft, leest niemand na.
    expect(beoordeel(GOED, { goals: 'ooit een reden' }, {}).verdwenen).toEqual(['goals']);
  });

  it('meldt een afwijkingsrij die weer op de standaardgrens staat', () => {
    expect(beoordeel(GOED, {}, { goals: 'ooit anders' }).verdwenen).toEqual(['goals']);
  });

  it('laat een rij die nog wél dekt met rust', () => {
    const rijen = [...GOED, { tabel: 'week_reviews', rem: '', grens: '' }];
    expect(beoordeel(rijen, { week_reviews: 'uniek per periode' }, {}).verdwenen).toEqual([]);
  });
});

describe('het ontleden van wat psql oplevert', () => {
  it('leest drie velden per regel, ook met een lege rem', () => {
    expect(ontleed('goals|rem_doelen|doelen_plafond() * 2\nweek_reviews||\n')).toEqual([
      { tabel: 'goals', rem: 'rem_doelen', grens: 'doelen_plafond() * 2' },
      { tabel: 'week_reviews', rem: '', grens: '' },
    ]);
  });

  it('knipt op `\\r\\n` en niet alleen op `\\n`', () => {
    // ⚠️ De Windows-baan in CI draait deze scripts ook.
    expect(ontleed('goals|rem_doelen|x\r\ngoals2|rem|y\r\n')).toHaveLength(2);
  });
});

describe('het register in dit script', () => {
  it('geeft bij elke vrijbrief een meting en niet alleen een mening', () => {
    // ⚠️ Een reden zonder getal is een vinkje met meer woorden. De toets is het
    //    meetteken dat dit project overal gebruikt.
    for (const [tabel, reden] of Object.entries(ZONDER_REM)) {
      expect(reden, `${tabel} noemt geen meting`).toContain('📏');
    }
    for (const [tabel, reden] of Object.entries(AFWIJKENDE_GRENS)) {
      expect(reden, `${tabel} noemt geen meting`).toContain('📏');
    }
  });

  it('staat vandaag op de twee tabellen die door iets anders begrensd zijn', () => {
    expect(Object.keys(ZONDER_REM).sort()).toEqual(['hero_profiles', 'week_reviews']);
  });
});
