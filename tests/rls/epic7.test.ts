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
import { addDays, now, userCycle } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
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
  mustOk(await alice.db.from('goals').update({ status: 'completed' }).eq('id', goalC), 'doel af');
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
