/**
 * Vier routes scheiden een wachtende week van zijn beoordelaars — migratie 0109.
 *
 * ⚠️ **De bevinding van 27-08 telde er twee en het zijn er vier.** Hij noemde
 *    `verlaat_groep()` en het ontkoppelen van een doel, en schreef als
 *    voorwaarde op: *"wordt zwaarder als er een tweede route bijkomt die een
 *    doel van zijn beoordelaars scheidt"*. Die waren er toen al, en één ervan
 *    (`archiveer_groep()`, 0092) was twee dagen éérder gebouwd.
 *
 * ⚠️ **Elke route krijgt een eigen groep én een eigen gebruikerspaar.** Dat is
 *    de les uit `hulpfuncties.test.ts`: een gedeelde fixture hield daar een
 *    antwoord overeind dat allang veranderd was, omdat een ánder geval het lid
 *    nog in een groep had. Een suite over "er is niemand meer die kan
 *    goedkeuren" is precies het soort suite waar dat stil misgaat.
 *
 * ⚠️ **De belofte is niet "0109 geeft een rij terug".** Dat zou zichzelf
 *    toetsen. De belofte is dat élke route waarlangs een week zijn beoordelaars
 *    kwijtraakt, zichtbaar wordt — en dat een gezonde week dat niet is. Zonder
 *    die tweede helft bewijst een gevulde uitkomst alleen dat er íets misgaat.
 *
 * ⚠️ **0109 repareerde de vastloper niet; migratie 0135 doet dat wél.** De
 *    productbeslissing waar die eerste kop op wachtte is op 31-08-2026 genomen
 *    (QS8-178): een vastgelopen week wordt na de goedkeuringstermijn alsnog
 *    góédgekeurd, niet als gemist geboekt. Alle vier de routes zijn handelingen
 *    van een ánder, en iemand een minpunt geven omdat zijn buddy vertrok, straft
 *    hem voor iets buiten zijn macht.
 *
 *    Deze suite bewaakt daarom nu twee dingen: dat elke route zíchtbaar wordt
 *    (0109, zodat route vijf opvalt) én dat elke route ook daadwerkelijk
 *    afgehandeld wordt (0135). Het laatste blok hieronder is dat tweede.
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
const TEST_TIMEOUT = 60_000;

interface Opstelling {
  /** De eigenaar van het doel — degene wiens week op goedkeuring wacht. */
  eigenaar: TestUser;
  /** Het enige lid dat die week zou mógen beoordelen. */
  beoordelaar: TestUser;
  groupId: string;
  goalId: string;
  weeklyGoalId: string;
  /** De cyclusdag waarop het weekdoel staat — `rondAf()` heeft hem nodig. */
  cycleStart: IsoDate;
  completionId: string;
}

/** Wat 0109 over dit doel meldt: de reden, of `null` als er niets vastligt. */
async function vastgelopenReden(goalId: string): Promise<string | null> {
  const { data, error } = await adminDb().rpc('vastgelopen_goedkeuringen');
  if (error) throw new Error(`vastgelopen_goedkeuringen: ${error.message}`);

  const rijen = (data ?? []) as { goal_id: string; reden: string }[];
  return rijen.find((r) => r.goal_id === goalId)?.reden ?? null;
}

/**
 * Zet het indienen ver genoeg terug om de termijn te laten verstrijken.
 *
 * ⚠️ Dit gaat via de beheerdersclient omdat het móet: sinds 0147 heeft
 *    `authenticated` geen INSERT-recht meer op `submitted_at` en al helemaal geen
 *    UPDATE-recht. Dat is precies wat `route 3` hieronder toetst.
 */
async function verouder(completionId: string, dagen: number): Promise<void> {
  const ms = dagen * 24 * 60 * 60 * 1000;
  const admin = adminDb();
  const terug = (t: string | null): string | null =>
    t === null ? null : new Date(new Date(t).getTime() - ms).toISOString();

  const voltooiing = await admin
    .from('completions')
    .select('submitted_at, weekly_goal_id')
    .eq('id', completionId)
    .single();
  if (voltooiing.error || voltooiing.data === null) {
    throw new Error(`verouderen: ${voltooiing.error?.message}`);
  }

  const weekdoel = await admin
    .from('weekly_goals')
    .select('goal_id')
    .eq('id', voltooiing.data.weekly_goal_id)
    .single();
  if (weekdoel.error || weekdoel.data === null) {
    throw new Error(`verouderen: ${weekdoel.error?.message}`);
  }

  const doel = await admin
    .from('goals')
    .select('beoordelaar_weggehaald_op')
    .eq('id', weekdoel.data.goal_id)
    .single();
  if (doel.error || doel.data === null) throw new Error(`verouderen: ${doel.error?.message}`);

  const ingediend = await admin
    .from('completions')
    .update({ submitted_at: terug(voltooiing.data.submitted_at) ?? new Date().toISOString() })
    .eq('id', completionId);
  if (ingediend.error) throw new Error(`verouderen: ${ingediend.error.message}`);

  // ⚠️ **De stempel schuift mee, en dat is het verschil tussen terugspoelen en
  //    herschrijven.** Zette deze helper `submitted_at` op een absolute datum
  //    en liet hij `beoordelaar_weggehaald_op` staan, dan lag de stempel na de
  //    verplaatsing altijd twintig dagen ná het indienen — welke volgorde de
  //    route in het echt ook had. De conditie van 0147 was dan bij elke route
  //    waar om dezelfde reden, en de speling van zeven dagen toetste niets.
  //    Beide klokken evenveel terugzetten laat de volgorde staan.
  const stempel = terug(doel.data.beoordelaar_weggehaald_op);
  if (stempel !== null) {
    const verzet = await admin
      .from('goals')
      .update({ beoordelaar_weggehaald_op: stempel })
      .eq('id', weekdoel.data.goal_id);
    if (verzet.error) throw new Error(`verouderen: ${verzet.error.message}`);
  }
}

/** Laat de rollover zijn ronde doen. */
async function draaiTermijn(termijn = 7): Promise<number> {
  const { data, error } = await adminDb().rpc('keur_vastgelopen_goedkeuringen_goed', {
    p_termijn_dagen: termijn,
  });
  if (error) throw new Error(`termijn: ${error.message}`);
  return data as unknown as number;
}

/** Hoeveel buddy's deze voltooiing daadwerkelijk hebben goedgekeurd. */
async function goedkeuringen(completionId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from('completion_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('completion_id', completionId);
  if (error) throw new Error(`goedkeuringen: ${error.message}`);

  return count ?? 0;
}

/** De status van het weekdoel achter een voltooiing. */
async function weekstatus(completionId: string): Promise<string> {
  const c = await adminDb()
    .from('completions')
    .select('weekly_goal_id')
    .eq('id', completionId)
    .single();
  if (c.error || c.data === null) throw new Error(`voltooiing: ${c.error?.message}`);

  const w = await adminDb()
    .from('weekly_goals')
    .select('status')
    .eq('id', c.data.weekly_goal_id)
    .single();
  if (w.error || w.data === null) throw new Error(`weekdoel: ${w.error?.message}`);

  return w.data.status as string;
}

/**
 * Wat er voor dit doel in het grootboek staat.
 *
 * ⚠️ Punten zijn privé (domeinregel 10), dus dit gaat per definitie via de
 *    beheerdersclient. Dat is opstelling en niet wat hier getoetst wordt.
 */
async function punten(goalId: string): Promise<number> {
  const { data, error } = await adminDb()
    .from('points_ledger')
    .select('delta')
    .eq('goal_id', goalId);
  if (error) throw new Error(`points_ledger: ${error.message}`);

  return (data ?? []).reduce((som, r) => som + (r.delta as number), 0);
}

/**
 * Bouwt een verse groep met een eigenaar, één beoordelaar en een week die op
 * goedkeuring wacht.
 *
 * ⚠️ De `pending`-status wordt niet gezet maar verdíend: `completions_mark_pending`
 *    doet dat bij het invoegen van de voltooiing. Een fixture die de status zelf
 *    schrijft, toetst een toestand die de app misschien nooit maakt.
 */
async function bouwOpstelling(label: string, metVoltooiing = true): Promise<Opstelling> {
  const eigenaar = await createTestUser(`${label}-eigenaar`);
  const beoordelaar = await createTestUser(`${label}-beoordelaar`);

  const groep = await eigenaar.db.rpc('create_group', { group_name: `Vastgelopen-${label}` });
  const groepData = groep.data as unknown as {
    ok?: boolean;
    group?: { id: string; invite_code: string };
  };
  if (groepData.ok !== true || !groepData.group) {
    throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
  }

  const meedoen = await beoordelaar.db.rpc('join_group_with_code', {
    code: groepData.group.invite_code,
  });
  const mee = (meedoen.data ?? {}) as { ok?: boolean; reason?: string };
  if (mee.ok !== true) throw new Error(`beoordelaar werd geen lid: ${mee.reason ?? 'geen reden'}`);

  const admin = adminDb();
  const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

  const doel = await eigenaar.db
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: 'VASTDOEL', target_date: addDays(vandaag, 90) })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

  const koppeling = await eigenaar.db
    .from('goal_group_links')
    .insert({ goal_id: doel.data.id, group_id: groepData.group.id });
  if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

  // ⚠️ Via de beheerdersclient: `authenticated` heeft geen insert-recht op
  //    `weekly_goals` — die lopen in de app via een RPC. Dat is opstelling en
  //    niet wat hier getoetst wordt.
  const weekdoel = await admin
    .from('weekly_goals')
    .insert({
      goal_id: doel.data.id,
      title: 'VASTWEEK',
      points_ceiling: 2,
      points_floor: 1,
      points_miss: -1,
      cycle_start_date: vandaag,
      cycle_index: 1,
    })
    .select('id')
    .single();
  if (weekdoel.error || weekdoel.data === null) throw new Error(`weekdoel: ${weekdoel.error?.message}`);

  const opstelling: Opstelling = {
    eigenaar,
    beoordelaar,
    groupId: groepData.group.id,
    goalId: doel.data.id,
    weeklyGoalId: weekdoel.data.id,
    cycleStart: vandaag,
    completionId: '',
  };

  if (metVoltooiing) opstelling.completionId = await rondAf(opstelling);

  return opstelling;
}

/**
 * Dient de voltooiing in, als de eigenaar zelf.
 *
 * ⚠️ **Dit staat apart van `bouwOpstelling()` omdat de vólgorde de test is.**
 *    De conditie van 0147 vergelijkt `beoordelaar_weggehaald_op` met
 *    `submitted_at`, en route 1 is nu juist het geval waarin de handeling
 *    vóór het indienen ligt. Zolang de opstelling de voltooiing altijd als
 *    eerste maakte, was die tijdlijn niet te maken met echte handelingen — en
 *    dan toetst geen enkele route de speling van zeven dagen. Gemeten: met de
 *    oude opstelling bleef de suite groen als je `- interval '7 days'` uit de
 *    functie haalde. Dat is CLAUDE.md regel 18 vraag 3.
 */
async function rondAf(o: Opstelling): Promise<string> {
  const voltooiing = await o.eigenaar.db
    .from('completions')
    .insert({
      weekly_goal_id: o.weeklyGoalId,
      user_id: o.eigenaar.id,
      achieved_level: 'ceiling',
      note: 'af',
      cycle_start_date: o.cycleStart,
    })
    .select('id')
    .single();
  if (voltooiing.error || voltooiing.data === null) {
    throw new Error(`voltooiing: ${voltooiing.error?.message}`);
  }

  return voltooiing.data.id;
}

describe.skipIf(!rlsTestsConfigured)('een week die zijn beoordelaars kwijtraakt', () => {
  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de gezonde kant', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('gezond');
    }, SETUP_TIMEOUT);

    it(
      'meldt niets zolang er een beoordelaar is',
      async () => {
        // ⚠️ **Dit is de helft die deze suite bruikbaar houdt.** Een teller die
        //    élke wachtende week meldt, leert je hem te negeren — en dan is de
        //    dag dat er echt iets vastligt niet te onderscheiden.
        expect(await vastgelopenReden(o.goalId)).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt niets meer zodra de week is goedgekeurd',
      async () => {
        const { error } = await o.beoordelaar.db.from('completion_approvals').insert({
          completion_id: o.completionId,
          approver_id: o.beoordelaar.id,
          subject_id: o.eigenaar.id,
          group_id: o.groupId,
          status: 'approved',
        });
        expect(error).toBeNull();
        expect(await vastgelopenReden(o.goalId)).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 1 — de eigenaar ontkoppelt zijn doel van de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r1');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder koppeling',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        const { error } = await o.eigenaar.db
          .from('goal_group_links')
          .delete()
          .eq('goal_id', o.goalId)
          .eq('group_id', o.groupId);
        expect(error).toBeNull();

        expect(await vastgelopenReden(o.goalId)).toBe('geen_koppeling');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 2 — de eigenaar verlaat de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r2');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder koppeling',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        // ⚠️ **Drie argumenten, en de bevestiging is er één van.** Bij het meten
        //    van deze bevinding gaf een aanroep met één argument
        //    `{"ok": false, "reason": "not_confirmed"}` — en dat las als bewijs
        //    dat deze route niet bestond. Een handeling die niets deed, ziet
        //    eruit als een dichte deur. Vandaar dat de uitkomst hier getoetst
        //    wordt en niet aangenomen.
        const { data } = await o.eigenaar.db.rpc('verlaat_groep', {
          p_group_id: o.groupId,
          p_bevestigd: true,
          p_nieuwe_beheerder: o.beoordelaar.id,
        });
        expect((data as { ok?: boolean } | null)?.ok).toBe(true);

        expect(await vastgelopenReden(o.goalId)).toBe('geen_koppeling');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 3 — de beheerder zet de enige beoordelaar op inactive', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r3');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder iemand die mag oordelen',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        // ⚠️ **Door de beheerder en niet door het lid zelf.**
        //    `guard_group_member_update()` zet de `status` van een gewoon lid
        //    stilzwijgend terug; een meting die dat niet naleest, concludeert
        //    ten onrechte dat deze route dicht zit. Hier is de eigenaar de
        //    beheerder van zijn eigen groep.
        const { error } = await o.eigenaar.db
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', o.groupId)
          .eq('user_id', o.beoordelaar.id);
        expect(error).toBeNull();

        const na = await adminDb()
          .from('group_members')
          .select('status')
          .eq('group_id', o.groupId)
          .eq('user_id', o.beoordelaar.id)
          .single();
        expect(na.data?.status).toBe('inactive');

        expect(await vastgelopenReden(o.goalId)).toBe('geen_beoordelaar');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 4 — de beheerder archiveert de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r4');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter in een groep die niemand meer opent',
      async () => {
        // ⚠️ **Deze route kwam met 0092 op 25-08, twee dagen vóór de bevinding
        //    werd opgeschreven, en stond er niet in.** Dat is precies wat de
        //    "wordt zwaarder als"-zin had moeten vangen.
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        const { data } = await o.eigenaar.db.rpc('archiveer_groep', {
          p_group_id: o.groupId,
          p_bevestigd: true,
        });
        expect((data as { ok?: boolean } | null)?.ok).toBe(true);

        expect(await vastgelopenReden(o.goalId)).toBe('geen_actieve_groep');
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * De toestand die de eigenaar zélf maakt — QS8-186, migratie 0147.
   *
   * ⚠️ **De belofte is domeinregel 3, en die is breder dan één tijdlijn.** Een
   *    eerdere versie van dit blok toetste drie handmatig gezette tijdlijnen, en
   *    de security-review vond daarna vijf routes die er groen langs liepen — met
   *    precies de diagnose uit CLAUDE.md regel 18 vraag 3: *deze test kan groen
   *    blijven terwijl de belofte breekt.* Hij gréép naar een toestand in plaats
   *    van naar de handeling.
   *
   *    Daarom staat de belofte hier nu als tabel: **geen handeling die de
   *    eigenaar alléén kan doen, levert bínnen zeven dagen een goedgekeurde week
   *    met punten op zonder goedkeuring van een buddy.** Elke route voert de
   *    échte handeling uit als de échte client, en assert daarna hetzelfde
   *    drietal.
   *
   * ⚠️ **"Binnen zeven dagen" hoort in die zin en is geen slag om de arm.** De
   *    conditie van 0147 is een afkoeling: ontkoppelen en dan zeven dagen
   *    niets doen brengt je terug bij het gedrag van 0135. Dat is bewust
   *    ontwerp — zie de kop van de migratie — maar wie de belofte zónder die
   *    voorwaarde opschrijft, laat een test iets bewaken wat er niet staat.
   *
   * ⚠️ **De must-allow-helft staat eronder en weegt even zwaar.** De
   *    auto-goedkeuring van 0135 bestaat voor wie zijn buddy búiten zijn schuld
   *    kwijtraakt. Zou deze reparatie die ook dichtzetten, dan hangt precies de
   *    gebruiker waarvoor hij gebouwd is voorgoed op `pending`.
   */
  describe('geen handeling van de eigenaar levert een goedkeuring op', () => {
    /**
     * Voert een route uit en legt de drie beloftes naast de uitkomst.
     *
     * @param voorafAfronden of de voltooiing al bestond vóór de handeling. Beide
     *   volgordes horen erin: bij QS8-186 sloot de eerste versie alleen
     *   "handeling eerst", en juist de ándere volgorde is wat iemand in het echt
     *   doet — je ontkoppelt pas als blijkt dat je buddy niet reageert.
     */
    async function routeBlijftDicht(
      label: string,
      voorafAfronden: boolean,
      handeling: (o: Opstelling) => Promise<void>,
    ): Promise<void> {
      const o = await bouwOpstelling(label, voorafAfronden);

      if (voorafAfronden) {
        await handeling(o);
      } else {
        // ⚠️ Handeling eerst, dán indienen — en de voltooiing bestaat hier nog
        //    niet, want anders ligt `submitted_at` per definitie vóór de
        //    stempel en is deze helft dezelfde tijdlijn als de andere.
        await handeling(o);
        o.completionId = await rondAf(o);
      }

      await verouder(o.completionId, 20);

      await draaiTermijn(7);

      expect(await weekstatus(o.completionId), `${label}: de week hoort te wachten`).toBe('pending');
      expect(await punten(o.goalId), `${label}: geen punten zonder buddy`).toBe(0);
      expect(await goedkeuringen(o.completionId), `${label}: er was geen beoordelaar`).toBe(0);
    }

    const ontkoppel = async (o: Opstelling): Promise<void> => {
      const { error } = await o.eigenaar.db.from('goal_group_links').delete().eq('goal_id', o.goalId);
      if (error) throw new Error(`ontkoppelen: ${error.message}`);
    };

    it(
      'route 1 — ontkoppelen en daarna afronden',
      () => routeBlijftDicht('route1', false, ontkoppel),
      SETUP_TIMEOUT,
    );

    /** ⚠️ De natuurlijkere volgorde, en degene die de eerste reparatie miste. */
    it(
      'route 2 — afronden, wachten of je buddy reageert, en dán ontkoppelen',
      () => routeBlijftDicht('route2', true, ontkoppel),
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ **Opnieuw koppelen en meteen weer ontkoppelen was de sleutel onder de
     *    eerste reparatie**, want die schoof de stempel waar zij zich op baseerde
     *    vooruit. Nu werkt diezelfde handeling tégen de eigenaar: elke nieuwe
     *    handeling legt de stempel alleen maar later.
     */
    it(
      'route 3 — opnieuw koppelen en weer ontkoppelen reset niets',
      () =>
        routeBlijftDicht('route3', true, async (o) => {
          await ontkoppel(o);
          const terug = await o.eigenaar.db
            .from('goal_group_links')
            .insert({ goal_id: o.goalId, group_id: o.groupId });
          if (terug.error) throw new Error(`terugkoppelen: ${terug.error.message}`);
          await ontkoppel(o);
        }),
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ **Eén koppeling laten staan zette de hele tak buiten werking** in de
     *    eerste versie, want die vroeg "is dit doel nu ontkoppeld?". Een
     *    zelfgemaakte lege groep kost één extra verzoek.
     */
    it(
      'route 4 — een tweede, lege eigen groep gekoppeld laten',
      () =>
        routeBlijftDicht('route4', true, async (o) => {
          const groep = await o.eigenaar.db.rpc('create_group', { group_name: 'Leeg-route4' });
          const data = groep.data as unknown as { ok?: boolean; group?: { id: string } };
          if (data.ok !== true || !data.group) throw new Error('lege groep aanmaken mislukte');

          const bij = await o.eigenaar.db
            .from('goal_group_links')
            .insert({ goal_id: o.goalId, group_id: data.group.id });
          if (bij.error) throw new Error(`bijkoppelen: ${bij.error.message}`);

          const weg = await o.eigenaar.db
            .from('goal_group_links')
            .delete()
            .eq('goal_id', o.goalId)
            .eq('group_id', o.groupId);
          if (weg.error) throw new Error(`ontkoppelen: ${weg.error.message}`);
        }),
      SETUP_TIMEOUT,
    );

    /** ⚠️ Wie een groep aanmaakt is er beheerder van — dit is één RPC. */
    it(
      'route 5 — je eigen groep archiveren',
      () =>
        routeBlijftDicht('route5', true, async (o) => {
          const { data, error } = await o.eigenaar.db.rpc('archiveer_groep', {
            p_group_id: o.groupId,
            p_bevestigd: true,
          });
          if (error) throw new Error(`archiveren: ${error.message}`);
          const uit = data as unknown as { ok?: boolean };
          if (uit.ok !== true) throw new Error(`archiveren geweigerd: ${JSON.stringify(data)}`);
        }),
      SETUP_TIMEOUT,
    );

    it(
      'route 6 — je enige beoordelaar op inactive zetten',
      () =>
        routeBlijftDicht('route6', true, async (o) => {
          const { error } = await o.eigenaar.db
            .from('group_members')
            .update({ status: 'inactive' })
            .eq('group_id', o.groupId)
            .eq('user_id', o.beoordelaar.id);
          if (error) throw new Error(`deactiveren: ${error.message}`);
        }),
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ **De klok is niet van de client, en dat is een eigen route.** De termijn
     *    loopt vanaf `submitted_at`; stond die kolom in de INSERT-kolomgrant, dan
     *    is de wachttijd nul in plaats van zeven dagen.
     */
    it(
      'route 7 — `submitted_at` zelf meesturen',
      async () => {
        const o = await bouwOpstelling('route7');
        const w = await adminDb()
          .from('completions')
          .select('weekly_goal_id')
          .eq('id', o.completionId)
          .single();
        if (w.error || w.data === null) throw new Error(`weekdoel: ${w.error?.message}`);

        const poging = await o.eigenaar.db.from('completions').insert({
          weekly_goal_id: w.data.weekly_goal_id,
          user_id: o.eigenaar.id,
          achieved_level: 'ceiling',
          note: 'af',
          cycle_start_date: localDateIn('UTC' as TimeZone, now()) as IsoDate,
          submitted_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        });

        expect(poging.error?.code, 'een client die zijn eigen indientijd zet hoort 42501 te krijgen').toBe(
          '42501',
        );
      },
      SETUP_TIMEOUT,
    );
  });

  /**
   * ⚠️ **De must-allow-helft.** 0135 bestaat voor wie zijn beoordelaar búiten zijn
   *    schuld kwijtraakt. Zou 0147 die ook dichtzetten, dan is de reparatie erger
   *    dan het gat: dan hangt precies die gebruiker voorgoed op `pending`.
   */
  describe('een verlies buiten de eigenaar om wordt nog steeds afgehandeld', () => {
    async function wordtAlsnogGoedgekeurd(
      label: string,
      handeling: (o: Opstelling) => Promise<void>,
    ): Promise<void> {
      const o = await bouwOpstelling(label);
      await verouder(o.completionId, 20);
      await handeling(o);
      await draaiTermijn(7);

      expect(await weekstatus(o.completionId), `${label}: hier hoort 0135 zijn werk te doen`).toBe(
        'approved',
      );
    }

    it(
      'de buddy vertrekt uit zichzelf',
      () =>
        wordtAlsnogGoedgekeurd('mustallow-buddy', async (o) => {
          const { data, error } = await o.beoordelaar.db.rpc('verlaat_groep', {
            p_group_id: o.groupId,
            p_bevestigd: true,
          });
          if (error) throw new Error(`verlaten: ${error.message}`);
          const uit = data as unknown as { ok?: boolean };
          if (uit.ok !== true) throw new Error(`verlaten geweigerd: ${JSON.stringify(data)}`);
        }),
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ `slaap_stille_groepen()` draait in de rollover zonder JWT, dus
     *    `auth.uid()` is daar NULL en er wordt niets gestempeld. Dat is de tak
     *    die deze test bewaakt: een groep die vanzelf in slaap valt, is geen
     *    handeling van de eigenaar.
     */
    it(
      'het systeem legt de groep slapen',
      () =>
        wordtAlsnogGoedgekeurd('mustallow-slaap', async (o) => {
          const { error } = await adminDb()
            .from('groups')
            .update({ status: 'sleeping' })
            .eq('id', o.groupId);
          if (error) throw new Error(`slapen: ${error.message}`);
        }),
      SETUP_TIMEOUT,
    );

    /**
     * ⚠️ **Wie een half jaar geleden ontkoppelde, is gewoon een solo-gebruiker.**
     *    Zonder deze afkoeling zou één ontkoppeling een doel voorgoed uitsluiten
     *    van de auto-goedkeuring — en dat is de dode keten van QS8-113 in een
     *    nieuwe jas.
     */
    it(
      'de eigenaar ontkoppelde lang geleden en werkt sindsdien solo',
      () =>
        wordtAlsnogGoedgekeurd('mustallow-oud', async (o) => {
          const weg = await o.eigenaar.db.from('goal_group_links').delete().eq('goal_id', o.goalId);
          if (weg.error) throw new Error(`ontkoppelen: ${weg.error.message}`);

          const oud = new Date(Date.now() - 180 * 86_400_000).toISOString();
          const { error } = await adminDb()
            .from('goals')
            .update({ beoordelaar_weggehaald_op: oud })
            .eq('id', o.goalId);
          if (error) throw new Error(`verouderen: ${error.message}`);
        }),
      SETUP_TIMEOUT,
    );
  });

  /**
   * ⚠️ **Een beurt is geen vastloper, en dat verschil kostte twee lekken.**
   *    `completion_approvals_one_vote` staat één stem per beoordelaar toe en
   *    `trek_goedkeuring_in()` wist de rij niet. Ná een vraag om toelichting of
   *    een intrekking telt die buddy dus als "heeft gestemd", en dan viel de
   *    voltooiing door naar `geen_beoordelaar` — terwijl er een actieve buddy in
   *    een actieve groep zit. De termijn keurde hem daarna goed, mét punten en
   *    zonder één geldige goedkeuring.
   *
   *    De weg vooruit is `dien_opnieuw_in()`, en dat is een handeling van de
   *    **eigenaar**. Automatisch goedkeuren beloont hier dus precies het
   *    stilzitten van degene die aan zet is. Beide gevallen zijn gemeten vóór de
   *    reparatie: week `approved`, twee punten, nul geldige goedkeuringen.
   */
  describe('een beurt die bij de eigenaar ligt levert geen goedkeuring op', () => {
    async function beurtBlijftLiggen(
      label: string,
      handeling: (o: Opstelling) => Promise<void>,
    ): Promise<void> {
      const o = await bouwOpstelling(label);
      await handeling(o);

      // De eigenaar deed niets — de stempel hoort leeg te zijn. Zonder deze
      // regel zou de conditie van 0147 dit geval om de ándere reden dichthouden
      // en toetst de rest hier niets.
      const doel = await adminDb()
        .from('goals')
        .select('beoordelaar_weggehaald_op')
        .eq('id', o.goalId)
        .single();
      if (doel.error) throw new Error(`stempel: ${doel.error.message}`);
      expect(
        doel.data?.beoordelaar_weggehaald_op,
        `${label}: de eigenaar deed niets, dus er hoort geen stempel te staan`,
      ).toBeNull();

      await verouder(o.completionId, 20);
      await draaiTermijn(7);

      expect(await weekstatus(o.completionId), `${label}: de week hoort te wachten`).toBe(
        'pending',
      );
      expect(await punten(o.goalId), `${label}: geen punten zonder geldige goedkeuring`).toBe(0);
    }

    it(
      'de buddy vroeg om toelichting',
      () =>
        beurtBlijftLiggen('beurt-toelichting', async (o) => {
          const { error } = await o.beoordelaar.db.from('completion_approvals').insert({
            completion_id: o.completionId,
            approver_id: o.beoordelaar.id,
            subject_id: o.beoordelaar.id,
            group_id: o.groupId,
            status: 'more_info',
            comment: 'Hoe ver ben je gekomen?',
          });
          if (error) throw new Error(`toelichting vragen: ${error.message}`);
        }),
      SETUP_TIMEOUT,
    );

    it(
      'de buddy trok zijn goedkeuring in',
      () =>
        beurtBlijftLiggen('beurt-ingetrokken', async (o) => {
          const gegeven = await o.beoordelaar.db
            .from('completion_approvals')
            .insert({
              completion_id: o.completionId,
              approver_id: o.beoordelaar.id,
              subject_id: o.beoordelaar.id,
              group_id: o.groupId,
              status: 'approved',
            })
            .select('id')
            .single();
          if (gegeven.error || gegeven.data === null) {
            throw new Error(`goedkeuren: ${gegeven.error?.message}`);
          }

          const { error } = await o.beoordelaar.db.rpc('trek_goedkeuring_in', {
            p_approval_id: gegeven.data.id,
          });
          if (error) throw new Error(`intrekken: ${error.message}`);
        }),
      SETUP_TIMEOUT,
    );
  });

  /**
   * De goedkeuringstermijn — QS8-178, migratie 0135.
   *
   * ⚠️ **De belofte is dat geen van de vier routes een week eeuwig laat hangen.**
   *    Daarom draait dit blok ze alle vier langs en niet één als steekproef: de
   *    bevinding van 27-08 telde er twee terwijl het er vier waren, en de twee
   *    die hij miste waren precies de twee die niemand verwachtte.
   *
   * ⚠️ **`submitted_at` wordt met de hand teruggezet.** De termijn loopt vanaf
   *    het indienen, dus een test die zeven dagen wacht is geen test. Dat is
   *    geen truc: het is de enige manier om een tijdgrens te toetsen zonder de
   *    klok van de database te verzetten, en het raakt precies de kolom die de
   *    functie leest.
   */
  describe('de goedkeuringstermijn handelt elke route af', () => {
    async function keurGoed(termijn = 7): Promise<number> {
      const { data, error } = await adminDb().rpc('keur_vastgelopen_goedkeuringen_goed', {
        p_termijn_dagen: termijn,
      });
      if (error) throw new Error(`termijn: ${error.message}`);
      return data as unknown as number;
    }

    /**
     * ⚠️ **De belangrijkste van dit blok.** Een week die nog binnen de termijn
     *    valt, hoort met rust gelaten te worden — anders is de termijn geen
     *    termijn maar een automatische goedkeuring, en dan is peer-goedkeuring
     *    afgeschaft zonder dat iemand dat besloten heeft (domeinregel 3).
     */
    it(
      'laat een vastgelopen week bínnen de termijn met rust',
      async () => {
        const o = await bouwOpstelling('termijn-vers');

        const { error } = await o.eigenaar.db
          .from('goal_group_links')
          .delete()
          .eq('goal_id', o.goalId);
        expect(error).toBeNull();
        expect(await vastgelopenReden(o.goalId)).toBe('geen_koppeling');

        await verouder(o.completionId, 3);
        await keurGoed(7);

        expect(await weekstatus(o.completionId)).toBe('pending');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gezonde week met rust, hoe oud hij ook is',
      async () => {
        const o = await bouwOpstelling('termijn-gezond');

        // Niets ontkoppeld: er is nog een beoordelaar. Dan is er niets vastgelopen.
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        await verouder(o.completionId, 60);
        await keurGoed(7);

        expect(await weekstatus(o.completionId)).toBe('pending');
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ Alle vier de routes, elk met een eigen opstelling. De handeling zelf
     *    wordt gecontroleerd vóór de uitkomst — dat is de les uit dit issue:
     *    twee metingen zagen er eerst uit als "geen route" terwijl in werkelijkheid
     *    de hándeling niet gelukt was.
     */
    it(
      'keurt na de termijn alsnog goed, langs elk van de vier routes',
      async () => {
        // R1 — de eigenaar ontkoppelt zijn doel.
        const r1 = await bouwOpstelling('termijn-r1');
        const ontkoppeld = await r1.eigenaar.db
          .from('goal_group_links')
          .delete()
          .eq('goal_id', r1.goalId);
        expect(ontkoppeld.error, 'R1: ontkoppelen moet lukken').toBeNull();

        // R2 — de eigenaar verlaat de groep. Drie argumenten; zie route 2 hierboven.
        const r2 = await bouwOpstelling('termijn-r2');
        const verlaten = await r2.eigenaar.db.rpc('verlaat_groep', {
          p_group_id: r2.groupId,
          p_bevestigd: true,
          p_nieuwe_beheerder: r2.beoordelaar.id,
        });
        expect(
          (verlaten.data as { ok?: boolean } | null)?.ok,
          'R2: verlaten moet lukken',
        ).toBe(true);

        // R3 — de beheerder zet de enige beoordelaar op inactive.
        const r3 = await bouwOpstelling('termijn-r3');
        const gedeactiveerd = await adminDb()
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', r3.groupId)
          .eq('user_id', r3.beoordelaar.id);
        expect(gedeactiveerd.error, 'R3: deactiveren moet lukken').toBeNull();

        // R4 — de beheerder archiveert de groep.
        const r4 = await bouwOpstelling('termijn-r4');
        const gearchiveerd = await adminDb()
          .from('groups')
          .update({ status: 'archived' })
          .eq('id', r4.groupId);
        expect(gearchiveerd.error, 'R4: archiveren moet lukken').toBeNull();

        const routes = [r1, r2, r3, r4];

        // ⚠️ Alle vier blijven zíchtbaar — dat is de belofte van 0109 en die
        //    verandert niet. Zonder deze regel toetst de rest hier niets.
        for (const [i, o] of routes.entries()) {
          expect(await vastgelopenReden(o.goalId), `route ${i + 1} hoort vastgelopen te zijn`)
            .not.toBeNull();
          await verouder(o.completionId, 10);
        }

        await keurGoed(7);

        /**
         * ⚠️ **Hier is deze test op 01-09 gesplitst, en dat is een besluit en
         *    geen verzwakking.** 0135 keurde alle vier de routes goed, met als
         *    onderbouwing dat het alle vier handelingen van een ánder zijn. Die
         *    onderbouwing bleek onjuist (QS8-186): R1 en R2 doet de eigenaar
         *    zelf, en dan is de auto-goedkeuring een weg om domeinregel 3 heen.
         *    R3 en R4 lopen hier via `adminDb()` — een handeling zonder
         *    `auth.uid()`, dus niet van de eigenaar — en die horen wél door te
         *    gaan.
         */
        for (const [i, o] of [r3, r4].entries()) {
          expect(
            await weekstatus(o.completionId),
            `R${i + 3} is niet door de eigenaar veroorzaakt en hoort goedgekeurd te zijn`,
          ).toBe('approved');
        }

        for (const [i, o] of [r1, r2].entries()) {
          expect(
            await weekstatus(o.completionId),
            `R${i + 1} is een handeling van de eigenaar en hoort te blijven wachten`,
          ).toBe('pending');
          expect(await punten(o.goalId), `R${i + 1} hoort geen punten op te leveren`).toBe(0);
        }
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️ **Append-only, dus twee keer draaien mag niets extra's boeken**
     *    (domeinregel 6). De rollover draait elk uur; zonder deze eigenschap zou
     *    één vastgelopen week elke ronde opnieuw punten opleveren.
     */
    it(
      'boekt bij een tweede ronde niets extra',
      async () => {
        const o = await bouwOpstelling('termijn-nogmaals');

        // ⚠️ Via `adminDb()` en niet via de eigenaar: sinds 0147 wordt een
        //    vastloper die de eigenaar zélf maakt niet meer afgehandeld, en dan
        //    toetst deze test niets meer over dubbel boeken. De eigenschap die
        //    hier bewaakt wordt — append-only — staat daar los van.
        const gearchiveerd = await adminDb()
          .from('groups')
          .update({ status: 'archived' })
          .eq('id', o.groupId);
        expect(gearchiveerd.error, 'archiveren moet lukken').toBeNull();
        await verouder(o.completionId, 10);

        await keurGoed(7);
        expect(await weekstatus(o.completionId)).toBe('approved');

        const punten = async (): Promise<number> => {
          const { data, error } = await adminDb()
            .from('points_ledger')
            .select('id')
            .eq('user_id', o.eigenaar.id);
          if (error) throw new Error(`punten: ${error.message}`);
          return (data ?? []).length;
        };

        const na1 = await punten();
        await keurGoed(7);
        expect(await punten(), 'een tweede ronde mag niets toevoegen').toBe(na1);
      },
      TEST_TIMEOUT,
    );
  });
});
