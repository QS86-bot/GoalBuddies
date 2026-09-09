/**
 * De Lijst staat dicht — QS8-379, migratie 0215.
 *
 * ⚠️ **De belofte is niet "er staan vier policies".** Die is: *een taak van
 *    iemand anders is niet te lezen, niet te wijzigen en niet te verwijderen —
 *    ook niet met een kaal API-verzoek buiten de UI om — en `visibility` is voor
 *    geen enkele client te schrijven.* Dat laatste is de kolom die in QS8-381 het
 *    delen gaat dragen; hij hoort nú al bewaakt te zijn, want anders is hij tot
 *    dat besluit stil open (CLAUDE.md, domeinregel 7: voor élk nieuw oppervlak is
 *    beschermd het antwoord tot iemand het tegendeel besluit).
 *
 * ⚠️⚠️ **Twee grendels dragen `visibility`, en ze zijn apart geijkt.** De
 *    kolomgrant houdt tegen dat een client de kolom *noemt*; de conjunct
 *    `visibility = 'private'` in de policy houdt tegen dat hij ooit anders dan
 *    privé binnenkomt. Een test die de kolom op `'group'` zet, meet ze allebei
 *    tegelijk en dus geen van beide: hij blijft groen als er één wegvalt.
 *
 *    Daarom staan er twee soorten tests:
 *    * via PostgREST wordt de kolom genoemd met de waarde die er **al** staat
 *      (`'private'`). De policy laat dat toe, dus alleen de grant kan weigeren.
 *    * via `psql` krijgt `authenticated` de kolomgrant tijdelijk wél, in een
 *      transactie die terugrolt — dan is de policy de enige die nog kan
 *      weigeren. Dezelfde vorm als `groepspin.test.ts`.
 *
 * ⚠️⚠️ **Dezelfde vorm zit onder UPDATE en DELETE, en dat is een gerepareerde
 *    meting.** 📏 Bij het ijken bleven 'een groepsgenoot wijzigt andermans taak
 *    niet' en zijn DELETE-tweelingbroer groen bij *allebei* de mutaties: met
 *    `todo_items_update using (true)` én met `todo_items_select using (true)`.
 *    De reden staat in Postgres: een UPDATE of DELETE die kolommen leest — en
 *    dat doet elk PostgREST-verzoek, want dat draagt altijd een filter — krijgt
 *    óók de SELECT-policy over zich heen. De rij is dan al weg vóór de
 *    UPDATE-policy hem ziet.
 *
 *    Die twee tests bewaken dus de **uitkomst** (Bob verandert niets) en dragen
 *    twee sloten in één assertie — precies wat `groepspin.test.ts` één niveau
 *    dieper aanwijst. Ze blijven staan, want de uitkomst is de belofte. Maar de
 *    `using`-helft van de UPDATE- en DELETE-policy is er niet mee geijkt, en
 *    daarom staat daar een eigen paar tests onder, met de SELECT-policy in een
 *    terugrollende transactie tijdelijk wagenwijd open.
 *
 * ⚠️ **En het dagplafond en zijn rem zijn twee dingen.** Beide werpen `23514`,
 *    dus de foutcode alleen zegt niet welke sprak. De handhaver zegt "in één
 *    dag", de noodstop "in één verzoek"; op die woorden staat de assertie. Zakt
 *    de noodstop ooit tot onder het plafond, dan spreekt hij bij 201 rijen en
 *    wordt de plafondtest rood — dat is de naad die `bulkschrijf.test.ts` op
 *    `goals` bewaakt, hier op `todo_items`.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel, telkens
 * teruggezet. Elke mutatie maakte precies de test rood die ernaast staat:
 *
 *   A  `alter policy todo_items_select … using (true)`
 *      -> 'een groepsgenoot ziet er nul, ook met een kaal API-verzoek'
 *   B  `alter policy todo_items_insert … with check (visibility = 'private')`
 *      -> 'een groepsgenoot schrijft geen taak op andermans naam'
 *   C  `alter policy todo_items_update … using (true)`
 *      -> 'de UPDATE-policy filtert andermans rij weg, ook met SELECT wagenwijd open'
 *   D  `alter policy todo_items_delete … using (true)`
 *      -> 'de DELETE-policy filtert andermans rij weg, ook met SELECT wagenwijd open'
 *   E  `grant insert (visibility) on todo_items to authenticated`
 *      -> 'de client noemt visibility niet bij een INSERT'
 *   F  `grant update (visibility) on todo_items to authenticated`
 *      -> 'de client noemt visibility niet bij een PATCH'
 *   G  `alter policy todo_items_insert … with check (user_id = (select auth.uid()))`
 *      -> 'de INSERT-policy laat ook mét de kolomgrant niets anders dan privé toe'
 *   H  `alter policy todo_items_update … with check (user_id = (select auth.uid()))`
 *      -> 'de UPDATE-policy laat ook mét de kolomgrant niets anders dan privé toe'
 *   I  `grant insert (created_at) on todo_items to authenticated`
 *      -> 'de client zet created_at niet zelf — daar hangt het dagplafond aan'
 *   J  `drop trigger taken_dagplafond on todo_items`
 *      -> 'weigert 201 taken in één verzoek — plafond 200'
 *   K  `drop trigger taken_rem on todo_items`
 *      -> 'een verzoek ver boven het plafond loopt op de noodstop, niet op de handhaver'
 *   L  `if v_batch = 0 then return null; end if;` uit `begrens_taken()`
 *      -> 'een statement dat niets toevoegt breekt niet op het plafond'
 *
 * ⚠️ De must-allows staan er even hard in. Zonder die is "niemand kan iets met
 *    deze tabel" ook groen, en dan is de hele feature dood in plaats van dicht.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

/** Zoals in 0215. Staat hier als spiegel; de laatste tests toetsen het gedrag. */
const TAKEN_PLAFOND = 200;

/** Eén boven het plafond — de opvulling die de grendel van §4 moet voeden. */
const TAKEN_PLAFOND_PLUS = TAKEN_PLAFOND + 1;

let alice: TestUser;
let bob: TestUser;
let carla: TestUser;
/** Een taak van Alice waar Bob het hele bestand door op mag proberen. */
let aliceTaak: string;

/** Landde er iets, en zo nee met welke code? */
function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

async function taken(gebruiker: TestUser): Promise<number> {
  const { count, error } = await adminDb()
    .from('todo_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', gebruiker.id);
  if (error) throw new Error(`tellen: ${error.message}`);
  return count ?? 0;
}

async function taakVan(id: string): Promise<{ body: string; visibility: string } | null> {
  const { data } = await adminDb()
    .from('todo_items')
    .select('body, visibility')
    .eq('id', id)
    .maybeSingle();
  return data;
}

describe.skipIf(!rlsTestsConfigured)('De Lijst staat dicht', () => {
  beforeAll(async () => {
    alice = await createTestUser('lijst-alice');
    bob = await createTestUser('lijst-bob');
    // ⚠️ Carla is de must-allow van het dagplafond en heeft daarom een eigen
    //    venster. Het plafond telt per gebruiker: zou zij Alice zijn, dan faalt
    //    haar batch als *gevolg* van de test die hem juist moet tegenwegen —
    //    precies de gerepareerde ijking uit `dagplafond-batch.test.ts`.
    carla = await createTestUser('lijst-carla');

    // ⚠️ Bob is een échte groepsgenoot en niet zomaar een tweede account. Het
    //    acceptatiecriterium noemt de groepsgenoot met zoveel woorden: dat is de
    //    rol die in dit project bij élk ander oppervlak wél iets mag zien.
    const groep = await alice.db.rpc('create_group', { group_name: 'De Lijst' });
    if (groep.error) throw new Error(`groep: ${groep.error.message}`);
    const g = (groep.data ?? {}) as { ok?: boolean; group?: { invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: g.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    const taak = await alice.db
      .from('todo_items')
      .insert({ user_id: alice.id, body: 'Bellen met de tandarts', order_index: 0 })
      .select('id')
      .single();
    if (taak.error) throw new Error(`taak: ${taak.error.message}`);
    aliceTaak = taak.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('de must-allows — de lijst wérkt voor zijn eigenaar', () => {
    it(
      'de eigenaar leest, wijzigt en verwijdert zijn eigen taak',
      async () => {
        const gelezen = await alice.db.from('todo_items').select('id, body').eq('id', aliceTaak);
        expect(uitkomst(gelezen.error)).toBe('toegelaten');
        expect(gelezen.data?.map((r) => r.id)).toEqual([aliceTaak]);

        const gewijzigd = await alice.db
          .from('todo_items')
          .update({ body: 'Bellen met de tandarts, ochtend' })
          .eq('id', aliceTaak)
          .select('id');
        expect(uitkomst(gewijzigd.error)).toBe('toegelaten');
        expect(gewijzigd.data).toHaveLength(1);

        const wegwerp = await alice.db
          .from('todo_items')
          .insert({ user_id: alice.id, body: 'Weg te gooien' })
          .select('id')
          .single();
        expect(uitkomst(wegwerp.error)).toBe('toegelaten');

        const verwijderd = await alice.db
          .from('todo_items')
          .delete()
          .eq('id', wegwerp.data?.id ?? '')
          .select('id');
        expect(uitkomst(verwijderd.error)).toBe('toegelaten');
        expect(verwijderd.data).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een taak wordt privé geboren',
      async () => {
        const na = await taakVan(aliceTaak);
        expect(na?.visibility, 'de standaard hoort privé te zijn, niet group').toBe('private');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een groepsgenoot komt er niet bij', () => {
    it(
      'een groepsgenoot ziet er nul, ook met een kaal API-verzoek',
      async () => {
        // ⚠️ Twee verzoeken, want ze falen op verschillende manieren. Het eerste
        //    is wat een schil doet; het tweede is wat iemand met een token en
        //    curl doet — hij weet Alice' id en vraagt er expliciet naar.
        const alles = await bob.db.from('todo_items').select('id, body, user_id');
        expect(uitkomst(alles.error)).toBe('toegelaten');
        expect(
          alles.data?.filter((r) => r.user_id === alice.id),
          'de groepsgenoot leest een taak van Alice',
        ).toEqual([]);

        const gericht = await bob.db
          .from('todo_items')
          .select('id, body')
          .eq('user_id', alice.id);
        expect(uitkomst(gericht.error)).toBe('toegelaten');
        expect(gericht.data, 'een gericht verzoek op Alice haar id geeft rijen terug').toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot schrijft geen taak op andermans naam',
      async () => {
        const voor = await taken(alice);

        const { error } = await bob.db
          .from('todo_items')
          .insert({ user_id: alice.id, body: 'Van Bob, op naam van Alice' });

        expect(uitkomst(error)).toBe('geweigerd 42501');
        expect(await taken(alice), 'er is een taak op Alice haar naam geland').toBe(voor);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot wijzigt andermans taak niet',
      async () => {
        const voor = await taakVan(aliceTaak);

        const { data, error } = await bob.db
          .from('todo_items')
          .update({ body: 'Overgenomen door Bob' })
          .eq('id', aliceTaak)
          .select('id');

        // ⚠️ **Nul rijen én geen fout**, en dat is de stand die 0215 belooft: RLS
        //    filtert de rij weg vóór de UPDATE hem ziet.
        //
        // ⚠️⚠️ **Twee sloten in één assertie, en dat staat er bewust.** De
        //    SELECT-policy filtert de rij al weg — een UPDATE die kolommen leest
        //    krijgt die policy óók over zich heen — en de UPDATE-policy zou het
        //    daarna alsnog doen. Deze test bewaakt de uitkomst en is met geen van
        //    beide mutaties alléén rood te krijgen; de `using`-helft van de
        //    UPDATE-policy wordt verderop apart gemeten.
        expect(uitkomst(error)).toBe('toegelaten');
        expect(data, 'de PATCH raakte een rij van Alice').toEqual([]);
        expect((await taakVan(aliceTaak))?.body, 'de taak van Alice is gewijzigd').toBe(
          voor?.body,
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot verwijdert andermans taak niet',
      async () => {
        const { data, error } = await bob.db
          .from('todo_items')
          .delete()
          .eq('id', aliceTaak)
          .select('id');

        // ⚠️ Zelfde twee sloten als bij de UPDATE hierboven; ook hier is de
        //    uitkomst de belofte en staat de `using`-helft verderop apart.
        expect(uitkomst(error)).toBe('toegelaten');
        expect(data, 'de DELETE raakte een rij van Alice').toEqual([]);
        expect(await taakVan(aliceTaak), 'de taak van Alice is weg').not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('visibility is voor geen enkele client schrijfbaar — de kolomgrant', () => {
    /**
     * ⚠️ **De waarde is `'private'` en dat is het hele punt.** Die waarde staat
     *    er al en de policy laat hem toe, dus als deze INSERT tóch weigert, kan
     *    dat alleen de kolomgrant zijn. Met `'group'` zou de policy hem óók
     *    tegenhouden en meet deze test twee grendels tegelijk — en dus geen van
     *    beide (CLAUDE.md, regel 18: mutatie per grendel).
     */
    it(
      'de client noemt visibility niet bij een INSERT',
      async () => {
        const voor = await taken(alice);

        const { error } = await alice.db
          .from('todo_items')
          .insert({ user_id: alice.id, body: 'Met visibility erbij', visibility: 'private' });

        expect(uitkomst(error)).toBe('geweigerd 42501');
        expect(await taken(alice), 'de rij is alsnog geland').toBe(voor);
      },
      TEST_TIMEOUT,
    );

    it(
      'de client noemt visibility niet bij een PATCH',
      async () => {
        const { error } = await alice.db
          .from('todo_items')
          .update({ visibility: 'private' })
          .eq('id', aliceTaak);

        expect(uitkomst(error)).toBe('geweigerd 42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ `created_at` staat om dezelfde reden buiten de INSERT-grant, en hij
     *    draagt hier meer dan netheid: het dagplafond hieronder telt het laatste
     *    etmaal op deze kolom. Mag een client hem zetten, dan zet hij hem een dag
     *    terug en is de teller weg. 📏 Dat is gemeten op drie andere tabellen —
     *    QS8-295.
     */
    it(
      'de client zet created_at niet zelf — daar hangt het dagplafond aan',
      async () => {
        const voor = await taken(alice);

        const { error } = await alice.db.from('todo_items').insert({
          user_id: alice.id,
          body: 'Gisteren aangemaakt, zogenaamd',
          created_at: '2020-01-01T00:00:00.000Z',
        });

        expect(uitkomst(error)).toBe('geweigerd 42501');
        expect(await taken(alice), 'de rij is alsnog geland').toBe(voor);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('het dagplafond en zijn noodstop', () => {
    it(
      `weigert ${TAKEN_PLAFOND + 1} taken in één verzoek — plafond ${TAKEN_PLAFOND}`,
      async () => {
        const voor = await taken(alice);

        const rijen = Array.from({ length: TAKEN_PLAFOND + 1 }, (_, i) => ({
          user_id: alice.id,
          body: `bulk ${i}`,
          order_index: i,
        }));
        const { error } = await alice.db.from('todo_items').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        // ⚠️ **Wélke grendel sprak.** Beide werpen 23514. Zakt de noodstop ooit
        //    tot op of onder het plafond, dan gaat hij hier als eerste af, is de
        //    handhaver dode code en toont de app een andere melding — zonder dat
        //    er iets rood wordt. Dat is de naad die deze regel bewaakt.
        expect(error?.message, 'niet de handhaver maar de noodstop sprak').toContain('in één dag');
        expect(await taken(alice), 'er is een rij van de batch blijven staan').toBe(voor);
      },
      TEST_TIMEOUT,
    );

    it(
      `laat ${TAKEN_PLAFOND} taken in één verzoek gewoon door — de must-allow`,
      async () => {
        const rijen = Array.from({ length: TAKEN_PLAFOND }, (_, i) => ({
          user_id: carla.id,
          body: `net eronder ${i}`,
          order_index: i,
        }));
        const { error } = await carla.db.from('todo_items').insert(rijen);

        expect(uitkomst(error)).toBe('toegelaten');
        expect(await taken(carla)).toBe(TAKEN_PLAFOND);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ De noodstop staat op tweemaal het plafond en telt de rijen van dít
     *    verzoek. Duizend rijen loopt er dus op stuk bij rij 401, vóór er ook maar
     *    één rij naar schijf gaat — dat is de hele reden dat hij bestaat: een
     *    geweigerde bulk-insert schrijft eerst en draait daarna terug, en die
     *    ruimte komt pas terug bij een `vacuum full` (0200, gemeten op `goals`).
     */
    it(
      'een verzoek ver boven het plafond loopt op de noodstop, niet op de handhaver',
      async () => {
        const voor = await taken(alice);

        const rijen = Array.from({ length: TAKEN_PLAFOND * 5 }, (_, i) => ({
          user_id: alice.id,
          body: `noodstop ${i}`,
          order_index: i,
        }));
        const { error } = await alice.db.from('todo_items').insert(rijen);

        expect(uitkomst(error)).toBe('geweigerd 23514');
        expect(error?.message, 'de handhaver sprak, dus de noodstop staat er niet').toContain(
          'in één verzoek',
        );
        expect(await taken(alice)).toBe(voor);
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// De tweede grendel op `visibility` — alleen te meten mét de kolomgrant erbij
// ---------------------------------------------------------------------------

const stackErbij = stackBeschikbaarOfFaal(
  "select count(*) from pg_policies where tablename = 'todo_items' and policyname = 'todo_items_insert'",
  import.meta.url,
);

/**
 * Geeft `authenticated` tijdelijk het kolomrecht op `visibility`, laat hem de
 * schrijfactie doen en zegt of die landde. Rolt alles terug.
 *
 * ⚠️ **Zonder die grant toetst dit de grant en niet de policy** — groen om de
 *    verkeerde reden, precies zoals `groepspin.test.ts` beschrijft. De DO-blok
 *    eromheen is er omdat de weigering een fout is en psql daarop afbreekt; de
 *    uitslag komt daarom uit een sessie-instelling.
 */
function metKolomgrant(recht: 'insert' | 'update', schrijf: string): string {
  const uit = psql(`
    begin;
    create temp table t as select gen_random_uuid() uid, gen_random_uuid() tid;
    grant select on t to authenticated;
    insert into auth.users (id, email) select uid, 'lijst-grendel@x.nl' from t;
    insert into todo_items (id, user_id, body) select tid, uid, 'staat er al' from t;

    -- Het recht dat een client vandaag niet heeft. Zonder deze regel weigert de
    -- grant en komt de policy er niet aan te pas.
    grant ${recht} (visibility) on todo_items to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true) from t;

    do $proef$
    declare v_uid uuid; v_tid uuid;
    begin
      select uid, tid into v_uid, v_tid from t;
      set local role authenticated;
      ${schrijf}
      reset role;
      perform set_config('proef.uitslag', 'GELAND', true);
    exception when others then
      reset role;
      perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
    end $proef$;

    select current_setting('proef.uitslag');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  return uit.trim();
}

/**
 * Zet de SELECT-policy tijdelijk wagenwijd open, laat een indringer de
 * schrijfactie doen en zegt wat eruit kwam. Rolt alles terug.
 *
 * ⚠️ **Zonder die opengezette SELECT-policy meet dit de verkeerde grendel.**
 *    Postgres past SELECT-policies óók toe op een UPDATE of DELETE die kolommen
 *    leest, en elk PostgREST-verzoek draagt een filter. De rij is dan al weg
 *    vóór de UPDATE- of DELETE-policy hem ziet, en die blijft ongemeten.
 *
 * `GERAAKT n` telt de rijen die de schrijfactie te pakken kreeg; `GEWEIGERD
 * <sqlstate>` betekent dat er een fout kwam in plaats van een filtering.
 */
function metOpenSelect(schrijf: string): string {
  const uit = psql(`
    begin;
    create temp table t as
      select gen_random_uuid() eig, gen_random_uuid() ind, gen_random_uuid() tid;
    grant select on t to authenticated;
    insert into auth.users (id, email) select eig, 'lijst-eigenaar@x.nl' from t;
    insert into auth.users (id, email) select ind, 'lijst-indringer@x.nl' from t;
    insert into todo_items (id, user_id, body) select tid, eig, 'van de eigenaar' from t;

    -- De eerste grendel tijdelijk weg. Zonder deze regel toetst dit de
    -- SELECT-policy en niet de policy waar de test over gaat.
    alter policy todo_items_select on todo_items using (true);

    select set_config('request.jwt.claims',
      json_build_object('sub', ind, 'role', 'authenticated')::text, true) from t;

    do $proef$
    declare v_tid uuid; v_n integer;
    begin
      select tid into v_tid from t;
      set local role authenticated;
      ${schrijf}
      get diagnostics v_n = row_count;
      reset role;
      perform set_config('proef.uitslag', 'GERAAKT ' || v_n, true);
    exception when others then
      reset role;
      perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
    end $proef$;

    select current_setting('proef.uitslag');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  return uit.trim();
}

/**
 * Zet een gebruiker boven zijn dagplafond, geeft `authenticated` tijdelijk het
 * kolomrecht op `id`, en laat hem een `on conflict do nothing` doen die volledig
 * op de conflicttak landt. Rolt alles terug.
 *
 * ⚠️ **Zonder die grant is dit pad niet te bereiken**, en dat is precies waarom
 *    de grendel erin zit: `todo_items` heeft één unieke sleutel en `id` staat
 *    niet in de INSERT-kolomgrant, dus een client kán vandaag geen conflict
 *    maken. De regel staat er omdat een níeuwe tabel geen bekend defect hoort te
 *    kopiëren (QS8-369, 0214) — en een grendel die je niet kunt voeden, kun je
 *    niet ijken. Deze opstelling voedt hem.
 */
function metLegeToevoeging(): string {
  const uit = psql(`
    begin;
    create temp table t as select gen_random_uuid() uid, gen_random_uuid() tid;
    grant select on t to authenticated;
    insert into auth.users (id, email) select uid, 'lijst-legebatch@x.nl' from t;

    -- Boven het plafond gezet door een bevoorrechte schrijver: \`auth.uid()\` is
    -- hier null, dus de teller en de rem nemen allebei hun vroege uitgang.
    insert into todo_items (user_id, body)
      select uid, 'opvulling ' || g from t, generate_series(1, ${TAKEN_PLAFOND_PLUS}) g;
    insert into todo_items (id, user_id, body) select tid, uid, 'bestaat al' from t;

    grant insert (id) on todo_items to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text, true) from t;

    do $proef$
    declare v_uid uuid; v_tid uuid;
    begin
      select uid, tid into v_uid, v_tid from t;
      set local role authenticated;
      insert into todo_items (id, user_id, body) values (v_tid, v_uid, 'nog een keer')
        on conflict (id) do nothing;
      reset role;
      perform set_config('proef.uitslag', 'GELAND', true);
    exception when others then
      reset role;
      perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
    end $proef$;

    select current_setting('proef.uitslag');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  return uit.trim();
}

describe.skipIf(!stackErbij)('een statement zonder toevoeging telt niet mee', () => {
  /**
   * ⚠️ **De must-allow van het dagplafond, en op `push_tokens` was hij het
   *    defect.** 📏 Daar viel élke herregistratie om zodra een gebruiker boven
   *    zijn plafond stond, met `(0 erbij, 21 in het laatste etmaal)` als
   *    diagnose in de melding zelf — de transitietabel wás leeg en de teller
   *    telde de tabel. Zie de rij van 09-09 in `docs/ENGINEER-REVIEW.md`.
   */
  it('een statement dat niets toevoegt breekt niet op het plafond', () => {
    expect(
      metLegeToevoeging(),
      'de gebruiker staat boven zijn plafond en dit verzoek schreef nul rijen; ' +
        'dan hoort er geen 23514 te komen',
    ).toBe('GELAND');
  }, 60_000);
});

describe.skipIf(!stackErbij)('de using-helft van UPDATE en DELETE, apart gemeten', () => {
  it(
    'de UPDATE-policy filtert andermans rij weg, ook met SELECT wagenwijd open',
    () => {
      const uitslag = metOpenSelect(
        `update todo_items set body = 'overgenomen' where id = v_tid;`,
      );

      expect(
        uitslag,
        'met SELECT open is `todo_items_update using (…)` de enige grendel die ' +
          'er nog staat; hij hoort de rij weg te filteren',
      ).toBe('GERAAKT 0');
    },
    60_000,
  );

  it(
    'de DELETE-policy filtert andermans rij weg, ook met SELECT wagenwijd open',
    () => {
      const uitslag = metOpenSelect(`delete from todo_items where id = v_tid;`);

      expect(uitslag).toBe('GERAAKT 0');
    },
    60_000,
  );

  /**
   * ⚠️ **De must-allow, en hij is hier niet vanzelfsprekend.** Zou de
   *    `using`-helft zó geschreven zijn dat hij álles wegfiltert, dan zijn de twee
   *    tests hierboven groen terwijl niemand zijn eigen taak nog kan wijzigen.
   *    Deze regel laat de eigenaar zélf schrijven, in dezelfde opstelling.
   */
  it(
    'en de eigenaar wijzigt zijn eigen taak gewoon',
    () => {
      const uit = psql(`
        begin;
        create temp table t as select gen_random_uuid() eig, gen_random_uuid() tid;
        grant select on t to authenticated;
        insert into auth.users (id, email) select eig, 'lijst-eigenaar2@x.nl' from t;
        insert into todo_items (id, user_id, body) select tid, eig, 'van de eigenaar' from t;
        alter policy todo_items_select on todo_items using (true);
        select set_config('request.jwt.claims',
          json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
        do $proef$
        declare v_tid uuid; v_n integer;
        begin
          select tid into v_tid from t;
          set local role authenticated;
          update todo_items set body = 'zelf gewijzigd' where id = v_tid;
          get diagnostics v_n = row_count;
          reset role;
          perform set_config('proef.uitslag', 'GERAAKT ' || v_n, true);
        exception when others then
          reset role;
          perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
        end $proef$;
        select current_setting('proef.uitslag');
        rollback;
      `)
        .split('\n')
        .filter((r) => r.trim() !== '')
        .at(-1) as string;

      expect(uit.trim()).toBe('GERAAKT 1');
    },
    60_000,
  );
});

describe.skipIf(!stackErbij)('visibility is voor geen enkele client schrijfbaar — de policy', () => {
  it(
    'de INSERT-policy laat ook mét de kolomgrant niets anders dan privé toe',
    () => {
      const uitslag = metKolomgrant(
        'insert',
        `insert into todo_items (user_id, body, visibility)
           values (v_uid, 'open bedoeld', 'group');`,
      );

      expect(
        uitslag,
        'met de kolomgrant erbij is de conjunct `visibility = \'private\'` de enige ' +
          'grendel die er nog staat — en die hoort te weigeren',
      ).toBe('GEWEIGERD 42501');
    },
    60_000,
  );

  it(
    'de UPDATE-policy laat ook mét de kolomgrant niets anders dan privé toe',
    () => {
      const uitslag = metKolomgrant(
        'update',
        `update todo_items set visibility = 'group' where id = v_tid;`,
      );

      expect(uitslag).toBe('GEWEIGERD 42501');
    },
    60_000,
  );

  /**
   * ⚠️ **De must-allow van deze twee, en hij weegt zwaar.** Zou de conjunct
   *    zó geschreven zijn dat hij álles weigert, dan zijn de tests hierboven
   *    groen terwijl niemand nog een taak kan aanmaken. Deze regel zegt dat de
   *    policy alleen de wáárde tegenhoudt en niet de handeling.
   */
  it(
    'en laat privé gewoon door, ook als de kolom genoemd wordt',
    () => {
      const uitslag = metKolomgrant(
        'insert',
        `insert into todo_items (user_id, body, visibility)
           values (v_uid, 'gewoon privé', 'private');`,
      );

      expect(uitslag).toBe('GELAND');
    },
    60_000,
  );
});
