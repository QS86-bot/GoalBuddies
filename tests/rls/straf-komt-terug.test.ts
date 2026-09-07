/**
 * Een straf komt terug zodra zijn deadline weer in de toekomst ligt — QS8-308,
 * migratie 0177.
 *
 * ⚠️ **De toestand die 0174 overliet.** Die migratie houdt een straf tegen
 *    zolang er een open deadline-verzoek staat, met een grens van een week op
 *    dat uitstel. Antwoordt de groep pas op dag negen, dan is de straf al
 *    verschuldigd geworden en schuift de goedkeuring alleen `target_date` op.
 *    De straf staat dan `due` terwijl zijn deadline niet meer verstreken is, en
 *    dat botst met domeinregel 11: een straf treedt alleen in werking bij een
 *    verstreken deadline.
 *
 *    Gemeten vóór de reparatie, in één transactie:
 *
 *      A1 rollover        | 1
 *      A2 straf           | due
 *      B1 bob keurt goed  | ok: true, moved: true
 *      B2 straf           | due      <- bleef staan
 *      B3 streefdatum     | +30 dagen
 *
 * ⚠️ **De andere kant is overwogen en afgewezen:** `beslis_deadline_verzoek()`
 *    had ook kunnen weigeren zodra de straf al `due` staat. Dat laat de
 *    eigenaar betalen voor de traagheid van zijn buddy, en dat is precies wat
 *    0171 bij de verlooptak niet wilde. Onderbouwing in
 *    `docs/decisions/2026-09-07-een-straf-die-terugkomt.md`.
 *
 * ⚠️ **De naad zat in het auditspoor.** `noteer_commitment()` viel voor alles
 *    wat geen `cancelled` of `resolved` is terug op `'triggered'`, dus een
 *    terugzet zou als *triggered* in het spoor belanden — het
 *    tegenovergestelde van wat er gebeurde, in precies de tabel die het moet
 *    vastleggen. De trigger was correct voor de overgangen die hij kende, de
 *    nieuwe overgang is correct, en de naad ertussen was een `else` die alles
 *    opving. Regel 18 vraag 1.
 *
 *    Met de hand rood gemaakt, grendel voor grendel:
 *
 *      1. het terugzetblok uit `beslis_deadline_verzoek()`
 *         → 'een goedgekeurde verschuiving zet de straf terug' rood
 *      2. de `reverted`-tak uit `noteer_commitment()`
 *         → 'het auditspoor noemt het een terugzet en geen trigger' rood,
 *           terwijl grendel 1 groen blijft — de kolom klopt dan wel en het
 *           spoor liegt.
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
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  groupId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string; straffen_teruggezet?: number } {
  return (data ?? {}) as { ok?: boolean; reason?: string; straffen_teruggezet?: number };
}

describe.skipIf(!rlsTestsConfigured)('een straf die terugkomt', () => {
  beforeAll(async () => {
    const alice = await createTestUser('terugkomt-alice');
    const bob = await createTestUser('terugkomt-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Terugkomtgroep' });
    const d = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (d.ok !== true || !d.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: d.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    const zone = await adminDb().from('profiles').update({ tz: 'UTC' }).in('id', [alice.id, bob.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = { alice, bob, groupId: d.group.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /**
   * Een doel met een verstreken deadline, een straf die al `due` staat, en een
   * open verzoek dat de groep nog moet beslissen.
   */
  async function wereld(
    titel: string,
    strafstatus: 'due' | 'resolved' | 'set' = 'due',
  ): Promise<{ doelId: string; strafId: string; verzoekId: string }> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    const doelId = doel.data.id as string;

    const koppel = await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: w.groupId });
    if (koppel.error) throw new Error(`koppelen ${titel}: ${koppel.error.message}`);

    const straf = await w.alice.db
      .from('commitments')
      .insert({
        goal_id: doelId,
        type: 'penalty',
        body: `${titel} straf`,
        beneficiary_user_id: w.bob.id,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (straf.error) throw new Error(`straf ${titel}: ${straf.error.message}`);
    const strafId = straf.data.id as string;

    // ⚠️ De dagteller van `vraag_deadline_verschuiving()` staat op vijf per
    //    etmaal en deze suite dient er meer in. De eerdere verzoeken worden
    //    daarom teruggedateerd; dat raakt niets van wat hier getoetst wordt,
    //    want de terugzet kijkt naar `new_date` en `target_date` en niet naar
    //    `created_at`.
    const ruimte = await adminDb()
      .from('deadline_requests')
      .update({ created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() })
      .eq('requester_id', w.alice.id);
    if (ruimte.error) throw new Error(`dagteller: ${ruimte.error.message}`);

    // Het verzoek gaat er langs de echte knop in, vóór de datum verstrijkt.
    const gevraagd = await w.alice.db.rpc('vraag_deadline_verschuiving', {
      p_goal_id: doelId,
      p_group_id: w.groupId,
      p_new_date: addDays(w.vandaag, 60),
      p_reason: 'Ik ben twee weken ziek geweest en kwam aan niets toe.',
    });
    const v = (gevraagd.data ?? {}) as { ok?: boolean; request_id?: string };
    if (v.ok !== true || !v.request_id) throw new Error(`verzoek: ${JSON.stringify(gevraagd.data)}`);

    // En dan verstrijkt de tijd en gaat de straf af. Via `adminDb()`: dat is
    // het verlopen van tijd en niet een handeling die getoetst wordt.
    const verzet = await adminDb()
      .from('goals')
      .update({ target_date: addDays(w.vandaag, -9) })
      .eq('id', doelId);
    if (verzet.error) throw new Error(`verzetten: ${verzet.error.message}`);

    const stand = await adminDb().from('commitments').update({ status: strafstatus }).eq('id', strafId);
    if (stand.error) throw new Error(`straf op ${strafstatus}: ${stand.error.message}`);

    return { doelId, strafId, verzoekId: v.request_id };
  }

  async function standVan(strafId: string): Promise<string> {
    const rij = await adminDb().from('commitments').select('status').eq('id', strafId).single();
    if (rij.error) throw new Error(`status: ${rij.error.message}`);
    return rij.data.status as string;
  }

  async function spoorVan(strafId: string): Promise<readonly string[]> {
    // ⚠️ Geen volgorde-aanname. `commitment_events.created_at` is de
    //    transactietijd, dus rijen uit dezelfde transactie delen hem; QS8-303
    //    geeft de tabel daarvoor een eigen volgordesleutel. Wat deze test
    //    belooft is dát de terugzet als terugzet in het spoor staat, en niet
    //    waar hij staat.
    const rijen = await adminDb()
      .from('commitment_events')
      .select('event_type')
      .eq('commitment_id', strafId);
    if (rijen.error) throw new Error(`spoor: ${rijen.error.message}`);
    return rijen.data.map((r) => r.event_type as string);
  }

  it(
    'een goedgekeurde verschuiving zet de straf terug',
    async () => {
      const { strafId, verzoekId } = await wereld('TERUG goedgekeurd');
      expect(await standVan(strafId), 'opbouw: de straf hoort due te staan').toBe('due');

      const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: true,
      });
      expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);
      expect(uit(akkoord.data).straffen_teruggezet).toBe(1);

      expect(await standVan(strafId)).toBe('set');
    },
    TEST_TIMEOUT,
  );

  it(
    'en de getuige ziet hem daarna niet meer staan',
    async () => {
      // ⚠️ **Dit is waarom er geen tweede melding komt.** Het beeld in de app
      //    corrigeert zichzelf: `getuigenissen()` toont alleen wat in
      //    `commitment_zichtbaar_voor_persoon()` staat, en dat is `{due,
      //    resolved}`. Zou die lijst ooit `set` erbij krijgen, dan blijft er
      //    een verkeerde regel staan bij de getuige en is het besluit over de
      //    melding opnieuw aan de orde.
      const { strafId, verzoekId } = await wereld('TERUG getuige');

      const voor = await w.bob.db.rpc('getuigenissen');
      expect(voor.error, `getuigenissen: ${voor.error?.message}`).toBeNull();
      const zichtbaarVoor = (voor.data as { id: string }[]).some((r) => r.id === strafId);
      expect(zichtbaarVoor, 'de getuige hoort hem eerst te zien').toBe(true);

      const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: true,
      });
      expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);

      const na = await w.bob.db.rpc('getuigenissen');
      const zichtbaarNa = (na.data as { id: string }[]).some((r) => r.id === strafId);
      expect(zichtbaarNa).toBe(false);
    },
    TEST_TIMEOUT,
  );

  it(
    'het auditspoor noemt het een terugzet en geen trigger',
    async () => {
      // ⚠️ Domeinregel 6: corrigeren gebeurt via een record en niet door
      //    geschiedenis te overschrijven. Een spoor dat "triggered" zegt bij een
      //    terugzet is erger dan geen spoor, want het leest als het
      //    tegenovergestelde.
      const { strafId, verzoekId } = await wereld('TERUG spoor');

      const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: true,
      });
      expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);

      expect(await spoorVan(strafId)).toContain('reverted');
    },
    TEST_TIMEOUT,
  );

  it(
    'een afwijzing zet niets terug',
    async () => {
      // ⚠️ De must-allow op de kant die niets mag doen. Zonder haar zou "zet
      //    altijd terug" er net zo groen uitzien.
      const { strafId, verzoekId } = await wereld('TERUG afgewezen');

      const nee = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: false,
      });
      expect(uit(nee.data).ok, `afwijzen: ${JSON.stringify(nee.data)}`).toBe(true);

      expect(await standVan(strafId)).toBe('due');
    },
    TEST_TIMEOUT,
  );

  it(
    'een straf die al afgehandeld is, blijft afgehandeld',
    async () => {
      // ⚠️ `resolved` is een eindstand. Een verschuiving haalt een afgehandelde
      //    straf niet terug het leven in; dat zou geschiedenis herschrijven
      //    (domeinregel 6).
      const { strafId, verzoekId } = await wereld('TERUG resolved', 'resolved');

      const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: true,
      });
      expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);
      expect(uit(akkoord.data).straffen_teruggezet).toBe(0);

      expect(await standVan(strafId)).toBe('resolved');
    },
    TEST_TIMEOUT,
  );

  it(
    'een gewone verschuiving zonder verschuldigde straf verandert er niets aan',
    async () => {
      // ⚠️ De must-allow op het normale pad: een doel waarvan de straf gewoon
      //    op `set` staat, hoort na een goedkeuring nog steeds op `set` te
      //    staan en geen terugzet in zijn spoor te krijgen.
      const { strafId, verzoekId } = await wereld('TERUG gewoon', 'set');

      const akkoord = await w.bob.db.rpc('beslis_deadline_verzoek', {
        p_request_id: verzoekId,
        p_akkoord: true,
      });
      expect(uit(akkoord.data).ok, `goedkeuren: ${JSON.stringify(akkoord.data)}`).toBe(true);
      expect(uit(akkoord.data).straffen_teruggezet).toBe(0);

      expect(await standVan(strafId)).toBe('set');
      expect(await spoorVan(strafId)).not.toContain('reverted');
    },
    TEST_TIMEOUT,
  );
});
