import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BADGES } from '../../src/modules/goals/badges';

import {
  adminDb,
  anonDb,
  createTestUser,
  doelsoort,
  magNietLanden,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  verwijderAuthGebruiker,
  type TestUser,
} from './harness';
import { psql, psqlMetInvoer } from './psql-stack';

/**
 * XP is een aparte teller die alleen optelt en niemand anders leest — QS8-734,
 * migratie 0304.
 *
 * ⚠️ **De beloftes zijn eigenschappen van het geheel**, geen onderdelen:
 *    (1) een ander lid van dezelfde groep leest niets, ook niet met één
 *    rechtstreeks API-verzoek; (2) XP daalt nooit; (3) dezelfde week of badge
 *    geeft nooit twee keer XP, ook niet na een tweede goedkeuringsronde; (4) de
 *    terugwerkende boeking is bij een tweede run gelijk; (5) niemand schrijft
 *    behalve de trigger op de bron van de punten.
 *
 * ⚠️ **`database.types.ts` kent de tabel pas na de uitrol** (migratie wacht op
 *    Quintens backup): vandaar de ongetypeerde rand.
 *
 * IJKING (met de hand, per grendel): zie de PR-tekst van QS8-734.
 */
const TEST_TIMEOUT = 60_000;
const lokaal = doelsoort === 'lokaal';

const tabel = (db: unknown) => (db as SupabaseClient).from('xp_grootboek');
const ledger = () => (adminDb() as unknown as SupabaseClient).from('points_ledger');
const badgesTabel = () => (adminDb() as unknown as SupabaseClient).from('badges');

interface XpStand {
  totaal: number;
  niveau: number;
  drempel_huidig: number;
  drempel_volgende: number | null;
}

async function mijnXp(wie: TestUser): Promise<XpStand> {
  const { data, error } = await (wie.db as unknown as SupabaseClient).rpc('mijn_xp');
  expect(error).toBeNull();
  const rijen = data as XpStand[];
  expect(rijen).toHaveLength(1);
  return rijen[0]!;
}

async function boekWeek(
  wie: TestUser,
  weekdoel: string,
  reden: 'completion_approved_ceiling' | 'completion_approved_floor',
  ronde = 1,
): Promise<void> {
  const { error } = await ledger().insert({
    user_id: wie.id,
    delta: reden === 'completion_approved_ceiling' ? 2 : 1,
    reason: reden,
    ref_type: 'weekly_goal',
    ref_id: weekdoel,
    ronde,
  });
  expect(error).toBeNull();
}

describe.skipIf(!rlsTestsConfigured)('xp_grootboek', () => {
  let eigenaar: TestUser;
  let ander: TestUser;
  let vreemde: TestUser;

  beforeAll(async () => {
    eigenaar = await createTestUser('xp-eigenaar');
    ander = await createTestUser('xp-ander');
    vreemde = await createTestUser('xp-vreemde');
    const groep = await eigenaar.db.rpc('create_group', { group_name: 'XP-groep' });
    const data = groep.data as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (data.ok !== true || !data.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    registreerGroep(data.group.id);
    // ⚠️ `ander` zit in dezelfde groep als de eigenaar: een vreemde toetst hier niets.
    const mee = await ander.db.rpc('join_group_with_code', { code: data.group.invite_code });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) throw new Error('ander werd geen lid');
  }, 120_000);

  afterAll(async () => {
    await removeTestUsers();
  }, 120_000);

  describe('toekenning', () => {
    it('een nieuwe gebruiker staat op nul, niveau 0, volgende drempel 20', async () => {
      const s = await mijnXp(vreemde);
      expect(s).toEqual({ totaal: 0, niveau: 0, drempel_huidig: 0, drempel_volgende: 20 });
    }, TEST_TIMEOUT);

    it('een plafondweek geeft 20, een vloerweek 10, en een tweede ronde niets extra', async () => {
      const a = randomUUID();
      const b = randomUUID();
      await boekWeek(eigenaar, a, 'completion_approved_ceiling');
      await boekWeek(eigenaar, b, 'completion_approved_floor');
      expect((await mijnXp(eigenaar)).totaal).toBe(30);

      // Ronde 2 van dezelfde week (0266): geen tweede XP-rij.
      await boekWeek(eigenaar, a, 'completion_approved_ceiling', 2);
      expect((await mijnXp(eigenaar)).totaal).toBe(30);
    }, TEST_TIMEOUT);

    it('vloer en daarna plafond vult aan tot 20; plafond en daarna vloer geeft niets erbij', async () => {
      const w1 = randomUUID();
      const w2 = randomUUID();
      const voor = (await mijnXp(eigenaar)).totaal;
      await boekWeek(eigenaar, w1, 'completion_approved_floor');
      await boekWeek(eigenaar, w1, 'completion_approved_ceiling', 2);
      expect((await mijnXp(eigenaar)).totaal - voor).toBe(20);

      await boekWeek(eigenaar, w2, 'completion_approved_ceiling');
      await boekWeek(eigenaar, w2, 'completion_approved_floor', 2);
      expect((await mijnXp(eigenaar)).totaal - voor).toBe(40);
    }, TEST_TIMEOUT);

    it('een gemiste week, een correctie en een mijlpaalpunt boeken geen XP en laten het totaal niet dalen', async () => {
      const voor = (await mijnXp(eigenaar)).totaal;
      const week = randomUUID();
      for (const [reason, delta, refType] of [
        ['cycle_missed', -1, null],
        ['correction', -2, 'weekly_goal'],
        ['milestone_done', 1, 'milestone'],
      ] as const) {
        const { error } = await ledger().insert({
          user_id: eigenaar.id,
          delta,
          reason,
          ref_type: refType,
          ref_id: refType === null ? null : week,
        });
        expect(error).toBeNull();
      }
      expect((await mijnXp(eigenaar)).totaal).toBe(voor);
    }, TEST_TIMEOUT);

    it('een weekrij zonder weekdoel-verwijzing (ref_type of ref_id leeg) geeft geen XP', async () => {
      const voor = (await mijnXp(eigenaar)).totaal;
      const { error } = await ledger().insert({
        user_id: eigenaar.id,
        delta: 2,
        reason: 'completion_approved_ceiling',
        ref_type: 'completion',
        ref_id: randomUUID(),
      });
      expect(error).toBeNull();
      expect((await mijnXp(eigenaar)).totaal).toBe(voor);
    }, TEST_TIMEOUT);

    it('elke badge uit de app heeft een bedrag, en het bedrag volgt de zeldzaamheid', async () => {
      const gebruiker = await createTestUser('xp-badges');
      const verwacht: Record<string, number> = {
        first_goal: 10,
        first_milestone: 10,
        first_review: 10,
        streak_4: 25,
        streak_12: 50,
      };
      // Beide kanten: een nieuwe badge zonder bedrag, of een bedrag zonder badge, is rood.
      expect([...BADGES].sort()).toEqual(Object.keys(verwacht).sort());
      for (const badge of BADGES) {
        const { error } = await badgesTabel().insert({ user_id: gebruiker.id, badge });
        expect(error).toBeNull();
      }
      expect((await mijnXp(gebruiker)).totaal).toBe(105);
      // Een tweede keer dezelfde badge schrijven kan niet (PK), en XP blijft gelijk.
      const dubbel = await badgesTabel().insert({ user_id: gebruiker.id, badge: 'streak_4' });
      expect(dubbel.error).not.toBeNull();
      expect((await mijnXp(gebruiker)).totaal).toBe(105);
    }, TEST_TIMEOUT);
  });

  describe('niveau', () => {
    it('volgt de drempels op de randen, in één bron', async () => {
      const gevallen: [number, number][] = [
        [0, 0], [19, 0], [20, 1], [49, 1], [50, 2], [99, 2], [100, 3], [179, 3], [180, 4],
        [299, 4], [300, 5], [479, 5], [480, 6], [749, 6], [750, 7], [1149, 7], [1150, 8],
        [1699, 8], [1700, 9], [2499, 9], [2500, 10], [99_999, 10],
      ];
      for (const [totaal, niveau] of gevallen) {
        const { data, error } = await (eigenaar.db as unknown as SupabaseClient).rpc('xp_niveau', {
          p_totaal: totaal,
        });
        expect(error).toBeNull();
        expect(data, `totaal ${totaal}`).toBe(niveau);
      }
    }, TEST_TIMEOUT);

    it('het hoogste niveau heeft geen volgende drempel', async () => {
      if (!lokaal) return;
      const hoog = await createTestUser('xp-hoog');
      psql(
        `insert into public.xp_grootboek (user_id, bron, weekdoel_id, bedrag) ` +
          `select '${hoog.id}', 'weekdoel_plafond', gen_random_uuid(), 20 from generate_series(1, 125)`,
      );
      const s = await mijnXp(hoog);
      expect(s).toEqual({ totaal: 2500, niveau: 10, drempel_huidig: 2500, drempel_volgende: null });
    }, TEST_TIMEOUT);
  });

  describe('privé voor de eigenaar', () => {
    it('de eigenaar leest zijn rijen en een groepslid leest er geen, ook niet per rechtstreeks verzoek', async () => {
      const eigen = await tabel(eigenaar.db).select('id, user_id').eq('user_id', eigenaar.id);
      expect(eigen.error).toBeNull();
      expect((eigen.data ?? []).length).toBeGreaterThan(0);

      // ⚠️ Eerst bewijzen dat er iets te lezen vált: nul rijen is anders gratis.
      const gezien = await tabel(ander.db).select('id').eq('user_id', eigenaar.id);
      expect(gezien.error).toBeNull();
      expect(gezien.data).toEqual([]);

      const alles = await tabel(ander.db).select('id');
      expect(alles.data).toEqual([]);

      const eenRij = (eigen.data as { id: string }[])[0]!.id;
      const opId = await tabel(ander.db).select('id').eq('id', eenRij);
      expect(opId.data).toEqual([]);
    }, TEST_TIMEOUT);

    it('het totaal van een ander komt niet langs mijn_xp()', async () => {
      expect((await mijnXp(ander)).totaal).toBe(0);
      expect((await mijnXp(eigenaar)).totaal).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('anon krijgt niets en mag mijn_xp() niet aanroepen', async () => {
      const lees = await tabel(anonDb()).select('id');
      expect(lees.error !== null || (lees.data ?? []).length === 0).toBe(true);
      const rpc = await (anonDb() as unknown as SupabaseClient).rpc('mijn_xp');
      expect(rpc.error).not.toBeNull();
    }, TEST_TIMEOUT);

    it('de trigger-functies zijn niet aanroepbaar voor een ingelogde gebruiker', async () => {
      for (const f of ['xp_na_weekpunten', 'xp_na_badge', 'xp_bedrag_badge']) {
        const { error } = await (eigenaar.db as unknown as SupabaseClient).rpc(f, {});
        expect(error, f).not.toBeNull();
      }
    }, TEST_TIMEOUT);
  });

  describe('niemand schrijft behalve de trigger', () => {
    const lees = () => tabel(adminDb()).select('id, bedrag').eq('user_id', eigenaar.id);

    it('een ingelogde gebruiker kan niets toevoegen, wijzigen of wissen', async () => {
      const rij = { user_id: eigenaar.id, bron: 'weekdoel_plafond', weekdoel_id: randomUUID(), bedrag: 20 };
      expect((await tabel(eigenaar.db).insert(rij)).error).not.toBeNull();
      await magNietLanden(
        () => tabel(eigenaar.db).update({ bedrag: 200 }).eq('user_id', eigenaar.id),
        lees,
      );
      await magNietLanden(() => tabel(eigenaar.db).delete().eq('user_id', eigenaar.id), lees);
    }, TEST_TIMEOUT);

    it('ook service_role kan niet toevoegen, wijzigen of wissen', async () => {
      const rij = { user_id: eigenaar.id, bron: 'weekdoel_plafond', weekdoel_id: randomUUID(), bedrag: 20 };
      expect((await tabel(adminDb()).insert(rij)).error).not.toBeNull();
      await magNietLanden(
        () => tabel(adminDb()).update({ bedrag: 200 }).eq('user_id', eigenaar.id),
        lees,
      );
      await magNietLanden(() => tabel(adminDb()).delete().eq('user_id', eigenaar.id), lees);
    }, TEST_TIMEOUT);

    it.skipIf(!lokaal)('de CHECKs weigeren een negatief of nul bedrag en een rij met twee sleutels', () => {
      const poging = (kolommen: string, waarden: string) => () =>
        psql(`insert into public.xp_grootboek (user_id, ${kolommen}) values ('${eigenaar.id}', ${waarden})`);
      expect(poging('bron, weekdoel_id, bedrag', `'weekdoel_plafond', gen_random_uuid(), -1`)).toThrow(
        /xp_grootboek_bedrag_telt_alleen_op/,
      );
      expect(poging('bron, weekdoel_id, bedrag', `'weekdoel_plafond', gen_random_uuid(), 0`)).toThrow(
        /xp_grootboek_bedrag_telt_alleen_op/,
      );
      expect(
        poging('bron, weekdoel_id, badge, bedrag', `'badge', gen_random_uuid(), 'streak_4', 25`),
      ).toThrow(/xp_grootboek_sleutel_hoort_bij_bron/);
      expect(poging('bron, weekdoel_id, bedrag', `'onbekend', gen_random_uuid(), 5`)).toThrow(
        /xp_grootboek_bron_bekend/,
      );
    }, TEST_TIMEOUT);

    it.skipIf(!lokaal)('de unieke sleutel weigert dezelfde week of badge twee keer, ook buiten de trigger', () => {
      const week = randomUUID();
      const rij = `insert into public.xp_grootboek (user_id, bron, weekdoel_id, bedrag) values ('${eigenaar.id}', 'weekdoel_plafond', '${week}', 20)`;
      psql(rij);
      expect(() => psql(rij)).toThrow(/xp_grootboek_weekdoel_uniek_idx/);
    }, TEST_TIMEOUT);
  });

  describe('geen groepsoppervlak, geen realtime', () => {
    it('realtime_bewaking() kent de tabel, buiten de publicatie en zonder REPLICA IDENTITY FULL', async () => {
      const { data, error } = await adminDb().rpc('realtime_bewaking');
      expect(error).toBeNull();
      const rijen = (data ?? []) as { tabel: string; in_publicatie: boolean; replica_identity: string }[];
      // ⚠️ Eerst bewijzen dat de tabel er staat: een lijst zonder haar is "niet in de publicatie" gratis.
      const rij = rijen.find((r) => r.tabel === 'xp_grootboek');
      expect(rij).toBeDefined();
      expect(rij?.in_publicatie).toBe(false);
      expect(rij?.replica_identity).toBe('default');
    }, TEST_TIMEOUT);
  });

  describe('accountverwijdering', () => {
    it('de rijen gaan mee met het account', async () => {
      const weg = await createTestUser('xp-weg');
      await boekWeek(weg, randomUUID(), 'completion_approved_ceiling');
      const voor = await tabel(adminDb()).select('id').eq('user_id', weg.id);
      expect((voor.data ?? []).length).toBe(1);
      expect(await verwijderAuthGebruiker(weg.id)).toBeNull();
      const na = await tabel(adminDb()).select('id').eq('user_id', weg.id);
      expect(na.data).toEqual([]);
    }, TEST_TIMEOUT);
  });

  describe.skipIf(!lokaal)('de terugwerkende boeking', () => {
    const migratie = readFileSync(
      join(
        __dirname,
        '../../supabase/migrations/0304_xp_is_een_aparte_teller_die_alleen_optelt_en_niemand_anders_leest.sql',
      ),
      'utf8',
    );
    const backfill = migratie.slice(migratie.indexOf('-- 5. Terugwerkend'));

    it('geeft XP voor staande weken en badges, telt een ingetrokken week niet en is bij een tweede run gelijk', async () => {
      const oud = await createTestUser('xp-oud');
      const [plafond, vloer, ingetrokken, herwonnen] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await boekWeek(oud, plafond, 'completion_approved_ceiling');
      await boekWeek(oud, vloer, 'completion_approved_floor');
      await boekWeek(oud, ingetrokken, 'completion_approved_ceiling');
      await boekWeek(oud, herwonnen, 'completion_approved_ceiling');
      for (const w of [ingetrokken, herwonnen]) {
        const { error } = await ledger().insert({
          user_id: oud.id, delta: -2, reason: 'correction', ref_type: 'weekly_goal', ref_id: w, ronde: 1,
        });
        expect(error).toBeNull();
      }
      await boekWeek(oud, herwonnen, 'completion_approved_ceiling', 2);
      await badgesTabel().insert({ user_id: oud.id, badge: 'streak_12' });
      // Een week die 0 punten waard is telt live én terugwerkend (rijen, geen punten).
      const nulpunten = randomUUID();
      const nul = await ledger().insert({
        user_id: oud.id, delta: 0, reason: 'completion_approved_floor', ref_type: 'weekly_goal', ref_id: nulpunten,
      });
      expect(nul.error).toBeNull();

      // De toestand van vóór de migratie: punten en badges bestaan, XP nog niet.
      psql(`delete from public.xp_grootboek where user_id = '${oud.id}'`);
      expect((await mijnXp(oud)).totaal).toBe(0);

      psqlMetInvoer(backfill);
      // plafond 20 + vloer 10 + herwonnen 20 + nulpuntenweek 10 + badge 50; de ingetrokken week telt niet.
      expect((await mijnXp(oud)).totaal).toBe(110);
      const rijen = await tabel(adminDb()).select('terugwerkend').eq('user_id', oud.id);
      expect((rijen.data ?? []).every((r: { terugwerkend: boolean }) => r.terugwerkend)).toBe(true);

      const eerste = psql(`select count(*), sum(bedrag) from public.xp_grootboek`);
      psqlMetInvoer(backfill);
      expect(psql(`select count(*), sum(bedrag) from public.xp_grootboek`)).toBe(eerste);
      expect((await mijnXp(oud)).totaal).toBe(110);
    }, TEST_TIMEOUT);
  });
});
