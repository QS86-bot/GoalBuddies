import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groupPeriod, userCycle } from '../../src/shared/time';
import type { UserClock } from '../../src/shared/time';
import { adminDb, createTestUser, registreerGroep, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Teamdoelen en aandelen — QS8-654, criterium 1, 2, 3, 6(a, e) en 7.
 *
 * ⚠️ **Over het echte teampad**: organisatie, teamgroep via `maak_teamgroep()`,
 *    leden via de uitnodigingscode, een teamdoel via `maak_teamdoel()` en elk
 *    aandeel via `neem_aandeel()`. Aandeel, groepskoppeling, teamgroep en de
 *    trigger op goedkeuringen zijn elk apart correct; de belofte "een
 *    werkaandeel keurt alleen een teamgenoot goed" is een eigenschap van hun
 *    naad, en die wordt hier getoetst.
 *
 * ⚠️ **Met de hand gebroken vóór hij geloofd werd** (📏 17-11-2026, telkens één
 *    mutatie in de lokale database, daarna 0305 opnieuw afgespeeld):
 *
 *    1. Trigger `goal_group_links_aandeel_in_teamgroep` weg → alleen de twee
 *       toetsen van criterium 3 rood, plus "een vriend kan het werkaandeel dan
 *       niet goedkeuren", omdat de koppeling er dan ligt.
 *    2. De weigering voor een niet-eigenaar in `aandeel_blijft_in_teamgroep()`
 *       vervangen door zwijgen (`return new`, de vorm vóór de securityreview)
 *       → alleen "weigert ook een context zonder policy erachter" rood.
 *    2b. Dezelfde weigering met een eigen tekst in plaats van die van de policy
 *       → alleen "verraadt een vreemde niet dat het doel een aandeel is" rood.
 *    3. `new.user_id := v_eigenaar` uit `vul_aandeel()` → alleen "user_id volgt
 *       de eigenaar" rood.
 *    4. `team_goal_shares_select` op `true` → alleen "leest alleen zijn eigen
 *       aandeel" rood.
 *    5. De lidmaatschapstoets uit `maak_teamdoel()` → alleen "laat alleen een
 *       teamlid een teamdoel maken" rood.
 *    6. `created_by` in de kolomgrant → alleen "geeft de aanmaker niet prijs" rood.
 *    7. De CHECK `groups_team_beschermd_tot_qs8_661` weg → rood op "kan tot
 *       QS8-661 niet in een open teamgroep staan" hier, en op "(a) beheert het
 *       team" in `tests/rls/teamgroepen.test.ts`; verder niets.
 *
 *    De lock in `neem_aandeel()` (review L1) is niet met een mutatie getoetst:
 *    een race tussen twee sessies is met deze opstelling niet betrouwbaar na te
 *    spelen. Hij is beredeneerd uit de lockvolgorde.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;
const WOENSDAG = 3;

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string } | null;
}

async function rpc(wie: TestUser, naam: string, args: Record<string, unknown>): Promise<Antwoord> {
  const { data, error } = await wie.db.rpc(naam as never, args as never);
  return { data, error };
}

function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

function streefdatum(dagen: number): string {
  const d = new Date(Date.now() + dagen * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_class where relname = 'team_goal_shares'",
  import.meta.url,
);

const organisaties: string[] = [];
const groepen: string[] = [];

describe.runIf(rlsTestsConfigured)('teamdoelen en aandelen (QS8-654)', () => {
  let anna: TestUser; // organisatiebeheerder, geen lid van het team
  let bert: TestUser; // teamlid, week op maandag, Amsterdam; ook in de vriendengroep
  let cleo: TestUser; // teamlid, week op zondag, Amsterdam
  let dirk: TestUser; // teamlid, week op maandag, New York
  let nina: TestUser; // maakt de vriendengroep, in geen organisatie
  let zoe: TestUser; // in geen enkele organisatie

  const klok: Record<string, UserClock> = {};
  let team: string;
  let vrienden: string;
  let teamdoel: string;
  const aandeel: Record<string, string> = {};

  beforeAll(async () => {
    [anna, bert, cleo, dirk, nina, zoe] = await Promise.all([
      createTestUser('tdoel-anna'),
      createTestUser('tdoel-bert'),
      createTestUser('tdoel-cleo'),
      createTestUser('tdoel-dirk'),
      createTestUser('tdoel-nina'),
      createTestUser('tdoel-zoe'),
    ]);
    klok[bert.id] = { weekStartDay: 1, tz: 'Europe/Amsterdam' };
    klok[cleo.id] = { weekStartDay: 0, tz: 'Europe/Amsterdam' };
    klok[dirk.id] = { weekStartDay: 1, tz: 'America/New_York' };
    for (const wie of [bert, cleo, dirk]) {
      const k = klok[wie.id]!;
      const r = await adminDb()
        .from('profiles')
        .update({ week_start_day: k.weekStartDay, tz: k.tz } as never)
        .eq('id', wie.id);
      expect(r.error).toBeNull();
    }

    const org = await rpc(anna, 'maak_organisatie', { p_naam: 'Teamdoel BV' });
    expect(org.error).toBeNull();
    const x = (org.data as { organization_id: string }).organization_id;
    organisaties.push(x);
    const code = await rpc(anna, 'organisatie_uitnodigcode', { p_organization_id: x });
    for (const wie of [bert, cleo, dirk]) {
      expect(uitkomst(await rpc(wie, 'word_organisatielid', { p_code: (code.data as { code: string }).code }))).toBe(
        'ok',
      );
    }

    const t = await rpc(anna, 'maak_teamgroep', { p_organization_id: x, p_naam: 'Team Oost', p_huddledag: WOENSDAG });
    expect(uitkomst(t)).toBe('ok');
    team = (t.data as { group_id: string }).group_id;
    groepen.push(team);
    registreerGroep(team);
    const { data: g } = await adminDb().from('groups').select('invite_code').eq('id', team).single();
    for (const wie of [bert, cleo, dirk]) {
      expect(uitkomst(await rpc(wie, 'join_group_with_code', { code: (g as { invite_code: string }).invite_code }))).toBe(
        'ok',
      );
    }

    const v = await rpc(nina, 'create_group', { group_name: 'Vrienden van Bert' });
    expect(uitkomst(v)).toBe('ok');
    vrienden = (v.data as { group: { id: string; invite_code: string } }).group.id;
    groepen.push(vrienden);
    registreerGroep(vrienden);
    const vcode = (v.data as { group: { invite_code: string } }).group.invite_code;
    expect(uitkomst(await rpc(bert, 'join_group_with_code', { code: vcode }))).toBe('ok');

    const td = await rpc(bert, 'maak_teamdoel', {
      p_group_id: team,
      p_titel: 'Kwartaaldoel',
      p_streefdatum: streefdatum(90),
    });
    expect(uitkomst(td)).toBe('ok');
    teamdoel = (td.data as { team_goal_id: string }).team_goal_id;

    for (const wie of [bert, cleo, dirk]) {
      const a = await rpc(wie, 'neem_aandeel', { p_team_goal_id: teamdoel });
      expect(uitkomst(a)).toBe('ok');
      aandeel[wie.id] = (a.data as { goal_id: string }).goal_id;
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (groepen.length > 0) {
      await admin.from('team_goals' as never).delete().in('group_id' as never, groepen as never);
      await admin.from('group_join_requests').delete().in('group_id', groepen);
      await admin.from('group_members').delete().in('group_id', groepen);
      await admin.from('groups').delete().in('id', groepen);
    }
    if (organisaties.length > 0) {
      await admin.from('organization_members' as never).delete().in('organization_id' as never, organisaties as never);
      await admin.from('organizations' as never).delete().in('id' as never, organisaties as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een weekdoel en een voltooiing op een aandeel, door de eigenaar zelf. */
  async function voltooiing(wie: TestUser): Promise<string> {
    const cyclus = userCycle(klok[wie.id]!, new Date());
    const w = await wie.db
      .from('weekly_goals')
      .insert({ goal_id: aandeel[wie.id], title: 'Aandeelweek', cycle_start_date: cyclus.startDate } as never)
      .select('id')
      .single();
    expect(w.error).toBeNull();
    const c = await wie.db
      .from('completions')
      .insert({
        weekly_goal_id: (w.data as { id: string }).id,
        user_id: wie.id,
        achieved_level: 'ceiling',
        note: 'Aandeel gedaan',
        cycle_start_date: cyclus.startDate,
      } as never)
      .select('id')
      .single();
    expect(c.error).toBeNull();
    return (c.data as { id: string }).id;
  }

  function goedkeuring(completion: string, goedkeurder: string, eigenaar: string, groep: string): object {
    return { completion_id: completion, approver_id: goedkeurder, subject_id: eigenaar, group_id: groep, status: 'approved' };
  }

  describe('een teamdoel', () => {
    it('kan tot QS8-661 niet in een open teamgroep staan (securityreview H1)', async () => {
      const { data } = await adminDb().from('team_goals' as never).select('organization_id').eq('id' as never, teamdoel as never).single();
      const org = (data as unknown as { organization_id: string }).organization_id;
      expect(
        uitkomst(
          await rpc(anna, 'maak_teamgroep', { p_organization_id: org, p_naam: 'Open team', p_zichtbaarheid: 'open' }),
        ),
      ).toBe('fout 23514');
    }, TEST_TIMEOUT);

    it('laat alleen een teamlid een teamdoel maken', async () => {
      const args = { p_titel: 'Nog een', p_streefdatum: streefdatum(30) };
      expect(uitkomst(await rpc(cleo, 'maak_teamdoel', { ...args, p_group_id: team }))).toBe('ok');
      // Organisatiebeheerder zonder lidmaatschap, buitenstaander en een gewone
      // groep krijgen hetzelfde antwoord: geen orakel op "is dit een team".
      expect(uitkomst(await rpc(anna, 'maak_teamdoel', { ...args, p_group_id: team }))).toBe('niet_toegestaan');
      expect(uitkomst(await rpc(zoe, 'maak_teamdoel', { ...args, p_group_id: team }))).toBe('niet_toegestaan');
      expect(uitkomst(await rpc(nina, 'maak_teamdoel', { ...args, p_group_id: vrienden }))).toBe('niet_toegestaan');
      expect(uitkomst(await rpc(bert, 'maak_teamdoel', { ...args, p_group_id: team, p_streefdatum: streefdatum(-2) }))).toBe(
        'ongeldige_streefdatum',
      );
    }, TEST_TIMEOUT);

    it('is leesbaar voor teamleden en niet voor de organisatiebeheerder of een buitenstaander', async () => {
      const lees = async (wie: TestUser): Promise<number> => {
        const { data, error } = await wie.db.from('team_goals' as never).select('id').eq('id' as never, teamdoel as never);
        expect(error).toBeNull();
        return (data as unknown[]).length;
      };
      expect(await lees(cleo)).toBe(1);
      expect(await lees(anna)).toBe(0);
      expect(await lees(zoe)).toBe(0);
    }, TEST_TIMEOUT);

    it('geeft de aanmaker niet prijs', async () => {
      const { error } = await cleo.db.from('team_goals' as never).select('created_by').eq('id' as never, teamdoel as never);
      expect(error?.code).toBe('42501');
    }, TEST_TIMEOUT);

    it('hoort bij een teamgroep van dezelfde organisatie, ook voor service_role', async () => {
      const { data } = await adminDb().from('team_goals' as never).select('organization_id').eq('id' as never, teamdoel as never).single();
      const org = (data as unknown as { organization_id: string }).organization_id;
      const r = await adminDb()
        .from('team_goals' as never)
        .insert({ organization_id: org, group_id: vrienden, title: 'Fout', target_date: streefdatum(30) } as never);
      expect(r.error?.code).toBe('23514');
      const verhuis = await adminDb()
        .from('team_goals' as never)
        .update({ group_id: vrienden } as never)
        .eq('id' as never, teamdoel as never);
      expect(verhuis.error?.code).toBe('23514');
    }, TEST_TIMEOUT);
  });

  describe('een aandeel', () => {
    it('is een nieuw persoonlijk doel met de streefdatum van het teamdoel, gekoppeld aan de teamgroep', async () => {
      const { data: doel } = await adminDb().from('goals').select('owner_id, target_date').eq('id', aandeel[cleo.id]!).single();
      const { data: td } = await adminDb().from('team_goals' as never).select('target_date').eq('id' as never, teamdoel as never).single();
      expect((doel as { owner_id: string }).owner_id).toBe(cleo.id);
      expect((doel as { target_date: string }).target_date).toBe((td as unknown as { target_date: string }).target_date);
      const { data: links } = await adminDb().from('goal_group_links').select('group_id').eq('goal_id', aandeel[cleo.id]!);
      expect((links as { group_id: string }[]).map((l) => l.group_id)).toEqual([team]);
    }, TEST_TIMEOUT);

    it('kan maar één keer per persoon, en niet door wie geen teamlid is', async () => {
      expect(uitkomst(await rpc(cleo, 'neem_aandeel', { p_team_goal_id: teamdoel }))).toBe('al_aandeel');
      expect(uitkomst(await rpc(anna, 'neem_aandeel', { p_team_goal_id: teamdoel }))).toBe('niet_toegestaan');
      expect(uitkomst(await rpc(zoe, 'neem_aandeel', { p_team_goal_id: teamdoel }))).toBe('niet_toegestaan');
    }, TEST_TIMEOUT);

    it('leest alleen zijn eigen aandeel', async () => {
      const { data, error } = await cleo.db.from('team_goal_shares' as never).select('goal_id, user_id');
      expect(error).toBeNull();
      expect(data).toEqual([{ goal_id: aandeel[cleo.id], user_id: cleo.id }]);
    }, TEST_TIMEOUT);

    it('user_id volgt de eigenaar van het doel, ook als service_role iets anders opgeeft', async () => {
      const { data } = await adminDb()
        .from('goals')
        .insert({ owner_id: bert.id, title: 'Los doel', target_date: streefdatum(60) })
        .select('id')
        .single();
      const tweede = await rpc(dirk, 'maak_teamdoel', { p_group_id: team, p_titel: 'Tweede', p_streefdatum: streefdatum(60) });
      const tweedeId = (tweede.data as { team_goal_id: string }).team_goal_id;
      const r = await adminDb()
        .from('team_goal_shares' as never)
        .insert({ goal_id: (data as { id: string }).id, team_goal_id: tweedeId, user_id: cleo.id } as never)
        .select('user_id')
        .single();
      expect(r.error).toBeNull();
      expect((r.data as unknown as { user_id: string }).user_id).toBe(bert.id);
    }, TEST_TIMEOUT);
  });

  describe('criterium 3: een aandeel hangt aan geen vriendengroep', () => {
    it('weigert de koppeling van de eigenaar zelf', async () => {
      const r = await bert.db.from('goal_group_links').insert({ goal_id: aandeel[bert.id], group_id: vrienden } as never);
      expect(r.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('weigert hem ook voor service_role', async () => {
      const r = await adminDb().from('goal_group_links').insert({ goal_id: aandeel[bert.id]!, group_id: vrienden });
      expect(r.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('verraadt een vreemde niet dat het doel een aandeel is', async () => {
      // Nina is geen eigenaar. Voor een aandeel en voor een gewoon doel van Bert
      // krijgt ze hetzelfde antwoord, woord voor woord: de grendel spreekt met
      // de stem van de policy.
      const { data: los } = await bert.db
        .from('goals')
        .insert({ owner_id: bert.id, title: 'Gewoon doel', target_date: streefdatum(60) } as never)
        .select('id')
        .single();
      const opAandeel = await nina.db.from('goal_group_links').insert({ goal_id: aandeel[bert.id], group_id: vrienden } as never);
      const opGewoon = await nina.db
        .from('goal_group_links')
        .insert({ goal_id: (los as { id: string }).id, group_id: vrienden } as never);
      expect(opAandeel.error?.code).toBe('42501');
      expect(opAandeel.error).toEqual(opGewoon.error);
    }, TEST_TIMEOUT);

    it.runIf(beschikbaar)('weigert ook een context zonder policy erachter die namens een ander koppelt', () => {
      // Securityreview M1: als `postgres` met de `sub` van Nina, zoals een
      // definer-functie die namens een ander zou koppelen. Zwijgen zou hier de
      // tweede koppeling doorlaten.
      const uit = psqlMetInvoer(`
        begin;
        select set_config('request.jwt.claims', '{"sub":"${nina.id}"}', true);
        do $$ begin
          insert into public.goal_group_links (goal_id, group_id) values ('${aandeel[bert.id]}', '${vrienden}');
          perform set_config('ijk.uitkomst', 'doorgelaten', true);
        exception when others then
          perform set_config('ijk.uitkomst', sqlstate, true);
        end $$;
        select 'UITKOMST|' || current_setting('ijk.uitkomst');
        rollback;`);
      expect(uit.split('\n').find((r) => r.startsWith('UITKOMST|'))).toBe('UITKOMST|42501');
    }, TEST_TIMEOUT);

    it('een vriend kan het werkaandeel dan niet goedkeuren', async () => {
      const c = await voltooiing(bert);
      const r = await nina.db.from('completion_approvals').insert(goedkeuring(c, nina.id, bert.id, vrienden) as never);
      expect(r.error).not.toBeNull();
      const s = await adminDb().from('completion_approvals').insert(goedkeuring(c, nina.id, bert.id, vrienden) as never);
      expect(s.error?.code).toBe('23514');
    }, TEST_TIMEOUT);
  });

  describe('criterium 1 en 2: wie een aandeel mag goedkeuren', () => {
    let c: string;
    beforeAll(async () => {
      c = await voltooiing(cleo);
    }, SETUP_TIMEOUT);

    it('nooit de eigenaar zelf, via de policy en via service_role', async () => {
      const r = await cleo.db.from('completion_approvals').insert(goedkeuring(c, cleo.id, cleo.id, team) as never);
      expect(r.error).not.toBeNull();
      const s = await adminDb().from('completion_approvals').insert(goedkeuring(c, cleo.id, cleo.id, team) as never);
      expect(s.error).not.toBeNull();
    }, TEST_TIMEOUT);

    it('nooit een organisatiebeheerder die geen lid van het team is', async () => {
      const r = await anna.db.from('completion_approvals').insert(goedkeuring(c, anna.id, cleo.id, team) as never);
      expect(r.error).not.toBeNull();
      const s = await adminDb().from('completion_approvals').insert(goedkeuring(c, anna.id, cleo.id, team) as never);
      expect(s.error?.code).toBe('23514');
    }, TEST_TIMEOUT);

    it('wel een teamgenoot — de controlemeting', async () => {
      const r = await dirk.db.from('completion_approvals').insert(goedkeuring(c, dirk.id, cleo.id, team) as never);
      expect(r.error).toBeNull();
    }, TEST_TIMEOUT);
  });

  describe('criterium 6(a): een gemist aandeel lekt niet via de weekdoelen', () => {
    it('een teamgenoot ziet het gemiste weekdoel niet, de eigenaar wel', async () => {
      const vorige = userCycle(klok[dirk.id]!, new Date(Date.now() - 7 * 86_400_000));
      const w = await adminDb()
        .from('weekly_goals')
        .insert({
          goal_id: aandeel[dirk.id]!,
          title: 'Gemiste aandeelweek',
          points_ceiling: 2,
          points_floor: 1,
          points_miss: -1,
          cycle_start_date: vorige.startDate,
          status: 'missed',
        })
        .select('id')
        .single();
      expect(w.error).toBeNull();
      const id = (w.data as { id: string }).id;
      const lees = async (wie: TestUser): Promise<number> => {
        const { data, error } = await wie.db.from('weekly_goals').select('id').eq('id', id);
        expect(error).toBeNull();
        return (data as unknown[]).length;
      };
      expect(await lees(dirk)).toBe(1);
      expect(await lees(bert)).toBe(0);
      expect(await lees(cleo)).toBe(0);
      expect(await lees(anna)).toBe(0);
    }, TEST_TIMEOUT);
  });

  describe('criterium 7: een aandeel volgt de klok van zijn eigenaar, niet die van de groep', () => {
    it.each([
      ['bert, maandag in Amsterdam', () => bert],
      ['cleo, zondag in Amsterdam', () => cleo],
      ['dirk, maandag in New York', () => dirk],
    ])('%s: eigen cyclusstart mag, de huddledag van de groep niet', async (_naam, wie) => {
      const lid = wie();
      const nu = new Date();
      const eigen = userCycle(klok[lid.id]!, nu);
      const groep = groupPeriod({ huddleDay: WOENSDAG, tz: 'Europe/Amsterdam' }, nu);
      expect(eigen.startDate).not.toBe(groep.startDate);

      const fout = await lid.db
        .from('weekly_goals')
        .insert({ goal_id: aandeel[lid.id], title: 'Groepsweek', cycle_start_date: groep.startDate } as never);
      expect(fout.error?.code).toBe('23514');
      const goed = await lid.db
        .from('weekly_goals')
        .insert({ goal_id: aandeel[lid.id], title: 'Eigen week', cycle_start_date: eigen.startDate } as never);
      expect(goed.error).toBeNull();
    }, TEST_TIMEOUT);
  });
});


const VIEWS = `
select 'view|' || schemaname || '.' || viewname
  from pg_views
 where schemaname = 'public'
   and definition ~ '\\m(team_goals|team_goal_shares)\\M';
`;

function views(mutatie = ''): string[] {
  return psqlMetInvoer(`begin;\n${mutatie}\n${VIEWS}\nrollback;\n`)
    .split('\n')
    .filter((r) => r.startsWith('view|'));
}

describe.runIf(beschikbaar)('criterium 6(e): geen view over de teamtabellen (QS8-654)', () => {
  it('vandaag: er is er geen', () => {
    expect(views()).toEqual([]);
  });

  it('ijking: een view met select * over de aandelen wordt gemeld', () => {
    expect(views('create view public.ijk_aandelen as select * from public.team_goal_shares;')).toEqual([
      'view|public.ijk_aandelen',
    ]);
  });
});
