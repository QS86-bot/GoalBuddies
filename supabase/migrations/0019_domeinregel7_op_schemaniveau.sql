-- 0019_domeinregel7_op_schemaniveau.sql — de belofte uit §4.3 waarmaken
--
-- ROLLBACK-PAD:
--   -- weekly_goals_select terugzetten zoals in 0003_rls.sql
--   drop function if exists group_overview(uuid, date, integer, integer);
--   drop view if exists group_visible_streaks;
--   -- daarna 0005 en 0016 (deel 6 en 7) opnieuw uitvoeren
--   grant update on groups to authenticated;
--
-- ⚠️ Gevonden bij de security-review van EPIC 5, en het is de zwaarste bevinding
--    van deze sessie. `docs/decisions/001-datamodel.md` §4.3 belooft: "daarmee
--    kan een groepsgenoot niet uit de data afleiden dat iemand een week gemist
--    heeft, ook niet door slim te bevragen." Er was geen slimheid voor nodig.
--
--    `weekly_goals_select` gaf elke groepsgenoot de héle rij van een gekoppeld
--    doel, inclusief de kolom `status`, die letterlijk `'missed'` kan zijn. Eén
--    GET op /rest/v1/weekly_goals leverde de volledige lijst gemiste weken van
--    een ander, mét datum. De schermen deden het goed; de database niet.
--
--    Dit is dezelfde rode draad als 0006, 0010 en 0016: RLS beslist over rijen
--    en niet over kolommen. Alleen ging het die drie keer over schrijven, en
--    deze keer over lezen — en dat is de kant die niemand controleerde.
--
--    EPIC 5 bouwt de knop die dit bereikbaar maakt (een doel aan een groep
--    koppelen), dus het hoort in deze epic gedicht te worden.
--
-- ⚠️ Wat hier NIET in zit en wel is gemeld: `goals.risk_status` en
--    `goals.risk_reason` zijn met dezelfde redenering leesbaar voor
--    groepsgenoten, en dat is óók een tegenslagsignaal. Repareren vraagt
--    `goals_select` terug naar eigenaar-only plus een definer-view voor de
--    groep, en dat raakt EPIC 6, 7 en 12 én de policy-matrix in het
--    beslisdocument. Dat is een architectuurwijziging en geen reparatie; hij
--    staat in docs/ENGINEER-REVIEW.md en docs/Q-TODO.docx. Vandaag niet
--    misbruikbaar, want de Risico-radar bestaat nog niet en `risk_status` staat
--    op elke rij op 'on_track'.

-- ---------------------------------------------------------------------------
-- 1. Een groepsgenoot ziet alleen de weken die goed gingen
-- ---------------------------------------------------------------------------
--
-- ⚠️ `pending` en `approved` blijven zichtbaar, en dat moet ook: peer-goedkeuring
--    (EPIC 6) bestaat bij gratie van dat een buddy ziet wat hij goedkeurt.
--    `todo`, `missed`, `carried` en `excused` gaan naar de eigenaar alleen.
--
--    `todo` zit er bewust bij. Het is op zichzelf geen tegenslag, maar samen met
--    de cyclusdatum is het "deze week nog niets gedaan", en dat is precies het
--    soort afleiding waar domeinregel 7 over gaat. Niets in de app leest het van
--    een ander: het groepsoverzicht komt uit `group_overview()` en raakt
--    `weekly_goals` niet aan.

drop policy if exists weekly_goals_select on weekly_goals;
create policy weekly_goals_select on weekly_goals for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = weekly_goals.goal_id and g.owner_id = auth.uid()
    )
    or (
      shares_group_with_goal(weekly_goals.goal_id)
      and weekly_goals.status in ('pending', 'approved')
    )
  );

comment on policy weekly_goals_select on weekly_goals is
  'De eigenaar ziet alles. Een groepsgenoot ziet uitsluitend weken die op '
  'goedkeuring wachten of goedgekeurd zijn — nooit missed, todo of carried '
  '(domeinregel 7). RLS kan geen kolommen beperken, dus de beperking zit op de rij.';

-- ---------------------------------------------------------------------------
-- 2. best_streak verraadt een verbroken reeks
-- ---------------------------------------------------------------------------
--
-- ⚠️ `best_streak > current_streak` is sluitend bewijs dat iemand een reeks
--    verbroken heeft, en dus een week gemist. Het beslisdocument §4.3 zegt met
--    zoveel woorden dat de groep **uitsluitend** `current_streak` mag zien; 0005
--    licht de projectie regel voor regel toe en laat `best_streak` er dan tóch in
--    staan. De test op 0016 controleerde alleen `total_points` en
--    `last_cycle_start` — precies erlangs.

drop function if exists group_overview(uuid, date, integer, integer);
drop view if exists group_visible_streaks;

create view group_visible_streaks
  with (security_invoker = false, security_barrier = true) as
  select s.user_id, s.goal_id, s.current_streak
  from user_streaks s
  join goals g on g.id = s.goal_id and g.owner_id = s.user_id
  where shares_group_with_goal(g.id);

comment on view group_visible_streaks is
  'De enige reekskolom die de groep ziet. Niet total_points, niet '
  'last_cycle_start, en sinds 0019 ook niet best_streak: uit alle drie is een '
  'gemiste week af te leiden.';

revoke all on group_visible_streaks from public, anon;
grant select on group_visible_streaks to authenticated;

create or replace function group_overview(
  p_group_id uuid,
  p_period_start date,
  p_limit integer default 20,
  p_offset integer default 0
)
  returns table (
    user_id            uuid,
    display_name       text,
    avatar_url         text,
    role               text,
    member_status      text,
    joined_at          timestamptz,
    goal_id            uuid,
    goal_title         text,
    goal_target_date   date,
    milestones_total   bigint,
    milestones_done    bigint,
    current_streak     integer,
    closed_this_period boolean,
    total_members      bigint
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select
    m.user_id,
    p.display_name,
    p.avatar_url,
    m.role,
    m.status,
    m.joined_at,
    d.id,
    d.title,
    d.target_date,
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status <> 'dropped'
    ), 0),
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status = 'done'
    ), 0),
    s.current_streak,
    exists (
      select 1 from chain_links c
      where c.group_id = m.group_id
        and c.user_id = m.user_id
        and c.group_period_start = p_period_start
    ),
    count(*) over ()
  from group_members m
  join profiles p on p.id = m.user_id
  left join lateral (
    select gg.id, gg.title, gg.target_date
    from goals gg
    join goal_group_links l on l.goal_id = gg.id
    where l.group_id = m.group_id
      and gg.owner_id = m.user_id
      and gg.status = 'active'
    order by gg.target_date asc
    limit 1
  ) d on true
  left join group_visible_streaks s
    on s.user_id = m.user_id and s.goal_id = d.id
  where m.group_id = p_group_id
  order by m.joined_at asc, m.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function group_overview(uuid, date, integer, integer) is
  'Het groepsoverzicht in één aanroep (5.4). SECURITY INVOKER: de autorisatie '
  'komt van de policies eronder — met één uitzondering die je moet weten, '
  'group_visible_streaks is een definer-view en draagt zijn eigen WHERE. Toont '
  'uitsluitend wat er wél staat: geen puntentotaal, geen last_cycle_start en '
  'sinds 0019 ook geen best_streak.';

revoke all on function group_overview(uuid, date, integer, integer) from public, anon;
grant execute on function group_overview(uuid, date, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De uitnodigingspagina toont niet meer dan nodig aan wie niet ingelogd is
-- ---------------------------------------------------------------------------
--
-- ⚠️ De redenering in 0016 klopte binnen zijn eigen kader ("koppelen is de
--    toestemming; deze functie rekt die niet op") en was toch verkeerd. Koppelen
--    is toestemming voor de gróép, afgedwongen door goal_group_links en
--    shares_group_with_goal(). Deze functie maakte er toestemming van voor
--    iedereen die de code heeft — inclusief iedereen aan wie de link ooit wordt
--    doorgestuurd, en codes verlopen niet.
--
--    Dat is geen domeinregel 7 maar het is wel dezelfde soort belofte: "Marieke
--    Jansen — van het antidepressivum af" hoort niet leesbaar te zijn voor een
--    WhatsApp-groep waar de link in geplakt wordt.
--
-- ⚠️ Wie ingelogd is, ziet wél het volledige beeld. Dat is een echte gebruiker
--    met een account en een profiel, geen voorbijganger, en QS8-59 vraagt
--    uitdrukkelijk om "de échte groep" te tonen. Voor `anon` blijft over: de
--    naam van de groep, hoeveel mensen erin zitten, de huddledag en voornamen.
--
--    Of dit de juiste grens is, is een productbeslissing. Staat als A16 in
--    docs/Q-TODO.docx; dit is de behoudende kant van die keuze.

create or replace function invite_preview(code text)
  returns jsonb
  language plpgsql
  security definer
  stable
  set search_path = public, pg_temp
as $$
declare
  g        groups%rowtype;
  aantal   integer;
  leden    jsonb;
  ingelogd boolean := auth.uid() is not null;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false;

  -- ⚠️ Ingetrokken, verlopen en nooit-bestaan geven hetzelfde antwoord. Een
  --    apart antwoord per geval maakt hiervan een orakel dat vertelt welke codes
  --    bestaan — en dit is het enige eindpunt dat zonder account bereikbaar is.
  if g.id is null then
    return null;
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
      -- Zonder account alleen de voornaam: genoeg om te zien wie er zit, te
      -- weinig om iemand mee te vinden.
      'display_name', case
        when ingelogd then p.display_name
        else split_part(btrim(p.display_name), ' ', 1)
      end,
      'avatar_url', case when ingelogd then p.avatar_url else null end,
      'goal_title', case
        when ingelogd then (
          select gg.title
          from goals gg
          join goal_group_links l on l.goal_id = gg.id
          where l.group_id = g.id
            and gg.owner_id = m.user_id
            and gg.status = 'active'
          order by gg.target_date asc
          limit 1
        )
        else null
      end
    ) as rij
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = g.id and m.status <> 'inactive'
    order by m.joined_at asc
    limit 8
  ) t;

  return jsonb_build_object(
    'group_id',     g.id,
    'group_name',   g.name,
    'icon',         g.icon,
    'huddle_day',   g.huddle_day,
    'member_count', aantal,
    'detailed',     ingelogd,
    'members',      leden
  );
end;
$$;

comment on function invite_preview(text) is
  'De groep achter een uitnodigingslink (5.8). Zonder account: naam, aantal, '
  'huddledag en voornamen. Met account ook volledige namen en gekoppelde '
  'doeltitels. Nooit reeksen, punten of weekstatus.';

revoke all on function invite_preview(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Het kolomslot op groups hoort in Postgres te staan, niet in een rolnaam
-- ---------------------------------------------------------------------------
--
-- ⚠️ `guard_group_update()` beslist op `current_user not in ('authenticated',
--    'anon')`. Dat werkt vandaag, maar het is een deny-list op rolnaam en hij
--    faalt open: elke rol die niet exact zo heet, mag alle kolommen. Komt er ooit
--    een custom access-token-hook of een tweede API-rol bij, dan is de
--    bescherming stil weg en klaagt niets.
--
--    `revoke update (kolom, ...)` dwingt Postgres het op kolomniveau af,
--    ongeacht hoe de rol heet. De trigger blijft staan als tweede slot: die
--    vangt ook het geval waarin iemand ooit per ongeluk `grant update on groups`
--    uitvoert.

revoke update on groups from authenticated, anon;

grant update (name, icon, huddle_day, tz, evidence_policy, approval_rule, season_cadence)
  on groups to authenticated;

-- ---------------------------------------------------------------------------
-- 5. De tijdzone van een groep is clientinvoer en werd niet getoetst
-- ---------------------------------------------------------------------------
--
-- ⚠️ `create_group()` valideerde `group_name` en `huddle_day` maar zette `tz`
--    ongecontroleerd in de rij. Er is geen CHECK op de kolom en `groepSchema`
--    kent het veld niet. Een groep met rommel in `tz` laat
--    `huidigeGroepsperiode()` gooien bij élk lid — `Intl.DateTimeFormat` geeft
--    een RangeError op een onbekende zone — en dan hangt het groepsscherm voor
--    de hele groep permanent in de errorstate. Eén lid kan dat aanrichten.

create or replace function create_group(
  group_name text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw        groups;
  vandaag      integer;
  lidmaatschap integer;
  schone_naam  text;
  schone_tz    text;
  pogingen     integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  schone_naam := btrim(coalesce(group_name, ''));
  if length(schone_naam) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_short');
  end if;
  if length(schone_naam) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  if huddle_day is null or huddle_day < 0 or huddle_day > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_huddle_day');
  end if;

  -- Onbekende zone? Dan de standaard, en geen fout: de tijdzone komt van het
  -- apparaat en niet uit een formulier, dus dit is geen invoerfout van de
  -- gebruiker maar een apparaat dat iets anders zegt dan Postgres kent.
  schone_tz := coalesce(tz, 'Europe/Amsterdam');
  if not exists (select 1 from pg_timezone_names where name = schone_tz) then
    schone_tz := 'Europe/Amsterdam';
  end if;

  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  select count(*) into lidmaatschap
  from group_members
  where user_id = auth.uid() and status <> 'inactive';

  if lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  loop
    pogingen := pogingen + 1;
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz)
      values (schone_naam, auth.uid(), generate_invite_code(), huddle_day, schone_tz)
      returning * into nieuw;
      exit;
    exception when unique_violation then
      if pogingen >= 3 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return jsonb_build_object('ok', true, 'group', to_jsonb(nieuw));
end;
$$;

comment on function create_group(text, smallint, text) is
  'Groep en oprichterslidmaatschap in een transactie (5.1). Geeft een kenmerk '
  'terug in plaats van een exception, en valideert de tijdzone tegen '
  'pg_timezone_names — een onbekende zone laat het groepsscherm voor élk lid '
  'falen.';

revoke all on function create_group(text, smallint, text) from public, anon;
grant execute on function create_group(text, smallint, text) to authenticated;
