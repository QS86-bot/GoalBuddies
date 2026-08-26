import { describe, expect, it } from 'vitest';

import { abonnementNaarToken, webPushStandVan } from './webpush-stand';

/** Een geldig abonnement zoals `PushSubscription.toJSON()` het levert. */
const GELDIG = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BPubliekeSleutel', auth: 'AuthGeheim' },
};

describe('abonnementNaarToken', () => {
  it('zet een volledig abonnement om naar een webtoken', () => {
    expect(abonnementNaarToken(GELDIG)).toEqual({
      token: 'https://fcm.googleapis.com/fcm/send/abc',
      platform: 'web',
      p256dh: 'BPubliekeSleutel',
      auth: 'AuthGeheim',
    });
  });

  /**
   * ⚠️ De sleutels zijn niet optioneel: zonder `p256dh` en `auth` kun je de
   *    browser niets versleuteld sturen (RFC 8291) en weigert de RPC de rij. Een
   *    registratie zonder sleutels is geen registratie — dus `null`, geen rij met
   *    gaten die pas bij het verzenden stukloopt.
   */
  it('weigert een abonnement zonder sleutels', () => {
    expect(abonnementNaarToken({ endpoint: GELDIG.endpoint })).toBeNull();
    expect(abonnementNaarToken({ endpoint: GELDIG.endpoint, keys: {} })).toBeNull();
    expect(
      abonnementNaarToken({ endpoint: GELDIG.endpoint, keys: { p256dh: 'x' } }),
    ).toBeNull();
    expect(
      abonnementNaarToken({ endpoint: GELDIG.endpoint, keys: { auth: 'x' } }),
    ).toBeNull();
  });

  it('weigert een abonnement zonder endpoint', () => {
    expect(abonnementNaarToken({ keys: GELDIG.keys })).toBeNull();
    expect(abonnementNaarToken({ endpoint: '', keys: GELDIG.keys })).toBeNull();
  });

  it('leest een leeg abonnement niet als geldig', () => {
    expect(abonnementNaarToken(null)).toBeNull();
  });
});

describe('webPushStandVan', () => {
  it('is niet-ondersteund als de browser het niet kan', () => {
    expect(webPushStandVan({ ondersteund: false, toestemming: 'granted' })).toBe(
      'niet-ondersteund',
    );
  });

  /**
   * ⚠️ Niet-ondersteund wint van elke toestemming. Een browser zonder PushManager
   *    kan `Notification.permission` alsnog op `granted` hebben staan van een ander
   *    mechanisme; dat mag niet als "meldingen staan aan" gelezen worden.
   */
  it('is geblokkeerd bij een geweigerde toestemming', () => {
    expect(webPushStandVan({ ondersteund: true, toestemming: 'denied' })).toBe('geblokkeerd');
  });

  it('is aan bij een gegeven toestemming', () => {
    expect(webPushStandVan({ ondersteund: true, toestemming: 'granted' })).toBe('aan');
  });

  it('is uit zolang er nog niets gevraagd is', () => {
    expect(webPushStandVan({ ondersteund: true, toestemming: 'default' })).toBe('uit');
  });
});
