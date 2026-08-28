-- 0120_de_ketting_leest_de_klok_van_de_groep.sql — nazorg op 0116
--
-- ROLLBACK-PAD:
--   -- de policy terug naar UTC:
--   drop policy if exists chain_links_select on public.chain_links;
--   create policy chain_links_select on public.chain_links
--     for select to authenticated
--     using (user_id = auth.uid()
--            or (is_group_member(group_id) and group_period_start >= current_date - 6)
--            or lid_van_open_groep(group_id));
--   -- en group_overview() terug naar de vorm van 0116 (zie dat bestand);
--   drop function if exists public.groepsdatum(uuid);
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0116 zette het kettingvenster van acht dagen op zes, en dat klopte. Wat er
-- bleef staan is dat het venster in **UTC** rekent terwijl een groep zijn eigen
-- klok heeft: `groups.tz` bestaat sinds het begin en werd op precies één plek
-- gebruikt (`seizoensgrens()`, 0112). De hele kettinglogica negeerde hem.
--
-- Dat is domeinregel 1 — `currentGroupPeriod(groupId)` — die in SQL geen enkele
-- bron van waarheid had. En het is geen afronding: het venster bepaalt of een
-- schakel zichtbaar is, en in een **beschermde** groep betekent een ontbrekende
-- schakel "gemist" en niet "nog niet".
--
-- 📏 Empirisch gemeten, in beide richtingen, met een echte zone op `groups.tz`:
--
--   * `Pacific/Midway` (UTC-11): een schakel op `groepsdatum - 6` — **lopend**
--     volgens de eigen klok van de groep — was voor een medelid **onzichtbaar**
--     (0 rijen). De Ketting telt dan een schakel niet mee die verdiend is.
--   * `Pacific/Kiritimati` (UTC+14): een schakel op `groepsdatum - 7` —
--     **afgesloten** volgens die klok — was **zichtbaar** (1 rij). Dat is exact
--     de fout die 0116 dichtte, teruggekomen via de tijdzone.
--
-- 📏 En het is geen randgeval: 456 van de 483 zones wijken op enig moment van
--    de dag van de UTC-datum af, en over alle zone-uren samen staat de
--    UTC-datum **20,6%** van de tijd op een andere dag. Auckland 50% van de
--    dag, Honolulu 42%, Tokio 38% — **Amsterdam 8%, en dat is de reden dat het
--    niemand opviel.**
--
-- ---------------------------------------------------------------------------
-- Wat hier bewust NIET verandert
-- ---------------------------------------------------------------------------
--
-- Vijf andere plekken dragen `current_date`, en die blijven staan. Drie ervan
-- zijn geen grens maar een onzin-toets: `bewaak_week_review_periode()`,
-- `ketting_schakel()` en `ketting_uit_weekafsluiting()` weigeren een
-- periodestart die meer dan een dag in de toekomst of meer dan 35 dagen in het
-- verleden ligt.
--
-- 📏 **Gemeten dat die speling genoeg is**, in plaats van het aan te nemen: over
--    een heel jaar, alle zones, elk uur, wijkt de lokale datum **precies -1 tot
--    +1 dag** van de UTC-datum af en nooit meer (nul gevallen boven één dag).
--    Een grens met een dag speling aan de bovenkant en 35 aan de onderkant kan
--    daar dus niet door omvallen.
--
-- De twee andere zijn wél een echte vraag en krijgen een eigen rij in
-- `docs/ENGINEER-REVIEW.md`: `herbereken_risico()` rekent de Risico-radar in
-- UTC waar het de klok van de eigenaar zou moeten zijn, en
-- `wikkel_commitments_af()` beslist met `current_date <= target_date + 1` of een
-- straf verschuldigd wordt. Dat laatste is domeinregel 5 en dus een
-- productbeslissing, geen opruimwerk.
--
-- ---------------------------------------------------------------------------
-- Waarom een SECURITY DEFINER-functie
-- ---------------------------------------------------------------------------
--
-- De policy staat op `chain_links` en heeft de `tz` van de groep nodig. Een
-- kale subquery op `groups` zou daar de RLS van `groups` binnentrekken. Dat is
-- precies waarom `is_group_member()` en `lid_van_open_groep()` al DEFINER zijn;
-- deze functie volgt die vorm: STABLE, vastgepind `search_path`, en uitvoerbaar
-- voor `authenticated` maar niet voor `anon`.
--
-- ⚠️ **Wat hij prijsgeeft, en waarom dat aanvaard is.** Wie een groeps-id heeft,
--    kan de lokale datum van die groep opvragen zonder lid te zijn — dat is een
--    afgeleide van `groups.tz`, ongeveer "aan welke kant van de datumgrens".
--    Dat is groepsinstelling en geen gemiste week van iemand: domeinregel 7
--    raakt het niet. Een lidmaatschapstoets erin zou de policy een tweede
--    identieke subquery kosten voor iets dat niets beschermt.
--
-- ---------------------------------------------------------------------------

create or replace function public.groepsdatum(gid uuid)
returns date
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select (now() at time zone g.tz)::date
  from groups g
  where g.id = gid;
$$;

comment on function public.groepsdatum(uuid) is
  'Vandaag volgens de klok van deze groep — `currentGroupPeriod` uit '
  'domeinregel 1, in SQL. Elke grens die over een groepsperiode gaat, rekent '
  'hiermee en niet met `current_date`. Zie 0120.';

revoke all on function public.groepsdatum(uuid) from public, anon, authenticated;
grant execute on function public.groepsdatum(uuid) to authenticated;

drop policy if exists chain_links_select on public.chain_links;

create policy chain_links_select on public.chain_links
  for select to authenticated
  using (
    user_id = auth.uid()
    -- ⚠️ Zes en niet zeven (0116): een periode van zeven dagen die vandaag
    --    loopt, is hoogstens zes dagen oud. En `groepsdatum()` en niet
    --    `current_date` (0120): "vandaag" is hier de dag van de groep.
    or (is_group_member(group_id) and group_period_start >= groepsdatum(group_id) - 6)
    or lid_van_open_groep(group_id)
  );

comment on policy chain_links_select on public.chain_links is
  'Je eigen schakels altijd; die van groepsgenoten alleen binnen de lopende '
  'periode — zes dagen (0116), geteld op de klok van de groep (0120). In een '
  'open groep zonder venster — besluit A41.';

CREATE OR REPLACE FUNCTION public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        p_period_start <= groepsdatum(m.group_id) + 1
        and (
          p_period_start >= groepsdatum(m.group_id) - 6
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
$function$


