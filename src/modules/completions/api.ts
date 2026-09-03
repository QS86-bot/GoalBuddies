import type { Tables } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import type { Cycle } from '../../shared/time';
import { invoerfout, type Resultaat } from '../../shared/api';
import type { Bewijseis } from '../buddies';

import {
  afrondSchema,
  dagzetSchema,
  type AfrondInvoer,
  type DagzetInvoer,
} from './completion-schemas';

// ⚠️ Opnieuw geëxporteerd zodat de aanroepers via `modules/<naam>/index.ts`
//    ongemoeid blijven. De definitie staat sinds 25-08-2026 in `shared/api`;
//    hij stond hiervoor zeven keer woordelijk in deze codebase.
export type { Resultaat };

/**
 * Voltooiingen: een weekdoel afronden, met bewijs — QS8-46.
 *
 * ⚠️ Append-only (domeinregel 6). Een correctie is een nieuwe rij plus
 *    `superseded_by` op de oude, nooit een overschrijving. De unieke index
 *    `completions_active_uniq` bewaakt dat er per weekdoel precies één actieve
 *    voltooiing is.
 */

export type Voltooiing = Tables<'completions'>;
export type DagZet = Tables<'daily_moves'>;


/**
 * Wat een groep aan bewijs eist, uit `groups.evidence_policy` (6.5).
 *
 * ⚠️ **Overgenomen uit `modules/buddies` en niet hier opnieuw opgeschreven —
 *    QS8-261.** Hier stond tot 0150 een eigen unie met dezelfde drie waarden
 *    erin. Toen `note_and_attachment` uit `BEWIJSEISEN` verdween, moest hij dus
 *    op twee plekken weg, en er was niets dat rood werd als je er één vergat.
 *    Dat is de vorm van 0032/0034: twee lijsten die hetzelfde horen te zeggen,
 *    lopen uiteen.
 *
 *    Een `import type` is bij het compileren volledig weg, dus dit koppelt geen
 *    runtime aan `modules/buddies` — de reden waarom module-communicatie via
 *    `index.ts` loopt, blijft heel.
 */
export type { Bewijseis };

/**
 * Rondt een weekdoel af.
 *
 * ⚠️ De status wordt `pending`, nooit direct `approved`. Ook niet als je alleen
 *    werkt: zelf afvinken is geen goedkeuring. Zonder groep blijft het weekdoel
 *    dus op `pending` staan — het telt voor je voortgang, maar levert geen
 *    punten op tot iemand het bevestigt. En het kost ook geen minpunt; een
 *    trage of ontbrekende buddy mag jou niet benadelen.
 *
 * ⚠️ `cycle_start_date` sturen we niet mee. De trigger `pin_completion_cycle`
 *    (migratie 0006) haalt hem uit het weekdoel. Zou de client hem kiezen, dan
 *    is een gemiste week achteraf alsnog te claimen.
 *
 * ⚠️ De bewijseis komt niet meer van de aanroeper. Tot migratie 0021 kreeg deze
 *    functie hem als parameter mee, en dat is dezelfde fout die 0006 en 0007
 *    vier keer hebben gedicht: een client die de regel meelevert waaraan hij
 *    getoetst wordt, is geen regel maar een verzoek. De trigger
 *    `enforce_evidence_policy` beslist nu, en `eis` is hier alleen nog nodig om
 *    de melding te kunnen geven vóórdat de server hem geeft.
 */
export async function rondAf(
  weeklyGoalId: string,
  userId: string,
  invoer: AfrondInvoer,
  eis: Bewijseis = 'note_required',
): Promise<Resultaat<Voltooiing>> {
  const gevalideerd = afrondSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('voltooiing.invoer')) };
  }

  const notitie = gevalideerd.data.note?.trim() ?? '';
  if (eis !== 'optional' && notitie.length === 0) {
    return {
      ok: false,
      melding: t('voltooiing.notitie_nodig'),
    };
  }

  const { data, error } = await supabase()
    .from('completions')
    .insert({
      weekly_goal_id: weeklyGoalId,
      user_id: userId,
      achieved_level: gevalideerd.data.achieved_level,
      note: notitie === '' ? null : notitie,
      // De trigger overschrijft dit met de cyclus van het weekdoel. Meesturen is
      // verplicht (NOT NULL); wat je stuurt maakt niet uit.
      cycle_start_date: '1970-01-01',
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'completions.create', { weekly_goal_id: weeklyGoalId, pgcode: error.code });

    // ⚠️ 23514 is de check_violation van `enforce_evidence_policy`, maar hij
    //    dekt óók `completions_level_valid` en `completions_note_length`. De
    //    melding noemt daarom de notitie zonder te beweren dat dát het probleem
    //    was — een verkeerde diagnose is erger dan een vage.
    if (error.code === '23514') {
      return {
        ok: false,
        melding: t('voltooiing.geweigerd'),
      };
    }

    return { ok: false, melding: t('voltooiing.afronden_mislukt') };
  }

  // ⚠️ Geen tweede verzoek om de status op `pending` te zetten. Sinds migratie
  //    0023 kan de client `weekly_goals.status` niet meer schrijven — die kolom
  //    was de achterdeur om jezelf goed te keuren — en doet de trigger
  //    `completions_mark_pending` het in dezelfde transactie. Dat repareert
  //    meteen het geval waarin dat tweede verzoek wegviel: dan bereikte de week
  //    nooit `pending`, stond hij in niemands wachtrij, en boekte de rollover
  //    een minpunt voor een week die wél af was.
  return { ok: true, waarde: data };
}

/**
 * De bewijseis van de strengste groep waar dit doel aan hangt — QS8-66.
 *
 * ⚠️ Alleen om de gebruiker vooraf te vertellen wat er van hem verwacht wordt.
 *    De afdwinging staat in de trigger `enforce_evidence_policy` (migratie
 *    0021), die dezelfde "strengste wint"-regel hanteert. Zou dit de enige
 *    controle zijn, dan bepaalt een aangepaste client hoeveel bewijs een groep
 *    krijgt.
 */
export async function bewijseisVoorDoel(goalId: string): Promise<Bewijseis> {
  const koppelingen = await supabase()
    .from('goal_group_links')
    .select('group_id')
    .eq('goal_id', goalId)
    .limit(20);

  if (koppelingen.error) {
    reportError(koppelingen.error, 'completions.policy', {
      goal_id: goalId,
      pgcode: koppelingen.error.code,
    });
    // Bij twijfel de strengste die haalbaar is: liever een notitie te veel
    // gevraagd dan een afronding die de server alsnog weigert.
    return 'note_required';
  }

  const groepIds = (koppelingen.data ?? []).map((rij) => rij.group_id);
  if (groepIds.length === 0) return 'optional';

  // ⚠️ Twee ronden en geen ingebedde select. Een `groups(evidence_policy)`-join
  //    is hier niet te typeren — PostgREST kent de relatie wel, de generator
  //    niet — en dat zou een cast kosten op precies het veld dat bepaalt hoeveel
  //    bewijs iemand moet leveren.
  const { data, error } = await supabase()
    .from('groups')
    .select('evidence_policy')
    .in('id', groepIds);

  if (error) {
    reportError(error, 'completions.policy', { goal_id: goalId, pgcode: error.code });
    return 'note_required';
  }

  const eisen = (data ?? []).map((g) => g.evidence_policy);

  // ⚠️ Dezelfde "strengste wint"-volgorde als `enforce_evidence_policy()` in de
  //    database, en dat moet zo blijven: deze functie vertelt de gebruiker
  //    vooraf wat er van hem verwacht wordt, de trigger weigert achteraf. Zeggen
  //    ze iets anders, dan krijgt hij een foutmelding voor iets waar het scherm
  //    niet om vroeg. De `note_and_attachment`-tak stond hier tot 0150 (QS8-261).
  if (eisen.includes('note_required')) return 'note_required';
  return 'optional';
}

export async function fetchVoltooiing(weeklyGoalId: string): Promise<Voltooiing | null> {
  const { data, error } = await supabase()
    .from('completions')
    .select('*')
    .eq('weekly_goal_id', weeklyGoalId)
    .is('superseded_by', null)
    .maybeSingle();

  if (error) {
    reportError(error, 'completions.get', { weekly_goal_id: weeklyGoalId, code: error.code });
    return null;
  }

  return data;
}

// ---------------------------------------------------------------------------
// De Dagzet — QS8-50
// ---------------------------------------------------------------------------

/**
 * Legt een Dagzet vast.
 *
 * ⚠️ Domeinregel 9: standaard privé, nooit punten, nooit goedkeuring. De Dagzet
 *    is aanwezigheid en geen prestatie — een dagboekregel die je desgewenst
 *    deelt. Een dag overslaan heeft geen enkel gevolg, en er is dus ook geen
 *    reeks en geen inhaalactie.
 *
 * `localDate` komt van de aanroeper: welke dag het is, hangt af van de tijdzone
 * van de gebruiker en dat bepaalt alleen `shared/time`.
 */
export async function zetDagzet(
  userId: string,
  invoer: DagzetInvoer,
  localDate: string,
): Promise<Resultaat<DagZet>> {
  const gevalideerd = dagzetSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('voltooiing.invoer')) };
  }

  const { data, error } = await supabase()
    .from('daily_moves')
    .insert({
      user_id: userId,
      body: gevalideerd.data.body,
      weekly_goal_id: gevalideerd.data.weekly_goal_id,
      visibility: gevalideerd.data.visibility,
      local_date: localDate,
    })
    .select('*')
    .single();

  if (error) {
    reportError(error, 'moves.create', { user_id: userId, code: error.code });
    return { ok: false, melding: t('voltooiing.opslaan_mislukt') };
  }

  return { ok: true, waarde: data };
}

/** De Dagzetten van deze cyclus, nieuwste eerst. */
export async function fetchDagzetten(
  userId: string,
  cyclus: Cycle,
): Promise<readonly DagZet[]> {
  const { data, error } = await supabase()
    .from('daily_moves')
    .select('*')
    .eq('user_id', userId)
    .gte('local_date', cyclus.startDate)
    .lte('local_date', cyclus.endDate)
    .order('local_date', { ascending: false })
    .limit(50);

  if (error) {
    reportError(error, 'moves.list', { user_id: userId, code: error.code });
    throw new Error(t('voltooiing.dagzet_laden'));
  }

  return data ?? [];
}
