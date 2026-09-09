import { describe, expect, it } from 'vitest';

import { beginfase, deelbareUitnodiging } from './samen';

import type { DoelGroep } from './deling';

/**
 * De twee beslissingen achter de uitnodigingsstap — QS8-229.
 *
 * ⚠️ Beide helften staan hier: de vormen die iets moeten opleveren én de vormen
 *    die niets mogen opleveren. Die tweede helft is bij `deelbareUitnodiging()`
 *    de belangrijkste — hij bestaat juist om níét te delen.
 */

const groep = (id: string): DoelGroep => ({
  group_id: id,
  name: `Groep ${id}`,
  zichtbaarheid: 'beschermd',
});

describe('deelbareUitnodiging', () => {
  // ⚠️ De code komt uit `CODE_ALFABET` en is niet verzonnen: dat alfabet kent
  //    geen 0/O, 1/I/L en U, en `normaliseerCode()` gooit weg wat er niet in
  //    zit. 📏 Een fixture met een `1` erin werd stil ingekort tot elf tekens —
  //    de test faalde op iets dat de functie juist goed deed.
  it('bouwt de link uit een geldige code', () => {
    expect(deelbareUitnodiging({ invite_code: 'ABCD2345EFGH' }, 'https://x.test')).toBe(
      'https://x.test/uitnodiging/ABCD2345EFGH',
    );
  });

  it('haalt een dubbele schuine streep aan het eind van de basis weg', () => {
    expect(deelbareUitnodiging({ invite_code: 'ABCD2345EFGH' }, 'https://x.test/')).toBe(
      'https://x.test/uitnodiging/ABCD2345EFGH',
    );
  });

  it('geeft niets terug bij een ingetrokken uitnodiging', () => {
    // ⚠️ Een link die gegarandeerd niet werkt, is erger dan geen link: die
    //    stuurt de gebruiker naar iemand tóé.
    expect(
      deelbareUitnodiging({ invite_code: 'ABCD2345EFGH', invite_revoked: true }, 'https://x.test'),
    ).toBeNull();
  });

  it('geeft niets terug als de code ontbreekt', () => {
    // ⚠️⚠️ Dit is het geval dat écht voorkomt: `fetchMijnGroepen()` selecteert
    //    `invite_code` niet en cast toch naar de volledige rij, dus het veld is
    //    `undefined` terwijl het type een `string` belooft.
    expect(deelbareUitnodiging({}, 'https://x.test')).toBeNull();
    expect(deelbareUitnodiging({ invite_code: undefined }, 'https://x.test')).toBeNull();
    expect(deelbareUitnodiging({ invite_code: null }, 'https://x.test')).toBeNull();
  });

  it('geeft niets terug bij een lege of blanco code', () => {
    expect(deelbareUitnodiging({ invite_code: '' }, 'https://x.test')).toBeNull();
    expect(deelbareUitnodiging({ invite_code: '   ' }, 'https://x.test')).toBeNull();
  });

  it('geeft nooit een lege string terug', () => {
    // ⚠️ Anders is "geen link" niet te onderscheiden van "link", en dat is
    //    precies het onderscheid waar de aanroeper op stuurt.
    for (const geval of [{}, { invite_code: '' }, { invite_code: 'A', invite_revoked: true }]) {
      expect(deelbareUitnodiging(geval, 'https://x.test')).not.toBe('');
    }
  });
});

describe('beginfase', () => {
  it('is gedeeld als de gevraagde groep echt gekoppeld is', () => {
    expect(beginfase([groep('a'), groep('b')], 'b')).toEqual({ fase: 'gedeeld', groupId: 'b' });
  });

  it('is kiezen als de gevraagde groep er niet bij staat', () => {
    // ⚠️⚠️ **De belofte van deze functie.** `?groep=` zegt alleen wat er
    //    geprobéérd is. Ging het koppelen halverwege mis, dan zou een scherm dat
    //    de parameter gelooft "gedeeld" melden over een koppeling die niet
    //    bestaat — succes melden dat er niet is.
    expect(beginfase([groep('a')], 'b')).toEqual({ fase: 'kiezen' });
  });

  it('is kiezen als de gevraagde groep er niet bij staat en er niets gekoppeld is', () => {
    expect(beginfase([], 'b')).toEqual({ fase: 'kiezen' });
  });

  it('valt zonder gevraagde groep terug op een bestaande koppeling', () => {
    expect(beginfase([groep('a')], null)).toEqual({ fase: 'gedeeld', groupId: 'a' });
  });

  it('is kiezen zonder gevraagde groep en zonder koppelingen', () => {
    expect(beginfase([], null)).toEqual({ fase: 'kiezen' });
  });

  it('behandelt een lege parameter als geen parameter', () => {
    // Een URL met `?groep=` erin maar zonder waarde mag niet anders uitpakken
    // dan een URL zonder die parameter.
    expect(beginfase([groep('a')], '')).toEqual({ fase: 'gedeeld', groupId: 'a' });
    expect(beginfase([], '')).toEqual({ fase: 'kiezen' });
  });
});
