import { describe, expect, it, vi } from 'vitest';

import {
  maakToetredenSlot,
  toetredenMetSlot,
  verwerkToetreding,
  type ToetredenUitvoer,
} from './uitnodiging-toetreden';

function opstelling(over: Partial<ToetredenUitvoer> = {}) {
  const gebeurd: string[] = [];
  const uit: ToetredenUitvoer = {
    gemount: () => true,
    onboarded: () => true,
    vergeetCode: () => gebeurd.push('vergeet'),
    zetFout: (m) => gebeurd.push(`fout:${m}`),
    zetBinnen: (id) => gebeurd.push(`binnen:${id}`),
    naarGroep: (id) => gebeurd.push(`groep:${id}`),
    ...over,
  };
  return { uit, gebeurd };
}

describe('verwerkToetreding — QS8-712', () => {
  it('een geslaagde toetreding wist de code, zet binnen en gaat naar de groep', () => {
    const { uit, gebeurd } = opstelling();
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1', 'groep:g-1']);
  });

  it('het profiel dat pas na de start binnenkomt telt: onboarded wordt bij de afhandeling gevraagd', () => {
    let profielGeladen = false;
    const { uit, gebeurd } = opstelling({ onboarded: () => profielGeladen });
    profielGeladen = true; // gebeurt terwijl neemDeel liep
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toContain('groep:g-1');
  });

  it('zonder profiel blijft het scherm staan, maar wel als lid', () => {
    const { uit, gebeurd } = opstelling({ onboarded: () => false });
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1']);
  });

  it('een mislukking wist de code en toont de melding', () => {
    const { uit, gebeurd } = opstelling();
    verwerkToetreding({ ok: false, melding: 'vol' }, uit);
    expect(gebeurd).toEqual(['vergeet', 'fout:vol']);
  });

  it('een scherm dat is verlaten krijgt niets meer, maar de code wordt wel gewist', () => {
    const { uit, gebeurd } = opstelling({ gemount: () => false });
    verwerkToetreding({ ok: true, waarde: 'g-1' }, uit);
    expect(gebeurd).toEqual(['vergeet']);
  });
});

describe('maakToetredenSlot — QS8-716', () => {
  it('een tweede begin terwijl de eerste loopt wordt geweigerd', () => {
    const bezig: boolean[] = [];
    const slot = maakToetredenSlot((b) => bezig.push(b));

    expect(slot.begin()).toBe(true);
    expect(slot.begin()).toBe(false);
    expect(bezig).toEqual([true]); // de geweigerde aanroep zet niets
  });

  it('na einde is het slot weer vrij en staat bezig weer uit', () => {
    const bezig: boolean[] = [];
    const slot = maakToetredenSlot((b) => bezig.push(b));

    slot.begin();
    slot.einde();

    expect(bezig).toEqual([true, false]);
    expect(slot.begin()).toBe(true);
  });

  it('twee slots delen niets', () => {
    const een = maakToetredenSlot(() => {});
    const twee = maakToetredenSlot(() => {});
    expect(een.begin()).toBe(true);
    expect(twee.begin()).toBe(true);
  });
});

describe('toetredenMetSlot — QS8-716', () => {
  function met(over: Partial<ToetredenUitvoer> = {}) {
    const { uit, gebeurd } = opstelling(over);
    const bezig: boolean[] = [];
    const slot = maakToetredenSlot((b) => bezig.push(b));
    return { uit, gebeurd, bezig, slot };
  }

  it('een bezet slot weigert: neemDeel wordt niet aangeroepen en er verandert niets', async () => {
    const { uit, gebeurd, slot } = met();
    const toetreden = vi.fn();
    expect(slot.begin()).toBe(true);

    const gedaan = await toetredenMetSlot('ABC', { slot, uitvoer: uit, toetreden });

    expect(gedaan).toBe(false);
    expect(toetreden).not.toHaveBeenCalled();
    expect(gebeurd).toEqual([]);
  });

  it('een geslaagde toetreding wordt afgehandeld en geeft het slot vrij', async () => {
    const { uit, gebeurd, bezig, slot } = met();
    const toetreden = vi.fn().mockResolvedValue({ ok: true, waarde: 'g-1' });

    expect(await toetredenMetSlot('ABC', { slot, uitvoer: uit, toetreden })).toBe(true);

    expect(toetreden).toHaveBeenCalledWith('ABC');
    expect(gebeurd).toEqual(['vergeet', 'binnen:g-1', 'groep:g-1']);
    expect(bezig).toEqual([true, false]);
    expect(slot.begin()).toBe(true);
  });

  it('een neemDeel die werpt geeft het slot vrij en toont de melding', async () => {
    const { uit, gebeurd, bezig, slot } = met();
    const toetreden = vi.fn().mockRejectedValue(new Error('netwerk'));

    await toetredenMetSlot('ABC', { slot, uitvoer: uit, toetreden });

    expect(gebeurd.some((g) => g.startsWith('fout:'))).toBe(true);
    expect(bezig).toEqual([true, false]);
    expect(slot.begin()).toBe(true);
  });

  it('een verlaten scherm krijgt na een werpende neemDeel geen melding, maar het slot komt vrij', async () => {
    const { uit, gebeurd, slot } = met({ gemount: () => false });
    const toetreden = vi.fn().mockRejectedValue(new Error('netwerk'));

    await toetredenMetSlot('ABC', { slot, uitvoer: uit, toetreden });

    expect(gebeurd).toEqual([]);
    expect(slot.begin()).toBe(true);
  });

  it('een verwerking die zelf werpt (router.replace) geeft het slot ook vrij', async () => {
    const { uit, slot } = met({
      naarGroep: () => {
        throw new Error('router');
      },
    });
    const toetreden = vi.fn().mockResolvedValue({ ok: true, waarde: 'g-1' });

    await toetredenMetSlot('ABC', { slot, uitvoer: uit, toetreden });

    expect(slot.begin()).toBe(true);
  });
});
