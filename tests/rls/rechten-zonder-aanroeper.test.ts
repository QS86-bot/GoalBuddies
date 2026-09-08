/**
 * Zeven schrijfrechten zonder aanroeper — QS8-351.
 *
 * ⚠️ **Dit bestand meet eerst en beslist daarna.** `kolomrechten:controle`
 *    (QS8-349) wees achttien `tabel|soort`-paren aan met een kolomgrant voor
 *    `authenticated` terwijl niets in `src/` of `app/` naar die tabel schrijft.
 *    Elf zijn inert (`using false` / `with check false`); deze zeven staan open
 *    voor een rechtstreeks PostgREST-verzoek.
 *
 * ⚠️⚠️ **De belofte die hier getoetst wordt is niet "de grant is weg" maar "de
 *    RPC is de enige weg".** Dat is het verschil dat regel 18 vraag 2 vraagt:
 *    een test op de grant verhuist mee met de grant; een test die het
 *    rechtstreekse pad afwijst én het RPC-pad toelaat, blijft kloppen als
 *    iemand de rechten anders indeelt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

let anna: TestUser;
let bram: TestUser;
let doelId: string;
let weekdoelId: string;
let dagzetId: string;
let interviewId: string;
let groepId: string;

const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

/**
 * ⚠️ **De poortwachter staat hier en niet in de test.** `stackBeschikbaarOfFaal()`
 *    werpt zodra `RLS_DOEL` gezet is (QS8-270): wie zegt dat hij meet, mag niet
 *    stil overslaan. Hij neemt `import.meta.url` als bron — een pad in plaats van
 *    een URL geeft `TypeError: Invalid URL`, en dat is geen meting maar een
 *    kapotte test.
 */
const stackBeschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'group_members' and relnamespace = 'public'::regnamespace",
  import.meta.url,
);

describe.runIf(rlsTestsConfigured)('een schrijfrecht zonder aanroeper', () => {
  beforeAll(async () => {
    anna = await createTestUser('zonderaanroeper-anna');
    bram = await createTestUser('zonderaanroeper-bram');

    const g = await anna.db.rpc('create_group', { group_name: 'Zonder aanroeper' });
    if (g.error) throw new Error(`groep: ${g.error.message}`);
    const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);
    groepId = uit.group.id;

    const mee = await bram.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    const doel = await anna.db
      .from('goals')
      .insert({ owner_id: anna.id, title: 'Zonder aanroeper', target_date: cyclus.endDate })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);
    doelId = doel.data.id;

    const week = await anna.db
      .from('weekly_goals')
      .insert({ goal_id: doelId, title: 'de week', cycle_start_date: cyclus.startDate })
      .select('id')
      .single();
    if (week.error) throw new Error(`weekdoel: ${week.error.message}`);
    weekdoelId = week.data.id;

    const dag = await anna.db
      .from('daily_moves')
      .insert({
        user_id: anna.id,
        body: 'een dagboekregel',
        local_date: cyclus.startDate,
        visibility: 'private',
        weekly_goal_id: weekdoelId,
      })
      .select('id')
      .single();
    if (dag.error) throw new Error(`dagzet: ${dag.error.message}`);
    dagzetId = dag.data.id;

    const gesprek = await anna.db
      .from('goal_interviews')
      .insert({ goal_id: doelId, answers: { waarom: 'omdat het moet' } })
      .select('id')
      .single();
    if (gesprek.error) throw new Error(`interview: ${gesprek.error.message}`);
    interviewId = gesprek.data.id;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de Dagzet is een dagboekregel en geen bewerkbaar veld', () => {
    it(
      'weigert een rechtstreekse PATCH op de eigen Dagzet',
      async () => {
        const { error } = await anna.db
          .from('daily_moves')
          .update({ body: 'herschreven' })
          .eq('id', dagzetId);

        expect(error?.code, 'de eigenaar mocht zijn Dagzet bewerken').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Dit is het geval dat de klasse duur maakt, en het staat apart.**
     *    `visibility` bepaalt of de groep de Dagzet ziet. Met een UPDATE-recht
     *    is een privéregel achteraf naar `group` te tillen — en, erger, andersom:
     *    wat de groep al gezien heeft weer op `private` zetten. Domeinregel 9
     *    zegt dat de Dagzet standaard privé is; dat je hem achteraf mag omzetten
     *    is nooit besloten.
     */
    it(
      'weigert het achteraf omzetten van de zichtbaarheid',
      async () => {
        const { error } = await anna.db
          .from('daily_moves')
          .update({ visibility: 'group' })
          .eq('id', dagzetId);

        expect(error?.code, 'de zichtbaarheid was achteraf om te zetten').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert het terugdateren van een Dagzet',
      async () => {
        const { error } = await anna.db
          .from('daily_moves')
          .update({ local_date: addDays(cyclus.startDate, -30) })
          .eq('id', dagzetId);

        expect(error?.code, 'de datum was terug te zetten').toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('een interviewantwoord is niet achteraf te herschrijven', () => {
    it(
      'weigert een rechtstreekse PATCH op het eigen interview',
      async () => {
        const { error } = await anna.db
          .from('goal_interviews')
          .update({ answers: { waarom: 'iets heel anders' } })
          .eq('id', interviewId);

        expect(error?.code, 'het interview was te herschrijven').toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de must-allows: de weg die er wél hoort te zijn', () => {
    it(
      'laat een nieuwe Dagzet gewoon aanmaken',
      async () => {
        const { error } = await anna.db.from('daily_moves').insert({
          user_id: anna.id,
          body: 'nog een dag',
          local_date: addDays(cyclus.startDate, 1),
          visibility: 'private',
          weekly_goal_id: weekdoelId,
        });

        expect(error, 'een Dagzet aanmaken hoort te werken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een nieuw interviewantwoord gewoon aanmaken',
      async () => {
        const { error } = await anna.db
          .from('goal_interviews')
          .insert({ goal_id: doelId, answers: { waarom: 'bijgesteld' } });

        expect(error, 'een interview aanmaken hoort te werken').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar zijn weekdoel nog hernoemen',
      async () => {
        const { error } = await anna.db
          .from('weekly_goals')
          .update({ title: 'hernoemd' })
          .eq('id', weekdoelId);

        expect(error, 'een weekdoel hernoemen hoort te werken').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  describe('wat er bewust blijft staan, en waarom — gemeten en niet beredeneerd', () => {
    /**
     * ⚠️ Acceptatiecriterium 4: kan een client langs `sluit_weekdoel_af()` heen
     *    een week beoordeeld krijgen en zo punten boeken? 📏 Het antwoord zit in
     *    de kolomlijst en niet in de policy: `status` staat níét in de
     *    UPDATE-grant. Dat is de grendel, en die wordt hier gemeten in plaats
     *    van aangenomen.
     */
    it(
      'laat een client de status van een weekdoel niet zetten',
      async () => {
        const { error } = await anna.db
          .from('weekly_goals')
          .update({ status: 'approved' })
          .eq('id', weekdoelId);

        expect(error?.code, 'de status stond in de UPDATE-grant').toBe('42501');
      },
      TEST_TIMEOUT,
    );

  });

  /**
   * ⚠️ **De naam van dit blok is met opzet niet "loopt alleen nog langs de RPC".**
   *    Dat was de eerste naam, en hij werd onwaar toen `group_members` UPDATE uit
   *    de migratie ging. Een blokkopje dat meer belooft dan er staat, is de
   *    goedkoopste manier om een lezer te laten denken dat iets dicht is.
   */
  describe('wat er nog wél rechtstreeks kan, en wat niet meer', () => {
    /**
     * ⚠️⚠️ **Deze test stond hier eerst als weigering, en dat was fout — hij
     *    documenteert nu een gat dat blíjft staan.**
     *
     *    De eerste opzet van 0196 trok óók `group_members` UPDATE in. 📏 Dat
     *    maakte 21 bestaande tests in zeven bestanden rood, en alleen die ene
     *    grant teruggeven maakte ze alle 100 weer groen. **Dat is het antwoord
     *    op de vraag en niet een lastige suite:** dit recht heeft wél een doel.
     *    0102 en 0187 zijn er juist voor gebouwd, en de audittrigger schrijft een
     *    spoor "ook bij een uitzetting buiten de RPC om". Intrekken maakt
     *    `guard_group_member_update()` onbereikbaar en heel QS8-314 inhoudsloos.
     *
     *    ⚠️ **De "geen aanroeper"-meting keek naar `src/` en `app/`, en dat is de
     *    verkeerde helft.** De client roept het niet aan; de database heeft er
     *    drie grendels voor. Een recht zonder aanroeper in de app is iets anders
     *    dan een recht zonder doel.
     *
     *    Het gat dat de review op QS8-349 aanwees blijft dus openstaan, en deze
     *    test legt het vast als **huidige toestand** in plaats van als belofte:
     *    een actieve beheerder zet een uitgezet lid met één PATCH terug op
     *    `active`, terwijl `verwijder_lid()` ook `goal_group_links` en
     *    openstaande `deadline_requests` opruimt. Dat is een gat in de guard en
     *    geen losse grant; het staat als eigen issue.
     */
    it(
      'legt vast dat een beheerder een uitgezet lid nog rechtstreeks terugzet',
      async () => {
        // ⚠️ `p_bevestigd` is verplicht: een lid verwijderen is een handeling met
        //    gevolgen (de gedeelde doelen gaan mee), dus de RPC vraagt erom.
        const weg = await anna.db.rpc('verwijder_lid', {
          p_group_id: groepId,
          p_user_id: bram.id,
          p_bevestigd: true,
        });
        if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);
        const wegUit = (weg.data ?? {}) as { ok?: boolean; reason?: string };
        if (wegUit.ok !== true) throw new Error(`uitzetten: ${wegUit.reason ?? '-'}`);

        const { error } = await anna.db
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', groepId)
          .eq('user_id', bram.id);

        expect(error, 'de PATCH werd geweigerd — dan is het gat dicht en mag deze test weg').toBeNull();

        const na = await adminDb()
          .from('group_members')
          .select('status')
          .eq('group_id', groepId)
          .eq('user_id', bram.id)
          .single();
        // ⚠️ De statusvocabulaire is `active | inactive | paused` — uitgezet heet
        //    `inactive` en niet `removed`. Nagemeten op
        //    `group_members_status_valid`, niet aangenomen.
        expect(na.data?.status, 'het lid kwam niet terug — het gat is dicht').toBe('active');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gewoon lid zichzelf geen beheerder maken',
      async () => {
        const { error } = await bram.db
          .from('group_members')
          .update({ role: 'admin' })
          .eq('group_id', groepId)
          .eq('user_id', bram.id);

        // ⚠️ Deze kant is wél dicht, en door de guard uit 0187 en niet door een
        //    grant: `guard_group_member_update()` werpt `geen_groepsbeheerder`.
        expect(error, 'een gewoon lid maakte zichzelf beheerder').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **De grendel die hier eerst stond was de primaire sleutel, en dat is
     *    precies waarom deze test verhuisd is.** Vóór 0196 gaf een POST op
     *    `profiles` 📏 `23505`: `handle_new_user()` had de enige rij al gemaakt
     *    en `id = auth.uid()` liet er geen tweede toe. Dat is een gevólg en geen
     *    slot — het houdt op te werken zodra er een pad ontstaat waarin de rij
     *    er nog niet is. Nu weigert het ontbrekende INSERT-recht hem, en dat is
     *    een besluit.
     */
    it(
      'laat geen profielrij van een client komen',
      async () => {
        const { error } = await anna.db
          .from('profiles')
          .insert({ id: anna.id, display_name: 'dubbel' });

        expect(error?.code, 'een client mocht een profielrij maken').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ `blokkeer()` geeft met opzet hetzelfde antwoord voor een bestaand en
     *    een onbestaand profiel-id, zodat je er niet mee kunt toetsen óf een
     *    account bestaat. Het rechtstreekse pad miste die gelijkmaker: 📏 een
     *    onbestaand id gaf `23503`, een bestaand id `201`.
     */
    it(
      'laat een client niet rechtstreeks in user_blocks schrijven',
      async () => {
        const { error } = await anna.db
          .from('user_blocks')
          .insert({ blocker_id: anna.id, blocked_id: bram.id });

        expect(error?.code, 'het bestaansorakel staat nog open').toBe('42501');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Deze test is met opzet anders van vorm dan alle andere hier, en dat
     *    is een bevinding en geen uitzondering.**
     *
     *    📏 Bij het ijken bleek de intrekking van `group_members` INSERT als
     *    énige van de zes **geen enkele test rood te maken**: de grant
     *    terugzetten liet alle dertien groen. De reden staat in QS8-349 en is
     *    nagemeten: dat pad is vandaag al onbereikbaar langs een tweede weg. De
     *    `EXISTS (select 1 from groups …)` ín de INSERT-policy wordt zélf door
     *    `groups_select` gefilterd — ben je nog lid, dan botst de primaire
     *    sleutel; ben je vertrokken, dan zie je de groep niet meer. Wélk slot
     *    weigert, is van buitenaf niet te zien.
     *
     *    **Een test langs de client kan hier dus niet discrimineren**, en een
     *    test die dat wél lijkt te doen zou groen zijn om de verkeerde reden —
     *    precies de val die QS8-352 twee keer opleverde. Daarom leest deze het
     *    recht rechtstreeks. Dat toetst de grendel en niet de belofte, en dat is
     *    hier het eerlijkste dat er te toetsen valt.
     *
     *    ⚠️ Wat de belofte draagt is de reden dat de intrekking er staat: elke
     *    schrijver van `group_members` is `SECURITY DEFINER`, dus er is niets
     *    dat dit recht nodig heeft. En het maakt het toekomstige geval
     *    onmogelijk in plaats van onwaarschijnlijk: verbreedt `groups_select`
     *    ooit — `groups.ontdekbaar` bestaat al als kolom — dan zou een vertrokken
     *    oprichter zichzelf met één POST als `role: admin` kunnen terugzetten.
     */
    it.runIf(stackBeschikbaar)(
      'heeft geen INSERT-recht meer op group_members voor authenticated',
      () => {
        const rechten = psql(
          `select coalesce(string_agg(column_name, ',' order by column_name), '-')
             from information_schema.column_privileges
            where table_schema = 'public' and table_name = 'group_members'
              and grantee = 'authenticated' and privilege_type = 'INSERT'`,
        ).trim();

        expect(rechten, 'authenticated mag weer in group_members invoegen').toBe('-');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat blokkeer() nog gewoon werken',
      async () => {
        const uit = await anna.db.rpc('blokkeer', { p_user: bram.id });

        expect(uit.error, 'de RPC hoort nog te werken').toBeNull();
        expect((uit.data ?? {}) as { ok?: boolean }).toMatchObject({ ok: true });
      },
      TEST_TIMEOUT,
    );
  });
});
