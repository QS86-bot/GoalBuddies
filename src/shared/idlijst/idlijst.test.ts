import { describe, expect, it } from 'vitest';

import { brokken, IDS_PER_VERZOEK } from './index';

/**
 * De brokkenrekenkunde, zonder database — QS8-368.
 *
 * ⚠️ De klif zelf is hier niet te toetsen: die is een eigenschap van PostgREST
 *    plus undici en niet van deze functie. Die staat in
 *    `tests/rls/idlijstklif.test.ts`, tegen de echte stack. Hier alleen de
 *    rekenkunde eromheen — precies de scheiding uit de kop van `shared/bladeren`.
 */
describe('brokken()', () => {
  it('geeft nul brokken voor een lege lijst', () => {
    // ⚠️ Niet één lege brok: `.in('x', [])` is een verzoek dat gegarandeerd
    //    niets oplevert en waar PostgREST zelf over struikelt.
    expect(brokken([])).toEqual([]);
  });

  it('laat een lijst die past ongemoeid', () => {
    const ids = Array.from({ length: IDS_PER_VERZOEK }, (_, i) => `id-${i}`);
    expect(brokken(ids)).toHaveLength(1);
    expect(brokken(ids)[0]).toHaveLength(IDS_PER_VERZOEK);
  });

  it('hakt precies op de grens en niet één te laat', () => {
    const ids = Array.from({ length: IDS_PER_VERZOEK + 1 }, (_, i) => `id-${i}`);
    const uit = brokken(ids);

    expect(uit).toHaveLength(2);
    expect(uit[0]).toHaveLength(IDS_PER_VERZOEK);
    expect(uit[1]).toHaveLength(1);
  });

  it('verliest geen enkel id en houdt de volgorde', () => {
    // ⚠️ De belofte, en niet de vorm: een hakfunctie die een id kwijtraakt maakt
    //    het scherm ónwaar op precies de manier van QS8-342 — een ontbrekende
    //    stand leest als "nog niet berekend", en dat is een betekenisvolle stand.
    const ids = Array.from({ length: 1234 }, (_, i) => `id-${i}`);
    expect(brokken(ids).flat()).toEqual(ids);
  });

  it('ontdubbelt niet', () => {
    // ⚠️ Met opzet. `fetchDoelnamen()` doet dat wél, omdat zijn lijst uit twee
    //    bronnen komt; een helper die het stilzwijgend voor iedereen doet,
    //    verbergt dat daar een reden achter zat.
    expect(brokken(['a', 'a', 'a'], 2)).toEqual([['a', 'a'], ['a']]);
  });

  it('werpt bij een brokgrootte onder één', () => {
    // ⚠️ Anders is het een oneindige lus bij de aanroeper, en die is pas te zien
    //    als het scherm hangt.
    expect(() => brokken(['a'], 0)).toThrow(RangeError);
  });
});
