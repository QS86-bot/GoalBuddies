import { describe, expect, it } from 'vitest';

import {
  berichtGroepen,
  berichtMagBij,
  berichtOmTeSturen,
  pauzeMetBericht,
  stuurLos,
  stuurLosMetRem,
  type PauzeMetBerichtDeps,
} from './adempauze-bericht';

function deps(opties: { planOk?: boolean; stuurOk?: boolean } = {}) {
  const log: string[] = [];
  const naarGroep: { groupId: string; tekst: string }[] = [];

  const d: PauzeMetBerichtDeps = {
    plan: async () => {
      log.push('plan');
      return opties.planOk === false
        ? { ok: false, melding: 'plan stuk' }
        : { ok: true, waarde: 'pauze-1' };
    },
    stuur: async (groupId, tekst) => {
      log.push('stuur');
      naarGroep.push({ groupId, tekst });
      return opties.stuurOk === false
        ? { ok: false, melding: 'chat stuk' }
        : { ok: true, waarde: 'bericht-1' };
    },
  };

  return { d, log, naarGroep };
}

const AAN = { aan: true, groupId: 'g1', tekst: 'Ik neem even rust.' };

describe('pauzeMetBericht', () => {
  it('plant eerst en stuurt dan, in die volgorde', async () => {
    const { d, log } = deps();
    const uitkomst = await pauzeMetBericht(d, AAN);

    expect(log).toEqual(['plan', 'stuur']);
    expect(uitkomst.pauze).toEqual({ ok: true, waarde: 'pauze-1' });
    expect(uitkomst.bericht).toBe('verstuurd');
  });

  it('stuurt de aangepaste tekst, getrimd, naar de gekozen groep', async () => {
    const { d, naarGroep } = deps();
    await pauzeMetBericht(d, { aan: true, groupId: 'g2', tekst: '  Tot over twee weken  ' });

    expect(naarGroep).toEqual([{ groupId: 'g2', tekst: 'Tot over twee weken' }]);
  });

  it('stuurt niets als het plannen faalt', async () => {
    const { d, log } = deps({ planOk: false });
    const uitkomst = await pauzeMetBericht(d, AAN);

    expect(log).toEqual(['plan']);
    expect(uitkomst.pauze.ok).toBe(false);
    expect(uitkomst.bericht).toBe('niet_gevraagd');
  });

  it('laat de pauze staan als het bericht faalt, en annuleert niets', async () => {
    const { d, log } = deps({ stuurOk: false });
    const uitkomst = await pauzeMetBericht(d, AAN);

    expect(uitkomst.pauze.ok).toBe(true);
    expect(uitkomst.bericht).toEqual({ mislukt: 'chat stuk' });
    expect(log).toEqual(['plan', 'stuur']);
    // Er is geen annuleer-dep; de vorm van `PauzeMetBerichtDeps` sluit het uit.
    expect(Object.keys(d).sort()).toEqual(['plan', 'stuur']);
  });

  it('stuurt niets bij lege of witruimtetekst, en blokkeert de pauze niet', async () => {
    for (const tekst of ['', '   ', '\n\t']) {
      const { d, log } = deps();
      const uitkomst = await pauzeMetBericht(d, { aan: true, groupId: 'g1', tekst });

      expect(log, JSON.stringify(tekst)).toEqual(['plan']);
      expect(uitkomst.pauze.ok).toBe(true);
      expect(uitkomst.bericht).toBe('niet_gevraagd');
    }
  });

  it('stuurt niets als het bericht uit staat, ook met een tekst en groep', async () => {
    const { d, log } = deps();
    const uitkomst = await pauzeMetBericht(d, { ...AAN, aan: false });

    expect(log).toEqual(['plan']);
    expect(uitkomst.bericht).toBe('niet_gevraagd');
  });

  it('stuurt niets zonder gekozen groep', async () => {
    const { d, log } = deps();
    await pauzeMetBericht(d, { ...AAN, groupId: '' });

    expect(log).toEqual(['plan']);
  });
});

describe('stuurLos', () => {
  it('roept alleen stuur aan, ook na een eerdere mislukking', async () => {
    const { d, log } = deps();
    const uitkomst = await stuurLos(d, { groupId: 'g1', tekst: 'Hoi' });

    expect(log).toEqual(['stuur']);
    expect(uitkomst).toBe('verstuurd');
  });

  it('meldt een mislukking opnieuw als tekst', async () => {
    const { d } = deps({ stuurOk: false });
    expect(await stuurLos(d, { groupId: 'g1', tekst: 'Hoi' })).toEqual({ mislukt: 'chat stuk' });
  });
});

describe('berichtOmTeSturen', () => {
  it('geeft null zodra één van de drie voorwaarden ontbreekt', () => {
    expect(berichtOmTeSturen({ ...AAN, aan: false })).toBeNull();
    expect(berichtOmTeSturen({ ...AAN, groupId: '' })).toBeNull();
    expect(berichtOmTeSturen({ ...AAN, tekst: ' ' })).toBeNull();
    expect(berichtOmTeSturen(AAN)).toEqual({ groupId: 'g1', tekst: 'Ik neem even rust.' });
  });
});

describe('berichtGroepen', () => {
  const doel = [
    { group_id: 'a', name: 'Vrienden' },
    { group_id: 'b', name: 'Werk' },
    { group_id: 'c', name: 'Oud' },
  ];

  it('houdt alleen groepen over die het lid ziet en die niet gearchiveerd zijn', () => {
    const mijn = [
      { id: 'a', status: 'active' },
      { id: 'c', status: 'archived' },
      { id: 'z', status: 'active' },
    ];

    expect(berichtGroepen(doel, mijn)).toEqual([{ id: 'a', name: 'Vrienden' }]);
  });

  it('geeft niets bij een ongekoppeld doel', () => {
    expect(berichtGroepen([], [{ id: 'a', status: 'active' }])).toEqual([]);
  });

  it('geeft niets als het lid van geen van de gekoppelde groepen is', () => {
    expect(berichtGroepen(doel, [{ id: 'q', status: 'active' }])).toEqual([]);
  });
});

describe('berichtMagBij', () => {
  const eindigt = (endDate: string) => ({ eind: { endDate } });

  it('staat een lopende en een toekomstige pauze toe, ook op de laatste dag', () => {
    expect(berichtMagBij(eindigt('2026-12-20'), '2026-12-20')).toBe(true);
    expect(berichtMagBij(eindigt('2026-12-27'), '2026-12-20')).toBe(true);
  });

  it('staat een pauze die helemaal voorbij is niet toe', () => {
    expect(berichtMagBij(eindigt('2026-12-19'), '2026-12-20')).toBe(false);
  });
});

describe('stuurLosMetRem', () => {
  it('stuurt bij dubbel tikken één keer en laat daarna weer toe', async () => {
    const { d, log } = deps();
    const slot = { current: false };
    const bericht = { groupId: 'g1', tekst: 'Hoi' };

    const [eerste, tweede] = await Promise.all([
      stuurLosMetRem(slot, d, bericht),
      stuurLosMetRem(slot, d, bericht),
    ]);

    expect(log).toEqual(['stuur']);
    expect(eerste).toBe('verstuurd');
    expect(tweede).toBeNull();

    await stuurLosMetRem(slot, d, bericht);
    expect(log).toEqual(['stuur', 'stuur']);
  });

  it('geeft het slot ook vrij als het versturen mislukt of werpt', async () => {
    const slot = { current: false };
    const werpt = { stuur: async () => { throw new Error('net'); } };

    await expect(stuurLosMetRem(slot, werpt, { groupId: 'g', tekst: 't' })).rejects.toThrow();
    expect(slot.current).toBe(false);
  });
});
