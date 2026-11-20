-- teamplafond-meting.sql — QS8-665: hoe gedragen de groepsschermen zich bij 13
-- tot 25 leden, en daarboven?
--
-- Draaien op de lokale stack (`npm run rls:stack`), nooit op productie:
--
--   for n in 12 18 25 50; do
--     psql -h localhost -p 5433 -U postgres -d goalbuddies_rls -At -v n=$n -v extra=5000 \
--          -f docs/research/teamplafond-meting.sql | grep -E '^meet\|'
--   done
--
-- `extra` is het aantal profielen dat er daarnaast bestaat, buiten de groep.
-- ⚠️ Dat getal stuurt het plan: met een bijna lege `profiles` kiest Postgres
--    een sequential scan per bericht, en dan wordt de chat kwadratisch in het
--    ledental. Met duizenden profielen kiest hij de index. Meet dus met
--    `extra` in de buurt van productie.
-- ⚠️ En om dezelfde reden draait het script `analyze` op elke tabel die het
--    vult (QS8-699). Zonder dat heeft de planner geen statistieken over de
--    rijen die er net bij kwamen, en meet je een plan dat productie niet kiest.
--
-- Alles staat in één transactie die aan het eind teruggedraaid wordt: de
-- database is daarna precies zoals ervoor.
--
-- Per lid: 3 doelen aan de groep, 12 weekdoelen (de afgelopen 12 weken,
-- goedgekeurd), 6 mijlpalen (de helft gedaan) en 20 chatberichten. Daarna meet
-- het script, als lid 1 en met diens JWT-claims, de vier RPC's die het
-- groepsscherm aanroept: `group_overview()`, `groepschat()`, `groep_teller()`
-- en `ketting_stand()`, plus `openstaande_beoordelingen()`. Elke meting draait
-- vijf keer; het script geeft ze alle vijf, de uitwerking neemt de mediaan.
--
-- ⚠️ Wat dit níet meet: realtime. De lokale stack heeft geen Realtime-dienst.
-- ⚠️ En niet de netwerkkant: PostgREST, TLS en de afstand tot eu-west-3 komen
--    er in productie bij. Dit is de databasetijd.

\set ON_ERROR_STOP 1
begin;

select set_config('meet.n', :'n', true);
select set_config('meet.extra', :'extra', true);

do $$
declare
  v_n     int := current_setting('meet.n')::int;
  v_extra int := current_setting('meet.extra')::int;
  v_leden uuid[] := '{}';
  v_u     uuid;
  v_g     uuid;
  v_doel  uuid;
  v_week  date;
begin
  for i in 1..v_extra loop
    perform public.shim_maak_gebruiker(format('meet-buiten-%s@test.local', i), format('Buiten %s', i));
  end loop;
  analyze profiles;

  for i in 1..v_n loop
    v_u := public.shim_maak_gebruiker(format('meet-%s-%s@test.local', v_n, i), format('Lid %s', i));
    update profiles set week_start_day = 1, tz = 'Europe/Amsterdam' where id = v_u;
    v_leden := v_leden || v_u;
  end loop;

  insert into groups (name, created_by, invite_code, huddle_day, tz)
  values (format('Meetgroep %s', v_n), v_leden[1], public.generate_invite_code(), 1, 'Europe/Amsterdam')
  returning id into v_g;

  for i in 1..v_n loop
    insert into group_members (group_id, user_id, role, status)
    values (v_g, v_leden[i], case when i = 1 then 'admin' else 'member' end, 'active')
    on conflict do nothing;
  end loop;

  for i in 1..v_n loop
    for d in 1..3 loop
      insert into goals (owner_id, title, target_date)
      values (v_leden[i], format('Doel %s.%s', i, d), current_date + 180)
      returning id into v_doel;
      insert into goal_group_links (goal_id, group_id) values (v_doel, v_g);
      for w in 1..12 loop
        v_week := (date_trunc('week', current_date) - make_interval(weeks => w))::date;
        insert into weekly_goals (goal_id, title, cycle_start_date, status)
        values (v_doel, format('Week %s', w), v_week, 'approved');
      end loop;
      for m in 1..6 loop
        insert into milestones (goal_id, title, order_index, status)
        values (v_doel, format('Stap %s', m), m, case when m <= 3 then 'done' else 'todo' end);
      end loop;
    end loop;
    for b in 1..20 loop
      insert into chat_messages (group_id, sender_id, type, body)
      values (v_g, v_leden[i], 'text', format('Bericht %s van lid %s', b, i));
    end loop;
  end loop;

  -- ⚠️ **QS8-699: zonder deze regels meet je de planner en niet de query.**
  --    Alles hierboven staat in één transactie, dus autovacuum heeft deze
  --    tabellen nog niet gezien: de planner houdt `group_members`, `goals` en
  --    `goal_group_links` voor bijna leeg en kiest per lid een scan over alle
  --    koppelingen van de groep. 📏 Zonder deze regels kostte het oude
  --    `group_overview()` 32, 88 en 297 ms bij 12, 25 en 50 leden, mét deze
  --    regels 28, 55 en 127. Productie heeft statistieken; dit is wat telt.
  analyze groups; analyze group_members; analyze goals; analyze goal_group_links;
  analyze weekly_goals; analyze milestones; analyze chat_messages;

  perform set_config('meet.groep', v_g::text, true);
  perform set_config('meet.lid', v_leden[2]::text, true);
end $$;

-- Ter controle: hoeveel rijen er staan.
select 'meet|' || current_setting('meet.n') || '|rijen|'
       || (select count(*) from group_members where group_id = current_setting('meet.groep')::uuid) || ' leden, '
       || (select count(*) from chat_messages where group_id = current_setting('meet.groep')::uuid) || ' berichten';

-- Vanaf hier als lid 2, met zijn JWT-claims, zoals PostgREST het doet.
select set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('meet.lid'), 'role', 'authenticated')::text, true);
set local role authenticated;

\o /dev/null
\set herhaal 'select 1'
\o

create temp table if not exists meet_uitslag (rpc text, ms numeric) on commit drop;

do $$
declare
  v_g   uuid := current_setting('meet.groep')::uuid;
  v_t0  timestamptz;
  v_rpc text;
begin
  foreach v_rpc in array array['group_overview', 'groepschat', 'groep_teller', 'ketting_stand', 'openstaande_beoordelingen'] loop
    for i in 1..5 loop
      v_t0 := clock_timestamp();
      case v_rpc
        when 'group_overview' then
          perform * from public.group_overview(v_g, current_date, 20, null, null);
        when 'groepschat' then
          perform * from public.groepschat(v_g, null, null, 50);
        when 'groep_teller' then
          perform public.groep_teller(v_g);
        when 'ketting_stand' then
          perform * from public.ketting_stand(v_g, current_date);
        when 'openstaande_beoordelingen' then
          perform * from public.openstaande_beoordelingen(20, null, null);
      end case;
      insert into meet_uitslag values (v_rpc, extract(epoch from clock_timestamp() - v_t0) * 1000);
    end loop;
  end loop;
end $$;

select 'meet|' || current_setting('meet.n') || '|' || rpc || '|'
       || string_agg(round(ms, 2)::text, ' ' order by ms)
  from meet_uitslag
 group by rpc
 order by rpc;

rollback;
