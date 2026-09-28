import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Resultaat, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';

/**
 * De wachtrij voor koppeling aan onbekenden met een gelijkend doel — QS8-233,
 * migraties 0299 en 0300.
 *
 * ⚠️ **Wat je over je eigen wachtopdracht te zien krijgt, staat in de
 *    handtekening van `buddyzoek_stand()` en niet hier.** Die functie is
 *    SECURITY DEFINER met een expliciete kolomlijst, want RLS kan geen kolommen
 *    beperken. Deze module kan dat dus niet verbreden — zelfde vorm en zelfde
 *    reden als `ontdekken.ts` naast `ontdek_groepen()`.
 *
 * ⚠️⚠️ **`nogNodig` is afgekapt op 0, 1 of 2, en dat is geen afronding maar een
 *    grendel.** Een exacte telling van je bak is met één API-verzoek te herhalen
 *    terwijl je je categorie of streefdatum varieert, en dan is het een
 *    demografisch meetinstrument op de gebruikersbasis. Het scherm zegt daarom
 *    nooit meer dan "er zijn nog twee mensen nodig", ook als het er zeven zijn.
 *
 * ⚠️ **Een groep die hieruit ontstaat is permanent beschermd**, als CHECK op
 *    `groups` plus een pin in `guard_group_update()`. Een groep van onbekenden
 *    openzetten zou domeinregel 7 via een omweg afschaffen, en besluit A41 is
 *    genomen voor groepen van vrienden.
 */

/** De stand van je eigen wachtopdracht. */
export interface Buddyzoekstand {
  readonly status: 'wachtend' | 'gekoppeld';
  /** Hoeveel mensen er nog bij moeten. Nooit hoger dan 2 — zie de kop. */
  readonly nogNodig: number;
  readonly sinds: string;
  readonly verloopt: string;
  /** Gevuld zodra `status` `gekoppeld` is, en dan nooit `null`. */
  readonly groupId: string | null;
}

type RpcStand = RpcRij<{
  status: string;
  nog_nodig: number;
  sinds: string;
  verloopt: string;
  group_id: string;
}>;

function naarStand(rij: RpcStand): Buddyzoekstand | null {
  if (rij.status !== 'wachtend' && rij.status !== 'gekoppeld') return null;
  if (typeof rij.sinds !== 'string' || typeof rij.verloopt !== 'string') return null;

  const nog = typeof rij.nog_nodig === 'number' ? rij.nog_nodig : 0;

  return {
    status: rij.status,
    nogNodig: Math.max(0, Math.min(2, nog)),
    sinds: rij.sinds,
    verloopt: rij.verloopt,
    groupId: typeof rij.group_id === 'string' ? rij.group_id : null,
  };
}

/** De reden die de RPC teruggeeft, als zin voor de gebruiker. */
function meldingBijReden(reden: string | undefined): string {
  if (reden === 'rate_limited') return t('buddyzoek.te_veel');
  if (reden === 'not_found') return t('buddyzoek.niet_gevonden');
  if (reden === 'not_confirmed') return t('buddyzoek.niet_bevestigd');
  if (reden === 'not_active') return t('buddyzoek.doel_niet_actief');
  if (reden === 'expired') return t('buddyzoek.datum_verstreken');
  if (reden === 'too_many_queued') return t('buddyzoek.te_veel_open');
  if (reden === 'too_many_groups') return t('buddyzoek.te_veel_groepen');
  if (reden === 'already_matched') return t('buddyzoek.al_gekoppeld');
  return t('buddyzoek.mislukt');
}

/**
 * In de rij stappen.
 *
 * ⚠️⚠️ **`bevestigd` is geen formaliteit en hoort nooit hardgecodeerd op `true`.**
 *    Koppelen zet de beoordeelbaarheidsgrendel om: je lópende weekdoelen worden
 *    beoordeelbaar en kunnen vanaf dat moment een minpunt opleveren. Dat is wat
 *    een gebruiker als consequentie beloofd is, en hij hoort het te lezen vóór
 *    de knop en niet erna. De database weigert zonder bevestiging, dus wie hem
 *    hier op `true` zet, omzeilt een scherm en geen vinkje.
 */
export async function zoekBuddies(goalId: string, bevestigd: boolean): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('zoek_buddies_aan', {
    p_goal_id: goalId,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'buddies.match_queue_join', { goal_id: goalId });
    return { ok: false, melding: t('buddyzoek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * Uit de rij stappen.
 *
 * ⚠️ Dit kost niets — geen punt, geen gebeurtenis, geen bericht in een groep.
 *    Dat staat zo in de acceptatiecriteria en het is de reden dat er geen
 *    bevestiging omheen zit: wie eruit wil, wil eruit.
 */
export async function stopBuddyZoeken(goalId: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('zoek_buddies_uit', { p_goal_id: goalId });

  if (error) {
    reportError(error, 'buddies.match_queue_leave', { goal_id: goalId });
    return { ok: false, melding: t('buddyzoek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * De stand van je eigen wachtopdracht, of `null` als je niet zoekt.
 *
 * ⚠️ `null` betekent hier twee dingen die het scherm hetzelfde mag tonen: je
 *    zoekt niet, of je zocht en bent eruit gestapt. Een verlopen of vertrokken
 *    rij komt niet terug — `buddyzoek_stand()` geeft alleen `wachtend` en
 *    `gekoppeld`.
 */
export async function fetchBuddyzoekStand(
  goalId: string,
  vandaag: string,
): Promise<Buddyzoekstand | null> {
  const { data, error } = await supabase()
    .rpc('buddyzoek_stand', { p_goal_id: goalId, p_vandaag: vandaag })
    .maybeSingle();

  if (error) {
    reportError(error, 'buddies.match_queue_status', { goal_id: goalId });
    return null;
  }

  return data === null ? null : naarStand(data as unknown as RpcStand);
}

/**
 * Hoeveel wachtopdrachten je vandaag nog mag doen.
 *
 * ⚠️ Bij een storing `null` en geen nul — zelfde afweging als
 *    `fetchVerzoekenOver()`: "je mag niets meer" is een bewering, en die doen we
 *    niet op grond van een mislukte aanroep. Het scherm laat de teller dan weg
 *    en de database blijft de rem.
 */
export async function fetchBuddyzoekopdrachtenOver(): Promise<number | null> {
  const { data, error } = await supabase().rpc('buddyzoekopdrachten_over');

  if (error) {
    reportError(error, 'buddies.match_queue_left');
    return null;
  }

  return typeof data === 'number' ? data : null;
}
