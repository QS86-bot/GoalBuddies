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

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

let anna: TestUser;
let bram: TestUser;
let carol: TestUser;
let doelId: string;
let weekdoelId: string;
let dagzetId: string;
let interviewId: string;
let groepId: string;

const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());


describe.runIf(rlsTestsConfigured)('een schrijfrecht zonder aanroeper', () => {
  beforeAll(async () => {
    anna = await createTestUser('zonderaanroeper-anna');
    bram = await createTestUser('zonderaanroeper-bram');
    carol = await createTestUser('zonderaanroeper-carol');

    const g = await anna.db.rpc('create_group', { group_name: 'Zonder aanroeper' });
    if (g.error) throw new Error(`groep: ${g.error.message}`);
    const uit = (g.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(g.data)}`);
    groepId = uit.group.id;

    for (const wie of [bram, carol]) {
      const mee = await wie.db.rpc('join_group_with_code', { code: uit.group.invite_code });
      if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);
    }

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

  /**
   * ⚠️⚠️ **Deze twee tests zijn er ná de security-review bij gekomen, en ze
   *    wijzen op een fout in de eerste opzet van dit issue.**
   *
   *    De drie tests hierboven toetsen de PATCH-vórm, en de migratiekop beloofde
   *    de uitkomst ("een Dagzet dertig dagen terugdateren"). Die twee zijn niet
   *    hetzelfde: 📏 `authenticated` had **tabelbrede DELETE** op `daily_moves`
   *    en `goal_interviews`, en `daily_moves_write` is een `FOR ALL`-policy op
   *    `user_id = auth.uid()`. Weghalen-en-opnieuw-invoegen was dus een tweede
   *    weg naar exact dezelfde uitkomst, en geen van de tests zag hem.
   *
   *    **Regel 18 vraag 2, op deze branch zelf van toepassing.** Daarom toetst
   *    dit blok de uitkomst: is de rij er na afloop nog, en ongewijzigd.
   */
  describe('en weghalen-en-opnieuw is geen omweg om hetzelfde te bereiken', () => {
    it(
      'weigert het weghalen van de eigen Dagzet',
      async () => {
        const weg = await anna.db.from('daily_moves').delete().eq('id', dagzetId);
        expect(weg.error?.code, 'de Dagzet was weg te halen').toBe('42501');

        // ⚠️ De foutcode alléén is hier niet genoeg: een DELETE die op de
        //    `using` afketst raakt nul rijen en geeft géén fout. Dus ook nakijken
        //    dát de rij er nog is, en onveranderd.
        const na = await adminDb()
          .from('daily_moves')
          .select('id, body, visibility, local_date')
          .eq('id', dagzetId)
          .maybeSingle();

        expect(na.data?.id, 'de Dagzet is alsnog verdwenen').toBe(dagzetId);
        expect(na.data?.body).toBe('een dagboekregel');
        expect(na.data?.visibility, 'de zichtbaarheid is alsnog omgezet').toBe('private');
        expect(na.data?.local_date, 'de datum is alsnog verschoven').toBe(cyclus.startDate);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert het weghalen van het eigen interview',
      async () => {
        const weg = await anna.db.from('goal_interviews').delete().eq('id', interviewId);
        expect(weg.error?.code, 'het interview was weg te halen').toBe('42501');

        const na = await adminDb()
          .from('goal_interviews')
          .select('id')
          .eq('id', interviewId)
          .maybeSingle();

        expect(na.data?.id, 'het interview is alsnog verdwenen').toBe(interviewId);
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
     * ⚠️⚠️ **Deze test legde een gat vast en is nu een weigering — precies zoals
     *    hij in zijn eigen assertiebericht aankondigde.**
     *
     *    Bij QS8-351 stond hier dat een actieve beheerder een uitgezet lid met
     *    één PATCH terugzette, met de melding *"de PATCH werd geweigerd — dan is
     *    het gat dicht en mag deze test weg"*. Migratie 0198 (QS8-356) heeft dat
     *    gedaan: terugkomen loopt via `beslis_lidmaatschapsverzoek()`, waar het
     *    lid er zélf om vraagt.
     *
     *    ⚠️ Hij is hier **niet** weggehaald maar omgedraaid, want de belofte van
     *    dít bestand blijft dezelfde: wat er nog rechtstreeks kan en wat niet.
     *    De volledige toetsing van de nieuwe grendel staat in
     *    `beheerdersgrens.test.ts`, met zijn vier gevallen en zijn must-allows.
     */
    it(
      'weigert een beheerder die een uitgezet lid rechtstreeks terugzet',
      async () => {
        // ⚠️ **Carol en niet bram, en dat is een gerepareerde opzet.** Deze test
        //    zet zijn onderwerp uit de groep, en een uitgezet lid ziet zijn eigen
        //    rij niet meer. 📏 Gemeten: met bram als onderwerp raakte de roltest
        //    hieronder daarna nul rijen, kreeg géén fout, en was groen om precies
        //    de verkeerde reden.
        //
        // ⚠️ `p_bevestigd` is verplicht: een lid verwijderen is een handeling met
        //    gevolgen (de gedeelde doelen gaan mee), dus de RPC vraagt erom.
        const weg = await anna.db.rpc('verwijder_lid', {
          p_group_id: groepId,
          p_user_id: carol.id,
          p_bevestigd: true,
        });
        if (weg.error) throw new Error(`uitzetten: ${weg.error.message}`);
        const wegUit = (weg.data ?? {}) as { ok?: boolean; reason?: string };
        if (wegUit.ok !== true) throw new Error(`uitzetten: ${wegUit.reason ?? '-'}`);

        const { error } = await anna.db
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', groepId)
          .eq('user_id', carol.id);

        expect(error, 'de beheerder zette het lid rechtstreeks terug').not.toBeNull();

        const na = await adminDb()
          .from('group_members')
          .select('status')
          .eq('group_id', groepId)
          .eq('user_id', carol.id)
          .single();
        // ⚠️ De statusvocabulaire is `active | inactive | paused` — uitgezet heet
        //    `inactive` en niet `removed`. Nagemeten op
        //    `group_members_status_valid`, niet aangenomen.
        expect(na.data?.status, 'het lid stond alsnog weer actief').toBe('inactive');
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
     *    precies waarom deze test verhuisd is.** Vóór 0197 gaf een POST op
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
     * ⚠️⚠️ **Deze test las eerst het recht rechtstreeks met `psql`, met als
     *    onderbouwing dat een clienttest hier niet kon discrimineren. Dat was
     *    onjuist, aangewezen door de security-review en zelf nagemeten.**
     *
     *    📏 Dezelfde POST, oprichter nog lid, alleen de grant verschilt:
     *
     *      mét grant:     `23505` duplicate key … group_members_pkey
     *      zónder grant:  `42501` permission denied for table group_members
     *
     *    Twee verschillende SQLSTATE's, dus twee verschillende `error.code`'s bij
     *    PostgREST. De redenering was dat het pad langs een tweede weg al dicht
     *    zat en dat je daardoor niet kunt zien wélk slot weigert — maar die twee
     *    sloten geven een verschillende code, en de migratiekop gebruikt dat
     *    onderscheid zelf al voor `profiles`.
     *
     *    ⚠️ **Een grendel die je niet kunt onderscheiden en een grendel die je
     *    niet hebt gemeten, zien er identiek uit.** Hier was het het tweede.
     */
    it(
      'weigert een rechtstreekse INSERT in group_members',
      async () => {
        const { error } = await anna.db.from('group_members').insert({
          group_id: groepId,
          user_id: anna.id,
          role: 'admin',
          status: 'active',
        });

        expect(error?.code, 'het INSERT-recht staat weer open').toBe('42501');
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
