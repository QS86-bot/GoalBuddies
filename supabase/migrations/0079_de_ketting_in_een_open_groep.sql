-- 0079_de_ketting_in_een_open_groep.sql — QS8-135, het laatste oppervlak
--
-- ROLLBACK-PAD:
--   drop policy if exists chain_links_select on chain_links;
--   create policy chain_links_select on chain_links for select to authenticated
--     using (
--       user_id = auth.uid()
--       or (is_group_member(group_id) and group_period_start >= current_date - 8)
--     );
--   -- group_overview() terug uit migratie 0078 (met het venster onvoorwaardelijk),
--   -- en daarna:
--   drop function if exists lid_van_open_groep(uuid);
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Geen tabelwijziging; op 24-08-2026
-- stonden er 0 rijen in `chain_links` en `groups`.
--
-- ---------------------------------------------------------------------------
-- Oppervlak 13, en waarom dit het zwaarste is
-- ---------------------------------------------------------------------------
--
-- Migratie 0036 bouwde De Ketting en lekte diezelfde dag: `chain_links_select`
-- gaf elk lid élke rij, met `user_id` en `group_period_start`. Eén
-- `GET /rest/v1/chain_links?group_id=eq.X&select=user_id,group_period_start` is
-- dan de volledige aanwezigheidsmatrix per persoon per week — en voor een
-- **afgesloten** periode betekent een ontbrekende rij niet "nog niet" maar "die
-- week niets gedaan". 0037 dichtte dat met een venster van acht dagen: je eigen
-- geschiedenis blijft van jou, van een ander zie je alleen de lopende periode.
--
-- In een **open** groep mag dat venster vervallen. Dat is letterlijk wat besluit
-- A41 betekent, en het is tegelijk de plek waar een fout in de policy het meeste
-- kost: hier gaat het niet om één kolom van één rij maar om een matrix.
--
-- ⚠️ **`ketting_stand()` blijft ongemoeid en dat is met opzet.** Die geeft
--    aantallen zonder namen, voor elk lid hetzelfde getal (0036/0037). Daar valt
--    niets te openen — hij bevat geen persoonsgegeven, ook niet in een open
--    groep. Zou hij hier meeveranderen, dan was dat een verruiming die niemand
--    gevraagd heeft.
--
-- ⚠️ **De mijlpaalaankondiging blijft ook ongemoeid.** `chain_milestone` is een
--    rond cumulatief aantal schakels van de groep, monotoon en zonder naam
--    (0070). Dat is in beide standen hetzelfde bericht.

begin;

-- ---------------------------------------------------------------------------
-- 1. Ben ik lid van deze groep, en staat hij open?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een tweede helper naast `deelt_open_groep_met_doel()`, en dat is geen
--    dubbel werk.** Die functie vraagt "deel ik een open groep met dit dóél" en
--    gaat over `goal_group_links`; deze vraagt "ben ik lid van deze ópen groep"
--    en gaat over `group_members`. Een doel heeft groepen, een schakel heeft er
--    één. Ze samenvoegen zou een functie opleveren die twee dingen kan en die je
--    op de aanroepplek nog steeds moet lezen om te weten welke van de twee.
--
-- ⚠️ Zelfde vorm en zelfde reden als `is_group_member()` (0002/0004/0029):
--    SECURITY DEFINER, want de policy op `group_members` zou anders in recursie
--    lopen. `status <> 'inactive'` staat erbij, net als daar.
--
-- ⚠️ Zonder sessie is dit `false` en niet NULL: `m.user_id = auth.uid()` met een
--    NULL rechterkant levert nul rijen op, en `exists` daarop is `false`.

create or replace function lid_van_open_groep(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id
    where m.group_id      = gid
      and m.user_id       = auth.uid()
      and m.status       <> 'inactive'
      and g.zichtbaarheid = 'open'
  );
$$;

comment on function lid_van_open_groep(uuid) is
  'Is de aanroeper een actief lid van deze groep, en staat de groep op "open"? '
  'Besluit A41 (QS8-135). SECURITY DEFINER om dezelfde reden als '
  'is_group_member: de policy op group_members zou anders in recursie lopen.';

revoke all on function lid_van_open_groep(uuid) from public, anon;
grant execute on function lid_van_open_groep(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De schakels
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een derde tak, en de twee bestaande blijven woordelijk staan. Het venster
--    van 0037 is de bescherming van de beschermde stand; verruimen in plaats van
--    toevoegen zou élke groep meteen opengooien.

drop policy if exists chain_links_select on chain_links;
create policy chain_links_select on chain_links
  for select to authenticated
  using (
    user_id = auth.uid()
    or (is_group_member(group_id) and group_period_start >= current_date - 8)
    or lid_van_open_groep(group_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Het groepsoverzicht volgt dezelfde regel
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze helft is de policy hierboven een halve reparatie in spiegel-
--    beeld.** `group_overview()` rekent `closed_this_period` zelf uit met exact
--    hetzelfde venster; stond dat er nog, dan zag een lid van een open groep de
--    schakels wél in `chain_links` maar niet in het overzicht dat het scherm
--    leest. Dat is dezelfde soort naad als in beslisdocument 002: twee correcte
--    onderdelen die samen iets anders beloven.
--
-- ⚠️ **De bovengrens blijft onvoorwaardelijk.** `p_period_start <= current_date
--    + 1` houdt tegen dat iemand een periode in de toekomst opvraagt en daar een
--    antwoord op krijgt; dat heeft niets met zichtbaarheid te maken en mag dus
--    niet meebewegen met de zichtbaarheid.
--
-- ⚠️ Lichaam uit `pg_get_functiondef()` overgenomen, inclusief `best_streak` en
--    `last_cycle_start` uit 0078 — de les van 0075.

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
      p_period_start <= current_date + 1
      and (
        p_period_start >= current_date - 8
        or lid_van_open_groep(m.group_id)
      )
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
  'weekstatus. `best_streak` en `last_cycle_start` zijn NULL buiten een open '
  'groep (0078); `closed_this_period` kijkt buiten de lopende periode alleen '
  'terug in een open groep (0079). Besluit A41.';

revoke all on function public.group_overview(uuid, date, integer, integer) from public, anon;
grant execute on function public.group_overview(uuid, date, integer, integer) to authenticated;

commit;
