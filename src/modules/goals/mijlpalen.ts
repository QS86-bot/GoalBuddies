import { t } from '../../shared/i18n';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { now } from '../../shared/time';

import { mijlpaalSchema, type MijlpaalInvoer, type MijlpaalStatus } from './mijlpaal-schemas';
import type { Mijlpaal, Resultaat } from './weekly';
import { invoerfout } from '../../shared/api';

/**
 * Mijlpalen met de hand beheren — QS8-39, migratie 0049.
 *
 * ⚠️ Het handmatige pad moet volledig zijn, ook als er nooit AI aan te pas is
 *    gekomen. De Doelcoach vult mijlpalen in; hij is er niet de voorwaarde voor.
 *
 * ⚠️ `ai_generated` wordt hier **nooit** geschreven. Dat is herkomst, en herkomst
 *    verandert niet doordat je de titel bijwerkt (acceptatiecriterium 3). Een
 *    mijlpaal die de AI voorstelde en die jij daarna hebt aangescherpt, is nog
 *    steeds door de AI voorgesteld.
 */

/**
 * Voegt een mijlpaal toe, onderaan de lijst.
 *
 * ⚠️ `order_index` wordt hier bepaald en niet door het formulier. De unieke
 *    index `(goal_id, order_index)` staat op DEFERRABLE, maar dat helpt alleen
 *    binnen één transactie — een client die zelf een nummer verzint, botst met
 *    de mijlpaal die er al staat.
 */
export async function maakMijlpaal(
  goalId: string,
  invoer: MijlpaalInvoer,
): Promise<Resultaat<Mijlpaal>> {
  const gevalideerd = mijlpaalSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const { data: laatste, error: leesFout } = await supabase()
    .from('milestones')
    .select('order_index')
    .eq('goal_id', goalId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leesFout) {
    reportError(leesFout, 'milestones.next', { goal_id: goalId, code: leesFout.code });
    return { ok: false, melding: t('mijlpaal.toevoegen_mislukt') };
  }

  const { data, error } = await supabase()
    .from('milestones')
    .insert({
      goal_id: goalId,
      title: gevalideerd.data.title,
      description: gevalideerd.data.description,
      target_date: gevalideerd.data.target_date,
      order_index: (laatste?.order_index ?? 0) + 1,
      // ⚠️ Expliciet `false`: dit is de handmatige route. Niet meesturen zou de
      //    kolomstandaard gebruiken, en die staat buiten dit bestand.
      ai_generated: false,
    })
    .select('id, title, status, order_index, target_date')
    .single();

  if (error) {
    reportError(error, 'milestones.create', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('mijlpaal.toevoegen_mislukt') };
  }

  return { ok: true, waarde: data };
}

/** Werkt titel, omschrijving of streefdatum bij. Raakt status noch herkomst. */
export async function wijzigMijlpaal(
  id: string,
  invoer: MijlpaalInvoer,
): Promise<Resultaat<true>> {
  const gevalideerd = mijlpaalSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('doel.invoer')) };
  }

  const { error } = await supabase()
    .from('milestones')
    .update({
      title: gevalideerd.data.title,
      description: gevalideerd.data.description,
      target_date: gevalideerd.data.target_date,
    })
    .eq('id', id);

  if (error) {
    reportError(error, 'milestones.update', { code: error.code });
    return { ok: false, melding: t('mijlpaal.wijzigen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Zet de status van een mijlpaal.
 *
 * ⚠️ **Op `done` zetten plaatst een systeembericht in elke gekoppelde groep**,
 *    via de trigger `meld_mijlpaal()`. Dat is een positief bericht en dus geen
 *    domeinregel 7-kwestie, maar het is wel onomkeerbaar: een chatbericht is een
 *    onveranderlijke kopie. Terugzetten naar `todo` haalt het bericht niet weg,
 *    en opnieuw op `done` zetten plaatst een tweede. Het scherm waarschuwt
 *    daarvoor.
 *
 * ⚠️ `dropped` is de nette manier om een mijlpaal te laten vallen zonder
 *    geschiedenis weg te gooien (domeinregel 6). `verwijderMijlpaal()` bestaat
 *    ernaast voor de vergissing.
 */
export async function zetMijlpaalStatus(
  id: string,
  status: MijlpaalStatus,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('milestones')
    .update({
      status,
      // ⚠️ `now()` uit `shared/time` en niet `new Date()`. De lint-regel vangt
      //    dat af, en terecht: één klok in het project betekent ook dat tests
      //    hem met `freezeNow()` stil kunnen zetten.
      completed_at: status === 'done' ? now().toISOString() : null,
    })
    .eq('id', id);

  if (error) {
    reportError(error, 'milestones.status', { code: error.code, name: status });
    return { ok: false, melding: t('mijlpaal.status_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Verwijdert een mijlpaal.
 *
 * ⚠️ Alleen zinvol voor een mijlpaal waar niets aan hangt. Weekdoelen verwijzen
 *    ernaar via `milestone_id`; die verwijzing is `on delete set null`, dus het
 *    weekdoel blijft bestaan en hangt daarna los onder het doel. Dat is geen
 *    verlies, maar de gebruiker moet het weten — het scherm zegt het.
 */
export async function verwijderMijlpaal(id: string): Promise<Resultaat<true>> {
  const { error } = await supabase().from('milestones').delete().eq('id', id);

  if (error) {
    reportError(error, 'milestones.delete', { code: error.code });
    return { ok: false, melding: t('mijlpaal.verwijderen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Zet de volgorde opnieuw vast — via een RPC, en dat is geen luxe.
 *
 * ⚠️ De unieke index `(goal_id, order_index)` staat op DEFERRABLE INITIALLY
 *    DEFERRED: binnen één transactie mag je schuiven, en pas bij commit wordt er
 *    gekeken. PostgREST draait elk verzoek in zijn eigen transactie, dus drie
 *    losse PATCH-verzoeken lopen gegarandeerd op die index stuk — met een
 *    halfverschoven lijst als resultaat.
 *
 * ⚠️ Stuur de **volledige** lijst in de gewenste volgorde. De RPC weigert een
 *    deelverzameling, want daarmee zijn dubbele posities en gaten te maken.
 */
export async function herordenMijlpalen(
  goalId: string,
  idsInVolgorde: readonly string[],
): Promise<Resultaat<true>> {
  const { data, error } = await supabase().rpc('herorden_mijlpalen', {
    p_goal_id: goalId,
    p_ids: [...idsInVolgorde],
  });

  if (error) {
    reportError(error, 'milestones.reorder', { goal_id: goalId, code: error.code });
    return { ok: false, melding: t('mijlpaal.volgorde_mislukt') };
  }

  const uitkomst = (data ?? {}) as { ok?: boolean; reason?: string };
  if (uitkomst.ok !== true) {
    return {
      ok: false,
      melding:
        uitkomst.reason === 'lijst_klopt_niet'
          ? t('mijlpaal.lijst_veranderd')
          : t('mijlpaal.volgorde_mislukt'),
    };
  }

  return { ok: true, waarde: true };
}

/**
 * Een gegenereerde tip, met de taal waarin hij bedacht is.
 *
 * ⚠️ `locale` is geen sierlijkheid: `weektip()` volgt de ingestelde taal vanzelf
 *    omdat hij uit de catalogus komt, en een gegenereerde zin doet dat niet. Wie
 *    op Engels overschakelt zou anders een Nederlandse zin onder zijn kaart
 *    houden, en dat is erger dan de vaste terugval.
 */
export interface Mijlpaaltip {
  readonly body: string;
  readonly locale: string;
}

/**
 * De gegenereerde Doelcoach-tips, voor een handvol mijlpalen tegelijk — QS8-137.
 *
 * ⚠️ **Eén verzoek voor alle mijlpalen samen, en niet één per weekdoelkaart.**
 *    Dat laatste is de N+1 die onwrikbare regel 12 met naam noemt, en dan voor
 *    één regel tekst — precies de reden die ook boven `doelcategorieen` in
 *    `app/(tabs)/index.tsx` staat.
 *
 * ⚠️ **Een ontbrekende tip is een normale uitkomst en geen storing.** Het scherm
 *    valt terug op `weektip()`, de vaste set uit variant 3 — die blijft het
 *    antwoord voor iedereen zonder gegenereerde tip, en dat is élke nieuwe
 *    gebruiker in zijn eerste week. Daarom een lege Map bij een fout en geen
 *    `throw`: een tip is een extraatje onder een kaart en hoort die kaart niet
 *    mee te slepen.
 *
 * ⚠️ Geen filter op `user_id`: `milestone_tips_select` laat uitsluitend je eigen
 *    rijen door. Een `.eq()` erbij zou suggereren dat de beveiliging hier zit.
 */
export async function fetchMijlpaalTips(
  milestoneIds: readonly string[],
): Promise<ReadonlyMap<string, Mijlpaaltip>> {
  if (milestoneIds.length === 0) return new Map();

  const { data, error } = await supabase()
    .from('milestone_tips')
    .select('milestone_id, body, locale')
    .in('milestone_id', [...milestoneIds]);

  if (error) {
    reportError(error, 'goals.milestoneTips', { code: error.code });
    return new Map();
  }

  return new Map((data ?? []).map((rij) => [rij.milestone_id, { body: rij.body, locale: rij.locale }]));
}

/**
 * De mijlpaal waar de gebruiker nu naartoe werkt, per doel — QS8-137.
 *
 * ⚠️ Eén verzoek voor alle doelen samen, om dezelfde reden als hierboven.
 *    `dropped` valt weg en de sortering op `order_index` is wat "volgende"
 *    betekent; de keuze zelf staat in `volgendeMijlpaal()`, zodat hij zonder
 *    database te testen is.
 */
export async function fetchVolgendeMijlpalen(
  goalIds: readonly string[],
): Promise<ReadonlyMap<string, Mijlpaal>> {
  if (goalIds.length === 0) return new Map();

  const { data, error } = await supabase()
    .from('milestones')
    .select('id, title, status, order_index, target_date, goal_id')
    .in('goal_id', [...goalIds])
    .neq('status', 'dropped')
    .order('order_index', { ascending: true })
    .limit(200);

  if (error) {
    reportError(error, 'goals.volgendeMijlpalen', { code: error.code });
    return new Map();
  }

  const perDoel = new Map<string, Mijlpaal[]>();
  for (const rij of data ?? []) {
    const lijst = perDoel.get(rij.goal_id) ?? [];
    lijst.push(rij);
    perDoel.set(rij.goal_id, lijst);
  }

  const uit = new Map<string, Mijlpaal>();
  for (const [goalId, lijst] of perDoel) {
    const volgende = volgendeMijlpaal(lijst);
    if (volgende !== null) uit.set(goalId, volgende);
  }

  return uit;
}

/**
 * De mijlpaal waar de gebruiker nu naartoe werkt.
 *
 * ⚠️ **De eerste die nog niet af is, op `order_index`.** De aanroepers leveren
 *    een lijst die daar al op gesorteerd is en waar `dropped` uit weg is. Is
 *    alles `done`, dan is er geen volgende — en dan is de vaste tip het juiste
 *    antwoord, want er valt niets meer vooruit te kijken.
 *
 * ⚠️ Puur, zodat hij zonder database te testen is. Dat is hier geen luxe: "wat
 *    is de volgende mijlpaal" is de vraag waar de hele feature op hangt.
 */
export function volgendeMijlpaal(mijlpalen: readonly Mijlpaal[]): Mijlpaal | null {
  return mijlpalen.find((m) => m.status !== 'done') ?? null;
}
