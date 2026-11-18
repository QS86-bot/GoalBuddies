import { afterEach, describe, expect, it, vi } from 'vitest';

import { draai, maakApi, redirectsVoor } from '../../scripts/auth-urls.mjs';

/**
 * `auth:urls` leest en zet de Auth-URL's van het Supabase-project — QS8-99.
 *
 * ⚠️ **De belofte is: dezelfde uitslag en dezelfde exitcode op Linux en Windows,
 *    en het proces sluit zichzelf niet af (QS8-684).** `draai()` geeft de code
 *    terug en de ingang zet `process.exitCode`; de Windows-crash zelf (`async.c`,
 *    exit -1073740791) is hier niet te zien en is een meting voor Quinten.
 *
 * ⚠️ **Niets hier roept de Management API aan.** `--zet` schrijft op productie;
 *    elke test geeft `draai()` een eigen `api` mee, en de naad met de echte HTTP-
 *    aanroep (`maakApi`) draait tegen een vervangen `fetch`. De tests onder
 *    `zet: true` toetsen de argumenten aan die `api`; dat het HTTP-verzoek zelf
 *    de juiste vorm heeft toetst alleen de `maakApi`-test onderaan.
 */

const APP = 'https://goalbuddies.q-projects.tech';
const REF = 'projectref';
const GOED = { site_url: APP, uri_allow_list: redirectsVoor(APP) };
const FOUT = { site_url: 'https://oud.example', uri_allow_list: '' };

describe('draai: de exitcode zonder netwerk', () => {
  afterEach(() => vi.restoreAllMocks());

  const stil = () => ({
    log: vi.spyOn(console, 'log').mockImplementation(() => undefined),
    error: vi.spyOn(console, 'error').mockImplementation(() => undefined),
  });
  const basis = { token: 'sbp_x', ref: REF, app: APP };

  it('zonder token: 1, en er wordt niets aangeroepen', async () => {
    const uit = stil();
    const api = vi.fn();
    await expect(draai({ ...basis, token: undefined, zet: true }, api)).resolves.toBe(1);
    expect(api).not.toHaveBeenCalled();
    expect(uit.error.mock.calls.join('\n')).toContain('SUPABASE_ACCESS_TOKEN ontbreekt');
  });

  it('lezen, staat goed: 0 en alleen een GET', async () => {
    const uit = stil();
    const api = vi.fn().mockResolvedValue(GOED);
    await expect(draai({ ...basis, zet: false }, api)).resolves.toBe(0);
    expect(api.mock.calls).toEqual([['GET']]);
    expect(uit.log.mock.calls.join('\n')).toContain('Staat al goed');
  });

  it('lezen, wijkt af: nog steeds 0, met de aanwijzing voor --zet', async () => {
    const uit = stil();
    const api = vi.fn().mockResolvedValue(FOUT);
    await expect(draai({ ...basis, zet: false }, api)).resolves.toBe(0);
    expect(api).toHaveBeenCalledTimes(1);
    expect(uit.log.mock.calls.join('\n')).toContain('Wijkt af');
  });

  it('zetten en teruglezen klopt: 0, PATCH met de juiste waarden', async () => {
    const uit = stil();
    const api = vi.fn().mockResolvedValueOnce(FOUT).mockResolvedValueOnce({}).mockResolvedValueOnce(GOED);
    await expect(draai({ ...basis, zet: true }, api)).resolves.toBe(0);
    expect(api.mock.calls.map((c) => c[0])).toEqual(['GET', 'PATCH', 'GET']);
    expect(api.mock.calls[1]?.[1]).toEqual({ site_url: APP, uri_allow_list: redirectsVoor(APP) });
    expect(uit.log.mock.calls.join('\n')).toContain('Goed gezet en teruggelezen');
  });

  it('zetten maar teruglezen wijkt af: 1', async () => {
    const uit = stil();
    const api = vi.fn().mockResolvedValueOnce(FOUT).mockResolvedValueOnce({}).mockResolvedValueOnce(FOUT);
    await expect(draai({ ...basis, zet: true }, api)).resolves.toBe(1);
    expect(uit.error.mock.calls.join('\n')).toContain('komen niet overeen');
  });

  it('een API-fout geeft 1, met de netwerkhint of de tokenhint', async () => {
    const uit = stil();
    const net = vi.fn().mockRejectedValue(new Error('fetch failed'));
    await expect(draai({ ...basis, zet: false }, net)).resolves.toBe(1);
    expect(uit.error.mock.calls.join('\n')).toContain('netwerkblokkade');

    uit.error.mockClear();
    const auth = vi.fn().mockRejectedValue(new Error('GET config/auth gaf HTTP 401: nee'));
    await expect(draai({ ...basis, zet: false }, auth)).resolves.toBe(1);
    expect(uit.error.mock.calls.join('\n')).toContain('personal access token');
  });

  it('een fout tijdens het zetten stopt vóór het teruglezen: 1', async () => {
    stil();
    const api = vi
      .fn()
      .mockResolvedValueOnce(FOUT)
      .mockRejectedValueOnce(new Error('PATCH config/auth gaf HTTP 500: x'));
    await expect(draai({ ...basis, zet: true }, api)).resolves.toBe(1);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe('maakApi: het HTTP-verzoek zelf, tegen een vervangen fetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, antwoord: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(JSON.stringify(antwoord)),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('PATCH: methode, adres, token, Content-Type, body en timeout', async () => {
    const fetchMock = stubFetch(200, { ok: true });
    await maakApi({ token: 'sbp_x', ref: REF })('PATCH', { site_url: APP });

    const [adres, opties] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(adres).toBe(`https://api.supabase.com/v1/projects/${REF}/config/auth`);
    expect(opties.method).toBe('PATCH');
    expect(opties.headers).toEqual({
      Authorization: 'Bearer sbp_x',
      'Content-Type': 'application/json',
    });
    expect(opties.body).toBe(JSON.stringify({ site_url: APP }));
    expect(opties.signal).toBeInstanceOf(AbortSignal);
  });

  it('GET: geen body en geen Content-Type', async () => {
    const fetchMock = stubFetch(200, GOED);
    await expect(maakApi({ token: 'sbp_x', ref: REF })('GET')).resolves.toEqual(GOED);

    const [, opties] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(opties.method).toBe('GET');
    expect(opties.body).toBeUndefined();
    expect(opties.headers).toEqual({ Authorization: 'Bearer sbp_x' });
  });

  it('een niet-ok antwoord wordt een fout met de statuscode', async () => {
    stubFetch(401, { message: 'nee' });
    await expect(maakApi({ token: 'sbp_x', ref: REF })('GET')).rejects.toThrow(
      'GET config/auth gaf HTTP 401',
    );
  });
});
