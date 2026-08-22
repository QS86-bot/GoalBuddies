import { z } from 'zod';

import { t } from '../../shared/i18n';

/**
 * De invoer van de authenticatie- en profielschermen.
 *
 * ⚠️ CLAUDE.md, beveiligingsregel 3: alle input gevalideerd met Zod. Deze
 *    schema's draaien in de client vóór het versturen — dat is voor de gebruiker,
 *    niet voor de beveiliging. De echte grens ligt in de database: constraints,
 *    triggers en RLS. Wat hier gecontroleerd wordt, wordt daar nóg een keer
 *    gecontroleerd, en dat is geen dubbel werk maar het verschil tussen een
 *    foutmelding en een gat.
 */

/**
 * Wachtwoordeisen.
 *
 * Twaalf tekens en geen tekenklassen. Dat is bewust: verplichte hoofdletters en
 * leestekens leveren `Welkom123!` op, en dat is zwakker dan een lange zin. NIST
 * beveelt lengte boven samenstelling aan sinds 2017.
 *
 * ⚠️ Controle tegen bekende gelekte wachtwoorden doet Supabase Auth zelf, maar
 *    die stond op dit project uit. Zie docs/Q-TODO.docx.
 */
export const wachtwoordSchema = z
  .string()
  .min(12, { error: () => t('validatie.wachtwoord_kort') })
  .max(72, { error: () => t('validatie.wachtwoord_lang') });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: () => t('validatie.email') }));

export const aanmeldenSchema = z.object({
  email: emailSchema,
  wachtwoord: wachtwoordSchema,
});

export type AanmeldenInvoer = z.infer<typeof aanmeldenSchema>;

/** Inloggen stelt geen eisen aan het wachtwoord: dat is al ooit geaccepteerd. */
export const inloggenSchema = z.object({
  email: emailSchema,
  wachtwoord: z.string().min(1, { error: () => t('validatie.wachtwoord_leeg') }),
});

export type InloggenInvoer = z.infer<typeof inloggenSchema>;

/** 0 = zondag … 6 = zaterdag. Zelfde nummering als Postgres en `shared/time`. */
export const weekdagSchema = z
  .number()
  .int()
  .min(0)
  .max(6, { error: () => t('validatie.weekdag') });

/**
 * Een IANA-tijdzone. Niet tegen een lijst gecontroleerd maar tegen `Intl` zelf —
 * die lijst verandert een paar keer per jaar en een eigen kopie loopt achter.
 */
export const tijdzoneSchema = z.string().refine(
  (waarde) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: waarde });
      return true;
    } catch {
      return false;
    }
  },
  { error: () => t('validatie.tijdzone') },
);

export const profielSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(1, { error: () => t('validatie.naam_leeg') })
    .max(80, { error: () => t('validatie.naam_lang') }),
  week_start_day: weekdagSchema,
  tz: tijdzoneSchema,
  // `HH:MM` of `HH:MM:SS`; Postgres `time` slikt allebei.
  reminder_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, { error: () => t('validatie.tijd') })
    .nullable(),
  reminder_enabled: z.boolean(),
  reminder_tone: z.enum(['gentle', 'firm']),
  share_moves_by_default: z.boolean(),
});

export type ProfielInvoer = z.infer<typeof profielSchema>;

/** Alleen de velden die je meestuurt worden bijgewerkt. */
export const profielPatchSchema = profielSchema.partial();

export type ProfielPatch = z.infer<typeof profielPatchSchema>;
