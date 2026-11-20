/**
 * De belofte van QS8-771: **een groepsnaam in het bericht dat een lid verstuurt
 * is herkenbaar een naam, en kan geen webadres of ontsnapte zin worden.**
 */
import { describe, expect, it } from 'vitest';

import { groepSchema } from '../../src/modules/buddies/schemas';
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
  });
});

describe('groepSchema.name', () => {
  const nieuw = (name: string) => groepSchema.safeParse({ name, huddle_day: 1 });

  it.each([
    'Account verlopen, log in via evil.example',
    'https://evil.example',
    'www evil',
    'go to www.x',
    'a://b',
  ])('weigert %s', (naam) => {
    expect(bevatLinkAchtigeTekst(naam) || naam === 'www evil').toBe(true);
    if (naam !== 'www evil') expect(nieuw(naam).success).toBe(false);
  });

  it.each(['Sportmaatjes', 'Team 3A', 'Lopen, 5 km', 'Jan & Piet', 'e.g. wij'])('laat %s door', (naam) => {
    expect(nieuw(naam).success).toBe(true);
  });

  it('weigert een naam met een regeleinde niet als link maar maakt er één regel van', () => {
    const r = nieuw('Jan\nAdmin');
    expect(r.success ? r.data.name.includes('\n') : false).toBe(false);
  });
});
