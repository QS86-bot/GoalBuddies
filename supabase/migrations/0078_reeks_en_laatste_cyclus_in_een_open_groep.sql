-- 0078_reeks_en_laatste_cyclus_in_een_open_groep.sql — QS8-133 en QS8-134
--
-- ROLLBACK-PAD:
--   drop function if exists group_overview(uuid, date, integer, integer);
--   -- group_overview() terug uit de veertienkoloms-versie (0037), en
--   -- group_visible_streaks terug naar drie kolommen:
--   --   create or replace view group_visible_streaks
--   --     with (security_invoker = false, security_barrier = true) as
--   --     select s.user_id, s.goal_id, s.current_streak
--   --     from user_streaks s
--   --     join goals g on g.id = s.goal_id and g.owner_id = s.user_id
--   --     where shares_group_with_goal(g.id);
--   -- ⚠️ In die volgorde: de functie leunt op de view, dus de view kan pas
--   --    terug als de functie weg is.
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Geen tabelwijziging; op 24-08-2026
-- stonden er 0 rijen in `user_streaks` en `groups`.
--
-- ---------------------------------------------------------------------------
-- Oppervlak 1 en 2, en waarom ze in één migratie zitten
-- ---------------------------------------------------------------------------
--
-- Beslisdocument 002 telt ze als twee oppervlakken, en QS8-132 heeft er twee
-- issues van gemaakt. Bij het bouwen bleek het één probleem te zijn:
--
--   * Oppervlak 2 is `group_visible_streaks` — een view met
--     `security_invoker = false`, waarvan de **kolomlijst** de bescherming is.
--     `best_streak > current_streak` is sluitend bewijs van een verbroken reeks,
--     dus die kolom is er in 0019 uitgehaald.
--   * Oppervlak 1 is `group_overview()`, en de enige gevaarlijke kolom die daar
--     nog bij zou kunnen komen is `last_cycle_start` — die staat óók op
--     `user_streaks`, en de functie leest die tabel niet zelf: hij leest de view.
--
-- Twee migraties zouden dus twee keer dezelfde view herschrijven, en de tweede
-- zou de kolommen van de eerste moeten overtypen. Dat is precies de val van
-- 0075: `create or replace` herschrijft het geheel, en wat er tussendoor bij is
-- gekomen verdwijnt geruisloos mee.
--
-- ⚠️ **Wat hier níét bij zit.** `closed_this_period` staat óók in
--    `group_overview()` en heeft óók een venster (±8 dagen, migratie 0037). Dat
--    venster hoort bij De Ketting en gaat mee met oppervlak 13 — QS8-135 — want
--    daar zit de policy op `chain_links` die precies hetzelfde beschermt. Eén
--    beslissing hoort in één migratie, en dit is die van de reeks.
--
-- ⚠️ **`total_points` staat ook op `user_streaks` en blijft eruit.** Besluit A42,
--    24-08-2026: punten blijven privé, óók in een open groep. Wie het totaal
--    deelt, deelt het missen via een omweg. De view heeft die kolom nooit gehad
--    en krijgt hem hier ook niet.
--
-- ---------------------------------------------------------------------------
-- Waarom een `case`-expressie en geen tweede view
-- ---------------------------------------------------------------------------
--
-- QS8-134 noemde drie vormen. Gekozen: één view met een conditionele kolom.
--
--   1. **Een tweede view** voor open groepen zou twee grants, twee definities en
--      twee plekken opleveren die gelijk moeten blijven — en `group_overview()`
--      zou dan zelf moeten kiezen welke hij leest. Dat is een tak in een functie
--      die de bescherming bepaalt, en die tak is precies wat je niet wilt.
--   2. **Een functie in plaats van een view** verliest de eigenschap waar 0019 om
--      draaide: een kolom die er niet is, kan niet lekken. Een functie mét de
--      kolom in zijn returntype lekt zodra iemand de `case` verkeerd schrijft.
--   3. **Een `case`-expressie** houdt de kolomlijst één plek en laat de
--      zichtbaarheid van de rij los van de zichtbaarheid van de kolom staan.
--
-- ⚠️ **Het bezwaar uit QS8-134 klopt en het valt hier de goede kant op.** Buiten
--    een open groep is de kolom `null`, en `null` is niet te onderscheiden van
--    "geen waarde". Voor `best_streak` bestaat dat geval niet — de kolom is
--    `not null default 0` — dus `null` betekent daar ondubbelzinnig "niet voor
--    jou". Voor `last_cycle_start` bestaat het wél (niemand heeft nog een cyclus
--    afgerond), en dan is de dubbelzinnigheid juist de bescherming: de kijker
--    leert niets uit een `null` die twee dingen kan betekenen. De eigenaar en de
--    open-groepsgenoot krijgen altijd de echte waarde, dus voor wie hem mág zien
--    is er geen dubbelzinnigheid.
--
-- ⚠️ **De eigenaar staat expliciet in de `case`.** Zonder die tak zou iemand die
--    zijn eigen doel aan een beschermde groep koppelt, zijn éígen beste reeks
--    kwijtraken zodra een scherm hem via deze view leest. Dat is dezelfde fout
--    als in 0050, waar een kolomgrant de eigenaar zijn eigen risicostand zou
--    hebben afgenomen — daar werd het een eigen tabel, hier volstaat één `or`.

begin;

-- ---------------------------------------------------------------------------
-- 1. De view
-- ---------------------------------------------------------------------------
--
-- ⚠️ `security_invoker = false` en `security_barrier = true` blijven staan. Het
--    eerste is de reden dat deze view bestaat (hij leest `user_streaks`, waar de
--    kijker geen recht op heeft); het tweede houdt een `where`-clausule van de
--    aanroeper achter de filter van de view. Ze staan hier opnieuw omdat
--    `create or replace view` de opties niet erft van wat er stond.

create or replace view group_visible_streaks
  with (security_invoker = false, security_barrier = true) as
  select
    s.user_id,
    s.goal_id,
    s.current_streak,
    case
      when g.owner_id = auth.uid() or deelt_open_groep_met_doel(g.id)
      then s.best_streak
    end as best_streak,
    case
      when g.owner_id = auth.uid() or deelt_open_groep_met_doel(g.id)
      then s.last_cycle_start
    end as last_cycle_start
  from user_streaks s
  join goals g on g.id = s.goal_id and g.owner_id = s.user_id
  where shares_group_with_goal(g.id);

comment on view public.group_visible_streaks is
  'De reeks van een groepsgenoot. `current_streak` voor elk lid (besluit A15); '
  '`best_streak` en `last_cycle_start` alleen voor de eigenaar zelf en voor een '
  'lid van een ópen groep (besluit A41, QS8-132) — buiten die twee zijn ze NULL, '
  'want best > current is sluitend bewijs van een verbroken reeks. '
  '`total_points` staat er bewust niet in en komt er ook niet in (A42).';

-- ---------------------------------------------------------------------------
-- 2. Het groepsoverzicht geeft ze door
-- ---------------------------------------------------------------------------
--
-- ⚠️ `drop` en dan `create`: het returntype verandert, en `create or replace`
--    weigert dat.
--
-- ⚠️ **Het lichaam komt uit `pg_get_functiondef()`** en niet uit de migratie waar
--    deze functie voor het eerst stond. Dat is de les van 0075: er zitten hier
--    wijzigingen in van 0019, 0029 en 0037 die je bij het overtypen uit een oude
--    migratie geruisloos zou weggooien.
--
-- ⚠️ De functie blijft SECURITY INVOKER. De bescherming zit in de view, en die
--    is `security_invoker = false` — daar hoort ze ook: één plek die beslist wie
--    welke kolom ziet, niet twee.

drop function if exists public.group_overview(uuid, date, integer, integer);

create function public.group_overview(
  p_group_id     uuid,
  p_period_start date,
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  user_id            uuid,
  display_name       text,
  avatar_url         text,
  role               text,
  member_status      text,
  joined_at          timestamptz,
  goal_id            uuid,
  goal_title         text,
  goal_target_date   date,
  milestones_total   bigint,
  milestones_done    bigint,
  current_streak     integer,
  best_streak        integer,
  last_cycle_start   date,
  closed_this_period boolean,
  total_members      bigint
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
    (
      p_period_start >= current_date - 8
      and p_period_start <= current_date + 1
      and exists (
        select 1 from chain_links c
        where c.group_id = m.group_id
          and c.user_id = m.user_id
          and c.group_period_start = p_period_start
      )
    ),
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

comment on function public.group_overview(uuid, date, integer, integer) is
  'Het groepsoverzicht met paginering (5.4). Geeft geen puntentotaal en geen '
  'weekstatus. `best_streak` en `last_cycle_start` komen uit '
  'group_visible_streaks en zijn daar NULL buiten een open groep — besluit A41. '
  '`closed_this_period` houdt zijn venster van acht dagen; dat hoort bij De '
  'Ketting en gaat mee met QS8-135.';

revoke all on function public.group_overview(uuid, date, integer, integer) from public, anon;
grant execute on function public.group_overview(uuid, date, integer, integer) to authenticated;

commit;
