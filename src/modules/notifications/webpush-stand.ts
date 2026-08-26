/**
 * De toetsbare kern van web-push — QS8-114.
 *
 * ⚠️ **Waarom dit los van `webpush-bron.ts` staat.** De bron importeert `tokens.ts`
 *    en dus de datalaag, en die trekt `react-native` mee — niet te laden in de
 *    node-omgeving van de test. Dit bestand houdt de beslissingen (welke toestand,
 *    is dit abonnement bruikbaar) apart, zonder één zware import, precies zoals
 *    `installatie.ts` dat doet. Het enige wat het van `tokens.ts` leent is een
 *    *type*, en dat wordt bij het compileren weggestreept (`import type`).
 *
 * ⚠️ Alleen browser-globals (`navigator`, `window`, `Notification`), geen
 *    datalaag. Zo blijft de logica toetsbaar en de I/O in de bron.
 */

import type { Platform } from './tokens';

/** Wat de datalaag over een webabonnement nodig heeft. Vorm van `PushBron.haalToken`. */
export interface WebPushToken {
  readonly token: string;
  readonly platform: Extract<Platform, 'web'>;
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Zet een browserabonnement (`PushSubscription.toJSON()`) om naar wat de datalaag
 * wil, of `null` als het onbruikbaar is.
 *
 * ⚠️ `p256dh` en `auth` zijn niet optioneel: zonder die twee kun je een browser
 *    niets versleuteld sturen (RFC 8291) en weigert de RPC de registratie sinds
 *    migratie 0067. Een abonnement zonder sleutels is dus geen halve registratie
 *    maar geen registratie — vandaar `null` en niet een rij met lege velden.
 */
export function abonnementNaarToken(json: {
  readonly endpoint?: string | null;
  readonly keys?: Readonly<Record<string, string>> | null;
} | null): WebPushToken | null {
  if (json === null) return null;

  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (typeof endpoint !== 'string' || endpoint === '') return null;
  if (typeof p256dh !== 'string' || p256dh === '') return null;
  if (typeof auth !== 'string' || auth === '') return null;

  return { token: endpoint, platform: 'web', p256dh, auth };
}

/**
 * Wat de gebruiker op het scherm ziet.
 *
 * ⚠️ `aan` betekent "toestemming gegeven", niet "gegarandeerd geabonneerd". Het
 *    daadwerkelijke abonneren gebeurt bij elke start opnieuw via de bron; als dat
 *    een keer faalt, meldt `reportError` dat. De knop hoeft dat onderscheid niet
 *    te tonen — voor de gebruiker is "ik heb ja gezegd" de toestand die telt.
 */
export type WebPushStand = 'niet-ondersteund' | 'uit' | 'aan' | 'geblokkeerd';

/** De toestand, afgeleid van ondersteuning en toestemming. Puur en dus toetsbaar. */
export function webPushStandVan(omgeving: {
  readonly ondersteund: boolean;
  readonly toestemming: NotificationPermission;
}): WebPushStand {
  if (!omgeving.ondersteund) return 'niet-ondersteund';
  if (omgeving.toestemming === 'denied') return 'geblokkeerd';
  if (omgeving.toestemming === 'granted') return 'aan';
  return 'uit';
}

/**
 * Ondersteunt deze omgeving web-push? Drie dingen moeten er zijn; op native en bij
 * server-side render ontbreken ze en is het antwoord `false`.
 */
export function webPushMogelijk(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** De huidige toestand, gelezen uit de browser. */
export function huidigeWebPushStand(): WebPushStand {
  if (!webPushMogelijk()) return 'niet-ondersteund';
  return webPushStandVan({ ondersteund: true, toestemming: Notification.permission });
}
