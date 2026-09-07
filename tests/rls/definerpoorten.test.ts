import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  addDays,
  localDateIn,
  now,
  userCycle,
  type IsoDate,
  type TimeZone,
} from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De eigenaarspoort van drie `SECURITY DEFINER`-RPC's — QS8-262, ronde 5.
 *
 * Deze ronde is van een ánder soort dan 1 tot en met 4. Die gingen over policies;
 * `rls:dekking` kan die meten door ze open te zetten. **Een definer-functie komt
 * daar principieel niet langs**: hij draait als zijn eigenaar, dus geen enkele
 * policy raakt hem. Zijn poort is de `if` in zijn eigen body, en die staat in
 * geen enkel dekkingsrapport.
 *
 * ## De meting
 *
 * Zeven definer-RPC's die `goals`, `weekly_goals` of `milestones` schrijven, elk
 * met hun autorisatiepoort weggehaald via `pg_get_functiondef` → vervangen →
 * volledige suite → byte-identiek teruggezet. Uitslag:
 *
 * | Functie | Poort weg | Bewaakt |
 * | -- | -- | -- |
 * | `rond_doel_af` | 1 rood | ✅ |
 * | `sluit_weekdoel_af` | 1 rood | ✅ |
 * | `trek_goedkeuring_in` | 2 rood | ✅ |
 * | `beslis_deadline_verzoek` | 3 rood | ✅ |
 * | `zet_doelstatus` | **0 van 858** | ❌ |
 * | `zet_streefdatum` | **0 van 858** | ❌ |
 * | `schuif_weekdoel_door` | **0 van 858** | ❌ |
 *
 * Dat vier van de zeven wél gevonden worden, is meteen het bewijs dat de sweep
 * werkt.
 *
 * ## ⚠️⚠️ En de sweep was een greep, geen inventarisatie
 *
 * De klasse telt er **twaalf**, niet zeven. De security-reviewer somde hem
 * mechanisch op — `pg_proc` filteren op `prosecdef`, een schrijfactie op
 * `goals/weekly_goals/milestones/completions/points_ledger` in `prosrc`, en
 * `has_function_privilege('authenticated', oid, 'EXECUTE')` — en vond zo een
 * áchtste gat dat ik niet had gemeten: **`verwijder_weekdoel`, 0 rood van 865**,
 * door mij nagemeten. De bestaande dekking in `weekpassen.test.ts` roept hem
 * twee keer aan, beide keren als de eigenaar op zijn eigen doel.
 *
 * De vier die geen van ons had gemeten zijn wél bewaakt (`verwijder_doel`,
 * `herorden_mijlpalen`, `dien_opnieuw_in`) of hebben geen losse poort
 * (`zet_week_startdag` scopet in de `update` zelf, en daar zegt deze
 * mutatievorm principieel niets over).
 *
 * ⚠️⚠️ **Die laatste zin klopte en was tóch schadelijk — nagemeten op
 *    05-09-2026 (QS8-282).** Over déze mutatievorm valt er inderdaad niets te
 *    zeggen: `zet_week_startdag` heeft geen vroege `return`-poort om weg te
 *    halen. Maar er is nooit iemand teruggekomen met de vorm die er wél iets
 *    over zegt — de conjunct `and g.owner_id = v_uid` uit de `where` van de
 *    `update` halen. Dat gaf **nul rode tests van 963**, terwijl het weekdoel
 *    van een wildvreemde meeverhuisde en de teruggegeven `verzet` dat ook nog
 *    verklapte.
 *
 *    **"Zo niet te meten" is hier stilletjes "niet gemeten" geworden.** Een
 *    zin die een functie opzij zet, hoort te zeggen wélke vorm hem wél raakt —
 *    anders leest de volgende lezer hem als "hier is niets te halen". De
 *    grendel staat nu onder test in `weekstart.test.ts`.
 *
 * ⚠️ **Zeven definer-*trigger*functies vallen buiten deze vorm.** Die dragen geen
 *    eigenaarspoort; hun autorisatie is de policy op de schrijfactie die ze
 *    aftrapt, en die komt wél langs `rls:dekking`. Dat is iets anders dan "in
 *    orde": het is "hier meet deze sweep niets".
 *
 * Dit bestand dicht de vier gaten: de drie uit mijn sweep plus de achtste.
 *
 * ## De takken die ná de poort komen — volledig, want half is misleidend
 *
 * | Functie | Vóór de poort | Ná de poort |
 * | -- | -- | -- |
 * | `zet_doelstatus` | — | — |
 * | `zet_streefdatum` | — | `bad_date`, `needs_group_approval`, `recent_ontkoppeld`, en een `{ok:true, changed:false}`-tak die **niets schrijft** |
 * | `schuif_weekdoel_door` | `ongeldige_cyclus` | `not_missed`, `te_veel_deze_dag` |
 * | `verwijder_weekdoel` | — | `not_open`, `heeft_voltooiing`, `te_oud` |
 *
 * ⚠️ **`recent_ontkoppeld` is de gevaarlijkste voor dit bestand**, en wel omdat
 *    hij zichzelf kan bewapenen. `noteer_ontkoppeling()` is een `after delete`
 *    -trigger op `goal_group_links` die `losgekoppeld_op = now()` zet. Zou een
 *    latere sessie de fixture "vereenvoudigen" door `groepsGoalId` te ontkoppelen
 *    in plaats van een apart `soloGoalId` aan te houden, dan weigert
 *    `zet_streefdatum` zeven dagen lang om díe reden.
 *
 * ⚠️ **`weekdoelen_over()` is géén sluipende afscherming, en dat is niet de
 *    intuïtieve lezing.** De teller is op de **aanroeper** gescopeerd
 *    (`g.owner_id = auth.uid()`), niet op de eigenaar van het weekdoel dat wordt
 *    doorgeschoven. Een aanvaller heeft dus zijn eigen voorraad over en wordt er
 *    nooit door tegengehouden.
 *
 * Elke weigerassertie hieronder pint daarom de **reden** bij naam. Verschuift een
 * fixture ooit, dan valt dat op als een verkeerde grendel en niet als een groene
 * test.
 *
 * ⚠️ **Dekkingsgaten en geen beveiligingsgaten.** De poorten zitten er en ze
 *    werken; wat ontbrak is de test die het merkt als iemand ze weghaalt.
 *
 * ## ⚠️⚠️ Twee van de drie hebben een tweede poort die de eerste afschermt
 *
 * Dit stuurt het hele ontwerp, en zonder deze twee keuzes zou dit bestand
 * groen blijven mét de eigenaarspoort weg — precies de fout van ronde 3 en 4.
 *
 * 1. **`zet_streefdatum` weigert élk aan een groep gekoppeld doel** met
 *    `needs_group_approval` (dat is A7, en het is geen UI-regel). Die toets staat
 *    ná de eigenaarstoets, dus op een gekoppeld doel vangt zij de aanvaller op
 *    zodra de eigenaarspoort weg is. **Daarom draait dat geval op `soloGoalId`,
 *    een doel dat aan géén groep hangt.**
 *
 * 2. **`schuif_weekdoel_door` eist `status = 'missed'`** en geeft anders
 *    `not_missed`. Op een gewoon weekdoel vangt díe toets de aanvaller op.
 *    **Daarom staat `gemistWeekId` expliciet op `missed`.**
 *
 * ## De acteur, en waarom hij hier anders ligt dan in ronde 4
 *
 * Bij een policy is de groepsgenoot de gevaarlijke acteur, omdat een vreemde de
 * rij niet eens ziet. **Bij een definer-RPC bestaat dat verschil niet:** de
 * functie leest zijn eigen tabellen buiten RLS om, dus iederéén die is ingelogd
 * kan hem aanroepen met een willekeurige id. Zichtbaarheid is geen poort.
 *
 * De acteur is hier tóch een groepsgenoot, om een andere reden: de verruiming die
 * iemand realistisch schrijft is *"en groepsgenoten ook"* — overgenomen van een
 * leespolicy. Alleen een groepsgenoot vangt díe.
 *
 * ⚠️ Bij `zet_streefdatum` kan dat niet, want daar moet het doel juist
 *    óngekoppeld zijn (zie hierboven). Daar is de acteur dus een gewone andere
 *    gebruiker, en dekt dit bestand de groeps­verruiming niet. **Dat is geen
 *    omissie maar een onmogelijkheid:** op een gekoppeld doel weigert de functie
 *    sowieso, dus een groepsverruiming van de eigenaarspoort verandert daar
 *    niets. Vervalt de `needs_group_approval`-tak ooit, dan hoort hier een
 *    groepsgenoot-geval bij.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Uitslag {
  ok?: boolean;
  reason?: string;
}

const uitslag = (data: unknown): Uitslag => (data ?? {}) as Uitslag;

interface Wereld {
  eigenaar: TestUser;
  groepsgenoot: TestUser;
  /** Aan de groep gekoppeld — hier is de groepsgenoot een echte medekijker. */
  groepsGoalId: string;
  /** Aan géén groep gekoppeld, want anders schermt `needs_group_approval` af. */
  soloGoalId: string;
  /** Wegwerpdoelen voor de must-allow-gevallen, die de rij écht wijzigen. */
  archiveerGoalId: string;
  datumGoalId: string;
  /** Staat op `missed`, want anders schermt `not_missed` af. */
  gemistWeekId: string;
  eigenGemistWeekId: string;
  /**
   * Verse `todo`-weekdoelen voor `verwijder_weekdoel`.
   *
   * ⚠️ Die functie heeft ná de eigenaarspoort nog drie takken: `not_open`
   *    (status moet `todo` zijn), `heeft_voltooiing` en `te_oud` (buiten
   *    `bedenktijd()`). Een vers aangemaakt weekdoel zonder voltooiing passeert
   *    alle drie, dus is de eigenaarspoort daar het enige dat nog tegenhoudt.
   */
  todoWeekId: string;
  eigenTodoWeekId: string;
  /**
   * Doelen voor `rond_doel_af` en `verwijder_doel` — QS8-283.
   *
   * ⚠️ **Deze twee bestaan omdat de bestaande fixtures het verkeerde meten.**
   *    De sweep gaf bij allebei één rode test, maar dat rood was een veranderde
   *    fóutreden: in `epic9.test.ts` vangt `open_milestones` de mutatie af en in
   *    `weekpassen.test.ts` doet `gedeeld_met_groep` dat. De aanroeper komt daar
   *    nooit bij de schrijfactie, dus niets zag ooit dat een vreemde het doel
   *    écht afrondt of wist.
   *
   * ⚠️ **Ze zijn met opzet verschillend gekoppeld, en dat is geen slordigheid.**
   *    `rond_doel_af` heeft geen koppelingstak, dus dat doel kán aan de groep
   *    hangen en dáár is de groepsgenoot de sterke acteur. `verwijder_doel`
   *    weigert een gekoppeld doel met `gedeeld_met_groep`, dus dat doel moet
   *    juist ongekoppeld zijn — zie de kop bij dat blok voor wat dat betekent.
   */
  afrondGoalId: string;
  eigenAfrondGoalId: string;
  wisGoalId: string;
  eigenWisGoalId: string;
  vandaag: IsoDate;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de eigenaarspoort van de definer-RPCs', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('def-eigenaar');
    const groepsgenoot = await createTestUser('def-genoot');
    const admin = adminDb();
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Definerpoorten' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await groepsgenoot.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (((mee.data ?? {}) as { ok?: boolean }).ok !== true) {
      throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    const maakDoel = async (titel: string): Promise<string> => {
      const d = await eigenaar.db
        .from('goals')
        .insert({ owner_id: eigenaar.id, title: titel, target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      return d.data.id;
    };

    const groepsGoalId = await maakDoel('DEF-GROEP');
    const soloGoalId = await maakDoel('DEF-SOLO');
    const archiveerGoalId = await maakDoel('DEF-ARCHIVEER');
    const datumGoalId = await maakDoel('DEF-DATUM');
    const afrondGoalId = await maakDoel('DEF-AFRONDEN');
    const eigenAfrondGoalId = await maakDoel('DEF-AFRONDEN-EIGEN');
    const wisGoalId = await maakDoel('DEF-WISSEN');
    const eigenWisGoalId = await maakDoel('DEF-WISSEN-EIGEN');

    // ⚠️ `afrondGoalId` hangt óók aan de groep: daar is de groepsgenoot de
    //    sterke acteur. `wisGoalId` juist níet — `verwijder_doel` weigert een
    //    gekoppeld doel met `gedeeld_met_groep` en dan meet die test die tak.
    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert([
        { goal_id: groepsGoalId, group_id: gd.group.id },
        { goal_id: afrondGoalId, group_id: gd.group.id },
        { goal_id: eigenAfrondGoalId, group_id: gd.group.id },
      ]);
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    // ⚠️ `status: 'missed'` via `adminDb()`: de client mag `weekly_goals.status`
    //    sinds 0023 niet schrijven, en dat slot is precies wat hier níet getoetst
    //    wordt — het gaat om de poort ín de functie.
    const maakGemistWeekdoel = async (goalId: string, titel: string): Promise<string> => {
      const r = await admin
        .from('weekly_goals')
        .insert({
          goal_id: goalId,
          title: titel,
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: vandaag,
          cycle_index: 1,
          status: 'missed',
        })
        .select('id')
        .single();
      if (r.error || r.data === null) throw new Error(`weekdoel ${titel}: ${r.error?.message}`);
      return r.data.id;
    };

    const gemistWeekId = await maakGemistWeekdoel(groepsGoalId, 'DEFWEEK-GEMIST');
    const eigenGemistWeekId = await maakGemistWeekdoel(soloGoalId, 'DEFWEEK-EIGEN');

    const maakTodoWeekdoel = async (goalId: string, titel: string): Promise<string> => {
      const r = await admin
        .from('weekly_goals')
        .insert({
          goal_id: goalId,
          title: titel,
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: addDays(vandaag, 14),
          cycle_index: 3,
        })
        .select('id')
        .single();
      if (r.error || r.data === null) throw new Error(`weekdoel ${titel}: ${r.error?.message}`);
      return r.data.id;
    };

    const todoWeekId = await maakTodoWeekdoel(groepsGoalId, 'DEFWEEK-TODO');
    const eigenTodoWeekId = await maakTodoWeekdoel(soloGoalId, 'DEFWEEK-TODO-EIGEN');

    w = {
      eigenaar,
      groepsgenoot,
      groepsGoalId,
      soloGoalId,
      archiveerGoalId,
      datumGoalId,
      gemistWeekId,
      eigenGemistWeekId,
      todoWeekId,
      eigenTodoWeekId,
      afrondGoalId,
      eigenAfrondGoalId,
      wisGoalId,
      eigenWisGoalId,
      vandaag,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // ---------------------------------------------------------------------------
  it(
    'de groepsgenoot ziet het doel — anders zegt "hij mag het niet" niets over hém',
    async () => {
      const { data } = await w.groepsgenoot.db.from('goals').select('id').eq('id', w.groepsGoalId);
      expect(
        data ?? [],
        'de groepsgenoot is geen echt medelid, en dan toetsen de gevallen hieronder ' +
          'een zwakkere acteur dan ze beweren',
      ).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  describe('zet_doelstatus — je archiveert het doel van een ander niet', () => {
    it(
      'een groepsgenoot krijgt not_owner en het doel blijft actief',
      async () => {
        const poging = await w.groepsgenoot.db.rpc('zet_doelstatus', {
          p_goal_id: w.groepsGoalId,
          p_gearchiveerd: true,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(uitslag(poging.data).reason).toBe('not_owner');

        // ⚠️ De reden alléén bewijst niets: een functie kan `ok:false` teruggeven
        //    en tóch geschreven hebben. Daarom de rij erbij.
        const na = await adminDb().from('goals').select('status').eq('id', w.groepsGoalId).single();
        expect(na.data?.status, 'het doel is alsnog gearchiveerd').not.toBe('archived');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar archiveert zijn eigen doel wél',
      async () => {
        const poging = await w.eigenaar.db.rpc('zet_doelstatus', {
          p_goal_id: w.archiveerGoalId,
          p_gearchiveerd: true,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(uitslag(poging.data).ok, 'je eigen doel archiveren hoort te lukken').toBe(true);

        const na = await adminDb()
          .from('goals')
          .select('status')
          .eq('id', w.archiveerGoalId)
          .single();
        expect(na.data?.status).toBe('archived');
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('zet_streefdatum — je verzet de deadline van een ander niet', () => {
    it(
      'een ander krijgt not_owner en de datum blijft staan',
      async () => {
        // ⚠️ Op `soloGoalId`. Op een gekoppeld doel weigert de functie sowieso met
        //    `needs_group_approval`, en dan bewaakt deze test die tak in plaats
        //    van de eigenaarspoort.
        const voor = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', w.soloGoalId)
          .single();

        // ⚠️ **Zonder dit anker bewijst de rijcontrole hieronder niets.**
        //    `zet_streefdatum` geeft `not_owner` op twee gronden:
        //    `g.id is null or g.owner_id <> auth.uid()`. Bestaat het doel niet,
        //    dan is `voor` én `na` `undefined` en slaagt de vergelijking — een
        //    groene test die de poort nooit geraakt heeft. Gevonden door de
        //    security-reviewer; de andere twee gevallen hebben hun anker al
        //    (de must-see-test respectievelijk de statuscontrole aan het eind).
        expect(voor.data, 'soloGoalId bestaat niet — deze test raakt de poort niet').not.toBeNull();

        const poging = await w.groepsgenoot.db.rpc('zet_streefdatum', {
          p_goal_id: w.soloGoalId,
          p_date: addDays(w.vandaag, 365),
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(
          uitslag(poging.data).reason,
          'als hier `needs_group_approval` staat, is dit doel per ongeluk aan een ' +
            'groep gekoppeld en toetst deze test de verkeerde poort',
        ).toBe('not_owner');

        const na = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', w.soloGoalId)
          .single();
        expect(na.data?.target_date, 'de streefdatum is alsnog verzet').toBe(
          voor.data?.target_date,
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar verzet zijn eigen streefdatum wél',
      async () => {
        const nieuw = addDays(w.vandaag, 200);
        const poging = await w.eigenaar.db.rpc('zet_streefdatum', {
          p_goal_id: w.datumGoalId,
          p_date: nieuw,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen datum verzetten hoort te lukken — kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb()
          .from('goals')
          .select('target_date')
          .eq('id', w.datumGoalId)
          .single();
        expect(na.data?.target_date).toBe(nieuw);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('verwijder_weekdoel — je wist het weekdoel van een ander niet', () => {
    /**
     * ⚠️⚠️ **Dit is de achtste, en hij zat niet in mijn eigen sweep.** Die mat
     *    zeven functies; de klasse telt er twaalf. Gevonden door de
     *    security-reviewer met een mechanische opsomming, en daarna zelf
     *    nagemeten: eigenaarspoort weg → **0 rood van 865**. De bestaande dekking
     *    in `weekpassen.test.ts` roept hem twee keer aan, beide keren als de
     *    eigenaar op zijn eigen doel — er was nooit een niet-eigenaar in beeld.
     *
     *    Het gevaar: verruimt iemand die poort, dan wist een vreemde jouw
     *    `todo`-weekdoel binnen de bedenktijd. Dat is de A40-route, gericht op
     *    andermans week in plaats van je eigen.
     */
    it(
      'een groepsgenoot krijgt not_owner en het weekdoel blijft staan',
      async () => {
        const poging = await w.groepsgenoot.db.rpc('verwijder_weekdoel', {
          p_weekly_goal_id: w.todoWeekId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(
          uitslag(poging.data).reason,
          'staat hier `not_open`, `heeft_voltooiing` of `te_oud`, dan vangt een ' +
            'latere tak de aanvaller op en toetst deze test de verkeerde poort',
        ).toBe('not_owner');

        const na = await adminDb().from('weekly_goals').select('id').eq('id', w.todoWeekId);
        expect(na.data ?? [], 'het weekdoel is alsnog verwijderd').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar wist zijn eigen verse weekdoel wél',
      async () => {
        const poging = await w.eigenaar.db.rpc('verwijder_weekdoel', {
          p_weekly_goal_id: w.eigenTodoWeekId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen weekdoel wissen hoort te lukken — kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb().from('weekly_goals').select('id').eq('id', w.eigenTodoWeekId);
        expect(na.data ?? [], 'het weekdoel staat er nog').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('schuif_weekdoel_door — je schuift het weekdoel van een ander niet door', () => {
    it(
      'een groepsgenoot krijgt not_owner en er komt geen weekdoel bij',
      async () => {
        // ⚠️ Op een weekdoel dat écht op `missed` staat. Anders vangt `not_missed`
        //    de aanvaller op zodra de eigenaarspoort weg is, en bewaakt deze test
        //    díe toets.
        const voor = await adminDb()
          .from('weekly_goals')
          .select('id')
          .eq('goal_id', w.groepsGoalId);

        const poging = await w.groepsgenoot.db.rpc('schuif_weekdoel_door', {
          p_weekly_goal_id: w.gemistWeekId,
          p_cycle_start_date: addDays(w.vandaag, 7),
          p_cycle_index: 2,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(
          uitslag(poging.data).reason,
          'staat hier `not_missed`, dan staat het weekdoel niet op `missed` en ' +
            'toetst deze test de verkeerde poort',
        ).toBe('not_owner');

        const na = await adminDb().from('weekly_goals').select('id').eq('goal_id', w.groepsGoalId);
        expect(
          (na.data ?? []).length,
          'er is alsnog een weekdoel doorgeschoven',
        ).toBe((voor.data ?? []).length);

        const oud = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', w.gemistWeekId)
          .single();
        expect(oud.data?.status, 'het oude weekdoel is alsnog op `carried` gezet').toBe('missed');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar schuift zijn eigen gemiste weekdoel wél door',
      async () => {
        const nieuweStart = addDays(w.vandaag, 7);
        const poging = await w.eigenaar.db.rpc('schuif_weekdoel_door', {
          p_weekly_goal_id: w.eigenGemistWeekId,
          p_cycle_start_date: nieuweStart,
          p_cycle_index: 2,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen weekdoel doorschuiven hoort te lukken — kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        // ⚠️⚠️ **`ok:true` alleen is hier geen bewijs, en dat is gemeten.** Deze
        //    helft toetste eerst alleen de JSON-envelop. Zet je de `update` en de
        //    doelcyclus van de functie stuk — hij schuift dan niets door en
        //    markeert niets — dan bleef hij groen. De twee andere must-allows
        //    lazen hun rij wél terug en werden bij dezelfde soort mutatie rood;
        //    deze was de uitzondering. Gevonden door de security-reviewer.
        //
        //    Het verschil telt in déze familie extra: `zet_streefdatum` heeft een
        //    tak die `{ok: true, changed: false}` teruggeeft zónder te schrijven.
        //    `ok:true` en "de rij is veranderd" zijn hier dus niet hetzelfde ding.
        const oud = await adminDb()
          .from('weekly_goals')
          .select('status')
          .eq('id', w.eigenGemistWeekId)
          .single();
        expect(oud.data?.status, 'het oude weekdoel is niet op `carried` gezet').toBe('carried');

        const nieuw = await adminDb()
          .from('weekly_goals')
          .select('cycle_index')
          .eq('goal_id', w.soloGoalId)
          .eq('cycle_start_date', nieuweStart)
          .single();
        expect(nieuw.data?.cycle_index, 'er staat geen doorgeschoven weekdoel in de nieuwe cyclus').toBe(2);
      },
      TEST_TIMEOUT,
    );
  });
  // ---------------------------------------------------------------------------
  /**
   * ⚠️⚠️ **`rond_doel_af` en `verwijder_doel` — QS8-283.**
   *
   * Deze twee stonden in `scripts/definers-controle.mjs` als *"Gemeten: poort
   * weg → één rode test"*. Dat rood bestond, en het bewees niets: in beide
   * bestaande fixtures vangt een **látere** poort de mutatie af, dus het enige
   * verschil was de foutreden.
   *
   * ```
   * rond_doel_af    epic9.test.ts       expected 'open_milestones'   to be 'not_owner'
   * verwijder_doel  weekpassen.test.ts  expected 'gedeeld_met_groep' to be 'not_owner'
   * ```
   *
   * 📏 Wat er werkelijk gebeurt, gemeten met een opstelling waarin die latere
   *    poort niet vuurt en een aanroeper die niet de eigenaar is:
   *
   * ```
   * rond_doel_af    poort er wél in -> {"ok": false, "not_owner"}  status = active
   * rond_doel_af    poort eruit     -> {"ok": true, …}             status = completed
   * verwijder_doel  poort er wél in -> {"ok": false, "not_owner"}  bestaat_nog = 1
   * verwijder_doel  poort eruit     -> {"ok": true}                bestaat_nog = 0
   * ```
   *
   *    Een vreemde rondt het doel van een ander af — onomkeerbaar, mét
   *    `meld_doel_af()` in elke gekoppelde groep en `wikkel_commitments_af()`
   *    erachteraan — of wist het. Geen enkele assertie zou dat gezien hebben.
   *
   * ⚠️ **De assertie is dus juist en de opstelling maakte hem onfalsifieerbaar**
   *    in precies de richting die ertoe doet. Regel 18, vraag 3, en de derde
   *    ronde op rij waarin die vorm bovenkomt.
   */
  describe('rond_doel_af — je rondt het doel van een ander niet af', () => {
    it(
      'de groepsgenoot is echt een buddy van dít doel — anders vangt de test de verruiming niet',
      async () => {
        // ⚠️⚠️ **Deze test bewaakt één regel in de opbouw, en dat is geen
        //    overdaad.** De hele verruimingsdekking hieronder hangt eraan dat
        //    `afrondGoalId` aan de groep gekoppeld is: zónder die koppeling is de
        //    groepsgenoot een wildvreemde, geeft `shares_group_with_goal()`
        //    `false`, en blijft de mutatie `or shares_group_with_goal(g.id)`
        //    onzichtbaar.
        //
        //    📏 Gemeten door die ene regel uit de `insert` te halen: alle dertien
        //    tests in dit bestand bleven groen, terwijl de verruiming er
        //    ongehinderd doorheen kwam. Het lijstje koppelingen ziet er
        //    redundant uit naast `groepsGoalId` — precies het soort regel dat een
        //    volgende sessie opruimt.
        const buddy = await w.groepsgenoot.db.rpc('shares_group_with_goal', {
          g: w.afrondGoalId,
        });
        if (buddy.error) throw new Error(`aanroep: ${buddy.error.message}`);
        expect(
          buddy.data,
          'de groepsgenoot deelt geen groep met dit doel, dus hij is hier de zwakke ' +
            'acteur en de verruimingsmutatie blijft onzichtbaar',
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot krijgt not_owner en het doel blijft actief',
      async () => {
        // ⚠️ **Op een gekóppeld doel, en dat is hier de sterke acteur.**
        //    `rond_doel_af` heeft geen koppelingstak, dus dit doel mag aan de
        //    groep hangen — en dan geeft `shares_group_with_goal()` voor de
        //    groepsgenoot `true`. Gemeten met de poort verruimd tot
        //    `or shares_group_with_goal(g.id)`: hij rondt het doel dan af.
        //
        // ⚠️ Zonder open mijlpalen, want anders vangt `open_milestones` het af
        //    en toetst deze test die tak in plaats van de eigenaarspoort. Dat
        //    was precies de fout in de oude meting.
        const poging = await w.groepsgenoot.db.rpc('rond_doel_af', {
          p_goal_id: w.afrondGoalId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(
          uitslag(poging.data).reason,
          'een andere reden betekent dat een látere poort dit afving en de ' +
            'eigenaarspoort niet getoetst is',
        ).toBe('not_owner');

        const na = await adminDb().from('goals').select('status').eq('id', w.afrondGoalId).single();
        expect(na.data?.status, 'het doel is alsnog afgerond').toBe('active');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar rondt zijn eigen doel wél af',
      async () => {
        const poging = await w.eigenaar.db.rpc('rond_doel_af', {
          p_goal_id: w.eigenAfrondGoalId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(uitslag(poging.data).ok, 'je eigen doel afronden hoort te lukken').toBe(true);

        const na = await adminDb()
          .from('goals')
          .select('status')
          .eq('id', w.eigenAfrondGoalId)
          .single();
        expect(na.data?.status).toBe('completed');
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('verwijder_doel — je wist het doel van een ander niet', () => {
    /**
     * ⚠️⚠️ **Er zijn twee buddy-predicaten in dit schema, en ze gedragen zich
     *    hier verschillend. Noem ze dus bij naam.** De eerste versie van deze kop
     *    zei "de buddy-tak is niet te raken", en dat was in twee richtingen
     *    verkeerd: het verzweeg dekking die er wél is, en het wees de volgende
     *    lezer op de verkeerde aanleiding om terug te komen. Precies de valkuil
     *    die in de kop van dit bestand staat opgetekend na `zet_week_startdag`.
     *
     *    **`shares_group_with_goal()` is hier niet te raken.** Hij leest
     *    uitsluitend uit `goal_group_links`, dus `true` impliceert een linkrij —
     *    en `verwijder_doel` weigert élk doel met een linkrij al met
     *    `gedeeld_met_groep`, een éérdere poort dan waar de verruiming zou
     *    bijten. 📏 Gemeten met die verruiming en een buddy op een gekoppeld
     *    doel: `{"ok": false, "gedeeld_met_groep"}`, de rij bestaat nog.
     *
     *    **`shares_group_with_user()` is wél te raken, en wordt gevangen.** Die
     *    leest alleen `group_members` en heeft geen koppeling nodig, dus hij is
     *    waar voor de groepsgenoot ook op een ongekoppeld doel. 📏 Gemeten met
     *    `or shares_group_with_user(g2.owner_id)`: deze test wordt rood.
     *
     *    Deze test gebruikt dus geen zwakke acteur. De groepsgenoot deelt een
     *    groep mét de eigenaar; hij deelt er alleen geen mét dit doel, en dat is
     *    hier onvermijdelijk.
     *
     *    **De `shares_group_with_goal()`-vorm wordt toetsbaar zodra
     *    `gedeeld_met_groep` verdwijnt of ná de eigenaarspoort naar achteren
     *    schuift** — bijvoorbeeld als een gedeeld doel ooit wél verwijderd mag
     *    worden. ⚠️ Die tak heeft vandaag géén eigen test; zie de dossierrij van
     *    05-09.
     */
    it(
      'een ander krijgt not_owner en het doel blijft bestaan',
      async () => {
        // ⚠️ Ongekoppeld, vers en zonder weekdoelen: `gedeeld_met_groep`,
        //    `te_oud`, `heeft_weekdoelen` en `heeft_punten` vuren geen van alle,
        //    dus de eigenaarspoort is het enige dat nog tegenhoudt.
        const poging = await w.groepsgenoot.db.rpc('verwijder_doel', {
          p_goal_id: w.wisGoalId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'dit hoort geweigerd te worden').toBe(false);
        expect(
          uitslag(poging.data).reason,
          'een andere reden betekent dat een látere poort dit afving en de ' +
            'eigenaarspoort niet getoetst is',
        ).toBe('not_owner');

        const na = await adminDb().from('goals').select('id').eq('id', w.wisGoalId);
        expect(na.data ?? [], 'het doel is alsnog verwijderd').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar wist zijn eigen gedéélde doel niet — de poort waar de kop op leunt',
      async () => {
        // ⚠️⚠️ **`gedeeld_met_groep` had nul dekking**, en dat is ongemakkelijk:
        //    de kop hierboven redeneert dat de `shares_group_with_goal()`-tak
        //    ongevaarlijk is *omdat* deze poort eerder vuurt. Een argument dat op
        //    een grendel leunt die niets bewaakt, is een aanname.
        //
        //    Verdwijnt deze poort samen met een verruimde eigenaarspoort, dan
        //    wist een groepsgenoot een gedeeld doel — met cascade op alles wat
        //    eraan hangt. Niets zou dat gemeld hebben.
        const poging = await w.eigenaar.db.rpc('verwijder_doel', {
          p_goal_id: w.groepsGoalId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        expect(uitslag(poging.data).ok, 'een gedeeld doel wissen hoort geweigerd te worden').toBe(
          false,
        );
        expect(uitslag(poging.data).reason).toBe('gedeeld_met_groep');

        const na = await adminDb().from('goals').select('id').eq('id', w.groepsGoalId);
        expect(na.data ?? [], 'het gedeelde doel is alsnog verwijderd').toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar wist zijn eigen doel wél',
      async () => {
        const poging = await w.eigenaar.db.rpc('verwijder_doel', {
          p_goal_id: w.eigenWisGoalId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen verse doel wissen hoort te lukken, kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb().from('goals').select('id').eq('id', w.eigenWisGoalId);
        expect(na.data ?? [], 'en dan is het ook echt weg').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });
  // ---------------------------------------------------------------------------
  describe('plan_adempauze — je vrijstelt de gemiste week van een ander niet', () => {
    /**
     * ⚠️ **De negende, en hij kwam uit `definers:controle` en niet uit een
     *    sweep.** QS8-227 gaf `plan_adempauze()` een schrijfactie op
     *    `weekly_goals` én `points_ledger` die hij daarvoor niet had: een
     *    adempauze over een al afgesloten week zet die op `excused` en boekt het
     *    minpunt terug. Daarmee stapte de functie de klasse van dit bestand in.
     *
     * ⚠️ **Een eigen doel en een eigen weekdoel, en dat is de les van QS8-283.**
     *    `epic8.test.ts` heeft al een test die `not_owner` verwacht, maar die
     *    toetst een fóutreden: haal de poort weg en de weekdagtoets erachter
     *    geeft `geen_cyclusstart` op de datum die daar gebruikt wordt, en dan is
     *    de test rood zonder dat er iets over het effect gezegd is. Hier valt de
     *    cyclusstart met opzet samen met de gemiste week, zodat er ná de poort
     *    niets meer tussen zit.
     */
    let doelId = '';
    let weekId = '';

    beforeAll(async () => {
      const admin = adminDb();
      const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now()).startDate;

      const groep = await admin
        .from('goal_group_links')
        .select('group_id')
        .eq('goal_id', w.groepsGoalId)
        .single();
      if (groep.error) throw new Error(`groep: ${groep.error.message}`);

      const doel = await admin
        .from('goals')
        .insert({
          owner_id: w.eigenaar.id,
          title: 'DEFPAUZE',
          target_date: addDays(cyclus, 120),
        })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel: ${doel.error.message}`);
      doelId = doel.data.id as string;

      const koppel = await admin
        .from('goal_group_links')
        .insert({ goal_id: doelId, group_id: groep.data.group_id });
      if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

      const week = await admin
        .from('weekly_goals')
        .insert({
          goal_id: doelId,
          title: 'DEFPAUZE-GEMIST',
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: cyclus,
          cycle_index: 1,
          status: 'missed',
        })
        .select('id, beoordeelbaar')
        .single();
      if (week.error) throw new Error(`weekdoel: ${week.error.message}`);
      // Zonder beoordelaar slaat de trigger van QS8-110 het minpunt over, en dan
      // valt er niets te stelen.
      expect(week.data.beoordeelbaar).toBe(true);
      weekId = week.data.id as string;

      const punt = await admin.from('points_ledger').insert({
        user_id: w.eigenaar.id,
        goal_id: doelId,
        delta: -1,
        reason: 'cycle_missed',
        ref_type: 'weekly_goal',
        ref_id: weekId,
      });
      if (punt.error) throw new Error(`minpunt: ${punt.error.message}`);
    }, SETUP_TIMEOUT);

    it(
      'een groepsgenoot krijgt not_owner en de gemiste week blijft gemist',
      async () => {
        const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now()).startDate;

        const poging = await w.groepsgenoot.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclus,
          p_ends_cycle: cyclus,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        // ⚠️ **Het effect wordt vóór de reden getoetst, en dat is de hele les van
        //    QS8-283.** Zou `reason` eerst staan, dan valt deze test bij een
        //    weggehaalde poort om op een veranderde fóutreden en zegt hij nog
        //    steeds niets over wat er met de week van een ander gebeurde.
        const admin = adminDb();

        const na = await admin.from('weekly_goals').select('status').eq('id', weekId).single();
        expect(
          na.data?.status,
          'de week van een ander is vrijgesteld door iemand die er niets over te zeggen heeft',
        ).toBe('missed');

        const rijen = await admin.from('points_ledger').select('delta').eq('ref_id', weekId);
        expect(
          (rijen.data ?? []).reduce((som, r) => som + (r.delta as number), 0),
          'het minpunt van een ander is teruggedraaid',
        ).toBe(-1);

        const pauzes = await admin.from('breathers').select('id').eq('goal_id', doelId);
        expect(pauzes.data ?? [], 'er staat een adempauze op het doel van een ander').toHaveLength(
          0,
        );

        expect(uitslag(poging.data).reason).toBe('not_owner');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar plant hem wél, en dan gaat de week op excused',
      async () => {
        // ⚠️ De must-allow. Zonder deze helft bewijst het geval hierboven ook een
        //    functie die het voor niemand doet.
        const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now()).startDate;

        const poging = await w.eigenaar.db.rpc('plan_adempauze', {
          p_goal_id: doelId,
          p_starts_cycle: cyclus,
          p_ends_cycle: cyclus,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen adempauze plannen hoort te lukken, kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb().from('weekly_goals').select('status').eq('id', weekId).single();
        expect(na.data?.status).toBe('excused');
      },
      TEST_TIMEOUT,
    );
  });
  // ---------------------------------------------------------------------------
  // QS8-286 — de drie groeps-RPC's waarvan de poort niets bewaakte
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Deze drie stonden buiten élk register, en dat was geen toeval maar de
  //    grens van het gereedschap.** `definers-controle.mjs` keek tot 06-09-2026
  //    alleen naar schrijfacties op `goals`, `weekly_goals`, `milestones`,
  //    `completions` en `points_ledger`. Wie aan `weekly_plan_steps` of
  //    `deadline_requests` schrijft, viel er buiten — en dus ook uit de sweep die
  //    dit bestand voedt.
  //
  //    **Dezelfde vorm als de bevinding die dit bestand deed ontstaan, één laag
  //    hoger.** Daar deed een sweep zich voor als inventarisatie; hier trok het
  //    gereedschap dat de klasse telt zijn eigen grens, en niemand mat waar die
  //    grens langs liep. De lijst is uitgebreid, en dat is de eigenlijke
  //    reparatie van QS8-286 — dit testblok dicht de drie gaten die eronder
  //    lagen.
  //
  // ⚠️ **De acteur is de groepsgenoot en niet een wildvreemde**, om dezelfde
  //    reden als bij de blokken hierboven: een vreemde wordt al door
  //    `goals_select` tegengehouden, en dan bewijst rood niets over de poort in
  //    de functie.
  describe('herorden_weekplan — je herordent het weekplan van een ander niet', () => {
    let planGoalId = '';
    let stapEen = '';
    let stapTwee = '';

    beforeAll(async () => {
      const admin = adminDb();
      const groep = await admin
        .from('goal_group_links')
        .select('group_id')
        .eq('goal_id', w.groepsGoalId)
        .single();
      if (groep.error) throw new Error(`groep: ${groep.error.message}`);

      const doel = await admin
        .from('goals')
        .insert({ owner_id: w.eigenaar.id, title: 'DEF-WEEKPLAN', target_date: addDays(w.vandaag, 90) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel: ${doel.error.message}`);
      planGoalId = doel.data.id as string;

      const koppel = await admin
        .from('goal_group_links')
        .insert({ goal_id: planGoalId, group_id: groep.data.group_id });
      if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

      const maakStap = async (order: number, titel: string): Promise<string> => {
        const r = await admin
          .from('weekly_plan_steps')
          .insert({ goal_id: planGoalId, order_index: order, title: titel })
          .select('id')
          .single();
        if (r.error) throw new Error(`stap ${order}: ${r.error.message}`);
        return r.data.id as string;
      };

      stapEen = await maakStap(1, 'DEF-PLAN-EEN');
      stapTwee = await maakStap(2, 'DEF-PLAN-TWEE');
    }, SETUP_TIMEOUT);

    it(
      'de groepsgenoot ziet het doel maar niet de stappen — en dat maakt het geval scherper',
      async () => {
        // ⚠️⚠️ **Deze assertie stond er eerst andersom, en dat was fout op een
        //    manier die het onderwerp van dit issue raakt.** Ze verwachtte dat
        //    de groepsgenoot de stappen kón lezen — "anders is hij niet de
        //    sterke acteur". Gemeten: hij ziet er nul.
        //    `weekly_plan_steps_select` is eigenaar-only.
        //
        //    **Voor een `SECURITY DEFINER`-functie is dat geen verzwakking maar
        //    het hele punt.** Zo'n functie draait als zijn eigenaar en komt
        //    langs geen enkele policy. Bob mag deze rijen niet eens zíen, en kon
        //    ze zonder de poort in de functie wél herordenen — dat is precies de
        //    klasse waar dit bestand over gaat, en de reden dat `rls:dekking`
        //    hier niets over zegt.
        //
        // ⚠️ Wat hier wél getoetst hoort te worden is dat hij geen wildvreemde
        //    is: hij ziet het dóél, dus hij komt langs `goals_select`. Zou hij
        //    dat niet zien, dan werd het geval hieronder al door een éérdere
        //    grendel afgevangen en bewees het niets over de poort.
        const doel = await w.groepsgenoot.db.from('goals').select('id').eq('id', planGoalId);
        expect(
          doel.data ?? [],
          'de groepsgenoot is geen echt medelid van dit doel, en dan toetst het geval ' +
            'hieronder een zwakkere acteur dan het beweert',
        ).toHaveLength(1);

        const stappen = await w.groepsgenoot.db
          .from('weekly_plan_steps')
          .select('id')
          .eq('goal_id', planGoalId);
        expect(
          stappen.data ?? [],
          'het weekplan van een ander hoort dicht te zijn — staat het open, dan is dat ' +
            'een lek dat losstaat van de poort hieronder',
        ).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot krijgt not_owner en de volgorde blijft staan',
      async () => {
        const poging = await w.groepsgenoot.db.rpc('herorden_weekplan', {
          p_goal_id: planGoalId,
          p_ids: [stapTwee, stapEen],
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        // ⚠️ Het effect vóór de reden, en dat is de les van QS8-285: bij een
        //    weggehaalde poort valt een test die met `reason` begint om op een
        //    veranderde fóutreden, en zegt hij nog steeds niets over de volgorde.
        const na = await adminDb()
          .from('weekly_plan_steps')
          .select('id, order_index')
          .eq('goal_id', planGoalId)
          .order('order_index', { ascending: true });

        expect(
          (na.data ?? []).map((r) => r.id),
          'de groepsgenoot heeft het weekplan van een ander omgegooid',
        ).toEqual([stapEen, stapTwee]);

        expect(uitslag(poging.data).reason).toBe('not_owner');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar herordent zijn eigen weekplan wél',
      async () => {
        // ⚠️ De must-allow. Zonder haar bewijst het geval hierboven ook een
        //    functie die het voor niemand doet.
        const poging = await w.eigenaar.db.rpc('herorden_weekplan', {
          p_goal_id: planGoalId,
          p_ids: [stapTwee, stapEen],
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen weekplan herordenen hoort te lukken, kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb()
          .from('weekly_plan_steps')
          .select('id, order_index')
          .eq('goal_id', planGoalId)
          .order('order_index', { ascending: true });

        expect((na.data ?? []).map((r) => r.id)).toEqual([stapTwee, stapEen]);
      },
      TEST_TIMEOUT,
    );
  });

  // ---------------------------------------------------------------------------
  describe('de twee deadline-RPCs — je vraagt en trekt niet namens een ander', () => {
    /**
     * ⚠️⚠️ **`vraag_deadline_verschuiving` draagt een argument dat elders is
     *    gebruikt om een ándere functie veilig te noemen.** QS8-282 verklaarde
     *    `beslis_deadline_verzoek` veilig met de redenering: die heeft geen
     *    eigenaarstoets, maar dat hoeft niet, want een verzoek kán alleen door
     *    de eigenaar aangemaakt zijn — `vraag_deadline_verschuiving()` toetst
     *    `g.owner_id = auth.uid()` en `deadline_requests_insert` heeft
     *    `check false`.
     *
     *    Die redenering klopt. **Maar de schakel waar hij op rust was door niets
     *    bewaakt.** Valt die poort weg, dan maakt een groepsgenoot een verzoek
     *    voor jouw doel en keurt een derde lid het goed: je streefdatum
     *    verschuift zonder dat je het weet. Dat is voor de derde ronde op rij
     *    dezelfde vorm — een argument dat leunt op een grendel die niets
     *    bewaakt, is een aanname.
     *
     * ⚠️ **De volgorde van deze drie gevallen is met opzet en niet toevallig.**
     *    Een doel draagt hoogstens één open verzoek (`already_open`), dus de
     *    weigering moet vóór het verzoek van de eigenaar komen, en het intrekken
     *    erna. In één opstelling is dat de hele levensloop; los van elkaar zou
     *    elk geval zijn eigen doel en zijn eigen groep nodig hebben.
     */
    let verzoekGoalId = '';
    let verzoekId = '';
    let groupId = '';

    beforeAll(async () => {
      const admin = adminDb();
      const groep = await admin
        .from('goal_group_links')
        .select('group_id')
        .eq('goal_id', w.groepsGoalId)
        .single();
      if (groep.error) throw new Error(`groep: ${groep.error.message}`);
      groupId = groep.data.group_id as string;

      const doel = await admin
        .from('goals')
        .insert({ owner_id: w.eigenaar.id, title: 'DEF-DEADLINE', target_date: addDays(w.vandaag, 90) })
        .select('id')
        .single();
      if (doel.error) throw new Error(`doel: ${doel.error.message}`);
      verzoekGoalId = doel.data.id as string;

      const koppel = await admin
        .from('goal_group_links')
        .insert({ goal_id: verzoekGoalId, group_id: groupId });
      if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);
    }, SETUP_TIMEOUT);

    it(
      'een groepsgenoot krijgt not_owner en er komt geen verzoek',
      async () => {
        const poging = await w.groepsgenoot.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: verzoekGoalId,
          p_group_id: groupId,
          p_new_date: addDays(w.vandaag, 200),
          p_reason: 'Ik vind dat deze datum voor iemand anders verschoven moet worden.',
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        const na = await adminDb()
          .from('deadline_requests')
          .select('id')
          .eq('goal_id', verzoekGoalId);

        expect(
          na.data ?? [],
          'een groepsgenoot heeft namens de eigenaar een deadline-verschuiving ingediend',
        ).toHaveLength(0);

        expect(uitslag(poging.data).reason).toBe('not_owner');
      },
      TEST_TIMEOUT,
    );

    it(
      'de eigenaar dient het verzoek wél in',
      async () => {
        const poging = await w.eigenaar.db.rpc('vraag_deadline_verschuiving', {
          p_goal_id: verzoekGoalId,
          p_group_id: groupId,
          p_new_date: addDays(w.vandaag, 200),
          p_reason: 'Het project op mijn werk is met zes weken uitgelopen en dat loopt door.',
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen verzoek indienen hoort te lukken, kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        verzoekId = (poging.data as { request_id?: string } | null)?.request_id ?? '';
        expect(verzoekId).not.toBe('');
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot krijgt not_yours en het verzoek blijft open',
      async () => {
        const poging = await w.groepsgenoot.db.rpc('trek_deadline_verzoek_in', {
          p_request_id: verzoekId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);

        const na = await adminDb()
          .from('deadline_requests')
          .select('status')
          .eq('id', verzoekId)
          .single();

        expect(
          na.data?.status,
          'een groepsgenoot heeft het openstaande verzoek van een ander ingetrokken',
        ).toBe('open');

        expect(uitslag(poging.data).reason).toBe('not_yours');
      },
      TEST_TIMEOUT,
    );

    it(
      'de aanvrager trekt zijn eigen verzoek wél in',
      async () => {
        const poging = await w.eigenaar.db.rpc('trek_deadline_verzoek_in', {
          p_request_id: verzoekId,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen verzoek intrekken hoort te lukken, kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);

        const na = await adminDb()
          .from('deadline_requests')
          .select('status')
          .eq('id', verzoekId)
          .single();

        expect(na.data?.status).toBe('withdrawn');
      },
      TEST_TIMEOUT,
    );
  });
});
