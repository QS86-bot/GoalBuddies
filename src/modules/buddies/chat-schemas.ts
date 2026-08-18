import { z } from 'zod';

import { voegOplopendSamen } from './merge';

/**
 * De regels van de groepschat, zonder Supabase en zonder React Native — QS8-69.
 *
 * ⚠️ Dit bestand importeert bewust niets uit `api.ts` of `chat.ts`. Zou het dat
 *    wel doen, dan trekt elke test die deze regels wil controleren de
 *    Supabase-client en AsyncStorage mee, en daarmee React Native in een test die
 *    in Node draait. Zelfde reden als `schemas.ts` en `shared/ui/naming.ts`.
 */

// ---------------------------------------------------------------------------
// Wat er in de chat staat
// ---------------------------------------------------------------------------

/** De maximale tekstlengte. Gelijk aan `chat_messages_body_len` in migratie 0001. */
export const BERICHT_MAX = 4000;

/** Eén pagina geschiedenis. Gelijk aan de bovengrens van `groepschat()`. */
export const BERICHTEN_PER_PAGINA = 30;

export const berichtSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, { error: 'Er staat nog niets in je bericht.' })
    .max(BERICHT_MAX, { error: `Maximaal ${BERICHT_MAX} tekens.` }),
});

export type BerichtInvoer = z.infer<typeof berichtSchema>;

/**
 * ⚠️ Deze lijst is een kopie van de CHECK `chat_messages_system_event_bekend`
 *    uit migratie 0025, en er staat een test op die dat vasthoudt. Dat is met
 *    opzet dubbel werk: het is de plek waar de app en de database elkaar
 *    tegenspreken zodra iemand een nieuw type systeembericht toevoegt zonder
 *    zich af te vragen of het domeinregel 7 breekt (QS8-74).
 *
 * ⚠️ Wat hier níét staat, is de kern van de regel: geen gemiste week, geen
 *    verbroken reeks, geen achterstand, geen doorgeschoven weekdoel, geen laten
 *    vallen mijlpaal, geen afgekeurd bewijs, geen "vertel me meer". Een groep ziet
 *    uitsluitend wat er wél is.
 */
export const SYSTEEM_GEBEURTENISSEN = [
  'group_sleeping',
  'member_joined',
  'completion_pending',
  'completion_approved',
  'milestone_done',
  'goal_completed',
  'commitment_unlocked',
  'commitment_due',
  /**
   * ⚠️ Een uitzondering op domeinregel 7 die Quinten zelf gemaakt heeft (Q-TODO
   *    A7, migratie 0032), en de enige gebeurtenis in deze lijst die niet
   *    onvoorwaardelijk positief is. Toegestaan omdat de gebruiker hem zélf
   *    verstuurt, met een argument dat hij zelf schrijft — dezelfde route als
   *    vraag 2 van de weekafsluiting.
   *
   *    Het bericht noemt de persoon en de gebeurtenis, nooit de doeltitel, de
   *    datum of het argument. Alleen het vrágen wordt aangekondigd; een
   *    afwijzing niet, want dát is wel een tegenslagsignaal over een ander.
   */
  'deadline_requested',
] as const;

export type SysteemGebeurtenis = (typeof SYSTEEM_GEBEURTENISSEN)[number];

/**
 * Gebeurtenissen die tegenslag van iemand ánders zouden zijn.
 *
 * ⚠️ Deze lijst wordt nergens gerenderd. Hij bestaat om de test in
 *    `chat-schemas.test.ts` iets te geven om tegen te vergelijken: staat één van
 *    deze namen ooit in `SYSTEEM_GEBEURTENISSEN` of in de CHECK van de database,
 *    dan wordt de test rood. Zo hoeft niemand de regel te ónthouden.
 */
export const VERBODEN_GEBEURTENISSEN = [
  'week_missed',
  'streak_broken',
  'behind_schedule',
  'deadline_passed',
  'weekly_goal_carried',
  'milestone_dropped',
  'goal_missed',
  'completion_more_info',
  'points_lost',
  'member_inactive',
] as const;

export interface ChatBericht {
  readonly id: string;
  /** `null` betekent: systeembericht. */
  readonly sender_id: string | null;
  readonly sender_name: string;
  readonly sender_avatar: string | null;
  readonly body: string;
  readonly type: string;
  readonly system_event: string | null;
  readonly created_at: string;
}

/** Waar "ouder laden" verder gaat: het oudste bericht dat je al hebt. */
export interface ChatCursor {
  readonly at: string;
  readonly id: string;
}

export function isSysteembericht(bericht: ChatBericht): boolean {
  return bericht.type === 'system' || bericht.sender_id === null;
}

// ---------------------------------------------------------------------------
// Ordenen
// ---------------------------------------------------------------------------

/**
 * Voegt twee lijsten berichten samen tot één oplopende reeks.
 *
 * ⚠️ Dit is de reden dat het scherm bij een realtime-signaal gewoon de nieuwste
 *    pagina opnieuw ophaalt in plaats van het losse bericht in te voegen. De
 *    payload van een realtime-gebeurtenis heeft geen naam en geen avatar erbij —
 *    die staan in `profiles` — dus een ingevoegd bericht zou "Een buddy" heten tot
 *    de volgende verversing. Opnieuw ophalen en samenvoegen kost één verzoek en
 *    is altijd juist.
 *
 * ⚠️ Het sorteren en ontdubbelen zelf staat in `merge.ts`, want de reacties op de
 *    weekafsluiting hebben exact hetzelfde nodig. Die kopie stond eerst in het
 *    scherm — bevinding van de code-review op EPIC 7.
 */
export function voegSamen(
  bestaand: readonly ChatBericht[],
  nieuw: readonly ChatBericht[],
): readonly ChatBericht[] {
  return voegOplopendSamen(bestaand, nieuw);
}

/** Waar "ouder laden" verder moet zoeken, of `null` als er niets is. */
export function cursorVan(berichten: readonly ChatBericht[]): ChatCursor | null {
  const oudste = berichten[0];
  return oudste === undefined ? null : { at: oudste.created_at, id: oudste.id };
}

// ---------------------------------------------------------------------------
// De cache van de lopende periode
// ---------------------------------------------------------------------------

/**
 * Wat er in de opslag staat.
 *
 * ⚠️ De periode staat erbij en is niet af te leiden. Het acceptatiecriterium
 *    luidt "leest ook bij een slechte verbinding uit de cache van de huidige
 *    cyclus", en zonder die stempel kun je niet zien of een cache nog over de
 *    lopende periode gaat. Een chat van drie weken terug tonen als "de groep nu"
 *    is erger dan niets tonen: je denkt dat er niets gebeurd is.
 */
export interface ChatCache {
  readonly periodStart: string;
  readonly berichten: readonly ChatBericht[];
}

/** Hoeveel berichten er bewaard worden. Eén pagina is genoeg om iets te zien. */
export const CACHE_MAX = BERICHTEN_PER_PAGINA;

export function isCacheGeldig(cache: ChatCache | null, periodStart: string): boolean {
  return cache !== null && cache.periodStart === periodStart;
}

/**
 * Snijdt de cache af op de nieuwste `CACHE_MAX` berichten.
 *
 * ⚠️ Een bovengrens en geen "alles bewaren". AsyncStorage is op web
 *    `localStorage` met een harde grens van een paar megabyte, gedeeld met de
 *    sessie van Supabase. Een chat die ongelimiteerd groeit, duwt op een dag de
 *    sessie eruit — en dan logt de app iemand uit omdat hij te veel gepraat heeft.
 */
export function beperkVoorCache(berichten: readonly ChatBericht[]): readonly ChatBericht[] {
  return berichten.length <= CACHE_MAX ? berichten : berichten.slice(-CACHE_MAX);
}
