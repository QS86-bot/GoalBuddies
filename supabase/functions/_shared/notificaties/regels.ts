// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/modules/notifications, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

/**
 * Wanneer sturen we wat — EPIC 11, QS8-91 en QS8-77.
 *
 * Puur, zonder Supabase en zonder React Native, om dezelfde reden als
 * `weekly-schemas.ts` en `mijlpaal-schemas.ts`: dit is de plek waar de regels
 * staan, en die horen testbaar te zijn zonder database en zonder renderer.
 * De Edge Function haalt de gegevens op en stelt de vragen; dit bestand geeft
 * de antwoorden.
 *
 * ⚠️ **Domeinregel 7 is hier geen bijzaak maar de begrenzing.** Er zijn precies
 *    vier soorten, ze staan als CHECK in de database (migratie 0053), en geen
 *    van vieren gaat over de tegenslag van een ander:
 *
 *    - `nudge` — over jezelf, en alleen als je vandaag nog niets deed
 *    - `approval_request` — iemand vraagt jóú om een oordeel
 *    - `approval_received` — goed nieuws over jezelf
 *    - `cycle_summary` — je eigen week, privé
 *
 *    Er is geen soort die zegt dat een ander iets gemist heeft, en die mag er
 *    ook niet komen. Zie Q-TODO A34: zelfs "je weekpas heeft je reeks gered"
 *    hoort strikt persoonlijk te zijn en nooit in een groepsmelding.
 */

/** Zoals `notifications_sent.kind` in de database. */
export type Melding = 'nudge' | 'approval_request' | 'approval_received' | 'cycle_summary';

/** Zoals `profiles.reminder_tone`. */
export type Toon = 'gentle' | 'firm';

export interface NudgeSituatie {
  /** Staat de herinnering aan? `profiles.reminder_enabled`. */
  readonly herinneringAan: boolean;
  /** Het ingestelde uur, 0–23. Uit `profiles.reminder_time`. */
  readonly herinneringUur: number | null;
  /** Het huidige uur in de tijdzone van de gebruiker, 0–23. */
  readonly lokaalUur: number;
  /** Heeft hij vandaag een Dagzet geschreven? */
  readonly heeftDagzet: boolean;
  /** Heeft hij vandaag een weekdoel afgerond? */
  readonly heeftAfronding: boolean;
  /** Staat er überhaupt een weekdoel open om aan te werken? */
  readonly heeftOpenWeekdoel: boolean;
  /** Loopt er een adempauze over de huidige cyclus? */
  readonly inAdempauze: boolean;
  /** Zit hij alleen nog in groepen die slapen? */
  readonly alleenSlapendeGroepen: boolean;
  /** Is de nudge van vandaag al verstuurd? */
  readonly alVerstuurd: boolean;
}

/**
 * Krijgt deze gebruiker nu een nudge?
 *
 * De volgorde is van goedkoop naar duur, maar inhoudelijk maakt dat niets uit:
 * elke reden is op zichzelf genoeg om níét te sturen. Ze staan als losse takken
 * en niet als één samengestelde voorwaarde, zodat `nudgeReden()` kan zeggen
 * wélke het was — dat scheelt raden als iemand meldt dat hij niets krijgt.
 */
export function magNudgen(s: NudgeSituatie): boolean {
  return nudgeReden(s) === null;
}

/** Waarom er géén nudge gaat, of `null` als hij wél gaat. */
export function nudgeReden(s: NudgeSituatie): string | null {
  if (!s.herinneringAan) return 'herinnering staat uit';
  if (s.herinneringUur === null) return 'geen tijdstip ingesteld';
  if (s.lokaalUur !== s.herinneringUur) return 'nog niet het ingestelde uur';

  // ⚠️ Acceptatiecriterium van QS8-77: "slaat over als er al een Dagzet of
  //    afronding is". Wie vandaag iets gedaan heeft, hoort geen herinnering te
  //    krijgen dat hij niets gedaan heeft — dat is de snelste manier om een
  //    melding te leren negeren.
  if (s.heeftDagzet) return 'er is al een Dagzet vandaag';
  if (s.heeftAfronding) return 'er is vandaag al afgerond';

  // Zonder open weekdoel is er niets om aan te werken, en dan is een nudge een
  // verwijt over iets wat niet bestaat.
  if (!s.heeftOpenWeekdoel) return 'geen open weekdoel';

  // ⚠️ Adempauze betekent dat deze week niet meetelt — niet positief en niet
  //    negatief (domeinregel 10). Een herinnering tijdens je vakantie is precies
  //    het tegenovergestelde van wat een adempauze belooft. QS8-91 noemt dit met
  //    naam.
  if (s.inAdempauze) return 'adempauze';

  // QS8-91 en QS8-77 allebei: niets vanuit slapende groepen (5.9).
  if (s.alleenSlapendeGroepen) return 'alle groepen slapen';

  // De laatste grendel. De unieke index in migratie 0053 is de échte; deze tak
  // bespaart alleen een verzoek aan Expo.
  if (s.alVerstuurd) return 'vandaag al verstuurd';

  return null;
}

/**
 * De taal waarin een melding geschreven wordt.
 *
 * ⚠️ **Deze module gebruikt bewust níét `shared/i18n`,** en dat is geen
 *    inconsistentie maar de enige juiste vorm hier. Twee redenen:
 *
 *    1. **Dit bestand wordt naar de Edge Function gekopieerd** (`npm run
 *       edge:sync`). Een import uit `shared/i18n` zou daar niet oplossen — de
 *       sync zet alleen extensies op imports binnen dezelfde map.
 *
 *    2. **Belangrijker: de taal is hier per óntvanger en niet per proces.**
 *       `shared/i18n` houdt één taal vast voor de hele app, en dat klopt op een
 *       telefoon met één gebruiker. De meldingenjob loopt over álle profielen;
 *       een procesbrede taal zou daar betekenen dat iedereen de taal krijgt van
 *       degene die toevallig als laatste is ingesteld. Die fout is bovendien
 *       onzichtbaar: er staat gewoon een melding, alleen in de verkeerde taal.
 *
 *    Vandaar een parameter en geen globale stand. De aanroeper geeft
 *    `profiles.locale` mee.
 */
export type Taalcode = 'nl' | 'en';

/** Wat er in een taal staat die deze module niet kent. */
const STANDAARDTAALCODE: Taalcode = 'nl';

function kies<T>(tabel: Readonly<Record<Taalcode, T>>, taal: Taalcode | null | undefined): T {
  return taal === 'en' ? tabel.en : tabel[STANDAARDTAALCODE];
}

export interface Bericht {
  readonly titel: string;
  /** De tekst onder de titel. */
  readonly body: string;
  /**
   * Waar de melding heen linkt — QS8-91: "elk met een diepe link naar de juiste
   * plek". Een pad binnen de app, zoals `expo-router` het kent.
   */
  readonly pad: string;
}

/**
 * De tekst van de dagelijkse nudge — QS8-77.
 *
 * ⚠️ De toon volgt `profiles.reminder_tone` (acceptatiecriterium 3, PRD 1.5).
 *    `firm` is directer, niet onaardig: er is verschil tussen "kom op" en "je
 *    hebt gefaald", en dit product zit aan de eerste kant. Een nudge die
 *    beschuldigt, wordt één keer gelezen en daarna uitgezet.
 *
 * ⚠️ Geen aantallen, geen reeks, geen "je hebt al twee dagen niets gedaan".
 *    Dat is een tegenslagsignaal, en ook in een privémelding is het de toon die
 *    bepaalt of iemand de app openmaakt of wegdrukt.
 */
const NUDGE: Readonly<Record<Taalcode, Readonly<Record<Toon, { titel: string; body: string }>>>> = {
  nl: {
    firm: {
      titel: 'Nog even je week',
      body: 'Er staat nog een weekdoel open. Eén kleine zet telt ook.',
    },
    gentle: {
      titel: 'Hoe gaat het met je week?',
      body: 'Je weekdoel staat nog open. De vloer halen telt volledig mee.',
    },
  },
  en: {
    firm: {
      titel: 'About your week',
      body: 'A weekly goal is still open. One small move counts too.',
    },
    gentle: {
      titel: 'How is your week going?',
      body: 'Your weekly goal is still open. Reaching the floor counts in full.',
    },
  },
};

export function nudgeBericht(toon: Toon, taal?: Taalcode | null): Bericht {
  const tekst = kies(NUDGE, taal)[toon];
  return { titel: tekst.titel, body: tekst.body, pad: '/' };
}

/**
 * De tekst voor de andere drie soorten.
 *
 * ⚠️ `approval_request` noemt de persoon en niet wat hij gedaan heeft. Dat is
 *    dezelfde regel als bij systeemberichten (beslisdocument 002 §3): een
 *    melding is een kopie die de autorisatie overleeft waaronder hij gemaakt is,
 *    en een pushmelding staat bovendien op een vergrendeld scherm dat iemand
 *    anders kan meelezen. De doeltitel hoort daar niet.
 */
interface SoortTekst {
  readonly titel: string;
  /** Met de naam van de ander erin. */
  readonly metNaam: (naam: string) => string;
  /** Zonder naam — het profiel was niet leesbaar of is verwijderd. */
  readonly zonderNaam: string;
  readonly pad: string;
}

const SOORTEN: Readonly<
  Record<Taalcode, Readonly<Record<Exclude<Melding, 'nudge'>, SoortTekst>>>
> = {
  nl: {
    approval_request: {
      titel: 'Een buddy wacht op je',
      metNaam: (naam) => `${naam} heeft een week ingediend en wacht op jouw oordeel.`,
      zonderNaam: 'Er wacht een week op jouw oordeel.',
      pad: '/beoordelen',
    },
    approval_received: {
      titel: 'Je week is bevestigd',
      metNaam: (naam) => `${naam} heeft je week goedgekeurd. Die telt.`,
      zonderNaam: 'Een buddy heeft je week goedgekeurd. Die telt.',
      pad: '/',
    },
    cycle_summary: {
      titel: 'Je week is afgelopen',
      metNaam: () => 'Kijk terug op wat er gelukt is en zet je doelen voor de nieuwe week.',
      zonderNaam: 'Kijk terug op wat er gelukt is en zet je doelen voor de nieuwe week.',
      pad: '/',
    },
  },
  en: {
    approval_request: {
      titel: 'A buddy is waiting on you',
      metNaam: (naam) => `${naam} submitted a week and is waiting for your call.`,
      zonderNaam: 'A week is waiting for your call.',
      pad: '/beoordelen',
    },
    approval_received: {
      titel: 'Your week is confirmed',
      metNaam: (naam) => `${naam} approved your week. It counts.`,
      zonderNaam: 'A buddy approved your week. It counts.',
      pad: '/',
    },
    cycle_summary: {
      titel: 'Your week has ended',
      metNaam: () => 'Look back at what worked and set your goals for the new week.',
      zonderNaam: 'Look back at what worked and set your goals for the new week.',
      pad: '/',
    },
  },
};

export function berichtVoor(
  soort: Exclude<Melding, 'nudge'>,
  input: { readonly naam?: string; readonly groepId?: string },
  taal?: Taalcode | null,
): Bericht {
  const tekst = kies(SOORTEN, taal)[soort];

  return {
    titel: tekst.titel,
    body: input.naam ? tekst.metNaam(input.naam) : tekst.zonderNaam,
    pad: tekst.pad,
  };
}

/**
 * De drie herinneringsvelden zoals ze naar `profiles` gaan.
 *
 * ⚠️ **"Uit is uit" is een belofte en geen implementatiedetail, en daarom staat
 *    hij hier en niet in een scherm.** Zet de gebruiker de herinnering uit, dan
 *    wordt `reminder_time` léég gemaakt en niet bewaard "voor als je hem weer
 *    aanzet". Dat is het leerpunt uit de Habit Huddle-analyse: een herinnering
 *    die terugkomt nadat je hem uitzette, is de snelste manier om een app van
 *    iemands telefoon te krijgen.
 *
 * ⚠️ **Waarom gedeeld.** Tot 26-08-2026 stond deze regel als één ternary in
 *    `app/onboarding/profiel.tsx`, en toen was hij nergens anders nodig. Zodra
 *    het profieltabblad hetzelfde kan, staat dezelfde belofte op twee plekken —
 *    en dan is het precies de naad die CLAUDE.md regel 18 beschrijft: beide
 *    schermen kloppen op zichzelf, en het gehéél lekt zodra iemand er één
 *    verplaatst of aanpast. Eén functie, en een test op de belofte in plaats van
 *    op het scherm.
 *
 * ⚠️ De toon blijft wél staan als je uitzet. Die is geen herinnering maar een
 *    voorkeur over hoe je aangesproken wilt worden, en die hoort niet te
 *    verdampen omdat je een kanaal dichtzet.
 */
export function herinneringVelden(keuze: {
  readonly aan: boolean;
  readonly tijd: string;
  readonly toon: Toon;
}): {
  readonly reminder_enabled: boolean;
  readonly reminder_time: string | null;
  readonly reminder_tone: Toon;
} {
  return {
    reminder_enabled: keuze.aan,
    reminder_time: keuze.aan ? keuze.tijd.trim() : null,
    reminder_tone: keuze.toon,
  };
}

/**
 * Het tijdstip waarop een herinnering staat als de gebruiker er nooit een koos.
 *
 * ⚠️ **Zonder tijdstip gaat er niets af.** `reminder_enabled` staat sinds
 *    migratie 0001 op `true` en `reminder_tone` op `gentle`, maar `reminder_time`
 *    heeft geen kolomstandaard — dus tot iemand hem zet, geeft `uurUit(null)`
 *    geen uur en slaat `nudgeReden()` de gebruiker over. Een aan-standaard
 *    zonder tijdstip is een herinnering die nooit komt.
 */
export const STANDAARD_HERINNERINGSTIJD = '20:00';

/**
 * De herinneringsvelden die de onboarding schrijft — QS8-213.
 *
 * ⚠️ **De onboarding vraagt de herinnering niet meer**, en dan is de vraag wie
 *    hem zet. Antwoord: dit, en alleen voor wie de onboarding nog niet gehad
 *    heeft. Voor iedereen daarna is het antwoord "niets".
 *
 * ⚠️ **Waarom `onboarded_at` de maatstaf is en niet `reminder_time === null`.**
 *    Dat tweede lijkt "nog niets gekozen" te betekenen en betekent het niet:
 *    `herinneringVelden()` maakt `reminder_time` juist léég zodra je de
 *    herinnering uitzet, want "uit is uit". Wie hem op het profieltabblad
 *    uitzette en daarna per ongeluk op het onboardingscherm belandt, zou hem dan
 *    terugkrijgen op 20:00 — precies de belofte die
 *    `tests/beloftes/herinnering.test.ts` bewaakt, gebroken langs een tweede weg.
 *
 * ⚠️ **Een leeg object is hier het antwoord en geen vergissing.**
 *    `updateProfiel()` schrijft alleen de velden die je meestuurt, dus niets
 *    meesturen is de enige vorm van "laat staan wat er staat". Een `undefined`
 *    per veld zou hetzelfde doen en leest als een waarde die kwijtraakte.
 */
export function herinneringStandaard(profiel: {
  readonly onboarded_at: string | null;
}): Partial<ReturnType<typeof herinneringVelden>> {
  if (profiel.onboarded_at !== null) return {};

  return herinneringVelden({
    aan: true,
    tijd: STANDAARD_HERINNERINGSTIJD,
    toon: 'gentle',
  });
}

/**
 * Een `time`-waarde uit de database als `HH:MM`, klaar voor een invoerveld.
 *
 * ⚠️ Postgres geeft `20:00:00` terug en een invoerveld toont `20:00`. Bewust
 *    hier en niet in `shared/time`, om dezelfde reden als `uurUit()` hieronder:
 *    dit is het lezen van een `time`-kolom en geen datumberekening. Er komt geen
 *    tijdzone aan te pas.
 *
 * ⚠️ Geeft de terugval bij `null` — dat is "nog niets ingesteld" en niet
 *    "middernacht". Zonder die terugval staat er een leeg veld waar de gebruiker
 *    zelf een formaat moet raden.
 */
export function tijdVoorInvoer(tijd: string | null, terugval = '20:00'): string {
  if (tijd === null) return terugval;

  const match = /^(\d{1,2}):(\d{2})/.exec(tijd.trim());
  const uur = match?.[1];
  const minuut = match?.[2];
  if (uur === undefined || minuut === undefined) return terugval;

  return `${uur.padStart(2, '0')}:${minuut}`;
}

/**
 * Het uur uit een `HH:MM(:SS)`-tijd, of `null` als er niets bruikbaars staat.
 *
 * ⚠️ Bewust hier en niet in `shared/time`: dit is geen datumberekening maar het
 *    lezen van een `time`-kolom. Er komt geen tijdzone aan te pas — het uur ís
 *    al lokaal bedoeld.
 */
export function uurUit(tijd: string | null): number | null {
  if (tijd === null) return null;

  const match = /^(\d{1,2}):(\d{2})/.exec(tijd.trim());
  if (!match) return null;

  const uur = Number(match[1]);
  return Number.isInteger(uur) && uur >= 0 && uur <= 23 ? uur : null;
}
