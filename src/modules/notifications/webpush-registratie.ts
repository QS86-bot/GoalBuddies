import { naarBase64url, vanBase64url } from './webpush-crypto';
import type { PushBron } from './tokens';

/**
 * Web push aanzetten en het abonnement omzetten naar een pushtoken — QS8-124.
 *
 * ⚠️ **Dit bestand importeert bewust niets uit `tokens.ts` behalve het type.**
 *    Zou het dat wel doen, dan trekt elke test die deze regels wil controleren
 *    `lib/supabase` mee, en daarmee de Supabase-client, AsyncStorage en React
 *    Native — in een test die in Node draait. Zelfde reden als bij
 *    `chat-schemas.ts` en de andere schema-bestanden (QS8-120, QS8-121).
 *    `import type` wordt door `verbatimModuleSyntax` volledig gewist.
 *
 * ⚠️ **Waarom de beslissing een pure functie is en geen component.** Precies
 *    zoals bij `shared/pwa/installatie.ts`: de gevallen waar het misgaat zijn
 *    "browser kan het niet", "de sleutel ontbreekt" en "de gebruiker heeft ooit
 *    geweigerd". Die horen onder test te staan, en iets dat `navigator` leest is
 *    niet te testen zonder browser.
 */

/** Wat er met meldingen aan de hand is, en dus wat het scherm moet zeggen. */
export type Meldingenstand =
  /** Deze browser kan geen web push. Niets aan te doen, niets aan te bieden. */
  | 'niet-ondersteund'
  /** De gebruiker heeft geweigerd. Alleen terug te draaien in de browser zelf. */
  | 'geweigerd'
  /** `EXPO_PUBLIC_VAPID_PUBLIC_KEY` ontbreekt. Een deployfout, geen keuze. */
  | 'geen-sleutel'
  /** Toestemming staat er al; er valt niets meer te vragen. */
  | 'aan'
  /** Alles kan, er is alleen nog niet gevraagd. */
  | 'uit';

export interface Pushomgeving {
  readonly serviceWorker: boolean;
  readonly pushManager: boolean;
  readonly notificatie: boolean;
  /** `Notification.permission`, of `undefined` als de API er niet is. */
  readonly toestemming: 'default' | 'granted' | 'denied' | undefined;
  /** De publieke VAPID-sleutel, of leeg als hij niet geconfigureerd is. */
  readonly sleutel: string | undefined;
}

/**
 * ⚠️ De volgorde is de hele functie.
 *
 *    "Niet ondersteund" wint van alles: dan zegt de rest niets. "Geweigerd"
 *    komt vóór "geen sleutel", want een geweigerde gebruiker een configuratie-
 *    fout voorschotelen is onzin — hij kan het toch niet aanzetten. En "geen
 *    sleutel" komt vóór "uit", zodat we nooit een knop tonen die gegarandeerd
 *    stukloopt op `subscribe()`.
 */
export function meldingenstand(omgeving: Pushomgeving): Meldingenstand {
  const kan = omgeving.serviceWorker && omgeving.pushManager && omgeving.notificatie;
  if (!kan) return 'niet-ondersteund';
  if (omgeving.toestemming === 'denied') return 'geweigerd';
  if (omgeving.sleutel === undefined || omgeving.sleutel.trim() === '') return 'geen-sleutel';
  if (omgeving.toestemming === 'granted') return 'aan';
  return 'uit';
}

/** Het deel van `PushSubscription` dat we nodig hebben, zodat het te testen is. */
export interface Webabonnement {
  readonly endpoint: string;
  getKey(naam: 'p256dh' | 'auth'): ArrayBuffer | null;
}

export interface Webpushtoken {
  readonly token: string;
  readonly platform: 'web';
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Zet een `PushSubscription` om in wat `PushBron.haalToken()` belooft.
 *
 * ⚠️ Geeft `null` zodra één van beide sleutels ontbreekt, en dat is geen
 *    voorzichtigheid maar een eis. Zonder `p256dh` en `auth` kun je een browser
 *    niets sturen (RFC 8291), en de CHECK uit migratie 0062 weigert de rij.
 *    Sinds 0067 komt daar een nette `{ok:false, reason}` uit in plaats van een
 *    ruwe 23514 — maar een verzoek dat gegarandeerd wordt afgewezen sturen we
 *    niet.
 */
export function abonnementNaarToken(abonnement: Webabonnement): Webpushtoken | null {
  const p256dh = abonnement.getKey('p256dh');
  const auth = abonnement.getKey('auth');
  if (p256dh === null || auth === null) return null;

  return {
    token: abonnement.endpoint,
    platform: 'web',
    p256dh: naarBase64url(new Uint8Array(p256dh)),
    auth: naarBase64url(new Uint8Array(auth)),
  };
}

/** Het pad van de service worker. Staat in `public/` en wordt ongewijzigd gekopieerd. */
export const SERVICE_WORKER_PAD = '/sw.js';

function huidigeOmgeving(sleutel: string | undefined): Pushomgeving {
  const heeftNavigator = typeof navigator !== 'undefined';
  const heeftWindow = typeof window !== 'undefined';

  return {
    serviceWorker: heeftNavigator && 'serviceWorker' in navigator,
    pushManager: heeftWindow && 'PushManager' in window,
    notificatie: heeftWindow && 'Notification' in window,
    toestemming: heeftWindow && 'Notification' in window ? Notification.permission : undefined,
    sleutel,
  };
}

/** De stand nu, in deze browser. Voor het scherm. */
export function huidigeMeldingenstand(sleutel: string | undefined): Meldingenstand {
  return meldingenstand(huidigeOmgeving(sleutel));
}

/**
 * Registreert de service worker. Idempotent: de browser hergebruikt een
 * bestaande registratie voor hetzelfde pad en dezelfde scope.
 *
 * ⚠️ Faalt hier stil met `null` in plaats van te gooien. De meest voorkomende
 *    oorzaak is een `/sw.js` die door de SPA-rewrite als HTML wordt geserveerd
 *    (zie `docs/DEPLOY.md`), en dat is een deployfout die de gebruiker niet kan
 *    oplossen. De aanroeper vertaalt `null` naar een begrijpelijke tekst.
 */
async function registreerWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_PAD);
  } catch {
    return null;
  }
}

export type Aanzetresultaat =
  | { readonly ok: true }
  | { readonly ok: false; readonly reden: Meldingenstand | 'mislukt' };

/**
 * Zet meldingen aan. **Alleen aanroepen vanuit een echte gebruikersklik.**
 *
 * ⚠️ Dat is geen stijlkeuze. Vraag je toestemming bij het opstarten, dan klikt
 *    de gebruiker hem weg zonder te weten waarvoor — en dan staat het recht op
 *    `denied`, voorgoed, alleen nog terug te draaien in de browserinstellingen.
 *    Eén ongevraagde prompt kost je dus permanent het kanaal.
 */
export async function zetMeldingenAan(sleutel: string | undefined): Promise<Aanzetresultaat> {
  const stand = huidigeMeldingenstand(sleutel);
  if (stand === 'niet-ondersteund' || stand === 'geweigerd' || stand === 'geen-sleutel') {
    return { ok: false, reden: stand };
  }

  // ⚠️ `meldingenstand` heeft dit al uitgesloten, maar de typecontrole kan daar
  //    niet doorheen kijken. Deze regel narrowt in plaats van te casten: een
  //    `as string` zou bij een latere wijziging aan de volgorde stilzwijgend
  //    `undefined` doorlaten tot in `vanBase64url`.
  if (sleutel === undefined || sleutel.trim() === '') return { ok: false, reden: 'geen-sleutel' };

  const registratie = await registreerWorker();
  if (registratie === null) return { ok: false, reden: 'mislukt' };

  const toestemming = await Notification.requestPermission();
  if (toestemming !== 'granted') return { ok: false, reden: 'geweigerd' };

  try {
    await registratie.pushManager.subscribe({
      userVisibleOnly: true,
      // ⚠️ Een verse `Uint8Array` en niet die uit `vanBase64url` rechtstreeks:
      //    `applicationServerKey` eist een buffer die gegarandeerd geen
      //    `SharedArrayBuffer` is, en dat kan de typecontrole alleen zien bij
      //    een kopie met een eigen `ArrayBuffer`.
      applicationServerKey: new Uint8Array(vanBase64url(sleutel)),
    });
    return { ok: true };
  } catch {
    return { ok: false, reden: 'mislukt' };
  }
}

export type Uitzetresultaat =
  | { readonly ok: true }
  | { readonly ok: false; readonly reden: 'niet-ondersteund' | 'mislukt' };

/**
 * Zet meldingen uit: eerst de rij weg, dán het abonnement opzeggen.
 *
 * ⚠️ **De volgorde is niet vrij, en andersom lekt hij.** `verwijderPushToken()`
 *    vraagt de bron om het token, en op web is dat het endpoint van het lévende
 *    abonnement. Zeg je dat eerst op, dan geeft `haalToken()` `null`, slaat het
 *    verwijderen over en blijft de rij in `push_tokens` staan. Het gevolg is een
 *    apparaat dat meldingen blijft krijgen nadat de gebruiker ze uitzette — en
 *    die meldingen kunnen over zijn week gaan, op een vergrendeld scherm dat
 *    iemand anders kan meelezen.
 *
 * ⚠️ **De toestemming zelf kan de app niet intrekken**, dat kan alleen de
 *    gebruiker in zijn browser. `uit` betekent hier dus "niet meer geabonneerd"
 *    en niet "toestemming weg". Daarom blijft aanzetten daarna werken zonder
 *    nieuwe prompt, en daarom geeft `huidigeMeldingenstand()` na afloop nog
 *    steeds `aan` — de stand die het scherm toont, komt uit de teruggave van
 *    deze functie en niet uit de browser.
 *
 * ⚠️ **Waarom dit bestond en toch niet werkte.** `verwijderPushToken()` staat er
 *    sinds EPIC 11 met in zijn eigen kop "hoort bij uitloggen", en werd tot
 *    26-08-2026 door niets aangeroepen. Elk onderdeel was af en de keten was
 *    nergens aangesloten — de variant uit CLAUDE.md regel 18, vraag 5, die geen
 *    enkele test kan vinden omdat er niets kapot is.
 */
export async function zetMeldingenUit(
  verwijderRij: () => Promise<void>,
): Promise<Uitzetresultaat> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reden: 'niet-ondersteund' };
  }

  try {
    // Eerst de rij, zolang het endpoint nog te lezen is.
    await verwijderRij();

    const registratie = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PAD);
    const abonnement = await registratie?.pushManager.getSubscription();
    if (abonnement !== undefined && abonnement !== null) await abonnement.unsubscribe();

    return { ok: true };
  } catch {
    return { ok: false, reden: 'mislukt' };
  }
}

/**
 * De `PushBron` voor het web.
 *
 * ⚠️ Vraagt **nooit** toestemming en maakt **nooit** een abonnement aan. Hij
 *    leest alleen wat er al is. Dat is met opzet: `registreerPushToken()` draait
 *    bij elke start vanuit `_layout`, en dat is precies het moment waarop je
 *    niets mag vragen. Aanzetten gebeurt via `zetMeldingenAan()`, achter een
 *    klik.
 */
export function maakWebPushBron(): PushBron {
  return {
    haalToken: async () => {
      const registratie = await registreerWorker();
      if (registratie === null) return null;

      const abonnement = await registratie.pushManager.getSubscription();
      if (abonnement === null) return null;

      return abonnementNaarToken(abonnement);
    },
  };
}
