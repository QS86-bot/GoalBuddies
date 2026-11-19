import { describe, expect, it } from 'vitest';

import {
  actieVoor,
  lidmaatschapStand,
  magAutomatischToetreden,
  titelIsVerlopen,
  uitnodigingsStand,
} from './uitnodiging-stand';

type Invoer = Parameters<typeof uitnodigingsStand>[0];
/** Het scherm geeft `sessieLaadt` altijd mee; de meeste gevallen hier gaan over iets anders. */
const stand = (i: Omit<Invoer, 'sessieLaadt'> & { sessieLaadt?: boolean }) =>
  uitnodigingsStand({ sessieLaadt: false, ...i });

const groep = { group_id: 'g-1' };

describe('uitnodigingsStand — de vier gevallen van QS8-708', () => {
  it('een bestaand lid ziet "al lid" en geen deelnemen', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: 'actief',
    });
    expect(s).toEqual({ soort: 'al-lid', groupId: 'g-1' });
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it('een ingelogd niet-lid mag deelnemen', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: 'geen',
    });
    expect(s.soort).toBe('kan-deelnemen');
    expect(magAutomatischToetreden(s)).toBe(true);
  });

  it('wie niet is ingelogd gaat eerst inloggen, ook als het lidmaatschap onbekend is', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: false,
      lidmaatschap: 'laden',
    });
    expect(s.soort).toBe('niet-ingelogd');
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it('een ingetrokken of vervangen code is ongeldig, ook voor een ingelogd lid', () => {
    for (const lidmaatschap of ['laden', 'actief', 'geen', 'onbekend'] as const) {
      const s = stand({
        uitnodiging: null,
        ingelogd: true,
        lidmaatschap,
      });
      expect(s.soort).toBe('ongeldig');
      expect(magAutomatischToetreden(s)).toBe(false);
    }
  });
});

describe('uitnodigingsStand — QS8-712', () => {
  it('een uitnodiging die nog niet binnen is, is niet ongeldig', () => {
    const s = stand({
      uitnodiging: undefined,
      ingelogd: true,
      sessieLaadt: false,
      lidmaatschap: 'laden',
    });
    expect(s.soort).toBe('uitnodiging-onbekend');
    expect(titelIsVerlopen(s)).toBe(false);
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it('alleen een antwoord null zegt dat de link niet meer werkt', () => {
    const s = stand({
      uitnodiging: null,
      ingelogd: true,
      sessieLaadt: false,
      lidmaatschap: 'geen',
    });
    expect(titelIsVerlopen(s)).toBe(true);
  });

  it('zolang de sessie laadt, is er geen inlogknop en geen automatische stap', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: false,
      sessieLaadt: true,
      lidmaatschap: 'geen',
    });
    expect(s.soort).toBe('controleren');
    expect(actieVoor(s, null)).toBe('controleren');
  });
});

describe('actieVoor — elke stand heeft één verwachte knop', () => {
  const lid = stand({
    uitnodiging: groep,
    ingelogd: true,
    sessieLaadt: false,
    lidmaatschap: 'actief',
  });
  const gast = stand({
    uitnodiging: groep,
    ingelogd: false,
    sessieLaadt: false,
    lidmaatschap: 'geen',
  });
  const nieuw = stand({
    uitnodiging: groep,
    ingelogd: true,
    sessieLaadt: false,
    lidmaatschap: 'geen',
  });
  const wacht = stand({
    uitnodiging: groep,
    ingelogd: true,
    sessieLaadt: false,
    lidmaatschap: 'laden',
  });
  const weg = stand({
    uitnodiging: null,
    ingelogd: true,
    sessieLaadt: false,
    lidmaatschap: 'geen',
  });

  it('per stand', () => {
    expect(actieVoor(nieuw, null)).toBe('deelnemen');
    expect(actieVoor(gast, null)).toBe('inloggen');
    expect(actieVoor(wacht, null)).toBe('controleren');
    expect(actieVoor(lid, null)).toBe('geen');
    expect(actieVoor(weg, null)).toBe('geen');
  });

  it('net toegetreden gaat voor elke stand, ook voor deelnemen en controleren', () => {
    for (const s of [nieuw, gast, wacht, lid, weg]) expect(actieVoor(s, 'g-1')).toBe('binnen');
  });
});

describe('uitnodigingsStand — de naad', () => {
  it('tijdens het controleren is er geen knop en geen automatische stap', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: 'laden',
    });
    expect(s.soort).toBe('controleren');
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it('een lidmaatschap dat niet te lezen was, bewéért niet dat je lid bent', () => {
    const s = stand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: 'onbekend',
    });
    expect(s.soort).toBe('kan-deelnemen');
  });
});

describe('lidmaatschapStand', () => {
  const basis = {
    gevraagd: true,
    laadt: false,
    fout: false,
    status: null,
    antwoordVan: null,
    gebruiker: 'u-1',
  };

  it('alleen een actieve rij is al lid', () => {
    expect(lidmaatschapStand({ ...basis, status: 'active' })).toBe('actief');
    expect(lidmaatschapStand({ ...basis, status: 'inactive' })).toBe('geen');
    expect(lidmaatschapStand({ ...basis, status: null })).toBe('geen');
  });

  it('laden gaat voor, een fout is onbekend en geen aanvraag is geen lid', () => {
    expect(lidmaatschapStand({ ...basis, laadt: true, status: 'active' })).toBe('laden');
    expect(lidmaatschapStand({ ...basis, fout: true })).toBe('onbekend');
    expect(lidmaatschapStand({ ...basis, gevraagd: false, laadt: true })).toBe('geen');
  });

  it('een antwoord van een ander account telt als nog laden, niet als al lid', () => {
    const s = lidmaatschapStand({
      ...basis,
      status: 'active',
      antwoordVan: 'u-0',
    });
    expect(s).toBe('laden');
    expect(lidmaatschapStand({ ...basis, status: 'active', antwoordVan: 'u-1' })).toBe('actief');
  });
});
