import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wat de client doet met het limietantwoord van `invite_preview()` — 0131, QS8-236.
 *
 * ⚠️ **De databasekant staat in `tests/rls/uitnodigingslimiet.test.ts` en toetst
 *    iets anders**: dat de functie boven de limiet ophoudt met werken, en dat dat
 *    antwoord verschilt van "deze code bestaat niet". Dit bestand toetst de náád —
 *    of de client dat verschil ook daadwerkelijk máákt.
 *
 * ⚠️ **Zonder dit bestand is de keten stuk terwijl beide schakels af zijn.** De
 *    migratie kan een keurig `{"limiet_bereikt": true}` teruggeven en
 *    `fetchUitnodiging()` kan dat vrolijk als een groep behandelen: het is een
 *    object, `data === null` is onwaar, en dan valt het door naar de gewone
 *    route. Het scherm toont dan een uitnodiging zonder naam en zonder leden.
 *    Geen enkele test aan wéérszijde ziet dat. Dat is regel 18 vraag 5.
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

const { fetchUitnodiging } = await import('./api');

/** Een compleet antwoord zoals `invite_preview()` het onder de limiet geeft. */
function groep(extra: Record<string, unknown> = {}) {
  return {
    group_id: '00000000-0000-4000-a000-000000000001',
    group_name: 'De Vroege Vogels',
    icon: null,
    huddle_day: 1,
    zichtbaarheid: 'beschermd',
    member_count: 3,
    detailed: false,
    members: [{ display_name: 'Anna', avatar_url: null, goal_title: null }],
    ...extra,
  };
}

describe('fetchUitnodiging kent het limietantwoord (0131)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('geeft de groep terug zolang de limiet niet bereikt is', async () => {
    rpc.mockResolvedValue({ data: groep(), error: null });

    const uit = await fetchUitnodiging('LIMIETPROEF1');

    expect(uit?.group_name).toBe('De Vroege Vogels');
    expect(uit?.zichtbaarheid).toBe('beschermd');
  });

  it('werpt bij een bereikte limiet, en behandelt het antwoord niet als groep', async () => {
    rpc.mockResolvedValue({ data: { limiet_bereikt: true }, error: null });

    // ⚠️ Dit is de belofte: het antwoord mag hier nooit als uitnodiging langs.
    //    Een `expect(...).rejects` en niet `toBeNull()`, want stil `null`
    //    teruggeven is precies de verwarring die 0131 wilde voorkomen.
    await expect(fetchUitnodiging('LIMIETPROEF1')).rejects.toThrow(
      'groep.uitnodiging_te_druk',
    );
  });

  it('zegt bij een bereikte limiet iets anders dan bij een code die niet bestaat', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const onbekend = await fetchUitnodiging('BESTAATNIET1');

    rpc.mockResolvedValue({ data: { limiet_bereikt: true }, error: null });
    const geweigerd = await fetchUitnodiging('LIMIETPROEF1').then(
      () => 'gaf een uitnodiging terug',
      (fout: Error) => fout.message,
    );

    // Onbekend is stil `null` — dat is 0019 en dat blijft zo. Een bereikte
    // limiet is dat uitdrukkelijk niet.
    expect(onbekend).toBeNull();
    expect(geweigerd).toBe('groep.uitnodiging_te_druk');
  });

  it('laat een oudere server zonder dit veld gewoon door', async () => {
    // ⚠️ De web-app wordt los van de database gedeployd. Tussen die twee zit
    //    altijd een moment waarop de client nieuw is en de server oud, of
    //    andersom. Een wacht die op `'limiet_bereikt' in data` staat, gooit hier
    //    niet — maar op een antwoord dat géén object is wél, en `Json` is ook
    //    een getal of een string.
    rpc.mockResolvedValue({ data: groep(), error: null });
    await expect(fetchUitnodiging('LIMIETPROEF1')).resolves.not.toBeNull();

    rpc.mockResolvedValue({ data: 'onverwacht', error: null });
    await expect(fetchUitnodiging('LIMIETPROEF1')).resolves.toBeTruthy();
  });
});
