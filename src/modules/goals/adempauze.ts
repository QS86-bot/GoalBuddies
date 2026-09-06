import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';

import { MAX_ADEMPAUZE_CYCLI } from './adempauze-periode';

import type { Resultaat } from './weekly';

/**
 * De adempauze — QS8-82, migratie 0048.
 *
 * ⚠️ Vakantie, ziekte, een piek op het werk. Een reis hoort je niet terug naar
 *    nul te zetten. De rollover kende de adempauze al: loopt er een over een
 *    cyclus, dan krijgt het weekdoel `excused` in plaats van `missed` en wordt
 *    het minpunt niet geboekt (domeinregel 10: adempauze is 0).
 *
 * ⚠️ De reeks wacht, hij groeit niet. `herbereken_reeks()` laat `excused` door
 *    beide takken heen vallen: hij breekt de reeks niet en telt er ook niet bij
 *    op. Dat is precies wat "de reeks wacht" hoort te betekenen.
 *
 * ⚠️ **Wat de groep ziet is de aankondiging, niet de weken.** `breathers` is
 *    leesbaar voor groepsgenoten van een gekoppeld doel — dat is het
 *    acceptatiecriterium "vooraf aangekondigd", en het is domeinregel 7's eigen
 *    uitzondering: tegenslag mag de groep bereiken via de gebruiker zelf. De
 *    statuskolom per week is sinds migratie 0047 juist dicht. De groep ziet dus
 *    "Sanne heeft een adempauze van week X tot Y" en niet welke weken ze miste.
 */

export interface Adempauze {
  readonly id: string;
  readonly goal_id: string;
  readonly starts_cycle: string;
  readonly ends_cycle: string;
  readonly announced_at: string;
}

/**
 * De adempauzes van één doel, nieuwste eerst.
 *
 * Geen filter op "nog niet voorbij": een verstreken adempauze is geschiedenis
 * die je moet kunnen terugzien, en het zijn er hoogstens een handvol.
 */
export async function fetchAdempauzes(goalId: string): Promise<readonly Adempauze[]> {
  const { data, error } = await supabase()
    .from('breathers')
    .select('id, goal_id, starts_cycle, ends_cycle, announced_at')
    .eq('goal_id', goalId)
    .order('starts_cycle', { ascending: false })
    .limit(20);

  if (error) {
    reportError(error, 'goals.breathers', { goal_id: goalId, code: error.code });
    throw new Error(t('adempauze.laden_mislukt'));
  }

  return data ?? [];
}

/**
 * Plant een adempauze over een reeks hele cycli.
 *
 * ⚠️ Via een RPC, want de grenzen horen in de database. Vóór migratie 0048 stond
 *    `breathers` wagenwijd open: met één API-verzoek legde je een adempauze van
 *    tien jaar over al je doelen en kreeg je nooit meer een minpunt. "Maximaal
 *    twee cycli" stond in de issue en nergens in de database — hetzelfde patroon
 *    als A35.
 *
 * ⚠️ **De lengtegrens is er sinds QS8-227 niet meer, de rest wel.** Wat er
 *    bewust is opgegeven en wat er overeind bleef, staat in
 *    `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`. De opsomming
 *    hierboven blijft staan omdat ze uitlegt waaróm dit via een RPC loopt, en
 *    dat verandert niet.
 */
export async function planAdempauze(
  goalId: string,
  start: Cycle,
  eind: Cycle,
): Promise<Resultaat<string>> {
  const { data, error } = await supabase().rpc('plan_adempauze', {
    p_goal_id: goalId,
    p_starts_cycle: start.startDate,
    p_ends_cycle: eind.startDate,
  });

  if (error) {
    reportError(error, 'goals.breather.plan', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('adempauze.inplannen_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string; id?: string };
  if (uitkomst.ok !== true || uitkomst.id === undefined) {
    return { ok: false, melding: planMelding(uitkomst.reason) };
  }

  return { ok: true, waarde: uitkomst.id };
}

function planMelding(reden: string | undefined): string {
  switch (reden) {
    // ⚠️ **`niet_vooraf` staat hier niet meer, en dat is met opzet geen "voor de
    //    zekerheid laten staan".** `plan_adempauze()` geeft die reden sinds
    //    migratie 0165 niet meer terug; een tak die niet meer bereikt kan worden,
    //    doet net alsof de regel nog bestaat en houdt de bijbehorende zin in de
    //    vertaalbestanden in leven. Zie
    //    `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`.
    //
    // ⚠️ **`te_lang` staat er wél nog, maar betekent iets anders.** Twee cycli is
    //    een jaar geworden, en om een andere reden — zie §7 van hetzelfde
    //    document. Deze tak is de vangnetkant: het scherm toont de grens al
    //    vóór de knop, dus wie hier komt, kwam ergens anders vandaan.
    case 'te_lang':
      return t('adempauze.te_lang', { max: MAX_ADEMPAUZE_CYCLI });
    case 'overlapt':
      return t('adempauze.overlap');
    case 'geen_cyclusstart':
      return t('adempauze.geen_hele_week');
    case 'omgekeerde_periode':
      return t('adempauze.eind_voor_start');
    case 'not_owner':
      return t('doel.niet_van_jou');
    default:
      return t('adempauze.inplannen_mislukt');
  }
}

/**
 * Annuleert een adempauze die nog niet begonnen is.
 *
 * ⚠️ Een lopende of verstreken adempauze blijft staan (domeinregel 6). Hem
 *    weghalen zou de weken die de rollover al op `excused` heeft gezet losmaken
 *    van hun reden.
 */
export async function annuleerAdempauze(id: string): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('annuleer_adempauze', { p_id: id });

  if (error) {
    reportError(error, 'goals.breather.cancel', { code: error.code });
    return { ok: false, melding: t('adempauze.annuleren_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'al_begonnen'
          ? t('adempauze.al_begonnen')
          : t('adempauze.annuleren_mislukt'),
    };
  }

  return { ok: true, waarde: true };
}
