import { describe, expect, it } from 'vitest';

import { COMMITMENT_MAX, COMMITMENT_MIN, commitmentSchema } from './commitment-schemas';

const EMOJI = '\u{1F600}';

function parse(velden: { body?: string; image_url?: string | null }) {
  return commitmentSchema.safeParse({ body: 'iets dat ik mezelf oplegt', image_url: null, ...velden });
}

/**
 * QS8-121. Een commitment device is wat dit product tegen een mens belóóft —
 * domeinregel 5, en sinds 22-08 ook de vraaggrens in `CLAUDE.md`. Dat deze
 * regels tot vandaag ongetest waren én alleen op de client bestonden, was de
 * onaangenaamste vondst van dit issue.
 */
describe('commitmentSchema — de grenzen', () => {
  it('laat precies de ondergrens door', () => {
    expect(parse({ body: 'x'.repeat(COMMITMENT_MIN) }).success).toBe(true);
  });

  it('weigert er eentje korter', () => {
    expect(parse({ body: 'x'.repeat(COMMITMENT_MIN - 1) }).success).toBe(false);
  });

  it('weigert leeg en blanco', () => {
    expect(parse({ body: '' }).success).toBe(false);
    expect(parse({ body: '     ' }).success).toBe(false);
  });

  it('laat precies de bovengrens door en weigert er één meer', () => {
    expect(parse({ body: 'x'.repeat(COMMITMENT_MAX) }).success).toBe(true);
    expect(parse({ body: 'x'.repeat(COMMITMENT_MAX + 1) }).success).toBe(false);
  });
});

/**
 * ⚠️ Migratie 0063 zette de grens ook in de database, met `char_length` — en dat
 *    telt codepunten. Zou dit schema `.min(3)` houden, dan telde het
 *    UTF-16-eenheden en lieten twee emoji de client passeren terwijl Postgres ze
 *    weigert. Dat is de bug uit QS8-118, hier dan nieuw geïntroduceerd.
 */
describe('commitmentSchema — telt zoals de database telt', () => {
  it('weigert twee emoji, ook al zijn dat vier UTF-16-eenheden', () => {
    const twee = EMOJI.repeat(2);

    expect(twee.length).toBe(4); // wat `.min(3)` zag
    expect(Array.from(twee).length).toBe(2); // wat char_length ziet

    expect(parse({ body: twee }).success).toBe(false);
  });

  it('laat drie emoji wél door, net als de CHECK', () => {
    expect(parse({ body: EMOJI.repeat(3) }).success).toBe(true);
  });
});

describe('commitmentSchema — de afbeelding', () => {
  it('accepteert geen afbeelding', () => {
    expect(parse({ image_url: null }).success).toBe(true);
  });

  it('accepteert een geldige link', () => {
    expect(parse({ image_url: 'https://example.com/foto.jpg' }).success).toBe(true);
  });

  it.each(['zomaar tekst', 'example.com/foto.jpg', ''])('weigert %s als link', (link) => {
    expect(parse({ image_url: link }).success).toBe(false);
  });
});
