import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { cyclesBetween, type Cycle, type UserClock } from '../../shared/time';

import { huidigeCyclus } from './cycles';

import { weekdoelSchema, type WeekdoelInvoer } from './weekly-schemas';

/**
 * Weekdoelen: het hart van het model.
 *
 * ⚠️ Geen enkele functie hier rekent zelf een week uit. Alles gaat via
 *    `shared/time`, en de klok van de gebruiker komt uit zijn profiel
 *    (CLAUDE.md, correctheidsregel 7). Een weekdoel met een handmatig getypte
 *    `cycle_start_date` is een bug die zich pas maanden later laat zien, als
 *    iemand met een andere week-startdag hem probeert af te ronden.
 */

export type Weekdoel = Tables<'weekly_goals'>;

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/**
 * De weekdoelen van één cyclus, over alle doelen van de gebruiker heen.
 *
 * Eén query met een join op `goals`, want het scherm "Vandaag" toont ze door
 * elkaar en niet per doel gegroepeerd.
 */
export async function fetchWeekdoelen(
  userId: string,
  cyclus: Cycle,
): Promise<readonly Weekdoel[]> {
  const { data, error } = await supabase()
    .from('weekly_goals')
    .select('*, goals!inner(owner_id)')
    .eq('goals.owner_id', userId)
    .eq('cycle_start_date', cyclus.startDate)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    reportError(error, 'weekly.list', { user_id: userId, code: error.code });
    throw new Error('Je weekdoelen konden niet geladen worden.');
  }

  return (data ?? []) as unknown as Weekdoel[];
}

/**
 * Voegt een weekdoel toe — QS8-43 en QS8-44.
 *
 * ⚠️ `cycle_start_date` en `cycle_index` worden hier berekend uit de klok van de
 *    gebruiker, niet door de aanroeper meegegeven. Dat is het hele punt van deze
 *    functie: er is precies één plek waar een weekdoel aan een cyclus wordt
 *    gekoppeld.
 */
export async function maakWeekdoel(
  klok: UserClock,
  invoer: WeekdoelInvoer,
  eersteCyclusVanDoel: Cycle | null,
): Promise<Resultaat<Weekdoel>> {
  const gevalideerd = weekdoelSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? 'Controleer je invoer.' };
  }

  const cyclus = huidigeCyclus(klok);
  const index = eersteCyclusVanDoel === null ? 1 : cyclesBetween(eersteCyclusVanDoel, cyclus) + 1;

  const { data, error } = await supabase()
    .from('weekly_goals')
    .insert({
      goal_id: gevalideerd.data.goal_id,
      milestone_id: gevalideerd.data.milestone_id,
      title: gevalideerd.data.title,
      floor_text: gevalideerd.data.floor_text,
      ceiling_text: gevalideerd.data.ceiling_text,
      cycle_start_date: cyclus.startDate,
      cycle_index: index,
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'weekly.create', { goal_id: gevalideerd.data.goal_id, code: error.code });
    return { ok: false, melding: 'Je weekdoel kon niet worden opgeslagen.' };
  }

  return { ok: true, waarde: data };
}

export async function verwijderWeekdoel(id: string): Promise<Resultaat<true>> {
  const { error } = await supabase().from('weekly_goals').delete().eq('id', id);

  if (error) {
    reportError(error, 'weekly.delete', { code: error.code });
    return { ok: false, melding: 'Verwijderen lukte niet.' };
  }

  return { ok: true, waarde: true };
}

/**
 * Schuift een onvoltooid weekdoel door naar de huidige cyclus — QS8-47.
 *
 * ⚠️ Het oude weekdoel blijft staan met status `carried`, en verdwijnt dus niet
 *    stilletjes. Dat is privé: een doorgeschoven weekdoel komt nooit in de
 *    groepsfeed (domeinregel 7).
 */
export async function schuifDoor(
  doel: Weekdoel,
  klok: UserClock,
  eersteCyclusVanDoel: Cycle | null,
): Promise<Resultaat<Weekdoel>> {
  const { error: markeerFout } = await supabase()
    .from('weekly_goals')
    .update({ status: 'carried' })
    .eq('id', doel.id);

  if (markeerFout) {
    reportError(markeerFout, 'weekly.carry', { code: markeerFout.code });
    return { ok: false, melding: 'Doorschuiven lukte niet.' };
  }

  return await maakWeekdoel(
    klok,
    {
      goal_id: doel.goal_id,
      milestone_id: doel.milestone_id,
      title: doel.title,
      floor_text: doel.floor_text,
      ceiling_text: doel.ceiling_text,
    },
    eersteCyclusVanDoel,
  );
}
