import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * Wie op een knop drukt die iets toestaat, leest wat er staat — QS8-501,
 * migratie 0274.
 *
 * ⚠️⚠️ **De belofte is de kaart en niet de kolom.** Wat beloofd wordt is dat er
 *    op een scherm waar iemand op het punt staat goed te keuren of akkoord te
 *    geven, geen tekst verschijnt die anders rendert dan hij is. Dat is een
 *    eigenschap van het gehéél: de CHECK mag hem weigeren, óf de functie mag hem
 *    niet meer meegeven — allebei houden de belofte.
 *
 *    Daarom toetst dit bestand `openstaande_beoordelingen()` als geheel, en
 *    niet `weekly_goals.ceiling_text` als kolom. Een toets die `23514` eist,
 *    legt één oplossing vast en wordt rood zodra iemand voor een andere kiest —
 *    dan bewaakt hij de reparatie in plaats van de belofte. Regel 18 vraag 2.
 *
 * ⚠️ **Waarom dit een autorisatiegrens is en geen opmaakkwestie.**
 *    Domeinregel 3 zegt dat alleen een groepsgenoot een voltooiing mag
 *    goedkeuren, afgedwongen in RLS én met een constraint. Wat die grens waard
 *    is, hangt erop dat de goedkeurder leest wat er staat. En bij het
 *    uitstelverzoek is het zwaarder: `beslis_deadline_verzoek()` mag een straf
 *    vooruit schuiven (QS8-370), en de waarschuwing dát er een straf staat is
 *    één regel — ónder de tekst die de aanvrager zelf schreef.
 *
 * ⚠️ **Via PostgREST als een echte `authenticated`.** Alleen zo doen de policy,
 *    de kolomgrant en de CHECK alle drie mee.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** U+202E RIGHT-TO-LEFT OVERRIDE. */
const RLO = '‮';
/** U+2066 LEFT-TO-RIGHT ISOLATE. */
const LRI = '⁦';

interface Fixture {
  alice: TestUser;
  bob: TestUser;
  groep: string;
  doel: string;
  weekdoel: string;
  voltooiing: string;
  cyclusStart: string;
  einddatum: string;
  /** Later dan de streefdatum — `vraag_deadline_verschuiving()` eist vooruit. */
  laterDan: string;
  /** Eigen weekdoelen voor de notitietoetsen: één actieve voltooiing per weekdoel. */
  weekdoelBesmet: string;
  weekdoelSchoon: string;
}

describe.skipIf(!rlsTestsConfigured)('een besluitkaart rendert wat er staat', () => {
  let f: Fixture;
  /** Of `beforeAll` het gehaald heeft — zie de noot bij `afterAll`. */
  let opgezet = false;

  beforeAll(async () => {
    const [alice, bob] = await Promise.all([
      createTestUser('besluitkaart-alice'),
      createTestUser('besluitkaart-bob'),
    ]);

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Besluitkaart' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const uit = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep mislukte: ${JSON.stringify(gemaakt.data)}`);
    }

    const mee = await bob.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`meedoen: ${mee.error.message}`);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Besluitkaart', target_date: cyclus.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    const doelId: string = doel.data.id;

    const koppel = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: uit.group.id });
    if (koppel.error) throw new Error(`koppelen: ${koppel.error.message}`);

    const week = await alice.db
      .from('weekly_goals')
      .insert({
        goal_id: doelId,
        title: 'Drie keer hardlopen',
        floor_text: 'Eén keer is ook een week',
        ceiling_text: 'Drie keer gelopen',
        cycle_start_date: cyclus.startDate,
      })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

    const voltooiing = await alice.db
      .from('completions')
      .insert({
        weekly_goal_id: week.data.id,
        user_id: alice.id,
        achieved_level: 'ceiling',
        note: 'Ging beter dan verwacht',
        cycle_start_date: cyclus.startDate,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing: ${voltooiing.error?.message}`);
    }

    /** ⚠️ `completions_active_uniq` laat één actieve voltooiing per weekdoel toe,
     *    dus elke notitietoets heeft een eigen weekdoel nodig. */
    async function extraWeekdoel(titel: string): Promise<string> {
      const w = await alice.db
        .from('weekly_goals')
        .insert({ goal_id: doelId, title: titel, cycle_start_date: cyclus.startDate })
        .select('id')
        .single();
      if (w.error || w.data === null) throw new Error(`${titel}: ${w.error?.message}`);
      return w.data.id;
    }

    const weekdoelBesmet = await extraWeekdoel('Notitieproef besmet');
    const weekdoelSchoon = await extraWeekdoel('Notitieproef schoon');

    f = {
      alice,
      bob,
      groep: uit.group.id,
      laterDan: new Date(Date.parse(cyclus.endDate) + 14 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      weekdoelBesmet,
      weekdoelSchoon,
      doel: doelId,
      weekdoel: week.data.id,
      voltooiing: voltooiing.data.id,
      cyclusStart: cyclus.startDate,
      einddatum: cyclus.endDate,
    };
    opgezet = true;
  }, SETUP_TIMEOUT);

  // ⚠️⚠️ **Deze opruiming moet een mislukte opstelling overleven.** 📏 Bij de
  //    ijking met de `grant execute` op `zonder_bidi()` ingetrokken viel
  //    `beforeAll` om, en toen wierp dit blok `Cannot read properties of
  //    undefined (reading 'doel')` — een TypeError die bovenop de échte oorzaak
  //    kwam te staan. De suite was terecht rood, maar je las de verkeerde fout
  //    het eerst. Dat is dezelfde klasse als QS8-412: kijk wélke toets omvalt,
  //    niet dát er een omvalt.
  //
  //    De gebruikers worden sowieso opgeruimd, ook als er nooit een groep kwam.
  afterAll(async () => {
    if (opgezet) {
      await adminDb().from('goals').delete().eq('id', f.doel);
      await adminDb().from('groups').delete().eq('id', f.groep);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** De goedkeurkaart zoals Bob hem opvraagt, als één string. */
  async function goedkeurkaart(): Promise<string> {
    const { data, error } = await f.bob.db.rpc('openstaande_beoordelingen', { p_limit: 50 });
    if (error !== null) throw new Error(`openstaande_beoordelingen: ${error.message}`);
    return JSON.stringify(data ?? []);
  }

  // ---------------------------------------------------------------------------
  // De goedkeurkaart — vier kolommen, één belofte
  // ---------------------------------------------------------------------------

  it(
    'laat geen stuurteken op de goedkeurkaart komen, uit welk van de vier velden ook',
    async () => {
      // ⚠️⚠️ **Eerst bewijzen dát de kaart bij Bob aankomt.** Zonder deze helft
      //    is een groene uitslag niet te onderscheiden van "Bob zag sowieso
      //    niets" — precies de val waar de eerste versie van de toets bij
      //    QS8-498 in liep, en die de ijking daar vond.
      const vooraf = await goedkeurkaart();
      expect(vooraf, 'Bob kreeg de weektitel niet te zien').toContain('Drie keer hardlopen');
      expect(vooraf, 'Bob kreeg het plafond niet te zien').toContain('Drie keer gelopen');
      expect(vooraf, 'Bob kreeg de notitie niet te zien').toContain('Ging beter dan verwacht');

      // Elk van de vier velden apart, want ze staan op vier verschillende
      // kolommen in twee tabellen en elk heeft zijn eigen CHECK.
      // ⚠️ `PromiseLike` en niet `Promise`: PostgREST geeft een builder terug die
      //    thenable is maar geen `catch`/`finally` heeft.
      const pogingen: readonly { wat: string; doe: () => PromiseLike<unknown> }[] = [
        {
          wat: 'weekly_goals.title',
          doe: () =>
            f.alice.db
              .from('weekly_goals')
              .update({ title: `Drie keer ${RLO}nepolraah` })
              .eq('id', f.weekdoel),
        },
        {
          wat: 'weekly_goals.floor_text',
          doe: () =>
            f.alice.db
              .from('weekly_goals')
              .update({ floor_text: `Eén keer ${RLO}keew ne si` })
              .eq('id', f.weekdoel),
        },
        {
          wat: 'weekly_goals.ceiling_text',
          doe: () =>
            f.alice.db
              .from('weekly_goals')
              .update({ ceiling_text: `Drie keer ${RLO}nepolreg` })
              .eq('id', f.weekdoel),
        },
        {
          // ⚠️ Een nieuwe rij en geen update: `completions` is append-only
          //    (domeinregel 6) en de UPDATE-grant op `note` staat op `false`.
          wat: 'completions.note',
          doe: () =>
            f.alice.db.from('completions').insert({
              weekly_goal_id: f.weekdoelBesmet,
              user_id: f.alice.id,
              achieved_level: 'floor',
              note: `Ging goed ${RLO}thcels gnig`,
              cycle_start_date: f.cyclusStart,
            }),
        },
      ];

      for (const poging of pogingen) {
        await poging.doe();
        const kaart = await goedkeurkaart();
        expect(kaart, `een override kwam via ${poging.wat} op de kaart`).not.toContain(RLO);
        expect(kaart, `een isolaat kwam via ${poging.wat} op de kaart`).not.toContain(LRI);
      }
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // Het uitstelverzoek — de zwaarste, want hier hangt een straf aan
  // ---------------------------------------------------------------------------

  it(
    'laat geen stuurteken in de toelichting bij een uitstelverzoek staan',
    async () => {
      // ⚠️ De bevestigende helft: een gewone toelichting komt er wél in. Zonder
      //    deze regel is "geen stuurteken" ook waar als de RPC niets doet.
      const gewoon = await f.alice.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: f.doel,
        p_group_id: f.groep,
        p_new_date: f.laterDan,
        p_reason: 'أحتاج إلى أسبوع إضافي من فضلك',
      });
      expect(gewoon.error, `een gewoon verzoek viel om: ${gewoon.error?.message}`).toBeNull();
      expect(
        (gewoon.data as { ok?: boolean }).ok,
        `een gewoon verzoek werd geweigerd: ${JSON.stringify(gewoon.data)}`,
      ).toBe(true);

      const na = await adminDb().from('deadline_requests').select('reason').eq('goal_id', f.doel);
      expect(na.error).toBeNull();
      expect(
        ((na.data ?? []) as { reason: string | null }[]).map((r) => r.reason ?? '').join('|'),
        'de Arabische toelichting kwam er niet in',
      ).toContain('أحتاج');

      // ⚠️⚠️ **Eerst het openstaande verzoek intrekken, en dát is een gemeten
      //    reparatie.** `vraag_deadline_verschuiving()` weigert een tweede
      //    verzoek met `already_open`, dus zónder deze stap strandt het geval
      //    op een éérdere grendel en bereikt het de CHECK nooit. 📏 De ijking
      //    liet dat zien: met `deadline_requests_reason_geen_bidi` eruit
      //    gesloopt bleef deze toets groen op 4 van 4 — hij bewaakte de
      //    `already_open`-tak en niet zijn eigen belofte.
      //
      //    CLAUDE.md zegt het met zoveel woorden: *een ijking die zijn geval
      //    door een pad voert dat een eerdere grendel al afvangt, bewaakt niets
      //    van wat hij belooft.*
      const open = await adminDb()
        .from('deadline_requests')
        .select('id')
        .eq('goal_id', f.doel)
        .eq('status', 'open')
        .single();
      expect(open.error, `geen openstaand verzoek om in te trekken: ${open.error?.message}`).toBeNull();

      const ingetrokken = await f.alice.db.rpc('trek_deadline_verzoek_in', {
        p_request_id: (open.data as { id: string }).id,
      });
      expect(ingetrokken.error).toBeNull();
      expect(
        (ingetrokken.data as { ok?: boolean }).ok,
        `intrekken mislukte: ${JSON.stringify(ingetrokken.data)}`,
      ).toBe(true);

      // En nu het geval zelf, langs een pad waar alleen de CHECK nog tussen zit.
      const besmet = await f.alice.db.rpc('vraag_deadline_verschuiving', {
        p_goal_id: f.doel,
        p_group_id: f.groep,
        p_new_date: f.laterDan,
        p_reason: `Even uitstel ${RLO}fartseg tein`,
      });

      // ⚠️ Niet "er kwam een fout": de belofte is dat het teken nergens landt,
      //    niet dat het langs een bepaalde weg geweigerd wordt. Wat hier wél
      //    vaststaat is dat de poging de kolom écht probeerde te raken —
      //    `already_open` kan het nu niet meer zijn.
      expect(
        (besmet.data as { reason?: string } | null)?.reason,
        'de poging strandde alsnog op een andere grendel dan de CHECK',
      ).not.toBe('already_open');

      const alles = await adminDb().from('deadline_requests').select('reason');
      expect(alles.error).toBeNull();
      const redenen = ((alles.data ?? []) as { reason: string | null }[])
        .map((r) => r.reason ?? '')
        .join('|');
      expect(redenen, 'een override staat in een toelichting').not.toContain(RLO);
      expect(redenen, 'een isolaat staat in een toelichting').not.toContain(LRI);
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // De naad: de bron van een weekdoel draagt dezelfde grendel
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **Dit is de toets die deze migratie zelf nodig had.** Een CHECK op
  //    `weekly_goals` zonder een CHECK op `weekly_plan_steps` maakt van een
  //    geaccepteerde schrijfactie een **uitgestelde** fout:
  //    `weekplanstap_naar_weekdoel()` kopieert de tekst, en de insert valt een
  //    week later om — in `rollover`, die `console.error` doet en `continue`.
  //    De gebruiker heeft die week geen weekdoel en ziet nergens waarom.
  //
  //    📏 Gemeten vóór de reparatie: de stap werd geaccepteerd, de omzetting gaf
  //    `violates check constraint "weekly_goals_title_geen_bidi"`.
  //
  // ⚠️ Regel 18 vraag 1: hier knopen twee correcte onderdelen aan elkaar, en de
  //    toets hoort op de naad te staan en niet op weerszijden ervan.
  it(
    'laat geen stuurteken in een weekplanstap staan — de bron van een weekdoel',
    async () => {
      // De bevestigende helft: een gewone stap landt wél.
      const gewoon = await f.alice.db.from('weekly_plan_steps').insert({
        goal_id: f.doel,
        order_index: 40,
        title: 'Elke ochtend een blokje om',
        floor_text: 'Eén keer',
        ceiling_text: 'Zeven keer',
      });
      expect(gewoon.error, `een gewone stap viel om: ${gewoon.error?.message}`).toBeNull();

      const basis = {
        goal_id: f.doel,
        order_index: 41,
        title: 'Stap',
        floor_text: 'vloer',
        ceiling_text: 'plafond',
      };
      const besmet = `Stap ${RLO}exe.gpj`;
      const gevallen = [
        { veld: 'title', rij: { ...basis, title: besmet } },
        { veld: 'floor_text', rij: { ...basis, floor_text: besmet } },
        { veld: 'ceiling_text', rij: { ...basis, ceiling_text: besmet } },
      ];

      for (const geval of gevallen) {
        const poging = await f.alice.db.from('weekly_plan_steps').insert(geval.rij);
        expect(
          poging.error,
          `een stuurteken landde in weekly_plan_steps.${geval.veld}`,
        ).not.toBeNull();
      }

      // ⚠️ En de belofte zelf: er staat nergens in die tabel een stuurteken dat
      //    over zeven dagen een weekdoel wordt.
      const alles = await adminDb()
        .from('weekly_plan_steps')
        .select('title, floor_text, ceiling_text')
        .eq('goal_id', f.doel);
      expect(alles.error).toBeNull();
      expect(JSON.stringify(alles.data ?? []), 'een stap draagt een override').not.toContain(RLO);
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // De must-allow-helft — zonder deze is elke weigertoets gratis
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ Een CHECK die `zonder_bidi()` aanroept, valt zonder de `grant execute`
  //    aan `authenticated` om op `permission denied for function zonder_bidi` —
  //    bij élke schrijving op die tabel, ook eentje die niets met bidi te maken
  //    heeft. 📏 Dat is in 0256, 0269, 0270 én 0273 gebeurd.

  it(
    'laat een Arabisch weekdoel met vloer en plafond gewoon door',
    async () => {
      const uit = await f.alice.db
        .from('weekly_goals')
        .update({
          title: 'الجري ثلاث مرات',
          floor_text: 'مرة واحدة تكفي',
          ceiling_text: 'ثلاث مرات كاملة',
        })
        .eq('id', f.weekdoel);
      expect(uit.error, `een Arabisch weekdoel viel om: ${uit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een notitie met een samengestelde emoji door',
    async () => {
      const uit = await f.alice.db.from('completions').insert({
        weekly_goal_id: f.weekdoelSchoon,
        user_id: f.alice.id,
        achieved_level: 'floor',
        note: 'Gelopen met het gezin 👨‍👩‍👧‍👦 en de hond 🐕',
        cycle_start_date: f.cyclusStart,
      });
      expect(uit.error, `een notitie met emoji viel om: ${uit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );
});
