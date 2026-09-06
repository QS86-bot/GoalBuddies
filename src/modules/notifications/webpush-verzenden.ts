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
import { PAYLOAD_MAX, vapidAuthorization, versleutelPayload } from './webpush-crypto';

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
 */
export type WebPushUitkomst =
  | { readonly status: 'bezorgd' }
  | { readonly status: 'weg'; readonly httpStatus: number }
  | { readonly status: 'mislukt'; readonly reden: string };

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
 * De versleutelde body plus de VAPID-header, of de reden dat het niet lukte.
 *
 * ⚠️ **Apart sinds QS8-190**, en niet alleen om onder de vijftig regels te
 *    komen: dit stuk is het enige in `verstuurWebPush()` dat wérpt, en die worp
 *    hoort binnen één functie te blijven. `versleutelPayload()` valt om op een
 *    kapotte sleutel of een onleesbaar abonnement, en dat is geen reden om de
 *    rij op te ruimen — dat zou een configuratiefout omzetten in dataverlies.
 */
async function maakPakket(invoer: {
  readonly doel: WebPushDoel;
  readonly sleutels: VapidSleutels;
  readonly nu: Date;
}, payload: string): Promise<{ body: Uint8Array; vapid: { Authorization: string } } | { reden: string }> {
  try {
    return {
      body: await versleutelPayload(invoer.doel, payload),
      vapid: await vapidAuthorization({
        endpoint: invoer.doel.endpoint,
        publiekeSleutel: invoer.sleutels.publiek,
        priveSleutel: invoer.sleutels.prive,
        subject: invoer.sleutels.subject,
        nu: invoer.nu,
      }),
    };
  } catch (fout) {
    return { reden: `versleutelen mislukte: ${fout instanceof Error ? fout.message : String(fout)}` };
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
  const payload = JSON.stringify(invoer.bericht);

  // ⚠️ Vóór het versleutelen. `versleutelPayload()` wérpt boven deze grens, en
  //    een worp midden in een ronde kost de rest van die ronde ook.
  if (payload.length > PAYLOAD_MAX) {
    return { status: 'mislukt', reden: `bericht is ${payload.length} bytes, meer dan ${PAYLOAD_MAX}` };
  }

  const pakket = await maakPakket(invoer, payload);
  if ('reden' in pakket) return { status: 'mislukt', reden: pakket.reden };
  const { body, vapid } = pakket;

  // ⚠️ **Tweede slot, en het staat hier omdat dit de plek is die het doet.**
  //    0117 laat `registreer_push_token()` het adres al toetsen, maar deze
  //    `fetch()` draait onder `service_role` vanuit het Supabase-netwerk: hij is
  //    de aanvrager. Rijen die vóór 0117 zijn opgeslagen komen hier nog steeds
  //    langs, en een tweede schrijfpad naar `push_tokens` zou de eerste toets
  //    omzeilen. Een grendel op de plek van de handeling overleeft allebei.
  if (!isPushdienst(invoer.doel.endpoint)) {
    return { status: 'mislukt', reden: 'endpoint is geen bekende pushdienst' };
  }

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
    });

    return uitkomstVan(antwoord.status);
  } catch (fout) {
    return {
      status: 'mislukt',
      reden: `de pushdienst was niet bereikbaar: ${
        fout instanceof Error ? fout.message : String(fout)
      }`,
    };
  }
}
