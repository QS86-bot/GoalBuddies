import { t } from '../../shared/i18n';
import { now } from '../../shared/time';

import { reportError } from '../../lib/observability';
import { supabase } from '../../lib/supabase';
import type { Resultaat } from '../../shared/api';

/**
 * De avatar — migratie 0124.
 *
 * ⚠️ **`profiles.avatar_url` draagt sinds 0124 een pád en geen URL.** De bucket
 *    is privé (dat is geen voorzichtigheid maar een bestaand besluit: zie
 *    `scripts/storage-controle.mjs`, die rood wordt op élke openbare bucket), en
 *    een privéobject heeft een ondertekende URL nodig die verloopt. Een
 *    verlopen URL in een kolom is erger dan geen URL: hij ziet er goed uit en
 *    doet het niet.
 *
 *    De kolomnaam liegt daarmee een beetje. Hernoemen raakt vijf mapping-
 *    functies, twee RPC-returntypes en het gegenereerde typebestand; dat is
 *    duurder dan deze alinea. **Wat er niét mag gebeuren is dat een pad
 *    ongetekend in een `<Image>` belandt** — daarom tekent de datalaag hem vóór
 *    hij het scherm bereikt, en niet het scherm zelf.
 *
 * ⚠️ **Tekenen gaat in één keer voor een hele lijst.** `createSignedUrls`,
 *    meervoud. Per avatar tekenen is de N+1 die schaalbaarheidsregel 12 met naam
 *    noemt, en het groepsoverzicht is precies de plek die daar als voorbeeld
 *    staat.
 */

/** De enige bucket van dit project. Een constante, geen berekening — zie DEPLOY.md §. */
export const AVATAR_BUCKET = 'avatars';

/** Hoe lang een ondertekende avatar-URL geldig is: één uur. */
export const AVATAR_GELDIGHEID_S = 3600;

/**
 * De beeldtypes die de bucket accepteert.
 *
 * ⚠️ Een kopie van `allowed_mime_types` in 0124, en dat is bewust: de bucket is
 *    de grendel (onwrikbare regel 3), deze lijst is het gemak. Een test legt ze
 *    naast elkaar, want twee lijsten die uiteenlopen geven een upload die pas op
 *    de server sneuvelt met een melding waar niemand iets aan heeft.
 */
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** De grens die 0124 op de bucket zet: 2 MB. */
export const AVATAR_MAX_BYTES = 2_097_152;

const EXTENSIE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Het pad waar de avatar van deze gebruiker komt te staan.
 *
 * ⚠️ **Het eerste segment ís de eigenaar en daar hangt de policy aan.** De
 *    bestandsnaam erna hoeft niet onraadbaar te zijn — schrijven naar andermans
 *    map valt af op de `WITH CHECK` van 0124, en lezen vraagt een ondertekende
 *    URL die alleen ontstaat als de leespolicy je doorlaat. Vandaar tijd plus
 *    toeval en geen `crypto.randomUUID()`, die op oudere Hermes-versies ontbreekt.
 */
export function avatarPad(userId: string, mime: string): string {
  const ext = EXTENSIE[mime] ?? 'jpg';
  const uniek = `${now().getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}/${uniek}.${ext}`;
}

/** Wat er mis kan zijn aan een gekozen bestand, vóór er iets de deur uit gaat. */
export function keurBestand(bytes: number, mime: string): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(mime)) return t('avatar.type_niet_toegestaan');
  if (bytes > AVATAR_MAX_BYTES) return t('avatar.te_groot');
  return null;
}

/**
 * Zet een nieuwe avatar neer en hangt hem aan het profiel.
 *
 * ⚠️ **De oude wordt opgeruimd, en pas ná het bijwerken van het profiel.** In die
 *    volgorde is de slechtste afloop een wees in de bucket; andersom is het een
 *    profiel dat naar een bestand wijst dat weg is, en dat is een gebroken
 *    avatar voor iedereen in je groepen. Een wees kost opslag, een kapot pad
 *    kost vertrouwen.
 */
export async function uploadAvatar(
  userId: string,
  bestand: { readonly data: ArrayBuffer | Uint8Array; readonly mime: string },
): Promise<Resultaat<string>> {
  const bezwaar = keurBestand(bestand.data.byteLength, bestand.mime);
  if (bezwaar !== null) return { ok: false, melding: bezwaar };

  const db = supabase();

  const vorige = await db.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  const oudPad = vorige.data?.avatar_url ?? null;

  const pad = avatarPad(userId, bestand.mime);

  const gezet = await db.storage.from(AVATAR_BUCKET).upload(pad, bestand.data, {
    contentType: bestand.mime,
    upsert: false,
  });
  if (gezet.error) {
    reportError(gezet.error, 'avatar.upload', { user_id: userId });
    return { ok: false, melding: t('avatar.uploaden_mislukt') };
  }

  const bijgewerkt = await db.from('profiles').update({ avatar_url: pad }).eq('id', userId);
  if (bijgewerkt.error) {
    // ⚠️ Het bestand staat er nu wel en het profiel wijst er niet naar. Opruimen,
    //    anders groeit de bucket met bestanden die niemand ooit opvraagt.
    await db.storage.from(AVATAR_BUCKET).remove([pad]);
    reportError(bijgewerkt.error, 'avatar.koppelen', { user_id: userId });
    return { ok: false, melding: t('avatar.uploaden_mislukt') };
  }

  if (oudPad !== null && oudPad !== pad) {
    await db.storage.from(AVATAR_BUCKET).remove([oudPad]);
  }

  return { ok: true, waarde: pad };
}

/** Haalt de avatar weg — terug naar initialen. */
export async function verwijderAvatar(userId: string): Promise<Resultaat<true>> {
  const db = supabase();

  const huidig = await db.from('profiles').select('avatar_url').eq('id', userId).maybeSingle();
  const pad = huidig.data?.avatar_url ?? null;

  const losgekoppeld = await db.from('profiles').update({ avatar_url: null }).eq('id', userId);
  if (losgekoppeld.error) {
    reportError(losgekoppeld.error, 'avatar.loskoppelen', { user_id: userId });
    return { ok: false, melding: t('avatar.verwijderen_mislukt') };
  }

  if (pad !== null) await db.storage.from(AVATAR_BUCKET).remove([pad]);

  return { ok: true, waarde: true };
}

/**
 * Tekent een hele lijst paden in één verzoek.
 *
 * ⚠️ **Meervoud, en dat is de hele reden dat deze functie bestaat.** Per avatar
 *    tekenen is een verzoek per rij — de N+1 uit schaalbaarheidsregel 12, en het
 *    groepsoverzicht is de plek die het beslisdocument daarbij noemt.
 *
 * ⚠️ **Een pad dat niet getekend kan worden, geeft `null` en geen fout.** Dat is
 *    precies wat `Avatar` verwacht: hij valt dan terug op initialen. Een lijst
 *    die niet laadt omdat één avatar weg is, zou een verwijderd bestand tot een
 *    kapot scherm maken.
 */
export async function tekenAvatars(
  paden: readonly (string | null)[],
): Promise<ReadonlyMap<string, string>> {
  const uniek = [...new Set(paden.filter((p): p is string => typeof p === 'string' && p !== ''))];
  if (uniek.length === 0) return new Map();

  const { data, error } = await supabase()
    .storage.from(AVATAR_BUCKET)
    .createSignedUrls(uniek, AVATAR_GELDIGHEID_S);

  if (error) {
    reportError(error, 'avatar.tekenen', { aantal: uniek.length });
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
 * ⚠️ Één ronde tekenen voor de hele lijst, daarna in het geheugen omzetten. Elk
 *    ophaalpad dat avatars toont, roept dít aan en niet `tekenAvatars` per rij.
 *
 * ⚠️ **Wat er niet getekend kon worden, wordt `null` — en die regel kent geen
 *    uitzondering.** Hier stond `if (getekend.size === 0) return rijen;` als
 *    zuinigheid, en dat was een gat: `avatar_url` is voor `authenticated`
 *    schrijfbaar (gemeten in `information_schema.column_privileges`), dus een
 *    gebruiker kan er `https://volgmij.example/pixel.gif` in zetten. Levert het
 *    tekenen dan níéts op — precies het geval waarin dat gebeurt — dan ging de
 *    lijst ongewijzigd terug en laadde élk groepslid dat adres uit zijn eigen
 *    `<Image>`. Eén rij met een vreemde URL, en de rest van de lijst leeg: dat is
 *    de goedkoopste manier om de map te legen.
 *
 *    Nu is de uitkomst van deze functie per definitie een ondertekende URL of
 *    `null`, en `Avatar` valt bij `null` terug op initialen. Getoetst in
 *    `tests/beloftes/avatar.test.ts`.
 */
export async function metGetekendeAvatars<T, K extends keyof T>(
  rijen: readonly T[],
  veld: K,
): Promise<readonly T[]> {
  if (rijen.length === 0) return rijen;

  const paden = rijen.map((r) => r[veld] as unknown as string | null);
  const getekend = await tekenAvatars(paden);

  return rijen.map((rij) => {
    const pad = rij[veld] as unknown as string | null;
    const url = pad === null ? null : (getekend.get(pad) ?? null);
    return { ...rij, [veld]: url } as T;
  });
}

// ---------------------------------------------------------------------------
// Van wat de fotokiezer geeft naar wat de storage-API wil
// ---------------------------------------------------------------------------

const B64_ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Zet base64 om in bytes.
 *
 * ⚠️ **Met de hand, en dat is een afweging en geen koppigheid.** `expo-image-picker`
 *    geeft op native een `file://`-uri en op web een `data:`-uri; `fetch()` op een
 *    `file://`-uri is in React Native niet betrouwbaar, dus we vragen de kiezer om
 *    `base64` en dat werkt op beide platformen hetzelfde. `atob` bestaat op
 *    moderne Hermes wél, maar niet op elke versie die een testtoestel draait, en
 *    een terugval die je nooit kunt zien is geen terugval. Twintig regels is
 *    goedkoper dan een dependency die alleen dit doet.
 *
 * ⚠️ Ongeldige invoer geeft `null` en geen halve buffer. Een afbeelding die er
 *    half is, is een upload die op de server sneuvelt met een melding waar
 *    niemand iets aan heeft.
 */
export function base64NaarBytes(base64: string): Uint8Array | null {
  const schoon = base64.replace(/[\r\n\s]/g, '').replace(/=+$/, '');
  if (schoon.length % 4 === 1) return null;

  const uit = new Uint8Array(Math.floor((schoon.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let n = 0;

  for (const teken of schoon) {
    const waarde = B64_ALFABET.indexOf(teken);
    if (waarde === -1) return null;
    buffer = (buffer << 6) | waarde;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      uit[n++] = (buffer >> bits) & 0xff;
    }
  }

  return uit;
}
