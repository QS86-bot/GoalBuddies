/**
 * Eén web-pushmelding afleveren bij de pushdienst van de browser — QS8-16.
 *
 * ⚠️ **Dit bestand vult het gat waardoor web push nooit iets heeft afgeleverd.**
 *    `webpush-crypto.ts` stond er sinds 23-08 compleet en getoetst aan de
 *    RFC-testvectoren, de sleutels stonden in `.env.example`, de service worker
 *    was geregistreerd en `push_tokens` bewaarde `p256dh` en `auth` — en
 *    `supabase/functions/notificaties/index.ts` kende één bestemming: Expo. Een
 *    webabonnement is een endpoint-URL van de browserleverancier; daar kan Expo
 *    niets mee. Elk schakeltje af, de keten nergens doorlopend, en geen enkele
 *    test die er rood van werd — er was immers niets kapot (onwrikbare regel 18,
 *    vraag 5). Gevonden op 25-08-2026 bij het nameten van QS8-16, QS8-91 en
 *    QS8-117.
 *
 * ⚠️ **Waarom hier en niet in de Edge Function.** `npm run edge:sync` kopieert
 *    deze map naar `supabase/functions/_shared/notificaties/`, en `edge:controle`
 *    houdt de twee gelijk. Zou dit in de Edge Function zelf staan, dan was het
 *    ongetest — daar draait geen vitest. Zelfde reden als bij `regels.ts` en
 *    `webpush-crypto.ts`.
 *
 * ⚠️ Alleen imports binnen deze map, en `fetch` komt als parameter binnen. Het
 *    eerste omdat `edge:sync` alleen daar extensies op zet; het tweede zodat een
 *    test elke antwoordcode kan voeden zonder netwerk.
 */
import { PAYLOAD_MAX, vanBase64url, vapidAuthorization, versleutelPayload } from './webpush-crypto';

/** Een abonnement zoals het in `push_tokens` staat. */
export interface WebPushDoel {
  /** De endpoint-URL van de pushdienst. Staat in de kolom `token`. */
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/** Het VAPID-sleutelpaar waarmee de server zich legitimeert (RFC 8292). */
export interface VapidSleutels {
  readonly publiek: string;
  readonly prive: string;
  readonly subject: string;
}

/** Wat de service worker uitleest — zie `public/sw.js`. */
export interface WebPushBericht {
  readonly titel: string;
  readonly body: string;
  readonly pad: string;
  readonly soort: string;
}

/**
 * De uitkomst van één aflevering.
 *
 * ⚠️ `weg` is een eigen uitkomst en geen mislukking, want er hoort iets anders te
 *    gebeuren: het abonnement bestaat niet meer en de rij in `push_tokens` moet
 *    opgeruimd worden. Blijft hij staan, dan probeert elke ronde opnieuw een
 *    adres dat nooit meer werkt.
 *
 * ⚠️ `ongeldig` is een tweede reden om een rij op te ruimen en hij is smal
 *    (QS8-690): het **abonnement zelf** is niet te gebruiken — `p256dh` of
 *    `auth` zijn geen geldige sleutel, wat er ook met de pushdienst of met onze
 *    eigen VAPID-sleutel is. Dat is een eigenschap van de rij en geen storing
 *    van dit moment: elke volgende ronde faalt hetzelfde. Een kapotte
 *    VAPID-sleutel is dat **niet** en blijft `mislukt`.
 */
export type WebPushUitkomst =
  | { readonly status: 'bezorgd' }
  | { readonly status: 'weg'; readonly httpStatus: number }
  | { readonly status: 'ongeldig'; readonly reden: string }
  | {
      readonly status: 'mislukt';
      readonly reden: string;
      /**
       * `true` als het abonnement zelf niet getoetst kon worden. Zo'n uitkomst
       * telt in de stroomonderbreker niet als bewijs dat de toets werkt.
       */
      readonly ongetoetst?: true;
    };

/**
 * Hoe lang de pushdienst het bericht vasthoudt voor een toestel dat offline is.
 *
 * ⚠️ Zes uur, en niet langer: al deze meldingen gaan over vandáág — een nudge,
 *    een goedkeuringsverzoek, het einde van je week. Een melding die morgen
 *    alsnog binnenkomt is geen herinnering meer maar ruis.
 */
export const TTL_SECONDEN = 6 * 60 * 60;

/**
 * Vertaalt de HTTP-status van een pushdienst naar wat er moet gebeuren.
 *
 * ⚠️ Los en geëxporteerd omdat híér de beslissing zit die een rij verwijdert.
 *    404 en 410 zijn de twee codes die RFC 8030 §7 aan een verdwenen abonnement
 *    geeft: de gebruiker heeft de toestemming ingetrokken, de browser opnieuw
 *    geïnstalleerd, of de service worker afgemeld. Alles daarbuiten — ook een
 *    429 of een 500 — is een storing van dit moment en geen reden om iemands
 *    abonnement weg te gooien.
 */
export function uitkomstVan(status: number): WebPushUitkomst {
  if (status >= 200 && status < 300) return { status: 'bezorgd' };
  if (status === 404 || status === 410) return { status: 'weg', httpStatus: status };
  return { status: 'mislukt', reden: `de pushdienst gaf HTTP ${status}` };
}

/**
 * Levert één melding af bij één abonnement.
 *
 * @param fetchImpl bewust een parameter en niet de globale `fetch`: zo kan een
 *   test elke antwoordcode voeden, inclusief de codes die een rij verwijderen.
 */
/**
 * Hosts van bekende webpushdiensten.
 *
 * ⚠️ **Deze lijst is een kopie van `is_pushdienst()` in migratie 0117** en
 *    `tests/beloftes/pushdienst-allowlist.test.ts` bewaakt dat ze gelijk
 *    blijven. Loopt hij uiteen, dan weigert de database iets dat deze kant
 *    doorlaat — of erger, andersom.
 */
export const PUSHDIENST_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'web.push.apple.com',
] as const;

export const PUSHDIENST_ACHTERVOEGSELS = ['.push.services.mozilla.com', '.notify.windows.com'] as const;

/**
 * Of een endpoint-URL van een bekende webpushdienst is.
 *
 * ⚠️ Allowlist en geen blocklist: de verzameling echte pushdiensten is klein en
 *    bekend, de verzameling gevaarlijke adressen niet. Een blocklist op RFC1918
 *    en 169.254.169.254 laat elke DNS-naam door die daarheen wijst.
 */
export function isPushdienst(endpoint: string): boolean {
  let host: string;
  try {
    const url = new URL(endpoint);
    // `https` verplicht: Web Push kent geen `http`-endpoints, en zonder deze eis
    // is `http://fcm.googleapis.com.aanvaller.test` een geldige host. Userinfo
    // en een poort maken het geen pushdienst en vallen er hier uit.
    if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
      return false;
    }
    host = url.hostname.toLowerCase();
  } catch {
    return false;
  }

  return (
    (PUSHDIENST_HOSTS as readonly string[]).includes(host) ||
    PUSHDIENST_ACHTERVOEGSELS.some((achtervoegsel) => host.endsWith(achtervoegsel))
  );
}

/**
 * Het oordeel van de toets op het abonnement zelf, als hij het afkeurt of niet
 * kan toetsen. `abonnementFout()` geeft `Abonnementoordeel | null`; `null`
 * betekent bruikbaar en hoort bij de functie, niet bij dit type.
 */
export type Abonnementoordeel =
  | { readonly status: 'ongeldig'; readonly reden: string }
  | { readonly status: 'mislukt'; readonly reden: string; readonly ongetoetst: true };

/**
 * De twee excepties die alleen van de rij kunnen komen.
 *
 * ⚠️ **Een allowlist op naam, en dat is de helft van QS8-690 die gegevens
 *    bewaart.** `atob()` geeft `InvalidCharacterError` op een teken dat geen
 *    base64 is; `importKey()` geeft in Node `DataError` op een punt dat niet op
 *    de curve ligt — 📏 in Deno 2.9.6 niet, en daarom rekent `ligtOpP256()` dat
 *    zelf. `InvalidCharacterError` is in Node en Deno een `DOMException`. Alles
 *    daarbuiten — een `TypeError` omdat `crypto.subtle` er niet is, een
 *    `NotSupportedError` omdat de runtime P-256 kwijt is — is een storing van de
 *    runtime en raakt elk abonnement tegelijk. 📏 Tot de batch-review van
 *    17-11-2026 ving deze functie élke exceptie als `ongeldig`, en dan wist één
 *    WebCrypto-regressie in één ronde elk web-abonnement.
 */
const FOUTEN_VAN_DE_RIJ = ['InvalidCharacterError', 'DataError'] as const;

function isFoutVanDeRij(fout: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    fout instanceof DOMException &&
    (FOUTEN_VAN_DE_RIJ as readonly string[]).includes(fout.name)
  );
}

function foutTekst(fout: unknown): string {
  return fout instanceof Error ? fout.message : String(fout);
}

/** Haalt elke URL uit een foutmelding, zodat er geen endpoint in een log belandt. */
export function zonderUrl(tekst: string): string {
  return tekst.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)'"]+/gi, '<url>');
}

/** De priemmodulus en de coëfficiënt `b` van P-256 (SEC 2, §2.4.2; `a` is −3). */
const P256_P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;

function alsGetal(bytes: Uint8Array): bigint {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  return n;
}

/**
 * Of een ongecomprimeerd punt van 65 octetten op P-256 ligt: `y² ≡ x³ − 3x + b (mod p)`.
 *
 * ⚠️⚠️ **Zelf gerekend, en niet aan `importKey()` overgelaten** (code-critic op
 *    het herstel, 17-11-2026). 📏 In Deno 2.9.6 **slaagt** `importKey()` op een
 *    punt dat niet op de curve ligt; pas `deriveBits()` valt om, met een
 *    `TypeError` "Unexpected error decoding private key". Die tekst leek op onze
 *    eigen VAPID-sleutel te wijzen en kwam van het abonnement. Node geeft op
 *    hetzelfde punt wél een `DataError` — de tests draaien in Node, productie in
 *    Deno, en een toets die op het verschil leunt is in de ene groen en in de
 *    andere dood. Deze rekensom hangt alleen van de rij af.
 */
export function ligtOpP256(punt: Uint8Array): boolean {
  const x = alsGetal(punt.subarray(1, 33));
  const y = alsGetal(punt.subarray(33, 65));
  if (x >= P256_P || y >= P256_P) return false;
  const rechts = (((x * x % P256_P) * x - 3n * x + P256_B) % P256_P + P256_P) % P256_P;
  return (y * y) % P256_P === rechts;
}

/**
 * Of het abonnement zelf bruikbaar is, los van onze eigen sleutels — QS8-690.
 *
 * ⚠️ **Dit is wat "ongeldig" van "mislukt" scheidt.** Tot QS8-690 zat
 *    `versleutelPayload()` en `vapidAuthorization()` in één `catch`, en dan is de
 *    melding `versleutelen mislukte: …` van beide kanten dezelfde zin: een
 *    kapot abonnement en een kapotte `VAPID_PRIVATE_KEY` zijn aan het log niet te
 *    onderscheiden. 📏 Op productie stonden 11 meldingen in één run, 6 met
 *    `invalid P-256 elliptic curve point` en 5 met `Unexpected error decoding
 *    private key`.
 *
 *    Alleen een fout die **uitsluitend van de rij afhangt** mag de rij kosten.
 *    Dat zijn er hier zes en niet meer: de lengte en het eerste octet van
 *    `p256dh`, of het punt op de curve ligt (`ligtOpP256()`), de lengte van
 *    `auth`, en de twee excepties uit `FOUTEN_VAN_DE_RIJ` (waarvan `DataError`
 *    in Deno nooit komt — zie daar). Elke andere worp is
 *    `mislukt` en de rij blijft staan.
 *
 * ⚠️ `importKey()` blijft staan als tweede slot, niet als de toets: in Node
 *    vangt hij hetzelfde als `ligtOpP256()`, in Deno niets (zie daar).
 */
export async function abonnementFout(
  doel: Pick<WebPushDoel, 'p256dh' | 'auth'>,
): Promise<Abonnementoordeel | null> {
  try {
    const publiek = vanBase64url(doel.p256dh);
    if (publiek.length !== 65 || publiek[0] !== 0x04) {
      return { status: 'ongeldig', reden: 'p256dh is geen ongecomprimeerd P-256-punt van 65 octetten' };
    }
    if (!ligtOpP256(publiek)) return { status: 'ongeldig', reden: 'p256dh ligt niet op P-256' };
    if (vanBase64url(doel.auth).length !== 16) return { status: 'ongeldig', reden: 'auth is niet 16 octetten' };
    await crypto.subtle.importKey('raw', publiek as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    return null;
  } catch (fout) {
    if (isFoutVanDeRij(fout)) return { status: 'ongeldig', reden: `abonnement niet te lezen: ${foutTekst(fout)}` };
    return { status: 'mislukt', reden: `abonnement niet te toetsen: ${foutTekst(fout)}`, ongetoetst: true };
  }
}

/**
 * De versleutelde body plus de VAPID-header, of de reden dat het niet lukte.
 *
 * ⚠️ **Apart sinds QS8-190**, en niet alleen om onder de vijftig regels te
 *    komen: dit stuk is het enige in `verstuurWebPush()` dat wérpt, en die worp
 *    hoort binnen één functie te blijven. `versleutelPayload()` valt om op een
 *    kapotte sleutel of een onleesbaar abonnement, en dat is geen reden om de
 *    rij op te ruimen — dat zou een configuratiefout omzetten in dataverlies.
 *
 * ⚠️ **Twee `try`'s sinds QS8-690, en elke reden noemt zijn kant.** Het
 *    abonnement is al gecontroleerd door `abonnementFout()`; wat hier faalt is
 *    dus het versleutelen zelf of onze eigen VAPID-sleutel. De tweede heet
 *    `VAPID-sleutel onbruikbaar` en raakt elk abonnement: staat dat in het log,
 *    kijk dan naar `VAPID_PRIVATE_KEY` in de omgeving van de functie en niet
 *    naar de rijen in `push_tokens`.
 */
async function maakPakket(invoer: {
  readonly doel: WebPushDoel;
  readonly sleutels: VapidSleutels;
  readonly nu: Date;
}, payload: string): Promise<{ body: Uint8Array; vapid: { Authorization: string } } | { reden: string }> {
  let body: Uint8Array;
  try {
    body = await versleutelPayload(invoer.doel, payload);
  } catch (fout) {
    return { reden: `versleutelen mislukte: ${foutTekst(fout)}` };
  }

  try {
    const vapid = await vapidAuthorization({
      endpoint: invoer.doel.endpoint,
      publiekeSleutel: invoer.sleutels.publiek,
      priveSleutel: invoer.sleutels.prive,
      subject: invoer.sleutels.subject,
      nu: invoer.nu,
    });
    return { body, vapid };
  } catch (fout) {
    return { reden: `VAPID-sleutel onbruikbaar: ${foutTekst(fout)}` };
  }
}

export async function verstuurWebPush(invoer: {
  readonly doel: WebPushDoel;
  readonly bericht: WebPushBericht;
  readonly sleutels: VapidSleutels;
  /** Het moment waarop de VAPID-`exp` gerekend wordt (correctheidsregel 7). */
  readonly nu: Date;
  readonly fetchImpl: typeof fetch;
  readonly ttlSeconden?: number;
}): Promise<WebPushUitkomst> {
  // ⚠️ Vóór de VAPID-sleutel en de pushdienst: een abonnement dat zelf niet deugt
  //    is `ongeldig`, ook als onze sleutel op dit moment óók kapot is.
  //
  // ⚠️ **En als éérste, vóór de grens op de payload** (batch-review 17-11-2026).
  //    De stroomonderbreker in `opruimbesluit()` telt elke uitkomst als een
  //    oordeel over het abonnement; een `mislukt` dat deze toets nooit gezien
  //    heeft, zou daar meetellen als bewijs dat de toets werkt.
  const oordeel = await abonnementFout(invoer.doel);
  if (oordeel !== null) return oordeel;

  const payload = JSON.stringify(invoer.bericht);

  // ⚠️ Vóór het versleutelen. `versleutelPayload()` wérpt boven deze grens, en
  //    een worp midden in een ronde kost de rest van die ronde ook.
  if (payload.length > PAYLOAD_MAX) {
    return { status: 'mislukt', reden: `bericht is ${payload.length} bytes, meer dan ${PAYLOAD_MAX}` };
  }

  // ⚠️ **Tweede slot, en het staat hier omdat dit de plek is die het doet.**
  //    0117 laat `registreer_push_token()` het adres al toetsen, maar deze
  //    `fetch()` draait onder `service_role` vanuit het Supabase-netwerk: hij is
  //    de aanvrager. Rijen die vóór 0117 zijn opgeslagen komen hier nog steeds
  //    langs, en een tweede schrijfpad naar `push_tokens` zou de eerste toets
  //    omzeilen. Een grendel op de plek van de handeling overleeft allebei.
  //
  // ⚠️ **En vóór het versleutelen** (derde batch-review). Stond hij erna, dan
  //    werd een rij met een kapot endpoint als "versleutelen mislukte" of
  //    "VAPID-sleutel onbruikbaar" gelogd: een fout over de verkeerde kant.
  //    `vapidAuthorization()` doet `new URL(endpoint).origin`, dus een endpoint
  //    dat geen URL is gaf die VAPID-fout óók met een goede sleutel — en dat
  //    stuurt de beheerder naar het roteren van `VAPID_PRIVATE_KEY`.
  if (!isPushdienst(invoer.doel.endpoint)) {
    return { status: 'mislukt', reden: 'endpoint is geen bekende pushdienst' };
  }

  const pakket = await maakPakket(invoer, payload);
  if ('reden' in pakket) return { status: 'mislukt', reden: pakket.reden };
  const { body, vapid } = pakket;

  try {
    const antwoord = await invoer.fetchImpl(invoer.doel.endpoint, {
      method: 'POST',
      headers: {
        ...vapid,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(invoer.ttlSeconden ?? TTL_SECONDEN),
      },
      body: body as BodyInit,
      // CLAUDE.md coderegel 14: elke externe call heeft een timeout.
      signal: AbortSignal.timeout(15_000),
      // ⚠️ **Geen redirect volgen** (security-review, derde ronde op QS8-690).
      //    `weg` wist een rij, en dat oordeel hoort van de pushdienst zelf te
      //    komen. Volgt `fetch` een 3xx, dan kan een 404 van een ánder adres als
      //    `weg` binnenkomen — en omzeilt de redirect de allowlist hierboven. Een
      //    3xx is daarom `mislukt` (`uitkomstVan()`), en de rij blijft.
      redirect: 'manual',
    });

    return uitkomstVan(antwoord.status);
  } catch (fout) {
    return {
      status: 'mislukt',
      // ⚠️ Zonder URL: Deno's fetch zet het adres in zijn melding, en een
      //    endpoint is een capability-URL — wie hem kent, kan pushen.
      reden: `de pushdienst was niet bereikbaar: ${zonderUrl(foutTekst(fout))}`,
    };
  }
}

/**
 * Hoeveel rijen één run van de notificatiejob per bron ten hoogste uit `push_tokens` wist.
 *
 * ⚠️⚠️ **Het plafond is de rem die elke toekomstige fout klein houdt**
 *    (security-review op het herstel, 17-11-2026). De onderbreker hieronder vangt
 *    alleen een fout die élk abonnement raakt. 📏 Een `vanBase64url()` zonder de
 *    vertaling van `-` en `_` raakt er volgens de reviewer **96,4%** (gemeten over
 *    20.000 sleutels): `atob()` geeft dan `InvalidCharacterError`, de rest wordt
 *    bezorgd, de onderbreker springt niet — en zonder plafond is bijna iedereen
 *    zijn web-meldingen in één run kwijt.
 *
 *    **Drie per run, per bron**: drie voor `weg` en drie voor `ongeldig`, dus
 *    hoogstens zes rijen per run, en een kapotte toets hoogstens drie. De 9
 *    kapotte rijen van 17-11-2026 zijn zo op zijn vroegst in drie runs weg, en een kapotte toets
 *    kost per **run** hoogstens drie rijen en een melding in Sentry. Per run en
 *    niet per uur: een `workflow_dispatch` is een run en telt opnieuw. Wat boven
 *    het plafond valt, blijft staan.
 *
 * ⚠️⚠️ **Een eigen plafond per bron, en niet één gedeeld** (derde batch-review,
 *    17-11-2026). 📏 Met één teller vulden drie gewone 404/410's het plafond, en
 *    werd daarna elke ongeldige rij als tegengehouden geteld: dan ging
 *    `webpush_wisplafond_ongeldig` af bij normaal verloop, terwijl dat juist het
 *    alarm is voor een kapotte toets. Gescheiden telt `_ongeldig` alleen nog wat
 *    `ongeldig` zelf opmaakte.
 *
 * ⚠️ **Open tot QS8-696:** een gebruiker kan `_ongeldig` nog zelf laten afgaan
 *    door abonnementen met een punt buiten de curve te registreren —
 *    `registreer_push_token()` toetst alleen de lengte. Zie besluit 10 in
 *    `docs/decisions/2026-11-17-een-kapot-abonnement-en-een-kapotte-serversleutel.md`.
 *
 * ⚠️⚠️ **Per rij en niet per melding** (tweede batch-review, 17-11-2026). Eén
 *    profiel krijgt in een run soms drie meldingen, en `apparaten` wordt één
 *    keer per profiel gelezen. 📏 Telde `weg` per melding, dan kostte één
 *    verdwenen abonnement drie plekken van het plafond, bleef een echt ongeldige
 *    rij staan, en ging het plafondalarm als routineruis naar Sentry. Daarom
 *    `noteerUitkomst()` en `isWeg()`: een rij die deze run al weg is, wordt niet
 *    opnieuw verstuurd, niet opnieuw gewist en niet opnieuw geteld.
 */
export const MAX_WISSEN_PER_RUN = 3;

/** Waarom een rij gewist zou worden: de pushdienst zei 404/410, of de rij zelf deugt niet. */
export type Wisbron = 'weg' | 'ongeldig';

/**
 * Wat één run van de notificatiejob over het opruimen van abonnementen weet.
 *
 * ⚠️⚠️ **Een stroomonderbreker, en hij staat op de run en niet op één
 *    gebruiker** (batch-review 17-11-2026). `ongeldig` verwijdert een rij, en
 *    dat oordeel komt van code die zelf kan breken. Is élk abonnement dat de run
 *    toetste `ongeldig`, dan is dat het patroon dat een kapotte toets altijd
 *    geeft en een verzameling echte abonnementen nooit: dan wordt er niets
 *    verwijderd en alleen gemeld. Een fout die bijna alles raakt maar niet alles,
 *    vangt `MAX_WISSEN_PER_RUN`.
 *
 *    Per gebruiker zou het niet werken: wie één web-abonnement heeft — de
 *    meeste mensen — heeft dan altijd "alle rijen ongeldig", en zijn kapotte
 *    rij gaat nooit weg.
 *
 * ⚠️ **Rijen, geen uitkomsten.** Wie vijf meldingen krijgt, telt één keer; een
 *    `mislukt` waarbij het abonnement niet getoetst kon worden (`ongetoetst`)
 *    telt niet, want die zegt niets over of de toets werkt.
 *
 * ⚠️ **De prijs, en die is bewust.** Een run die alleen kapotte abonnementen
 *    tegenkomt, ruimt niets op. Ten onrechte laten staan kost een logregel per
 *    uur; ten onrechte wissen kost iemand zijn meldingen (grens 2).
 */
export interface Opruimlijst {
  /** De abonnementen die de run getoetst heeft. */
  readonly getoetst: Set<string>;
  /** De ongeldige abonnementen, één keer elk, met de reden. */
  readonly kandidaten: Map<string, { readonly doel: WebPushDoel; readonly reden: string }>;
  /** De abonnementen die de pushdienst deze run `weg` noemde, één keer elk. */
  readonly weg: Set<string>;
  /** Hoeveel rijen er deze run al gewist zijn, per bron — elk een eigen plafond. */
  readonly gewist: Record<Wisbron, number>;
  /** Hoeveel rijen het plafond tegenhield, per bron — elk een eigen alarm. */
  readonly tegengehouden: Record<Wisbron, number>;
}

export function nieuweOpruimlijst(): Opruimlijst {
  return {
    getoetst: new Set(),
    kandidaten: new Map(),
    weg: new Set(),
    gewist: { weg: 0, ongeldig: 0 },
    tegengehouden: { weg: 0, ongeldig: 0 },
  };
}

/**
 * Vanaf hoeveel getoetste abonnementen een gesprongen onderbreker naar Sentry
 * gaat. Daaronder alleen een logregel: een run die één of twee web-meldingen
 * verstuurt en toevallig alleen kapotte rijen treft, is gezond.
 */
export const ALARM_VANAF = 3;

const sleutelVan = (doel: WebPushDoel): string => JSON.stringify([doel.endpoint, doel.p256dh, doel.auth]);

/** Of de pushdienst dit abonnement deze run al `weg` noemde. Zie de kop van `MAX_WISSEN_PER_RUN`. */
export function isWeg(lijst: Opruimlijst, doel: WebPushDoel): boolean {
  return lijst.weg.has(sleutelVan(doel));
}

/** Noteert één uitkomst. Een `ongeldig` abonnement wordt kandidaat, niet verwijderd. */
export function noteerUitkomst(lijst: Opruimlijst, doel: WebPushDoel, uitkomst: WebPushUitkomst): void {
  if (uitkomst.status === 'mislukt' && uitkomst.ongetoetst === true) return;
  lijst.getoetst.add(sleutelVan(doel));
  if (uitkomst.status === 'ongeldig') lijst.kandidaten.set(sleutelVan(doel), { doel, reden: uitkomst.reden });
  if (uitkomst.status === 'weg') lijst.weg.add(sleutelVan(doel));
}

/**
 * Of er nog een rij gewist mag worden; telt hem meteen als gewist.
 *
 * ⚠️ Eén functie voor de vraag én de telling, zodat er tussen die twee geen
 *    `await` kan staan: acht profielen lopen tegelijk.
 */
export function magWissen(lijst: Opruimlijst, bron: Wisbron): boolean {
  if (lijst.gewist[bron] >= MAX_WISSEN_PER_RUN) {
    lijst.tegengehouden[bron] += 1;
    return false;
  }
  lijst.gewist[bron] += 1;
  return true;
}

/**
 * Welke ongeldige abonnementen weg mogen, of dat de onderbreker gesprongen is.
 *
 * @returns `onderbroken: true` en een lege lijst als élk getoetst abonnement
 *   van de run `ongeldig` was; anders de kandidaten. Het plafond past de
 *   aanroeper toe met `magWissen()`.
 */
export function opruimbesluit(lijst: Opruimlijst): {
  readonly verwijder: readonly { readonly doel: WebPushDoel; readonly reden: string }[];
  readonly onderbroken: boolean;
} {
  if (lijst.kandidaten.size > 0 && lijst.kandidaten.size === lijst.getoetst.size) {
    return { verwijder: [], onderbroken: true };
  }
  return { verwijder: [...lijst.kandidaten.values()], onderbroken: false };
}
