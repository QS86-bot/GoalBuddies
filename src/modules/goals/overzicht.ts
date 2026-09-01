import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import type { Cycle } from '../../shared/time';

import { standUitWeekdoelen, type Weekbalk, type WeekRij } from './overzicht-stand';

/**
 * De verzoeken achter het persoonlijke overzicht — QS8-256.
 *
 * ⚠️ De productbeslissingen staan in `overzicht-stand.ts`; dit bestand haalt
 *    alleen op. Zie daar waarom die twee gescheiden zijn.
 *
 * ⚠️ **Er wordt hier geen week uitgerekend.** De cycli komen van de aanroeper en
 *    dus uit `shared/time` (correctheidsregel 7). Deze module krijgt een lijst
 *    startdatums en vraagt de database wat er in die weken gebeurd is; welke
 *    week het is, weet hij niet.
 *
 * ⚠️ **Eén verzoek voor twaalf weken, geen lus.** Twaalf losse queries zou de
 *    klassieke N+1 zijn op een scherm dat per definitie over een reeks weken
 *    gaat (onwrikbare regel 12).
 *
 * ⚠️ **Alles hierin is privé en hoort nergens op een groepsscherm.** Een reeks
 *    weekbalken waarin gemiste weken zichtbaar zijn, is domeinregel 7 in zijn
 *    zuiverste vorm — voor jezelf mag het (CLAUDE.md: "eigen tegenvallers zijn
 *    privé zichtbaar voor jezelf"), voor een ander nooit. `weekly_goals_select`
 *    houdt dat tegen, maar geef deze types nooit aan een component met een
 *    `viewer`-prop.
 */

/** Zoals PostgREST de ingebedde voltooiingen teruggeeft. */
interface RuweWeek {
  readonly cycle_start_date: string | null;
  readonly status: string | null;
  readonly completions?: readonly {
    readonly achieved_level: string | null;
    readonly superseded_by: string | null;
  }[];
}

/**
 * Het niveau van de voltooiing die telt.
 *
 * ⚠️ **`superseded_by` overslaan is geen detail.** Wie zijn week opnieuw
 *    indient, laat een oude rij staan met `superseded_by` gevuld — dat is de
 *    append-only regel (domeinregel 6). Zou die meetellen, dan zou een
 *    verbeterde week soms nog op zijn oude niveau staan.
 */
function niveauVan(week: RuweWeek): 'floor' | 'ceiling' | null {
  for (const voltooiing of week.completions ?? []) {
    if (voltooiing.superseded_by !== null) continue;
    if (voltooiing.achieved_level === 'ceiling') return 'ceiling';
    if (voltooiing.achieved_level === 'floor') return 'floor';
  }
  return null;
}

/**
 * De weekbalken van de ingelogde gebruiker.
 *
 * ⚠️ **Eén verzoek, met de voltooiingen ingebed.** Het niveau staat op
 *    `completions` en de status op `weekly_goals`; twee losse queries zou hier
 *    betekenen dat de twee helften van dezelfde week uit twee momenten komen.
 */
export async function fetchWeekbalken(
  userId: string,
  cycli: readonly Cycle[],
): Promise<readonly Weekbalk[]> {
  const eerste = cycli[0];
  const laatste = cycli[cycli.length - 1];
  if (eerste === undefined || laatste === undefined) return [];

  const { data, error } = await supabase()
    .from('weekly_goals')
    .select(
      'cycle_start_date, status, goals!inner(owner_id), completions(achieved_level, superseded_by)',
    )
    .eq('goals.owner_id', userId)
    .gte('cycle_start_date', eerste.startDate)
    .lte('cycle_start_date', laatste.startDate)
    // Twaalf weken maal een ruim aantal doelen. RLS beperkt dit al tot de eigen
    // rijen; deze grens is er voor onwrikbare regel 10.
    .limit(500);

  if (error) {
    reportError(error, 'overzicht.weken', { user_id: userId, code: error.code });
    throw new Error(t('overzicht.laden_mislukt'));
  }

  const perCyclus = new Map<string, WeekRij[]>();
  for (const ruw of (data ?? []) as unknown as readonly RuweWeek[]) {
    if (ruw.cycle_start_date === null || ruw.status === null) continue;

    const rij: WeekRij = { status: ruw.status, niveau: niveauVan(ruw) };
    const bestaand = perCyclus.get(ruw.cycle_start_date);
    if (bestaand === undefined) perCyclus.set(ruw.cycle_start_date, [rij]);
    else bestaand.push(rij);
  }

  return cycli.map((cyclus) => {
    const rijen = perCyclus.get(cyclus.startDate) ?? [];
    return { cyclus: cyclus.startDate, stand: standUitWeekdoelen(rijen), aantal: rijen.length };
  });
}
