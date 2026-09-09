import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  geenPush,
  registreerPushToken,
  verwijderPushToken,
  zetPushBron,
  type PushBron,
} from './tokens';

/**
 * De herregistratie bij elke start — en waarom dat een beveiligingseigenschap is.
 *
 * ⚠️ **Deze test bewaakt een argument, niet een functie.** De bevinding van
 *    21-08-2026 zegt dat wie een pushtoken van een ander kent, dat token naar
 *    zich toe kan trekken: `registreer_push_token()` zet de rij om naar de
 *    aanroeper. Dat moet ook — zonder die overname blijft de vorige gebruiker
 *    van een gedeeld apparaat meldingen krijgen.
 *
 * ⚠️ **Hier stond het mechanisme erbij, en dat was per 0211 een verwijzing naar
 *    een regel die er niet meer is** (QS8-367). Het luidde
 *    `delete from push_tokens where token = ... and user_id <> auth.uid()`. Die
 *    `delete` is weg; het overnamemechanisme is de
 *    `on conflict (token) do update set user_id = excluded.user_id` van de
 *    insert, en dat was het al — de `delete` deed er niets naast. Zie
 *    `docs/decisions/2026-09-08-een-tweede-mechanisme-is-geen-slot.md`.
 *
 *    **De les van QS8-367 in het klein, één laag hoger:** dit commentaar draagt
 *    het beveiligingsargument, en het noemde een grendel die er niet was. Noem
 *    hier dus de belofte en niet de regel — regels verhuizen, beloftes niet.
 *
 * ⚠️ **Wat de bevinding niet zei, en op 27-08 is nagemeten: de kaping heelt
 *    zichzelf.** `Pushwacht` in `app/_layout.tsx` roept `registreerPushToken()`
 *    aan zodra er een sessie is, en deze functie registreert onvoorwaardelijk
 *    opnieuw. Het slachtoffer pakt zijn token dus terug bij zijn eerstvolgende
 *    start — het venster is "tot hij de app weer opent", niet "voorgoed".
 *
 * ⚠️ **En precies dáárom staat deze test er.** Het beveiligingsargument leunt nu
 *    op onvoorwaardelijk herregistreren. Zou iemand hier een redelijk klinkende
 *    optimalisatie inzetten — "zelfde token als vorige keer, sla de RPC over" —
 *    dan wordt een kaping blijvend, en er is geen enkele test die daar vandaag
 *    rood van wordt. Dat is regel 18 vraag 3: de belofte breekt terwijl alles
 *    groen blijft. `tokens.ts` had helemaal geen test.
 */

const RPC = vi.fn();
const VERWIJDERD = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    rpc: (naam: string, argumenten: unknown) => {
      RPC(naam, argumenten);
      return Promise.resolve({ data: { ok: true }, error: null });
    },
    from: (tabel: string) => ({
      delete: () => ({
        eq: (kolom: string, waarde: unknown) => {
          VERWIJDERD(tabel, kolom, waarde);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: () => undefined,
}));

/** Een bron die altijd hetzelfde webabonnement teruggeeft, zoals een browser doet. */
const zelfdeWebtoken: PushBron = {
  haalToken: () =>
    Promise.resolve({
      token: 'https://push.example.test/abonnement/AAAA-BBBB',
      platform: 'web' as const,
      p256dh: 'p256dh-van-dit-apparaat',
      auth: 'auth-van-dit-apparaat',
    }),
};

beforeEach(() => {
  RPC.mockClear();
  VERWIJDERD.mockClear();
});

afterEach(() => {
  zetPushBron(geenPush);
});

describe('registreerPushToken', () => {
  it('registreert bij elke aanroep opnieuw, ook met exact hetzelfde token', async () => {
    // ⚠️ Dit is de belofte, niet het onderdeel: twee starts, twee registraties.
    //    Een cache op "het token is niet veranderd" zou hier één opleveren, en
    //    dan komt een gekaapt token nooit meer terug.
    zetPushBron(zelfdeWebtoken);

    await registreerPushToken('gebruiker-1');
    await registreerPushToken('gebruiker-1');

    expect(RPC).toHaveBeenCalledTimes(2);
    expect(RPC.mock.calls.every(([naam]) => naam === 'registreer_push_token')).toBe(true);
  });

  it('stuurt de twee websleutels samen mee', async () => {
    // ⚠️ `push_tokens_websleutels` (0062) is een CHECK op het páár, en 0067
    //    weigert een webregistratie met er maar één. Eén sleutel meesturen is
    //    dus geen halve registratie maar een geweigerde.
    zetPushBron(zelfdeWebtoken);

    await registreerPushToken('gebruiker-1');

    expect(RPC).toHaveBeenCalledWith('registreer_push_token', {
      p_token: 'https://push.example.test/abonnement/AAAA-BBBB',
      p_platform: 'web',
      p_p256dh: 'p256dh-van-dit-apparaat',
      p_auth: 'auth-van-dit-apparaat',
    });
  });

  it('laat de sleutels weg als de bron ze niet heeft, in plaats van null te sturen', async () => {
    // Native draagt geen sleutels; de `default null` van de functie doet de rest.
    zetPushBron({
      haalToken: () => Promise.resolve({ token: 'ExponentPushToken[xxx]', platform: 'ios' }),
    });

    await registreerPushToken('gebruiker-1');

    expect(RPC).toHaveBeenCalledWith('registreer_push_token', {
      p_token: 'ExponentPushToken[xxx]',
      p_platform: 'ios',
    });
  });

  it('doet niets zonder bron, en valt daar niet over', async () => {
    // ⚠️ `geenPush` is de stand vóórdat `_layout` een bron gezet heeft — niet
    //    meer "zolang `expo-notifications` er niet is", want die staat er sinds
    //    Q-TODO B4 (QS8-366). Een app die bij het opstarten omvalt omdat er geen
    //    pushbron is, is erger dan een app zonder meldingen.
    zetPushBron(geenPush);

    await expect(registreerPushToken('gebruiker-1')).resolves.toBeUndefined();
    expect(RPC).not.toHaveBeenCalled();
  });
});

/**
 * De andere kant van QS8-367: de `delete` bij uitloggen moet trimmen zoals de
 * RPC trimt, anders raakt hij nul rijen en blijft de vorige gebruiker van een
 * gedeeld apparaat meldingen krijgen — zonder `error` en dus zonder spoor.
 *
 * ⚠️ **Dit toetst de belofte en niet de regel.** Wat er moet gelden is "de
 *    waarde die de delete meestuurt, is dezelfde waarde die de RPC wegschrijft".
 *    Daarom staan de twee aanroepen in één test naast elkaar en vergelijkt de
 *    assertie ze met elkaar, in plaats van allebei met een letterlijke string.
 *    Verandert de normalisatie ooit aan één kant, dan wordt dit rood — ook als
 *    iemand hier een nieuwe letterlijke waarde zou invullen.
 */
describe('verwijderPushToken', () => {
  /** Een bron met spaties eromheen, zoals een slordige native-integratie geeft. */
  const metSpaties: PushBron = {
    haalToken: () =>
      Promise.resolve({
        token: '  ExponentPushToken[uitloggen]  ',
        platform: 'ios' as const,
      }),
  };

  it('verwijdert de rij die de registratie wegschreef, spaties of niet', async () => {
    zetPushBron(metSpaties);

    await registreerPushToken('gebruiker-die-uitlogt');
    await verwijderPushToken();

    const [, argumenten] = RPC.mock.calls[0] as [string, { p_token: string }];
    const [tabel, kolom, waarde] = VERWIJDERD.mock.calls[0] as [string, string, string];

    expect(tabel).toBe('push_tokens');
    expect(kolom).toBe('token');

    // ⚠️ De database schrijft `trim(p_token)` weg en `push_tokens_token_getrimd`
    //    dwingt dat af. De delete moet dus op díé waarde matchen — niet op wat
    //    het apparaat toevallig teruggaf.
    expect(waarde).toBe(argumenten.p_token.trim());
    expect(waarde).toBe('ExponentPushToken[uitloggen]');
  });

  it('strookt alleen spaties, want dat is wat Postgres strookt', async () => {
    // ⚠️ `String.prototype.trim()` haalt ook tabs en regeleindes weg; Postgres'
    //    `trim()` niet. Ruimer strooken bouwt de asymmetrie terug die QS8-367
    //    wegnam, alleen aan de andere kant. Zo'n token komt de tabel overigens
    //    niet in — `is_expo_pushtoken()` sluit `[:space:]` uit — maar de
    //    normalisatie hier hoort die van de database te zijn en niet ruimer.
    zetPushBron({
      haalToken: () =>
        Promise.resolve({
          token: ' \tExponentPushToken[tab]\t ',
          platform: 'ios' as const,
        }),
    });

    await verwijderPushToken();

    const [, , waarde] = VERWIJDERD.mock.calls[0] as [string, string, string];
    expect(waarde).toBe('\tExponentPushToken[tab]\t');
  });

  it('doet geen verzoek als het apparaat geen token heeft', async () => {
    zetPushBron(geenPush);

    await verwijderPushToken();

    expect(VERWIJDERD).not.toHaveBeenCalled();
  });
});
