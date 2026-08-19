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

/** De ruwe vorm van `weekpas_stand()`. Wordt hier omgezet naar `WeekpasStand`. */
interface RpcStand {
  readonly voorraad?: number;
  readonly maximum?: number;
  readonly voltooide_cycli?: number;
  readonly tot_volgende?: number;
  readonly laatst_verbruikt?: string | null;
}

/**
 * De weekpasstand van één doel.
 *
 * Geeft `null` als het doel niet van jou is of niet bestaat. Die twee gevallen
 * geven hetzelfde antwoord, en dat hoort ook zo: het onderscheid zou verklappen
 * welke doel-id's er bestaan.
 */
export async function fetchWeekpasStand(goalId: string): Promise<WeekpasStand | null> {
  const { data, error } = await supabase().rpc('weekpas_stand', { p_goal_id: goalId });

  if (error) {
    reportError(error, 'weekpas.stand', { goal_id: goalId, pgcode: error.code });
    throw new Error('Je weekpassen konden niet geladen worden.');
  }

  if (data === null || data === undefined) return null;

  const ruw = data as RpcStand;

  // ⚠️ Met de hand gecontroleerd en niet gecast. De RPC geeft `jsonb` terug, dus
  //    de gegenereerde types weten hier niets — `Json` is alles. Zonder deze
  //    controle sneuvelt een ontbrekend veld pas in een component, op
  //    `undefined`, ver van de oorzaak.
  //
  // ⚠️ Gooit, en geeft géén `null` terug. Dat onderscheid is de reden dat deze
  //    regel bestaat: `null` betekent "niet van jou" en dan hoort er niets op
  //    het scherm te staan. Een onvolledig antwoord is een storing en die hoort
  //    zichtbaar te zijn.
  if (
    typeof ruw.voorraad !== 'number' ||
    typeof ruw.maximum !== 'number' ||
    typeof ruw.voltooide_cycli !== 'number' ||
    typeof ruw.tot_volgende !== 'number'
  ) {
    reportError(new Error('Onvolledig antwoord van weekpas_stand'), 'weekpas.parse', {
      goal_id: goalId,
    });
    throw new Error('Je weekpassen konden niet geladen worden.');
  }

  return {
    voorraad: ruw.voorraad,
    maximum: ruw.maximum,
    voltooideCycli: ruw.voltooide_cycli,
    totVolgende: ruw.tot_volgende,
    laatstVerbruikt: ruw.laatst_verbruikt ?? null,
  };
}

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
    throw new Error('Je weekpassen konden niet geladen worden.');
  }

  const kaart = new Map<string, WeekpasStand>();

  for (const rij of (data ?? []) as StandRij[]) {
    // ⚠️ `laatst_verbruikt` staat in de gegenereerde types als `string`, maar de
    //    functie geeft er `null` voor terug zolang er niets verbruikt is. De
    //    generator kent het verschil niet bij een kolom van een set-returning
    //    functie; hier wel, dus hier wordt het rechtgezet.
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
