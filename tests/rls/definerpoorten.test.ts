import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

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
 * werkt. Dit bestand dicht de drie die overbleven.
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

    const koppel = await eigenaar.db
      .from('goal_group_links')
      .insert({ goal_id: groepsGoalId, group_id: gd.group.id });
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

    w = {
      eigenaar,
      groepsgenoot,
      groepsGoalId,
      soloGoalId,
      archiveerGoalId,
      datumGoalId,
      gemistWeekId,
      eigenGemistWeekId,
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
        const poging = await w.eigenaar.db.rpc('schuif_weekdoel_door', {
          p_weekly_goal_id: w.eigenGemistWeekId,
          p_cycle_start_date: addDays(w.vandaag, 7),
          p_cycle_index: 2,
        });
        if (poging.error) throw new Error(`aanroep: ${poging.error.message}`);
        expect(
          uitslag(poging.data).ok,
          `je eigen weekdoel doorschuiven hoort te lukken — kreeg ${uitslag(poging.data).reason}`,
        ).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });
});
