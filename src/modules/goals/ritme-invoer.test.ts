import { describe, expect, it } from 'vitest';

import { dagenUitKeuze, dagopties, GEEN_DAGEN } from './ritme-invoer';
import { MAX_DAGEN_PER_WEEK } from './schemas';

/**
 * De regel achter een ritme-weekdoel — QS8-260, besluit A53.
 *
 * ⚠️ **Deze gevallen bestaan omdat dezelfde belofte drie keer onderbroken was en
 *    geen enkele test dat kon zien.** De kolommen, de CHECK, de trigger, de
 *    kolomgrant, `weekdoelSchema` en de dagteller op het dashboard waren alle zes
 *    af; er kwam alleen nooit een getal in. Er was niets kapot, dus er was niets
 *    rood te maken (CLAUDE.md regel 18, vraag 5).
 *
 * ⚠️ **Wat hier getoetst wordt is de belofte en niet de vorm van het formulier.**
 *    "Het scherm heeft een keuzelijst" is een eigenschap van een onderdeel;
 *    "een week telt in dagen precies wanneer de gebruiker dat gekozen heeft" is
 *    de belofte. Dat de knop bestáát houdt `tests/beloftes/bereikbaar.test.ts`
 *    vast.
 */
describe('van een ritmekeuze naar twee dagvelden', () => {
  it('laat een gewoon weekdoel met rust', () => {
    // ⚠️ Twee keer `null` is niet "leeg" maar "dit is een weekdoel zoals vóór
    //    A53". Zou hier een getal uitkomen, dan gaat elk bestaand weekdoel ineens
    //    dagen tellen.
    expect(dagenUitKeuze('weekly', '5', '3')).toEqual({ floor_days: null, ceiling_days: null });
  });

  it('maakt van "elke dag" zeven dagen zonder ernaar te vragen', () => {
    expect(dagenUitKeuze('daily', GEEN_DAGEN, GEEN_DAGEN)).toEqual({
      floor_days: null,
      ceiling_days: MAX_DAGEN_PER_WEEK,
    });
  });

  it('negeert een plafondkeuze bij "elke dag"', () => {
    // Anders bestaat er een stand waarin "elke dag" drie dagen betekent.
    expect(dagenUitKeuze('daily', '3', GEEN_DAGEN).ceiling_days).toBe(MAX_DAGEN_PER_WEEK);
  });

  it('neemt het gekozen aantal bij een paar keer per week', () => {
    expect(dagenUitKeuze('times_per_week', '4', '2')).toEqual({ floor_days: 2, ceiling_days: 4 });
  });

  /**
   * ⚠️ **Een vloer zonder plafond bestaat niet**, en die toestand is met dit
   *    formulier te maken: kies een vloer, zet het ritme terug, kies opnieuw
   *    zonder plafond. `weekdoelSchema` weigert hem met een zin en de CHECK met
   *    een `23514` — allebei te laat voor iets wat het formulier zelf veroorzaakt.
   */
  it('gooit de vloer weg als er geen plafond gekozen is', () => {
    expect(dagenUitKeuze('times_per_week', GEEN_DAGEN, '3')).toEqual({
      floor_days: null,
      ceiling_days: null,
    });
  });

  /**
   * ⚠️ **Afkappen en niet weigeren.** Deze stand ontstaat door het plafond te
   *    verlágen nadat de vloer al gekozen was, en dat is geen invoerfout maar een
   *    tussenstand. Een foutmelding voor het verlagen van je eigen plafond is een
   *    formulier dat je straft voor nadenken.
   */
  it('kapt een vloer die boven het plafond ligt af op het plafond', () => {
    expect(dagenUitKeuze('times_per_week', '3', '6')).toEqual({ floor_days: 3, ceiling_days: 3 });
  });

  it('weigert onzin en een aantal buiten de week', () => {
    for (const onzin of ['0', '8', '-1', '2.5', 'drie', '']) {
      expect(dagenUitKeuze('times_per_week', onzin, GEEN_DAGEN).ceiling_days, onzin).toBeNull();
    }
  });
});

describe('de keuzelijst met dagen', () => {
  const label = (aantal: number) => `${aantal}d`;

  it('geeft één tot zeven dagen', () => {
    expect(dagopties(label).map((o) => o.waarde)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  /**
   * ⚠️ Dezelfde ordening als `weekly_goals_dagen_geordend`. Hier voorkomt hij de
   *    fout in plaats van hem te melden: een vloer boven het plafond is niet te
   *    kiezen.
   */
  it('kapt de vloerlijst af op het plafond', () => {
    expect(dagopties(label, { tot: 3, metGeen: true, geenLabel: 'geen' }).map((o) => o.waarde)).toEqual([
      GEEN_DAGEN,
      '1',
      '2',
      '3',
    ]);
  });

  it('blijft binnen de week, ook bij een onmogelijk plafond', () => {
    expect(dagopties(label, { tot: 99 })).toHaveLength(MAX_DAGEN_PER_WEEK);
    expect(dagopties(label, { tot: 0 })).toHaveLength(1);
  });
});
