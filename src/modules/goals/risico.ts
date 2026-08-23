import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { RisicoReden, RisicoStand } from '../../shared/ui';

/**
 * De Risico-radar ophalen — QS8-93, QS8-94.
 *
 * ⚠️ Alleen lezen. `goal_risk` heeft geen INSERT-, UPDATE- of DELETE-policy en
 *    de client heeft er geen tabelrecht op: een zelfgekozen risicostand is een
 *    verzonnen stand. De berekening draait server-side bij de rollover en bij
 *    elke goedkeuring (migratie 0051).
 *
 * ⚠️ **Dit is eigenaar-only en dat is structureel**, niet een afspraak. Sinds
 *    migratie 0050 woont het risico in een eigen tabel met eigenaar-only RLS,
 *    juist omdat het als kolom op `goals` aan elke groepsgenoot meekwam. Roep
 *    dit nooit aan vanaf een groepsscherm: je krijgt niets terug, en de vraag
 *    stellen is al het begin van het verkeerde ontwerp.
 */

export interface Risico {
  readonly goalId: string;
  readonly stand: RisicoStand;
  readonly reden: RisicoReden | null;
  readonly berekendOp: string;
}

function naarRisico(rij: {
  goal_id: string;
  status: string;
  reason: unknown;
  computed_at: string;
}): Risico {
  return {
    goalId: rij.goal_id,
    // De CHECK in de database laat alleen deze vier toe; de cast is hier de
    // grens tussen "tekst uit een kolom" en "een stand die de UI kent".
    stand: rij.status as RisicoStand,
    reden: (rij.reason ?? null) as RisicoReden | null,
    berekendOp: rij.computed_at,
  };
}

/**
 * De risicostand van één doel, of `null` als hij nog nooit berekend is.
 *
 * ⚠️ `null` betekent "nog niet berekend" en niet "op koers". Het scherm moet dat
 *    verschil aankunnen: een doel dat vanmorgen is aangemaakt heeft nog geen
 *    rij, want de radar draait bij de rollover en bij een goedkeuring. Toon dan
 *    niets in plaats van een groen vinkje dat niets gemeten heeft.
 */
export async function fetchRisico(goalId: string): Promise<Risico | null> {
  const { data, error } = await supabase()
    .from('goal_risk')
    .select('goal_id, status, reason, computed_at')
    .eq('goal_id', goalId)
    .maybeSingle();

  if (error) {
    reportError(error, 'goals.risk', { goal_id: goalId, code: error.code });
    return null;
  }

  return data === null ? null : naarRisico(data);
}

/**
 * De risicostanden van een lijst doelen, in één verzoek.
 *
 * ⚠️ Eén query voor de hele lijst en niet één per doel — de N+1 die het
 *    beslisdocument met naam noemt (CLAUDE.md, regel 12). Het doelenoverzicht
 *    toont er tot twintig tegelijk.
 */
export async function fetchRisicos(
  goalIds: readonly string[],
): Promise<ReadonlyMap<string, Risico>> {
  if (goalIds.length === 0) return new Map();

  const { data, error } = await supabase()
    .from('goal_risk')
    .select('goal_id, status, reason, computed_at')
    .in('goal_id', [...goalIds]);

  if (error) {
    reportError(error, 'goals.risks', { code: error.code });
    return new Map();
  }

  return new Map((data ?? []).map((rij) => [rij.goal_id, naarRisico(rij)]));
}
