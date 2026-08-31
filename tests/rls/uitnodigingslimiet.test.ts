import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  anonDb,
  createTestUser,
  onbekendeCode,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Het plafond uit migratie 0131. */
const LIMIET = 60;

/**
 * `invite_preview()` heeft een teller per code — 0131, QS8-236.
 *
 * ⚠️ **Dit is het enige eindpunt van de app dat zonder sessie bereikbaar is**,
 *    en tot 0131 het enige van de vier die beveiligingsregel 5 raken zónder
 *    limiet. `join_group_with_code` telt elke poging (0008/0034), `create_group`
 *    heeft een dagteller (0016), AI-jobs hebben quota (0038).
 *
 * ⚠️ **De belofte hier is niet "de teller telt" maar "een oningelogde aanroeper
 *    kan hier niet onbeperkt werk neerleggen, en een échte genodigde merkt het
 *    verschil met een ingetrokken code".** Dat is regel 18 vraag 2. Een test die
 *    alleen `aantal` narekent, blijft groen als de functie de teller wél bijhoudt
 *    maar er nooit naar kijkt — en dat is precies de vorm die hier fout kan gaan.
 *
 * ⚠️ **Waarom die tweede helft van de belofte er staat.** `null` betekent hier
 *    sinds 0019 "ingetrokken, verlopen of nooit bestaan" — met opzet één antwoord
 *    voor drie gevallen, zodat de functie geen orakel is dat vertelt welke codes
 *    bestaan. Zou een bereikte limiet óók `null` geven, dan hoort een échte
 *    genodigde dat zijn uitnodiging niet meer geldt terwijl hij over een uur
 *    gewoon werkt. Die verwarring is stil: er komt geen foutmelding, en de
 *    uitnodiger ziet niets.
 *
 * ⚠️ **En de tabel zelf is een belofte.** Een teller over andermans uitnodiging
 *    zegt hoe vaak die bekeken is. Dat is geen groepsoppervlak en geen
 *    eigenaarsgegeven — het is voor niemand behalve de functie. Domeinregel 7
 *    stelt bij elk nieuw ding de vraag of iemand het met één API-verzoek buiten
 *    de UI om kan uitlezen; hier is het antwoord nee, en dat staat hieronder
 *    onder test in plaats van in een migratiecommentaar.
 */
describe.skipIf(!rlsTestsConfigured)('invite_preview heeft een limiet (0131)', () => {
  let alice: TestUser;
  let groep: { id: string; code: string };

  /** Zet de teller op een bekende stand, zonder de functie te gebruiken. */
  async function zetTeller(aantal: number): Promise<void> {
    const { error } = await adminDb()
      .from('invite_preview_limits')
      .upsert({ group_id: groep.id, venster_start: new Date().toISOString(), aantal });
    if (error) throw new Error(`teller zetten: ${error.message}`);
  }

  async function leesTeller(): Promise<number | null> {
    const { data } = await adminDb()
      .from('invite_preview_limits')
      .select('aantal')
      .eq('group_id', groep.id)
      .maybeSingle();
    return data?.aantal ?? null;
  }

  async function bekijk(code: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await anonDb().rpc('invite_preview', { code });
    if (error) throw new Error(`invite_preview (HTTP): ${error.message}`);
    return data as Record<string, unknown> | null;
  }

  beforeAll(async () => {
    alice = await createTestUser('limiet-alice');
    const { data, error } = await alice.db.rpc('create_group', { group_name: 'Limietproef' });
    if (error) throw new Error(`groep (HTTP): ${error.message}`);
    const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(data)}`);
    groep = { id: g.group.id, code: g.group.invite_code };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'telt elke aanroep van een oningelogde bezoeker',
    async () => {
      await zetTeller(0);
      for (let i = 0; i < 3; i += 1) await bekijk(groep.code);

      // ⚠️ Exact drie, niet "meer dan nul". Een teller die per aanroep twee keer
      //    opzou tellen, haalt het plafond op de helft en sluit echte genodigden
      //    buiten — en "meer dan nul" ziet dat niet.
      expect(await leesTeller()).toBe(3);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de groep tot en met de limiet en daarna niet meer',
    async () => {
      await zetTeller(LIMIET - 1);

      const laatste = await bekijk(groep.code);
      expect(laatste?.group_name).toBe('Limietproef');

      const eerstGeweigerd = await bekijk(groep.code);
      expect(eerstGeweigerd?.limiet_bereikt).toBe(true);
      expect(eerstGeweigerd?.group_name).toBeUndefined();
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft bij een bereikte limiet iets anders dan bij een code die niet bestaat',
    async () => {
      await zetTeller(LIMIET + 10);
      const geweigerd = await bekijk(groep.code);
      const onbekend = await bekijk(onbekendeCode());

      // ⚠️ **Eerst dat de limiet daadwerkelijk geraakt is.** Zonder deze regel
      //    blijft de rest van deze test groen terwijl de limiet er helemaal uit
      //    is: dan geeft `geweigerd` de gróép terug, `onbekend` blijft `null`,
      //    en "die twee verschillen" klopt nog steeds. Gemeten door de
      //    limietcontrole met de hand uit de functie te halen — deze test bleef
      //    staan en alleen zijn buurman viel om. Dat is regel 18 vraag 3, en de
      //    eerste versie hiervan bewaakte niets.
      expect(geweigerd?.limiet_bereikt).toBe(true);

      // Dit is de belofte, niet de vorm: die twee mogen nooit hetzelfde zijn.
      expect(onbekend).toBeNull();
      expect(geweigerd).not.toBeNull();
      expect(geweigerd).not.toEqual(onbekend);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de teller weer lopen zodra het venster verstreken is',
    async () => {
      const eenUurGeleden = new Date(Date.now() - 61 * 60 * 1000).toISOString();
      const { error } = await adminDb()
        .from('invite_preview_limits')
        .upsert({ group_id: groep.id, venster_start: eenUurGeleden, aantal: LIMIET + 10 });
      if (error) throw new Error(`venster terugzetten: ${error.message}`);

      const naVenster = await bekijk(groep.code);
      expect(naVenster?.group_name).toBe('Limietproef');
      expect(await leesTeller()).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'schrijft geen rij voor een code die niet bestaat',
    async () => {
      const voor = await adminDb()
        .from('invite_preview_limits')
        .select('group_id', { count: 'exact', head: true });

      for (let i = 0; i < 5; i += 1) await bekijk(onbekendeCode());

      const na = await adminDb()
        .from('invite_preview_limits')
        .select('group_id', { count: 'exact', head: true });

      // ⚠️ Dit is de groeivector en niet een netheidstoets. Een tabel die per
      //    aanroep een rij krijgt, is bij een oningelogd eindpunt de tweede helft
      //    van dezelfde aanval: je knijpt het rekenwerk af en geeft er onbegrensde
      //    groei voor terug. Vandaar één rij per groep en niet per gebeurtenis.
      expect(na.count).toBe(voor.count);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de teller dicht voor iedere client — ingelogd of niet',
    async () => {
      for (const [wie, db] of [
        ['anon', anonDb()],
        ['ingelogd', alice.db],
      ] as const) {
        const { data, error } = await db.from('invite_preview_limits').select('aantal');

        // Deny-all mag zich als een lege lijst óf als een weigering voordoen;
        // beide zijn goed, data teruggeven is dat niet.
        const gelekt = error === null && (data?.length ?? 0) > 0;
        expect(gelekt, `${wie} kon de teller lezen`).toBe(false);
      }
    },
    TEST_TIMEOUT,
  );
});
