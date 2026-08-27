import { describe, expect, it } from 'vitest';

import {
  closableUserCycle,
  cyclesBetween,
  cyclesUntil,
  groupPeriod,
  isWithinCycle,
  isWithinGrace,
  nextCycle,
  previousCycle,
  userCycle,
  userCycleOn,
} from './cycle';
import type { GroupClock, UserClock, Weekday } from './types';
import { localDateIn, toIsoDate, weekdayOf } from './zoned';

const AMS = 'Europe/Amsterdam';
const NYC = 'America/New_York';
const TOK = 'Asia/Tokyo';

const maandag: UserClock = { weekStartDay: 1, tz: AMS };
const zaterdag: UserClock = { weekStartDay: 6, tz: AMS };
const woensdag: UserClock = { weekStartDay: 3, tz: AMS };

describe('userCycle — de persoonlijke klok', () => {
  it('begint op de gekozen weekdag', () => {
    // Donderdag 13 augustus 2026, 10:00 lokale tijd.
    const at = new Date('2026-08-13T08:00:00Z');

    expect(userCycle(maandag, at).startDate).toBe('2026-08-10'); // maandag ervoor
    expect(userCycle(zaterdag, at).startDate).toBe('2026-08-08'); // zaterdag ervoor
    expect(userCycle(woensdag, at).startDate).toBe('2026-08-12'); // woensdag ervoor
  });

  it('loopt zeven dagen, met een eind dat er niet meer in valt', () => {
    const cycle = userCycle(maandag, new Date('2026-08-13T08:00:00Z'));

    expect(cycle.startDate).toBe('2026-08-10');
    expect(cycle.endDate).toBe('2026-08-16');
    expect(cycle.endsAt.getTime() - cycle.startsAt.getTime()).toBe(7 * 86_400_000);
    expect(isWithinCycle(cycle, cycle.startsAt)).toBe(true);
    expect(isWithinCycle(cycle, new Date(cycle.endsAt.getTime() - 1))).toBe(true);
    expect(isWithinCycle(cycle, cycle.endsAt)).toBe(false);
  });

  it('start op de dag zelf als vandaag de week-startdag is', () => {
    // Maandag 10 augustus 2026, 09:00 in Amsterdam.
    const at = new Date('2026-08-10T07:00:00Z');
    expect(userCycle(maandag, at).startDate).toBe('2026-08-10');
  });
});

// ---------------------------------------------------------------------------
// ⚠️ CLAUDE.md: test elke week-afhankelijke feature met minstens twee
//    verschillende week-starts. Dit is die test.
// ---------------------------------------------------------------------------

describe('twee gebruikers met verschillende week-starts, tegelijk', () => {
  it('zitten op hetzelfde moment in verschillende cycli', () => {
    const at = new Date('2026-08-13T08:00:00Z'); // donderdag

    const a = userCycle(maandag, at);
    const b = userCycle(zaterdag, at);

    expect(a.startDate).not.toBe(b.startDate);
    expect(isWithinCycle(a, at)).toBe(true);
    expect(isWithinCycle(b, at)).toBe(true);
  });

  it('rollen op verschillende momenten om', () => {
    // Zaterdagnacht 15 augustus, 00:30 lokale tijd: voor de zaterdag-gebruiker
    // is dit een nieuwe cyclus, voor de maandag-gebruiker nog dezelfde.
    const at = new Date('2026-08-14T22:30:00Z');

    expect(userCycle(zaterdag, at).startDate).toBe('2026-08-15');
    expect(userCycle(maandag, at).startDate).toBe('2026-08-10');
  });

  it('geeft elke week-startdag een cyclus die die dag begint', () => {
    const at = new Date('2026-08-13T08:00:00Z');

    for (let day = 0; day <= 6; day += 1) {
      const clock: UserClock = { weekStartDay: day as UserClock['weekStartDay'], tz: AMS };
      const cycle = userCycle(clock, at);

      expect(weekdayOf(cycle.startDate)).toBe(day);
      expect(isWithinCycle(cycle, at)).toBe(true);
    }
  });
});

describe('middernacht en tijdzones', () => {
  it('rolt om op lokale middernacht, niet op UTC-middernacht', () => {
    // 2026-08-09T23:00Z is in Amsterdam al maandag 10 augustus 01:00.
    const justAfterLocalMidnight = new Date('2026-08-09T23:00:00Z');
    expect(userCycle(maandag, justAfterLocalMidnight).startDate).toBe('2026-08-10');

    // Eén seconde eerder is het lokaal nog zondag: de vorige cyclus.
    const justBefore = new Date('2026-08-09T21:59:59Z');
    expect(userCycle(maandag, justBefore).startDate).toBe('2026-08-03');
  });

  it('geeft twee gebruikers in verschillende tijdzones een ander antwoord', () => {
    // 2026-08-10T02:00Z — in Tokio is het al maandagmiddag, in New York nog zondag.
    const at = new Date('2026-08-10T02:00:00Z');

    const tokio: UserClock = { weekStartDay: 1, tz: TOK };
    const newYork: UserClock = { weekStartDay: 1, tz: NYC };

    expect(localDateIn(TOK, at)).toBe('2026-08-10');
    expect(localDateIn(NYC, at)).toBe('2026-08-09');

    expect(userCycle(tokio, at).startDate).toBe('2026-08-10');
    expect(userCycle(newYork, at).startDate).toBe('2026-08-03');
  });
});

describe('zomertijd', () => {
  it('houdt de cyclus zeven kalenderdagen bij de voorjaarsovergang', () => {
    // In 2026 gaat Nederland op zondag 29 maart de klok vooruit.
    const at = new Date('2026-03-30T10:00:00Z');
    const cycle = userCycle(maandag, at);

    expect(cycle.startDate).toBe('2026-03-30');
    expect(cycle.endDate).toBe('2026-04-05');
    // Die week is 7 × 24 uur, maar de wéék ervoor duurde een uur korter.
    const vorige = previousCycle(cycle);
    expect(vorige.startDate).toBe('2026-03-23');
    expect(vorige.endsAt.getTime() - vorige.startsAt.getTime()).toBe(
      7 * 86_400_000 - 3_600_000,
    );
  });

  it('houdt de cyclus zeven kalenderdagen bij de najaarsovergang', () => {
    // Zondag 25 oktober 2026 gaat de klok terug: die week duurt een uur langer.
    const at = new Date('2026-10-21T10:00:00Z');
    const cycle = userCycle(maandag, at);

    expect(cycle.startDate).toBe('2026-10-19');
    expect(cycle.endDate).toBe('2026-10-25');
    expect(cycle.endsAt.getTime() - cycle.startsAt.getTime()).toBe(
      7 * 86_400_000 + 3_600_000,
    );
  });

  it('laat cycli naadloos op elkaar aansluiten over een DST-grens heen', () => {
    const cycle = userCycle(maandag, new Date('2026-10-21T10:00:00Z'));
    const volgende = nextCycle(cycle);

    expect(volgende.startsAt.getTime()).toBe(cycle.endsAt.getTime());
    expect(volgende.startDate).toBe('2026-10-26');
  });
});

describe('jaargrens', () => {
  it('loopt gewoon door van december naar januari', () => {
    const at = new Date('2025-12-31T12:00:00Z'); // woensdag
    const cycle = userCycle(maandag, at);

    expect(cycle.startDate).toBe('2025-12-29');
    expect(cycle.endDate).toBe('2026-01-04');
    expect(isWithinCycle(cycle, new Date('2026-01-02T12:00:00Z'))).toBe(true);
  });

  it('telt cycli correct over de jaargrens', () => {
    const dec = userCycle(maandag, new Date('2025-12-31T12:00:00Z'));
    const jan = userCycle(maandag, new Date('2026-01-19T12:00:00Z'));

    expect(cyclesBetween(dec, jan)).toBe(3);
    expect(cyclesBetween(jan, dec)).toBe(-3);
    expect(cyclesBetween(dec, dec)).toBe(0);
  });
});

describe('coulanceperiode', () => {
  it('laat je de vorige cyclus nog afsluiten kort na de rollover', () => {
    // Maandag 10 augustus 2026, 08:00 lokaal — vier uur na de rollover.
    const at = new Date('2026-08-10T06:00:00Z');

    expect(isWithinGrace(maandag, at)).toBe(true);
    expect(userCycle(maandag, at).startDate).toBe('2026-08-10');
    expect(closableUserCycle(maandag, at).startDate).toBe('2026-08-03');
  });

  it('sluit het venster twaalf uur na de rollover', () => {
    const at = new Date('2026-08-10T12:00:00Z'); // 14:00 lokaal

    expect(isWithinGrace(maandag, at)).toBe(false);
    expect(closableUserCycle(maandag, at).startDate).toBe('2026-08-10');
  });

  it('is precies op de grens al gesloten', () => {
    const cycle = userCycle(maandag, new Date('2026-08-11T12:00:00Z'));
    const exactlyTwelve = new Date(cycle.startsAt.getTime() + 12 * 3_600_000);

    expect(isWithinGrace(maandag, exactlyTwelve)).toBe(false);
  });

  it('respecteert de eigen rollover van een andere week-start', () => {
    // Zaterdag 15 augustus 04:00 lokaal: binnen de coulance van de zaterdag-
    // gebruiker, maar de maandag-gebruiker zit midden in zijn week.
    const at = new Date('2026-08-15T02:00:00Z');

    expect(isWithinGrace(zaterdag, at)).toBe(true);
    expect(isWithinGrace(maandag, at)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Klok 2 — en het bewijs dat de twee elkaar niet raken
// ---------------------------------------------------------------------------

describe('groupPeriod — de tweede klok', () => {
  const zondagse: GroupClock = { huddleDay: 0, tz: AMS };

  it('volgt de huddledag van de groep', () => {
    const at = new Date('2026-08-13T08:00:00Z'); // donderdag
    expect(groupPeriod(zondagse, at).startDate).toBe('2026-08-09');
  });

  it('staat volledig los van de week-start van een lid', () => {
    const at = new Date('2026-08-13T08:00:00Z');

    // Drie leden met drie verschillende week-starts, één gedeelde periode.
    const periode = groupPeriod(zondagse, at);

    expect(userCycle(maandag, at).startDate).toBe('2026-08-10');
    expect(userCycle(zaterdag, at).startDate).toBe('2026-08-08');
    expect(userCycle(woensdag, at).startDate).toBe('2026-08-12');
    expect(periode.startDate).toBe('2026-08-09');

    // Alle drie de leden vallen wél binnen dezelfde groepsperiode.
    for (const clock of [maandag, zaterdag, woensdag]) {
      expect(isWithinCycle(periode, at)).toBe(true);
      expect(isWithinCycle(userCycle(clock, at), at)).toBe(true);
    }
  });

  it('gebruikt de tijdzone van de groep, niet die van het lid', () => {
    const tokioGroep: GroupClock = { huddleDay: 0, tz: TOK };
    const at = new Date('2026-08-08T16:00:00Z'); // zaterdag in AMS, zondag in Tokio

    expect(groupPeriod(tokioGroep, at).startDate).toBe('2026-08-09');
    expect(groupPeriod({ huddleDay: 0, tz: AMS }, at).startDate).toBe('2026-08-02');
  });
});

describe('cyclesUntil — voedt de Risico-radar', () => {
  it('telt hele cycli tot de deadline', () => {
    const at = new Date('2026-08-13T08:00:00Z'); // cyclus start 2026-08-10
    expect(cyclesUntil(maandag, toIsoDate(2026, 9, 28), at)).toBe(7);
  });

  it('geeft nul bij een deadline die al verstreken is', () => {
    const at = new Date('2026-08-13T08:00:00Z');
    expect(cyclesUntil(maandag, toIsoDate(2026, 7, 1), at)).toBe(0);
  });

  it('geeft nul als de deadline binnen de huidige cyclus valt', () => {
    const at = new Date('2026-08-13T08:00:00Z');
    expect(cyclesUntil(maandag, toIsoDate(2026, 8, 15), at)).toBe(0);
  });
});

describe('navigeren tussen cycli', () => {
  it('is omkeerbaar', () => {
    const cycle = userCycle(zaterdag, new Date('2026-08-13T08:00:00Z'));
    const heenEnWeer = previousCycle(nextCycle(cycle));

    expect(heenEnWeer.startDate).toBe(cycle.startDate);
    expect(heenEnWeer.startsAt.getTime()).toBe(cycle.startsAt.getTime());
  });

  /**
   * ⚠️ **De belofte, niet het onderdeel.** `previousCycle`/`nextCycle` namen tot
   *    27-08-2026 een losse `startDay` naast de cyclus. Die kon alleen overbodig
   *    zijn (elke juiste aanroeper gaf de dag door die de cyclus al had) of fout
   *    — en fout gaf geen foutmelding maar een stil hérgelijnde week op een
   *    ándere startdag. Dit toetst dat navigeren de klok nooit verlaat, voor
   *    beide klokken en voor alle zeven startdagen.
   *
   * ⚠️ Met de hand rood gemaakt door `startDagVan()` een vaste dag te laten
   *    teruggeven: dan kantelt hij op zes van de zeven dagen.
   */
  it('blijft bij beide klokken op de eigen startdag, alle zeven dagen', () => {
    const at = new Date('2026-08-25T09:00:00Z');

    for (let dag = 0; dag < 7; dag += 1) {
      const startDay = dag as Weekday;

      const persoonlijk = userCycle({ weekStartDay: startDay, tz: AMS }, at);
      const groep = groupPeriod({ huddleDay: startDay, tz: AMS }, at);

      for (const cyclus of [persoonlijk, groep]) {
        expect(weekdayOf(cyclus.startDate)).toBe(startDay);
        expect(weekdayOf(nextCycle(cyclus).startDate)).toBe(startDay);
        expect(weekdayOf(previousCycle(cyclus).startDate)).toBe(startDay);

        // En de weken sluiten aan: navigeren verschuift precies één cyclus.
        expect(cyclesBetween(cyclus, nextCycle(cyclus))).toBe(1);
        expect(cyclesBetween(cyclus, previousCycle(cyclus))).toBe(-1);
      }
    }
  });

  it('laat opeenvolgende cycli exact op elkaar aansluiten', () => {
    let cycle = userCycle(woensdag, new Date('2026-01-07T12:00:00Z'));

    for (let i = 0; i < 60; i += 1) {
      const volgende = nextCycle(cycle);
      expect(volgende.startsAt.getTime()).toBe(cycle.endsAt.getTime());
      expect(cyclesBetween(cycle, volgende)).toBe(1);
      cycle = volgende;
    }
  });
});

/**
 * ⚠️ `userCycleOn` bestaat omdat `cycle_start_date` uit de database een string
 *    is. De verleiding is om die string met `as IsoDate` de merking op te
 *    plakken en door te geven; deze tests leggen vast dat de module hem in
 *    plaats daarvan zelf controleert.
 */
describe('userCycleOn — een cyclus rond een datum die je al hebt', () => {
  it('geeft de cyclus waarin die kalenderdatum valt', () => {
    // Donderdag 13 augustus 2026.
    expect(userCycleOn(maandag, '2026-08-13')?.startDate).toBe('2026-08-10');
    expect(userCycleOn(zaterdag, '2026-08-13')?.startDate).toBe('2026-08-08');
    expect(userCycleOn(woensdag, '2026-08-13')?.startDate).toBe('2026-08-12');
  });

  it('geeft dezelfde cyclus terug als hij een startdatum krijgt', () => {
    // Het gebruik waar hij voor gemaakt is: een `cycle_start_date` uit de
    // database terugvertalen naar de cyclus die erbij hoort. Die moet een vast
    // punt zijn, anders schuift een doorgeschoven weekdoel een week op.
    const cyclus = userCycleOn(maandag, '2026-08-10');
    expect(cyclus?.startDate).toBe('2026-08-10');
    expect(userCycleOn(maandag, cyclus?.startDate ?? '')?.startDate).toBe('2026-08-10');
  });

  it('komt overeen met userCycle op hetzelfde moment', () => {
    // De positieve controle naast de weigeringen hieronder: de twee wegen naar
    // een cyclus horen op hetzelfde uit te komen.
    const at = new Date('2026-08-13T08:00:00Z');
    for (const klok of [maandag, zaterdag, woensdag]) {
      const viaMoment = userCycle(klok, at);
      expect(userCycleOn(klok, localDateIn(klok.tz, at))?.startDate).toBe(viaMoment.startDate);
    }
  });

  it('weigert onzin in plaats van een cyclus te verzinnen', () => {
    // Dezelfde soort bescherming als Q-TODO A38 voor de tijdzone vraagt: een
    // kolom met vrije tekst hoort te worden opgevangen waar hij binnenkomt.
    for (const onzin of ['', 'gisteren', '2026-13-01', '2027-02-30', '2026-08-1']) {
      expect(userCycleOn(maandag, onzin), onzin).toBeNull();
    }
  });

  it('houdt rekening met de tijdzone van de klok', () => {
    const tokio: UserClock = { weekStartDay: 1, tz: TOK };
    const cyclus = userCycleOn(tokio, '2026-08-13');

    expect(cyclus?.startDate).toBe('2026-08-10');
    expect(cyclus?.tz).toBe(TOK);
    // Maandag 00:00 in Tokio is zondag 15:00 UTC.
    expect(cyclus?.startsAt.toISOString()).toBe('2026-08-09T15:00:00.000Z');
  });
});
