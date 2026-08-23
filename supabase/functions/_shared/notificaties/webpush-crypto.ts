// ⚠️ GEGENEREERD BESTAND — niet met de hand bewerken.
//
// Kopie van src/modules/notifications, gemaakt door `npm run edge:sync`.
// Bewerk het origineel en draai het script opnieuw; een wijziging hier gaat
// verloren en, erger, laat de app en de jobs met verschillende regels werken.

/**
 * Versleuteling voor web push — QS8-114.
 *
 * ⚠️ **Waarom dit bestand bestaat en er geen bibliotheek staat.** Web push met
 *    inhoud móét versleuteld: een onversleutelde payload wordt door de
 *    pushdienst geweigerd. Dat is RFC 8291 — ECDH op P-256, HKDF, AES-128-GCM.
 *    De keuze om het zelf te schrijven staat in het beslisdocument en rust op
 *    één ding: RFC 8291 publiceert **testvectoren, inclusief alle tussenwaarden**.
 *    Correctheid is hier dus aantoonbaar in plaats van hoopvol, en dat is de
 *    enige reden waarom zelf crypto schrijven hier verdedigbaar is. Het is
 *    standaardprimitieven aaneenrijgen volgens een spec met bewijslast, niet
 *    iets bedenken.
 *
 * ⚠️ **Dit bestand staat in `src/` en niet in `supabase/functions/`,** met opzet.
 *    Die map valt buiten typecheck, lint én CI. Hier valt hij eronder, en
 *    `npm run edge:sync` kopieert hem naar de Edge Function. Een fout in deze
 *    code geeft geen foutmelding maar een pushdienst die `201 Created`
 *    antwoordt terwijl de browser niets toont — precies het soort stille fout
 *    waar dit project al te vaak op is vastgelopen.
 *
 * ⚠️ Uitsluitend WebCrypto (`crypto.subtle`) en `atob`/`btoa`. Geen `node:`-
 *    imports en geen `Buffer`: deze code draait ook onder Deno.
 */

/** Een `PushSubscription` zoals de browser hem levert, na `toJSON()`. */
export interface WebPushAbonnement {
  readonly endpoint: string;
  /** De publieke ECDH-sleutel van de abonnee, base64url, ongecomprimeerd. */
  readonly p256dh: string;
  /** Het authenticatiegeheim van de abonnee, base64url, 16 octetten. */
  readonly auth: string;
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

export function vanBase64url(waarde: string): Uint8Array {
  const opgevuld = waarde.replace(/-/g, '+').replace(/_/g, '/');
  const binair = atob(opgevuld.padEnd(opgevuld.length + ((4 - (opgevuld.length % 4)) % 4), '='));
  const uit = new Uint8Array(binair.length);
  for (let i = 0; i < binair.length; i += 1) uit[i] = binair.charCodeAt(i);
  return uit;
}

export function naarBase64url(bytes: Uint8Array): string {
  let binair = '';
  for (const b of bytes) binair += String.fromCharCode(b);
  return btoa(binair).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function plak(...delen: readonly Uint8Array[]): Uint8Array {
  const totaal = delen.reduce((n, d) => n + d.length, 0);
  const uit = new Uint8Array(totaal);
  let positie = 0;
  for (const deel of delen) {
    uit.set(deel, positie);
    positie += deel.length;
  }
  return uit;
}

const ascii = (tekst: string): Uint8Array => new TextEncoder().encode(tekst);

// ---------------------------------------------------------------------------
// De sleutelafleiding uit RFC 8291 §3.4
// ---------------------------------------------------------------------------

async function hmac(sleutel: Uint8Array, bericht: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw',
    sleutel as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, bericht as BufferSource));
}

/** De publieke sleutel (65 octetten, ongecomprimeerd) als JWK-coördinaten. */
function coordinaten(publiek: Uint8Array): { x: string; y: string } {
  if (publiek.length !== 65 || publiek[0] !== 0x04) {
    throw new Error('Publieke P-256-sleutel moet 65 octetten zijn en met 0x04 beginnen.');
  }
  return { x: naarBase64url(publiek.slice(1, 33)), y: naarBase64url(publiek.slice(33, 65)) };
}

/**
 * Het gedeelde ECDH-geheim.
 *
 * ⚠️ WebCrypto kan een privésleutel niet als kale scalar importeren, alleen als
 *    JWK of PKCS#8. Vandaar de omweg via JWK — de coördinaten komen uit de
 *    bijbehorende publieke sleutel.
 */
async function ecdhGeheim(
  eigenPrive: Uint8Array,
  eigenPubliek: Uint8Array,
  anderPubliek: Uint8Array,
): Promise<Uint8Array> {
  const { x, y } = coordinaten(eigenPubliek);

  const prive = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: naarBase64url(eigenPrive), ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publiek = await crypto.subtle.importKey(
    'raw',
    anderPubliek as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: publiek }, prive, 256),
  );
}

/** De tussenwaarden uit RFC 8291 Appendix A, apart zodat ze te toetsen zijn. */
export interface AfgeleideSleutels {
  readonly ecdhSecret: Uint8Array;
  readonly prkKey: Uint8Array;
  readonly ikm: Uint8Array;
  readonly prk: Uint8Array;
  readonly cek: Uint8Array;
  readonly nonce: Uint8Array;
}

/**
 * RFC 8291 §3.4, stap voor stap.
 *
 * ⚠️ Elke tussenstap komt naar buiten. Dat is geen luxe: als de uitkomst
 *    afwijkt van de testvector wil je wéten welke stap afweek, anders debug je
 *    vier operaties tegelijk. RFC 8291 Appendix A geeft ze allemaal.
 */
export async function leidSleutelsAf(invoer: {
  readonly uaPubliek: Uint8Array;
  readonly authSecret: Uint8Array;
  readonly asPubliek: Uint8Array;
  readonly asPrive: Uint8Array;
  readonly salt: Uint8Array;
}): Promise<AfgeleideSleutels> {
  const ecdhSecret = await ecdhGeheim(invoer.asPrive, invoer.asPubliek, invoer.uaPubliek);

  // HKDF-Extract(salt=auth_secret, IKM=ecdh_secret)
  const prkKey = await hmac(invoer.authSecret, ecdhSecret);

  // key_info = "WebPush: info" || 0x00 || ua_public || as_public
  const keyInfo = plak(
    ascii('WebPush: info'),
    new Uint8Array([0x00]),
    invoer.uaPubliek,
    invoer.asPubliek,
  );
  const ikm = await hmac(prkKey, plak(keyInfo, new Uint8Array([0x01])));

  // De HKDF-berekeningen uit RFC 8188.
  const prk = await hmac(invoer.salt, ikm);

  const cekInfo = plak(ascii('Content-Encoding: aes128gcm'), new Uint8Array([0x00]));
  const cek = (await hmac(prk, plak(cekInfo, new Uint8Array([0x01])))).slice(0, 16);

  const nonceInfo = plak(ascii('Content-Encoding: nonce'), new Uint8Array([0x00]));
  const nonce = (await hmac(prk, plak(nonceInfo, new Uint8Array([0x01])))).slice(0, 12);

  return { ecdhSecret, prkKey, ikm, prk, cek, nonce };
}

// ---------------------------------------------------------------------------
// Versleutelen
// ---------------------------------------------------------------------------

/** De vaste recordgrootte uit het voorbeeld in de RFC. */
const RECORD_SIZE = 4096;

/**
 * ⚠️ RFC 8291 §4: één record per bericht, en de payload mag na de kop (86
 *    octetten), de scheidings-octet en het AEAD-slot van 16 octetten hooguit
 *    3993 octetten zijn. Daarboven weigert de pushdienst en dat is geen fout
 *    die je terugziet in de browser.
 */
export const PAYLOAD_MAX = 3993;

/**
 * Versleutelt met een meegegeven salt en sleutelpaar.
 *
 * ⚠️ Bestaat apart van `versleutelPayload()` omdat een testvector alleen te
 *    toetsen is als salt en sleutelpaar van buiten komen. In productie gebruik
 *    je die andere: die verzint ze zelf, en dat hoort ook zo — een salt die de
 *    aanroeper kiest is geen salt.
 */
export async function versleutelMet(invoer: {
  readonly uaPubliek: Uint8Array;
  readonly authSecret: Uint8Array;
  readonly asPubliek: Uint8Array;
  readonly asPrive: Uint8Array;
  readonly salt: Uint8Array;
  readonly payload: string;
}): Promise<Uint8Array> {
  const klaar = ascii(invoer.payload);
  if (klaar.length > PAYLOAD_MAX) {
    throw new Error(`Payload is ${klaar.length} octetten; het maximum is ${PAYLOAD_MAX}.`);
  }

  const { cek, nonce } = await leidSleutelsAf(invoer);

  const sleutel = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);

  // De scheidings-octet 0x02 sluit het laatste (en enige) record af.
  const geheim = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      sleutel,
      plak(klaar, new Uint8Array([0x02])) as BufferSource,
    ),
  );

  // De kop uit RFC 8188 §2.1: salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ keyid.
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE, false);

  return plak(invoer.salt, rs, new Uint8Array([invoer.asPubliek.length]), invoer.asPubliek, geheim);
}

/**
 * Versleutelt een payload voor één abonnement. Dit is wat de verzendcode gebruikt.
 *
 * Verzint zelf een salt en een eenmalig ECDH-sleutelpaar; dat paar mag na
 * versleutelen weg (RFC 8291 §2).
 */
export async function versleutelPayload(
  abonnement: Pick<WebPushAbonnement, 'p256dh' | 'auth'>,
  payload: string,
): Promise<Uint8Array> {
  const paar = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const asPubliek = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
  if (jwk.d === undefined) throw new Error('Sleutelpaar zonder privédeel.');

  return versleutelMet({
    uaPubliek: vanBase64url(abonnement.p256dh),
    authSecret: vanBase64url(abonnement.auth),
    asPubliek,
    asPrive: vanBase64url(jwk.d),
    salt: crypto.getRandomValues(new Uint8Array(16)),
    payload,
  });
}

// ---------------------------------------------------------------------------
// VAPID — RFC 8292
// ---------------------------------------------------------------------------

/**
 * Het sleutelpaar waarmee de server zich bij de pushdienst legitimeert.
 *
 * ⚠️ De publieke helft is bedoeld om publiek te zijn: die gaat in de client mee
 *    als `applicationServerKey` en hoort dus `EXPO_PUBLIC_` te heten. De
 *    privésleutel hoort **alleen** in de omgeving van de Edge Function — niet in
 *    `.env` van de webbuild, want dan zit hij in de bundel.
 *
 * Eenmalig te genereren; daarna blijven ze staan. Een nieuw paar maakt élk
 * bestaand abonnement ongeldig, want de browser bindt het abonnement aan de
 * publieke sleutel waarmee het is aangemaakt.
 */
export async function genereerVapidSleutelpaar(): Promise<{
  publiek: string;
  prive: string;
}> {
  const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  const publiek = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
  if (jwk.d === undefined) throw new Error('Sleutelpaar zonder privédeel.');

  return { publiek: naarBase64url(publiek), prive: jwk.d };
}

/** Hoe lang een VAPID-token geldig is. RFC 8292 §2 staat maximaal 24 uur toe. */
const VAPID_GELDIG_SECONDEN = 12 * 60 * 60;

/**
 * De `Authorization`-header voor één pushverzoek — RFC 8292.
 *
 * ⚠️ `aud` is de **oorsprong** van het endpoint en niet het endpoint zelf. Een
 *    volledig endpoint in `aud` wordt door FCM geweigerd, en die weigering komt
 *    terug als een 401 zonder verdere uitleg.
 *
 * ⚠️ `sub` moet een `mailto:`- of `https:`-adres zijn waarop de pushdienst de
 *    beheerder kan bereiken bij misbruik. Een lege of verzonnen waarde is een
 *    reden om te weigeren.
 *
 * ⚠️ WebCrypto levert een ECDSA-handtekening al als ruwe `r ‖ s` van 64
 *    octetten — precies wat JWS voor ES256 wil. Niet omzetten naar DER; dat is
 *    de klassieke fout hier en levert een token op dat er goed uitziet.
 */
export async function vapidAuthorization(invoer: {
  readonly endpoint: string;
  readonly publiekeSleutel: string;
  readonly priveSleutel: string;
  readonly subject: string;
  /**
   * Het moment waarop `exp` gerekend wordt.
   *
   * ⚠️ Verplicht, en dat is geen omslachtigheid. Correctheidsregel 7 verbiedt
   *    een tijdberekening buiten `shared/time`, en die module kan hier niet
   *    geïmporteerd worden: `npm run edge:sync` zet alleen extensies op imports
   *    binnen dezelfde map, dus een import over mapgrenzen breekt zodra dit
   *    bestand naar de Edge Function is gekopieerd. Zelfde reden als in
   *    `regels.ts`.
   *
   *    De aanroeper heeft dit moment toch al — de meldingenjob rekent er zijn
   *    hele ronde mee. Meegeven maakt de tests bovendien deterministisch.
   */
  readonly nu: Date;
}): Promise<{ Authorization: string }> {
  if (!/^(mailto:|https:)/.test(invoer.subject)) {
    throw new Error('VAPID-subject moet een mailto:- of https:-adres zijn.');
  }

  const nu = Math.floor(invoer.nu.getTime() / 1000);
  const kop = { typ: 'JWT', alg: 'ES256' };
  const claims = {
    aud: new URL(invoer.endpoint).origin,
    exp: nu + VAPID_GELDIG_SECONDEN,
    sub: invoer.subject,
  };

  const romp = `${naarBase64url(ascii(JSON.stringify(kop)))}.${naarBase64url(
    ascii(JSON.stringify(claims)),
  )}`;

  const { x, y } = coordinaten(vanBase64url(invoer.publiekeSleutel));
  const sleutel = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: invoer.priveSleutel, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const handtekening = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sleutel, ascii(romp) as BufferSource),
  );

  return {
    Authorization: `vapid t=${romp}.${naarBase64url(handtekening)}, k=${invoer.publiekeSleutel}`,
  };
}
