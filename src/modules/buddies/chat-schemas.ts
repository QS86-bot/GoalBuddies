import { z } from 'zod';

import { t } from '../../shared/i18n';

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
    .min(1, { error: () => t('chat.leeg') })
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
  /**
   * ⚠️ De achtste en laatste gebeurtenis van 7.2, toegevoegd in migratie 0070
   *    (QS8-70). Het enige systeembericht **zonder persoonsnaam**: een
   *    ketting-mijlpaal is van de groep, en wie de schakel toevallig als laatste
   *    plaatste is geen gegeven dat iemand nodig heeft.
   *
   *    De mijlpaal is een rond cumulatief aantal schakels (10, 25, 50, …) en
   *    bewust geen "voltallig deze week" of "N weken op rij". Die twee zijn
   *    conditioneel: komt het bericht niet, dan weet de groep dát er iemand
   *    ontbrak. Een cumulatieve teller kan alleen stijgen, dus er bestaat geen
   *    uitblijvende mijlpaal om iets uit af te leiden. Onderbouwing in de kop van
   *    migratie 0070 en in `docs/decisions/002-domeinregel7-oppervlakken.md` §2,
   *    oppervlak 9.
   */
  'chain_milestone',
  /**
   * ⚠️ De elfde en twaalfde, toegevoegd in migratie 0076 (QS8-132, besluit A41).
   *    Ze gaan over de gróép en niet over een persoon: de zichtbaarheidskeuze is
   *    omgezet, van beschermd naar open of terug.
   *
   *    ⚠️ **Zonder deze twee zou het omzetten stilzwijgend zijn**, en dat is
   *       precies wat grens 3 van het besluit verbiedt. Een groep die opengaat,
   *       verandert met terugwerkende kracht wat er over de ándere leden
   *       zichtbaar wordt; het bericht is het moment waarop een lid kan besluiten
   *       zijn doel te ontkoppelen. Dit is dus geen aankondiging voor de vorm.
   *
   *    De zinnen noemen de beheerder en de nieuwe stand — geen doel, geen week,
   *    geen status.
   */
  'group_opened',
  'group_protected',
  /**
   * ⚠️ De dertiende, toegevoegd in migratie 0112 (QS8-79). Het enige
   *    systeembericht na `chain_milestone` dat **geen persoon** noemt — een
   *    seizoensrecap is van de groep, en de cijfers erin zijn groepstotalen
   *    zonder namen. Een ranglijst zou ook een lijst zijn van wie onderaan staat.
   */
  'season_recap',
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
  /**
   * De opgeslagen tekst.
   *
   * ⚠️ Bij een systeembericht is dit sinds migratie 0059 **niet** meer wat het
   *    scherm toont. De zin wordt gemaakt door `systeemberichtTekst()` uit
   *    `system_event` plus de namen hieronder; `body` is alleen nog de terugval
   *    voor rijen van vóór 0059 en voor een gebeurtenis die deze app niet kent.
   *    Gebruik voor een systeembericht dus nooit dit veld rechtstreeks.
   */
  readonly body: string;
  readonly type: string;
  readonly system_event: string | null;
  /** Over wie het systeembericht gaat. `null` bij een mensbericht. */
  readonly subject_name: string | null;
  /** Wie het veroorzaakte, als dat iemand anders is. Alleen bij `completion_approved`. */
  readonly actor_name: string | null;
  /**
   * Het enige getal dat een systeembericht mag dragen: de bereikte drempel van
   * De Ketting. `null` bij elk ander bericht.
   *
   * ⚠️ Komt uit `chat_messages.payload` en niet uit een telling in de app — het
   *    is de stand op het moment van de mijlpaal, en die is later niet meer te
   *    reconstrueren (migratie 0070 herstelt een gemiste melding met de drempel,
   *    niet met de stand van vandaag).
   *
   * ⚠️ `payload` is bewust de plek voor alles wat géén persoon is (migratie
   *    0059). Een persoon hoort er nóóit in: een uuid in jsonb heeft geen foreign
   *    key en overleeft dus een accountverwijdering.
   */
  readonly aantal: number | null;
  readonly created_at: string;
  /**
   * De losse getallen uit `payload`, voor een gebeurtenis die er meer dan één
   * draagt — QS8-79, vandaag alleen `season_recap`. `null` bij alle andere.
   */
  readonly getallen: Readonly<Record<string, number>> | null;
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
  /** Zie `CACHE_VERSIE`. Ontbreekt in caches van vóór migratie 0059. */
  readonly versie?: number;
}

/**
 * De vorm van een bewaard bericht. Hoog dit op zodra `ChatBericht` velden krijgt
 * waar het scherm op rekent.
 *
 * ⚠️ Waarom dit nodig is. De cache bewaart `ChatBericht` als kale JSON en leest
 *    hem terug met een cast — er is geen schema dat hem controleert. Sinds
 *    migratie 0059 rendert het scherm een systeembericht uit `subject_name` in
 *    plaats van uit `body`, en een bericht dat vóór die upgrade bewaard is, heeft
 *    dat veld niet. Zonder deze versie leest zo'n regel als "Een oud-lid doet
 *    mee" tot de eerste verversing: geen storing, wel een naam die een paar
 *    seconden onwaar is.
 */
export const CACHE_VERSIE = 2;

/** Hoeveel berichten er bewaard worden. Eén pagina is genoeg om iets te zien. */
export const CACHE_MAX = BERICHTEN_PER_PAGINA;

export function isCacheGeldig(cache: ChatCache | null, periodStart: string): boolean {
  return (
    cache !== null && cache.periodStart === periodStart && cache.versie === CACHE_VERSIE
  );
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
  const gesneden = berichten.length <= CACHE_MAX ? berichten : berichten.slice(-CACHE_MAX);
  return gesneden.map(zonderAvatar);
}

/**
 * Haalt de avatar uit een bericht dat de cache in gaat — migratie 0124.
 *
 * ⚠️ **Een ondertekende URL verloopt na een uur; de cache leeft een week.** Sinds
 *    0124 is de avatar-bucket privé, dus `sender_avatar` draagt in een geladen
 *    bericht een signed URL. Bewaren we die, dan toont het scherm na een uur geen
 *    avatar maar een *kapotte* avatar — `Avatar` valt alleen terug op initialen
 *    bij `null`, niet bij een URL die 400 teruggeeft.
 *
 *    Dit is dezelfde afweging als in `src/modules/auth/avatar.ts`: een verlopen
 *    URL is erger dan geen URL, want hij ziet er goed uit en doet het niet. De
 *    cache is er voor een slechte verbinding, en dan is een initiaal precies
 *    genoeg.
 */
function zonderAvatar(bericht: ChatBericht): ChatBericht {
  return bericht.sender_avatar === null ? bericht : { ...bericht, sender_avatar: null };
}
