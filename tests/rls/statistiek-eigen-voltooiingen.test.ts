/**
 * De statistiekpagina leest alleen jouw eigen voltooiingen — QS8-749.
 *
 * ⚠️ **RLS is de grens en het `user_id`-filter kiest de eigen rijen.** `completions_select` laat een
 *    groepsgenoot de rijen van een lid óók lezen (hij moet kunnen goedkeuren), dus de test hieronder die
 *    dat vastlegt is een gedocumenteerd feit en geen lek. Wat de statistiek zuiver houdt is dat de
 *    insert-policy `user_id = auth.uid()` eist, óók op een eigen weekdoel.
 *
 * ⚠️ De vraag is dezelfde als die de pagina stelt (`fetchEigenVoltooiingsmomenten`): drie kolommen,
 *    `user_id` gelijk aan de eigen sessie, nieuwste eerst.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time/cycle';
import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 240_000;

describe.skipIf(!rlsTestsConfigured)('QS8-749 — de statistiek leest alleen eigen voltooiingen', () => {
  let anna: TestUser;
  let bram: TestUser;
  let carla: TestUser;
  let weekdoelId: string;
  let doelId: string;

  const pagina = (wie: TestUser, van: string) =>
    wie.db
      .from('completions')
      .select('cycle_start_date,submitted_at,superseded_by')
      .eq('user_id', van)
      .order('submitted_at', { ascending: false })
      .range(0, 499);

  beforeAll(async () => {
    [anna, bram, carla] = await Promise.all([
      createTestUser('qs749-anna'),
      createTestUser('qs749-bram'),
      createTestUser('qs749-carla'),
    ]);

    const groep = await anna.db.rpc('create_group', { group_name: 'Statistiekproef' });
    const uit = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groep.error || uit.ok !== true || uit.group === undefined) {
      throw new Error(`groep: ${groep.error?.message ?? 'geen groep'}`);
    }
    const mee = await bram.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    if (mee.error) throw new Error(`lid worden: ${mee.error.message}`);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    const doel = await anna.db
      .from('goals')
      .insert({ owner_id: anna.id, title: 'Statistiekdoel', target_date: cyclus.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;
    const koppel = await anna.db.from('goal_group_links').insert({ goal_id: doel.data.id, group_id: uit.group.id });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    const week = await anna.db
      .from('weekly_goals')
      .insert({ goal_id: doel.data.id, title: 'Statistiekweek', cycle_start_date: cyclus.startDate })
      .select('id')
      .single();
    if (week.error || week.data === null) throw new Error(`weekdoel: ${week.error?.message}`);
    weekdoelId = week.data.id;

    const voltooiing = await anna.db.from('completions').insert({
      weekly_goal_id: weekdoelId,
      user_id: anna.id,
      achieved_level: 'ceiling',
      note: 'Statistiekproef',
      cycle_start_date: cyclus.startDate,
    });
    if (voltooiing.error) throw new Error(`voltooiing: ${voltooiing.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it('de eigenaar krijgt haar eigen momenten, met een door de server gezet tijdstip', async () => {
    const { data, error } = await pagina(anna, anna.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Number.isNaN(Date.parse(data?.[0]?.submitted_at ?? ''))).toBe(false);
  });

  it('wat de pagina van een groepsgenoot ophaalt (zijn eigen id) is leeg', async () => {
    const { data, error } = await pagina(bram, bram.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('een niet-lid krijgt met hetzelfde verzoek nul rijen en geen fout', async () => {
    const { data, error } = await pagina(carla, anna.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('GEDOCUMENTEERD FEIT: een groepsgenoot ziet haar rijen zonder het filter wel (daarom bestaat het filter)', async () => {
    const { data } = await pagina(bram, anna.id);
    expect(data).toHaveLength(1);
  });

  it('niemand kan zich onder andermans id indienen, ook niet op een eigen weekdoel', async () => {
    // ⚠️ Op Anna's weekdoel strandt dit al op de eigenaarstak; de grendel zelf (`user_id = auth.uid()`)
    //    toets je alleen met Brams eigen weekdoel en Anna's id.
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    const doel = await bram.db
      .from('goals')
      .insert({ owner_id: bram.id, title: 'Brams doel', target_date: cyclus.endDate })
      .select('id')
      .single();
    const week = await bram.db
      .from('weekly_goals')
      .insert({ goal_id: doel.data?.id ?? '', title: 'Brams week', cycle_start_date: cyclus.startDate })
      .select('id')
      .single();
    expect(week.error).toBeNull();
    const { error } = await bram.db.from('completions').insert({
      weekly_goal_id: week.data?.id ?? '',
      user_id: anna.id,
      achieved_level: 'ceiling',
      note: 'vervalst',
      cycle_start_date: cyclus.startDate,
    });
    expect(error?.code, JSON.stringify(error)).toBe('42501');
  });

  it('een client kan het indientijdstip niet zelf zetten (geen insert-recht op submitted_at)', async () => {
    // ⚠️ Een vers weekdoel zonder actieve voltooiing: op Annas eerste weekdoel weigert `completions_active_uniq`
    //    (23505) elke tweede indiening al, en dan zegt deze test niets over de kolomgrant.
    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());
    const week = await anna.db
      .from('weekly_goals')
      .insert({ goal_id: doelId, title: 'Tijdreizigersweek', cycle_start_date: cyclus.startDate })
      .select('id')
      .single();
    expect(week.error).toBeNull();
    const { error } = await anna.db.from('completions').insert({
      weekly_goal_id: week.data?.id ?? '',
      user_id: anna.id,
      achieved_level: 'ceiling',
      note: 'tijdreiziger',
      cycle_start_date: cyclus.startDate,
      submitted_at: '2020-01-01T00:00:00Z',
    });
    expect(error?.code, JSON.stringify(error)).toBe('42501');
  });
});
