import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { type Pagina, type Resultaat, type RpcRij } from '../../shared/api';
import { t } from '../../shared/i18n';

/**
 * Groepen ontdekken en lidmaatschap aanvragen — QS8-231, migratie 0144.
 *
 * ⚠️ **Wat een buitenstaander te zien krijgt, staat in de handtekening van
 *    `ontdek_groepen()` en niet hier.** Die functie is SECURITY DEFINER met een
 *    expliciete kolomlijst; `groups_select` blijft onaangeraakt. Wat er niet in
 *    die `returns table` staat, bestaat voor een niet-lid niet — geen
 *    `invite_code`, geen leden, geen doelen, geen chat.
 *
 *    Deze module kan dat dus niet verbreden, en dat is precies de bedoeling. Een
 *    scherm dat de regel zelf zou moeten kennen, is een regel die met één
 *    verzoek aan PostgREST te omzeilen valt.
 *
 * ⚠️ **Een ontdekbare groep is altijd beschermd**, als CHECK in 0144. Een open
 *    groep (A41) deelt de gemiste weken van zijn leden; die openstellen voor
 *    vreemden zou domeinregel 7 via een omweg afschaffen.
 */

export interface OntdekteGroep {
  readonly groupId: string;
  readonly naam: string;
  readonly categorie: string;
  readonly omschrijving: string | null;
  readonly voertaal: string | null;
  readonly huddleDag: number;
  readonly leden: number;
}

/** ⚠️ Twintig, en de RPC kapt zelf af op vijftig — onwrikbare regel 10. */
export const GROEPEN_PER_PAGINA = 20;

type RpcGroep = RpcRij<{
  group_id: string;
  naam: string;
  categorie: string;
  omschrijving: string;
  voertaal: string;
  huddle_day: number;
  leden: number;
  totaal: number;
}>;

function naarGroep(rij: RpcGroep): OntdekteGroep | null {
  if (typeof rij.group_id !== 'string') return null;
  if (typeof rij.naam !== 'string') return null;
  if (typeof rij.categorie !== 'string') return null;

  return {
    groupId: rij.group_id,
    naam: rij.naam,
    categorie: rij.categorie,
    omschrijving: rij.omschrijving,
    voertaal: rij.voertaal,
    huddleDag: rij.huddle_day ?? 0,
    leden: rij.leden ?? 0,
  };
}

/**
 * Zoek ontdekbare groepen.
 *
 * @param categorie één van de vijftien gebieden, of `null` voor alle
 * @param taal de voertaal, of `null` voor alle
 */
export async function fetchOntdekteGroepen(
  categorie: string | null,
  taal: string | null,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<OntdekteGroep>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * GROEPEN_PER_PAGINA;

  const { data, error } = await supabase().rpc('ontdek_groepen', {
    p_categorie: categorie,
    p_taal: taal,
    p_limit: GROEPEN_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'groups.discover', { pgcode: error.code });
    throw new Error(t('ontdek.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly RpcGroep[];
  const rijen = ruw.map(naarGroep).filter((g): g is OntdekteGroep => g !== null);

  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.totaal ?? rijen.length) - overgeslagen);

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

/** De reden die de RPC teruggeeft, als zin voor de gebruiker. */
function meldingBijReden(reden: string | undefined): string {
  if (reden === 'rate_limited') return t('ontdek.te_veel_aanvragen');
  if (reden === 'already_member') return t('ontdek.al_lid');
  if (reden === 'not_open') return t('ontdek.niet_open');
  if (reden === 'not_admin') return t('ontdek.geen_beheerder');
  if (reden === 'not_confirmed') return t('ontdek.niet_bevestigd');
  if (reden === 'not_protected') return t('ontdek.niet_beschermd');
  if (reden === 'no_category') return t('ontdek.geen_categorie');
  if (reden === 'already_decided') return t('ontdek.al_beslist');
  if (reden === 'unchanged') return t('ontdek.ongewijzigd');
  return t('ontdek.mislukt');
}

export async function vraagLidmaatschapAan(
  groupId: string,
  bericht: string,
): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('vraag_lidmaatschap_aan', {
    p_group_id: groupId,
    p_bericht: bericht.trim() === '' ? null : bericht,
  });

  if (error) {
    reportError(error, 'groups.join_request', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('ontdek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * Hoeveel groepen je vandaag nog mag aanschrijven.
 *
 * ⚠️ **Getoond en niet alleen afgevangen.** De dagrem bestaat tegen spam
 *    (beveiligingsregel 5), maar iemand die hem raakt heeft niets fout gedaan —
 *    hij zoekt. Een teller die vooraf zegt hoeveel er over zijn, is eerlijker
 *    dan een weigering achteraf op de knop die hij net indrukte.
 *
 * ⚠️ Bij een storing `null` en geen nul: "je mag niets meer" is een bewering, en
 *    die doen we niet op grond van een mislukte aanroep. Het scherm laat de
 *    teller dan weg en de database blijft de rem.
 */
export async function fetchVerzoekenOver(): Promise<number | null> {
  const { data, error } = await supabase().rpc('lidmaatschapsverzoeken_over');

  if (error) {
    reportError(error, 'groups.join_requests_left', { pgcode: error.code });
    return null;
  }

  return typeof data === 'number' ? data : null;
}

export interface Lidmaatschapsverzoek {
  readonly id: string;
  readonly userId: string;
  readonly naam: string;
  readonly bericht: string | null;
  readonly aangevraagdOp: string;
}

/**
 * De openstaande aanvragen van een groep.
 *
 * ⚠️ Eén verzoek met de naam ingebed en geen lus over aanvragers
 *    (onwrikbare regel 12). `profiles_select` laat `display_name` toe voor wie
 *    een groep deelt — en een aanvrager deelt er nog geen. Vandaar de
 *    ingebedde join: die loopt via de policy van `profiles`, en een naam die
 *    niet doorkomt levert een rij zonder naam op in plaats van geen rij.
 */
export async function fetchOpenstaandeVerzoeken(
  groupId: string,
): Promise<readonly Lidmaatschapsverzoek[]> {
  const { data, error } = await supabase()
    .from('group_join_requests')
    .select('id, user_id, bericht, created_at, profiles(display_name)')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    reportError(error, 'groups.join_requests', { group_id: groupId, pgcode: error.code });
    throw new Error(t('ontdek.verzoeken_mislukt'));
  }

  return (data ?? []).map((rij) => {
    const profiel = rij.profiles as unknown as { display_name?: string } | null;
    return {
      id: rij.id,
      userId: rij.user_id,
      naam: profiel?.display_name ?? t('ontdek.onbekend_lid'),
      bericht: rij.bericht,
      aangevraagdOp: rij.created_at,
    };
  });
}

export async function beslisVerzoek(
  requestId: string,
  naar: 'accepted' | 'declined',
): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('beslis_lidmaatschapsverzoek', {
    p_request_id: requestId,
    p_naar: naar,
  });

  if (error) {
    reportError(error, 'groups.decide_request', { pgcode: error.code });
    return { ok: false, melding: t('ontdek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: true };
}

/**
 * Zet de groep vindbaar, of juist niet.
 *
 * ⚠️ `bevestigd` is geen formaliteit maar de kern: niemand mag er achteraf
 *    achter komen dat zijn groep vindbaar is geworden voor onbekenden. De RPC
 *    weigert zonder, en de groep krijgt er een systeembericht van.
 */
export async function zetOntdekbaar(
  groupId: string,
  naar: boolean,
  bevestigd: boolean,
): Promise<Resultaat<boolean>> {
  const { data, error } = await supabase().rpc('zet_groepsontdekbaarheid', {
    p_group_id: groupId,
    p_naar: naar,
    p_bevestigd: bevestigd,
  });

  if (error) {
    reportError(error, 'groups.set_discoverable', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('ontdek.mislukt') };
  }

  const uit = data as unknown as { ok?: boolean; reason?: string; ontdekbaar?: boolean };
  if (uit.ok !== true) return { ok: false, melding: meldingBijReden(uit.reason) };

  return { ok: true, waarde: uit.ontdekbaar ?? naar };
}
