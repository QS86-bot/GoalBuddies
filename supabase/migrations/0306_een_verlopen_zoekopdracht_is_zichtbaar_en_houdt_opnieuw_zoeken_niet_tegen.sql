-- 0306_een_verlopen_zoekopdracht_is_zichtbaar_en_houdt_opnieuw_zoeken_niet_tegen.sql
-- — wie veertien dagen tevergeefs in de buddywachtrij stond, ziet dát, en kan
-- opnieuw zoeken zonder dat een niet-omgezette rij hem tegenhoudt (QS8-643).
--
-- ROLLBACK-PAD:
--   -- 1. buddyzoek_stand(uuid)           woordelijk terug uit 0301
--   -- 2. zoek_buddies_aan(uuid, boolean) woordelijk terug uit 0302
--   -- De rijen die §2 op `verlopen` zette, blijven `verlopen`: dat is dezelfde
--   -- overgang die `verloop_buddyzoekopdrachten()` (0300) ook maakt, en een
--   -- terugzet naar `wachtend` zou een verstreken zoekopdracht weer laten
--   -- koppelen. Er komen geen schema-objecten bij; de wrapper
--   -- `buddyzoek_stand(uuid, date)` uit 0301 blijft ongewijzigd en volgt vanzelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-643, het ene criterium van QS8-233 dat daar niet gebouwd is: na veertien
-- dagen hoort de app iets anders voor te stellen. 📏 Gelezen in 0301 en 0302:
--
--   * `buddyzoek_stand()` gaf alleen `wachtend` en `gekoppeld`. Na het verlopen
--     viel het scherm terug op "je zoekt niet" — precies de stilte die het
--     criterium uitsluit.
--   * `zoek_buddies_aan()` zag een rij die `wachtend` bleef na zijn
--     `expires_at` als lopend, en gaf `already_queued`. Alleen de Edge Function
--     `koppelen` zet `wachtend` op `verlopen`, en 📏 die staat niet op productie
--     (QS8-641, `list_edge_functions`). Zonder die run kon niemand na veertien
--     dagen opnieuw zoeken: de knop meldde succes en er veranderde niets.
--
-- ⚠️ **De handtekeningen veranderen niet**, en dat is met opzet: dezelfde
--    kolommen, dezelfde argumenten. `src/lib/database.types.ts` hoeft niet
--    hergenereerd, en de wrapper `buddyzoek_stand(uuid, date)` uit 0301 geeft de
--    nieuwe stand vanzelf door.
--
-- ⚠️ **Domeinregel 7.** `verlopen` is een tegenvaller, en die is hier alleen
--    voor de eigenaar zichtbaar: de functie filtert op `g.owner_id = auth.uid()`
--    en er komt geen bericht, geen melding en geen groepsoppervlak bij.
--
-- ---------------------------------------------------------------------------
-- 1. De stand kent `verlopen`
-- ---------------------------------------------------------------------------

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
    select
      -- ⚠️ `wachtend` met een verstreken `expires_at` ís verlopen, ook als de
      --    matcher hem nog niet omzette. Zie de kop.
      case
        when q.status = 'wachtend' and q.expires_at <= now() then 'verlopen'
        else q.status
      end as status,
      q.created_at, q.expires_at, q.group_id,
      g.category, public.doelperiode(g.target_date, (select dag from peil)) as band,
      p.week_start_day
    from goal_match_queue q
    join goals    g on g.id = q.goal_id
    join profiles p on p.id = q.user_id
    where q.goal_id = p_goal_id
      and g.owner_id = (select auth.uid())
    -- ⚠️⚠️ **Eerst de nieuwste rij, over élke status, en pas daarna filteren**
    --    (security-review op QS8-643). Met het statusfilter hier viel een
    --    `vertrokken`-rij weg en kwam een oudere `verlopen` boven: zocht je
    --    tevergeefs, zocht je opnieuw en stopte je zelf, dan las je "we hebben
    --    tot … gezocht". 📏 Gereproduceerd door de reviewer in een teruggedraaide
    --    transactie; de toets staat in `tests/rls/buddywachtrij-verlopen.test.ts`.
    order by q.created_at desc
    limit 1
  )
  select
    m.status,
    -- ⚠️ Alleen voor een wachtende rij. Voor `verlopen` en `gekoppeld` zegt het
    --    getal niets, en een telling die niets betekent is nog steeds een
    --    telling van andermans wachtopdrachten.
    (case when m.status = 'wachtend' then
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
      )))
    else 0 end)::smallint as nog_nodig,
    m.created_at as sinds,
    m.expires_at as verloopt,
    m.group_id
  from mijn m
  where m.status in ('wachtend', 'gekoppeld', 'verlopen');
$$;

revoke all on function public.buddyzoek_stand(uuid) from public, anon, authenticated;
grant execute on function public.buddyzoek_stand(uuid) to authenticated;

comment on function public.buddyzoek_stand(uuid) is
  'De stand van je eigen wachtopdracht: wachtend, gekoppeld of verlopen (QS8-643). '
  'De peildag komt van de server (eigenaarsdatum) en niet van de client: als '
  'argument was hij een orakel op de streefdatum van een vreemde (0301). Expliciete '
  'kolomlijst omdat RLS geen kolommen kan beperken (vorm van getuigenissen(), 0169).';

-- ---------------------------------------------------------------------------
-- 2. Opnieuw zoeken na het verlopen, ook als de matcher niet gedraaid heeft
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevestiging blijft verplicht** (`p_bevestigd`), ook voor wie al eens
--    gezocht heeft. QS8-643 noemt het een keuze; dit is de conservatieve kant.
--    Koppelen zet de beoordeelbaarheidsgrendel om, en dat is een consequentie die
--    de gebruiker draagt (domeinregel 5). Twee weken later is de lopende week
--    een andere, en de zin die dat zegt hoort hij opnieuw te lezen.
--
-- Het lichaam is dat van 0302, woordelijk, met één blok erbij direct onder het
-- slot.

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

  -- ⚠️⚠️ **Eén slot per gebruiker, vóór élke telling.** De drie plafonds eronder
  --    zijn lees-dan-schrijf, en PostgREST geeft elk verzoek zijn eigen
  --    transactie: gelijktijdige aanroepen lezen alle hetzelfde oude getal. De
  --    partiële unieke index remt alleen een tweede rij op hetzelfde dóel, dus
  --    twaalf verschillende doelen komen er langs.
  --
  --    📏 Gemeten vóór dit slot, twaalf aanroepen op twaalf doelen van één
  --    gebruiker met een gedeeld startsignaal (werkelijke spreiding 9 ms):
  --    **10** rijen `wachtend`, waar het plafond 3 gelijktijdig en 5 per dag is.
  --    Beide grenzen doorbroken met één burst; mét het slot 3 rijen en negen
  --    keer `too_many_queued`.
  --
  --    ⚠️ Een eerdere meting gaf 8, en een derde gaf 3 — die laatste zónder het
  --    slot, en dus een uitslag die niets bewees. Daar startten de twaalf
  --    psql-processen niet samen: elk moest nog verbinden, dus ze liepen achter
  --    elkaar en de race trad niet op. **Een uitslag die zonder de reparatie
  --    hetzelfde is, meet de reparatie niet** — zelfde klasse als de rode die
  --    niet jouw rode is.
  --
  --    Dit is woordelijk de klasse die QS8-296 in `vraag_ai_job()` sloot (0182),
  --    en dezelfde vorm: `hashtextextended(auth.uid()::text, 0)`. CLAUDE.md bij
  --    regel 19: *fouten worden gekopieerd*.
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text, 0));

  -- ⚠️⚠️ **QS8-643: een verstreken rij is verlopen, ook als de matcher hem nog
  --    niet heeft omgezet.** Alleen `verloop_buddyzoekopdrachten()` zette
  --    `wachtend` op `verlopen`, en die draait alleen in de Edge Function
  --    `koppelen`. Draait die niet — 📏 hij staat vandaag niet op productie
  --    (`list_edge_functions`, QS8-641) — dan blijft een rij van vijftien dagen
  --    oud `wachtend`, en dan:
  --
  --      * gaf de tak hieronder `already_queued` terug: "opnieuw zoeken" meldde
  --        succes en deed niets;
  --      * telde de rij mee voor het plafond van drie gelijktijdige
  --        zoekopdrachten.
  --
  --    Hier, onder het slot en vóór elke telling, en alleen voor de eigen rijen
  --    van de aanroeper. Dezelfde overgang en dezelfde `decided_at` als
  --    `verloop_buddyzoekopdrachten()`: één betekenis van `verlopen`, twee
  --    plekken die hem mogen zetten.
  update goal_match_queue
  set status = 'verlopen', decided_at = now()
  where user_id = (select auth.uid())
    and status = 'wachtend'
    and expires_at <= now();

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
