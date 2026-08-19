-- 0036_de_ketting_krijgt_schrijvers.sql — QS8-80 (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop trigger if exists week_reviews_ketting on week_reviews;
--   drop function if exists ketting_uit_weekafsluiting();
--   drop function if exists ketting_schakel(uuid, date, date);
--   -- `chain_links` zelf blijft staan. Geschreven schakels zijn geschiedenis en
--   -- worden niet teruggedraaid (domeinregel 6: append-only).
--
-- ⚠️ Waarom deze migratie bestaat. `chain_links` staat sinds 0001 in het schema
--    en had tot vandaag geen enkele schrijver: niet de rollover-functie, niet de
--    app, geen trigger. Daardoor stond het bolletje "deze week al afgesloten" op
--    het groepsoverzicht altijd uit en kon de ketting-mijlpaal van QS8-70 niet
--    gebouwd worden. Dit zijn de twee schrijvers.
--
-- ⚠️ Besluit van Quinten (19-08-2026): een schakel wordt verdiend door de
--    weekafsluiting te doen **of** een weekdoel af te ronden — wat het eerst
--    komt. Vandaar twee schrijvers op één tabel, met de bestaande unieke
--    constraint `chain_links_one_per_period` als dedup. Twee keer verdienen
--    levert één schakel op, en dat is de bedoeling.
--
-- ⚠️ Correctheidsregel 7 bepaalt de vorm van deze migratie. SQL mag de
--    groepsperiode niet uitrekenen — dat is `groupPeriod()` uit `shared/time`,
--    en 0016 zegt het met zoveel woorden. Dat splitst de twee routes:
--
--      1. De weekafsluiting draagt `group_period_start` al als kolom. Die kan
--         een trigger dus letterlijk overnemen: exact, automatisch, en de client
--         hoeft niets te beloven.
--      2. Een weekdoel draagt alleen `cycle_start_date` — de persóónlijke
--         cyclus. Daar de groepsperiode uit afleiden vraagt de huddledag en de
--         tijdzone. Die route loopt daarom via een RPC waarin de client beide
--         data meegeeft, allebei berekend door `shared/time`.
--
-- ⚠️ Wat route 2 wél en niet garandeert. De RPC controleert dat je lid bent, dat
--    je niet uitgezet bent, en dat er echt een goedgekeurd weekdoel in de
--    opgegeven cyclus staat dat aan deze groep gekoppeld is. Wat hij niet kan
--    controleren is of `p_period_start` en `p_cycle_start` bij elkaar horen —
--    daarvoor zou hij moeten rekenen. De plausibiliteitsgrens hieronder beperkt
--    de speelruimte tot een venster van vijf weken. Dat is een grens, geen
--    berekening. Het restrisico staat in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ `chain_links` heeft alleen een SELECT-policy en dat blijft zo. 0003 zegt:
--    "Schakels worden door de rollover-job gezet, niet door de client." Beide
--    functies hieronder zijn SECURITY DEFINER en zijn daarmee de enige weg naar
--    binnen. De tabel blijft dicht voor een rechtstreekse insert.

-- ---------------------------------------------------------------------------
-- 1. Route 1 — de weekafsluiting levert een schakel
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geen `raise exception` in deze trigger, en dat is geen slordigheid.
--    Valkuil 8 uit de werkvoorraad: gooien rolt de hele transactie terug,
--    inclusief de weekafsluiting die de gebruiker net geschreven heeft. Een
--    ketting-schakel is een gevolg van de weekafsluiting en nooit een reden om
--    hem te weigeren. Faalt de insert, dan verliest de groep één schakel; dat is
--    oneindig veel beter dan een verloren weekafsluiting.

create or replace function ketting_uit_weekafsluiting()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    insert into chain_links (group_id, user_id, group_period_start)
    values (new.group_id, new.user_id, new.group_period_start)
    on conflict on constraint chain_links_one_per_period do nothing;
  exception
    when others then
      null;
  end;

  return new;
end;
$$;

comment on function ketting_uit_weekafsluiting() is
  'Schrijft de ketting-schakel bij een weekafsluiting. Neemt group_period_start '
  'letterlijk over uit de rij; rekent zelf niets uit (correctheidsregel 7).';

revoke all on function ketting_uit_weekafsluiting() from public, anon, authenticated;

drop trigger if exists week_reviews_ketting on week_reviews;
create trigger week_reviews_ketting
  after insert on week_reviews
  for each row execute function ketting_uit_weekafsluiting();

-- ---------------------------------------------------------------------------
-- 2. Route 2 — een afgerond weekdoel levert een schakel
-- ---------------------------------------------------------------------------
--
-- ⚠️ `status = 'approved'` is de enige eindstand die telt, en daarmee klopt
--    acceptatiecriterium 3 vanzelf: vloer en plafond staan op `completions` en
--    niet op het weekdoel, dus beide leveren exact dezelfde schakel op. De
--    ketting telt opdagen, niet niveau.
--
-- ⚠️ Geeft een resultaat terug in plaats van te gooien (valkuil 8, migratie
--    0017). Dat is hier extra van belang: de app roept dit aan ná een geslaagde
--    goedkeuring, en een exception zou de indruk wekken dat er iets met die
--    goedkeuring mis is.

create or replace function ketting_schakel(
  p_group_id     uuid,
  p_period_start date,
  p_cycle_start  date
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  geschreven integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if not is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  -- ⚠️ Een grens, geen berekening. De client kiest p_period_start zelf; zonder
  --    bovengrens kon hij een schakel in de toekomst zetten en zonder
  --    ondergrens de hele geschiedenis vullen. Vijf weken is ruim genoeg voor
  --    een late afronding binnen de respijtperiode.
  if p_period_start > current_date or p_period_start < current_date - 35 then
    return jsonb_build_object('ok', false, 'reason', 'period_out_of_range');
  end if;

  if not exists (
    select 1
    from weekly_goals    w
    join goals           g on g.id = w.goal_id
    join goal_group_links l on l.goal_id = g.id
    where g.owner_id         = auth.uid()
      and l.group_id         = p_group_id
      and w.cycle_start_date = p_cycle_start
      and w.status           = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_approved_goal');
  end if;

  insert into chain_links (group_id, user_id, group_period_start)
  values (p_group_id, auth.uid(), p_period_start)
  on conflict on constraint chain_links_one_per_period do nothing;

  get diagnostics geschreven = row_count;

  return jsonb_build_object('ok', true, 'created', geschreven > 0);
end;
$$;

comment on function ketting_schakel(uuid, date, date) is
  'Verdient een ketting-schakel met een goedgekeurd weekdoel — QS8-80. Beide '
  'data komen van shared/time; SQL rekent hier niets uit. Geeft een reason '
  'terug in plaats van te gooien, want de aanroep volgt op een goedkeuring die '
  'niet teruggedraaid mag worden.';

revoke all on function ketting_schakel(uuid, date, date) from public, anon;
grant execute on function ketting_schakel(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De stand van de ketting
-- ---------------------------------------------------------------------------
--
-- ⚠️ Domeinregel 7. Deze functie geeft twee getallen en een vlag terug, en
--    nooit wie er ontbreekt. Binnen de lopende periode betekent een ontbrekende
--    schakel "nog niet" — dezelfde redenering als `closed_this_period` in 0016,
--    en daarom vraagt de app ook hier uitsluitend de lopende periode op.
--
-- ⚠️ Criterium 4: inactieve leden en leden met adempauze blokkeren "voltallig"
--    niet. Ze tellen niet mee in de noemer. Wie eruit gezet is of bewust een
--    pauze neemt, hoort de groep niet in de weg te staan — dat is dezelfde
--    gedachte als domeinregel 8: de reeks dient de gebruiker.
--
-- ⚠️ De adempauze-toets is `current_date between starts_cycle and ends_cycle`.
--    Dat is een datumvergelijking en geen cyclusberekening: `breathers` werkt in
--    persoonlijke cycli en die zijn hier niet om te rekenen naar de
--    groepsperiode. Wie vandaag pauze heeft, telt vandaag niet mee.
--
-- ⚠️ Criterium 5 (vertrek wist de ketting niet) vraagt hier geen code. Schakels
--    hangen aan `profiles` en niet aan het lidmaatschap, dus een vertrokken lid
--    laat zijn schakels staan. De teller hieronder telt alleen de noemer over
--    huidige leden; de schakels in de geschiedenis blijven van iedereen.

create or replace function ketting_stand(
  p_group_id     uuid,
  p_period_start date
)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'schakels', (
      select count(*)
      from chain_links c
      where c.group_id = p_group_id
        and c.group_period_start = p_period_start
    ),
    'in_aanmerking', (
      select count(*)
      from group_members m
      where m.group_id = p_group_id
        and m.status <> 'inactive'
        and not exists (
          select 1
          from breathers b
          join goals gl on gl.id = b.goal_id
          where gl.owner_id = m.user_id
            and current_date between b.starts_cycle and b.ends_cycle
        )
    )
  ) || jsonb_build_object(
    'voltallig', (
      select count(*) from chain_links c
      where c.group_id = p_group_id and c.group_period_start = p_period_start
    ) >= greatest((
      select count(*) from group_members m
      where m.group_id = p_group_id
        and m.status <> 'inactive'
        and not exists (
          select 1 from breathers b join goals gl on gl.id = b.goal_id
          where gl.owner_id = m.user_id
            and current_date between b.starts_cycle and b.ends_cycle
        )
    ), 1)
  )
  where is_group_member(p_group_id);
$$;

comment on function ketting_stand(uuid, date) is
  'De stand van De Ketting in één periode — QS8-80. Twee getallen en een vlag, '
  'nooit wie ontbreekt (domeinregel 7). Inactieve leden en leden met adempauze '
  'tellen niet mee in de noemer. SECURITY INVOKER: de where-regel valt terug op '
  'is_group_member(), dus een buitenstaander krijgt niets.';

revoke all on function ketting_stand(uuid, date) from public, anon;
grant execute on function ketting_stand(uuid, date) to authenticated;
