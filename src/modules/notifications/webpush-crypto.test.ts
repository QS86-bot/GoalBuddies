import { describe, expect, it } from 'vitest';

import {
  genereerVapidSleutelpaar,
  leidSleutelsAf,
  naarBase64url,
  PAYLOAD_MAX,
  vanBase64url,
  versleutelMet,
  vapidAuthorization,
  versleutelPayload,
} from './webpush-crypto';

/**
 * De testvectoren uit **RFC 8291** — QS8-114.
 *
 * ⚠️ Dit is de hele reden dat de versleuteling zelf geschreven mocht worden in
 *    plaats van uit een bibliotheek te komen. Zonder deze vectoren zou een fout
 *    hier onzichtbaar zijn: de pushdienst antwoordt `201 Created` op een bericht
 *    dat de browser niet kan ontsleutelen, en er is niets dat je kunt aflezen.
 *
 * ⚠️ Getoetst aan de **gepubliceerde** waarden, niet aan onze eigen uitkomst.
 *    Elke tussenstap uit Appendix A staat er apart in, zodat een afwijking
 *    aanwijst wélke van de vier operaties fout ging in plaats van dat je ze
 *    alle vier tegelijk moet uitpluizen.
 */

// RFC 8291 §5 en Appendix A.
const PLAINTEXT = 'When I grow up, I want to be a watermelon';
const AUTH_SECRET = 'BTBZMqHH6r4Tts7J_aSIgg';
const UA_PRIVE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const UA_PUBLIEK =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AS_PRIVE = 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
const AS_PUBLIEK =
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const SALT = 'DGv6ra1nlYgDCS1FRnbzlw';

// De tussenwaarden uit Appendix A.
const ECDH_SECRET = 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs';
const PRK_KEY = 'Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k';
const IKM = 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg';
const PRK = '09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc';
const CEK = 'oIhVW04MRdy2XN9CiKLxTg';
const NONCE = '4h_95klXJ5E_qnoN';

// Het volledige berichtlichaam uit §5.
const VERWACHT_BODY =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
  'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
  'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';

const invoer = {
  uaPubliek: vanBase64url(UA_PUBLIEK),
  authSecret: vanBase64url(AUTH_SECRET),
  asPubliek: vanBase64url(AS_PUBLIEK),
  asPrive: vanBase64url(AS_PRIVE),
  salt: vanBase64url(SALT),
};

describe('web push — base64url', () => {
  it('is rondreisbestendig', () => {
    expect(naarBase64url(vanBase64url(AS_PUBLIEK))).toBe(AS_PUBLIEK);
    expect(naarBase64url(vanBase64url(SALT))).toBe(SALT);
  });

  it('gebruikt het url-veilige alfabet zonder opvulling', () => {
    const uit = naarBase64url(new Uint8Array([251, 255, 190]));
    expect(uit).not.toContain('+');
    expect(uit).not.toContain('/');
    expect(uit).not.toContain('=');
  });

  it('leest een sleutel van de juiste lengte', () => {
    expect(vanBase64url(AS_PUBLIEK)).toHaveLength(65);
    expect(vanBase64url(AUTH_SECRET)).toHaveLength(16);
    expect(vanBase64url(SALT)).toHaveLength(16);
  });
});

describe('web push — sleutelafleiding (RFC 8291 Appendix A)', () => {
  it('levert elke tussenwaarde uit de RFC', async () => {
    const s = await leidSleutelsAf(invoer);

    expect(naarBase64url(s.ecdhSecret), 'ecdh_secret').toBe(ECDH_SECRET);
    expect(naarBase64url(s.prkKey), 'PRK_key').toBe(PRK_KEY);
    expect(naarBase64url(s.ikm), 'IKM').toBe(IKM);
    expect(naarBase64url(s.prk), 'PRK').toBe(PRK);
    expect(naarBase64url(s.cek), 'CEK').toBe(CEK);
    expect(naarBase64url(s.nonce), 'NONCE').toBe(NONCE);
  });

  /**
   * ⚠️ ECDH is symmetrisch: de ontvanger rekent hetzelfde geheim uit met zijn
   *    eigen privésleutel en de publieke sleutel van de afzender. Klopt dat
   *    niet, dan werkt de versleuteling wel maar kan de browser niet
   *    ontsleutelen — en dat merk je nergens aan.
   */
  it('geeft hetzelfde geheim vanaf de kant van de ontvanger', async () => {
    const andersom = await leidSleutelsAf({
      uaPubliek: vanBase64url(AS_PUBLIEK),
      authSecret: vanBase64url(AUTH_SECRET),
      asPubliek: vanBase64url(UA_PUBLIEK),
      asPrive: vanBase64url(UA_PRIVE),
      salt: vanBase64url(SALT),
    });

    expect(naarBase64url(andersom.ecdhSecret)).toBe(ECDH_SECRET);
  });

  it('geeft een ander resultaat bij een ander authenticatiegeheim', async () => {
    const anders = await leidSleutelsAf({
      ...invoer,
      authSecret: vanBase64url('AAAAAAAAAAAAAAAAAAAAAA'),
    });

    expect(naarBase64url(anders.cek)).not.toBe(CEK);
  });
});

describe('web push — het volledige bericht (RFC 8291 §5)', () => {
  it('levert exact het berichtlichaam uit de RFC', async () => {
    const body = await versleutelMet({ ...invoer, payload: PLAINTEXT });

    expect(naarBase64url(body)).toBe(VERWACHT_BODY);
  });

  it('bouwt de kop volgens RFC 8188 §2.1', async () => {
    const body = await versleutelMet({ ...invoer, payload: PLAINTEXT });

    expect(body.slice(0, 16)).toEqual(vanBase64url(SALT));
    // Recordgrootte 4096, big-endian.
    expect(Array.from(body.slice(16, 20))).toEqual([0x00, 0x00, 0x10, 0x00]);
    // Lengte van de keyid, gevolgd door de publieke sleutel van de afzender.
    expect(body[20]).toBe(65);
    expect(body.slice(21, 86)).toEqual(vanBase64url(AS_PUBLIEK));
  });

  it('weigert een payload die boven de grens van RFC 8291 §4 uitkomt', async () => {
    await expect(
      versleutelMet({ ...invoer, payload: 'x'.repeat(PAYLOAD_MAX + 1) }),
    ).rejects.toThrow(/3993/);
  });

  it('laat een payload op precies de grens door', async () => {
    const body = await versleutelMet({ ...invoer, payload: 'x'.repeat(PAYLOAD_MAX) });

    expect(body.length).toBeGreaterThan(PAYLOAD_MAX);
  });
});

describe('web push — versleutelPayload in productievorm', () => {
  /**
   * Deze kan niet tegen een vector: salt en sleutelpaar zijn per aanroep nieuw.
   * Wat hij wél moet bewijzen is dat er echt iets varieert — een vaste salt of
   * een hergebruikt sleutelpaar is een echte zwakte en ziet er verder normaal uit.
   */
  it('gebruikt elke keer een nieuwe salt en een nieuw sleutelpaar', async () => {
    const abonnement = { p256dh: UA_PUBLIEK, auth: AUTH_SECRET };

    const een = await versleutelPayload(abonnement, PLAINTEXT);
    const twee = await versleutelPayload(abonnement, PLAINTEXT);

    expect(naarBase64url(een.slice(0, 16))).not.toBe(naarBase64url(twee.slice(0, 16)));
    expect(naarBase64url(een.slice(21, 86))).not.toBe(naarBase64url(twee.slice(21, 86)));
    expect(naarBase64url(een)).not.toBe(naarBase64url(twee));
  });

  it('levert een bericht met een geldige kop', async () => {
    const body = await versleutelPayload({ p256dh: UA_PUBLIEK, auth: AUTH_SECRET }, PLAINTEXT);

    expect(body[20]).toBe(65);
    expect(body.length).toBeGreaterThan(86);
  });
});

describe('VAPID — RFC 8292', () => {
  const ENDPOINT = 'https://push.example.net/push/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV';
  const SUBJECT = 'mailto:quinten@q-projects.tech';
  const NU = new Date('2026-08-22T12:00:00Z');

  /**
   * ⚠️ Hier kán geen testvector tegenaan: ECDSA is niet deterministisch, dus
   *    dezelfde invoer geeft elke keer een andere handtekening. Wat wél te
   *    bewijzen is, is dat de handtekening klopt — dus die wordt hier
   *    geverifieerd met de publieke helft, precies zoals de pushdienst doet.
   */
  it('levert een token waarvan de handtekening verifieert', async () => {
    const paar = await genereerVapidSleutelpaar();
    const { Authorization } = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu: NU,
    });

    const token = /vapid t=([^,]+), k=(.+)$/.exec(Authorization);
    expect(token).not.toBeNull();

    const [romp, handtekening] = [
      `${token?.[1]?.split('.')[0]}.${token?.[1]?.split('.')[1]}`,
      token?.[1]?.split('.')[2] ?? '',
    ];

    const publiek = vanBase64url(paar.publiek);
    const sleutel = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: naarBase64url(publiek.slice(1, 33)),
        y: naarBase64url(publiek.slice(33, 65)),
        ext: true,
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const klopt = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      sleutel,
      vanBase64url(handtekening) as BufferSource,
      new TextEncoder().encode(romp) as BufferSource,
    );

    expect(klopt).toBe(true);
  });

  it('zet de oorsprong in aud en niet het volledige endpoint', async () => {
    const paar = await genereerVapidSleutelpaar();
    const { Authorization } = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu: new Date('2026-08-22T12:00:00Z'),
    });

    const romp = Authorization.replace(/^vapid t=/, '').split('.')[1] ?? '';
    const claims = JSON.parse(new TextDecoder().decode(vanBase64url(romp))) as {
      aud: string;
      exp: number;
      sub: string;
    };

    expect(claims.aud).toBe('https://push.example.net');
    expect(claims.sub).toBe(SUBJECT);
  });

  it('geeft een exp binnen het venster van 24 uur uit RFC 8292', async () => {
    const paar = await genereerVapidSleutelpaar();
    const nu = new Date('2026-08-22T12:00:00Z');
    const { Authorization } = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu,
    });

    const romp = Authorization.replace(/^vapid t=/, '').split('.')[1] ?? '';
    const { exp } = JSON.parse(new TextDecoder().decode(vanBase64url(romp))) as { exp: number };
    const seconden = exp - Math.floor(nu.getTime() / 1000);

    expect(seconden).toBeGreaterThan(0);
    expect(seconden).toBeLessThanOrEqual(24 * 60 * 60);
  });

  /**
   * ⚠️ De handtekening moet ruwe `r ‖ s` zijn, 64 octetten. Zet je hem om naar
   *    DER — de reflex bij wie ECDSA uit OpenSSL kent — dan is hij ~70 octetten
   *    en weigert de pushdienst het token. Dat ziet er verder normaal uit.
   */
  it('tekent met een ruwe r‖s van 64 octetten, niet DER', async () => {
    const paar = await genereerVapidSleutelpaar();
    const { Authorization } = await vapidAuthorization({
      endpoint: ENDPOINT,
      publiekeSleutel: paar.publiek,
      priveSleutel: paar.prive,
      subject: SUBJECT,
      nu: NU,
    });

    const handtekening = Authorization.replace(/^vapid t=/, '').split(',')[0]?.split('.')[2] ?? '';
    expect(vanBase64url(handtekening)).toHaveLength(64);
  });

  it('weigert een subject dat geen mailto of https is', async () => {
    const paar = await genereerVapidSleutelpaar();

    await expect(
      vapidAuthorization({
        endpoint: ENDPOINT,
        publiekeSleutel: paar.publiek,
        priveSleutel: paar.prive,
        subject: 'quinten@q-projects.tech',
        nu: NU,
      }),
    ).rejects.toThrow(/mailto/);
  });
});
