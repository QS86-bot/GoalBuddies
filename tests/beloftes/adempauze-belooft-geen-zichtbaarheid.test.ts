/**
 * De tekst onder `adempauze.groep_ziet` — QS8-768, vervolg op migratie 0307.
 *
 * De belofte: het formulier zegt niet meer dat de groep de adempauze ziet (dat
 * is na 0307 onwaar), en noemt het Ketting-restant eerlijk. Getoetst wordt op de
 * inhoud van de catalogus in beide talen, niet op een plek in een scherm.
 *
 * ⚠️ De laatste zin (Ketting-restant) moet weg in de PR van QS8-769; dan hoort de
 *    toets op "Ketting" hier mee te veranderen.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, t, zetTaal } from '../../src/shared/i18n';

const SLEUTEL = 'adempauze.groep_ziet' as never;

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

describe('adempauze.groep_ziet', () => {
  it('belooft niet meer dat de groep de adempauze ziet (nl)', () => {
    zetTaal('nl');
    const zin = t(SLEUTEL);
    expect(zin).not.toBe(SLEUTEL);
    expect(zin).not.toMatch(/ziet dát je een adempauze/i);
    expect(zin).toContain('Je groep ziet je adempauze niet');
    expect(zin).toContain('De Ketting telt leden in een pauze niet mee');
  });

  it('belooft niet meer dat de groep de adempauze ziet (en)', () => {
    zetTaal('en');
    const zin = t(SLEUTEL);
    expect(zin).not.toBe(SLEUTEL);
    expect(zin).not.toMatch(/sees that you have a breather/i);
    expect(zin).toContain('does not see your breather');
    expect(zin).toContain('Ketting does not count members on a pause');
  });

  // Ook het antwoord bij de valkuil 'chaotisch leven' noemt de adempauze.
  it('valkuil.life_chaotic.antwoord belooft ook niet dat de groep de pauze ziet', () => {
    const sleutel = 'valkuil.life_chaotic.antwoord' as never;
    zetTaal('nl');
    const nl = t(sleutel);
    expect(nl).not.toBe(sleutel);
    expect(nl).not.toMatch(/ziet dat je/i);
    expect(nl).toContain('alleen als je het ze zelf laat weten');
    zetTaal('en');
    const en = t(sleutel);
    expect(en).not.toBe(sleutel);
    expect(en).not.toMatch(/sees that you/i);
    expect(en).toContain('only sees it if you let them know yourself');
  });
});
