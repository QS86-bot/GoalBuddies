import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  gebruikerDb,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Het weekplan — QS8-203, migratie 0137.
 *
 * ⚠️ **Vier beloftes, en drie ervan zijn geen eigenschap van één onderdeel.**
 *    Onwrikbare regel 18: onderdelen zijn makkelijk te testen en naden niet, dus
 *    dit bestand toetst juist de naden.
 *
 *      1. *Een plan is privé.* Een tweede gebruiker kan de geplande stappen van
 *         de eerste niet lezen — en dat is een RLS-vraag en geen schermvraag.
 *      2. *Een plan kost geen punten.* Zes stappen wegzetten mag `max_points`
 *         niet aanraken. Dat is de hele reden dat er een aparte tabel is; zou
 *         iemand de stappen ooit naar `weekly_goals` verhuizen, dan is dit de
 *         test die omvalt.
 *      3. *De rollover is idempotent.* Twee rondes in dezelfde cyclus leveren
 *         één weekdoel op. De grendel is een unieke index en geen afspraak, dus
 *         hij is te toetsen.
 *      4. *Activeren gaat nooit buiten de functies om.* De client mag
 *         `activated_cycle` niet zelf schrijven — anders bepaalt een formulier
 *         "welke week dit is" en is correctheidsregel 7 door de achterdeur weg.
 *
 * ⚠️ Met de hand rood gemaakt; wat er per belofte gebroken is, staat bij het
 *    geval zelf.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Een cyclusdatum ver in het verleden, zodat niets van deze test elders meetelt. */
const CYCLUS = '2024-01-01';
const ANDERE_CYCLUS = '2024-01-08';

interface Fixture {
  eigenaar: TestUser;
  buiten: TestUser;
  goalId: string;
  stappen: readonly string[];
}

let f: Fixture;

async function maakStap(goalId: string, order: number, titel: string): Promise<string> {
  const rij = await adminDb()
    .from('weekly_plan_steps')
    .insert({ goal_id: goalId, order_index: order, title: titel })
    .select('id')
    .single();

  if (rij.error || rij.data === null) throw new Error(`stap: ${rij.error?.message}`);
  return rij.data.id;
}

describe.skipIf(!rlsTestsConfigured)('het weekplan', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('weekplan-eigenaar');
    const buiten = await createTestUser('weekplan-buiten');

    const doel = await adminDb()
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'WEEKPLAN proefdoel',
        target_date: '2030-01-01',
      })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const stappen = [
      await maakStap(doel.data.id, 1, 'WEEKPLAN stap een'),
      await maakStap(doel.data.id, 2, 'WEEKPLAN stap twee'),
      await maakStap(doel.data.id, 3, 'WEEKPLAN stap drie'),
    ];

    f = { eigenaar, buiten, goalId: doel.data.id, stappen };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. Een plan is privé
  // -------------------------------------------------------------------------

  it(
    'de eigenaar leest zijn eigen plan',
    async () => {
      const db = gebruikerDb(f.eigenaar.token);
      const uit = await db.from('weekly_plan_steps').select('id').eq('goal_id', f.goalId);

      expect(uit.error).toBeNull();
      expect(uit.data?.length).toBeGreaterThanOrEqual(3);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Bij elke weigering hoort een toelating**, en de test hierboven is die
   *    toelating. Een suite van alleen negatieve gevallen wordt groen zodra de
   *    database stukgaat.
   *
   * ⚠️ Rood gemaakt door `weekly_plan_steps_select` te verruimen met een tak voor
   *    groepsgenoten — de vorm die bij bijna elke andere tabel wél bestaat, en
   *    hier met opzet niet.
   */
  it(
    'een ander ziet er niets van, ook niet als hij weet wat hij zoekt',
    async () => {
      const db = gebruikerDb(f.buiten.token);

      const alles = await db.from('weekly_plan_steps').select('id').eq('goal_id', f.goalId);
      expect(alles.error).toBeNull();
      expect(alles.data).toEqual([]);

      const gericht = await db.from('weekly_plan_steps').select('id').eq('id', f.stappen[0] ?? '');
      expect(gericht.error).toBeNull();
      expect(gericht.data).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'een ander kan er ook niets in schrijven',
    async () => {
      const db = gebruikerDb(f.buiten.token);

      const insert = await db
        .from('weekly_plan_steps')
        .insert({ goal_id: f.goalId, order_index: 9, title: 'WEEKPLAN inbraak' })
        .select('id');
      expect(insert.error).not.toBeNull();

      const verwijderd = await db
        .from('weekly_plan_steps')
        .delete()
        .eq('goal_id', f.goalId)
        .select('id');
      expect(verwijderd.data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 2. Een plan kost geen punten
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Dit is de belofte waar het hele ontwerp op rust**, en hij is een
   *    eigenschap van het gehéél: het schema, de trigger op `weekly_goals` en de
   *    keuze voor een aparte tabel samen. Zou iemand de stappen ooit als
   *    `weekly_goals` met een vlaggetje wegschrijven, dan zijn alle losse
   *    onderdelen nog steeds correct en valt precies dit geval om.
   *
   * ⚠️ Rood gemaakt door in `maakStap()` naar `weekly_goals` te schrijven in
   *    plaats van naar `weekly_plan_steps`: `max_points` sprong toen naar 6.
   */
  it(
    'drie geplande stappen verhogen het puntenplafond niet',
    async () => {
      const doel = await adminDb()
        .from('goals')
        .select('max_points')
        .eq('id', f.goalId)
        .single();

      expect(doel.error).toBeNull();
      expect(doel.data?.max_points).toBe(0);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Activeren gaat nooit buiten de functies om
  // -------------------------------------------------------------------------

  /**
   * ⚠️ De client die zelf `activated_cycle` zet, ís correctheidsregel 7 door de
   *    achterdeur: dan bepaalt een formulier welke week dit is. De `with check`
   *    van `weekly_plan_steps_update` houdt dat tegen.
   *
   * ⚠️ Rood gemaakt door `activated_cycle is null` uit de `with check` te halen
   *    (hij staat ook in de `using`, dus alleen die weghalen is niet genoeg —
   *    precies waarom dit geval de update ook echt probeert).
   */
  it(
    'de eigenaar kan een stap niet zelf op een cyclus zetten',
    async () => {
      const db = gebruikerDb(f.eigenaar.token);

      const uit = await db
        .from('weekly_plan_steps')
        .update({ activated_cycle: CYCLUS })
        .eq('id', f.stappen[2] ?? '')
        .select('id');

      // Of de policy weigert luid, of hij raakt geen enkele rij. Allebei goed;
      // wat niet mag is een geslaagde schrijfactie.
      const geraakt = uit.data ?? [];
      expect(uit.error !== null || geraakt.length === 0).toBe(true);

      const na = await adminDb()
        .from('weekly_plan_steps')
        .select('activated_cycle')
        .eq('id', f.stappen[2] ?? '')
        .single();
      expect(na.data?.activated_cycle).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de eigenaar mag de tekst van een nog niet ingeschoven stap wél bijstellen',
    async () => {
      const db = gebruikerDb(f.eigenaar.token);

      const uit = await db
        .from('weekly_plan_steps')
        .update({ title: 'WEEKPLAN stap drie, bijgesteld' })
        .eq('id', f.stappen[2] ?? '')
        .select('title');

      expect(uit.error).toBeNull();
      expect(uit.data?.[0]?.title).toBe('WEEKPLAN stap drie, bijgesteld');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. De rollover is idempotent
  // -------------------------------------------------------------------------

  /**
   * ⚠️ **Acceptatiecriterium 5 van QS8-203**, en dit is de reden dat de grendel
   *    een unieke index is en geen afspraak: twee rondes in dezelfde cyclus
   *    leveren één weekdoel op.
   *
   * ⚠️ Rood gemaakt door in `weekplanstap_naar_weekdoel()` de controle op
   *    `activated_cycle = p_cycle_start_date` weg te halen: de tweede ronde
   *    activeerde toen stap 2 in dezelfde week — precies de zondagavond met zeven
   *    weekdoelen die dit ontwerp voorkomt.
   */
  it(
    'twee rondes op dezelfde cyclus leveren één weekdoel op',
    async () => {
      const eerste = await adminDb().rpc('activeer_weekplanstap', {
        p_goal_id: f.goalId,
        p_cycle_start_date: CYCLUS,
        p_cycle_index: 1,
      });
      expect(eerste.error).toBeNull();
      expect((eerste.data as { ok?: boolean } | null)?.ok).toBe(true);

      const tweede = await adminDb().rpc('activeer_weekplanstap', {
        p_goal_id: f.goalId,
        p_cycle_start_date: CYCLUS,
        p_cycle_index: 1,
      });
      expect(tweede.error).toBeNull();
      expect((tweede.data as { ok?: boolean; reason?: string } | null)?.ok).toBe(false);
      expect((tweede.data as { reason?: string } | null)?.reason).toBe('al_geactiveerd');

      const weekdoelen = await adminDb()
        .from('weekly_goals')
        .select('id, title')
        .eq('goal_id', f.goalId)
        .eq('cycle_start_date', CYCLUS);

      expect(weekdoelen.data?.length).toBe(1);
      expect(weekdoelen.data?.[0]?.title).toBe('WEEKPLAN stap een');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Acceptatiecriterium 2**: na een rollover staat stap 2 als weekdoel en
   *    zijn er nog stappen over. De volgorde is de belofte, niet "er komt iets
   *    binnen".
   */
  it(
    'de volgende cyclus krijgt de vólgende stap, en niet dezelfde',
    async () => {
      const uit = await adminDb().rpc('activeer_weekplanstap', {
        p_goal_id: f.goalId,
        p_cycle_start_date: ANDERE_CYCLUS,
        p_cycle_index: 2,
      });
      expect((uit.data as { ok?: boolean } | null)?.ok).toBe(true);

      const weekdoelen = await adminDb()
        .from('weekly_goals')
        .select('title')
        .eq('goal_id', f.goalId)
        .eq('cycle_start_date', ANDERE_CYCLUS);

      expect(weekdoelen.data?.length).toBe(1);
      expect(weekdoelen.data?.[0]?.title).toBe('WEEKPLAN stap twee');

      const open = await adminDb()
        .from('weekly_plan_steps')
        .select('id')
        .eq('goal_id', f.goalId)
        .is('activated_cycle', null);

      expect(open.data?.length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Een verbruikte stap is geschiedenis.** Weggooien zou het weekdoel
   *    losmaken van zijn herkomst én de unieke index vrijgeven, en dan kan er
   *    alsnog een tweede stap in dezelfde week.
   */
  it(
    'een ingeschoven stap kan de eigenaar niet meer weggooien',
    async () => {
      const db = gebruikerDb(f.eigenaar.token);

      const uit = await db
        .from('weekly_plan_steps')
        .delete()
        .eq('id', f.stappen[0] ?? '')
        .select('id');

      expect(uit.data ?? []).toEqual([]);

      const nog = await adminDb()
        .from('weekly_plan_steps')
        .select('id')
        .eq('id', f.stappen[0] ?? '');
      expect(nog.data?.length).toBe(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ Een leeg plan is geen fout maar een normale uitkomst — de meeste doelen
   *    hebben er geen. De rollover mag daar geen logregel per doel per uur van
   *    maken, en `geen_stap` is wat dat onderscheidt.
   */
  it(
    'een doel zonder openstaande stappen geeft geen_stap terug',
    async () => {
      const laatste = await adminDb().rpc('activeer_weekplanstap', {
        p_goal_id: f.goalId,
        p_cycle_start_date: '2024-01-15',
        p_cycle_index: 3,
      });
      expect((laatste.data as { ok?: boolean } | null)?.ok).toBe(true);

      const leeg = await adminDb().rpc('activeer_weekplanstap', {
        p_goal_id: f.goalId,
        p_cycle_start_date: '2024-01-22',
        p_cycle_index: 4,
      });
      expect((leeg.data as { reason?: string } | null)?.reason).toBe('geen_stap');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Nu de stappen weg zijn, is het puntenplafond wél gestegen** — en dat is
   *    de tegenhanger van het geval hierboven. Vier weekdoelen à 2 punten is 8.
   *    Zonder dit geval bewijst "een plan kost geen punten" alleen dat er nergens
   *    punten bij komen, en dat zou ook waar zijn als het inschuiven stuk was.
   */
  it(
    'ingeschoven weekdoelen verhogen het plafond wél, met één week tegelijk',
    async () => {
      const doel = await adminDb()
        .from('goals')
        .select('max_points')
        .eq('id', f.goalId)
        .single();

      // Drie stappen zijn ingeschoven, elk als weekdoel met plafond 2.
      expect(doel.data?.max_points).toBe(6);
    },
    TEST_TIMEOUT,
  );
});
