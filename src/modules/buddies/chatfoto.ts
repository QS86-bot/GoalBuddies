import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import { t } from '../../shared/i18n';
import { now } from '../../shared/time';

import type { Resultaat } from '../goals';

/**
 * Foto's in de groepschat — QS8-71, PRD 7.3.
 *
 * ⚠️ **Waarom dit naast `avatar.ts` staat en er niet in.** De vorm is bewust
 *    gekopieerd — bucketconstante, padbouwer, keuring, tekenen per lijst — maar
 *    de sleutel is een andere: een avatar hoort bij een gebruiker, een chatfoto
 *    bij een **groep**. `metGetekendeAvatars()` is hard aan `AVATAR_BUCKET`
 *    geknoopt en hergebruiken zou een verhuizing zijn, en CLAUDE.md noemt dat de
 *    gevaarlijkste beweging die er is: de tests verhuizen mee en blijven groen,
 *    want ze toetsen wat er in het bestand staat en niet wat het bestand
 *    beloofde. Samenvoegen is een eigen opruimissue.
 */

/**
 * ⚠️ Een letterlijke constante en geen berekening. `scripts/storage-controle.mjs`
 *    vindt alleen letterlijke strings in `.storage.from(...)`, en een bucket die
 *    die controle niet ziet, is een bucket zonder controle.
 */
export const CHATFOTO_BUCKET = 'chatfotos';

/** Hoe lang een ondertekende chatfoto-URL geldig is: één uur. */
export const CHATFOTO_GELDIGHEID_S = 3600;

/**
 * De beeldtypes die de bucket accepteert.
 *
 * ⚠️ Een kopie van `allowed_mime_types` in migratie 0222 — de bucket is de
 *    grendel (onwrikbare regel 3), deze lijst is het gemak. Een test legt ze in
 *    **beide richtingen** naast elkaar: een type dat hier staat en daar niet
 *    geeft een upload die pas op de server sneuvelt, en andersom een lijst die
 *    ruimer is dan de app denkt.
 */
export const CHATFOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** De grens die 0222 op de bucket zet: 1 MB. */
export const CHATFOTO_MAX_BYTES = 1_048_576;

/**
 * ⚠️ Doorgegeven uit `shared/bewaartermijn` en hier niet opnieuw gedefinieerd —
 *    zie de kop daar voor waaróm het getal in `shared` woont.
 */
export { CHATFOTO_BEWAARDAGEN } from '../../shared/bewaartermijn';

const EXTENSIE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Het pad waar deze foto komt te staan: `<groep>/<afzender>/<naam>.<ext>`.
 *
 * ⚠️⚠️ **Het eerste segment is de groep en niet de gebruiker.** Daar hangen de
 *    policies van 0222 aan, én de CHECK van 0223 die het pad naast de
 *    `group_id` en `sender_id` van de berichtrij legt. Bouw dit pad nooit met de
 *    hand ergens anders: dan bestaat de vorm op twee plekken en loopt er ooit
 *    een uit de pas.
 *
 * ⚠️ Tijd plus toeval en geen `crypto.randomUUID()`, die op oudere
 *    Hermes-versies ontbreekt. De naam hoeft niet onraadbaar te zijn: lezen
 *    vraagt een ondertekende URL, en die ontstaat alleen als de leespolicy je
 *    doorlaat.
 */
export function chatfotoPad(groupId: string, senderId: string, mime: string): string {
  const ext = EXTENSIE[mime] ?? 'jpg';
  const uniek = `${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${groupId}/${senderId}/${uniek}.${ext}`;
}

/** Wat er mis is met dit bestand, of `null` als het door mag. */
export function keurChatfoto(bytes: number, mime: string): string | null {
  if (!(CHATFOTO_TYPES as readonly string[]).includes(mime)) return t('chatfoto.type_niet_toegestaan');
  if (bytes > CHATFOTO_MAX_BYTES) return t('chatfoto.te_groot');
  return null;
}

/**
 * Zet de foto in de bucket en geeft het pad terug.
 *
 * ⚠️ **Alleen uploaden, niet koppelen.** Het pad gaat mee in de `insert` van het
 *    bericht, want `chat_messages` heeft sinds migratie 0193 geen UPDATE-policy
 *    en geen UPDATE-grant: `attachment_url` is **alleen bij INSERT** te zetten.
 *    Die volgorde — eerst uploaden, dan invoegen — is daarmee geen stijlkeuze
 *    maar de enige die werkt, en de compenserende opruiming hoort bij de
 *    aanroeper.
 */
export async function uploadChatfoto(
  groupId: string,
  senderId: string,
  bestand: { readonly data: ArrayBuffer | Uint8Array; readonly mime: string },
): Promise<Resultaat<string>> {
  const bezwaar = keurChatfoto(bestand.data.byteLength, bestand.mime);
  if (bezwaar !== null) return { ok: false, melding: bezwaar };

  const pad = chatfotoPad(groupId, senderId, bestand.mime);

  const gezet = await supabase().storage.from(CHATFOTO_BUCKET).upload(pad, bestand.data, {
    contentType: bestand.mime,
    upsert: false,
  });

  if (gezet.error) {
    reportError(gezet.error, 'chatfoto.upload', { group_id: groupId });
    // ⚠️ Het dagplafond van 0222/0226 komt hier ook binnen, en sinds 0232 is het
    //    te onderscheiden van een netwerkfout. De melding blijft verder
    //    algemeen: een storage-fout draagt soms het pad, en dat pad noemt twee
    //    uuid's.
    //
    // ⚠️ `Te veel foto` dekt beide remmen van deze emmer — die van de groep en
    //    die van het lid. Het onderscheid is voor de gebruiker geen verschil:
    //    vandaag kan het niet meer, morgen weer.
    const rem = /Te veel foto/.test(gezet.error.message ?? '');
    return { ok: false, melding: t(rem ? 'chatfoto.rem_bereikt' : 'chatfoto.uploaden_mislukt') };
  }

  return { ok: true, waarde: pad };
}

/** Haalt een foto weg. Faalt stil: de aanroeper heeft de rij al opgeruimd. */
export async function verwijderChatfoto(pad: string): Promise<void> {
  const { error } = await supabase().storage.from(CHATFOTO_BUCKET).remove([pad]);
  if (error) reportError(error, 'chatfoto.verwijderen');
}

/**
 * Ondertekent een lijst paden in één ronde.
 *
 * ⚠️ Een pad dat niet getekend kan worden, komt niet in de map en wordt bij de
 *    aanroeper `null`. Een lijst die niet laadt omdat één foto weg is, zou een
 *    verwijderd bestand tot een kapotte chat maken.
 */
export async function tekenChatfotos(
  paden: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const uniek = [...new Set(paden.filter((p): p is string => typeof p === 'string' && p !== ''))];
  if (uniek.length === 0) return new Map();

  const { data, error } = await supabase()
    .storage.from(CHATFOTO_BUCKET)
    .createSignedUrls(uniek, CHATFOTO_GELDIGHEID_S);

  if (error) {
    reportError(error, 'chatfoto.tekenen', { aantal: uniek.length });
    return new Map();
  }

  const uit = new Map<string, string>();
  for (const rij of data ?? []) {
    if (rij.error === null && typeof rij.signedUrl === 'string' && typeof rij.path === 'string') {
      uit.set(rij.path, rij.signedUrl);
    }
  }
  return uit;
}

/**
 * Vervangt de paden in een lijst rijen door ondertekende URL's.
 *
 * ⚠️⚠️ **Wat er niet getekend kon worden, wordt `null` — en die regel kent geen
 *    uitzondering.** In `avatar.ts` stond hier ooit `if (getekend.size === 0)
 *    return rijen;` als zuinigheid, en dat was een gat: levert het tekenen
 *    níéts op, dan ging de lijst ongewijzigd terug met de kále paden erin. Hier
 *    is dat erger dan daar, want een kaal pad in een `<Image>` is niet alleen
 *    kapot — het is de vorm waarin een vreemde URL zou meeliften als de CHECK
 *    van 0223 er ooit uit zou vallen. Twee sloten, en dit is het tweede.
 *
 * ⚠️ Één ronde tekenen voor de hele pagina, nooit per bericht. Dertig berichten
 *    is precies de schaal waarop een N+1 pijn doet (schaalbaarheidsregel 12).
 */
export async function metGetekendeChatfotos<T, K extends keyof T>(
  rijen: readonly T[],
  veld: K,
): Promise<readonly T[]> {
  if (rijen.length === 0) return rijen;

  const paden = rijen.map((r) => r[veld] as unknown as string | null);
  const getekend = await tekenChatfotos(paden);

  return rijen.map((rij) => {
    const pad = rij[veld] as unknown as string | null;
    const url = pad === null ? null : (getekend.get(pad) ?? null);
    return { ...rij, [veld]: url } as T;
  });
}
