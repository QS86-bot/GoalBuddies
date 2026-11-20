import { describe, expect, it, vi } from 'vitest';

import { loopKeten, type KetenDelen } from './keten';
import type { Verzoening } from './verzoenen';
import { STANDAARD_VOORKEUR } from './voorkeur';

vi.mock('../../lib/observability', () => ({ reportError: vi.fn() }));

/**
 * IJKING (met de hand, 19-11-2026): `d.nogGeldig()` voor de tweede `zet` weghalen => rood: 'een trage verzoening'.
 */
const uitslag = (weergave: 'licht' | 'donker'): Verzoening => ({
  voorkeur: { ...STANDAARD_VOORKEUR, weergave },
  schrijfNaarAccount: false,
  basis: null,
});

function delen(over: Partial<KetenDelen> = {}) {
  const gezet: string[] = [];
  const d: KetenDelen = {
    userId: 'u1',
    leesStart: async () => uitslag('donker'),
    verzoen: async () => uitslag('licht'),
    zet: (v) => gezet.push(v.weergave),
    nogGeldig: () => true,
    levend: () => true,
    klaar: vi.fn(),
    ...over,
  };
  return { d, gezet };
}

describe('loopKeten', () => {
  it('zet eerst de lokale stand en dan die van de account', async () => {
    const { d, gezet } = delen();
    await loopKeten(d);
    expect(gezet).toEqual(['donker', 'licht']);
  });

  it('een trage verzoening die na een keuze terugkomt, verliest', async () => {
    let gekozen = false;
    const { d, gezet } = delen({
      verzoen: async () => {
        gekozen = true; // de gebruiker kiest terwijl de account nog antwoordt
        return uitslag('licht');
      },
      nogGeldig: () => !gekozen,
    });
    await loopKeten(d);
    expect(gezet).toEqual(['donker']);
  });

  it('een mislukte account laat de lokale stand staan en werpt niet', async () => {
    const { d, gezet } = delen({ verzoen: async () => Promise.reject(new Error('geen 0303')) });
    await expect(loopKeten(d)).resolves.toBeUndefined();
    expect(gezet).toEqual(['donker']);
  });

  it('zonder gebruiker is er geen verzoening, en ready komt toch', async () => {
    const verzoen = vi.fn();
    const { d } = delen({ userId: null, verzoen });
    await loopKeten(d);
    expect(verzoen).not.toHaveBeenCalled();
    expect(d.klaar).toHaveBeenCalled();
  });
});
