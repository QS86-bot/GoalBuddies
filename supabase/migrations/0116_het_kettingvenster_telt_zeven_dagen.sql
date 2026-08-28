-- 0116 — Het venster van De Ketting stond op acht dagen bij een periode van zeven
--
-- ROLLBACK-PAD:
--   Zet `current_date - 6` in beide op `current_date - 8` terug:
--     - de policy `chain_links_select` (laatste versie: 0079)
--     - de functie `group_overview()` (laatste versie: 0104)
--   Geen datamigratie, geen kolomwijziging, niets om terug te draaien in rijen.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- De Ketting mag leden laten zien wie er in de **lopende** periode al opgedaagd
-- is. Binnen die periode betekent een leeg vakje "nog niet", en dat is
-- onschuldig. Zodra de periode voorbij is betekent hetzelfde lege vakje
-- "gemist" — en dat is precies wat domeinregel 7 verbiedt. 0037 kwam dat
-- dichten en zette er een venster op.
--
-- ⚠️ **Dat venster is één dag te wijd, en 0037 rekent het in zijn eigen kop
--    verkeerd voor:** *"Een lopende periode is hoogstens zeven dagen oud, plus
--    één dag speling."* Een huddleperiode is exact zeven dagen en begint op de
--    huddledag, dus een lópende periode is hoogstens **zes** dagen oud. Zeven
--    dagen oud betekent: de vórige periode. Twee fouten van één dag op elkaar.
--
-- Gevolg: op de huddledag zelf én de dag erna stond de net afgesloten periode
-- open. Twee van elke zeven dagen, structureel, in een **beschermde** groep. Eén
-- verzoek naast `group_members` gelegd geeft dan met naam wie de afgelopen week
-- gemist heeft.
--
-- ---------------------------------------------------------------------------
-- Waarom geen enkele test dit ving
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevinding is twee keer als opgelost afgevinkt op het verkeerde
--    bewijs.** De rij van 16-08 in `docs/ENGINEER-REVIEW.md` is op 25-08 gesloten
--    met *"er staat een venster op `p_period_start`, dus het is geen vrije
--    parameter meer"*, en de rij van 19-08 met *"gedicht in 0037"*. Beide keren
--    is gemeten **dát** er een venster stond, nooit **hoe breed**.
--
-- De bestaande tests in `tests/rls/epic8.test.ts` leggen een schakel op "de oude
-- periode" — ver genoeg weg om buiten élk redelijk venster te vallen. De rand
-- zelf, precies zeven dagen, was onbeproefd. 0116 voegt hem toe.
--
-- ⚠️ **De grens blijft een vast getal, en dat blijft een aanname.**
--    `groups.season_cadence` kent al `monthly` en `quarterly`. Gaat een
--    niet-wekelijkse cadans ooit de huddleperiode sturen, dan is `- 6` net zo
--    fout als `- 8` nu. Staat als rij in `docs/ENGINEER-REVIEW.md`.
--
-- Zie docs/decisions/2026-08-28-het-kettingvenster.md.

-- ---------------------------------------------------------------------------
-- 1. De policy
-- ---------------------------------------------------------------------------

drop policy if exists chain_links_select on public.chain_links;

create policy chain_links_select on public.chain_links
  for select to authenticated
  using (
    user_id = auth.uid()
    -- ⚠️ Zes en niet zeven: een periode van zeven dagen die vandaag loopt, is
    --    hoogstens zes dagen oud. Zeven dagen oud is de vórige periode, en
    --    daar betekent een ontbrekende schakel "gemist".
    or (is_group_member(group_id) and group_period_start >= current_date - 6)
    or lid_van_open_groep(group_id)
  );

comment on policy chain_links_select on public.chain_links is
  'Je eigen schakels altijd; die van groepsgenoten alleen binnen de lopende '
  'periode (0116: zes dagen, want een periode duurt er zeven). In een open '
  'groep zonder venster — besluit A41.';

create or replace function public.group_overview(
  p_group_id uuid,
  p_period_start date,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  member_status text,
  joined_at timestamp with time zone,
  goal_id uuid,
  goal_title text,
  goal_target_date date,
  milestones_total bigint,
  milestones_done bigint,
  current_streak integer,
  best_streak integer,
  last_cycle_start date,
  closed_this_period boolean,
  total_members bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select
    m.user_id,
    p.display_name,
    p.avatar_url,
    m.role,
    m.status,
    m.joined_at,
    d.id,
    d.title,
    d.target_date,
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status <> 'dropped'
    ), 0),
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status = 'done'
    ), 0),
    s.current_streak,
    s.best_streak,
    s.last_cycle_start,
    -- ⚠️ `coalesce(..., false)` om de venstertoets heen: valt hij ooit op `null`
    --    uit, dan is dat een weigering en geen antwoord. Zonder die coalesce
    --    zou `not null` weer `null` geven en viel het geval door naar de `else`.
    case
      when not coalesce(
        p_period_start <= current_date + 1
        and (
          p_period_start >= current_date - 6
          or lid_van_open_groep(m.group_id)
        ),
        false
      ) then null
      else exists (
        select 1 from chain_links c
        where c.group_id = m.group_id
          and c.user_id = m.user_id
          and c.group_period_start = p_period_start
      )
    end,
    count(*) over ()
  from group_members m
  join profiles p on p.id = m.user_id
  left join lateral (
    select gg.id, gg.title, gg.target_date
    from goals gg
    join goal_group_links l on l.goal_id = gg.id
    where l.group_id = m.group_id
      and gg.owner_id = m.user_id
      and gg.status = 'active'
    order by gg.target_date asc
    limit 1
  ) d on true
  left join group_visible_streaks s
    on s.user_id = m.user_id and s.goal_id = d.id
  where m.group_id = p_group_id
  order by m.joined_at asc, m.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;
