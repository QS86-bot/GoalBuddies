import { z } from 'zod';

import { t, TALEN } from '../../shared/i18n';
import { isGeldigeTijdzone } from '../../shared/time';

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
/**
 * De ondergrens, als benoemde constante — QS8-234.
 *
 * ⚠️ **Dit getal staat hier én in het Supabase-dashboard, en die twee moeten
 *    hetzelfde zeggen.** Dit is Zod, in de browser. De server heeft zijn eigen
 *    `password_min_length` (standaard 6), en staat die lager, dan is dit getal
 *    een suggestie: één POST naar `/auth/v1/signup` met de anon-sleutel — die
 *    per definitie in elke bundel zit — omzeilt het volledig.
 *
 *    `npm run wachtwoord:controle` legt die twee naast elkaar. Verander dit
 *    getal dus niet zonder de schakelaar mee te nemen; de controle wordt
 *    daarop rood.
 *
 * ⚠️ Zod's `.min()` telt UTF-16-eenheden en Postgres telt codepunten, maar dat
 *    verschil valt hier de veilige kant op: `.length` is altijd ≥ het aantal
 *    codepunten, dus wie hier doorkomt heeft minstens zoveel tekens. Bij een
 *    ondergrens elders in deze codebase gaat dat juist mis — zie QS8-118.
 */
export const WACHTWOORD_MINIMUM = 12;

/** De bovengrens. bcrypt kapt boven 72 bytes af, dus daarboven telt niets meer. */
export const WACHTWOORD_MAXIMUM = 72;

export const wachtwoordSchema = z
  .string()
  .min(WACHTWOORD_MINIMUM, { error: () => t('validatie.wachtwoord_kort') })
  .max(WACHTWOORD_MAXIMUM, { error: () => t('validatie.wachtwoord_lang') });

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
// ⚠️ Beide kanten van de merge van 24-08: de toets komt uit `shared/time`
//    (QS8-27, correctheidsregel 7) en de melding uit de catalogus (QS8-115).
export const tijdzoneSchema = z
  .string()
  .refine(isGeldigeTijdzone, { error: () => t('validatie.tijdzone') });

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
  /**
   * De taalkeuze — QS8-115, criterium 4.
   *
   * ⚠️ **NULL betekent "nog niet gekozen" en niet "Nederlands".** Dat verschil
   *    staat in migratie 0061 en het is er een met gevolgen: bij NULL volgt de
   *    app het apparaat, en zodra er een waarde staat overstemt die keuze het
   *    apparaat. Zou hier `.default('nl')` staan, dan krijgt iemand met een
   *    Engelse telefoon bij zijn eerste start Nederlands.
   *
   * ⚠️ `TALEN` is hier de bron en de CHECK `profiles_locale_bekend` is een
   *    kopie ervan. Een taal erbij is dus altijd een migratie erbij — net als bij
   *    een nieuw type systeembericht. De comment op de kolom zegt dat ook.
   */
  locale: z.enum(TALEN, { error: () => t('validatie.taal') }).nullable(),
});

export type ProfielInvoer = z.infer<typeof profielSchema>;

/** Alleen de velden die je meestuurt worden bijgewerkt. */
export const profielPatchSchema = profielSchema.partial();

export type ProfielPatch = z.infer<typeof profielPatchSchema>;
