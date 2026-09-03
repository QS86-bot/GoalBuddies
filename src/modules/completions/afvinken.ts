import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import type { Cycle } from '../../shared/time';
import type { Resultaat } from '../../shared/api';

/**
 * Dagafvinkingen bij een ritme-weekdoel — QS8-253, migratie 0140.
 *
 * Een afvinking is geen Dagzet. De Dagzet is aanwezigheid zonder gevolg
 * (domeinregel 9); een afvinking telt mee voor de vraag of de wéék gehaald is.
 * Ze staan daarom in aparte tabellen — de volledige afweging staat in de kop van
 * 0140.
 *
 * ⚠️ **Geen enkele functie hier rekent een dag of een week uit.** `localDate`
 *    komt van de aanroeper, die hem uit `shared/time` haalt — welke dag het is,
 *    hangt af van de tijdzone van de gebruiker (correctheidsregel 7). Wat de
 *    server toetst is dat die datum binnen de cyclus van het weekdoel valt.
 *
 * ⚠️ **Dit is privé en het hoort nergens op een groepsscherm.** `day_checkins`
 *    is eigenaar-only zonder tak voor groepsgenoten, ook in een open groep
 *    (A41). Een rooster met gaten is fijnmaziger tegenslag dan een gemiste week.
 */

export type Dagafvinking = Tables<'day_checkins'>;

/**
 * De afgevinkte dagen van één weekdoel.
 *
 * ⚠️ Geen `limit` op zeven maar op de query zelf: de unieke index
 *    `day_checkins_een_per_dag` maakt meer dan zeven rijen per weekdoel
 *    onmogelijk, en een grens die al door de database wordt afgedwongen nog eens
 *    in de client zetten, verbergt hooguit een defect.
 */
export async function fetchAfvinkingen(weeklyGoalId: string): Promise<readonly string[]> {
  const { data, error } = await supabase()
    .from('day_checkins')
    .select('local_date')
    .eq('weekly_goal_id', weeklyGoalId)
    .order('local_date', { ascending: true });

  if (error) {
    reportError(error, 'checkins.list', { weekly_goal_id: weeklyGoalId, code: error.code });
    throw new Error(t('ritme.afvinken_mislukt'));
  }

  return (data ?? []).map((rij) => rij.local_date);
}

/**
 * De afgevinkte dagen van álle ritme-weekdoelen in één cyclus.
 *
 * ⚠️ Eén query en geen lus over weekdoelen. Het hoofdscherm toont de hele week
 *    van alle doelen, dus een verzoek per weekdoel is hier de klassieke N+1
 *    (onwrikbare regel 12).
 *
 * @returns per `weekly_goal_id` het aantal afgevinkte dagen.
 */
export async function fetchAfvinktellingen(
  cyclus: Cycle,
): Promise<ReadonlyMap<string, number>> {
  const { data, error } = await supabase()
    .from('day_checkins')
    .select('weekly_goal_id')
    .gte('local_date', cyclus.startDate)
    .lte('local_date', cyclus.endDate)
    // Zeven dagen maal een ruim aantal doelen. RLS beperkt dit al tot de eigen
    // rijen; deze grens is er voor onwrikbare regel 10 en niet voor de veiligheid.
    .limit(700);

  if (error) {
    // ⚠️ Zacht: dit voedt een teller náást een weekdoel, geen gegeven dat het
    //    scherm nodig heeft om te laden. Een lege telling toont "0 van 5", en
    //    dat is beter dan een hoofdscherm dat niet opkomt.
    reportError(error, 'checkins.counts', { code: error.code });
    return new Map();
  }

  const tellingen = new Map<string, number>();
  for (const rij of data ?? []) {
    tellingen.set(rij.weekly_goal_id, (tellingen.get(rij.weekly_goal_id) ?? 0) + 1);
  }

  return tellingen;
}

/**
 * Vinkt een dag af.
 *
 * ⚠️ **Twee keer afvinken is geen fout.** De unieke index
 *    `day_checkins_een_per_dag` weigert de tweede rij met `23505`, en dat is
 *    precies wat er hoort te gebeuren — maar voor de gebruiker is de uitkomst
 *    "vandaag staat afgevinkt", en dat wás al zo. Een storingsmelding op een
 *    dubbele tik is een melding over de app en niet over zijn week.
 */
export async function vinkDagAf(
  weeklyGoalId: string,
  localDate: string,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('day_checkins')
    .insert({ weekly_goal_id: weeklyGoalId, local_date: localDate });

  if (error === null) return { ok: true, waarde: true };

  // 23505 = unieke schending. De dag stond al afgevinkt; de gewenste toestand is
  // bereikt.
  if (error.code === '23505') return { ok: true, waarde: true };

  reportError(error, 'checkins.create', { weekly_goal_id: weeklyGoalId, code: error.code });
  return { ok: false, melding: meldingBijAfvinkfout(error.code) };
}

/**
 * Maakt een afvinking ongedaan.
 *
 * ⚠️ Verwijderen en niet bijwerken. Een afvinking heeft geen veld dat je kunt
 *    veranderen: hij bestaat of hij bestaat niet. 0140 geeft `authenticated`
 *    daarom geen UPDATE-recht — dat zou de weg openen om `local_date` te
 *    verzetten, en dat is precies de backdating die de trigger dichtzet.
 */
export async function maakAfvinkingOngedaan(
  weeklyGoalId: string,
  localDate: string,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('day_checkins')
    .delete()
    .eq('weekly_goal_id', weeklyGoalId)
    .eq('local_date', localDate);

  if (error) {
    reportError(error, 'checkins.delete', { weekly_goal_id: weeklyGoalId, code: error.code });
    return { ok: false, melding: t('ritme.afvinken_mislukt') };
  }

  // ⚠️ Geen rij geraakt is hier géén weigering: de dag stond niet afgevinkt en
  //    dat is de gewenste toestand. Anders zou "toch niet" twee keer indrukken
  //    een foutmelding geven op iets wat gelukt is.
  return { ok: true, waarde: true };
}

/**
 * De melding bij een geweigerde afvinking.
 *
 * ⚠️ Elke code die 0140 kan opleveren heeft een eigen zin. Een `default` die
 *    alles opvangt zou een nieuwe reden stil laten verdwijnen achter "er ging
 *    iets mis" — en dan heeft de database precies verteld wat er aan de hand was
 *    en ziet de gebruiker het niet.
 */
export function meldingBijAfvinkfout(code: string | undefined): string {
  // De trigger `afvinking_binnen_de_cyclus` gooit met `check_violation`, en de
  // dagrem in `day_checkins_insert` levert een policy-weigering op.
  if (code === '23514') return t('ritme.buiten_de_week');
  if (code === '42501') return t('ritme.te_veel_deze_dag');
  return t('ritme.afvinken_mislukt');
}

/**
 * Op welke dagen er in een periode iets is afgevinkt, met hoeveel per dag.
 *
 * ⚠️ Voedt de kalender op het overzicht (QS8-256). Eén verzoek voor de hele
 *    periode en geen lus over dagen of over doelen — dat laatste zou op een
 *    scherm dat per definitie over een reeks dagen gaat de klassieke N+1 zijn.
 *
 * ⚠️ **Dit blijft privé.** `day_checkins` is eigenaar-only zonder tak voor
 *    groepsgenoten, ook in een open groep (oppervlak 27). Een kalender met gaten
 *    is fijnmaziger tegenslag dan een gemiste week; hij hoort op je eigen scherm
 *    en nergens anders.
 *
 * @param van eerste dag, `YYYY-MM-DD`, uit `shared/time`
 * @param tot laatste dag, `YYYY-MM-DD`, uit `shared/time`
 * @returns per datum het aantal afvinkingen
 */
export async function fetchAfvinkdagen(
  van: string,
  tot: string,
): Promise<ReadonlyMap<string, number>> {
  const { data, error } = await supabase()
    .from('day_checkins')
    .select('local_date')
    .gte('local_date', van)
    .lte('local_date', tot)
    // Een kwartaal maal een ruim aantal doelen. Onwrikbare regel 10.
    .limit(1000);

  if (error) {
    // ⚠️ Zacht, net als `fetchAfvinktellingen()`: dit voedt één blok op een
    //    scherm met meer blokken. Een lege kalender is beter dan een overzicht
    //    dat niet opkomt.
    reportError(error, 'checkins.range', { code: error.code });
    return new Map();
  }

  const perDag = new Map<string, number>();
  for (const rij of data ?? []) {
    perDag.set(rij.local_date, (perDag.get(rij.local_date) ?? 0) + 1);
  }

  return perDag;
}

/**
 * Welke weekdoelen op één specifieke dag zijn afgevinkt.
 *
 * ⚠️ Bestaat naast `fetchAfvinktellingen()` en is er geen afleiding van: bij
 *    drie van de vijf dagen weet je niet óf vandaag erbij zat, en dat is precies
 *    wat de knop moet weten. Twee lichte queries zijn hier goedkoper dan één
 *    zware die alle datums teruggeeft.
 */
export async function fetchAfgevinktOp(localDate: string): Promise<ReadonlySet<string>> {
  const { data, error } = await supabase()
    .from('day_checkins')
    .select('weekly_goal_id')
    .eq('local_date', localDate)
    .limit(200);

  if (error) {
    reportError(error, 'checkins.today', { code: error.code });
    return new Set();
  }

  return new Set((data ?? []).map((rij) => rij.weekly_goal_id));
}
