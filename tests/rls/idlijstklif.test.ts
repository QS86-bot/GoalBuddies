import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { brokken, IDS_PER_VERZOEK } from '../../src/shared/idlijst';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De 16 KB-klif in de responseheader van PostgREST — QS8-368.
 *
 * ⚠️ **Waarom dit tegen de échte stack moet.** De klif is geen eigenschap van
 *    onze code maar van de naad tussen twee onderdelen die elk kloppen:
 *    PostgREST echoot bij een GET de hele querystring terug in een
 *    `Content-Location`-responseheader, en undici kapt af zodra álle
 *    responseheaders samen boven 16 KB komen. Beide doen precies wat ze
 *    beloven. Regel 18 vraag 1 in zijn zuiverste vorm — en er is geen fixture
 *    die dit kan naspelen, want de fout ontstaat in de HTTP-parser.
 *
 * ⚠️⚠️ **Hij komt níét binnen als een afgewezen promise, en dat stond hier
 *    eerst wel.** Deze test is groen geworden door mijn eigen aanname te breken:
 *    `postgrest-js` 2.112.3 vángt `UND_ERR_HEADERS_OVERFLOW` af en maakt er een
 *    gewoon `{ error }`-antwoord van, mét een hint die de oorzaak noemt
 *    (`PostgrestBuilder.ts:431`). 📏 Wat er werkelijk terugkomt:
 *
 *      status: 0, code: '', message: 'TypeError: fetch failed',
 *      hint: 'HTTP headers exceeded server limits (typically 16KB). Your
 *             request URL is 19601 characters. … consider using an RPC
 *             function instead.'
 *
 *    Elke `if (error)`-tak vángt dit dus wél. Het gevolg is niet een scherm dat
 *    omvalt maar een lijst die stílzwijgend leeg blijft — bij `fetchRisicos()`
 *    géén badges in plaats van verkeerde, en dat leest als "nog niet berekend".
 *    Dat is nog steeds de bug, alleen een zachtere dan hij leek.
 *
 * ⚠️ **En `error.code` is leeg.** `reportError(…, { code: error.code })` legt
 *    hier dus een lege string vast; de bruikbare informatie zit in `hint`.
 *
 * 📏 Binair gezocht op 08-09-2026, `goals?select=id`, UUID's van 36 tekens:
 *    415 id's lukt (headers samen ~16390 bytes), 416 niet. 16 KB is 16384.
 *
 * ⚠️ **Eén getal is er geen.** Met een langere `select` schuift de klif mee —
 *    📏 413 tot 415 over drie varianten van dezelfde tabel. En dit is de grens
 *    van undici; de browser, Hermes en de proxy vóór productie zijn ongemeten.
 *    `IDS_PER_VERZOEK` staat daarom op 100 en niet tegen de klif aan; de
 *    redenering staat in `shared/idlijst`.
 *
 * ⚠️⚠️ **Wat dit bestand níét bewaakt, en dat is met de hand gemeten.** De
 *    eerste versie bouwde de brokkenlus hier zélf op en raakte `fetchRisicos()`
 *    dus nooit aan: 📏 de brokken uit die functie halen en één kale `.in()` over
 *    de hele lijst doen liet **10 van de 10 groen**. De grendel zat op de
 *    onderdelen — de klif, en `brokken()` als rekenkunde — en niet op de naad
 *    ertussen. Dat is regel 18 vraag 3 op een test die in zijn eigen kop beweert
 *    de belofte te toetsen.
 *
 *    De naad staat sindsdien in `src/modules/goals/risico-brokken.test.ts`, met
 *    een gemockte client die opschrijft wat er werkelijk verstuurd wordt.
 *
 * IJKING — met de hand gedraaid op 08-09-2026:
 *
 *   A  `brokken(goalIds)` in `fetchRisicos()` vervangen door `[goalIds]`
 *      → hier 0 rood, in `risico-brokken.test.ts` 2 rood
 *   B  `brokken()` vervangen door `[goalIds.slice(0, 200)]` (afkappen)
 *      → hier 0 rood, daar 3 rood — waaronder 'laat geen enkel doel vallen'
 *   C  `brokken(goalIds, 1)` (één verzoek per doel, de N+1 van regel 12)
 *      → hier 0 rood, daar 1 rood: 'doet één verzoek voor een lijst die past'
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 120_000;

/** Ruim boven de gemeten klif van 415, en niet er net overheen. */
const BOVEN_DE_KLIF = 500;

let alice: TestUser;

/** Een lijst id's die zeker geen rij raakt, met de vorm van een echte UUID. */
function verzonnenIds(aantal: number): string[] {
  return Array.from(
    { length: aantal },
    (_, i) => `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`,
  );
}

describe.skipIf(!rlsTestsConfigured)('een id-lijst boven de 16 KB-klif', () => {
  beforeAll(async () => {
    alice = await createTestUser('idlijst-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'valt om met een kale .in() — dit is de klif zelf',
    async () => {
      // ⚠️ **De negatieve controle, en hij toetst PostgREST en niet ons.**
      //    Zonder deze test bewijst de test hieronder alleen dat `fetchRisicos`
      //    werkt, niet dát er iets te repareren was. Wordt deze ooit groen, dan
      //    is de klif verdwenen (een nieuwe undici, een andere PostgREST) en mag
      //    `brokken()` heroverwogen worden — dan is dit bestand de plek waar dat
      //    blijkt in plaats van een aanname die niemand meer natelt.
      const { data, error } = await alice.db
        .from('goal_risk')
        .select('goal_id, status, reason, computed_at')
        .in('goal_id', verzonnenIds(BOVEN_DE_KLIF));

      expect(error, 'een kale .in() boven de klif hoort te mislukken').not.toBeNull();
      expect(error?.message).toContain('fetch failed');
      expect(
        error?.hint ?? '',
        'postgrest-js noemt de oorzaak zelf; dat is waar de diagnose vandaan komt',
      ).toContain('headers exceeded');
      expect(data, 'en er komt niets terug').toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'komt er met brokken wél doorheen, en levert elk brok af',
    async () => {
      // De must-allow. `brokken()` mag niet "veilig" zijn door niets te doen.
      const ids = verzonnenIds(BOVEN_DE_KLIF);
      const stukken = brokken(ids);

      expect(stukken.length, 'vijfhonderd hoort in meer dan één brok').toBeGreaterThan(1);
      expect(stukken.flat(), 'en er mag er geen wegvallen').toEqual(ids);

      for (const brok of stukken) {
        const { error } = await alice.db
          .from('goal_risk')
          .select('goal_id, status, reason, computed_at')
          .in('goal_id', [...brok]);

        expect(error, `een brok van ${brok.length} hoort er gewoon door`).toBeNull();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de brokgrootte onder de gemeten klif',
    () => {
      // ⚠️ **Een aparte assertie op het getal zelf.** Zonder deze kan iemand
      //    `IDS_PER_VERZOEK` op 500 zetten, waarna de test hierboven één brok
      //    maakt die net zo hard omvalt — maar dan met een melding die naar de
      //    verkeerde oorzaak wijst.
      expect(
        IDS_PER_VERZOEK,
        'de klif ligt boven de 400 en de verzoekregel bijt bij 200; 100 houdt op ' +
          'allebei een factor twee marge',
      ).toBeLessThanOrEqual(100);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft fetchRisicos-achtig gedrag: standen voor een lijst boven de klif',
    async () => {
      // ⚠️ **Dit is de belofte en niet het onderdeel** (regel 18 vraag 2). De
      //    twee tests hierboven toetsen de klif en de hakfunctie; deze toetst
      //    wat het scherm belooft: een gebruiker die twintig keer "meer laden"
      //    heeft gedrukt, krijgt nog steeds risicostanden.
      //
      //    Met echte rijen, want een lijst verzonnen id's zou ook groen zijn bij
      //    een `fetchRisicos` die stilzwijgend afkapt.
      const admin = adminDb();
      const doel = await admin
        .from('goals')
        .insert({ owner_id: alice.id, title: 'idlijst-klif', target_date: '2027-01-01' })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel: ${doel.error.message}`);

      const echt = (doel.data as { id: string }).id;
      const risico = await admin
        .from('goal_risk')
        .insert({ goal_id: echt, status: 'on_track', computed_at: new Date().toISOString() })
        .select('goal_id');
      if (risico.error) throw new Error(`risico: ${risico.error.message}`);

      // Het echte doel achteraan, dus voorbij de eerste brok: kapt iemand af in
      // plaats van te hakken, dan valt precies deze stand weg.
      const ids = [...verzonnenIds(BOVEN_DE_KLIF), echt];

      const gevonden = new Map<string, string>();
      for (const brok of brokken(ids)) {
        const { data, error } = await alice.db
          .from('goal_risk')
          .select('goal_id, status')
          .in('goal_id', [...brok]);
        expect(error).toBeNull();
        for (const rij of data ?? []) gevonden.set(rij.goal_id, rij.status);
      }

      expect(
        gevonden.get(echt),
        'de stand van het laatste doel in de lijst hoort er te zijn',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );
});
