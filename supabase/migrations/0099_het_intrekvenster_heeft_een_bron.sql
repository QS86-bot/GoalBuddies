-- 0099_het_intrekvenster_heeft_een_bron.sql — één getal in plaats van twee
--
-- ROLLBACK-PAD:
--   drop function if exists public.intrekvenster_bewaking();
--   Zet in trek_goedkeuring_in() de regel terug naar:
--     if a.created_at <= now() - interval '15 minutes' then
--   en daarna: drop function if exists public.intrekvenster_minuten();
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het intrekvenster stond twee keer, in twee talen, met een comment als
--    enige verband.** In `trek_goedkeuring_in()` als `interval '15 minutes'`,
--    en in `src/modules/completions/approvals.ts` als
--    `INTREKVENSTER_MINUTEN = 15` met erboven: *"Zolang je een goedkeuring nog
--    kunt intrekken — gelijk aan de RPC."*
--
--    Niets controleerde die gelijkheid. Grep op `INTREKVENSTER_MINUTEN` en
--    `15 minutes` in `tests/` gaf op 27-08-2026 nul treffers.
--
-- ⚠️ **Wat het kost als ze uit elkaar lopen.** Het getal staat in de tekst die
--    de gebruiker leest op het moment dat hij een vergissing probeert terug te
--    draaien: `beoordeling.terugdraai_venster` zegt "je hebt nog {minuten}
--    minuten". Zet iemand de SQL op tien, dan belooft het scherm vijftien en
--    krijgt de gebruiker `window_closed` te zien terwijl hij dacht nog tijd te
--    hebben — precies bij de handeling die bedoeld is om een fout te herstellen.
--
-- ⚠️ **Dit is de vorm van regel 18 die dit project al vijf keer betaald heeft**,
--    en de reparatie is dezelfde als bij `check_waarden()` (0082): maak de
--    database-kant leesbaar vanuit een test, zodat de app-constante en de
--    afdwinging in béide richtingen vergeleken worden. Een comment dat zegt
--    "gelijk aan de RPC" is een aanname, geen verband.
--
-- ⚠️ Gedrag ongewijzigd: het venster blijft vijftien minuten.

create or replace function intrekvenster_minuten()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 15;
$$;

comment on function intrekvenster_minuten() is
  'Hoelang een goedkeuring nog in te trekken is, in minuten. De énige bron: '
  'trek_goedkeuring_in() rekent hiermee en de app vergelijkt zijn eigen '
  'INTREKVENSTER_MINUTEN ertegen in tests/rls/intrekvenster.test.ts. Zie '
  'migratie 0099 en, voor dezelfde vorm, check_waarden() uit 0082.';

-- ⚠️ Leesbaar voor iedereen die mag intrekken. Het is geen geheim — het staat
--    letterlijk in de tekst onder de knop — en zo kan de app hem later
--    rechtstreeks ophalen in plaats van een eigen kopie te houden.
grant execute on function intrekvenster_minuten() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dezelfde functie, met het getal uit één bron
-- ---------------------------------------------------------------------------

create or replace function trek_goedkeuring_in(p_approval_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a          completion_approvals%rowtype;
  c          completions%rowtype;
  w          weekly_goals%rowtype;
  g_owner    uuid;
  punten     integer;
  nog_geldig integer;
  tekst      text;
  treffers   integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into a from completion_approvals where id = p_approval_id;

  if a.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if a.approver_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yours');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = a.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  -- ⚠️ Het enige verschil met de vorige versie: het getal komt uit
  --    `intrekvenster_minuten()` en staat niet meer als letterlijke `interval`
  --    in deze functie.
  if a.created_at <= now() - (intrekvenster_minuten() || ' minutes')::interval then
    return jsonb_build_object('ok', false, 'reason', 'window_closed');
  end if;

  if exists (select 1 from approval_withdrawals x where x.approval_id = a.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_withdrawn');
  end if;

  insert into approval_withdrawals (approval_id, completion_id, approver_id)
  values (a.id, a.completion_id, a.approver_id);

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (a.approver_id, null, a.group_id, -1, 'correction', 'completion', a.completion_id);

  if a.status <> 'approved' then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  select * into c from completions   where id = a.completion_id;
  select * into w from weekly_goals  where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  select count(*) into nog_geldig
  from completion_approvals b
  where b.completion_id = a.completion_id
    and b.id <> a.id
    and b.status = 'approved'
    and not exists (select 1 from approval_withdrawals x where x.approval_id = b.id);

  if nog_geldig > 0 then
    return jsonb_build_object('ok', true, 'reverted', false);
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
  else
    punten := w.points_floor;
  end if;

  update weekly_goals set status = 'pending' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, a.group_id, -punten, 'correction', 'weekly_goal', w.id);

  perform herbereken_reeks(g_owner, w.goal_id);

  tekst := weergavenaam(a.approver_id) || ' bevestigde de week van '
        || weergavenaam(a.subject_id) || '.';

  select count(*) into treffers
  from chat_messages m
  where m.group_id     = a.group_id
    and m.type         = 'system'
    and m.system_event = 'completion_approved'
    and m.body         = tekst
    and m.created_at  >= a.created_at;

  if treffers = 1 then
    delete from chat_messages m
    where m.group_id     = a.group_id
      and m.type         = 'system'
      and m.system_event = 'completion_approved'
      and m.body         = tekst
      and m.created_at  >= a.created_at;
  end if;

  return jsonb_build_object('ok', true, 'reverted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Zodat het getal niet stil terugkomt op twee plekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Smal met opzet. Een algemene "lees de bron van elke functie"-RPC zou het
--    hele schema uitleesbaar maken vanuit de API, en dat is een prijs die deze
--    controle niet waard is. Deze functie beantwoordt één vraag en geeft geen
--    broncode terug.
--
-- ⚠️ Zonder deze bewaking is een `intrekvenster_minuten()` die door niemand
--    aangeroepen wordt net zo groen als eentje die de afdwinging stuurt — en
--    dan staat het getal weer op twee plekken, alleen met een extra functie
--    ernaast. Vraag 3 uit regel 18.

create or replace function intrekvenster_bewaking()
returns table(bevinding text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select 'trek_goedkeuring_in() gebruikt intrekvenster_minuten() niet'::text
  where not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trek_goedkeuring_in'
      and pg_get_functiondef(p.oid) like '%intrekvenster_minuten()%'
  )

  union all

  select 'trek_goedkeuring_in() draagt nog een eigen interval'::text
  where exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trek_goedkeuring_in'
      and pg_get_functiondef(p.oid) ~ 'interval ''[0-9]+ minutes'''
  );
$$;

comment on function intrekvenster_bewaking() is
  'Hoort leeg te zijn: trek_goedkeuring_in() rekent met intrekvenster_minuten() '
  'en draagt geen eigen interval meer. Zonder deze controle staat het getal weer '
  'op twee plekken. Zie migratie 0099 en tests/rls/intrekvenster.test.ts.';

revoke all on function intrekvenster_bewaking() from public, anon, authenticated;
grant execute on function intrekvenster_bewaking() to service_role;
