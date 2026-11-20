import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { zetDocumentTaal } from './documenttaal';
import { STANDAARDTAAL, zetTaal, zetTaalUitApparaat } from './index';

/**
 * Het `lang`-attribuut van het document volgt de taal van de app — QS8-741.
 *
 * ⚠️ **De belofte is "een schermlezer kiest de stem bij de taal die op het scherm
 *    staat".** Dat zijn twee dingen die elkaar moeten vinden: de taalwissel en het
 *    attribuut. Een toets op alleen `zetDocumentTaal()` blijft groen als
 *    `zetTaal()` hem niet meer aanroept; daarom toetsen deze via de twee ingangen
 *    waar de taal werkelijk verandert (`zetTaal` voor het profiel en de
 *    taalkeuze, `zetTaalUitApparaat` voor de start).
 *
 * ⚠️ Deze toets draait zonder DOM (sinds QS8-739 bestaat er wel jsdom, in `tests/render`, maar dat is hier niet nodig); een stub met alleen `documentElement.lang`
 *    volstaat, want dat is het enige wat de functie aanraakt. Dat het attribuut in
 *    een echte browser meebeweegt is met Playwright gemeten (19-11-2026) en niet in CI.
 *
 * IJKING — met de hand, 19-11-2026, vooraf en achteraf 8 groen:
 *
 *   A  de aanroep uit `zetTaal()` halen
 *      -> rood: 'een taalkeuze zet het attribuut'
 *   B  de aanroep uit `zetTaalUitApparaat()` halen
 *      -> rood: 'de start zet het attribuut uit het apparaat'
 *   C  `zetDocumentTaal` altijd `nl` laten zetten
 *      -> rood: 'het attribuut volgt de taal' (en de twee hierboven)
 *   D  de `wortel === undefined`-bewaking weghalen
 *      -> rood: 'zonder document doet het niets en gooit het niet'
 */

type Stub = { documentElement: { lang: string } };
const globaal = globalThis as { document?: Stub };
let oorspronkelijk: Stub | undefined;

beforeEach(() => {
  oorspronkelijk = globaal.document;
  globaal.document = { documentElement: { lang: 'nl' } };
});

afterEach(() => {
  if (oorspronkelijk === undefined) delete globaal.document;
  else globaal.document = oorspronkelijk;
  zetTaal(STANDAARDTAAL);
});

const lang = (): string | undefined => globaal.document?.documentElement.lang;

describe('het lang-attribuut van het document', () => {
  it('het attribuut volgt de taal', () => {
    zetDocumentTaal('en');
    expect(lang()).toBe('en');
    zetDocumentTaal('nl');
    expect(lang()).toBe('nl');
  });

  it('een taalkeuze zet het attribuut', () => {
    zetTaal('en');
    expect(lang()).toBe('en');
    zetTaal('nl');
    expect(lang()).toBe('nl');
  });

  it('een onbekende taalcode valt terug op de standaardtaal en het attribuut meegaat', () => {
    zetTaal('en');
    zetTaal('tlh');
    expect(lang()).toBe(STANDAARDTAAL);
  });

  it('geen keuze (null) valt terug op de standaardtaal', () => {
    zetTaal('en');
    zetTaal(null);
    expect(lang()).toBe(STANDAARDTAAL);
  });

  it('de start zet het attribuut uit het apparaat', () => {
    zetTaalUitApparaat(['en-US', 'nl']);
    expect(lang()).toBe('en');
    zetTaalUitApparaat(['nl-NL']);
    expect(lang()).toBe('nl');
  });

  it('een apparaat met een onbekende taal geeft de standaardtaal', () => {
    zetTaalUitApparaat(['de-DE']);
    expect(lang()).toBe(STANDAARDTAAL);
  });

  it('zonder document doet het niets en gooit het niet', () => {
    // De server (`expo export`) en native hebben geen `document`.
    delete globaal.document;
    expect(() => zetDocumentTaal('en')).not.toThrow();
    expect(() => zetTaal('en')).not.toThrow();
    expect(() => zetTaalUitApparaat(['en'])).not.toThrow();
  });

  it('een document zonder documentElement wordt met rust gelaten', () => {
    (globaal as { document?: unknown }).document = {};
    expect(() => zetDocumentTaal('en')).not.toThrow();
  });
});
