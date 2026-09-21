import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wat de client doet met het antwoord van `groep_helden()` — 0268, QS8-493.
 *
 * ⚠️ **De databasekant staat in `tests/rls/heldenstem-in-een-open-groep.test.ts`
 *    en toetst iets anders**: dat de RPC nul rijen geeft in een beschermde
 *    groep, aan een niet-lid en aan een uitgezet lid. Dit bestand toetst de
 *    náád — of de client van die nul rijen ook daadwerkelijk *niets* maakt, en
 *    niet een lege kaart met een kop erboven.
 *
 * ⚠️⚠️ **De scherpste toets hier is de onbekende heldsleutel.** `hero_key` en
 *    `trigger` zijn CHECK-kolommen in de database (0264) waarvan `helden.ts` het
 *    register is. Komt er ooit een zevende held bij zonder dat dit register
 *    meegaat, dan zoekt het scherm `t('held.<onbekend>.naam')` op — een sleutel
 *    die niet bestaat. Dat is precies de klasse die de gegenereerde typen *niet*
 *    vangen: die beschrijven wat de functie belóóft, niet wat er over de lijn
 *    komt.
 *
 * IJKING — met de hand gedraaid op 16-09-2026, mutatie per grendel:
 *
 *   A  `isHeldsleutel(rij.hero_key)` uit `naarRij()` gehaald (met een cast op
 *      zijn plek, want anders valt typecheck er al over)
 *      → **2** rood: de onbekende-held-toets én de aftrektoets. 📏 Hier stond
 *        eerst één, en dat was een voorspelling en geen meting: de aftrektoets
 *        bouwt zijn overgeslagen rij mét een onbekende sleutel, dus die valt bij
 *        deze mutatie mee om. Dat is geen dubbeling maar een gevolg — A haalt
 *        de enige reden weg waarom er nog iets overgeslagen wórdt.
 *   B  de aftrek `ruw.length - rijen.length` uit het totaal gehaald
 *      → 1 rood: alleen de aftrektoets, en op zijn eigen regel (`totaal` is 2
 *        waar 1 hoort). Zonder die aftrek biedt de UI een volgende pagina aan
 *        die leeg terugkomt.
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

const { fetchGroepshelden } = await import('./groepshelden');

const GROEP = '00000000-0000-4000-a000-000000000001';

/** Eén rij zoals `groep_helden()` hem in een open groep geeft. */
function rij(extra: Record<string, unknown> = {}) {
  return {
    user_id: '00000000-0000-4000-a000-000000000002',
    display_name: 'Anna',
    hero_key: 'ignis',
    trigger: 'misser',
    totaal: 1,
    ...extra,
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('fetchGroepshelden', () => {
  it('geeft een lege pagina bij nul rijen, en dat is de beschermde groep', async () => {
    // ⚠️ Nul rijen is hier geen leegte maar de régel: `lid_van_open_groep()` in
    //    de `where` van de RPC. De client hoort er niets van te maken, en zeker
    //    geen fout — een beschermde groep is geen storing.
    rpc.mockResolvedValue({ data: [], error: null });

    const pagina = await fetchGroepshelden(GROEP);

    expect(pagina.rijen).toEqual([]);
    expect(pagina.totaal).toBe(0);
    expect(pagina.meer).toBe(false);
  });

  it('zet een geldige rij om naar naam, held en trigger', async () => {
    rpc.mockResolvedValue({ data: [rij()], error: null });

    const pagina = await fetchGroepshelden(GROEP);

    expect(pagina.rijen).toEqual([
      {
        userId: '00000000-0000-4000-a000-000000000002',
        naam: 'Anna',
        held: 'ignis',
        trigger: 'misser',
      },
    ]);
  });

  it('laat een rij met een onbekende heldsleutel vallen', async () => {
    // ⚠️⚠️ De belofte: er komt nooit een sleutel door waar `t()` niets bij heeft.
    //    Een cast zou deze rij hebben doorgelaten en het scherm laten zoeken naar
    //    `held.zevende.naam`.
    rpc.mockResolvedValue({
      data: [rij(), rij({ hero_key: 'zevende', user_id: '00000000-0000-4000-a000-000000000003' })],
      error: null,
    });

    const pagina = await fetchGroepshelden(GROEP);

    expect(pagina.rijen.map((r) => r.held)).toEqual(['ignis']);
  });

  it('laat een rij met een onbekende trigger vallen', async () => {
    rpc.mockResolvedValue({
      data: [rij({ trigger: 'iets_nieuws' })],
      error: null,
    });

    expect((await fetchGroepshelden(GROEP)).rijen).toEqual([]);
  });

  it('trekt een overgeslagen rij van het totaal af, zodat `meer` niet blijft hangen', async () => {
    // ⚠️ Zonder die aftrek is `totaal` 2 en `meer` waar, terwijl er maar één
    //    bruikbare rij is — de UI biedt dan een volgende pagina aan die leeg
    //    terugkomt. Zelfde aftrek als in `fetchKlassement()`.
    rpc.mockResolvedValue({
      data: [
        rij({ totaal: 2 }),
        rij({ totaal: 2, hero_key: 'onbekend', user_id: '00000000-0000-4000-a000-000000000003' }),
      ],
      error: null,
    });

    const pagina = await fetchGroepshelden(GROEP);

    expect(pagina.rijen).toHaveLength(1);
    expect(pagina.totaal).toBe(1);
    expect(pagina.meer).toBe(false);
  });

  it('werpt met een eigen melding als de RPC een fout geeft', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'kapot' } });

    await expect(fetchGroepshelden(GROEP)).rejects.toThrow('groepshelden.laden_mislukt');
  });

  it('vraagt de tweede pagina met de juiste offset', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await fetchGroepshelden(GROEP, { pagina: 2 });

    expect(rpc).toHaveBeenCalledWith('groep_helden', {
      p_group_id: GROEP,
      p_limit: 20,
      p_offset: 40,
    });
  });
});
