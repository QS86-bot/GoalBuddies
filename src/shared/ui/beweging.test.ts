import { describe, expect, it } from 'vitest';

import { bewegingsDuur, bewegingsStijl } from './beweging';

/**
 * `prefers-reduced-motion` — de belofte, niet de opmaak.
 *
 * ⚠️ **Deze belofte stond op 27-08-2026 vijf keer met de hand uitgeschreven en
 *    was door niets te toetsen.** Twee keer in `Ketting.tsx`, één keer in
 *    `MilestoneProgress.tsx`, één keer in `FloorCeiling.tsx` (met 220 ms in
 *    plaats van 260), en één keer als `reduced ? 0 : 260` in `Viering.tsx`.
 *    `a11y.ts` had er een helper voor — `motionDuration()` — met nul aanroepers,
 *    en een commentaarregel in `Viering.tsx` die beweerde dat hij wél gebruikt
 *    werd.
 *
 * ⚠️ **De reden dat niemand hem toetste is de reden dat dit bestand bestaat.**
 *    `a11y.ts` importeert `AccessibilityInfo` uit `react-native`, en dat is
 *    Flow-syntaxis die een node-test niet leest. De kern staat daarom nu in een
 *    importvrije module en het platform komt als parameter binnen.
 *
 * ⚠️ Niet cosmetisch: voor iemand met vestibulaire klachten is een schuivende
 *    voortgangsbalk misselijkmakend, en dit is een app die je elke week opent.
 */

describe('bewegingsStijl', () => {
  it('geeft niets terug als de gebruiker om minder beweging vroeg', () => {
    // Dit is de belofte. Alles hieronder is de rand eromheen.
    expect(bewegingsStijl(true, true, 260)).toEqual({});
  });

  it('geeft niets terug op native, waar transitionDuration niet bestaat', () => {
    // ⚠️ Een `transitionDuration` in een React Native-stijl is geen fout maar ook
    //    geen animatie; hij doet niets. Hem toch zetten is een stijl die liegt.
    expect(bewegingsStijl(false, false, 260)).toEqual({});
  });

  it('geeft niets terug als beide redenen tegelijk gelden', () => {
    expect(bewegingsStijl(true, false, 260)).toEqual({});
  });

  it('zet de overgang aan op web als er niets op tegen is', () => {
    expect(bewegingsStijl(false, true, 260)).toEqual({ transitionDuration: '260ms' });
  });

  it('houdt de duur die de aanroeper doorgeeft', () => {
    // ⚠️ 220 en 260 staan allebei in de app en zijn met opzet níet gelijkgetrokken:
    //    dat is een ontwerpkeuze en geen duplicatie. Een opruimronde hoort zo'n
    //    verschil niet stilzwijgend weg te poetsen.
    expect(bewegingsStijl(false, true, 220)).toEqual({ transitionDuration: '220ms' });
  });
});

describe('bewegingsDuur', () => {
  it('maakt de animatie ogenblikkelijk bij minder beweging', () => {
    expect(bewegingsDuur(true, 260)).toBe(0);
  });

  it('laat de duur staan als er niets op tegen is', () => {
    expect(bewegingsDuur(false, 260)).toBe(260);
  });

  it('geeft nul en niet null — `Animated.timing` wil een getal', () => {
    // Een `undefined` hier zou de animatie op de standaardduur zetten in plaats
    // van hem uit te zetten, en dat is precies het tegenovergestelde.
    expect(typeof bewegingsDuur(true, 260)).toBe('number');
  });
});
