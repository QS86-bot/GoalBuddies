import { describe, expect, it } from 'vitest';

import { userCycleOn } from '../../shared/time';

import {
  laatsteCycli,
  standUitWeekdoelen,
  WEKEN_IN_OVERZICHT,
  type WeekRij,
} from './overzicht-stand';

/**
 * De pure laag van het overzicht — QS8-256.
 *
 * ⚠️ **Wat hier getoetst wordt is een productbeslissing en geen berekening.**
 *    Welke databasestatus als "die week telde" leest, is precies de vraag waar
 *    domeinregel 7 en 8 over gaan: een vloerweek telt, een adempauze is geen
 *    tegenvaller, en een doorgeschoven week is er wél een. Die drie horen in een
 *    test en niet in een component.
 */

function week(status: string, niveau: WeekRij['niveau'] = null): WeekRij {
  return { status, niveau };
}

describe('de stand van een week', () => {
  it('is leeg zonder weekdoelen', () => {
    expect(standUitWeekdoelen([])).toBe('leeg');
  });

  it('leest een goedgekeurde plafondweek als plafond', () => {
    expect(standUitWeekdoelen([week('approved', 'ceiling')])).toBe('plafond');
  });

  /**
   * ⚠️ **De belangrijkste van dit bestand.** Domeinregel 8: vloer gehaald
   *    betekent dat de week telt. Zou een vloerweek hier als `gemist` of als
   *    `leeg` uitkomen, dan zegt het dashboard het tegenovergestelde van wat het
   *    product belooft — en dat is precies waarom QS8-256 vraagt om de vloer
   *    zichtbaar te maken in plaats van weggestopt in een formulierveld.
   */
  it('leest een goedgekeurde vloerweek als vloer en niet als iets minder', () => {
    expect(standUitWeekdoelen([week('approved', 'floor')])).toBe('vloer');
  });

  it('leest een goedgekeurde week zonder niveau als vloer', () => {
    // Kan voorkomen als de voltooiing vervangen is; de week telde hoe dan ook.
    expect(standUitWeekdoelen([week('approved', null)])).toBe('vloer');
  });

  it('leest een ingediende week als ingediend en niet als gehaald', () => {
    expect(standUitWeekdoelen([week('pending')])).toBe('ingediend');
  });

  it('leest een gemiste week als gemist', () => {
    expect(standUitWeekdoelen([week('missed')])).toBe('gemist');
  });

  /**
   * ⚠️ Doorschuiven verplaatst het wérk en niet de uitkomst — 0045 accepteert
   *    alleen een week die de rollover al als gemist had afgeschreven. Hem als
   *    leeg tekenen zou een gemiste week uit je eigen terugblik laten verdwijnen.
   */
  it('leest een doorgeschoven week als gemist', () => {
    expect(standUitWeekdoelen([week('carried')])).toBe('gemist');
  });

  /**
   * ⚠️ Een adempauze is een aangekondigde eigen keuze (A50) en geen tegenvaller.
   *    Zou hij als `gemist` tekenen, dan straft het dashboard iemand voor iets
   *    wat de app hem juist aanbiedt.
   */
  it('leest een adempauze als leeg en niet als gemist', () => {
    expect(standUitWeekdoelen([week('excused')])).toBe('leeg');
  });

  it('leest een week die nog loopt als leeg', () => {
    expect(standUitWeekdoelen([week('todo')])).toBe('leeg');
  });

  /**
   * ⚠️ **De béste uitkomst telt** — besluit A37 laat meerdere weekdoelen in één
   *    cyclus toe. De omgekeerde keuze zou een goede week grijzer maken zodra
   *    iemand een tweede doel toevoegde, en dat is de prikkel die dit product
   *    niet wil.
   */
  it('neemt bij meerdere weekdoelen de beste uitkomst', () => {
    // ⚠️ **De goede week staat hier vóóraan, en dat is geen willekeur.** Stond
    //    hij overal achteraan, dan geeft "de laatste telt" precies hetzelfde
    //    antwoord als "de beste telt" en toetst dit geval niets — gemeten door de
    //    filter te vervangen door `rijen.slice(-1)`: alle vijfentwintig tests
    //    bleven groen. CLAUDE.md regel 18, vraag 3.
    expect(standUitWeekdoelen([week('approved', 'ceiling'), week('missed')])).toBe('plafond');
    expect(standUitWeekdoelen([week('approved', 'floor'), week('missed')])).toBe('vloer');
    expect(standUitWeekdoelen([week('pending'), week('missed')])).toBe('ingediend');

    // En andersom, zodat de volgorde in geen van beide richtingen uitmaakt.
    expect(standUitWeekdoelen([week('missed'), week('approved', 'ceiling')])).toBe('plafond');
    expect(standUitWeekdoelen([week('missed'), week('pending')])).toBe('ingediend');

    // Een plafond wint van een vloer, ongeacht de volgorde.
    expect(standUitWeekdoelen([week('approved', 'floor'), week('approved', 'ceiling')])).toBe(
      'plafond',
    );
    expect(standUitWeekdoelen([week('approved', 'ceiling'), week('approved', 'floor')])).toBe(
      'plafond',
    );

    expect(standUitWeekdoelen([week('excused'), week('missed')])).toBe('gemist');
  });
});

describe('de reeks cycli', () => {
  // ⚠️ Via `userCycleOn()` en niet met de hand samengesteld: een `Cycle` draagt
  //    ook `startsAt` en `endsAt`, en die twee zijn het hele punt van het type.
  //    Een fixture die ze verzint, toetst een cyclus die `shared/time` nooit
  //    maakt — en dan zegt deze test niets over de echte reeks.
  const cyclus = userCycleOn({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, '2026-08-26');
  if (cyclus === null) throw new Error('de fixture levert geen cyclus op');

  it('geeft er precies zoveel als gevraagd, met de huidige als laatste', () => {
    const rij = laatsteCycli(cyclus, WEKEN_IN_OVERZICHT);

    expect(rij).toHaveLength(WEKEN_IN_OVERZICHT);
    expect(rij[rij.length - 1]?.startDate).toBe(cyclus.startDate);
  });

  it('loopt van oud naar nieuw, met stappen van precies zeven dagen', () => {
    const rij = laatsteCycli(cyclus, 4);

    expect(rij.map((c) => c.startDate)).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
    ]);
  });

  it('geeft er altijd minstens één, ook bij een onzinnig aantal', () => {
    // ⚠️ Anders levert een `0` een lege reeks op en tekent het scherm niets,
    //    zonder dat er iets misging.
    expect(laatsteCycli(cyclus, 0)).toHaveLength(1);
  });
});
