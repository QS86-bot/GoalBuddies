import { describe, expect, it, vi } from 'vitest';

import { genereerVapidSleutelpaar } from './webpush-crypto';
import {
  abonnementFout,
  isWeg,
  magWissen,
  MAX_WISSEN_PER_RUN,
  nieuweOpruimlijst,
  noteerUitkomst,
  opruimbesluit,
  TTL_SECONDEN,
  uitkomstVan,
  verstuurWebPush,
  zonderUrl,
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

/**
 * QS8-690 — een kapot abonnement en een kapotte serversleutel zijn twee dingen.
 *
 * ⚠️ **De belofte is het onderscheid, niet de foutmelding.** 📏 Op productie
 *    stonden 11 meldingen `web push mislukte: versleutelen mislukte: …` in één
 *    run: 6 over een punt dat niet op de curve ligt (het abonnement) en 5 over een
 *    privésleutel die niet te lezen is (onze eigen omgeving). Het log kon ze niet
 *    uit elkaar houden, en dus ook de code niet: de rij opruimen om een kapotte
 *    `VAPID_PRIVATE_KEY` is dataverlies voor élke gebruiker, en een kapot
 *    abonnement laten staan is elk uur dezelfde fout.
 */
describe('QS8-690 — ongeldig abonnement of onbruikbare VAPID-sleutel', () => {
  // 65 octetten die met 0x04 beginnen maar geen punt op P-256 zijn.
  const NIET_OP_DE_CURVE = 'B' + 'A'.repeat(86);

  it('ziet een p256dh die niet op de curve ligt als ongeldig, zonder verzoek', async () => {
    const doe = antwoordt(201);
    const uit = await verstuurWebPush({
      doel: { ...DOEL, p256dh: NIET_OP_DE_CURVE },
      bericht: BERICHT,
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: doe,
    });

    expect(uit.status).toBe('ongeldig');
    expect(doe).not.toHaveBeenCalled();
  });

  it.each([
    ['een eerste octet dat geen 0x04 is', { p256dh: 'E' + DOEL.p256dh.slice(1) }],
    ['een p256dh van de verkeerde lengte', { p256dh: DOEL.p256dh + DOEL.p256dh + DOEL.p256dh }],
    ['een auth van de verkeerde lengte', { auth: 'AAAA' }],
    ['een p256dh die geen base64url is', { p256dh: '!!!' }],
  ])('ziet %s als ongeldig', async (_naam, afwijking) => {
    expect(await abonnementFout({ ...DOEL, ...afwijking })).toMatchObject({ status: 'ongeldig' });
  });

  it('ziet een punt dat niet op de curve ligt als ongeldig zonder importKey te raadplegen', async () => {
    // ⚠️ 📏 In Deno 2.9.6 slaagt `importKey()` op zo'n punt; daarom rekent
    //    `ligtOpP256()` het zelf. Deze toets laat `importKey()` alles goedkeuren,
    //    zoals Deno, en eist toch `ongeldig`.
    const importKey = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    try {
      const omgedraaid = DOEL.p256dh.slice(0, 50) + (DOEL.p256dh[50] === 'A' ? 'B' : 'A') + DOEL.p256dh.slice(51);
      expect(await abonnementFout({ ...DOEL, p256dh: NIET_OP_DE_CURVE })).toMatchObject({ status: 'ongeldig' });
      expect(await abonnementFout({ ...DOEL, p256dh: omgedraaid })).toMatchObject({ status: 'ongeldig' });
      expect(await abonnementFout(DOEL)).toBeNull();
    } finally {
      importKey.mockRestore();
    }
  });

  it('laat een geldig abonnement door', async () => {
    expect(await abonnementFout(DOEL)).toBeNull();
  });

  it('noemt een kapotte privésleutel een mislukking van de server, en niet ongeldig', async () => {
    // ⚠️ Dit is de helft die dataverlies voorkomt: de sleutel is van ons, het
    //    abonnement is van de gebruiker.
    const goed = await sleutels();
    const uit = await verstuurWebPush({
      doel: DOEL,
      bericht: BERICHT,
      sleutels: { ...goed, prive: 'onzin' },
      nu: NU,
      fetchImpl: antwoordt(201),
    });

    expect(uit.status).toBe('mislukt');
    expect(uit.status === 'mislukt' && uit.reden).toContain('VAPID-sleutel onbruikbaar');
  });

  it('toetst het abonnement vóór de grens op de payload', async () => {
    // ⚠️ De stroomonderbreker telt elke uitkomst als een oordeel over het
    //    abonnement. Een `mislukt` om een te lang bericht dat het abonnement nooit
    //    gezien heeft, zou daar meetellen als bewijs dat de toets het doet.
    const uit = await verstuurWebPush({
      doel: { ...DOEL, p256dh: NIET_OP_DE_CURVE },
      bericht: { ...BERICHT, body: 'x'.repeat(5000) },
      sleutels: await sleutels(),
      nu: NU,
      fetchImpl: antwoordt(201),
    });

    expect(uit.status).toBe('ongeldig');
  });

  it('geeft een kapot abonnement voorrang boven een kapotte sleutel', async () => {
    const uit = await verstuurWebPush({
      doel: { ...DOEL, p256dh: NIET_OP_DE_CURVE },
      bericht: BERICHT,
      sleutels: { publiek: 'onzin', prive: 'onzin', subject: 'mailto:test@example.com' },
      nu: NU,
      fetchImpl: antwoordt(201),
    });

    expect(uit.status).toBe('ongeldig');
  });
});

/**
 * Batch-review 17-11-2026 — alleen een fout die uitsluitend van de rij afhangt,
 * mag de rij kosten.
 *
 * ⚠️ **De belofte is "een storing van de runtime wist niets"**, en niet "deze
 *    exceptie heet zo". 📏 De code-critic toonde aan dat een `TypeError` uit
 *    `importKey()` bij een geldig abonnement `ongeldig` opleverde, en dan wist één
 *    WebCrypto-regressie in één ronde elk web-abonnement.
 */
describe('abonnementFout — een storing van de runtime is geen kapot abonnement', () => {
  it('maakt van een TypeError uit importKey een mislukking, en geen ongeldig', async () => {
    const importKey = vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(new TypeError('runtime kapot'));
    try {
      const oordeel = await abonnementFout(DOEL);
      expect(oordeel).toMatchObject({ status: 'mislukt' });
      expect(importKey).toHaveBeenCalled();

      const uit = await verstuurWebPush({
        doel: DOEL, bericht: BERICHT, sleutels: await sleutels(), nu: NU, fetchImpl: antwoordt(201),
      });
      expect(uit.status).toBe('mislukt');
    } finally {
      importKey.mockRestore();
    }
  });

  it.each([
    ['NotSupportedError', new DOMException('P-256 weg', 'NotSupportedError')],
    ['een gewone Error', new Error('onbekend')],
  ])('maakt ook van %s een mislukking', async (_naam, fout) => {
    const importKey = vi.spyOn(crypto.subtle, 'importKey').mockRejectedValue(fout);
    try {
      expect(await abonnementFout(DOEL)).toMatchObject({ status: 'mislukt' });
    } finally {
      importKey.mockRestore();
    }
  });

  it('ziet DataError en InvalidCharacterError wél als ongeldig', async () => {
    const importKey = vi.spyOn(crypto.subtle, 'importKey')
      .mockRejectedValueOnce(new DOMException('niet op de curve', 'DataError'))
      .mockRejectedValueOnce(new DOMException('geen base64', 'InvalidCharacterError'));
    try {
      expect(await abonnementFout(DOEL)).toMatchObject({ status: 'ongeldig' });
      expect(await abonnementFout(DOEL)).toMatchObject({ status: 'ongeldig' });
    } finally {
      importKey.mockRestore();
    }
  });
});

describe('opruimbesluit — de stroomonderbreker over één run', () => {
  const ANDER: WebPushDoel = { ...DOEL, endpoint: 'https://fcm.googleapis.com/fcm/send/ander' };
  const ONGELDIG = { status: 'ongeldig', reden: 'p256dh kapot' } as const;

  it('ruimt niets op als elke uitkomst van de run ongeldig is', () => {
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, ANDER, ONGELDIG);

    expect(opruimbesluit(lijst)).toEqual({ verwijder: [], onderbroken: true });
  });

  it('springt ook bij één ongeldige uitkomst als dat alles is wat de run zag', () => {
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);

    expect(opruimbesluit(lijst).onderbroken).toBe(true);
  });

  it.each([
    ['bezorgd', { status: 'bezorgd' }],
    ['weg', { status: 'weg', httpStatus: 410 }],
    ['mislukt', { status: 'mislukt', reden: 'VAPID-sleutel onbruikbaar' }],
  ] as const)('ruimt het ongeldige abonnement op als de run ook een uitkomst %s zag', (_naam, ander) => {
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, ANDER, ander);

    expect(opruimbesluit(lijst)).toEqual({ verwijder: [{ doel: DOEL, reden: 'p256dh kapot' }], onderbroken: false });
  });

  it('noemt een abonnement dat twee keer ongeldig was één keer', () => {
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, ANDER, { status: 'bezorgd' });

    expect(opruimbesluit(lijst).verwijder).toHaveLength(1);
  });

  it('heeft niets op te ruimen in een run zonder web-uitkomsten', () => {
    expect(opruimbesluit(nieuweOpruimlijst())).toEqual({ verwijder: [], onderbroken: false });
  });
});

describe('de rem na de security-review op het herstel — 17-11-2026', () => {
  const ANDER: WebPushDoel = { ...DOEL, endpoint: 'https://fcm.googleapis.com/fcm/send/ander' };
  const ONGELDIG = { status: 'ongeldig', reden: 'p256dh kapot' } as const;

  it('telt een mislukking waarbij het abonnement niet getoetst kon worden niet als bewijs', () => {
    // ⚠️ Een gemengde runtime-storing: voor de ene rij `TypeError` (ongetoetst),
    //    voor de andere `DataError` (ongeldig). Dan mag de eerste de onderbreker
    //    niet openzetten.
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, ANDER, { status: 'mislukt', reden: 'runtime', ongetoetst: true });

    expect(opruimbesluit(lijst).onderbroken).toBe(true);
  });

  it('onthoudt een verdwenen abonnement, zodat de run hem niet opnieuw verstuurt of telt', () => {
    const lijst = nieuweOpruimlijst();
    expect(isWeg(lijst, DOEL)).toBe(false);
    noteerUitkomst(lijst, DOEL, { status: 'weg', httpStatus: 410 });

    expect(isWeg(lijst, DOEL)).toBe(true);
    expect(isWeg(lijst, ANDER)).toBe(false);
  });

  it('weegt rijen en geen uitkomsten', () => {
    const lijst = nieuweOpruimlijst();
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, DOEL, ONGELDIG);
    noteerUitkomst(lijst, DOEL, ONGELDIG);

    expect(lijst.getoetst.size).toBe(1);
    expect(opruimbesluit(lijst).onderbroken).toBe(true);
  });

  it('laat per run hoogstens MAX_WISSEN_PER_RUN wissingen toe en telt de rest', () => {
    const lijst = nieuweOpruimlijst();
    const toegestaan = Array.from({ length: MAX_WISSEN_PER_RUN + 2 }, () => magWissen(lijst, 'ongeldig')).filter(Boolean);
    expect(magWissen(lijst, 'weg')).toBe(false);

    expect(MAX_WISSEN_PER_RUN).toBe(3);
    expect(toegestaan).toHaveLength(MAX_WISSEN_PER_RUN);
    expect(lijst.tegengehouden).toEqual({ ongeldig: 2, weg: 1 });
  });

  it('volgt geen redirect: een 3xx is mislukt en geen verdwenen abonnement', async () => {
    // ⚠️ Security-review, derde ronde: een gevolgde redirect kon een 404 van een
    //    ánder adres als `weg` laten binnenkomen, en `weg` wist een rij.
    const doe = vi.fn(() => Promise.resolve(new Response(null, { status: 302, headers: { Location: 'https://elders.test/x' } })));
    const uit = await verstuurWebPush({
      doel: DOEL, bericht: BERICHT, sleutels: await sleutels(), nu: NU, fetchImpl: doe as unknown as typeof fetch,
    });

    expect(uit.status).toBe('mislukt');
    expect((doe.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('manual');
  });

  it('zet geen endpoint in de reden als de pushdienst onbereikbaar is', async () => {
    const doe = vi.fn(() => Promise.reject(new TypeError(`error sending request for url (${DOEL.endpoint})`)));
    const uit = await verstuurWebPush({
      doel: DOEL, bericht: BERICHT, sleutels: await sleutels(), nu: NU, fetchImpl: doe as unknown as typeof fetch,
    });

    expect(uit.status).toBe('mislukt');
    expect(uit.status === 'mislukt' && uit.reden).not.toContain('abc123');
    expect(zonderUrl('kapot (https://fcm.googleapis.com/fcm/send/x) en verder')).toBe('kapot (<url>) en verder');
  });
});
