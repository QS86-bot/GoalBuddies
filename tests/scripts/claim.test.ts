import { describe, expect, it } from 'vitest';

import { botsendeBranches, claimNaam, nummerUit } from '../../scripts/claim.mjs';

/**
 * Een issue bezetten met een lege branch — QS8-294.
 *
 * ⚠️ **De belofte is niet "het script pusht een branch".** Die is: *twee sessies
 *    bouwen niet twee keer hetzelfde issue*. Het script bereikt dat door de
 *    remote branchlijst te lezen, en heeft daarmee precies twee manieren om
 *    nutteloos te worden:
 *
 *    - hij mist een botsing die er wél is (dan bouw je alsnog dubbel);
 *    - hij meldt een botsing die er niet is (dan leer je de melding overslaan,
 *      en dan mist hij ze allemaal).
 *
 *    Beide helften staan hieronder, en de tweede is niet de minder belangrijke.
 *
 * ⚠️ **De vorm van de eerste helft is gemeten en niet bedacht.** Bij QS8-287
 *    stonden er twee branches met verschillende slugs voor hetzelfde issue,
 *    omdat Linear zijn slug uit de titel maakt en die titel veranderd was. Een
 *    vergelijking op de volledige branchnaam had die botsing gemist.
 */
describe('nummerUit', () => {
  it('kent het issuenummer in elke vorm waarin iemand het intypt', () => {
    for (const vorm of ['QS8-123', 'qs8-123', '#QS8-123', 'Qs8-123', '123']) {
      expect(nummerUit(vorm), vorm).toBe(123);
    }
  });

  it('haalt het nummer ook uit een volledige branchnaam van Linear', () => {
    expect(nummerUit('quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets')).toBe(287);
  });

  it('zegt nee tegen wat geen issuenummer is', () => {
    for (const vorm of ['', '   ', 'main', 'QS8-', 'abc', '123abc', null, undefined]) {
      expect(nummerUit(vorm), String(vorm)).toBeNull();
    }
  });
});

describe('botsendeBranches', () => {
  const refs = [
    'main',
    'quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets',
    'quintenstrijdonk/qs8-287-verdien_badges-heeft-geen-autorisatietoets',
    'quintenstrijdonk/qs8-1234-een-heel-ander-issue',
    'quintenstrijdonk/qs8-28-oud-werk',
  ];

  it('vindt béide branches van hetzelfde issue, ook als de slug afwijkt', () => {
    // ⚠️ Dit is het geval van 06-09: twee sessies, twee slugs, één issue.
    expect(botsendeBranches(287, refs)).toEqual([
      'quintenstrijdonk/qs8-287-verdien-badges-zonder-autorisatietoets',
      'quintenstrijdonk/qs8-287-verdien_badges-heeft-geen-autorisatietoets',
    ]);
  });

  it('laat een issue met een gelijkend nummer met rust', () => {
    // ⚠️ De andere helft: `qs8-1234-` is niet `qs8-123`, en `qs8-28-` is niet
    //    `qs8-287-`. Een claim die daarover alarm slaat, leer je overslaan.
    expect(botsendeBranches(123, refs)).toEqual([]);
    expect(botsendeBranches(28, refs)).toEqual(['quintenstrijdonk/qs8-28-oud-werk']);
  });

  it('zwijgt als het issue vrij is', () => {
    expect(botsendeBranches(999, refs)).toEqual([]);
  });

  it('kijkt niet naar hoofdletters', () => {
    expect(botsendeBranches(287, ['quintenstrijdonk/QS8-287-iets'])).toHaveLength(1);
  });
});

describe('claimNaam', () => {
  it('gebruikt de naam van Linear als die meegegeven is', () => {
    const naam = 'quintenstrijdonk/qs8-294-drie-keer-hetzelfde-gebouwd';
    expect(claimNaam(naam, 294)).toEqual({ naam, vanLinear: true });
  });

  it('valt terug op een eigen naam bij een kaal issuenummer, en zegt dat erbij', () => {
    // ⚠️ De terugval wérkt, maar Linear koppelt branch, PR en issue alleen
    //    automatisch bij zíjn eigen naam. Het script hoort dat te melden in
    //    plaats van stilzwijgend iets anders te doen dan de gebruiker verwacht.
    expect(claimNaam('QS8-294', 294)).toEqual({
      naam: 'quintenstrijdonk/qs8-294-claim',
      vanLinear: false,
    });
  });
});
