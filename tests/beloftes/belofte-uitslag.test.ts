// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from '../render/scherm';

/**
 * Het beloftescherm noemt de uitslag van de vorige belofte — QS8-815
 * (besluit Quinten 23-11-2026: V1 = B, V2 = A, V3 = A, V4 = A).
 *
 * ⚠️⚠️ **Het echte `Beloftescherm`, met de echte `useBelofte()`, `belofteuitslag()`,
 *    `fetchBelofteStand()` en `fetchIntrekspoor()`.** Vervangen zijn alleen de
 *    Supabase-client (de netwerkgrens: elke tabel geeft wat de test zet), het doel
 *    (`fetchDoel`, één rij) en de sessie. De spoorregels hebben de vorm die de
 *    migraties schrijven; dat die vorm klopt, toetst `belofteuitslag-spoor.test.ts`.
 *
 * IJKING — met de hand, 23-11-2026 (elke mutatie rood op de genoemde toets; B ook op de twee
 * andere toetsen die een door de rollover gehouden belofte gebruiken, en verder niets):
 *   A  `if (doelstatusIn(spoor.payload) === 'completed') return 'gehouden';` weg in
 *      `belofteuitslag()` -> rood: 'gehouden door af te ronden'
 *   B  `if (spoor.actor_id === null) return 'gehouden';` -> `'ingetrokken'` -> rood: 'gehouden door de rollover'
 *   C  `uitslag={uitslagVan(d, d.vorige.id)}` -> `uitslag={null}` in `Vorige` -> rood: 'in werking'
 *   D  de regel `{ingetrokkenVoor === goalId ? (` -> `{false ? (` -> rood: 'na intrekken'
 *   E  `.eq('event_type', 'cancelled')` weg in `fetchIntrekspoor()` -> rood: 'leest alleen de cancelled-regel'
 *   F  `nieuwsteBeslist()` neemt de oudste in plaats van de nieuwste -> rood: 'alleen de nieuwste beslissing'
 */

vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const IK = '00000000-0000-0000-0000-00000000000a';
const DOEL = 'd1';

interface Verzoek {
  readonly tabel: string;
  readonly filters: [string, unknown][];
}

const db = {
  beloftes: [] as Record<string, unknown>[],
  spoor: [] as { actor_id: string | null; payload: unknown; event_type: string }[],
  verzoeken: [] as Verzoek[],
  updates: [] as unknown[],
};

/** Een PostgREST-bouwer: elke methode geeft hem terug, `await` geeft wat de tabel heeft. */
function bouwer(tabel: string) {
  const verzoek: Verzoek = { tabel, filters: [] };
  db.verzoeken.push(verzoek);
  let update = false;
  const antwoord = () => {
    if (update) return { data: [{ id: 'b-loopt' }], error: null };
    if (tabel === 'commitments') {
      const periode = verzoek.filters.find(([k]) => k === 'not:periode_start');
      return { data: periode ? db.beloftes : [], error: null };
    }
    if (tabel === 'commitment_events') {
      const soort = verzoek.filters.find(([k]) => k === 'eq:event_type')?.[1];
      return { data: db.spoor.filter((r) => soort === undefined || r.event_type === soort).slice(-1), error: null };
    }
    if (tabel === 'groups') return { data: [{ id: 'g1', name: 'Vrienden' }], error: null };
    if (tabel === 'group_members') {
      return { data: [{ group_id: 'g1', user_id: 'u2', profiles: { display_name: 'Sam' } }], error: null };
    }
    return { data: [], error: null };
  };
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'not', 'is', 'in', 'order', 'limit']) {
    b[m] = (k: unknown, ...rest: unknown[]) => {
      verzoek.filters.push([`${m}:${String(k)}`, rest[0]]);
      return b;
    };
  }
  b['update'] = (waarden: unknown) => {
    update = true;
    db.updates.push(waarden);
    return b;
  };
  b['then'] = (klaar: (w: unknown) => unknown) => Promise.resolve(antwoord()).then(klaar);
  return b;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    from: (tabel: string) => bouwer(tabel),
    auth: { getUser: async () => ({ data: { user: { id: IK } } }) },
  }),
}));
vi.mock('../../src/lib/observability', () => ({ reportError: () => undefined }));
vi.mock('../../src/modules/goals', async (echt) => ({
  ...(await echt<object>()),
  fetchDoel: async () => ({ id: DOEL, owner_id: IK, status: 'active', target_date: '2099-12-31' }),
}));
vi.mock('../../src/modules/auth', async (echt) => ({
  ...(await echt<object>()),
  useSession: () => ({ userId: IK }),
  useProfiel: () => ({ profiel: { week_start_day: 1, tz: 'Europe/Amsterdam' } }),
}));

const { createElement } = await import('react');
const { Beloftescherm } = await import('../../src/schermen/belofte');
const { belofteperiode } = await import('../../src/modules/commitments');
const { opmaaktaal, t } = await import('../../src/shared/i18n');
const { nl } = await import('../../src/shared/i18n/nl');
const { en } = await import('../../src/shared/i18n/en');
const { now, toonDatumLang, userCycleOn } = await import('../../src/shared/time');

const KLOK = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' as never };
const DEZE_WEEK = belofteperiode(KLOK, now()).start;
/** De week vóór deze, via `shared/time` (correctheidsregel 7). */
const VORIGE_WEEK = userCycleOn(KLOK, new Date(Date.parse(`${DEZE_WEEK}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10))!.startDate;
const NOG_EERDER = userCycleOn(KLOK, new Date(Date.parse(`${VORIGE_WEEK}T12:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10))!.startDate;

function belofte(id: string, status: string, periode_start: string) {
  return {
    id,
    goal_id: DOEL,
    type: 'penalty',
    body: 'Ik trakteer op koffie',
    image_url: null,
    beneficiary_group_id: 'g1',
    beneficiary_user_id: null,
    status,
    confirmed_at: '2026-11-01T08:00:00Z',
    created_at: `${periode_start}T08:00:00Z`,
    periode_start,
  };
}

const regel = (actor: string | null, doelstatus = 'active') => ({
  actor_id: actor,
  event_type: 'cancelled',
  payload: { type: 'penalty', van: 'set', naar: 'cancelled', doelstatus },
});

/** De verwachte zin, met de week zoals het scherm haar opmaakt. */
function zin(soort: 'gehouden' | 'in_werking' | 'ingetrokken', start: string): string {
  const week = userCycleOn(KLOK, start)!;
  const taal = opmaaktaal();
  return t(`belofte.uitslag.${soort}`, { start: toonDatumLang(week.startDate, taal), einde: toonDatumLang(week.endDate, taal) });
}

const toon = () => renderScherm(() => createElement(Beloftescherm, { goalId: DOEL }));
async function geladen() {
  const scherm = await toon();
  for (let i = 0; i < 5; i++) await scherm.wacht();
  return scherm;
}

beforeEach(() => {
  db.beloftes = [];
  db.spoor = [];
  db.verzoeken = [];
  db.updates = [];
});
afterEach(() => ruimAllesOp());

describe('één regel met de uitslag van de vorige belofte', () => {
  it('gehouden door de rollover: cancelled en geen actor', async () => {
    db.beloftes = [belofte('b1', 'cancelled', VORIGE_WEEK)];
    db.spoor = [regel(null)];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('gehouden', VORIGE_WEEK));
    expect(scherm.tekst()).not.toContain(zin('ingetrokken', VORIGE_WEEK));
  });

  it('gehouden door af te ronden: cancelled door de eigenaar, met het doel op completed', async () => {
    db.beloftes = [belofte('b1', 'cancelled', DEZE_WEEK)];
    db.spoor = [regel(IK, 'completed')];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('gehouden', DEZE_WEEK));
  });

  it('ingetrokken: cancelled door de eigenaar met een actief doel', async () => {
    db.beloftes = [belofte('b1', 'cancelled', DEZE_WEEK)];
    db.spoor = [regel(IK)];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('ingetrokken', DEZE_WEEK));
    expect(scherm.tekst()).not.toContain(zin('gehouden', DEZE_WEEK));
  });

  it('in werking: de kaart met wat je beloofde blijft, en de regel staat erin in plaats van de standregel', async () => {
    db.beloftes = [belofte('b1', 'due', VORIGE_WEEK)];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('in_werking', VORIGE_WEEK));
    expect(scherm.tekst()).toContain('Ik trakteer op koffie');
    expect(scherm.tekst()).not.toContain(t('belofte.stand.due.uitleg'));
  });

  it('bij twijfel niets: geen spoorregel, of een actor die niet de eigenaar is', async () => {
    db.beloftes = [belofte('b1', 'cancelled', VORIGE_WEEK)];
    const leeg = await geladen();
    for (const soort of ['gehouden', 'ingetrokken', 'in_werking'] as const) {
      expect(leeg.tekst()).not.toContain(zin(soort, VORIGE_WEEK));
    }
    ruimAllesOp();
    db.spoor = [regel('00000000-0000-0000-0000-00000000000b')];
    const vreemd = await geladen();
    for (const soort of ['gehouden', 'ingetrokken', 'in_werking'] as const) {
      expect(vreemd.tekst()).not.toContain(zin(soort, VORIGE_WEEK));
    }
  });

  it('alleen de nieuwste beslissing telt: een oudere due achter een gehouden week verdwijnt', async () => {
    db.beloftes = [belofte('b2', 'cancelled', VORIGE_WEEK), belofte('b1', 'due', NOG_EERDER)];
    db.spoor = [regel(null)];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('gehouden', VORIGE_WEEK));
    expect(scherm.tekst()).not.toContain(zin('in_werking', NOG_EERDER));
    expect(scherm.tekst()).not.toContain('Ik trakteer op koffie');
  });

  it('leest alleen de cancelled-regel van de nieuwste belofte, en alleen bij cancelled', async () => {
    db.beloftes = [belofte('b1', 'cancelled', VORIGE_WEEK)];
    db.spoor = [regel(null), { actor_id: IK, event_type: 'confirmed', payload: {} }];
    const scherm = await geladen();
    expect(scherm.tekst()).toContain(zin('gehouden', VORIGE_WEEK));
    const spoor = db.verzoeken.filter((v) => v.tabel === 'commitment_events');
    expect(spoor.length).toBeGreaterThan(0);
    expect(spoor.every((v) => v.filters.some(([k, w]) => k === 'eq:commitment_id' && w === 'b1'))).toBe(true);

    ruimAllesOp();
    db.verzoeken = [];
    db.beloftes = [belofte('b1', 'due', VORIGE_WEEK)];
    await geladen();
    expect(db.verzoeken.some((v) => v.tabel === 'commitment_events')).toBe(false);
  });

  it('geen regel zolang er een belofte loopt', async () => {
    db.beloftes = [belofte('b2', 'set', DEZE_WEEK), belofte('b1', 'cancelled', VORIGE_WEEK)];
    db.spoor = [regel(null)];
    const scherm = await geladen();
    expect(scherm.tekst()).not.toContain(zin('gehouden', VORIGE_WEEK));
  });
});

describe('na intrekken een korte bevestiging (V4 = A)', () => {
  it('na intrekken staat "Je belofte is ingetrokken." en blijft staan na het herladen', async () => {
    db.beloftes = [belofte('b-loopt', 'set', DEZE_WEEK)];
    const scherm = await geladen();
    expect(scherm.tekst()).not.toContain(t('belofte.ingetrokken_melding'));
    await scherm.klik(t('straf.intrekken'));
    // Wat de database na de intrekking teruggeeft; het herladen leest het pas na de tik.
    db.beloftes = [belofte('b-loopt', 'cancelled', DEZE_WEEK)];
    db.spoor = [regel(IK)];
    await scherm.klik(t('belofte.intrekken_ja'));
    for (let i = 0; i < 5; i++) await scherm.wacht();
    expect(db.updates).toEqual([{ status: 'cancelled' }]);
    expect(scherm.tekst()).toContain(t('belofte.ingetrokken_melding'));
    expect(scherm.tekst()).toContain(zin('ingetrokken', DEZE_WEEK));
  });

  it('zonder intrekking staat er geen melding, ook niet bij een ingetrokken belofte uit het verleden', async () => {
    db.beloftes = [belofte('b1', 'cancelled', DEZE_WEEK)];
    db.spoor = [regel(IK)];
    const scherm = await geladen();
    expect(scherm.tekst()).not.toContain(t('belofte.ingetrokken_melding'));
  });
});

describe('de woorden van het besluit, in beide talen', () => {
  it('nl en en dragen dezelfde vier sleutels met {start} en {einde}', () => {
    for (const soort of ['gehouden', 'in_werking', 'ingetrokken'] as const) {
      const sleutel = `belofte.uitslag.${soort}` as const;
      for (const catalogus of [nl, en]) {
        expect(catalogus[sleutel]).toContain('{start}');
        expect(catalogus[sleutel]).toContain('{einde}');
      }
    }
    expect(nl['belofte.ingetrokken_melding']).toBe('Je belofte is ingetrokken.');
    expect(en['belofte.ingetrokken_melding']).toBe('Your promise has been withdrawn.');
  });

  it('nl zegt woordelijk wat Quinten koos (V3 = A)', () => {
    expect(nl['belofte.uitslag.gehouden']).toBe(
      'Je hebt je belofte voor de week van {start} tot en met {einde} gehouden. Ze gaat niet in werking.',
    );
    expect(nl['belofte.uitslag.in_werking']).toBe(
      'Je hebt je belofte voor de week van {start} tot en met {einde} niet gehouden. Ze is in werking en je getuige kan haar lezen.',
    );
    expect(nl['belofte.uitslag.ingetrokken']).toBe(
      'Je hebt je belofte voor de week van {start} tot en met {einde} ingetrokken. Ze gaat niet in werking.',
    );
  });
});
