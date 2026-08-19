import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { WeekpasStand } from '../../shared/ui';

import { fetchWeekpasStanden } from './weekpas';

/**
 * De persoonlijke stand per doel — QS8-75.
 *
 * Reeks, langste reeks, punten en weekpassen bij elkaar, want dat is wat het
 * dashboard toont.
 *
 * ⚠️ **Alles hierin is privé.** `user_streaks` en `points_ledger` zijn per
 *    policy alleen voor de eigenaar leesbaar, en dat is geen toeval: een dalend
 *    puntentotaal is zichtbaar bewijs van een gemiste week (domeinregel 10) en
 *    daarmee een schending van domeinregel 7. Wat de groep wél ziet is de kale
 *    `current_streak` uit `group_visible_streaks` — een andere bron, met een
 *    andere kolomlijst. Haal die twee nooit door elkaar en geef dit type nooit
 *    aan een groepscomponent.
 *
 * ⚠️ Score en voortgang zijn twee dingen (domeinregel 10). `punten` hoort dus
 *    nooit in dezelfde balk als mijlpaalvoortgang: voortgang stijgt alleen, de
 *    score kan dalen.
 */

export type Reeks = Tables<'user_streaks'>;

export interface DoelStand {
  readonly goalId: string;
  /** De lopende reeks, in cycli. Nooit in dagen — de week is de eenheid. */
  readonly huidigeReeks: number;
  /** De langste reeks ooit. Loopt alleen omhoog. */
  readonly besteReeks: number;
  /** Het puntentotaal van dit doel. Kan dalen. Privé. */
  readonly punten: number;
  /**
   * De weekpasstand van dit doel.
   *
   * ⚠️ In de praktijk nooit `null` voor een eigen doel: `weekpas_standen()`
   *    geeft een rij voor élk doel dat je bezit, ook een doel zonder één
   *    gebeurtenis (dan staat de voorraad op nul). `null` betekent hier dus
   *    "geen antwoord gekregen" — het doel is intussen verwijderd, of het
   *    verzoek is mislukt. De schermen mogen daarop dus niet rekenen voor "nog
   *    geen passen"; daarvoor is `voorraad === 0`.
   */
  readonly weekpas: WeekpasStand | null;
}

/**
 * De stand van alle doelen van de ingelogde gebruiker.
 *
 * Twee verzoeken, ongeacht het aantal doelen: één op `user_streaks` en één op
 * `weekpas_standen()`. Geen lus, geen N+1 (schaalbaarheidsregel 12).
 *
 * ⚠️ Een doel zonder rij in `user_streaks` bestaat: die tabel wordt pas gevuld
 *    zodra er iets te herberekenen valt. Dat is geen fout en levert hier een
 *    stand van nul op — niet een ontbrekend doel, want dan verdwijnt een nieuw
 *    doel van het dashboard.
 */
export async function fetchDoelStanden(userId: string): Promise<ReadonlyMap<string, DoelStand>> {
  const [reeksen, weekpassen] = await Promise.all([
    fetchReeksen(userId),
    fetchWeekpasStanden(),
  ]);

  const kaart = new Map<string, DoelStand>();

  for (const reeks of reeksen) {
    kaart.set(reeks.goal_id, {
      goalId: reeks.goal_id,
      huidigeReeks: reeks.current_streak,
      besteReeks: reeks.best_streak,
      punten: reeks.total_points,
      weekpas: weekpassen.get(reeks.goal_id) ?? null,
    });
  }

  // Doelen die nog geen reeksrij hebben, maar wél een weekpasstand — een doel
  // dat net is aangemaakt heeft die combinatie.
  for (const [goalId, weekpas] of weekpassen) {
    if (kaart.has(goalId)) continue;
    kaart.set(goalId, {
      goalId,
      huidigeReeks: 0,
      besteReeks: 0,
      punten: 0,
      weekpas,
    });
  }

  return kaart;
}

async function fetchReeksen(userId: string): Promise<readonly Reeks[]> {
  const { data, error } = await supabase()
    .from('user_streaks')
    .select('*')
    .eq('user_id', userId)
    .limit(200);

  if (error) {
    reportError(error, 'stand.reeksen', { user_id: userId, pgcode: error.code });
    throw new Error('Je reeks kon niet geladen worden.');
  }

  return data ?? [];
}
