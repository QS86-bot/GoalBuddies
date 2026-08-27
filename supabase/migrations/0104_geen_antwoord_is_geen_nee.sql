-- 0104_geen_antwoord_is_geen_nee.sql — group_overview() krijgt een derde stand
--
-- ROLLBACK-PAD:
--   Zet in group_overview() de `case`-expressie voor `closed_this_period` terug
--   naar de kale booleaanse and-keten:
--     (   p_period_start <= current_date + 1
--     and (p_period_start >= current_date - 8 or lid_van_open_groep(m.group_id))
--     and exists (select 1 from chain_links c where ...) )
--   Daarna in src/modules/buddies/api.ts `?? false` terugzetten en het type op
--   `boolean`.
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`closed_this_period = false` betekende twee dingen.** "Dit lid heeft deze
--    periode nog niets afgerond" én "je vraagt naar een periode buiten het
--    venster en daar krijg je geen antwoord op". Eén `and`-keten, twee vragen,
--    één uitkomst.
--
-- ⚠️ **Vandaag maakt dat niets uit, en dat is precies de vorm van regel 18.**
--    `fetchGroepsoverzicht()` heeft één aanroeper en die geeft de lopende periode
--    door. Maar de parameter ís er — `p_period_start` staat gewoon in de
--    signatuur — dus de dag dat er een periodekiezer, een terugblik of een
--    seizoensrecap bij komt, rendert het groepsscherm in een beschermde groep de
--    hele lijst zónder vinkje. Dat leest als "iedereen heeft die week gemist"
--    terwijl de database juist weigerde iets te zeggen.
--
--    Twee correcte onderdelen en een liegend geheel: de bescherming ís een
--    `false`, en de weergave leest `false` als een oordeel.
--
-- ⚠️ **De regel stond al opgeschreven, één functie verderop.** Bij `best_streak`
--    in `src/modules/buddies/api.ts` staat: *"Geen `?? 0` op deze twee. Dat zou
--    van 'niet voor jou' een `0` maken, en dan toont een beschermde groep 'beste
--    reeks: 0' — een getal dat een bewering doet waar de database er geen deed."*
--    Twee regels lager stond `closed_this_period: rij.closed_this_period ?? false`.
--
-- ---------------------------------------------------------------------------
-- Wat er verandert, en wat met opzet niet
-- ---------------------------------------------------------------------------
--
--   * `null`  — geen antwoord: de gevraagde periode valt buiten het venster.
--   * `false` — deze periode nog niets afgerond.
--   * `true`  — afgerond.
--
-- ⚠️ **`null` lekt niets, en dat is nagerekend en niet aangenomen.** De
--    venstertoets hangt aan `p_period_start` (een parameter) en aan
--    `lid_van_open_groep(m.group_id)` (de groep). Geen van beide hangt aan het
--    lid, dus de `null` geldt voor de héle uitslag tegelijk. Hij zegt "hier
--    antwoord ik niet op", en dat is geen mededeling over een persoon —
--    domeinregel 7 blijft onaangeroerd.
--
-- ⚠️ **Het scherm verandert niet, want er is nog geen periodekiezer.** Dat is
--    bewust: de UI voor een terugblik hoort bij de feature die hem nodig heeft.
--    Wat deze migratie doet is de derde stand *representeerbaar* maken; het type
--    wordt `boolean | null` en TypeScript dwingt de volgende schrijver om hem te
--    behandelen. Zo is het geen landmijn meer maar een compilerfout.
--
-- ⚠️ `closed_this_period` stond al als `boolean` in de RETURNS TABLE en die is
--    nullable — er verandert dus niets aan de signatuur, alleen aan de waarde.
--
-- ---------------------------------------------------------------------------

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
          p_period_start >= current_date - 8
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
