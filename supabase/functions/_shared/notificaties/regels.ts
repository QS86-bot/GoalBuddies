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
export function nudgeBericht(toon: Toon): Bericht {
  if (toon === 'firm') {
    return {
      titel: 'Nog even je week',
      body: 'Er staat nog een weekdoel open. Eén kleine zet telt ook.',
      pad: '/',
    };
  }

  return {
    titel: 'Hoe gaat het met je week?',
    body: 'Je weekdoel staat nog open. De vloer halen telt volledig mee.',
    pad: '/',
  };
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
export function berichtVoor(
  soort: Exclude<Melding, 'nudge'>,
  input: { readonly naam?: string; readonly groepId?: string },
): Bericht {
  switch (soort) {
    case 'approval_request':
      return {
        titel: 'Een buddy wacht op je',
        body: input.naam
          ? `${input.naam} heeft een week ingediend en wacht op jouw oordeel.`
          : 'Er wacht een week op jouw oordeel.',
        pad: '/beoordelen',
      };

    case 'approval_received':
      return {
        titel: 'Je week is bevestigd',
        body: input.naam
          ? `${input.naam} heeft je week goedgekeurd. Die telt.`
          : 'Een buddy heeft je week goedgekeurd. Die telt.',
        pad: '/',
      };

    case 'cycle_summary':
      return {
        titel: 'Je week is afgelopen',
        body: 'Kijk terug op wat er gelukt is en zet je doelen voor de nieuwe week.',
        pad: '/',
      };
  }
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
