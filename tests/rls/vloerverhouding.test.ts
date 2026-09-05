import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured } from './harness';

/**
 * De vloerverhouding telt teller en noemer over hetzelfde venster — QS8-271.
 *
 * ⚠️ **De belofte is domeinregel 8:** vloer gehaald betekent dat de week telt, en
 *    de reeks dient de gebruiker en nooit andersom. `herbereken_risico()` brak
 *    die belofte op de stilste manier die er is — door je te belónen met een
 *    waarschuwing.
 *
 * De noemer (`v_recent_goed`) telde cycli met `>= v_venster_start` **én**
 * `< v_vandaag`. De teller (`v_recent_vloer`) had alleen de ondergrens, en telde
 * bovendien `count(*)` over wéékdoelen waar de noemer `count(distinct
 * cycle_start_date)` over cycli telt. Twee fouten van dezelfde soort en allebei
 * één kant op, dus `v_vloerdeel` kon boven 1 uitkomen terwijl de drempel op 0,75
 * staat.
 *
 * ⚠️ **Waarom `risicoradar.test.ts` hem niet zag.** Die suite heeft zeven
 *    scenario's, maar zijn opbouwer zet elke cyclus in het verleden
 *    (`-7 * wekenTerug`, en `wekenTerug` is minstens 1). Er was dus nooit een
 *    voltooiing in de lópende cyclus, en `vloeraandeel` stond in geen enkele
 *    assertie. De tests toetsten een eigenschap van het ónderdeel; deze grens zat
 *    in de naad ertussen — regel 18, vraag 1.
 *
 * ## ⚠️ De lopende cyclus staat níet op vandaag, en dat is de kern
 *
 * De eerste versie van dit bestand zette de lopende cyclus op `eigenDatum` — de
 * dag waarop hij begon. Dat is de énige dag waarop de eerste reparatie werkte:
 * `cycle_start_date < v_vandaag` betekent niet "de cyclus is af" maar "de cyclus
 * is niet vandaag begonnen", en een cyclus loopt zeven dagen.
 *
 * Gemeten met dezelfde geschiedenis en alleen een schuivende startdag:
 * `on_track` op dag 0, `at_risk` op dag 1 tot en met 6. De test bewees de grens
 * dus op het uitzonderingsgeval en niet op het normale geval.
 *
 * Elke opstelling hieronder zet de lopende cyclus daarom **midden in de week**.
 *
 * ## Eén test per grendel, en dat zijn er inmiddels meer dan drie
 *
 * Begonnen met de vloergrens, de eenheid en de tempogrens ernaast — die laatste
 * droeg dezelfde fout en raakt iederéén, ook zonder vloergeschiedenis. Daar
 * kwamen de neutrale cyclusstatussen bij (QS8-275) en de gemengde cyclus
 * (QS8-278). Ze horen in één bestand omdat ze één ding bewaken: dat
 * `herbereken_risico()` telt wat het commentaar erboven belooft.
 *
 * ⚠️ **De must-see hoort er per definitie bij.** Vier van deze tests eisen
 *    `on_track`; wie de vloertak in zijn geheel uit de if-keten haalt, houdt ze
 *    alle vier groen. De test die eist dát het vloersignaal vuurt, is wat het
 *    verschil maakt tussen "de teller is gerepareerd" en "de teller telt niets
 *    meer" — en die tweede is de radar stuk in de andere richting.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Dezelfde klok als `herbereken_risico()`: die van de eigenaar. */
let eigenaarId = '';
let eigenDatum: IsoDate;

interface Reden {
  cycli_bekeken?: number;
  cycli_gehaald?: number;
  vloeraandeel?: number | null;
}

/**
 * Zet één cyclus neer: een weekdoel op `dag`, met een goedgekeurde voltooiing op
 * het gevraagde niveau.
 *
 * ⚠️ De volgorde is het hele punt, en die komt uit `risicoradar.test.ts`: een
 *    voltooiing invoegen zet het weekdoel via `mark_weekly_goal_pending()` op
 *    `pending`. Staat de rij meteen op `approved`, dan draait die trigger hem
 *    terug en meet de test iets anders dan hij denkt. Dus eerst `todo`, dan de
 *    voltooiing, dan de eindstatus.
 */
async function zetCyclus(
  goalId: string,
  dag: IsoDate,
  niveau: 'floor' | 'ceiling',
  titel: string,
): Promise<void> {
  const admin = adminDb();

  const week = await admin
    .from('weekly_goals')
    .insert({
      goal_id: goalId,
      title: titel,
      cycle_start_date: dag,
      cycle_index: 1,
      status: 'todo',
    })
    .select('id')
    .single();
  if (week.error || week.data === null) throw new Error(`weekdoel ${titel}: ${week.error?.message}`);

  const voltooiing = await admin.from('completions').insert({
    weekly_goal_id: week.data.id,
    user_id: eigenaarId,
    achieved_level: niveau,
    note: `Fixture ${titel}`,
    cycle_start_date: dag,
  });
  if (voltooiing.error) throw new Error(`voltooiing ${titel}: ${voltooiing.error.message}`);

  const bij = await admin.from('weekly_goals').update({ status: 'approved' }).eq('id', week.data.id);
  if (bij.error) throw new Error(`status ${titel}: ${bij.error.message}`);
}

/**
 * Zet één afgesloten cyclus neer met een gegeven eindstatus en zónder
 * voltooiing — een week die niet gehaald is, om welke reden dan ook.
 */
async function zetCyclusMetStatus(
  goalId: string,
  dag: IsoDate,
  status: 'missed' | 'excused' | 'cancelled' | 'carried',
  titel: string,
): Promise<void> {
  const admin = adminDb();
  const week = await admin
    .from('weekly_goals')
    .insert({ goal_id: goalId, title: titel, cycle_start_date: dag, cycle_index: 1, status: 'todo' })
    .select('id')
    .single();
  if (week.error || week.data === null) throw new Error(`weekdoel ${titel}: ${week.error?.message}`);

  const bij = await admin.from('weekly_goals').update({ status }).eq('id', week.data.id);
  if (bij.error) throw new Error(`status ${titel}: ${bij.error.message}`);
}

/**
 * Zet één cyclus neer met een ingediende, nog niet goedgekeurde voltooiing.
 *
 * ⚠️ De status wordt hier níet met de hand gezet: `mark_weekly_goal_pending()`
 *    (0023) doet dat in dezelfde transactie als de insert. Dit is dus geen
 *    kunstmatige toestand maar de normale gang van zaken tussen indienen en
 *    goedkeuren.
 */
async function zetCyclusInAfwachting(
  goalId: string,
  dag: IsoDate,
  niveau: 'floor' | 'ceiling',
  titel: string,
): Promise<void> {
  const admin = adminDb();

  const week = await admin
    .from('weekly_goals')
    .insert({ goal_id: goalId, title: titel, cycle_start_date: dag, cycle_index: 1, status: 'todo' })
    .select('id')
    .single();
  if (week.error || week.data === null) throw new Error(`weekdoel ${titel}: ${week.error?.message}`);

  const voltooiing = await admin.from('completions').insert({
    weekly_goal_id: week.data.id,
    user_id: eigenaarId,
    achieved_level: niveau,
    note: `Fixture ${titel}`,
    cycle_start_date: dag,
  });
  if (voltooiing.error) throw new Error(`voltooiing ${titel}: ${voltooiing.error.message}`);
}

/** Maakt een doel zonder mijlpalen en met een verre streefdatum. */
async function maakDoel(titel: string): Promise<string> {
  // ⚠️ Geen open mijlpalen en de streefdatum ver weg: anders wint een van de
  //    `unreachable`-takken, die bovenaan staan, en zegt de stand niets over de
  //    vloerverhouding.
  const doel = await adminDb()
    .from('goals')
    .insert({
      owner_id: eigenaarId,
      title: titel,
      target_date: addDays(eigenDatum, 200),
      status: 'active',
    })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel ${titel}: ${doel.error?.message}`);
  return doel.data.id;
}

/** Draait de radar en geeft stand plus onderbouwing terug. */
async function meet(goalId: string): Promise<{ stand: string; reden: Reden }> {
  const draai = await adminDb().rpc('herbereken_risico', { p_goal_id: goalId });
  if (draai.error) throw new Error(`herbereken_risico: ${draai.error.message}`);

  const rij = await adminDb()
    .from('goal_risk')
    .select('status, reason')
    .eq('goal_id', goalId)
    .single();
  if (rij.error || rij.data === null) throw new Error(`goal_risk: ${rij.error?.message}`);

  return { stand: rij.data.status as string, reden: (rij.data.reason ?? {}) as Reden };
}

describe.skipIf(!rlsTestsConfigured)('De vloerverhouding van de Risico-radar', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('vloerverhouding-eigenaar');
    eigenaarId = eigenaar.id;

    const profiel = await adminDb()
      .from('profiles')
      .select('tz')
      .eq('id', eigenaarId)
      .single();
    if (profiel.error || profiel.data === null) {
      throw new Error(`profiel: ${profiel.error?.message}`);
    }
    eigenDatum = localDateIn(profiel.data.tz as TimeZone, now());
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'telt de lopende cyclus niet mee in de teller',
    async () => {
      const goalId = await maakDoel('VLOER-LOPEND');

      // Drie afgesloten cycli: twee op de vloer, één op het plafond.
      // 2 / 3 = 0,667 en dat blijft onder de drempel van 0,75.
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');

      const voor = await meet(goalId);
      expect(voor.reden.cycli_gehaald, 'de opstelling telt drie afgesloten cycli').toBe(3);
      expect(voor.stand, 'zonder de lopende cyclus staat dit doel op koers').toBe('on_track');

      // ⚠️ **De lopende week, en met opzet niet op de dag dat hij begon.** Drie
      //    dagen geleden gestart is het normale geval — je haalt je vloer
      //    zelden op maandagochtend. Op `eigenDatum` zou deze test slagen met
      //    de kapotte grens `< v_vandaag` erin.
      await zetCyclus(goalId, addDays(eigenDatum, -3), 'floor', 'week 0');

      const na = await meet(goalId);

      expect(
        na.reden.cycli_gehaald,
        'de noemer hoort de lopende cyclus niet te tellen — die is nog niet af',
      ).toBe(3);

      expect(
        na.reden.vloeraandeel,
        'de lopende cyclus telde mee in de teller en niet in de noemer, dus het ' +
          'vloeraandeel sprong van 0,667 naar 1,0. Let op de grens: een cyclus is ' +
          'pas af als `cycle_start_date + 6 < vandaag`',
      ).toBeCloseTo(2 / 3, 5);

      expect(
        na.stand,
        'je vloer halen en goedgekeurd krijgen leverde een risicowaarschuwing op — ' +
          'domeinregel 8 zegt dat een gehaalde vloer een geslaagde week is',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'telt een cyclus met twee weekdoelen één keer',
    async () => {
      const goalId = await maakDoel('VLOER-DUBBEL');

      // ⚠️ Twee weekdoelen in dezelfde cyclus, allebei op de vloer. De noemer
      //    telt `distinct cycle_start_date` en ziet dus één cyclus; telde de
      //    teller `count(*)` over weekdoelen, dan telt deze week dubbel.
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3a');
      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3b');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'drie cycli, ook al liggen er vier weekdoelen').toBe(3);

      expect(
        uit.reden.vloeraandeel,
        'de cyclus met twee weekdoelen telde dubbel in de teller: 3/3 in plaats van 2/3',
      ).toBeCloseTo(2 / 3, 5);

      expect(
        uit.stand,
        'twee weekdoelen in één week maakten van twee vloerweken er drie, en dat ' +
          'tilde het aandeel over de drempel',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'telt de lopende cyclus niet mee in de noemer van het tempo',
    async () => {
      // ⚠️ **Dezelfde grens, de andere query — en deze raakt iedereen.** Voor de
      //    vloerverhouding heb je drie gehaalde cycli nodig voor er iets vuurt;
      //    hier is een openstaand weekdoel van deze week genoeg. Gemeten vóór de
      //    reparatie: drie weken op het plafond gaven `tempo 0.75` en `at_risk`
      //    zodra de lopende week één dag oud was.
      const goalId = await maakDoel('TEMPO-LOPEND');

      // Een streefdatum kort genoeg om het benodigde tempo op 1,0 te zetten, en
      // drie open mijlpalen: dan is `benodigd > tempo` de tak die kan vuren.
      await adminDb()
        .from('goals')
        .update({ target_date: addDays(eigenDatum, 21) })
        .eq('id', goalId);
      const mijlpalen = await adminDb()
        .from('milestones')
        .insert([1, 2, 3].map((i) => ({ goal_id: goalId, title: `M${i}`, order_index: i, status: 'todo' })));
      if (mijlpalen.error) throw new Error(`mijlpalen: ${mijlpalen.error.message}`);

      await zetCyclus(goalId, addDays(eigenDatum, -21), 'ceiling', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'ceiling', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');

      const voor = await meet(goalId);
      expect(voor.reden.cycli_bekeken, 'drie afgesloten cycli').toBe(3);
      expect(voor.stand, 'drie van de drie gehaald is op koers').toBe('on_track');

      // ⚠️ Het weekdoel van deze week: aangemaakt, nog niet afgevinkt. Dat is op
      //    woensdag de normaalste zaak van de wereld.
      const lopend = await adminDb().from('weekly_goals').insert({
        goal_id: goalId,
        title: 'lopende week',
        cycle_start_date: addDays(eigenDatum, -3),
        cycle_index: 1,
        status: 'todo',
      });
      if (lopend.error) throw new Error(`lopend weekdoel: ${lopend.error.message}`);

      const na = await meet(goalId);

      expect(
        na.reden.cycli_bekeken,
        'een cyclus die nog loopt hoort niet in de noemer — hij kán nog niet ' +
          'goedgekeurd zijn',
      ).toBe(3);

      expect(
        na.stand,
        'een openstaand weekdoel van de lopende week trok het tempo van 1,00 naar ' +
          '0,75 en leverde een risicowaarschuwing op',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'telt een week die van vloer naar plafond is opgewaardeerd niet als vloerweek',
    async () => {
      // ⚠️ De conjunct `c.superseded_by is null` was ongedekt, en hij draagt een
      //    echte handeling: `dien_opnieuw_in()` supersedeert de oude voltooiing
      //    en zet een nieuwe neer. Zonder dat filter telt een week waarin je van
      //    vloer naar plafond opwaardeerde alsnog als vloerweek — precies
      //    andersom dan wat er gebeurde.
      const goalId = await maakDoel('VLOER-OPGEWAARDEERD');
      const admin = adminDb();

      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');

      // Week -7: eerst op de vloer afgesloten, daarna opgewaardeerd.
      const week = await admin
        .from('weekly_goals')
        .insert({
          goal_id: goalId,
          title: 'week -1',
          cycle_start_date: addDays(eigenDatum, -7),
          cycle_index: 1,
          status: 'todo',
        })
        .select('id')
        .single();
      if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);

      const oud = await admin
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: eigenaarId,
          achieved_level: 'floor',
          note: 'eerst de vloer',
          cycle_start_date: addDays(eigenDatum, -7),
        })
        .select('id')
        .single();
      if (oud.error || oud.data === null) throw new Error(`eerste voltooiing: ${oud.error?.message}`);

      // ⚠️ **De driestap komt uit `dien_opnieuw_in()` zelf en is geen omweg.**
      //    `completions_active_uniq` is uniek op `weekly_goal_id` wáár
      //    `superseded_by is null`, dus twee actieve voltooiingen naast elkaar
      //    kan niet — ook niet één tel lang. De RPC zet de nieuwe rij daarom
      //    neer mét een `superseded_by`, verwijst dan de oude naar de nieuwe, en
      //    maakt de nieuwe pas daarna actief.
      const nieuw = await admin
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: eigenaarId,
          achieved_level: 'ceiling',
          note: 'toch het plafond',
          cycle_start_date: addDays(eigenDatum, -7),
          superseded_by: oud.data.id,
        })
        .select('id')
        .single();
      if (nieuw.error || nieuw.data === null) {
        throw new Error(`tweede voltooiing: ${nieuw.error?.message}`);
      }

      const heen = await admin
        .from('completions')
        .update({ superseded_by: nieuw.data.id })
        .eq('id', oud.data.id);
      if (heen.error) throw new Error(`oude supersede: ${heen.error.message}`);

      const terug = await admin
        .from('completions')
        .update({ superseded_by: null })
        .eq('id', nieuw.data.id);
      if (terug.error) throw new Error(`nieuwe activeren: ${terug.error.message}`);

      await admin.from('weekly_goals').update({ status: 'approved' }).eq('id', week.data.id);

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'drie afgesloten en gehaalde cycli').toBe(3);
      expect(
        uit.reden.vloeraandeel,
        'de opgewaardeerde week telde alsnog als vloerweek — `superseded_by is null` ' +
          'ontbreekt in de teller',
      ).toBeCloseTo(2 / 3, 5);
    },
    TEST_TIMEOUT,
  );


  /**
   * ⚠️ **De gemengde cyclus — QS8-278.**
   *
   * De teller vroeg *"bestáát er een vloervoltooiing in deze cyclus"*, terwijl de
   * regel die hij bewaakt *"structureel alléén de vloer"* belooft. Dat verschil
   * is onzichtbaar zolang een cyclus precies één weekdoel heeft, en er staat geen
   * unieke sleutel op `(goal_id, cycle_start_date)`.
   *
   * Gemeten vóór 0162, vier afgesloten cycli met tempo 1,00 en tien weken tot de
   * streefdatum:
   *
   * ```
   * alleen vloer   -> at_risk   vloeraandeel 1.00
   * twee vloeren   -> at_risk   vloeraandeel 1.00   (de reparatie van 0157)
   * gemengd        -> at_risk   vloeraandeel 1.00   <- deze
   * alleen plafond -> on_track  vloeraandeel 0.00
   * ```
   *
   * De drie tests hieronder horen bij elkaar en dekken elk een andere grendel:
   * de gemengde cyclus valt uit de teller, het vloersignaal blíjft vuren bij een
   * echte vloerreeks, en de `bool_and` loopt over de goedgekeurde weekdoelen en
   * niet over alles wat er in die week gepland stond.
   */
  it(
    'telt een cyclus met een plafond én een vloer niet als vloerweek',
    async () => {
      const goalId = await maakDoel('VLOER-GEMENGD');

      // Drie afgesloten cycli, elk met twéé weekdoelen: één op het plafond
      // gehaald en één op de vloer. Je hebt élke week je plafond aangeraakt.
      for (const weken of [-21, -14, -7]) {
        await zetCyclus(goalId, addDays(eigenDatum, weken), 'ceiling', `week ${weken}a`);
        await zetCyclus(goalId, addDays(eigenDatum, weken), 'floor', `week ${weken}b`);
      }

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'drie cycli, ook al liggen er zes weekdoelen').toBe(3);

      expect(
        uit.reden.vloeraandeel,
        'de teller vroeg of er een vloervoltooiing bestónd in plaats van of er ' +
          'alléén een vloer was, en telde deze drie weken dus alle drie mee: 3/3',
      ).toBeCloseTo(0, 5);

      expect(
        uit.stand,
        'drie weken je plafond gehaald, en de radar zei dat je structureel op de ' +
          'vloer zit — de onterecht zwaardere stand waar de dossierrij van 20-08 ' +
          'voor waarschuwt',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'waarschuwt nog steeds wie structureel alleen de vloer haalt',
    async () => {
      // ⚠️ **De must-see, en zonder deze test bewijst de reparatie niets.** Een
      //    teller die de gemengde cyclus overslaat is niet te onderscheiden van
      //    een teller die niets meer telt — en dan is de radar stuk in de andere
      //    richting: hij zwijgt over precies het patroon dat hij moet vangen.
      //
      //    Dit is bovendien de énige test in dit bestand die de vloertak zíet
      //    vuren. De vier tests erboven eisen alle vier `on_track`; wie de hele
      //    tak zou weghalen, zou ze alle vier groen houden.
      const goalId = await maakDoel('VLOER-STRUCTUREEL');

      await zetCyclus(goalId, addDays(eigenDatum, -21), 'floor', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'floor', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'floor', 'week -1');

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'drie afgesloten en gehaalde cycli').toBe(3);
      expect(uit.reden.vloeraandeel, 'drie van de drie op de vloer').toBeCloseTo(1, 5);
      expect(
        uit.stand,
        'structureel alleen de vloer halen is het signaal dat deze tak bestáát om ' +
          'te geven — de reparatie van de gemengde cyclus mag hem niet meenemen',
      ).toBe('at_risk');
    },
    TEST_TIMEOUT,
  );

  it(
    'kijkt naar de goedgekeurde weekdoelen en niet naar wat er ingediend is',
    async () => {
      // ⚠️ **De grens zit binnen de groep.** De `bool_and` loopt over de
      //    weekdoelen die `approved` zijn; een plafond dat je wél ingediend hebt
      //    maar dat nog op goedkeuring wacht, hoort je niet uit het vloersignaal
      //    te tillen. De teller moet dezelfde eenheid tellen als de noemer, en
      //    `v_recent_goed` telt uitsluitend goedgekeurde weken.
      //
      // ⚠️ **De eerste versie van deze test voerde het geval door een pad dat een
      //    éérdere grendel al afving** — een plafondweekdoel op `missed` zónder
      //    voltooiing wordt al door de `join completions` weggelaten, dus de
      //    statusfilter eruit halen liet hem gewoon groen. Gemeten en niet
      //    beredeneerd: mutatie C was groen, en dat is precies wat CLAUDE.md
      //    bedoelt met een ijking die zijn eigen grendel niet raakt. Een
      //    voltooiing zet het weekdoel via `mark_weekly_goal_pending()` op
      //    `pending`, en dát is de vorm die de filter écht voedt.
      const goalId = await maakDoel('VLOER-INGEDIEND');

      for (const weken of [-21, -14, -7]) {
        await zetCyclus(goalId, addDays(eigenDatum, weken), 'floor', `week ${weken} vloer`);
        await zetCyclusInAfwachting(
          goalId,
          addDays(eigenDatum, weken),
          'ceiling',
          `week ${weken} plafond (in afwachting)`,
        );
      }

      const uit = await meet(goalId);

      expect(uit.reden.cycli_gehaald, 'elke cyclus heeft één goedgekeurd weekdoel').toBe(3);
      expect(
        uit.reden.vloeraandeel,
        'een plafond dat nog op goedkeuring wacht telt niet mee in de `bool_and` — ' +
          'er is in die week nog niets anders goedgekeurd dan de vloer',
      ).toBeCloseTo(1, 5);
      expect(uit.stand, 'drie weken alleen de vloer goedgekeurd gekregen').toBe('at_risk');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **Welke statussen "tellen tegen je" is geen smaakkwestie** — dat staat al
   *    vast in het puntenmodel. Gemeten over het hele schema en de Edge
   *    Functions: alléén `missed` levert een `cycle_missed`-boeking op
   *    (`rollover/index.ts` zet daar de status en het minpunt in één handeling).
   *    `excused`, `cancelled` en `carried` boeken niets, en horen dus ook het
   *    tempo niet te drukken.
   *
   *    De must-see staat erbij: een écht gemiste week móet het tempo verlagen.
   *    Zonder die helft is "de reparatie werkt" niet te onderscheiden van "de
   *    noemer telt niets meer".
   */
  const NEUTRAAL = [
    { status: 'excused' as const, waarom: 'een adempauze is per domeinregel 10 nul, niet strafbaar' },
    { status: 'cancelled' as const, waarom: 'je hebt de week zelf afgesloten; `sluit_weekdoel_af()` boekt niets' },
    { status: 'carried' as const, waarom: 'het weekdoel staat in een latere cyclus als nieuwe rij' },
  ];

  it.each(NEUTRAAL)(
    'laat een cyclus met status $status het tempo niet drukken',
    async ({ status, waarom }) => {
      const goalId = await maakDoel(`TEMPO-${status.toUpperCase()}`);
      await adminDb()
        .from('goals')
        .update({ target_date: addDays(eigenDatum, 21) })
        .eq('id', goalId);
      const mijlpalen = await adminDb()
        .from('milestones')
        .insert([1, 2, 3].map((i) => ({ goal_id: goalId, title: `M${i}`, order_index: i, status: 'todo' })));
      if (mijlpalen.error) throw new Error(`mijlpalen: ${mijlpalen.error.message}`);

      await zetCyclus(goalId, addDays(eigenDatum, -21), 'ceiling', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'ceiling', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');
      await zetCyclusMetStatus(goalId, addDays(eigenDatum, -28), status, `week -4 (${status})`);

      const uit = await meet(goalId);

      expect(
        uit.reden.cycli_bekeken,
        `${waarom} — de noemer hoort alleen cycli te tellen die een oordeel kregen`,
      ).toBe(3);

      expect(
        uit.stand,
        `een cyclus met status ${status} drukte het tempo van 1,00 naar 0,75 en leverde ` +
          'een risicowaarschuwing op',
      ).toBe('on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een écht gemiste week het tempo wél drukken',
    async () => {
      // ⚠️ De must-see. Zonder deze helft is de reparatie niet te onderscheiden
      //    van een noemer die helemaal niets meer telt, en dan is de radar stuk
      //    in de andere richting: hij zwijgt over iemand die wél achterloopt.
      const goalId = await maakDoel('TEMPO-MISSED');
      await adminDb()
        .from('goals')
        .update({ target_date: addDays(eigenDatum, 21) })
        .eq('id', goalId);
      const mijlpalen = await adminDb()
        .from('milestones')
        .insert([1, 2, 3].map((i) => ({ goal_id: goalId, title: `M${i}`, order_index: i, status: 'todo' })));
      if (mijlpalen.error) throw new Error(`mijlpalen: ${mijlpalen.error.message}`);

      await zetCyclus(goalId, addDays(eigenDatum, -21), 'ceiling', 'week -3');
      await zetCyclus(goalId, addDays(eigenDatum, -14), 'ceiling', 'week -2');
      await zetCyclus(goalId, addDays(eigenDatum, -7), 'ceiling', 'week -1');
      await zetCyclusMetStatus(goalId, addDays(eigenDatum, -28), 'missed', 'week -4 (missed)');

      const uit = await meet(goalId);

      expect(uit.reden.cycli_bekeken, 'een gemiste week telt wél in de noemer').toBe(4);
      expect(
        uit.stand,
        'drie van de vier gehaald met drie mijlpalen over drie weken hoort at_risk te zijn',
      ).toBe('at_risk');
    },
    TEST_TIMEOUT,
  );
});
