import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Welke kolommen van een doel de groep níet krijgt — QS8-392 en QS8-393,
 * migratie 0236.
 *
 * ⚠️⚠️ **Eén oorzaak, twee lekken, en de oorzaak is dat `goals_select` nooit als
 *    oppervlak is opgeschreven.** Het register in
 *    `docs/decisions/002-domeinregel7-oppervlakken.md` telde 64 oppervlakken en
 *    dit was er geen van, dus de twee vragen die domeinregel 7 verplicht stelt
 *    zijn hier nooit gesteld. Daarom staat de rij er nu bij, en daarom toetst
 *    dit bestand de **rij** en niet twee losse kolommen.
 *
 * ⚠️ **De must-allow weegt hier zwaar**, want dit is een intrekking en de
 *    goedkoopste manier om hem groen te krijgen is te veel afsluiten. Een
 *    groepsgenoot mag het doel nog steeds zíen — dat ís de koppelfeature — en de
 *    eigenaar moet zijn eigen antwoord onverkort terugkrijgen, anders is de
 *    Doelcoach stuk in plaats van dicht.
 *
 * ⚠️⚠️ **`weekly_total` is de valstrik en heeft daarom een eigen geval.** De
 *    voor de hand liggende reparatie is `goal_dashboard` op
 *    `security_invoker = false` zetten en de drie kolommen maskeren. Dan telt
 *    `weekly_total` opeens álle weekdoelen mee, verborgen inbegrepen, en is er
 *    een tweede exemplaar van hetzelfde lek in een andere kolom. Het geval
 *    hieronder legt de teller van de eigenaar naast die van de groepsgenoot.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  `grant select (identity_statement) on goals to authenticated`
 *      -> 1 rood: 'de groepsgenoot leest de interviewantwoorden niet'
 *   B  `grant select (max_points) on goals to authenticated`
 *      -> 1 rood: 'de groepsgenoot kan de gemiste weken niet uitrekenen'
 *   C  de `where owner_id = auth.uid()` uit `mijn_doelvelden`
 *      -> 1 rood: 'mijn_doelvelden geeft een ander niets'
 *   D  `alter view goal_dashboard set (security_invoker = false)`
 *      -> 1 rood: 'weekly_total telt per kijker en niet per doel'
 *   E  de hele tabelbrede `grant select on goals` terug
 *      -> 3 rood: de drie gevallen onder 'de belofte'
 *   F  `mijn_doelvelden` niet aan `authenticated` gunnen
 *      -> 2 rood, waaronder de must-allow 'de eigenaar leest zijn eigen antwoord'
 *
 * ⚠️⚠️ **Mutatie D was eerst niet rood te krijgen, en dat lag aan de test.** In
 *    mijn eerste versie stonden beide weekdoelen op `todo` — dan telt de
 *    groepsgenoot er evenveel als de eigenaar en is `weekly_total` gelijk,
 *    ongeacht of de view op invoker of definer staat. De assertie was triviaal
 *    waar en het geval bewaakte niets. `status` is niet client-schrijfbaar
 *    (0195), dus de verborgen week gaat nu via `adminDb()`. Vraag 3 van
 *    onwrikbare regel 18, en het antwoord kwam pas bij het draaien van de
 *    mutatie — niet bij het nadenken erover.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

let anna: TestUser;
let bram: TestUser;
let eve: TestUser;
let doelId: string;

/** De zin waar het om gaat. Herkenbaar terug te zoeken in elk antwoord. */
const ZIN = 'ZZ ik ben iemand die niet meer drinkt';

async function maakGroep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
  if (error) throw new Error(`groep: ${error.message}`);
  const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(data)}`);
  registreerGroep(g.group.id);
  return { id: g.group.id, code: g.group.invite_code };
}

/** Wat een kale `GET /goals?select=<kolom>` oplevert: de waarde, of de foutcode. */
async function leesKolom(lezer: TestUser, kolom: string): Promise<string> {
  const { data, error } = await lezer.db.from('goals').select(kolom).eq('id', doelId);
  if (error) return `geweigerd ${error.code}`;
  const rij = (data ?? [])[0] as Record<string, unknown> | undefined;
  return rij === undefined ? 'geen rij' : String(rij[kolom]);
}

describe.skipIf(!rlsTestsConfigured)('wat de groep van een doel te zien krijgt', () => {
  beforeAll(async () => {
    anna = await createTestUser('kolom-anna');
    bram = await createTestUser('kolom-bram');
    eve = await createTestUser('kolom-eve');

    const groep = await maakGroep(anna, 'Beschermd');
    const { error: mee } = await bram.db.rpc('join_group_with_code', { code: groep.code });
    if (mee) throw new Error(`meedoen: ${mee.message}`);

    const { data, error } = await anna.db
      .from('goals')
      .insert({
        owner_id: anna.id,
        title: 'ZZ doel van Anna',
        category: 'fitness',
        target_date: '2026-12-31',
        identity_statement: ZIN,
        available_hours_per_week: 4,
      })
      .select('id')
      .single();
    if (error) throw new Error(`doel: ${error.message}`);
    doelId = data.id;

    const { error: koppel } = await anna.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: groep.id });
    if (koppel) throw new Error(`koppelen: ${koppel.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('de belofte', () => {
    it(
      'de groepsgenoot leest de interviewantwoorden niet',
      async () => {
        expect(await leesKolom(bram, 'identity_statement'), ZIN).toBe('geweigerd 42501');
        expect(await leesKolom(bram, 'available_hours_per_week')).toBe('geweigerd 42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ `max_points` telt de weken mee die `weekly_goals_select` juist verbergt,
     *    dus `(max_points − som van de zichtbare points_ceiling) / 2` ís het
     *    aantal gemiste weken. Niet lezen kunnen is de enige reparatie: een
     *    getal dat over verborgen rijen rekent, kan niet half gedeeld worden.
     */
    it(
      'de groepsgenoot kan de gemiste weken niet uitrekenen',
      async () => {
        expect(await leesKolom(bram, 'max_points')).toBe('geweigerd 42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'en de twee kolommen zonder lezer gaan er ook niet uit',
      async () => {
        expect(await leesKolom(bram, 'beoordelaar_weggehaald_op')).toBe('geweigerd 42501');
        expect(await leesKolom(bram, 'losgekoppeld_op')).toBe('geweigerd 42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'mijn_doelvelden geeft een ander niets',
      async () => {
        const { data, error } = await bram.db.from('mijn_doelvelden').select('*').eq('id', doelId);
        expect(error).toBeNull();
        expect(data ?? [], 'de view gaf een rij van iemand anders terug').toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'en iemand buiten de groep ziet het doel al helemaal niet',
      async () => {
        const { data } = await eve.db.from('goals').select('id, title').eq('id', doelId);
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de must-allow: dit mag geen bijl zijn', () => {
    /**
     * ⚠️ Zonder dit geval haalt "alles afsluiten" élke test hierboven groen en
     *    is de koppelfeature stuk. Een groepsgenoot móet het doel zien — dat is
     *    waar koppelen voor bestaat.
     */
    it(
      'de groepsgenoot ziet het doel gewoon',
      async () => {
        const { data, error } = await bram.db
          .from('goals')
          .select('id, title, category, target_date, status')
          .eq('id', doelId)
          .single();

        expect(error).toBeNull();
        expect(data?.title).toBe('ZZ doel van Anna');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar leest zijn eigen antwoord onverkort',
      async () => {
        const { data, error } = await anna.db
          .from('mijn_doelvelden')
          .select('identity_statement, available_hours_per_week, max_points')
          .eq('id', doelId)
          .single();

        expect(error, 'de eigenaar kan zijn eigen velden niet meer lezen').toBeNull();
        expect(data?.identity_statement).toBe(ZIN);
        expect(data?.available_hours_per_week).toBe(4);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De keten, en niet de policy.** `maakDoel()` en `werkDoelBij()` doen
     *    een `insert`/`update` met een `select` erachter. Stond daar `*`, dan is
     *    dat sinds 0236 een `42501` op je eigen, net aangemaakte doel — en dat
     *    ziet TypeScript niet, want de gegenereerde typing kent geen grants.
     *    Dit geval loopt precies dat pad.
     */
    it(
      'de eigenaar kan een doel aanmaken en terugkrijgen',
      async () => {
        const { data, error } = await anna.db
          .from('goals')
          .insert({
            owner_id: anna.id,
            title: 'ZZ tweede doel',
            category: 'fitness',
            target_date: '2026-12-31',
            identity_statement: 'ZZ tweede zin',
          })
          .select('id, owner_id, title, description, category, target_date, status, created_at, updated_at, ritme')
          .single();

        expect(error, 'de kolomlijst van maakDoel() klopt niet meer met de grant').toBeNull();
        expect(data?.title).toBe('ZZ tweede doel');
      },
      TEST_TIMEOUT,
    );

    it(
      'en koppelbare_doelen doet het nog',
      async () => {
        const { error } = await anna.db.rpc('koppelbare_doelen', {
          p_group_id: '00000000-0000-0000-0000-000000000000',
        });
        expect(error, 'de functie hangt aan het rijtype van goal_dashboard').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de valstrik: weekly_total blijft per kijker tellen', () => {
    /**
     * ⚠️⚠️ **Dit is het geval dat een verkeerde reparatie afvangt.** Maskeren in
     *    `goal_dashboard` vraagt `security_invoker = false`, en dán telt
     *    `weekly_total` álle weekdoelen mee in plaats van alleen de zichtbare —
     *    een tweede exemplaar van hetzelfde lek, in een kolom waar niemand naar
     *    kijkt. De teller van de eigenaar en die van de groepsgenoot horen te
     *    verschillen.
     */
    it(
      'weekly_total telt per kijker en niet per doel',
      async () => {
        // ⚠️ Twee weken, waarvan er één verborgen moet zijn — anders telt Bram
        //    er evenveel als Anna en is de assertie hieronder triviaal waar.
        //    `status` is niet client-schrijfbaar (dat is 0195), dus de verborgen
        //    week gaat via service_role. Zónder deze stap bleef dit geval groen
        //    mét de fout erin: precies vraag 3 van onwrikbare regel 18.
        for (const [titel, status] of [
          ['ZZ week 1', 'missed'],
          ['ZZ week 2', 'todo'],
        ] as const) {
          const { error } = await adminDb()
            .from('weekly_goals')
            .insert({
              goal_id: doelId,
              title: titel,
              cycle_start_date: status === 'missed' ? '2026-08-03' : '2026-08-10',
              status,
            });
          if (error) throw new Error(`weekdoel ${titel}: ${error.message}`);
        }

        const vanAnna = await anna.db
          .from('goal_dashboard')
          .select('weekly_total')
          .eq('id', doelId)
          .single();
        const vanBram = await bram.db
          .from('goal_dashboard')
          .select('weekly_total')
          .eq('id', doelId)
          .single();

        expect(vanAnna.error).toBeNull();
        expect(vanBram.error).toBeNull();
        expect(vanAnna.data?.weekly_total, 'de eigenaar hoort beide weken te tellen').toBe(2);
        expect(
          vanBram.data?.weekly_total,
          'de groepsgenoot telt de verborgen week mee — goal_dashboard staat op definer',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );
  });
});
