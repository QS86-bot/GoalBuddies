import { z } from 'zod';

import { t, TALEN } from '../../shared/i18n';
import { telTekens } from '../../shared/tekst';
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
 * Acht tekens en geen tekenklassen. Dat is bewust: verplichte hoofdletters en
 * leestekens leveren `Welkom123!` op, en dat is zwakker dan een lange zin. NIST
 * beveelt lengte boven samenstelling aan sinds 2017.
 *
 * ⚠️ Controle tegen bekende gelekte wachtwoorden doet Supabase Auth zelf.
 *    **Die staat op dit project uit** — QS8-141, en `adviseur-controle.mjs`
 *    onderdrukt de bijbehorende lint met precies die reden.
 */
/**
 * De ondergrens, als benoemde constante — QS8-234.
 *
 * ⚠️ **Op 06-09-2026 van twaalf naar acht — QS8-216, een besluit van Quinten.**
 *    Acht is waar NIST op uitkomt en waar Supabase Auth mee overweg kan.
 *
 * ⚠️ **Wat die verlaging kost, en waarom dat hier met zoveel woorden staat.**
 *    Bij twaalf hield de lengte alléén de dichtstbevolkte hoek van elke
 *    gelekte-wachtwoordenlijst buiten de deur: `password`, `12345678` en
 *    `iloveyou` zijn allemaal precies acht. Vanaf acht doet lengte dat werk
 *    niet meer, en het enige dat het overneemt is de leaked-password protection
 *    uit QS8-141 — **en die staat vandaag uit.** Zolang dat zo is draagt niets
 *    deze verlaging; er is een slot vervangen door een slot dat nog in de doos
 *    ligt. Dat is geen reden om het besluit terug te draaien, wel om QS8-216
 *    niet te sluiten voordat QS8-141 om is.
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
 */
export const WACHTWOORD_MINIMUM = 8;

/** De bovengrens. bcrypt kapt boven 72 bytes af, dus daarboven telt niets meer. */
export const WACHTWOORD_MAXIMUM = 72;

/**
 * ⚠️ **De ondergrens telt codepunten en niet UTF-16-eenheden, en dat is geen
 *    detail.** Hier stond `.min(WACHTWOORD_MINIMUM)`, met de aantekening dat
 *    het verschil "de veilige kant op valt". Dat was omgekeerd. `.length` is
 *    altijd ≥ het aantal codepunten, dus een client die in UTF-16 telt laat
 *    juist dóór wat een server die codepunten telt weigert — precies wat
 *    CLAUDE.md bij QS8-118 over een óndergrens zegt.
 *
 *    Gemeten: `😀😀😀😀` is vier tekens en acht UTF-16-eenheden, en passeerde
 *    `.min(8)` moeiteloos. In codepunten was de verlaging van QS8-216 dus geen
 *    12 → 8 maar 6 → 4. Met `telTekens()` is acht ook echt acht.
 *
 * ⚠️ **De bovengrens is hier bewust níét meeveranderd**, en dat is een bekende
 *    onvolkomenheid en geen omissie: bcrypt kapt op 72 **bytes**, en 36 emoji
 *    zijn 72 UTF-16-eenheden maar 144 bytes. Die staat als rij in
 *    `docs/ENGINEER-REVIEW.md`; hem hier repareren vraagt een bytetelling en
 *    een eigen melding, en dat is een ander issue dan dit.
 */
export const wachtwoordSchema = z
  .string()
  .max(WACHTWOORD_MAXIMUM, { error: () => t('validatie.wachtwoord_lang') })
  .refine((w) => telTekens(w) >= WACHTWOORD_MINIMUM, {
    error: () => t('validatie.wachtwoord_kort'),
  });

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

  /**
   * De vier antwoorden uit de korte vragenlijst — QS8-257, migratie 0143.
   *
   * ⚠️ **De vorm staat hier, de betekenis in `vragenlijst-schemas.ts`.** Dit
   *    schema bewaakt wat er in de kolom past; welke gebieden er bestaan en wat
   *    een valkuil betekent, hoort bij de doelenmodule. Zou de lijst hier ook
   *    staan, dan zijn er twee.
   *
   * ⚠️ Losse `z.string()` en geen `z.enum()`: de allowlists zijn CHECKs in 0143
   *    en 0142, en die worden aan de doelenkant getoetst. Een tweede kopie hier
   *    zou een derde plek zijn die uit de pas kan lopen.
   */
  focus_areas: z.array(z.string()).max(3, { error: () => t('validatie.focus_te_veel') }),
  minutes_per_day: z.number().int().positive().nullable(),
  when_i_do_it: z.string().nullable(),
  what_breaks_it: z.array(z.string()),
});

export type ProfielInvoer = z.infer<typeof profielSchema>;

/** Alleen de velden die je meestuurt worden bijgewerkt. */
export const profielPatchSchema = profielSchema.partial();

export type ProfielPatch = z.infer<typeof profielPatchSchema>;
