/**
 * Wie om uitstel gevraagd wordt, ziet de straf — QS8-370, migratie 0213.
 *
 * ⚠️ **De belofte en niet de tak.** Acceptatiecriterium 2 van het issue vraagt
 *    er letterlijk om: *er is geen route waarlangs een straf op `set` vooruit
 *    schuift zonder dat degene die het toestaat weet dat hij dat doet.* Deze
 *    suite toetst dus niet dat `commitments_select` vier takken heeft, maar dat
 *    het lid dat op "Akkoord" drukt de straf kán lezen op het moment dat hij
 *    drukt — en dat hij hem daarna nog steeds kan lezen.
 *
 * ⚠️ **Waarom de rem van 0184 hier níet bijkomt.** `zet_streefdatum()` weigert
 *    een straf op `set` vooruit te schuiven; `beslis_deadline_verzoek()` doet
 *    dat met opzet niet. Diezelfde toets alsnog in de groepsroute leggen is
 *    gebouwd en gemeten: 📏 tien bestaande tests werden rood, waaronder twee
 *    must-allows in `straf-plafond.test.ts` — de groepsroute *is* de uitweg die
 *    0184 openlaat. Wat scheef stond is dat het akkoord blind was. Zie
 *    `docs/decisions/2026-09-08-de-groepsroute-is-geen-uitweg.md`.
 *
 * ⚠️ **De gemeten uitgangstoestand**, met Bob als beslissend groepslid en een
 *    straf op `set`, allebei de vormen die `commitments` kent:
 *
 *      bob ziet de persoonsstraf (beneficiary_user_id = bob)   = 0
 *      bob ziet de groepsstraf   (beneficiary_group_id = grp)  = 0
 *
 *    Allebei de bestaande takken gaan over de **begunstigde**, en de groep die
 *    beslist hoeft dat niet te zijn: `vraag_deadline_verschuiving()` eist alleen
 *    dat het doel aan die groep gekoppeld is. Vandaar dat de straffen hieronder
 *    een pérsoon als getuige hebben — precies de vorm waarin geen enkele
 *    bestaande tak helpt, en precies de vorm die `straf-plafond.test.ts`
 *    gebruikt.
 *
 * ⚠️ **Vijf grendels, elk apart met de hand rood gemaakt** — mutatie per
 *    grendel, want een ijking die zijn geval door een pad voert dat een eerdere
 *    grendel al afvangt, bewaakt niets. Telkens door de policy in de draaiende
 *    database te vervangen:
 *
 *      1. de vierde tak helemaal weg
 *         → 'de beslisser leest de straf' rood
 *      2. `gevraagd_om_uitstel_op(goal_id)` vervangen door `true`
 *         → 'een groep zonder verzoek leest de straf niet' rood
 *      3. `type = 'penalty'` weggehaald
 *         → 'en de beloning op datzelfde doel blijft privé' rood
 *      4. de helper begrensd op `r.status = 'open'`
 *         → 'en hij blijft de straf lezen nadat er beslist is' rood
 *      5. `and status <> 'cancelled'` aan de tak toegevoegd
 *         → 'ook een ingetrokken straf blijft leesbaar' rood
 *
 *    Grendel 1 en 2 zijn elkaars must-allow: zonder de tweede is "iedereen leest
 *    alles" groen op precies dezelfde manier als de reparatie.
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

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  /** Carol zit in een ándere groep met alice, en wordt nooit iets gevraagd. */
  carol: TestUser;
  gevraagdeGroep: string;
  andereGroep: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string; request_id?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string; request_id?: string };
}

describe.skipIf(!rlsTestsConfigured)('wie om uitstel gevraagd wordt, ziet de straf', () => {
  beforeAll(async () => {
    const alice = await createTestUser('uitstelstraf-alice');
    const bob = await createTestUser('uitstelstraf-bob');
    const carol = await createTestUser('uitstelstraf-carol');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    async function groep(naam: string): Promise<{ id: string; invite_code: string }> {
      const gemaakt = await alice.db.rpc('create_group', { group_name: naam });
      const d = gemaakt.data as unknown as {
        ok?: boolean;
        group?: { id: string; invite_code: string };
      };
      if (d.ok !== true || !d.group) {
        throw new Error(`groep ${naam}: ${JSON.stringify(gemaakt.data)}`);
      }
      return d.group;
    }

    const gevraagd = await groep('Uitstelstraf gevraagde groep');
    const ander = await groep('Uitstelstraf andere groep');

    const meeBob = await bob.db.rpc('join_group_with_code', { code: gevraagd.invite_code });
    if (uit(meeBob.data).ok !== true) throw new Error(`bob: ${JSON.stringify(meeBob.data)}`);

    const meeCarol = await carol.db.rpc('join_group_with_code', { code: ander.invite_code });
    if (uit(meeCarol.data).ok !== true) throw new Error(`carol: ${JSON.stringify(meeCarol.data)}`);

    // ⚠️ Dezelfde reden als in `straf-plafond.test.ts`: `mijn_datum()` rekent in
    //    `profiles.tz` en `vandaag` hierboven is UTC. Tussen 22:00 en 24:00 UTC
    //    lopen die een dag uiteen, en dan verandert deze suite per klok van
    //    uitslag.
    const zone = await adminDb()
      .from('profiles')
      .update({ tz: 'UTC' })
      .in('id', [alice.id, bob.id, carol.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = {
      alice,
      bob,
      carol,
      gevraagdeGroep: gevraagd.id,
      andereGroep: ander.id,
      vandaag,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * Een doel van alice met een straf erop, gekoppeld aan de opgegeven groepen.
   *
   * ⚠️ De straf krijgt **bob** als getuige en niet een groep. Dat is de vorm die
   *    het gat opleverde: geen van de twee bestaande takken van
   *    `commitments_select` laat een gróepslid zo'n straf lezen.
   */
  async function doelMetStraf(
    titel: string,
    groepen: readonly string[],
  ): Promise<{ doelId: string; strafId: string; beloningId: string }> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    const doelId = doel.data.id as string;

    const koppel = await adminDb()
      .from('goal_group_links')
      .insert(groepen.map((group_id) => ({ goal_id: doelId, group_id })));
    if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);

    const straf = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doelId,
        type: 'penalty',
        body: `${titel} straf`,
        beneficiary_user_id: w.bob.id,
        confirmed_at: new Date().toISOString(),
      })
      .select('id, status')
      .single();
    if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);
    // ⚠️ De hele belofte gaat over de stand `set`. Staat die er niet, dan meet
    //    geen van deze tests wat hij belooft te meten.
    expect(straf.data.status, 'een verse straf hoort op `set` te staan').toBe('set');

    const beloning = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doelId,
        type: 'reward',
        body: `${titel} beloning`,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (beloning.error) throw new Error(`beloning ${titel}: ${beloning.error.message}`);

    return {
      doelId,
      strafId: straf.data.id as string,
      beloningId: beloning.data.id as string,
    };
  }

  /** Het verzoek dat de eigenaar zelf indient — de enige route die dit opent. */
  async function vraagUitstel(doelId: string, groepId: string): Promise<string> {
    const antwoord = await w.alice.db.rpc('vraag_deadline_verschuiving', {
      p_goal_id: doelId,
      p_group_id: groepId,
      p_new_date: addDays(w.vandaag, 60),
      p_reason: 'Het project op mijn werk is uitgelopen en dat eet al mijn avonden op.',
    });
    const d = uit(antwoord.data);
    if (d.ok !== true || typeof d.request_id !== 'string') {
      throw new Error(`verzoek: ${JSON.stringify(antwoord.data)}`);
    }
    return d.request_id;
  }

  /**
   * Wat deze gebruiker van deze commitment leest.
   *
   * ⚠️ **`error` wordt gecontroleerd en niet alleen de lengte.** Een lege lijst
   *    is ook wat je krijgt als het leesrecht op de hele tabel wegvalt, en dan
   *    is élke verwachting hieronder groen om de verkeerde reden. Dat is de
   *    bevinding uit de security-ronde van QS8-362.
   */
  async function leest(wie: TestUser, commitmentId: string): Promise<number> {
    const uitkomst = await wie.db.from('commitments').select('id, body').eq('id', commitmentId);
    expect(uitkomst.error, `lezen mislukte: ${uitkomst.error?.message}`).toBeNull();
    return (uitkomst.data ?? []).length;
  }

  // -------------------------------------------------------------------------
  describe('het akkoord is niet blind', () => {
    it(
      'de beslisser leest de straf op het doel waarover hij gevraagd wordt',
      async () => {
        const { doelId, strafId } = await doelMetStraf('UITSTEL gevraagd', [w.gevraagdeGroep]);

        expect(
          await leest(w.bob, strafId),
          'vóór het verzoek is er niets gevraagd en hoort bob niets te zien',
        ).toBe(0);

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await leest(w.bob, strafId),
          'bob wordt gevraagd deze afspraak losser te maken; dan hoort hij te zien wat er staat',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groep zonder verzoek leest de straf niet',
      async () => {
        // ⚠️ **De must-allow van de vorige test, van de andere kant.** Zonder
        //    deze is "iedereen leest alles" groen op precies dezelfde manier als
        //    de reparatie. Carol deelt een groep met alice en het doel hangt
        //    erin; wat ontbreekt is uitsluitend het verzoek.
        const { doelId, strafId } = await doelMetStraf('UITSTEL andere groep', [
          w.gevraagdeGroep,
          w.andereGroep,
        ]);

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await leest(w.carol, strafId),
          'carols groep is niets gevraagd, dus zij hoort deze straf niet te zien',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'en de beloning op datzelfde doel blijft privé',
      async () => {
        // ⚠️ Een beloning heeft geen rem van 0184 en er valt niets aan te
        //    ontsnappen. Hem meenemen zou een verruiming zijn die niemand
        //    gevraagd heeft — en dit is de enige test die dat merkt.
        const { doelId, beloningId } = await doelMetStraf('UITSTEL beloning', [w.gevraagdeGroep]);

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await leest(w.bob, beloningId),
          'de beloning van een ander gaat de beslisser niets aan',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'ook een ingetrokken straf blijft leesbaar, en dat draagt de waarschuwing',
      async () => {
        // ⚠️ **De naad tussen de policy en de tekst op het scherm.** De vierde
        //    tak kent geen statuslijst, dus `wordtZichtbaarBijUitstelverzoek()`
        //    in de client mag er ook geen hebben. Zonder deze meting is die
        //    keuze een aanname: een grens die alleen in een JSDoc staat, is geen
        //    grens. Zie `tests/beloftes/uitstelbeslisser-krijgt-het-te-zien.test.ts`.
        const { doelId, strafId } = await doelMetStraf('UITSTEL ingetrokken', [
          w.gevraagdeGroep,
        ]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        const ingetrokken = await adminDb()
          .from('commitments')
          .update({ status: 'cancelled' })
          .eq('id', strafId);
        expect(ingetrokken.error, `intrekken: ${ingetrokken.error?.message}`).toBeNull();

        expect(
          await leest(w.bob, strafId),
          'het scherm waarschuwt bij élke straf, dus de policy hoort er ook geen uit te sluiten',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'en hij blijft de straf lezen nadat er beslist is',
      async () => {
        // ⚠️ **Dit is de naad, en niet "een open verzoek opent het oppervlak".**
        //    Een oppervlak dat dichtklapt zodra er beslist is, neemt de
        //    beslisser het zicht af op wat hij zojuist heeft toegestaan — het
        //    tegendeel van "auditeerbaar" uit domeinregel 5. En het is de kant
        //    die je bij het bouwen niet vanzelf raakt: elk onderdeel klopt op
        //    het moment van drukken.
        const { doelId, strafId } = await doelMetStraf('UITSTEL na besluit', [w.gevraagdeGroep]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);

        const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });
        expect(uit(akkoord.data).ok, `beslissen: ${JSON.stringify(akkoord.data)}`).toBe(true);

        expect(
          await leest(w.bob, strafId),
          'wat je hebt toegestaan, blijf je zien — anders is het akkoord niet terug te vinden',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );
  });
});
