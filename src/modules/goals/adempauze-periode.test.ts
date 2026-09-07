/**
 * De afronding van vrije datums naar hele weken — QS8-227.
 *
 * ⚠️ **De belofte hier is niet "9 september wordt 7 september".** Dat is een
 *    eigenschap van de rekenregel, en die blijft groen als iemand de regel
 *    verplaatst maar de knoop eronder breekt. De belofte is de naad: wat het
 *    scherm laat zien is precies wat het verstuurt, én `plan_adempauze()`
 *    accepteert dat zonder `geen_cyclusstart`. De weekdagtoets in de database
 *    blijft namelijk staan (QS8-227 punt 2), dus een afronding die er één dag
 *    naast zit, is geen schoonheidsfout maar een knop die niets doet.
 *
 * ⚠️ **Daarom loopt de sweep over alle zeven startdagen en over een hele week
 *    aan invoerdatums.** Met één startdag en één datum toetst deze suite of
 *    maandag maandag is.
 */
import { describe, expect, it } from 'vitest';

import { addDays, weekdayOf, type IsoDate, type UserClock, type Weekday } from '../../shared/time';

import { MAX_ADEMPAUZE_CYCLI, periodeUitDatums } from './adempauze-periode';

const STARTDAGEN: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function klokMet(dag: Weekday): UserClock {
  return { weekStartDay: dag, tz: 'Europe/Amsterdam' };
}

describe('periodeUitDatums', () => {
  it('levert altijd cyclusstarts van de gebruiker zelf op', () => {
    for (const dag of STARTDAGEN) {
      const klok = klokMet(dag);

      for (let i = 0; i < 14; i += 1) {
        const vanaf = addDays('2026-09-01' as IsoDate, i);
        const tot = addDays(vanaf, 10);
        const uitkomst = periodeUitDatums(klok, vanaf, tot);

        expect(uitkomst.ok, `${vanaf} met startdag ${dag}`).toBe(true);
        if (!uitkomst.ok) continue;

        expect(
          weekdayOf(uitkomst.waarde.start.startDate),
          `de begindatum die naar plan_adempauze() gaat moet op startdag ${dag} vallen`,
        ).toBe(dag);
        expect(
          weekdayOf(uitkomst.waarde.eind.startDate),
          `de einddatum die naar plan_adempauze() gaat moet op startdag ${dag} vallen`,
        ).toBe(dag);
      }
    }
  });

  it('rondt naar beneden af, dus de ingetypte dag valt altijd binnen de pauze', () => {
    // ⚠️ Ook een belofte en geen rekenregel: de gebruiker typt een dag waarop
    //    hij pauzeert. Rondde dit naar boven af, dan viel juist die dag erbuiten
    //    en telde de week die hij bedoelde alsnog mee.
    for (const dag of STARTDAGEN) {
      const klok = klokMet(dag);

      for (let i = 0; i < 7; i += 1) {
        const vanaf = addDays('2026-09-01' as IsoDate, i);
        const uitkomst = periodeUitDatums(klok, vanaf, '');

        expect(uitkomst.ok).toBe(true);
        if (!uitkomst.ok) continue;

        expect(uitkomst.waarde.start.startDate <= vanaf).toBe(true);
        expect(uitkomst.waarde.start.endDate >= vanaf).toBe(true);
      }
    }
  });

  it('telt de weken inclusief begin en eind', () => {
    const klok = klokMet(1);

    expect(periodeUitDatums(klok, '2026-09-07', '2026-09-07')).toMatchObject({
      ok: true,
      waarde: { weken: 1 },
    });
    // Een einddatum midden in de vijfde week telt die week nog mee: hij valt
    // erbinnen, dus de gebruiker pauzeert hem.
    expect(periodeUitDatums(klok, '2026-09-07', '2026-10-08')).toMatchObject({
      ok: true,
      waarde: { weken: 5 },
    });
  });

  it('leest een lege einddatum als één week en niet als een fout', () => {
    const uitkomst = periodeUitDatums(klokMet(1), '2026-09-09', '   ');

    expect(uitkomst.ok).toBe(true);
    if (!uitkomst.ok) return;
    expect(uitkomst.waarde.weken).toBe(1);
    expect(uitkomst.waarde.start.startDate).toBe(uitkomst.waarde.eind.startDate);
  });

  it('weigert een einddatum die in een eerdere week ligt', () => {
    expect(periodeUitDatums(klokMet(1), '2026-09-14', '2026-09-06')).toMatchObject({ ok: false });
  });

  it('laat een einddatum in dezelfde week wél door', () => {
    // ⚠️ Must-see. Een controle die op de kále datums vergelijkt in plaats van op
    //    de cycli, weigert "van woensdag tot dinsdag" — terwijl dat na afronding
    //    één en dezelfde week is en dus een geldige pauze van één week.
    const uitkomst = periodeUitDatums(klokMet(1), '2026-09-09', '2026-09-08');

    expect(uitkomst.ok).toBe(true);
    if (!uitkomst.ok) return;
    expect(uitkomst.waarde.weken).toBe(1);
  });

  // ⚠️ **Twee grendels en dus twee tests, en dat kwam uit de ijking.** Eén test
  //    die alleen rommel in het eerste veld voerde, bleef groen toen de
  //    null-controle op dát veld werd weggehaald: een lege einddatum valt terug
  //    op de begindatum, dus de tweede controle ving hem alsnog af. Een mutatie
  //    die door een ándere grendel wordt opgevangen, bewijst niets over de
  //    grendel die de test noemt.
  it('toont de bovengrens vóór de knop in plaats van na', () => {
    // ⚠️ **De enige regel die dit bestand wél beoordeelt, en met reden.** Een
    //    veld waarin `9999` mag en dat daarna weigert, is geen vrije invoer maar
    //    een val. Het getal zelf komt uit de database; de naad tussen die twee
    //    staat onder test in `tests/rls/adempauze-grendels.test.ts`.
    const klok = klokMet(1);
    const start = '2026-09-07' as IsoDate;

    const precies = periodeUitDatums(klok, start, addDays(start, (MAX_ADEMPAUZE_CYCLI - 1) * 7));
    expect(precies.ok, 'precies het plafond hoort te mogen').toBe(true);
    if (precies.ok) expect(precies.waarde.weken).toBe(MAX_ADEMPAUZE_CYCLI);

    const eentje = periodeUitDatums(klok, start, addDays(start, MAX_ADEMPAUZE_CYCLI * 7));
    expect(eentje.ok, 'één week over het plafond hoort niet te mogen').toBe(false);

    expect(periodeUitDatums(klok, start, '9999-12-27').ok).toBe(false);
  });

  it('weigert een begindatum die geen datum is', () => {
    for (const rommel of ['', 'morgen', '2026-13-01', '07-09-2026', '2026-09-32']) {
      expect(periodeUitDatums(klokMet(1), rommel, '2026-10-05'), rommel).toMatchObject({
        ok: false,
      });
    }
  });

  it('weigert een einddatum die geen datum is', () => {
    for (const rommel of ['morgen', '2026-13-01', '07-09-2026', '2026-09-32']) {
      expect(periodeUitDatums(klokMet(1), '2026-09-07', rommel), rommel).toMatchObject({
        ok: false,
      });
    }
  });
});
