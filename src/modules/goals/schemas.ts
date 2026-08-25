import { z } from 'zod';

import { t } from '../../shared/i18n';

import { isGeldigeIsoDatum, type IsoDate } from '../../shared/time';

/**
 * De invoer van de doelschermen.
 *
 * ⚠️ De streefdatum is het gevoeligste veld van dit formulier. Hij voedt de
 *    Risico-radar (EPIC 12) én het moment waarop een straf verschuldigd wordt
 *    (domeinregel 11). Een datum in het verleden zou allebei meteen laten
 *    afgaan.
 */

export const CATEGORIEEN = ['business', 'study', 'other'] as const;
export type Categorie = (typeof CATEGORIEEN)[number];

/** Zie de andere meldingentabellen: een functie, want de taal ligt niet vast op importtijd. */
export function categorieLabels(): Readonly<Record<Categorie, string>> {
  return {
    business: t('categorie.business'),
    study: t('categorie.study'),
    other: t('categorie.other'),
  };
}

/**
 * ⚠️ Geëxporteerd sinds de deadline-verzoeken van A7. Die hadden hun eigen veld
 *    zonder formaatcontrole, en dat is niet zichtbaar fout: `datumLigtInDeToekomst`
 *    vergelijkt strings, en `'morgen' > '2026-08-18'` is gewoon waar. Het
 *    formulier liet zo'n waarde dus door, waarna Postgres struikelde over de cast
 *    en de gebruiker een storingsmelding kreeg voor een tikfout — nadat hij zijn
 *    argument al had getypt. Eén schema voor alle datumvelden.
 */
export const isoDatum = z
  .string()
  .trim()
  .refine(isGeldigeIsoDatum, { error: () => t('validatie.datum_vorm') });

export const doelSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: () => t('validatie.doeltitel_kort') })
    .max(200, { error: () => t('validatie.doeltitel_lang') }),
  description: z.string().trim().max(2000, { error: () => t('validatie.omschrijving_lang') }).nullable(),
  category: z.enum(CATEGORIEEN),
  target_date: isoDatum,
  /**
   * ⚠️ Prominent, niet weggestopt. Bij een doel van zes maanden is identiteit de
   *    enige brandstof die zo lang meegaat — zie QS8-36 en voorstel §1.5.
   *    Optioneel blijft het wel: verplicht stellen levert ingevulde onzin op.
   */
  identity_statement: z
    .string()
    .trim()
    .max(200, { error: () => t('validatie.identiteit_lang') })
    .nullable(),
  available_hours_per_week: z
    .number()
    .min(0)
    .max(168, { error: () => t('validatie.uren_max') })
    .nullable(),
});

export type DoelInvoer = z.infer<typeof doelSchema>;

/**
 * ⚠️ `target_date` staat hier bewust níét in, en op typeniveau niet in plaats van
 *    stilzwijgend genegeerd. `wijzigDoel()` bouwde zijn UPDATE met de hand en
 *    liet die kolom eruit, dus een aanroeper die hem meestuurde kreeg `ok: true`
 *    terug terwijl de datum niet opgeslagen was. Vandaag heeft die functie nog
 *    geen scherm; de eerste die er een bouwt en het formulier van het
 *    aanmaakscherm hergebruikt, loopt er zo in.
 *
 *    Verschuiven loopt sinds Q-TODO A7 via `zetStreefdatum()` of via een verzoek
 *    aan de groep. Dat hoort een compilerfout te zijn en geen stille verrassing.
 */
export const doelPatchSchema = doelSchema.omit({ target_date: true }).partial();
export type DoelPatch = z.infer<typeof doelPatchSchema>;

/**
 * Ligt de streefdatum in de toekomst?
 *
 * ⚠️ Losse functie en geen `.refine()` op het schema, omdat "vandaag" van de
 *    klok van de gebruiker afhangt en `shared/time` de enige plek is die dat
 *    mag bepalen (CLAUDE.md, correctheidsregel 7). Een schema dat zelf
 *    `new Date()` aanroept, rekent in de tijdzone van de server.
 */
export function datumLigtInDeToekomst(datum: string, vandaag: IsoDate): boolean {
  return datum > vandaag;
}

/**
 * De levensloop van een doel. Spiegelt de CHECK `goals_status_valid`.
 *
 * ⚠️ **`missed` stond hier tot 25-08-2026 en is er met een migratie uit gehaald**
 *    (0082), niet omdat hij hinderde maar omdat hij een lek wás zodra iemand hem
 *    zou vullen: groepsgenoten lezen deze kolom via `goals_select`, en RLS kan
 *    geen kolommen beperken. Een tegenslagwaarde hier is domeinregel 7 die de
 *    database uit loopt.
 *
 * ⚠️ **Deze lijst is een kopie en geen bron.** `tests/rls/policies.test.ts`
 *    vergelijkt hem met de CHECK zelf, in beide richtingen — want de vorige keer
 *    dat twee zulke lijsten uit elkaar liepen (0032/0034), vergeleek de test de
 *    app-lijst met zichzelf en bleef groen.
 */
/**
 * De gebeurtenissen in de audittrail van een doel. Spiegelt de CHECK
 * `goal_events_type_valid`.
 *
 * ⚠️ **`scope_reduced` en `milestone_dropped` stonden hier tot 25-08-2026 en zijn
 *    er met een migratie uit gehaald** (0087). Groepsgenoten lezen deze tabel via
 *    `goal_events_select`, en dat zijn tegenslagsignalen over iemand anders —
 *    domeinregel 7. `milestone_dropped` stond bovendien al op
 *    `VERBODEN_GEBEURTENISSEN` in `chat-schemas.ts`: de ene kant van de app zei
 *    "de groep hoort dit nooit te zien" terwijl de andere het via een SELECT
 *    uitgaf.
 *
 * ⚠️ **`deadline_moved` blijft, en dat is geen inconsequentie:** die vraag je
 *    zelf aan en een buddy keurt hem goed (A7, verruiming §4a).
 *
 * ⚠️ **Deze lijst is een kopie en geen bron.** `tests/rls/policies.test.ts`
 *    vergelijkt hem met de CHECK zelf, in beide richtingen.
 */
export const DOELGEBEURTENISSEN = [
  'created',
  'deadline_moved',
  'archived',
  'completed',
] as const;
export type Doelgebeurtenis = (typeof DOELGEBEURTENISSEN)[number];

/**
 * Wat een client zelf mag wegschrijven.
 *
 * ⚠️ `deadline_moved` staat er bewust niet bij: die schrijft
 *    `beslis_deadline_verzoek()`, en hij is de enige gebeurtenis die een uitspraak
 *    over een ánder mens draagt ("een buddy ging akkoord"). De policy
 *    `goal_events_insert` dwingt dezelfde grens af — dit is de kopie, niet de bron.
 */
export const DOELGEBEURTENISSEN_CLIENT = ['created', 'archived', 'completed'] as const;
export type DoelgebeurtenisClient = (typeof DOELGEBEURTENISSEN_CLIENT)[number];

export const STATUSSEN = ['active', 'completed', 'archived'] as const;
export type DoelStatus = (typeof STATUSSEN)[number];
