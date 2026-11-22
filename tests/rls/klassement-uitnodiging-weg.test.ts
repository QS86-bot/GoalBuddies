import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { klassementPlek, type KlassementGroep } from '../../src/modules/buddies/klassement-poort';
import { klikUitnodigingWeg, leesUitnodigingWeg, type UitnodigingDb } from '../../src/modules/buddies/klassement-weg';

import { laatOrganisatieAanmaken } from './organisatie-toelating';
import {
  adminDb,
  anonDb,
  createTestUser,
  magNietLanden,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * De uitnodigingskaart wegklikken, per beheerder — QS8-784 (A57, P3 c), migratie 0340.
 *
 * ⚠️ **Twee beloftes, en de toets staat op de naad.**
 *    1. *Domeinregel 7:* alleen de eigen rij. `cor` is een tweede beheerder van dezelfde groep en `bram` een gewoon
 *       lid: een groepstak op de SELECT-policy laat een vreemde buiten en hen binnen, dus alleen deze opzet wordt rood.
 *    2. *Besluit Quinten 22-11:* na aan → uit komt de kaart voor iedereen terug, langs welke route het klassement ook
 *       omgaat. De wegklik loopt via `klikUitnodigingWeg()` en `leesUitnodigingWeg()`, dezelfde functies die het scherm
 *       aanroept, onder een echte JWT; `klassementPlek()` legt de uitkomst naast wat het scherm tekent.
 *
 * IJKING (met de hand op een lokale stack, 22-11-2026, één mutatie per grendel; wélke test omviel staat erbij):
 *   - SELECT-policy `using (true)` -> 'een andere beheerder, een lid, een vreemde en anon lezen de rij niet' en 'een
 *     tweede beheerder ziet alleen zijn eigen rij' vallen om.
 *   - INSERT-policy `is_group_member` i.p.v. `is_group_admin` -> 'een gewoon lid kan niet wegklikken' valt om (plus twee
 *     volgtests die op het aantal rijen leunen).
 *   - INSERT-policy zonder `not g.klassement_aan` -> 'wegklikken bij aan wordt geweigerd' valt om.
 *   - INSERT-policy zonder `organization_id is null and not automatisch` -> 'geen wegklik in een automatisch gevormde
 *     groep of een teamgroep' valt om.
 *   - DELETE-policy `using (is_group_member(group_id))` alléén -> blijft GROEN, en dat is gemeten en geen gat: een
 *     `delete … where` raakt alleen rijen die de SELECT-policy toont, dus de eigen-rij-SELECT is een tweede slot op het
 *     wissen. Met SELECT `using (true)` erbij valt 'een andere beheerder wist de rij niet' om.
 *   - trigger-WHEN alleen uit -> aan -> 'een rij van vóór "aan" overleeft de volgende "uit" niet' valt om.
 *   - trigger weg -> 'aan -> uit', 'elke route' en 'een rij van vóór "aan"' vallen om.
 */
const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 60_000;

/** Ongetypeerde rand: de tabel komt pas na de uitrol in `database.types.ts` (typebrug, zie `klassement-weg.ts`). */
const db = (c: unknown): UitnodigingDb => c as SupabaseClient;
const tabel = (c: unknown) => (c as SupabaseClient).from('klassement_uitnodiging_weg');

describe.runIf(rlsTestsConfigured)('klassement_uitnodiging_weg (QS8-784)', () => {
  let anna: TestUser; // beheerder, maakt de groep
  let cor: TestUser; // tweede beheerder
  let bram: TestUser; // gewoon lid
  let eva: TestUser; // geen lid
  let g: string;

  async function zet(aan: boolean): Promise<void> {
    const r = await anna.db.rpc('zet_groepsklassement' as never, { p_group_id: g, p_aan: aan, p_bevestigd: true } as never);
    expect((r.data as { ok?: boolean } | null)?.ok, JSON.stringify(r.data)).toBe(true);
  }
  async function alleRijen(): Promise<{ user_id: string }[]> {
    const { data, error } = await tabel(adminDb()).select('user_id').eq('group_id', g).order('user_id');
    expect(error).toBeNull();
    return (data ?? []) as { user_id: string }[];
  }
  async function weg(wie: TestUser): Promise<boolean> {
    const uit = await leesUitnodigingWeg(db(wie.db), g, wie.id);
    expect(uit.ok).toBe(true);
    return uit.ok && uit.waarde;
  }
  async function plek(wie: TestUser, beheerder: boolean) {
    const { data } = await wie.db.from('groups').select('*').eq('id', g).maybeSingle();
    const leeg = { staat: 'ok', pagina: { rijen: [] } } as const;
    return klassementPlek(leeg, data as unknown as KlassementGroep, beheerder, await weg(wie));
  }

  beforeAll(async () => {
    [anna, cor, bram, eva] = await Promise.all([
      createTestUser('uweg-anna'),
      createTestUser('uweg-cor'),
      createTestUser('uweg-bram'),
      createTestUser('uweg-eva'),
    ]);
    const r = await anna.db.rpc('create_group', { group_name: 'Uitnodiging weg' });
    const d = r.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (d.ok !== true || !d.group) throw new Error(`groep: ${JSON.stringify(r.data)}`);
    g = d.group.id;
    registreerGroep(g);
    for (const lid of [cor, bram]) {
      const mee = await lid.db.rpc('join_group_with_code', { code: d.group.invite_code });
      expect((mee.data as { ok?: boolean } | null)?.ok).toBe(true);
    }
    const promo = await adminDb().from('group_members').update({ role: 'admin' }).eq('group_id', g).eq('user_id', cor.id);
    expect(promo.error).toBeNull();
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('wegklikken bij aan wordt geweigerd (een nieuwe groep begint met het klassement aan)', async () => {
    const uit = await klikUitnodigingWeg(db(anna.db), g, anna.id);
    expect(uit).toEqual({ ok: false, code: '42501' });
    expect(await alleRijen()).toEqual([]);
  }, TEST_TIMEOUT);

  it('een beheerder klikt weg, leest het terug, en een tweede klik is geen fout', async () => {
    await zet(false);
    expect(await plek(anna, true)).toBe('uitnodiging');
    expect(await klikUitnodigingWeg(db(anna.db), g, anna.id)).toEqual({ ok: true, waarde: true });
    expect(await klikUitnodigingWeg(db(anna.db), g, anna.id)).toEqual({ ok: true, waarde: true });
    expect(await weg(anna)).toBe(true);
    expect(await plek(anna, true)).toBe('niets');
    // De andere beheerder ziet de kaart nog: de wegklik is van Anna alleen.
    expect(await weg(cor)).toBe(false);
    expect(await plek(cor, true)).toBe('uitnodiging');
  }, TEST_TIMEOUT);

  it('een andere beheerder, een lid, een vreemde en anon lezen de rij niet, ook niet met een kale select', async () => {
    expect(await alleRijen()).toEqual([{ user_id: anna.id }]);
    for (const wie of [cor, bram, eva]) {
      const { data, error } = await tabel(wie.db).select('*');
      expect(error).toBeNull();
      expect(data).toEqual([]);
      const gefilterd = await tabel(wie.db).select('*').eq('user_id', anna.id);
      expect(gefilterd.data).toEqual([]);
    }
    const anon = await tabel(anonDb()).select('*');
    expect(anon.data ?? []).toEqual([]);
  }, TEST_TIMEOUT);

  it('een gewoon lid kan niet wegklikken, ook niet voor een ander, en een vreemde ook niet', async () => {
    expect(await klikUitnodigingWeg(db(bram.db), g, bram.id)).toEqual({ ok: false, code: '42501' });
    expect(await klikUitnodigingWeg(db(eva.db), g, eva.id)).toEqual({ ok: false, code: '42501' });
    const namens = await tabel(cor.db).insert({ user_id: bram.id, group_id: g });
    expect(namens.error?.code).toBe('42501');
    expect(await alleRijen()).toEqual([{ user_id: anna.id }]);
  }, TEST_TIMEOUT);

  it('een andere beheerder wist de rij niet, en de eigenaar wijzigt hem niet', async () => {
    const lees = () => tabel(adminDb()).select('*').eq('group_id', g).eq('user_id', anna.id);
    await magNietLanden(() => tabel(cor.db).delete().eq('user_id', anna.id).eq('group_id', g), lees);
    await magNietLanden(() => tabel(bram.db).delete().eq('user_id', anna.id).eq('group_id', g), lees);
    await magNietLanden(
      () => tabel(anna.db).update({ weggeklikt_op: '2000-01-01T00:00:00Z' }).eq('user_id', anna.id).eq('group_id', g),
      lees,
    );
  }, TEST_TIMEOUT);

  it('een tweede beheerder ziet alleen zijn eigen rij', async () => {
    expect((await klikUitnodigingWeg(db(cor.db), g, cor.id)).ok).toBe(true);
    const { data } = await tabel(cor.db).select('user_id');
    expect(data).toEqual([{ user_id: cor.id }]);
    expect((await alleRijen()).length).toBe(2);
  }, TEST_TIMEOUT);

  it('een update van groups die het klassement niet raakt, laat de rijen staan', async () => {
    const r = await adminDb().from('groups').update({ name: 'Uitnodiging weg 2' }).eq('id', g);
    expect(r.error).toBeNull();
    expect((await alleRijen()).length).toBe(2);
  }, TEST_TIMEOUT);

  it('aan -> uit: de kaart komt voor elke beheerder terug (besluit Quinten 22-11)', async () => {
    await zet(true);
    await zet(false);
    expect(await alleRijen()).toEqual([]);
    expect(await plek(anna, true)).toBe('uitnodiging');
    expect(await plek(cor, true)).toBe('uitnodiging');
    expect(await plek(bram, false)).toBe('niets');
  }, TEST_TIMEOUT);

  it('elke route: een omzetting buiten zet_groepsklassement() om wist ook (hier service_role)', async () => {
    expect((await klikUitnodigingWeg(db(anna.db), g, anna.id)).ok).toBe(true);
    const aan = await adminDb().from('groups').update({ klassement_aan: true }).eq('id', g);
    expect(aan.error).toBeNull();
    expect(await alleRijen()).toEqual([]);
  }, TEST_TIMEOUT);

  it('een rij van vóór "aan" overleeft de volgende "uit" niet (verouderd scherm)', async () => {
    // Het klassement staat aan; de policy weigert dit, dus de rij komt er buiten de client om (een race).
    const rij = await tabel(adminDb()).insert({ user_id: anna.id, group_id: g });
    expect(rij.error).toBeNull();
    await zet(false);
    expect(await alleRijen()).toEqual([]);
    expect(await plek(anna, true)).toBe('uitnodiging');
  }, TEST_TIMEOUT);

  it('geen wegklik in een automatisch gevormde groep of een teamgroep, waar het scherm de kaart nooit toont', async () => {
    const r = await anna.db.rpc('create_group', { group_name: 'Uitnodiging weg auto' });
    const auto = (r.data as unknown as { group: { id: string } }).group.id;
    registreerGroep(auto);
    const uit = await anna.db.rpc('zet_groepsklassement' as never, { p_group_id: auto, p_aan: false, p_bevestigd: true } as never);
    expect((uit.data as { ok?: boolean } | null)?.ok).toBe(true);
    expect((await adminDb().from('groups').update({ automatisch: true } as never).eq('id', auto)).error).toBeNull();
    expect(await klikUitnodigingWeg(db(anna.db), auto, anna.id)).toEqual({ ok: false, code: '42501' });

    await laatOrganisatieAanmaken(anna);
    const o = await anna.db.rpc('maak_organisatie' as never, { p_naam: 'Uweg BV' } as never);
    const org = (o.data as unknown as { organization_id: string }).organization_id;
    const t = await anna.db.rpc('maak_teamgroep' as never, { p_organization_id: org, p_naam: 'Team Uweg' } as never);
    const team = (t.data as unknown as { group_id?: string } | null)?.group_id;
    expect(team, JSON.stringify(t.data)).toBeDefined();
    registreerGroep(team ?? '');
    expect(await klikUitnodigingWeg(db(anna.db), team ?? '', anna.id)).toEqual({ ok: false, code: '42501' });
  }, TEST_TIMEOUT);
});
