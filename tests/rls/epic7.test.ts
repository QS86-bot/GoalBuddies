/**
 * EPIC 7 — de chat, de systeemberichten en de weekafsluiting, uitgevoerd in
 * plaats van gelezen.
 *
 * ⚠️ De les van de vorige sessie staat in `docs/WERKVOORRAAD.md` §7.9: de schermen
 *    van EPIC 5 hielden domeinregel 7 netjes aan terwijl de database hem lekte.
 *    Deze suite stelt daarom bij elk nieuw oppervlak twee vragen, en de tweede is
 *    de belangrijkste:
 *
 *      1. staat er iets in dat over andermans tegenslag gaat?
 *      2. is het met één API-verzoek buiten de UI om uit te lezen?
 *
 * ⚠️ Alle testgebruikers worden één keer in `beforeAll` gemaakt. Supabase weigert
 *    na ongeveer dertig aanmeldingen in korte tijd met "Request rate limit
 *    reached", en dan is een rode suite geen bevinding maar een wachttijd.
 *
 *    Deze suite maakt drie accounts bovenop wat `policies.test.ts` er al maakt.
 *    Twee volledige runs binnen een minuut is daarmee genoeg om tegen die grens te
 *    lopen — dat is één keer gebeurd. Zie je een opbouwfout met "rate limit" erin,
 *    wacht dan een minuut in plaats van in de policies te gaan zoeken.
 *
 * ⚠️ De hele opbouw staat in `beforeAll` en de tests zijn leesacties. Dat is niet
 *    alleen sneller: het maakt de tests onafhankelijk van elkaar, en dat is hier
 *    nodig omdat de systeemberichten van de één de chat van de ander vullen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `periods.ts` en niet via `modules/buddies/index.ts`. Die
//    laatste re-exporteert `api.ts` en `chat.ts`, en die trekken de
//    Supabase-client en AsyncStorage mee — en daarmee React Native, in een test
//    die in Node draait.
import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { SYSTEEM_GEBEURTENISSEN } from '../../src/modules/buddies/chat-schemas';
import { addDays, now, userCycle, type Cycle } from '../../src/shared/time';
import {
  adminDb,
  createTestProfile,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  verwijderAuthGebruiker,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Tekst die nergens in een systeembericht mag opduiken.
 *
 * ⚠️ Dit is de scherpste test van de epic. Een systeembericht is een
 *    onveranderlijke kopie die de autorisatie overleeft waaronder hij gemaakt is:
 *    ontkoppelt iemand later zijn doel van de groep — en dát is de manier waarop
 *    je toestemming intrekt — dan verdwijnt de doeltitel uit `group_overview`,
 *    maar een chatbericht met die titel erin blijft voor altijd staan.
 */
const GEHEIM = {
  doelA: 'ZELDZAAMDOELA',
  doelB: 'ZELDZAAMDOELB',
  doelC: 'ZELDZAAMDOELC',
  weektitel: 'ZELDZAAMWEEKTITEL',
  notitie: 'ZELDZAAMNOTITIE',
  mijlpaal: 'ZELDZAAMMIJLPAAL',
  vraag: 'ZELDZAAMVRAAG',
} as const;

interface Fixture {
  alice: TestUser;
  bob: TestUser;
  /** Lid van geen enkele groep van alice en bob. */
  carol: TestUser;
  groupId: string;
  /** Groepsperiode waarin de fixture leeft. */
  periodStart: string;
  /** Een periode die al voorbij is; om te toetsen dat de RPC filtert. */
  vorigePeriodStart: string;
  /** Weekdoel van alice waarop "vertel me meer" en opnieuw indienen gebeurd is. */
  weeklyA: string;
  /** Weekdoel van alice dat goedgekeurd is. */
  weeklyB: string;
  /** De weekafsluiting van alice in de lopende periode. */
  reviewId: string;
  /** Een reactie van bob op die weekafsluiting. */
  replyId: string;
  /** Een gewoon chatbericht van bob. */
  chatId: string;
  /** Twee berichten met exact dezelfde tijdstempel, oplopend op id. */
  zelfdeTijd: readonly string[];
}

let f: Fixture;

function mustOk(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
}

function mustId(
  result: { data: { id: string } | null; error: { message: string } | null },
  what: string,
): string {
  if (result.error) throw new Error(`Opbouw mislukte bij ${what}: ${result.error.message}`);
  if (!result.data) throw new Error(`Opbouw mislukte bij ${what}: geen rij teruggekregen`);
  return result.data.id;
}

interface RpcUitkomst {
  ok?: boolean;
  reason?: string;
  group?: { id: string; invite_code: string };
  completion_id?: string;
}

function uitkomst(data: unknown): RpcUitkomst {
  return (data ?? {}) as RpcUitkomst;
}

async function createGroup(owner: TestUser, name: string): Promise<{ id: string; code: string }> {
  const antwoord = await owner.db.rpc('create_group', { group_name: name });
  if (antwoord.error) throw new Error(`Groep ${name}: ${antwoord.error.message}`);

  const uit = uitkomst(antwoord.data);
  if (uit.ok !== true || uit.group === undefined) {
    throw new Error(`Groep ${name} niet aangemaakt: ${uit.reason ?? 'geen groep'}`);
  }

  return { id: uit.group.id, code: uit.group.invite_code };
}

/** Alle chatberichten van de groep, via de systeemclient. */
async function alleBerichten(): Promise<
  readonly { id: string; body: string | null; type: string; system_event: string | null }[]
> {
  const { data, error } = await adminDb()
    .from('chat_messages')
    .select('id, body, type, system_event')
    .eq('group_id', f.groupId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Berichten lezen mislukte: ${error.message}`);
  return data ?? [];
}

async function systeemberichten(gebeurtenis: string): Promise<readonly (string | null)[]> {
  const alles = await alleBerichten();
  return alles.filter((b) => b.system_event === gebeurtenis).map((b) => b.body);
}

// ---------------------------------------------------------------------------
// Opbouw
// ---------------------------------------------------------------------------

async function buildFixture(): Promise<Fixture> {
  const admin = adminDb();

  const [alice, bob, carol] = await Promise.all([
    createTestUser('e7-alice'),
    createTestUser('e7-bob'),
    createTestUser('e7-carol'),
  ]);

  const group = await createGroup(alice, 'Chatgroep');

  // ⚠️ De oprichter is in dezelfde transactie lid geworden. Er hoort daar géén
  //    "doet mee" te staan; dat toetst een test hieronder.
  //
  // ⚠️ De HTTP-fout gaat expliciet mee in de melding. Zonder dat regeltje leest een
  //    afgebroken opbouw als "bob werd geen lid: undefined" — en dan zoek je in de
  //    policies terwijl het antwoord "Request rate limit reached" was. Deze suite
  //    maakt drie accounts per run bovenop de accounts van `policies.test.ts`, en
  //    Supabase weigert na ongeveer dertig aanmeldingen in korte tijd.
  const meedoen = await bob.db.rpc('join_group_with_code', { code: group.code });
  if (meedoen.error) {
    throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
  }
  if (uitkomst(meedoen.data).ok !== true) {
    throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
  }

  const groep = await admin.from('groups').select('huddle_day, tz').eq('id', group.id).single();
  if (groep.error || groep.data === null) {
    throw new Error(`Groep uitlezen mislukte: ${groep.error?.message}`);
  }

  const periode = groepsperiodeVan(groep.data, now());
  const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

  const maakDoel = async (titel: string): Promise<string> => {
    const id = mustId(
      await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: cycle.endDate })
        .select('id')
        .single(),
      `doel ${titel}`,
    );

    mustOk(
      await alice.db
        .from('goal_group_links')
        .insert({ goal_id: id, group_id: group.id })
        .select('goal_id')
        .single(),
      `koppeling ${titel}`,
    );

    return id;
  };

  const goalA = await maakDoel(GEHEIM.doelA);
  const goalB = await maakDoel(GEHEIM.doelB);
  const goalC = await maakDoel(GEHEIM.doelC);

  const maakWeekdoel = async (goalId: string): Promise<string> =>
    mustId(
      await alice.db
        .from('weekly_goals')
        .insert({
          goal_id: goalId,
          title: GEHEIM.weektitel,
          cycle_start_date: cycle.startDate,
          cycle_index: 1,
        })
        .select('id')
        .single(),
      'weekdoel',
    );

  const weeklyA = await maakWeekdoel(goalA);
  const weeklyB = await maakWeekdoel(goalB);

  const maakVoltooiing = async (weeklyId: string): Promise<string> =>
    mustId(
      await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: weeklyId,
          user_id: alice.id,
          achieved_level: 'ceiling',
          note: GEHEIM.notitie,
          cycle_start_date: cycle.startDate,
        })
        .select('id')
        .single(),
      'voltooiing',
    );

  // Spoor 1: afronden → "vertel me meer" → opnieuw indienen.
  const completionA1 = await maakVoltooiing(weeklyA);

  mustOk(
    await bob.db.from('completion_approvals').insert({
      completion_id: completionA1,
      approver_id: bob.id,
      subject_id: bob.id,
      group_id: group.id,
      status: 'more_info',
      comment: GEHEIM.vraag,
    }),
    'vertel me meer',
  );

  const opnieuw = await alice.db.rpc('dien_opnieuw_in', {
    p_weekly_goal_id: weeklyA,
    p_achieved_level: 'floor',
    p_note: GEHEIM.notitie,
  });
  if (uitkomst(opnieuw.data).ok !== true) {
    throw new Error(`opnieuw indienen mislukte: ${uitkomst(opnieuw.data).reason}`);
  }

  // Spoor 2: afronden → goedkeuren.
  const completionB = await maakVoltooiing(weeklyB);

  mustOk(
    await bob.db.from('completion_approvals').insert({
      completion_id: completionB,
      approver_id: bob.id,
      subject_id: bob.id,
      group_id: group.id,
      status: 'approved',
      comment: null,
    }),
    'goedkeuring',
  );

  // Mijlpalen: één gehaald, één laten vallen.
  const mijlpaalGehaald = mustId(
    await alice.db
      .from('milestones')
      .insert({ goal_id: goalB, title: GEHEIM.mijlpaal, order_index: 1 })
      .select('id')
      .single(),
    'mijlpaal gehaald',
  );
  mustOk(
    await alice.db.from('milestones').update({ status: 'done' }).eq('id', mijlpaalGehaald),
    'mijlpaal op done',
  );

  const mijlpaalWeg = mustId(
    await alice.db
      .from('milestones')
      .insert({ goal_id: goalB, title: `${GEHEIM.mijlpaal}-WEG`, order_index: 2 })
      .select('id')
      .single(),
    'mijlpaal weg',
  );
  mustOk(
    await alice.db.from('milestones').update({ status: 'dropped' }).eq('id', mijlpaalWeg),
    'mijlpaal op dropped',
  );

  // Doelen: één afgerond, één gemist. Alleen het eerste hoort een bericht te geven.
  //
  // ⚠️ Allebei via de systeemclient. Sinds migratie 0035 heeft `authenticated`
  //    geen UPDATE-recht meer op `goals.status`: `completed` liet
  //    `meld_doel_af()` afgaan en plaatste "X heeft een doel afgerond" in elke
  //    gekoppelde groep zonder dat er iets was afgerond, en `missed` is via
  //    `goals_select` leesbaar voor groepsgenoten. Archiveren loopt nu via
  //    `zet_doelstatus()`; deze twee waarden zijn systeemwerk, en dat is precies
  //    wat de fixture hier nabootst.
  mustOk(await admin.from('goals').update({ status: 'completed' }).eq('id', goalC), 'doel af');
  mustOk(await admin.from('goals').update({ status: 'missed' }).eq('id', goalA), 'doel gemist');

  // ⚠️ Een gemiste week gaat via de systeemclient, want sinds migratie 0023 heeft
  //    `authenticated` geen UPDATE-recht meer op `weekly_goals.status`. Precies
  //    zoals de rollover-job het doet — en er hoort niets in de chat te komen.
  const weeklyGemist = await maakWeekdoel(goalA);
  mustOk(
    await admin.from('weekly_goals').update({ status: 'missed' }).eq('id', weeklyGemist),
    'week gemist',
  );

  // Een gewoon bericht van bob.
  const chatId = mustId(
    await bob.db
      .from('chat_messages')
      .insert({ group_id: group.id, sender_id: bob.id, body: 'Hoi allemaal' })
      .select('id')
      .single(),
    'chatbericht',
  );

  // ⚠️ Twee berichten in één statement, dus in één transactie: `now()` is dan voor
  //    beide gelijk en `stamp_chat_message()` zet exact dezelfde `created_at`. Dat
  //    is het geval waarvoor de cursor `(created_at, id)` bestaat en niet
  //    `created_at` alleen.
  const paar = await bob.db
    .from('chat_messages')
    .insert([
      { group_id: group.id, sender_id: bob.id, body: 'tweeling een' },
      { group_id: group.id, sender_id: bob.id, body: 'tweeling twee' },
    ])
    .select('id, created_at');

  if (paar.error || paar.data === null || paar.data.length !== 2) {
    throw new Error(`tweelingberichten: ${paar.error?.message ?? 'niet twee rijen'}`);
  }
  if (paar.data[0]?.created_at !== paar.data[1]?.created_at) {
    throw new Error('tweelingberichten kregen niet dezelfde tijdstempel');
  }

  const zelfdeTijd = [...paar.data].map((r) => r.id).sort();

  // De weekafsluiting van alice, in de lopende periode plus één in een oude.
  const reviewId = mustId(
    await alice.db
      .from('week_reviews')
      .insert({
        group_id: group.id,
        user_id: alice.id,
        group_period_start: periode.startDate,
        did_text: 'Drie ochtenden geschreven.',
        blocked_text: 'Twee avonden overwerk.',
        next_text: 'Hoofdstuk drie af.',
      })
      .select('id')
      .single(),
    'weekafsluiting',
  );

  const vorigePeriodStart = addDays(periode.startDate, -7);
  mustOk(
    await alice.db
      .from('week_reviews')
      .insert({
        group_id: group.id,
        user_id: alice.id,
        group_period_start: vorigePeriodStart,
        did_text: 'Vorige week.',
      })
      .select('id')
      .single(),
    'oude weekafsluiting',
  );

  const replyId = mustId(
    await bob.db
      .from('week_review_replies')
      .insert({ week_review_id: reviewId, author_id: bob.id, body: 'Mooi dat je doorging.' })
      .select('id')
      .single(),
    'reactie',
  );

  return {
    alice,
    bob,
    carol,
    groupId: group.id,
    periodStart: periode.startDate,
    vorigePeriodStart,
    weeklyA,
    weeklyB,
    reviewId,
    replyId,
    chatId,
    zelfdeTijd,
  };
}

// ---------------------------------------------------------------------------

describe.skipIf(!rlsTestsConfigured)('EPIC 7 — chat, systeemberichten, weekafsluiting', () => {
  beforeAll(async () => {
    f = await buildFixture();
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // QS8-69 — de groepschat
  // -------------------------------------------------------------------------

  describe('de groepschat', () => {
    it(
      'laat een lid de berichten van zijn groep lezen',
      async () => {
        const { data, error } = await f.bob.db
          .from('chat_messages')
          .select('id')
          .eq('group_id', f.groupId);

        expect(error).toBeNull();
        expect((data ?? []).map((r) => r.id)).toContain(f.chatId);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander niets, en geen foutmelding',
      async () => {
        // ⚠️ Nul rijen en geen fout. Een 403 zou vertellen dat deze groep bestaat,
        //    en dan is dit eindpunt een orakel voor groeps-id's.
        const { data, error } = await f.carol.db
          .from('chat_messages')
          .select('id')
          .eq('group_id', f.groupId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander ook via groepschat() niets',
      async () => {
        const { data, error } = await f.carol.db.rpc('groepschat', { p_group_id: f.groupId });

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'levert de naam van de afzender in dezelfde ronde',
      async () => {
        const { data, error } = await f.bob.db.rpc('groepschat', {
          p_group_id: f.groupId,
          p_limit: 50,
        });

        expect(error).toBeNull();

        const eigen = (data ?? []).find((r) => r.id === f.chatId);
        expect(eigen?.sender_name).toBeTruthy();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een bericht zonder tekst en zonder bijlage',
      async () => {
        // ⚠️ `body` is nullable voor een fotobericht (7.3). Zonder de CHECK uit
        //    0024 is een bericht zonder allebei ook geldig: een lege regel in het
        //    gesprek die je niet van een storing kunt onderscheiden.
        const leeg = await f.bob.db
          .from('chat_messages')
          .insert({ group_id: f.groupId, sender_id: f.bob.id, body: '   ' });

        expect(leeg.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid geen systeembericht plaatsen',
      async () => {
        // Gat A5. Systeemberichten zijn het kanaal dat de groep vertrouwt; dit was
        // de directe route om domeinregel 7 van buitenaf te breken.
        const vals = await f.bob.db.from('chat_messages').insert({
          group_id: f.groupId,
          sender_id: f.bob.id,
          type: 'system',
          system_event: 'member_joined',
          body: 'Iedereen loopt achter.',
        });

        expect(vals.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'slaat geen bericht over op een paginagrens met gelijke tijdstempels',
      async () => {
        // ⚠️ Dit is de bug die de cursor `(created_at, id)` voorkomt. Met alleen
        //    `created_at` valt van twee berichten uit dezelfde transactie er precies
        //    één stil weg — en dat merk je nooit, want er staat geen gat.
        const eerste = await f.bob.db.rpc('groepschat', {
          p_group_id: f.groupId,
          p_limit: 1,
        });

        expect(eerste.error).toBeNull();
        const kop = eerste.data?.[0];
        expect(kop).toBeDefined();
        if (kop === undefined) return;

        const tweede = await f.bob.db.rpc('groepschat', {
          p_group_id: f.groupId,
          p_before_at: kop.created_at,
          p_before_id: kop.id,
          p_limit: 50,
        });

        expect(tweede.error).toBeNull();

        const gezien = new Set([kop.id, ...(tweede.data ?? []).map((r) => r.id)]);
        for (const id of f.zelfdeTijd) {
          expect(gezien.has(id)).toBe(true);
        }
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-70 — de systeemberichten
  // -------------------------------------------------------------------------

  describe('de systeemberichten', () => {
    it(
      'meldt een nieuw lid, maar niet de oprichter',
      async () => {
        const regels = await systeemberichten('member_joined');

        expect(regels).toHaveLength(1);
        // ⚠️ "X doet mee" over de oprichter in een groep die hij net zelf gemaakt
        //    heeft, leest als een storing.
        expect(regels[0]).toContain('doet mee');
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt een afgeronde week één keer, ook na opnieuw indienen',
      async () => {
        // ⚠️ Twee keer "heeft een week afgerond" voor dezelfde week vertelt de hele
        //    groep dat de eerste poging een vraag opriep. Dat is precies het
        //    schaamtemoment dat 7.6 verbiedt.
        const regels = await systeemberichten('completion_pending');

        // Eén voor doel A (spoor "vertel me meer"), één voor doel B (spoor
        // "goedkeuren"). Het opnieuw indienen op doel A voegt er níets aan toe.
        expect(regels).toHaveLength(2);
      },
      TEST_TIMEOUT,
    );

    it(
      'legt de personen als kolommen vast en niet alleen in de zin — QS8-107, 0059',
      async () => {
        // ⚠️ Dit is de reparatie die niet meer kon zodra `chat_messages` gevuld
        //    raakt met echte gesprekken. Een chatbericht is een onveranderlijke
        //    kopie (beslisdocument 002 §3), dus een Nederlandse zin in `body` is
        //    er later niet meer uit te krijgen. Sinds 0059 staat de persoon in
        //    `subject_id` en maakt de app de zin zelf.
        const rijen = await adminDb()
          .from('chat_messages')
          .select('system_event, subject_id, actor_id, body')
          .eq('group_id', f.groupId)
          .eq('type', 'system');

        if (rijen.error) throw new Error(`berichten lezen: ${rijen.error.message}`);

        const perGebeurtenis = new Map(
          (rijen.data ?? []).map((r) => [r.system_event, r] as const),
        );

        // Elke gebeurtenis die over een persoon gaat, heeft die persoon als kolom.
        for (const gebeurtenis of ['member_joined', 'completion_pending', 'completion_approved']) {
          const rij = perGebeurtenis.get(gebeurtenis);
          expect(rij, gebeurtenis).toBeDefined();
          expect(rij?.subject_id, gebeurtenis).not.toBeNull();
        }

        // En de enige met twee personen heeft ze allebei, in de juiste rol.
        const goedkeuring = perGebeurtenis.get('completion_approved');
        expect(goedkeuring?.subject_id).toBe(f.alice.id);
        expect(goedkeuring?.actor_id).toBe(f.bob.id);

        // `body` blijft gevuld als noodterugval voor rijen van vóór 0059 en voor
        // een gebeurtenis die de app niet kent.
        expect((goedkeuring?.body ?? '').length).toBeGreaterThan(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft de namen mee via groepschat(), zodat de app ze niet hoeft op te zoeken',
      async () => {
        const { data, error } = await f.bob.db.rpc('groepschat', {
          p_group_id: f.groupId,
          p_limit: 50,
        });

        if (error) throw new Error(`groepschat: ${error.message}`);

        const rijen = (data ?? []) as readonly {
          system_event: string | null;
          subject_name: string | null;
          actor_name: string | null;
        }[];

        const goedkeuring = rijen.find((r) => r.system_event === 'completion_approved');
        expect(goedkeuring).toBeDefined();
        expect(goedkeuring?.subject_name).toBeTruthy();
        expect(goedkeuring?.actor_name).toBeTruthy();

        // Een mensbericht heeft geen onderwerp — die kolommen zijn er alleen voor
        // systeemberichten.
        const mens = rijen.find((r) => r.system_event === null);
        expect(mens).toBeDefined();
        expect(mens?.subject_name).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid geen subject_id op zijn eigen bericht zetten',
      async () => {
        // ⚠️ Een kolomgrant en geen policy: RLS kan geen kolommen beperken. Dit
        //    plaatst geen systeembericht — de policy verbiedt `type = 'system'` —
        //    maar het zou wél een verwijzing naar iemand anders zetten in een rij
        //    die je zelf beheert, en dat is het soort halve deur dat later een
        //    hele blijkt.
        const poging = await f.bob.db.from('chat_messages').insert({
          group_id: f.groupId,
          sender_id: f.bob.id,
          body: 'gewoon een bericht',
          type: 'text',
          subject_id: f.alice.id,
        });

        expect(poging.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een systeembericht zijn onderwerp loslaten als dat account verdwijnt',
      async () => {
        // ⚠️ Migratie 0060, nazorg op 0059, en het is de derde keer dat deze
        //    bugklasse opduikt — WERKVOORRAAD §8 punt 8 beschrijft hem sinds 0033.
        //    Een referentiële actie is zelf een UPDATE op de kindtabel; zet een
        //    BEFORE UPDATE-trigger de kolom terug naar `old`, dan draait hij die
        //    actie in dezelfde bewerking terug. 0059 deed dat voor `subject_id`,
        //    en toen faalde de hele DELETE op de foreign key: `verwijder_mijn_account()`
        //    viel om zodra je in één systeembericht genoemd werd.
        //
        // ⚠️ **Deze suite zou dat niet gevangen hebben** en dat is de reden dat
        //    deze test hier staat. `removeTestUsers()` gooit eerst de groepen weg,
        //    en dan zijn de systeemberichten al mee gecascadeerd voordat het
        //    profiel aan de beurt is. De opruiming verbergt de bug.
        const admin = adminDb();
        const tijdelijk = await createTestProfile('e7-vertrekker');

        const lid = await admin
          .from('group_members')
          .insert({ group_id: f.groupId, user_id: tijdelijk.id, role: 'member', status: 'active' });
        if (lid.error) throw new Error(`lid maken: ${lid.error.message}`);

        // meld_nieuw_lid() heeft nu een member_joined geplaatst met hem als onderwerp.
        const bericht = await admin
          .from('chat_messages')
          .select('id, subject_id')
          .eq('group_id', f.groupId)
          .eq('subject_id', tijdelijk.id)
          .single();

        if (bericht.error || bericht.data === null) {
          throw new Error(`systeembericht niet gevonden: ${bericht.error?.message}`);
        }

        // Het account opzeggen. Dit is de handeling die vóór 0060 omviel.
        //
        // ⚠️ Via de harnas en niet via `admin.auth.admin` — QS8-119. Dit is de
        //    enige handeling in deze test die op productie door GoTrue wordt
        //    gedaan en op de lokale stack niet; wat de test bewíjst — dat 0060
        //    het systeembericht zijn onderwerp laat loslaten — gebeurt in de
        //    database en is op beide doelen hetzelfde.
        const weg = await verwijderAuthGebruiker(tijdelijk.id);
        expect(weg, 'account verwijderen mag niet stuklopen op een systeembericht').toBeNull();

        // De regel blijft staan — een gesprek verliest zijn geschiedenis niet —
        // maar de persoon is losgelaten, en de app toont "Een oud-lid".
        const na = await admin
          .from('chat_messages')
          .select('id, subject_id')
          .eq('id', bericht.data.id)
          .single();

        expect(na.data?.subject_id, 'subject_id hoort leeg te lopen, niet teruggezet te worden')
          .toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt een goedkeuring met beide namen erin',
      async () => {
        const regels = await systeemberichten('completion_approved');

        expect(regels).toHaveLength(1);
        expect(regels[0]).toContain('bevestigde de week van');
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt "vertel me meer" niet',
      async () => {
        // Een vraag over iemands week hoort tussen de twee mensen die hem stellen
        // en krijgen. Publiek gemaakt wordt hij een openbare twijfel.
        const alles = await alleBerichten();

        for (const bericht of alles) {
          expect(bericht.system_event).not.toBe('completion_more_info');
          expect(bericht.body ?? '').not.toContain(GEHEIM.vraag);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt een gehaalde mijlpaal en een laten vallen mijlpaal niet',
      async () => {
        expect(await systeemberichten('milestone_done')).toHaveLength(1);

        const alles = await alleBerichten();
        for (const bericht of alles) {
          expect(bericht.system_event).not.toBe('milestone_dropped');
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt een afgerond doel en een gemist doel niet',
      async () => {
        expect(await systeemberichten('goal_completed')).toHaveLength(1);

        const alles = await alleBerichten();
        for (const bericht of alles) {
          expect(bericht.system_event).not.toBe('goal_missed');
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'zegt niets over een gemiste week',
      async () => {
        // ⚠️ De rollover zet `weekly_goals.status = 'missed'`. Er hoort geen enkel
        //    spoor van in de groep te belanden — niet als gebeurtenis en niet in een
        //    tekst.
        const alles = await alleBerichten();

        for (const bericht of alles) {
          const tekst = (bericht.body ?? '').toLowerCase();
          expect(tekst).not.toContain('gemist');
          expect(tekst).not.toContain('missed');
          expect(tekst).not.toContain('achter');
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'zet geen doeltitel, weektitel, mijlpaaltitel of notitie in een bericht',
      async () => {
        // ⚠️ De scherpste test van de epic. Een systeembericht is een
        //    onveranderlijke kopie; wat er in staat, overleeft het intrekken van de
        //    koppeling waaronder het gemaakt is.
        const alles = await alleBerichten();
        const systeem = alles.filter((b) => b.type === 'system');

        expect(systeem.length).toBeGreaterThan(0);

        for (const bericht of systeem) {
          for (const geheim of Object.values(GEHEIM)) {
            expect(bericht.body ?? '').not.toContain(geheim);
          }
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een systeemgebeurtenis die niet op de allowlist staat',
      async () => {
        // ⚠️ Via de systeemclient, en die omzeilt RLS volledig. Dat is precies het
        //    punt: de allowlist is een CHECK en geen policy, dus hij geldt óók voor
        //    de rol die alle policies overslaat.
        for (const verboden of ['week_missed', 'streak_broken', 'behind_schedule']) {
          const poging = await adminDb().from('chat_messages').insert({
            group_id: f.groupId,
            sender_id: null,
            type: 'system',
            system_event: verboden,
            body: 'test',
          });

          expect(poging.error).not.toBeNull();
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'de database en de app staan exact dezelfde gebeurtenissen toe',
      async () => {
        // ⚠️ Dit is de test die ontbrak, en het kostte een bevinding om dat te
        //    zien. De twee tests hieronder dekken samen alleen "de app kent niets
        //    dat de database verbiedt". De andere richting — de database staat
        //    iets toe dat de app niet kent — was nergens afgedekt, en precies dat
        //    gebeurde bij migratie 0032: `deadline_requested` kwam op de CHECK en
        //    `SYSTEEM_GEBEURTENISSEN` bleef op acht staan, zonder één rode test.
        //
        //    Een gelijkheidstoets in plaats van twee insluitingen. Zo valt het
        //    slot ongeacht welke kant er het eerst verandert.
        const { data, error } = await adminDb().rpc('systeembericht_allowlist');

        expect(error).toBeNull();

        const inDeDatabase = [...(data ?? [])].sort();
        const inDeApp = [...SYSTEEM_GEBEURTENISSEN].sort();

        expect(inDeDatabase).toEqual(inDeApp);
      },
      TEST_TIMEOUT,
    );

    it(
      'accepteert elke gebeurtenis die de app kent',
      async () => {
        // ⚠️ De andere kant van de allowlist. Loopt dit stuk, dan zijn
        //    `SYSTEEM_GEBEURTENISSEN` en de CHECK uit elkaar gelopen — en dan
        //    rendert de app iets dat de database nooit uitgeeft, of andersom.
        for (const toegestaan of SYSTEEM_GEBEURTENISSEN) {
          const poging = await adminDb()
            .from('chat_messages')
            .insert({
              group_id: f.groupId,
              sender_id: null,
              type: 'system',
              system_event: toegestaan,
              body: `allowlist ${toegestaan}`,
            })
            .select('id')
            .single();

          expect(poging.error).toBeNull();

          if (poging.data !== null) {
            await adminDb().from('chat_messages').delete().eq('id', poging.data.id);
          }
        }
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-70 — de ketting-mijlpaal (migratie 0070)
  // -------------------------------------------------------------------------
  //
  // ⚠️ Een eigen groep en niet de fixture. De mijlpaal telt álle schakels van een
  //    groep, dus een test die de fixture vult verandert stilzwijgend het antwoord
  //    van elke andere test die daarna schakels bijzet. Een eigen groep is hier
  //    goedkoper dan zorgvuldig opruimen — en hij kost geen extra account, want
  //    alice bestaat al. Het account is de schaarse hulpbron in deze suite, niet
  //    de groep.
  //
  // ⚠️ Deze tests bouwen op elkaar voort, en dat is de enige plek in dit bestand
  //    waar dat gebeurt. Het onderwerp is een drempel die je passeert, dus het
  //    interessante gedrag zit juist in de overgang van 9 naar 10 en van 24 naar
  //    25. Elke test die zijn eigen groep opbouwt zou daar dertig inserts voor
  //    doen en steeds hetzelfde bewijzen. Vitest draait binnen één bestand op
  //    volgorde, dus dit is bepaald — maar herschik ze niet zonder de aantallen
  //    mee te nemen.

  describe('de ketting-mijlpaal', () => {
    let mijlpaalGroup: string;
    /**
     * De lopende groepsperiode van díé groep.
     *
     * ⚠️ Uitgerekend met `groepsperiodeVan()` en niet met de hand, ook al kan de
     *    trigger niets met deze datum. Correctheidsregel 7 kent geen uitzondering
     *    voor testcode, en een testbestand dat zelf gaat rekenen is precies waar
     *    de volgende `new Date()` in de app vandaan komt.
     */
    let mijlpaalPeriode: Cycle;

    /** Schakels van alice, één per periode terug in de tijd. */
    async function zetSchakels(aantal: number, vanaf: number): Promise<void> {
      for (let i = vanaf; i < vanaf + aantal; i += 1) {
        const { error } = await adminDb()
          .from('chain_links')
          .insert({
            group_id: mijlpaalGroup,
            user_id: f.alice.id,
            group_period_start: addDays(mijlpaalPeriode.startDate, -7 * i),
          });

        if (error) throw new Error(`Schakel ${i} mislukte: ${error.message}`);
      }
    }

    /**
     * Mijlpaalberichten op hun drempel gesorteerd.
     *
     * ⚠️ Bestaat voor het ene geval waarin twee aankondigingen uit dezelfde
     *    transactie komen en dus dezelfde `created_at` dragen. Sorteren op het
     *    getal in de tekst is daar de enige stabiele volgorde die er is.
     */
    function opDrempel(berichten: readonly (string | null)[]): readonly (string | null)[] {
      const getal = (b: string | null): number => Number(/(\d+) schakels/.exec(b ?? '')?.[1] ?? 0);
      return [...berichten].sort((a, b) => getal(a) - getal(b));
    }

    /**
     * De échte mijlpaalaankondigingen van de groep.
     *
     * ⚠️ `type` en `sender_id` staan er bewust bij, en dat is dezelfde filter als
     *    in `meld_ketting_mijlpaal()` sinds 0071: alleen wat
     *    `plaats_systeembericht()` geschreven kan hebben. Zonder die twee zou de
     *    test op een vervalst bericht zichzelf voor de gek houden — dat bericht
     *    draagt dezelfde tekst.
     */
    async function mijlpaalberichten(): Promise<readonly (string | null)[]> {
      const { data, error } = await adminDb()
        .from('chat_messages')
        .select('body, created_at')
        .eq('group_id', mijlpaalGroup)
        .eq('system_event', 'chain_milestone')
        .eq('type', 'system')
        .is('sender_id', null)
        .order('created_at', { ascending: true });

      if (error) throw new Error(`Mijlpaalberichten lezen mislukte: ${error.message}`);
      return (data ?? []).map((b) => b.body);
    }

    beforeAll(async () => {
      const groep = await createGroup(f.alice, 'Ketting-mijlpaal');
      mijlpaalGroup = groep.id;

      const rij = await adminDb()
        .from('groups')
        .select('huddle_day, tz')
        .eq('id', mijlpaalGroup)
        .single();

      if (rij.error || rij.data === null) {
        throw new Error(`Groep uitlezen mislukte: ${rij.error?.message}`);
      }

      mijlpaalPeriode = groepsperiodeVan(rij.data, now());
    }, SETUP_TIMEOUT);

    afterAll(async () => {
      // Cascade ruimt de schakels en de chat op.
      await adminDb().from('groups').delete().eq('id', mijlpaalGroup);
    }, TEST_TIMEOUT);

    it(
      'zwijgt onder de eerste drempel',
      async () => {
        await zetSchakels(9, 0);

        expect(await mijlpaalberichten()).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt de eerste drempel precies één keer, en noemt niemand',
      async () => {
        await zetSchakels(1, 9);

        // ⚠️ Een exacte tekst en geen `toContain`. Dít is de domeinregel-7-toets
        //    van dit oppervlak: het bericht mag geen naam dragen, en een
        //    gelijkheidstoets bewijst dat sluitend waar "bevat geen alice" dat
        //    niet doet — die zou een tweede naam gewoon doorlaten.
        expect(await mijlpaalberichten()).toEqual(['De Ketting van deze groep telt 10 schakels.']);
      },
      TEST_TIMEOUT,
    );

    it(
      'draagt de drempel in payload en niet alleen in de zin',
      async () => {
        // ⚠️ **De naad van dit oppervlak** (onwrikbare regel 18). `body` is sinds
        //    migratie 0059 noodterugval; de app maakt de zin zelf uit
        //    `system_event` plus de kolommen. Stond het getal alleen in `body`,
        //    dan toonde de groepschat "systeembericht.chain_milestone" — en dat
        //    deed hij ook, tot migratie 0075.
        //
        //    De tests hierboven toetsen `body` en bleven daar allemaal groen bij.
        //    Dit is de enige die de weg náár het scherm bewaakt.
        const { data, error } = await adminDb()
          .from('chat_messages')
          .select('payload')
          .eq('group_id', mijlpaalGroup)
          .eq('system_event', 'chain_milestone')
          .eq('type', 'system')
          .is('sender_id', null);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);
        expect((data ?? [])[0]?.payload).toEqual({ drempel: 10 });
      },
      TEST_TIMEOUT,
    );

    it(
      'herhaalt een gemelde drempel niet bij de volgende schakel',
      async () => {
        await zetSchakels(5, 10);

        expect(await mijlpaalberichten()).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt de volgende drempel als hij bereikt wordt',
      async () => {
        await zetSchakels(10, 15);

        expect(await mijlpaalberichten()).toEqual([
          'De Ketting van deze groep telt 10 schakels.',
          'De Ketting van deze groep telt 25 schakels.',
        ]);
      },
      TEST_TIMEOUT,
    );

    it(
      'haalt een verdwenen aankondiging in bij de volgende schakel',
      async () => {
        // ⚠️ Dit is de reden dat de trigger gemelde mijlpalen telt in plaats van
        //    te toetsen of het aantal schakels exact op een drempel staat.
        //    `plaats_systeembericht()` slikt een fout bewust in — een bericht mag
        //    de handeling die het aankondigt nooit laten mislukken — en bij een
        //    exacte toets was de mijlpaal daarmee voorgoed weg.
        //
        //    Dezelfde eigenschap dekt het geval van twee gelijktijdige schakels,
        //    dat onder READ COMMITTED een drempel kan overslaan. Dat is niet
        //    deterministisch te maken; dit is de toetsbare helft ervan.
        const { error } = await adminDb()
          .from('chat_messages')
          .delete()
          .eq('group_id', mijlpaalGroup)
          .eq('system_event', 'chain_milestone');

        expect(error).toBeNull();
        expect(await mijlpaalberichten()).toEqual([]);

        await zetSchakels(1, 25);

        // ⚠️ **Op drempel gesorteerd en niet op tijd, en dat is een gerepareerde
        //    flakiness.** Het inhalen gebeurt in één trigger-aanroep, dus beide
        //    berichten komen uit dezelfde transactie — en `now()` staat binnen een
        //    transactie stil. Ze dragen daarmee exact dezelfde `created_at`, en
        //    dan is de volgorde die `order('created_at')` teruggeeft een gok.
        //
        //    De belofte van deze test is dat de twee gemiste drempels alsnog
        //    gemeld worden, niet in welke volgorde de database ze binnen één
        //    transactie wegschrijft. Dat laatste belooft hij nergens. De tests
        //    hierboven toetsen de volgorde wél, en daar mag dat: die plaatsen de
        //    schakels één voor één, dus in aparte transacties.
        //
        //    Gevonden op 24-08 door de suite tegen de lokale stack te draaien —
        //    twee van de vijf rondes rood, elke keer deze. Zie QS8-119.
        expect(await opDrempel(await mijlpaalberichten())).toEqual([
          'De Ketting van deze groep telt 10 schakels.',
          'De Ketting van deze groep telt 25 schakels.',
        ]);
      },
      TEST_TIMEOUT,
    );

    it(
      'heeft een oplopende drempelreeks die bij 10 begint',
      async () => {
        // ⚠️ Leesbaar gemaakt door `ketting_drempels()`, dezelfde vorm als
        //    `systeembericht_allowlist()`. Een dalende of dubbele drempel zou de
        //    "gemeld versus bereikt"-telling stilletjes scheeftrekken: die leunt
        //    erop dat de index in deze lijst gelijk is aan het aantal gemelde
        //    mijlpalen.
        const { data, error } = await adminDb().rpc('ketting_drempels');

        expect(error).toBeNull();

        const drempels = (data ?? []) as readonly number[];

        expect(drempels[0]).toBe(10);
        expect(drempels).toEqual([...drempels].sort((a, b) => a - b));
        expect(new Set(drempels).size).toBe(drempels.length);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid geen eigen bericht met een systeemgebeurtenis plaatsen',
      async () => {
        // ⚠️ Migratie 0071, en de bevinding kwam uit de veiligheidspas op 0070.
        //    `chat_messages_insert` verbood `type = 'system'` (gat A5, 0006 en
        //    0010) maar zei niets over `system_event`. Tot 0070 was dat
        //    onschadelijk — de weergave kijkt naar `sender_id is null` en niet
        //    naar `system_event`. Sinds 0070 kon je er élke echte
        //    mijlpaalaankondiging van een groep mee wegdrukken, want de trigger
        //    telt hoeveel er al gemeld zijn.
        const poging = await f.alice.db.from('chat_messages').insert({
          group_id: mijlpaalGroup,
          sender_id: f.alice.id,
          body: 'Niet van het systeem.',
          type: 'text',
          system_event: 'chain_milestone',
        });

        expect(poging.error).not.toBeNull();
        expect(poging.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'telt een vervalst bericht niet mee als gemelde mijlpaal',
      async () => {
        // ⚠️ Het tweede slot van 0071, en het slot dat ook werkt voor rijen die
        //    er vóór die migratie al stonden. De policy hierboven haalt de
        //    handeling weg; deze toets maakt de functie juist ongeacht wat er in
        //    de tabel staat. Eén van de twee zou hier volstaan — samen zijn ze
        //    sluitend, en dat is de bedoeling bij een telling waar gedrag aan hangt.
        //
        //    Geplaatst met de systeemclient, want een lid kan dit sinds 0071 niet
        //    meer. Dat is precies het geval dat de policy niet dekt: een rij die
        //    er al was.
        const vervalst = await adminDb()
          .from('chat_messages')
          .insert({
            group_id: mijlpaalGroup,
            sender_id: f.alice.id,
            body: 'De Ketting van deze groep telt 50 schakels.',
            type: 'text',
            system_event: 'chain_milestone',
          })
          .select('id')
          .single();

        expect(vervalst.error).toBeNull();

        const voor = await mijlpaalberichten();
        await zetSchakels(24, 26);
        const na = await mijlpaalberichten();

        // 50 schakels bereikt: er hoort er precies één bij te komen, en het
        // vervalste bericht mag die niet hebben weggedrukt.
        expect(na.length).toBe(voor.length + 1);
        expect(na).toContain('De Ketting van deze groep telt 50 schakels.');

        if (vervalst.data !== null) {
          await adminDb().from('chat_messages').delete().eq('id', vervalst.data.id);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de triggerfunctie niet als RPC in de API staan',
      async () => {
        // ⚠️ De les van 0052a en 0069: een nieuwe SECURITY DEFINER-functie erft
        //    de intrekking niet. Deze test hoort bij élke migratie die er een
        //    toevoegt, niet alleen bij de migratie die het gat dichtte.
        const { data, error } = await adminDb().rpc('triggerfuncties_in_de_api');

        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-73 — de weekafsluiting
  // -------------------------------------------------------------------------

  describe('de weekafsluiting', () => {
    it(
      'laat een groepsgenoot de antwoorden van de lopende periode lezen',
      async () => {
        const { data, error } = await f.bob.db.rpc('weekafsluiting', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(error).toBeNull();
        expect((data ?? []).map((r) => r.review_id)).toContain(f.reviewId);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft uitsluitend de gevraagde periode terug',
      async () => {
        // ⚠️ Eén periode per aanroep, en de app vraagt alleen de lopende. Over een
        //    reeks oude perioden wordt afwezigheid een verslag, en dan is overslaan
        //    niet meer gratis.
        const { data } = await f.bob.db.rpc('weekafsluiting', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(data ?? []).toHaveLength(1);

        const oud = await f.bob.db.rpc('weekafsluiting', {
          p_group_id: f.groupId,
          p_period_start: f.vorigePeriodStart,
        });

        expect((oud.data ?? []).map((r) => r.review_id)).not.toContain(f.reviewId);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft een buitenstaander niets, en geen foutmelding',
      async () => {
        const antwoorden = await f.carol.db.rpc('weekafsluiting', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(antwoorden.error).toBeNull();
        expect(antwoorden.data ?? []).toHaveLength(0);

        const reacties = await f.carol.db.rpc('weekafsluiting_reacties', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect(reacties.error).toBeNull();
        expect(reacties.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert drie lege antwoorden',
      async () => {
        // Anders staat er een naam op de kaart met niets eronder, en dat is precies
        // wat "wie niets invult verschijnt gewoon niet" uitsluit.
        const leeg = await f.bob.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.bob.id,
          group_period_start: f.periodStart,
          did_text: '   ',
          blocked_text: null,
          next_text: '',
        });

        expect(leeg.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een groepsgenoot reageren en een buitenstaander niet',
      async () => {
        const reacties = await f.bob.db.rpc('weekafsluiting_reacties', {
          p_group_id: f.groupId,
          p_period_start: f.periodStart,
        });

        expect((reacties.data ?? []).map((r) => r.id)).toContain(f.replyId);

        const vreemd = await f.carol.db
          .from('week_review_replies')
          .insert({ week_review_id: f.reviewId, author_id: f.carol.id, body: 'ik lees mee' });

        expect(vreemd.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat niemand een reactie namens iemand anders plaatsen',
      async () => {
        const namens = await f.bob.db
          .from('week_review_replies')
          .insert({ week_review_id: f.reviewId, author_id: f.alice.id, body: 'dit zei ik niet' });

        expect(namens.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een reactie niet bewerken, ook niet door de schrijver',
      async () => {
        // ⚠️ Een gesprek over wat er in de weg zat, mag niet achteraf herschreven
        //    worden — dan is de veiligheid weg die vraag 2 juist moet hebben. De
        //    policy staat op `false`; PostgREST raakt dan nul rijen aan en geeft
        //    geen fout, dus de test kijkt naar de tekst en niet naar de error.
        await f.bob.db
          .from('week_review_replies')
          .update({ body: 'herschreven' })
          .eq('id', f.replyId);

        const na = await adminDb()
          .from('week_review_replies')
          .select('body')
          .eq('id', f.replyId)
          .single();

        expect(na.data?.body).toBe('Mooi dat je doorging.');
      },
      TEST_TIMEOUT,
    );

    it(
      'neemt de reacties mee als je je eigen antwoorden terugneemt',
      async () => {
        // ⚠️ Als laatste van dit blok, want het sloopt de fixture. Een reactie op
        //    een antwoord dat niet meer bestaat, is een halve zin over iets dat
        //    niemand kan nalezen.
        const weg = await f.alice.db.from('week_reviews').delete().eq('id', f.reviewId);
        expect(weg.error).toBeNull();

        const over = await adminDb()
          .from('week_review_replies')
          .select('id')
          .eq('id', f.replyId);

        expect(over.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-74 — domeinregel 7 op schemaniveau
  // -------------------------------------------------------------------------

  describe('domeinregel 7 op schemaniveau', () => {
    it(
      'zendt chat_messages realtime uit',
      async () => {
        const { data, error } = await adminDb().rpc('realtime_bewaking');

        expect(error).toBeNull();

        const chat = (data ?? []).find((r) => r.tabel === 'chat_messages');
        expect(chat?.in_publicatie).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'zet op geen enkele realtime-tabel REPLICA IDENTITY FULL',
      async () => {
        // ⚠️ Dit is Q-TODO A20, en tot nu toe was het alleen een afspraak. Supabase
        //    past RLS toe op INSERT en UPDATE, maar níét op DELETE. Met de standaard
        //    replica identity gaat er bij een verwijdering alleen een uuid over de
        //    lijn; met `FULL` gaat de volledige oude rij mee — inclusief
        //    `status = 'missed'`, de notitie of de tekst van een privégesprek — naar
        //    iedereen die zich abonneert, lid of niet.
        //
        //    `REPLICA IDENTITY FULL` is de standaardtruc om `old_record` te krijgen
        //    in een realtime-abonnement, dus dit is geen theoretisch risico maar het
        //    eerste dat iemand probeert.
        const { data, error } = await adminDb().rpc('realtime_bewaking');

        expect(error).toBeNull();

        const uitgezonden = (data ?? []).filter((r) => r.in_publicatie);
        expect(uitgezonden.length).toBeGreaterThan(0);

        for (const tabel of uitgezonden) {
          expect(tabel.replica_identity).not.toBe('full');
        }
      },
      TEST_TIMEOUT,
    );
  });
});
