import { describe, expect, it } from 'vitest';

import {
  legacyWeergave,
  parseLokaleKopie,
  serialiseerLokaleKopie,
  verzoenVoorkeur,
  type AccountVoorkeur,
  type LokaleKopie,
} from './verzoenen';
import { STANDAARD_VOORKEUR, type Uiterlijkvoorkeur } from './voorkeur';

/**
 * Lokaal en account naast elkaar — QS8-729, criterium 7 en 8.
 *
 * IJKING (met de hand, 19-11-2026, één mutatie per grendel):
 *   A  `legacyWeergave('navy-licht')` -> 'donker'      => rood: 'bestaande gebruiker verandert niet'
 *   B  `lokaal.basis === account.bijgewerktOp` weghalen => rood: 'een ander apparaat was eerder'
 *   C  `account === undefined`-tak schrijft wél       => rood: 'mislukte lezing schrijft niets'
 */
const T1 = '2026-11-19T10:00:00.123456+00:00';
const T2 = '2026-11-19T11:00:00.654321+00:00';
const licht: Uiterlijkvoorkeur = { ...STANDAARD_VOORKEUR, weergave: 'licht' };
const compact: Uiterlijkvoorkeur = {
  ...STANDAARD_VOORKEUR,
  dichtheid: 'compact',
};
const account = (voorkeur: Uiterlijkvoorkeur, bijgewerktOp = T1): AccountVoorkeur => ({
  voorkeur,
  bijgewerktOp,
});
const kopie = (voorkeur: Uiterlijkvoorkeur, basis: string | null, wacht: boolean): LokaleKopie => ({
  userId: 'u1',
  voorkeur,
  basis,
  wacht,
});

describe('een bestaande gebruiker verandert niet (criterium 8)', () => {
  it.each([
    ['navy', 'donker'],
    ['navy-licht', 'licht'],
    ['systeem', 'systeem'],
  ] as const)('bewaard %s blijft %s, en gaat naar de account', (raw, weergave) => {
    const uit = verzoenVoorkeur({ account: null, lokaal: null, legacy: raw });
    expect(uit.voorkeur).toEqual({ ...STANDAARD_VOORKEUR, weergave });
    expect(uit.schrijfNaarAccount).toBe(true);
    expect(legacyWeergave(raw)).toBe(weergave);
  });

  it('niets bewaard en geen rij: de standaard, en er wordt niets geschreven', () => {
    const uit = verzoenVoorkeur({ account: null, lokaal: null, legacy: null });
    expect(uit.voorkeur).toEqual(STANDAARD_VOORKEUR);
    expect(uit.schrijfNaarAccount).toBe(false);
  });

  it('een onbekende oude waarde is geen gok', () => {
    expect(legacyWeergave('roze')).toBeNull();
    expect(verzoenVoorkeur({ account: null, lokaal: null, legacy: 'roze' }).voorkeur).toEqual(
      STANDAARD_VOORKEUR,
    );
  });
});

describe('verzoenen met de account (criterium 7)', () => {
  it('mislukte lezing schrijft niets en geldt de lokale kopie', () => {
    const uit = verzoenVoorkeur({
      account: undefined,
      lokaal: kopie(licht, T1, true),
      legacy: null,
    });
    expect(uit.voorkeur).toEqual(licht);
    expect(uit.schrijfNaarAccount).toBe(false);
  });

  it('mislukte lezing zonder kopie: de oude voorkeur, anders de standaard', () => {
    expect(
      verzoenVoorkeur({
        account: undefined,
        lokaal: null,
        legacy: 'navy-licht',
      }).voorkeur,
    ).toEqual(licht);
    expect(verzoenVoorkeur({ account: undefined, lokaal: null, legacy: null }).voorkeur).toEqual(
      STANDAARD_VOORKEUR,
    );
  });

  it('de account vervangt de lokale kopie als er niets onverzonden is', () => {
    const uit = verzoenVoorkeur({
      account: account(compact, T2),
      lokaal: kopie(licht, T1, false),
      legacy: null,
    });
    expect(uit).toMatchObject({
      voorkeur: compact,
      schrijfNaarAccount: false,
      basis: T2,
    });
  });

  it('een onverzonden keuze op dezelfde basis wint en gaat naar de account', () => {
    const uit = verzoenVoorkeur({
      account: account(compact, T1),
      lokaal: kopie(licht, T1, true),
      legacy: null,
    });
    expect(uit).toMatchObject({
      voorkeur: licht,
      schrijfNaarAccount: true,
      basis: T1,
    });
  });

  it('een ander apparaat was eerder: de account wint, ook tegen een onverzonden keuze', () => {
    const uit = verzoenVoorkeur({
      account: account(compact, T2),
      lokaal: kopie(licht, T1, true),
      legacy: null,
    });
    expect(uit).toMatchObject({
      voorkeur: compact,
      schrijfNaarAccount: false,
      basis: T2,
    });
  });

  it('een onverzonden keuze zonder basis terwijl de account al een rij heeft: de account wint', () => {
    const uit = verzoenVoorkeur({
      account: account(compact, T2),
      lokaal: kopie(licht, null, true),
      legacy: null,
    });
    expect(uit.voorkeur).toEqual(compact);
  });
});

describe('de lokale kopie', () => {
  it('rondt rond en weigert alles wat stuk is', () => {
    const k = kopie(licht, T1, true);
    expect(parseLokaleKopie(serialiseerLokaleKopie(k))).toEqual(k);
    expect(parseLokaleKopie(null)).toBeNull();
    expect(parseLokaleKopie('{kapot')).toBeNull();
    expect(
      parseLokaleKopie(JSON.stringify({ ...k, voorkeur: { ...licht, stijl: 'z' } })),
    ).toBeNull();
  });
});
