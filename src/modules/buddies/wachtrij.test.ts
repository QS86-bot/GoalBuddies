import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * De datalaag van de buddywachtrij na het verlopen — QS8-643.
 *
 * ⚠️ **De belofte: wie veertien dagen tevergeefs zocht, ziet dát, en krijgt een
 *    weg verder.** Tot QS8-643 gooide `naarStand()` elke status buiten
 *    `wachtend` en `gekoppeld` weg, en dan zag een verlopen zoekopdracht eruit
 *    als "je zoekt niet". Deze tests toetsen de vertaling van de RPC-rij, de
 *    tweede weg naar `verlopen` (de klok, voor een scherm dat open blijft staan)
 *    en de keuze van de alternatieven. Wat de database teruggeeft, toetst
 *    `tests/rls/buddywachtrij-verlopen.test.ts`.
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

const { fetchBuddyzoekStand, isVerlopen, kiesAlternatieven, verloopdatumTekst, ALTERNATIEVEN_MAX } = await import('./wachtrij');
const { freezeNow, unfreezeNow } = await import('../../shared/time');
type TimeZone = import('../../shared/time').TimeZone;

const NU = new Date('2026-11-17T12:00:00Z');

function rij(extra: Record<string, unknown> = {}) {
  return {
    status: 'wachtend',
    nog_nodig: 2,
    sinds: '2026-11-01T12:00:00Z',
    verloopt: '2026-11-15T12:00:00Z',
    group_id: null,
    ...extra,
  };
}

function groep(id: string) {
  return { groupId: id, naam: `groep ${id}`, categorie: 'fitness', omschrijving: null, voertaal: null, huddleDag: 1, leden: 3 };
}

beforeEach(() => {
  rpc.mockReset();
  freezeNow(NU);
});

afterEach(() => {
  unfreezeNow();
});

describe('fetchBuddyzoekStand kent `verlopen`', () => {
  it('geeft een verlopen stand terug, met de datum, en niet `null`', async () => {
    rpc.mockResolvedValue({ data: [rij({ status: 'verlopen', nog_nodig: 0 })], error: null });

    const stand = await fetchBuddyzoekStand('doel', '2026-11-17');

    expect(stand).toMatchObject({ status: 'verlopen', verloopt: '2026-11-15T12:00:00Z' });
  });

  it('laat een onbekende status nog steeds weg', async () => {
    rpc.mockResolvedValue({ data: [rij({ status: 'vertrokken' })], error: null });

    expect(await fetchBuddyzoekStand('doel', '2026-11-17')).toBeNull();
  });
});

describe('isVerlopen — twee wegen, en het scherm ziet ze allebei', () => {
  it('ziet de status van de database', () => {
    expect(isVerlopen({ status: 'verlopen', nogNodig: 0, sinds: '', verloopt: '2026-12-01T00:00:00Z', groupId: null })).toBe(true);
  });

  it('ziet een wachtende stand waarvan de termijn voorbij is, ook als de database hem nog wachtend noemde', () => {
    // ⚠️ De naad uit de acceptatiecriteria: de rij verloopt terwijl het scherm
    //    open staat. De stand is van vóór het verlopen; de klok niet.
    expect(isVerlopen({ status: 'wachtend', nogNodig: 2, sinds: '', verloopt: '2026-11-17T11:59:00Z', groupId: null })).toBe(true);
  });

  it('laat een wachtende stand binnen de termijn met rust', () => {
    expect(isVerlopen({ status: 'wachtend', nogNodig: 2, sinds: '', verloopt: '2026-11-17T12:01:00Z', groupId: null })).toBe(false);
  });

  it('noemt een gekoppelde stand nooit verlopen, ook niet na de termijn', () => {
    // Gekoppeld is af; de termijn gold alleen voor het zoeken.
    expect(isVerlopen({ status: 'gekoppeld', nogNodig: 0, sinds: '', verloopt: '2026-11-01T00:00:00Z', groupId: 'g' })).toBe(false);
  });
});

describe('kiesAlternatieven', () => {
  it('laat een groep waar je al in zit weg', () => {
    const gekozen = kiesAlternatieven([groep('a'), groep('b'), groep('c')], new Set(['b']));

    expect(gekozen.map((g) => g.groupId)).toEqual(['a', 'c']);
  });

  it('toont er hoogstens drie, in de volgorde van de database', () => {
    const gekozen = kiesAlternatieven(['a', 'b', 'c', 'd', 'e'].map(groep), new Set());

    expect(ALTERNATIEVEN_MAX).toBe(3);
    expect(gekozen.map((g) => g.groupId)).toEqual(['a', 'b', 'c']);
  });

  it('geeft een lege lijst als alles al van jou is — het scherm zegt dan dat er nu niets is', () => {
    expect(kiesAlternatieven([groep('a')], new Set(['a']))).toEqual([]);
  });
});

describe('verloopdatumTekst — een datum, geen tijdstempel', () => {
  // ⚠️ 📏 Code-review op QS8-643: `toonDatum()` gaf een `timestamptz` ongewijzigd
  //    terug, en het scherm zei "we zoeken tot 2026-11-15T12:34:56.789+00:00".
  //    Deze invoer is de vorm die PostgREST echt teruggeeft.
  const stand = { status: 'verlopen' as const, nogNodig: 0, sinds: '', verloopt: '2026-11-15T23:30:00.123456+00:00', groupId: null };

  it('toont de kalenderdag, zonder tijd of zone', () => {
    const tekst = verloopdatumTekst(stand, 'UTC' as TimeZone, 'nl-NL');
    expect(tekst).toBe('15-11-2026');
    expect(tekst).not.toContain('T');
  });

  it('in de zone van de lezer: half twaalf UTC is in Amsterdam al de volgende dag', () => {
    expect(verloopdatumTekst(stand, 'Europe/Amsterdam' as TimeZone, 'nl-NL')).toBe('16-11-2026');
  });
});
