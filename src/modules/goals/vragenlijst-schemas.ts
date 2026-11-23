import { z } from 'zod';

import { t, type Sleutel } from '../../shared/i18n';
import { telTekens } from '../../shared/tekst';

import { CATEGORIEEN, type Categorie } from './schemas';

/**
 * De korte vragenlijst — QS8-257, besluit A56, migratie 0143.
 *
 * ⚠️ **Vier vragen die bij de persóón horen en niet bij een doel.** Dat is het
 *    besluit uit QS8-224: de categorie hangt aan het doel, het focusgebied aan
 *    de persoon. Ze staan daarom op `profiles` en overleven het doel waarvoor je
 *    ze invulde.
 *
 * ⚠️ **Alles overslaan mag en wist niets.** Dat is acceptatiecriterium 4 van
 *    QS8-37 en het geldt hier onverkort: een lege vragenlijst is een geldige
 *    vragenlijst. Elk veld is daarom leeg toegestaan, en `patchUitVragenlijst()`
 *    laat een overgeslagen antwoord met rust in plaats van het op `null` te
 *    zetten.
 */

/** Maximaal drie, want vier focusgebieden is geen focus meer. */
export const MAX_FOCUSGEBIEDEN = 3;

/**
 * ⚠️ De vier waarden uit `profiles_minuten_geldig` (0143). Een kopie van die
 *    CHECK; `tests/rls/vragenlijst.test.ts` legt de twee naast elkaar.
 */
export const MINUTEN_OPTIES = [5, 15, 30, 60] as const;
export type Minuten = (typeof MINUTEN_OPTIES)[number];

export const MOMENTEN = ['morning', 'workday', 'evening', 'varies'] as const;
export type Moment = (typeof MOMENTEN)[number];

/**
 * Wat gewoontes eerder liet stuklopen.
 *
 * ⚠️ **Dit is het waardevolste veld van de vragenlijst.** Elk antwoord wijst
 *    naar machinerie die al gebouwd is — zie `valkuilAntwoord()`. Habit Huddle
 *    stelt hiermee een prompt bij; wij leggen er ons verschil mee uit, in de
 *    woorden van de gebruiker zelf.
 */
export const VALKUILEN = [
  'forget',
  'motivation_drops',
  'all_or_nothing',
  'nobody_notices',
  'life_chaotic',
] as const;
export type Valkuil = (typeof VALKUILEN)[number];

/**
 * Hoe wil je je voelen — de vijfde vraag, QS8-733, migratie 0311.
 *
 * ⚠️ **Zes voorstellen en een eigen omschrijving, en ze doen niet hetzelfde.** Een
 *    voorstel stuurt de tekst van de dagelijkse herinnering; de eigen
 *    omschrijving staat alleen op het eigen scherm (besluit Quinten, 19-11-2026)
 *    en komt nooit letterlijk in een melding of bericht. Beide zijn alleen voor
 *    de eigenaar leesbaar (domeinregel 7).
 *
 * ⚠️ `GEVOELENS` is een kopie van `profiles_feeling_bekend` én van
 *    `GEVOELENS` in `src/modules/notifications/regels.ts` (dat bestand wordt
 *    naar de Edge Function gekopieerd en mag niets importeren).
 *    `tests/beloftes/gevoelsregels.test.ts` en `tests/rls/gevoel.test.ts` leggen
 *    ze naast elkaar.
 */
export const GEVOELENS = [
  'calm',
  'motivated',
  'proud',
  'supported',
  'energetic',
  'focused',
] as const;
export type Gevoel = (typeof GEVOELENS)[number];

/**
 * ⚠️ Geteld met `telTekens()` (codepunten) en niet met `.length`, want de
 *    database telt `char_length`: dezelfde grens staat in `profiles_feeling_own_len`
 *    (0311). Een emoji is hier één teken, en dat mag: de gebruiker typt wat hij wil.
 */
export const MAX_EIGEN_GEVOEL = 60;

/**
 * De eigen omschrijving zoals hij naar de database gaat: getrimd, of `null` als er
 * niets overblijft. ⚠️ Een lege tekst is geen omschrijving en wordt nooit
 * geschreven; de CHECK weigert hem ook.
 */
export function eigenGevoelSchoon(tekst: string | null | undefined): string | null {
  const schoon = (tekst ?? '').trim();
  return schoon === '' ? null : schoon;
}

/** De vijf vragenlijstvelden zoals ze op het profiel of in het formulier staan. */
export interface VragenlijstVelden {
  readonly focus_areas?: readonly string[] | null | undefined;
  readonly minutes_per_day?: number | null | undefined;
  readonly when_i_do_it?: string | null | undefined;
  readonly what_breaks_it?: readonly string[] | null | undefined;
  readonly feeling?: string | null | undefined;
  readonly feeling_own?: string | null | undefined;
}

/**
 * Welke van de vijf vragen een antwoord hebben — de énige plek die dat bepaalt.
 *
 * ⚠️ **Twee lezers, één lezing (QS8-805).** De vragenlijst kiest hiermee zijn
 *    beginstap, en de kaart op Vandaag of iemand de vragenlijst oversloeg. Telden ze
 *    verschillend, dan kon de kaart iemand naar een vragenlijst sturen die op de
 *    samenvatting opent, of iemand met antwoorden blijven vragen.
 *
 * ⚠️ Een eigen omschrijving van het gevoel (vraag 5b) is een antwoord op vraag 5. Leeg
 *    of alleen spaties is overslaan, zoals `patchUitVragenlijst` het ook leest.
 */
export function beantwoordeVragen(v: VragenlijstVelden): {
  readonly focus: boolean;
  readonly tijd: boolean;
  readonly moment: boolean;
  readonly valkuil: boolean;
  readonly gevoel: boolean;
} {
  return {
    focus: (v.focus_areas ?? []).length > 0,
    tijd: (v.minutes_per_day ?? null) !== null,
    moment: (v.when_i_do_it ?? null) !== null,
    valkuil: (v.what_breaks_it ?? []).length > 0,
    gevoel: (v.feeling ?? null) !== null || eigenGevoelSchoon(v.feeling_own) !== null,
  };
}

/**
 * Heeft iemand minstens één vraag beantwoord? Nee betekent: hij oversloeg de
 * vragenlijst (besluit QS8-805: geen van de vijf antwoorden op het profiel).
 */
export function heeftVragenlijstAntwoord(v: VragenlijstVelden): boolean {
  return Object.values(beantwoordeVragen(v)).some(Boolean);
}

export const eigenGevoelSchema = z
  .string()
  .refine((tekst) => telTekens(tekst.trim()) <= MAX_EIGEN_GEVOEL, {
    error: () => t('vragenlijst.gevoel.eigen_te_lang', { max: MAX_EIGEN_GEVOEL }),
  });

export const vragenlijstSchema = z.object({
  /** 1. Waar wil je je op richten? Maximaal drie. */
  focus_areas: z
    .array(z.enum(CATEGORIEEN))
    .max(MAX_FOCUSGEBIEDEN, { error: () => t('validatie.focus_te_veel') })
    .default([]),
  /** 2. Hoeveel tijd kun je eerlijk geven, op een gewone dag? */
  minutes_per_day: z
    .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)])
    .nullable()
    .default(null),
  /** 3. Wanneer ga je het echt doen? */
  when_i_do_it: z.enum(MOMENTEN).nullable().default(null),
  /** 4. Wat laat jouw gewoontes normaal gesproken stuklopen? */
  what_breaks_it: z.array(z.enum(VALKUILEN)).default([]),
  /** 5. Hoe wil je je voelen? Een van zes voorstellen, of niets. */
  feeling: z.enum(GEVOELENS).nullable().default(null),
  /** 5b. Of in je eigen woorden. Alleen op je eigen scherm. */
  feeling_own: eigenGevoelSchema.nullable().default(null),
});

/**
 * ⚠️ `z.input` en niet `z.infer`. Met `.default()` maakt de uitvoer elk veld
 *    verplicht, en dan moet elke aanroeper een compleet object samenstellen voor
 *    een formulier dat juist over overslaan gaat.
 */
export type VragenlijstInvoer = z.input<typeof vragenlijstSchema>;

/** Welke van de twee gevoelskolommen de gebruiker bewust leegmaakte. */
export interface GevoelWissen {
  readonly feeling?: boolean;
  readonly feeling_own?: boolean;
}

/** Een vragenlijst waarin alles is overgeslagen. Geldig, en dat is het punt. */
export const LEGE_VRAGENLIJST: Required<VragenlijstInvoer> = {
  focus_areas: [],
  minutes_per_day: null,
  when_i_do_it: null,
  what_breaks_it: [],
  feeling: null,
  feeling_own: null,
};

/**
 * Wat er van de vragenlijst naar `profiles` gaat.
 *
 * ⚠️ **Een overgeslagen antwoord overschrijft niets** — dezelfde regel als
 *    `spiegelpatch()` in `interview-schemas.ts`. Wie de vragenlijst een tweede
 *    keer opent en een vraag overslaat, houdt zijn eerdere antwoord. Zou een lege
 *    lijst alles op `null` zetten, dan wist "overslaan" stilletjes gegevens, en
 *    dat is niet wat overslaan betekent.
 */
export function patchUitVragenlijst(
  invoer: VragenlijstInvoer,
  wis: GevoelWissen = {},
): {
  focus_areas?: Categorie[];
  minutes_per_day?: Minuten;
  when_i_do_it?: Moment;
  what_breaks_it?: Valkuil[];
  feeling?: Gevoel | null;
  feeling_own?: string | null;
} {
  const patch: Record<string, unknown> = {};

  // ⚠️ Gekopieerd en niet doorgegeven: `updateProfiel()` neemt een muteerbare
  //    array aan, en een gedeelde verwijzing zou betekenen dat een latere
  //    wijziging in het formulier de al verstuurde patch verandert.
  if ((invoer.focus_areas ?? []).length > 0) patch.focus_areas = [...(invoer.focus_areas ?? [])];
  if ((invoer.minutes_per_day ?? null) !== null) patch.minutes_per_day = invoer.minutes_per_day;
  if ((invoer.when_i_do_it ?? null) !== null) patch.when_i_do_it = invoer.when_i_do_it;
  if ((invoer.what_breaks_it ?? []).length > 0) {
    patch.what_breaks_it = [...(invoer.what_breaks_it ?? [])];
  }
  if ((invoer.feeling ?? null) !== null) patch.feeling = invoer.feeling;
  // ⚠️ Getrimd en nooit leeg: een leeg veld is overslaan en wist niets.
  const eigen = eigenGevoelSchoon(invoer.feeling_own);
  if (eigen !== null) patch.feeling_own = eigen;

  // ⚠️ **Weghalen is een handeling en overslaan niet.** Alleen als de gebruiker een eerder
  //    gezet gevoel of motto expliciet leegmaakt, gaat er `null` mee; een overgeslagen
  //    vraag blijft met rust (QS8-37, criterium 4).
  if (wis.feeling === true && (invoer.feeling ?? null) === null) patch.feeling = null;
  if (wis.feeling_own === true && eigen === null) patch.feeling_own = null;

  return patch;
}

/**
 * Minuten per dag omgerekend naar uren per week.
 *
 * ⚠️ **De enige plek waar deze omrekening staat, en dat is met opzet.** De
 *    vragenlijst vraagt naar een gewone dág ("niet je beste dag"); het interview
 *    en `goals.available_hours_per_week` gaan over een wéék. Dat zijn twee
 *    vragen en geen twee kolommen voor hetzelfde — maar ze hangen samen, en zonder
 *    één bron zou elke plek zijn eigen deling maken.
 *
 * ⚠️ **En het scherm toont de uitkomst voordat hij landt.** Een stille conversie
 *    is een getal verzinnen namens iemand anders; hier is het een voorstel dat de
 *    gebruiker kan wijzigen. Vandaar dat dit een gewone functie is en geen
 *    trigger.
 *
 * ⚠️ Eén decimaal, want `goals.available_hours_per_week` is `numeric(4,1)`.
 *    Afronden op hele uren zou 5 minuten per dag op 1 uur per week zetten, en
 *    dan liegt het voorstel de goede kant op.
 */
export function urenPerWeekUitMinuten(minuten: number | null): number | null {
  if (minuten === null || !Number.isFinite(minuten) || minuten <= 0) return null;
  return Math.round(((minuten * 7) / 60) * 10) / 10;
}

/**
 * Wat de app te bieden heeft tegen deze valkuil.
 *
 * ⚠️ **Dit is de kern van vraag 4 en het is bewust géén schakelaar.** Elk
 *    antwoord wijst naar machinerie die al bestaat: de vloer, de weekpas,
 *    peer-goedkeuring, de adempauze. Het scherm laat zien wát dat is en waar het
 *    zit.
 *
 * ⚠️ **Er wordt niets stilzwijgend aangezet.** Domeinregel 5 gaat over
 *    commitment devices, maar de gedachte erachter is breder: een app die op
 *    grond van één antwoord ongevraagd gedrag aanzet, is een app die iets doet
 *    wat je niet gevraagd hebt. Wat hier gebeurt is uitleggen en aanwijzen.
 *
 * ⚠️ `forget` wijst naar herinneringen, en die staan in EPIC 11 en zijn nog niet
 *    gebouwd. De tekst belooft daarom niets wat er niet is — hij zegt wat er
 *    komt, en dat is iets anders dan doen alsof het er al is.
 */
export function valkuilAntwoord(valkuil: Valkuil): {
  readonly kop: string;
  readonly antwoord: string;
  /** Waar dit in de app zit, of `null` als het er nog niet is. */
  readonly route: string | null;
} {
  return {
    kop: t(`valkuil.${valkuil}` as Sleutel),
    antwoord: t(`valkuil.${valkuil}.antwoord` as Sleutel),
    route: ROUTES[valkuil],
  };
}

/**
 * ⚠️ Geen `t()` hier: een route is geen tekst. `null` betekent "bestaat nog
 *    niet" en het scherm toont dan geen knop — een knop naar een scherm dat er
 *    niet is, is erger dan geen knop.
 */
const ROUTES: Readonly<Record<Valkuil, string | null>> = {
  forget: null,
  motivation_drops: '/doelen',
  all_or_nothing: '/doelen',
  nobody_notices: '/groep',
  life_chaotic: '/doelen',
};

/** Zie `categorieLabels()`: een functie, want de taal ligt niet vast op importtijd. */
export function minutenLabels(): Readonly<Record<Minuten, string>> {
  return {
    5: t('vragenlijst.minuten.5'),
    15: t('vragenlijst.minuten.15'),
    30: t('vragenlijst.minuten.30'),
    60: t('vragenlijst.minuten.60'),
  };
}

export function momentLabels(): Readonly<Record<Moment, string>> {
  return {
    morning: t('vragenlijst.moment.morning'),
    workday: t('vragenlijst.moment.workday'),
    evening: t('vragenlijst.moment.evening'),
    varies: t('vragenlijst.moment.varies'),
  };
}

export function valkuilLabels(): Readonly<Record<Valkuil, string>> {
  return {
    forget: t('valkuil.forget'),
    motivation_drops: t('valkuil.motivation_drops'),
    all_or_nothing: t('valkuil.all_or_nothing'),
    nobody_notices: t('valkuil.nobody_notices'),
    life_chaotic: t('valkuil.life_chaotic'),
  };
}

/** Zie `categorieLabels()`: een functie, want de taal ligt niet vast op importtijd. */
export function gevoelLabels(): Readonly<Record<Gevoel, string>> {
  return {
    calm: t('vragenlijst.gevoel.calm'),
    motivated: t('vragenlijst.gevoel.motivated'),
    proud: t('vragenlijst.gevoel.proud'),
    supported: t('vragenlijst.gevoel.supported'),
    energetic: t('vragenlijst.gevoel.energetic'),
    focused: t('vragenlijst.gevoel.focused'),
  };
}
