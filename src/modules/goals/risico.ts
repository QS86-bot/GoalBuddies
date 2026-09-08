import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { brokken } from '../../shared/idlijst';
import type { RisicoReden, RisicoStand } from '../../shared/standen';

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
 * De risicostanden van een lijst doelen, in zo min mogelijk verzoeken.
 *
 * ⚠️ Eén query voor de hele lijst en niet één per doel — de N+1 die het
 *    beslisdocument met naam noemt (CLAUDE.md, regel 12).
 *
 * ⚠️⚠️ **Maar niet per se één verzoek, en dat is QS8-368.** De kop hier zei
 *    *"in één verzoek"* en erbij *"het doelenoverzicht toont er tot twintig
 *    tegelijk"* — en dat tweede klopte niet. `app/(tabs)/doelen.tsx` stápelt de
 *    opgehaalde pagina's (`[...eerdere, ...pagina.rijen]`), dus na elf keer
 *    "meer laden" staan er 220 id's in deze lijst en na eenentwintig keer 420.
 *    📏 Boven de 415 valt het verzoek om met `TypeError: fetch failed` — geen
 *    HTTP-status, geen PostgREST-fout, alleen een lege radar. De klif en de
 *    meting staan in `shared/idlijst`.
 *
 * ⚠️ **Afkappen was hier het verkeerde antwoord.** Een `.slice()` is goedkoper
 *    en maakt het scherm ónwaar op precies de manier van QS8-342: doelen voorbij
 *    de grens krijgen geen badge en zien er daarmee uit als "nog niet berekend",
 *    wat een betekenisvolle stand ís (zie `fetchRisico()` hierboven). Brokken
 *    kosten één extra verzoek per 200 doelen en liegen niet.
 *
 * ⚠️ **Achter elkaar en niet met `Promise.all`.** De gratis tier deelt 60
 *    verbindingen over de héle database (CLAUDE.md, Supabase gratis tier); een
 *    lijst die vandaag twee brokken is, is bij een gebruiker met vierduizend
 *    doelen er twintig, en dat zijn dan twintig gelijktijdige verzoeken van één
 *    scherm. De winst is een fractie van een seconde voor iemand die toch al aan
 *    het bladeren is.
 */
export async function fetchRisicos(
  goalIds: readonly string[],
): Promise<ReadonlyMap<string, Risico>> {
  const kaart = new Map<string, Risico>();

  for (const brok of brokken(goalIds)) {
    const { data, error } = await supabase()
      .from('goal_risk')
      .select('goal_id, status, reason, computed_at')
      .in('goal_id', [...brok]);

    // ⚠️⚠️ **Stoppen en teruggeven wat er ís, en dat is níét hetzelfde als het
    //    afkappen dat hierboven afgewezen wordt.** Die vraag kwam uit de
    //    security-review op deze branch en hij is terecht: allebei laten ze een
    //    doel zonder badge achter. Het verschil zit in wat eraan voorafging.
    //    Afkappen gebeurt op een gelúkt verzoek en is stil — niets in het
    //    systeem weet dat er iets ontbreekt. Dit gebeurt na een gemelde fout,
    //    met `opgehaald` erbij in het rapport, dus de leegte heeft een spoor.
    //
    // ⚠️ En dóórvragen na een fout is de slechtste van de drie: bij een echte
    //    storing vuurt het scherm dan ⌈n/200⌉ gedoemde verzoeken achter elkaar
    //    af, elk met de timeout van `fetchMetTimeout()` eronder.
    if (error) {
      // ⚠️ `hint` en niet alleen `code`: bij de klif uit `shared/idlijst` is
      //    `code` een lege string en staat de hele diagnose in de hint.
      reportError(error, 'goals.risks', {
        code: error.code,
        hint: error.hint,
        opgehaald: kaart.size,
      });
      return kaart;
    }

    for (const rij of data ?? []) kaart.set(rij.goal_id, naarRisico(rij));
  }

  return kaart;
}
