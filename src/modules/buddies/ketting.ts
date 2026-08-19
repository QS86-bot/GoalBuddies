import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';
import type { KettingStand } from '../../shared/ui';

/**
 * De Ketting — QS8-80.
 *
 * ⚠️ Er wordt hier geen periode uitgerekend. De aanroeper geeft de lopende
 *    groepsperiode mee, en die komt uit `huidigeGroepsperiode()` in `periods.ts`
 *    en daarmee uit `shared/time` (CLAUDE.md, correctheidsregel 7). De database
 *    kent de huddledag wel maar mag er niet mee rekenen — `ketting_stand()`
 *    neemt de datum daarom als parameter aan.
 *
 * ⚠️ Er wordt hier ook niets geteld. `ketting_stand()` is SECURITY DEFINER met
 *    een expliciete lidmaatschapstoets, juist zodat elk lid hetzelfde getal
 *    ziet: als INVOKER hing de noemer af van wiens adempauzes de aanroeper mag
 *    zien, en dan geeft een gedeelde teller twee mensen een ander antwoord.
 *
 * ⚠️ En er komen hier nooit namen binnen. De functie geeft `{schakels,
 *    in_aanmerking, voltallig}` terug en niets meer; wie er ontbreekt is geen
 *    gegeven dat de database uitlevert (domeinregel 7). Wil je dat ooit tonen,
 *    dan is dat een wijziging aan de RPC en dus een gesprek, geen scherm.
 */

/** De ruwe vorm van `ketting_stand()`. Wordt hier omgezet naar `KettingStand`. */
interface RpcStand {
  readonly schakels?: number;
  readonly in_aanmerking?: number;
  readonly voltallig?: boolean;
}

/**
 * De stand van De Ketting in de lopende groepsperiode.
 *
 * Geeft `null` als de RPC niets teruggeeft. Dat gebeurt precies in één geval:
 * je bent geen lid van deze groep. De functie heeft een `where
 * is_group_member(...)` en levert dan nul rijen — hetzelfde antwoord als een
 * groep die niet bestaat, en dat onderscheid hoort niet te bestaan.
 */
export async function fetchKettingStand(
  groupId: string,
  periode: Cycle,
): Promise<KettingStand | null> {
  const { data, error } = await supabase().rpc('ketting_stand', {
    p_group_id: groupId,
    p_period_start: periode.startDate,
  });

  if (error) {
    reportError(error, 'ketting.stand', { group_id: groupId, pgcode: error.code });
    throw new Error('De Ketting kon niet geladen worden.');
  }

  if (data === null || data === undefined) return null;

  const ruw = data as RpcStand;

  // ⚠️ Met de hand omgezet en niet gecast. De RPC geeft `jsonb` terug, dus de
  //    gegenereerde types weten hier niets: `Json` is alles. Eén plek waar dat
  //    tot een echt type wordt, en die plek controleert of de velden er zijn —
  //    anders sneuvelt het pas in een component op `undefined`.
  if (
    typeof ruw.schakels !== 'number' ||
    typeof ruw.in_aanmerking !== 'number' ||
    typeof ruw.voltallig !== 'boolean'
  ) {
    reportError(new Error('Onvolledig antwoord van ketting_stand'), 'ketting.parse', {
      group_id: groupId,
    });
    return null;
  }

  return {
    schakels: ruw.schakels,
    inAanmerking: ruw.in_aanmerking,
    voltallig: ruw.voltallig,
  };
}
