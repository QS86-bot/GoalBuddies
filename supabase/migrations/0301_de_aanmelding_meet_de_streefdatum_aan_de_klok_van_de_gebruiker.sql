-- 0301_de_aanmelding_meet_de_streefdatum_aan_de_klok_van_de_gebruiker.sql — de
-- peildag komt van de server en niet van de client, op beide plekken waar hij
-- telt: de weigertak van `zoek_buddies_aan()` en de bak van `buddyzoek_stand()`.
--
-- ROLLBACK-PAD:
--   -- zoek_buddies_aan(uuid, boolean) woordelijk terug uit 0299 §6.
--   drop function if exists public.buddyzoek_stand(uuid);
--   -- buddyzoek_stand(uuid, date) woordelijk terug uit 0299 §8.
--
--   ⚠️ De drop hoort er bij `buddyzoek_stand` wél: zijn handtekening verandert
--      van (uuid, date) naar (uuid), en `or replace` kan dat niet. Terugzetten is
--      dus ook een drop en een create, en de clientcode moet mee.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-233, gevonden door `klokgrens:controle` — en pas nadat er een volledige
-- lokale stack stond. 📏 Die controle meldde in de poort daarvoor **ongemeten**,
-- en ongemeten is niet groen: zodra hij kon meten lag dit er meteen.
--
-- `current_date` is de dag van de database. 📏 `show timezone` geeft op dit
-- project `Etc/UTC`, met lege `rolconfig` op alle rollen. De tak eromheen
-- **weigert** een aanmelding met `datum_verstreken`, dus iemand in een tijdzone
-- vóór of achter UTC kreeg rond middernacht te horen dat zijn streefdatum
-- voorbij was terwijl dat bij hém niet zo was.
--
-- ⚠️ Domeinregel 2: "vandaag" en "deze week" worden berekend in de tijdzone van
--    de gebruiker. Een weigering op een grens is precies de plek waar dat telt —
--    en het is dezelfde klasse als de streak die om middernacht verkeerd breekt,
--    waar die regel letterlijk over gaat.
--
-- ⚠️ **Geen nieuwe berekening maar de bestaande helper.** `eigenaarsdatum(uuid)`
--    doet `(now() at time zone profiles.tz)::date` en bestaat sinds 0288 voor
--    exact deze vraag. `authenticated` mag hem niet aanroepen; `zoek_buddies_aan`
--    is `security definer` en komt er wel langs. Een eigen `at time zone` hier
--    zou een tweede antwoord op dezelfde vraag zijn — correctheidsregel 7.
--
-- ⚠️ **Waarom niet een `p_vandaag`-argument zoals `buddyzoek_stand()` heeft.**
--    Dat zou de handtekening wijzigen van een functie die al op productie staat,
--    én de peildag in handen van de client leggen bij een **weigering**. Bij
--    `buddyzoek_stand()` kan dat: liegen over je eigen peildag geeft je een
--    verkeerd getal over je eigen bak en verder niets. Hier beslist het of je
--    aanmelding doorgaat, en dan hoort de server het zelf te weten.
--
-- ---------------------------------------------------------------------------

create or replace function public.zoek_buddies_aan(p_goal_id uuid, p_bevestigd boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_status  text;
  v_target  date;
  v_wacht   integer;
  v_groepen integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Niet ingelogd';
  end if;

  if buddyzoekopdrachten_over() <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select g.status, g.target_date into v_status, v_target
  from goals g
  where g.id = p_goal_id and g.owner_id = (select auth.uid());

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  -- ⚠️⚠️ **De klok van de eigenaar en niet die van de server** — en hier stond
  --    `current_date`. Dat is de dag van de database (📏 `show timezone` geeft
  --    `Etc/UTC` op dit project), en deze tak **weigert** een aanmelding met
  --    `datum_verstreken`. Iemand in een tijdzone vóór of achter UTC kreeg rond
  --    middernacht dus te horen dat zijn streefdatum voorbij was terwijl dat bij
  --    hém niet zo was — domeinregel 2 zegt dat "vandaag" in de tijdzone van de
  --    gebruiker hoort, en een weigering is precies de plek waar dat telt.
  --
  --    `eigenaarsdatum()` is de bestaande helper daarvoor en geen nieuwe
  --    berekening: `(now() at time zone profiles.tz)::date`. `authenticated` mag
  --    hem niet aanroepen; deze functie is definer en komt er wel langs.
  if v_target is null or v_target < public.eigenaarsdatum((select auth.uid())) then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  -- Idempotent: geen fout, maar ook geen tweede rij. De partiële unieke index
  -- is de tweede grendel, voor het geval twee verzoeken elkaar kruisen.
  if exists (
    select 1 from goal_match_queue q
    where q.goal_id = p_goal_id and q.status = 'wachtend'
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_queued');
  end if;

  select count(*)::integer into v_wacht
  from goal_match_queue q
  where q.user_id = (select auth.uid()) and q.status = 'wachtend';

  if v_wacht >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_queued');
  end if;

  -- ⚠️ Hetzelfde plafond als `create_group()` en `join_group_with_code()`. Drie
  --    tellingen van één limiet die verschillend rekenen, is een limiet die van
  --    je route afhangt — 0287 waarschuwt daar zelf voor.
  select count(*)::integer into v_groepen
  from group_members m
  where m.user_id = (select auth.uid()) and m.status <> 'inactive';

  if v_groepen >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  insert into goal_match_queue (goal_id, user_id, expires_at)
  values (p_goal_id, (select auth.uid()), now() + interval '14 days');

  return jsonb_build_object('ok', true);
end;
$function$

;

revoke all on function public.zoek_buddies_aan(uuid, boolean) from public, anon, authenticated;
grant execute on function public.zoek_buddies_aan(uuid, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- De stand telt tegen de serverdag, en dat is een gesloten orakel
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is een gemeten lek en geen voorzorg.** `buddyzoek_stand()` nam zijn
--    peildag als argument, en die bepaalde niet alleen míjn band maar ook de band
--    waartegen anderen vergeleken worden. `nog_nodig` is afgekapt op 0/1/2, maar
--    dat begrenst de **amplitude** en niet de **resolutie**: door de peildag dag
--    voor dag te verschuiven schuift het venster, en op de bandgrens kantelt het
--    getal.
--
--    📏 Gereproduceerd op 05-10-2026, met twee wachtenden in dezelfde categorie
--    en week-startdag. A stuurt zijn eigen peildag mee en leest:
--
--        2026-06-14 t/m 06-16  →  nog_nodig = 1
--        2026-06-17 en later   →  nog_nodig = 2
--
--    Het kantelpunt geeft de bandgrens, en daaruit volgt de streefdatum van B:
--    **2027-06-17** — precies de werkelijke waarde. Met een tiental aanroepen
--    leest iemand dus de exacte `goals.target_date` van elke andere wachtende in
--    zijn categorie, en er zit geen dagrem op deze functie. Varieer daarnaast
--    `goals.category` (clientschrijfbaar, twaalf waarden) en je bemonstert de
--    hele ruimte.
--
--    De kop van 0299 beweerde dat de afkapping dit voorkwam. Dat was onwaar.
--
-- ⚠️ **De reparatie is de peildag weghalen, niet begrenzen.** Een tak die een
--    afwijking van meer dan een dag weigert, laat het orakel met een resolutie van
--    één dag staan — en dat is precies de resolutie die het lek had. De server
--    weet zelf welke dag het is: `eigenaarsdatum()`.
--
-- ⚠️ **En het sluit een tweede ding.** De matcher bandeerde tegen UTC en het
--    scherm tegen de tijdzone van het profiel: twee nulpunten voor één band, waar
--    0300 zelf opschrijft dat een sorteersleutel er één hoort te hebben. Nu
--    bandeert de stand tegen de dag van de eigenaar, en de matcher tegen zijn
--    eigen peildag voor de hele run — die laatste is een vergelijking tussen
--    gebruikers en hoort één nulpunt te hebben; deze is er van de kijker en hoort
--    de zijne te zijn.

drop function if exists public.buddyzoek_stand(uuid, date);

create or replace function public.buddyzoek_stand(p_goal_id uuid)
  returns table (
    status    text,
    nog_nodig smallint,
    sinds     timestamptz,
    verloopt  timestamptz,
    group_id  uuid
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with peil as (
    select public.eigenaarsdatum((select auth.uid())) as dag
  ),
  mijn as (
    select q.id, q.status, q.created_at, q.expires_at, q.group_id,
           g.category, public.doelperiode(g.target_date, (select dag from peil)) as band,
           p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.goal_id = p_goal_id
      and g.owner_id = (select auth.uid())
      and q.status in ('wachtend', 'gekoppeld')
    order by q.created_at desc
    limit 1
  )
  select
    m.status,
    least(2, greatest(0, 3 - (
      select count(distinct q2.user_id)::integer
      from goal_match_queue q2
      join goals    g2 on g2.id = q2.goal_id
      join profiles p2 on p2.id = q2.user_id
      where q2.status = 'wachtend'
        and q2.expires_at > now()
        and g2.status = 'active'
        and g2.category = m.category
        and public.doelperiode(g2.target_date, (select dag from peil)) = m.band
        and p2.week_start_day = m.week_start_day
    )))::smallint as nog_nodig,
    m.created_at as sinds,
    m.expires_at as verloopt,
    m.group_id
  from mijn m;
$$;

revoke all on function public.buddyzoek_stand(uuid) from public, anon, authenticated;
grant execute on function public.buddyzoek_stand(uuid) to authenticated;

comment on function public.buddyzoek_stand(uuid) is
  'De stand van je eigen wachtopdracht. De peildag komt van de server '
  '(eigenaarsdatum) en niet van de client: als argument was hij een orakel op de '
  'streefdatum van een vreemde — zie de kop van deze migratie. Expliciete '
  'kolomlijst omdat RLS geen kolommen kan beperken (vorm van getuigenissen(), 0169).';
