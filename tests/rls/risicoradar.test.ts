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

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

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

/**
 * Bouwt één scenario op: het doel, zijn open mijlpalen en zijn cyclusgeschiedenis.
 *
 * ⚠️ Uit `beforeAll` gehaald op 25-08-2026, zodat de eigenschapstest hieronder
 *    zijn eigen doelen kan bouwen zonder deze vijftig regels te kopiëren. De
 *    zeven scenario's gebruiken hem ongewijzigd.
 */
async function bouwScenario(s: Scenario): Promise<void> {
  const admin = adminDb();

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

/**
 * ⚠️ `skipIf` op de describe, zoals de andere RLS-bestanden — QS8-116.
 *    Hiervóór stond de bewaking alleen in `beforeAll`: zonder credentials
 *    werd de opbouw overgeslagen en faalde elke `it` daarna alsnog, op een
 *    ontbrekende fixture. Dan is `npm test` rood om een reden die niets met
 *    de code te maken heeft — precies het faalbeeld dat QS8-116 opruimde.
 */
describe.skipIf(!rlsTestsConfigured)('QS8-93 — de haalbaarheidsberekening', () => {
  beforeAll(async () => {
    if (!rlsTestsConfigured) return;

    const eigenaar = await createTestUser('radar-eigenaar');
    eigenaarId = eigenaar.id;

    // ⚠️ Dezelfde klok als `herbereken_risico()`: die van de eigenaar. Zie
    //    `datumOver()` voor wat het kostte toen dit de serverklok was.
    const profiel = await adminDb().from('profiles').select('tz').eq('id', eigenaarId).single();
    if (profiel.error || profiel.data === null) throw new Error(`profiel: ${profiel.error?.message}`);
    eigenaarsDatum = localDateIn(profiel.data.tz as TimeZone, now());

    for (const s of SCENARIOS) {
      await bouwScenario(s);
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

  /**
   * ⚠️ **De veiligheidsclaim van deze feature, en tot 25-08-2026 bewaakte niets
   *    hem.** `docs/ENGINEER-REVIEW.md` zegt over de zwaarste stand: "hij treedt
   *    alleen op bij een feit (de datum is er, of er zijn meer mijlpalen dan
   *    weken) en nooit op grond van tempo." Dát is het argument waarom een
   *    zelfbedachte heuristiek hier acceptabel is — de heuristiek mag zich
   *    vergissen in `at_risk` en `behind`, maar niet in de stand die rood kleurt
   *    op het moment dat iemand toch al twijfelt.
   *
   * ⚠️ De zeven scenario's toetsen gedrág: elk één invoer, één verwachte stand.
   *    Twee ervan komen op `unreachable` uit en één op `behind` bij tempo nul.
   *    Geen van die zeven zegt dat `unreachable` *niet bereikbaar is via tempo* —
   *    dat is een eigenschap over de hele invoerruimte, en die valt niet uit
   *    losse gevallen af te leiden. Een herschikking van de takken kan die
   *    eigenschap breken terwijl alle zeven groen blijven.
   *
   *    Deze test loopt daarom de tempodimensie helemaal af — van nul op vier
   *    gehaald tot vier op vier, met en zonder vloerzwaarte — terwijl de feiten
   *    ruim goed staan. Geen enkele combinatie mag `unreachable` opleveren.
   */
  it(
    'komt nooit op unreachable uit door tempo alleen',
    async () => {
      const admin = adminDb();
      const uitkomsten: { naam: string; stand: string | null }[] = [];

      // ⚠️ Ruim binnen de feiten: 300 dagen is ~42 weken en er staan hooguit
      //    twee open mijlpalen. `open_mijlpalen > weken_over` kan dus niet, en
      //    `weken_over = 0` evenmin. Wat er overblijft is puur tempo.
      const varianten: readonly { naam: string; cycli: readonly ('approved' | 'missed')[]; opDeVloer?: number }[] = [
        { naam: 'nul van vier', cycli: ['missed', 'missed', 'missed', 'missed'] },
        { naam: 'een van vier', cycli: ['missed', 'missed', 'missed', 'approved'] },
        { naam: 'twee van vier', cycli: ['missed', 'approved', 'missed', 'approved'] },
        { naam: 'drie van vier', cycli: ['approved', 'approved', 'missed', 'approved'] },
        { naam: 'vier van vier', cycli: ['approved', 'approved', 'approved', 'approved'] },
        {
          naam: 'vier van vier, alles op de vloer',
          cycli: ['approved', 'approved', 'approved', 'approved'],
          opDeVloer: 4,
        },
        { naam: 'een van vier op de vloer', cycli: ['missed', 'missed', 'missed', 'approved'], opDeVloer: 1 },
      ];

      const gebouwd: string[] = [];

      try {
        for (const [i, variant] of varianten.entries()) {
          const goalId = `00000000-0000-0000-0000-0000000000e${i}`;
          gebouwd.push(goalId);

          await bouwScenario({
            naam: `tempo — ${variant.naam}`,
            goalId,
            deadlineOverDagen: 300,
            openMijlpalen: 2,
            cycli: variant.cycli,
            // ⚠️ `exactOptionalPropertyTypes` staat aan: een optionele sleutel
            //    mag ontbreken, maar niet expliciet `undefined` zijn.
            ...(variant.opDeVloer === undefined ? {} : { opDeVloer: variant.opDeVloer }),
            verwacht: 'on_track',
          });

          const { data, error } = await herbereken(goalId);
          expect(error).toBeNull();
          uitkomsten.push({ naam: variant.naam, stand: data });
        }

        // ⚠️ Alles in één keer toetsen en niet per variant afbreken: bij een
        //    regressie wil je zien wélke standen eruit komen, niet alleen de
        //    eerste die misgaat.
        expect(uitkomsten.filter((u) => u.stand === 'unreachable')).toEqual([]);

        // ⚠️ En de tegenproef: deze zeven mogen niet allemaal `on_track` zijn,
        //    want dan bewijst de test hierboven niets. Slecht tempo hóórt een
        //    lichtere waarschuwing op te leveren; alleen niet de zwaarste.
        expect(uitkomsten.some((u) => u.stand !== 'on_track')).toBe(true);
      } finally {
        for (const id of gebouwd) await admin.from('goals').delete().eq('id', id);
      }
    },
    TEST_TIMEOUT,
  );

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
/**
 * ⚠️ **Op de klok van de eigenaar en niet in UTC.** `herbereken_risico()` rekent
 *    sinds migratie 0155 met `eigenaarsdatum()` — `profiles.tz`, standaard
 *    Europe/Amsterdam. Deze functie rekende in UTC, en zodra de eigen datum een
 *    dag vóórloopt op de serverdatum viel de oudste cyclus (`-28`) buiten
 *    `v_venster_start` en gaf scenario c004 `at_risk` in plaats van `behind`.
 *
 *    Gemeten door de tz-default tijdelijk op Pacific/Kiritimati te zetten:
 *    `expected 'at_risk' to be 'behind'`. In CEST is dat elke dag tussen 22:00Z
 *    en 23:59Z — twee uur per dag **loos rood**, en dat is nog vervelender dan
 *    loos groen, want het leert je een falende poort te negeren.
 *
 *    Dit was een regressie van 0155: die migratie verplaatste de functie naar de
 *    eigenaarsklok en liet dit bestand op de serverklok staan. QS8-271.
 */
function datumOver(dagen: number): IsoDate {
  return addDays(eigenaarsDatum, dagen);
}

/** De dag zoals de eigenaar hem ziet — in `beforeAll` gevuld uit `profiles.tz`. */
let eigenaarsDatum: IsoDate;
