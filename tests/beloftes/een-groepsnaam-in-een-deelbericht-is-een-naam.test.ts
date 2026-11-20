/**
 * De belofte van QS8-771: **een groepsnaam in het bericht dat een lid verstuurt
 * is herkenbaar een naam, en kan geen webadres of ontsnapte zin worden.**
 */
import { describe, expect, it } from 'vitest';

import { groepSchema } from '../../src/modules/buddies/schemas';
import { teamNaamSchema } from '../../src/modules/organisaties/schemas';
import { uitnodigingsBericht } from '../../src/modules/buddies/samen';
import { bevatLinkAchtigeTekst } from '../../src/shared/tekst';

const LINK = 'https://goalbuddies.q-projects.tech/uitnodiging/abc';

describe('uitnodigingsBericht', () => {
  it('zet de groepsnaam tussen aanhalingstekens, met en zonder afzender', () => {
    expect(uitnodigingsBericht(LINK, 'Sportmaatjes', 'Jan').tekst).toContain('“Sportmaatjes”');
    expect(uitnodigingsBericht(LINK, 'Sportmaatjes', null).tekst).toContain('“Sportmaatjes”');
  });

  it('laat een aanhalingsteken in de naam er niet uit breken', () => {
    const tekst = uitnodigingsBericht(LINK, 'A” log in “B', 'Jan').tekst;
    expect(tekst.match(/[“”]/gu)).toHaveLength(2);
    const lang = uitnodigingsBericht(LINK, 'A〞 reageer 〝B', 'Jan').tekst;
    expect(lang.match(/[“”〞〝]/gu)).toHaveLength(2);
  });
});

describe('groepSchema.name', () => {
  const nieuw = (name: string) => groepSchema.safeParse({ name, huddle_day: 1 });

  it.each([
    'Account verlopen, log in via evil.example',
    'https://evil.example',
    'go to www.x',
    'a://b',
    'evil。com',
    'evil．com',
    'evil｡com',
    'evil.\u0301com',
    'Jan\u2029Admin',
    'log in via 185.12.3.4',
    'Lopen 5.5 km',
    'Log in via evil\u200E.com',
    'evil.\u200Ecom',
    '185\u200E.12\u200E.3\u200E.4',
    'evile\u0301.com',
    'evile\uFE0F.com',
    'evile\u200D.com',
    'goalbuddies-login.\u200Dсом',
    'https\uFF1A\uFF0F\uFF0Fevil',
  ])('weigert %j', (naam) => {
    expect(bevatLinkAchtigeTekst(naam)).toBe(true);
    expect(nieuw(naam).success).toBe(false);
  });

  it.each(['Sportmaatjes', 'Team 3A', 'Lopen, 5 km', 'Jan & Piet', 'e.g. wij', 'Jan’s groep'])(
    'laat %s door',
    (naam) => {
      expect(nieuw(naam).success).toBe(true);
    },
  );

  it('maakt van een naam met een regeleinde één regel', () => {
    const r = nieuw('Jan\nAdmin');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).not.toMatch(/[\n\r]/);
  });
});

describe('teamNaamSchema', () => {
  it('weigert een webadres zoals groepSchema', () => {
    expect(teamNaamSchema.safeParse('Log in via evil.example').success).toBe(false);
    expect(teamNaamSchema.safeParse('Sales').success).toBe(true);
  });
});

describe('elk teken naast de punt (scan over alle codepunten)', () => {
  // ⚠️ Een lijst met omzeilingen groeit per reviewronde; deze scan niet. Wat er
  //    ook naast de punt staat: de naam blijft een webadres, tenzij het teken
  //    zelf zichtbaar witruimte, een dubbele punt, een schuine streep of een punt is.
  it('geen enkel codepunt verbergt de punt in evil.com of in een IP', { timeout: 120_000 }, () => {
    const gemist: string[] = [];
    for (let cp = 1; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const x = String.fromCodePoint(cp);
      if (/[\s:/.\p{L}\p{N}\-\u3002\uFF0E\uFF61\u2024\uFE52]/u.test(x)) continue;
      // Wat NFKC tot een zichtbare letter, cijfer, spatie, punt of dubbele punt maakt, is geen verborgen teken.
      if (/[\s\p{L}\p{N}.:/\-\u3002\uFF0E\uFF61\u2024\uFE52]/u.test(x.normalize('NFKC'))) continue;
      const kandidaten = [`evil${x}.com`, `evil.${x}com`, `185${x}.12${x}.3${x}.4`, ...(/\p{M}/u.test(x) ? [] : [`www${x}.x`])];
      for (const k of kandidaten) {
        if (!bevatLinkAchtigeTekst(k)) gemist.push(`U+${cp.toString(16)} in ${k}`);
      }
    }
    expect(gemist.slice(0, 20)).toEqual([]);
  });
});
