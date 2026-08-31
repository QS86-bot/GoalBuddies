/**
 * Het voorgestelde plan wordt echte rijen — QS8-201.
 *
 * ⚠️ **Dit is de onbetrouwbare helft van de naad, en dat is met opzet gescheiden
 *    van `plan-rijen.ts`.** Daar staat het rekenwerk, puur en voedbaar; hier
 *    staat wat er misgaat als de database halverwege nee zegt.
 *
 * ⚠️ **Er is géén transactie, en dat is een gemeten beperking en geen
 *    slordigheid.** Doel, mijlpalen en weekdoel gaan elk via een eigen
 *    PostgREST-aanroep; er is aan clientkant niets dat die drie samenbindt. Een
 *    RPC zou dat wél kunnen en is de nette oplossing, maar dat is een migratie
 *    met een eigen afweging — zie het beslisdocument.
 *
 *    Wat hier daarom telt: **een halve uitkomst is een geldige toestand en geen
 *    corruptie.** Een doel zonder mijlpalen bestaat al sinds EPIC 2, en een doel
 *    met mijlpalen zonder lopend weekdoel ook. De gebruiker kan verder waar het
 *    ophield. Wat níét mag, is doen alsof alles gelukt is — vandaar dat de
 *    uitkomst telt wat er werkelijk staat in plaats van `ok: true` te zijn.
 */

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { localDateIn, now, type Cycle, type UserClock } from '../../shared/time';

import type { PlanRijen } from './plan-rijen';

export type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/**
 * Wat er van het plan werkelijk in de database staat.
 *
 * ⚠️ **`mijlpalen` en `weekdoel` zijn tellingen en geen vlaggen**, want "het is
 *    gelukt" is hier niet waar of onwaar. Het scherm heeft het verschil nodig
 *    tussen "alles staat er" en "je doel staat er, de rest niet" — anders stuurt
 *    het de gebruiker naar een hoofdscherm dat er leger uitziet dan hij net
 *    bevestigd heeft.
 */
export interface PlanUitkomst {
  readonly goalId: string;
  readonly mijlpalen: number;
  readonly weekdoel: boolean;
  /** Waren er mijlpalen of een weekdoel voorgesteld die het niet gehaald hebben? */
  readonly onvolledig: boolean;
}

/**
 * Schrijft het plan weg: eerst het doel, dan de mijlpalen, dan het weekdoel.
 *
 * ⚠️ **Die volgorde is de enige mogelijke** — een mijlpaal heeft een `goal_id`
 *    nodig en het weekdoel een `milestone_id`. Faalt het doel, dan is er niets
 *    en is dat een gewone fout. Faalt er iets daarná, dan staat het doel er wél
 *    en zegt de uitkomst dat.
 */
export async function pasPlanToe(
  userId: string,
  rijen: PlanRijen,
  klok: UserClock,
  eersteCyclus: Cycle | null,
): Promise<Uitkomst<PlanUitkomst>> {
  const { maakDoel } = await import('../goals');

  // ⚠️ "Vandaag" komt uit shared/time, in de tijdzone van deze gebruiker —
  //    correctheidsregel 7. Een doel voor morgen mag niet geweigerd worden omdat
  //    de server al over is.
  const vandaag = localDateIn(klok.tz, now());

  const doel = await maakDoel(
    userId,
    {
      title: rijen.doel.title,
      description: null,
      category: rijen.doel.category,
      target_date: rijen.doel.target_date,
      identity_statement: rijen.doel.identity_statement,
      // ⚠️ De uren per week zijn juist wat dit epic uit de trechter haalt: ze
      //    verhuizen naar "verfijnen", achteraf en optioneel. Hier bewust leeg
      //    en niet geraden — een geschat getal ziet er ingevuld uit en stuurt
      //    daarna de haalbaarheidstegenspraak.
      available_hours_per_week: null,
    },
    vandaag,
  );

  if (!doel.ok) return doel;

  const goalId = doel.waarde.id;
  const mijlpaalIds = await schrijfMijlpalen(goalId, rijen);
  const weekdoel = await schrijfWeekdoel(goalId, rijen, mijlpaalIds, klok, eersteCyclus);

  return {
    ok: true,
    waarde: {
      goalId,
      mijlpalen: mijlpaalIds.length,
      weekdoel,
      onvolledig:
        mijlpaalIds.length < rijen.mijlpalen.length || (rijen.weekdoel !== null && !weekdoel),
    },
  };
}

/**
 * Alle mijlpalen in één insert, en hun id's in de volgorde van het plan.
 *
 * ⚠️ **Eén aanroep en niet één per mijlpaal.** `maakMijlpaal()` leest per
 *    mijlpaal eerst de hoogste `order_index` en schrijft dan — dat is twee
 *    rondes per stuk, en bij twaalf mijlpalen vierentwintig aanroepen op het
 *    moment dat de gebruiker net op "zo is het goed" heeft getikt. Dat is de
 *    N+1 uit schaalbaarheidsregel 12, precies waar hij het meest opvalt.
 *    `order_index` komt hier uit `rijenUitPlan()` en hoeft dus niet gelezen.
 *
 * ⚠️ Faalt de insert, dan is dat nul mijlpalen en geen halve lijst: PostgREST
 *    voert één statement uit. Het doel blijft staan en de uitkomst meldt nul.
 */
async function schrijfMijlpalen(goalId: string, rijen: PlanRijen): Promise<readonly string[]> {
  if (rijen.mijlpalen.length === 0) return [];

  const { data, error } = await supabase()
    .from('milestones')
    .insert(rijen.mijlpalen.map((m) => ({ ...m, goal_id: goalId })))
    .select('id, order_index');

  if (error !== null || data === null) {
    reportError(error, 'plan.milestones', { goal_id: goalId, code: error?.code });
    return [];
  }

  // ⚠️ Op `order_index` sorteren en niet op de teruggegeven volgorde. PostgREST
  //    belooft die niet, en het weekdoel hangt aan mijlpaal 1 — pak je de
  //    verkeerde, dan staat de eerste week onder een stap die pas over drie
  //    maanden komt.
  return [...data]
    .sort((a, b) => a.order_index - b.order_index)
    .map((m) => m.id);
}

/** Het eerste weekdoel, onder de mijlpaal die het plan aanwijst. */
async function schrijfWeekdoel(
  goalId: string,
  rijen: PlanRijen,
  mijlpaalIds: readonly string[],
  klok: UserClock,
  eersteCyclus: Cycle | null,
): Promise<boolean> {
  const voorstel = rijen.weekdoel;
  if (voorstel === null) return false;

  const mijlpaalId = mijlpaalIds[voorstel.milestone_index];
  if (mijlpaalId === undefined) return false;

  const { maakWeekdoel } = await import('../goals');

  const uit = await maakWeekdoel(
    klok,
    {
      goal_id: goalId,
      milestone_id: mijlpaalId,
      title: voorstel.title,
      floor_text: voorstel.floor_text,
      ceiling_text: voorstel.ceiling_text,
    },
    eersteCyclus,
  );

  return uit.ok;
}

/** De melding bij een plan dat maar half geland is. */
export function onvolledigMelding(uitkomst: PlanUitkomst): string | null {
  if (!uitkomst.onvolledig) return null;
  return uitkomst.mijlpalen === 0
    ? t('coach.plan_zonder_mijlpalen')
    : t('coach.plan_zonder_weekdoel');
}
