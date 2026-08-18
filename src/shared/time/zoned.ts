import type { IsoDate, TimeZone, Weekday } from './types';

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

/**
 * Is dit een bestaande kalenderdatum in het formaat `JJJJ-MM-DD`?
 *
 * ⚠️ Staat hier en niet in een Zod-schema, om de reden die in `index.ts` staat:
 *    dit is een datumberekening, en die horen niet buiten deze module. Een
 *    schema mag hem aanroepen.
 *
 * ⚠️ Een regex alleen is te weinig: die laat `2026-13-45` en `2027-02-30` door.
 *    Dat werd zichtbaar bij de deadline-verzoeken (Q-TODO A7), waar zo'n waarde
 *    door het formulier kwam en pas in Postgres omviel — de gebruiker kreeg een
 *    storingsmelding voor een tikfout.
 */
export function isGeldigeIsoDatum(waarde: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(waarde.trim());
  if (!match) return false;

  const [, y, m, d] = match;
  const jaar = Number(y);
  const maand = Number(m);
  const dag = Number(d);

  if (maand < 1 || maand > 12 || dag < 1) return false;

  // Schrikkeljaar volgens de gregoriaanse regel, zonder een Date te bouwen.
  const schrikkel = (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0;
  const lengte = [31, schrikkel ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return dag <= (lengte[maand - 1] ?? 0);
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

/**
 * De wandkloktijd van een tijdstempel, als `HH:MM` — bijvoorbeeld `09:05`.
 *
 * ⚠️ Deze functie staat hier en niet bij de chat, om precies de reden die
 *    CLAUDE.md correctheidsregel 7 noemt: het is een tijdberekening. `created_at`
 *    komt als ISO-string uit Postgres en moet in de tijdzone van de lézer
 *    weergegeven worden, niet in die van de server. Zou een scherm dit zelf doen
 *    met `new Date(...).toLocaleTimeString()`, dan staat er op de telefoon van een
 *    reiziger een andere tijd bij hetzelfde bericht dan in de groepsgeschiedenis.
 *
 * ⚠️ `h23` en niet de landsinstelling: `09:05` en nooit `9:05 AM`. De app is
 *    Nederlands en een 24-uursklok is hier het enige juiste antwoord.
 *
 * Geeft een lege string bij een tijdstempel die niet te lezen is. Een chatregel
 * zonder tijd is beter dan een chatregel met `Invalid Date` erboven.
 */
export function klokTijd(timestamp: string, tz: TimeZone): string {
  const moment = new Date(timestamp);
  if (Number.isNaN(moment.getTime())) return '';

  const p = partsIn(tz, moment);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(p.hour)}:${pad(p.minute)}`;
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
