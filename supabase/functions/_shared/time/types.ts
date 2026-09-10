// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

/**
 * `shared/time` is de enige bron van waarheid voor tijd in GoalBuddies.
 * CLAUDE.md, correctheidsregel 7: geen enkele tijd- of weekberekening daarbuiten.
 *
 * Er zijn twee klokken en ze worden nooit door elkaar gehaald:
 *
 *   1. De persoonlijke cyclus — `weekStartDay` van de gebruiker in diens tijdzone.
 *      Bepaalt wanneer weekdoelen resetten en wanneer punten tellen.
 *
 *   2. De groepsperiode — `huddleDay` van de groep in de tijdzone van de groep.
 *      Bepaalt de weekafsluiting, De Ketting en het groepsoverzicht.
 *
 * Alles wordt in UTC opgeslagen. "Vandaag" en "deze week" worden berekend in de
 * tijdzone die bij de klok hoort.
 */

/** 0 = zondag, 1 = maandag, … 6 = zaterdag. Zelfde nummering als Postgres. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Een kalenderdatum zonder tijd of tijdzone, als `YYYY-MM-DD`. */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

/** Een IANA-tijdzone, bijvoorbeeld `Europe/Amsterdam`. */
export type TimeZone = string;

/** De persoonlijke klok van een gebruiker. */
export interface UserClock {
  readonly weekStartDay: Weekday;
  readonly tz: TimeZone;
}

/** De klok van een groep. */
export interface GroupClock {
  readonly huddleDay: Weekday;
  readonly tz: TimeZone;
}

/**
 * Welke van de twee klokken een cyclus gemaakt heeft — QS8-180.
 *
 * ⚠️ **Dit merkteken bestaat omdat de twee klokken tot 10-09-2026 alleen bij de
 *    ínvoer gescheiden waren.** `UserClock` en `GroupClock` zijn verschillende
 *    types, en sinds 27-08 haalt het navigeren zijn startdag uit de cyclus zelf.
 *    Maar de úitvoer was één type: beide gaven een kaal `Cycle`, en
 *    `cyclesBetween(persoonlijkeCyclus, groepsperiode)` compileerde daardoor —
 *    met een getal als uitkomst dat bij geen van beide klokken hoort.
 */
export type Klok = 'gebruiker' | 'groep';

/**
 * Eén cyclus: zeven dagen, begrensd door lokale middernacht aan beide kanten.
 *
 * `startDate` en `endDate` zijn kalenderdata en zijn wat er in de database staat.
 * `startsAt` en `endsAt` zijn de bijbehorende UTC-momenten; `endsAt` valt buiten
 * de cyclus (half-open interval), zodat twee opeenvolgende cycli nooit overlappen.
 *
 * ⚠️ **`klok` is geen gegeven maar een grendel.** Hij zit in het type zodat
 *    TypeScript twee cycli van verschillende klokken niet naast elkaar laat
 *    leggen; hij staat óók in het object zodat het merk een runtime-waarde heeft
 *    en niet met een cast te omzeilen is zonder dat je het schrijft. Domeinregel
 *    1 zegt dat de twee klokken nooit door elkaar gehaald worden — dit is die
 *    regel, uitgedrukt in het typesysteem.
 */
export interface Cycle<K extends Klok = Klok> {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly tz: TimeZone;
  readonly klok: K;
}

/** Een cyclus van de persoonlijke klok — `currentUserCycle()`. */
export type Gebruikerscyclus = Cycle<'gebruiker'>;

/** Een periode van de groepsklok — `currentGroupPeriod()`. */
export type Groepsperiode = Cycle<'groep'>;

/**
 * De coulanceperiode: hoeveel uur ná de rollover je de vorige cyclus nog mag
 * afsluiten. Vertaling van Habit Huddle's "Night Owl Checkins".
 * Zondagavond klaar, maandagochtend gelogd — niets verloren.
 */
export const GRACE_HOURS = 12;
