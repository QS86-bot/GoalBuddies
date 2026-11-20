-- 0321_een_aandeel_blijft_van_zijn_eigenaar.sql — een aandeeldoel is in elke
-- teamgroep alleen van zijn eigenaar, op het goedkeurvenster na, en een
-- teamgroep heeft nooit een klassement (QS8-661, epic QS8-650).
--
-- ⚠️ **Hernummerd van 0303 naar 0321 op 20-11-2026**, in de ketenlaan 0316–0327
--    (besluit Quinten). Bouwt op 0320 van QS8-655. Het oude nummer botste met 0299–0302 van
--    QS8-233 (QS8-641); de inhoud hangt niet aan het nummer.
--
-- ROLLBACK-PAD (alleen functie- en policylichamen; geen gegevens):
--   shares_group_with_goal(), deelt_open_groep_met_doel() en groep_klassement()
--   terugzetten uit hun vorige definitie (de lichamen hieronder zijn die, plus
--   de gemarkeerde QS8-661-voorwaarde); de vier policies hieronder terugzetten
--   zonder de tak `aandeel_wacht_op_teamgenoot()`;
--   drop function if exists public.aandeel_wacht_op_teamgenoot(uuid);
--   straffen_bij_uitstelverzoek() (0312, met `periode_start is null`), plaats_systeembericht_in_doelgroepen(),
--   meld_goedkeuring(), groep_helden() en group_overview() terugzetten uit hun
--   vorige definitie (de lichamen in sectie 6 zijn die, plus de QS8-661-regels);
--   drop function if exists public.is_aandeel_van_een_ander(uuid);
--   alter table public.groups add constraint groups_team_beschermd_tot_qs8_661
--     check (organization_id is null or zichtbaarheid = 'beschermd');
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- Besluit 5, 11, 18, 21, 22 en 25 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- en de keuzes in `docs/decisions/2026-11-17-een-aandeel-blijft-van-zijn-eigenaar.md`.
--
-- 1. **Eén plek voor bijna elke leesroute.** `goals`, `milestones`,
--    `goal_events`, `breathers`, `daily_moves`, `completions`,
--    `completion_approval_rules` en de beschermde tak van `weekly_goals` lopen
--    allemaal via `shares_group_with_goal()`; de open tak van `weekly_goals` via
--    `deelt_open_groep_met_doel()`. Beide geven nu `false` voor een aandeel van
--    een ander, in een beschermde én een open teamgroep (besluit 11 en 21).
-- 2. **Het goedkeurvenster.** Besluit 5 wil dat een teamgenoot een aandeel
--    goedkeurt, en daarvoor moet hij de voltooiing zien:
--    `completion_approvals_insert` en `openstaande_beoordelingen()` lezen
--    `completions`, `weekly_goals` en `goals` met zijn rechten. Dus ziet een
--    actief lid van de teamgroep een aandeel zolang er een weekdoel op
--    `pending` staat, en dan alleen dat weekdoel, zijn voltooiing en de rij van
--    het doel. Na de goedkeuring verdwijnt het weer. Dat is een positief
--    signaal, en het is het minimum dat besluit 5 vraagt.
-- 3. `groep_klassement()` geeft nul rijen in een teamgroep (besluit 22, 25).
-- 4. De tijdelijke CHECK van 0319 vervalt: een teamgroep mag weer open zijn
--    (besluit 18).
--
-- ⚠️ **Het goedkeurvenster zit in een definer-helper en niet in de policy.** Een
--    `goals`-policy die via RLS naar `weekly_goals` kijkt, waarvan de policy
--    weer naar `goals` kijkt, is oneindige recursie.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De helpers
-- ---------------------------------------------------------------------------

-- Is dit doel een aandeel van iemand anders dan de aanroeper?
create or replace function public.is_aandeel_van_een_ander(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from team_goal_shares s
     where s.goal_id = g
       and s.user_id is distinct from (select auth.uid())
  );
$$;
revoke all on function public.is_aandeel_van_een_ander(uuid) from public, anon, authenticated;
grant execute on function public.is_aandeel_van_een_ander(uuid) to authenticated;

-- Het goedkeurvenster: de aanroeper is actief lid van de teamgroep van dit
-- aandeel, de eigenaar ook, het aandeel hangt aan die groep, de groep is niet
-- gearchiveerd, en er staat een weekdoel op `pending`.
create or replace function public.aandeel_wacht_op_teamgenoot(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from team_goal_shares s
      join team_goals t       on t.id = s.team_goal_id
      join goal_group_links l on l.goal_id = s.goal_id and l.group_id = t.group_id
      join groups gr          on gr.id = t.group_id and gr.status <> 'archived'
      join group_members m    on m.group_id = t.group_id
                             and m.user_id  = (select auth.uid())
                             and m.status  <> 'inactive'
      join group_members o    on o.group_id = t.group_id
                             and o.user_id  = s.user_id
                             and o.status  <> 'inactive'
     where s.goal_id = g
       and s.user_id <> (select auth.uid())
       and exists (select 1 from weekly_goals w where w.goal_id = g and w.status = 'pending')
  );
$$;
revoke all on function public.aandeel_wacht_op_teamgenoot(uuid) from public, anon, authenticated;
grant execute on function public.aandeel_wacht_op_teamgenoot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De twee gedeelde leeshelpers sluiten een aandeel van een ander uit
-- ---------------------------------------------------------------------------
--
-- ⚠️ Gekopieerd uit de huidige definitie (0122 en 0141) en alleen aangevuld met
--    de gemarkeerde regel: een register in een functielichaam verliest anders
--    stil wat een andere tak erbij zette (QS8-358).

create or replace function public.shares_group_with_goal(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d on d.id       = l.goal_id
    join groups        gr on gr.id     = l.group_id
    -- De kijker hoort er nog bij.
    join group_members m on m.group_id = l.group_id
                        and m.user_id  = auth.uid()
                        and m.status  <> 'inactive'
    -- En de eigenaar ook. Dit was de ontbrekende helft.
    join group_members o on o.group_id = l.group_id
                        and o.user_id  = d.owner_id
                        and o.status  <> 'inactive'
    where l.goal_id  = g
      and gr.status <> 'archived'
  )
  -- QS8-661: een aandeel is van zijn eigenaar, in elke teamgroep (besluit 11, 21).
  and not public.is_aandeel_van_een_ander(g);
$$;

create or replace function public.deelt_open_groep_met_doel(g uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from goal_group_links l
    join goals         d  on d.id       = l.goal_id
    join groups        gr on gr.id      = l.group_id
    join group_members m  on m.group_id = l.group_id
                         and m.user_id  = auth.uid()
                         and m.status  <> 'inactive'
    join group_members o  on o.group_id = l.group_id
                         and o.user_id  = d.owner_id
                         and o.status  <> 'inactive'
    where l.goal_id        = g
      and gr.zichtbaarheid = 'open'
      and gr.status       <> 'archived'
  )
  -- QS8-661: ook in een open teamgroep blijft een aandeel dicht (besluit 21).
  and not public.is_aandeel_van_een_ander(g);
$$;

-- ---------------------------------------------------------------------------
-- 3. Het goedkeurvenster in vier leesregels
-- ---------------------------------------------------------------------------

drop policy if exists goals_select on public.goals;
create policy goals_select on public.goals
  for select to authenticated
  using ((owner_id = (select auth.uid()))
         or shares_group_with_goal(id)
         or aandeel_wacht_op_teamgenoot(id));

drop policy if exists weekly_goals_select on public.weekly_goals;
create policy weekly_goals_select on public.weekly_goals
  for select to authenticated
  using ((exists (select 1 from goals g
                   where g.id = weekly_goals.goal_id and g.owner_id = (select auth.uid())))
         or (shares_group_with_goal(goal_id)
             and status <> all (array['missed', 'carried', 'cancelled', 'excused']))
         or deelt_open_groep_met_doel(goal_id)
         or (status = 'pending' and aandeel_wacht_op_teamgenoot(goal_id)));

drop policy if exists completions_select on public.completions;
create policy completions_select on public.completions
  for select to authenticated
  using (exists (select 1
                   from weekly_goals w
                   join goals g on g.id = w.goal_id
                  where w.id = completions.weekly_goal_id
                    and ((g.owner_id = (select auth.uid()))
                         or shares_group_with_goal(g.id)
                         or (w.status = 'pending' and aandeel_wacht_op_teamgenoot(g.id)))));

drop policy if exists completion_approval_rules_select on public.completion_approval_rules;
create policy completion_approval_rules_select on public.completion_approval_rules
  for select to authenticated
  using (exists (select 1
                   from completions c
                   join weekly_goals w on w.id = c.weekly_goal_id
                   join goals g on g.id = w.goal_id
                  where c.id = completion_approval_rules.completion_id
                    and ((g.owner_id = (select auth.uid()))
                         or shares_group_with_goal(g.id)
                         or (w.status = 'pending' and aandeel_wacht_op_teamgenoot(g.id)))));

-- ---------------------------------------------------------------------------
-- 4. Nooit een klassement in een teamgroep
-- ---------------------------------------------------------------------------

create or replace function public.groep_klassement(p_group_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, punten integer, positie bigint, total_members bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with standen as (
    select
      m.user_id                                   as user_id,
      p.display_name                              as display_name,
      greatest(coalesce((
        select sum(pl.delta)
        from points_ledger pl
        where pl.group_id = p_group_id
          and pl.user_id  = m.user_id
      ), 0), 0)::integer                          as punten
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  gerangschikt as (
    select
      s.user_id,
      s.display_name,
      s.punten,
      rank() over (order by s.punten desc)        as positie,
      count(*) over ()                            as total_members
    from standen s
  )
  select
    g.user_id,
    g.display_name,
    g.punten,
    g.positie,
    g.total_members
  from gerangschikt g
  where lid_van_open_groep(p_group_id)
    -- QS8-661, besluit 22 en 25: nooit een klassement in een teamgroep, ook
    -- niet in een open. Een eigen voorwaarde en niet via `lid_van_open_groep()`,
    -- zodat A57 (QS8-666) hem niet stil verliest als die poort verandert.
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
  -- ⚠️ Dezelfde volgorde als `positie`, plus twee tiebreakers. Zonder een
  --    deterministische volgorde kan één lid op twee pagina's staan en een
  --    ander op geen enkele — dat is niet cosmetisch maar een verkeerd
  --    klassement.
  order by g.punten desc, g.display_name asc, g.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

-- ---------------------------------------------------------------------------
-- 5. De tijdelijke grendel van 0319 vervalt
-- ---------------------------------------------------------------------------
--
-- Hij hield een teamgroep dicht tot deze migratie er was (securityreview
-- QS8-654, H1). Besluit 18 laat de organisatie weer kiezen.
alter table public.groups drop constraint if exists groups_team_beschermd_tot_qs8_661;

-- ---------------------------------------------------------------------------
-- 6. Wat de securityreview vond (QS8-661)
-- ---------------------------------------------------------------------------

-- H1: wie over een uitstelverzoek beslist, moet de straf zien (domeinregel 11,
-- QS8-370), ook bij een aandeel: besluit 20 maakt A7 met een teamgenoot juist de
-- route. Hier dus het lidmaatschap van kijker en eigenaar, zonder de
-- aandeel-uitsluiting van `shares_group_with_goal()`. Wat de functie teruggeeft
-- blijft `goal_id` en niets anders.
create or replace function public.straffen_bij_uitstelverzoek(p_goal_ids uuid[])
returns table(goal_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(array_length(p_goal_ids, 1), 0) > 100 then
    raise exception 'straffen_bij_uitstelverzoek: hoogstens 100 doelen per aanroep'
      using errcode = 'program_limit_exceeded';
  end if;

  return query
  select distinct c.goal_id
  from commitments c
  where c.type = 'penalty'
    and c.status <> 'cancelled'
    -- ⚠️ QS8-758 (0312): **een weekbelofte valt hierbuiten.** Overgenomen uit
    --    het lichaam van 0312 bij het hernummeren (20-11-2026): deze tak is
    --    gebouwd op een basis van vóór 0312, en zonder deze regel zette 0321
    --    die uitzondering stil terug (registerdrift, QS8-358).
    and c.periode_start is null
    and c.goal_id = any (p_goal_ids)
    and exists (
      select 1
      from deadline_requests r
      join goal_group_links l  on l.goal_id = r.goal_id and l.group_id = r.group_id
      join goals d             on d.id = r.goal_id
      join groups gr           on gr.id = r.group_id and gr.status <> 'archived'
      join group_members m     on m.group_id = r.group_id
                              and m.user_id  = auth.uid()
                              and m.status  <> 'inactive'
      join group_members o     on o.group_id = r.group_id
                              and o.user_id  = d.owner_id
                              and o.status  <> 'inactive'
      where r.goal_id = c.goal_id
        and r.status <> 'withdrawn'
        and mag_groep_lezen(r.group_id)
    );
end;
$$;

-- H2: geen systeemberichten over een aandeel. Mijlpaal, afgerond doel,
-- ingediende week en vrijgespeelde beloning lopen via deze ene functie; de
-- bevestigde week via `meld_goedkeuring()` hieronder. Goedkeuren loopt via de
-- wachtrij `openstaande_beoordelingen()` en niet via de chat.
create or replace function public.plaats_systeembericht_in_doelgroepen(
  p_goal_id uuid, p_event text, p_body text,
  p_subject_id uuid default null, p_actor_id uuid default null, p_payload jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if exists (select 1 from team_goal_shares s where s.goal_id = p_goal_id) then
    return;
  end if;
  for r in select l.group_id from goal_group_links l where l.goal_id = p_goal_id loop
    perform plaats_systeembericht(r.group_id, p_event, p_body, p_subject_id, p_actor_id, p_payload);
  end loop;
end;
$$;

create or replace function public.meld_goedkeuring()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  begin
    if new.status <> 'approved' then return new; end if;

    -- ⚠️ **Pas melden als de week het ook echt gehaald heeft** (QS8-65). Zonder
    --    deze regel verschijnt "bevestigde de week van X" in de groepschat op de
    --    eerste van drie bevestigingen, en dan staat er iets in de feed dat niet
    --    waar is. Bij `approval_rule = 'any'` is de drempel 1 en gedraagt hij
    --    zich precies als voorheen.
    --
    -- ⚠️ Bewust `gehaald` en niet "de bevestiging die hem tipte": wie als vierde
    --    bevestigt op een week die er drie nodig had, hééft die week bevestigd.
    --    Dat is een positief signaal en domeinregel 7 gunt de groep die.
    if not goedkeuringsdrempel_gehaald(new.completion_id) then return new; end if;

    -- QS8-661 (review H2): geen bericht over een aandeel. Wie per persoon de
    -- bevestigde weken telt, weet hoe ver iemand met zijn aandeel is (besluit 11).
    if exists (select 1
                 from completions c
                 join weekly_goals w      on w.id = c.weekly_goal_id
                 join team_goal_shares s  on s.goal_id = w.goal_id
                where c.id = new.completion_id) then
      return new;
    end if;

    -- De enige gebeurtenis met twee personen: `subject_id` is degene wiens week
    -- bevestigd is, `actor_id` de buddy die het deed.
    perform plaats_systeembericht(
      new.group_id,
      'completion_approved',
      'Een lid bevestigde de week van een ander.',
      new.subject_id,
      new.approver_id,
      -- ⚠️ **De voltooiing, zodat `trek_goedkeuring_in()` dit bericht kan
      --    terugvinden zonder de zin te lezen.** Zie de kop van 0213: die
      --    functie zocht op `body = tekst`, en dat werkt alleen zolang de zin
      --    een naam draagt en dus toevallig uniek is.
      --
      -- ⚠️ Een voltooiing is geen persoon, dus dit mag hier — de regel uit 0059
      --    is dat er nóóit een persoon in `payload` gaat, want een uuid in jsonb
      --    heeft geen foreign key en overleeft een accountverwijdering. Een
      --    `completion_id` cascadeert juist mee en blijft als losse waarde
      --    zonder betekenis achter.
      jsonb_build_object('completion_id', new.completion_id)
    );
  exception
    when others then
      raise warning 'Systeembericht completion_approved is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$function$;

-- H3: geen helden in een teamgroep.
create or replace function public.groep_helden(p_group_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, hero_key text, trigger text, totaal bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with leden as (
    select m.user_id as user_id, p.display_name as display_name
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  laatste as (
    select distinct on (a.user_id)
      a.user_id  as user_id,
      a.hero_key as hero_key,
      a.trigger  as trigger
    from hero_appearances a
    where a.user_id in (select l.user_id from leden l)
      and a.trigger = any (array['mijlpaal', 'stilte'])
      and a.shown_at >= date_trunc('day', now(), 'UTC') - interval '7 days'
    order by a.user_id, a.shown_at desc, a.id desc
  ),
  samen as (
    select
      l.user_id                    as user_id,
      l.display_name               as display_name,
      h.hero_key                   as hero_key,
      h.trigger                    as trigger,
      -- ⚠️ Het aantal léden met een zichtbare verschijning, en niet het aantal
      --    leden van de groep. De paginering telt wat er in deze lijst staat;
      --    dat tweede getal staat in `groep_klassement()` en hoort daar.
      count(*) over ()             as totaal
    from leden l
    join laatste h on h.user_id = l.user_id
  )
  select s.user_id, s.display_name, s.hero_key, s.trigger, s.totaal
  from samen s
  where lid_van_open_groep(p_group_id)
    -- QS8-661 (review H3): geen helden in een teamgroep, ook niet in een open.
    -- `stilte` meet over álle doelen van iemand, ook privédoelen, en tegenover
    -- collega's is dat tegenslag per persoon (domeinregel 7, besluit 21). Dicht
    -- tot Quinten anders besluit; een eigen voorwaarde, zoals bij het klassement.
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
  -- ⚠️ Op naam en niet op tijd. Een sortering op `shown_at` geeft het tijdstip
  --    niet prijs maar wél de volgorde, en dat is "wie miste het laatst iets" —
  --    een kolom die met opzet niet in de handtekening staat, alsnog afleidbaar
  --    uit de rijvolgorde. `user_id` erachter houdt de paginering deterministisch
  --    bij gelijke namen, zelfde reden als in `groep_klassement()`.
  order by s.display_name asc, s.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

-- M2: geen aandeel in het groepsoverzicht van een ander.
create or replace function public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_na_joined_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_na_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with leden as materialized (
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
      select gg.id, gg.title, gg.target_date
      from goals gg
      join goal_group_links l on l.goal_id = gg.id
      where l.group_id = m.group_id
        and gg.owner_id = m.user_id
        and gg.status = 'active'
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
    (select count(*) from leden) as total_members
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
