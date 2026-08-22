import { t } from '../../shared/i18n';

import type { Database } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { WeekpasStand } from '../../shared/ui';

/**
 * Weekpassen — QS8-81.
 *
 * ⚠️ Alleen lezen. Verdienen gebeurt in de goedkeuringstrigger en verbruiken in
 *    de rollover-job; beide functies zijn `service_role`-only en niet vanuit de
 *    app aanroepbaar. Dat is opzet: een gebruiker die zijn eigen pas mag
 *    inzetten, zet hem in op een week die nog loopt — en dan beschermt hij
 *    niets.
 *
 * ⚠️ Er wordt hier niets uitgerekend. Het maximum komt uit de database
 *    (`weekpas_maximum()`) en niet uit een constante in dit bestand. Twee
 *    kopieën die gelijk moeten blijven zijn hier één keer geruisloos uit elkaar
 *    gelopen (valkuil 18); het getal hoort dus maar op één plek te staan, en dat
 *    is de plek die er ook naar handelt.
 *
 * ⚠️ Domeinregel 7. Een verbruikte pas is het bewijs van een gemiste week.
 *    `weekpas_stand()` geeft daarom alleen antwoord aan de eigenaar van het
 *    doel — met een expliciete toets in de functie zelf, niet via RLS, want een
 *    groepsgenoot mag de rijen van een gekoppeld doel wél lezen.
 */

/**
 * ⚠️ Het rijtype van `weekpas_standen()` wordt afgeleid uit de gegenereerde
 *    types en niet met de hand overgetypt — dan loopt het bij de volgende
 *    migratie vanzelf mee.
 */
type StandRij = Database['public']['Functions']['weekpas_standen']['Returns'][number];

/** De weekpasstand per doel-id. */
export type WeekpasStanden = ReadonlyMap<string, WeekpasStand>;

/**
 * De weekpasstand van meerdere doelen in één aanroep — QS8-75.
 *
 * ⚠️ Eén verzoek en geen lus over `fetchWeekpasStand`. Het dashboard toont de
 *    stand van elk doel waar deze week aan gewerkt wordt; per doel een aanroep
 *    is de N+1 die CLAUDE.md schaalbaarheidsregel 12 verbiedt.
 *
 * ⚠️ Geef je geen doelen mee, dan komen álle doelen van de ingelogde gebruiker
 *    terug. Dat is geen ongelimiteerde lijstquery in de zin van regel 10: de
 *    bovengrens is het aantal doelen van één persoon, en dat is per definitie
 *    klein. Wil je er tóch een deel van, geef dan `goalIds` mee.
 */
export async function fetchWeekpasStanden(goalIds?: readonly string[]): Promise<WeekpasStanden> {
  const { data, error } = await supabase().rpc(
    'weekpas_standen',
    goalIds === undefined ? {} : { p_goal_ids: [...goalIds] },
  );

  if (error) {
    reportError(error, 'weekpas.standen', { aantal: goalIds?.length ?? 0, pgcode: error.code });
    throw new Error(t('doel.weekpassen_laden'));
  }

  const kaart = new Map<string, WeekpasStand>();

  for (const rij of (data ?? []) as StandRij[]) {
    // ⚠️ Met de hand gecontroleerd en niet blind vertrouwd. De gegenereerde
    //    types van een set-returning functie zijn een belofte van de generator,
    //    geen garantie van de server: `laatst_verbruikt` staat er als `string`
    //    terwijl de functie er `null` voor teruggeeft zolang er niets verbruikt
    //    is. Waar de types al één keer aantoonbaar liegen, is een controle op de
    //    getallen geen luxe — zonder deze regel sneuvelt een ontbrekend veld pas
    //    in een component, op `undefined`, ver van de oorzaak.
    if (
      typeof rij.voorraad !== 'number' ||
      typeof rij.maximum !== 'number' ||
      typeof rij.voltooide_cycli !== 'number' ||
      typeof rij.tot_volgende !== 'number'
    ) {
      reportError(new Error('Onvolledig antwoord van weekpas_standen'), 'weekpas.parse', {
        goal_id: rij.goal_id,
      });
      throw new Error(t('doel.weekpassen_laden'));
    }

    kaart.set(rij.goal_id, {
      voorraad: rij.voorraad,
      maximum: rij.maximum,
      voltooideCycli: rij.voltooide_cycli,
      totVolgende: rij.tot_volgende,
      laatstVerbruikt: rij.laatst_verbruikt ?? null,
    });
  }

  return kaart;
}
