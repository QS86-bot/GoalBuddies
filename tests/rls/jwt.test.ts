import { describe, expect, it } from 'vitest';

import { hs256 } from './harness';

/**
 * De handtekening onder elk testtoken — QS8-116.
 *
 * ⚠️ **Dit bestand draait zonder credentials en dus ook in CI.** De rest van
 *    `tests/rls/` slaat zichzelf over zodra `.env` ontbreekt, en juist het stuk
 *    dat het stilst fout kan gaan zou dan nergens gedekt zijn: een verkeerde
 *    base64url-codering of een HMAC over de verkeerde bytes levert geen
 *    foutmelding op maar een token dat PostgREST weigert — en dan ga je in de
 *    policies zoeken.
 *
 * ⚠️ Getoetst aan de officiële vector uit **RFC 7515 §A.1**, niet aan onze eigen
 *    uitkomst. Een test die de implementatie met zichzelf vergelijkt blijft
 *    groen als de implementatie fout is; dat is precies de valkuil van "een test
 *    kan net naast de bescherming kijken".
 */
describe('hs256 — de JWT-handtekening', () => {
  // RFC 7515 §A.1. De kop bevat CRLF binnen de JSON; daarom staat hier de
  // gecodeerde vorm en niet het object.
  const ROMP =
    'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
    '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ';
  const SLEUTEL = Buffer.from(
    'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow',
    'base64url',
  );
  const VERWACHT = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

  it('levert de handtekening uit RFC 7515 §A.1', () => {
    expect(hs256(ROMP, SLEUTEL)).toBe(VERWACHT);
  });

  it('codeert base64url en niet gewoon base64', () => {
    // De vector hierboven bevat een '-'; base64 zou daar '+' geven. Dit is de
    // fout die je pas merkt als één op de zoveel tokens geweigerd wordt.
    expect(VERWACHT).toContain('-');
    expect(hs256(ROMP, SLEUTEL)).not.toContain('+');
    expect(hs256(ROMP, SLEUTEL)).not.toContain('/');
    expect(hs256(ROMP, SLEUTEL)).not.toContain('=');
  });

  it('geeft een andere handtekening bij een ander secret', () => {
    expect(hs256(ROMP, 'een ander secret')).not.toBe(VERWACHT);
  });

  it('geeft een andere handtekening bij een gewijzigde payload', () => {
    expect(hs256(`${ROMP}x`, SLEUTEL)).not.toBe(VERWACHT);
  });

  it('behandelt een tekstsecret als UTF-8, zoals GoTrue doet', () => {
    expect(hs256(ROMP, 'geheim')).toBe(hs256(ROMP, Buffer.from('geheim', 'utf8')));
  });
});
