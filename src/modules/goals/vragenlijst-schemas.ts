import { z } from 'zod';

import { t, type Sleutel } from '../../shared/i18n';

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
});

/**
 * ⚠️ `z.input` en niet `z.infer`. Met `.default()` maakt de uitvoer elk veld
 *    verplicht, en dan moet elke aanroeper een compleet object samenstellen voor
 *    een formulier dat juist over overslaan gaat.
 */
export type VragenlijstInvoer = z.input<typeof vragenlijstSchema>;

/** Een vragenlijst waarin alles is overgeslagen. Geldig, en dat is het punt. */
export const LEGE_VRAGENLIJST: Required<VragenlijstInvoer> = {
  focus_areas: [],
  minutes_per_day: null,
  when_i_do_it: null,
  what_breaks_it: [],
};

/** Heeft deze vragenlijst iets opgeleverd? */
export function heeftVragenlijstAntwoorden(invoer: VragenlijstInvoer): boolean {
  return (
    (invoer.focus_areas ?? []).length > 0 ||
    (invoer.minutes_per_day ?? null) !== null ||
    (invoer.when_i_do_it ?? null) !== null ||
    (invoer.what_breaks_it ?? []).length > 0
  );
}

/**
 * Wat er van de vragenlijst naar `profiles` gaat.
 *
 * ⚠️ **Een overgeslagen antwoord overschrijft niets** — dezelfde regel als
 *    `spiegelpatch()` in `interview-schemas.ts`. Wie de vragenlijst een tweede
 *    keer opent en een vraag overslaat, houdt zijn eerdere antwoord. Zou een lege
 *    lijst alles op `null` zetten, dan wist "overslaan" stilletjes gegevens, en
 *    dat is niet wat overslaan betekent.
 */
export function patchUitVragenlijst(invoer: VragenlijstInvoer): {
  focus_areas?: Categorie[];
  minutes_per_day?: Minuten;
  when_i_do_it?: Moment;
  what_breaks_it?: Valkuil[];
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
