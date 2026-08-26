/**
 * De web-implementatie van `PushBron` — QS8-114.
 *
 * ⚠️ **Waarom dit los van `tokens.ts` staat.** `tokens.ts` is de platformloze
 *    rand: hij weet van een `PushBron` en van de datalaag, maar niet van de
 *    browser. Dit bestand is het browserstuk en niets anders — precies de
 *    scheiding uit CLAUDE.md (web- en native-code apart, de datalaag gedeeld).
 *    De native tegenhanger (`expo-notifications`) wordt straks een tweede
 *    `PushBron` en raakt dit bestand niet.
 *
 * ⚠️ **Toestemming vragen gebeurt nóóit vanzelf.** `haalToken()` abonneert
 *    alleen als de toestemming al `granted` is; het vraagt er zelf niet om. Een
 *    permissieprompt bij het opstarten is een anti-patroon dat browsers actief
 *    afstraffen (Chrome toont hem gedempt, Firefox blokkeert na herhaald
 *    wegklikken), en hij komt bovendien zonder enige context. De prompt hoort
 *    achter een gebruikersgebaar — `zetWebPushAan()`, aangeroepen vanaf een knop.
 *    Zie docs/decisions/2026-08-26-web-push-toestemming.md.
 *
 * ⚠️ De toetsbare kern (`abonnementNaarToken`, `webPushStandVan`, de
 *    toestand-lezers) staat in `webpush-stand.ts`, zonder zware imports. Dit
 *    bestand doet de I/O eromheen.
 */

import { clientEnv } from '../../lib/env';
import { reportError } from '../../lib/observability';

import { registreerPushToken, verwijderPushToken, type PushBron } from './tokens';
import { vanBase64url } from './webpush-crypto';
import {
  abonnementNaarToken,
  huidigeWebPushStand,
  webPushMogelijk,
  type WebPushStand,
  type WebPushToken,
} from './webpush-stand';

/**
 * Registreert de service worker en levert het abonnement — maar alleen als de
 * toestemming al gegeven is. Geeft `null` (en gooit niet) in elk ander geval.
 */
async function abonneer(): Promise<WebPushToken | null> {
  if (!webPushMogelijk()) return null;

  // Geen toestemming → niet abonneren en vooral niet erom vragen. Dat is de taak
  // van `zetWebPushAan()`, achter een gebruikersgebaar.
  if (Notification.permission !== 'granted') return null;

  const publiek = clientEnv().vapidPublicKey;
  if (publiek === undefined || publiek === '') {
    reportError(new Error('EXPO_PUBLIC_VAPID_PUBLIC_KEY ontbreekt in de webbuild.'), 'push.web', {});
    return null;
  }

  const registratie = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // Een bestaand abonnement hergebruiken. Opnieuw abonneren met een andere
  // `applicationServerKey` zou hier gooien (InvalidStateError); zolang de sleutel
  // niet roteert is dat geen zorg, en als hij dat wél doet is een verlopen
  // abonnement het juiste signaal om opnieuw toestemming te vragen.
  const bestaand = await registratie.pushManager.getSubscription();
  const abonnement =
    bestaand ??
    (await registratie.pushManager.subscribe({
      // Verplicht in Chrome: een stille push zonder zichtbare melding mag niet.
      // Past bij de service worker, die altijd iets toont (domeinregel 7-veilig).
      userVisibleOnly: true,
      // `vanBase64url` levert een verse `Uint8Array` met een echte `ArrayBuffer`;
      // de cast is dezelfde als in `webpush-crypto.ts` en overbrugt alleen de
      // generieke buffervorm die de lib-typen sinds kort eisen.
      applicationServerKey: vanBase64url(publiek) as BufferSource,
    }));

  return abonnementNaarToken(abonnement.toJSON());
}

/**
 * De bron die je in `_layout` inplugt met `zetPushBron(webPushBron)`.
 *
 * ⚠️ Faalt stil op het scherm en luid in de logboeken, net als de rest van de
 *    keten: geen enkel scherm hangt hiervan af.
 */
export const webPushBron: PushBron = {
  haalToken: async () => {
    try {
      return await abonneer();
    } catch (fout) {
      reportError(fout, 'push.web', {});
      return null;
    }
  },
};

/**
 * Vraagt toestemming en abonneert. Aanroepen vanáf een gebruikersgebaar (een knop),
 * nooit bij het opstarten — zie de kop van dit bestand.
 *
 * Geeft de nieuwe toestand terug zodat de knop hem meteen kan tonen.
 */
export async function zetWebPushAan(userId: string): Promise<WebPushStand> {
  if (!webPushMogelijk()) return 'niet-ondersteund';

  const antwoord = await Notification.requestPermission();
  if (antwoord !== 'granted') return antwoord === 'denied' ? 'geblokkeerd' : 'uit';

  // Nu de toestemming er is, doet de bron het abonneren en schrijft de datalaag
  // de rij weg. Dezelfde weg als bij elke start, zodat er één plek is die het doet.
  await registreerPushToken(userId);
  return 'aan';
}

/**
 * Zegt het abonnement op: eerst de rij weg, dan de browserkant.
 *
 * ⚠️ De volgorde is niet vrij. `verwijderPushToken()` leest het endpoint uit het
 *    nog levende abonnement; zeg je dat eerst op, dan is er geen endpoint meer om
 *    de rij mee te vinden en blijft hij staan — een apparaat dat meldingen blijft
 *    krijgen terwijl de gebruiker ze uitzette.
 *
 * ⚠️ De toestemming zélf kan de app niet intrekken; dat kan alleen de gebruiker in
 *    de browser. `uit` betekent hier "niet meer geabonneerd", niet "toestemming
 *    weg" — daarom blijft `zetWebPushAan()` daarna zonder nieuwe prompt werken.
 */
export async function zetWebPushUit(): Promise<WebPushStand> {
  if (!webPushMogelijk()) return 'niet-ondersteund';

  try {
    await verwijderPushToken();

    const registratie = await navigator.serviceWorker.getRegistration();
    const abonnement = await registratie?.pushManager.getSubscription();
    if (abonnement !== undefined && abonnement !== null) await abonnement.unsubscribe();
  } catch (fout) {
    reportError(fout, 'push.web.uit', {});
  }

  return huidigeWebPushStand() === 'geblokkeerd' ? 'geblokkeerd' : 'uit';
}
