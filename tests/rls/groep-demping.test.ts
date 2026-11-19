import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time';

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

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * ⚠️ Een ongetypeerde rand, want `database.types.ts` kent de tabel pas na de
 *    uitrol en `npm run types:db` (de migratie wacht op Quintens backup).
 */
const demping = (db: unknown) => (db as SupabaseClient).from('groep_demping');

/**
 * Een gedempte groep zwijgt voor jou en voor niemand anders — QS8-752, 0305.
 *
 * ⚠️ **Twee beloftes, en de eerste is de belangrijkste.**
 *    1. *Domeinregel 7:* dempen is een voorkeur van de ontvanger en niemand
 *       anders leest hem. `eve` is hier een groepsgenoot en geen vreemde: een
 *       groepstak op `groep_demping_select` laat een vreemde buiten en een
 *       groepsgenoot binnen, dus alleen die opzet wordt rood.
 *    2. *De databasekant:* `te_beoordelen_voor()` — wat de meldingenjob als
 *       `service_role` aanroept — geeft een gedempte groep niet terug. De test
 *       draait via `adminDb()` omdat dat de rol van de job is; een filter in de
 *       job of de UI zou hier niet rood worden en dat is precies waarom het
 *       geen UI-test is.
 *
 * IJKING (met de hand, één mutatie per grendel): zie de PR-tekst van QS8-752.
 */
describe.skipIf(!rlsTestsConfigured)('groep_demping', () => {
  let alice: TestUser; // eigenaar van het werk
  let bob: TestUser; // dempt
  let eve: TestUser; // groepsgenoot die niet dempt, en ziet niets
  let carol: TestUser; // geen lid van de groepen
  let groepA: string;
  let groepC: string;
  let voltooiing: string; // alleen in groep A
  let voltooiingTwee: string; // in groep A én C

  async function maakGroep(eigenaar: TestUser, naam: string) {
    const { data, error } = await eigenaar.db.rpc('create_group', { group_name: naam });
    const uit = data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (error || uit?.ok !== true || !uit.group) throw new Error(`groep ${naam}: ${JSON.stringify(data)}`);
    registreerGroep(uit.group.id);
    return { id: uit.group.id, code: uit.group.invite_code };
  }
  async function meedoen(gebruiker: TestUser, code: string) {
    const { data } = await gebruiker.db.rpc('join_group_with_code', { code });
    if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error('meedoen mislukte');
  }
  async function teBeoordelen(userId: string): Promise<string[]> {
    const db = adminDb() as unknown as {
      rpc: (n: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data, error } = await db.rpc('te_beoordelen_voor', { p_user_id: userId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { completion_id: string }[]).map((r) => r.completion_id).sort();
  }

  beforeAll(async () => {
    [alice, bob, eve, carol] = await Promise.all([
      createTestUser('demp-alice'),
      createTestUser('demp-bob'),
      createTestUser('demp-eve'),
      createTestUser('demp-carol'),
    ]);
    const a = await maakGroep(alice, 'Demp-A');
    const c = await maakGroep(alice, 'Demp-C');
    groepA = a.id;
    groepC = c.id;
    for (const lid of [bob, eve]) await meedoen(lid, a.code);
    await meedoen(bob, c.code);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    async function keten(titel: string, groepen: string[]): Promise<string> {
      const doel = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: cyclus.endDate })
        .select('id')
        .single();
      if (doel.error || !doel.data) throw new Error(`doel: ${doel.error?.message}`);
      for (const g of groepen) {
        const k = await alice.db.from('goal_group_links').insert({ goal_id: doel.data.id, group_id: g });
        if (k.error) throw new Error(`koppelen: ${k.error.message}`);
      }
      const week = await alice.db
        .from('weekly_goals')
        .insert({ goal_id: doel.data.id, title: `Week ${titel}`, cycle_start_date: cyclus.startDate })
        .select('id')
        .single();
      if (week.error || !week.data) throw new Error(`weekdoel: ${week.error?.message}`);
      const v = await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: week.data.id,
          user_id: alice.id,
          achieved_level: 'ceiling',
          note: 'Dempproef',
          cycle_start_date: cyclus.startDate,
        })
        .select('id')
        .single();
      if (v.error || !v.data) throw new Error(`voltooiing: ${v.error?.message}`);
      return v.data.id;
    }
    voltooiing = await keten('Demp enkel', [groepA]);
    voltooiingTwee = await keten('Demp dubbel', [groepA, groepC]);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de melding (databasekant)', () => {
    it(
      'geeft vóór het dempen beide voltooiingen aan Bob — anders bewijst de rest niets',
      async () => {
        expect(await teBeoordelen(bob.id)).toEqual([voltooiing, voltooiingTwee].sort());
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een voltooiing in twee groepen melden zolang één groep ongedempt is, en zwijgt als beide gedempt zijn',
      async () => {
        const dempA = await demping(bob.db).insert({ user_id: bob.id, group_id: groepA });
        expect(dempA.error, JSON.stringify(dempA.error)).toBeNull();

        // A gedempt: de voltooiing alleen in A verdwijnt, die ook in C blijft.
        expect(await teBeoordelen(bob.id)).toEqual([voltooiingTwee]);

        const dempC = await demping(bob.db).insert({ user_id: bob.id, group_id: groepC });
        expect(dempC.error, JSON.stringify(dempC.error)).toBeNull();
        expect(await teBeoordelen(bob.id)).toEqual([]);
      },
      TEST_TIMEOUT,
    );

    it(
      'raakt Eve niet: een ander lid van dezelfde groep blijft gebeld worden',
      async () => {
        expect(await teBeoordelen(eve.id)).toEqual([voltooiing, voltooiingTwee].sort());
      },
      TEST_TIMEOUT,
    );

    it(
      'geeft de melding terug zodra de demping weg is',
      async () => {
        const weg = await demping(bob.db).delete().eq('user_id', bob.id);
        expect(weg.error, JSON.stringify(weg.error)).toBeNull();
        expect(await teBeoordelen(bob.id)).toEqual([voltooiing, voltooiingTwee].sort());
      },
      TEST_TIMEOUT,
    );
  });

  describe('directe steun blijft (acceptatiecriterium 1 en 3)', () => {
    it(
      'laat een goedkeuring op Alice\' werk binnenkomen terwijl Alice haar groep dempt',
      async () => {
        const alsAlice = await demping(alice.db).insert({ user_id: alice.id, group_id: groepA });
        expect(alsAlice.error, JSON.stringify(alsAlice.error)).toBeNull();

        const keur = await bob.db.from('completion_approvals').insert({
          completion_id: voltooiing,
          approver_id: bob.id,
          subject_id: alice.id,
          group_id: groepA,
          status: 'approved',
        });
        expect(keur.error, JSON.stringify(keur.error)).toBeNull();

        // Precies wat `verseGoedkeuringen()` in de meldingenjob leest (service_role).
        const { data } = await adminDb()
          .from('completion_approvals')
          .select('id')
          .eq('subject_id', alice.id)
          .eq('status', 'approved');
        expect((data ?? []).length).toBeGreaterThanOrEqual(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een gedempt lid gewoon goedkeuren, en verandert zijn lidmaatschap niet',
      async () => {
        const dempt = await demping(eve.db).insert({ user_id: eve.id, group_id: groepA });
        expect(dempt.error, JSON.stringify(dempt.error)).toBeNull();

        const voor = await adminDb()
          .from('group_members')
          .select('role, status, joined_at')
          .eq('group_id', groepA)
          .eq('user_id', eve.id)
          .single();

        const keur = await eve.db.from('completion_approvals').insert({
          completion_id: voltooiingTwee,
          approver_id: eve.id,
          subject_id: alice.id,
          group_id: groepA,
          status: 'approved',
        });
        expect(keur.error, JSON.stringify(keur.error)).toBeNull();

        const na = await adminDb()
          .from('group_members')
          .select('role, status, joined_at')
          .eq('group_id', groepA)
          .eq('user_id', eve.id)
          .single();
        expect(na.data).toEqual(voor.data);
      },
      TEST_TIMEOUT,
    );

    it(
      'zet geen enkel bericht in de groep',
      async () => {
        const tel = async () =>
          (
            await adminDb()
              .from('chat_messages')
              .select('id', { count: 'exact', head: true })
              .in('group_id', [groepA, groepC])
          ).count;
        const voor = await tel();

        await demping(bob.db).delete().eq('user_id', bob.id).eq('group_id', groepA);
        const aan = await demping(bob.db).insert({ user_id: bob.id, group_id: groepA });
        expect(aan.error, JSON.stringify(aan.error)).toBeNull();

        expect(await tel()).toBe(voor);
      },
      TEST_TIMEOUT,
    );
  });

  describe('een ander ziet niets (acceptatiecriterium 2)', () => {
    it(
      'laat Eve — groepsgenoot van Bob — nul rijen van Bob lezen, ook met het filter op zijn id',
      async () => {
        const dempt = await demping(bob.db).insert({ user_id: bob.id, group_id: groepA });
        expect(dempt.error, JSON.stringify(dempt.error)).toBeNull();

        // Bevestigend eerst: Bob leest zijn eigen rij.
        const eigen = await demping(bob.db).select('group_id').eq('user_id', bob.id);
        expect((eigen.data ?? []).length).toBe(1);

        const metFilter = await demping(eve.db).select('user_id, group_id').eq('user_id', bob.id);
        expect(metFilter.error).toBeNull();
        expect(metFilter.data ?? []).toEqual([]);

        const metGroep = await demping(eve.db).select('user_id').eq('group_id', groepA);
        // Eve ziet hoogstens haar eigen rij, nooit die van Bob.
        expect((metGroep.data ?? []).every((r) => (r as { user_id: string }).user_id === eve.id)).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert anon, en weigert Eve om namens Bob te dempen of Bobs demping op te heffen',
      async () => {
        const anon = await demping(anonDb()).select('user_id');
        expect(anon.error).not.toBeNull();

        const namens = await demping(eve.db).insert({ user_id: bob.id, group_id: groepC });
        expect(namens.error).not.toBeNull();

        const opheffen = await magNietLanden(
          () => demping(eve.db).delete().eq('user_id', bob.id),
          () => demping(adminDb()).select('user_id, group_id, gedempt_op').eq('user_id', bob.id),
        );
        expect(opheffen).toBeDefined();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat niemand de tijd zetten of een rij bijwerken (geen kolom- en geen updategrant)',
      async () => {
        const bijwerken = await demping(bob.db)
          .update({ gedempt_op: '2000-01-01T00:00:00Z' })
          .eq('user_id', bob.id);
        expect(bijwerken.error).not.toBeNull();

        const metTijd = await demping(bob.db).insert({
          user_id: bob.id,
          group_id: groepC,
          gedempt_op: '2000-01-01T00:00:00Z',
        });
        expect(metTijd.error).not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een niet-lid niet dempen en onthult niet of de groep bestaat',
      async () => {
        const echt = await demping(carol.db).insert({ user_id: carol.id, group_id: groepA });
        const nep = await demping(carol.db).insert({
          user_id: carol.id,
          group_id: randomUUID(),
        });
        // De insert-policy eist lidmaatschap en weigert vóór het schrijven.
        expect(echt.error?.code).toBe('42501');
        expect(nep.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de rij volgt het lidmaatschap', () => {
    it(
      'verdwijnt als je de groep verlaat (de composite FK op group_members)',
      async () => {
        const weg = await bob.db.rpc('verlaat_groep', { p_group_id: groepC, p_bevestigd: true });
        expect((weg.data as { ok?: boolean } | null)?.ok, JSON.stringify(weg.data)).toBe(true);

        const { data } = await demping(adminDb())
          .select('group_id')
          .eq('user_id', bob.id)
          .eq('group_id', groepC);
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT,
    );
  });
});
