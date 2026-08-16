-- 0016_buddy_groups.sql — EPIC 5: uitnodigen, toetreden, overzicht, slapen
--
-- ROLLBACK-PAD:
--   drop trigger if exists groups_guard on groups;
--   drop trigger if exists chain_links_wake on chain_links;
--   drop trigger if exists week_reviews_wake on week_reviews;
--   drop trigger if exists chat_messages_wake on chat_messages;
--   drop function if exists guard_group_update(), wek_groep(),
--     generate_invite_code(), is_group_admin(uuid), rotate_invite_code(uuid),
--     set_invite_revoked(uuid, boolean), invite_preview(text),
--     group_overview(uuid, date, integer, integer),
--     slaap_stille_groepen(integer), create_group(text, smallint, text);
--   drop index if exists groups_created_by_idx, groups_sleep_idx;
--   -- daarna 0009 (create_group met invite_code-parameter) en de policy
--   -- groups_insert uit 0003_rls.sql opnieuw uitvoeren
--
-- ⚠️ Geen enkele datumberekening in dit bestand. `group_overview` krijgt de
--    begindatum van de groepsperiode aangereikt; hij rekent hem niet uit. Welke
--    week het is, wordt uitsluitend in `shared/time` bepaald (CLAUDE.md,
--    correctheidsregel 7). `slaap_stille_groepen` telt dagen sinds de laatste
--    activiteit en dat is geen cyclusrekenwerk maar een simpele leeftijd.
--
-- ⚠️ Rode draad uit 0006 en 0010, hier voor de derde keer: **een policy kan geen
--    kolommen beperken.** `groups_update` staat een beheerder toe de rij aan te
--    raken, en dus ook `invite_code` — een beheerder kon zijn eigen code
--    verzinnen ("welkom") en daarmee het acceptatiecriterium "niet raadbaar"
--    onderuit halen. Dat is punt 1 hieronder.

-- ---------------------------------------------------------------------------
-- 0. Grenzen op één plek
-- ---------------------------------------------------------------------------
--
-- Bewust constanten in de functies en geen configuratietabel: een limiet die je
-- kunt aanpassen zonder migratie, is een limiet die niemand terugvindt.
--
--   12 tekens uit een alfabet van 30  ≈ 59 bits
--   10 groepen per gebruiker per dag
--   10 actieve lidmaatschappen per gebruiker
--   12 leden per groep
--   20 toetredingspogingen per gebruiker per dag  (stond al in 0008)
--
-- ⚠️ De bindende grens is het lidmaatschap, niet de dagteller: je zit in
--    hoogstens tien groepen en je bent lid van elke groep die je aanmaakt, dus
--    verder dan tien kom je sowieso niet. De dagteller vangt de route die daar
--    omheen loopt — aanmaken, verwijderen, opnieuw aanmaken — en telt daarom
--    rijen die er nog zijn plus niets meer. Hij hoort niet in de weg te zitten
--    van iemand die zijn groepen aan het inrichten is.

-- ---------------------------------------------------------------------------
-- 1. De uitnodigingscode wordt door de server gemaakt, niet door de client
-- ---------------------------------------------------------------------------
--
-- ⚠️ `random()` is hier fout. Dat is een gewone PRNG met een voorspelbare
--    toestand per sessie; "niet raadbaar" is dan een aanname over hoe druk de
--    server het heeft. `extensions.gen_random_bytes()` komt uit pgcrypto en is
--    wél cryptografisch.
--
-- ⚠️ Verwerpen in plaats van modulo. 256 is geen veelvoud van 30, dus `byte % 30`
--    maakt de eerste zestien tekens vaker gekozen dan de rest. De scheefheid is
--    klein, maar hem weglaten kost één regel en dan is er niets uit te leggen.
--
-- Het alfabet mist 0/O, 1/I/L en U: die worden verkeerd overgetypt, en U komt
-- niet voor zodat er geen woord in de code kan ontstaan dat je liever niet in een
-- groepschat plakt.

create or replace function generate_invite_code()
  returns text
  language plpgsql
  volatile
  set search_path = public, pg_temp
as $$
declare
  alfabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  lengte  constant integer := 12;
  drempel constant integer := 240;   -- 8 * 30, alles daarboven wordt verworpen
  code    text := '';
  brokken bytea;
  b       integer;
  i       integer;
begin
  while length(code) < lengte loop
    brokken := extensions.gen_random_bytes(32);

    for i in 0..31 loop
      exit when length(code) >= lengte;
      b := get_byte(brokken, i);
      continue when b >= drempel;
      code := code || substr(alfabet, (b % 30) + 1, 1);
    end loop;
  end loop;

  return code;
end;
$$;

comment on function generate_invite_code() is
  'Twaalf tekens uit een alfabet van dertig, uit pgcrypto en zonder modulo-'
  'scheefheid. Ongeveer 59 bits: met de limiet van twintig pogingen per '
  'gebruiker per dag is raden geen route.';

revoke all on function generate_invite_code() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Een groep aanmaken — code van de server, plus een dagelijkse limiet
-- ---------------------------------------------------------------------------
--
-- De oude vorm (0009) nam de code van de client. Dat is dezelfde fout als de
-- vier client-gekozen waarden die 0006 en 0007 hebben dichtgezet: als de client
-- de waarde kiest, is de eigenschap die je ervan verwacht een verzoek en geen
-- garantie.
--
-- ⚠️ De limiet telt rijen in `groups`, niet in `invite_events`. Dat scheelt een
--    kolom op een bestaande tabel én het telt het enige dat telt: hoeveel
--    groepen er echt zijn ontstaan.

drop function if exists create_group(text, text, smallint, text);

create or replace function create_group(
  group_name text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam'
)
  returns groups
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw        groups;
  vandaag      integer;
  lidmaatschap integer;
  schone_naam  text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  schone_naam := btrim(coalesce(group_name, ''));
  if length(schone_naam) < 2 or length(schone_naam) > 60 then
    raise exception 'Kies een groepsnaam van 2 tot 60 tekens';
  end if;

  if huddle_day is null or huddle_day < 0 or huddle_day > 6 then
    raise exception 'De huddledag moet tussen 0 (zondag) en 6 (zaterdag) liggen';
  end if;

  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    raise exception 'Je hebt vandaag al tien groepen aangemaakt. Morgen kan het weer.';
  end if;

  select count(*) into lidmaatschap
  from group_members
  where user_id = auth.uid() and status <> 'inactive';

  if lidmaatschap >= 10 then
    raise exception 'Je zit al in tien groepen. Verlaat er een om ruimte te maken.';
  end if;

  insert into groups (name, created_by, invite_code, huddle_day, tz)
  values (schone_naam, auth.uid(), generate_invite_code(), huddle_day, tz)
  returning * into nieuw;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return nieuw;
end;
$$;

comment on function create_group(text, smallint, text) is
  'Groep en oprichterslidmaatschap in een transactie (5.1). De uitnodigingscode '
  'komt van de server; tien groepen per gebruiker per dag, tien lidmaatschappen '
  'in totaal.';

revoke all on function create_group(text, smallint, text) from public, anon;
grant execute on function create_group(text, smallint, text) to authenticated;

-- Rechtstreeks in `groups` schrijven is geen route meer. Zonder deze wijziging
-- loopt de client om `create_group` heen: eigen code, geen dagelimiet.
drop policy if exists groups_insert on groups;
create policy groups_insert on groups for insert to authenticated
  with check (false);

comment on policy groups_insert on groups is
  'Bewust altijd onwaar. Een groep ontstaat uitsluitend via create_group(), '
  'anders kiest de client zijn eigen uitnodigingscode en omzeilt hij de '
  'dagelijkse limiet.';

-- ---------------------------------------------------------------------------
-- 3. Wat een beheerder aan zijn groep mag veranderen
-- ---------------------------------------------------------------------------
--
-- `groups_update` laat een beheerder de hele rij bijwerken. Wat hij mag: naam,
-- icoon, huddledag, tijdzone, bewijsregel, goedkeuringsregel, seizoensritme.
-- Wat vastligt: de uitnodigingscode (die loopt via rotate_invite_code), de
-- oprichter, de aanmaakdatum, en de slaapstand met zijn activiteitsstempel —
-- want anders zet een beheerder de groep handmatig wakker zonder dat er iets
-- gebeurd is, en dan betekent "actief" niets meer.

-- ⚠️ SECURITY INVOKER, en dat is hier het slot en niet de slordigheid. Deze
--    functie kijkt naar `current_user`: bij een verzoek uit de app is dat
--    `authenticated` (of `anon`), en bij alles wat via een SECURITY
--    DEFINER-functie of de service-role loopt is het de eigenaar van die functie.
--    Zou hij zelf `security definer` zijn, dan stond er altijd `postgres` en was
--    het onderscheid weg — en dan draaien rotate_invite_code() en
--    set_invite_revoked() hun eigen wijziging meteen weer terug.
--
--    Deze functie bevraagt geen enkele tabel, dus er is ook geen recursie die om
--    definer vraagt (anders dan bij guard_group_member_update in 0006).

create or replace function guard_group_update()
  returns trigger
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_by       := old.created_by;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;

  return new;
end;
$$;

comment on function guard_group_update() is
  'RLS kan geen kolommen beperken. De uitnodigingscode, de oprichter en de '
  'slaapstand liggen hiermee vast; een beheerder verandert naam, huddledag en '
  'de groepsinstellingen.';

drop trigger if exists groups_guard on groups;
create trigger groups_guard
  before update on groups
  for each row execute function guard_group_update();

revoke all on function guard_group_update() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Code vernieuwen en intrekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Beide draaien als SECURITY DEFINER en moeten dus zélf controleren of de
--    aanroeper beheerder is. Dat is de prijs van definer: de policy kijkt niet
--    mee.
--
-- Intrekken en vernieuwen zijn twee handelingen. Intrekken sluit de deur (de
-- oude link werkt niet meer, er komt geen nieuwe). Vernieuwen geeft een nieuwe
-- code en opent de deur weer — dat is wat je doet als een link ergens is
-- rondgestuurd waar hij niet hoorde.

create or replace function is_group_admin(gid uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

comment on function is_group_admin(uuid) is
  'Beheerderstoets voor SECURITY DEFINER-functies, die zelf niet onder RLS '
  'draaien. Zelfde reden als is_group_member: de policy op group_members zou '
  'anders in recursie lopen.';

revoke all on function is_group_admin(uuid) from public, anon;
grant execute on function is_group_admin(uuid) to authenticated;

create or replace function rotate_invite_code(p_group_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw text;
begin
  if not is_group_admin(p_group_id) then
    raise exception 'Alleen een beheerder van deze groep kan de link vernieuwen';
  end if;

  nieuw := generate_invite_code();

  update groups
  set invite_code = nieuw, invite_revoked = false
  where id = p_group_id;

  return nieuw;
end;
$$;

comment on function rotate_invite_code(uuid) is
  'Nieuwe uitnodigingscode voor een groep (5.1, "intrekbaar"). De oude link '
  'werkt daarna niet meer.';

revoke all on function rotate_invite_code(uuid) from public, anon;
grant execute on function rotate_invite_code(uuid) to authenticated;

create or replace function set_invite_revoked(p_group_id uuid, p_revoked boolean)
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if not is_group_admin(p_group_id) then
    raise exception 'Alleen een beheerder van deze groep kan de link sluiten';
  end if;

  update groups set invite_revoked = coalesce(p_revoked, true) where id = p_group_id;

  return coalesce(p_revoked, true);
end;
$$;

comment on function set_invite_revoked(uuid, boolean) is
  'Sluit of heropent de uitnodigingslink zonder de code te vervangen.';

revoke all on function set_invite_revoked(uuid, boolean) from public, anon;
grant execute on function set_invite_revoked(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Toetreden — nu ook met een bovengrens op de groep
-- ---------------------------------------------------------------------------
--
-- Vervangt de versie uit 0008. Wat blijft: elke póging telt mee, en een
-- ingetrokken code is niet te onderscheiden van een code die nooit bestaan heeft.
-- Wat erbij komt: een groep is vol bij twaalf actieve leden, en een gebruiker zit
-- in hoogstens tien groepen (Q-TODO A8, "nog open").
--
-- ⚠️ Al lid? Dan is dit geen fout maar een succes (5.2). De acceptatiecriteria
--    noemen dat met naam: bij Habit Huddle liep hier stil elke uitnodiging dood.

create or replace function join_group_with_code(code text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target       groups%rowtype;
  pogingen     integer;
  leden        integer;
  lidmaatschap integer;
  al_lid       boolean;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  if pogingen >= 20 then
    raise exception 'Te veel pogingen. Probeer het morgen opnieuw.';
  end if;

  -- ⚠️ Eerst loggen, dan pas zoeken. Andersom telt een mislukte poging niet mee,
  --    en juist die wil je tellen — brute-force bestaat uit mislukte pogingen.
  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    raise exception 'Deze uitnodigingslink werkt niet meer';
  end if;

  select exists (
    select 1 from group_members
    where group_id = target.id and user_id = auth.uid()
  ) into al_lid;

  -- Wie er al in zit, komt gewoon binnen: geen limiettoets, geen foutmelding.
  if not al_lid then
    select count(*) into leden
    from group_members
    where group_id = target.id and status <> 'inactive';

    if leden >= 12 then
      raise exception 'Deze groep zit vol';
    end if;

    select count(*) into lidmaatschap
    from group_members
    where user_id = auth.uid() and status <> 'inactive';

    if lidmaatschap >= 10 then
      raise exception 'Je zit al in tien groepen. Verlaat er een om ruimte te maken.';
    end if;
  end if;

  -- ⚠️ Bewust GEEN onvoorwaardelijke `set status = 'active'`. Dat liet een lid
  --    dat een beheerder op 'inactive' had gezet zichzelf terugzetten met de code
  --    die hij nog had — een moderatie-bypass. Terugkeren na een zelfgekozen
  --    pauze mag wel: alleen 'paused' gaat terug naar actief.
  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update
    set status = case
      when group_members.status = 'paused' then 'active'
      else group_members.status
    end;

  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return target.id;
end;
$$;

comment on function join_group_with_code(text) is
  'Enige route naar lidmaatschap (5.2). Twintig pogingen per gebruiker per dag, '
  'twaalf leden per groep, tien groepen per gebruiker. Al lid worden is een '
  'succes en geen fout.';

revoke all on function join_group_with_code(text) from public, anon;
grant execute on function join_group_with_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. De gastvrije uitnodigingslink (5.8)
-- ---------------------------------------------------------------------------
--
-- Wie de link heeft, ziet de échte groep zonder account: naam, hoeveel mensen,
-- en waar ze aan werken. Een uitnodiging die op een loginscherm eindigt is een
-- verloren buddy.
--
-- ⚠️ Wat er wél in mag en waarom. Een doel komt hier alleen in als het expliciet
--    aan déze groep gekoppeld is (5.3). Koppelen is de toestemming; deze functie
--    rekt die niet op, hij gebruikt hem.
--
-- ⚠️ Wat er niet in mag: reeksen, punten, weekstatus, notities, chat, bewijs.
--    Alles wat "hoe gáát het met je" beantwoordt, blijft binnen de groep
--    (domeinregel 7 en 10). Hier staat alleen wie er zijn en waar ze mee bezig
--    zijn.
--
-- ⚠️ Deze functie is aanroepbaar zonder in te loggen en dus niet aan een
--    gebruiker te koppelen: rate limiting per gebruiker kán hier niet. De
--    bescherming zit in de entropie van de code (§1). Staat als openstaand punt
--    in docs/ENGINEER-REVIEW.md.

create or replace function invite_preview(code text)
  returns jsonb
  language plpgsql
  security definer
  stable
  set search_path = public, pg_temp
as $$
declare
  g      groups%rowtype;
  aantal integer;
  leden  jsonb;
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
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'goal_title', (
        select gg.title
        from goals gg
        join goal_group_links l on l.goal_id = gg.id
        where l.group_id = g.id
          and gg.owner_id = m.user_id
          and gg.status = 'active'
        order by gg.target_date asc
        limit 1
      )
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
    'members',      leden
  );
end;
$$;

comment on function invite_preview(text) is
  'De groep achter een uitnodigingslink, zonder account (5.8). Uitsluitend naam, '
  'aantal en gekoppelde doelen — geen reeksen, punten of weekstatus.';

revoke all on function invite_preview(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Het groepsoverzicht in één query (5.4)
-- ---------------------------------------------------------------------------
--
-- ⚠️ De klassieke N+1 van dit project, met naam genoemd in het beslisdocument
--    (§3). Eén aanroep levert de hele pagina: lid, gekoppeld doel,
--    mijlpaalvoortgang, reeks en of deze periode al afgesloten is.
--
-- ⚠️ SECURITY INVOKER, en dat is het hele ontwerp. De functie voegt geen enkel
--    recht toe: `group_members`, `profiles`, `goals`, `milestones` en
--    `chain_links` staan gewoon onder hun eigen policies, en de reeks komt uit
--    `group_visible_streaks` — de view die `total_points` en `last_cycle_start`
--    wegprojecteert omdat uit allebei een gemiste week af te leiden is (0005).
--    Een niet-lid krijgt hier nul rijen zonder dat deze functie daar iets voor
--    doet.
--
-- ⚠️ `p_period_start` komt van de aanroeper en wordt hier niet uitgerekend. De
--    groepsperiode is `groupPeriod()` uit `shared/time`; SQL kent de huddledag
--    en de tijdzone wel, maar mag er niet mee rekenen (correctheidsregel 7).
--
-- ⚠️ Domeinregel 7. `closed_this_period` is een aanwezigheidssignaal en geen
--    prestatie: De Ketting telt opdagen. De app vraagt uitsluitend de lópende
--    periode op, waarin "nog niet" niets anders betekent dan nog niet. Er komt
--    geen enkele kolom in die vertelt hoe vaak iemand iets níét gedaan heeft.
--
-- ⚠️ Gecorreleerde subqueries voor de mijlpalen, geen tweede left join. Twee
--    joins vermenigvuldigen elkaars rijen (de fout die 0013 beschrijft), en een
--    doel met drie mijlpalen telt er dan ineens negen.

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
    best_streak        integer,
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
    s.best_streak,
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
  'Het groepsoverzicht in één aanroep (5.4). SECURITY INVOKER: alle autorisatie '
  'komt van de policies van de onderliggende tabellen. Toont uitsluitend wat er '
  'wél staat — nooit een gemiste week van iemand anders.';

revoke all on function group_overview(uuid, date, integer, integer) from public, anon;
grant execute on function group_overview(uuid, date, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Slapende groepen (5.9)
-- ---------------------------------------------------------------------------
--
-- Dertig dagen stil: de groep slaapt, er komt één afsluitend bericht en daarna
-- niets meer. Eén afsluiting van welk lid dan ook wekt hem. Een app die blijft
-- duwen bij een dode groep wordt gedempt of verwijderd.
--
-- ⚠️ Geschiedenis, punten en reeksen blijven volledig intact: dit zet één
--    statuskolom om en schrijft één bericht. Er wordt niets verwijderd.

create or replace function wek_groep()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- ⚠️ Systeemberichten wekken niet. Zonder deze regel maakt het afscheidsbericht
  --    van slaap_stille_groepen() de groep in dezelfde transactie weer wakker, en
  --    dan slaapt er nooit iets — een bug die zich als "werkt niet" voordoet en
  --    waar je een avond naar zoekt.
  --
  -- ⚠️ Via `to_jsonb(new)` en niet via `new.type`. Deze functie hangt onder drie
  --    tabellen en twee daarvan hebben helemaal geen kolom `type`; een directe
  --    veldverwijzing geeft daar "record new has no field type", ook binnen een
  --    if die er niet langskomt.
  if (to_jsonb(new) ->> 'type') = 'system' then
    return new;
  end if;

  update groups
  set status = 'active', last_activity_at = now()
  where id = new.group_id;

  return new;
end;
$$;

comment on function wek_groep() is
  'Elke echte activiteit in een groep zet hem wakker en verzet de '
  'activiteitsstempel. Systeemberichten tellen niet mee.';

drop trigger if exists chain_links_wake on chain_links;
create trigger chain_links_wake
  after insert on chain_links
  for each row execute function wek_groep();

drop trigger if exists week_reviews_wake on week_reviews;
create trigger week_reviews_wake
  after insert on week_reviews
  for each row execute function wek_groep();

drop trigger if exists chat_messages_wake on chat_messages;
create trigger chat_messages_wake
  after insert on chat_messages
  for each row execute function wek_groep();

revoke all on function wek_groep() from public, anon, authenticated;

create or replace function slaap_stille_groepen(p_dagen integer default 30)
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id from groups
    where status = 'active'
      and last_activity_at < now() - make_interval(days => greatest(1, coalesce(p_dagen, 30)))
  loop
    update groups set status = 'sleeping' where id = r.id;

    -- ⚠️ Eén bericht, over de groep en over niemand in het bijzonder. Zou hier
    --    staan wie er niet meer kwam, dan is dit precies het schaamtemoment dat
    --    domeinregel 7 verbiedt.
    insert into chat_messages (group_id, sender_id, type, system_event, body)
    values (
      r.id,
      null,
      'system',
      'group_sleeping',
      'Deze groep is een tijdje stil geweest en gaat slapen. Je krijgt hier geen '
      || 'herinneringen meer. Sluit iemand een week af, dan is hij meteen weer wakker.'
    );

    n := n + 1;
  end loop;

  return n;
end;
$$;

comment on function slaap_stille_groepen(integer) is
  'Zet stilgevallen groepen op sleeping met één afscheidsbericht (5.9). Alleen '
  'voor het systeem: draait mee met de rollover-job.';

-- ⚠️ En daarna expliciet terug aan service_role. `revoke ... from public` haalt
--    ook de rol onderuit die hem moet draaien; dat is precies de fout die 0015
--    achteraf heeft moeten rechtzetten voor herbereken_reeks.
revoke all on function slaap_stille_groepen(integer) from public, anon, authenticated;
grant execute on function slaap_stille_groepen(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Indexen op de kolommen die deze migratie is gaan bevragen
-- ---------------------------------------------------------------------------

create index if not exists groups_created_by_idx
  on groups (created_by, created_at desc);

create index if not exists groups_sleep_idx
  on groups (last_activity_at) where status = 'active';
