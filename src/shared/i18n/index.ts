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

/**
 * De volledige locale van het apparaat, of `null` als de gebruiker zelf koos.
 *
 * `null` betekent "volg `huidig`" en niet "onbekend" — zie `opmaaktaal()`.
 */
let opmaakTag: string | null = null;

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

  // ⚠️ Een eigen keuze overstemt de regionale notatie van het toestel. Wie in de
  //    app Nederlands kiest op een Britse telefoon, wil `31-12-2026` en niet
  //    `31/12/2026` — dat is dezelfde dag in een andere schrijfwijze, en de keuze
  //    ging over de taal van de app als geheel. Zie `opmaaktaal()`.
  opmaakTag = null;
  return huidig;
}

/**
 * De volledige taalaanduiding waarin datums en tijden worden opgeschreven.
 *
 * ⚠️ **Dit is niet hetzelfde als `taal()`, en dat verschil is het hele punt van
 *    QS8-221.** De catalogus kent twee talen, `nl` en `en`; de notatie van een
 *    datum kent er honderden. Een Britse telefoon geeft `en-GB` en hoort
 *    `31/12/2026` te zien, een Amerikaanse geeft `en-US` en hoort `12/31/2026` te
 *    zien — en allebei lezen ze dezelfde Engelse catalogus. Zou de opmaak op
 *    `taal()` leunen, dan krijgt de halve wereld de Amerikaanse volgorde.
 *
 * ⚠️ Zodra de gebruiker zélf een taal kiest, wint die (`zetTaal()` wist de tag).
 *    Dat is acceptatiecriterium 3: wie in de app een taal kiest, ziet de datums
 *    meebewegen.
 */
export function opmaaktaal(): string {
  return opmaakTag ?? huidig;
}

/**
 * De taal én de notatie uit het apparaat halen, in één aanroep.
 *
 * ⚠️ **Eén functie en niet twee zetters, zodat de volgorde niet uitmaakt.** Zou
 *    dit `zetTaal(...)` plus een losse `zetOpmaaktaal(...)` zijn, dan wist de
 *    eerste wat de tweede net zette — of andersom, afhankelijk van de volgorde
 *    waarin iemand ze neerzet. Dan is de juistheid een eigenschap van twee regels
 *    in `_layout.tsx` in plaats van van deze module.
 *
 * ⚠️ De notatie komt uit `Intl.DateTimeFormat().resolvedOptions().locale` — de
 *    locale die de runtime daadwerkelijk gebruikt, mét regio. `voorkeuren` is
 *    daar bewust níét de bron van: dat lijstje bepaalt welke catalogus past, en
 *    de eerste voorkeur kan een taal zijn die deze app niet spreekt.
 */
export function zetTaalUitApparaat(voorkeuren: readonly string[]): Taal {
  huidig = taalUitApparaat(voorkeuren);
  opmaakTag = apparaatOpmaaktaal();
  return huidig;
}

/**
 * De locale waarin dit toestel datums schrijft, of `null`.
 *
 * ⚠️ In een `try`, om dezelfde reden als `apparaatVoorkeuren()`: een ontbrekende
 *    `Intl` mag niet betekenen dat de app niet opstart.
 *
 * ⚠️ Dit leest `.locale` en niet `.timeZone`. Dat is geen tijdberekening maar de
 *    schrijfwijze van het toestel, en de lint-regel maakt datzelfde onderscheid
 *    sinds hij één keer te breed stond.
 */
function apparaatOpmaaktaal(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
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
 * Twee stukken tekst vergelijken in de sorteervolgorde van de ingestelde taal.
 *
 * ⚠️ **Sorteren is taalgebonden, en dat werd tot 27-08-2026 gemist.**
 *    `app/(tabs)/index.tsx` sorteerde doeltitels met `localeCompare(titel, 'nl')`
 *    — hard Nederlands, in een lijst die de taal van de gebruiker hoort te
 *    volgen. Dezelfde soort fout als het decimaalteken hierboven: onzichtbaar
 *    zolang je zelf Nederlands leest.
 *
 * ⚠️ **Het is geen theoretisch verschil.** Het Zweeds zet `å`, `ä` en `ö` áchter
 *    `z`; het Duits sorteert `ä` als `a`; het Nederlands behandelt de `ij` niet
 *    als één letter maar het Afrikaans wel. Elke taal die er ooit bij komt,
 *    krijgt hier automatisch zijn eigen volgorde — `Intl` weet het, wij niet.
 *
 * ⚠️ **Bewust géén `sensitivity` of `numeric` erbij.** Dat zou de volgorde ook
 *    veranderen voor wie de app vandaag in het Nederlands gebruikt, en dat is een
 *    ander besluit dan "volg de taal". Wat hier verandert is uitsluitend wélke
 *    taal de regels levert.
 */
export function vergelijkTekst(a: string, b: string): number {
  try {
    return a.localeCompare(b, huidig);
  } catch {
    // Een omgeving zonder volledige Intl-data. Een vaste volgorde is beter dan
    // een lijst die per render van plek verspringt.
    return a < b ? -1 : a > b ? 1 : 0;
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
 * De afgekorte weekdag voor een kolomkop: `ma`, `Mon`, `Mo`.
 *
 * ⚠️ **Zelfde bron en zelfde peildatum als `weekdagNaam()`.** Zeven afkortingen
 *    per taal overtypen is zeven kansen op een tikfout in een taal die hier
 *    niemand leest, en `Intl` kent bovendien de afkorting die die taal echt
 *    gebruikt — het Nederlands kort "woensdag" af tot "wo" en niet tot "woe".
 */
export function weekdagKort(weekdag: number): string {
  const peil = weekdagPeildatum(weekdag);

  try {
    const naam = new Intl.DateTimeFormat(huidig, { weekday: 'short', timeZone: 'UTC' }).format(peil);
    return naam.charAt(0).toUpperCase() + naam.slice(1);
  } catch {
    return String(weekdag);
  }
}

/**
 * De naam van een taal, geschreven in díé taal — QS8-115.
 *
 * ⚠️ **In de taal zelf en niet in de huidige taal**, en dat is de hele reden dat
 *    deze functie bestaat. Zet iemand de app per ongeluk op een taal die hij
 *    niet leest, dan is de keuzelijst zijn enige uitweg — en die vindt hij
 *    alleen terug als "Nederlands" er staat als Nederlands en niet als "Dutch".
 *    Vandaar `of(code)` en niet `of(huidig)`.
 *
 * ⚠️ Uit `Intl.DisplayNames` en niet uit de catalogus: het is locale-data, net
 *    als de weekdagnamen. Elke taal die er ooit bij komt, staat er dan meteen
 *    goed in.
 *
 * Valt terug op de code zelf als `Intl.DisplayNames` ontbreekt. "nl" in een
 * keuzelijst is lelijk maar bruikbaar; een lege regel is dat niet.
 */
export function taalNaam(code: Taal): string {
  try {
    const naam = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    if (naam === undefined) return code;

    // Hoofdletter erop, om dezelfde reden als bij de weekdagen: `Intl` geeft in
    // het Nederlands "Nederlands" mét, maar in het Frans "français" zónder.
    return naam.charAt(0).toUpperCase() + naam.slice(1);
  } catch {
    return code;
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
