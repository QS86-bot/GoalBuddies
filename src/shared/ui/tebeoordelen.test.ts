import { describe, expect, it } from 'vitest';

import { beoordeelkopSleutel, toonBeoordeelkaart } from './tebeoordelen';

/**
 * Wanneer de kaart "er wacht iets op jou" te zien is — QS8-148.
 *
 * ⚠️ **De regel die hier bewaakt wordt, is een keer fout geweest en niemand
 *    merkte het.** De kaart verborg zichzelf als het tellen mislukte: dan stond
 *    er niets terwijl er drie mensen op een oordeel wachtten. Dat raakt de
 *    succesmetriek uit de PRD rechtstreeks — ≥80% goedgekeurd binnen 48 uur.
 *
 *    De reparatie zat in een `if` boven aan een schermcomponent, en dat was
 *    genoeg zolang er één scherm was. Sinds QS8-148 hangt de kaart op twee
 *    tabbladen; een regel in een component verhuist mee met dat component en
 *    wordt bij de tweede kopie stilzwijgend anders.
 *
 * ⚠️ **Nul en onbekend zijn twee dingen, en dat is de hele test.** Ze zien er in
 *    de UI identiek uit als je het verschil weggooit, en dan verdwijnt de kaart
 *    precies wanneer iemand hem nodig heeft.
 */

describe('toonBeoordeelkaart', () => {
  it('blijft weg als er niets wacht', () => {
    // Een kaart die permanent "0 te beoordelen" meldt, leert mensen om er niet
    // meer naar te kijken — en is dan nutteloos op het moment dat het telt.
    expect(toonBeoordeelkaart({ aantal: 0, mislukt: false })).toBe(false);
  });

  it('staat er als er iets wacht', () => {
    expect(toonBeoordeelkaart({ aantal: 1, mislukt: false })).toBe(true);
    expect(toonBeoordeelkaart({ aantal: 7, mislukt: false })).toBe(true);
  });

  it('staat er óók als het tellen mislukte, juist dan', () => {
    // ⚠️ Dit is de regressie. Zonder deze tak zegt de kaart "niets" waar het
    //    antwoord "onbekend" is, en dat is de enige van de vier gevallen waarin
    //    hij liegt.
    expect(toonBeoordeelkaart({ aantal: 0, mislukt: true })).toBe(true);
  });

  it('laat een mislukte telling voorgaan op het getal', () => {
    // Een oude telling die blijft staan terwijl het verversen stukliep, is
    // gevaarlijker dan geen telling: hij ziet er actueel uit.
    expect(toonBeoordeelkaart({ aantal: 3, mislukt: true })).toBe(true);
  });
});

describe('beoordeelkopSleutel', () => {
  it('kiest de enkelvoudsvorm bij precies één', () => {
    expect(beoordeelkopSleutel({ aantal: 1, mislukt: false })).toBe('groepen.wacht_een');
  });

  it('kiest de meervoudsvorm bij meer dan één', () => {
    expect(beoordeelkopSleutel({ aantal: 2, mislukt: false })).toBe('groepen.wachten_meer');
  });

  it('noemt de storing en niet het getal als het tellen mislukte', () => {
    // ⚠️ Ook bij een getal dat er nog staat: "3 wachten op jou" naast een
    //    mislukte telling is een bewering die de app niet kan waarmaken.
    expect(beoordeelkopSleutel({ aantal: 3, mislukt: true })).toBe('groepen.wachten_onbekend');
  });
});
