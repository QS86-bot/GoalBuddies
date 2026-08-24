import type { IsoDate, TimeZone, Weekday } from './types';

/**
 * Tijdzone-primitieven, gebouwd op `Intl`. Bewust zonder externe datumbibliotheek:
 * dit is weinig code, en elke afhankelijkheid hier is een afhankelijkheid in de
 * kern van het product.
 */

/**
 * De terugval als het toestel niets bruikbaars zegt.
 *
 * ⚠️ Een echte zone en niet `UTC`. Wie hier belandt is bijna zeker in
 *    Nederland — en een gebruiker die stilzwijgend op UTC staat, ziet zijn week
 *    in de zomer twee uur te vroeg omslaan zonder dat er iets fout lijkt.
 */
const TERUGVAL: TimeZone = 'Europe/Amsterdam';

/**
 * Kent `Intl` deze tijdzone?
 *
 * ⚠️ Getoetst tegen `Intl` zelf en niet tegen een eigen lijst: de IANA-database
 *    verandert een paar keer per jaar en een kopie in deze repo loopt achter.
 */
export function isGeldigeTijdzone(waarde: string): boolean {
  if (waarde.trim() === '') return false;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: waarde });
    return true;
  } catch {
    return false;
  }
}

/**
 * De tijdzone van het toestel — de énige plek waar die vraag gesteld wordt.
 *
 * ⚠️ **Waarom dit hier staat en niet bij de aanroeper.** Correctheidsregel 7, en
 *    het is een acceptatiecriterium van QS8-27: *"tijdzone wordt gebruikt door
 *    `shared/time`, nergens anders opnieuw bepaald"*. Tot 24-08-2026 stond deze
 *    vraag op twee plekken, en ze verschilden:
 *
 *      * `voorgesteldeTijdzone()` in `modules/auth` had een `try`/`catch` en een
 *        terugval;
 *      * het aanmaken van een groep in `modules/buddies` had geen van beide en
 *        gaf door wat `Intl` toevallig teruggaf.
 *
 *    Dat tweede geval is het gevaarlijke. `groups.tz` bepaalt de huddledag, de
 *    weekafsluiting en De Ketting voor **iedereen in die groep** — het is de
 *    groepsklok van domeinregel 1. Een lege of onbekende waarde daar is geen
 *    persoonlijk ongemak maar een groep waarvan de week op het verkeerde moment
 *    omslaat. De database weigert hem (CHECK sinds migratie 0019), dus wat de
 *    gebruiker in de praktijk kreeg was een storingsmelding bij het aanmaken van
 *    zijn eerste groep.
 *
 * ⚠️ Geeft een **voorstel** terug en geen vaststaand feit. Wie in Lissabon woont
 *    met zijn telefoon op Amsterdam moet dat kunnen rechtzetten, en wie reist
 *    wil niet dat zijn week verspringt omdat hij een week in Bangkok zat.
 */
export function apparaatTijdzone(): TimeZone {
  try {
    const gemeld = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // ⚠️ `resolvedOptions().timeZone` is in de typing een `string`, maar oudere
    //    JavaScriptCore-versies geven er `undefined` terug. Vandaar de toets en
    //    niet alleen een lege-string-controle.
    return typeof gemeld === 'string' && isGeldigeTijdzone(gemeld) ? gemeld : TERUGVAL;
  } catch {
    return TERUGVAL;
  }
}

/**
 * Alle tijdzones die dit platform kent, of een lege lijst.
 *
 * ⚠️ **Hier en niet bij het scherm, om dezelfde reden als `apparaatTijdzone()`**:
 *    correctheidsregel 7 zegt dat de vraag "welke tijdzones bestaan er" één keer
 *    gesteld wordt, en dit is die plek. Een scherm dat zelf `Intl` bevraagt, is
 *    de tweede afleiding waar 24-08 al een keer op misging.
 *
 * ⚠️ **`Intl.supportedValuesOf` is niet overal aanwezig**, en dat is geen
 *    theoretisch geval: Hermes heeft het pas sinds kort en oudere
 *    JavaScriptCore-versies missen het. Vandaar een lege lijst als terugval en
 *    geen exception — het scherm hoort dan een invoerveld te tonen in plaats van
 *    een keuzelijst, niet om te vallen.
 *
 * ⚠️ De lijst wordt éénmalig opgebouwd en daarna hergebruikt. Hij verandert
 *    binnen een sessie niet, en hij is een paar honderd strings groot.
 */
/**
 * De kanonieke schrijfwijze van een tijdzone.
 *
 * ⚠️ **Hier en niet in `shared/ui`, en de lint-regel van dit project heeft me
 *    daarop gewezen.** De eerste versie stond bij het scherm, en dat is precies
 *    de tweede afleiding waar correctheidsregel 7 over gaat: wie de tijdzone
 *    bepaalt, doet dat in `shared/time`.
 *
 * ⚠️ **`Intl` accepteert `europe/amsterdam` en dat is het probleem.** De zone
 *    wérkt — `currentUserCycle()` rekent er goed mee — maar hij wordt opgeslagen
 *    zoals je hem typte. Gevolg, gemeten in de critical-user-ronde van 24-08: het
 *    voorstel `Europe/Amsterdam` staat dan naast een knop "Gebruik
 *    europe/amsterdam" die hetzelfde doet, en na het opslaan verdwijnt de knop
 *    "de tijdzone van dit apparaat" nooit meer — want die vergelijking is op
 *    tekst. Eén vorm in de database houdt élke plek overeind die zo vergelijkt.
 *
 * ⚠️ Gooit niet op rommel. Een ongeldige zone komt niet langs
 *    `isGeldigeTijdzone()`, maar een helper die gooit is een storing die je pas
 *    in productie ziet.
 */
export function normaliseerZone(waarde: string): TimeZone {
  const schoon = waarde.trim();

  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: schoon }).resolvedOptions().timeZone;
  } catch {
    return schoon;
  }
}

let zonesCache: readonly TimeZone[] | null = null;

export function tijdzones(): readonly TimeZone[] {
  if (zonesCache !== null) return zonesCache;

  try {
    const gemeld = (
      Intl as unknown as { supportedValuesOf?: (soort: string) => string[] }
    ).supportedValuesOf?.('timeZone');

    zonesCache = Array.isArray(gemeld) ? gemeld : [];
  } catch {
    zonesCache = [];
  }

  return zonesCache;
}

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
 * Een datum die gegarandeerd op de gevraagde weekdag valt — QS8-115.
 *
 * ⚠️ **Waarom dit hier staat en niet bij de vertaling.** Het is datumconstructie,
 *    en die hoort volgens correctheidsregel 7 in deze module. De lint-regel
 *    `no-restricted-syntax` sloeg er ook op aan toen hij eerst in `shared/i18n`
 *    stond — terecht, en dat is precies waarvoor die regel bestaat.
 *
 *    De vertaalkant doet alleen de ópmaak: `weekdagNaam()` in `shared/i18n`
 *    voert deze datum aan `Intl` om er "Maandag" of "Monday" van te maken. Zo
 *    blijft de datumkennis hier en de taalkennis daar.
 *
 * ⚠️ De nummering is die van Postgres en van deze module: 0 = zondag. De
 *    peildatum is bewust een vaste week zonder betekenis — er wordt niets over
 *    "vandaag" of "deze week" afgeleid, alleen een dag benoemd.
 */
export function weekdagPeildatum(weekdag: number): Date {
  // 2024-01-07 was een zondag; de modulo vangt een waarde buiten 0–6 op.
  return new Date(Date.UTC(2024, 0, 7 + (((weekdag % 7) + 7) % 7)));
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
