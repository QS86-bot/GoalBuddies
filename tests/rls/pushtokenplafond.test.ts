import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * `push_tokens` heeft een dagplafond — QS8-369, migratie 0213.
 *
 * ⚠️ **De rij ís begrensd, de tabel niet — en dat is onwrikbare regel 18 in het
 *    klein.** `push_tokens_token_len` (0179), `push_tokens_sleutels_len` (0179)
 *    en `push_tokens_native_vorm` (0209) zeggen alle drie iets over één rij, en
 *    ze zijn alle drie correct. Wat geen van drieën zegt, is hoevéél rijen er
 *    mogen komen. 📏 Gemeten op de lokale stack vóór deze migratie: veertien
 *    tabellen droegen een `*_dagplafond`, en `push_tokens` had géén enkele
 *    niet-interne trigger. Elk onderdeel klopt en het geheel lekt.
 *
 * ## Drie lagen, en ze doen niet hetzelfde
 *
 *   1. `pushtokens_dagplafond` — de grendel. `after insert … for each statement`
 *      met een transitietabel, zodat een batch als geheel telt en niet rij voor
 *      rij langs een teller glipt (QS8-343, migratie 0192).
 *   2. `pushtokens_rem` — de noodstop van 0200. Een transitietabel bestáát
 *      alleen in `AFTER`, dus zónder deze `before insert … for each row`
 *      schrijft Postgres een geweigerde batch eerst fysiek weg.
 *
 *      📏 Nagemeten op deze tabel, 08-09-2026: een geweigerde batch van 20.000
 *      liet de tabel op **96 kB** met de rem, en op **5496 kB** met de rem uit —
 *      allebei met nul overgebleven rijen, en die 5,4 MB komt pas terug bij een
 *      `vacuum full`. Op een gratis tier zonder backups is dat het hele punt.
 *   3. De tak `te_veel_tokens` in `registreer_push_token()` — de nette
 *      weigering. Zonder die tak krijgt de gebruiker een ruwe 23514 door
 *      PostgREST heen, precies de klacht die 0067 voor `geen_websleutels` en
 *      0179 voor `token_te_lang` oplosten.
 *
 * ⚠️ **Laag 1 en 3 dragen hetzelfde getal op twee plekken en kunnen uit elkaar
 *    lopen.** Daarom staat er een gepaarde test die ze naast elkaar legt in
 *    plaats van ze allebei los tegen `20` aan te houden — dezelfde constructie
 *    als mutatie G in `pushtokengrens.test.ts`, die daar het gat tussen 1001 en
 *    4999 dichtlegde.
 *
 * ⚠️ **De must-allow op herregistratie is de belangrijkste test in dit bestand.**
 *    `Pushwacht` in `app/_layout.tsx` roept `registreer_push_token()` aan bij
 *    élke start van de app. Zou hérregistreren van hetzelfde apparaat meetellen,
 *    dan zit een dagelijkse gebruiker binnen drie weken vast — een dichtgeslagen
 *    app in plaats van een gesloten gat. Dat het niet meetelt, is geen toeval
 *    maar de `on conflict (token) do update`-tak: Postgres stuurt een rij die op
 *    het conflict terechtkomt naar de UPDATE-kant, en die komt dus niet in de
 *    transitietabel van een `after insert`-trigger.
 *
 * ## Hoe de grendel los van de RPC getoetst wordt
 *
 * `authenticated` heeft géén INSERT-recht op `push_tokens`, op geen enkele
 * kolom — de RPC is de enige clientroute. Een test die alleen de RPC gebruikt,
 * kan de trigger dus nooit raken: de tak `te_veel_tokens` weigert de 21e vóór de
 * insert. Daarom zetten de triggertests hieronder `request.jwt.claims` met de
 * hand en schrijven ze rechtstreeks, precies zoals `pushtokengrens.test.ts` dat
 * doet voor de CHECKs. Dat is geen kunstgreep: het is de schrijver waarvoor de
 * grendel bestáát — een tweede RPC, een migratie, een backfill.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, mutatie per grendel, en elke keer
 * eerst met een grep in `pg_get_functiondef()` nagekeken dat de mutatie er écht
 * in stond:
 *
 *   A  `drop trigger pushtokens_dagplafond on push_tokens`
 *      → 7 rood: alle vier de triggertests hier, plus de drie in
 *        `plafonddekking.test.ts` — die noemt `push_tokens` bij naam
 *   B  `drop trigger pushtokens_rem on push_tokens`
 *      → 1 rood: de remtest, en alléén die
 *   C  alléén de tak `te_veel_tokens` uit de RPC halen
 *      → 2 rood: de nette weigering en de gepaarde test
 *   D  `pushtokens_plafond()` op 20 laten in de trigger en de RPC-tak op het
 *      dubbele zetten (de twee lagen uit elkaar laten lopen)
 *      → 2 rood, dezelfde twee. ⚠️ Dat C en D op hetzelfde paar landen is geen
 *        overlap die weg kan: C haalt de weigering wég, D verschúift hem, en
 *        alleen de gepaarde test kan het tweede zien zónder een getal uit dit
 *        bestand te geloven.
 *   E  de `not exists`-voorwaarde uit de RPC-tak halen, zodat herregistratie
 *      wél meetelt
 *      → 1 rood: de must-allow op herregistratie, en alléén die
 *   F  de rem `after insert … for each statement` maken in plaats van
 *      `before insert … for each row`
 *      → 1 rood hier (het dagplafond spreekt in plaats van de rem) én 1 rood in
 *        `remdekking.test.ts` (de vormtoets). Twee bestanden, twee invalshoeken,
 *        dezelfde fout — en dat is de vorm waar 0207 voor gebouwd is.
 *   G  `and user_id = v_uid` uit de RPC-tak halen — de eerste versie van deze
 *      migratie, die over de héle tabel toetste
 *      → 1 rood: de orakeltest, met de 23514 in de melding
 *
 * ⚠️⚠️ **G is er niet bij verzonnen maar bij gemeten, en hij haalde de eerste
 *    versie van deze migratie onderuit.** Die vroeg `not exists (… where token =
 *    …)` zonder eigenaar, in de overtuiging dat een bestaande token nooit een rij
 *    bijmaakt. Dat klopt alleen voor je éigen token: die van een ander verhuist
 *    naar jou via de `on conflict … do update`. Op het plafond gaf dat een ruwe
 *    23514 in precies het geval waarvoor de tak bestaat, én een bestaansorakel —
 *    `te_veel_tokens` betekende "bestaat niet", een 23514 betekende "bestaat".
 *    De hele redenering staat in de kop van 0213.
 *
 * ⚠️ Bij elke mutatie is eerst in de dráaiende database nagekeken dat hij er
 *    écht in stond (`select prosrc like '%…%' from pg_proc`, `tgtype` uit
 *    `pg_trigger`) vóór de uitslag geloofd werd. Een ijking die zijn eigen
 *    mutatie niet meet, meet niets.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Het plafond uit 0213. Staat hier als getal, niet als functieaanroep — zie de gepaarde test. */
const PLAFOND = 20;

const RUN = Math.random().toString(36).slice(2, 10);

/** Een geldige Expo-token, zodat `push_tokens_native_vorm` (0209) nooit de reden is. */
function token(merk: string, n: number): string {
  return `ExponentPushToken[${RUN}-${merk}-${n}]`;
}

let alice: TestUser;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

/**
 * Schrijft rechtstreeks in `push_tokens` als `alice`, langs de RPC heen.
 *
 * ⚠️ **De claim moet gezet, anders meet dit niets.** `begrens_pushtokens()`
 *    begint met `if auth.uid() is null then return null`, net als de veertien
 *    tellers vóór hem: een achtergrondjob onder `service_role` hoort er niet
 *    tegenaan te lopen. Zonder `request.jwt.claims` valt deze helper dus precies
 *    in die tak en is élke assertie hieronder gratis groen.
 */
function schrijfAls(gebruiker: string, aantal: number, merk: string): string | null {
  try {
    psql(`
      begin;
      select set_config('request.jwt.claims',
                        json_build_object('sub', '${gebruiker}')::text, true);
      insert into public.push_tokens (user_id, token, platform)
      select '${gebruiker}'::uuid,
             'ExponentPushToken[${RUN}-${merk}-' || g || ']',
             'android'
        from generate_series(1, ${aantal}) g;
      commit;
    `);
    return null;
  } catch (fout) {
    return String((fout as { stderr?: string }).stderr ?? fout);
  }
}

/**
 * Het plafond zoals de dátabase het kent.
 *
 * ⚠️ **Hier staat met opzet geen `20`.** De gepaarde test hieronder hangt eraan:
 *    zou dit getal uit dit bestand komen, dan meet hij twee kopieën tegen een
 *    derde in plaats van de twee lagen tegen elkaar.
 */
function grensUitDeDatabase(): number {
  return Number(psql('select public.pushtokens_plafond()').trim());
}

/** De noodgrens van de rem, uit dezelfde bron. */
function pushtokensNoodgrens(): number {
  return grensUitDeDatabase() * 2;
}

/** Hoeveel tokens `alice` in het laatste etmaal heeft. */
function aantalVan(gebruiker: string): number {
  return Number(
    psql(`select count(*) from public.push_tokens
           where user_id = '${gebruiker}'
             and created_at > now() - interval '1 day'`).trim(),
  );
}

/**
 * ⚠️ **De beschikbaarheidsvraag noemt met opzet niet de trigger of de functie
 *    die de ijkingen breken.** Dat was de les van mutatie A in
 *    `pushtokengrens.test.ts`: een probe die het ding toetst dat je gaat breken,
 *    zet je eigen ijking uit en levert "no tests" op in plaats van rood. Hij
 *    vraagt naar de tábel, die er los van deze migratie is.
 */
const triggerMeetbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'push_tokens' and relkind = 'r' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

describe.skipIf(!rlsTestsConfigured)('push_tokens heeft een dagplafond', () => {
  beforeAll(async () => {
    alice = await createTestUser('pushplafond-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.skipIf(!triggerMeetbaar)(
    'weigert een batch boven het plafond, en laat er geen rij van staan',
    () => {
      const fout = schrijfAls(alice.id, PLAFOND + 1, 'over');

      expect(fout, `${PLAFOND + 1} rijen horen op het dagplafond te stuiten`).not.toBeNull();
      expect(fout).toMatch(/Te veel pushtokens in één dag/);
      // ⚠️ De tweede helft. Een trigger die wél werpt maar ná de commit van de
      //    rijen, laat het lek bestaan; deze regel is wat dat onderscheidt.
      expect(aantalVan(alice.id), 'de hele batch hoort teruggedraaid').toBe(0);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!triggerMeetbaar)(
    'laat een batch precies op het plafond wél door',
    () => {
      // ⚠️ De must-allow. Zonder deze helft is "niemand mag er meer bij" ook te
      //    halen met een plafond van nul, en dat is een kapotte app.
      const fout = schrijfAls(alice.id, PLAFOND, 'exact');

      expect(fout, 'precies het plafond hoort te mogen').toBeNull();
      expect(aantalVan(alice.id)).toBe(PLAFOND);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!triggerMeetbaar)(
    'telt de rijen die er al staan mee, en niet alleen die van dit statement',
    () => {
      // ⚠️ **De naad.** De vorige test heeft er PLAFOND neergezet. Eén rij erbij
      //    is op zichzelf ver onder elk plafond; alleen een teller die de
      //    bestaande rijen meeneemt, ziet dit. Een trigger die `count(*) from
      //    nieuw` toetst in plaats van de tabel, blijft hier groen.
      expect(aantalVan(alice.id), 'de vorige test hoort er PLAFOND te hebben gezet').toBe(PLAFOND);

      const fout = schrijfAls(alice.id, 1, 'eentje-erbij');

      expect(fout, 'de 21e hoort te stuiten, ook als hij alleen komt').not.toBeNull();
      expect(fout).toMatch(/Te veel pushtokens in één dag/);
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!triggerMeetbaar)(
    'laat de rem een grote batch tegenhouden vóórdat de grendel eraan toekomt',
    () => {
      // ⚠️ **De rem en de grendel zijn niet inwisselbaar.** Allebei weigeren ze
      //    deze batch; het verschil is dat de grendel hem eerst fysiek laat
      //    schrijven. 📏 96 kB tegen 5496 kB, zie de kop. Dat verschil is met
      //    een assertie op "geweigerd" niet te zien, dus deze test kijkt naar
      //    wélke van de twee gesproken heeft.
      const fout = schrijfAls(alice.id, pushtokensNoodgrens() + 1, 'rem');

      expect(fout).not.toBeNull();
      expect(fout, 'de rem hoort te spreken, niet het dagplafond').toMatch(
        /Te veel pushtokens in één verzoek/,
      );
    },
    TEST_TIMEOUT,
  );

  it.skipIf(!triggerMeetbaar)(
    'raakt een achtergrondschrijver zonder ingelogde gebruiker niet',
    () => {
      // ⚠️ De tweede must-allow, en dezelfde afweging als bij de veertien
      //    tellers vóór deze: de rollover en de meldingenjob draaien onder
      //    `service_role` zonder claim. Een plafond dat hén raakt, legt de app
      //    stil op precies het moment dat er iets moet gebeuren.
      const bob = psql(`select shim_maak_gebruiker('plafond-bob-${RUN}@example.com', 'geheim123')`)
        .trim();
      try {
        psql(`insert into public.push_tokens (user_id, token, platform)
              select '${bob}'::uuid, 'ExponentPushToken[${RUN}-job-' || g || ']', 'android'
                from generate_series(1, ${PLAFOND + 5}) g`);
        expect(
          Number(psql(`select count(*) from public.push_tokens where user_id = '${bob}'`).trim()),
          'zonder auth.uid() hoort het plafond niet te gelden',
        ).toBe(PLAFOND + 5);
      } finally {
        psql(`select shim_verwijder_gebruiker('${bob}')`);
      }
    },
    TEST_TIMEOUT,
  );
});

describe.skipIf(!rlsTestsConfigured)('registreer_push_token() en het dagplafond', () => {
  let carol: TestUser;

  beforeAll(async () => {
    carol = await createTestUser('pushplafond-carol');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Registreert er `aantal` langs de gewone weg en geeft de laatste uitslag terug. */
  async function registreer(merk: string, van: number, tot: number) {
    let laatste: { ok?: boolean; reason?: string } = {};
    for (let n = van; n <= tot; n += 1) {
      const { data, error } = await carol.db.rpc('registreer_push_token', {
        p_token: token(merk, n),
        p_platform: 'android',
      });
      expect(error, `token ${n} hoort geen ruwe fout te geven`).toBeNull();
      laatste = uit(data);
    }
    return laatste;
  }

  it(
    'weigert de eerste token boven het plafond met een reden, niet met een 23514',
    async () => {
      const grens = grensUitDeDatabase();

      const tot = await registreer('rpc', 1, grens);
      expect(tot.ok, `de eerste ${grens} horen er gewoon in te mogen`).toBe(true);

      const erover = await registreer('rpc', grens + 1, grens + 1);
      expect(erover.ok).toBe(false);
      expect(erover.reason, 'de gebruiker hoort een antwoord te krijgen').toBe('te_veel_tokens');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat hetzelfde apparaat zich opnieuw registreren, ook als het plafond vol is',
    async () => {
      // ⚠️⚠️ **De belangrijkste test in dit bestand.** `Pushwacht` in
      //    `app/_layout.tsx` doet dit bij élke start van de app. Telt een
      //    herregistratie mee, dan zit een dagelijkse gebruiker binnen drie
      //    weken vast op een melding die hij niet kan wegnemen — dichtgeslagen
      //    in plaats van beschermd.
      //
      //    De vorige test heeft het plafond vol gezet; deze biedt er een aan die
      //    er al ís.
      const { data, error } = await carol.db.rpc('registreer_push_token', {
        p_token: token('rpc', 1),
        p_platform: 'android',
      });

      expect(error).toBeNull();
      expect(uit(data).ok, 'herregistratie hoort nooit op het plafond te stuiten').toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft hetzelfde antwoord of de token nu bestaat of niet — geen bestaansorakel',
    async () => {
      // ⚠️⚠️ **Deze test is geschreven ná een meting die de eerste versie van de
      //    RPC-tak onderuit haalde, en hij is de reden dat `and user_id = v_uid`
      //    daar staat.** De tak vroeg `not exists (… where token = …)` over de
      //    héle tabel, en dat is precies verkeerd om: een token van iemand
      //    ánders wordt door de `on conflict … do update` naar jou toe
      //    geschreven, dus die rij verhuist en telt wél mee.
      //
      // 📏 Gemeten met een aanvaller op zijn eigen plafond: een token dat niet
      //    bestond gaf `te_veel_tokens`, en een token van een ánder gaf een ruwe
      //    23514 uit de trigger. Twee verschillende antwoorden op dezelfde vraag
      //    is een orakel — dezelfde vorm die `blokkeer()` en
      //    `vraag_lidmaatschap_aan()` met zoveel woorden dichtzetten.
      //
      // ⚠️ Hij toetst niet "de tak staat er" maar "de twee antwoorden zijn
      //    gelijk". Dat blijft kloppen als iemand de tak verplaatst of
      //    herschrijft, en het is de belofte en niet de plek. Regel 18, vraag 4.
      const slachtoffer = await createTestUser('pushplafond-slachtoffer');
      const geheim = token('geheim-van-een-ander', 1);

      const gezet = await slachtoffer.db.rpc('registreer_push_token', {
        p_token: geheim,
        p_platform: 'android',
      });
      expect(uit(gezet.data).ok, 'het slachtoffer hoort zijn token te kunnen zetten').toBe(true);

      // carol staat op het plafond uit de eerste test van dit blok.
      const bestaatNiet = await carol.db.rpc('registreer_push_token', {
        p_token: token('bestaat-vast-niet', 1),
        p_platform: 'android',
      });
      const bestaatWel = await carol.db.rpc('registreer_push_token', {
        p_token: geheim,
        p_platform: 'android',
      });

      expect(bestaatNiet.error, 'geen ruwe fout op het niet-bestaande geval').toBeNull();
      expect(bestaatWel.error, 'en geen ruwe 23514 op het bestaande geval').toBeNull();
      expect(
        uit(bestaatWel.data).reason,
        'een bestaande token van een ander hoort hetzelfde antwoord te geven als een ' +
          'token die niet bestaat — anders leest dit verschil voor of hij bestaat',
      ).toBe(uit(bestaatNiet.data).reason);

      // ⚠️ En de tweede helft van dezelfde reparatie: de overname gebeurt niet
      //    half. Zonder de eigenaarstoets schreef de `on conflict` de rij al naar
      //    de aanvaller toe vóórdat de trigger wierp.
      const nogVanHem = Number(
        psql(`select count(*) from public.push_tokens
               where token = '${geheim}' and user_id = '${slachtoffer.id}'`).trim(),
      );
      expect(nogVanHem, 'het token hoort van het slachtoffer te blijven').toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert op precies het getal waar de trigger het ook zou doen',
    async () => {
      // ⚠️ **De gepaarde test.** De RPC-tak en `begrens_pushtokens()` dragen
      //    hetzelfde plafond op twee plekken. Zonder deze test kan de een naar
      //    40 en de ander op 20 blijven staan, en dan is het gat ertussen geen
      //    nette weigering meer maar een ruwe 23514 — precies de fout die 0067
      //    en 0179 op deze tabel al twee keer hebben opgelost.
      //
      //    Hij toetst dat niet tegen `20` maar tegen wat de database zegt: gaan
      //    beide lagen samen naar een ander getal, dan is dat een besluit en
      //    geen drift.
      const grens = grensUitDeDatabase();

      const aantalNu = Number(
        psql(`select count(*) from public.push_tokens
               where user_id = '${carol.id}'
                 and created_at > now() - interval '1 day'`).trim(),
      );
      expect(aantalNu, 'de eerste test hoort het plafond vol gezet te hebben').toBe(grens);

      // De RPC weigert hier. Zou hij doorlaten, dan komt de trigger erachteraan
      // en krijgt de client een 23514 in plaats van een `reason` — dat is wat
      // deze assertie uit elkaar houdt.
      const { data, error } = await carol.db.rpc('registreer_push_token', {
        p_token: token('gepaard', 1),
        p_platform: 'android',
      });

      expect(error, 'een 23514 hier betekent dat de RPC-tak te laat weigert').toBeNull();
      expect(uit(data).reason).toBe('te_veel_tokens');

      // En de andere kant: de trigger weigert dezelfde rij ook, als je de RPC
      // overslaat. Twee lagen die op hetzelfde getal staan.
      let triggerWeigerde = false;
      try {
        psql(`
          begin;
          select set_config('request.jwt.claims',
                            json_build_object('sub', '${carol.id}')::text, true);
          insert into public.push_tokens (user_id, token, platform)
          values ('${carol.id}'::uuid, '${token('gepaard', 2)}', 'android');
          commit;
        `);
      } catch {
        triggerWeigerde = true;
      }
      expect(
        triggerWeigerde,
        'de trigger hoort op hetzelfde getal te weigeren als de RPC-tak',
      ).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
