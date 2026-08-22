import { z } from 'zod';

import { t } from '../../shared/i18n';

import type { Database } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

/**
 * Peer-goedkeuring — EPIC 6.
 *
 * ⚠️ Domeinregel 3: dit is een autorisatiegrens, geen werkstroom. Alleen een lid
 *    van dezelfde buddy-groep mag een voltooiing goedkeuren, en nooit zichzelf.
 *    Dat staat in een CHECK op `completion_approvals` (`approver_id <>
 *    subject_id`), in de INSERT-policy én in een trigger die `subject_id` vult.
 *    Niets hier in dit bestand is de bescherming — dit is de knop.
 *
 * ⚠️ "Vertel me meer" is geen afwijzing. De PRD noemde het "request changes", en
 *    dat woord maakt van een vraag een oordeel. De meeste ongemakkelijke
 *    gevallen zijn geen fraude maar onduidelijkheid, dus de twee acties zijn
 *    gelijkwaardig — ook in de punten: allebei leveren ze de beoordelaar
 *    hetzelfde op (6.6), want anders is doorvragen duurder dan wegkijken.
 */

export type Resultaat<T> = { ok: true; waarde: T } | { ok: false; melding: string };

/** Een voltooiing die op jouw oordeel wacht, uit `openstaande_beoordelingen()`. */
export interface TeBeoordelen {
  readonly completion_id: string;
  readonly weekly_goal_id: string;
  readonly group_id: string;
  readonly owner_id: string;
  readonly owner_name: string;
  readonly owner_avatar: string | null;
  readonly goal_title: string;
  readonly weekly_title: string;
  readonly floor_text: string | null;
  readonly ceiling_text: string | null;
  readonly achieved_level: string;
  readonly note: string | null;
  readonly submitted_at: string;
}

export interface Wachtrij {
  readonly rijen: readonly TeBeoordelen[];
  readonly totaal: number;
  readonly meer: boolean;
}

/**
 * ⚠️ Afgeleid van het gegenereerde type, met nullability erbij. Kolommen van een
 *    set-returning functie komen nooit als nullable uit de generator, terwijl de
 *    left joins en de nullable kolommen ze wel degelijk leeg kunnen laten.
 *    Hernoemt iemand een kolom in SQL, dan breekt de build hier.
 */
type RpcRij = Database['public']['Functions']['openstaande_beoordelingen']['Returns'][number];
type WachtrijRij = { readonly [K in keyof RpcRij]: RpcRij[K] | null };

function naarTeBeoordelen(rij: WachtrijRij): TeBeoordelen | null {
  if (
    typeof rij.completion_id !== 'string' ||
    typeof rij.weekly_goal_id !== 'string' ||
    typeof rij.group_id !== 'string' ||
    typeof rij.owner_id !== 'string'
  ) {
    reportError(new Error('Onvolledige rij uit openstaande_beoordelingen'), 'approvals.parse');
    return null;
  }

  return {
    completion_id: rij.completion_id,
    weekly_goal_id: rij.weekly_goal_id,
    group_id: rij.group_id,
    owner_id: rij.owner_id,
    owner_name: rij.owner_name ?? t('beoordeling.een_buddy'),
    owner_avatar: rij.owner_avatar,
    goal_title: rij.goal_title ?? '',
    weekly_title: rij.weekly_title ?? '',
    floor_text: rij.floor_text,
    ceiling_text: rij.ceiling_text,
    achieved_level: rij.achieved_level ?? 'ceiling',
    note: rij.note,
    submitted_at: rij.submitted_at ?? '',
  };
}

export const PER_PAGINA = 20;

/**
 * Wat er op jouw oordeel wacht — QS8-62.
 *
 * ⚠️ Eén aanroep voor de hele lijst, met de indiener, het weekdoel én het bewijs
 *    erin. Dat is een acceptatiecriterium: "melding bevat het weekdoel én het
 *    bewijs, zodat beoordelen direct kan". Een lijst met alleen namen zou per
 *    regel een tweede verzoek kosten, en dan is beoordelen twee tikken en een
 *    wachttijd.
 */
export async function fetchBeoordelingen(
  opties: { readonly pagina?: number } = {},
): Promise<Wachtrij> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * PER_PAGINA;

  const { data, error } = await supabase().rpc('openstaande_beoordelingen', {
    p_limit: PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'approvals.queue', { pgcode: error.code });
    throw new Error(t('beoordeling.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly WachtrijRij[];
  const rijen = ruw.map(naarTeBeoordelen).filter((r): r is TeBeoordelen => r !== null);
  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.total_open ?? rijen.length) - overgeslagen);

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

export const oordeelSchema = z.object({
  status: z.enum(['approved', 'more_info']),
  comment: z
    .string()
    .trim()
    .max(1000, { error: () => t('validatie.reactie_lang') })
    .nullable(),
});

export type OordeelInvoer = z.infer<typeof oordeelSchema>;

/**
 * Beoordeelt een voltooiing — QS8-63 en QS8-64.
 *
 * ⚠️ `subject_id` wordt hier meegestuurd omdat de kolom NOT NULL is, maar de
 *    trigger `fill_approval_subject` overschrijft hem met de echte eigenaar.
 *    Dat is met opzet: de CHECK die zelfgoedkeuring verbiedt kan geen subquery
 *    doen, dus de eigenaar moet op de rij zelf staan — en dan mag de client hem
 *    niet kiezen.
 *
 * ⚠️ Er wordt hier niets aan punten of status gedaan. Dat doet de trigger
 *    `award_points_on_approval` in dezelfde transactie: weekdoel op `approved`,
 *    punten voor de eigenaar, reviewpunt voor de beoordelaar, reeks herberekend.
 *    Zou de app die stappen los zetten, dan laat een halve run punten zonder
 *    goedkeuring achter — of erger, andersom.
 */
export async function beoordeel(
  completionId: string,
  groupId: string,
  approverId: string,
  invoer: OordeelInvoer,
): Promise<Resultaat<string>> {
  const gevalideerd = oordeelSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: gevalideerd.error.issues[0]?.message ?? t('voltooiing.invoer') };
  }

  const opmerking = gevalideerd.data.comment?.trim() ?? '';

  if (gevalideerd.data.status === 'more_info' && opmerking.length === 0) {
    return {
      ok: false,
      melding: t('beoordeling.vraag_nodig'),
    };
  }

  // ⚠️ De id komt terug omdat het scherm hem nodig heeft om de goedkeuring
  //    binnen een kwartier te kunnen intrekken (Q-TODO A19). Dat de RETURNING-rij
  //    er doorheen komt, hangt aan `completion_approvals_select`: Postgres past
  //    de SELECT-policy óók toe op de rij die een INSERT teruggeeft.
  const { data, error } = await supabase()
    .from('completion_approvals')
    .insert({
      completion_id: completionId,
      approver_id: approverId,
      // De trigger zet de echte eigenaar; deze waarde haalt de NOT NULL.
      subject_id: approverId,
      group_id: groupId,
      status: gevalideerd.data.status,
      comment: opmerking === '' ? null : opmerking,
    })
    .select('id')
    .single();

  if (error) {
    reportError(error, 'approvals.create', { completion_id: completionId, pgcode: error.code });

    // ⚠️ De unieke index op (voltooiing, beoordelaar) is de gebruikelijke
    //    afloop als iemand twee keer op de knop drukt of het scherm oud is. Dat
    //    is geen storing en verdient geen storingsmelding.
    if (error.code === '23505') {
      return { ok: false, melding: t('beoordeling.al_beoordeeld') };
    }

    // ⚠️ Geen gok tussen twee heel verschillende situaties in één zin. De vorige
    //    versie zei "of je bent geen lid meer van deze groep", en dat kreeg je
    //    ook te zien als je sessie net nog aan het laden was — een
    //    beschuldiging voor iets dat vanzelf overgaat.
    return {
      ok: false,
      melding: t('beoordeling.mislukt'),
    };
  }

  return { ok: true, waarde: data.id };
}

/**
 * ⚠️ **Een functie en geen constante** — QS8-115. Een `const` met `t()` erin
 *    wordt één keer bij het importeren opgebouwd, en dat is vóórdat het profiel
 *    geladen is; de taal staat dan vast op de apparaattaal. Zelfde val als bij
 *    `BEVESTIGING` in `shared/ui` en `verwijderMelding()` in `auth`.
 */
function opnieuwMelding(reden: string | undefined): string {
  const tabel: Readonly<Record<string, string>> = {
    bad_level: t('opnieuw.geen_niveau'),
    not_owner: t('opnieuw.niet_van_jou'),
    already_approved: t('opnieuw.al_goedgekeurd'),
    nothing_to_replace: t('opnieuw.niets_ingediend'),
    note_required: t('opnieuw.notitie_vereist'),
  };

  return tabel[reden ?? ''] ?? t('opnieuw.mislukt_kort');
}

/**
 * Dient een week opnieuw in na "vertel me meer" — QS8-63, en het losse eindje
 * van QS8-46.
 *
 * ⚠️ Loopt via een RPC omdat `completions` geen UPDATE-policy heeft: de
 *    geschiedenis is append-only (domeinregel 6), dus corrigeren is een nieuwe
 *    rij plus `superseded_by` op de oude — en dat kan de client niet zelf. De
 *    twee stappen horen bovendien in één transactie, anders houdt een halve run
 *    een weekdoel zonder actieve voltooiing over.
 */
export async function dienOpnieuwIn(
  weeklyGoalId: string,
  achievedLevel: 'floor' | 'ceiling',
  note: string | null,
): Promise<Resultaat<string>> {
  const schoon = note?.trim() ?? '';

  const { data, error } = await supabase().rpc('dien_opnieuw_in', {
    p_weekly_goal_id: weeklyGoalId,
    p_achieved_level: achievedLevel,
    ...(schoon === '' ? {} : { p_note: schoon }),
  });

  if (error) {
    reportError(error, 'approvals.resubmit', { weekly_goal_id: weeklyGoalId, pgcode: error.code });
    return { ok: false, melding: t('opnieuw.mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; completion_id?: string };

  if (uitkomst.ok !== true || typeof uitkomst.completion_id !== 'string') {
    return {
      ok: false,
      melding: opnieuwMelding(uitkomst.reason),
    };
  }

  return { ok: true, waarde: uitkomst.completion_id };
}

/** Zolang je een goedkeuring nog kunt intrekken — gelijk aan de RPC. */
export const INTREKVENSTER_MINUTEN = 15;

/** Zie `opnieuwMelding()`: een functie, om dezelfde reden. */
function intrekMelding(reden: string | undefined): string {
  const tabel: Readonly<Record<string, string>> = {
    not_found: t('intrekken.bestaat_niet'),
    not_yours: t('intrekken.niet_van_jou'),
    window_closed: t('intrekken.te_laat'),
    already_withdrawn: t('intrekken.al_gedaan'),
  };

  return tabel[reden ?? ''] ?? t('intrekken.mislukt_kort');
}

/**
 * Trekt je eigen goedkeuring in — Q-TODO A19.
 *
 * ⚠️ Append-only (domeinregel 6): de goedkeuring blijft staan en er komt een
 *    correctie-record naast. De punten worden tegengeboekt met
 *    `reason = 'correction'`, niet weggehaald — die reden bestond al, dus het
 *    puntenmodel uit domeinregel 10 verandert niet.
 *
 * ⚠️ Vijftien minuten, hetzelfde venster als het bewerken van een chatbericht.
 *    Gekozen boven een bevestigingsstap vooraf: het beoordeelscherm heeft met
 *    opzet twee gelijkwaardige knoppen zonder tussenstap (6.1), en een
 *    bevestiging kost die vlotheid bij élke goedkeuring in plaats van bij de
 *    zeldzame verkeerde.
 *
 * ⚠️ Er gaat geen systeembericht uit. Een intrekking zegt "de week van X is toch
 *    niet bevestigd" en dat is een tegenslagsignaal over iemand anders
 *    (domeinregel 7). De aankondiging van de goedkeuring wordt in plaats daarvan
 *    weggehaald.
 *
 * Geeft terug of de week écht terugging naar `pending`. Keurde een tweede buddy
 * dezelfde week ook goed, dan blijft hij goedgekeurd en is `waarde` `false`.
 */
export async function trekGoedkeuringIn(approvalId: string): Promise<Resultaat<boolean>> {
  const { data, error } = await supabase().rpc('trek_goedkeuring_in', {
    p_approval_id: approvalId,
  });

  if (error) {
    reportError(error, 'approvals.withdraw', { approval_id: approvalId, pgcode: error.code });
    return { ok: false, melding: t('intrekken.mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; reverted?: boolean };

  if (uitkomst.ok !== true) {
    return { ok: false, melding: intrekMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: uitkomst.reverted ?? false };
}

export interface Vraag {
  readonly id: string;
  readonly comment: string;
  readonly created_at: string;
}

/**
 * De vragen die buddy's bij dit weekdoel gesteld hebben — QS8-63.
 *
 * ⚠️ Zonder dit is "vertel me meer" een dood spoor: de beoordelaar stelt een
 *    vraag die de indiener nergens ziet. Dat is erger dan geen knop, want de
 *    beoordelaar denkt dat hij iets gedaan heeft.
 *
 * ⚠️ Alleen de vragen, niet de goedkeuringen. Wie wél goedkeurde is voor de
 *    indiener niet interessant op dit scherm, en het staat al in De Ketting.
 */
export async function fetchVragen(weeklyGoalId: string): Promise<readonly Vraag[]> {
  const voltooiing = await supabase()
    .from('completions')
    .select('id')
    .eq('weekly_goal_id', weeklyGoalId)
    .is('superseded_by', null)
    .maybeSingle();

  if (voltooiing.error || voltooiing.data === null) return [];

  const { data, error } = await supabase()
    .from('completion_approvals')
    .select('id, comment, created_at')
    .eq('completion_id', voltooiing.data.id)
    .eq('status', 'more_info')
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    reportError(error, 'approvals.questions', { weekly_goal_id: weeklyGoalId, pgcode: error.code });
    return [];
  }

  return (data ?? [])
    .filter((rij): rij is typeof rij & { comment: string } => typeof rij.comment === 'string')
    .map((rij) => ({ id: rij.id, comment: rij.comment, created_at: rij.created_at }));
}

/**
 * Je buddy-bijdrage: hoeveel weken van anderen je beoordeeld hebt — QS8-67.
 *
 * ⚠️ Apart van je doelvoortgang, en dat is een acceptatiecriterium. Het zijn
 *    punten in hetzelfde grootboek maar zonder `goal_id`, zodat ze niet
 *    meetellen in de reeks of het totaal van een doel waar ze niets mee te
 *    maken hebben.
 *
 * ⚠️ Alleen voor jezelf leesbaar. `points_ledger` heeft `user_id = auth.uid()`
 *    als enige SELECT-regel; deze functie kan dus niet per ongeluk het cijfer
 *    van een ander opleveren (domeinregel 10).
 */
export async function fetchBuddyBijdrage(userId: string): Promise<number> {
  const { count, error } = await supabase()
    .from('points_ledger')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reason', 'review_given');

  // ⚠️ Gooien en geen 0 teruggeven. Nul is hier een échte uitkomst — "je hebt
  //    nog niets beoordeeld" — en die van een netwerkfout niet te onderscheiden
  //    maken, betekent dat de app tegen iemand liegt die veertig weken heeft
  //    beoordeeld. Precies het soort demotivatie waar deze teller tegen is.
  if (error) {
    reportError(error, 'approvals.contribution', { pgcode: error.code });
    throw new Error(t('beoordeling.bijdrage_laden'));
  }

  return count ?? 0;
}

/**
 * Meldt wanneer er iets nieuws te beoordelen valt — QS8-62.
 *
 * ⚠️ Realtime en geen polling: het acceptatiecriterium is twee seconden. De
 *    server past RLS toe op deze gebeurtenissen, dus je krijgt alleen rijen
 *    binnen die `completions_select` ook zou doorlaten — de policy blijft de
 *    bescherming, niet dit abonnement.
 *
 * ⚠️ Ook op `weekly_goals`, want een verzoek verdwijnt pas als de status op
 *    `approved` gaat. Zonder dat signaal blijft een al goedgekeurde week in de
 *    lijst staan tot iemand het scherm ververst.
 *
 * Geeft een opzegfunctie terug. Die moet aangeroepen worden bij het opruimen van
 * het scherm; een abonnement dat blijft hangen, telt door op een gratis tier.
 */
export function volgBeoordelingen(opWijziging: () => void): () => void {
  const kanaal = supabase()
    .channel('beoordelingen')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'completions' }, () =>
      opWijziging(),
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'weekly_goals' }, () =>
      opWijziging(),
    )
    .subscribe();

  return () => {
    void supabase().removeChannel(kanaal);
  };
}
