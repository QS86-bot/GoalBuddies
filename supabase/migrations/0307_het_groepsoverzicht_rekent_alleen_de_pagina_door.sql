-- 0307_het_groepsoverzicht_rekent_alleen_de_pagina_door.sql — `group_overview()`
-- kiest eerst de pagina leden en rekent dan alleen voor die leden (QS8-699).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0306 (de teamketen); het lichaam hieronder
--    is dat van 0303 (QS8-661), met de aandeel-uitsluiting. De batchsessie
--    hernummert bij het landen.
--
-- ROLLBACK-PAD (alleen een functielichaam; geen gegevens):
--   `group_overview()` terugzetten uit 0303 (sectie 6): het lichaam hieronder
--   zonder de CTE's `alle` en `pagina`, met `total_members` uit `leden`.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 QS8-665, `docs/decisions/2026-11-18-het-plafond-van-een-teamgroep-gemeten.md`:
-- bij 12, 25 en 50 leden (met 5000 profielen buiten de groep) kostte één pagina
-- van 20 leden 35, 112 en 313 ms databasetijd. Het plan liet zien waarom: de
-- gematerialiseerde CTE `leden` draaide de doelen, mijlpalen en reeksen per lid
-- (`loops=25` bij 25 leden) vóór de `limit`.
--
-- 📏 Nameting (zie `docs/decisions/2026-11-18-het-groepsoverzicht-rekent-alleen-de-pagina-door.md`),
-- nu mét `analyze` op de gevulde tabellen: het oude lichaam 28–43, 52–70, 109–155
-- en 346 ms bij 12, 25, 50 en 100 leden; dit lichaam 28–48, 44–72, 52–60 en 65.
-- De kwadratische vorm uit QS8-665 kwam uit ontbrekende statistieken; de lineaire
-- groei van het oude lichaam is echt, en die is hier weg.
--
-- Wat er níet verandert: de kolommen, de volgorde (`joined_at`, `user_id`), de
-- cursor, `total_members`, en wie er meetelt. De laatste `where`/`order by`/`limit`
-- staan er nog; op de al gekozen pagina zijn ze een no-op, en ze houden de vorm
-- gelijk aan die van 0303 voor wie de twee naast elkaar legt.
--
-- ---------------------------------------------------------------------------

create or replace function public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_na_joined_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_na_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ⚠️ **QS8-699: eerst de pagina, dan het rekenwerk.** Tot 0307 rekende de CTE
  --    `leden` doelen, mijlpalen, reeksen en afsluitingen voor élk lid door en
  --    pagineerde pas daarna. 📏 Gemeten in QS8-665: 35, 112 en 313 ms bij 12,
  --    25 en 50 leden, voor een pagina van 20. Nu kiest `pagina` eerst de leden
  --    van deze pagina (zelfde volgorde, zelfde cursor), en rekent `leden` alleen
  --    voor hen. `alle` blijft de bron van `total_members`, met dezelfde inner
  --    join op `profiles` als ervoor: die bepaalt wie er meetelt (zie hieronder).
  with alle as materialized (
    select m.user_id, m.joined_at
      from group_members m
      join profiles p on p.id = m.user_id
     where m.group_id = p_group_id
       and m.status <> 'inactive'
  ),
  pagina as materialized (
    select a.user_id
      from alle a
     where p_na_joined_at is null
        or p_na_user_id is null
        or (a.joined_at, a.user_id) > (p_na_joined_at, p_na_user_id)
     order by a.joined_at asc, a.user_id asc
     limit greatest(0, least(coalesce(p_limit, 20), 50))
  ),
  leden as materialized (
    select
      m.user_id                                          as user_id,
      p.display_name                                     as display_name,
      p.avatar_url                                       as avatar_url,
      m.role                                             as role,
      m.status                                           as member_status,
      m.joined_at                                        as joined_at,
      d.id                                               as goal_id,
      d.title                                            as goal_title,
      d.target_date                                      as goal_target_date,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status <> 'dropped'
      ), 0)                                              as milestones_total,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status = 'done'
      ), 0)                                              as milestones_done,
      s.current_streak                                   as current_streak,
      s.best_streak                                      as best_streak,
      s.last_cycle_start                                 as last_cycle_start,
      -- ⚠️ `coalesce(..., false)` om de venstertoets heen: valt hij ooit op `null`
      --    uit, dan is dat een weigering en geen antwoord. Zonder die coalesce
      --    zou `not null` weer `null` geven en viel het geval door naar de `else`.
      case
        when not coalesce(
          p_period_start <= groepsdatum(m.group_id) + 1
          and (
            p_period_start >= groepsdatum(m.group_id) - 6
            or lid_van_open_groep(m.group_id)
          )
          -- ⚠️ **Derde eis, nieuw in 0208 (QS8-360): binnen de lopende
          --    periode moet de gevraagde datum een échte periodestart zijn.**
          --    Verzet een beheerder de huddledag, dan is de oude start dat niet
          --    meer, en gaf deze functie daar `false` terug — "niet afgesloten",
          --    voor een week die niemand nog kán afsluiten. Dat is een gemiste
          --    week van iemand anders, zichtbaar voor de groep, veroorzaakt door
          --    een derde (domeinregel 7). 📏 Gemeten: `f/f` onder de oude start,
          --    permanent, en in een open groep zonder de datumgrens erboven.
          --
          -- ⚠️ `null` en niet `false`: dat is hier al de vorm voor "hier geef ik
          --    geen antwoord op", en het onderscheid dat de vensters erboven ook
          --    maken.
          --
          -- ⚠️⚠️ **Alleen binnen de band `groepsdatum - 6 .. + 1`, en die grens
          --    is geen voorzichtigheid maar een naad.** `chain_links_select` en
          --    deze berekening dragen hetzelfde venster op twee plekken, en
          --    `tests/rls/epic13.test.ts` toetst juist hun gelijkheid: in een
          --    **open** groep is een oudere periode leesbaar in de tabel, dus
          --    moet het overzicht daar ook antwoord geven. 📏 Zonder deze
          --    uitzondering ging die naadtest om — het overzicht zweeg over een
          --    historische periode die de tabel wél toonde.
          --
          --    Dat is bovendien de goede grens inhoudelijk: buiten de band is
          --    `false` de geschiedenis zoals hij is opgeschreven, en in een open
          --    groep mág die zichtbaar zijn (A41). Het geval dat dit issue
          --    beschrijft zit per definitie ín de band — het gaat over de week
          --    die nu loopt.
          and (
            p_period_start < groepsdatum(m.group_id) - 6
            or extract(dow from p_period_start)::smallint = (
                 select g.huddle_day from groups g where g.id = m.group_id
               )
          ),
          false
        ) then null
        else exists (
          select 1 from chain_links c
          where c.group_id = m.group_id
            and c.user_id = m.user_id
            and c.group_period_start = p_period_start
        )
      end                                                as closed_this_period
    from group_members m
    join profiles p on p.id = m.user_id
    left join lateral (
      -- ⚠️ QS8-699: vanuit de doelen van dit lid, en de koppeling per doel op
      --    sleutel. Een join op `goal_group_links` met `l.group_id = …` liet
      --    Postgres per lid álle koppelingen van de groep langslopen (📏
      --    `rows=38 loops=75` bij 25 leden), en dat maakte het geheel kwadratisch.
      select gg.id, gg.title, gg.target_date
      from goals gg
      where gg.owner_id = m.user_id
        and gg.status = 'active'
        and exists (select 1 from goal_group_links l
                     where l.goal_id = gg.id and l.group_id = m.group_id)
        -- QS8-661 (review M2): een aandeel staat niet in het groepsoverzicht van
        -- een ander, ook niet in het goedkeurvenster.
        and not public.is_aandeel_van_een_ander(gg.id)
      order by gg.target_date asc
      limit 1
    ) d on true
    left join zichtbare_reeksen_van_groep(p_group_id) s
      on s.user_id = m.user_id and s.goal_id = d.id
    where m.group_id = p_group_id
      -- ⚠️ **Deze regel stond hier niet, en sinds 0160 is dat zichtbaar.** Zie
      --    de kop: de inner join op `profiles` besliste het antwoord, en die
      --    loopt langs `profiles_select`.
      and m.status <> 'inactive'
      and m.user_id in (select pg.user_id from pagina pg)
  )
  select
    q.user_id,
    q.display_name,
    q.avatar_url,
    q.role,
    q.member_status,
    q.joined_at,
    q.goal_id,
    q.goal_title,
    q.goal_target_date,
    q.milestones_total,
    q.milestones_done,
    q.current_streak,
    q.best_streak,
    q.last_cycle_start,
    q.closed_this_period,
    (select count(*) from alle) as total_members
  from leden q
  where
    -- ⚠️ **De cursor moet compleet zijn of hij telt niet.** Eén van de twee NULL
    --    betekent "geen cursor" en dus de eerste pagina, net als in 0121 en 0125.
    --    Een half ingevulde cursor stil als grens gebruiken levert `(x, null)` op,
    --    en dat is in SQL geen vergelijking maar NULL: de hele pagina valt dan weg
    --    zonder foutmelding.
    p_na_joined_at is null
    or p_na_user_id is null
    or (q.joined_at, q.user_id) > (p_na_joined_at, p_na_user_id)
  order by q.joined_at asc, q.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$function$;
