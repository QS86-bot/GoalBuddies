import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * `openstaande_beoordelingen()` pagineert met een cursor — 0125.
 *
 * ⚠️ **Dit is de tweede van drie offsetlijsten, en de enige waar de gebruiker de
 *    verschuiving zélf veroorzaakt.** Bij `weekafsluiting_reacties()` (0121)
 *    moest iemand ánders een reactie verwijderen. Hier haalt goedkeuren de rij
 *    uit de lijst, en goedkeuren is precies waar dit scherm voor is. Wie twee
 *    pagina's beoordelingen heeft en de eerste afwerkt, duwt de tweede pagina
 *    onder zijn eigen cursor door.
 *
 * ⚠️ **De belofte hier is niet "de query klopt" maar "er wordt niemand
 *    overgeslagen".** Dat is regel 18 vraag 2: een test die de SQL naspelt,
 *    blijft groen als de SQL en de test dezelfde denkfout delen. Daarom toetst
 *    dit bestand de únie van wat een gebruiker in twee bladerslagen te zien
 *    krijgt, en niet de inhoud van één pagina.
 *
 * ⚠️ **Waarom dat meer is dan netheid.** Elke overgeslagen rij is een buddy die
 *    op een oordeel wacht en het niet krijgt — zonder foutmelding, en met een
 *    lijst die er compleet uitziet. De succesmetriek van de PRD is ≥80% binnen
 *    48 uur, en dit is een stille manier om die te missen.
 *
 * ⚠️ Alles hieronder loopt onder de **eigen sessie van de beoordelaar** en niet
 *    via `adminDb()`. Deze functie leunt op de RLS van de aanroeper — dat is het
 *    verschil met `te_beoordelen_voor()`, dat de meldingenjob als `service_role`
 *    aanroept en waar de grens dáárom in de functie zit.
 */

interface Fixture {
  /** Eigenaar van de vier doelen. Wacht op een oordeel. */
  alice: TestUser;
  /** De beoordelaar. Ziet vier rijen en werkt ze in pagina's af. */
  bob: TestUser;
  groep: string;
  /** De vier doelen, in de volgorde waarin ze zijn ingediend. */
  doelen: readonly string[];
  /** De vier voltooiingen, in dezelfde volgorde. */
  voltooiingen: readonly string[];
}

interface Rij {
  readonly completion_id: string;
  readonly group_id: string;
  readonly submitted_at: string;
  readonly total_open: number;
}

describe.skipIf(!rlsTestsConfigured)('openstaande_beoordelingen — bladeren slaat niemand over', () => {
  let f: Fixture;

  /** Eén pagina, zoals de client hem opvraagt. */
  async function pagina(
    gebruiker: TestUser,
    limiet: number,
    na: { at: string; id: string } | null = null,
  ): Promise<readonly Rij[]> {
    const db = gebruiker.db as unknown as {
      rpc: (
        naam: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await db.rpc('openstaande_beoordelingen', {
      p_limit: limiet,
      p_na_at: na?.at ?? null,
      p_na_id: na?.id ?? null,
    });
    if (error) throw new Error(`openstaande_beoordelingen: ${error.message}`);
    return (data ?? []) as readonly Rij[];
  }

  /** De cursor die de client uit een pagina afleidt: de laatste rij. */
  function cursorVan(rijen: readonly Rij[]): { at: string; id: string } | null {
    const laatste = rijen[rijen.length - 1];
    return laatste === undefined ? null : { at: laatste.submitted_at, id: laatste.completion_id };
  }

  beforeAll(async () => {
    const [alice, bob] = await Promise.all([
      createTestUser('blader-alice'),
      createTestUser('blader-bob'),
    ]);

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Blader' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const uit = gemaakt.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep mislukte: ${JSON.stringify(gemaakt.data)}`);
    }

    const mee = await bob.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    const doelen: string[] = [];
    const voltooiingen: string[] = [];

    for (let n = 1; n <= 4; n += 1) {
      const doel = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: `Blader ${n}`, target_date: cyclus.endDate })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel ${n}: ${doel.error?.message}`);

      const koppel = await alice.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: uit.group.id });
      if (koppel.error) throw new Error(`koppelen ${n}: ${koppel.error.message}`);

      const week = await alice.db
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `Week ${n}`,
          cycle_start_date: cyclus.startDate,
          cycle_index: 1,
        })
        .select('id')
        .single();
      if (week.error || week.data === null) throw new Error(`weekdoel ${n}: ${week.error?.message}`);

      const voltooiing = await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: alice.id,
          achieved_level: 'ceiling',
          note: `Bladerproef ${n}`,
          cycle_start_date: cyclus.startDate,
        })
        .select('id')
        .single();
      if (voltooiing.error || voltooiing.data === null) {
        throw new Error(`voltooiing ${n}: ${voltooiing.error?.message}`);
      }

      doelen.push(doel.data.id);
      voltooiingen.push(voltooiing.data.id);
    }

    // ⚠️ **De tijdstempels worden met de hand uit elkaar getrokken**, en dat is
    //    geen gemak maar een eis. `submitted_at` staat op `now()`, en vier
    //    inserts binnen één milliseconde geven vier gelijke waarden. Dan bepaalt
    //    de id de volgorde, die is willekeurig, en dan toetst dit bestand een
    //    volgorde die per run verandert. De cursor moet juist bewijzen dat hij op
    //    een tótale ordening staat.
    for (const [i, id] of voltooiingen.entries()) {
      const gezet = await adminDb()
        .from('completions')
        .update({ submitted_at: new Date(Date.UTC(2026, 0, 1, 12, i)).toISOString() })
        .eq('id', id);
      if (gezet.error) throw new Error(`tijdstempel ${i}: ${gezet.error.message}`);
    }

    f = { alice, bob, groep: uit.group.id, doelen, voltooiingen };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await adminDb().from('goals').delete().in('id', [...f.doelen]);
    await adminDb().from('groups').delete().eq('id', f.groep);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ **De bevestigende toets staat eerst.** Elke belofte hieronder is gratis
   *    groen op een functie die niets teruggeeft; een tikfout in een
   *    parameternaam levert precies hetzelfde beeld op.
   */
  it(
    'geeft de beoordelaar alle vier de wachtende weken, oplopend',
    async () => {
      const alles = await pagina(f.bob, 50);

      expect(alles.map((r) => r.completion_id)).toEqual([...f.voltooiingen]);
      expect(alles[0]!.total_open).toBe(4);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Dit is de toets waarvoor dit bestand bestaat.** Met `offset` gaf deze
   *    reeks handelingen drie van de vier rijen terug: goedkeuren haalt
   *    beoordeling 1 uit de verzameling, alles schuift één plek op, en `offset
   *    2` begint dan bij wat vóór het goedkeuren op plek 3 stond. Beoordeling 3
   *    komt pas terug als je het scherm opnieuw opent.
   *
   *    De cursor kent dat probleem niet: hij is een wáárde en geen plek. De rij
   *    waar hij naar wijst mag zelfs verdwijnen — `(submitted_at, id) >` blijft
   *    een geldige vergelijking.
   */
  it(
    'slaat niemand over als er tussen twee bladerslagen iets goedgekeurd wordt',
    async () => {
      const eerste = await pagina(f.bob, 2);
      expect(eerste).toHaveLength(2);

      const cursor = cursorVan(eerste);

      // Precies de knop van dit scherm: Bob beoordeelt de bovenste rij.
      const oordeel = await f.bob.db.from('completion_approvals').insert({
        completion_id: eerste[0]!.completion_id,
        group_id: eerste[0]!.group_id,
        approver_id: f.bob.id,
        subject_id: f.bob.id,
        status: 'approved',
      });
      if (oordeel.error) throw new Error(`goedkeuren: ${oordeel.error.message}`);

      const tweede = await pagina(f.bob, 2, cursor);

      const gezien = [...eerste, ...tweede].map((r) => r.completion_id);
      expect([...new Set(gezien)].sort()).toEqual([...f.voltooiingen].sort());
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De teller telt de verzameling en niet de pagina.** Hij was `count(*)
   *    over ()`, en met een cursorfilter erop telt dat nog maar wat ná de cursor
   *    komt. `app/(tabs)/groep.tsx` is de enige plek waar een gebruiker ziet
   *    dát er iets op hem wacht; zou dit getal met de cursor meebewegen, dan
   *    telt die kaart af terwijl je bladert.
   */
  it(
    'houdt total_open gelijk op elke pagina',
    async () => {
      const eerste = await pagina(f.bob, 1);
      const tweede = await pagina(f.bob, 1, cursorVan(eerste));

      expect(eerste[0]!.total_open).toBe(tweede[0]!.total_open);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Een halve cursor is geen cursor.** Eén van de twee waarden NULL betekent
   *    "eerste pagina" — dezelfde afspraak als in `groepschat()` en 0121. Zou de
   *    functie hem stil als grens gebruiken, dan levert dat `(x, null)` op, en
   *    dat is in SQL geen vergelijking maar NULL: de hele pagina valt weg zonder
   *    foutmelding.
   */
  it(
    'behandelt een half ingevulde cursor als geen cursor',
    async () => {
      const volledig = await pagina(f.bob, 50);
      const alleenTijd = await pagina(f.bob, 50, { at: volledig[0]!.submitted_at, id: null as never });

      expect(alleenTijd.map((r) => r.completion_id)).toEqual(volledig.map((r) => r.completion_id));
    },
    TEST_TIMEOUT,
  );
});
