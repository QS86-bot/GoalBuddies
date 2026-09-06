import { isGeldigeIsoDatum } from './zoned';

import type { IsoDate, TimeZone } from './types';

/**
 * Datums en tijden opschrijven in de notatie van de gebruiker — QS8-221.
 *
 * ⚠️ **Er was in dit project geen enkele datumopmaak.** Overal stond de kale
 *    waarde uit de database op het scherm: `t('doelen.streefdatum', { datum:
 *    doel.target_date })` zette er letterlijk `2026-12-31` neer. Een Nederlandse
 *    gebruiker verwacht `31-12-2026`, een Engelse `12/31/2026`, en niemand
 *    verwacht het ISO-formaat.
 *
 * ⚠️ **Hier en nergens anders.** Correctheidsregel 7 gaat over rékenen, maar de
 *    reden is dezelfde: één bron van waarheid in plaats van een ad-hocoplossing
 *    per scherm. `tests/beloftes/datumopmaak.test.ts` houdt dat vast.
 *
 * ⚠️ **De locale is een verplicht argument en heeft met opzet geen standaard.**
 *    Zou hij er een hebben, dan is "vergeten" een stille fout: het scherm toont
 *    dan Nederlandse datums aan een Engelse gebruiker en niets wordt rood. Nu kán
 *    een aanroeper hem niet weglaten en moet hij hem bij `opmaaktaal()` uit
 *    `shared/i18n` halen — de enige plek die weet welke taal geldt.
 *
 *    Dit bestand importeert `shared/i18n` daarom niet: dat zou een kringloop
 *    zijn, want `shared/i18n` haalt `weekdagPeildatum()` hiervandaan. De
 *    verdeling is dezelfde als bij `weekdagNaam()`, alleen andersom:
 *    `shared/time` weet hoe je een datum opschrijft, `shared/i18n` weet in welke
 *    taal.
 *
 * ⚠️ **Alleen weergave, nooit opslag.** Alles blijft in UTC en in ISO in de
 *    database, en elk formulier levert nog steeds ISO aan. Een opmaakhelper die
 *    per ongeluk aan de invoerkant wordt gebruikt, is een datum die per land iets
 *    anders betekent — `31-12-2026` en `12/31/2026` zijn dezelfde dag, maar
 *    `01-02-2026` en `02/01/2026` niet.
 *
 * ⚠️ **`timeZone: 'UTC'` bij elke kalenderdatum, en dat is geen detail.** Een
 *    `date`-kolom is een kalenderdag zonder tijd; `new Date('2026-12-31')` maakt
 *    er middernacht UTC van. Formatteer je dat in een zone wéstelijk van
 *    Greenwich, dan staat er 30 december. Een streefdatum die voor een
 *    Amerikaanse gebruiker een dag eerder valt, is precies het soort fout dat je
 *    pas ziet als iemand zich meldt.
 */

/**
 * Onleesbare invoer komt er onveranderd uit.
 *
 * ⚠️ En niet als lege string. Een ISO-datum is nog altijd te lezen; een lege plek
 *    waar een streefdatum hoort te staan, verbergt dat er iets mis is.
 */
function terugvalDatum(iso: string, opmaak: () => string): string {
  if (!isGeldigeIsoDatum(iso)) return iso;

  try {
    return opmaak();
  } catch {
    // Een omgeving zonder volledige Intl-data.
    return iso;
  }
}

/** Middernacht UTC van een `YYYY-MM-DD`, klaar om te formatteren. */
function alsUtcDag(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * Een datum in de notatie van de gebruiker: `31-12-2026` of `12/31/2026`.
 *
 * De standaardvorm. Kort genoeg voor een bijschrift en volledig genoeg om geen
 * jaar te hoeven raden.
 */
export function toonDatum(iso: string, locale: string): string {
  return terugvalDatum(iso, () =>
    new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(alsUtcDag(iso as IsoDate)),
  );
}

/**
 * Waar ruimte telt: `31 dec` of `Dec 31`.
 *
 * ⚠️ Zonder jaartal, dus alleen bruikbaar waar het jaar uit de context blijkt —
 *    een weekdoel van deze week, een mijlpaal in een lijst die op datum loopt.
 *    Bij een streefdatum die jaren vooruit kan liggen hoort `toonDatum()`.
 */
export function toonDatumKort(iso: string, locale: string): string {
  return terugvalDatum(iso, () =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(alsUtcDag(iso as IsoDate)),
  );
}

/**
 * De kop van een maandraster: `september 2026` of `September 2026`.
 *
 * ⚠️ **Hoofdletter erop, om dezelfde reden als bij `weekdagNaam()`.** `Intl`
 *    geeft in het Nederlands "september" met kleine letter — juist in een zin,
 *    niet als kop boven een kalender. Engels en Duits veranderen hier niet.
 */
export function toonMaand(iso: string, locale: string): string {
  return terugvalDatum(iso, () => {
    const naam = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(alsUtcDag(iso as IsoDate));

    return naam.charAt(0).toUpperCase() + naam.slice(1);
  });
}

/**
 * Waar ruimte niet telt: `donderdag 31 december 2026`.
 *
 * ⚠️ Mét de weekdag, want dat is de reden om de lange vorm te kiezen. "Week van
 *    31 december" zegt minder dan "week van donderdag 31 december" wanneer de
 *    week-startdag van de gebruiker juist het punt is (domeinregel 1).
 */
export function toonDatumLang(iso: string, locale: string): string {
  return terugvalDatum(iso, () =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(alsUtcDag(iso as IsoDate)),
  );
}

/**
 * Hoe het uur geschreven wordt, en dat verschilt per klok.
 *
 * ⚠️ **Een 24-uursklok padt en een 12-uursklok niet.** Een Nederlander schrijft
 *    `07:05` en `00:30`; een Amerikaan schrijft `8:00 PM` en niet `08:00 PM`.
 *    `Intl` doet dat níét vanzelf: met `hour: 'numeric'` staat er in het
 *    Nederlands `7:05`, en met `hour: '2-digit'` staat er in het Engels
 *    `08:00 PM`. Allebei fout, in tegengestelde richting.
 *
 * ⚠️ De klok komt uit de locale zelf en niet uit een lijstje landen — `Intl` weet
 *    het voor élke taal die er ooit bij komt, en een eigen tabel loopt achter.
 *    Zelfde redenering als bij `weekdagNaam()` in `shared/i18n`.
 */
function uurOpties(locale: string): Intl.DateTimeFormatOptions {
  let vierentwintig = true;

  try {
    const cyclus = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
    vierentwintig = cyclus === 'h23' || cyclus === 'h24';
  } catch {
    // Een omgeving zonder volledige Intl-data. Padden is de veiligste gok: het
    // leest als een klok en niet als een los getal.
  }

  return { hour: vierentwintig ? '2-digit' : 'numeric', minute: '2-digit' };
}

/** `HH:MM` of `HH:MM:SS`, zoals Postgres een `time`-kolom teruggeeft. */
const TIJD = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/**
 * Een tijdstip in de klok van de gebruiker: `20:00` of `8:00 PM`.
 *
 * ⚠️ **Of het een 24-uurs of een 12-uursklok wordt, bepaalt de locale en niet
 *    dit bestand.** Hier stond tot QS8-221 het tegendeel — `klokTijd()` schreef
 *    met zoveel woorden *"`h23` en niet de landsinstelling: `09:05` en nooit
 *    `9:05 AM`. De app is Nederlands en een 24-uursklok is hier het enige juiste
 *    antwoord."* Dat klopte toen het geschreven werd en is verlopen op de dag dat
 *    QS8-115 er Engels bij zette. Een besluit met een houdbaarheidsdatum die
 *    niemand opschreef.
 *
 * ⚠️ Alleen voor weergave. Het invoerveld van de herinnering blijft `HH:MM`
 *    aanleveren via `tijdVoorInvoer()`; `20:00` gaat de database in, `8:00 PM`
 *    komt er nooit in.
 */
export function toonTijd(tijd: string, locale: string): string {
  const delen = TIJD.exec(tijd);
  if (delen === null) return tijd;

  try {
    // ⚠️ Een vaste peildatum in UTC en formatteren in UTC: het gaat om een
    //    wandkloktijd zonder dag, dus er mag geen zone-omrekening bij komen.
    const peil = new Date(Date.UTC(2024, 0, 1, Number(delen[1]), Number(delen[2])));

    return new Intl.DateTimeFormat(locale, {
      ...uurOpties(locale),
      timeZone: 'UTC',
    }).format(peil);
  } catch {
    return tijd;
  }
}

/**
 * Onleesbare tijdstempels geven een lege string.
 *
 * ⚠️ Anders dan bij een datum, en met reden: een chatregel zonder tijd erboven is
 *    beter dan een chatregel met `Invalid Date`. Bij een datum stáát er iets
 *    leesbaars om op terug te vallen, bij een tijdstempel niet.
 */
function moment(timestamp: string): Date | null {
  const gelezen = new Date(timestamp);
  return Number.isNaN(gelezen.getTime()) ? null : gelezen;
}

/**
 * De wandkloktijd van een tijdstempel, in de zone én de klok van de lezer.
 *
 * ⚠️ **De zone is die van de lézer en niet die van de server.** Dat stond al in
 *    `klokTijd()`, dat deze functie vervangt: zou een scherm dit zelf doen met
 *    `new Date(...).toLocaleTimeString()`, dan staat er op de telefoon van een
 *    reiziger een andere tijd bij hetzelfde bericht dan in de groepsgeschiedenis.
 */
export function toonKlokTijd(timestamp: string, tz: TimeZone, locale: string): string {
  const gelezen = moment(timestamp);
  if (gelezen === null) return '';

  try {
    return new Intl.DateTimeFormat(locale, {
      ...uurOpties(locale),
      timeZone: tz,
    }).format(gelezen);
  } catch {
    return '';
  }
}

/**
 * Een tijdstempel als datum én tijd, in de zone en de notatie van de lezer.
 *
 * ⚠️ Voor een spoor of een logregel, waar het antwoord op "wanneer" zowel de dag
 *    als het tijdstip is. Hier stond `created_at.slice(0, 16).replace('T', ' ')`,
 *    en dat gaf een ISO-tijdstempel in UTC — de verkeerde notatie én het
 *    verkeerde uur, want een spoor van een commitment hoort in de zone van wie
 *    het leest.
 */
export function toonMoment(timestamp: string, tz: TimeZone, locale: string): string {
  const gelezen = moment(timestamp);
  if (gelezen === null) return '';

  try {
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...uurOpties(locale),
      timeZone: tz,
    }).format(gelezen);
  } catch {
    return '';
  }
}
