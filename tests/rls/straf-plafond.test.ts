/**
 * Het plafond op straffen en de ondergrens op de streefdatum — QS8-293,
 * migratie 0170.
 *
 * ⚠️ **De aanval die dit issue opleverde, en hij was end-to-end gemeten.** Een
 *    doel met `current_date - 30`, vijf straffen erop met dezelfde persoon als
 *    getuige, de rollover zet ze op `due`, en die persoon leest vijf keer 500
 *    tekens vrije tekst die hij niet kan weigeren en niet kan verwijderen.
 *
 * ⚠️ **Waarom het pas iets werd bij QS8-228.** Daarvóór was de begunstigde een
 *    groep waar je zélf lid van was. Nu is het een aangewezen individu. Dezelfde
 *    klasse als spam-uitnodigingen, waar onwrikbare regel 5 wél een limiet eist.
 *
 * ⚠️ **Drie grenzen en drie soorten test.** Het plafond is een unieke index en
 *    geldt dus ook voor `service_role`; de datumgrens zit in een policy en in
 *    twee functies, en die worden apart getoetst — een grens die alleen bij het
 *    aanmaken geldt, verplaats je met de eerste de beste verzetknop.
 *
 * ⚠️ **De derde grens is de naad, en die lekte terwijl de eerste twee klopten.**
 *    Grens 2 bewaakt het aanmaken van een doel, grens 1 het aantal straffen; de
 *    aanval leeft ertússen, want de straf is een tweede handeling op een later
 *    moment. Gemeten met beide grenzen er al in: een doel met de datum van
 *    vandaag, een dag later een straf erop, rollover, `due`. Regel 18 vraag 1 —
 *    waar knopen twee correcte onderdelen aan elkaar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql } from './psql-stack';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  groupId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('het plafond op straffen', () => {
  beforeAll(async () => {
    const alice = await createTestUser('plafond-alice');
    const bob = await createTestUser('plafond-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Plafondgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    // ⚠️ **De tijdzone van de testgebruikers wordt vastgezet, en dat is geen
    //    opsmuk.** `mijn_datum()` rekent in `profiles.tz`, en die staat standaard
    //    op `Europe/Amsterdam`; `vandaag` hierboven is UTC. Tussen 22:00 en 24:00
    //    UTC lopen die twee een dag uiteen en werd de must-allow hieronder elke
    //    avond rood — een test die per klok van uitslag verandert, meet niets.
    const zone = await adminDb()
      .from('profiles')
      .update({ tz: 'UTC' })
      .in('id', [alice.id, bob.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = { alice, bob, groupId: gd.group.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een vers doel met een geldige streefdatum. */
  async function versDoel(titel: string): Promise<string> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 90) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    return doel.data.id as string;
  }

  // -------------------------------------------------------------------------
  describe('één openstaande straf per doel', () => {
    it(
      'een tweede straf op hetzelfde doel kan niet, ook niet als service_role',
      async () => {
        // ⚠️ Via `adminDb()` en niet via de client: dit is een unieke index en
        //    geen policy, dus hij hoort óók te gelden voor de rol die alle
        //    policies overslaat. Dáár zat de spamvector.
        const doelId = await versDoel('PLAFOND tweede straf');
        const admin = adminDb();

        const eerste = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De eerste straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(eerste.error, `de eerste hoort te mogen: ${eerste.error?.message}`).toBeNull();

        const tweede = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De tweede straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(tweede.error, 'een tweede openstaande straf is erdoor gekomen').not.toBeNull();

        const rijen = await admin.from('commitments').select('id').eq('goal_id', doelId);
        expect(rijen.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een beloning naast een straf kan wél',
      async () => {
        // ⚠️ De must-allow. Het plafond is per **soort**; zou de index alleen op
        //    `goal_id` staan, dan blokkeert een straf je beloning en is dit rood.
        const doelId = await versDoel('PLAFOND straf en beloning');
        const admin = adminDb();

        const straf = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'Een straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(straf.error).toBeNull();

        const beloning = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'reward',
          body: 'Een beloning',
          confirmed_at: new Date().toISOString(),
        });
        expect(beloning.error, `een beloning hoort ernaast te mogen: ${beloning.error?.message}`)
          .toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'na intrekken mag er wél een nieuwe',
      async () => {
        // ⚠️ **De reden dat dit een partiële index is en geen gewone.** Een
        //    ingetrokken straf hoort je niet voor altijd te blokkeren; intrekken
        //    en opnieuw vastleggen is precies wat het scherm aanbiedt.
        const doelId = await versDoel('PLAFOND opnieuw na intrekken');
        const admin = adminDb();

        const eerste = await admin
          .from('commitments')
          .insert({
            goal_id: doelId,
            type: 'penalty',
            body: 'De eerste straf',
            beneficiary_user_id: w.bob.id,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (eerste.error) throw new Error(`eerste: ${eerste.error.message}`);

        await admin.from('commitments').update({ status: 'cancelled' }).eq('id', eerste.data.id);

        const tweede = await admin.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'De tweede straf, na intrekken',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });
        expect(tweede.error, `na intrekken hoort een nieuwe te mogen: ${tweede.error?.message}`)
          .toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een streefdatum begint niet in het verleden', () => {
    it(
      'een doel met een streefdatum in het verleden kan niet',
      async () => {
        // ⚠️ Dit is de andere helft van de aanval: zonder deze grens is
        //    `current_date - 30` de kortste weg naar een straf die meteen
        //    verschuldigd is.
        const poging = await w.alice.db.from('goals').insert({
          owner_id: w.alice.id,
          title: 'PLAFOND doel in het verleden',
          target_date: addDays(w.vandaag, -30),
        });

        expect(poging.error, 'een doel met een deadline in het verleden is erdoor gekomen')
          .not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'vandaag mag nog wél',
      async () => {
        // ⚠️ De must-allow op de grens zelf. `>=` en niet `>`: een doel dat
        //    vandaag afloopt is een geldig doel, en een test die dat niet zegt
        //    laat een strengere grens ongemerkt passeren.
        const poging = await w.alice.db
          .from('goals')
          .insert({
            owner_id: w.alice.id,
            title: 'PLAFOND doel van vandaag',
            target_date: w.vandaag,
          })
          .select('id')
          .single();

        expect(poging.error, `vandaag hoort te mogen: ${poging.error?.message}`).toBeNull();
        await adminDb().from('goals').delete().eq('id', poging.data?.id ?? '');
      },
      TEST_TIMEOUT,
    );

    it(
      'de streefdatum is ook niet naar het verleden te verzetten',
      async () => {
        // ⚠️ **Een grens die alleen bij het aanmaken geldt, verplaats je met de
        //    eerste de beste verzetknop.** `zet_streefdatum()` is de route voor
        //    een ongekoppeld doel.
        const doelId = await versDoel('PLAFOND verzetten');

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, -5),
        });

        expect(uit(poging.data).ok).toBe(false);
        expect(uit(poging.data).reason).toBe('datum_in_verleden');

        const na = await adminDb().from('goals').select('target_date').eq('id', doelId).single();
        expect(na.data?.target_date, 'de streefdatum is toch verzet').toBe(addDays(w.vandaag, 90));
      },
      TEST_TIMEOUT,
    );

    it(
      'en een verschuiving naar het verleden is niet eens aan te vragen',
      async () => {
        // ⚠️ De derde schrijver. Voor een gekoppeld doel loopt verzetten via een
        //    verzoek (A7), en zonder deze grens is dát de omweg.
        const doelId = await versDoel('PLAFOND verzoek');
        expect(
          (await adminDb().from('goal_group_links').insert({ goal_id: doelId, group_id: w.groupId }))
            .error,
        ).toBeNull();

        const poging = await w.alice.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: doelId,
          p_group_id: w.groupId,
          p_new_date: addDays(w.vandaag, -5),
          p_reason: 'Ik wil deze datum graag naar het verleden verschuiven, om redenen.',
        });

        expect(uit(poging.data).ok).toBe(false);
        expect(uit(poging.data).reason).toBe('datum_in_verleden');

        const verzoeken = await adminDb()
          .from('deadline_requests')
          .select('id')
          .eq('goal_id', doelId);
        expect(verzoeken.data ?? [], 'er staat een verzoek voor een datum in het verleden')
          .toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een straf hangt niet aan een verstreken deadline', () => {
    /** Een doel waarvan de streefdatum inmiddels voorbij is. */
    async function verlopenDoel(titel: string): Promise<string> {
      // ⚠️ Via `adminDb()`, want grens 2 verbiedt precies dit bij het aanmaken.
      //    Dat is opbouw: zo'n doel ontstaat legitiem doordat de datum verstrijkt.
      const doel = await adminDb()
        .from('goals')
        .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, -1) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
      return doel.data.id as string;
    }

    it(
      'een straf op een doel waarvan de deadline al voorbij is, kan niet',
      async () => {
        // ⚠️ **Dit is de belofte en niet een eigenschap van een onderdeel.** De
        //    belofte is: een straf die je vastlegt, kan niet meteen verschuldigd
        //    zijn. Grens 1 en grens 2 waren allebei groen terwijl deze route
        //    openlag — één dag wachten was genoeg.
        const doelId = await verlopenDoel('STRAF verstreken deadline');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'Een straf die meteen verschuldigd zou zijn',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });

        expect(poging.error, 'een straf op een verstreken deadline is erdoor gekomen')
          .not.toBeNull();

        const rijen = await adminDb().from('commitments').select('id').eq('goal_id', doelId);
        expect(rijen.data ?? [], 'er staat toch een straf op het verlopen doel').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een beloning op datzelfde doel mag wél',
      async () => {
        // ⚠️ De must-allow op de sóórt. Een beloning geeft niemand leesrecht en
        //    legt niemand iets op; zou de conjunct `type <> 'penalty'` wegvallen,
        //    dan blokkeert deze grens ook iets onschuldigs en is dit rood.
        const doelId = await verlopenDoel('STRAF verstreken maar beloning');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'reward',
          body: 'Een beloning op een doel dat afgelopen is',
          confirmed_at: new Date().toISOString(),
        });

        expect(poging.error, `een beloning hoort te mogen: ${poging.error?.message}`).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'op een doel dat vandaag afloopt mag een straf nog wél',
      async () => {
        // ⚠️ De must-allow op de grens zelf, en de reden dat er `>=` staat: de
        //    laatste dag is nog steeds een lopende deadline. Met `>` erin is dit
        //    rood en had niemand het gemerkt.
        const doel = await adminDb()
          .from('goals')
          .insert({ owner_id: w.alice.id, title: 'STRAF laatste dag', target_date: w.vandaag })
          .select('id')
          .single();
        if (doel.error) throw new Error(`doel: ${doel.error.message}`);

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doel.data.id as string,
          type: 'penalty',
          body: 'Een straf op de laatste dag',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });

        expect(poging.error, `de laatste dag hoort te mogen: ${poging.error?.message}`).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een straf gaat nooit af binnen een dag', () => {
    /**
     * ⚠️ **De belofte is niet "de policy weigert" maar "een straf die je
     *    vastlegt kan niet meteen verschuldigd worden".** Dat verschil is de
     *    hele tweede security-ronde op dit issue: de drie grenzen van 0170
     *    waren elk correct en de rollover kwam er onderdoor, omdat `mijn_datum()`
     *    en de datum die de rollover gebruikt allebei uit `profiles.tz` komen —
     *    een kolom die de gebruiker zelf schrijft.
     */
    async function strafOpDoelDatVerloopt(titel: string): Promise<{ doelId: string; strafId: string }> {
      // Opbouw: het doel loopt nog, dus de straf mag erop (grens 3 van 0170).
      const doel = await adminDb()
        .from('goals')
        .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
      const doelId = doel.data.id as string;

      const straf = await w.alice.db
        .from('commitments')
        .insert({
          goal_id: doelId,
          type: 'penalty',
          body: `${titel} straf`,
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);

      // En dan verstrijkt de datum. Via `adminDb()`, want dat is het verlopen
      // van tijd en niet een handeling die getoetst wordt.
      const verzet = await adminDb()
        .from('goals')
        .update({ target_date: addDays(w.vandaag, -1) })
        .eq('id', doelId);
      if (verzet.error) throw new Error(`verzetten: ${verzet.error.message}`);

      return { doelId, strafId: straf.data.id as string };
    }

    async function standVan(strafId: string): Promise<string> {
      const rij = await adminDb().from('commitments').select('status').eq('id', strafId).single();
      if (rij.error) throw new Error(`status: ${rij.error.message}`);
      return rij.data.status as string;
    }

    it(
      'een straf die net is vastgelegd wordt niet verschuldigd, ook niet als de deadline voorbij is',
      async () => {
        const { strafId } = await strafOpDoelDatVerloopt('DAG verse straf');

        const uitkomst = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: w.alice.id,
          p_vandaag: addDays(w.vandaag, 1),
        });
        expect(uitkomst.error, `rollover: ${uitkomst.error?.message}`).toBeNull();
        expect(uitkomst.data, 'een verse straf is verschuldigd geworden').toBe(0);
        expect(await standVan(strafId)).toBe('set');
      },
      TEST_TIMEOUT,
    );

    it(
      'na een dag gaat hij wél af',
      async () => {
        // ⚠️ De must-allow, en zonder haar is de grendel hierboven "straffen gaan
        //    nooit af" — dat is geen commitment device meer.
        const { strafId } = await strafOpDoelDatVerloopt('DAG oude straf');

        const ouder = await adminDb()
          .from('commitments')
          .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
          .eq('id', strafId);
        expect(ouder.error, `ouder maken: ${ouder.error?.message}`).toBeNull();

        const uitkomst = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: w.alice.id,
          p_vandaag: addDays(w.vandaag, 1),
        });
        expect(uitkomst.data, 'een straf van gisteren gaat niet meer af').toBe(1);
        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'de tijdzone omzetten tussen het vastleggen en de rollover levert niets op',
      async () => {
        // ⚠️ **De aanval zelf, end-to-end.** `profiles.tz` staat in de
        //    UPDATE-kolomgrant van `authenticated`, en zowel `mijn_datum()` als
        //    de datum die de rollover meegeeft komt eruit. `Etc/GMT+12` en
        //    `Etc/GMT-14` liggen 26 uur uit elkaar, dus hun datums verschillen
        //    altijd minstens één dag — er is geen uur waarop dit niet werkte.
        const west = await w.alice.db.from('profiles').update({ tz: 'Etc/GMT+12' }).eq('id', w.alice.id);
        expect(west.error, `tz naar west: ${west.error?.message}`).toBeNull();

        const eigenDatum = await adminDb().rpc('eigenaarsdatum', { uid: w.alice.id });
        const doel = await w.alice.db
          .from('goals')
          .insert({
            owner_id: w.alice.id,
            title: 'DAG tijdzonetruc',
            target_date: eigenDatum.data as string,
          })
          .select('id')
          .single();
        if (doel.error || doel.data === null) {
          throw new Error(`doel op de eigen datum: ${doel.error?.message}`);
        }

        const straf = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: doel.data.id as string,
            type: 'penalty',
            body: 'DAG straf via de tijdzonetruc',
            beneficiary_user_id: w.bob.id,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (straf.error || straf.data === null) throw new Error(`straf: ${straf.error?.message}`);

        const oost = await w.alice.db.from('profiles').update({ tz: 'Etc/GMT-14' }).eq('id', w.alice.id);
        expect(oost.error, `tz naar oost: ${oost.error?.message}`).toBeNull();

        const oostDatum = await adminDb().rpc('eigenaarsdatum', { uid: w.alice.id });
        const uitkomst = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: w.alice.id,
          p_vandaag: oostDatum.data as string,
        });
        expect(uitkomst.data, 'de tijdzonetruc heeft een straf laten afgaan').toBe(0);
        expect(await standVan(straf.data.id as string)).toBe('set');

        // De tijdzone terugzetten, anders rekent de rest van deze suite mee in
        // een andere dag dan `w.vandaag`.
        const terug = await adminDb().from('profiles').update({ tz: 'UTC' }).eq('id', w.alice.id);
        expect(terug.error).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een verlopen deadline-verzoek verschuift niets', () => {
    /**
     * ⚠️ **De goedkeuring mag niet de trekker van een commitment device zijn.**
     *    0170 liet `beslis_deadline_verzoek()` bewust buiten de datumgrens — een
     *    verzoek mag niet stranden doordat een buddy er een week over doet — en
     *    zag daarbij één ding over het hoofd: staat er een straf op het doel, dan
     *    laat die goedkeuring hem afgaan terwijl de aanvrager niets deed.
     *    Domeinregel 5 en 11 tegelijk.
     */
    async function verzoekOp(titel: string, nieuweDatum: IsoDate): Promise<{ doelId: string; verzoekId: string }> {
      const doel = await adminDb()
        .from('goals')
        .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 60) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
      const doelId = doel.data.id as string;

      const koppel = await adminDb()
        .from('goal_group_links')
        .insert({ goal_id: doelId, group_id: w.groupId });
      if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);

      // Het verzoek zelf gaat via de RPC, met een datum die dan nog geldig is —
      // dat is precies het geval: geldig bij het indienen.
      const gevraagd = await w.alice.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: doelId,
        p_group_id: w.groupId,
        p_new_date: addDays(w.vandaag, 10),
        p_reason: 'Ik heb wat meer tijd nodig voor dit doel, om hele goede redenen.',
      });
      if (uit(gevraagd.data).ok !== true) throw new Error(`verzoek: ${JSON.stringify(gevraagd.data)}`);

      const verzoek = await adminDb()
        .from('deadline_requests')
        .select('id')
        .eq('goal_id', doelId)
        .single();
      if (verzoek.error) throw new Error(`verzoek ophalen: ${verzoek.error.message}`);

      // En dan verstrijkt de gevraagde datum terwijl de buddy nog nadenkt.
      const verlopen = await adminDb()
        .from('deadline_requests')
        .update({ new_date: nieuweDatum })
        .eq('id', verzoek.data.id);
      if (verlopen.error) throw new Error(`verlopen laten raken: ${verlopen.error.message}`);

      return { doelId, verzoekId: verzoek.data.id as string };
    }

    it(
      'een goedkeuring kan de streefdatum niet naar het verleden zetten',
      async () => {
        const { doelId, verzoekId } = await verzoekOp('VERZOEK verlopen', addDays(w.vandaag, -2));

        const beslist = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(uit(beslist.data).ok).toBe(false);
        expect(uit(beslist.data).reason).toBe('verzoek_verlopen');

        const doel = await adminDb().from('goals').select('target_date').eq('id', doelId).single();
        expect(doel.data?.target_date, 'de streefdatum staat in het verleden').toBe(
          addDays(w.vandaag, 60),
        );

        // ⚠️ En het verzoek is niet stilletjes als beslist weggeschreven: de
        //    goedkeurder heeft zijn knop niet verbruikt aan een weigering.
        const verzoek = await adminDb()
          .from('deadline_requests')
          .select('status')
          .eq('id', verzoekId)
          .single();
        expect(verzoek.data?.status).toBe('open');
      },
      TEST_TIMEOUT,
    );

    it(
      'een verzoek waarvan de datum nog niet voorbij is, wordt gewoon ingewilligd',
      async () => {
        // ⚠️ De must-allow, en de reden dat de weigering smal is. Een buddy die er
        //    een week over doet bij een datum drie weken verderop, verandert niets.
        const { doelId, verzoekId } = await verzoekOp('VERZOEK op tijd', addDays(w.vandaag, 20));

        const beslist = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(uit(beslist.data).ok, `hoort ingewilligd te worden: ${JSON.stringify(beslist.data)}`)
          .toBe(true);

        const doel = await adminDb().from('goals').select('target_date').eq('id', doelId).single();
        expect(doel.data?.target_date).toBe(addDays(w.vandaag, 20));
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de kolommen die deze grenzen dragen, staan niet in de UPDATE-grant', () => {
    /**
     * ⚠️ **Twee routes uit de security-ronde zijn dicht door een kolomgrant en
     *    niet door een policy, en niets legde die grant vast.** Gemeten in
     *    `information_schema.column_privileges`: `authenticated` mag op
     *    `commitments` alleen `body, image_url, status` bijwerken en op `goals`
     *    niet `target_date`. Dáárom mislukken de reward→penalty-flip en het
     *    rechtstreeks verzetten van de streefdatum — `commitments_update` heeft
     *    geen enkele toets op `type` en geen datumconjunct.
     *
     * ⚠️ **Waarom dit een test is en geen aantekening.** Komt er ooit een scherm
     *    "bewerk je doel" of "wijzig je commitment", dan is de grant het eerste
     *    wat verruimd wordt, en dan valt de grens van 0170 stil om — de policy
     *    die dan overneemt, bestaat niet. Deze test wordt rood op het moment dat
     *    het gebeurt, en niet pas bij de volgende security-ronde.
     *
     * ⚠️ Toetst de kolom en niet de hele lijst: een lijst die per migratie
     *    verandert, leer je bij te werken zonder te lezen. Dit zijn de twee
     *    kolommen waar een grens aan hangt.
     */
    function magSchrijven(tabel: string, kolom: string, recht: 'INSERT' | 'UPDATE'): boolean {
      const uit = psql(
        `select count(*) from information_schema.column_privileges ` +
          `where grantee = 'authenticated' and table_name = '${tabel}' ` +
          `and column_name = '${kolom}' and privilege_type = '${recht}'`,
      );
      return uit.trim() !== '0';
    }

    function magBijwerken(tabel: string, kolom: string): boolean {
      return magSchrijven(tabel, kolom, 'UPDATE');
    }

    it(
      'een gebruiker kan `commitments.type` niet bijwerken, dus geen beloning naar straf flippen',
      () => {
        expect(
          magBijwerken('commitments', 'type'),
          'commitments.type staat in de UPDATE-grant — de reward-naar-penalty-flip is open, ' +
            'en `commitments_update` toetst `type` nergens',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'een gebruiker kan `goals.target_date` niet rechtstreeks bijwerken',
      () => {
        expect(
          magBijwerken('goals', 'target_date'),
          'goals.target_date staat in de UPDATE-grant — dan is de datumgrens van ' +
            '`zet_streefdatum()` en `vraag_deadline_verschuiving()` om te lopen met één PATCH',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'een gebruiker kan de klok van een commitment ook niet bijwerken',
      () => {
        // ⚠️⚠️ **Dit is de UPDATE-kant van het wachtvenster, en die stond er
        //    eerst niet — terwijl de motivatie van de policyconjunct in 0172
        //    letterlijk een "bewerk je commitment"-scherm noemt.** Zo'n scherm
        //    vraagt een UPDATE-recht, en `commitments_update` heeft géén
        //    klokconjunct. Gemeten: met `update (created_at, confirmed_at)` staat
        //    het wachtvenster van 0171 weer op nul langs die kant.
        //
        //    Voor de UPDATE draagt de kolomgrant het dus alléén. Dat is
        //    verdedigbaar, maar het hoort gemeten te zijn en niet aangenomen —
        //    dat onderscheid is deze branch vier rondes lang duur geweest.
        expect(
          magBijwerken('commitments', 'created_at'),
          'commitments.created_at staat in de UPDATE-grant — het wachtvenster van 0171 ' +
            'is dan met één PATCH terug te zetten, en `commitments_update` toetst de klok niet',
        ).toBe(false);
        expect(
          magBijwerken('commitments', 'confirmed_at'),
          'commitments.confirmed_at staat in de UPDATE-grant — dan kiest de client achteraf ' +
            'wanneer hij volgens de administratie ja gezegd heeft (domeinregel 5)',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'de kolommen die wél bijgewerkt mogen worden, zijn er ook echt',
      () => {
        // ⚠️ De must-allow, en niet cosmetisch: zou `magBijwerken()` altijd
        //    `false` teruggeven — een tikfout in de query, een lege uitkomst —
        //    dan zijn de twee tests hierboven groen zonder iets te meten.
        expect(magBijwerken('commitments', 'body')).toBe(true);
        expect(magBijwerken('goals', 'title')).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een gebruiker kan `commitments.created_at` niet meesturen bij het aanmaken',
      () => {
        // ⚠️⚠️ **Dit blok toetste alleen UPDATE, en dáár zat de fout.** De
        //    24-uursgrendel van 0171 hangt aan `created_at`, en die kolom stond
        //    gewoon in de INSERT-grant — de standaard die Supabase uitdeelt en
        //    die 0057 alleen voor UPDATE versmalde. Eén veld in de POST-body en
        //    het wachtvenster stond op nul. 0172 versmalt de INSERT-grant.
        expect(
          magSchrijven('commitments', 'created_at', 'INSERT'),
          'commitments.created_at staat in de INSERT-grant — dan kiest de client ' +
            'zijn eigen wachtvenster en is de grendel van 0171 nul waard',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'de kolommen die de client wél moet kunnen meesturen, kan hij nog steeds meesturen',
      () => {
        // ⚠️ De must-allow op de versmalling zelf. Een `revoke insert` zonder de
        //    juiste `grant` erna breekt elk scherm dat een commitment vastlegt,
        //    en dat is geen theoretisch risico — het is precies wat een te grove
        //    versmalling doet.
        for (const kolom of ['goal_id', 'type', 'body', 'beneficiary_user_id', 'confirmed_at']) {
          expect(magSchrijven('commitments', kolom, 'INSERT'), `${kolom} is weggevallen`).toBe(true);
        }
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de klok van een commitment is niet van de client', () => {
    /**
     * ⚠️ **Het tweede slot op dezelfde belofte, en het bestaat omdat het eerste
     *    een grant is.** Een grant overleeft het volgende "bewerk je
     *    commitment"-scherm niet; deze conjunct in `commitments_insert` wel.
     *
     * ⚠️⚠️ **Dáárom zet dit blok de INSERT-grant tijdelijk terug open.** Met de
     *    versmalde grant erop stuiten deze inserts op een permissiefout en niet
     *    op de policy — ze zouden groen zijn met de conjunct er volledig uit.
     *    Dat is precies waar CLAUDE.md bij regel 18 voor waarschuwt: een ijking
     *    die zijn geval door een pad voert dat een éérdere grendel al afvangt,
     *    bewaakt niets van wat hij belooft. Het geval dat hier getoetst wordt is
     *    *"stel dat de grant ooit terugkomt"*, dus hoort de grant tijdens deze
     *    tests terug te zijn.
     *
     * ⚠️ De grant van de tests hierboven blijft daarmee heel: die draaien in een
     *    eigen `describe` en meten `information_schema` en niet een insert.
     *    Vitest draait de bestanden in deze suite niet parallel
     *    (`fileParallelism: false`), dus er is geen andere test die tijdens dit
     *    venster een commitment aanmaakt.
     */
    beforeAll(() => {
      psql('grant insert (created_at) on public.commitments to authenticated');
    });

    afterAll(() => {
      psql('revoke insert (created_at) on public.commitments from authenticated');
    });

    it(
      'een straf met een teruggedateerde `created_at` komt er niet in',
      async () => {
        const doelId = await versDoel('KLOK teruggedateerd');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'KLOK straf uit 2020',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
          created_at: '2020-01-01T00:00:00Z',
        });

        expect(poging.error, 'een teruggedateerde straf is erdoor gekomen').not.toBeNull();

        const rijen = await adminDb().from('commitments').select('id').eq('goal_id', doelId);
        expect(rijen.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'en een `created_at` ver in de toekomst ook niet',
      async () => {
        // ⚠️ **Niet cosmetisch.** Een straf met een `created_at` van volgend jaar
        //    stelt het wachtvenster van 0171 een jaar uit — dat is je eigen
        //    commitment device ontlopen, en domeinregel 5 gaat daar precies over.
        const doelId = await versDoel('KLOK toekomst');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'KLOK straf van volgend jaar',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
          created_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        });

        expect(poging.error, 'een straf uit de toekomst is erdoor gekomen').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een teruggedateerde `confirmed_at` komt er ook niet in',
      async () => {
        // ⚠️ `confirmed_at` ís de bevestiging waar domeinregel 5 om vraagt.
        //    Een client die hem vrij kiest, kiest wanneer hij volgens de
        //    administratie ja gezegd heeft.
        const doelId = await versDoel('KLOK bevestiging');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'KLOK straf met oude bevestiging',
          beneficiary_user_id: w.bob.id,
          confirmed_at: '2020-01-01T00:00:00Z',
        });

        expect(poging.error, 'een teruggedateerde bevestiging is erdoor gekomen').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een gewone straf, zonder klok in de body, kan gewoon',
      async () => {
        // ⚠️ De must-allow. Zonder haar is de conjunct "geen enkele straf mag",
        //    en dat is groen op precies dezelfde manier.
        const doelId = await versDoel('KLOK gewoon');

        const poging = await w.alice.db.from('commitments').insert({
          goal_id: doelId,
          type: 'penalty',
          body: 'KLOK gewone straf',
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        });

        expect(poging.error, `een gewone straf hoort te mogen: ${poging.error?.message}`).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('een straf wacht op de groep, maar niet eeuwig', () => {
    /**
     * ⚠️ **De belofte is dat een straf niet verschuldigd wordt terwijl de groep
     *    nog over de streefdatum beslist** — QS8-307, migratie 0174. Gemeten
     *    voordat er iets veranderde, in één transactie op de lokale stack, met
     *    een doel waarvan de datum gisteren lag en een straf van tien dagen oud:
     *
     *      A open verzoek op het doel | 1
     *      B verschuldigd gemaakt     | 1
     *      C status van de straf      | due
     *      D verzoek nog open         | 1
     *
     *    `deadline_requests` kwam in `maak_straffen_verschuldigd()` niet voor.
     *    Sinds QS8-298 stuurt dat de getuige een pushmelding die niet terug te
     *    nemen is, en door de ontdubbeling op `ref_id` krijgt hij bij de échte
     *    verschuldiging niets meer.
     *
     * ⚠️⚠️ **Deze tests lopen door de RPC's en niet langs de tabel, en dat is
     *    een reparatie uit de security-ronde.** De eerste versie zette elke rij
     *    met `adminDb()` in `deadline_requests` — status en ouderdom met de
     *    hand — en was daarmee blind voor de enige vraag die hier telt: welke
     *    knoppen heeft de eigenaar? Er zitten er twee, *intrekken* en *opnieuw
     *    vragen*, en met die twee was de eerste versie van de grens te
     *    verzetten. Regel 18 vraag 5, en de tests hadden hem niet gesteld.
     *
     * ⚠️ **De grens op het uitstel hangt daarom aan `goals.target_date`.** Die
     *    kolom staat niet in de UPDATE-grant van `authenticated` en beweegt
     *    alleen met het akkoord van een buddy; alles in `deadline_requests`
     *    kan de eigenaar zelf vernieuwen. Een straf wacht dus hooguit een week
     *    op de groep, ongeacht hoeveel verzoeken er langskomen.
     *
     * ⚠️ **Met de hand rood gemaakt, grendel voor grendel**, door de functie in
     *    de draaiende database te vervangen door een variant zonder die ene
     *    regel:
     *
     *      1. de hele `not exists` eruit            → 'een open verzoek houdt
     *                                                  de straf tegen' rood
     *      2. `r.new_date >= p_vandaag` eruit       → 'niets meer kan
     *                                                  verschuiven' rood
     *      3. de weekgrens eruit                    → 'intrekken en opnieuw
     *                                                  vragen' rood
     *      4. de geneste afwijzingstak eruit        → 'na een afwijzing' rood
     *      5. de weekgrens náást de `not exists`    → 'deadline al lang
     *         in plaats van erin                       voorbij' rood (én 3)
     *
     *    Elke mutatie maakte precies de test rood die hem noemt. Eén mutatie
     *    voor de hele conjunct zou 2, 3 en 4 niet hebben geraakt: die vallen
     *    allemaal binnen het geval dat 1 al afvangt.
     *
     * ⚠️ **Wat hier níét in zit — twee dingen, allebei gemeten en allebei een
     *    eigen issue.** Een verzoek mag ingediend worden in élke groep waar de
     *    eigenaar lid van is, ook een groep van één waar de begunstigde het
     *    niet ziet (QS8-309; de weekgrens kapt de schade af, de onzichtbaarheid
     *    niet). En wordt een verzoek ná die week alsnog goedgekeurd, dan staat
     *    de straf al op `due` en zet `beslis_deadline_verzoek()` hem niet terug
     *    (QS8-308).
     */

    /** Een doel met een straf erop, waarvan de streefdatum al voorbij is. */
    async function wereldMetStraf(
      titel: string,
      dagenOverTijd: number,
    ): Promise<{ doelId: string; strafId: string }> {
      const doel = await adminDb()
        .from('goals')
        .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
      const doelId = doel.data.id as string;

      const koppel = await adminDb()
        .from('goal_group_links')
        .insert({ goal_id: doelId, group_id: w.groupId });
      if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);

      const straf = await w.alice.db
        .from('commitments')
        .insert({
          goal_id: doelId,
          type: 'penalty',
          body: `${titel} straf`,
          beneficiary_user_id: w.bob.id,
          confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);

      // ⚠️ Ouder dan een dag, anders houdt de grendel van 0171 hem al tegen en
      //    meet geen van deze tests wat hij belooft te meten. Dat is de fout
      //    waar CLAUDE.md voor waarschuwt: een ijking die zijn geval door een
      //    pad voert dat een éérdere grendel al afvangt.
      const ouder = await adminDb()
        .from('commitments')
        .update({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
        .eq('id', straf.data.id as string);
      if (ouder.error) throw new Error(`ouder maken: ${ouder.error.message}`);

      // En dan verstrijkt de tijd. Via `adminDb()`, want dat is het verlopen
      // van tijd en niet een handeling die getoetst wordt.
      const verzet = await adminDb()
        .from('goals')
        .update({ target_date: addDays(w.vandaag, -dagenOverTijd) })
        .eq('id', doelId);
      if (verzet.error) throw new Error(`verzetten: ${verzet.error.message}`);

      return { doelId, strafId: straf.data.id as string };
    }

    /**
     * Alice vraagt om een verschuiving — langs de knop die er echt is.
     *
     * ⚠️ De dagteller van `vraag_deadline_verschuiving()` staat op vijf per
     *    etmaal en deze suite dient er meer in dan dat. De álréeds afgesloten
     *    verzoeken worden daarom eerst teruggedateerd. Dat raakt niets van wat
     *    hier getoetst wordt: sinds de security-ronde hangt de grens op het
     *    uitstel aan `goals.target_date` en niet meer aan `created_at`.
     */
    async function vraagVerschuiving(doelId: string, nieuweDatum: string): Promise<string> {
      const ruimte = await adminDb()
        .from('deadline_requests')
        .update({ created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('requester_id', w.alice.id);
      if (ruimte.error) throw new Error(`dagteller: ${ruimte.error.message}`);

      const antwoord = await w.alice.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: doelId,
        p_group_id: w.groupId,
        p_new_date: nieuweDatum,
        p_reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
      });
      const d = (antwoord.data ?? {}) as { ok?: boolean; request_id?: string; reason?: string };
      if (d.ok !== true || !d.request_id) throw new Error(`verzoek: ${JSON.stringify(antwoord.data)}`);
      return d.request_id;
    }

    async function rollover(): Promise<void> {
      const uitkomst = await adminDb().rpc('maak_straffen_verschuldigd', {
        p_owner_id: w.alice.id,
        p_vandaag: w.vandaag,
      });
      if (uitkomst.error) throw new Error(`rollover: ${uitkomst.error.message}`);
    }

    async function standVan(strafId: string): Promise<string> {
      const rij = await adminDb().from('commitments').select('status').eq('id', strafId).single();
      if (rij.error) throw new Error(`status: ${rij.error.message}`);
      return rij.data.status as string;
    }

    it(
      'een open verzoek houdt de straf tegen',
      async () => {
        const { doelId, strafId } = await wereldMetStraf('VERZOEK open', 1);
        await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        await rollover();

        expect(await standVan(strafId)).toBe('set');
      },
      TEST_TIMEOUT,
    );

    it(
      'zonder verzoek gaat diezelfde straf gewoon af',
      async () => {
        // ⚠️ De must-allow. Zonder haar is de conjunct "straffen gaan nooit af",
        //    en dat is groen op precies dezelfde manier.
        const { strafId } = await wereldMetStraf('VERZOEK geen', 1);

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'ook een straf waarvan de deadline al lang voorbij is, gaat gewoon af',
      async () => {
        // ⚠️ **De tweede must-allow, en die staat er omdat de eerste versie van
        //    deze grens er níet was.** De weekgrens stond eerst náást de
        //    `not exists` in plaats van erin, en dan is hij een voorwaarde op
        //    élke straf: een deadline van langer dan een week geleden zou dan
        //    nooit meer tot een straf leiden, ook zonder dat er ooit een
        //    verzoek was. Geen van de andere tests ziet dat, want die zetten de
        //    datum allemaal op gisteren.
        const { strafId } = await wereldMetStraf('VERZOEK oude deadline', 40);

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **Dit is de naad, en niet "een verlopen verzoek telt niet mee".**
     *    `beslis_deadline_verzoek()` weigert sinds 0171 een akkoord zodra
     *    `new_date` voorbij is, en laat de rij `open` staan. Zou alleen
     *    `status = 'open'` de straf tegenhouden, dan bestaat er een toestand
     *    waarin het verzoek de datum niet meer kán verschuiven en de straf
     *    tóch blijft wachten — twee correcte onderdelen, en een geheel dat
     *    vastloopt. Deze test toetst allebei de kanten in één geval, want dát
     *    is de belofte.
     */
    it(
      'een verzoek dat niets meer kan verschuiven, houdt de straf ook niet meer tegen',
      async () => {
        const { doelId, strafId } = await wereldMetStraf('VERZOEK verlopen', 1);
        const verzoekId = await vraagVerschuiving(doelId, addDays(w.vandaag, 2));

        // De gevraagde datum verstrijkt. Via `adminDb()`: dat is het verlopen
        // van tijd, en de RPC weigert een datum in het verleden bij het
        // indienen — daar staat 0170 voor.
        const verlopen = await adminDb()
          .from('deadline_requests')
          .update({ new_date: addDays(w.vandaag, -1) })
          .eq('id', verzoekId);
        expect(verlopen.error, `verlopen laten: ${verlopen.error?.message}`).toBeNull();

        const beslissing = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });
        expect(uit(beslissing.data).reason, 'de verlooptak van 0171 hoort te weigeren').toBe(
          'verzoek_verlopen',
        );

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **De uitkoopknop, en hij was er echt.** De eerste versie van deze
     *    grens stond op `deadline_requests.created_at`. Gemeten als gewone
     *    gebruiker, op een doel waarvan de streefdatum zestig dagen achter ons
     *    lag: intrekken → opnieuw vragen → de straf staat weer stil. Twee
     *    knoppen die allebei al in `src/modules/goals/deadline.ts` zitten, geen
     *    akkoord van wie dan ook nodig, en de dagteller van vijf verzoeken bijt
     *    niet bij één vernieuwing per week. Dat is precies de fout die QS8-293
     *    drie rondes lang maakte: een grens leggen op iets dat de eigenaar zelf
     *    kan verzetten.
     */
    it(
      'intrekken en opnieuw vragen rekt het uitstel niet op',
      async () => {
        const { doelId, strafId } = await wereldMetStraf('VERZOEK vernieuwd', 9);
        const eerste = await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        const ingetrokken = await w.alice.db.rpc('trek_deadline_verzoek_in', {
          p_request_id: eerste,
        });
        expect(uit(ingetrokken.data).ok, 'intrekken hoort te mogen').toBe(true);

        await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **Een nee van de groep blijft een nee.** Gemeten in dezelfde ronde: de
     *    groep wijst af, de eigenaar dient meteen een nieuw verzoek in, en de
     *    straf staat weer stil. De groep doet dan precies wat de bedoeling is
     *    en houdt er niets aan over.
     */
    it(
      'na een afwijzing houdt een nieuw verzoek de straf niet opnieuw tegen',
      async () => {
        const { doelId, strafId } = await wereldMetStraf('VERZOEK afgewezen', 2);
        const eerste = await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        const afwijzing = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: eerste,
          p_akkoord: false,
        });
        expect(uit(afwijzing.data).ok, 'afwijzen hoort te mogen').toBe(true);

        await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        await rollover();

        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'en een goedgekeurde verschuiving laat de straf gewoon met rust',
      async () => {
        // ⚠️ De must-allow op de afwijzingsconjunct: die kijkt naar
        //    `old_date = g.target_date`, dus een goedkeuring hoort niets te
        //    blokkeren en niets te laten afgaan.
        const { doelId, strafId } = await wereldMetStraf('VERZOEK goedgekeurd', 1);
        const verzoekId = await vraagVerschuiving(doelId, addDays(w.vandaag, 30));

        const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });
        expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);

        await rollover();

        expect(await standVan(strafId)).toBe('set');
      },
      TEST_TIMEOUT,
    );
  });
});
