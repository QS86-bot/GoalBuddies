import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De twee schrijfroutes naar `completions.note` sturen dezelfde tekst — QS8-506.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat elk schakeltje af was en de keten op één van
 *    de twee paden doodliep.** Migratie 0283 zet
 *    `completions_note_geen_nul_pixels` op die kolom. `rondAf()` gaat langs
 *    `afrondSchema` en strijkt; `dienOpnieuwIn()` gaat langs **geen enkel
 *    schema** en deed alleen `.trim()`.
 *
 *    📏 Gemeten in de security-review op QS8-506: een notitie met een `U+200B`
 *    erin kwam via die tweede route ongestreken binnen, `dien_opnieuw_in()`
 *    btrimt zelf maar haalt zo'n teken niet weg, de CHECK weigerde met `23514`,
 *    en de exception-handler van die RPC herkende die melding niet — dus de
 *    gebruiker kreeg `opnieuw.mislukt` en kon zijn week met diezelfde geplakte
 *    tekst **nooit meer** opnieuw indienen.
 *
 * ⚠️ **De belofte en niet het onderdeel** (onwrikbare regel 18, vraag 2). Deze
 *    toets kijkt niet of er érgens een `schoneVrijeTekst()` staat — dat grijpt
 *    naar een plek en verhuist niet mee. Hij vangt op wat er daadwerkelijk als
 *    `p_note` de deur uit gaat, langs beide routes, en eist dat die twee gelijk
 *    zijn.
 *
 * ⚠️ **Twee routes en niet één, want dat ís de naad.** Zou hier alleen
 *    `dienOpnieuwIn()` staan, dan legt de toets een waarde naast een verwachting
 *    die de toets zelf verzint. Naast de ándere route gelegd, blijft hij kloppen
 *    als iemand de regel verandert — en wordt hij rood zodra er één van de twee
 *    meeverandert en de ander niet.
 */

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

vi.mock('../../shared/i18n', () => ({
  t: (sleutel: string) => sleutel,
}));

const { dienOpnieuwIn } = await import('./approvals');
const { afrondSchema } = await import('./completion-schemas');

const WEEKDOEL = '00000000-0000-4000-a000-000000000001';

/**
 * Wat `rondAf()` als notitie zou versturen: de uitkomst van het schema.
 *
 * ⚠️ Hier langs het schéma en niet langs `rondAf()` zelf, want die functie
 *    uploadt eerst een bijlage en dat is een tweede afhankelijkheid die niets
 *    met deze naad te maken heeft. Wat `rondAf()` verstuurt ís
 *    `gevalideerd.data.note` — dat pad staat onder `completion-schemas.test.ts`.
 */
function viaHetSchema(note: string): string | null {
  const uit = afrondSchema.safeParse({ achieved_level: 'ceiling', note });
  return uit.success ? uit.data.note : null;
}

/** Wat `dienOpnieuwIn()` daadwerkelijk als `p_note` meestuurt. */
async function viaOpnieuwIndienen(note: string): Promise<string | undefined> {
  rpc.mockResolvedValueOnce({ data: 'pending', error: null });
  await dienOpnieuwIn(WEEKDOEL, 'ceiling', note);
  const argumenten = rpc.mock.calls[0]?.[1] as { p_note?: string } | undefined;
  return argumenten?.p_note;
}

/**
 * ⚠️ Elk geval draagt een teken dat de CHECK weigert óf witruimte die er
 *    achter schuilgaat. `U+200B` is de zuiverste: `String.prototype.trim()` ziet
 *    hem niet als witruimte, dus een `.trim()` alleen laat hem staan én laat de
 *    spaties erachter staan.
 */
const GEVALLEN: readonly { readonly naam: string; readonly invoer: string }[] = [
  { naam: 'een zero-width space middenin', invoer: 'Deze week 3x​gelopen' },
  { naam: 'een zero-width space aan de rand', invoer: '​Deze week 3x gelopen​' },
  { naam: 'witruimte die achter een onzichtbaar teken schuilgaat', invoer: '​  Gelopen  ​' },
  { naam: 'een soft hyphen', invoer: 'Deze week 3x ge­lopen' },
  { naam: 'een byte order mark', invoer: '﻿Deze week 3x gelopen' },
  { naam: 'een gewone notitie', invoer: 'Deze week 3x gelopen' },
  { naam: 'een notitie met een gezinsemoji', invoer: 'Gelopen met \u{1F468}‍\u{1F469}‍\u{1F467}' },
];

describe('de twee schrijfroutes naar `completions.note`', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it.each(GEVALLEN)('sturen dezelfde tekst bij $naam', async ({ invoer }) => {
    const opnieuw = await viaOpnieuwIndienen(invoer);

    expect(
      opnieuw,
      'wat "opnieuw indienen" verstuurt wijkt af van wat het afrondformulier ' +
        'verstuurt — dan weigert de CHECK de ene route en de andere niet',
    ).toBe(viaHetSchema(invoer));
  });

  /**
   * ⚠️ **Zonder deze toets bewaakt de vorige niets** (regel 18, vraag 3). Geven
   *    beide routes de tekst ongewijzigd door, dan zijn ze óók aan elkaar gelijk
   *    — en dan blijft de toets hierboven groen terwijl geen van beide strijkt.
   */
  it('en strijken daarbij daadwerkelijk iets weg', async () => {
    const opnieuw = await viaOpnieuwIndienen('Deze week 3x​gelopen');

    expect(opnieuw).toBe('Deze week 3xgelopen');
    expect(opnieuw).not.toContain('​');
  });

  /**
   * ⚠️ Een notitie van louter onzichtbare tekens is ná het strijken leeg, en dan
   *    hoort `p_note` wég te blijven in plaats van als lege string mee te gaan:
   *    `completions_note_len` eist minstens één teken zodra hij niet null is.
   */
  it('laten `p_note` weg zodra er na het strijken niets overblijft', async () => {
    rpc.mockResolvedValueOnce({ data: 'pending', error: null });
    await dienOpnieuwIn(WEEKDOEL, 'ceiling', '​ ­ ﻿');

    const argumenten = rpc.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(argumenten).not.toHaveProperty('p_note');
  });
});
