-- 0040_weekpas_stand_zonder_sessie.sql — QS8-81 (EPIC 8)
--
-- ROLLBACK-PAD:
--   Er is niets zinnigs om naar terug te draaien: de vorige versie van
--   `weekpas_stand()` gaf zonder sessie de voorraad van elk willekeurig doel
--   terug. Wil je hem toch terug, dan staat hij in 0039.
--
-- ⚠️ Wat er mis was. 0039 begon met:
--
--       if eigenaar is null or eigenaar <> auth.uid() then return null; end if;
--
--    Is `auth.uid()` null, dan is `eigenaar <> auth.uid()` niet `true` maar
--    `null`. De hele voorwaarde wordt dan `false or null` = `null`, de tak wordt
--    niet genomen, en de functie loopt vrolijk door naar de gegevens. Een
--    SECURITY DEFINER-functie die zo eindigt, geeft de voorraad weekpassen van
--    een willekeurig doel terug — en een verbruikte weekpas is het bewijs van
--    een gemiste week (domeinregel 7).
--
--    Gevonden met een proefaanroep als service_role, waar `auth.uid()` null is.
--    In de praktijk stond er nog een deur voor: `anon` heeft geen EXECUTE en
--    komt dus niet eens binnen. Maar "er staat toevallig nog een slot voor" is
--    precies de redenering die dit project al vaker geld heeft gekost, en een
--    JWT met rol `authenticated` zonder `sub`-claim loopt er wél doorheen.
--
-- ⚠️ De rest van de codebase had dit al goed. `zet_doelstatus`,
--    `zet_streefdatum`, `vraag_deadline_verschuiving`, `trek_goedkeuring_in` en
--    `trek_deadline_verzoek_in` beginnen alle vijf met een expliciete
--    `if auth.uid() is null`-tak. Dit is dus geen nieuwe regel maar een
--    bestaande conventie die 0039 niet volgde.
--
--    De les die algemener is dan deze functie: **een vergelijking met een
--    mogelijk lege waarde is geen controle.** `x <> y` is in SQL geen bewering
--    over ongelijkheid zodra één kant null kan zijn; het is een derde antwoord
--    dat zich als "niet waar" gedraagt. Bij elke autorisatietoets in SQL hoort
--    dus eerst de vraag of beide kanten wel bestaan.

create or replace function public.weekpas_stand(p_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  eigenaar   uuid;
  voorraad   integer;
  voltooid   integer;
  verbruikt  date;
begin
  -- ⚠️ Eerst, en apart. Zie de kop van deze migratie.
  if auth.uid() is null then
    return null;
  end if;

  select g.owner_id into eigenaar from goals g where g.id = p_goal_id;

  if eigenaar is null or eigenaar <> auth.uid() then
    return null;
  end if;

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = eigenaar
     and e.goal_id = p_goal_id;

  select max(e.cycle_start_date) into verbruikt
    from week_pass_events e
   where e.user_id = eigenaar
     and e.goal_id = p_goal_id
     and e.event = 'spent';

  select count(distinct w.cycle_start_date) into voltooid
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.status = 'approved';

  return jsonb_build_object(
    'voorraad', voorraad,
    'maximum', weekpas_maximum(),
    'voltooide_cycli', coalesce(voltooid, 0),
    -- Hoeveel voltooide cycli nog tot de volgende pas. Zonder één voltooide
    -- cyclus is dat er één (het cadeau), daarna telt het per zes.
    'tot_volgende', case when coalesce(voltooid, 0) = 0 then 1 else 6 - (voltooid % 6) end,
    'laatst_verbruikt', verbruikt
  );
end;
$$;

revoke all on function public.weekpas_stand(uuid) from public, anon;
grant execute on function public.weekpas_stand(uuid) to authenticated;
