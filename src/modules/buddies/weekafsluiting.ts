import { t } from '../../shared/i18n';

import type { Database } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Cycle } from '../../shared/time';

import type { Pagina, Resultaat } from './api';
import {
  reactieSchema,
  weekafsluitingSchema,
  type Antwoord,
  type Reactie,
  type WeekafsluitingInvoer,
} from './weekafsluiting-schemas';
import { budgetOp } from './rem';
import { oudLid } from './systeemberichten';
import { invoerfout, type RpcRij } from '../../shared/api';

/**
 * De weekafsluiting — QS8-73.
 *
 * ⚠️ Alle vier de aanroepen krijgen de periode van buiten mee, als `Cycle` uit
 *    `huidigeGroepsperiode()`. De database kent de huddledag en de tijdzone wel,
 *    maar mag er niet mee rekenen (CLAUDE.md, correctheidsregel 7) — en het is de
 *    gróepsperiode en niet de persoonlijke cyclus, want dit is het ritueel van de
 *    groep (domeinregel 1).
 *
 * ⚠️ Eén periode per aanroep, en de app vraagt alleen de lopende. Binnen de
 *    lopende periode betekent "nog geen antwoord" niets anders dan "nog niet".
 *    Over een reeks oude perioden zou afwezigheid een verslag worden — en dan is
 *    overslaan niet meer gratis, wat het acceptatiecriterium juist belooft.
 */

export const REACTIES_PER_PAGINA = 100;

// ---------------------------------------------------------------------------
// Lezen
// ---------------------------------------------------------------------------

/**
 * ⚠️ Afgeleid van het gegenereerde type met nullability erbij. Hernoemt iemand een
 *    kolom in `weekafsluiting()`, dan breekt de build hier en niet op het scherm.
 */
type RpcAntwoordRij = Database['public']['Functions']['weekafsluiting']['Returns'][number];
type AntwoordRij = RpcRij<RpcAntwoordRij>;

function naarAntwoord(rij: AntwoordRij): Antwoord | null {
  if (typeof rij.review_id !== 'string' || typeof rij.user_id !== 'string') {
    reportError(new Error('Rij uit weekafsluiting zonder id'), 'weekreview.parse');
    return null;
  }

  return {
    review_id: rij.review_id,
    user_id: rij.user_id,
    display_name: rij.display_name ?? t('beoordeling.een_buddy'),
    avatar_url: rij.avatar_url,
    did_text: rij.did_text,
    blocked_text: rij.blocked_text,
    next_text: rij.next_text,
    created_at: rij.created_at ?? '',
  };
}

/**
 * De antwoorden van deze periode — samen, in één ronde.
 *
 * ⚠️ Wie niets invulde heeft geen rij en staat er dus niet op. Deze functie legt
 *    de lijst nergens naast de ledenlijst, en dat is het hele verschil tussen
 *    "drie mensen hebben geantwoord" en "twee van de vijf hebben niet gereageerd".
 */
export async function fetchWeekafsluiting(
  groupId: string,
  periode: Cycle,
): Promise<readonly Antwoord[]> {
  const { data, error } = await supabase().rpc('weekafsluiting', {
    p_group_id: groupId,
    p_period_start: periode.startDate,
  });

  if (error) {
    reportError(error, 'weekreview.list', { group_id: groupId, pgcode: error.code });
    throw new Error(t('weekafsluiting.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly AntwoordRij[];
  return ruw.map(naarAntwoord).filter((a): a is Antwoord => a !== null);
}

type RpcReactieRij =
  Database['public']['Functions']['weekafsluiting_reacties']['Returns'][number];
type ReactieRij = RpcRij<RpcReactieRij>;

function naarReactie(rij: ReactieRij): Reactie | null {
  if (
    typeof rij.id !== 'string' ||
    typeof rij.week_review_id !== 'string' ||
    typeof rij.author_id !== 'string'
  ) {
    reportError(new Error('Rij uit weekafsluiting_reacties zonder id'), 'weekreview.parse');
    return null;
  }

  return {
    id: rij.id,
    week_review_id: rij.week_review_id,
    author_id: rij.author_id,
    author_name: rij.author_name ?? oudLid(),
    author_avatar: rij.author_avatar,
    body: rij.body ?? '',
    created_at: rij.created_at ?? '',
  };
}

/**
 * De reacties op de antwoorden van deze periode — de tweede vaste ronde.
 *
 * ⚠️ Niet per antwoord opvragen. Twaalf leden keer één verzoek is de N+1 die het
 *    beslisdocument met naam noemt; het scherm groepeert de platte lijst zelf met
 *    `groepeerReacties()`.
 */
export async function fetchWeekafsluitingReacties(
  groupId: string,
  periode: Cycle,
  opties: { readonly pagina?: number } = {},
): Promise<Pagina<Reactie>> {
  const pagina = opties.pagina ?? 0;
  const van = pagina * REACTIES_PER_PAGINA;

  const { data, error } = await supabase().rpc('weekafsluiting_reacties', {
    p_group_id: groupId,
    p_period_start: periode.startDate,
    p_limit: REACTIES_PER_PAGINA,
    p_offset: van,
  });

  if (error) {
    reportError(error, 'weekreview.replies', { group_id: groupId, pgcode: error.code });
    throw new Error(t('weekafsluiting.reacties_laden'));
  }

  const ruw = (data ?? []) as readonly ReactieRij[];
  const rijen = ruw.map(naarReactie).filter((r): r is Reactie => r !== null);

  // ⚠️ Onbruikbare rijen gaan ook van het totaal af, anders blijft `meer` op waar
  //    staan en biedt de UI voor altijd iets aan dat niet te laden valt.
  const overgeslagen = ruw.length - rijen.length;
  const totaal = Math.max(0, (ruw[0]?.total_replies ?? rijen.length) - overgeslagen);

  return { rijen, totaal, meer: van + rijen.length < totaal };
}

// ---------------------------------------------------------------------------
// Schrijven
// ---------------------------------------------------------------------------

/**
 * Bewaart je eigen antwoorden voor deze periode — QS8-73.
 *
 * ⚠️ Een `upsert` op `(group_id, user_id, group_period_start)` en geen insert.
 *    Die drie vormen samen `week_reviews_one_per_period`, dus een tweede poging is
 *    hetzelfde antwoord bijwerken en geen fout. Zonder dit is "ik wil er nog iets
 *    bij zetten" een botsing op een unieke constraint, met een melding waar
 *    niemand iets aan heeft.
 *
 * ⚠️ Leeg is leeg: een veld dat je niet invult wordt `null` en niet een lege
 *    string. Anders staat er op de kaart een kopje met niets eronder, en dat leest
 *    als een storing.
 */
export async function bewaarWeekafsluiting(
  userId: string,
  groupId: string,
  periode: Cycle,
  invoer: WeekafsluitingInvoer,
): Promise<Resultaat<true>> {
  const gevalideerd = weekafsluitingSchema.safeParse(invoer);
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('weekafsluiting.invoer')) };
  }

  const leegAlsNull = (tekst: string): string | null => (tekst === '' ? null : tekst);

  const { error } = await supabase()
    .from('week_reviews')
    .upsert(
      {
        group_id: groupId,
        user_id: userId,
        group_period_start: periode.startDate,
        did_text: leegAlsNull(gevalideerd.data.did_text),
        blocked_text: leegAlsNull(gevalideerd.data.blocked_text),
        next_text: leegAlsNull(gevalideerd.data.next_text),
      },
      { onConflict: 'group_id,user_id,group_period_start' },
    );

  if (error) {
    reportError(error, 'weekreview.save', { group_id: groupId, pgcode: error.code });
    return {
      ok: false,
      melding: t('weekafsluiting.opslaan_mislukt'),
    };
  }

  return { ok: true, waarde: true };
}

/**
 * Verwijdert je eigen antwoorden van deze periode.
 *
 * ⚠️ Moet bestaan. Vraag 2 vraagt om tegenslag en dat is de enige plek in de app
 *    waar dat gebeurt; iets terugnemen wat je net in een groep hebt gezet, is dan
 *    geen extraatje maar de voorwaarde waaronder je het durft te schrijven.
 *
 * ⚠️ De reacties eronder verdwijnen mee, via `on delete cascade`. Dat is de
 *    bedoeling: een reactie op een antwoord dat niet meer bestaat, is een halve
 *    zin over iets dat niemand kan nalezen.
 */
export async function verwijderWeekafsluiting(
  userId: string,
  groupId: string,
  periode: Cycle,
): Promise<Resultaat<true>> {
  const { error } = await supabase()
    .from('week_reviews')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('group_period_start', periode.startDate);

  if (error) {
    reportError(error, 'weekreview.delete', { group_id: groupId, pgcode: error.code });
    return { ok: false, melding: t('weekafsluiting.weghalen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Reageert op één antwoord — QS8-73.
 *
 * ⚠️ `author_id` gaat expliciet mee, om dezelfde reden als bij een chatbericht:
 *    `week_review_replies_insert` eist `author_id = auth.uid()`, dus een verkeerde
 *    waarde komt er niet door — maar zonder waarde komt er ook niets door, en dan
 *    is de melding een policyweigering in plaats van "je sessie laadt nog".
 */
export async function reageerOpAntwoord(
  reviewId: string,
  authorId: string,
  body: string,
): Promise<Resultaat<true>> {
  const gevalideerd = reactieSchema.safeParse({ body });
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('weekafsluiting.reactie_controleer')) };
  }

  const { error } = await supabase().from('week_review_replies').insert({
    week_review_id: reviewId,
    author_id: authorId,
    body: gevalideerd.data.body,
  });

  if (error) {
    reportError(error, 'weekreview.reply', { pgcode: error.code });

    // ⚠️ Zelfde reden als bij een chatbericht: 42501 zegt niet waaróm.
    if (await budgetOp('weekreacties_over')) {
      return { ok: false, melding: t('weekafsluiting.reactie_rem_bereikt') };
    }

    return { ok: false, melding: t('weekafsluiting.reactie_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Verwijdert je eigen reactie.
 *
 * ⚠️ Bewerken kan niet en dat is een keuze (migratie 0026): een gesprek over wat
 *    er in de weg zat, mag niet achteraf herschreven worden. Weghalen mag wel —
 *    spijt is geen geschiedenis.
 */
export async function verwijderReactie(reactieId: string): Promise<Resultaat<true>> {
  const { error } = await supabase().from('week_review_replies').delete().eq('id', reactieId);

  if (error) {
    reportError(error, 'weekreview.reply.delete', { pgcode: error.code });
    return { ok: false, melding: t('weekafsluiting.weghalen_mislukt') };
  }

  return { ok: true, waarde: true };
}
