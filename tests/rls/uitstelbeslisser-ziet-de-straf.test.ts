/**
 * Wie om uitstel gevraagd wordt, ziet de straf — QS8-370, migratie 0218.
 *
 * ⚠️ **De belofte en niet de tak.** Acceptatiecriterium 2 van het issue vraagt
 *    er letterlijk om: *er is geen route waarlangs een straf op `set` vooruit
 *    schuift zonder dat degene die het toestaat weet dat hij dat doet.* Deze
 *    suite toetst dus niet hoe `straffen_bij_uitstelverzoek()` van binnen
 *    gebouwd is, maar dat het lid dat op "Akkoord" drukt wéét dat er een straf
 *    hangt aan wat hij toestaat — op het moment dat hij drukt en daarna.
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
 * ⚠️⚠️ **Dit was een policy en is een RPC geworden, en dat is de uitkomst van
 *    de security-ronde van 09-09-2026.** De eerste versie zette een vierde tak
 *    op `commitments_select`. 📏 Drie metingen wezen hem af, en alle drie zijn
 *    ze nagemeten voordat ze verwerkt werden:
 *
 *      bob leest body + image_url + beneficiary_user_id   = 1
 *      bob leest de straf op stand `due`                  = 1
 *      bob leest de straf na `delete from goal_group_links` = 1  (het doel = 0)
 *
 *    De tweede is de zwaarste: `due` betekent "de streefdatum niet gehaald", en
 *    de gevraagde groep is meestal niet de begunstigde. Dat is het
 *    schaamtemoment waar domeinregel 7 voor bestaat, in een beschermde groep en
 *    buiten de drie routes om. `straffen_bij_uitstelverzoek()` geeft daarom
 *    alleen `goal_id` terug — en dan verandert er bij `due` per constructie
 *    niets, want dat doel stond er al in.
 *
 * ⚠️ **Twaalf grendels, elk apart met de hand rood gemaakt** — mutatie per
 *    grendel, want een ijking die zijn geval door een pad voert dat een eerdere
 *    grendel al afvangt, bewaakt niets. Telkens door de functie, de trigger of
 *    de policy in de draaiende database te vervangen:
 *
 *       1. `exists (…)` (de hele verzoekvoorwaarde) weg
 *          → drie tests rood, waaronder 'een groep zonder verzoek weet van niets'
 *       2. `c.type = 'penalty'` weg
 *          → 'en de beloning op datzelfde doel blijft buiten beeld' rood
 *       3. `c.status <> 'cancelled'` weg
 *          → 'een ingetrokken straf telt niet mee' rood
 *       4. `shares_group_with_goal(c.goal_id)` weg
 *          → 'de bit leeft niet langer dan het doel waar hij over gaat' rood
 *       5. `r.status <> 'withdrawn'` weg
 *          → 'een ingetrokken verzoek telt niet' rood
 *       6. `r.status <> 'withdrawn'` → `r.status in ('open','approved')`
 *          → 'na een afwijzing blijft de beslisser het weten' rood
 *       7. `mag_groep_lezen(r.group_id)` → `true`
 *          → 'een groep zonder verzoek weet van niets' rood
 *       8. de `join` op `goal_group_links` weg
 *          → 'ontkoppelen van de gevráágde groep is genoeg …' rood
 *       9. de lengtegrens weg (terug naar `p_goal_ids[1:100]`)
 *          → 'en weigert een lijst die te lang is …' rood
 *      10. `body`, `image_url` en `status` aan de retourvorm toegevoegd
 *          → 'geeft precies één kolom terug' én 'en langs PostgREST komt er ook
 *            niets anders mee' rood
 *      11. de trigger `goal_group_links_verzoek_intrekken` weg
 *          → 'en ontkoppelen sluit ook de knop' rood
 *      12. de afgewezen vierde tak terug op `commitments_select`
 *          → 'de tekst van de straf gaat niet mee' rood
 *
 *    ⚠️ **Grendel 8 was er eerst een die nergens rood van werd**, en dat is de
 *       leerzaamste van de twaalf. Bij een doel in één groep sluiten
 *       `shares_group_with_goal()` en de `join` allebei tegelijk, en bij een
 *       ópen verzoek doet de trigger van sectie 1 het al vóór allebei. De test
 *       die hem raakt heeft dus een doel in twéé groepen nodig én een verzoek
 *       waarover al beslist is. Zonder die twee eigenschappen stond er een
 *       conjunct in de database die geen enkele test verdedigde.
 *
 *    ⚠️ **Twee tests zijn met opzet dubbel gedekt.** 'ontkoppelen trekt de
 *       toestemming in' en 'een lid dat eruit ligt' worden allebei door meer dan
 *       één conjunct tegengehouden, dus ze worden niet rood van één mutatie. Ze
 *       toetsen de belofte en niet de tak — dat is de bedoeling — maar het is
 *       geen ijking van een afzonderlijke conjunct, en dat hoort hier te staan
 *       in plaats van meegeteld te worden alsof het dat wel is.
 *
 *    Grendel 1 heeft de must-allow van de eerste test naast zich: zonder haar is
 *    "niemand weet ooit iets" groen op precies dezelfde manier als de reparatie.
 *
 * ⚠️⚠️ **Grendel 10 is de duurste, en hij ontbrak.** Het hele argument voor deze
 *    RPC is *"een policy geeft de hele rij weg, deze functie geeft één kolom"*.
 *    📏 Met vier kolommen erbij bleven alle 1378 RLS-tests groen: de belofte
 *    stond in CLAUDE.md, in rij 31 en in het beslisdocument, en nergens in een
 *    grendel. Gevonden door de tweede security-ronde.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import { psql } from './psql-stack';
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

    // ⚠️ **Bob zit in béide groepen, en dat is geen decor.** Zonder die tweede
    //    band is de `join` op `goal_group_links` in de functie niet te
    //    onderscheiden van `shares_group_with_goal()`: bij één groep maakt
    //    ontkoppelen allebei de conjuncten onwaar, en dan is er een grendel die
    //    nergens rood van wordt. Zie 'ontkoppelen van de gevráágde groep is
    //    genoeg' hieronder.
    const bobErbij = await bob.db.rpc('join_group_with_code', { code: ander.invite_code });
    if (uit(bobErbij.data).ok !== true) throw new Error(`bob erbij: ${JSON.stringify(bobErbij.data)}`);

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
    opties: { readonly straf?: boolean } = {},
  ): Promise<{ doelId: string; strafId: string | null }> {
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

    // ⚠️ **Een beloning op élk doel**, ook op de doelen mét straf. Zonder haar
    //    is "de beloning blijft buiten beeld" alleen te meten op een doel dat
    //    verder leeg is, en dan bewijst die test niet dat de conjunct
    //    `type = 'penalty'` iets doet — een functie die álles teruggeeft zou daar
    //    net zo goed op falen.
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

    if (opties.straf === false) return { doelId, strafId: null };

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

    return { doelId, strafId: straf.data.id as string };
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

    // ⚠️ **En dan verstrijkt er een dag.** `vraag_deadline_verschuiving()` staat
    //    vijf verzoeken per aanvrager per etmaal toe (onwrikbare regel 5), en
    //    deze suite dient er meer in dan dat. Via `adminDb()`, want dit is het
    //    verlopen van tijd en niet een handeling die getoetst wordt — dezelfde
    //    vorm als in `straf-plafond.test.ts`. `created_at` speelt verder nergens
    //    in dit pad mee: `beslis_deadline_verzoek()` kijkt naar `new_date`.
    const ouder = await adminDb()
      .from('deadline_requests')
      .update({ created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('id', d.request_id);
    if (ouder.error) throw new Error(`ouder maken: ${ouder.error.message}`);

    return d.request_id;
  }

  /**
   * Wat de RPC deze gebruiker over dit doel vertelt.
   *
   * ⚠️ **`error` wordt gecontroleerd en niet alleen de lengte.** Een lege lijst
   *    is ook wat je krijgt als het uitvoerrecht wegvalt, en dan is élke
   *    verwachting hieronder groen om de verkeerde reden. Dat is de bevinding
   *    uit de security-ronde van QS8-362.
   */
  async function weetVan(wie: TestUser, doelId: string): Promise<boolean> {
    const uitkomst = await wie.db.rpc('straffen_bij_uitstelverzoek', {
      p_goal_ids: [doelId],
    });
    expect(uitkomst.error, `de RPC faalde: ${uitkomst.error?.message}`).toBeNull();
    return (uitkomst.data ?? []).some((rij) => rij.goal_id === doelId);
  }

  /** Wat deze gebruiker rechtstreeks uit `commitments` leest. */
  async function leest(wie: TestUser, commitmentId: string): Promise<number> {
    const uitkomst = await wie.db.from('commitments').select('id, body').eq('id', commitmentId);
    expect(uitkomst.error, `lezen mislukte: ${uitkomst.error?.message}`).toBeNull();
    return (uitkomst.data ?? []).length;
  }

  // -------------------------------------------------------------------------
  describe('het akkoord is niet blind', () => {
    it(
      'de beslisser weet van de straf op het doel waarover hij gevraagd wordt',
      async () => {
        const { doelId } = await doelMetStraf('UITSTEL gevraagd', [w.gevraagdeGroep]);

        expect(
          await weetVan(w.bob, doelId),
          'vóór het verzoek is er niets gevraagd en hoort bob niets te weten',
        ).toBe(false);

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await weetVan(w.bob, doelId),
          'bob wordt gevraagd deze afspraak losser te maken; dan hoort hij te weten dat er een is',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groep zonder verzoek weet van niets',
      async () => {
        // ⚠️ **De must-allow van de vorige test, van de andere kant.** Zonder
        //    deze is "iedereen weet alles" groen op precies dezelfde manier als
        //    de reparatie. Carol deelt een groep met alice en het doel hangt
        //    erin; wat ontbreekt is uitsluitend het verzoek.
        const { doelId } = await doelMetStraf('UITSTEL andere groep', [
          w.gevraagdeGroep,
          w.andereGroep,
        ]);

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await weetVan(w.carol, doelId),
          'carols groep is niets gevraagd, dus zij hoort hier niets van te weten',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'en de beloning op datzelfde doel blijft buiten beeld',
      async () => {
        // ⚠️ Een beloning heeft geen rem van 0184 en er valt niets aan te
        //    ontsnappen. Hem meenemen zou een verruiming zijn die niemand
        //    gevraagd heeft — en dit is de enige test die dat merkt.
        const { doelId } = await doelMetStraf('UITSTEL alleen beloning', [w.gevraagdeGroep], {
          straf: false,
        });

        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await weetVan(w.bob, doelId),
          'op dit doel staat alleen een beloning, en die gaat de beslisser niets aan',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'en hij blijft het weten nadat er beslist is',
      async () => {
        // ⚠️ **Dit is de naad, en niet "een open verzoek opent het oppervlak".**
        //    Een oppervlak dat dichtklapt zodra er beslist is, neemt de
        //    beslisser het zicht af op wat hij zojuist heeft toegestaan — het
        //    tegendeel van "auditeerbaar" uit domeinregel 5. En het is de kant
        //    die je bij het bouwen niet vanzelf raakt: elk onderdeel klopt op
        //    het moment van drukken.
        const { doelId } = await doelMetStraf('UITSTEL na besluit', [w.gevraagdeGroep]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);

        const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });
        expect(uit(akkoord.data).ok, `beslissen: ${JSON.stringify(akkoord.data)}`).toBe(true);

        expect(
          await weetVan(w.bob, doelId),
          'wat je hebt toegestaan, blijf je zien — anders is het akkoord niet terug te vinden',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de vorm van het antwoord ís de belofte', () => {
    it(
      'geeft precies één kolom terug, en dat staat hier en niet alleen in een document',
      () => {
        // ⚠️⚠️ **De duurste bevinding van de tweede security-ronde.** Het hele
        //    argument voor deze RPC is: *een policy geeft de hele rij weg, deze
        //    functie geeft één kolom.* 📏 Die functie is in de draaiende
        //    database vervangen door dezelfde functie met `body`, `image_url`,
        //    `status` en `beneficiary_user_id` erbij, en de volledige RLS-suite
        //    van 1378 tests bleef groen. De belofte stond in CLAUDE.md, in rij
        //    31 en in het beslisdocument — en nergens in een grendel.
        //
        // ⚠️ **Waarom `pg_get_function_result()` en niet een rij uitlezen.** Een
        //    test die kijkt of `data[0]` alleen `goal_id` heeft, meet alleen de
        //    gevallen die hij toevallig produceert; deze meet de handtekening
        //    zelf, ook als er nul rijen terugkomen. En hij is de enige die een
        //    kolom vindt die per ongeluk aan een lege uitkomst hangt.
        expect(
          psql(
            "select pg_get_function_result('public.straffen_bij_uitstelverzoek(uuid[])'::regprocedure)",
          ).trim(),
          'een kolom erbij is een verruiming van dit oppervlak en hoort hier rood te worden',
        ).toBe('TABLE(goal_id uuid)');
      },
      TEST_TIMEOUT,
    );

    it(
      'en langs PostgREST komt er ook niets anders mee',
      async () => {
        // ⚠️ De tweede helft van dezelfde belofte, en met opzet langs een ander
        //    pad: de handtekening hierboven is wat de database zegt, dit is wat
        //    er daadwerkelijk over de lijn gaat. Ze kunnen uiteenlopen — een
        //    view, een `select *` in een latere wrapper — en dan is de eerste
        //    groen en deze rood.
        const { doelId } = await doelMetStraf('UITSTEL kolomvorm', [w.gevraagdeGroep]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        const uitkomst = await w.bob.db.rpc('straffen_bij_uitstelverzoek', {
          p_goal_ids: [doelId],
        });
        expect(uitkomst.error, `de RPC faalde: ${uitkomst.error?.message}`).toBeNull();

        const rijen = uitkomst.data ?? [];
        expect(rijen.length, 'deze opstelling hoort één rij op te leveren').toBe(1);
        expect(
          Object.keys(rijen[0] as Record<string, unknown>),
          'de beslisser hoort het doel te krijgen en verder niets',
        ).toEqual(['goal_id']);
      },
      TEST_TIMEOUT,
    );

    it(
      'en weigert een lijst die te lang is in plaats van hem stil af te kappen',
      async () => {
        // ⚠️ **Fail-closed en niet fail-open.** 📏 Met een slice op honderd gaf
        //    een lijst van 150 met het echte doel op positie 120 nul rijen
        //    terug, zonder fout — en dan verdwijnt de waarschuwing terwijl het
        //    scherm denkt dat het een antwoord heeft. Nu wordt het een fout, en
        //    `fetchStrafDoelen()` maakt daar `null` van: "dit konden we niet
        //    ophalen". Uit de security-ronde.
        const { doelId } = await doelMetStraf('UITSTEL lange lijst', [w.gevraagdeGroep]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        const vulling = Array.from({ length: 150 }, () => crypto.randomUUID());
        const teLang = await w.bob.db.rpc('straffen_bij_uitstelverzoek', {
          p_goal_ids: [...vulling, doelId],
        });

        expect(
          teLang.error,
          'een lijst boven de honderd hoort te weigeren en niet stil af te kappen',
        ).not.toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('en het oppervlak heeft randen', () => {
    it(
      'de tekst van de straf gaat niet mee',
      async () => {
        // ⚠️⚠️ **De must-deny, en de reden dat dit een RPC is en geen policy.**
        //    📏 De eerste versie zette een vierde tak op `commitments_select`, en
        //    toen las ditzelfde groepslid `body`, `image_url` én het id van de
        //    aangewezen getuige met één verzoek aan PostgREST. RLS kan geen
        //    kolommen beperken; deze test is wat die zin afdwingt.
        const { doelId, strafId } = await doelMetStraf('UITSTEL tekst dicht', [
          w.gevraagdeGroep,
        ]);
        await vraagUitstel(doelId, w.gevraagdeGroep);
        if (strafId === null) throw new Error('deze opstelling hoort een straf te hebben');

        expect(
          await weetVan(w.bob, doelId),
          'hij hoort te weten dát er een straf staat',
        ).toBe(true);

        expect(
          await leest(w.bob, strafId),
          'en hij hoort de rij zelf niet te kunnen lezen — daar staat de tekst in',
        ).toBe(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een ingetrokken verzoek telt niet',
      async () => {
        // ⚠️ De onderbouwing van dit oppervlak is "je hebt deze groep gevraagd je
        //    afspraak losser te maken". Bij `withdrawn` heeft de aanvrager dat
        //    zelf teruggenomen vóórdat iemand iets toestond. Uit de
        //    security-ronde van 09-09-2026.
        const { doelId } = await doelMetStraf('UITSTEL ingetrokken verzoek', [
          w.gevraagdeGroep,
        ]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);

        const trekIn = await w.alice.db.rpc('trek_deadline_verzoek_in', {
          p_request_id: verzoekId,
        });
        expect(uit(trekIn.data).ok, `intrekken: ${JSON.stringify(trekIn.data)}`).toBe(true);

        expect(
          await weetVan(w.bob, doelId),
          'wie zijn vraag terugneemt, heeft niets opengezet',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'ontkoppelen trekt de toestemming in',
      async () => {
        // ⚠️ Beslisdocument 002: *"Koppelen is de toestemming (QS8-54) en
        //    ontkoppelen is het intrekken ervan."* De knop heet letterlijk "Niet
        //    meer delen met deze groep". 📏 De policyversie hield hier het
        //    leesrecht open terwijl het dóél al onzichtbaar was — de klasse die
        //    002 "een snapshot die een policy overleeft" noemt.
        //
        //    Dit dekt meteen het vertrek van de eigenaar: `verlaat_groep()` en
        //    `verwijder_lid()` gooien allebei zijn `goal_group_links` weg.
        const { doelId } = await doelMetStraf('UITSTEL ontkoppeld', [w.gevraagdeGroep]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        const los = await adminDb()
          .from('goal_group_links')
          .delete()
          .eq('goal_id', doelId)
          .eq('group_id', w.gevraagdeGroep);
        expect(los.error, `ontkoppelen: ${los.error?.message}`).toBeNull();

        expect(
          await weetVan(w.bob, doelId),
          'het doel is niet meer met deze groep gedeeld, dus er valt niets meer te weten',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'ontkoppelen van de gevráágde groep is genoeg, ook als een andere groep het doel houdt',
      async () => {
        // ⚠️ **De naad tussen de twee conjuncten, en die is bij de ijking
        //    gevonden.** `shares_group_with_goal()` vraagt of je een groep deelt
        //    met dit doel — wélke groep laat hij open. De `join` op
        //    `goal_group_links` vraagt of de gevráágde groep het doel nog
        //    draagt. 📏 Bij een doel in één groep vallen die twee samen, en dan
        //    is de join weg te halen zonder dat één test rood wordt: gemeten.
        //
        //    Hier hangt het doel in twee groepen waar bob allebei lid van is.
        //    Ontkoppelen van de gevraagde groep laat het doel zichtbaar en hoort
        //    de bit toch te sluiten: die groep is niets meer gevraagd over een
        //    doel dat ze niet meer draagt.
        const { doelId } = await doelMetStraf('UITSTEL twee groepen', [
          w.gevraagdeGroep,
          w.andereGroep,
        ]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(await weetVan(w.bob, doelId), 'met beide koppelingen weet bob ervan').toBe(true);

        // ⚠️ **Eerst beslissen en dán ontkoppelen, en die volgorde is de
        //    grendel.** Bij een ópen verzoek trekt de trigger van sectie 1 het
        //    verzoek in, en dan sluit de `withdrawn`-conjunct de bit al — de
        //    `join` is dan niet te onderscheiden. 📏 Gemeten: met een open
        //    verzoek kon de join weg zonder dat één test rood werd. Een beslist
        //    verzoek blijft staan, en dan is de join het enige dat dit sluit.
        const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });
        expect(uit(akkoord.data).ok, `beslissen: ${JSON.stringify(akkoord.data)}`).toBe(true);

        const los = await adminDb()
          .from('goal_group_links')
          .delete()
          .eq('goal_id', doelId)
          .eq('group_id', w.gevraagdeGroep);
        expect(los.error, `ontkoppelen: ${los.error?.message}`).toBeNull();

        const doel = await w.bob.db.from('goals').select('id').eq('id', doelId);
        expect(doel.error, `doel lezen: ${doel.error?.message}`).toBeNull();
        expect(
          (doel.data ?? []).length,
          'het doel blijft zichtbaar via de andere groep — anders meet deze test iets anders',
        ).toBe(1);

        expect(
          await weetVan(w.bob, doelId),
          'maar de gevraagde groep draagt het doel niet meer, dus de bit hoort dicht',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'de bit leeft niet langer dan het doel waar hij over gaat',
      async () => {
        // ⚠️ **Uit de tweede security-ronde.** De rand was een kale join op
        //    `goal_group_links`, en die kent maar één helft van "mag ik dit doel
        //    zien". 📏 Gemeten: de eigenaar zette zichzelf met een kale PATCH op
        //    `inactive` — geen `verlaat_groep()`, dus zijn koppelingen bleven
        //    staan — en toen las een groepslid de bit terwijl het dóél al
        //    onzichtbaar was. Hetzelfde gold in een gearchiveerde groep.
        //
        //    `shares_group_with_goal()` draagt alle drie de helften (kijker
        //    actief, eigenaar actief, groep niet gearchiveerd) en is de
        //    opvatting die de rest van de leeskant al gebruikt. Een oppervlak
        //    dat langer leeft dan zijn eigen voorwaarde, is een oppervlak dat
        //    niemand besloten heeft — de les van 0183.
        const { doelId } = await doelMetStraf('UITSTEL eigenaar weg', [w.gevraagdeGroep]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(await weetVan(w.bob, doelId), 'zolang alles staat, weet bob ervan').toBe(true);

        const weg = await adminDb()
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', w.gevraagdeGroep)
          .eq('user_id', w.alice.id);
        expect(weg.error, `eigenaar inactief: ${weg.error?.message}`).toBeNull();

        // ⚠️ **Eerst meten, dan terugzetten, dan pas verwachten.** Stond de
        //    herstelstap ná de assertie, dan laat een rode test alice inactief
        //    achter en vallen de volgende tests om op iets dat niets met hun
        //    eigen belofte te maken heeft. Dat is bij de ijking gebeurd: één
        //    mutatie leverde vijf rode tests op waarvan er vier alleen maar het
        //    puin van de eerste opruimden.
        const doel = await w.bob.db.from('goals').select('id').eq('id', doelId);
        const bitNaVertrek = await weetVan(w.bob, doelId);

        const terug = await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.gevraagdeGroep)
          .eq('user_id', w.alice.id);
        expect(terug.error, `terugzetten: ${terug.error?.message}`).toBeNull();

        expect(doel.error, `doel lezen: ${doel.error?.message}`).toBeNull();
        expect(
          (doel.data ?? []).length,
          'het doel hoort onzichtbaar te zijn zodra de eigenaar geen lid meer is',
        ).toBe(0);
        expect(
          bitNaVertrek,
          'en dan hoort de strafbit dat ook te zijn — hij gaat over dat doel',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'en ontkoppelen sluit ook de knop, niet alleen de waarschuwing',
      async () => {
        // ⚠️⚠️ **De naad, en de eerste bevinding van de tweede security-ronde.**
        //    De rand hierboven is zonder deze helft érger dan geen rand: 📏
        //    gemeten dat de aanvrager na het versturen kon ontkoppelen, waarna
        //    de beslisser géén waarschuwing meer zag — niet "onbekend" maar
        //    niets — en met één klik de datum verschoof. Eén knop, geen truc.
        //
        //    Regel 18 vraag 1: beide onderdelen klopten. De RPC hield keurig op
        //    bij ontkoppelen en `beslis_deadline_verzoek()` hield nergens op, en
        //    de belofte leefde ertussen.
        //
        // ⚠️ Deze test toetst de belofte en niet de trigger: hij vraagt of het
        //    verzoek nog beslist kán worden, niet of er een `withdrawn` in de
        //    tabel staat. Zou iemand de reparatie verplaatsen naar
        //    `beslis_deadline_verzoek()`, dan blijft dit precies even geldig.
        const { doelId } = await doelMetStraf('UITSTEL ontkoppeld en beslist', [
          w.gevraagdeGroep,
        ]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);
        const voor = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', doelId)
          .single();
        if (voor.error) throw new Error(`datum vooraf: ${voor.error.message}`);

        const los = await adminDb()
          .from('goal_group_links')
          .delete()
          .eq('goal_id', doelId)
          .eq('group_id', w.gevraagdeGroep);
        expect(los.error, `ontkoppelen: ${los.error?.message}`).toBeNull();

        const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: true,
        });

        expect(
          uit(akkoord.data).ok,
          'een verzoek zonder koppeling hoort niet meer goedgekeurd te kunnen worden',
        ).toBe(false);

        const na = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', doelId)
          .single();
        if (na.error) throw new Error(`datum achteraf: ${na.error.message}`);
        expect(
          na.data.target_date,
          'en de streefdatum hoort te staan waar hij stond — dát is de belofte',
        ).toBe(voor.data.target_date);
      },
      TEST_TIMEOUT,
    );

    it(
      'na een afwijzing blijft de beslisser het weten',
      async () => {
        // ⚠️ **De must-allow die ontbrak.** De ijking van de `withdrawn`-rand
        //    (grendel 6) loopt langs de `approved`-kant en raakt `rejected`
        //    nooit; 📏 een variant `r.status in ('open','approved')` liet alle
        //    acht tests groen. Rij 31 en het beslisdocument beloven dit met
        //    zoveel woorden: wie nee heeft gezegd, hoort te kunnen terugzien
        //    waarop.
        const { doelId } = await doelMetStraf('UITSTEL afgewezen', [w.gevraagdeGroep]);
        const verzoekId = await vraagUitstel(doelId, w.gevraagdeGroep);

        const nee = await w.bob.db.rpc('beslis_deadline_verzoek', {
          p_request_id: verzoekId,
          p_akkoord: false,
        });
        expect(uit(nee.data).ok, `afwijzen: ${JSON.stringify(nee.data)}`).toBe(true);

        expect(
          await weetVan(w.bob, doelId),
          'ook een afwijzing is een beslissing, en die hoort terug te vinden te zijn',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een ingetrokken straf telt niet mee, want dan schuift er niets',
      async () => {
        // ⚠️ **Uit de security-ronde, en het is een tekstfout die een
        //    beslissing raakt.** Het scherm zegt *"Ga je akkoord, dan schuift de
        //    datum waarop die verschuldigd wordt mee"*. Bij een `cancelled`
        //    straf is dat aantoonbaar onwaar. Een onjuiste mededeling in een
        //    beslissing over een commitment device is erger dan geen mededeling.
        const { doelId, strafId } = await doelMetStraf('UITSTEL straf ingetrokken', [
          w.gevraagdeGroep,
        ]);
        await vraagUitstel(doelId, w.gevraagdeGroep);
        if (strafId === null) throw new Error('deze opstelling hoort een straf te hebben');

        expect(await weetVan(w.bob, doelId), 'zolang de straf staat, hoort hij het te weten').toBe(
          true,
        );

        // ⚠️ Als alice zélf, via `commitments_update` — dat is de enige route
        //    die de app kent (`trekIn()`), en hij geldt alleen op `set`.
        const ingetrokken = await w.alice.db
          .from('commitments')
          .update({ status: 'cancelled' })
          .eq('id', strafId)
          .select('id');
        expect(ingetrokken.error, `intrekken: ${ingetrokken.error?.message}`).toBeNull();
        expect((ingetrokken.data ?? []).length, 'de intrekking hoort te landen').toBe(1);

        expect(
          await weetVan(w.bob, doelId),
          'een ingetrokken straf schuift niet mee, dus er valt niets over te melden',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );

    it(
      'een lid dat eruit ligt, weet van niets',
      async () => {
        // ⚠️ **De must-deny waarin het lidmaatschap zélf de reden is**, en die
        //    ontbrak in de eerste versie: carol wordt geweigerd omdat háár groep
        //    niets gevraagd is, niet omdat zij geen lid is. Zonder dit geval
        //    blijven alle andere tests groen als `and m.status <> 'inactive'`
        //    ooit uit `mag_groep_lezen()` verdwijnt. Regel 18 vraag 3, gevonden
        //    door de security-ronde.
        const { doelId } = await doelMetStraf('UITSTEL uitgezet lid', [w.gevraagdeGroep]);
        await vraagUitstel(doelId, w.gevraagdeGroep);

        expect(
          await weetVan(w.bob, doelId),
          'zolang hij lid is, hoort hij het te weten',
        ).toBe(true);

        const eruit = await adminDb()
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', w.gevraagdeGroep)
          .eq('user_id', w.bob.id);
        expect(eruit.error, `uitzetten: ${eruit.error?.message}`).toBeNull();

        // ⚠️ Meten, terugzetten, dan pas verwachten — zie de test hierboven.
        const bitNaUitzetting = await weetVan(w.bob, doelId);

        const terug = await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', w.gevraagdeGroep)
          .eq('user_id', w.bob.id);
        expect(terug.error, `terugzetten: ${terug.error?.message}`).toBeNull();

        expect(
          bitNaUitzetting,
          'wie niet meer in de groep zit, leest ook niet meer wat die groep gevraagd is',
        ).toBe(false);
      },
      TEST_TIMEOUT,
    );
  });
});
