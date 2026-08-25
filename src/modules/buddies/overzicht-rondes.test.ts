import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Het groepsoverzicht kost één ronde — de bevinding van 15-08 (QS8-55).
 *
 * ⚠️ **Deze test bestond niet, terwijl de code beweerde van wel.** Het
 *    doc-commentaar boven `fetchGroepsoverzicht()` zei woordelijk: "er staat een
 *    test op met twaalf leden die telt hoeveel verzoeken het kost". Die stond er
 *    niet, nergens. De rij in `docs/ENGINEER-REVIEW.md` zei het andere
 *    ("er is nog steeds geen queryteller in de tests") en had gelijk.
 *
 *    Dat is de duurste vorm die dit project kent, en hier in zijn zuiverste
 *    gedaante: een bewering over een controle, in plaats van de controle. Wie het
 *    commentaar leest, slaat de vraag over.
 *
 * ⚠️ **Waarom een teller en niet een meting.** De kosten van `group_overview()`
 *    zijn los gemeten (warm 4,6–6,9 ms bij vijftig leden). Dat zegt niets over
 *    N+1: het gevaar is niet dat de query traag is maar dat er ooit een lus
 *    omheen komt — één ronde per lid, wat bij drie leden onzichtbaar is en bij
 *    twaalf een half scherm kost. Alleen het áántal rondes vangt dat.
 *
 * ⚠️ Twaalf leden, want dat is het maximum per groep (`join_group_with_code`).
 *    Zou het aantal rondes met het aantal leden meegroeien, dan is dit precies de
 *    grootste groep die het product toestaat.
 */

const rpc = vi.fn();

/**
 * ⚠️ Geeft een keten terug die je kunt doorlopen, en niet `undefined`. Anders
 *    klapt een N+1 om op "kan `.select` niet lezen" en is de test rood om de
 *    verkeerde reden — dan bewijst hij dat er iets crasht, niet dat er te veel
 *    rondes zijn.
 */
const keten = { select: () => keten, eq: () => Promise.resolve({ data: [], error: null }) };
const from = vi.fn(() => keten);

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc, from }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

const { fetchGroepsoverzicht } = await import('./api');

/** Twaalf leden, zoals `group_overview()` ze teruggeeft. */
const TWAALF = Array.from({ length: 12 }, (_, i) => ({
  user_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  display_name: `Lid ${i}`,
  avatar_url: null,
  role: 'member',
  status: 'active',
  goal_id: null,
  goal_title: null,
  milestones_total: 0,
  milestones_done: 0,
  current_streak: 0,
  best_streak: 0,
  closed_this_period: false,
  total_members: 12,
}));

describe('fetchGroepsoverzicht — het aantal rondes', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    rpc.mockResolvedValue({ data: TWAALF, error: null });
  });

  it('kost precies één ronde bij twaalf leden', async () => {
    await fetchGroepsoverzicht('groep-1', { startDate: '2026-08-24', endDate: '2026-08-30' } as never);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe('group_overview');
  });

  it('raakt geen enkele tabel rechtstreeks aan', async () => {
    // ⚠️ **Dit is de helft die de N+1 écht vangt.** Een lus per lid zou hier
    //    komen te staan — `from('profiles')` of `from('user_streaks')` per rij —
    //    en niet als een tweede `rpc`. Zonder deze toets telt de test alleen de
    //    RPC en ziet hij de vorm die de bevinding beschrijft niet.
    await fetchGroepsoverzicht('groep-1', { startDate: '2026-08-24', endDate: '2026-08-30' } as never);

    expect(from).not.toHaveBeenCalled();
  });

  it('kost nog steeds één ronde bij drie leden', async () => {
    // Het aantal rondes mag niet van het aantal leden afhangen — dát is de
    // belofte. Eén meting bij twaalf zegt daar niets over.
    rpc.mockResolvedValue({ data: TWAALF.slice(0, 3), error: null });

    await fetchGroepsoverzicht('groep-1', { startDate: '2026-08-24', endDate: '2026-08-30' } as never);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('vraagt één pagina en niet de hele groep', async () => {
    // Onwrikbare regel 10: ongepagineerd bestaat niet. Een `p_limit` die
    // wegvalt, is geen N+1 maar wel dezelfde klasse — één ronde die met de groep
    // meegroeit.
    await fetchGroepsoverzicht('groep-1', { startDate: '2026-08-24', endDate: '2026-08-30' } as never);

    const argumenten = rpc.mock.calls[0]?.[1] as { p_limit?: number; p_offset?: number };
    expect(argumenten.p_limit).toBeGreaterThan(0);
    expect(argumenten.p_offset).toBe(0);
  });
});
