// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/shared/time, gemaakt door `npm run edge:sync`. Bewerk het
// origineel en draai het script opnieuw; een wijziging hier gaat verloren en,
// erger, laat de app en de rollover-job met verschillende weken rekenen.

import type { IsoDate, TimeZone, Weekday } from './types.ts';

/**
 * Tijdzone-primitieven, gebouwd op `Intl`. Bewust zonder externe datumbibliotheek:
 * dit is weinig code, en elke afhankelijkheid hier is een afhankelijkheid in de
 * kern van het product.
 */

const formatters = new Map<TimeZone, Intl.DateTimeFormat>();

function formatterFor(tz: TimeZone): Intl.DateTimeFormat {
  const cached = formatters.get(tz);
  if (cached) return cached;

  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(tz, created);
  return created;
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** De wandklok in `tz` op het moment `at`. */
export function partsIn(tz: TimeZone, at: Date): Parts {
  const raw = formatterFor(tz).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = raw.find((p) => p.type === type);
    if (!found) throw new Error(`Tijdzone ${tz} leverde geen ${type}`);
    return Number(found.value);
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** De UTC-offset van `tz` op het moment `at`, in milliseconden. */
function offsetMsAt(tz: TimeZone, at: Date): number {
  const p = partsIn(tz, at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // De formatter kapt milliseconden af; die horen niet in de offset thuis.
  return asIfUtc - (at.getTime() - at.getUTCMilliseconds());
}

/**
 * Het UTC-moment dat in `tz` overeenkomt met de opgegeven wandklok.
 *
 * ⚠️ Twee keer rekenen is geen slordigheid maar noodzaak. De offset hangt af van
 *    het moment, en het moment kennen we pas na het toepassen van de offset. Bij
 *    een DST-overgang levert de eerste gok de verkeerde offset; de tweede ronde
 *    corrigeert dat. In het "gat" van de voorjaarsovergang (een lokale tijd die
 *    niet bestaat) landen we op het eerstvolgende moment dat wél bestaat.
 */
export function utcFromZoned(
  tz: TimeZone,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);

  const firstGuess = new Date(wallClock - offsetMsAt(tz, new Date(wallClock)));
  const corrected = new Date(wallClock - offsetMsAt(tz, firstGuess));

  return corrected;
}

/** De kalenderdatum in `tz` op het moment `at`. */
export function localDateIn(tz: TimeZone, at: Date): IsoDate {
  const p = partsIn(tz, at);
  return toIsoDate(p.year, p.month, p.day);
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}` as IsoDate;
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Ongeldige datum: ${date}`);

  const [, y, m, d] = match;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

/**
 * De weekdag van een kalenderdatum. Rekent bewust in UTC: een kale datum heeft
 * geen tijdzone, en `Date.UTC` geeft altijd hetzelfde antwoord — waar de machine
 * ook staat.
 */
export function weekdayOf(date: IsoDate): Weekday {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

/** Kalenderrekenen, zonder tijdzone: `2026-03-29` plus 1 dag is `2026-03-30`. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return toIsoDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Aantal hele dagen van `from` tot `to`. Negatief als `to` eerder valt. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const msPerDay = 86_400_000;
  const diff =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(diff / msPerDay);
}
