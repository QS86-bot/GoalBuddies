import { describe, expect, it } from 'vitest';

import { bestemmingVoor, NA_ONBOARDING_BEREIKBAAR, type Routestand } from './routewacht';

function stand(over: Partial<Routestand> = {}): Routestand {
  return {
    heeftSessie: true,
    sessieLaadt: false,
    profielLaadt: false,
    profielFout: null,
    isOnboarded: true,
    wortel: '',
    tak: '',
    ...over,
  };
}

describe('de routewacht', () => {
  it('stuurt zonder sessie naar aanmelden', () => {
    expect(bestemmingVoor(stand({ heeftSessie: false }))).toBe('/aanmelden');
    expect(bestemmingVoor(stand({ heeftSessie: false, wortel: 'aanmelden' }))).toBeNull();
  });

  it('wacht zolang de sessie of het profiel nog laadt', () => {
    expect(bestemmingVoor(stand({ sessieLaadt: true, isOnboarded: false }))).toBeNull();
    expect(bestemmingVoor(stand({ profielLaadt: true, isOnboarded: false }))).toBeNull();
  });

  it('laat een uitnodigingslink altijd staan, ingelogd of niet', () => {
    expect(bestemmingVoor(stand({ wortel: 'uitnodiging', heeftSessie: false }))).toBeNull();
    expect(bestemmingVoor(stand({ wortel: 'uitnodiging', isOnboarded: false }))).toBeNull();
  });

  it('stuurt een echt nieuwe gebruiker naar de onboarding', () => {
    expect(bestemmingVoor(stand({ isOnboarded: false }))).toBe('/onboarding/uitleg');
    expect(bestemmingVoor(stand({ isOnboarded: false, wortel: 'onboarding' }))).toBeNull();
  });

  it('haalt iemand die klaar is weg van aanmelden en onboarding', () => {
    expect(bestemmingVoor(stand({ wortel: 'aanmelden' }))).toBe('/');
    expect(bestemmingVoor(stand({ wortel: 'onboarding' }))).toBe('/');
    expect(bestemmingVoor(stand({ wortel: 'onboarding', tak: 'profiel' }))).toBe('/');
    expect(bestemmingVoor(stand())).toBeNull();
  });

  /**
   * ⚠️ **De uitzondering van QS8-266, en hij is met opzet smal.** De vragenlijst
   *    komt ná het afronden (besluit A56) en werd door de wacht weggestuurd op
   *    het moment dat `bewaar()` ernaartoe navigeerde: `wortel` is `onboarding`,
   *    `onboarded_at` staat, dus `'/'`.
   *
   * ⚠️ De tweede regel hieronder is de helft die de uitzondering smal houdt.
   *    Zonder die regel zou "laat de hele onboarding met rust zodra je klaar
   *    bent" ook groen zijn, en dat is een ándere belofte.
   */
  it('laat de vragenlijst staan zodra de onboarding afgerond is, en verder niets', () => {
    expect(bestemmingVoor(stand({ wortel: 'onboarding', tak: 'vragenlijst' }))).toBeNull();
    expect(bestemmingVoor(stand({ wortel: 'onboarding', tak: 'uitleg' }))).toBe('/');
  });

  it('geldt voor elke route in de lijst, ook als er ooit een tweede bij komt', () => {
    for (const tak of NA_ONBOARDING_BEREIKBAAR) {
      expect(bestemmingVoor(stand({ wortel: 'onboarding', tak }))).toBeNull();
    }
  });

  /**
   * ⚠️ **De belofte, en de reden dat dit bestand bestaat.** Een mislukte
   *    profielophaling geeft `profiel === null`, en `isOnboarded(null)` is
   *    `false` — niet te onderscheiden van een verse gebruiker. Tot 28-08 stuurde
   *    de wacht die persoon naar de onboarding, waar het formulier zich met
   *    standaardwaarden vulde en bij Bewaren zijn week-startdag op maandag zette.
   *
   * ⚠️ Het gaat om `isOnboarded: false` sámen met een fout: dat is precies de
   *    stand die vóór de reparatie doorschoot. Met `isOnboarded: true` zou de
   *    test ook zonder de reparatie groen zijn en dus niets bewaken.
   */
  it('stuurt bij een mislukte profielophaling níét naar de onboarding', () => {
    expect(bestemmingVoor(stand({ isOnboarded: false, profielFout: new Error('netwerk') }))).toBeNull();
  });

  it('maar houdt iemand zonder sessie wél tegen, ook als het profiel faalde', () => {
    // De volgorde telt: geen sessie gaat vóór een profielfout, anders blijft een
    // uitgelogde gebruiker op een scherm hangen dat niets voor hem kan laden.
    expect(
      bestemmingVoor(stand({ heeftSessie: false, isOnboarded: false, profielFout: new Error('netwerk') })),
    ).toBe('/aanmelden');
  });

  /**
   * ⚠️ `undefined` telt als "geen fout" en niet als "onbekend". Dat mag omdat
   *    `ProfielProvider` zijn `error` op `null` initialiseert en er alleen een
   *    echte fout in zet; zou hij ooit `undefined` gaan leveren voor "nog niets
   *    geprobeerd", dan is deze tak fout en moet die provider dat zeggen.
   */
  it('telt undefined als geen fout, want de provider levert null', () => {
    expect(bestemmingVoor(stand({ isOnboarded: false, profielFout: undefined }))).toBe('/onboarding/uitleg');
  });
});
