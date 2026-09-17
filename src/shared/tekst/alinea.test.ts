import { describe, expect, it } from 'vitest';

import { schoneEneRegel, schoneVrijeTekst, zonderNulPixels, zonderRegelovergang } from './index';

/**
 * Een gebruiker kan een alinea schrijven — QS8-507, migratie 0285.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat de naadtest deze fout per constructie niet
 *    kón vinden.** `tests/rls/nulpixelkolommen.test.ts` vraagt *"is de client het
 *    eens met de database"*. Toen `zonder_onzichtbaar_middenin()` nog het hele
 *    bereik `U+0001`–`U+001F` streek, vernietigden **beide** kanten de
 *    regelovergang — dus waren ze het eens, dus was hij groen, terwijl elk
 *    multiline-veld in de app zijn alinea's verloor.
 *
 *    Dat is onwrikbare regel 18 vraag 3 in zuivere vorm: *kan deze test groen
 *    blijven terwijl de belofte breekt?* Ja, en dat is precies wat er gebeurde.
 *    De toets hieronder vraagt daarom niet naar overeenstemming maar naar de
 *    belofte zélf.
 *
 * ⚠️ **En hij staat met opzet in `src/shared/tekst` en niet bij de RLS-suite.**
 *    Hij heeft geen database nodig, dus hij draait in élke `npm test` — ook op
 *    een machine zonder stack, waar de naadtest zichzelf overslaat.
 */

const ALINEA = 'Wat ik deed:\nGelopen op maandag.\n\nEn op woensdag gelezen.';

describe('een vrije tekst houdt zijn alineas', () => {
  it('laat `schoneVrijeTekst()` de regelovergangen staan', () => {
    expect(schoneVrijeTekst(ALINEA)).toBe(ALINEA);
  });

  it('en `zonderNulPixels()` ook', () => {
    expect(zonderNulPixels(ALINEA)).toBe(ALINEA);
  });

  it.each([
    ['tab', 'kolom1\tkolom2'],
    ['enkele regelovergang', 'regel1\nregel2'],
    ['CR LF', 'regel1\r\nregel2'],
    ['lege regel ertussen', 'een\n\ntwee'],
  ])('houdt %s heel', (_naam, tekst) => {
    expect(schoneVrijeTekst(tekst)).toBe(tekst);
  });

  /**
   * ⚠️ **Zonder deze toets bewaakt de vorige niets** (regel 18, vraag 3). Zou
   *    `schoneVrijeTekst()` niets meer strijken, dan blijft alles hierboven groen
   *    terwijl de grens weg is.
   */
  it('en strijkt wél nog steeds wat als nul pixels rendert', () => {
    expect(schoneVrijeTekst('Hard​lopen')).toBe('Hardlopen');
    expect(schoneVrijeTekst('ab')).toBe('ab');
    expect(schoneVrijeTekst('Zie ‮gnitseb‬ hier')).not.toContain('‮');
  });
});

describe('een eenregelig veld houdt er juist geen', () => {
  it('`schoneEneRegel()` haalt de regelovergang weg', () => {
    expect(schoneEneRegel('Jan\nAdmin')).toBe('JanAdmin');
    expect(schoneEneRegel('a\tb')).toBe('ab');
    expect(schoneEneRegel('a\r\nb')).toBe('ab');
  });

  it('en strijkt daarnaast wat als nul pixels rendert', () => {
    expect(schoneEneRegel('Hard​\nlopen')).toBe('Hardlopen');
  });

  it('`zonderRegelovergang()` raakt verder niets aan', () => {
    expect(zonderRegelovergang('Hard​lopen')).toBe('Hard​lopen');
    expect(zonderRegelovergang('gewoon')).toBe('gewoon');
  });
});

describe('de must-allows overleven allebei de helpers', () => {
  it.each([
    ['gezinsemoji', '\u{1F468}‍\u{1F469}‍\u{1F467}'],
    ['Perzisch', 'سلام دنیا'],
    ['Hindi', 'नमस्ते दुनिया'],
    ['Bengaals', 'হ্যালো বিশ্ব'],
    ['subdivisievlag', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'],
  ])('%s blijft heel', (_naam, waarde) => {
    expect(schoneVrijeTekst(waarde)).toBe(waarde);
    expect(schoneEneRegel(waarde)).toBe(waarde);
  });
});
