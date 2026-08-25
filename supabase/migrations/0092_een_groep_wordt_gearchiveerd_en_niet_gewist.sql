-- 0092_een_groep_wordt_gearchiveerd_en_niet_gewist.sql — bevinding van 16-08
--
-- ROLLBACK-PAD:
--   drop policy if exists groups_delete on public.groups;
--   create policy groups_delete on public.groups
--     for delete to authenticated using (is_group_admin(id));
--   drop function if exists public.archiveer_groep(uuid, boolean);
--   create or replace function public.is_group_member(gid uuid) returns boolean
--     language sql stable security definer set search_path = public, pg_temp
--   as $rb$ select exists (select 1 from group_members
--       where group_id = gid and user_id = auth.uid() and status <> 'inactive'); $rb$;
--   create or replace function public.is_group_admin(gid uuid) returns boolean
--     language sql stable security definer set search_path = public, pg_temp
--   as $rb$ select exists (select 1 from group_members
--       where group_id = gid and user_id = auth.uid() and role = 'admin'
--         and status <> 'inactive'); $rb$;
--   alter table public.groups drop constraint groups_status_valid;
--   alter table public.groups add constraint groups_status_valid
--     check (status in ('active', 'sleeping'));
--   alter table public.group_events drop constraint group_events_type_valid;
--   alter table public.group_events add constraint group_events_type_valid
--     check (event_type = 'visibility_changed');
--   (en `create_group()` terug zonder de archiefuitzondering)
--
-- ⚠️ Terugrollen kan alleen zolang er geen groep op `archived` staat. Zet die
--    eerst terug op `active`, anders weigert de CHECK.
--
-- ---------------------------------------------------------------------------
-- Wat er open stond
-- ---------------------------------------------------------------------------
--
-- Bevinding van 16-08-2026, op 25-08 nagemeten en ongewijzigd. Twee dingen die
-- aan elkaar hangen:
--
--   1. `groups_delete` was `is_group_admin(id)`. Elke beheerder kon de groep
--      weggooien, en dat cascadeert naar `group_members`, `goal_group_links`,
--      `chain_links`, `week_reviews` en `chat_messages` — onomkeerbaar, zonder
--      audit, en op de gratis tier zonder backups. Dat botst met §2.5 van
--      beslisdocument 001 ("het vertrek van een lid mag de historische ketting
--      niet wijzigen") en met domeinregel 6, die zegt dat corrigeren via een
--      correctie-record gaat en niet door geschiedenis te overschrijven.
--
--   2. **Daardoor** was de dagelijkse limiet in `create_group()` te omzeilen.
--      Die telt `groups`-rijen die er nóg zijn, dus aanmaken-weggooien-opnieuw
--      was ongelimiteerd. De limiet stond er wel en deed niets.
--
-- ⚠️ Let op de volgorde: (2) is geen tweede bevinding maar een gevolg van (1).
--    Een teller repareren zonder de verwijdering aan te pakken, verplaatst het
--    probleem; het weggooien zelf was het gat.
--
-- ---------------------------------------------------------------------------
-- Eén slot en niet tien
-- ---------------------------------------------------------------------------
--
-- Er zijn **tien** schrijfpolicies die via `is_group_member()` of
-- `is_group_admin()` lopen: op `chat_messages` (insert en update), `commitments`,
-- `goal_group_links`, `group_members` (update en delete), `groups` (update en
-- delete), `week_review_replies` en `week_reviews`. Geteld in `pg_policies`, niet
-- geschat.
--
-- ⚠️ **Een gearchiveerde groep mag door geen van die tien nog beschreven worden,
--    en tien losse voorwaarden is hier het verkeerde antwoord.** De duurste les
--    van dit project staat in WERKVOORRAAD §7: zoek álle routes naar een effect,
--    niet de route die je net gevonden hebt. Eén gat kostte vier migraties omdat
--    het per route werd gedicht. Tien policies aanpassen is tien kansen om er één
--    te vergeten, en de elfde die er volgend jaar bijkomt weet van niets.
--
-- Daarom zit het slot in de twee hulpfuncties zelf: `is_group_member()` en
-- `is_group_admin()` zijn vanaf nu onwaar voor een gearchiveerde groep. Alle tien
-- de policies sluiten daarmee in één keer, en elke policy die er later bijkomt
-- doet dat vanzelf mee.
--
-- ⚠️ **Dat sluit ook het lézen, en dat is een echte kost.** `groups_select` en
--    alles eronder lopen langs dezelfde functie, dus een gearchiveerde groep
--    verdwijnt uit beeld voor zijn leden. Vergeleken met vandaag is dat winst —
--    nu is de groep echt wég — maar het is niet hetzelfde als een archief dat je
--    kunt teruglezen. Een leesbare archiefweergave is een aparte feature en staat
--    als rij in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **Bewust géén rijen in `group_members` omzetten.** Dat sloot óók alle tien de
--    routes, maar het gooit weg wie er lid was: 'inactive' betekent daarna zowel
--    "zelf vertrokken" als "de groep is gearchiveerd", en dan is heropenen
--    giswerk. De status hoort bij de groep, niet bij het lidmaatschap.
--
-- ⚠️ **Gevolg dat je moet kennen voordat je een heropen-knop bouwt:** na het
--    archiveren geeft `is_group_admin()` onwaar voor deze groep, dus een
--    `heropen_groep()` kan die functie niet gebruiken om de beheerder te
--    herkennen. Die moet rechtstreeks in `group_members` kijken. Dat is geen
--    omissie maar de prijs van het slot; het staat hier zodat de volgende het
--    niet als een bug leest.

alter table public.groups drop constraint if exists groups_status_valid;
alter table public.groups add constraint groups_status_valid
  check (status in ('active', 'sleeping', 'archived'));

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid
  check (event_type in ('visibility_changed', 'group_archived'));

/**
 * Ben je actief lid van deze groep — en bestaat de groep nog als levende groep?
 *
 * ⚠️ De archieftoets staat hier en niet in de policies, omdat er tien
 *    schrijfpolicies langs deze functie lopen en er later meer bijkomen. Zie de
 *    kop van deze migratie.
 */
create or replace function public.is_group_member(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id
    where m.group_id = gid
      and m.user_id  = auth.uid()
      and m.status  <> 'inactive'
      and g.status  <> 'archived'
  );
$$;

create or replace function public.is_group_admin(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    join groups g on g.id = m.group_id
    where m.group_id = gid
      and m.user_id  = auth.uid()
      and m.role      = 'admin'
      and m.status   <> 'inactive'
      and g.status   <> 'archived'
  );
$$;

comment on function public.is_group_member(uuid) is
  'Actief lid van een niet-gearchiveerde groep. De archieftoets zit sinds 0092 '
  'hier en niet in de policies: tien schrijfpolicies lopen hierlangs, en tien '
  'losse voorwaarden is tien kansen om er één te vergeten.';

comment on function public.is_group_admin(uuid) is
  'Actief beheerder van een niet-gearchiveerde groep. ⚠️ Geeft dus onwaar voor '
  'een groep die al gearchiveerd is — een heropen_groep() kan deze functie niet '
  'gebruiken en moet rechtstreeks in group_members kijken.';

-- ⚠️ Niemand verwijdert nog een groep vanuit een client. `using (false)` en niet
--    "de policy weghalen": onwrikbare regel 1 wil op elke tabel een policy voor
--    alle vier de werkwoorden, zodat er staat dát er over nagedacht is. Zelfde
--    vorm als `week_review_replies_update`.
drop policy if exists groups_delete on public.groups;

create policy groups_delete on public.groups
  for delete to authenticated
  using (false);

/**
 * Archiveert een groep: hij blijft bestaan, maar niemand kan er nog bij.
 *
 * ⚠️ Bevestiging verplicht, net als bij `zet_groepszichtbaarheid()`. Dit is een
 *    handeling die voor élk ander lid iets wegneemt, en domeinregel 5 zegt dat
 *    zoiets expliciet bevestigd en auditeerbaar moet zijn — niet stilzwijgend.
 *
 * ⚠️ Geen systeembericht. De groep is na deze handeling voor niemand meer
 *    leesbaar, dus een bericht in die chat zou niemand ooit zien. Het spoor
 *    staat in `group_events`, en dat is de plek waar een audit hoort.
 */
create or replace function public.archiveer_groep(
  p_group_id uuid,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_oud text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.status into v_oud
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  update groups set status = 'archived' where id = p_group_id;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'group_archived',
    jsonb_build_object('status', v_oud),
    jsonb_build_object('status', 'archived')
  );

  return jsonb_build_object('ok', true, 'van', v_oud);
end;
$$;

comment on function public.archiveer_groep(uuid, boolean) is
  'Zet een groep op archived. Vervangt het verwijderen van een groep, dat naar '
  'zes tabellen cascadeerde zonder audit en zonder backups (bevinding 16-08). '
  'Vraagt een actieve beheerder en een expliciete bevestiging, en laat een rij '
  'na in group_events.';

revoke all on function public.archiveer_groep(uuid, boolean) from public, anon;
grant execute on function public.archiveer_groep(uuid, boolean) to authenticated;

/**
 * `create_group()` opnieuw, met één regel anders.
 *
 * ⚠️ Uit `pg_get_functiondef()` overgenomen en niet uit een migratiebestand
 *    gereconstrueerd — de les van 0084. De enige wijziging staat bij
 *    `lidmaatschap`.
 */
create or replace function public.create_group(
  group_name text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam',
  zichtbaarheid text default 'beschermd'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw          groups;
  vandaag        integer;
  lidmaatschap   integer;
  schone_naam    text;
  schone_tz      text;
  schone_zicht   text;
  pogingen       integer := 0;
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

  schone_tz := coalesce(tz, 'Europe/Amsterdam');
  if not exists (select 1 from pg_timezone_names where name = schone_tz) then
    schone_tz := 'Europe/Amsterdam';
  end if;

  schone_zicht := coalesce(zichtbaarheid, 'beschermd');
  if schone_zicht not in ('beschermd', 'open') then
    schone_zicht := 'beschermd';
  end if;

  -- ⚠️ **Deze telling wérkt nu pas.** Hij telt `groups`-rijen van het laatste
  --    etmaal, en tot 0092 kon je die rijen zelf weggooien — dus de limiet van
  --    tien gold alleen voor wie hem niet probeerde te omzeilen. Nu er niets meer
  --    verdwijnt, telt hij wat hij altijd al bedoelde te tellen. Er is hier geen
  --    regel veranderd; de grond eronder is gerepareerd.
  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  -- ⚠️ Gearchiveerde groepen tellen hier níét mee, en dat is de enige wijziging
  --    in deze functie. Zonder die uitzondering is archiveren duurder dan
  --    weggooien was: je raakt de groep kwijt én je plek blijft bezet. Dan
  --    archiveert niemand, en staat er een slot dat niemand omdraait. De
  --    misbruikrem zit in `daily_limit` hierboven, niet in deze telling.
  select count(*) into lidmaatschap
  from group_members m
  join groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and m.status <> 'inactive'
    and g.status <> 'archived';

  if lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  loop
    pogingen := pogingen + 1;
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz, zichtbaarheid)
      values (schone_naam, auth.uid(), generate_invite_code(), huddle_day, schone_tz,
              schone_zicht)
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

-- ---------------------------------------------------------------------------
-- Vier routes terug uit het archief, en opnieuw één slot
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Archiveren is niets waard als iets de groep weer op `active` kan zetten**,
--    en er zijn er vier die dat doen. Gevonden door in `pg_proc` te zoeken naar
--    elke functie die `update groups` doet, niet door na te denken over welke het
--    zouden kunnen zijn:
--
--      1. `join_group_with_code()` — zet aan het eind `status = 'active'`. Dit is
--         de gevaarlijke: iedereen met de uitnodigingscode kon een gearchiveerde
--         groep zo weer tot leven wekken, van buiten de UI om.
--      2. `wek_groep()` — trigger op `chat_messages`.
--      3. `wek_groep_via_review()` — trigger op `week_review_replies`.
--      4. `slaap_stille_groepen()` — zet `sleeping`, en dat is óók uit het
--         archief stappen.
--
--    Nummers 2 en 3 zijn vandaag onbereikbaar omdat hun policies langs
--    `is_group_member()` lopen, en nummer 4 kijkt naar `active`. Dat is precies
--    het soort "vandaag niet bereikbaar" waar dit project al vier migraties aan
--    heeft betaald: het is waar tot iemand er iets bovenop bouwt.
--
-- Daarom één trigger die geldt voor iedereen — ook voor `service_role` en voor
-- definer-functies. `guard_group_update()` slaat die juist over
-- (`current_user not in ('authenticated','anon')`), en dat is hier verkeerd: drie
-- van de vier routes zijn definer-functies.
--
-- ⚠️ Vastpinnen en niet gooien, net als `guard_group_update()`. Een `raise` in
--    `join_group_with_code()` zou de zojuist geschreven `invite_events`-rij
--    meerollen — de valkuil van 0017 — en dan is de rate limit op uitnodigingen
--    gratis te omzeilen met een code van een gearchiveerde groep.

create or replace function public.archief_blijft_archief()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status is distinct from 'archived' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

comment on function public.archief_blijft_archief() is
  'Houdt een gearchiveerde groep gearchiveerd. Geldt voor élke rol, ook '
  'service_role en definer-functies — drie van de vier routes terug naar active '
  'zijn definer-functies, dus de rolfilter van guard_group_update() zou hier '
  'juist het gat zijn. Pint vast in plaats van te gooien: een raise in '
  'join_group_with_code() zou de invite_events-rij meerollen (les van 0017).';

-- ⚠️ **Een triggerfunctie hoort niet in de API te staan**, en dat is hier geen
--    formaliteit: `tests/rls/epic7.test.ts` en `tests/rls/risicoradar.test.ts`
--    hebben deze regel als test, en die twee werden meteen rood toen deze functie
--    zonder revoke werd toegevoegd. PostgREST publiceert elke functie waar
--    `anon` of `authenticated` EXECUTE op heeft; zonder dit is
--    `archief_blijft_archief` een RPC die iedereen kan aanroepen. Zie 0069 en
--    0073, waar dezelfde grendel op alle andere triggerfuncties is gezet.
revoke all on function public.archief_blijft_archief() from public, anon, authenticated;

drop trigger if exists archief_blijft_archief on public.groups;

create trigger archief_blijft_archief
  before update on public.groups
  for each row
  execute function public.archief_blijft_archief();

/**
 * `join_group_with_code()` opnieuw, met één toets erbij.
 *
 * ⚠️ Uit `pg_get_functiondef()` overgenomen — de les van 0084. De trigger
 *    hierboven houdt de groep hoe dan ook gearchiveerd; deze toets zorgt dat de
 *    gebruiker een reden te horen krijgt in plaats van stil lid te worden van een
 *    groep die hij nooit te zien krijgt.
 */
create or replace function public.join_group_with_code(code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target       groups%rowtype;
  pogingen     integer;
  leden        integer;
  lidmaatschap integer;
  bestaand     text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  if pogingen >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- ⚠️ De enige toevoeging in deze functie.
  if target.status = 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'archived');
  end if;

  select status into bestaand
  from group_members
  where group_id = target.id and user_id = auth.uid();

  if bestaand = 'inactive' then
    return jsonb_build_object('ok', false, 'reason', 'removed');
  end if;

  if bestaand is null then
    select count(*) into leden
    from group_members
    where group_id = target.id and status <> 'inactive';

    if leden >= 12 then
      return jsonb_build_object('ok', false, 'reason', 'group_full');
    end if;

    -- ⚠️ Dezelfde uitzondering als in `create_group()`, en om dezelfde reden.
    --    Twee tellingen van hetzelfde plafond die verschillend rekenen, is een
    --    limiet die van je route afhangt: aanmaken zou dan mogen waar toetreden
    --    weigert. Gevonden doordat een test het ene pad toetste en het andere
    --    niet.
    select count(*) into lidmaatschap
    from group_members m
    join groups g on g.id = m.group_id
    where m.user_id = auth.uid()
      and m.status <> 'inactive'
      and g.status <> 'archived';

    if lidmaatschap >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
    end if;
  end if;

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

  return jsonb_build_object('ok', true, 'group_id', target.id);
end;
$$;

/**
 * `invite_preview()` opnieuw, met `archived` erbij in de selectie.
 *
 * ⚠️ Een gearchiveerde groep geeft `null`, precies zoals een onbekende of
 *    ingetrokken code. De app behandelt `null` al als "deze uitnodiging werkt
 *    niet meer", dus dit vraagt geen nieuwe tekst en geen nieuw geval. Het
 *    alternatief — de groep tóch tonen — zou een naam en tot acht ledennamen
 *    lekken uit een groep waar niemand meer bij kan.
 */
create or replace function public.invite_preview(code text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $$
declare
  g          groups%rowtype;
  aantal     integer;
  leden      jsonb;
  ingelogd   boolean := auth.uid() is not null;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false
    and status <> 'archived';

  if g.id is null then
    return null;
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
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
    'group_id',      g.id,
    'group_name',    g.name,
    'icon',          g.icon,
    'huddle_day',    g.huddle_day,
    'zichtbaarheid', g.zichtbaarheid,
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$$;
