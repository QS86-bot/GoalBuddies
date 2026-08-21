import { describe, expect, it } from 'vitest';

import { BEVESTIGING, weekdoelActies } from './acties';
import type { WeeklyGoalStatus } from './metrics';

const ALLE_STATUSSEN: readonly WeeklyGoalStatus[] = [
  'todo',
  'pending',
  'approved',
  'missed',
  'carried',
  'excused',
  'cancelled',
];

describe('weekdoelActies', () => {
  it('biedt op een open weekdoel alles behalve doorschuiven', () => {
    expect(weekdoelActies('todo')).toEqual({
      afronden: true,
      afsluiten: true,
      verwijderen: true,
      doorschuiven: false,
    });
  });

  it('laat een ingediend weekdoel alleen opnieuw indienen', () => {
    // Er hangt een voltooiing aan, en die is append-only (domeinregel 6).
    expect(weekdoelActies('pending')).toEqual({
      afronden: true,
      afsluiten: false,
      verwijderen: false,
      doorschuiven: false,
    });
  });

  it('biedt doorschuiven uitsluitend op een gemiste week', () => {
    const metDoorschuiven = ALLE_STATUSSEN.filter((s) => weekdoelActies(s).doorschuiven);
    expect(metDoorschuiven).toEqual(['missed']);
  });

  /**
   * ⚠️ De belangrijkste test van dit bestand, want hier zat het gat dat A39 en
   *    A40 gedicht hebben. Zou `cancelled` doorschuiven aanbieden, dan is
   *    afsluiten een gratis route langs het minpunt: sluit af vóór de rollover,
   *    schuif door, en de week is nooit gemist geweest.
   */
  it('biedt op een zelf afgesloten week niets — ook geen doorschuiven', () => {
    expect(weekdoelActies('cancelled')).toEqual({
      afronden: false,
      afsluiten: false,
      verwijderen: false,
      doorschuiven: false,
    });
  });

  it('biedt niets meer op een week die af of vergeven is', () => {
    for (const status of ['approved', 'carried', 'excused'] as const) {
      const acties = weekdoelActies(status);
      expect(Object.values(acties), status).toEqual([false, false, false, false]);
    }
  });

  /**
   * De positieve controle naast de weigeringen hierboven. Zonder deze test
   * blijft alles groen als `weekdoelActies` overal `GEEN` teruggeeft, en dan
   * bewijst dit bestand niets over wat er wél mag.
   */
  it('geeft elke status een antwoord, en niet overal hetzelfde', () => {
    const uitkomsten = ALLE_STATUSSEN.map((s) => JSON.stringify(weekdoelActies(s)));
    expect(uitkomsten).toHaveLength(ALLE_STATUSSEN.length);
    expect(new Set(uitkomsten).size).toBeGreaterThan(1);
  });

  it('staat verwijderen nooit toe zonder dat afsluiten ook mag', () => {
    // Verwijderen is het krappere pad van de twee: het mag alleen binnen de
    // bedenktijd. Kan een status wél verwijderen maar niet afsluiten, dan is er
    // iets omgedraaid.
    for (const status of ALLE_STATUSSEN) {
      const { verwijderen, afsluiten } = weekdoelActies(status);
      if (verwijderen) expect(afsluiten, status).toBe(true);
    }
  });
});

describe('BEVESTIGING', () => {
  it('noemt in elke tekst wat de actie kost of hoe ver hij reikt', () => {
    // "Weet je het zeker?" is geen bevestiging maar een drempel. Elke tekst
    // hier hoort een gevolg te benoemen, niet alleen een vraag te stellen.
    for (const [naam, tekst] of Object.entries(BEVESTIGING)) {
      expect(tekst.uitleg.length, naam).toBeGreaterThan(80);
      expect(tekst.titel, naam).toMatch(/\?$/);
      expect(tekst.bevestig.length, naam).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠️ Deze twee zijn de teksten waar een misverstand geld kost, dus ze staan
   *    onder test in plaats van alleen in een comment.
   */
  it('zegt bij afsluiten dat het een punt kost en de reeks onderbreekt', () => {
    expect(BEVESTIGING.weekdoelAfsluiten.uitleg).toContain('punt');
    expect(BEVESTIGING.weekdoelAfsluiten.uitleg).toContain('reeks');
    expect(BEVESTIGING.weekdoelAfsluiten.uitleg).toContain('weekpas');
  });

  it('zegt bij afronden dat het onomkeerbaar is en wat de groep te zien krijgt', () => {
    // ⚠️ Afronden is de enige handeling die je eigen straf laat vervallen én een
    //    bericht in elke gekoppelde groep plaatst. Allebei onomkeerbaar, dus
    //    allebei benoemd vóór de klik (QS8-83).
    expect(BEVESTIGING.doelAfronden.uitleg).toContain('groep');
    expect(BEVESTIGING.doelAfronden.uitleg).toContain('beloning');
    expect(BEVESTIGING.doelAfronden.uitleg).toContain('Terugzetten kan niet');
  });

  it('zegt bij doorschuiven dat de gemiste week gemist blijft', () => {
    // Dit is precies de verwachting die A39 moest bijstellen: doorschuiven
    // repareerde vroeger je reeks, en nu niet meer.
    expect(BEVESTIGING.weekdoelDoorschuiven.uitleg).toContain('gemist');
    expect(BEVESTIGING.weekdoelDoorschuiven.uitleg).toContain('repareert');
  });

  it('wijst bij een doel met geschiedenis naar archiveren', () => {
    expect(BEVESTIGING.doelVerwijderen.uitleg).toContain('rchiveer');
  });
});
