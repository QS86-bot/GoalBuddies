import { describe, expect, it } from 'vitest';

import { eersteLuideUur, inStilteVenster, verschovenUur } from './stilte';

/**
 * QS8-92 — het stille venster.
 *
 * ⚠️ Het geval dat dit bestand draagt is het venster dat over middernacht loopt.
 *    Een implementatie met `uur >= van && uur < tot` geeft daar altijd `false`,
 *    en dan bestaat de instelling wel maar doet hij niets — precies de vorm die
 *    regel 18 vraag 3 stelt: groen terwijl de belofte breekt.
 */

describe('inStilteVenster — een venster binnen één dag', () => {
  it('zwijgt van 01:00 tot 06:00', () => {
    expect(inStilteVenster(1, 1, 6)).toBe(true);
    expect(inStilteVenster(5, 1, 6)).toBe(true);
  });

  it('laat het beginuur meedoen en het einduur niet', () => {
    expect(inStilteVenster(1, 1, 6)).toBe(true);
    expect(inStilteVenster(6, 1, 6)).toBe(false);
  });

  it('laat de uren erbuiten met rust', () => {
    expect(inStilteVenster(0, 1, 6)).toBe(false);
    expect(inStilteVenster(23, 1, 6)).toBe(false);
  });
});

describe('inStilteVenster — een venster over middernacht', () => {
  it('zwijgt vóór middernacht', () => {
    expect(inStilteVenster(22, 22, 7)).toBe(true);
    expect(inStilteVenster(23, 22, 7)).toBe(true);
  });

  it('zwijgt ná middernacht', () => {
    expect(inStilteVenster(0, 22, 7)).toBe(true);
    expect(inStilteVenster(6, 22, 7)).toBe(true);
  });

  it('is om 07:00 weer luid', () => {
    expect(inStilteVenster(7, 22, 7)).toBe(false);
  });

  it('laat de middag met rust', () => {
    expect(inStilteVenster(12, 22, 7)).toBe(false);
    expect(inStilteVenster(21, 22, 7)).toBe(false);
  });
});

describe('inStilteVenster — de standen waarin er geen venster is', () => {
  it('doet niets als er geen stille uren zijn ingesteld', () => {
    expect(inStilteVenster(3, null, null)).toBe(false);
  });

  it('doet niets als er maar één helft staat', () => {
    expect(inStilteVenster(3, 22, null)).toBe(false);
    expect(inStilteVenster(3, null, 7)).toBe(false);
  });

  /**
   * ⚠️ `van === tot` is leeg en niet 24 uur. Zou dit `true` geven, dan bestaat er
   *    een stand waarin een gebruiker nooit meer iets krijgt zonder dat hij dat
   *    per soort gekozen heeft — en dat is niet te onderscheiden van een defect.
   */
  it('behandelt een venster van nul uur als leeg en niet als een hele dag', () => {
    for (let uur = 0; uur < 24; uur += 1) {
      expect(inStilteVenster(uur, 22, 22)).toBe(false);
    }
  });
});

describe('eersteLuideUur', () => {
  it('noemt het uur waarop het weer luid wordt', () => {
    expect(eersteLuideUur(22, 7)).toBe(7);
    expect(eersteLuideUur(1, 6)).toBe(6);
  });

  it('geeft niets terug als er geen venster is', () => {
    expect(eersteLuideUur(null, null)).toBeNull();
    expect(eersteLuideUur(22, 22)).toBeNull();
  });
});

describe('verschovenUur', () => {
  it('laat een uur buiten het venster met rust', () => {
    expect(verschovenUur(20, 22, 7)).toBe(20);
    expect(verschovenUur(9, 22, 7)).toBe(9);
  });

  /**
   * 📏 Het geval dat dit hele besluit draagt: herinnering 23:00, stilte 22→7.
   *    Zonder verschuiving krijgt deze gebruiker nóóit een nudge.
   */
  it('schuift een uur binnen het venster naar het eerste luide uur', () => {
    expect(verschovenUur(23, 22, 7)).toBe(7);
    expect(verschovenUur(3, 22, 7)).toBe(7);
    expect(verschovenUur(22, 22, 7)).toBe(7);
  });

  it('doet niets als er geen stille uren zijn', () => {
    expect(verschovenUur(23, null, null)).toBe(23);
  });

  it('geeft niets terug als er geen uur is', () => {
    expect(verschovenUur(null, 22, 7)).toBeNull();
  });

  /** De randen: `tot` zelf is al luid, dus die verschuift niet. */
  it('laat het eerste luide uur zelf staan', () => {
    expect(verschovenUur(7, 22, 7)).toBe(7);
  });
});
