/**
 * EPIC 9 — het commitment device, uitgevoerd in plaats van gelezen.
 *
 * ⚠️ **Waarom deze suite bestaat.** De bérichten voor `commitment_unlocked` en
 *    `commitment_due` stonden er sinds 0025, de policy die de begunstigde groep
 *    pas vanaf `due` laat meelezen sinds 0006 — en niets in de codebase zette
 *    ooit een commitment op die status. De trigger had dus nog nooit gedraaid.
 *    Precies het patroon waar QS8-112 op stukliep: op Done, maar niemand kon
 *    erbij.
 *
 * ⚠️ **De vraag is niet "werkt de gelukkige route".** De vraag is of je onder je
 *    eigen straf uit kunt komen, en of iemand hem kan lezen voordat hij afgaat.
 *    Domeinregel 7 zegt dat falen nooit publiek is; een straf is de énige
 *    benoemde uitzondering, en alleen omdat de gebruiker hem zelf heeft
 *    ingesteld en bevestigd.
 *
 * ⚠️ Twee accounts, en dat is met opzet zuinig. De suite als geheel maakt al
 *    ongeveer veertig aanmeldingen en Supabase weigert na ongeveer dertig in een
 *    uur (Q-TODO A47). Zie je "Request rate limit reached" in de opbouw, wacht
 *    dan een minuut in plaats van in de policies te zoeken.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, toIsoDate, userCycle, type IsoDate } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Eigenaar van beide doelen. */
  alice: TestUser;
  /** Groepsgenoot, en de begunstigde van beide straffen. */
  bob: TestUser;
  groupId: string;
  /** Doel met een streefdatum die nog niet verstreken is. */
  opTijdGoalId: string;
  /** Doel met een streefdatum die al drie dagen voorbij is. */
  teLaatGoalId: string;
  /** De enige mijlpaal onder het doel dat op tijd is. */
  milestoneId: string;
  beloningId: string;
  strafOpTijdId: string;
  strafTeLaatId: string;
  cycleStart: IsoDate;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string; aantal?: number } {
  return (data ?? {}) as { ok?: boolean; reason?: string; aantal?: number };
}

/** De lokale datum van vandaag, zoals de rollover hem aan de database geeft. */
function vandaag(): IsoDate {
  const d = now();
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

async function statusVan(commitmentId: string): Promise<string> {
  const rij = await adminDb().from('commitments').select('status').eq('id', commitmentId).single();
  if (rij.error || rij.data === null) throw new Error(`status uitlezen: ${rij.error?.message}`);
  return rij.data.status;
}

async function spoorVan(commitmentId: string): Promise<readonly string[]> {
  const rijen = await adminDb()
    .from('commitment_events')
    .select('event_type, created_at')
    .eq('commitment_id', commitmentId)
    .order('created_at', { ascending: true });
  if (rijen.error) throw new Error(`auditspoor: ${rijen.error.message}`);
  return (rijen.data ?? []).map((r) => r.event_type);
}

async function systeemberichten(groupId: string): Promise<readonly string[]> {
  const rijen = await adminDb()
    .from('chat_messages')
    .select('system_event')
    .eq('group_id', groupId)
    .eq('type', 'system');
  if (rijen.error) throw new Error(`systeemberichten: ${rijen.error.message}`);
  return (rijen.data ?? []).map((r) => r.system_event ?? '');
}

describe.skipIf(!rlsTestsConfigured)('EPIC 9 — commitment device', () => {
  let f: Fixture;

  beforeAll(async () => {
    const admin = adminDb();
    const alice = await createTestUser('commitment-alice');
    const bob = await createTestUser('commitment-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Commitment-test' });
    if (groep.error) throw new Error(`groep aanmaken (HTTP): ${groep.error.message}`);
    const groepData = (groep.data ?? {}) as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    const groupId = groepData.group.id;

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now());

    async function maakDoel(titel: string, streefdatum: IsoDate): Promise<string> {
      const doel = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: streefdatum })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`${titel}: ${doel.error?.message}`);

      const koppeling = await alice.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: groupId });
      if (koppeling.error) throw new Error(`koppeling ${titel}: ${koppeling.error.message}`);

      return doel.data.id;
    }

    const opTijdGoalId = await maakDoel('COMMITMENT op tijd', addDays(cycle.startDate, 30));
    const teLaatGoalId = await maakDoel('COMMITMENT te laat', addDays(cycle.startDate, 30));

    // ⚠️ Via de admin-client. `zet_streefdatum()` weigert een datum in het
    //    verleden, en terecht — dat is opbouw en niet wat hier getest wordt.
    const verzetten = await admin
      .from('goals')
      .update({ target_date: addDays(vandaag(), -3) })
      .eq('id', teLaatGoalId);
    if (verzetten.error) throw new Error(`streefdatum verzetten: ${verzetten.error.message}`);

    const mijlpaal = await alice.db
      .from('milestones')
      .insert({ goal_id: opTijdGoalId, title: 'COMMITMENT mijlpaal', order_index: 1 })
      .select('id')
      .single();
    if (mijlpaal.error || mijlpaal.data === null) {
      throw new Error(`mijlpaal: ${mijlpaal.error?.message}`);
    }

    async function maakCommitment(
      goalId: string,
      type: 'reward' | 'penalty',
      body: string,
    ): Promise<string> {
      const rij = await alice.db
        .from('commitments')
        .insert({
          goal_id: goalId,
          type,
          body,
          beneficiary_group_id: type === 'penalty' ? groupId : null,
          confirmed_at: now().toISOString(),
        })
        .select('id')
        .single();
      if (rij.error || rij.data === null) throw new Error(`${body}: ${rij.error?.message}`);
      return rij.data.id;
    }

    f = {
      alice,
      bob,
      groupId,
      opTijdGoalId,
      teLaatGoalId,
      milestoneId: mijlpaal.data.id,
      beloningId: await maakCommitment(opTijdGoalId, 'reward', 'COMMITMENT beloning'),
      strafOpTijdId: await maakCommitment(opTijdGoalId, 'penalty', 'COMMITMENT straf op tijd'),
      strafTeLaatId: await maakCommitment(teLaatGoalId, 'penalty', 'COMMITMENT straf te laat'),
      cycleStart: cycle.startDate,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Het auditspoor — QS8-84, acceptatiecriterium 7
  // -------------------------------------------------------------------------

  describe('auditspoor', () => {
    it(
      'schrijft de bevestiging zonder dat de client daarom vraagt',
      async () => {
        // ⚠️ Tot 0057 stond deze tabel op nul rijen: RLS aan, alleen een
        //    SELECT-policy, en `logCommitmentEvent()` slikte de 42501 op. Deze
        //    test wordt rood zodra iemand het schrijven weer naar de client haalt.
        expect(await spoorVan(f.beloningId)).toEqual(['confirmed']);
      },
      TEST_TIMEOUT,
    );

    it(
      'noteert wie het deed',
      async () => {
        const rij = await adminDb()
          .from('commitment_events')
          .select('actor_id, event_type')
          .eq('commitment_id', f.beloningId)
          .eq('event_type', 'confirmed')
          .single();
        if (rij.error || rij.data === null) throw new Error(`actor: ${rij.error?.message}`);

        expect(rij.data.actor_id).toBe(f.alice.id);
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // Wat de eigenaar zelf niet mag — de kern van een commitment device
  // -------------------------------------------------------------------------

  describe('je kunt er niet zelf onderuit', () => {
    it(
      'laat de eigenaar zijn eigen beloning niet vrijspelen',
      async () => {
        const poging = await f.alice.db
          .from('commitments')
          .update({ status: 'unlocked' })
          .eq('id', f.beloningId)
          .select('id');

        // De `with check` weigert de nieuwe waarde: 42501, geen stille nul-update.
        expect(poging.error?.code).toBe('42501');
        expect(await statusVan(f.beloningId)).toBe('set');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar het type van een straf niet omzetten naar een beloning',
      async () => {
        // ⚠️ Een kolomgrant en geen policy: RLS kan geen kolommen beperken. Zonder
        //    deze grant is een straf te ontlopen door hem tot beloning te
        //    verklaren.
        const poging = await f.alice.db
          .from('commitments')
          .update({ type: 'reward' })
          .eq('id', f.strafTeLaatId)
          .select('id');

        expect(poging.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar zijn bevestigingsmoment niet verzetten',
      async () => {
        const poging = await f.alice.db
          .from('commitments')
          .update({ confirmed_at: addDays(f.cycleStart, -365) })
          .eq('id', f.strafTeLaatId)
          .select('id');

        expect(poging.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-84 — de straf wordt verschuldigd bij een verstreken deadline
  // -------------------------------------------------------------------------

  describe('een straf wordt verschuldigd', () => {
    it(
      'verbergt een ingestelde straf voor de begunstigde groep',
      async () => {
        const gezien = await f.bob.db.from('commitments').select('id').eq('id', f.strafTeLaatId);

        expect(gezien.error).toBeNull();
        expect(gezien.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'raakt geen straf waarvan de streefdatum nog niet verstreken is',
      async () => {
        // Ook niet als er een gemiste week onder hangt: domeinregel 11, en
        // QS8-84 criterium 2. Een gemiste week kost een minpunt, meer niet.
        const weekdoel = await f.alice.db
          .from('weekly_goals')
          .insert({
            goal_id: f.opTijdGoalId,
            title: 'COMMITMENT gemiste week',
            cycle_start_date: f.cycleStart,
            cycle_index: 1,
          })
          .select('id')
          .single();
        if (weekdoel.error || weekdoel.data === null) {
          throw new Error(`weekdoel: ${weekdoel.error?.message}`);
        }

        const missen = await adminDb()
          .from('weekly_goals')
          .update({ status: 'missed' })
          .eq('id', weekdoel.data.id);
        if (missen.error) throw new Error(`missen: ${missen.error.message}`);

        await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: f.alice.id,
          p_vandaag: vandaag(),
        });

        expect(await statusVan(f.strafOpTijdId)).toBe('set');
      },
      TEST_TIMEOUT,
    );

    it(
      'zet de straf op `due` zodra de streefdatum voorbij is, en doet dat maar één keer',
      async () => {
        const eerste = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: f.alice.id,
          p_vandaag: vandaag(),
        });
        if (eerste.error) throw new Error(`verschuldigd maken: ${eerste.error.message}`);

        expect(await statusVan(f.strafTeLaatId)).toBe('due');

        // Idempotent: de functie raakt alleen `set`, dus een tweede run — en de
        // rollover draait elk uur — verandert niets en plaatst geen tweede bericht.
        const tweede = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: f.alice.id,
          p_vandaag: vandaag(),
        });
        if (tweede.error) throw new Error(`tweede run: ${tweede.error.message}`);
        expect(tweede.data).toBe(0);

        const berichten = await systeemberichten(f.groupId);
        expect(berichten.filter((e) => e === 'commitment_due')).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft de begunstigde groep pas vanaf `due` leesrecht',
      async () => {
        const gezien = await f.bob.db
          .from('commitments')
          .select('id, body')
          .eq('id', f.strafTeLaatId);

        expect(gezien.error).toBeNull();
        expect(gezien.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt het auditspoor van de straf voor de begunstigde groep dicht',
      async () => {
        // De groep leest de straf, niet de geschiedenis eromheen. Het spoor is
        // van de eigenaar (`commitment_events_select`).
        const gezien = await f.bob.db
          .from('commitment_events')
          .select('id')
          .eq('commitment_id', f.strafTeLaatId);

        expect(gezien.error).toBeNull();
        expect(gezien.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'legt trigger én bericht vast in het auditspoor',
      async () => {
        expect(await spoorVan(f.strafTeLaatId)).toEqual(['confirmed', 'triggered', 'posted']);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een verschuldigde straf niet meer intrekken',
      async () => {
        const poging = await f.alice.db
          .from('commitments')
          .update({ status: 'cancelled' })
          .eq('id', f.strafTeLaatId)
          .select('id');

        // De `using` sluit de rij uit, dus dit is een stille nul-update en geen
        // fout. Wat telt is dat de straf blijft staan.
        expect(poging.data ?? []).toHaveLength(0);
        expect(await statusVan(f.strafTeLaatId)).toBe('due');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  // QS8-83 — de beloning komt vrij bij het afronden
  // -------------------------------------------------------------------------

  describe('een doel afronden', () => {
    it(
      'weigert zolang er een mijlpaal openstaat',
      async () => {
        const poging = await f.alice.db.rpc('rond_doel_af', { p_goal_id: f.opTijdGoalId });
        if (poging.error) throw new Error(`afronden: ${poging.error.message}`);

        expect(uitkomst(poging.data).ok).toBe(false);
        expect(uitkomst(poging.data).reason).toBe('open_milestones');
        expect(uitkomst(poging.data).aantal).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de eigenaar zijn doel niet rechtstreeks op `completed` zetten',
      async () => {
        // ⚠️ QS8-102, acceptatiecriterium 4. Dit is de belangrijkste test van dit
        //    blok: `rond_doel_af()` eist dat er geen mijlpaal meer openstaat, en
        //    die eis is de énige rem op het laten vervallen van je eigen straf.
        //    Zou het kolomrecht op `goals.status` ooit terugkomen, dan is die rem
        //    weg zonder dat er iets rood wordt — de RPC blijft immers werken.
        //
        //    0035 trok UPDATE in, 0046 INSERT (die laatste staat getest in
        //    `weekpassen.test.ts`). Voor UPDATE bestond nog geen test.
        const poging = await f.alice.db
          .from('goals')
          .update({ status: 'completed' })
          .eq('id', f.opTijdGoalId)
          .select('id');

        expect(poging.error?.code).toBe('42501');

        const rij = await adminDb()
          .from('goals')
          .select('status')
          .eq('id', f.opTijdGoalId)
          .single();
        expect(rij.data?.status).toBe('active');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert voor iemand die het doel niet bezit',
      async () => {
        const poging = await f.bob.db.rpc('rond_doel_af', { p_goal_id: f.opTijdGoalId });
        if (poging.error) throw new Error(`afronden door bob: ${poging.error.message}`);

        expect(uitkomst(poging.data).reason).toBe('not_owner');
      },
      TEST_TIMEOUT,
    );

    it(
      'speelt de beloning vrij, meldt hem in de groep en laat de straf vervallen',
      async () => {
        const afvinken = await f.alice.db
          .from('milestones')
          .update({ status: 'done', completed_at: now().toISOString() })
          .eq('id', f.milestoneId);
        if (afvinken.error) throw new Error(`mijlpaal afvinken: ${afvinken.error.message}`);

        const rond = await f.alice.db.rpc('rond_doel_af', { p_goal_id: f.opTijdGoalId });
        if (rond.error) throw new Error(`afronden: ${rond.error.message}`);
        expect(uitkomst(rond.data).ok).toBe(true);

        expect(await statusVan(f.beloningId)).toBe('unlocked');
        expect(await spoorVan(f.beloningId)).toEqual(['confirmed', 'triggered', 'posted']);

        const berichten = await systeemberichten(f.groupId);
        expect(berichten).toContain('commitment_unlocked');
        expect(berichten).toContain('goal_completed');
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de straf van een afgerond doel vervallen zónder hem aan de groep te tonen',
      async () => {
        // ⚠️ `cancelled` en niet `resolved`, en dat is domeinregel 7 en geen
        //    smaak: `commitments_select` geeft de begunstigde groep leesrecht
        //    vanaf `unlocked`, `due` én `resolved`. Een straf die nooit is
        //    afgegaan, is niemands zaak.
        expect(await statusVan(f.strafOpTijdId)).toBe('cancelled');

        const gezien = await f.bob.db.from('commitments').select('id').eq('id', f.strafOpTijdId);
        expect(gezien.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'rondt een doel geen tweede keer af',
      async () => {
        const poging = await f.alice.db.rpc('rond_doel_af', { p_goal_id: f.opTijdGoalId });
        if (poging.error) throw new Error(`tweede afronding: ${poging.error.message}`);

        expect(uitkomst(poging.data).reason).toBe('already_completed');

        // En er is geen tweede bericht geplaatst.
        const berichten = await systeemberichten(f.groupId);
        expect(berichten.filter((e) => e === 'goal_completed')).toHaveLength(1);
        expect(berichten.filter((e) => e === 'commitment_unlocked')).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een doel met een afgegaan commitment niet meer weggooien',
      async () => {
        // ⚠️ Migratie 0058, en het is een bevinding die al in ENGINEER-REVIEW
        //    stond met "hoort bij EPIC 9" erachter. `commitments.goal_id` heeft
        //    `on delete cascade`, dus vóór 0058 wiste één DELETE op het doel een
        //    straf die de begunstigde groep al gelezen had. Zolang niets een
        //    commitment op `due` zette was dat theorie; sinds 0057 doet de
        //    rollover dat elk uur.
        //
        //    Bewust géén groepskoppeling op dit doel: anders slaat
        //    `gedeeld_met_groep` eerder toe en bewijst de test iets anders dan
        //    hij zegt.
        const doel = await f.alice.db
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'COMMITMENT weggooidoel',
            target_date: addDays(vandaag(), -2),
          })
          .select('id')
          .single();
        if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

        const straf = await f.alice.db
          .from('commitments')
          .insert({
            goal_id: doel.data.id,
            type: 'penalty',
            body: 'COMMITMENT straf op weggooidoel',
            beneficiary_group_id: f.groupId,
            confirmed_at: now().toISOString(),
          })
          .select('id')
          .single();
        if (straf.error || straf.data === null) throw new Error(`straf: ${straf.error?.message}`);

        // Zolang de straf nog `set` is, mag weggooien gewoon: hij is nooit
        // buiten het eigen scherm geweest.
        const vroeg = await f.alice.db.rpc('verwijder_doel', { p_goal_id: doel.data.id });
        if (vroeg.error) throw new Error(`vroeg weggooien: ${vroeg.error.message}`);
        expect(uitkomst(vroeg.data).ok).toBe(true);

        // En nu hetzelfde, maar nadat de straf is afgegaan.
        const tweede = await f.alice.db
          .from('goals')
          .insert({
            owner_id: f.alice.id,
            title: 'COMMITMENT weggooidoel 2',
            target_date: addDays(vandaag(), -2),
          })
          .select('id')
          .single();
        if (tweede.error || tweede.data === null) throw new Error(`doel 2: ${tweede.error?.message}`);

        const straf2 = await f.alice.db.from('commitments').insert({
          goal_id: tweede.data.id,
          type: 'penalty',
          body: 'COMMITMENT straf die afgaat',
          beneficiary_group_id: f.groupId,
          confirmed_at: now().toISOString(),
        });
        if (straf2.error) throw new Error(`straf 2: ${straf2.error.message}`);

        await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: f.alice.id,
          p_vandaag: vandaag(),
        });

        const laat = await f.alice.db.rpc('verwijder_doel', { p_goal_id: tweede.data.id });
        if (laat.error) throw new Error(`laat weggooien: ${laat.error.message}`);
        expect(uitkomst(laat.data).reason).toBe('commitment_in_werking');

        // Het doel staat er nog, en de straf dus ook.
        const nog = await adminDb().from('goals').select('id').eq('id', tweede.data.id);
        expect(nog.data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een afgerond doel geen straf meer oplopen',
      async () => {
        const verzetten = await adminDb()
          .from('goals')
          .update({ target_date: addDays(vandaag(), -1) })
          .eq('id', f.opTijdGoalId);
        if (verzetten.error) throw new Error(`streefdatum: ${verzetten.error.message}`);

        await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: f.alice.id,
          p_vandaag: vandaag(),
        });

        expect(await statusVan(f.strafOpTijdId)).toBe('cancelled');
      },
      TEST_TIMEOUT,
    );
  });
});
