import AsyncStorage from '@react-native-async-storage/async-storage';

import { t } from '../../shared/i18n';

import type { Database } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

import type { Resultaat } from './api';
import {
  BERICHTEN_PER_PAGINA,
  beperkVoorCache,
  berichtSchema,
  CACHE_VERSIE,
  isCacheGeldig,
  type ChatBericht,
  type ChatCache,
  type ChatCursor,
} from './chat-schemas';
import { budgetOp } from './rem';
import { oudLid } from './systeemberichten';
import { invoerfout, type RpcRij } from '../../shared/api';

/**
 * De groepschat — QS8-69.
 *
 * ⚠️ Vier dingen die hier niet gebeuren:
 *
 *    1. **Er wordt nergens op lidmaatschap gefilterd om iets te verbergen.**
 *       `chat_messages_select` eist lidmaatschap en `groepschat()` is SECURITY
 *       INVOKER. Een `.eq('group_id', ...)` erbij zou suggereren dat de
 *       beveiliging hier zit.
 *
 *    2. **Er wordt nooit op DELETE geabonneerd.** Supabase past RLS toe op INSERT
 *       en UPDATE, maar níét op DELETE-gebeurtenissen. Vandaag lekt dat alleen een
 *       uuid omdat de replica identity op DEFAULT staat — en dat blijft zo, want
 *       `REPLICA IDENTITY FULL` op `chat_messages` is verboden (migratie 0024, en
 *       dezelfde afspraak als Q-TODO A20 voor `completions` en `weekly_goals`).
 *
 *    3. **Er wordt geen systeembericht geschreven.** Die komen uit de triggers van
 *       migratie 0025 en `chat_messages_insert` verbiedt `type = 'system'` aan een
 *       client. Dat was gat A5 en het is dicht.
 *
 *    4. **Er wordt geen tijd uitgerekend.** De periode van de cache komt als
 *       `periodStart` binnen, uit `huidigeGroepsperiode()` (CLAUDE.md,
 *       correctheidsregel 7).
 */

export type { ChatBericht, ChatCursor } from './chat-schemas';

export interface ChatPagina {
  /** Oplopend op tijd: het oudste bericht staat vooraan. */
  readonly berichten: readonly ChatBericht[];
  /** Valt er verder terug te bladeren? */
  readonly meer: boolean;
}

/**
 * ⚠️ Afgeleid van het gegenereerde type en niet met de hand overgetypt.
 *    Hernoemt iemand een kolom in `groepschat()`, dan breekt de build hier en
 *    niet pas op het scherm. De nullability klopt in de generator níét — kolommen
 *    van een set-returning functie komen er nooit als nullable uit, terwijl de
 *    left join op `profiles` ze wel degelijk leeg kan laten — dus die wordt hier
 *    toegevoegd.
 */
type RpcChatRij = Database['public']['Functions']['groepschat']['Returns'][number];
type ChatRij = RpcRij<RpcChatRij>;

/**
 * Zet een rij om, of geeft `null` als hij onbruikbaar is.
 *
 * ⚠️ `sender_name` valt terug op "Een oud-lid" en niet op de eigen naam of op
 *    niets. Een leeg blok in een gesprek leest als een storing, en de left join
 *    laat de naam juist wél leeg bij iemand die de groep verlaten heeft — dan is
 *    `profiles_select` niet meer van toepassing, terwijl zijn bericht in het
 *    gesprek hoort te blijven staan.
 */
/**
 * De drempel uit `payload`, of `null`.
 *
 * ⚠️ `payload` is `Json` en dus letterlijk alles wat er in de kolom past. Deze
 *    functie vertrouwt er niets van: geen object is `null`, geen getal is `null`,
 *    en een getal dat geen eindig geheel is ook. Een systeembericht mag nooit een
 *    storing worden — dat is het kanaal dat de groep vertrouwt.
 */
function drempelUit(payload: unknown): number | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const waarde = (payload as Record<string, unknown>).drempel;
  return typeof waarde === 'number' && Number.isSafeInteger(waarde) && waarde > 0 ? waarde : null;
}

function naarBericht(rij: ChatRij): ChatBericht | null {
  if (typeof rij.id !== 'string' || typeof rij.created_at !== 'string') {
    reportError(new Error('Rij uit groepschat zonder id of tijd'), 'chat.parse');
    return null;
  }

  const systeem = rij.type === 'system' || rij.sender_id === null;

  return {
    id: rij.id,
    sender_id: rij.sender_id,
    sender_name: rij.sender_name ?? (systeem ? '' : oudLid()),
    sender_avatar: rij.sender_avatar,
    body: rij.body ?? '',
    type: rij.type ?? 'text',
    system_event: rij.system_event,
    // ⚠️ Namen en geen id's, en ze komen uit een `left join` in `groepschat()`
    //    (migratie 0059). Daardoor levert een verwijderd account vanzelf `null`
    //    op en toont het scherm "Een oud-lid" — zonder dat er één rij herschreven
    //    wordt. Dat is dezelfde afspraak als bij `sender_name` hierboven.
    subject_name: rij.subject_name ?? null,
    actor_name: rij.actor_name ?? null,
    aantal: drempelUit(rij.payload),
    created_at: rij.created_at,
  };
}

/**
 * Eén pagina chatgeschiedenis. Zonder cursor: de nieuwste.
 *
 * ⚠️ De RPC levert nieuwste eerst, want dat is wat een cursor nodig heeft. Wat
 *    hier teruggaat is oplopend, want dat is wat een gesprek nodig heeft. Die
 *    omkering hoort hier en niet in het scherm — daar zou hij bij de volgende
 *    lijst opnieuw bedacht worden.
 */
export async function fetchChat(
  groupId: string,
  cursor: ChatCursor | null = null,
): Promise<ChatPagina> {
  const { data, error } = await supabase().rpc('groepschat', {
    p_group_id: groupId,
    p_limit: BERICHTEN_PER_PAGINA,
    ...(cursor === null ? {} : { p_before_at: cursor.at, p_before_id: cursor.id }),
  });

  if (error) {
    reportError(error, 'chat.list', { group_id: groupId, pgcode: error.code });
    throw new Error(t('chat.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly ChatRij[];
  const nieuwsteEerst = ruw.map(naarBericht).filter((b): b is ChatBericht => b !== null);

  return {
    berichten: [...nieuwsteEerst].reverse(),
    // ⚠️ Op `ruw` en niet op de gefilterde lijst. Viel er een rij weg omdat hij
    //    onbruikbaar was, dan valt er nog steeds verder terug te bladeren.
    meer: ruw.length === BERICHTEN_PER_PAGINA,
  };
}

/**
 * Verstuurt een bericht.
 *
 * ⚠️ `sender_id` gaat expliciet mee en wordt niet aan de server overgelaten.
 *    `chat_messages_insert` eist `sender_id = auth.uid()`, dus een verkeerde
 *    waarde komt er niet door — maar zonder waarde komt er ook niets door, en dan
 *    is de melding een policyweigering in plaats van "je sessie laadt nog".
 *
 * ⚠️ `.select()` erna, en dat werkt hier: Postgres past de SELECT-policy ook toe
 *    op de RETURNING-rij, en `chat_messages_select` laat een lid zijn eigen groep
 *    lezen. De naam komt níét mee — die staat in `profiles` — dus die vult de
 *    aanroeper zelf in met wat hij van zichzelf al weet.
 */
export async function stuurBericht(
  groupId: string,
  senderId: string,
  body: string,
): Promise<Resultaat<string>> {
  const gevalideerd = berichtSchema.safeParse({ body });
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('chat.controleer')) };
  }

  const { data, error } = await supabase()
    .from('chat_messages')
    .insert({
      group_id: groupId,
      sender_id: senderId,
      body: gevalideerd.data.body,
      type: 'text',
    })
    .select('id')
    .single();

  if (error) {
    reportError(error, 'chat.send', { group_id: groupId, pgcode: error.code });

    // ⚠️ Een policyweigering is voor élke reden dezelfde 42501, dus zonder deze
    //    vraag krijgt iemand die tegen de rem van 0090 aanloopt "versturen
    //    mislukt" en mag hij raden. De database blijft de grens; dit is alleen
    //    de uitleg achteraf.
    if (await budgetOp('berichten_over')) {
      return { ok: false, melding: t('chat.rem_bereikt') };
    }

    return {
      ok: false,
      melding: t('chat.versturen_mislukt'),
    };
  }

  return { ok: true, waarde: data.id };
}

/**
 * Verwijdert een eigen bericht.
 *
 * ⚠️ `chat_messages_delete` staat alleen de afzender toe. Er gaat hier bewust
 *    geen id van een gebruiker mee: de policy is de grens en een tweede filter
 *    hier zou suggereren dat hij hier zit.
 */
export async function verwijderBericht(berichtId: string): Promise<Resultaat<true>> {
  const { error } = await supabase().from('chat_messages').delete().eq('id', berichtId);

  if (error) {
    reportError(error, 'chat.delete', { pgcode: error.code });
    return { ok: false, melding: t('chat.weghalen_mislukt') };
  }

  return { ok: true, waarde: true };
}

/**
 * Meldt wanneer er een nieuw bericht in deze groep staat — QS8-69.
 *
 * ⚠️ Uitsluitend INSERT, en met een filter op de groep. Dat filter is geen
 *    beveiliging (de server past RLS toe op deze gebeurtenissen) maar het scheelt
 *    verkeer op een gratis tier: zonder filter krijgt elk open scherm elke insert
 *    van elke groep waar je in zit.
 *
 * ⚠️ Het bericht zelf gaat níét mee naar de aanroeper. De payload heeft geen naam
 *    en geen avatar — die staan in `profiles` — dus het scherm haalt de nieuwste
 *    pagina op en voegt hem samen (`voegSamen`). Eén verzoek, altijd juist, en
 *    hetzelfde patroon als de beoordelingswachtrij van EPIC 6.
 *
 * Geeft een opzegfunctie terug. Die móet aangeroepen worden bij het opruimen van
 * het scherm; een abonnement dat blijft hangen, telt door op een gratis tier.
 */
export function volgChat(groupId: string, opNieuwBericht: () => void): () => void {
  const kanaal = supabase()
    .channel(`chat:${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`,
      },
      () => opNieuwBericht(),
    )
    .subscribe();

  return () => {
    void supabase().removeChannel(kanaal);
  };
}

// ---------------------------------------------------------------------------
// De cache voor een slechte verbinding
// ---------------------------------------------------------------------------
//
// ⚠️ Bewust dezelfde opslag als de sessie (AsyncStorage op native, localStorage
//    op web) en geen nieuwe dependency — zelfde afweging als `pending.ts`.
//
// ⚠️ Wat hier staat is leesbaar voor wie de telefoon oppakt, en dat is een echte
//    afweging. Het gaat om berichten die diezelfde persoon ook in de app kan
//    lezen zonder opnieuw in te loggen, dus de cache voegt geen nieuw risico toe
//    aan een ontgrendeld toestel. Wat er niet in staat: punten, weekstatussen of
//    iets anders dat domeinregel 7 raakt — de chat bevat uitsluitend wat mensen
//    zelf geschreven hebben en systeemberichten van de allowlist.

function sleutel(groupId: string): string {
  return `goalbuddies.chat.${groupId}`;
}

/** Bewaart de nieuwste berichten van de lopende periode. */
export async function bewaarChatCache(
  groupId: string,
  periodStart: string,
  berichten: readonly ChatBericht[],
): Promise<void> {
  const inhoud: ChatCache = {
    periodStart,
    berichten: beperkVoorCache(berichten),
    versie: CACHE_VERSIE,
  };

  try {
    await AsyncStorage.setItem(sleutel(groupId), JSON.stringify(inhoud));
  } catch (fout) {
    // Niet gooien: de cache kwijtraken is vervelend, maar het mag het gesprek
    // zelf niet blokkeren.
    reportError(fout, 'chat.cache.write', { group_id: groupId });
  }
}

/**
 * De bewaarde berichten van déze periode, of `null`.
 *
 * ⚠️ Een cache van een vorige periode wordt niet teruggegeven en ook niet
 *    stilzwijgend bewaard: hij wordt weggegooid. Een chat van drie weken terug
 *    tonen als "de groep nu" is erger dan een leeg scherm, want dan denk je dat
 *    er niets gebeurd is.
 */
export async function chatUitCache(
  groupId: string,
  periodStart: string,
): Promise<readonly ChatBericht[] | null> {
  try {
    const bewaard = await AsyncStorage.getItem(sleutel(groupId));
    if (bewaard === null) return null;

    const cache = JSON.parse(bewaard) as ChatCache;
    if (!isCacheGeldig(cache, periodStart)) {
      await AsyncStorage.removeItem(sleutel(groupId));
      return null;
    }

    return cache.berichten;
  } catch (fout) {
    reportError(fout, 'chat.cache.read', { group_id: groupId });
    return null;
  }
}
