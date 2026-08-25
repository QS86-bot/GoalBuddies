-- 0091_doorschuiven_in_een_keer.sql — de bevinding van 20-08 over `schuifDoor()`
--
-- ROLLBACK-PAD:
--   drop function if exists public.schuif_weekdoel_door(uuid, date, integer);
--   create or replace function public.markeer_doorgeschoven(p_weekly_goal_id uuid)
--     returns jsonb language plpgsql security definer
--     set search_path = public, pg_temp
--   as $rb$
--   declare w weekly_goals%rowtype;
--   begin
--     if auth.uid() is null then
--       return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
--     end if;
--     select w2.* into w from weekly_goals w2
--       join goals g on g.id = w2.goal_id
--      where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();
--     if w.id is null then
--       return jsonb_build_object('ok', false, 'reason', 'not_owner');
--     end if;
--     if w.status <> 'missed' then
--       return jsonb_build_object('ok', false, 'reason', 'not_missed');
--     end if;
--     update weekly_goals set status = 'carried' where id = p_weekly_goal_id;
--     return jsonb_build_object('ok', true);
--   end;
--   $rb$;
--   revoke all on function public.markeer_doorgeschoven(uuid) from public, anon;
--   grant execute on function public.markeer_doorgeschoven(uuid) to authenticated;
--   drop policy if exists weekly_goals_insert on public.weekly_goals;
--   create policy weekly_goals_insert on public.weekly_goals
--     for insert to authenticated
--     with check (
--       exists (select 1 from goals g where g.id = weekly_goals.goal_id and g.owner_id = auth.uid())
--       and weekdoelen_vandaag() < 200
--     );
--   drop function if exists public.weekdoelen_over();
--   (en `weekdoelen_vandaag()` terug uit 0083)
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Bevinding van 20-08-2026, op 25-08 nagemeten en ongewijzigd. `schuifDoor()`
-- deed twee aanroepen zonder transactie eromheen: `markeer_doorgeschoven()` zette
-- de oude rij op `carried`, daarna maakte `maakWeekdoel()` de nieuwe week.
--
-- ⚠️ **Valt de verbinding daartussen weg, dan is het weekdoel weg.** De oude week
--    staat op `carried` zonder opvolger, en verdwijnt uit het blok "Nog open van
--    eerdere weken" omdat dat alleen `missed` ophaalt. Geen puntenverlies — de
--    week telde al als gemist en het minpunt was geboekt — maar de gebruiker
--    raakt werk kwijt dat hij niet zelf heeft weggegooid, en vanuit de app is er
--    geen weg terug: `status` staat sinds 0023 op slot voor de client.
--
-- **Sinds QS8-106 voor het eerst bereikbaar**; daarvóór riep geen scherm deze
-- functie aan. PostgREST draait elke RPC in zijn eigen transactie, dus één RPC
-- die beide doet is de hele reparatie.
--
-- ⚠️ Bewust géén `raise exception` maar `{ok, reason}`, zoals overal hier. De les
--    van 0017 gaat over definer-RPC's die iets willen ónthouden en dat door een
--    exception zien terugdraaien; hier valt niets te onthouden, maar de aanroeper
--    leest al een `reason` en twee contracten naast elkaar is er één te veel.
--
-- ---------------------------------------------------------------------------
-- De valkuil die deze samenvoeging zélf introduceert
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een SECURITY DEFINER-functie loopt om `weekly_goals_insert` heen, en
--    daarmee om de dagelijkse bovengrens van 0083.** Dat is precies de vorm uit
--    onwrikbare regel 18: twee correcte onderdelen — een atomaire RPC en een
--    policy met een limiet — en de naad ertussen lekt. Zonder deze regel zou het
--    doorschuifpad de limiet omzeilen die 0083 er nu net op heeft gezet, en zou
--    niets daar rood van worden.
--
-- ⚠️ **Het getal 200 mag daarom niet nóg een keer opgeschreven worden.** 0090
--    loste ditzelfde op door de teller het *resterende* budget te laten
--    teruggeven in plaats van het verbruik; die vorm komt hier terug.
--    `weekdoelen_over()` vervangt `weekdoelen_vandaag()`, de policy en de RPC
--    lezen allebei diezelfde functie, en de grens staat op precies één plek.
--
-- ---------------------------------------------------------------------------
-- Wat de nieuwe week overneemt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De inhoud wordt gekopieerd uit de oude rij en niet meegestuurd door de
--    client.** Dat is geen detail: vandaag stuurt `schuifDoor()` de titel en de
--    vloer- en plafondtekst terug die het scherm toevallig in handen heeft, en
--    niets toetst dat die overeenkomen met de rij die wordt doorgeschoven. Wat
--    doorschuift, hoort hetzelfde weekdoel te zijn.
--
-- ⚠️ **`cycle_start_date` en `cycle_index` komen wél van de client, en dat moet
--    ook.** Correctheidsregel 7: geen enkele week- of tijdberekening buiten
--    `shared/time`. De database weet niet wat de week-startdag van deze gebruiker
--    is en hoort dat ook niet uit te rekenen. Dit is dezelfde verdeling als in
--    `maakWeekdoel()`, dus geen nieuw vertrouwen — alleen dezelfde grens, nu op
--    één plek.

/**
 * Hoeveel weekdoelen mag de ingelogde gebruiker nu nog aanmaken?
 *
 * Vervangt `weekdoelen_vandaag()` uit 0083. Zelfde grens, andere richting: het
 * resterende budget in plaats van het verbruik, zodat het getal alleen hier
 * staat en zowel de policy als `schuif_weekdoel_door()` hem leest. Zie 0090 voor
 * dezelfde vorm bij de chat.
 *
 * ⚠️ Faalt dicht bij een lege `auth.uid()` — nul, en niet de hele limiet.
 */
create or replace function public.weekdoelen_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then 0
    else greatest(
      0,
      200 - (
        select count(*)::integer
        from weekly_goals w
        join goals g on g.id = w.goal_id
        where g.owner_id = auth.uid()
          and w.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.weekdoelen_over() is
  'Het resterende weekdoelbudget van de ingelogde gebruiker over het laatste '
  'etmaal (beveiligingsregel 5, grens uit 0083). Geeft zonder sessie nul terug. '
  'De grens van 200 staat hier en nergens anders: weekly_goals_insert én '
  'schuif_weekdoel_door() lezen allebei deze functie.';

revoke all on function public.weekdoelen_over() from public, anon;
grant execute on function public.weekdoelen_over() to authenticated;

-- ⚠️ De eigenaarstoets komt ongewijzigd uit `pg_policies` en is niet
--    gereconstrueerd uit 0083 — de les van 0084.
drop policy if exists weekly_goals_insert on public.weekly_goals;

create policy weekly_goals_insert on public.weekly_goals
  for insert to authenticated
  with check (
    exists (
      select 1 from goals g
      where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()
    )
    and weekdoelen_over() > 0
  );

/**
 * Schuift een gemist weekdoel in één keer door naar een nieuwe cyclus.
 *
 * Zet de oude rij op `carried` én maakt de opvolger, binnen één transactie.
 * PostgREST draait elke RPC in zijn eigen transactie, dus er is geen moment meer
 * waarop het ene wel is gebeurd en het andere niet.
 */
create or replace function public.schuif_weekdoel_door(
  p_weekly_goal_id uuid,
  p_cycle_start_date date,
  p_cycle_index integer
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  w weekly_goals%rowtype;
  nieuw weekly_goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  if p_cycle_index is null or p_cycle_index < 1 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status <> 'missed' then
    return jsonb_build_object('ok', false, 'reason', 'not_missed');
  end if;

  -- ⚠️ De bovengrens van 0083, hier opnieuw. Deze functie is SECURITY DEFINER en
  --    loopt dus om `weekly_goals_insert` heen; zonder deze regel is doorschuiven
  --    het gat in die limiet.
  if weekdoelen_over() < 1 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_deze_dag');
  end if;

  update weekly_goals set status = 'carried' where id = p_weekly_goal_id;

  insert into weekly_goals (
    goal_id, milestone_id, title, floor_text, ceiling_text,
    points_ceiling, points_floor, points_miss,
    cycle_start_date, cycle_index, ai_generated
  )
  values (
    w.goal_id, w.milestone_id, w.title, w.floor_text, w.ceiling_text,
    w.points_ceiling, w.points_floor, w.points_miss,
    p_cycle_start_date, p_cycle_index, w.ai_generated
  )
  returning * into nieuw;

  return jsonb_build_object('ok', true, 'weekdoel', to_jsonb(nieuw));
end;
$$;

comment on function public.schuif_weekdoel_door(uuid, date, integer) is
  'Zet een gemist weekdoel op carried en maakt de opvolger, in één transactie. '
  'Vervangt het tweeluik markeer_doorgeschoven() + insert, waarbij een afgebroken '
  'verbinding de oude week op carried liet staan zonder opvolger — en dan is het '
  'weekdoel weg zonder dat iemand het weggooide. De cyclus komt van de client '
  '(correctheidsregel 7); de inhoud wordt uit de oude rij gekopieerd.';

revoke all on function public.schuif_weekdoel_door(uuid, date, integer) from public, anon;
grant execute on function public.schuif_weekdoel_door(uuid, date, integer) to authenticated;

-- ⚠️ De twee voorgangers gaan weg in plaats van te blijven staan. Een functie
--    die niemand meer aanroept is precies wat `npm run keten:controle` sinds
--    vandaag meldt, en dode achterdeuren op `weekly_goals` zijn hier duur:
--    `markeer_doorgeschoven()` kan een rij op `carried` zetten en is voor
--    `authenticated` aanroepbaar.
drop function if exists public.markeer_doorgeschoven(uuid);
drop function if exists public.weekdoelen_vandaag();
