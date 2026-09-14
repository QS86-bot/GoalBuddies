/**
 * Het Q-Projects navy-stelsel, gedeeld met de Status Tracker.
 *
 * ⚠️ Waarden zijn letterlijk overgenomen uit `tracker.q-projects.tech`, thema's
 *    `navy` en `navy-licht`. **Verzin hier nooit een kleur bij.** Heb je een
 *    tint nodig die er niet in zit, neem hem dan eerst op in het Q-Projects-
 *    stelsel — anders lopen de twee apps uit elkaar.
 *
 * Navy is de ondergrond. Het accent is goud.
 */

export interface Palette {
  /** Achtergrond van het scherm. */
  readonly bg: string;
  /** Vlak waarop inhoud staat: kaarten, panelen. */
  readonly panel: string;
  /** Iets dieper vlak, voor nesting binnen een paneel. */
  readonly panelDark: string;
  readonly border: string;
  /** Merkkleur. Goud, geen blauw. */
  readonly accent: string;
  readonly accentDim: string;
  /** Voortgang: afgerond, goedgekeurd, vloer of plafond gehaald. */
  readonly green: string;
  /** Wacht op actie: goedkeuring pending, week nog niet gestart. */
  readonly orange: string;
  /** ⚠️ Uitsluitend deadline-risico. Nooit voor een gemiste week (domeinregel 7). */
  readonly red: string;
  readonly grey: string;
  readonly text: string;
  readonly textSecondary: string;
  readonly gridLine: string;
}

export const navy: Palette = {
  bg: '#0e1730',
  panel: '#17224a',
  panelDark: '#121b3b',
  border: 'rgba(255,255,255,0.09)',
  accent: '#e8b648',
  accentDim: '#cd9d34',
  green: '#3fbf8f',
  orange: '#f0803c',
  red: '#f05a54',
  grey: '#6e7fa8',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.68)',
  gridLine: 'rgba(232,182,72,0.028)',
};

export const navyLight: Palette = {
  bg: '#f4f5f8',
  panel: '#ffffff',
  panelDark: '#eef0f5',
  border: '#d8dde8',
  accent: '#a87a22',
  accentDim: '#8a6620',
  green: '#1f7a56',
  orange: '#b3541c',
  red: '#b8352f',
  grey: '#6b7793',
  text: '#141e3c',
  textSecondary: '#55607a',
  gridLine: 'rgba(20,30,60,0.035)',
};

/**
 * ⚠️ **De categoriekleuren — een uitbreiding van GoalBuddies op het
 *    Q-Projects-stelsel, en nog geen onderdeel ervan.**
 *
 * Besluit A55 (QS8-255): kleur mag erbij, uitsluitend waar hij iets codeert.
 * Alles hierboven komt letterlijk uit `tracker.q-projects.tech`; deze drie niet
 * — ze zijn hier gemeten en gekozen. Ze staan daarom apart en niet in `Palette`,
 * zodat de dag waarop ze wél in het gedeelde stelsel worden opgenomen één
 * bestand kost en geen zoektocht.
 *
 * ✅ **Beantwoord op 03-09-2026 (besluit K1): een uitbreiding van alleen
 *    GoalBuddies.** De Status Tracker erft ze niet, en daarom staan ze hier
 *    apart en niet in `Palette`.
 *
 * ⚠️ **Drie en niet meer, en dat is gemeten en geen smaak.** Op navy is goud
 *    vergeven aan het merk en groen, oranje en rood aan status. Wat overblijft
 *    is een smalle band; elke vierde kandidaat viel om op onderscheid bij
 *    kleurenblindheid of bij gewoon kleurenzicht. De cijfers staan in
 *    `docs/decisions/2026-08-31-ritme-klassement-en-kleur.md` §3, en de grendel
 *    eronder staat in `kleurafstand.test.ts` — die rekent het bij elke run na.
 *
 * ⚠️ **Daaruit volgt de ontwerpregel: de kleur codeert de familie, het pictogram
 *    codeert het gebied.** Vijftien kleuren bestaan niet; vijftien pictogrammen
 *    wel.
 *
 * ⚠️ **De roze wijkt af van het cijfer in A55, en dat is een correctie.** Daar
 *    stond `#e0578f`, gemeten op contrast en op onderlinge afstand tussen de
 *    drie families. Wat er níét gemeten was, is de afstand tot de státuskleuren
 *    — en die was 8.9 tot `red`. Rood betekent in dit stelsel uitsluitend
 *    deadline-risico, dus een roze markering die daar tegenaan ligt, leest als
 *    een waarschuwing over een doel waar niets aan de hand is. Gevonden door
 *    `kleurafstand.test.ts`, niet door te kijken.
 *
 * ⚠️ **De families en twee van de drie kleuren zijn op 04-09-2026 gewijzigd —
 *    besluit A58.** Er waren vier groepen waarvan er één geen kleur had; het zijn
 *    er nu drie van elk vier gebieden. Quinten vroeg om groen, oranje en geel.
 *
 *    **Groen en geel konden, oranje niet, en dat is gemeten en geen smaak.** De
 *    drie gevraagde kleuren zijn in dit stelsel de státuskleuren: afstand 0.0 tot
 *    `green`, `orange` en `accent`. En groen, oranje en geel liggen bovendien in
 *    dezelfde verwarringsband bij rood-groenblindheid — met de felste vrije
 *    kandidaten van het kleurenbord zakt dat drietal bij protanopie naar 3.1,
 *    waar de drempel 10 is.
 *
 *    Wat er staat is de dichtstbijzijnde uitvoering die het wél haalt: **de
 *    groen en de geel blijven, alleen de oranje is geruild voor magenta** — de
 *    enige van de drie die op twee manieren tegelijk onmogelijk was. Cijfers en
 *    de simulatiestrook in
 *    `docs/decisions/2026-09-04-drie-families-en-de-kleuren-die-niet-kunnen.md`.
 *
 * ⚠️ **De marge is krapper dan die van de vorige drie, en dat is de prijs.**
 *    Onderling 11.1 (donker) en 10.8 (licht), tegen 12.1 en 11.9 hiervóór.
 *    `kleurafstand.test.ts` rekent het bij elke run na; wie de groen zachter
 *    maakt, zakt onder de drempel tegen de geel.
 */
export interface Categoriekleuren {
  /** Gezondheid: sport, voeding, zelfzorg, meditatie. */
  readonly gezondheid: string;
  /** Softskills: creativiteit, productiviteit, sociaal, overig. */
  readonly softskills: string;
  /** Ambitie: werk, studie, bouwen, vaardigheden. */
  readonly ambitie: string;
}

export const categoriekleurenNavy: Categoriekleuren = {
  gezondheid: '#22cc22',
  softskills: '#dd4fa0',
  ambitie: '#ffe14d',
};

/**
 * ⚠️ Donkerder dan hun tegenhangers hierboven, want de ondergrond is wit.
 *    Dezelfde tint zou op `#ffffff` onder de drempel van 3.0 duiken — dat is
 *    geen smaakverschil maar dezelfde reden waarom `green`, `orange` en `red`
 *    hier ook andere waarden hebben.
 */
export const categoriekleurenNavyLight: Categoriekleuren = {
  gezondheid: '#0a9612',
  softskills: '#b53080',
  ambitie: '#6d5a00',
};

/**
 * Het kleurenpaar van een held — QS8-470, epic QS8-468.
 *
 * ⚠️ **Dit is de benoemde uitzondering op het navystelsel.** CLAUDE.md zei tot
 *    14-09-2026 "uitsluitend Q-Projects-kleurstellingen"; besluit 4 van QS8-468
 *    geeft de zes helden een eigen palet uit `docs/helden-codex.html`. 📏 Geen
 *    van de twaalf waarden komt voor in de tokenset hierboven.
 *
 *    ⚠️ De uitzondering geldt **alleen voor heldenoppervlakken**. Krijgt een
 *       knop of kaart die niets met helden te maken heeft een heldenkleur, dan
 *       is de regel niet verruimd maar afgeschaft.
 *
 * ⚠️ **`primair` is een vulling en `accent` een voorgrond, en dat is geen
 *    smaakverschil maar de reden dat ze verschillend getoetst worden.** Zo
 *    gebruikt de codex ze ook: `primair` tint de badge en de rand, `accent` is
 *    de lijnkleur van het symbool erop. 📏 Gemeten op 14-09-2026: elke `primair`
 *    zakt op de donkere ondergrond onder de 3.0 (1.08 tot 2.94) en haalt het
 *    licht moeiteloos (5.52 tot 14.22). Als voorgrond is hij dus onbruikbaar op
 *    navy — en dat hoort ook niet, want hij staat er niet als voorgrond.
 *
 * ⚠️⚠️ **De zes helden zijn één kleurfamilie en dat is met opzet.** 📏 De
 *    onderlinge afstand van de accenten is **1.08** waar `MIN_AFSTAND` 10 is.
 *    Dat is geen fout in het palet: codexprincipe 01 zegt "één systeem, zes
 *    gezichten — alleen het kleurenpaar en symbool verschillen". Het **symbool**
 *    draagt de identiteit van een held, de kleur draagt zijn stemming.
 *
 *    Voorgelegd op 14-09-2026 mét de meting erbij: zes onderscheidbare kleuren
 *    zijn haalbaar (maximaal 16.07 donker, 19.35 licht), maar alleen door twee
 *    helden naar bijna-wit en grijs te duwen of door de tinten los te laten
 *    waar de namen en symbolen op gebouwd zijn. Quinten heeft de oorspronkelijke
 *    kleuren behouden. `heldkleuren.test.ts` legt de gemeten afstanden vast als
 *    bodem, zodat ze niet verder naar elkaar toe kunnen kruipen.
 */
export interface Heldkleuren {
  /** Vulling: badge, rand, gloed. Nooit een voorgrondkleur. */
  readonly primair: string;
  /** Voorgrond: de lijnkleur van het symbool. Moet leesbaar zijn op de ondergrond. */
  readonly accent: string;
}

/**
 * De zes sleutels waarop dit palet gesleuteld is.
 *
 * ⚠️⚠️ **Dit is een kopie en geen bron, en dat is een naad om in de gaten te
 *    houden.** `src/modules/helden` bezit de canonieke lijst (QS8-469). Hij
 *    staat hier tóch, omdat `shared/` niet naar `modules/` mag importeren — die
 *    richting is omgekeerd, net zoals `shared/categorieen` bestaat omdat twee
 *    modules dezelfde woordenschat nodig hadden.
 *
 *    Twee lijsten die uit elkaar lopen zonder dat iets rood wordt is precies de
 *    fout van 0032/0034. De toets die ze naast elkaar legt hoort in
 *    `modules/helden`, want dáár mag je beide kanten importeren, en hij landt
 *    met het issue dat als tweede merget. **Staat die toets er niet, dan is deze
 *    lijst onbewaakt** — dat is geen theoretisch risico maar de reden dat dit
 *    blok hier staat in plaats van een regel type.
 */
export const HELDPALETSLEUTELS = [
  'strix',
  'ignis',
  'meridian',
  'forge',
  'lucerna',
  'quip',
] as const;

/** De zes paren. */
export type Heldpalet = Readonly<Record<(typeof HELDPALETSLEUTELS)[number], Heldkleuren>>;

/**
 * Donker thema: de waarden uit `docs/helden-codex.html`, onveranderd.
 *
 * 📏 Elke `accent` haalt hier 4.68 tot 9.76 op `navy.bg` — ruim boven de 3.0.
 */
export const heldkleurenNavy: Heldpalet = {
  strix: { primair: '#1B2A4A', accent: '#C9A24B' },
  ignis: { primair: '#B3211E', accent: '#F2B705' },
  meridian: { primair: '#1F6F5C', accent: '#E07A34' },
  forge: { primair: '#4B2E83', accent: '#B87333' },
  lucerna: { primair: '#8C2F39', accent: '#E8A33D' },
  quip: { primair: '#4A1942', accent: '#D9A62E' },
};

/**
 * Licht thema: dezelfde kleur, leesbaar gemaakt.
 *
 * ⚠️ **Donkerder accenten, om precies dezelfde reden als bij
 *    `categoriekleurenNavyLight`.** 📏 Op wit zakken vijf van de zes
 *    codexaccenten onder de drempel: 1.67 (Ignis) tot 3.00 (Meridian). Alleen
 *    Forge's `#B87333` haalt het al (3.48), en die blijft daarom staan.
 *
 * ⚠️ **Dit is geen andere kleur maar dezelfde tint donkerder**, en dat verschil
 *    is de hele reden dat dit mag: besluit van 14-09-2026 is dat de helden hun
 *    oorspronkelijke kleuren houden. De tint blijft; alleen de helderheid past
 *    zich aan de ondergrond aan.
 *
 * ⚠️ De `primair` staat hier ongewijzigd: die haalt het licht al met 5.52 tot
 *    14.22, en hij is hier evengoed een vulling en geen voorgrond.
 */
export const heldkleurenNavyLight: Heldpalet = {
  strix: { primair: '#1B2A4A', accent: '#a9883f' },
  ignis: { primair: '#B3211E', accent: '#b18604' },
  meridian: { primair: '#1F6F5C', accent: '#d37331' },
  forge: { primair: '#4B2E83', accent: '#B87333' },
  lucerna: { primair: '#8C2F39', accent: '#b78130' },
  quip: { primair: '#4A1942', accent: '#b08625' },
};

/**
 * Betekenisrollen. Componenten praten in rollen, niet in kleuren — dan blijft
 * "wat betekent deze kleur" op één plek staan.
 */
export function roles(p: Palette) {
  return {
    brand: p.accent,
    progress: p.green,
    pending: p.orange,
    atRisk: p.red,
    neutral: p.grey,
  } as const;
}

export const radius = {
  sm: 4,
  base: 8,
  md: 14,
  pill: 999,
} as const;

/** Ruimte in `[verticaal, horizontaal]`, exact zoals in het Q-Projects-stelsel. */
export const space = {
  paneel: { paddingVertical: 10, paddingHorizontal: 13 },
  sectie: { paddingVertical: 10, paddingHorizontal: 14 },
  rij: { paddingVertical: 5, paddingHorizontal: 0 },
  kaart: { paddingVertical: 9, paddingHorizontal: 12 },
  cel: { paddingVertical: 5, paddingHorizontal: 9 },
  veld: { paddingVertical: 6, paddingHorizontal: 10 },
  blokGap: 11,
  shell: 14,
} as const;

/**
 * Lato, met dezelfde terugvalstack als de Status Tracker. In het navy-thema is
 * er geen aparte monospace: mono verwijst naar dezelfde stack.
 */
export const fontSans =
  'Lato, system-ui, -apple-system, "Segoe UI", sans-serif';
export const fontMono = fontSans;

/**
 * Schaduw als React Native-stijl. De CSS-equivalenten uit het Q-Projects-stelsel
 * staan erbij, zodat web en native niet uit elkaar lopen.
 */
export const shadow = {
  /** CSS: `0 4px 12px rgba(0,0,0,.3)` */
  navy: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  /** CSS: `0 1px 2px rgba(20,30,60,.06), 0 4px 12px rgba(20,30,60,.08)` */
  navyLight: {
    shadowColor: '#141e3c',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
