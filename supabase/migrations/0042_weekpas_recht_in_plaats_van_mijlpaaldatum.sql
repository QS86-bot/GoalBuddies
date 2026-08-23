-- 0042_weekpas_recht_in_plaats_van_mijlpaaldatum.sql — QS8-81 (EPIC 8)
--
-- ROLLBACK-PAD:
--   Herstel `verdien_weekpassen()` uit 0039 en `verbruik_weekpas()` uit 0039.
--   Reeds uitgegeven passen blijven staan (domeinregel 6, append-only).
--
-- ⚠️ Waarom deze migratie bestaat. De reviewronde op QS8-81 vond twee fouten in
--    de uitgifte, allebei in dezelfde regel uit 0039:
--
--        mijlpaal := max(cycle_start_date) van de goedgekeurde cycli
--
--    Het *recht* op een pas kwam uit een áántal (`count(distinct ...)`), maar de
--    *identiteit* van de uitgifte kwam uit een dátum. Die twee lopen uit elkaar
--    zodra weken niet op volgorde goedgekeurd worden, en dat gebeurt gewoon:
--    coulanceperiode, late goedkeuring, een ingetrokken goedkeuring.
--
--      1. **Een pas kon stil verdwijnen.** Wie week 12 als eerste laat
--         goedkeuren en daarna de rest, heeft bij `voltooid = 6` en bij
--         `voltooid = 12` dezelfde `max(cycle_start_date)`. De unieke index
--         slikte de tweede rij via `on conflict do nothing` en de gebruiker
--         verloor een verdiende pas zonder één signaal.
--
--      2. **Een pas kon dubbel komen.** `trek_goedkeuring_in()` zet een week
--         terug op `pending`, dus `voltooid` kan omláág. Week 1 goedgekeurd
--         (cadeau op week 1), ingetrokken, week 2 goedgekeurd: `voltooid` is
--         weer 1, de datum is nu week 2, en er komt een tweede cadeau. Eén
--         voltooide cyclus, twee passen.
--
-- ⚠️ De reparatie is het model omdraaien: niet "welke mijlpaal is dit en heb ik
--    die al gehad", maar **"op hoeveel passen heb ik recht en hoeveel heb ik er
--    ooit gekregen"**. Het recht is `1 + voltooid / 6` (heeltallige deling): één
--    cadeau na de eerste voltooide cyclus, daarna één per zes. Er wordt nooit
--    meer uitgegeven dan het recht, ongeacht in welke volgorde weken zijn
--    goedgekeurd en ongeacht hoe vaak deze functie draait. Dat maakt hem
--    idempotent op de inhoud in plaats van op een sleutel.
--
-- ⚠️ **Productwijziging, en die moet je bewust lezen.** In 0039 vervíél een pas
--    die je verdiende terwijl je voorraad vol was. Dat kan in dit model niet
--    meer bestaan zonder een kolom die bijhoudt dát er iets vervallen is — en
--    zonder die kolom levert "vervallen" precies fout 1 hierboven op: een stil
--    verdwenen pas, niet te onderscheiden van een bug. Daarom geldt nu:
--    **je voorraad is begrensd, je recht niet.** Verdien je een pas terwijl je
--    er al twee hebt, dan komt hij vrij zodra je er een verbruikt. Er gaat niets
--    meer verloren; je kunt er alleen nooit meer dan twee tegelijk hebben.
--    Staat als A32 in `docs/Q-TODO.docx`.
--
-- ⚠️ Daarnaast twee kleine dingen uit dezelfde ronde:
--    - Beide functies controleren nu dat `p_user_id` de eigenaar van
--      `p_goal_id` is. Vandaag geven beide aanroepers een kloppend paar door,
--      maar een verkeerd paar zou rijen maken die `weekpas_standen()` (dat op
--      `g.owner_id` filtert) nooit toont terwijl `verbruik_weekpas()` ze wél
--      meetelt: een pas die bestaat en die niemand ziet.
--    - `award_points_on_approval()` krijgt zijn `revoke` terug. `create or
--      replace` behoudt de ACL, dus vandaag verandert er niets — maar wie het
--      rollback-pad van 0039 volgt (`drop function`, opnieuw aanmaken) zou hem
--      kwijtraken.

create or replace function public.verdien_weekpassen(p_user_id uuid, p_goal_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  voltooid    integer;
  recht       integer;
  uitgegeven  integer;
  voorraad    integer;
  ordinaal    integer;
  mijlpaal    date;
  soort       text;
begin
  -- ⚠️ Het paar moet bij elkaar horen. Alleen `service_role` komt hier binnen,
  --    dus dit is geen autorisatiegrens maar een vangnet tegen een aanroeper
  --    die twee losse id's doorgeeft.
  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = p_user_id
  ) then
    return;
  end if;

  -- Voltooide cycli, niet voltooide weekdoelen: twee weekdoelen in dezelfde week
  -- zijn samen één week. `herbereken_reeks()` telt op dezelfde manier.
  select count(distinct w.cycle_start_date)
    into voltooid
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.status = 'approved';

  if coalesce(voltooid, 0) = 0 then
    return;
  end if;

  -- Eén cadeau na de eerste voltooide cyclus, daarna één per zes.
  recht := 1 + (voltooid / 6);

  select count(*)
    into uitgegeven
    from week_pass_events e
   where e.user_id = p_user_id
     and e.goal_id = p_goal_id
     and e.event in ('earned', 'granted');

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = p_user_id
     and e.goal_id = p_goal_id;

  -- ⚠️ Een lus en geen enkele insert: loopt de gebruiker meerdere mijlpalen
  --    tegelijk in (bijvoorbeeld doordat oude weken alsnog goedgekeurd worden),
  --    dan krijgt hij ze allemaal in plaats van één per aanroep. De lus stopt
  --    altijd: `uitgegeven` gaat elke ronde met één omhoog richting `recht`.
  while uitgegeven < recht and voorraad < weekpas_maximum() loop
    -- De mijlpaal waar deze pas bij hoort: de eerste, de zesde, de twaalfde …
    ordinaal := case when uitgegeven = 0 then 1 else uitgegeven * 6 end;

    -- ⚠️ De n-de goedgekeurde cyclus op datum, en niet `max(...)`. Zo hoort bij
    --    elke mijlpaal precies één datum en botsen twee mijlpalen nooit op
    --    dezelfde sleutel.
    select c.cycle_start_date into mijlpaal
      from (
        select distinct w.cycle_start_date
          from weekly_goals w
         where w.goal_id = p_goal_id
           and w.status = 'approved'
         order by 1
      ) c
     offset (ordinaal - 1) limit 1;

    exit when mijlpaal is null;

    soort := case when uitgegeven = 0 then 'granted' else 'earned' end;

    insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
    values (p_user_id, p_goal_id, soort, mijlpaal)
    on conflict do nothing;

    uitgegeven := uitgegeven + 1;
    voorraad   := voorraad + 1;
  end loop;
end;
$$;

revoke all on function public.verdien_weekpassen(uuid, uuid) from public, anon, authenticated;

create or replace function public.verbruik_weekpas(
  p_user_id uuid,
  p_goal_id uuid,
  p_cycle_start_date date
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  voorraad  integer;
  gezet     integer;
begin
  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = p_user_id
  ) then
    return false;
  end if;

  -- Is deze cyclus echt gemist? De aanroeper zegt het, maar de aanroeper is een
  -- job en jobs hebben bugs.
  if not exists (
    select 1 from weekly_goals w
     where w.goal_id = p_goal_id
       and w.cycle_start_date = p_cycle_start_date
       and w.status = 'missed'
  ) then
    return false;
  end if;

  -- ⚠️ Telt de week al mee, dan is er niets te redden.
  if exists (
    select 1 from weekly_goals w
     where w.goal_id = p_goal_id
       and w.cycle_start_date = p_cycle_start_date
       and w.status = 'approved'
  ) then
    return false;
  end if;

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = p_user_id
     and e.goal_id = p_goal_id;

  if voorraad < 1 then
    return false;
  end if;

  insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  values (p_user_id, p_goal_id, 'spent', p_cycle_start_date)
  on conflict do nothing;

  get diagnostics gezet = row_count;
  return gezet > 0;
end;
$$;

revoke all on function public.verbruik_weekpas(uuid, uuid, date) from public, anon, authenticated;

-- Zie de kop: `create or replace` behoudt de ACL, maar het rollback-pad van
-- 0039 niet.
revoke all on function public.award_points_on_approval() from public, anon, authenticated;
