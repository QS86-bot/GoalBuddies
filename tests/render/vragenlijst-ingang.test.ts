// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, routeParams, router, ruimAllesOp } from './scherm';

/**
 * De vaste ingang naar de vragenlijst op Profiel, en waar de vragenlijst daarna heen gaat — QS8-817.
 *
 * ⚠️ **Besluit Quinten (23-11-2026, 17:06 UTC): variant B en (ii).** Een kaart op Profiel voor
 *    iedereen; wie via die kaart komt, gaat na "Bewaren en verder" terug naar Profiel, zonder de
 *    verwijzing naar de belofte. Elke andere weg houdt `/doelen?belofte=na-vragenlijst`.
 *
 * ⚠️ **De naad is het punt.** De ingang geeft een parameter mee en een ánder scherm leest hem.
 *    Daarom rendert dit bestand allebei: het echte kaartcomponent én de echte route
 *    `app/onboarding/vragenlijst.tsx` met de echte `useVragenlijst`. Alleen de netwerkgrens
 *    (`updateProfiel`, `heldprofiel`) en sessie en profiel zijn vervangen. Wat de kaart meegeeft
 *    gaat letterlijk als `routeParams` het vragenlijstscherm in.
 *
 * ⚠️ `app/(tabs)/profiel.tsx` zelf laadt onder deze mocks niet (zie de kop van `./scherm.ts`). Dat
 *    de kaart daar onder Instellingen staat, toetst `tests/beloftes/vragenlijst-vaste-ingang.test.ts`.
 */

const A = '00000000-0000-4000-8000-000000000817';

const mocks = vi.hoisted(() => ({
  profiel: null as Record<string, unknown> | null,
  updateProfiel: undefined as unknown as Mock<(...a: unknown[]) => unknown>,
}));

vi.mock('@/modules/auth', () => ({
  useSession: () => ({ userId: A, session: { user: { id: A } }, loading: false }),
  useProfiel: () => ({ profiel: mocks.profiel, herlaad: () => {}, loading: false, error: null }),
  updateProfiel: (...a: unknown[]) => mocks.updateProfiel(...a),
}));

vi.mock('@/modules/helden', async (echt) => ({
  ...(await echt<Record<string, unknown>>()),
  heldprofiel: async () => null,
  bewaarHeld: async () => ({ ok: true }),
}));

// ⚠️ De echte index trekt `expo-constants` mee, en dat laadt niet in node. Het voorbeeld van de
//    herinnering staat vóór de samenvatting en komt in deze tests niet in beeld.
vi.mock('@/modules/notifications', () => ({ nudgeBericht: () => ({ titel: '', tekst: '' }) }));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
const { VragenlijstIngang } = await import('@/schermen/vragenlijst');

function profiel(antwoorden: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: A,
    focus_areas: [],
    minutes_per_day: null,
    when_i_do_it: null,
    what_breaks_it: [],
    feeling: null,
    feeling_own: null,
    ...antwoorden,
  };
}

const VOLLEDIG = {
  focus_areas: ['fitness'],
  minutes_per_day: 15,
  when_i_do_it: 'evening',
  what_breaks_it: ['forget'],
  feeling: 'calm',
};

const toonIngang = () =>
  renderScherm(() => createElement(VragenlijstIngang, { profiel: mocks.profiel as never }));

async function openVragenlijst() {
  const { default: Vragenlijst } = await import('../../app/onboarding/vragenlijst');
  return renderScherm(Vragenlijst);
}

/**
 * Wat de kaart als href meegaf. Ruimt de kaart op en zet de parameters klaar voor het volgende
 * scherm (`ruimAllesOp()` wist `routeParams`, dus in die volgorde).
 */
function volgKnop(): void {
  const href = router.push.mock.calls.at(-1)?.[0] as { pathname: string; params: Record<string, string> };
  expect(href.pathname).toBe('/onboarding/vragenlijst');
  ruimAllesOp();
  Object.assign(routeParams, href.params);
}

beforeEach(() => {
  for (const k of Object.keys(routeParams)) delete routeParams[k];
  mocks.profiel = profiel();
  mocks.updateProfiel = vi.fn().mockResolvedValue({ ok: true, profiel: mocks.profiel });
});

afterEach(() => {
  ruimAllesOp();
});

describe('de vaste ingang op Profiel', () => {
  it('zonder antwoorden: "Vragen beantwoorden", en de knop opent de vragenlijst', async () => {
    const s = await toonIngang();
    expect(s.tekst()).toContain(t('profiel.vragenlijst_titel'));
    expect(s.tekst()).toContain(t('profiel.vragenlijst_tekst_leeg'));

    await s.klik(t('profiel.vragenlijst_knop_beantwoorden'));
    volgKnop();
  });

  /** Criterium 2: ook wie al invulde, heeft de ingang; één antwoord is genoeg voor "aanpassen". */
  it.each([
    ['één antwoord', { minutes_per_day: 15 }],
    ['alles ingevuld', VOLLEDIG],
  ])('met %s: "Antwoorden aanpassen", en de knop opent de vragenlijst', async (_, antwoorden) => {
    mocks.profiel = profiel(antwoorden);
    const s = await toonIngang();
    expect(s.tekst()).toContain(t('profiel.vragenlijst_tekst_ingevuld'));
    expect(s.knoppen()).not.toContain(t('profiel.vragenlijst_knop_beantwoorden'));

    await s.klik(t('profiel.vragenlijst_knop_aanpassen'));
    volgKnop();
  });
});

describe('de vragenlijst na de vaste ingang', () => {
  it('gaat na "Bewaren en verder" terug naar Profiel, zonder de verwijzing naar de belofte', async () => {
    mocks.profiel = profiel(VOLLEDIG);
    const ingang = await toonIngang();
    await ingang.klik(t('profiel.vragenlijst_knop_aanpassen'));
    volgKnop();

    const s = await openVragenlijst();
    await s.klik(t('vragenlijst.samenvatting.bewaren'));

    expect(mocks.updateProfiel).toHaveBeenCalled();
    expect(router.replace).toHaveBeenLastCalledWith('/profiel');
  });

  it('zonder de parameter blijft het eindpunt Doelen met de verwijzing (na de onboarding, de kaart op Vandaag)', async () => {
    mocks.profiel = profiel(VOLLEDIG);
    const s = await openVragenlijst();
    await s.klik(t('vragenlijst.samenvatting.bewaren'));

    expect(router.replace).toHaveBeenLastCalledWith({
      pathname: '/doelen',
      params: { belofte: 'na-vragenlijst' },
    });
  });
});
