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
