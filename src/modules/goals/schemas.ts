import { z } from 'zod';

import { type IsoDate } from '../../shared/time';

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

export const CATEGORIE_LABELS: Readonly<Record<Categorie, string>> = {
  business: 'Werk',
  study: 'Studie',
  other: 'Overig',
};

const isoDatum = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Gebruik een datum als 2026-12-31.' });

export const doelSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, { error: 'Geef je doel een naam van minstens drie tekens.' })
    .max(200, { error: 'Maximaal 200 tekens.' }),
  description: z.string().trim().max(2000, { error: 'Maximaal 2000 tekens.' }).nullable(),
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
    .max(200, { error: 'Hou het kort — één zin werkt het best.' })
    .nullable(),
  available_hours_per_week: z
    .number()
    .min(0)
    .max(168, { error: 'Een week heeft 168 uur.' })
    .nullable(),
});

export type DoelInvoer = z.infer<typeof doelSchema>;

export const doelPatchSchema = doelSchema.partial();
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
