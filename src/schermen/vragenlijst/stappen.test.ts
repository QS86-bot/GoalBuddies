import { describe, expect, it, vi } from 'vitest';

import { HELDVRAGEN } from '@/modules/helden';

import {
  beginStap,
  EERSTE_HELDVRAAG,
  FOCUS,
  GEVOEL,
  isVraag,
  SAMENVATTING,
  stapNummer,
  stapVoortgang,
  VOORBEELD,
} from './stappen';

// ⚠️ De barrel van `modules/helden` trekt React Native binnen, en dat parst niet in Vitest.
//    De lijst zelf komt uit het bronbestand: dezelfde waarde, zonder het platform.
vi.mock('@/modules/helden', async () => ({
  HELDVRAGEN: (await import('../../modules/helden/quiz')).HELDVRAGEN,
}));

describe('de stappen van de vragenlijst', () => {
  it('zet de samenvatting achter alle vragen en het voorbeeld', () => {
    expect(VOORBEELD).toBe(EERSTE_HELDVRAAG + HELDVRAGEN.length);
    expect(SAMENVATTING).toBe(VOORBEELD + 1);
  });

  it('laat de streep alleen stijgen, van nul tot en met één, en nooit een score zijn', () => {
    const waarden = Array.from({ length: SAMENVATTING + 1 }, (_, s) => stapVoortgang(s));

    expect(waarden.every((w) => w !== null)).toBe(true);
    expect(waarden[0]).toBe(0);
    expect(waarden[SAMENVATTING]).toBe(1);
    for (let i = 1; i < waarden.length; i += 1) {
      expect(waarden[i] as number).toBeGreaterThan(waarden[i - 1] as number);
    }
  });

  it('kapt een stap buiten het bereik af en geeft nooit een waarde buiten 0..1', () => {
    expect(stapVoortgang(-3)).toBe(0);
    expect(stapVoortgang(SAMENVATTING + 9)).toBe(1);
  });

  it('noemt een stap een vraag tot het voorbeeld', () => {
    expect(isVraag(FOCUS)).toBe(true);
    expect(isVraag(VOORBEELD - 1)).toBe(true);
    expect(isVraag(VOORBEELD)).toBe(false);
    expect(isVraag(SAMENVATTING)).toBe(false);
    expect(stapNummer(FOCUS)).toBe(1);
  });
});

describe('waar iemand begint die terugkomt', () => {
  const alles = { focus: true, tijd: true, moment: true, valkuil: true, gevoel: true };

  it('begint bij de eerste vraag die nog open staat', () => {
    expect(beginStap({ ...alles, focus: false })).toBe(FOCUS);
    expect(beginStap({ ...alles, gevoel: false })).toBe(GEVOEL);
  });

  it('begint bij de samenvatting als alles beantwoord is, zodat niets verloren is', () => {
    expect(beginStap(alles)).toBe(SAMENVATTING);
  });
});
