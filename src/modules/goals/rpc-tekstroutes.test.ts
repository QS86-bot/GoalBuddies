import { beforeEach, describe, expect, it, vi } from 'vitest';

import { zonderNulPixels } from '../../shared/tekst';

/**
 * De schrijfroutes die géén Zod-schema hebben, sturen niets dat de database
 * weigert — QS8-507, migratie 0284.
 *
 * ⚠️⚠️ **Dit bestand bestaat omdat "dit veld gaat langs een schema" waar is over
 *    een kolom en onwaar over een route.** Bij QS8-506 bleek `completions.note`
 *    twee schrijfroutes te hebben: één langs `afrondSchema` en één er volledig
 *    langs. Op die tweede liep een geplakte notitie vast op een CHECK met een
 *    melding die de gebruiker niet kon oplossen. `notitie-routes.test.ts` dekt
 *    dat geval; dit bestand dekt de twee die 0284 erbij zet.
 *
 * ⚠️ **Deze twee hebben geen tweede route om naast te leggen**, dus de vorm is
 *    anders: de toets eist dat wat er de deur uit gaat een **vast punt** van
 *    `zonderNulPixels()` is. Dat is woordelijk wat de CHECK vraagt —
 *    `kolom = zonder_onzichtbaar_middenin(zonder_bidi(kolom))` in twee
 *    constraints — dus hij toetst de belofte en niet de implementatie. Zou
 *    iemand het strijken vervangen door iets anders dat hetzelfde bereikt, dan
 *    blijft hij terecht groen.
 *
 * ⚠️ **Met een tweede toets eronder die hem betekenis geeft** (regel 18, vraag
 *    3): een route die de tekst ongewijzigd doorgeeft, levert voor onschuldige
 *    invoer óók een vast punt op. Zonder die tweede blijft dit groen terwijl er
 *    niets gestreken wordt.
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
  // ⚠️ `veiligheid.ts` importeert ook `Sleutel` als type; dat verdwijnt bij het
  //    compileren en hoort hier dus niet in de mock.
}));

const { beslisDeadlineVerzoek } = await import('./deadline');
const { meldPersoon } = await import('../buddies/veiligheid');

const ID = '00000000-0000-4000-a000-000000000001';

/**
 * ⚠️ Elk geval draagt een teken dat een van de twee CHECKs weigert, óf
 *    witruimte die erachter schuilgaat. `U+200B` is de zuiverste: `.trim()` ziet
 *    hem niet als witruimte.
 */
const GEVALLEN: readonly { readonly naam: string; readonly invoer: string }[] = [
  { naam: 'een zero-width space middenin', invoer: 'Het lukte​niet deze week' },
  { naam: 'een zero-width space aan de rand', invoer: '​Het lukte niet​' },
  { naam: 'witruimte achter een onzichtbaar teken', invoer: '​  Meer tijd nodig  ​' },
  { naam: 'een right-to-left override', invoer: 'Zie ‮gnitseb‬ hier' },
  { naam: 'een soft hyphen', invoer: 'Het lukte niet, te veel ge­doe' },
  { naam: 'een gewone tekst', invoer: 'Ik heb meer tijd nodig' },
  { naam: 'een tekst met een gezinsemoji', invoer: 'Gelukt met \u{1F468}‍\u{1F469}‍\u{1F467}' },
];

async function viaDeadlineBesluit(opmerking: string): Promise<string | undefined> {
  rpc.mockResolvedValueOnce({ data: { ok: true, verschoven: true }, error: null });
  await beslisDeadlineVerzoek(ID, true, opmerking);
  const argumenten = rpc.mock.calls[0]?.[1] as { p_note?: string } | undefined;
  return argumenten?.p_note;
}

async function viaMelding(toelichting: string): Promise<string | null | undefined> {
  rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
  await meldPersoon(ID, ID, 'other', toelichting);
  const argumenten = rpc.mock.calls[0]?.[1] as { p_toelichting?: string | null } | undefined;
  return argumenten?.p_toelichting;
}

describe('de RPC-routes zonder schema', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it.each(GEVALLEN)(
    '`beslis_deadline_verzoek` stuurt iets dat de CHECK aanneemt bij $naam',
    async ({ invoer }) => {
      const uit = await viaDeadlineBesluit(invoer);

      expect(uit).toBeDefined();
      expect(
        zonderNulPixels(uit as string),
        'de opmerking die de deur uit gaat wordt door `deadline_requests_decision_note_geen_nul_pixels` geweigerd',
      ).toBe(uit);
    },
  );

  it.each(GEVALLEN)(
    '`meld` stuurt iets dat de CHECK aanneemt bij $naam',
    async ({ invoer }) => {
      const uit = await viaMelding(invoer);

      expect(uit).not.toBeNull();
      expect(
        zonderNulPixels(uit as string),
        'de toelichting die de deur uit gaat wordt door `reports_toelichting_geen_nul_pixels` geweigerd',
      ).toBe(uit);
    },
  );

  it('en die twee strijken daarbij daadwerkelijk iets weg', async () => {
    const opmerking = await viaDeadlineBesluit('Het lukte​niet deze week');
    expect(opmerking).toBe('Het lukteniet deze week');
    expect(opmerking).not.toContain('\u200B');

    rpc.mockReset();
    const toelichting = await viaMelding('\u200BHet lukte niet\u200B');
    expect(toelichting).toBe('Het lukte niet');
  });

  it('laten hun argument weg zodra er na het strijken niets overblijft', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, verschoven: true }, error: null });
    await beslisDeadlineVerzoek(ID, true, '​ ­ ﻿');
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('p_note');

    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await meldPersoon(ID, ID, 'other', '\u200B \u00AD');
    const argumenten = rpc.mock.calls[0]?.[1] as { p_toelichting?: string | null };
    expect(argumenten.p_toelichting).toBeNull();
  });
});
