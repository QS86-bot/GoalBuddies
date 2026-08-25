import { describe, expect, it, vi } from 'vitest';

import { genereerVapidSleutelpaar } from './webpush-crypto';
import {
  TTL_SECONDEN,
  uitkomstVan,
  verstuurWebPush,
  type VapidSleutels,
  type WebPushDoel,
} from './webpush-verzenden';

/**
 * De belofte onder het verzendpad voor web push.
 *
 * ⚠️ **De belofte is niet "er wordt een verzoek gedaan" maar "een abonnement dat
 *    niet meer bestaat, wordt opgeruimd, en een storing van dit moment niet".**
 *    Dat onderscheid is het enige in dit bestand dat gegevens weggooit, en het
 *    is precies het onderscheid dat een vergissing onzichtbaar maakt: gooi je bij
 *    een 500 ook op, dan verliest iemand zijn meldingen door een storing die een
 *    minuut later over is.
 *
 * ⚠️ Er zit geen netwerk in deze test en dat is de reden dat `fetchImpl` een
 *    parameter is. Anders is elke antwoordcode die ertoe doet — 410, 429, 413 —
 *    alleen in productie te zien, en dan is de eerste keer dat je hem tegenkomt
 *    ook de eerste keer dat je weet wat er gebeurt.
 */

const DOEL: WebPushDoel = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  // Een echt geldig ongecomprimeerd P-256-punt en een 16-octets geheim; anders
  // valt het versleutelen om vóór de code die deze test wil zien.
  p256dh:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcx' +
    'aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};

const BERICHT = { titel: 'Nog een weekdoel te beoordelen', body: 'Van je buddy.', pad: '/beoordelen', soort: 'approval_request' };
const NU = new Date('2026-08-25T12:00:00Z');

async function sleutels(): Promise<VapidSleutels> {
  const paar = await genereerVapidSleutelpaar();
  return { publiek: paar.publiek, prive: paar.prive, subject: 'mailto:test@example.com' };
}

function antwoordt(status: number): typeof fetch {
  return vi.fn(() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch;
}

describe('uitkomstVan — wat een statuscode betekent', () => {
  it('ziet 201 als bezorgd', () => {
    expect(uitkomstVan(201).status).toBe('bezorgd');
  });

  it('ziet 404 en 410 als een verdwenen abonnement', () => {
    // ⚠️ De enige twee codes die een rij uit `push_tokens` mogen halen (RFC 8030 §7).
    expect(uitkomstVan(404).status).toBe('weg');
    expect(uitkomstVan(410).status).toBe('weg');
  });

  it('ziet een storing van dit moment níét als een verdwenen abonnement', () => {
    // ⚠️ De helft die je vergeet te bouwen. 429 en 500 gaan over, een 410 niet —
    //    en wie ze gelijk behandelt, gooit iemands meldingen weg om een storing
    //    die een minuut later voorbij is.
    for (const status of [400, 413, 429, 500, 502, 503]) {
      expect(uitkomstVan(status).status, `HTTP ${status}`).toBe('mislukt');
    }
  });
});

describe('verstuurWebPush', () => {
  it('post naar het endpoint van het abonnement, versleuteld en met VAPID', async () => {
    const doe = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));

    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: BERICHT,
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: doe as unknown as typeof fetch,
    });

    expect(uit.status).toBe('bezorgd');
    expect(doe).toHaveBeenCalledTimes(1);

    const [url, opties] = doe.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DOEL.endpoint);
    expect(opties.method).toBe('POST');

    const koppen = opties.headers as Record<string, string>;
    // Zonder deze twee koppen weigert elke pushdienst het bericht.
    expect(koppen['Content-Encoding']).toBe('aes128gcm');
    expect(koppen.Authorization).toMatch(/^vapid /);
    expect(koppen.TTL).toBe(String(TTL_SECONDEN));

    // De inhoud gaat versleuteld over de lijn. Zou hier leesbare tekst staan,
    // dan las de pushdienst mee — en die is niet van ons.
    const body = opties.body as Uint8Array;
    expect(body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(body)).not.toContain('beoordelen');
  });

  it('meldt een verdwenen abonnement als `weg`, met de code erbij', async () => {
    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: BERICHT,
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: antwoordt(410),
    });

    expect(uit).toEqual({ status: 'weg', httpStatus: 410 });
  });

  it('werpt niet als de pushdienst onbereikbaar is', async () => {
    // Een ronde loopt over alle gebruikers heen. Eén worp kost de rest van die
    // ronde ook, en dat is precies waarom hier een uitkomst uitkomt en geen fout.
    const stuk = vi.fn(() => Promise.reject(new Error('ECONNRESET')));

    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: BERICHT,
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: stuk as unknown as typeof fetch,
    });

    expect(uit.status).toBe('mislukt');
    expect(uit.status === 'mislukt' && uit.reden).toContain('ECONNRESET');
  });

  it('weigert een te groot bericht vóór het versleutelen', async () => {
    // ⚠️ `versleutelPayload()` wérpt boven de grens. Hier vangen betekent dat een
    //    lange doeltitel hooguit één melding kost en niet de hele ronde.
    const doe = antwoordt(201);

    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: { ...BERICHT, body: 'x'.repeat(5000) },
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: doe,
    });

    expect(uit.status).toBe('mislukt');
    expect(doe).not.toHaveBeenCalled();
  });

  it('gooit geen abonnement weg om een kapotte sleutel', async () => {
    // Een configuratiefout mag geen dataverlies worden.
    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: BERICHT,
      sleutels: { publiek: 'onzin', prive: 'onzin', subject: 'mailto:test@example.com' },
      nu: NU,
      fetchImpl: antwoordt(201),
    });

    expect(uit.status).toBe('mislukt');
  });
});
