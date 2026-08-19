-- 0041_weekpas_standen_in_een_keer.sql — QS8-81 / QS8-75 (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop function if exists weekpas_standen(uuid[]);
--   -- en herstel daarna `weekpas_stand(uuid)` uit 0040; die versie rekent alles
--   -- zelf uit en heeft deze functie niet nodig.
--
-- ⚠️ Waarom deze migratie bestaat. Het dashboard (QS8-75) toont de stand van
--    meerdere doelen tegelijk. Met alleen `weekpas_stand(p_goal_id)` is dat één
--    aanroep per doel, en dat is precies de N+1 die CLAUDE.md
--    schaalbaarheidsregel 12 verbiedt.
--
-- ⚠️ En waarom het niet twee keer dezelfde som is. De verleiding is om naast
--    `weekpas_stand()` een tweede functie te zetten die hetzelfde uitrekent voor
--    een lijst doelen. Dan staan er twee kopieën van de regel "voorraad =
--    verdiend plus gekregen min verbruikt", en twee kopieën die gelijk moeten
--    blijven zijn in deze codebase al een keer geruisloos uit elkaar gelopen
--    (valkuil 18). Daarom is dít de implementatie en is `weekpas_stand()`
--    hieronder nog maar een doorgeefluik voor één doel.
--
-- ⚠️ De eigenaarstoets zit in de `where`-regel en niet in een `if`. Dat is bij
--    een set-returning functie de enige vorm die klopt: er is geen enkel doel
--    van iemand anders dat deze functie kán teruggeven, ook niet als de
--    aanroeper er een id van raadt. `auth.uid() is null` wordt apart afgevangen,
--    want een vergelijking met een lege waarde is in SQL geen controle — dat is
--    de fout die 0040 moest repareren.

create or replace function public.weekpas_standen(p_goal_ids uuid[] default null)
  returns table (
    goal_id           uuid,
    voorraad          integer,
    maximum           integer,
    voltooide_cycli   integer,
    tot_volgende      integer,
    laatst_verbruikt  date
  )
  language sql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select
    g.id,
    coalesce((
      select sum(case when e.event = 'spent' then -1 else 1 end)::integer
        from week_pass_events e
       where e.user_id = g.owner_id and e.goal_id = g.id
    ), 0),
    weekpas_maximum(),
    coalesce(v.voltooid, 0)::integer,
    (case when coalesce(v.voltooid, 0) = 0 then 1 else 6 - (v.voltooid % 6) end)::integer,
    (
      select max(e.cycle_start_date)
        from week_pass_events e
       where e.user_id = g.owner_id and e.goal_id = g.id and e.event = 'spent'
    )
  from goals g
  left join lateral (
    select count(distinct w.cycle_start_date) as voltooid
      from weekly_goals w
     where w.goal_id = g.id and w.status = 'approved'
  ) v on true
  where auth.uid() is not null
    and g.owner_id = auth.uid()
    and (p_goal_ids is null or g.id = any (p_goal_ids));
$$;

revoke all on function public.weekpas_standen(uuid[]) from public, anon;
grant execute on function public.weekpas_standen(uuid[]) to authenticated;

-- `weekpas_stand()` houdt zijn vorm (één doel, jsonb) zodat de bestaande
-- aanroeper en zijn tests niet hoeven te veranderen, maar rekent zelf niets
-- meer uit.
create or replace function public.weekpas_stand(p_goal_id uuid)
  returns jsonb
  language sql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'voorraad', s.voorraad,
    'maximum', s.maximum,
    'voltooide_cycli', s.voltooide_cycli,
    'tot_volgende', s.tot_volgende,
    'laatst_verbruikt', s.laatst_verbruikt
  )
  from weekpas_standen(array[p_goal_id]) s;
$$;

revoke all on function public.weekpas_stand(uuid) from public, anon;
grant execute on function public.weekpas_stand(uuid) to authenticated;
