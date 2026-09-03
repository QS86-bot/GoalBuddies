// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

import { addDays, parseIsoDate, toIsoDate, weekdayOf } from './zoned.ts';

import type { IsoDate, Weekday } from './types.ts';

/**
 * Het raster achter een datumkiezer — QS8-223.
 *
 * ⚠️ **Dit staat hier en niet in de component, en dat is correctheidsregel 7.**
 *    Een maandraster is kalenderrekenen: welke dag valt in welke kolom, waar
 *    begint de week, hoeveel dagen heeft februari. Zodra dat in een `.tsx` staat
 *    is het niet los te toetsen en rekent de volgende component het net iets
 *    anders uit.
 *
 * ⚠️ **De eerste kolom volgt de gebruiker en niet de conventie.** Domeinregel 1:
 *    de week-startdag is een instelling, en een kalender die altijd op maandag
 *    begint terwijl iemands week op zondag start, laat hem elke keer een kolom
 *    verkeerd lezen. De aanroeper geeft `startDag` mee uit het profiel; deze
 *    module verzint hem nooit zelf.
 *
 * ⚠️ **Altijd zes rijen.** Een maand beslaat vier tot zes weken, en een raster
 *    dat meebeweegt laat de knoppen eronder verspringen zodra je een maand
 *    verder bladert. Dat is precies het moment waarop iemand op de verkeerde dag
 *    tikt.
 */

/** Eén vakje in het raster. */
export interface Maanddag {
  readonly datum: IsoDate;
  /** Hoort deze dag bij de getoonde maand, of komt hij van de buurmaand? */
  readonly inMaand: boolean;
}

export interface Maandraster {
  /** De eerste van de getoonde maand. Draagt om welke maand het gaat. */
  readonly maand: IsoDate;
  /** Zes rijen van zeven dagen, op volgorde van de kolommen. */
  readonly weken: readonly (readonly Maanddag[])[];
  /** De weekdagen in kolomvolgorde, zodat de kop dezelfde bron gebruikt. */
  readonly kolommen: readonly Weekday[];
}

const RIJEN = 6;
const KOLOMMEN = 7;

/** De eerste van de maand waar deze datum in valt. */
export function eersteVanDeMaand(datum: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(datum);
  return toIsoDate(year, month, 1);
}

/**
 * Een aantal maanden verder of terug, altijd op de eerste.
 *
 * ⚠️ **Rekent in maanden en niet in dagen, en landt daarom op de eerste.** Zou
 *    dit `31 januari` een maand vooruit schuiven, dan is het antwoord `3 maart`
 *    — de klassieke maandfout. Door alleen met de eerste te rekenen bestaat dat
 *    geval niet.
 */
export function maandErbij(datum: IsoDate, maanden: number): IsoDate {
  const { year, month } = parseIsoDate(datum);
  const totaal = (year * 12 + (month - 1)) + maanden;
  return toIsoDate(Math.floor(totaal / 12), (totaal % 12) + 1, 1);
}

/** Het raster van de maand waar `inDeMaand` in valt. */
export function maandraster(inDeMaand: IsoDate, startDag: Weekday): Maandraster {
  const maand = eersteVanDeMaand(inDeMaand);
  const { month } = parseIsoDate(maand);

  // Hoeveel dagen ligt de eerste van de maand voorbij het begin van zijn week?
  const voorloop = (weekdayOf(maand) - startDag + KOLOMMEN) % KOLOMMEN;
  const begin = addDays(maand, -voorloop);

  const weken: Maanddag[][] = [];
  for (let rij = 0; rij < RIJEN; rij += 1) {
    const week: Maanddag[] = [];
    for (let kolom = 0; kolom < KOLOMMEN; kolom += 1) {
      const datum = addDays(begin, rij * KOLOMMEN + kolom);
      week.push({ datum, inMaand: parseIsoDate(datum).month === month });
    }
    weken.push(week);
  }

  const kolommen: Weekday[] = [];
  for (let i = 0; i < KOLOMMEN; i += 1) {
    kolommen.push(((startDag + i) % KOLOMMEN) as Weekday);
  }

  return { maand, weken, kolommen };
}

/**
 * Mag deze dag aangetikt worden?
 *
 * ⚠️ **Vergelijkt ISO-strings en dat mag, precies hier.** `YYYY-MM-DD` sorteert
 *    lexicografisch gelijk aan chronologisch — dat is de hele reden dat het
 *    formaat zo is. Elders in de app is een stringvergelijking op een datum juist
 *    de fout die `isoDatum` moest afvangen (`'morgen' > '2026-08-18'` is waar),
 *    en het verschil is dat deze functie alleen waarden krijgt die uit
 *    `maandraster()` komen.
 */
export function dagIsTeKiezen(
  datum: IsoDate,
  grenzen: { readonly min?: IsoDate | undefined; readonly max?: IsoDate | undefined },
): boolean {
  if (grenzen.min !== undefined && datum < grenzen.min) return false;
  if (grenzen.max !== undefined && datum > grenzen.max) return false;
  return true;
}
