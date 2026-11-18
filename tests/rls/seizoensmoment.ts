import { addDays, eersteVanDeMaand, maandErbij, type IsoDate, type TimeZone } from '../../src/shared/time';
// ⚠️ Niet op de publieke rand van `shared/time`, en met reden hiervandaan gehaald:
//    `utcFromZoned()` en `parseIsoDate()` zijn bouwstenen, en een export op de rand
//    voor één testhelper is een export zonder pad naar een scherm.
import { parseIsoDate, utcFromZoned } from '../../src/shared/time/zoned';

/**
 * Het moment waarop `maak_seizoensrecaps()` een fixture wél raakt — en het
 * moment waarop hij hem níet raakt — QS8-668.
 *
 * ⚠️⚠️ **Berekend uit de fixture en niet uit de kalender, en dat is de hele
 *    reparatie.** `tests/rls/nevenschade.test.ts` zet zijn weken `now()`-relatief
 *    neer en hield ze tegen een vaste `p_op` (`2026-10-01`, en in de buurtest
 *    `2026-11-15`). `seizoensgrens()` geeft het seizoen dat vóór `p_op` is
 *    afgelopen, dus die vaste datum wees een kwartaal aan waar de weken élke week
 *    een stukje verder uit wegschoven. 📏 Begin november 2026 lagen ze erbuiten:
 *    de groep telde als stil, de voorwaardetoets gaf 0 recaps en de RLS-job op
 *    `main` stond rood zonder dat `main` veranderd was. Dat was de derde keer dat
 *    een vaste datum in deze familie verliep ("Hier stond eerst 2026-05-13").
 *
 *    Wat de test nodig heeft is niet een datum maar een eigenschap: *het seizoen
 *    dat `p_op` aanwijst bevat de peildatum*. Die eigenschap volgt hier uit de
 *    peildatum zelf, en dan is er geen kalenderdag meer waarop ze stil onwaar
 *    wordt.
 *
 * ⚠️ **Alleen voor `season_cadence = 'quarterly'`**, de standaard van
 *    `create_group()`. `seizoensgrens()` kent ook `monthly`; een fixture die
 *    daarop staat heeft hier een tweede tak nodig, en die is bewust niet
 *    geschreven voor een geval dat geen test heeft.
 */
export interface Seizoensmomenten {
  /** Het seizoen (kwartaal) waar de peildatum in valt — wat de recap telt. */
  readonly seizoen: { readonly van: IsoDate; readonly tot: IsoDate };
  /**
   * De eerste dag van het kwartaal erna om 08:30 lokaal: `is_eerste_dag` en
   * `is_acht_uur` zijn dan allebei waar, en de grens staat open.
   */
  readonly open: string;
  /**
   * Twee weken later om 02:30 lokaal: hetzelfde afgesloten seizoen, maar niet de
   * eerste dag en niet acht uur — de grens houdt de functie tegen, en niets anders.
   */
  readonly dicht: string;
}

/** De eerste dag van het kwartaal waar `datum` in valt. */
export function kwartaalStart(datum: IsoDate): IsoDate {
  const { month } = parseIsoDate(datum);
  return maandErbij(eersteVanDeMaand(datum), -((month - 1) % 3));
}

export function seizoensmomenten(peildatum: IsoDate, tz: TimeZone): Seizoensmomenten {
  const van = kwartaalStart(peildatum);
  const volgend = maandErbij(van, 3);

  const eerste = parseIsoDate(volgend);
  const open = utcFromZoned(tz, eerste.year, eerste.month, eerste.day, 8, 30).toISOString();

  const halverwege = parseIsoDate(addDays(volgend, 14));
  const dicht = utcFromZoned(tz, halverwege.year, halverwege.month, halverwege.day, 2, 30).toISOString();

  return { seizoen: { van, tot: addDays(volgend, -1) }, open, dicht };
}
