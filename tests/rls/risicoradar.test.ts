/**
 * EPIC 12 — de haalbaarheidsberekening, uitgevoerd in plaats van beredeneerd.
 *
 * ⚠️ Acceptatiecriterium 3 van QS8-93: deterministisch en testbaar met vaste
 *    scenario's. Dat is de reden dat deze suite bestaat — de berekening is een
 *    heuristiek die Quinten en ik zelf bedacht hebben, zonder onderzoek en
 *    zonder gebruikersdata (zie ENGINEER-REVIEW). Wat je dan minstens wilt, is
 *    dat hij bij dezelfde invoer hetzelfde antwoord geeft.
 *
 * ⚠️ **Deze suite maakt geen accounts aan.** `herbereken_risico()` is voor
 *    `authenticated` ingetrokken en draait alleen als `service_role`, dus alles
 *    hier loopt via `adminDb()`. Dat scheelt aanmeldingen, en Supabase weigert
 *    na ongeveer dertig per uur — zie de valkuil over "Request rate limit
 *    reached".
 *
 * ⚠️ De fixtures gaan er bewust overheen als ze al bestaan en worden achteraf
 *    opgeruimd. Een halve fixture van een vorige run is de stilste manier om
 *    een groene test te krijgen die niets meet.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';

const TEST_TIMEOUT = 30_000;

/**
 * Eén account voor de hele suite. Supabase weigert na ongeveer dertig
 * aanmeldingen per uur, en deze suite heeft er maar één nodig: alles draait
 * verder als `service_role`.
 */
let eigenaarId = '';

interface Scenario {
  readonly naam: string;
  readonly goalId: string;
  /** Dagen tot de streefdatum. */
  readonly deadlineOverDagen: number;
  readonly openMijlpalen: number;
  /** Status per cyclus, oudste eerst. Leeg = geen geschiedenis. */
  readonly cycli: readonly ('approved' | 'missed')[];
  /** Van de goedgekeurde cycli: hoeveel er op de vloer gehaald zijn. */
  readonly opDeVloer?: number;
  readonly verwacht: 'on_track' | 'at_risk' | 'behind' | 'unreachable';
}

const SCENARIOS: readonly Scenario[] = [
  {
    // ⚠️ Acceptatiecriterium 4: een nieuw doel staat op "op koers" en niet op
    //    "onbekend". Iemand die net begint hoort geen waarschuwing te zien over
    //    een patroon dat nog niet bestaat.
    naam: 'nieuw doel zonder geschiedenis',
    goalId: '00000000-0000-0000-0000-00000000c001',
    deadlineOverDagen: 200,
    openMijlpalen: 5,
    cycli: [],
    verwacht: 'on_track',
  },
  {
    naam: 'streefdatum binnen een week met open werk',
    goalId: '00000000-0000-0000-0000-00000000c002',
    deadlineOverDagen: 2,
    openMijlpalen: 1,
    cycli: [],
    verwacht: 'unreachable',
  },
  {
    naam: 'meer mijlpalen dan weken',
    goalId: '00000000-0000-0000-0000-00000000c003',
    deadlineOverDagen: 21,
    openMijlpalen: 9,
    cycli: [],
    verwacht: 'unreachable',
  },
  {
    // tempo 1/4 = 0,25 · benodigd 8/20 = 0,4 · 0,4 > 0,25 × 1,5
    naam: 'tempo te laag voor wat er ligt',
    goalId: '00000000-0000-0000-0000-00000000c004',
    deadlineOverDagen: 145,
    openMijlpalen: 8,
    cycli: ['missed', 'missed', 'missed', 'approved'],
    verwacht: 'behind',
  },
  {
    naam: 'vier cycli stil met open werk',
    goalId: '00000000-0000-0000-0000-00000000c005',
    deadlineOverDagen: 300,
    openMijlpalen: 1,
    cycli: ['missed', 'missed', 'missed', 'missed'],
    verwacht: 'behind',
  },
  {
    // tempo 1,0 · benodigd 2/20 = 0,1
    naam: 'ruim op tempo',
    goalId: '00000000-0000-0000-0000-00000000c006',
    deadlineOverDagen: 145,
    openMijlpalen: 2,
    cycli: ['approved', 'approved', 'approved', 'approved'],
    verwacht: 'on_track',
  },
  {
    // ⚠️ Het subtiele signaal: alles gehaald, maar structureel op de vloer. De
    //    weken tellen volledig mee en de reeks loopt door — en toch schuift het
    //    plafond steeds verder weg. Dit is precies het geval dat je zonder
    //    radar pas ziet als het te laat is.
    naam: 'alles gehaald maar structureel op de vloer',
    goalId: '00000000-0000-0000-0000-00000000c007',
    deadlineOverDagen: 145,
    openMijlpalen: 2,
    cycli: ['approved', 'approved', 'approved', 'approved'],
    opDeVloer: 4,
    verwacht: 'at_risk',
  },
];

/**
 * Roept `herbereken_risico()` aan.
 *
 * ⚠️ Die functie staat niet in `database.types.ts`, en dat is geen omissie maar
 *    het bewijs dat migratie 0051 doet wat hij belooft: de generator neemt
 *    alleen functies op die `authenticated` mag aanroepen, en deze is daar juist
 *    voor ingetrokken. Een gebruiker die zijn eigen risicostand kan laten
 *    herberekenen is een gratis rekenopdracht op een gratis tier.
 *
 *    Vandaar deze cast, op één plek en met deze uitleg erbij — in plaats van het
 *    recht te verruimen zodat de typegenerator tevreden is.
 */
async function herbereken(goalId: string): Promise<{ data: string | null; error: unknown }> {
  const db = adminDb() as unknown as {
    rpc: (
      naam: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: string | null; error: unknown }>;
  };

  return db.rpc('herbereken_risico', { p_goal_id: goalId });
}

describe('QS8-93 — de haalbaarheidsberekening', () => {
  beforeAll(async () => {
    if (!rlsTestsConfigured) return;
    const admin = adminDb();

    const eigenaar = await createTestUser('radar-eigenaar');
    eigenaarId = eigenaar.id;

    for (const s of SCENARIOS) {
      await admin.from('goals').delete().eq('id', s.goalId);

      await admin.from('goals').insert({
        id: s.goalId,
        owner_id: eigenaarId,
        title: s.naam,
        target_date: datumOver(s.deadlineOverDagen),
        status: 'active',
      });

      if (s.openMijlpalen > 0) {
        await admin.from('milestones').insert(
          Array.from({ length: s.openMijlpalen }, (_, i) => ({
            goal_id: s.goalId,
            title: `Mijlpaal ${i + 1}`,
            order_index: i + 1,
            status: 'todo',
          })),
        );
      }

      for (const [i, status] of s.cycli.entries()) {
        // Oudste eerst: de laatste in de lijst is de meest recente cyclus.
        const wekenTerug = s.cycli.length - i;

        // ⚠️ De volgorde is hier het hele punt. Een voltooiing invoegen zet het
        //    weekdoel via `mark_weekly_goal_pending()` op `pending`. Zou de rij
        //    meteen op `approved` staan, dan draait die trigger hem terug en
        //    meet de test iets anders dan hij denkt. Dus: eerst `todo`, dan de
        //    voltooiing, dan de eindstatus.
        const week = await admin
          .from('weekly_goals')
          .insert({
            goal_id: s.goalId,
            title: `Week ${i + 1}`,
            cycle_start_date: datumOver(-7 * wekenTerug),
            cycle_index: i + 1,
            status: 'todo',
          })
          .select('id')
          .single();

        const weekId = week.data?.id;
        const vloerNodig = (s.opDeVloer ?? 0) > 0 && status === 'approved';

        if (weekId !== undefined && status === 'approved') {
          await admin.from('completions').insert({
            weekly_goal_id: weekId,
            user_id: eigenaarId,
            achieved_level: vloerNodig ? 'floor' : 'ceiling',
            note: 'Fixture voor de risicoradar',
            cycle_start_date: datumOver(-7 * wekenTerug),
          });
        }

        if (weekId !== undefined) {
          await admin.from('weekly_goals').update({ status }).eq('id', weekId);
        }
      }
    }
  }, 180_000);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    const admin = adminDb();
    for (const s of SCENARIOS) {
      await admin.from('goals').delete().eq('id', s.goalId);
    }
    await removeTestUsers();
  }, 60_000);

  for (const s of SCENARIOS) {
    it(
      `${s.naam} → ${s.verwacht}`,
      async () => {
        const { data, error } = await herbereken(s.goalId);

        expect(error).toBeNull();
        expect(data).toBe(s.verwacht);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'geeft bij dezelfde invoer twee keer hetzelfde antwoord',
    async () => {
      // Acceptatiecriterium 3, letterlijk: deterministisch. Zonder deze test
      // zou een berekening die van rijvolgorde afhangt hierboven gewoon slagen.
      const doel = SCENARIOS[3];
      if (doel === undefined) throw new Error('scenario ontbreekt');

      const een = await herbereken(doel.goalId);
      const twee = await herbereken(doel.goalId);

      expect(een.data).toBe(twee.data);
    },
    TEST_TIMEOUT,
  );

  it(
    'schrijft de onderbouwing mee, zodat de UI kan tonen waarom',
    async () => {
      // Acceptatiecriterium 5.
      const doel = SCENARIOS[3];
      if (doel === undefined) throw new Error('scenario ontbreekt');

      const rij = await adminDb()
        .from('goal_risk')
        .select('status, reason')
        .eq('goal_id', doel.goalId)
        .single();

      const reden = rij.data?.reason as Record<string, unknown> | null;

      expect(reden).not.toBeNull();
      expect(reden).toHaveProperty('weken_over');
      expect(reden).toHaveProperty('open_mijlpalen');
      expect(reden).toHaveProperty('cycli_gehaald');
      expect(reden).toHaveProperty('benodigd_tempo');
    },
    TEST_TIMEOUT,
  );

  it(
    'zet een gearchiveerd doel op on_track zonder te rekenen',
    async () => {
      const admin = adminDb();
      const doel = SCENARIOS[4];
      if (doel === undefined) throw new Error('scenario ontbreekt');

      await admin.from('goals').update({ status: 'archived' }).eq('id', doel.goalId);

      const { data } = await herbereken(doel.goalId);
      expect(data).toBe('on_track');

      const rij = await admin
        .from('goal_risk')
        .select('reason')
        .eq('goal_id', doel.goalId)
        .single();

      expect(rij.data?.reason).toEqual({ reden: 'niet_actief' });

      await admin.from('goals').update({ status: 'active' }).eq('id', doel.goalId);
    },
    TEST_TIMEOUT,
  );
  /**
   * ⚠️ Migratie 0052, en het is nazorg op mijn eigen 0051.
   *
   *    `risico_na_goedkeuring()` is een triggerfunctie en stond na 0051 gewoon
   *    in de API, aanroepbaar door `anon` én `authenticated`. Alle 22 andere
   *    triggerfuncties waren al ingetrokken (migratie 0011); deze was de enige
   *    uitzondering. Gevonden door de Supabase-advisor, niet door mij.
   *
   *    Dat is de omkering van de valkuil uit CLAUDE.md: daar worden fóuten
   *    gekopieerd naar de volgende definer-functie. Hier werd de goede gewoonte
   *    níét gekopieerd. **Een nieuwe SECURITY DEFINER-functie erft niets — het
   *    intrekken hoort in dezelfde migratie als het aanmaken.**
   *
   *    De test dekt álle triggerfuncties en niet alleen degene die deze keer
   *    misging, want de volgende keer is het een andere.
   */
  it(
    'stelt geen enkele triggerfunctie beschikbaar via de API',
    async () => {
      const db = adminDb() as unknown as {
        rpc: (
          naam: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      };

      const { data, error } = await db.rpc('triggerfuncties_in_de_api', {});

      expect(error).toBeNull();
      expect(data ?? []).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});


/** Een datum `dagen` dagen vanaf vandaag, als `YYYY-MM-DD`. */
function datumOver(dagen: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}
