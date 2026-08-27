import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { geenPush, registreerPushToken, zetPushBron, type PushBron } from './tokens';

/**
 * De herregistratie bij elke start — en waarom dat een beveiligingseigenschap is.
 *
 * ⚠️ **Deze test bewaakt een argument, niet een functie.** De bevinding van
 *    21-08-2026 zegt dat wie een pushtoken van een ander kent, dat token naar
 *    zich toe kan trekken: `registreer_push_token()` (migratie 0055) doet
 *    `delete from push_tokens where token = ... and user_id <> auth.uid()` en
 *    zet hem daarna op de aanroeper. Dat moet ook — zonder die overname blijft
 *    de vorige gebruiker van een gedeeld apparaat meldingen krijgen.
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

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({
    rpc: (naam: string, argumenten: unknown) => {
      RPC(naam, argumenten);
      return Promise.resolve({ data: { ok: true }, error: null });
    },
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
    // ⚠️ `geenPush` is de stand zolang `expo-notifications` er niet is. Een app
    //    die bij het opstarten omvalt omdat er geen pushbibliotheek is, is erger
    //    dan een app zonder meldingen.
    zetPushBron(geenPush);

    await expect(registreerPushToken('gebruiker-1')).resolves.toBeUndefined();
    expect(RPC).not.toHaveBeenCalled();
  });
});
