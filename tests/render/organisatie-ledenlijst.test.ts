// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { t } from '@/shared/i18n';

import { renderScherm, routeParams, ruimAllesOp, type GerenderdScherm } from './scherm';

/**
 * De ledenlijst van een organisatie, gerenderd zoals een beheerder en een lid hem zien — QS8-773.
 *
 * ⚠️ De belofte is de vorm van de lijst en niet een eigenschap van een onderdeel: een lid ziet
 *    **geen enkele knop** bij een lid (besluit 6), een beheerder ziet er een bij elk gewoon lid
 *    en niet bij zichzelf of een andere beheerder, en het woord "Uitzetten" staat pas ná een
 *    tik op die knop in beeld. Alleen de netwerkgrens is vervangen; de rij, het menu en de
 *    bevestiging zijn de echte.
 */

const mocks = vi.hoisted(() => ({
  rol: 'admin' as 'admin' | 'member',
  zetLidUit: undefined as unknown as Mock<(...a: unknown[]) => unknown>,
}));

const LEDEN = [
  { userId: 'u-1', naam: 'Noor de Vries', rol: 'admin' },
  { userId: 'u-2', naam: 'Daan Bakker', rol: 'member' },
  { userId: 'u-3', naam: 'Sanne Visser', rol: 'member' },
  { userId: 'u-4', naam: 'Iris Meijer', rol: 'admin' },
];

vi.mock('@/modules/auth', () => ({ useSession: () => ({ userId: 'u-1' }) }));
vi.mock('@/modules/buddies', () => ({ toonCode: (c: string) => c }));
vi.mock('@/modules/organisaties', () => ({
  fetchMijnOrganisaties: async () => [{ id: 'o-1', naam: 'Studio Noord', rol: mocks.rol }],
  fetchOrganisatieleden: async () => ({ rijen: LEDEN, volgende: null }),
  fetchOrganisatieteams: async () => ({ rijen: [], volgende: null }),
  fetchUitnodigcode: async () => ({ ok: true, waarde: null }),
  maakTeam: async () => ({ ok: true, waarde: undefined }),
  verlaatOrganisatie: async () => ({ ok: true, waarde: undefined }),
  vernieuwOrganisatiecode: async () => ({ ok: true, waarde: undefined }),
  zetLidUit: (...a: unknown[]) => mocks.zetLidUit(...a),
}));

async function open(): Promise<GerenderdScherm> {
  const { default: Scherm } = await import('../../app/organisatie/[id]');
  return renderScherm(Scherm);
}

const actieKnop = (naam: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${t('organisatie.acties_label', { naam })}"]`);
const alleActieKnoppen = () =>
  [...document.querySelectorAll('[aria-label]')].filter((e) =>
    (e.getAttribute('aria-label') ?? '').startsWith(t('organisatie.acties_label', { naam: '' })),
  );

async function tik(el: HTMLElement | null): Promise<void> {
  if (el === null) throw new Error('Geen knop om op te tikken.');
  await act(async () => el.click());
}

beforeEach(() => {
  mocks.rol = 'admin';
  mocks.zetLidUit = vi.fn().mockResolvedValue({ ok: true, waarde: undefined });
  routeParams.id = 'o-1';
});

afterEach(() => {
  ruimAllesOp();
});

describe('de ledenlijst van een beheerder — variant B van QS8-773', () => {
  it('geeft elk gewoon lid een knop met zijn naam, en niet zichzelf of een andere beheerder', async () => {
    await open();

    expect(actieKnop('Daan Bakker')).not.toBeNull();
    expect(actieKnop('Sanne Visser')).not.toBeNull();
    expect(actieKnop('Noor de Vries')).toBeNull();
    expect(actieKnop('Iris Meijer')).toBeNull();
    expect(alleActieKnoppen()).toHaveLength(2);
  });

  it('toont "beheerder" achter de beheerders en het woord "Uitzetten" nog niet', async () => {
    const s = await open();

    expect(s.tekst()).toContain(t('organisatie.rol_beheerder'));
    expect(s.knoppen()).not.toContain(t('organisatie.uitzetten_knop'));
  });

  it('opent met één tik het menu en met een tweede tik de bevestiging, en zet dan pas uit', async () => {
    const s = await open();

    await tik(actieKnop('Daan Bakker'));
    expect(s.knoppen()).toContain(t('organisatie.uitzetten_knop'));
    expect(mocks.zetLidUit).not.toHaveBeenCalled();

    await s.klik(t('organisatie.uitzetten_knop'));
    expect(s.tekst()).toContain(t('organisatie.uitzetten_titel'));
    expect(mocks.zetLidUit).not.toHaveBeenCalled();

    await s.klik(t('organisatie.uitzetten_bevestig', { naam: 'Daan Bakker' }));
    expect(mocks.zetLidUit).toHaveBeenCalledWith('o-1', 'u-2');
  });

  it('sluit het menu van de eerste rij als er een tweede opent', async () => {
    const s = await open();

    await tik(actieKnop('Daan Bakker'));
    await tik(actieKnop('Sanne Visser'));

    expect(s.knoppen().filter((k) => k === t('organisatie.uitzetten_knop'))).toHaveLength(1);
  });

  it('annuleren sluit de bevestiging zonder uit te zetten', async () => {
    const s = await open();

    await tik(actieKnop('Daan Bakker'));
    await s.klik(t('organisatie.uitzetten_knop'));
    await s.klik(t('bevestiging.annuleren'));

    expect(s.tekst()).not.toContain(t('organisatie.uitzetten_titel'));
    expect(mocks.zetLidUit).not.toHaveBeenCalled();
  });
});

describe('de ledenlijst van een lid — besluit 6', () => {
  it('heeft geen enkele knop bij een lid en toont "beheerder" achter de beheerders', async () => {
    mocks.rol = 'member';

    const s = await open();

    expect(alleActieKnoppen()).toHaveLength(0);
    expect(s.knoppen()).not.toContain(t('organisatie.uitzetten_knop'));
    expect(s.tekst()).toContain('Daan Bakker');
    expect(s.tekst()).toContain(t('organisatie.rol_beheerder'));
  });
});
