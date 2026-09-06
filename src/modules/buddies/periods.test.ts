import { afterEach, describe, expect, it } from 'vitest';

import { freezeNow, unfreezeNow, userCycle, type UserClock } from '../../shared/time';

import {
  groepsklok,
  groepsperiodeVan,
  huidigeGroepsperiode,
  isHuddledagOp,
  isHuddledagVandaag,
} from './periods';

/**
 * De tweede klok — QS8-58.
 *
 * QS8-58 eist: "getest met leden die alle drie een andere week-startdag hebben"
 * en "wijzigen van de huddledag breekt geen lopende ketting". Beide staan
 * hieronder, want dit is het soort fout dat pas maanden later zichtbaar wordt —
 * als iemand met een afwijkende week-startdag zijn reeks kwijtraakt.
 */

afterEach(() => unfreezeNow());

const groepMetZondag = { huddle_day: 0, tz: 'Europe/Amsterdam' };
const groepMetDonderdag = { huddle_day: 4, tz: 'Europe/Amsterdam' };

describe('de groepsperiode staat los van de persoonlijke cyclus', () => {
  it('geeft drie leden met drie week-startdagen dezelfde groepsperiode', () => {
    // Woensdag 19 augustus 2026, midden op de dag.
    const moment = new Date('2026-08-19T12:00:00Z');
    freezeNow(moment);

    const leden: readonly UserClock[] = [
      { weekStartDay: 1, tz: 'Europe/Amsterdam' },
      { weekStartDay: 4, tz: 'Europe/Amsterdam' },
      { weekStartDay: 0, tz: 'Europe/Amsterdam' },
    ];

    // Drie verschillende persoonlijke cycli …
    const persoonlijk = leden.map((klok) => userCycle(klok, moment).startDate);
    expect(new Set(persoonlijk).size).toBe(3);

    // … maar één gedeeld raster. Dat is de hele reden dat deze klok bestaat.
    expect(huidigeGroepsperiode(groepMetZondag).startDate).toBe('2026-08-16');
  });

  it('telt een donderdagse afsluiting mee in de zondagse periode', () => {
    // Donderdag 20 augustus: een lid met week-start donderdag sluit zijn eigen
    // week af. De groep huddelt op zondag, dus die afsluiting valt in de periode
    // die zondag 16 augustus begon — precies het acceptatiecriterium van QS8-58.
    const donderdag = new Date('2026-08-20T10:00:00Z');

    const eigenWeek = userCycle({ weekStartDay: 4, tz: 'Europe/Amsterdam' }, donderdag);
    expect(eigenWeek.startDate).toBe('2026-08-20');

    expect(groepsperiodeVan(groepMetZondag, donderdag).startDate).toBe('2026-08-16');
  });
});

describe('de huddledag bepaalt het raster van de groep', () => {
  it('verschuift de periode als de groep een andere dag kiest', () => {
    const moment = new Date('2026-08-19T12:00:00Z');

    expect(groepsperiodeVan(groepMetZondag, moment).startDate).toBe('2026-08-16');
    expect(groepsperiodeVan(groepMetDonderdag, moment).startDate).toBe('2026-08-13');
  });

  it('breekt geen lopende ketting als de dag verandert', () => {
    // ⚠️ Een chain_links-rij draagt de group_period_start waarmee hij gelegd is.
    //    Verandert de huddledag, dan verschuift alleen het raster van de perioden
    //    die daarná komen; de schakel van vorige week blijft staan waar hij staat.
    //    Deze test legt dat vast, want de verleiding om de ketting te
    //    "herberekenen" is precies hoe je hem stukmaakt.
    const vorigeWeek = new Date('2026-08-12T12:00:00Z');
    const gelegdeSchakel = groepsperiodeVan(groepMetZondag, vorigeWeek).startDate;

    expect(gelegdeSchakel).toBe('2026-08-09');

    // De groep stapt over naar donderdag. De schakel van vorige week is een
    // opgeslagen datum en verandert niet mee.
    const naWijziging = groepsperiodeVan(groepMetDonderdag, new Date('2026-08-19T12:00:00Z'));
    expect(naWijziging.startDate).toBe('2026-08-13');
    expect(gelegdeSchakel).toBe('2026-08-09');
  });
});

describe('groepsklok', () => {
  it('vertaalt de kolommen huddle_day en tz naar de klok van shared/time', () => {
    expect(groepsklok({ huddle_day: 3, tz: 'Europe/Amsterdam' })).toEqual({
      huddleDay: 3,
      tz: 'Europe/Amsterdam',
    });
  });

  it('rekent in de tijdzone van de groep, niet in die van de bezoeker', () => {
    // 23:30 UTC op zaterdag 15 augustus is in Amsterdam al zondag 16 augustus.
    // Voor een groep die op zondag huddelt, is de nieuwe periode dus begonnen.
    const moment = new Date('2026-08-15T23:30:00Z');

    expect(groepsperiodeVan(groepMetZondag, moment).startDate).toBe('2026-08-16');
    expect(groepsperiodeVan({ huddle_day: 0, tz: 'America/Los_Angeles' }, moment).startDate).toBe(
      '2026-08-09',
    );
  });
});

/**
 * De huddledag valt op de dag zelf op — QS8-199.
 *
 * ⚠️ **De belofte is een weergavevraag en toch hoort de toets hier.** De dag
 *    markeren is UI; wélke dag dat is, is de tweede klok. Zou dit in een
 *    component staan als `new Date().getDay() === groep.huddle_day`, dan klopt
 *    het in Amsterdam op een zondagmiddag en nergens anders — en dat is precies
 *    de vorm die correctheidsregel 7 verbiedt.
 *
 * ⚠️ **Getest met twee verschillende huddledagen, zoals domeinregel 1 eist.**
 *    Eén huddledag bewijst niets: de vergelijking "lokale datum == startdatum van
 *    de periode" is per definitie waar op de dag waarop je hem toevallig uitprobeert.
 */
describe('de huddledag valt op de dag zelf op', () => {
  it('zegt ja op de huddledag en nee op de zes andere dagen', () => {
    // Zondag 16 augustus 2026 is de start van de periode van `groepMetZondag`.
    const dagen = [
      ['2026-08-16', true],
      ['2026-08-17', false],
      ['2026-08-18', false],
      ['2026-08-19', false],
      ['2026-08-20', false],
      ['2026-08-21', false],
      ['2026-08-22', false],
    ] as const;

    for (const [datum, verwacht] of dagen) {
      expect(
        isHuddledagOp(groepMetZondag, new Date(`${datum}T12:00:00Z`)),
        `${datum} zou ${verwacht ? 'wél' : 'niet'} de huddledag moeten zijn`,
      ).toBe(verwacht);
    }
  });

  it('verschuift mee met de huddledag van de groep', () => {
    // ⚠️ De tegenproef bij de test hierboven. Dezelfde zeven dagen, een andere
    //    groep: precies één ervan is nu waar, en het is een ándere.
    const donderdag = new Date('2026-08-20T12:00:00Z');
    const zondag = new Date('2026-08-16T12:00:00Z');

    expect(isHuddledagOp(groepMetDonderdag, donderdag)).toBe(true);
    expect(isHuddledagOp(groepMetDonderdag, zondag)).toBe(false);

    expect(isHuddledagOp(groepMetZondag, zondag)).toBe(true);
    expect(isHuddledagOp(groepMetZondag, donderdag)).toBe(false);
  });

  it('leest de klok van de groep en niet die van het toestel', () => {
    // ⚠️ **Het geval waarop `getDay()` stukgaat.** Zondag 16 augustus 2026 om
    //    13:00 UTC is in Amsterdam nog zondagmiddag (UTC+2) en in Auckland al
    //    maandagochtend (UTC+12). Eén moment, twee antwoorden — en dát is wat een
    //    component die de tijdzone van het toestel gebruikt niet kan geven.
    //
    // ⚠️ **De eerste versie van deze test koos 23:30 UTC en werd rood.** Terecht:
    //    dat is in Amsterdam al 01:30 op maandag, dus daar was de huddledag óók
    //    voorbij. De code klopte en de opstelling niet. Genoteerd omdat het de
    //    reden is dat dit geval hier staat: een tijdzoneredenering die je "even
    //    nadenkt" klopt ongeveer even vaak als niet.
    const laatOpZondagUtc = new Date('2026-08-16T13:00:00Z');

    const auckland = { huddle_day: 0, tz: 'Pacific/Auckland' };
    expect(
      isHuddledagOp(auckland, laatOpZondagUtc),
      'in Auckland is het dan maandag, dus de huddledag is voorbij',
    ).toBe(false);

    expect(
      isHuddledagOp(groepMetZondag, laatOpZondagUtc),
      'in Amsterdam is het op dat moment nog zondag',
    ).toBe(true);
  });

  it('kijkt naar nu wanneer je geen moment meegeeft', () => {
    freezeNow(new Date('2026-08-16T12:00:00Z'));
    expect(isHuddledagVandaag(groepMetZondag)).toBe(true);
    expect(isHuddledagVandaag(groepMetDonderdag)).toBe(false);

    freezeNow(new Date('2026-08-20T12:00:00Z'));
    expect(isHuddledagVandaag(groepMetZondag)).toBe(false);
    expect(isHuddledagVandaag(groepMetDonderdag)).toBe(true);
  });
});

