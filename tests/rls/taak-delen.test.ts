import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een taak deel je per stuk, en met één gekozen groep — QS8-381, migratie 0220.
 *
 * ⚠️⚠️ **Dit bestand toetst de kéten en niet de policy.** 📏 Bij `daily_moves`
 *    staat de fout waar dit issue voor waarschuwt: de SELECT-policy eist
 *    `weekly_goal_id is not null`, en het enige scherm dat een Dagzet aanmaakt
 *    stuurt `weekly_goal_id: null` hardgecodeerd mee. Delen werkt daar dus niet,
 *    en er wordt niets rood van — elk schakeltje af, de keten onderbroken
 *    (onwrikbare regel 18, vraag 5). Daarom deelt Alice hieronder via de échte
 *    RPC en leest Bob via een écht PostgREST-verzoek.
 *
 * ⚠️ **De must-deny weegt hier even zwaar als de must-allow**, en er zijn er
 *    twee van: iemand buiten de groep ziet niets, én een groepsgenoot uit een
 *    ánder gezelschap van dezelfde eigenaar ziet niets. Die tweede is het hele
 *    punt van variant B2: "openbaar voor je groep" is één groep en niet
 *    iedereen met wie je er een deelt. CLAUDE.md, domeinregel 7: *zit er een
 *    leidinggevende in de groep, dan beschermt de regel niet tegen schaamte maar
 *    tegen een beoordelingsgesprek.*
 *
 * ⚠️⚠️ **Twee conjuncten in `todo_items_select` zijn overbodig, en dat is
 *    gemeten en niet aangenomen.** De policy eist drie dingen:
 *    `visibility = 'group'`, `shared_group_id is not null` en
 *    `mag_groep_lezen(shared_group_id)`. 📏 De eerste twee zijn los weggehaald en
 *    daarmee bleef élke test groen. Dat is geen slechte test maar een echte
 *    redundantie, en ze heeft per conjunct een aanwijsbare oorzaak:
 *
 *    * `visibility = 'group'` volgt uit de CHECK `todo_items_groep_hoort_bij_gedeeld`:
 *      een rij mag geen groep dragen zonder gedeeld te zijn, dus
 *      `shared_group_id is not null` impliceert hem.
 *    * `shared_group_id is not null` volgt uit `mag_groep_lezen(null)`, dat
 *      `false` geeft — de EXISTS matcht nooit op een lege groep. En sinds de
 *      CHECK een biconditionaal is, volgt hij ook daaruit: `('group', null)` is
 *      geen stand meer die je kunt opslaan.
 *
 *    **Ze blijven staan, want ze zeggen wat de policy bedoelt en ze worden
 *    dragend zodra een van die twee oorzaken wegvalt.** Wat er dan wél getoetst
 *    hoort te worden, is de oorzaak zelf: mutatie A en B hieronder breken de
 *    CHECK en de helper, en niet de conjunct die erop leunt. Dat is regel 18 in
 *    zijn scherpste vorm — breek de grendel die de ijking nóemt.
 *
 * IJKING — met de hand gedraaid op 09-09-2026, één mutatie per grendel:
 *
 *   A  de CHECK `todo_items_groep_hoort_bij_gedeeld` droppen
 *      -> 'een taak kan geen groep dragen zonder gedeeld te zijn'
 *   B  `mag_groep_lezen()` een lege groep laten toestaan
 *      -> 'mag_groep_lezen zegt nee tegen een lege groep'
 *   C  `mag_groep_lezen(shared_group_id)` -> `true` in `todo_items_select`
 *      -> 'de andere groep van dezelfde eigenaar ziet niets'
 *   D  `v_mag_delen` in `pin_taak()` op `true`
 *      -> 'de pin laat ook mét de kolomgrant niets door'
 *   E  de lidmaatschapstoets uit `zet_taakzichtbaarheid()`
 *      -> 'delen met een groep waar je niet in zit, kan niet'
 *   F  `not_found` splitsen in `not_found` en `not_owner`
 *      -> 'andermans taak geeft hetzelfde antwoord als een taak die niet bestaat'
 *   G  de sessiesleutel op een vlag in plaats van het taak-id
 *      -> 'de sleutel laat precies een rij door en niet alle rijen'
 *   H  de `case` op `p_group_id is null` omdraaien
 *      -> 'terugzetten op prive haalt hem weer weg bij de groep'
 *   I  de wis-uitzondering uit `pin_taak()` (weer onvoorwaardelijk pinnen)
 *      -> 'een groep verwijderen lukt, en de taak valt terug op prive'
 *   J  de trigger `group_members_taken_sluiten` droppen
 *      -> 'wie zelf vertrekt, deelt niet door' én 'en wie eruit gezet wordt ook niet'
 *   K  `sluit_gedeelde_taken()` de `user_id`-voorwaarde afnemen
 *      -> 'en de taken van wie blijft, blijven staan'
 *   L  `v_sluit` in `pin_taak()` op `false`
 *      -> 'dichtdoen mag zonder sleutel, en dat is wat het vertrek gebruikt'
 *   M  de normalisatie uit `pin_taak()` (de `shared_group_id is null`-tak)
 *      -> 'een groep verwijderen lukt, en de taak valt terug op prive'
 *   N  de CHECK terug naar zijn halve vorm
 *      -> 'een taak kan niet gedeeld heten zonder groep'
 *   O  de normalisatie terug naar zijn brede vorm (`if new.shared_group_id is null`)
 *      -> 'een halve deel-actie valt op de CHECK en niet op een stille terugzetting'
 *
 * ⚠️ **J en K zijn twee mutaties op één trigger, en dat is geen dubbeling.**
 *    De eerste toetst dat hij vuurt, de tweede dat hij niet te breed vuurt. Een
 *    trigger die álles sluit haalt J groen en breekt de feature — mutatie per
 *    grendel, en een grendel heeft twee kanten.
 *
 * ⚠️ **D is opnieuw geijkt, en hij dekt nu vijf asserties in plaats van één.**
 *    Sinds de biconditionaal geven de CHECK en de `raise` in `pin_taak()`
 *    allebei `23514`, en één van de nieuwe tests bleef daardoor groen met een
 *    volledig kapotte pin. De meting staat bij `metKolomgrant()`.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 240_000;

let alice: TestUser;
let bob: TestUser;
let carla: TestUser;
/** De groep waarin Alice en Bob zitten. */
let samen: string;
/** Een tweede groep van Alice, met Carla erin. Bob hoort daar niet. */
let apart: string;
let gedeeld: string;
let prive: string;

function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

/** Wat de RPC teruggaf, als `ok` of als reden. */
function antwoord(data: unknown): string {
  const gelezen = (data ?? {}) as { ok?: boolean; reason?: string };
  return gelezen.ok === true ? 'ok' : (gelezen.reason ?? 'geen antwoord');
}

async function maakGroep(eigenaar: TestUser, naam: string): Promise<{ id: string; code: string }> {
  const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
  if (error) throw new Error(`groep ${naam}: ${error.message}`);
  const g = (data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (g.ok !== true || !g.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);

  // ⚠️ Zonder deze regel vindt het opruimen de groep alleen via de
  //    lidmaatschappen van de gebruikers die het verwijdert, en dan blijft er
  //    een lege groep achter. `removeTestUsers()` wordt daar rood van.
  registreerGroep(g.group.id);
  return { id: g.group.id, code: g.group.invite_code };
}

async function doeMee(lid: TestUser, code: string): Promise<void> {
  const { data, error } = await lid.db.rpc('join_group_with_code', { code });
  if (error) throw new Error(`meedoen: ${error.message}`);
  if ((data as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`meedoen: ${JSON.stringify(data)}`);
  }
}

async function taak(eigenaar: TestUser, tekst: string): Promise<string> {
  const { data, error } = await eigenaar.db
    .from('todo_items')
    .insert({ user_id: eigenaar.id, body: tekst })
    .select('id')
    .single();
  if (error) throw new Error(`taak: ${error.message}`);
  return data.id;
}

/** Wat `lezer` van de taken van `eigenaar` ziet, met een kaal API-verzoek. */
async function zichtbaarVoor(lezer: TestUser, eigenaar: TestUser): Promise<readonly string[]> {
  const { data, error } = await lezer.db
    .from('todo_items')
    .select('id, body')
    .eq('user_id', eigenaar.id);
  if (error) throw new Error(`lezen: ${error.message}`);
  return (data ?? []).map((r) => r.body);
}

describe.skipIf(!rlsTestsConfigured)('een taak deel je per stuk', () => {
  beforeAll(async () => {
    alice = await createTestUser('delen-alice');
    bob = await createTestUser('delen-bob');
    carla = await createTestUser('delen-carla');

    const een = await maakGroep(alice, 'Samen');
    samen = een.id;
    await doeMee(bob, een.code);

    // ⚠️ De tweede groep is de hele reden dat variant B2 gekozen is: Alice zit
    //    in twee gezelschappen, en delen met het ene hoort het andere niets te
    //    laten zien.
    const twee = await maakGroep(alice, 'Apart');
    apart = twee.id;
    await doeMee(carla, twee.code);

    gedeeld = await taak(alice, 'Deze deel ik');
    prive = await taak(alice, 'Deze houd ik voor mij');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  describe('de keten: delen, lezen, terugzetten', () => {
    it(
      'een gedeelde taak bereikt de groepsgenoot, met een echt verzoek',
      async () => {
        const gezet = await alice.db.rpc('zet_taakzichtbaarheid', {
          p_taak: gedeeld,
          p_group_id: samen,
        });
        expect(uitkomst(gezet.error)).toBe('toegelaten');
        expect(antwoord(gezet.data)).toBe('ok');

        expect(
          await zichtbaarVoor(bob, alice),
          'de keten is onderbroken: de policy staat er, maar Bob ziet niets',
        ).toEqual(['Deze deel ik']);
      },
      TEST_TIMEOUT,
    );

    it(
      'een prive taak blijft prive voor een groepsgenoot',
      async () => {
        const gezien = await zichtbaarVoor(bob, alice);

        expect(gezien, 'Bob ziet een taak die Alice niet gedeeld heeft').not.toContain(
          'Deze houd ik voor mij',
        );
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De must-deny van variant B2.** Carla deelt een groep met Alice — een
     *    ándere. Zou "openbaar" iedereen bereiken met wie je een groep deelt
     *    (variant B1), dan stond deze taak nu op haar scherm.
     */
    it(
      'de andere groep van dezelfde eigenaar ziet niets',
      async () => {
        expect(await zichtbaarVoor(carla, alice)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'terugzetten op prive haalt hem weer weg bij de groep',
      async () => {
        const terug = await alice.db.rpc('zet_taakzichtbaarheid', {
          p_taak: gedeeld,
          p_group_id: null,
        });
        expect(antwoord(terug.data)).toBe('ok');

        expect(
          await zichtbaarVoor(bob, alice),
          'delen is eenrichtingsverkeer geworden, en dat is de val van 0197',
        ).toEqual([]);

        // en weer terug, zodat de volgende tests van een gedeelde taak uitgaan
        await alice.db.rpc('zet_taakzichtbaarheid', { p_taak: gedeeld, p_group_id: samen });
      },
      TEST_TIMEOUT,
    );

    it(
      'MUST-ALLOW: de eigenaar ziet zijn eigen taken allebei, gedeeld of niet',
      async () => {
        const eigen = await zichtbaarVoor(alice, alice);

        expect([...eigen].sort()).toEqual(['Deze deel ik', 'Deze houd ik voor mij']);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  /**
   * ⚠️⚠️ **De naad waar de review op wees, en die er niet was.** Een gedeelde
   *    taak leunt op het lidmaatschap van zijn eigenaar; eindigt dat, dan hoort
   *    het delen mee te eindigen. 📏 Gemeten vóór de reparatie:
   *    `verwijder_lid()` gaf `{"ok": true}`, het lidmaatschap werd `inactive`,
   *    en de beheerder las de taak van het ex-lid daarna gewoon terug.
   *
   *    Elk onderdeel klopte: de RPC deed wat hij belooft, de policy deed wat hij
   *    belooft, en de suite bleef groen. Onwrikbare regel 18 vraag 1 in zijn
   *    letterlijke vorm — twee correcte onderdelen die aan elkaar geknoopt zijn
   *    zonder dat er iets op de knoop staat.
   *
   * ⚠️ **Beide routes, want ze eindigen verschillend.** `verlaat_groep()`
   *    verwijdert de `group_members`-rij, `verwijder_lid()` zet hem op
   *    `inactive`. Eén test op één van de twee bewaakt de helft.
   */
  describe('het lidmaatschap eindigt, en het delen eindigt mee', () => {
    it(
      'wie zelf vertrekt, deelt niet door',
      async () => {
        const groep = await maakGroep(alice, 'Vertrek');
        await doeMee(bob, groep.code);

        const mijn = await taak(bob, 'ZZ taak van Bob');
        await bob.db.rpc('zet_taakzichtbaarheid', { p_taak: mijn, p_group_id: groep.id });
        expect(await zichtbaarVoor(alice, bob), 'de opstelling deelt niets').toContain(
          'ZZ taak van Bob',
        );

        const { data } = await bob.db.rpc('verlaat_groep', {
          p_group_id: groep.id,
          p_bevestigd: true,
        });
        expect(antwoord(data)).toBe('ok');

        expect(
          await zichtbaarVoor(alice, bob),
          'de groep leest nog door bij iemand die er niet meer in zit',
        ).not.toContain('ZZ taak van Bob');
      },
      TEST_TIMEOUT,
    );

    it(
      'en wie eruit gezet wordt ook niet',
      async () => {
        const groep = await maakGroep(alice, 'Uitzetten');
        await doeMee(carla, groep.code);

        const hare = await taak(carla, 'ZZ taak van Carla');
        await carla.db.rpc('zet_taakzichtbaarheid', { p_taak: hare, p_group_id: groep.id });
        expect(await zichtbaarVoor(alice, carla), 'de opstelling deelt niets').toContain(
          'ZZ taak van Carla',
        );

        const { data } = await alice.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: carla.id,
          p_bevestigd: true,
        });
        expect(antwoord(data)).toBe('ok');

        expect(
          await zichtbaarVoor(alice, carla),
          'de beheerder leest de taak van het ex-lid nog',
        ).not.toContain('ZZ taak van Carla');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De must-allow ernaast, en zonder deze is de grendel hierboven een
     *    bijl.** Een trigger die *alle* gedeelde taken sluit zodra er ergens een
     *    lidmaatschap eindigt, haalt élke test hierboven groen en breekt de
     *    feature. Deze regel zegt dat alleen de vertrekker geraakt wordt.
     */
    it(
      'en de taken van wie blijft, blijven staan',
      async () => {
        const groep = await maakGroep(alice, 'Blijven');
        await doeMee(bob, groep.code);
        await doeMee(carla, groep.code);

        const vanBob = await taak(bob, 'ZZ Bob blijft');
        await bob.db.rpc('zet_taakzichtbaarheid', { p_taak: vanBob, p_group_id: groep.id });

        const { data } = await alice.db.rpc('verwijder_lid', {
          p_group_id: groep.id,
          p_user_id: carla.id,
          p_bevestigd: true,
        });
        expect(antwoord(data)).toBe('ok');

        expect(
          await zichtbaarVoor(alice, bob),
          'het vertrek van een ander sloot de taak van Bob',
        ).toContain('ZZ Bob blijft');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **En het ex-lid houdt zijn eigen taak**, met de tekst erin. Sluiten is
     *    de zichtbaarheid terugzetten en niet de rij opruimen — domeinregel 6 in
     *    de geest: een taak is van de gebruiker, en een lidmaatschap dat eindigt
     *    is geen reden om zijn lijst te knippen.
     */
    it(
      'het ex-lid houdt de taak zelf, en ziet hem als prive',
      async () => {
        const groep = await maakGroep(alice, 'Houden');
        await doeMee(bob, groep.code);

        const mijn = await taak(bob, 'ZZ blijft van Bob');
        await bob.db.rpc('zet_taakzichtbaarheid', { p_taak: mijn, p_group_id: groep.id });
        await bob.db.rpc('verlaat_groep', { p_group_id: groep.id, p_bevestigd: true });

        const { data, error } = await bob.db
          .from('todo_items')
          .select('body, visibility, shared_group_id')
          .eq('id', mijn)
          .single();

        expect(error, 'het ex-lid raakte zijn eigen taak kwijt').toBeNull();
        expect(data?.body).toBe('ZZ blijft van Bob');
        expect(data?.visibility).toBe('private');
        expect(data?.shared_group_id).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de RPC is het enige schrijfpad', () => {
    it(
      'de client schrijft visibility en shared_group_id niet met een kale PATCH',
      async () => {
        const zicht = await alice.db
          .from('todo_items')
          .update({ visibility: 'group' })
          .eq('id', prive);
        expect(uitkomst(zicht.error)).toBe('geweigerd 42501');

        const groep = await alice.db
          .from('todo_items')
          .update({ shared_group_id: samen })
          .eq('id', prive);
        expect(uitkomst(groep.error)).toBe('geweigerd 42501');

        const na = await adminDb()
          .from('todo_items')
          .select('visibility, shared_group_id')
          .eq('id', prive)
          .single();
        expect(na.data?.visibility).toBe('private');
        expect(na.data?.shared_group_id).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'delen met een groep waar je niet in zit, kan niet',
      async () => {
        // Bob is geen lid van `apart`; Alice wel, maar dat helpt hem niet.
        const bobsTaak = await taak(bob, 'Van Bob');
        const uit = await bob.db.rpc('zet_taakzichtbaarheid', {
          p_taak: bobsTaak,
          p_group_id: apart,
        });

        expect(antwoord(uit.data)).toBe('geen_groepsgenoot');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **Geen bestaansorakel.** Twee verschillende antwoorden zouden van een
     *    willekeurige uuid aflezen óf er een taak achter zit. Dezelfde vorm die
     *    `blokkeer()` en `vraag_lidmaatschap_aan()` aanhouden, en de klasse die
     *    de security-review op QS8-369 in `registreer_push_token()` vond.
     */
    it(
      'andermans taak geeft hetzelfde antwoord als een taak die niet bestaat',
      async () => {
        const vanAlice = await bob.db.rpc('zet_taakzichtbaarheid', {
          p_taak: prive,
          p_group_id: samen,
        });
        const verzonnen = await bob.db.rpc('zet_taakzichtbaarheid', {
          p_taak: '00000000-0000-4000-8000-000000000000',
          p_group_id: samen,
        });

        expect(antwoord(vanAlice)).toBe(antwoord(verzonnen));
        expect(antwoord(vanAlice.data)).toBe('not_found');
        expect(antwoord(verzonnen.data)).toBe('not_found');
      },
      TEST_TIMEOUT,
    );
  });
});

// ---------------------------------------------------------------------------
// De pin en de sessiesleutel — alleen te meten mét de kolomgrant erbij
// ---------------------------------------------------------------------------

const stackErbij = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'zet_taakzichtbaarheid'",
  import.meta.url,
);

/**
 * Geeft `authenticated` tijdelijk het kolomrecht, laat hem schrijven en zegt wat
 * eruit kwam. Rolt alles terug.
 *
 * ⚠️ **Zonder die grant meet dit de grant en niet de pin** — groen om de
 *    verkeerde reden, precies zoals `groepspin.test.ts` beschrijft.
 *
 * ⚠️⚠️ **De melding gaat mee in de uitslag, want `sqlstate` alleen zegt niet
 *    meer wie geweigerd heeft.** De CHECK `todo_items_groep_hoort_bij_gedeeld`
 *    en de `raise` in `pin_taak()` geven allebei `23514`. 📏 Gemeten met
 *    `v_mag_delen := true` (mutatie D) op *half dichtdoen*, de schrijfactie
 *    `set visibility = 'private'` op een gedeelde taak:
 *
 *      GEWEIGERD 23514 new row for relation "todo_items" violates check
 *      constraint "todo_items_groep_hoort_bij_gedeeld"
 *
 *    Met alleen `sqlstate` was dat `GEWEIGERD 23514` — precies wat de assertie
 *    verwacht, en dus **groen met een volledig kapotte pin**. De CHECK deed het
 *    werk en de test schreef het aan de pin toe. Met `sqlerrm` erbij noemt de
 *    assertie de melding van de pin, en die is van niemand anders.
 *
 * ⚠️ **En de opstelling draagt een échte groep, om een tweede reden.** De oude
 *    schrijfactie was `set visibility = 'group'` zónder groep erbij, en die
 *    stand bestaat niet meer. 📏 Onder mutatie D gaf hij `GERAAKT 1`: de
 *    normalisatie in `pin_taak()` draaide hem stil terug naar `private`. De test
 *    werd daar wél rood van, maar op de normalisatie en niet op de pin — hij kón
 *    de stand die hij beweerde te toetsen niet meer bereiken. `v_grp` maakt de
 *    schrijfactie er een die de CHECK tevreden stelt, zodat alleen de pin er nog
 *    tussen staat.
 */
function metKolomgrant(schrijf: string): string {
  const uit = psql(`
    begin;
    create temp table t as select gen_random_uuid() eig, gen_random_uuid() tid,
                                 gen_random_uuid() t2, gen_random_uuid() grp;
    grant select on t to authenticated;
    insert into auth.users (id, email) select eig, 'delen-pin@x.nl' from t;
    insert into groups (id, name, created_by, status, invite_code)
      select grp, 'Pin', eig, 'active', 'PINCODE1' from t;
    insert into group_members (group_id, user_id, role, status)
      select grp, eig, 'admin', 'active' from t;
    insert into todo_items (id, user_id, body) select tid, eig, 'eerste' from t;
    insert into todo_items (id, user_id, body) select t2, eig, 'tweede' from t;

    grant update (visibility, shared_group_id) on todo_items to authenticated;

    select set_config('request.jwt.claims',
      json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;

    do $proef$
    declare v_tid uuid; v_t2 uuid; v_grp uuid; v_n integer;
    begin
      select tid, t2, grp into v_tid, v_t2, v_grp from t;
      set local role authenticated;
      ${schrijf}
      get diagnostics v_n = row_count;
      reset role;
      perform set_config('proef.uitslag', 'GERAAKT ' || v_n, true);
    exception when others then
      reset role;
      perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate || ' ' || sqlerrm, true);
    end $proef$;

    select current_setting('proef.uitslag');
    rollback;
  `)
    .split('\n')
    .filter((r) => r.trim() !== '')
    .at(-1) as string;

  return uit.trim();
}

/** Wat `pin_taak()` zegt als hij weigert — en niemand anders zegt dat. */
const PIN_WEIGERT = 'GEWEIGERD 23514 De zichtbaarheid en de herkomst van een taak liggen vast';

describe.skipIf(!stackErbij)('waar de policy op leunt', () => {
  /**
   * ⚠️ **Dit is de oorzaak onder de conjunct `visibility = 'group'`.** Zolang
   *    deze CHECK er staat, impliceert een gezette groep dat de taak gedeeld is
   *    en is die conjunct overbodig. Valt hij weg, dan wordt de conjunct
   *    dragend — en dan hoort iemand daarnaar te kijken in plaats van hem
   *    stilzwijgend te laten dragen.
   */
  it('een taak kan geen groep dragen zonder gedeeld te zijn', () => {
    const uit = psql(`
      begin;
      create temp table t as select gen_random_uuid() eig, gen_random_uuid() grp;
      insert into auth.users (id, email) select eig, 'delen-check@x.nl' from t;
      insert into groups (id, name, created_by, status, invite_code)
        select grp, 'Check', eig, 'active', 'CHECKCD1' from t;
      do $proef$
      declare v_eig uuid; v_grp uuid;
      begin
        select eig, grp into v_eig, v_grp from t;
        insert into todo_items (user_id, body, visibility, shared_group_id)
          values (v_eig, 'prive maar met groep', 'private', v_grp);
        perform set_config('proef.uitslag', 'GELAND', true);
      exception when others then
        perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
      end $proef$;
      select current_setting('proef.uitslag');
      rollback;
    `)
      .split('\n')
      .filter((r) => r.trim() !== '')
      .at(-1) as string;

    expect(uit.trim()).toBe('GEWEIGERD 23514');
  }, 60_000);

  /**
   * ⚠️⚠️ **De andere kant van diezelfde CHECK, en die is nieuw.** De eerste
   *    versie stond er half — alleen "geen groep zonder gedeeld" — omdat de
   *    andere helft zou afgaan op de `set null` van de foreign key. Sinds
   *    `pin_taak()` die rij normaliseert kan hij wél, en daarmee bestaat de
   *    stand `('group', null)` niet meer: een taak die zégt gedeeld te zijn
   *    terwijl er niemand meeleest. Het scherm rendeerde die als *"Gedeeld
   *    met "* zonder naam.
   */
  it('een taak kan niet gedeeld heten zonder groep', () => {
    const uit = psql(`
      begin;
      create temp table t as select gen_random_uuid() eig;
      insert into auth.users (id, email) select eig, 'delen-check2@x.nl' from t;
      do $proef$
      declare v_eig uuid;
      begin
        select eig into v_eig from t;
        insert into todo_items (user_id, body, visibility, shared_group_id)
          values (v_eig, 'gedeeld met niemand', 'group', null);
        perform set_config('proef.uitslag', 'GELAND', true);
      exception when others then
        perform set_config('proef.uitslag', 'GEWEIGERD ' || sqlstate, true);
      end $proef$;
      select current_setting('proef.uitslag');
      rollback;
    `)
      .split('\n')
      .filter((r) => r.trim() !== '')
      .at(-1) as string;

    expect(uit.trim()).toBe('GEWEIGERD 23514');
  }, 60_000);

  /**
   * ⚠️ **En dit is de oorzaak onder de conjunct `shared_group_id is not null`.**
   *    Geeft de helper ooit `true` op een lege groep, dan lekt élke taak met
   *    `visibility = 'group'` en een lege kolom — precies de faalstand die
   *    `on delete set null` achterlaat.
   */
  it('mag_groep_lezen zegt nee tegen een lege groep', () => {
    const uit = psql(`
      begin;
      create temp table t as select gen_random_uuid() eig;
      insert into auth.users (id, email) select eig, 'delen-null@x.nl' from t;
      select set_config('request.jwt.claims',
        json_build_object('sub', eig, 'role', 'authenticated')::text, true) from t;
      select coalesce(mag_groep_lezen(null)::text, 'NULL');
      rollback;
    `)
      .split('\n')
      .filter((r) => r.trim() !== '')
      .at(-1) as string;

    expect(uit.trim(), 'een lege groep hoort geen lidmaatschap op te leveren').toBe('false');
  }, 60_000);
});

describe.skipIf(!stackErbij)('de pin laat alleen de RPC door', () => {
  it(
    'de pin laat ook mét de kolomgrant niets door',
    () => {
      expect(
        metKolomgrant(
          `update todo_items set visibility = 'group', shared_group_id = v_grp where id = v_tid;`,
        ),
        'met de kolomgrant erbij is `pin_taak()` de enige grendel die er nog staat',
      ).toBe(PIN_WEIGERT);
    },
    60_000,
  );

  /**
   * ⚠️⚠️ **De sleutel draagt het id van de taak en niet een vlag, en dít is de
   *    test die dat verschil bewaakt.** Met een boolean zou élke rij die in
   *    dezelfde transactie langskomt doorgelaten worden. Hier zet de opstelling
   *    de sleutel op de éérste taak en schrijft daarna de tweede.
   */
  it(
    'de sleutel laat precies een rij door en niet alle rijen',
    () => {
      const uit = metKolomgrant(`
        perform set_config('app.taak_gedeeld', v_tid::text, true);
        update todo_items set visibility = 'group', shared_group_id = v_grp where id = v_t2;
      `);

      expect(
        uit,
        'de sleutel van de ene taak liet een schrijfactie op de andere door',
      ).toBe(PIN_WEIGERT);
    },
    60_000,
  );

  /**
   * ⚠️ **De must-allow, en zonder deze regel is de grendel hierboven gratis.**
   *    Zou de pin álles weigeren, dan kan `zet_taakzichtbaarheid()` niets meer —
   *    en dan is de feature dood in plaats van dicht.
   */
  it(
    'en de RPC komt er met zijn eigen sleutel wél door',
    () => {
      const uit = metKolomgrant(`
        perform set_config('app.taak_gedeeld', v_tid::text, true);
        update todo_items set visibility = 'group', shared_group_id = v_grp where id = v_tid;
      `);

      expect(uit).toBe('GERAAKT 1');
    },
    60_000,
  );

  /**
   * ⚠️⚠️ **Een half geschreven deel-actie wordt geweigerd en niet stil
   *    rechtgezet, en dat is de smalle vorm van de normalisatie.** De brede vorm
   *    (`if new.shared_group_id is null`) ving twee gevallen: de foreign key die
   *    een verdwenen groep achterlaat, én een bevoorrechte schrijver die
   *    `visibility = 'group'` zet zonder groep erbij. Die tweede kreeg dan geen
   *    fout maar een terugzetting naar `('private', null)` — en dan zijn *"ik
   *    heb gedeeld"* en *"er is niets gebeurd"* niet uit elkaar te houden.
   *
   *    De security-ronde vroeg hier om een `raise warning`; dit is dezelfde
   *    reparatie een stap verder, want een waarschuwing was ook afgegaan op het
   *    legitieme pad. Nu normaliseert de trigger alleen wat de foreign key
   *    achterlaat en loopt de rest door naar de CHECK, die luid weigert.
   *
   * ⚠️ De assertie noemt de constraint en niet alleen `23514`: de pin geeft
   *    datzelfde nummer, en het hele punt is dat hier een ánder slot dichtvalt.
   */
  it(
    'een halve deel-actie valt op de CHECK en niet op een stille terugzetting',
    () => {
      const uit = metKolomgrant(`
        perform set_config('app.taak_gedeeld', v_tid::text, true);
        update todo_items set visibility = 'group' where id = v_tid;
      `);

      expect(uit, 'de trigger zette een halve schrijfactie stil recht').toContain(
        'violates check constraint "todo_items_groep_hoort_bij_gedeeld"',
      );
    },
    60_000,
  );

  /**
   * ⚠️⚠️ **De must-allow onder `sluit_gedeelde_taken()`, en de reden dat de pin
   *    één uitzondering draagt.** Die trigger sluit bij een vertrek de taken van
   *    één lid in één UPDATE en kan dus geen sessiesleutel per rij zetten. Een
   *    sleutel die álle rijen doorlaat is precies de vorm die de test hierboven
   *    afwijst, dus de uitzondering staat op de úitkomst: landt de rij op
   *    `('private', null)`, dan mag het.
   *
   *    De richting draagt dat: dichtdoen verkleint wat de groep leest, en daar
   *    heeft geen aanvaller iets aan. Openen kan het níét — dat is de test
   *    hierboven, en de kolomgrant staat er nog vóór.
   */
  it(
    'dichtdoen mag zonder sleutel, en dat is wat het vertrek gebruikt',
    () => {
      const uit = metKolomgrant(`
        perform set_config('app.taak_gedeeld', v_tid::text, true);
        update todo_items set visibility = 'group', shared_group_id = v_grp where id = v_tid;
        perform set_config('app.taak_gedeeld', '', true);

        update todo_items set visibility = 'private', shared_group_id = null where id = v_tid;
      `);

      expect(uit, 'zonder deze weg kan een vertrek de taken niet sluiten').toBe('GERAAKT 1');
    },
    60_000,
  );

  /**
   * ⚠️ **En half dichtdoen is geen dichtdoen.** De uitzondering hangt aan de
   *    stand waarop de rij lándt en niet aan de richting van één kolom: blijft
   *    de groep staan, dan is de rij nog gedeeld en pint hij gewoon.
   */
  it(
    'half dichtdoen mag niet — de groep moet mee weg',
    () => {
      const uit = metKolomgrant(`
        perform set_config('app.taak_gedeeld', v_tid::text, true);
        update todo_items set visibility = 'group', shared_group_id = v_grp where id = v_tid;
        perform set_config('app.taak_gedeeld', '', true);

        update todo_items set visibility = 'private' where id = v_tid;
      `);

      expect(uit, 'een taak die prive heet met een groep eronder is geen stand').toBe(PIN_WEIGERT);
    },
    60_000,
  );

  /**
   * ⚠️⚠️ **Een groep met een gedeelde taak erin moet te verwijderen zijn, en
   *    dat was hij niet.** 📏 Gevonden doordat het opruimen van deze suite een
   *    groep liet staan: `on delete set null` op `shared_group_id` is een gewone
   *    UPDATE, die vuurt `pin_taak()`, en de pin weigerde de foreign key zijn
   *    eigen werk. Een groep met één gedeelde taak was daarmee onverwijderbaar —
   *    een grendel die iets anders vastzette dan hij bewaakte.
   *
   *    Deze test staat op de úitkomst en niet op de trigger: de verwijdering
   *    slaagt, en de taak is daarna niet gedeeld meer.
   */
  it(
    'een groep verwijderen lukt, en de taak valt terug op prive',
    () => {
      const uit = psql(`
        begin;
        create temp table t as
          select gen_random_uuid() eig, gen_random_uuid() grp, gen_random_uuid() tid;
        insert into auth.users (id, email) select eig, 'delen-weg@x.nl' from t;
        insert into groups (id, name, created_by, status, invite_code)
          select grp, 'Weg', eig, 'active', 'WEGCODE1' from t;
        insert into group_members (group_id, user_id, role, status)
          select grp, eig, 'admin', 'active' from t;
        insert into todo_items (id, user_id, body, visibility, shared_group_id)
          select tid, eig, 'gedeeld', 'group', grp from t;

        delete from groups where id = (select grp from t);

        select visibility || '/' || coalesce(shared_group_id::text, 'GEEN') from todo_items
         where id = (select tid from t);
        rollback;
      `)
        .split('\n')
        .filter((r) => r.trim() !== '')
        .at(-1) as string;

      expect(uit.trim(), 'de taak wijst nog naar een groep die niet bestaat').toBe('private/GEEN');
    },
    60_000,
  );

  /**
   * ⚠️ De faalstand van `on delete set null`: verdwijnt een groep, dan valt de
   *    taak terug op eigenaar-only in plaats van voor iedereen open te staan.
   *    Dat is de enige richting die hier acceptabel is (domeinregel 7).
   *
   * ⚠️⚠️ **Deze stand is sinds de biconditionaal niet meer te maken, en de test
   *    laat de CHECK daarom binnen de transactie vallen.** Dat is geen truc om
   *    hem groen te houden maar het punt van de test: de conjunct
   *    `shared_group_id is not null` in `todo_items_select` is vandaag overbodig
   *    — de CHECK en `mag_groep_lezen(null)` sluiten die rij allebei al af — en
   *    hij staat er voor de dag dat een van die twee wegvalt. Wat hier gemeten
   *    wordt is precies díé dag.
   *
   *    Zonder de drop meet deze test de CHECK, en die heeft hierboven al een
   *    eigen regel. Twee tests op dezelfde grendel en geen op de policy is
   *    dekking die er alleen uitziet.
   */
  it(
    'een taak zonder groep bereikt niemand, ook niet als hij group heet',
    () => {
      const uit = psql(`
        begin;
        create temp table t as
          select gen_random_uuid() eig, gen_random_uuid() kijker, gen_random_uuid() grp,
                 gen_random_uuid() tid;
        grant select on t to authenticated;
        insert into auth.users (id, email) select eig, 'delen-wees@x.nl' from t;
        insert into auth.users (id, email) select kijker, 'delen-kijker@x.nl' from t;
        insert into groups (id, name, created_by, status, invite_code)
          select grp, 'Wees', eig, 'active', 'WEESCODE' from t;
        insert into group_members (group_id, user_id, role, status)
          select grp, eig, 'admin', 'active' from t;
        insert into group_members (group_id, user_id, role, status)
          select grp, kijker, 'member', 'active' from t;

        -- De stand die de CHECK tegenhoudt en de policy alsnog moet afvangen.
        -- Alleen hier, alleen binnen deze transactie, en hij wordt teruggedraaid.
        alter table todo_items drop constraint todo_items_groep_hoort_bij_gedeeld;
        insert into todo_items (id, user_id, body, visibility, shared_group_id)
          select tid, eig, 'stuurloos gedeeld', 'group', null from t;

        select set_config('request.jwt.claims',
          json_build_object('sub', kijker, 'role', 'authenticated')::text, true) from t;
        set local role authenticated;
        select count(*) from todo_items where id = (select tid from t);
        reset role;
        rollback;
      `)
        .split('\n')
        .filter((r) => r.trim() !== '')
        .at(-1) as string;

      expect(uit.trim(), 'een taak zonder groep is voor de groep zichtbaar').toBe('0');
    },
    60_000,
  );
});
