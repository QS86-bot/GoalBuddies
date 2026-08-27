// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

import type { Cycle, GroupClock, IsoDate, TimeZone, UserClock, Weekday } from './types.ts';
import { GRACE_HOURS } from './types.ts';
import {
  addDays,
  daysBetween,
  isGeldigeIsoDatum,
  localDateIn,
  parseIsoDate,
  utcFromZoned,
  weekdayOf,
} from './zoned.ts';

/**
 * De twee klokken van GoalBuddies. Ze delen hun rekenwerk maar niet hun
 * betekenis: `userCycle` bepaalt punten en reeksen, `groupPeriod` bepaalt het
 * gedeelde ritme van een groep. Haal ze nooit door elkaar.
 */

interface ClockShape {
  readonly startDay: Weekday;
  readonly tz: TimeZone;
}

/** Bouwt de cyclus rond een kalenderdatum die al bekend is. */
function cycleFromDate(clock: ClockShape, dateInCycle: IsoDate): Cycle {
  const offset = (weekdayOf(dateInCycle) - clock.startDay + 7) % 7;
  const startDate = addDays(dateInCycle, -offset);
  const endDate = addDays(startDate, 6);

  const start = parseIsoDate(startDate);
  const afterEnd = parseIsoDate(addDays(startDate, 7));

  return {
    startDate,
    endDate,
    startsAt: utcFromZoned(clock.tz, start.year, start.month, start.day),
    endsAt: utcFromZoned(clock.tz, afterEnd.year, afterEnd.month, afterEnd.day),
    tz: clock.tz,
  };
}

function cycleContaining(clock: ClockShape, at: Date): Cycle {
  return cycleFromDate(clock, localDateIn(clock.tz, at));
}

// ---------------------------------------------------------------------------
// Klok 1 — de persoonlijke cyclus
// ---------------------------------------------------------------------------

/**
 * De cyclus van de gebruiker rond een kalenderdatum die je al hebt — QS8-106.
 *
 * ⚠️ Bestaat omdat een `cycle_start_date` uit de database een string is en geen
 *    moment. Wie daar zelf een `Date` van maakt om hem in `userCycle()` te
 *    stoppen, doet een tijdberekening buiten deze module en dat is precies wat
 *    correctheidsregel 7 verbiedt — bovendien landt `new Date('2026-08-17')` op
 *    middernacht UTC, wat in een westelijke tijdzone de dag ervóór is en dus een
 *    cyclus te vroeg.
 *
 * ⚠️ Neemt een gewone `string` en geen `IsoDate`, want dat is wat er uit de
 *    database komt, en geeft `null` terug als het geen geldige datum is. Zou de
 *    aanroeper de merking er zelf op casten, dan verplaatst dat het probleem
 *    naar de plek die er het minst van weet — en dan valt het pas om in
 *    `parseIsoDate()`, ver van de oorzaak. Dat is dezelfde vorm als Q-TODO A38:
 *    onzin in een kolom hoort te worden opgevangen waar hij binnenkomt.
 */
export function userCycleOn(clock: UserClock, dateInCycle: string): Cycle | null {
  if (!isGeldigeIsoDatum(dateInCycle)) return null;

  return cycleFromDate(
    { startDay: clock.weekStartDay, tz: clock.tz },
    dateInCycle.trim() as IsoDate,
  );
}

/** De cyclus waarin de gebruiker zich nu bevindt. */
export function userCycle(clock: UserClock, at: Date): Cycle {
  return cycleContaining({ startDay: clock.weekStartDay, tz: clock.tz }, at);
}

/**
 * De cyclus die de gebruiker op dit moment nog mag afsluiten.
 *
 * Binnen de coulanceperiode ná een rollover is dat nog de vórige cyclus: je was
 * zondagavond klaar maar logde het maandagochtend. Daarna is het de huidige.
 *
 * ⚠️ De rollover-job mag een cyclus pas als gemist afschrijven nadat dit venster
 *    verstreken is, anders kost een late log alsnog een minpunt.
 */
export function closableUserCycle(
  clock: UserClock,
  at: Date,
  graceHours: number = GRACE_HOURS,
): Cycle {
  const current = userCycle(clock, at);
  const graceEndsAt = current.startsAt.getTime() + graceHours * 3_600_000;

  return at.getTime() < graceEndsAt ? previousCycle(current) : current;
}

/** Zit het moment `at` nog binnen de coulanceperiode van de huidige cyclus? */
export function isWithinGrace(
  clock: UserClock,
  at: Date,
  graceHours: number = GRACE_HOURS,
): boolean {
  const current = userCycle(clock, at);
  return at.getTime() < current.startsAt.getTime() + graceHours * 3_600_000;
}

// ---------------------------------------------------------------------------
// Klok 2 — de groepsperiode
// ---------------------------------------------------------------------------

/**
 * De periode waarin de groep zich nu bevindt. Loopt volledig los van de
 * persoonlijke cyclus van de leden: sloot jij je week donderdag af en is de
 * huddledag zondag, dan telt jouw afsluiting mee in de periode die zondag begon.
 */
export function groupPeriod(clock: GroupClock, at: Date): Cycle {
  return cycleContaining({ startDay: clock.huddleDay, tz: clock.tz }, at);
}

// ---------------------------------------------------------------------------
// Navigeren en vergelijken
// ---------------------------------------------------------------------------

/**
 * De startdag die deze cyclus zélf heeft.
 *
 * ⚠️ Per constructie: `cycleFromDate()` legt `startDate` altijd op de startdag
 *    van de klok die hem maakte, dus dit is diezelfde dag en niet een gok.
 */
function startDagVan(cycle: Cycle): Weekday {
  return weekdayOf(cycle.startDate);
}

/**
 * De cyclus vóór deze, op dezelfde klok.
 *
 * ⚠️ **Nam tot 27-08-2026 een losse `startDay`, en die kon alleen maar overbodig
 *    of fout zijn.** Overbodig omdat elke juiste aanroeper precies de startdag
 *    doorgaf die de cyclus al had; fout omdat een ándere dag hier geen fout geeft
 *    maar een stil hérgelijnde week — `cycleFromDate()` legt hem gewoon op die
 *    andere dag. Dat is exact de vorm die de bevinding over `shared/time` vreest:
 *    de ene klok sijpelt de andere in, en niets wordt er rood van. Nu is het niet
 *    meer op te schrijven.
 */
export function previousCycle(cycle: Cycle): Cycle {
  return cycleFromDate(
    { startDay: startDagVan(cycle), tz: cycle.tz },
    addDays(cycle.startDate, -7),
  );
}

/** De cyclus ná deze, op dezelfde klok. Zie `previousCycle` voor het waarom. */
export function nextCycle(cycle: Cycle): Cycle {
  return cycleFromDate(
    { startDay: startDagVan(cycle), tz: cycle.tz },
    addDays(cycle.startDate, 7),
  );
}

/** Valt het moment `at` binnen deze cyclus? Half-open: `endsAt` telt niet mee. */
export function isWithinCycle(cycle: Cycle, at: Date): boolean {
  return at.getTime() >= cycle.startsAt.getTime() && at.getTime() < cycle.endsAt.getTime();
}

/**
 * Aantal cycli van `from` tot `to`. Nul als het dezelfde cyclus is, negatief als
 * `to` eerder valt. Hiermee wordt `weekly_goals.cycle_index` berekend: het aantal
 * cycli sinds de eerste cyclus van het doel, plus één.
 */
export function cyclesBetween(from: Cycle, to: Cycle): number {
  return Math.round(daysBetween(from.startDate, to.startDate) / 7);
}

/**
 * Het aantal cycli dat nog past tussen nu en een deadline. Voedt de Risico-radar:
 * resterende mijlpalen afgezet tegen resterende cycli.
 */
export function cyclesUntil(clock: UserClock, deadline: IsoDate, at: Date): number {
  const current = userCycle(clock, at);
  return Math.max(0, Math.floor(daysBetween(current.startDate, deadline) / 7));
}
