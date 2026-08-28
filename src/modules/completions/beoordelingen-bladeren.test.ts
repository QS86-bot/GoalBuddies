import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bladeren door de wachtrij gebruikt een cursor, geen plek — 0125.
 *
 * ⚠️ **Deze tests bestonden niet, en dat is de bevinding onder de bevinding.**
 *    Het pagineringscontract van `fetchBeoordelingen()` is met deze wijziging
 *    volledig omgegooid — van `p_offset` naar een cursor, en `meer` van een
 *    rekensom naar "er kwam een volle pagina terug" — en de héle unitsuite bleef
 *    groen: 1280 van 1280. Er was niets dat de clientkant van deze lijst raakte.
 *    Regel 18, vraag 3 in zijn zuiverste vorm.
 *
 * ⚠️ De databasekant staat in `tests/rls/beoordelingen-paginering.test.ts` en
 *    toetst iets anders: dat de SQL niemand overslaat. Dit bestand toetst de
 *    náád — wat de client uit een antwoord afleidt en wat hij er de volgende
 *    keer mee doet. Dat is precies de plek waar twee correcte helften langs
 *    elkaar heen kunnen praten.
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

const { fetchBeoordelingen, PER_PAGINA } = await import('./approvals');

/** Eén rij zoals `openstaande_beoordelingen()` hem teruggeeft. */
function rij(n: number, extra: Record<string, unknown> = {}) {
  return {
    completion_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    weekly_goal_id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    group_id: '00000000-0000-4000-a000-000000000001',
    owner_id: '00000000-0000-4000-b000-000000000001',
    owner_name: `Buddy ${n}`,
    owner_avatar: null,
    goal_title: 'Doel',
    weekly_title: `Week ${n}`,
    floor_text: null,
    ceiling_text: null,
    achieved_level: 'ceiling',
    note: null,
    submitted_at: `2026-01-01T12:${String(n).padStart(2, '0')}:00.000Z`,
    approvals_done: 0,
    approvals_required: 1,
    total_open: 40,
    ...extra,
  };
}

/** Wat de client bij de laatste aanroep als argumenten meestuurde. */
function laatsteArgumenten(): Record<string, unknown> {
  const laatste = rpc.mock.calls[rpc.mock.calls.length - 1];
  return (laatste?.[1] ?? {}) as Record<string, unknown>;
}

beforeEach(() => {
  rpc.mockReset();
});

describe('de eerste pagina', () => {
  it('stuurt geen cursor mee', async () => {
    rpc.mockResolvedValue({ data: [rij(1)], error: null });

    await fetchBeoordelingen();

    // ⚠️ De sleutels horen er hélemaal niet te staan. Zou de client ze als
    //    `null` meesturen, dan is dat vandaag dezelfde uitkomst — maar het
    //    gegenereerde type kent ze niet als nullable, en dan verdwijnt de
    //    bouwfout die een hernoemde parameter hoort te geven.
    expect(laatsteArgumenten()).toEqual({ p_limit: PER_PAGINA });
  });

  it('geeft de cursor van de laatste rij terug', async () => {
    rpc.mockResolvedValue({ data: [rij(1), rij(2), rij(3)], error: null });

    const uit = await fetchBeoordelingen();

    expect(uit.cursor).toEqual({
      at: '2026-01-01T12:03:00.000Z',
      id: '00000000-0000-4000-8000-000000000003',
    });
  });
});

describe('een volgende pagina', () => {
  it('stuurt beide cursorwaarden mee, of geen van beide', async () => {
    rpc.mockResolvedValue({ data: [rij(4)], error: null });

    await fetchBeoordelingen({ na: { at: '2026-01-01T12:03:00.000Z', id: 'abc' } });

    expect(laatsteArgumenten()).toEqual({
      p_limit: PER_PAGINA,
      p_na_at: '2026-01-01T12:03:00.000Z',
      p_na_id: 'abc',
    });
  });
});

describe('"er is meer"', () => {
  /**
   * ⚠️ **Dit was de rekensom `offset + opgehaald < totaal`, en juist die klopt
   *    niet zodra er tussendoor iets verdwijnt** — en op dít scherm laat de
   *    gebruiker zelf rijen verdwijnen door goed te keuren. Het totaal daalt, de
   *    teller niet, en de knop blijft staan of gaat te vroeg weg.
   */
  it('staat aan bij een volle pagina', async () => {
    rpc.mockResolvedValue({
      data: Array.from({ length: PER_PAGINA }, (_, i) => rij(i + 1)),
      error: null,
    });

    expect((await fetchBeoordelingen()).meer).toBe(true);
  });

  it('staat uit bij een halve pagina', async () => {
    rpc.mockResolvedValue({ data: [rij(1), rij(2)], error: null });

    expect((await fetchBeoordelingen()).meer).toBe(false);
  });

  it('staat uit bij een lege lijst, en geeft dan geen cursor', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const uit = await fetchBeoordelingen();

    expect(uit.meer).toBe(false);
    expect(uit.cursor).toBeNull();
  });
});

describe('een rij die de client niet kan lezen', () => {
  /**
   * ⚠️ **Dit is een vastloper en geen schoonheidsfoutje.** Een rij die
   *    `naarTeBeoordelen()` afkeurt valt uit `rijen` weg. Zou de cursor daaruit
   *    komen, dan is de laatste bruikbare rij de grens, komt de onleesbare rij
   *    bij de volgende pagina wéér mee, valt daar weer weg — en blijf je "meer
   *    laden" indrukken op dezelfde pagina, zonder dat er iets zegt wat er aan
   *    de hand is.
   */
  it('schuift er langs in plaats van erop vast te lopen', async () => {
    // ⚠️ Afgekeurd om een reden die de cursorkolommen niet raakt — twee van de
    //    vier eisen van `naarTeBeoordelen()` gaan over ándere kolommen. De rij
    //    kan dus nog prima zeggen waar de volgende pagina begint.
    rpc.mockResolvedValue({
      data: [rij(1), rij(2), rij(3, { weekly_goal_id: null })],
      error: null,
    });

    const uit = await fetchBeoordelingen();

    expect(uit.rijen).toHaveLength(2);
    // De cursor komt van de rij die de sérver als laatste stuurde, dus van de
    // rij die net is afgekeurd. Anders vraagt de volgende pagina hem opnieuw op.
    expect(uit.cursor?.at).toBe('2026-01-01T12:03:00.000Z');
  });

  /**
   * ⚠️ **De eerste versie van `volgendeCursor()` zocht hier terug naar de laatste
   *    rij mét beide waarden, en dat ís de lus die hij moest voorkomen** — met
   *    één stap ertussen. Deze test ving hem bij de eerste run. Stoppen met
   *    bladeren is het antwoord: `completion_id` is een primaire sleutel en
   *    `submitted_at` staat op `not null`, dus dit kan alleen als de functie iets
   *    anders teruggeeft dan haar handtekening zegt, en dan is doorgaan gokken.
   */
  it('geeft geen cursor als de laatste rij er zelf geen kan leveren', async () => {
    rpc.mockResolvedValue({
      data: [rij(1), rij(2), rij(3, { completion_id: null })],
      error: null,
    });

    const uit = await fetchBeoordelingen();

    expect(uit.rijen).toHaveLength(2);
    expect(uit.cursor).toBeNull();
  });
});
