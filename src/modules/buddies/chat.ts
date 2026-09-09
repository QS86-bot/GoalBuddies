import AsyncStorage from '@react-native-async-storage/async-storage';

import { t } from '../../shared/i18n';

import type { Database } from '../../lib/database.types';
import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';

// ⚠️ Rechtstreeks uit `auth/avatar.ts` en niet via `modules/auth/index.ts`. Die
//    laatste re-exporteert `SessionProvider` en `AvatarKeuze`, en die trekken
//    React en React Native mee — in een test die in Node draait is dat een
//    parsefout op `react-native/index.js`. Zelfde reden en zelfde vorm als de
//    directe import van `periods.ts` in `tests/rls/epic7.test.ts`.
import { metGetekendeAvatars } from '../auth/avatar';

import { schoneBestandsnaam, uploadChatdoc, verwijderChatdoc } from './chatdoc';
import { metGetekendeChatfotos, uploadChatfoto, verwijderChatfoto } from './chatfoto';

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
  soortBijlage,
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

/**
 * Alle bruikbare getallen uit `payload` — QS8-79.
 *
 * ⚠️ Vertrouwt er net zo weinig van als `drempelUit()` hierboven: alleen eindige
 *    gehele getallen van nul of hoger komen erdoor. **Nul mág hier wél**, anders
 *    dan bij de drempel: een seizoen met nul gehaalde mijlpalen maar wél
 *    afgeronde weken is een geldige recap, en de zin hoort dan gewoon "0
 *    mijlpalen" te zeggen.
 */
function getallenUit(payload: unknown): Readonly<Record<string, number>> | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const uit: Record<string, number> = {};
  for (const [sleutel, waarde] of Object.entries(payload as Record<string, unknown>)) {
    if (typeof waarde === 'number' && Number.isSafeInteger(waarde) && waarde >= 0) {
      uit[sleutel] = waarde;
    }
  }

  return Object.keys(uit).length === 0 ? null : uit;
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
    attachment_name: rij.attachment_name ?? null,
    attachment_url: rij.attachment_url ?? null,
    system_event: rij.system_event,
    // ⚠️ Namen en geen id's, en ze komen uit een `left join` in `groepschat()`
    //    (migratie 0059). Daardoor levert een verwijderd account vanzelf `null`
    //    op en toont het scherm "Een oud-lid" — zonder dat er één rij herschreven
    //    wordt. Dat is dezelfde afspraak als bij `sender_name` hierboven.
    subject_name: rij.subject_name ?? null,
    actor_name: rij.actor_name ?? null,
    aantal: drempelUit(rij.payload),
    getallen: getallenUit(rij.payload),
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
    reportError(error, 'chat.list', { group_id: groupId });
    throw new Error(t('chat.laden_mislukt'));
  }

  const ruw = (data ?? []) as readonly ChatRij[];
  const nieuwsteEerst = ruw.map(naarBericht).filter((b): b is ChatBericht => b !== null);

  // ⚠️ Eén ronde tekenen voor de hele pagina, niet per bericht. De avatar-bucket
  //    is privé sinds 0126, dus `sender_avatar` draagt een pad; een verzoek per
  //    regel is exact de N+1 uit schaalbaarheidsregel 12, en dertig regels is
  //    precies de schaal waarop dat pijn doet.
  // ⚠️ **Twee rondes per pagina en niet twee per bericht.** Dertig berichten is
  //    precies de schaal waarop een N+1 pijn doet (schaalbaarheidsregel 12). Twee
  //    buckets betekent twee `createSignedUrls`-aanroepen; komt er ooit een derde
  //    ondertekend veld bij, dan hoort dit één functie met een veldenlijst te
  //    worden en niet een derde regel.
  const metAvatars = await metGetekendeAvatars(nieuwsteEerst, 'sender_avatar');
  const getekend = await metGetekendeChatfotos(metAvatars, 'attachment_url');

  return {
    berichten: [...getekend].reverse(),
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
  /**
   * De bijlage, of niets — QS8-72.
   *
   * ⚠️ `naam` bepaalt de soort en niet andersom: staat hij er, dan is dit een
   *    document en gaat het naar `chatdocs`; staat hij er niet, dan is het een
   *    foto. Zo is er één plek waar die keuze valt, en die plek is hier.
   */
  bijlage?: {
    readonly data: ArrayBuffer | Uint8Array;
    readonly mime: string;
    readonly naam?: string;
  },
): Promise<Resultaat<string>> {
  const gevalideerd = berichtSchema.safeParse({ body, heeftBijlage: bijlage !== undefined });
  if (!gevalideerd.success) {
    return { ok: false, melding: invoerfout(gevalideerd.error, t('chat.controleer')) };
  }

  const isDocument = bijlage !== undefined && typeof bijlage.naam === 'string';

  // ⚠️⚠️ **Eerst uploaden, dan invoegen, en die volgorde is verplicht.**
  //    `chat_messages` heeft sinds migratie 0193 geen UPDATE-policy en geen
  //    UPDATE-grant, dus `attachment_url` is alleen bij INSERT te zetten — het
  //    pad ná te leveren kan niet. Mislukt de upload, dan is er geen bericht en
  //    ook geen wees.
  let pad: string | null = null;
  let naam: string | null = null;
  if (bijlage !== undefined) {
    const gezet = isDocument
      ? await uploadChatdoc(groupId, senderId, { ...bijlage, naam: bijlage.naam ?? '' })
      : await uploadChatfoto(groupId, senderId, bijlage);
    if (!gezet.ok) return gezet;
    pad = gezet.waarde;
    naam = isDocument ? schoneBestandsnaam(bijlage.naam ?? '') : null;
  }

  const { data, error } = await supabase()
    .from('chat_messages')
    .insert({
      group_id: groupId,
      sender_id: senderId,
      body: gevalideerd.data.body,
      // ⚠️ De soort en de extensie zijn aan elkaar gepaard in de CHECK van 0236.
      //    Hier zetten betekent: hier ligt vast tegen welke emmer er straks
      //    getekend wordt. Zie `soortBijlage()` in `chat-schemas.ts`.
      type: pad === null ? 'text' : isDocument ? 'doc' : 'photo',
      attachment_url: pad,
      attachment_name: naam,
    })
    .select('id')
    .single();

  if (error) {
    // ⚠️ De compenserende handeling, en die staat vóór alle andere afhandeling.
    //    Het bestand staat er nu wel en er wijst geen rij naar; zonder dit groeit
    //    de bucket met foto's die niemand ooit opvraagt — en die wél meetellen
    //    voor het dagplafond van 0222.
    if (pad !== null) await (isDocument ? verwijderChatdoc(pad) : verwijderChatfoto(pad));

    reportError(error, 'chat.send', { group_id: groupId });

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
  // ⚠️ **Het pad ophalen vóór de delete**, want daarna is de rij weg en is het
  //    pad niet meer te achterhalen. Levert dit niets op — de rij bestaat niet,
  //    of de policy laat hem niet lezen — dan gaat de delete gewoon door en is
  //    de uitkomst daarvan het antwoord.
  // ⚠️ `type` gaat mee, want het pad zegt niet in welke emmer het staat: die
  //    vorm is voor `chatfotos` en `chatdocs` identiek. Zie `soortBijlage()`.
  const vooraf = await supabase()
    .from('chat_messages')
    .select('attachment_url, type')
    .eq('id', berichtId)
    .maybeSingle();

  const { error } = await supabase().from('chat_messages').delete().eq('id', berichtId);

  if (error) {
    reportError(error, 'chat.delete');
    return { ok: false, melding: t('chat.weghalen_mislukt') };
  }

  // ⚠️ **De rij eerst, dan het bestand.** De slechtste afloop is dan een wees in
  //    de bucket en niet een bericht dat naar een bestand wijst dat weg is. Het
  //    omgekeerde zou een gebroken foto in het gesprek van drie mensen zetten.
  const pad = vooraf.data?.attachment_url ?? null;
  if (typeof pad === 'string' && pad !== '') {
    const soort = soortBijlage({ type: vooraf.data?.type ?? '' });
    await (soort === 'doc' ? verwijderChatdoc(pad) : verwijderChatfoto(pad));
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
