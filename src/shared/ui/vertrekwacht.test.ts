import { describe, expect, it, vi } from 'vitest';

import { bindVertrekwacht, type Terugknop, type Venster, type VertrekGebeurtenis } from './vertrekwacht';

/**
 * De belofte onder de vertrekwacht: **onopgeslagen tekst gaat niet weg zonder
 * dat de gebruiker het nog een keer zegt** — ook niet langs een uitgang die de
 * app niet zelf tekent.
 *
 * ⚠️ Er zit geen React in deze test, om dezelfde reden als bij `useAsync`: dit
 *    project draait zijn tests in node, en een testbibliotheek toevoegen om één
 *    registratie te bewijzen is de verkeerde ruil. Wat bewezen moet worden zit
 *    daarom in `bindVertrekwacht()` en niet in de hook eromheen.
 *
 * ⚠️ **Tweezijdig geijkt.** Elk geval dat tegengehouden moet worden staat hier
 *    naast het geval dat met rust gelaten moet worden. Een wacht die altijd
 *    registreert is even fout als een wacht die nooit registreert: de eerste zet
 *    de back/forward-cache van elke browser uit en leert de gebruiker de
 *    dialoog weg te klikken.
 */

function nepVenster(): Venster & {
  readonly luisteraars: ((gebeurtenis: VertrekGebeurtenis) => void)[];
  readonly verwijderd: ((gebeurtenis: VertrekGebeurtenis) => void)[];
} {
  const luisteraars: ((gebeurtenis: VertrekGebeurtenis) => void)[] = [];
  const verwijderd: ((gebeurtenis: VertrekGebeurtenis) => void)[] = [];
  return {
    luisteraars,
    verwijderd,
    addEventListener: (_naam, luisteraar) => {
      luisteraars.push(luisteraar);
    },
    removeEventListener: (_naam, luisteraar) => {
      verwijderd.push(luisteraar);
    },
  };
}

function nepTerugknop(): Terugknop & {
  readonly luisteraars: (() => boolean)[];
  readonly opgeheven: { aantal: number };
} {
  const luisteraars: (() => boolean)[] = [];
  const opgeheven = { aantal: 0 };
  return {
    luisteraars,
    opgeheven,
    addEventListener: (_naam, luisteraar) => {
      luisteraars.push(luisteraar);
      return {
        remove: () => {
          opgeheven.aantal += 1;
        },
      };
    },
  };
}

function nepGebeurtenis(): VertrekGebeurtenis & { readonly tegengehouden: { aantal: number } } {
  const tegengehouden = { aantal: 0 };
  return {
    tegengehouden,
    returnValue: undefined,
    preventDefault: () => {
      tegengehouden.aantal += 1;
    },
  };
}

describe('bindVertrekwacht — er staat niets te verliezen', () => {
  it('registreert niets zolang de tekst opgeslagen is', () => {
    const venster = nepVenster();
    const terugknop = nepTerugknop();

    bindVertrekwacht({ actief: false, opGeblokkeerd: vi.fn(), venster, terugknop });

    expect(venster.luisteraars).toHaveLength(0);
    expect(terugknop.luisteraars).toHaveLength(0);
  });

  it('geeft een opheffer die niets omvergooit', () => {
    const hef = bindVertrekwacht({
      actief: false,
      opGeblokkeerd: vi.fn(),
      venster: null,
      terugknop: null,
    });

    expect(() => hef()).not.toThrow();
  });
});

describe('bindVertrekwacht — verversen en het tabblad sluiten (web)', () => {
  it('houdt het vertrek tegen op de twee manieren die browsers lezen', () => {
    const venster = nepVenster();

    bindVertrekwacht({ actief: true, opGeblokkeerd: vi.fn(), venster, terugknop: null });

    expect(venster.luisteraars).toHaveLength(1);
    const gebeurtenis = nepGebeurtenis();
    venster.luisteraars[0]?.(gebeurtenis);

    // ⚠️ Allebei, niet één van de twee. `preventDefault()` is de standaard;
    //    `returnValue` is wat oudere Chromium-versies daadwerkelijk lezen.
    expect(gebeurtenis.tegengehouden.aantal).toBe(1);
    expect(gebeurtenis.returnValue).toBe('');
  });

  it('haalt de luisteraar weg zodra de wacht wordt opgeheven', () => {
    const venster = nepVenster();

    const hef = bindVertrekwacht({
      actief: true,
      opGeblokkeerd: vi.fn(),
      venster,
      terugknop: null,
    });
    hef();

    expect(venster.verwijderd).toEqual(venster.luisteraars);
  });

  it('raakt de terugknop niet aan als die er niet is', () => {
    const venster = nepVenster();

    expect(() =>
      bindVertrekwacht({ actief: true, opGeblokkeerd: vi.fn(), venster, terugknop: null }),
    ).not.toThrow();
  });
});

describe('bindVertrekwacht — de hardwareknop (Android)', () => {
  it('houdt de knop tegen en meldt dat aan het scherm', () => {
    const terugknop = nepTerugknop();
    const opGeblokkeerd = vi.fn();

    bindVertrekwacht({ actief: true, opGeblokkeerd, venster: null, terugknop });

    expect(terugknop.luisteraars).toHaveLength(1);
    // ⚠️ `true` betekent "afgehandeld". Bij `false` sluit Android het scherm
    //    alsnog en is de hele wacht een lege huls.
    expect(terugknop.luisteraars[0]?.()).toBe(true);
    expect(opGeblokkeerd).toHaveBeenCalledTimes(1);
  });

  it('meldt het scherm niets zolang er niets tegengehouden wordt', () => {
    const terugknop = nepTerugknop();
    const opGeblokkeerd = vi.fn();

    bindVertrekwacht({ actief: true, opGeblokkeerd, venster: null, terugknop });

    expect(opGeblokkeerd).not.toHaveBeenCalled();
  });

  it('heft het abonnement op', () => {
    const terugknop = nepTerugknop();

    const hef = bindVertrekwacht({
      actief: true,
      opGeblokkeerd: vi.fn(),
      venster: null,
      terugknop,
    });
    hef();

    expect(terugknop.opgeheven.aantal).toBe(1);
  });
});

describe('bindVertrekwacht — beide uitgangen tegelijk', () => {
  it('registreert en heft ze allebei op', () => {
    const venster = nepVenster();
    const terugknop = nepTerugknop();

    const hef = bindVertrekwacht({
      actief: true,
      opGeblokkeerd: vi.fn(),
      venster,
      terugknop,
    });

    expect(venster.luisteraars).toHaveLength(1);
    expect(terugknop.luisteraars).toHaveLength(1);

    hef();

    expect(venster.verwijderd).toHaveLength(1);
    expect(terugknop.opgeheven.aantal).toBe(1);
  });
});
