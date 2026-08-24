import { en } from './en';
import { nl, type Sleutel } from './nl';
import { weekdagPeildatum } from '../time';

import { isTaal, STANDAARDTAAL, type Taal } from './types';

/**
 * De publieke rand van `shared/i18n` — QS8-113.
 *
 * ⚠️ **Waarom geen bibliotheek.** `i18next` en `lingui` lossen dingen op die dit
 *    project niet heeft: lazy loading van tientallen talen, pluralisatie in
 *    talen met meer dan twee vormen, ICU-formattering, een extractiepijplijn.
 *    Wat er wél is, is één ontwikkelaar, twee talen en een gratis tier waar een
 *    bundle van 40 kB echt meetelt. De vorm hieronder is bovendien de vorm die
 *    dit project al had — `BEVESTIGING`, `STATUS_TEKST` en
 *    `systeemberichten.ts` zijn alle drie catalogi. Dit formaliseert wat er
 *    stond in plaats van er een tweede manier naast te zetten.
 *
 *    ⚠️ Dat besluit heeft een houdbaarheidsdatum. Komt er een taal bij met
 *       meervoudsvormen die niet in "één of meer" passen (Pools heeft er drie),
 *       dan is `t()` te dom en hoort er alsnog een bibliotheek te komen. Dat is
 *       fase 3 en staat in QS8-107.
 *
 * ⚠️ **De taal is procesbreed en geen React-context.** Reden: `t()` wordt ook
 *    aangeroepen buiten componenten — in de datalaag, in schema's, in
 *    foutafhandeling. Een hook zou dat onmogelijk maken en een tweede weg
 *    afdwingen voor precies dezelfde teksten.
 */

export { AANSPREEKVORM, isTaal, STANDAARDTAAL, TALEN, type Taal } from './types';
export type { Sleutel } from './nl';

const CATALOGI: Readonly<Record<Taal, Readonly<Record<string, string>>>> = { nl, en };

let huidig: Taal = STANDAARDTAAL;

/** De taal waarin de app nu praat. */
export function taal(): Taal {
  return huidig;
}

/**
 * Zet de taal. Eén aanroep bij het opstarten, en opnieuw als het profiel laadt.
 *
 * Een onbekende waarde valt terug op de standaardtaal in plaats van te gooien:
 * een profiel met een taalcode die deze versie van de app niet kent, hoort een
 * Nederlandse app te krijgen en geen wit scherm.
 */
export function zetTaal(nieuw: string | null | undefined): Taal {
  huidig = isTaal(nieuw) ? nieuw : STANDAARDTAAL;
  return huidig;
}

/**
 * Kiest de beste taal uit wat het apparaat aanbiedt.
 *
 * ⚠️ Alleen gebruikt zolang het profiel nog geen keuze heeft. Zodra
 *    `profiles.locale` gevuld is, wint die — anders zou iemand die bewust
 *    Nederlands koos op een Engelse telefoon elke start opnieuw Engels krijgen.
 */
export function taalUitApparaat(voorkeuren: readonly string[]): Taal {
  for (const voorkeur of voorkeuren) {
    // `nl-NL` en `nl` zijn allebei Nederlands. De regio doet er niet toe: er
    // zijn bewust geen regiovarianten (zie `types.ts`).
    const basis = voorkeur.toLowerCase().split('-')[0];
    if (isTaal(basis)) return basis;
  }

  return STANDAARDTAAL;
}

/**
 * De taalvoorkeuren van dit apparaat, zonder extra dependency.
 *
 * ⚠️ **Bewust geen `expo-localization`.** Dat zou een tweede dependency zijn voor
 *    één lijstje strings, en de platformen bieden het zelf aan: op web
 *    `navigator.languages`, op native de opgeloste locale van `Intl` (React
 *    Native heeft Intl sinds Hermes standaard aan). Blijkt dat op een echt
 *    toestel toch niet te kloppen, dán is `expo-localization` de reparatie —
 *    maar niet vooruitlopend.
 *
 * ⚠️ In een `try`. Een ontbrekende `Intl` of een afgeschermde `navigator` mag
 *    niet betekenen dat de app niet opstart; dan is het gewoon de standaardtaal.
 */
export function apparaatVoorkeuren(): readonly string[] {
  try {
    const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } })
      .navigator;

    if (nav?.languages && nav.languages.length > 0) return nav.languages;
    if (nav?.language) return [nav.language];

    const uitIntl = Intl.DateTimeFormat().resolvedOptions().locale;
    return uitIntl ? [uitIntl] : [];
  } catch {
    return [];
  }
}

/**
 * Een getal in de notatie van de ingestelde taal.
 *
 * ⚠️ **Het decimaalteken is taalgebonden en dat werd tot QS8-115 gemist.**
 *    `risico.ts` deed `.replace('.', ',')` — hard Nederlands. In het Engels leest
 *    "0,5" als een opsomming of als vijfhonderd, en dat is precies het soort
 *    fout dat je in een vertaalde app pas ziet als iemand zich erover meldt.
 *
 * ⚠️ Standaard maximaal één decimaal, want dat is wat de aanroepers hier nodig
 *    hebben (een tempo van 0,4 per week). Meer cijfers suggereren een precisie
 *    die de onderliggende schatting niet heeft.
 */
export function getal(waarde: number, decimalen = 1): string {
  try {
    return new Intl.NumberFormat(huidig, { maximumFractionDigits: decimalen }).format(waarde);
  } catch {
    // Een omgeving zonder volledige Intl-data. Liever een puntnotatie dan een
    // lege plek in een zin.
    return String(Math.round(waarde * 10 ** decimalen) / 10 ** decimalen);
  }
}

/**
 * De naam van een weekdag, in de ingestelde taal.
 *
 * ⚠️ **Bewust geen zeven catalogussleutels per taal.** Weekdagnamen zijn
 *    locale-data die elk platform al heeft; ze overtypen levert alleen de kans
 *    op een tikfout in een taal die niemand hier spreekt. `Intl` doet het goed
 *    voor élke taal die er ooit bij komt, inclusief de hoofdletterconventie —
 *    het Engels schrijft "Monday" en het Duits "Montag", maar het Frans schrijft
 *    "lundi" met kleine letter.
 *
 * ⚠️ **De datum komt uit `shared/time` en wordt hier niet gemaakt.** Dat is
 *    correctheidsregel 7, en de lint-regel sloeg er ook op aan toen de
 *    `Date.UTC`-aanroep nog hier stond. De verdeling is nu schoon:
 *    `weekdagPeildatum()` weet welke datum op welke weekdag valt, en dit weet
 *    hoe je die in de taal van de gebruiker opschrijft.
 */
export function weekdagNaam(weekdag: number): string {
  const peil = weekdagPeildatum(weekdag);

  try {
    const naam = new Intl.DateTimeFormat(huidig, { weekday: 'long', timeZone: 'UTC' }).format(peil);

    // ⚠️ Hoofdletter erop, en dat is een keuze over lijstitems en niet over taal.
    //    `Intl` geeft in het Nederlands "maandag" met kleine letter — juist in een
    //    lopende zin, maar niet in een keuzelijst, waar het vóór QS8-115
    //    "Maandag" was. Hetzelfde geldt voor het Frans ("lundi"), waar menu's ook
    //    met een hoofdletter beginnen. Talen die zelf al een hoofdletter geven
    //    (Engels, Duits) veranderen hier niet.
    return naam.charAt(0).toUpperCase() + naam.slice(1);
  } catch {
    return String(weekdag);
  }
}

/**
 * De tekst bij een sleutel, met de parameters ingevuld.
 *
 * ⚠️ Valt terug op Nederlands als een vertaling ontbreekt, en op de sleutel zelf
 *    als die óók niet bestaat. Nooit een lege string: een leeg label leest als
 *    een storing, terwijl een zichtbare sleutel meteen vertelt wát er mist.
 *
 * ⚠️ Een ontbrekende parameter laat `{naam}` staan in plaats van "undefined" te
 *    tonen. Allebei fout, maar het eerste wijst naar de aanroeper.
 */
export function t(sleutel: Sleutel, params?: Readonly<Record<string, string | number>>): string {
  const sjabloon = CATALOGI[huidig][sleutel] ?? nl[sleutel] ?? sleutel;

  if (params === undefined) return sjabloon;

  return sjabloon.replace(/\{(\w+)\}/g, (heel, naam: string) => {
    const waarde = params[naam];
    return waarde === undefined ? heel : String(waarde);
  });
}
