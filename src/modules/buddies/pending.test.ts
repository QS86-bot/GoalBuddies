import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow } from '../../shared/time';

import {
  bewaarOpenstaandeUitnodiging,
  openstaandeUitnodiging,
  routeVoorUitnodiging,
  UITNODIGING_GELDIG_UREN,
  vergeetOpenstaandeUitnodiging,
} from './pending';

/**
 * Besluit A49 (QS8-136) — een bewaarde uitnodigingscode verloopt.
 *
 * ⚠️ **Waarom dit een test verdient en niet alleen een regel code.** Deze opslag
 *    is gebouwd toen meedoen aan een groep geen privacygevolgen had. Sinds
 *    besluit A41 heeft het die wel: toetreden tot een open groep maakt je
 *    gemiste weken zichtbaar voor de anderen. De vervaltermijn is dus geen
 *    opruimwerk maar een toestemmingsgrens, en die hoort onder test.
 *
 * ⚠️ De klok wordt stilgezet met `freezeNow()`. Een test die op een echte klok
 *    wacht, bestaat niet in dit project — en een test die de grens niet kan
 *    passeren, toetst hem niet.
 */

const OPSLAG = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (sleutel: string) => Promise.resolve(OPSLAG.get(sleutel) ?? null),
    setItem: (sleutel: string, waarde: string) => {
      OPSLAG.set(sleutel, waarde);
      return Promise.resolve();
    },
    removeItem: (sleutel: string) => {
      OPSLAG.delete(sleutel);
      return Promise.resolve();
    },
  },
}));

// ⚠️ Zonder streepjes: `normaliseerCode()` haalt ze eruit en de opslag bewaart
//    de vorm die de server herkent. De streepjesvorm is alleen voor het scherm.
const CODE = 'VYHC2X9GSRVH';
const SLEUTEL = 'goalbuddies.openstaande-uitnodiging';

beforeEach(() => {
  OPSLAG.clear();
});

afterEach(() => {
  unfreezeNow();
});

describe('een bewaarde uitnodiging', () => {
  it('mag meteen vanzelf verzilverd worden', async () => {
    await bewaarOpenstaandeUitnodiging(CODE);

    expect(await openstaandeUitnodiging()).toEqual({ code: CODE, automatisch: true });
  });

  it('mag dat vlak vóór de termijn nog steeds', async () => {
    const ontdooi = freezeNow(new Date('2026-08-24T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);
    ontdooi();

    freezeNow(new Date('2026-08-25T11:00:00Z'));

    expect((await openstaandeUitnodiging())?.automatisch).toBe(true);
  });

  it('mag dat niet meer erna, en blijft wél bestaan', async () => {
    // ⚠️ Het scenario uit de reviewronde: iemand opent de link, besluit niet mee
    //    te doen, en maakt twee weken later een account aan. Zonder deze grens
    //    stond hij daarna in die groep.
    //
    //    ⚠️ En de code blijft staan. Weggooien zou de uitnodiging doodmaken, en
    //    dat is precies wat deze opslag moest voorkomen — de gebruiker landt nu
    //    op het uitnodigingsscherm en drukt zelf.
    const ontdooi = freezeNow(new Date('2026-08-10T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);
    ontdooi();

    freezeNow(new Date('2026-08-24T12:00:00Z'));

    expect(await openstaandeUitnodiging()).toEqual({ code: CODE, automatisch: false });
  });

  it('telt precies de afgesproken termijn', async () => {
    // Legt het getal vast waar de rest van deze test op leunt.
    expect(UITNODIGING_GELDIG_UREN).toBe(24);
  });

  it('telt de vorm van vóór A49 als verlopen', async () => {
    // ⚠️ Een kale code zonder tijdstip: de leeftijd is onbekend, en onbekend is
    //    hier de kant waar niets vanzelf gebeurt. De code gaat wél mee terug.
    OPSLAG.set(SLEUTEL, CODE);

    expect(await openstaandeUitnodiging()).toEqual({ code: CODE, automatisch: false });
  });

  it('geeft niets terug als er niets staat, of als het onzin is', async () => {
    expect(await openstaandeUitnodiging()).toBeNull();

    OPSLAG.set(SLEUTEL, JSON.stringify({ code: 'geen-code', op: '2026-08-24T12:00:00Z' }));
    expect(await openstaandeUitnodiging()).toBeNull();
  });

  it('is weg na vergeten', async () => {
    await bewaarOpenstaandeUitnodiging(CODE);
    await vergeetOpenstaandeUitnodiging();

    expect(await openstaandeUitnodiging()).toBeNull();
  });
});

describe('de klok loopt door als je dezelfde link nog eens opent', () => {
  /**
   * ⚠️ **Het gat dat A49 in de praktijk ongedaan maakte, gevonden op 25-08-2026.**
   *    `app/uitnodiging/[code].tsx` bewaart de code bij elke mount — nodig, want
   *    de uitnodiging moet de bevestigingsmail en de onboarding overleven. En
   *    `app/_layout.tsx` stuurt een vérlopen code juist naar dát scherm, want
   *    weggooien zou de uitnodiging doodmaken.
   *
   *    Allebei goed, samen fout: het scherm schreef een vers tijdstip, dus na één
   *    passage was de code weer jong. Wie op dag 0 afhaakte, langs het scherm
   *    kwam op dag 14 en de app sloot zonder te drukken, stond bij de volgende
   *    start stilzwijgend in de groep. De vervaltermijn hield één app-start
   *    stand. Twee correcte onderdelen, een naad die van niemand was.
   */
  it('houdt het oorspronkelijke tijdstip aan bij dezelfde code', async () => {
    freezeNow(new Date('2026-08-01T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);

    // Twee weken later: verlopen, gebruiker landt op het uitnodigingsscherm, en
    // dát scherm bewaart opnieuw.
    freezeNow(new Date('2026-08-15T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);

    const wachtend = await openstaandeUitnodiging();

    expect(wachtend?.code).toBe(CODE);
    expect(wachtend?.automatisch).toBe(false);
  });

  it('geeft een ándere code wél een verse termijn', async () => {
    // Een nieuwe uitnodiging is een nieuwe toestemming en begint aan zijn eigen
    // 24 uur. Zou dit niet werken, dan was de reparatie hierboven te grof.
    freezeNow(new Date('2026-08-01T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);

    freezeNow(new Date('2026-08-15T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging('ZZZZ22223333');

    const wachtend = await openstaandeUitnodiging();

    expect(wachtend?.code).toBe('ZZZZ22223333');
    expect(wachtend?.automatisch).toBe(true);
  });

  it('maakt de kale vorm van vóór A49 niet alsnog levend', async () => {
    // Die vorm telt als verlopen. Hem hier overschrijven met een vers tijdstip
    // zou precies de oude opslag weer laten toetreden.
    OPSLAG.set(SLEUTEL, CODE);

    freezeNow(new Date('2026-08-15T12:00:00Z'));
    await bewaarOpenstaandeUitnodiging(CODE);

    expect((await openstaandeUitnodiging())?.automatisch).toBe(false);
  });
});

describe('waar een bewaarde uitnodiging naartoe leidt', () => {
  /**
   * ⚠️ **De zwaarste helft van A49 stond tot 25-08-2026 volledig in
   *    `app/_layout.tsx` en had geen enkele test.** Dat kon ook niet: er is geen
   *    `.test.tsx` in dit project en vitest draait in node. De belofte "een open
   *    groep gaat nooit vanzelf" was daarmee structureel onbewaakt — precies de
   *    vorm uit onwrikbare regel 18, en op de plek waar hij het meest kost: een
   *    stilzwijgende toetreding tot een open groep maakt je gemiste weken, je
   *    beste reeks en je hele aanwezigheidsgeschiedenis zichtbaar voor mensen die
   *    je misschien niet kent.
   *
   * ⚠️ De beslissing staat nu in `routeVoorUitnodiging()`; het scherm voert hem
   *    alleen nog uit.
   */
  it('treedt toe bij een verse code en een beschermde groep', () => {
    // De enige combinatie waarin er iets vanzelf gebeurt.
    expect(routeVoorUitnodiging({ automatisch: true, zichtbaarheid: 'beschermd' })).toEqual({
      soort: 'toetreden',
    });
  });

  it('toont het scherm bij een open groep, ook met een verse code', () => {
    expect(routeVoorUitnodiging({ automatisch: true, zichtbaarheid: 'open' })).toEqual({
      soort: 'toon-scherm',
      reden: 'open-groep',
    });
  });

  it('toont het scherm als de uitnodiging niet op te halen was', () => {
    // Netwerk weg, link ingetrokken — onbekend is de kant waar niets
    // stilzwijgend gebeurt.
    expect(routeVoorUitnodiging({ automatisch: true, zichtbaarheid: null })).toEqual({
      soort: 'toon-scherm',
      reden: 'onbekend',
    });
  });

  it('laat verlopen van alles winnen', () => {
    // ⚠️ De volgorde is de regel en geen detail. Is er geen verse toestemming,
    //    dan doet de zichtbaarheid er niet meer toe — ook niet als de groep
    //    beschermd is. Zou beschermd hier winnen, dan was de vervaltermijn weg.
    for (const zichtbaarheid of ['beschermd', 'open', null] as const) {
      expect(routeVoorUitnodiging({ automatisch: false, zichtbaarheid })).toEqual({
        soort: 'toon-scherm',
        reden: 'verlopen',
      });
    }
  });

  it('treedt in geen enkele andere combinatie vanzelf toe', () => {
    // De sluitende vorm: precies één van de zes combinaties mag `toetreden` zijn.
    const alle = ([true, false] as const).flatMap((automatisch) =>
      (['beschermd', 'open', null] as const).map((zichtbaarheid) =>
        routeVoorUitnodiging({ automatisch, zichtbaarheid }),
      ),
    );

    expect(alle.filter((r) => r.soort === 'toetreden')).toHaveLength(1);
  });
});

