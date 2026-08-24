import { describe, expect, it } from 'vitest';

import {
  abonnementNaarToken,
  meldingenstand,
  type Pushomgeving,
  type Webabonnement,
} from './webpush-registratie';

/**
 * De vijf standen uit QS8-124, en vooral de volgorde ertussen. Een test die
 * alleen "meldingen kunnen aan" bewijst niets — het risico zit in de gevallen
 * waarin we een knop tonen die gegarandeerd stukloopt, of een configuratiefout
 * voorschotelen aan iemand die toch al geweigerd heeft.
 */

const KAN_ALLES: Pushomgeving = {
  serviceWorker: true,
  pushManager: true,
  notificatie: true,
  toestemming: 'default',
  sleutel: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
};

describe('meldingenstand — wanneer mag de knop er staan', () => {
  it('zegt "uit" als alles kan en er nog niets gevraagd is', () => {
    expect(meldingenstand(KAN_ALLES)).toBe('uit');
  });

  it('zegt "aan" zodra toestemming er al is', () => {
    expect(meldingenstand({ ...KAN_ALLES, toestemming: 'granted' })).toBe('aan');
  });
});

describe('meldingenstand — de gevallen waarin er géén knop hoort', () => {
  /**
   * ⚠️ Elk van de drie ontbrekende API's telt apart. Een browser die wel een
   *    service worker heeft maar geen PushManager bestaat echt — dat was Safari
   *    op macOS vóór 16.
   */
  it.each([
    ['zonder service worker', { serviceWorker: false }],
    ['zonder PushManager', { pushManager: false }],
    ['zonder Notification', { notificatie: false }],
  ])('%s is niet-ondersteund', (_naam, verschil) => {
    expect(meldingenstand({ ...KAN_ALLES, ...verschil })).toBe('niet-ondersteund');
  });

  it('zegt "geweigerd" als de gebruiker ooit nee zei', () => {
    expect(meldingenstand({ ...KAN_ALLES, toestemming: 'denied' })).toBe('geweigerd');
  });

  it('zegt "geen-sleutel" als de VAPID-sleutel ontbreekt', () => {
    expect(meldingenstand({ ...KAN_ALLES, sleutel: undefined })).toBe('geen-sleutel');
  });

  /** Een lege string in `.env` is hetzelfde als geen sleutel, en zo hoort hij ook te tellen. */
  it('telt een lege of witruimte-sleutel als geen sleutel', () => {
    expect(meldingenstand({ ...KAN_ALLES, sleutel: '' })).toBe('geen-sleutel');
    expect(meldingenstand({ ...KAN_ALLES, sleutel: '   ' })).toBe('geen-sleutel');
  });
});

describe('meldingenstand — de volgorde tussen de uitzonderingen', () => {
  /**
   * ⚠️ "Niet ondersteund" wint van alles. Zonder deze volgorde zou een browser
   *    zonder PushManager te horen krijgen dat de sleutel ontbreekt, en dan gaat
   *    er iemand een deployprobleem zoeken dat er niet is.
   */
  it('laat niet-ondersteund winnen van een ontbrekende sleutel', () => {
    expect(meldingenstand({ ...KAN_ALLES, pushManager: false, sleutel: undefined })).toBe(
      'niet-ondersteund',
    );
  });

  /**
   * ⚠️ Geweigerd wint van een ontbrekende sleutel: wie geweigerd heeft kan het
   *    toch niet aanzetten, dus een configuratiemelding is voor hem ruis.
   */
  it('laat geweigerd winnen van een ontbrekende sleutel', () => {
    expect(meldingenstand({ ...KAN_ALLES, toestemming: 'denied', sleutel: undefined })).toBe(
      'geweigerd',
    );
  });

  /**
   * ⚠️ En een ontbrekende sleutel wint van "uit". Anders tonen we een knop die
   *    gegarandeerd op `subscribe()` stukloopt, en dan lijkt het de gebruiker
   *    zijn schuld.
   */
  it('laat een ontbrekende sleutel winnen van uit', () => {
    expect(meldingenstand({ ...KAN_ALLES, toestemming: 'default', sleutel: undefined })).toBe(
      'geen-sleutel',
    );
  });
});

function abonnement(p256dh: ArrayBuffer | null, auth: ArrayBuffer | null): Webabonnement {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    getKey: (naam) => (naam === 'p256dh' ? p256dh : auth),
  };
}

const P256DH = new Uint8Array([4, 1, 2, 3]).buffer;
const AUTH = new Uint8Array([9, 8, 7, 6]).buffer;

describe('abonnementNaarToken', () => {
  it('levert endpoint, platform en beide sleutels in base64url', () => {
    expect(abonnementNaarToken(abonnement(P256DH, AUTH))).toEqual({
      token: 'https://fcm.googleapis.com/fcm/send/abc123',
      platform: 'web',
      p256dh: 'BAECAw',
      auth: 'CQgHBg',
    });
  });

  /**
   * ⚠️ Dit is de belangrijkste van de drie. Zonder `p256dh` en `auth` kun je een
   *    browser niets sturen (RFC 8291) en weigert de CHECK uit migratie 0062 de
   *    rij. Een verzoek dat gegarandeerd wordt afgewezen sturen we niet.
   */
  it.each([
    ['zonder p256dh', null, AUTH],
    ['zonder auth', P256DH, null],
    ['zonder beide', null, null],
  ])('geeft %s null terug', (_naam, p, a) => {
    expect(abonnementNaarToken(abonnement(p, a))).toBeNull();
  });
});
