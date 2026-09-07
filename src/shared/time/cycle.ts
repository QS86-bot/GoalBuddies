import type { Cycle, GroupClock, IsoDate, TimeZone, UserClock, Weekday } from './types';
import { GRACE_HOURS } from './types';
import {
  addDays,
  daysBetween,
  isGeldigeIsoDatum,
  localDateIn,
  parseIsoDate,
  utcFromZoned,
  weekdayOf,
} from './zoned';

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

  const datum = dateInCycle.trim() as IsoDate;

  // ⚠️ **Een geldige datum hoeft nog geen cyclus te hébben.** De laatste week van
  //    het jaar 9999 loopt door in het jaar 10000, en dat past niet in een
  //    `YYYY-MM-DD`; `cycleFromDate()` wierp daar een `Ongeldige datum:
  //    10000-01-03`. Dit is de énige ingang van deze module waar rauwe
  //    gebruikerstekst binnenkomt, en zijn contract is `Cycle | null` — een
  //    uitzondering die dwars door de aanroeper heen slaat, hoort daar niet bij.
  //    Gevonden op 06-09-2026 (QS8-227): iemand die `9999-12-27` in het
  //    adempauzeveld typte, liet het hele scherm omvallen in plaats van een
  //    melding te krijgen.
  //
  // ⚠️ Toetst `datum + 7` en niet de cyclusstart, en wijst daarmee hoogstens zes
  //    dagen te veel af — allemaal in de laatste week van het jaar 9999. De
  //    exacte variant zou de eerste twee regels van `cycleFromDate()` hier
  //    herhalen, en een tweede kopie van de weekgrens is een duurdere fout dan
  //    deze marge.
  if (!isGeldigeIsoDatum(addDays(datum, 7))) return null;

  return cycleFromDate({ startDay: clock.weekStartDay, tz: clock.tz }, datum);
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
 * `to` eerder valt.
 *
 * ⚠️ Hiervoor werd `weekly_goals.cycle_index` berekend, en dat was tot QS8-147
 *    de enige aanroeper in de app. Die kolom is met migratie 0185 verdwenen;
 *    deze functie blijft omdat `shared/time` de plek is waar zo'n som hoort te
 *    staan, en omdat de tests hem gebruiken. Komt er nooit een tweede lezer,
 *    dan is dat een vraag voor de opruimronde en niet voor dit issue.
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
