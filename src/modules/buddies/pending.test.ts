import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow } from '../../shared/time';

import {
  bewaarOpenstaandeUitnodiging,
  openstaandeUitnodiging,
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
