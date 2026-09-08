import { describe, expect, it } from 'vitest';

import { nudgeBesluit, type DureNudgevragen } from './nudge-besluit';
import { nudgeReden, type NudgeSituatie } from './regels';

/**
 * De gratis poort vóór de dure vragen — QS8-341.
 *
 * ⚠️ **Dit is de belofte en niet de vorm.** De job stelde per profiel zes
 *    databasevragen en gaf ze daarna aan een beslissing die op de eerste drie
 *    gratis velden al kortsluit. Wat hier onder test staat is dus niet *"de
 *    poort staat vóór de queries in het bestand"* — dat is een eigenschap van
 *    een regelvolgorde en verhuist niet mee — maar: **er wordt niets gevraagd
 *    wat het antwoord niet meer kan veranderen.**
 *
 * ⚠️ Daarom een **tellende dubbel** en geen blik op de brontekst. Een test die
 *    `notificaties/index.ts` napleest op de volgorde van regels, blijft groen
 *    als iemand de queries terugzet in een object-literal ergens anders.
 */

/** Een dubbel die telt hoe vaak er iets gevraagd is. */
function tellendeVragen(antwoorden: Partial<Record<keyof DureNudgevragen, boolean>> = {}): {
  vragen: DureNudgevragen;
  aantal: () => number;
} {
  let aantal = 0;
  const maak =
    (sleutel: keyof DureNudgevragen) =>
    async (): Promise<boolean> => {
      aantal += 1;
      return antwoorden[sleutel] ?? false;
    };

  return {
    vragen: {
      heeftDagzet: maak('heeftDagzet'),
      heeftAfronding: maak('heeftAfronding'),
      heeftOpenWeekdoel: maak('heeftOpenWeekdoel'),
      inAdempauze: maak('inAdempauze'),
      alleenSlapendeGroepen: maak('alleenSlapendeGroepen'),
      alVerstuurd: maak('alVerstuurd'),
    },
    aantal: () => aantal,
  };
}

const OPEN_POORT = { herinneringAan: true, herinneringUur: 9, lokaalUur: 9 };

describe('een profiel dat de poort niet haalt, kost niets', () => {
  it.each([
    ['de herinnering staat uit', { herinneringAan: false, herinneringUur: 9, lokaalUur: 9 }],
    ['er is geen tijdstip ingesteld', { herinneringAan: true, herinneringUur: null, lokaalUur: 9 }],
    ['het is het uur niet', { herinneringAan: true, herinneringUur: 9, lokaalUur: 10 }],
  ])('stelt nul vragen als %s', async (_naam, voorpoort) => {
    const { vragen, aantal } = tellendeVragen();

    const uit = await nudgeBesluit(voorpoort, vragen);

    expect(aantal()).toBe(0);
    expect(uit.gesteldeVragen).toBe(0);
    expect(uit.mag).toBe(false);
  });

  it('stelt de zes vragen wél zodra de poort open is', () => {
    // ⚠️ De tegenhanger. Zonder deze test is "nooit iets vragen" ook groen, en
    //    dan stuurt de job nooit meer een nudge.
    const { vragen, aantal } = tellendeVragen({ heeftOpenWeekdoel: true });

    return nudgeBesluit(OPEN_POORT, vragen).then((uit) => {
      expect(aantal()).toBe(6);
      expect(uit.mag).toBe(true);
    });
  });
});

describe('de beslissing verandert niet, alleen wat hij kost', () => {
  /** Elke situatie die `nudgeReden()` kent, met de verwachte reden. */
  const GEVALLEN: readonly NudgeSituatie[] = [
    { ...OPEN_POORT, herinneringAan: false, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, herinneringUur: null, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, lokaalUur: 3, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: true, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: true, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: false, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: true, alleenSlapendeGroepen: false, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: true, alVerstuurd: false },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: true },
    { ...OPEN_POORT, heeftDagzet: false, heeftAfronding: false, heeftOpenWeekdoel: true, inAdempauze: false, alleenSlapendeGroepen: false, alVerstuurd: false },
  ];

  it.each(GEVALLEN.map((g, i) => [i, g] as const))(
    'geval %i geeft dezelfde uitkomst als `nudgeReden()` zelf',
    async (_i, situatie) => {
      // ⚠️ **Acceptatiecriterium 3, uitgevoerd in plaats van beredeneerd.** De
      //    poort mag alleen de kósten veranderen. Deze test legt de uitkomst van
      //    de gepoorte weg naast die van de oude, volledige beslissing — voor
      //    elke tak die `nudgeReden()` kent.
      const { vragen } = tellendeVragen(situatie);

      const uit = await nudgeBesluit(situatie, vragen);

      expect(uit.reden).toBe(nudgeReden(situatie));
    },
  );
});
