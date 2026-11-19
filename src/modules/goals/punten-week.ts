import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';

/**
 * De punten die je deze cyclus verdiend hebt — QS8-747.
 *
 * ⚠️ **Alleen eigen punten, en de grendel is de database.** `points_ledger` heeft
 *    `user_id = auth.uid()` als enige SELECT-regel (domeinregel 10); de
 *    `.eq('user_id', …)` hieronder is gewoonte en geen beveiliging. Geef dit
 *    getal nooit aan een groepscomponent.
 *
 * ⚠️ **De cyclus komt van de aanroeper en niet uit deze functie** (domeinregel 1):
 *    `startsAt`/`endsAt` van `huidigeCyclus()`, half-open. Hier wordt geen week
 *    uitgerekend.
 *
 * ⚠️ **`cycle_missed` telt hier niet mee, en dat is een aanname.** Die boeking
 *    wordt door de rollover gezet op het moment dat de nieuwe week begint, dus ze
 *    valt in het venster van de week erná, terwijl ze over de week ervoor gaat.
 *    Meetellen opent elke nieuwe week met een minpunt boven je naam. De boeking
 *    blijft gewoon in het grootboek en in je eigen stand per doel staan; dit is
 *    een samenvatting van wat je deze week verdiend hebt, en geen tweede
 *    puntentotaal. Wat een `correction` doet blijft wél meetellen.
 *
 * ⚠️ Eén verzoek, begrensd: een week heeft per persoon hooguit een handvol boekingen
 *    (een per doel en een per beoordeling). Meer dan de grens komt in de praktijk
 *    niet voor en zou het getal eronder laten blijven.
 */
export const PUNTEN_WEEK_GRENS = 500;

const BUITEN_DEZE_WEEK = 'cycle_missed';

export function somPunten(rijen: readonly { readonly delta: number }[]): number {
  return rijen.reduce((som, rij) => som + rij.delta, 0);
}

export async function fetchPuntenDezeWeek(userId: string, cyclus: Cycle): Promise<number> {
  const { data, error } = await supabase()
    .from('points_ledger')
    .select('delta')
    .eq('user_id', userId)
    .gte('created_at', cyclus.startsAt.toISOString())
    .lt('created_at', cyclus.endsAt.toISOString())
    .neq('reason', BUITEN_DEZE_WEEK)
    .order('created_at', { ascending: false })
    .limit(PUNTEN_WEEK_GRENS);

  // ⚠️ Gooien en geen 0 teruggeven: nul is hier een echte uitkomst en een
  //    netwerkfout mag er niet als uitzien.
  if (error) {
    reportError(error, 'punten.week', { user_id: userId });
    throw new Error(t('tellers.punten_laden'));
  }

  // ⚠️ Zit de week op de grens, dan is het getal mogelijk te laag. Dat is geen reden
  //    om te falen, wel om het te melden zodat het niet ongemerkt blijft.
  if ((data?.length ?? 0) >= PUNTEN_WEEK_GRENS) {
    reportError(new Error('Puntenweek op de grens'), 'punten.week.grens', { user_id: userId });
  }

  return somPunten(data ?? []);
}
