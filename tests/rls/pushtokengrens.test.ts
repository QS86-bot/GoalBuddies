import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { readFileSync } from 'node:fs';

import { proefId } from './proefid';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een pushtoken heeft een bovengrens — QS8-297 — en een vorm — QS8-305.
 *
 * ⚠️ **Twee issues in één bestand, en dat is geen bundeling.** Het onderwerp is
 *    dezelfde RPC, dezelfde kolom en dezelfde twee lagen; 0209 vult de tak die
 *    0179 hier leeg liet staan. Ze uit elkaar trekken zou betekenen dat de
 *    volgorde van de takken — die wél uitmaakt, zie hieronder — in geen van
 *    beide bestanden te toetsen is.
 *
 * ⚠️ **Wat het probleem wél en niet was.** `push_tokens` is niet rechtstreeks
 *    door een client te vullen: `authenticated` heeft er alleen DELETE,
 *    REFERENCES en SELECT op. Maar de wáárde komt van de client, als argument
 *    van `registreer_push_token()`, en daar stond alleen een óndergrens van acht
 *    tekens op. Op een gratis tier met beperkte opslag en zonder backups is dat
 *    opslagmisbruik.
 *
 * ⚠️ **Het zijn drie kolommen en niet één.** `p256dh` en `auth` komen uit
 *    dezelfde RPC, hetzelfde INSERT-statement en dezelfde client. Alleen `token`
 *    begrenzen verplaatst het lek: wie een megabyte kwijt wil, zet hem in
 *    `p256dh`.
 *
 * ## Twee lagen, twee tests, en ze doen niet hetzelfde
 *
 * De CHECK op de kolom is de grendel — die blijft staan als er ooit een tweede
 * schrijver komt, en `service_role` loopt er niet langsheen. De tak in de RPC is
 * de nette weigering; zonder die tak krijgt de gebruiker een ruwe 23514 waar de
 * client niets mee kan, precies de klacht die 0067 voor `geen_websleutels`
 * oploste.
 *
 * ⚠️ Ze staan met hetzélfde getal en zijn dus een kopie die uit elkaar kan
 *    lopen. Daarom toetst dit bestand ze los: de RPC-tak via de gewone weg, de
 *    CHECK via een schrijver die de RPC overslaat. Gaat er één weg, dan is er
 *    precies één test rood.
 *
 * ⚠️ **En de must-allow is niet optioneel.** "Niemand mag dit meer" is ook te
 *    halen met een grens die élke echte token weigert, en dat is een kapotte app
 *    in plaats van een gesloten gat. Een grens die een geldige token weigert is
 *    erger dan geen grens.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `push_tokens_token_len` droppen
 *      → 1 rood: de kolomtest, en alléén die
 *   B  alléén de tak `token_te_lang` uit de RPC halen
 *      → 1 rood: de RPC-test, en alléén die
 *   C  `push_tokens_sleutels_len` droppen
 *      → 1 rood op de sleutelkant van de kolomtest
 *   D  de tak `sleutel_te_lang` uit de RPC halen
 *      → 1 rood op de sleutelkant van de RPC-test
 *   E  de grens op 10 zetten in plaats van 1000
 *      → 3 rood, alle drie must-allows; de grens ligt dan onder elke echte token
 *   G  de RPC-tak op 2000 zetten terwijl de CHECK op 1000 blijft
 *      → 1 rood: de twee lagen zijn uit elkaar gelopen
 *   H  `octet_length` terug naar `char_length`
 *      → 1 rood: duizend meerbyte-tekens komen door de grens heen
 *
 * ⚠️ **A ging eerst niet rood maar "no tests", en dat is de leerzame helft.** De
 *    beschikbaarheidsvraag bovenaan noemde `push_tokens_token_len` — precies de
 *    constraint die mutatie A dropt — dus de suite sloeg zichzelf netjes over.
 *    Een probe die het ding toetst dat je gaat breken, zet je eigen ijking uit.
 *    Hij vraagt nu naar de tabel.
 *
 * ⚠️ **En B was eerst te grof:** de hele web-tak eruit maakte drie tests rood.
 *    Mutatie per grendel betekent ook: muteer één tak, niet het blok eromheen.
 *
 * ⚠️⚠️ **G en H kwamen uit de security-review en niet uit deze suite.** Zonder G
 *    konden de twee lagen uit elkaar lopen zonder dat er iets rood werd: de
 *    over-grens-gevallen gebruikten 5000 en de must-allows 41 tot 188, dus alles
 *    tussen 1001 en 4999 was onbewaakt. En H is het geval waar de grens zélf de
 *    verkeerde eenheid telde — zie de kop van 0179.
 *
 * ## De vorm erbij — QS8-305, migratie 0209
 *
 * `is_pushdienst()` draaide alleen in de web-tak. Voor `ios` en `android` was
 * acht tekens genoeg: een rij die nooit iets kan ontvangen zag er precies zo uit
 * als een goede rij, en de meldingenjob stuurde er elke ronde een verzoek voor
 * naar Expo. 0209 zet er dezelfde twee lagen op als 0179 voor de lengte: een tak
 * in de RPC met een `reason`, en `push_tokens_native_vorm` op de kolom.
 *
 * ⚠️⚠️ **Twee ijkingen van QS8-297 zijn hier meeverbouwd, en dát is de
 *    interessante helft.** Ze voedden een token die noch de lengte- noch de
 *    vormtoets doorstaat (`'x'.repeat(5000)`, `'漢'.repeat(1000)`), en dus zou de
 *    nieuwe CHECK ze óók tegenhouden. Mutatie A — `push_tokens_token_len`
 *    droppen — was daarmee **groen** geworden: de rij werd nog steeds geweigerd,
 *    alleen door de verkeerde grendel. 📏 Nagemeten, en het is precies waar
 *    `CLAUDE.md` voor waarschuwt: een ijking die zijn geval door een pad voert
 *    dat een andere grendel al afvangt, bewaakt niets van wat hij belooft.
 *
 *    De fixtures dragen nu allemaal de Expo-vorm, zodat elke lengtetoets alleen
 *    nog over lengte gaat. Een migratie die een nieuwe weigering toevoegt, kan
 *    dus een bestaande ijking stilzwijgend uitzetten — **loop bij elke nieuwe
 *    grendel de ijkingen na die door hetzelfde veld lopen.**
 *
 * IJKING VAN DE VORM — met de hand gedraaid op 08-09-2026, mutatie per grendel,
 * en elke keer eerst met `pg_get_functiondef()` of `pg_constraint` nagekeken dat
 * de mutatie er écht in stond:
 *
 *   I  `push_tokens_native_vorm` droppen
 *      → 2 rood, allebei aan de kolomkant: de vormtest en de gepaarde test
 *   J  alléén de tak `geen_expotoken` uit de RPC halen
 *      → 2 rood, allebei aan de RPC-kant (de FCM-registratie en de APNs-token)
 *      ⚠️ De gepaarde test blijft hier gróén, en dat is juist: zonder die tak
 *         schrijft de RPC gewoon door en weigert de CHECK hem alsnog, dus "de
 *         RPC laat hem niet toe" blijft waar. Alleen de reden verandert van een
 *         `reason` in een ruwe 23514, en dat toetsen de twee andere.
 *   K  `Expo(nent)?` naar `Exponent` versmallen
 *      → 2 rood: de must-allow op `ExpoPushToken[…]` en de gepaarde test
 *   L  het patroon naar `^Expo` verslappen (geen haken, geen anker, lege romp)
 *      → 1 rood: de gepaarde test
 *      ⚠️ En alléén die. De twee weigertests voeden een kale FCM-registratie en
 *         een APNs-token, en die beginnen geen van beide met `Expo` — ze komen
 *         dus ook onder de verslapte versie niet door. **Het frame (de haken,
 *         het anker, de niet-lege romp) hangt aan die ene gepaarde test.** Dat
 *         is met opzet: dat is precies de test waar de vormenlijst in staat. Wie
 *         hem weghaalt, haalt de bewaking van het frame weg.
 *   M  de CHECK ook op web laten gelden (`is_expo_pushtoken(token)` zonder de
 *      `platform = 'web' or`)
 *      → 5 rood, allemaal web-must-allows: een endpoint-URL heeft geen haken
 *   N  de vormtak vóór de lengtetak zetten in de RPC
 *      → 1 rood: een token van 5000 heet dan `geen_expotoken` en niet
 *        `token_te_lang`
 *
 * ⚠️⚠️ **N bleef eerst 17 van de 17 groen, en dat is de tweede les van deze
 *    ijking.** De kop van 0209 zegt dat die volgorde vastligt, met een reden die
 *    de gebruiker leest — en er was geen enkele test die hem kon breken, omdat
 *    élke fixture inmiddels de Expo-vorm droeg en dus niet meer door beide
 *    takken liep. Het repareren van de ene ijking had de andere onmogelijk
 *    gemaakt zonder dat iets rood werd. De test *"noemt de lengte en niet de
 *    vorm als een token op allebei valt"* is er precies voor, en die is
 *    geschreven ná deze meting en niet ervoor.
 *
 * ⚠️ **A en H opnieuw gedraaid ná die reparatie**, want een ijking die je
 *    aanpast is een ijking die je opnieuw moet meten: A → 1 rood (de kolomtest),
 *    H → 1 rood (het bytes-geval). Allebei zoals ze bedoeld waren.
 *
 * ## Twee gaten uit de security-review, en de ijkingen erbij
 *
 *   O  de CHECK `ios` laten vrijstellen
 *      (`platform = 'web' or platform = 'ios' or is_expo_pushtoken(token)`)
 *      → 1 rood: de gepaarde test
 *      ⚠️ **Was 18 van de 18 groen.** Élke kolomkant-test draaide `android`; de
 *         enige ios-toets liep door de RPC. De RPC ving het af, maar de CHECK
 *         bestáát voor de schrijver die de RPC overslaat, en voor één van de
 *         twee native platforms was hij daarmee ongemeten. De gepaarde test
 *         draait nu elke vorm op allebei.
 *   P  `revoke execute on is_expo_pushtoken from service_role`
 *      → 1 rood: de grant-test
 *      ⚠️ Een CHECK wordt geëvalueerd als de **schrijvende** rol, dus die
 *         functie is een uitvoerrecht-afhankelijkheid geworden voor iedereen
 *         die in `push_tokens` schrijft. 📏 Zonder de expliciete grant werkte
 *         dat tóch, omdat `service_role` EXECUTE érft uit Supabase's
 *         `alter default privileges` — onwrikbare regel 4 in zijn zuiverste
 *         vorm. 0209 geeft het recht nu met zoveel woorden.
 *      ⚠️ De review mat hier "20/20 groen" op twee bestanden. 📏 Zelf
 *         nagemeten over de héle RLS-suite: dan vallen `notificaties.test.ts`
 *         en `afvinkgrens.test.ts` wél om, want die schrijven met `adminDb()`
 *         en dat ís `service_role`. De naad was dus gedekt — vanuit een ánder
 *         bestand, bij toeval, en zonder dat iets die afhankelijkheid benoemde.
 *         Dat is precies het verschil tussen gedekt en bewaakt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Een echte Expo-pushtoken heeft deze vorm en is 41 tekens.
 *
 * ⚠️ Met een run-suffix, want `push_tokens.token` is uniek. Breekt een run af
 *    vóór `removeTestUsers()`, dan zou een vaste literal de vólgende run laten
 *    vallen op een 23505 die eruitziet alsof de grens verkeerd ligt.
 */
const RUN = Math.random().toString(36).slice(2, 10);
const ECHTE_NATIVE_TOKEN = `ExponentPushToken[aBcDeFgHiJk${RUN}]`;

/** Een web-endpoint zoals FCM hem uitdeelt, met een hostnaam uit de allowlist. */
const ECHTE_WEB_ENDPOINT = `https://fcm.googleapis.com/fcm/send/${RUN}${'c'.repeat(144)}`;

/** Expo deelt beide vormen uit en accepteert ze allebei. Zie de kop van 0209. */
const ECHTE_NATIVE_TOKEN_KORT = `ExpoPushToken[lMnOpQrStUv${RUN}]`;

/**
 * Een kale FCM-registratietoken, ~157 tekens — een van de drie vormen die het
 * issue noemde en die deze app nooit opvraagt.
 */
const KALE_FCM_REGISTRATIE = `fMEXAMPLE${RUN}:APA91bH${'x'.repeat(140)}`;

/** Een APNs device token: 64 hex. */
const APNS_DEVICE_TOKEN = 'a1b2c3d4'.repeat(8);

/**
 * Te lang, maar mét de Expo-vorm.
 *
 * ⚠️ **Dit was `'x'.repeat(5000)` en dat was na 0209 geen ijking meer.** Zo'n
 *    token valt op de lengte én op de vorm, dus `push_tokens_token_len` droppen
 *    liet hem alsnog weigeren door `push_tokens_native_vorm`. Zie de kop.
 */
const TE_LANG_MAAR_GOEDE_VORM = `ExponentPushToken[${'x'.repeat(5000)}]`;

/**
 * Duizend tekens, bijna drieduizend bytes, en mét de Expo-vorm.
 *
 * ⚠️ 18 tekens omhulsel + 981 CJK + 1 sluithaak = precies 1000 tekens, en
 *    18 + 2943 + 1 = 2962 bytes. Dat is de hele bedoeling van dit geval: het
 *    komt door `char_length` heen en niet door `octet_length`. Wordt het langer
 *    dan duizend tékens, dan zegt ook `char_length` nee en bewaakt mutatie H
 *    niets meer.
 */
const PAST_IN_TEKENS_NIET_IN_BYTES = `ExponentPushToken[${'漢'.repeat(981)}]`;

/** 65 octetten base64url, zoals RFC 8291 voorschrijft. */
const ECHTE_P256DH = 'B'.repeat(87);
/** 16 octetten base64url. */
const ECHTE_AUTH = 'A'.repeat(22);

let alice: TestUser;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

/** Draait dit statement en zegt of het gelukt is. */
function lukt(sql: string): boolean {
  try {
    psql(sql);
    return true;
  } catch {
    return false;
  }
}

/**
 * ⚠️ **De beschikbaarheidsvraag noemt met opzet níét `push_tokens_token_len`.**
 *    Dat was de eerste versie, en toen sloeg de hele suite zich netjes over bij
 *    de ijking die juist die constraint dropte — "no tests" in plaats van rood.
 *    Een probe die het ding toetst dat je gaat breken, zet je eigen ijking uit.
 *    Hij vraagt daarom naar de tábel, die er los van deze migratie is.
 */
const kolomgrensMeetbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'push_tokens' and relkind = 'r' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

describe.skipIf(!rlsTestsConfigured)('registreer_push_token() en zijn grenzen', () => {
  beforeAll(async () => {
    alice = await createTestUser('pushgrens-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'weigert een token boven de grens met een reden, niet met een ruwe fout',
    async () => {
      // ⚠️ Mét de Expo-vorm, sinds 0209. Een kale `'x'.repeat(5000)` valt óók op
      //    de vormtoets, en dan gaat deze test niet meer over de lengte.
      expect(TE_LANG_MAAR_GOEDE_VORM.length, 'ruim over de grens').toBeGreaterThan(1000);

      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: TE_LANG_MAAR_GOEDE_VORM,
        p_platform: 'android',
      });

      expect(error, 'de gebruiker hoort een antwoord te krijgen, geen 23514').toBeNull();
      expect(uit(data).ok).toBe(false);
      expect(uit(data).reason, 'de lengte gaat vóór de vorm, zie 0209').toBe('token_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een websleutel boven de grens met een reden',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_WEB_ENDPOINT,
        p_platform: 'web',
        p_p256dh: 'B'.repeat(5000),
        p_auth: ECHTE_AUTH,
      });

      expect(error).toBeNull();
      expect(uit(data).ok).toBe(false);
      expect(uit(data).reason).toBe('sleutel_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een echte Expo-token gewoon door',
    async () => {
      // ⚠️ De must-allow. Zonder deze helft is "niemand mag dit meer" ook te
      //    halen met een grens die élke token weigert.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_NATIVE_TOKEN,
        p_platform: 'android',
      });

      expect(error).toBeNull();
      expect(uit(data), 'een echte token van 41 tekens hoort er gewoon door').toEqual({ ok: true });

      const rij = await adminDb().from('push_tokens').select('token').eq('token', ECHTE_NATIVE_TOKEN);
      expect(rij.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een echt web-abonnement gewoon door, met sleutels op ware grootte',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_WEB_ENDPOINT,
        p_platform: 'web',
        p_p256dh: ECHTE_P256DH,
        p_auth: ECHTE_AUTH,
      });

      expect(error).toBeNull();
      expect(uit(data), `endpoint van ${ECHTE_WEB_ENDPOINT.length} tekens`).toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    'legt de RPC-grens op precies dezelfde plek als de CHECK',
    async () => {
      // ⚠️ **Zonder deze test kunnen de twee lagen uit elkaar lopen zonder dat
      //    er iets rood wordt.** De over-grens-gevallen hierboven gebruiken 5000
      //    en de must-allows 41 tot 188; zet iemand de RPC-tak op 2000 terwijl de
      //    CHECK op 1000 blijft, dan blijft alles groen en krijgt een gebruiker
      //    met een token van 1500 alsnog een ruwe 23514. De migratiekop
      //    waarschuwt daarvoor; dit is de assertie die het vastpint.
      //
      // ⚠️ De grens telt bytes en niet tekens, dus deze literalen zijn ASCII —
      //    daar vallen de twee samen. Waarom bytes: zie de kop van 0179.
      const opDeGrens = `https://fcm.googleapis.com/fcm/send/${'g'.repeat(1000 - 36)}`;
      expect(opDeGrens.length, 'precies op de grens').toBe(1000);

      const past = await alice.db.rpc('registreer_push_token', {
        p_token: opDeGrens,
        p_platform: 'web',
        p_p256dh: ECHTE_P256DH,
        p_auth: ECHTE_AUTH,
      });
      expect(uit(past.data), 'duizend bytes hoort er nog door').toEqual({ ok: true });

      const eroverheen = await alice.db.rpc('registreer_push_token', {
        p_token: `${opDeGrens}h`,
        p_platform: 'web',
        p_p256dh: ECHTE_P256DH,
        p_auth: ECHTE_AUTH,
      });
      expect(eroverheen.error, 'geen ruwe 23514').toBeNull();
      expect(uit(eroverheen.data).reason, 'duizend-en-een niet').toBe('token_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'legt de sleutelgrens op precies dezelfde plek als de CHECK',
    async () => {
      const opDeGrens = 'B'.repeat(255);

      const past = await alice.db.rpc('registreer_push_token', {
        p_token: `${ECHTE_WEB_ENDPOINT}-sleutelgrens`,
        p_platform: 'web',
        p_p256dh: opDeGrens,
        p_auth: ECHTE_AUTH,
      });
      expect(uit(past.data), '255 hoort er nog door').toEqual({ ok: true });

      const eroverheen = await alice.db.rpc('registreer_push_token', {
        p_token: `${ECHTE_WEB_ENDPOINT}-sleutelgrens2`,
        p_platform: 'web',
        p_p256dh: `${opDeGrens}B`,
        p_auth: ECHTE_AUTH,
      });
      expect(eroverheen.error).toBeNull();
      expect(uit(eroverheen.data).reason, '256 niet').toBe('sleutel_te_lang');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een token die in tekens past maar in bytes niet',
    async () => {
      // ⚠️ **Dit is het geval dat de security-review vond.** Met `char_length`
      //    kwam duizend meerbyte-codepunten (3000 bytes) door de CHECK heen en
      //    knalde de insert daarna op `push_tokens_token_uniek`, een btree die
      //    op 2704 bytes afkapt:
      //
      //      index row size 3016 exceeds btree version 4 maximum 2704 (54000)
      //
      //    Een ruwe Postgres-fout waar de client niets mee kan — precies de
      //    klacht die 0067 oploste en die deze migratie wil wegnemen.
      // ⚠️ Ook dit geval draagt sinds 0209 de Expo-vorm, en de maat luistert
      //    nauw: precies duizend tékens, bijna drieduizend bytes.
      expect(PAST_IN_TEKENS_NIET_IN_BYTES.length, 'precies op de tekengrens').toBe(1000);

      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: PAST_IN_TEKENS_NIET_IN_BYTES,
        p_platform: 'android',
      });

      expect(error, 'geen ruwe 54000').toBeNull();
      expect(uit(data).reason, 'duizend tekens is bijna drieduizend bytes').toBe('token_te_lang');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // De vorm — QS8-305, migratie 0209
  // -------------------------------------------------------------------------

  it(
    'weigert een native token zonder Expo-vorm met een reden',
    async () => {
      // ⚠️ Een kale FCM-registratietoken is precies de vorm die het issue als
      //    mogelijkheid noemde en die deze app nooit opvraagt: `expo-bron.ts`
      //    roept alleen `getExpoPushTokenAsync()` aan. Zo'n rij zou er goed
      //    uitzien en nooit iets ontvangen.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: KALE_FCM_REGISTRATIE,
        p_platform: 'android',
      });

      expect(error, 'geen ruwe 23514').toBeNull();
      expect(uit(data).ok).toBe(false);
      expect(uit(data).reason).toBe('geen_expotoken');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een APNs device token op ios',
    async () => {
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: APNS_DEVICE_TOKEN,
        p_platform: 'ios',
      });

      expect(error).toBeNull();
      expect(uit(data).reason, '64 hex is geen Expo-token').toBe('geen_expotoken');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat ook de korte Expo-vorm door',
    async () => {
      // ⚠️ De must-allow die het patroon breed houdt. Expo deelt zowel
      //    `ExponentPushToken[…]` als `ExpoPushToken[…]` uit; een toets die de
      //    tweede weigert, weigert wat de eigen bibliotheek uitgeeft — en dat is
      //    erger dan geen toets.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: ECHTE_NATIVE_TOKEN_KORT,
        p_platform: 'ios',
      });

      expect(error).toBeNull();
      expect(uit(data), 'ExpoPushToken[…] is een geldige vorm').toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een web-endpoint ongemoeid — de vormtoets geldt alleen native',
    async () => {
      // ⚠️ De must-allow aan de andere kant. Een endpoint-URL heeft geen haken;
      //    een vormtoets die ook op web zou gelden, breekt web-push volledig.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: `${ECHTE_WEB_ENDPOINT}-vorm`,
        p_platform: 'web',
        p_p256dh: ECHTE_P256DH,
        p_auth: ECHTE_AUTH,
      });

      expect(error).toBeNull();
      expect(uit(data), 'web draagt een URL en geen Expo-token').toEqual({ ok: true });
    },
    TEST_TIMEOUT,
  );

  it(
    'noemt de lengte en niet de vorm als een token op allebei valt',
    async () => {
      // ⚠️⚠️ **Deze test bestaat omdat mutatie N zónder hem groen bleef.** De kop
      //    van 0209 zegt dat de lengtetak vóór de vormtak hoort te staan, met
      //    een reden die de gebruiker leest: een token van vijfduizend tekens
      //    heet `token_te_lang` en niet `geen_expotoken`. 📏 Gemeten dat die
      //    volgorde omdraaien 17 van de 17 tests groen liet — élke fixture droeg
      //    inmiddels de Expo-vorm, dus geen enkele liep nog door beide takken.
      //    Een uitspraak in een kop die geen test kan breken, is proza.
      const { data, error } = await alice.db.rpc('registreer_push_token', {
        p_token: 'x'.repeat(5000),
        p_platform: 'android',
      });

      expect(error).toBeNull();
      expect(uit(data).reason, 'te lang én zonder vorm: de lengte is de bruikbare reden').toBe(
        'token_te_lang',
      );
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'zegt in de RPC en op de kolom over dezelfde vormen hetzelfde',
    async () => {
      // ⚠️ **Dit is mutatie G van QS8-297, toegepast op de vorm.** De twee lagen
      //    dragen hetzelfde patroon op twee plekken en kunnen dus uit elkaar
      //    lopen: versmalt iemand de CHECK zonder de RPC, dan krijgt een
      //    gebruiker met een geldige token een ruwe 23514 in plaats van een
      //    antwoord. Deze test legt beide oordelen naast elkaar in plaats van ze
      //    los te toetsen.
      //
      // ⚠️ **Elke vorm is een fabriek en geen string, en dat is niet netjes maar
      //    nodig.** `push_tokens.token` is uniek, dus de RPC-kant en de
      //    kolomkant hebben elk hun eigen waarde. De eerste versie plakte er een
      //    achtervoegsel achter de al opgebouwde token — en zette daarmee een
      //    teken voorbij de sluithaak, waardoor een geldige vorm ongeldig werd
      //    en de kolomkant nee zei waar de RPC ja zei. Deze test vond dat zelf.
      const vormen: readonly {
        naam: string;
        maak: (achtervoegsel: string) => string;
        mag: boolean;
      }[] = [
        { naam: 'ExponentPushToken', maak: (a) => `ExponentPushToken[paar1-${RUN}-${a}]`, mag: true },
        { naam: 'ExpoPushToken', maak: (a) => `ExpoPushToken[paar2-${RUN}-${a}]`, mag: true },
        { naam: 'lege haken', maak: () => 'ExponentPushToken[]', mag: false },
        { naam: 'rommel erna', maak: (a) => `ExponentPushToken[paar3-${RUN}-${a}]x`, mag: false },
        { naam: 'rommel ervoor', maak: (a) => `xExponentPushToken[paar4-${RUN}-${a}]`, mag: false },
        { naam: 'sluithaak in de romp', maak: (a) => `ExponentPushToken[a]b-${RUN}-${a}]`, mag: false },
        { naam: 'spatie in de romp', maak: (a) => `ExponentPushToken[a b-${RUN}-${a}]`, mag: false },
        { naam: 'kale FCM-registratie', maak: (a) => `${KALE_FCM_REGISTRATIE}-${a}`, mag: false },
      ];

      // ⚠️⚠️ **Béíde native platforms, en dat is geen zuinigheid maar een gat dat
      //    gedicht is.** 📏 De eerste versie draaide alleen `android`, en toen
      //    bleef een CHECK van de vorm
      //    `platform = 'web' or platform = 'ios' or is_expo_pushtoken(token)`
      //    18 van de 18 groen — voor één van de twee native platforms was de
      //    kolomkant dus ongemeten. De RPC ving `ios` wel af, maar de CHECK
      //    bestaat juist voor de schrijver die de RPC overslaat. Gevonden in de
      //    security-review op deze branch.
      for (const vorm of vormen) {
        for (const platform of ['android', 'ios'] as const) {
          const viaRpc = await alice.db.rpc('registreer_push_token', {
            p_token: vorm.maak(`rpc-${platform}`),
            p_platform: platform,
          });
          const rpcLaatDoor = uit(viaRpc.data).ok === true;

          // Deze insert gaat als `postgres` en loopt langs de RPC heen; alleen
          // de CHECK op de kolom houdt hem tegen.
          const viaKolom = lukt(`
            insert into public.push_tokens (user_id, token, platform)
            values ('${alice.id}', '${vorm.maak(`kolom-${platform}`).replace(/'/g, "''")}', '${platform}')
          `);

          expect(rpcLaatDoor, `RPC over ${vorm.naam} op ${platform}`).toBe(vorm.mag);
          expect(viaKolom, `CHECK over ${vorm.naam} op ${platform}`).toBe(vorm.mag);
        }
      }
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'geeft `service_role` het uitvoerrecht op `is_expo_pushtoken` met zoveel woorden',
    () => {
      // ⚠️⚠️ **Hier draagt het precedent van `is_pushdienst()` níét, en dat is de
      //    hele reden dat deze test bestaat.** Die functie staat alleen in een
      //    functielichaam; `is_expo_pushtoken` staat óók in een CHECK, en een
      //    CHECK wordt geëvalueerd als de **schrijvende** rol. Wie in
      //    `push_tokens` schrijft, moet hem dus kunnen uitvoeren.
      //
      // 📏 Gemeten: `revoke execute … from service_role` en dan als
      //    `service_role` een `update push_tokens set last_seen_at = now()` →
      //    `permission denied for function is_expo_pushtoken`, op een UPDATE die
      //    `token` noch `platform` raakt. Zonder de expliciete grant werkt dat
      //    vandaag tóch, want `service_role` érft EXECUTE uit Supabase's
      //    `alter default privileges` — en onwrikbare regel 4 zegt dat een recht
      //    zonder grant-regel geërfd is en niet besloten.
      //
      // ⚠️ `functiegrants.test.ts` kan dit structureel niet zien: die kijkt
      //    alleen naar wat `authenticated` mag uitvoeren.
      const acl = psql(`
        select coalesce(p.proacl::text, '(geen acl)')
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'is_expo_pushtoken'
      `).trim();

      expect(acl, 'service_role schrijft in push_tokens en moet de CHECK kunnen draaien').toContain(
        'service_role=X',
      );
      expect(acl, 'authenticated schrijft nooit rechtstreeks in deze tabel').not.toContain(
        'authenticated=X',
      );
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'houdt een native token zonder Expo-vorm ook tegen bij een schrijver die de RPC overslaat',
    () => {
      const zonderVorm = lukt(`
        insert into public.push_tokens (user_id, token, platform)
        values ('${alice.id}', '${KALE_FCM_REGISTRATIE}-kolomkant', 'android')
      `);
      expect(zonderVorm, 'push_tokens_native_vorm hoort dit te weigeren').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'laat zo een schrijver een web-endpoint zonder Expo-vorm wél door',
    () => {
      // ⚠️ De must-allow op de kolom. Zonder deze zou een CHECK die de
      //    `platform = 'web' or` vergeet, net zo groen staan.
      const web = lukt(`
        insert into public.push_tokens (user_id, token, platform, p256dh, auth)
        values ('${alice.id}', '${ECHTE_WEB_ENDPOINT}-kolomweb', 'web',
                '${ECHTE_P256DH}', '${ECHTE_AUTH}')
      `);
      expect(web, 'een endpoint-URL hoort er gewoon in te mogen').toBe(true);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'houdt een te lange token ook tegen bij een schrijver die de RPC overslaat',
    () => {
      // ⚠️ **Dit is de grendel die het verschil maakt.**
      //    `registreer_push_token()` is vandaag de enige schrijver, en dat is een
      //    toestand en geen grendel — dezelfde les als bij domeinregel 3 en bij
      //    0172. Deze insert gaat als `postgres` en loopt overal langsheen;
      //    alleen de CHECK op de kolom houdt hem tegen.
      // ⚠️ Mét de Expo-vorm, zodat alléén `push_tokens_token_len` hem tegenhoudt.
      //    Zonder die haken deed `push_tokens_native_vorm` het werk en bleef
      //    mutatie A groen — zie de kop.
      const teLang = lukt(`
        insert into public.push_tokens (user_id, token, platform)
        values ('${alice.id}', 'ExponentPushToken[' || repeat('x', 5000) || ']', 'android')
      `);
      expect(teLang, 'de CHECK op de kolom hoort dit te weigeren').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'houdt een te lange websleutel ook tegen bij zulke schrijvers',
    () => {
      const teLang = lukt(`
        insert into public.push_tokens (user_id, token, platform, p256dh, auth)
        values ('${alice.id}', '${ECHTE_WEB_ENDPOINT}x', 'web', repeat('B', 5000), '${ECHTE_AUTH}')
      `);
      expect(teLang, 'de CHECK op de sleutels hoort dit te weigeren').toBe(false);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!kolomgrensMeetbaar)(
    'laat zo een schrijver een token van normale lengte wél door',
    () => {
      // ⚠️ De must-allow aan de kolomkant. Zonder deze zou een CHECK die álles
      //    weigert net zo groen staan als een die de grens goed legt.
      const past = lukt(`
        insert into public.push_tokens (user_id, token, platform)
        values ('${alice.id}', 'ExponentPushToken[kolomkant-${RUN}]', 'ios')
      `);
      expect(past, 'een token van normale lengte hoort er gewoon in te mogen').toBe(true);
    },
    TEST_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// QS8-367 — de overname heeft één mechanisme
// ---------------------------------------------------------------------------

/**
 * ⚠️⚠️ **De belofte is niet "de `delete` is weg".** Dat is de regel. De belofte
 *    is een eigenschap van het geheel:
 *
 *      Wie een token registreert dat al bij een ander staat, neemt het over —
 *      en dat gebeurt langs precies één mechanisme.
 *
 * ⚠️ Tot 0211 waren het er twee: een `delete` die met een **ongetrimde** waarde
 *    vergeleek, en de `on conflict` van de insert. De eerste las als het slot op
 *    het gedeelde-apparaatgeval — zo staat hij ook in de dossierrij van 21-08 —
 *    en de tweede deed het werk. 📏 Gemeten dat weghalen veilig is: `authenticated`
 *    heeft op deze tabel alléén SELECT en er is geen insert-policy, dus deze RPC
 *    is de enige schrijver en ze trimt altijd.
 *
 * ⚠️ **Wat hier voor het eerst onder test staat is `id` en `created_at`.** Dat
 *    was het énige waarneembare verschil tussen de twee paden — langs de
 *    `delete` kwam er een verse rij, langs de `on conflict` blijft de bestaande
 *    staan — en niets toetste het. Een test die alleen `user_id` bekijkt, blijft
 *    groen welk pad je ook kiest.
 */
describe.skipIf(!rlsTestsConfigured)('de overname van een pushtoken', () => {
  /**
   * ⚠️ **Eigen gebruikers, en dat is een gerepareerde opzet.** De eerste versie
   *    leende `alice` van het blok hierboven, en 📏 dat gaf meteen een
   *    `push_tokens_user_id_fkey`: het `afterAll` van dát blok draait wanneer
   *    díé describe klaar is, dus vóór deze begint. `removeTestUsers()` had haar
   *    al weggehaald. Een fixture die over een blokgrens heen leent, leunt op de
   *    volgorde waarin vitest zijn haken draait.
   */
  let eerste: TestUser;
  let tweede: TestUser;
  const GEDEELD = `ExponentPushToken[gedeeld-${RUN}]`;

  interface Rij {
    id: string;
    user_id: string;
    created_at: string;
    token: string;
  }

  /** De rij zoals `service_role` hem ziet — `push_tokens_select` is eigenaar-only. */
  async function rijVan(token: string): Promise<Rij | null> {
    const { data } = await adminDb()
      .from('push_tokens')
      .select('id, user_id, created_at, token')
      .eq('token', token)
      .maybeSingle();
    return (data ?? null) as Rij | null;
  }

  async function registreer(wie: TestUser, token: string) {
    const { data, error } = await wie.db.rpc('registreer_push_token', {
      p_token: token,
      p_platform: 'ios',
    });
    if (error) throw new Error(`registreren: ${error.message}`);
    return uit(data);
  }

  beforeAll(async () => {
    if (!rlsTestsConfigured) return;
    eerste = await createTestUser('pushovername-eerste');
    tweede = await createTestUser('pushovername-tweede');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'zet het token om naar de laatste registreerder',
    async () => {
      expect(await registreer(eerste, GEDEELD)).toEqual({ ok: true });
      const vanAlice = await rijVan(GEDEELD);
      expect(vanAlice?.user_id, 'de opstelling klopt niet').toBe(eerste.id);

      expect(await registreer(tweede, GEDEELD)).toEqual({ ok: true });

      // ⚠️ **Dit is de pin op de `on conflict`**, en sinds 0211 is dat het enige
      //    mechanisme. Haal `user_id = excluded.user_id` uit de conflicttak weg
      //    en deze test wordt rood — dat is de ijking die acceptatiecriterium 3
      //    vraagt, want de `delete` weghalen mag verder niets veranderen.
      const naOvername = await rijVan(GEDEELD);
      expect(naOvername?.user_id, 'de overname landde niet').toBe(tweede.id);

      // ⚠️ **De telling hoort hier en niet in een eigen test.** Ze leunt op de
      //    opstelling van deze test — twee registraties van hetzelfde token — en
      //    losgetrokken was ze volgordeafhankelijk. `push_tokens_token_uniek`
      //    draagt haar; die droppen breekt `on conflict (token)` met `42P10` en
      //    dus alles hier, dus als losse test ijkt ze niets van wat ze belooft.
      const { data: alle, error } = await adminDb()
        .from('push_tokens')
        .select('id')
        .eq('token', GEDEELD);
      expect(error, JSON.stringify(error)).toBeNull();
      expect(alle ?? [], 'de overname liet een tweede rij achter').toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat geen ongetrimde rij bestaan, ook niet onder service_role',
    async () => {
      // ⚠️⚠️ **Dit is de grendel onder 0211, en hij is er omdat de security-review
      //    de premisse brak.** Het besluit om de `delete` weg te halen leunt erop
      //    dat elke rij getrimd is: de `on conflict (token)` matcht op de exacte
      //    string, dus een ongetrimde rij zou een tweede rij voor hetzelfde
      //    apparaat opleveren en dan blijft de vorige eigenaar meldingen krijgen.
      //
      // ⚠️ **Voor native droeg `push_tokens_native_vorm` dat al** — die roept het
      //    geankerde `is_expo_pushtoken()` aan. Voor **web** toetste niets de
      //    kolom (`platform = 'web' or is_expo_pushtoken(token)`), en
      //    `is_pushdienst()` staat alléén in de RPC. Daar kwam een ongetrimde
      //    endpoint-URL dus gewoon binnen. `push_tokens_token_getrimd` sluit dat.
      //
      // ⚠️ **De vorige test hier telde de rijen na een overname en bewaakte
      //    niets** (QS8-367, security-review). Twee rijen zijn onmogelijk door
      //    `push_tokens_token_uniek`, en die droppen laat `on conflict (token)`
      //    afgaan met `42P10` — dan wordt élke test in dit blok rood, dus de
      //    ijking liep door een eerdere grendel. Bovendien leunde hij op de
      //    opstelling van de test ervóór. Hij is vervangen door dit geval, dat
      //    zijn eigen grendel noemt en los ijkbaar is.
      const ongetrimd = `  https://fcm.googleapis.com/fcm/send/getrimd-${RUN}  `;

      const { error } = await adminDb()
        .from('push_tokens')
        .insert({
          user_id: eerste.id,
          token: ongetrimd,
          platform: 'web',
          p256dh: 'p256dh-meet',
          auth: 'auth-meet',
        });

      expect(error?.code, `service_role kreeg de ongetrimde rij erin: ${JSON.stringify(error)}`).toBe(
        '23514',
      );
      expect(error?.message ?? '').toContain('push_tokens_token_getrimd');
    },
    TEST_TIMEOUT,
  );

  /**
   * Leest de normalisatie **uit migratie 0211 zelf**, en dat is het hele punt.
   *
   * ⚠️⚠️ **Een test die een kopie van die twee statements draagt, bewaakt de
   *    kopie.** Verandert iemand de volgorde in de migratie, of haalt hij de
   *    `delete` eruit, dan blijft zo'n test groen — hij toetst wat er in het
   *    testbestand staat en niet wat de migratie belóóft. Dat is regel 18 vraag
   *    4, en dit project heeft hem twee keer bij een verhuizing betaald.
   *
   * De snede loopt van het eerste statement tot aan het `do $migratie$`-blok dat
   * de constraint zet; alles ertussen is de normalisatie.
   */
  function normalisatieUit0211(): string {
    const bestand = readFileSync(
      'supabase/migrations/0211_de_overname_van_een_pushtoken_heeft_een_mechanisme.sql',
      'utf8',
    );
    const begin = bestand.indexOf('delete from push_tokens dubbel');
    const eind = bestand.indexOf('do $migratie$', begin);

    expect(begin, 'de normalisatie staat niet meer in 0211').toBeGreaterThan(-1);
    expect(eind, 'het grendelblok staat niet meer ná de normalisatie').toBeGreaterThan(begin);

    return bestand.slice(begin, eind);
  }

  /**
   * ⚠️⚠️ **De normalisatie die 0211 vóór de grendel zet, en waarom die er is.**
   *
   * De eerste versie van deze migratie onderbouwde de CHECK met "📏 op productie
   * staan 0 rijen, dus er valt niets te normaliseren". `src/modules/notifications/
   * tokens.ts` waarschuwt sinds QS8-366 met zoveel woorden tegen precies die
   * redenering — *"wie op deze leegte een besluit baseert, telt hem opnieuw"* —
   * en terecht: productie staat op 0186, deze migratie draait pas bij een
   * volgende deploy, en de redenen dat de tabel leeg is vervallen per platform op
   * verschillende momenten. Dus normaliseert de migratie zelf.
   *
   * ⚠️ **Deze test voert hem de twee soorten die hij moet kunnen**, want een
   *    normalisatie die je niet kunt voeden, kun je niet ijken. Op de lokale
   *    stack ís de tabel schoon en zou dit pad nooit gedraaid worden — dan
   *    bewaakt "de migratie liep groen" niets van wat ze belooft.
   */
  it('knipt bestaande rijen bij en gooit alleen de dubbele weg', () => {
    const oud = proefId(367);
    const nieuw = proefId(368);

    const uitslag = psql(`
      begin;
      insert into auth.users (id, email) values
        ('${oud}', 'norm-oud367@x.nl'), ('${nieuw}', 'norm-nieuw367@x.nl');

      -- ⚠️ De grendel gaat er even af, want anders is de toestand die de
      --    migratie moet opruimen niet te máken. Alles rolt terug.
      alter table push_tokens drop constraint push_tokens_token_getrimd;

      insert into push_tokens (user_id, token, platform, p256dh, auth) values
        -- dubbel: de ongetrimde rij hoort bij de vórige eigenaar
        ('${oud}',   '  https://fcm.googleapis.com/fcm/send/d367  ', 'web', 'p', 'a'),
        ('${nieuw}', 'https://fcm.googleapis.com/fcm/send/d367',     'web', 'p', 'a'),
        -- los: alleen de ongetrimde vorm bestaat
        ('${oud}',   '  https://fcm.googleapis.com/fcm/send/l367  ', 'web', 'p', 'a');

      -- De normalisatie, letterlijk zoals ze in 0211 staat.
      ${normalisatieUit0211()}

      -- ⚠️ **En dit is de eigenlijke assertie**: de grendel moet er daarna weer
      --    op kunnen. Laat de normalisatie ook maar één rij ongetrimd staan, dan
      --    faalt deze regel en breekt de hele aanroep af.
      alter table push_tokens add constraint push_tokens_token_getrimd
        check (token = btrim(token));

      select string_agg(
               btrim(t.token) || '=' ||
               case t.user_id when '${oud}'::uuid then 'oud' else 'nieuw' end,
               ' | ' order by t.token)
        from push_tokens t
       where t.token like '%fcm/send/_367%';
      rollback;
    `).trim();

    // De dubbele is bij de geldige eigenaar gebleven, de losse bij de zijne.
    expect(uitslag).toBe(
      'https://fcm.googleapis.com/fcm/send/d367=nieuw | https://fcm.googleapis.com/fcm/send/l367=oud',
    );
  });

  /**
   * ⚠️ **De volgorde ís het gedrag, en dat is apart geijkt.** Knip je eerst bij,
   *    dan botst de dubbele soort op `push_tokens_token_uniek` en faalt de
   *    migratie halverwege. Deze test speelt die omgekeerde volgorde na en eist
   *    dat hij stukloopt — anders zegt de volgorde in 0211 niets.
   */
  it('loopt stuk als de bijknip vóór de opruiming komt', () => {
    const oud = proefId(369);
    const nieuw = proefId(370);

    expect(() =>
      psql(`
        begin;
        insert into auth.users (id, email) values
          ('${oud}', 'norm-oud369@x.nl'), ('${nieuw}', 'norm-nieuw369@x.nl');
        alter table push_tokens drop constraint push_tokens_token_getrimd;
        insert into push_tokens (user_id, token, platform, p256dh, auth) values
          ('${oud}',   '  https://fcm.googleapis.com/fcm/send/v369  ', 'web', 'p', 'a'),
          ('${nieuw}', 'https://fcm.googleapis.com/fcm/send/v369',     'web', 'p', 'a');
        update push_tokens set token = btrim(token) where token <> btrim(token);
        rollback;
      `),
    ).toThrow(/push_tokens_token_uniek/);
  });

  it(
    'houdt de rij dezelfde: id en created_at overleven de overname',
    async () => {
      const token = `ExponentPushToken[identiteit-${RUN}]`;

      expect(await registreer(eerste, token)).toEqual({ ok: true });
      const voor = await rijVan(token);
      expect(voor, 'de opstelling klopt niet').not.toBeNull();

      expect(await registreer(tweede, token)).toEqual({ ok: true });
      const na = await rijVan(token);

      // ⚠️ **Dit is acceptatiecriterium 2, en het is een besluit en geen
      //    bijvangst.** Langs de oude `delete` kwam hier een verse rij met een
      //    nieuwe `id` en een nieuwe `created_at`. 📏 Niets leest die twee — geen
      //    foreign key wijst naar `push_tokens.id`, geen andere functie noemt de
      //    tabel, en de meldingenjob selecteert `token, platform, p256dh, auth` —
      //    dus de keuze is vrij, en hij ligt hier vast in plaats van in een
      //    implementatiedetail.
      expect(na?.user_id).toBe(tweede.id);
      expect(na?.id, 'de rij is vervangen in plaats van omgezet').toBe(voor?.id);
      expect(na?.created_at, 'created_at hoort van de rij te zijn en niet van de eigenaar').toBe(
        voor?.created_at,
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'neemt ook over als de aanroeper er spaties omheen zet',
    async () => {
      // ⚠️⚠️ **Dit is het geval waarop de twee mechanismen uit elkaar liepen.**
      //    De `delete` vergeleek met `p_token` en miste hier, terwijl de insert
      //    `trim(p_token)` wegschreef en dus alsnog botste. Nu is er één pad, en
      //    deze test zegt dat het langs dezelfde rij loopt: zelfde `id`.
      const token = `ExponentPushToken[spaties-${RUN}]`;

      expect(await registreer(eerste, token)).toEqual({ ok: true });
      const voor = await rijVan(token);

      expect(await registreer(tweede, `   ${token}   `)).toEqual({ ok: true });
      const na = await rijVan(token);

      expect(na?.user_id, 'de overname landde niet').toBe(tweede.id);
      expect(na?.id, 'er is een tweede rij ontstaan in plaats van een overname').toBe(voor?.id);
      expect(na?.token, 'de opgeslagen waarde hoort getrimd te zijn').toBe(token);
    },
    TEST_TIMEOUT,
  );
});
