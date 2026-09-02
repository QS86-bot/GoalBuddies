import { describe, expect, it } from 'vitest';

import { navy, navyLight, roles, type Palette } from '../theme/tokens';

import { balkvorm, WEEKSTANDEN } from './weekbalk-vorm';

/**
 * De weekbalken — QS8-256.
 *
 * ⚠️ **De eerste toets hier is het acceptatiecriterium van het issue**, en hij
 *    bestaat omdat "geen rood op een gemiste week" anders alleen in een
 *    commentaarblok staat. Rood betekent in dit stelsel uitsluitend een naderende
 *    deadline; een week die niet is afgerond hoort geen alarm te zijn, ook niet
 *    op je eigen scherm. Domeinregel 7 gaat over wat de gróep ziet, maar de toon
 *    geldt ook voor tekst en kleur die alleen jij leest.
 */

const themas: [naam: string, palette: Palette][] = [
  ['navy (donker)', navy],
  ['navy-licht', navyLight],
];

describe.each(themas)('de weekbalk — %s', (_naam, p) => {
  const r = roles(p);

  it('gebruikt nergens rood, in geen enkele stand', () => {
    for (const stand of WEEKSTANDEN) {
      expect(balkvorm(stand, r).kleur, stand).not.toBe(p.red);
    }
  });

  /**
   * ⚠️ Ook oranje niet: dat is in dit stelsel "wacht op actie". Een gemiste week
   *    is geen wachtrij, en een balk in de kleur van "je moet iets doen" is een
   *    aansporing over een week die voorbij is.
   */
  it('gebruikt voor een niet-afgeronde week de neutrale kleur', () => {
    expect(balkvorm('gemist', r).kleur).toBe(r.neutral);
    expect(balkvorm('gemist', r).kleur).not.toBe(p.orange);
  });

  /**
   * ⚠️ **Domeinregel 8 in één regel.** Vloer gehaald betekent dat de week telt.
   *    Een doffere kleur voor de vloer zou het tegenovergestelde zeggen van wat
   *    het product belooft — en dat is precies de reden dat QS8-256 vraagt om de
   *    vloer zichtbaar te maken in plaats van weggestopt in een formulierveld.
   */
  it('geeft de vloer dezelfde kleur als het plafond, en alleen minder hoogte', () => {
    const plafond = balkvorm('plafond', r);
    const vloer = balkvorm('vloer', r);

    expect(vloer.kleur).toBe(plafond.kleur);
    expect(vloer.hoogte).toBeLessThan(plafond.hoogte);
    expect(vloer.hoogte).toBeGreaterThan(balkvorm('gemist', r).hoogte);
  });

  it('tekent een ingediende week als omtrek en niet als vlak', () => {
    // ⚠️ Vorm en niet kleur: groen blijft daarmee "gehaald", en een omtrek is
    //    "onderweg". Zou dit een eigen kleur zijn, dan is groen ineens twee
    //    dingen.
    expect(balkvorm('ingediend', r).omtrek).toBe(true);
    for (const stand of WEEKSTANDEN.filter((s) => s !== 'ingediend')) {
      expect(balkvorm(stand, r).omtrek, stand).toBe(false);
    }
  });

  /**
   * ⚠️ Een balk van nul hoogte is een gat in de rij, en dan telt het oog de
   *    weken verkeerd — vier balken met twee gaten leest als vier weken.
   */
  it('geeft elke stand een zichtbare hoogte', () => {
    for (const stand of WEEKSTANDEN) {
      expect(balkvorm(stand, r).hoogte, stand).toBeGreaterThan(0);
      expect(balkvorm(stand, r).hoogte, stand).toBeLessThanOrEqual(1);
    }
  });

  /**
   * ⚠️ Anders is de rij een plaatje dat je moet raden: wie de hoogte niet
   *    vergelijkt heeft alleen de kleur, en wie kleurenblind is alleen de hoogte.
   *    Twee kanalen, allebei volledig.
   */
  it('houdt "telde" en "telde niet" ook uit elkaar zonder kleur', () => {
    const telden = (['plafond', 'vloer', 'ingediend'] as const).map((s) => balkvorm(s, r).hoogte);
    const nietGeteld = (['gemist', 'leeg'] as const).map((s) => balkvorm(s, r).hoogte);

    expect(Math.min(...telden)).toBeGreaterThan(Math.max(...nietGeteld));
  });
});
