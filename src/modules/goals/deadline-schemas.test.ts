import { describe, expect, it } from 'vitest';

import {
  ARGUMENT_MAX,
  ARGUMENT_MIN,
  deadlineVerzoekSchema,
} from './deadline-schemas';

/**
 * QS8-120. Dit bestand kón niet bestaan zolang het schema in `deadline.ts` stond:
 * dat importeert `lib/supabase` en trekt React Native mee, dus een test die het
 * schema wilde bereiken viel al om op de parser.
 *
 * Wat hier bewaakt wordt is een echte grens. Een deadline verschuiven kan alleen
 * met akkoord van een buddy, en het argument is wat die buddy leest om te
 * beslissen. "geen tijd" hoort niet door te komen.
 */

const EMOJI = '\u{1F600}';
const GELDIG = { new_date: '2027-03-15', reason: 'a'.repeat(ARGUMENT_MIN) };

function parse(velden: Partial<typeof GELDIG>) {
  return deadlineVerzoekSchema.safeParse({ ...GELDIG, ...velden });
}

describe('het argument — lengte', () => {
  it('laat een argument van precies de ondergrens door', () => {
    expect(parse({ reason: 'x'.repeat(ARGUMENT_MIN) }).success).toBe(true);
  });

  it('weigert er eentje dat één teken te kort is', () => {
    expect(parse({ reason: 'x'.repeat(ARGUMENT_MIN - 1) }).success).toBe(false);
  });

  it('weigert een leeg of blanco argument', () => {
    expect(parse({ reason: '' }).success).toBe(false);
    expect(parse({ reason: '   ' }).success).toBe(false);
  });

  it('telt na het trimmen, niet ervoor', () => {
    const metSpaties = `  ${'x'.repeat(ARGUMENT_MIN - 5)}     `;

    expect(metSpaties.length).toBeGreaterThan(ARGUMENT_MIN);
    expect(parse({ reason: metSpaties }).success).toBe(false);
  });

  it('laat precies de bovengrens door en weigert er één meer', () => {
    expect(parse({ reason: 'x'.repeat(ARGUMENT_MAX) }).success).toBe(true);
    expect(parse({ reason: 'x'.repeat(ARGUMENT_MAX + 1) }).success).toBe(false);
  });
});

/**
 * ⚠️ De regressie uit QS8-118, en de reden dat dit bestand bestaat.
 *
 * Zod's `.min()` telt UTF-16-eenheden; `deadline_requests_reason_len` telt met
 * `char_length` codepunten. Bij een óndergrens gaat dat verschil de gevaarlijke
 * kant op: `.length` is altijd ≥ `char_length`, dus tien emoji haalden de
 * clientcontrole terwijl Postgres het verzoek weigerde. De gebruiker kreeg een
 * storingsmelding nadat het formulier "Lang genoeg" had gezegd.
 */
describe('het argument — emoji tellen als één teken, net als in de database', () => {
  it('weigert tien emoji, ook al zijn dat twintig UTF-16-eenheden', () => {
    const tien = EMOJI.repeat(10);

    expect(tien.length).toBe(20); // wat `.min(20)` zag
    expect(Array.from(tien).length).toBe(10); // wat char_length ziet

    expect(parse({ reason: tien }).success).toBe(false);
  });

  it('laat twintig emoji wél door', () => {
    expect(parse({ reason: EMOJI.repeat(ARGUMENT_MIN) }).success).toBe(true);
  });

  it('rekent een samengestelde emoji zoals Postgres dat doet', () => {
    // 👨‍👩‍👧‍👦 is zeven codepunten; drie ervan halen de twintig net niet.
    const gezin = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';

    expect(Array.from(gezin.repeat(3)).length).toBe(21);
    expect(parse({ reason: gezin.repeat(3) }).success).toBe(true);
    expect(parse({ reason: gezin.repeat(2) }).success).toBe(false);
  });
});

describe('de streefdatum', () => {
  it('laat een geldige datum door', () => {
    expect(parse({ new_date: '2027-03-15' }).success).toBe(true);
  });

  /**
   * ⚠️ De fout die de comment in het schema beschrijft: hier stond ooit
   *    `z.string().min(1)`, en `datumLigtInDeToekomst` vergelijkt strings — dus
   *    "morgen" gold als een geldige toekomstige datum. Postgres viel er daarna
   *    over, nadat de gebruiker zijn argument al had getypt.
   */
  it('weigert tekst die geen datum is', () => {
    expect(parse({ new_date: 'morgen' }).success).toBe(false);
  });

  it('weigert een datum die niet bestaat', () => {
    expect(parse({ new_date: '2027-02-30' }).success).toBe(false);
    expect(parse({ new_date: '2027-13-01' }).success).toBe(false);
  });
});

describe('de foutmelding', () => {
  it('legt bij een te kort argument uit wat er gevraagd wordt', () => {
    const uit = parse({ reason: 'geen tijd' });

    expect(uit.success).toBe(false);
    if (uit.success) return;

    const melding = uit.error.issues[0]?.message ?? '';
    expect(melding).toContain('wat er veranderd is');
  });

  it('noemt bij een te lang argument de echte grens', () => {
    const uit = parse({ reason: 'x'.repeat(ARGUMENT_MAX + 1) });

    expect(uit.success).toBe(false);
    if (uit.success) return;

    expect(uit.error.issues[0]?.message ?? '').toContain(String(ARGUMENT_MAX));
  });
});
