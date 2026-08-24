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

export const STATUSSEN = ['active', 'completed', 'archived', 'missed'] as const;
export type DoelStatus = (typeof STATUSSEN)[number];
