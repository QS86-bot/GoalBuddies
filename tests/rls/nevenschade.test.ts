import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { addDays, now, userCycle } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';

/**
 * **Een testbestand schrijft nooit buiten zijn eigen fixture** — QS8-145.
 *
 * ⚠️ **Dit is een belofte over het gehéél, en daarom bestaat dit bestand
 *    apart.** Elk van de 49 RLS-bestanden is los groen; alleen in een vólle run
 *    viel er willekeurig eentje om, elke keer een andere. Dat is per definitie
 *    niet in één bestand te vinden — de fout zit tussen twee bestanden die elk
 *    correct zijn. Onwrikbare regel 18: onderdelen zijn makkelijk te toetsen en
 *    naden niet, dus de naad blijft onbewaakt.
 *
 * ## Wat er gemeten is
 *
 * 📏 Op 31-08-2026 nagespeeld in één transactie op een lege database:
 *
 *     reeks VOOR herstel:  4
 *     herstel_weekdoelstatus() raakte 4 rijen aan
 *     reeks NA herstel:    0
 *     rijen nog aanwezig:  5
 *
 * Die vier rijen waren van een ánder bestand. `herstel_weekdoelstatus()` deed
 * `update weekly_goals` over de héle tabel; `reeks.test.ts` zet zijn weken met
 * de hand op `approved` zonder voltooiing, en dát is drift volgens de definitie.
 * Precies de faalsignatuur `4, 4, 4, 4, 4, 4, 0, 0, 0, 0` die in
 * `vitest.config.mts` staat opgeschreven.
 *
 * ⚠️ **En het verklaart waarom niemand het vond.** `reeks.test.ts` hééft een
 *    bewaker voor dit geval, `fixtureGaaf()`. Die telt **rijen**, en de rijen
 *    bleven staan — alleen hun status veranderde. De bewaker zweeg dus terwijl
 *    de fixture inhoudelijk weg was: een test die een eigenschap van het
 *    onderdeel toetst (er zijn nog drie rijen) in plaats van de belofte (die
 *    drie weken zijn nog gehaald).
 *
 * ## De vorm van het gevaar
 *
 * Vijf functies in dit schema schrijven **zonder een grens die de aanroeper
 * meegeeft** — gemeten met `pg_get_functiondef()`, niet met een grep over de
 * migraties. Voor de rollover en de audit is dat precies de bedoeling; in een
 * gedeelde testdatabase is het een `update` zonder `where` op eigenaar.
 *
 * Deze suite zet daarom een **vreemde fixture** neer — een gebruiker, een doel
 * en een groep waar geen enkele aanroep hieronder op wijst — en toetst na elke
 * globale schrijver dat die onaangeroerd is.
 *
 * ⚠️ **De vreemde fixture is met opzet van dit bestand zelf.** Hij hoort bij
 *    `removeTestUsers()` van deze run, dus hij wordt netjes opgeruimd. Wat hem
 *    "vreemd" maakt is niet van wie hij is maar dat geen enkele aanroep hem
 *    noemt — en dat is precies de eigenschap die een buurbestand ook heeft.
 *
 * ## De ijking — één mutatie per grendel, en niet één voor het bestand
 *
 * ⚠️ **Dat onderscheid is hier geen vormkwestie geweest.** Twee van de vijf
 *    grendels bleken bij de eerste ijking gróén te blijven onder precies de
 *    mutatie die hun eigen naam noemt. Ze bewaakten iets — maar niet wat er
 *    boven stond. Beide fixtures zijn daarop aangepast; de aantekeningen staan
 *    bij de betreffende test.
 *
 * | # | Mutatie op de gedeployde functie | Wordt rood |
 * |---|---|---|
 * | A | `p_goal_id` uit de `where` van `weekdoelstatus_afwijkingen()` | test 1 én 2 |
 * | B | de ouderdomsgrens uit `slaap_stille_groepen()` | test 3 |
 * | C | alléén de seizoensgrens uit `maak_seizoensrecaps()` | test 5 |
 * | D | de termijncontrole uit `keur_vastgelopen_goedkeuringen_goed()` | test 4 |
 *
 * ⚠️ **Mutatie A maakte test 2 aanvankelijk níét rood**, en dat was de
 *    leerzaamste van de vier: test 1 had de vreemde rijen dan al "gerepareerd",
 *    dus er viel voor test 2 niets meer te lekken. Vandaar de `beforeEach`
 *    hieronder — mutatie per grendel vraagt ook onafhankelijkheid per grendel.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** De drie schone weken plus de gehaalde helft van de gemengde week. */
const VREEMDE_REEKS = 4;

interface Vreemd {
  doelId: string;
  gebruikerId: string;
  groepId: string;
  /** Een week die op goedkeuring wacht zonder dat er nog een beoordelaar is. */
  wachtendWeekdoelId: string;
}

interface Eigen {
  doelId: string;
  weekdoelId: string;
}

describe.skipIf(!rlsTestsConfigured)('een globale schrijver raakt geen vreemde fixture', () => {
  let vreemd: Vreemd;
  let eigen: Eigen;

  beforeAll(async () => {
    const admin = adminDb();
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    // ------------------------------------------------------------------
    // De vreemde fixture — een nagebouwde `reeks.test.ts`
    // ------------------------------------------------------------------
    //
    // ⚠️ Bewust dezelfde vorm als het bestand dat écht omviel, en niet iets
    //    eenvoudigers. Een nagebouwde reproductie die te weinig lijkt op het
    //    origineel, leest als bewijs dat er niets aan de hand is.
    const buur = await createTestUser('nevenschade-buur');

    const buurDoel = await admin
      .from('goals')
      .insert({
        owner_id: buur.id,
        title: 'NEVENSCHADE vreemd doel',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (buurDoel.error || buurDoel.data === null) {
      throw new Error(`vreemd doel: ${buurDoel.error?.message}`);
    }

    // Drie schone weken, zodat er een reeks ís om te verliezen.
    for (let i = 4; i >= 2; i -= 1) {
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: buurDoel.data.id,
        title: `vreemde schone week -${i}`,
        cycle_start_date: addDays(cyclus.startDate, -7 * i),
        cycle_index: 300 - i,
        status: 'approved',
      });
      if (error) throw new Error(`vreemd weekdoel: ${error.message}`);
    }

    // En de gemengde week, precies zoals in `reeks.test.ts`.
    for (const [titel, status] of [
      ['vreemd gemist', 'missed'],
      ['vreemd gehaald', 'approved'],
      ['vreemd wachtend', 'pending'],
    ] as const) {
      const { error } = await admin.from('weekly_goals').insert({
        goal_id: buurDoel.data.id,
        title: titel,
        cycle_start_date: addDays(cyclus.startDate, -7),
        cycle_index: 299,
        status,
      });
      if (error) throw new Error(`vreemd gemengd weekdoel: ${error.message}`);
    }

    const groep = await buur.db.rpc('create_group', {
      group_name: 'NEVENSCHADE vreemde groep',
      huddle_day: 1,
      tz: 'Europe/Amsterdam',
      zichtbaarheid: 'beschermd',
    });
    if (groep.error) throw new Error(`vreemde groep: ${groep.error.message}`);

    // ⚠️ `create_group()` geeft `{ok, group:{id, invite_code}}` en niet de rij
    //    zelf. Zonder deze uitpakking wordt `groepId` stilletjes `undefined` en
    //    toetst de groepshelft van dit bestand niets — het faalbeeld dat dit
    //    bestand nu juist moet vangen.
    const uit = (groep.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (uit.ok !== true || !uit.group) throw new Error(`vreemde groep: ${JSON.stringify(groep.data)}`);

    // ⚠️ **Koppelen, en dat is geen decoratie.** Zonder deze koppeling telt de
    //    groep als "stil" en schrijft `maak_seizoensrecaps()` er nooit iets
    //    voor — ook niet als je zijn seizoensgrens weghaalt. De grendel
    //    hieronder zou dan groen blijven onder precies de mutatie die zijn naam
    //    noemt, en dus niets bewaken. Met de hand gemeten op 31-08.
    const koppeling = await admin.from('goal_group_links').insert({
      goal_id: buurDoel.data.id,
      group_id: uit.group.id,
    });
    if (koppeling.error) throw new Error(`vreemde koppeling: ${koppeling.error.message}`);

    // ⚠️ **Een week die vastloopt, om dezelfde reden.** De vreemde weken
    //    hierboven staan op `approved` en `missed`; die kan
    //    `keur_vastgelopen_goedkeuringen_goed()` per definitie niet raken, dus
    //    ook díé grendel zou niets bewaken. Deze week staat op `pending` met een
    //    verse voltooiing, en de buur is het enige lid van zijn groep — er ís
    //    dus geen beoordelaar meer. Wat hem beschermt is uitsluitend de termijn.
    const wachtend = await admin
      .from('weekly_goals')
      .insert({
        goal_id: buurDoel.data.id,
        title: 'vreemd wachtend',
        cycle_start_date: cyclus.startDate,
        cycle_index: 301,
        status: 'todo',
      })
      .select('id')
      .single();
    if (wachtend.error || wachtend.data === null) {
      throw new Error(`vreemd wachtend weekdoel: ${wachtend.error?.message}`);
    }

    // De trigger `mark_weekly_goal_pending` zet de week hierdoor op `pending`.
    const voltooiing = await admin.from('completions').insert({
      weekly_goal_id: wachtend.data.id,
      user_id: buur.id,
      achieved_level: 'ceiling',
      cycle_start_date: cyclus.startDate,
      // ⚠️ Verplicht zodra het doel aan een groep hangt: `completions_note_vereist`.
      note: 'NEVENSCHADE notitie',
    });
    if (voltooiing.error) throw new Error(`vreemde voltooiing: ${voltooiing.error.message}`);

    vreemd = {
      doelId: buurDoel.data.id,
      gebruikerId: buur.id,
      groepId: uit.group.id,
      wachtendWeekdoelId: wachtend.data.id,
    };

    // ------------------------------------------------------------------
    // De eigen fixture — hier mág gerepareerd worden
    // ------------------------------------------------------------------
    //
    // ⚠️ Zonder deze helft bewijst dit bestand niets. Een functie die niets
    //    doet, laat de vreemde fixture ook met rust; er moet dus iets zijn dat
    //    hij wél hoort te raken.
    const ik = await createTestUser('nevenschade-ik');

    const eigenDoel = await admin
      .from('goals')
      .insert({
        owner_id: ik.id,
        title: 'NEVENSCHADE eigen doel',
        category: 'other',
        target_date: '2026-12-31',
      })
      .select('id')
      .single();
    if (eigenDoel.error || eigenDoel.data === null) {
      throw new Error(`eigen doel: ${eigenDoel.error?.message}`);
    }

    const eigenWeek = await admin
      .from('weekly_goals')
      .insert({
        goal_id: eigenDoel.data.id,
        title: 'eigen drift',
        cycle_start_date: cyclus.startDate,
        cycle_index: 299,
        status: 'approved',
      })
      .select('id')
      .single();
    if (eigenWeek.error || eigenWeek.data === null) {
      throw new Error(`eigen weekdoel: ${eigenWeek.error?.message}`);
    }

    eigen = { doelId: eigenDoel.data.id, weekdoelId: eigenWeek.data.id };
  }, SETUP_TIMEOUT);

  /**
   * ⚠️ **Elke test begint bij dezelfde toestand, en dat is hier geen netheid
   *    maar de ijkbaarheid zelf.** Zonder dit blok bleef `weekdoelstatus_
   *    afwijkingen noemt geen vreemde rijen` gróén toen de grens er met de hand
   *    uit gehaald werd: de test ervóór had de vreemde rijen toen al
   *    "gerepareerd", dus er viel niets meer te lekken. Die test bewaakte dan
   *    niets van wat hij belooft.
   *
   *    Dat is de val uit CLAUDE.md, letterlijk: een ijking die zijn geval door
   *    een pad voert dat een eerdere grendel al tegenhoudt, blijft groen als je
   *    de grendel uit zijn eigen naam weghaalt. **Mutatie per grendel vraagt dus
   *    ook onafhankelijkheid per grendel.**
   */
  beforeEach(async () => {
    const admin = adminDb();

    for (const [titel, status] of [
      ['vreemde schone week -4', 'approved'],
      ['vreemde schone week -3', 'approved'],
      ['vreemde schone week -2', 'approved'],
      ['vreemd gemist', 'missed'],
      ['vreemd gehaald', 'approved'],
      ['vreemd wachtend', 'pending'],
    ] as const) {
      const { error } = await admin
        .from('weekly_goals')
        .update({ status })
        .eq('goal_id', vreemd.doelId)
        .eq('title', titel);
      if (error) throw new Error(`vreemde fixture terugzetten: ${error.message}`);
    }

    const { error } = await admin
      .from('weekly_goals')
      .update({ status: 'approved' })
      .eq('id', eigen.weekdoelId);
    if (error) throw new Error(`eigen drift terugzetten: ${error.message}`);
  });

  afterAll(async () => {
    const admin = adminDb();
    // ⚠️ Valt `beforeAll` halverwege om, dan is `vreemd` niet gezet en zou het
    //    opruimen hier met een tweede, nietszeggende fout over de eerste heen
    //    schrijven. De gebruikers gaan dan alsnog weg via `removeTestUsers()`.
    if (vreemd === undefined || eigen === undefined) {
      await removeTestUsers();
      return;
    }
    // ⚠️ Voltooiingen eerst: `weekly_goals` heeft ze aan zich hangen.
    await admin.from('completions').delete().eq('weekly_goal_id', vreemd.wachtendWeekdoelId);
    await admin.from('goal_group_links').delete().eq('goal_id', vreemd.doelId);
    await admin.from('weekly_goals').delete().in('goal_id', [vreemd.doelId, eigen.doelId]);
    await admin.from('user_streaks').delete().eq('goal_id', vreemd.doelId);
    await admin.from('goals').delete().in('id', [vreemd.doelId, eigen.doelId]);
    await admin.from('groups').delete().eq('id', vreemd.groepId);
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** De reeks van de vreemde fixture, herberekend uit wat er nú in de tabel staat. */
  async function vreemdeReeks(): Promise<number> {
    const admin = adminDb();

    const herberekend = await admin.rpc('herbereken_reeks', {
      p_user_id: vreemd.gebruikerId,
      p_goal_id: vreemd.doelId,
    });
    if (herberekend.error) throw new Error(`herberekenen: ${herberekend.error.message}`);

    const { data, error } = await admin
      .from('user_streaks')
      .select('current_streak')
      .eq('goal_id', vreemd.doelId)
      .single();
    if (error) throw new Error(`reeks lezen: ${error.message}`);

    return data.current_streak;
  }

  /**
   * ⚠️ **De assertie waar dit bestand om bestaat.** Vóór 0136 ging deze reeks
   *    van 4 naar 0 door een aanroep die over dít doel niets te zeggen had.
   */
  it(
    'herstel_weekdoelstatus laat een vreemd doel met rust',
    async () => {
      expect(await vreemdeReeks(), 'de vreemde fixture staat niet goed opgezet').toBe(
        VREEMDE_REEKS,
      );

      const { data, error } = await adminDb().rpc('herstel_weekdoelstatus', {
        p_goal_id: eigen.doelId,
      });

      expect(error).toBeNull();
      // Precies de eigen rij, en geen enkele van de vier vreemde.
      expect(data, 'er zijn vreemde rijen meegerepareerd').toBe(1);

      expect(await vreemdeReeks(), 'de vreemde reeks is onder de test uit gehaald').toBe(
        VREEMDE_REEKS,
      );
    },
    TEST_TIMEOUT,
  );

  /**
   * De leeskant. Die lekte niet, maar hij is wél de bron waar de schrijfkant op
   * leunt — en een melding die vreemde rijen noemt, nodigt uit ze te repareren.
   */
  it(
    'weekdoelstatus_afwijkingen noemt geen vreemde rijen',
    async () => {
      const { data, error } = await adminDb().rpc('weekdoelstatus_afwijkingen', {
        p_goal_id: eigen.doelId,
      });

      expect(error).toBeNull();

      const ids = ((data ?? []) as { weekly_goal_id: string }[]).map((r) => r.weekly_goal_id);
      expect(ids).toEqual([eigen.weekdoelId]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Geen reparatie maar een vastgelegde aanname**, en dat verschil hoort
   *    er te staan. `slaap_stille_groepen()` heeft geen grens en raakt élke
   *    actieve groep die lang stil is. Dat een verse testgroep er niet onder
   *    valt, komt doordat `groups.last_activity_at` `not null` is met default
   *    `now()` — een eigenschap van de kolom, geen keuze van de functie.
   *
   *    **Wordt zwaarder als:** een bestand `last_activity_at` terugzet en daarna
   *    ongescopeerd laat slapen. `policies.test.ts` doet het eerste al (regel
   *    2174, terug naar 2026-01-01) en roept daarna `slaap_stille_groepen(30)`
   *    aan; dat gaat vandaag goed omdat alle ándere groepen op `now()` staan.
   */
  it(
    'slaap_stille_groepen laat een verse groep wakker',
    async () => {
      const geslapen = await adminDb().rpc('slaap_stille_groepen', { p_dagen: 30 });
      expect(geslapen.error).toBeNull();

      const { data } = await adminDb()
        .from('groups')
        .select('status')
        .eq('id', vreemd.groepId)
        .single();

      expect(data?.status, 'een verse groep is in slaap gesust').toBe('active');
    },
    TEST_TIMEOUT,
  );

  /**
   * Dezelfde vorm, en dezelfde eerlijkheid: de termijn beschermt hier, niet een
   * grens in de functie.
   *
   * ⚠️ **Wordt zwaarder als:** een bestand `completions.submitted_at`
   *    terugzet én een weekdoel op `pending` laat staan zonder beoordelaar.
   *    `beoordelingen-paginering.test.ts` zet `submitted_at` al terug naar
   *    januari 2026 (regel 160); dat gaat vandaag goed omdat er in díé fixture
   *    wél een geldige beoordelaar is, en `vastgelopen_goedkeuringen()` daarop
   *    filtert. Vervalt die tweede voorwaarde, dan keurt deze functie de weken
   *    van een ander bestand goed en boekt er punten bij.
   */
  it(
    'keur_vastgelopen_goedkeuringen_goed laat een verse voltooiing met rust',
    async () => {
      // De week ís vastgelopen — er is geen beoordelaar meer. Staat dit er
      // niet, dan toetst de assertie hieronder een week die de functie sowieso
      // nooit had kunnen raken.
      const vast = await adminDb().rpc('vastgelopen_goedkeuringen');
      expect(vast.error).toBeNull();
      const wachtend = ((vast.data ?? []) as { goal_id: string }[]).filter(
        (r) => r.goal_id === vreemd.doelId,
      );
      expect(wachtend, 'de vreemde week loopt niet vast, dus deze test bewaakt niets').toHaveLength(
        1,
      );

      const { error } = await adminDb().rpc('keur_vastgelopen_goedkeuringen_goed', {
        p_termijn_dagen: 7,
      });
      expect(error).toBeNull();

      const { data } = await adminDb()
        .from('weekly_goals')
        .select('status')
        .eq('id', vreemd.wachtendWeekdoelId)
        .single();

      expect(data?.status, 'een verse voltooiing van een ander is goedgekeurd').toBe('pending');
    },
    TEST_TIMEOUT,
  );

  /**
   * `maak_seizoensrecaps()` loopt over élke niet-gearchiveerde groep. Wat hem
   * tegenhoudt is de seizoensgrens: alleen op de eerste dag van een seizoen om
   * acht uur in de tijdzone van de groep gebeurt er iets.
   *
   * ⚠️ Deze test kiest daarom een moment dat voor geen enkele groep een grens
   *    is. De belofte is niet "hij doet nooit iets" maar "hij doet niets voor
   *    een groep waar de aanroeper niet op wees".
   */
  it(
    'maak_seizoensrecaps schrijft niets voor een vreemde groep buiten zijn grens',
    async () => {
      const { error } = await adminDb().rpc('maak_seizoensrecaps', {
        // ⚠️ **Het moment is zorgvuldig gekozen en dat is de helft van de test.**
        //    `seizoensgrens()` geeft het vórige afgesloten seizoen, dus een
        //    `p_op` in Q4 levert het venster juli–september: precies waar de
        //    weken van de vreemde fixture in liggen. Half drie 's nachts is
        //    nooit "acht uur", dus de grens houdt hem tegen — en niets anders.
        //
        //    Hier stond eerst 2026-05-13. Dat leverde het venster januari–maart
        //    op, en dan telt de groep als stil: de test bleef gróén toen de
        //    grens er met de hand uit gehaald werd, en bewaakte dus niet wat
        //    zijn naam belooft. Met de hand gemeten op 31-08.
        p_op: '2026-11-15T02:30:00Z',
      });
      expect(error).toBeNull();

      const { count } = await adminDb()
        .from('season_recaps')
        .select('group_id', { count: 'exact', head: true })
        .eq('group_id', vreemd.groepId);

      expect(count ?? 0, 'er is een recap voor een vreemde groep geschreven').toBe(0);
    },
    TEST_TIMEOUT,
  );
});
