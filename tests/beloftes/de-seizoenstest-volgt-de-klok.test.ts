import { afterEach, describe, expect, it } from 'vitest';

import { addDays, freezeNow, now, unfreezeNow, userCycle, type IsoDate } from '../../src/shared/time';
import { partsIn } from '../../src/shared/time/zoned';
import { kwartaalStart, seizoensmomenten } from '../rls/seizoensmoment';

/**
 * De belofte: **het moment dat `nevenschade.test.ts` aan `maak_seizoensrecaps()`
 * meegeeft, wijst het seizoen aan waar de fixture in ligt — op élke kalenderdag.**
 * QS8-668.
 *
 * ⚠️ **Waarom dit bestand bestaat.** De RLS-suite draait hier zonder database en
 *    in CI mét; wat hier te toetsen is, is de rekenregel die de twee aan elkaar
 *    knoopt (regel 18 vraag 1). De RLS-test zelf bewaakt de grens van de functie;
 *    dít bestand bewaakt dat de test die grens op het juiste moment aanspreekt,
 *    en dat dat moment niet opnieuw een kalenderdag heeft waarop het stil onwaar
 *    wordt.
 *
 * ⚠️ **Acceptatiecriterium 3 van QS8-668 staat hier als klok en niet als
 *    kalender:** `freezeNow()` zet de klok in vier verschillende kwartalen, en de
 *    fixture-week (`addDays(cyclus.startDate, -14)`, de goedgekeurde week `-2`
 *    uit `nevenschade.test.ts`) valt elke keer in het seizoen dat `open` aanwijst.
 *
 * IJKING — met de hand gedraaid op 05-11-2026, mutatie per grendel in
 * `seizoensmoment.ts`, en per mutatie staat wélke tests omvielen:
 *
 *   1  `maandErbij(van, 3)` → `maandErbij(van, 6)` (een kwartaal te ver)
 *      → de twee exacte-waardetests rood; de klokproef blijft groen, want die
 *        toetst het seizoen en niet het moment — daarom staan de exacte waarden
 *        ernaast en niet in plaats ervan
 *   2  `8, 30` → `9, 30` → drie rood, waaronder 'is de eerste dag om acht uur'
 *   3  `open` terug naar de vaste `'2026-10-01T06:30:00.000Z'` (de fout van
 *      `main`) → drie rood, waaronder de klokproef met de klok op 05-11-2026 —
 *      precies de dag waarop de RLS-job omviel
 *   4  `kwartaalStart()` geeft de eerste van de maand → vier rood
 */

const TZ = 'Europe/Amsterdam';
const iso = (s: string): IsoDate => s as IsoDate;

afterEach(unfreezeNow);

describe('kwartaalStart', () => {
  it('kent de vier kwartalen', () => {
    expect(kwartaalStart(iso('2026-01-01'))).toBe('2026-01-01');
    expect(kwartaalStart(iso('2026-03-31'))).toBe('2026-01-01');
    expect(kwartaalStart(iso('2026-05-13'))).toBe('2026-04-01');
    expect(kwartaalStart(iso('2026-09-30'))).toBe('2026-07-01');
    expect(kwartaalStart(iso('2026-11-05'))).toBe('2026-10-01');
    expect(kwartaalStart(iso('2026-12-31'))).toBe('2026-10-01');
  });
});

describe('seizoensmomenten', () => {
  it('geeft het seizoen van de peildatum en het moment erna', () => {
    const m = seizoensmomenten(iso('2026-11-05'), TZ);
    expect(m.seizoen).toEqual({ van: '2026-10-01', tot: '2026-12-31' });
    // 1 januari 08:30 in Amsterdam is wintertijd: 07:30 UTC.
    expect(m.open).toBe('2027-01-01T07:30:00.000Z');
    expect(m.dicht).toBe('2027-01-15T01:30:00.000Z');
  });

  it('rekent de zomertijd mee', () => {
    // 1 oktober 08:30 in Amsterdam is nog zomertijd: 06:30 UTC — precies het
    // moment dat tot QS8-668 vast in de test stond, nu berekend.
    expect(seizoensmomenten(iso('2026-08-20'), TZ).open).toBe('2026-10-01T06:30:00.000Z');
  });

  it('is de eerste dag om acht uur lokaal, en de dichte kant is dat allebei niet', () => {
    for (const dag of ['2026-02-10', '2026-05-13', '2026-08-20', '2026-11-05'] as const) {
      const m = seizoensmomenten(iso(dag), TZ);
      const open = partsIn(TZ, new Date(m.open));
      expect([open.day, open.hour], `${dag}: open`).toEqual([1, 8]);
      expect((open.month - 1) % 3, `${dag}: open valt niet op een kwartaalgrens`).toBe(0);

      const dicht = partsIn(TZ, new Date(m.dicht));
      expect(dicht.day, `${dag}: dicht`).not.toBe(1);
      expect(dicht.hour, `${dag}: dicht`).not.toBe(8);
      // Dezelfde grens als `open`: het afgesloten seizoen is het seizoen van de fixture.
      expect(kwartaalStart(iso(`${dicht.year}-${String(dicht.month).padStart(2, '0')}-01`))).toBe(
        kwartaalStart(iso(`${open.year}-${String(open.month).padStart(2, '0')}-01`)),
      );
    }
  });

  /**
   * De naad met de fixture van `nevenschade.test.ts`, in vier kwartalen. Zou de
   * peildatum één kwartaal verkeerd liggen, dan telt de groep als stil en is de
   * RLS-test groen zonder iets te bewaken — precies wat op `main` gebeurde.
   */
  it.each([
    '2026-02-10T10:00:00Z',
    '2026-05-13T10:00:00Z',
    '2026-09-30T23:30:00Z',
    '2026-11-05T09:00:00Z',
  ])('wijst het seizoen aan waar de fixture-week in ligt (klok op %s)', (klok) => {
    freezeNow(new Date(klok));
    const cyclus = userCycle({ weekStartDay: 1, tz: TZ }, now());
    const week = addDays(cyclus.startDate, -14);

    const m = seizoensmomenten(week, TZ);
    expect(week >= m.seizoen.van && week <= m.seizoen.tot, `${week} ligt niet in ${m.seizoen.van}..${m.seizoen.tot}`).toBe(true);
    // En het moment ligt ná het seizoen, anders is er nog niets afgelopen.
    expect(m.open > `${m.seizoen.tot}T23:59:59Z`).toBe(true);
  });
});
