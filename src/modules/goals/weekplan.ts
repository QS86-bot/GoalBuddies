import { t } from '../../shared/i18n';

import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { cyclesBetween, type Cycle, type UserClock } from '../../shared/time';
import { invoerfout, type Resultaat } from '../../shared/api';

import { huidigeCyclus } from './cycles';
import { eersteCyclusVanDoel } from './weekly';

import {
  meldingBijReden,
  weekplanSchema,
  weekplanstapSchema,
  type WeekplanInvoer,
  type WeekplanstapInvoer,
} from './weekplan-schemas';

/**
 * Het weekplan — QS8-203, migratie 0137.
 *
 * Een geplande stap is nog géén weekdoel. Hij telt niet mee in `max_points`,
 * levert geen punten op en kan geen minpunt kosten. Pas als de rollover hem
 * inschuift — of als de eigenaar op "start deze nu" drukt — ontstaat er een rij
 * in `weekly_goals` en gelden alle bestaande regels.
 *
 * ⚠️ Geen enkele functie hier rekent zelf een week uit. `startNu()` haalt de
 *    cyclus uit `shared/time` en stuurt hem mee, precies zoals `maakWeekdoel()`
 *    en `schuifDoor()` dat doen (correctheidsregel 7).
 *
 * ⚠️ **Dit is privé en het hoort nergens op een groepsscherm.** De policies in
 *    0137 zijn eigenaar-only zonder tak voor groepsgenoten, ook in een open
 *    groep (A41). De filters hieronder zijn leesbaarheid voor de volgende lezer;
 *    de afdwinging zit in RLS.
 */

export type Weekplanstap = Tables<'weekly_plan_steps'>;

/**
 * ⚠️ Sorteren op drie kolommen en niet op één. `order_index` is niet uniek per
 *    doel, dus bij een gelijkspel bepaalt het queryplan de volgorde — en dan
 *    geeft dezelfde data twee keer een ander antwoord. `activeer_weekplanstap()`
 *    in 0137 sorteert om dezelfde reden op dezelfde drie.
 */
function opVolgorde<T extends { order_index: number; created_at: string; id: string }>(
  rijen: readonly T[],
): readonly T[] {
  return [...rijen].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * De nog niet verbruikte stappen van één doel, in de volgorde waarin ze
 * ingeschoven worden.
 */
export async function fetchWeekplan(goalId: string): Promise<readonly Weekplanstap[]> {
  const { data, error } = await supabase()
    .from('weekly_plan_steps')
    .select('*')
    .eq('goal_id', goalId)
    .is('activated_cycle', null)
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    reportError(error, 'weekplan.list', { goal_id: goalId, code: error.code });
    throw new Error(t('weekplan.laden_mislukt'));
  }

  return opVolgorde((data ?? []) as Weekplanstap[]);
}

/**
 * De weekdoelen van deze cyclus die uit een plan zijn ingeschoven — voor de
 * melding op het hoofdscherm.
 *
 * ⚠️ Dit is de tegenhanger van de eis in QS8-203: *automatisch inschuiven mag
 *    nooit stilzwijgend het puntenplafond verhogen zonder dat de gebruiker het
 *    ziet.* Een weekdoel dat er zonder handeling bij komt staan, is anders niet
 *    van een zelfgemaakt weekdoel te onderscheiden — en dan is de score
 *    veranderd zonder dat iemand iets deed.
 *
 * ⚠️ Eén query en geen lus over de weekdoelen. Onwrikbare regel 12: het
 *    hoofdscherm toont álle doelen, dus een query per doel is hier de klassieke
 *    N+1.
 */
export async function fetchIngeschovenDezeCyclus(
  cyclus: Cycle,
): Promise<ReadonlySet<string>> {
  const { data, error } = await supabase()
    .from('weekly_plan_steps')
    .select('weekly_goal_id')
    .eq('activated_cycle', cyclus.startDate)
    .not('weekly_goal_id', 'is', null)
    .limit(200);

  if (error) {
    // ⚠️ Zacht: dit is een melding bovenop het hoofdscherm en geen gegeven dat
    //    het scherm nodig heeft. Een lege verzameling betekent "geen melding",
    //    en dat is beter dan een hoofdscherm dat niet laadt.
    reportError(error, 'weekplan.ingeschoven', { code: error.code });
    return new Set();
  }

  const ids = (data ?? [])
    .map((rij) => rij.weekly_goal_id)
    .filter((id): id is string => id !== null);

  return new Set(ids);
}

/**
 * Zet een heel weekplan weg onder een mijlpaal.
 *
 * ⚠️ **Eén insert en niet één per stap.** Zes stappen zijn anders zes
 *    netwerkrondes op het moment dat de gebruiker bevestigt, en bij de vierde
 *    een half plan als de verbinding wegvalt. Zelfde afweging als bij de
 *    mijlpalen in `plan-toepassen.ts` (QS8-201).
 *
 * ⚠️ `order_index` telt door op wat er al ligt. Een tweede plan onder dezelfde
 *    mijlpaal hoort erachter te komen en niet ertussendoor.
 */
export async function maakWeekplan(
  goalId: string,
  milestoneId: string | null,
  stappen: WeekplanInvoer,
): Promise<Resultaat<readonly Weekplanstap[]>> {
  const gevalideerd = weekplanSchema.safeParse(stappen);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const vanaf = await hoogsteVolgnummer(goalId);

  const rijen = gevalideerd.data.map((stap, i) => ({
    goal_id: goalId,
    milestone_id: milestoneId,
    order_index: vanaf + 1 + i,
    title: stap.title,
    floor_text: stap.floor_text,
    ceiling_text: stap.ceiling_text,
    ai_generated: true,
  }));

  const { data, error } = await supabase().from('weekly_plan_steps').insert(rijen).select('*');

  if (error) {
    reportError(error, 'weekplan.create', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('weekplan.opslaan_mislukt') };
  }

  // ⚠️ PostgREST belooft de rijvolgorde van een insert niet. Zelfde valkuil als
  //    bij de mijlpalen in QS8-201, en hij ziet er hier net zo normaal uit.
  return { ok: true, waarde: opVolgorde((data ?? []) as Weekplanstap[]) };
}

/** Het hoogste volgnummer dat dit doel al gebruikt; 0 als er nog niets ligt. */
async function hoogsteVolgnummer(goalId: string): Promise<number> {
  const { data, error } = await supabase()
    .from('weekly_plan_steps')
    .select('order_index')
    .eq('goal_id', goalId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    reportError(error, 'weekplan.hoogste', { goal_id: goalId, code: error.code });
    return 0;
  }

  return data?.order_index ?? 0;
}

/**
 * Stelt een geplande stap bij.
 *
 * ⚠️ Alleen zolang hij nog niet verbruikt is, en dat wordt in RLS afgedwongen —
 *    `weekly_plan_steps_update` heeft `activated_cycle is null` in zijn `using`
 *    én in zijn `with check`. De filter hieronder is de leesbaarheid; de grendel
 *    zit in de database.
 */
export async function stelWeekplanstapBij(
  id: string,
  invoer: Pick<WeekplanstapInvoer, 'title' | 'floor_text' | 'ceiling_text'>,
): Promise<Resultaat<Weekplanstap>> {
  const gevalideerd = weekplanstapSchema
    .pick({ title: true, floor_text: true, ceiling_text: true })
    .safeParse(invoer);

  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const { data, error } = await supabase()
    .from('weekly_plan_steps')
    .update({
      title: gevalideerd.data.title,
      floor_text: gevalideerd.data.floor_text,
      ceiling_text: gevalideerd.data.ceiling_text,
    })
    .eq('id', id)
    .is('activated_cycle', null)
    .select('*')
    .maybeSingle();

  if (error) {
    reportError(error, 'weekplan.update', { code: error.code });
    return { ok: false, melding: t('weekplan.opslaan_mislukt') };
  }

  // ⚠️ Geen rij terug is hier géén fout van de verbinding maar een weigering:
  //    de stap is intussen ingeschoven, of hij is niet van jou. Stil doen alsof
  //    het lukte laat het scherm een tekst tonen die nergens staat.
  if (data === null) {
    return { ok: false, melding: t('weekplan.al_ingeschoven') };
  }

  return { ok: true, waarde: data as Weekplanstap };
}

/** Gooit een geplande stap weg. Een verbruikte stap weigert RLS. */
export async function verwijderWeekplanstap(id: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase()
    .from('weekly_plan_steps')
    .delete()
    .eq('id', id)
    .is('activated_cycle', null)
    .select('id');

  if (error) {
    reportError(error, 'weekplan.delete', { code: error.code });
    return { ok: false, melding: t('weekplan.verwijderen_mislukt') };
  }

  if ((data ?? []).length === 0) {
    return { ok: false, melding: t('weekplan.al_ingeschoven') };
  }

  return { ok: true, waarde: true };
}

/**
 * Herordent het plan van één doel.
 *
 * ⚠️ Eén RPC en geen lus van losse updates, om precies de reden die 0049 voor de
 *    mijlpalen opschreef: valt de verbinding halverwege weg, dan staat er een
 *    volgorde die niemand gekozen heeft. PostgREST draait elke RPC in zijn eigen
 *    transactie, dus het is één schuif of geen.
 *
 * ⚠️ De volledige lijst en niet een deel ervan. `herorden_weekplan()` toetst dat
 *    als verzamelingsgelijkheid — twee insluitingen zijn geen gelijkheid, en dat
 *    is de valkuil die migratie 0032 een groene test opleverde die niets bewees.
 */
export async function herordenWeekplan(
  goalId: string,
  idsInVolgorde: readonly string[],
): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('herorden_weekplan', {
    p_goal_id: goalId,
    p_ids: [...idsInVolgorde],
  });

  if (error) {
    reportError(error, 'weekplan.reorder', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('weekplan.opslaan_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'lijst_klopt_niet'
          ? t('weekplan.lijst_veranderd')
          : t('weekplan.opslaan_mislukt'),
    };
  }

  return { ok: true, waarde: true };
}

/**
 * "Start deze nu" — de eigenaar haalt een geplande stap naar voren.
 *
 * ⚠️ De cyclus en het volgnummer worden hier berekend en meegestuurd, precies
 *    zoals `maakWeekdoel()` en `schuifDoor()` dat doen. De database weet de
 *    week-startdag van deze gebruiker niet en hoort die niet uit te rekenen
 *    (correctheidsregel 7).
 */
export async function startWeekplanstapNu(
  stepId: string,
  goalId: string,
  klok: UserClock,
): Promise<Resultaat<true>> {
  const cyclus = huidigeCyclus(klok);
  const eerste = await eersteCyclusVanDoel(goalId, klok);
  const index = eerste === null ? 1 : cyclesBetween(eerste, cyclus) + 1;

  const { data, error } = await supabase().rpc('start_weekplanstap', {
    p_step_id: stepId,
    p_cycle_start_date: cyclus.startDate,
    p_cycle_index: index,
  });

  if (error) {
    reportError(error, 'weekplan.start', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('weekplan.starten_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: unknown };
  if (uitkomst.ok !== true) {
    return { ok: false, melding: meldingBijReden(uitkomst.reason) };
  }

  return { ok: true, waarde: true };
}
