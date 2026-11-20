/**
 * Een behaalde prestatie delen in één groep — QS8-736, migratie 0309.
 *
 * **De belofte die dit bestand bewaakt (een eigenschap van het geheel):**
 *
 *      Een prestatie komt alleen in een groepschat op een uitdrukkelijke handeling van de
 *      eigenaar, alleen als hij hem echt heeft, alleen in een groep waar hij lid van is,
 *      hoogstens vijf per dag in zijn eigen tijdzone en één keer per groep — en wie zijn
 *      account opzegt, neemt die berichten mee en verder niets.
 *
 * **Met de hand rood gemaakt, grendel voor grendel (regel 18, vraag 3):** zie het
 * PR-verslag; per grendel één mutatie in `deel_prestatie()` of `verwijder_mijn_account()`,
 * en de test die omviel staat erbij.
 *
 * ⚠️ Berichten worden bij **id** vastgelegd en niet achteraf op `subject_id` gezocht: die
 *    kolom gaat bij een accountverwijdering op `null` en de test zou zijn eigen blindheid meten
 *    (zie `wisrecht-wint.test.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GEDEELDE_PRESTATIES } from '../../src/modules/buddies/systeemberichten';
import { adminDb, anonDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestDb, type TestUser } from './harness';
import { psqlMetInvoer } from './psql-stack';

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 40_000;
const BADGES = ['first_goal', 'first_milestone', 'first_review', 'streak_4', 'streak_12'] as const;

interface RpcRand {
  rpc(n: string, a: object): PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
}
const rpc = (db: TestDb) => db as unknown as RpcRand;

async function deel(wie: TestUser, groupId: string, badge: string) {
  const r = await rpc(wie.db).rpc('deel_prestatie', { p_group_id: groupId, p_badge: badge });
  if (r.error) throw new Error(`deel_prestatie: ${r.error.message}`);
  return r.data as { ok: boolean; reason?: string };
}

async function maakGroep(beheerder: TestUser, naam: string) {
  const g = await beheerder.db.rpc('create_group', { group_name: naam });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  return d.group;
}

async function doeMee(wie: TestUser, code: string) {
  const r = await wie.db.rpc('join_group_with_code', { code });
  if ((r.data as { ok?: boolean } | null)?.ok !== true) throw new Error(`meedoen: ${JSON.stringify(r.data)}`);
}

async function geefBadges(wie: TestUser, badges: readonly string[]) {
  for (const badge of badges) {
    const r = await adminDb().from('badges').insert({ user_id: wie.id, badge });
    if (r.error) throw new Error(`badge ${badge}: ${r.error.message}`);
  }
}

async function berichtenIn(groupId: string, db: TestDb = adminDb()) {
  const r = await db.from('chat_messages').select('id, body, payload, sender_id, subject_id, type').eq('group_id', groupId).eq('system_event', 'prestatie_gedeeld');
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

let bob: TestUser; // beheerder, blijft
let alice: TestUser; // lid, deelt
let carol: TestUser; // geen lid
let groep: { id: string; invite_code: string };
let tweede: { id: string; invite_code: string };

describe.skipIf(!rlsTestsConfigured)('QS8-736 — een prestatie delen', () => {
  beforeAll(async () => {
    bob = await createTestUser('delen-bob');
    alice = await createTestUser('delen-alice');
    carol = await createTestUser('delen-carol');
    groep = await maakGroep(bob, 'Delengroep');
    tweede = await maakGroep(bob, 'Tweede delengroep');
    await doeMee(alice, groep.invite_code);
    await doeMee(alice, tweede.invite_code);
    await geefBadges(alice, ['first_goal', 'first_milestone', 'streak_4']);
    await geefBadges(carol, ['first_goal']);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('1. wat er in de groep komt, en wie het leest', () => {
    it('een lid deelt een behaalde prestatie en elk lid leest alleen sleutel en persoon', async () => {
      expect(await deel(alice, groep.id, 'first_goal')).toEqual({ ok: true });
      for (const lid of [alice, bob]) {
        const rijen = await berichtenIn(groep.id, lid.db);
        expect(rijen).toHaveLength(1);
        expect(rijen[0]).toMatchObject({ type: 'system', sender_id: null, subject_id: alice.id, payload: { badge: 'first_goal' } });
        // Geen naam, titel, XP of datum in de opgeslagen zin.
        expect(rijen[0]?.body).toBe('Een lid heeft een prestatie gedeeld.');
      }
    }, TEST_TIMEOUT);

    it('een niet-lid leest het bericht niet (JWT van een ander)', async () => {
      expect(await berichtenIn(groep.id, carol.db)).toHaveLength(0);
      // `anon` heeft geen enkel recht op de tabel: een fout, geen rijen.
      const anon = await anonDb().from('chat_messages').select('id').eq('system_event', 'prestatie_gedeeld');
      expect(anon.data ?? []).toHaveLength(0);
    }, TEST_TIMEOUT);

    it('een client kan zelf geen prestatiebericht schrijven', async () => {
      const r = await alice.db.from('chat_messages').insert({
        group_id: groep.id, type: 'system', system_event: 'prestatie_gedeeld', body: 'x', sender_id: alice.id,
        payload: { badge: 'streak_4' },
      });
      expect(r.error).not.toBeNull();
      expect(await berichtenIn(groep.id)).toHaveLength(1);
    }, TEST_TIMEOUT);
  });

  describe('2. de poorten, elk met een eigen test', () => {
    it('not_earned: een badge die je niet hebt, en een die niet bestaat', async () => {
      expect(await deel(alice, groep.id, 'streak_12')).toEqual({ ok: false, reason: 'not_earned' });
      expect(await deel(alice, groep.id, 'bestaat_niet')).toEqual({ ok: false, reason: 'not_earned' });
      expect(await deel(bob, groep.id, 'first_goal')).toEqual({ ok: false, reason: 'not_earned' });
    }, TEST_TIMEOUT);

    it('not_member: een niet-lid en een uitgezet lid', async () => {
      expect(await deel(carol, groep.id, 'first_goal')).toEqual({ ok: false, reason: 'not_member' });
      const uit = await adminDb().from('group_members').update({ status: 'inactive' }).eq('group_id', tweede.id).eq('user_id', alice.id);
      expect(uit.error).toBeNull();
      expect(await deel(alice, tweede.id, 'first_goal')).toEqual({ ok: false, reason: 'not_member' });
      await adminDb().from('group_members').update({ status: 'active' }).eq('group_id', tweede.id).eq('user_id', alice.id);
      expect(await berichtenIn(tweede.id)).toHaveLength(0);
    }, TEST_TIMEOUT);

    it('already_shared: dubbel delen weigert, en twee gelijktijdige verzoeken geven één rij', async () => {
      expect(await deel(alice, groep.id, 'first_goal')).toEqual({ ok: false, reason: 'already_shared' });
      const [a, b] = await Promise.all([deel(alice, groep.id, 'first_milestone'), deel(alice, groep.id, 'first_milestone')]);
      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      const rijen = (await berichtenIn(groep.id)).filter((r) => (r.payload as { badge?: string } | null)?.badge === 'first_milestone');
      expect(rijen).toHaveLength(1);
    }, TEST_TIMEOUT);

    it('niet aangemeld: anon komt er niet in', async () => {
      const r = await rpc(anonDb()).rpc('deel_prestatie', { p_group_id: groep.id, p_badge: 'first_goal' });
      expect(r.error).not.toBeNull();
    }, TEST_TIMEOUT);

    it('de hulpfuncties zijn niet te roepen vanaf een client', async () => {
      for (const [naam, args] of [['prestatie_deelbaar', { p_badge: 'first_goal' }], ['is_teamgroep', { p_group_id: groep.id }], ['teamgroep_mag_prestatie_delen', {}], ['prestatie_delen_dagmax', {}]] as const) {
        const r = await rpc(alice.db).rpc(naam, args);
        expect(r.error?.code, naam).toBe('42501');
      }
    }, TEST_TIMEOUT);
  });

  describe('3. de deelbaar-lijst is expliciet en één bron', () => {
    it('de database en de TypeScript-kopie noemen dezelfde badges, en dat zijn alle badges', () => {
      const lijst = BADGES.map((b) => `('${b}')`).join(',');
      const uit = psqlMetInvoer(`select count(*) filter (where public.prestatie_deelbaar(b)) || '/' || count(*) from (values ${lijst}, ('nieuwe_badge')) v(b);`);
      // Vijf van zes: alle bekende badges deelbaar, de onbekende niet.
      expect(uit).toContain(`${BADGES.length}/${BADGES.length + 1}`);
      expect([...GEDEELDE_PRESTATIES].sort()).toEqual([...BADGES].sort());
    });

    it('not_shareable bestaat als weigering voor een badge die er niet in staat', () => {
      const sql = `select public.prestatie_deelbaar('nieuwe_badge')::text;`;
      expect(psqlMetInvoer(sql)).toContain('f');
    });
  });

  describe('4. de limiet: vijf per dag, in de tijdzone van de gebruiker', () => {
    it('de zesde deling op één dag weigert met rate_limited', async () => {
      const dan = await createTestUser('delen-dan');
      const g1 = await maakGroep(dan, 'Limiet één');
      const g2 = await maakGroep(dan, 'Limiet twee');
      await geefBadges(dan, BADGES);
      for (const b of BADGES) expect(await deel(dan, g1.id, b), b).toEqual({ ok: true });
      expect(await deel(dan, g2.id, 'first_goal')).toEqual({ ok: false, reason: 'rate_limited' });
      expect(await berichtenIn(g2.id)).toHaveLength(0);
    }, TEST_TIMEOUT);

    it('de dag is de dag van de gebruiker: gisteren-lokaal telt niet, vandaag-lokaal wel', async () => {
      const eva = await createTestUser('delen-eva');
      const tz = 'Pacific/Kiritimati';
      const p = await adminDb().from('profiles').update({ tz }).eq('id', eva.id);
      expect(p.error).toBeNull();
      const g1 = await maakGroep(eva, 'Tijdzone één');
      const g2 = await maakGroep(eva, 'Tijdzone twee');
      await geefBadges(eva, BADGES);
      for (const b of BADGES) expect(await deel(eva, g1.id, b)).toEqual({ ok: true });

      // ⚠️ `stamp_chat_message()` zet `created_at` op `now()` en weigert een wijziging; de
      //    triggers gaan daarom voor deze ene sessie uit (`session_replication_role`), zonder iets
      //    aan de tabel te veranderen.
      const zet = (tijd: string) =>
        psqlMetInvoer(`set session_replication_role = replica;
          update chat_messages set created_at = ${tijd}
           where subject_id = '${eva.id}' and system_event = 'prestatie_gedeeld';`);

      zet(`((date_trunc('day', now() at time zone '${tz}') - interval '1 minute') at time zone '${tz}')`);
      expect(await deel(eva, g2.id, 'first_goal')).toEqual({ ok: true });

      // Nu staan er vijf op vandaag-lokaal 00:00 plus één nieuwe: de zevende kan niet.
      zet(`((date_trunc('day', now() at time zone '${tz}')) at time zone '${tz}')`);
      expect(await deel(eva, g2.id, 'first_milestone')).toEqual({ ok: false, reason: 'rate_limited' });
    }, TEST_TIMEOUT);
  });

  describe('4b. de tijdzone is geen sleutel naar een nieuwe dag', () => {
    it('na een zonewissel blijft het etmaalplafond staan (tweemaal het dagmaximum)', async () => {
      const gus = await createTestUser('delen-gus');
      const tz = 'Pacific/Kiritimati';
      expect((await adminDb().from('profiles').update({ tz }).eq('id', gus.id)).error).toBeNull();
      const groepen = [await maakGroep(gus, 'Etmaal één'), await maakGroep(gus, 'Etmaal twee'), await maakGroep(gus, 'Etmaal drie')];
      await geefBadges(gus, BADGES);
      const gisteren = () =>
        psqlMetInvoer(`set session_replication_role = replica;
          update chat_messages set created_at = ((date_trunc('day', now() at time zone '${tz}') - interval '1 minute') at time zone '${tz}')
           where subject_id = '${gus.id}' and system_event = 'prestatie_gedeeld';`);
      for (const b of BADGES) expect(await deel(gus, groepen[0]!.id, b)).toEqual({ ok: true });
      gisteren();
      for (const b of BADGES) expect(await deel(gus, groepen[1]!.id, b)).toEqual({ ok: true });
      gisteren();
      // Tien berichten staan op "gisteren" in zijn zone, maar binnen 24 uur: de elfde kan niet.
      expect(await deel(gus, groepen[2]!.id, 'first_goal')).toEqual({ ok: false, reason: 'rate_limited' });
    }, TEST_TIMEOUT);
  });

  describe('5. teamgroepen: geschreven voor elk type, uit tot QS8-649', () => {
    it('een groep die als team telt weigert met team_off (de stub in een transactie omgezet)', async () => {
      const fia = await createTestUser('delen-fia');
      const g = await maakGroep(fia, 'Teamproef');
      await geefBadges(fia, ['first_goal']);
      const uit = psqlMetInvoer(`begin;
        create or replace function public.is_teamgroep(p_group_id uuid) returns boolean language sql stable as $$ select true $$;
        set local role authenticated;
        set local request.jwt.claims = '{"sub":"${fia.id}","role":"authenticated"}';
        select public.deel_prestatie('${g.id}', 'first_goal')::text;
        rollback;`);
      expect(uit).toContain('"reason": "team_off"');
      expect(await berichtenIn(g.id)).toHaveLength(0);
    }, TEST_TIMEOUT);

    it('de stub blijft niet stil open staan: bestaat de organisatiekolom, dan moet is_teamgroep() veranderd zijn', () => {
      const kolom = Number(psqlMetInvoer(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'groups' and column_name in ('organization_id', 'organisatie_id');`).match(/\d+/)?.[0]);
      const stubIsNogDeStub = /select false/.test(psqlMetInvoer(`select pg_get_functiondef('public.is_teamgroep(uuid)'::regprocedure);`));
      // ⚠️ Rood zodra QS8-649/652 de kolom brengt zonder dat de stub is aangepast: dan stond het delen
      //    in teamgroepen stilzwijgend AAN, en dat is het besluit dat dit issue juist niet nam.
      expect(kolom > 0 && stubIsNogDeStub).toBe(false);
    });
  });

  describe('6. de payload is de sleutel en verder niets (CHECK, ook voor service_role)', () => {
    it('een extra sleutel, een andere vorm of een gat in de payload weigert', async () => {
      for (const payload of [{ badge: 'first_goal', titel: 'Mijn doel' }, { badge: 'Eerste Doel' }, { iets: 1 }, null]) {
        const r = await adminDb().from('chat_messages').insert({
          group_id: groep.id, type: 'system', system_event: 'prestatie_gedeeld', body: 'Een lid heeft een prestatie gedeeld.', payload,
        });
        expect(r.error?.code, JSON.stringify(payload)).toBe('23514');
      }
    }, TEST_TIMEOUT);
  });

  describe('7. accountverwijdering: de tweede benoemde uitzondering, en niets meer', () => {
    it('het prestatiebericht verdwijnt, andere systeemberichten en gewone berichten blijven', async () => {
      const dirk = await createTestUser('delen-dirk');
      await doeMee(dirk, groep.invite_code);
      await geefBadges(dirk, ['first_goal']);
      expect(await deel(dirk, groep.id, 'first_goal')).toEqual({ ok: true });
      const mijn = (await berichtenIn(groep.id)).find((r) => r.subject_id === dirk.id);
      expect(mijn).toBeDefined();
      const bobs = (await berichtenIn(groep.id)).find((r) => r.subject_id === alice.id);

      const blijven: string[] = [];
      for (const ev of ['member_joined', 'goal_completed', 'commitment_due']) {
        const r = await adminDb().from('chat_messages').insert({
          group_id: groep.id, type: 'system', system_event: ev, body: 'Een lid.', subject_id: dirk.id,
        }).select('id').single();
        if (r.error) throw new Error(r.error.message);
        blijven.push(r.data.id as string);
      }
      const gewoon = await dirk.db.from('chat_messages').insert({ group_id: groep.id, sender_id: dirk.id, body: 'Hallo' }).select('id').single();
      if (gewoon.error) throw new Error(gewoon.error.message);
      blijven.push(gewoon.data.id as string);

      const weg = await dirk.db.rpc('verwijder_mijn_account');
      expect((weg.data as { ok?: boolean }).ok).toBe(true);
      expect((weg.data as { prestatieberichten_gewist?: number }).prestatieberichten_gewist).toBe(1);

      const mijnNa = await adminDb().from('chat_messages').select('id').eq('id', mijn?.id ?? '');
      expect(mijnNa.data).toHaveLength(0);
      // `commitment_due` gaat mee onder de eerste uitzondering (QS8-335); de rest blijft.
      const over = await adminDb().from('chat_messages').select('id, system_event').in('id', blijven);
      const events = (over.data ?? []).map((r) => r.system_event ?? 'tekst').sort();
      expect(events).toEqual(['member_joined', 'goal_completed', 'tekst'].sort());
      // En het bericht van een ander blijft.
      const andermans = await adminDb().from('chat_messages').select('id').eq('id', bobs?.id ?? '');
      expect(andermans.data).toHaveLength(1);
    }, TEST_TIMEOUT);
  });
});
