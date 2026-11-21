-- 0333_een_klassement_in_elke_groep.sql — QS8-666 (A57), PR 1: de poort, de kolom en besluit 45
--
-- ROLLBACK-PAD:
--   -- 1. De twee functies terugzetten: `groep_klassement()` uit 0321, `zet_groepszichtbaarheid()` uit 0302.
--   -- 2. drop trigger if exists groups_klassement_vast on public.groups;
--   --    drop trigger if exists groups_klassement_beginstand on public.groups;
--   --    drop function if exists public.pin_groepsklassement();
--   --    drop function if exists public.zet_klassement_beginstand();
--   --    drop function if exists public.lid_van_levende_groep(uuid);
--   -- 3. alter table public.groups drop constraint if exists groups_team_geen_klassement;
--   --    alter table public.groups drop constraint if exists groups_automatisch_geen_klassement;
--   --    alter table public.groups drop column if exists klassement_aan;
--   -- 4. De twee allowlists terugzetten (`group_events_type_valid` uit 0208, `chat_messages_system_event_bekend`
--   --    uit 0323). Rijen met 'leaderboard_changed' in `group_events` en 'leaderboard_enabled'/'leaderboard_disabled'
--   --    in `chat_messages` moeten dan eerst weg; dat is grens 2.
--
--
-- laat bewust vallen: where lid_van_open_groep(p_group_id)
-- laat bewust vallen: -- QS8-661, besluit 22 en 25: nooit een klassement in een teamgroep, ook
-- laat bewust vallen: -- niet in een open. Een eigen voorwaarde en niet via `lid_van_open_groep()`,
-- laat bewust vallen: -- zodat A57 (QS8-666) hem niet stil verliest als die poort verandert.
-- (A57 vervangt de poort `lid_van_open_groep()` door `lid_van_levende_groep()` plus de schakelaar; de teamtoets zelf is gebleven,
--  met een nieuwe toelichting in het lichaam. Besluit Quinten 20-11-2026.)
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 20-11-2026 (QS8-666): A57 vervangt de grens van A54. Het klassement mag ook in een
-- beschermde groep staan, aan en uit te zetten door een beheerder. Drie grendels blijven: een gemiste week
-- boekt zonder `group_id` (CHECK `points_ledger_gemist_is_niet_van_een_groep`), `groep_klassement()` geeft
-- geen delta en geen datum, en een teamgroep heeft nooit een klassement. Dit is PR 1 van vier: de kolom,
-- de poort en besluit 45 (een groep die open wordt, krijgt het klassement erbij). De schakelaar voor een
-- beheerder (`zet_groepsklassement()`), de uitnodigingskaart en het scherm A57b volgen in PR 2 tot en met 4.
--
-- ⚠️ **Gedrag na deze migratie, en dat is met opzet gelijk aan dat van vandaag:** elke bestaande open groep
--    zonder organisatie krijgt het klassement aan; een bestaande beschermde groep houdt het uit (besluit 42);
--    een nieuwe groep krijgt het alleen als hij open is. Pas PR 2 geeft een beheerder een schakelaar en maakt
--    het klassement standaard aan voor nieuwe groepen: tot die er is, is er geen weg om een beschermde groep
--    het klassement te geven, en dat is de veilige kant.
--
-- ⚠️ **De poort is een eigen helper en niet `lid_van_open_groep()`.** `lid_van_levende_groep()` is het lichaam van
--    `lid_van_open_groep()` (0102) zonder de zichtbaarheidstoets: actief lid van een groep die niet gearchiveerd is.
--    📏 Dat is op het moment van schrijven hetzelfde lichaam als `is_group_member()` (nagemeten door de security-review);
--    het is een eigen naam zodat een latere versoepeling van `is_group_member()` het klassement niet stil meeneemt.
--    ⚠️ Gebruik hier nooit `mag_groep_lezen()`: die laat een gearchiveerde groep leesbaar (0153).
--
-- ⚠️ **Dit is PR 1 van vier en hij hoort niet los naar productie.** Een groep die open wordt en daarna weer beschermd,
--    houdt het klassement (besluit van Quinten, 18-11-2026), en de bevestiging bij beschermen belooft dat een beheerder
--    het apart kan uitzetten. Die weg (`zet_groepsklassement()` en de schakelaar in Groepsbeheer) is PR 2. PR 1 en PR 2
--    gaan dus samen uit. **Besluit van Quinten, 21-11-2026:** PR 1 mag naar `main`, maar de uitrol naar productie wacht tot
--    PR 2 er ook is; en (bevestiging van zijn besluit van 18-11) een groep die van open naar beschermd gaat, houdt het
--    klassement aan tot een beheerder het apart uitzet.
--
-- ⚠️ **`points_ledger` bewaart de `group_id` altijd**, ongeacht zichtbaarheid of schakelaar (41 plekken in de
--    migraties, statisch gemeten; tegen productie niet). Een klassement aanzetten maakt dus ook de punten
--    zichtbaar die al in die groep verdiend zijn. Dat hoort in de bevestiging van PR 2.
--
-- ⚠️ **Gekopieerd van de laatste definitie op main:** `groep_klassement()` uit 0321, `zet_groepszichtbaarheid()`
--    uit 0302, `group_events_type_valid` uit 0208, `chat_messages_system_event_bekend` uit 0323.
--
-- ---------------------------------------------------------------------------

-- 1. De kolom ---------------------------------------------------------------
alter table public.groups
  add column if not exists klassement_aan boolean not null default false;

comment on column public.groups.klassement_aan is
  'Heeft deze groep een klassement (A57, QS8-666)? Voor geen enkele client schrijfbaar; alleen een definer-functie zet hem. '
  'Een teamgroep en een automatisch gevormde groep hebben hem nooit aan (CHECK).';

alter table public.groups drop constraint if exists groups_team_geen_klassement;
alter table public.groups
  add constraint groups_team_geen_klassement
  check (organization_id is null or not klassement_aan);

-- P1 (besluit Quinten 21-11-2026): een automatisch gevormde groep (vreemden, geen beheerder) heeft nooit een klassement.
alter table public.groups drop constraint if exists groups_automatisch_geen_klassement;
alter table public.groups
  add constraint groups_automatisch_geen_klassement
  check (not automatisch or not klassement_aan);

-- ⚠️ Het slot dat een client tegenkomt, met `authenticated` erbij (onwrikbare regel 4).
revoke insert (klassement_aan), update (klassement_aan)
  on public.groups from public, anon, authenticated;

create or replace function public.pin_groepsklassement()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if new.klassement_aan is distinct from old.klassement_aan
     and current_user in ('authenticated', 'anon') then
    raise exception 'Het klassement van een groep zet je met zet_groepsklassement()'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_klassement_vast on public.groups;
create trigger groups_klassement_vast
  before update on public.groups
  for each row execute function public.pin_groepsklassement();

revoke all on function public.pin_groepsklassement() from public, anon, authenticated;

-- 2. De beginstand van een nieuwe groep ------------------------------------
-- Een eigen trigger en niet een herschrijving van `create_group()`, `maak_teamgroep()` of `vorm_een_buddygroep()`
-- (registerdrift, zelfde redenering als `pin_groepsorganisatie()` in 0317). PR 2 maakt hier "elke groep zonder
-- organisatie en niet automatisch" van (besluit 42 en 43).
create or replace function public.zet_klassement_beginstand()
returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  new.klassement_aan := new.zichtbaarheid = 'open'
                        and new.organization_id is null
                        and not new.automatisch;
  return new;
end;
$$;

drop trigger if exists groups_klassement_beginstand on public.groups;
create trigger groups_klassement_beginstand
  before insert on public.groups
  for each row execute function public.zet_klassement_beginstand();

revoke all on function public.zet_klassement_beginstand() from public, anon, authenticated;

-- 3. Bijvullen: wat A54 al gaf, blijft -------------------------------------
update public.groups
   set klassement_aan = true
 where zichtbaarheid = 'open'
   and organization_id is null
   and not automatisch
   and not klassement_aan;

-- 4. De allowlists ---------------------------------------------------------
alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events
  add constraint group_events_type_valid
  check (
    event_type = any (array[
      'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
      'discoverable_changed', 'join_request_decided', 'member_removed',
      'group_reopened',
      'huddle_day_changed',
      'leaderboard_changed'
    ])
  );

alter table public.chat_messages drop constraint if exists chat_messages_system_event_bekend;
alter table public.chat_messages
  add constraint chat_messages_system_event_bekend
  check (
    system_event is null
    or system_event = any (array[
      'chain_milestone', 'commitment_due', 'commitment_unlocked',
      'completion_approved', 'completion_pending', 'deadline_requested',
      'goal_completed', 'group_opened', 'group_protected', 'group_sleeping',
      'member_joined', 'milestone_done', 'season_recap', 'group_discoverable',
      'huddle_day_changed', 'prestatie_gedeeld',
      'team_goal_created', 'team_goal_completed',
      -- QS8-666 (A57). Geen persoon en geen titel in de tekst: het gaat over de groep.
      'leaderboard_enabled', 'leaderboard_disabled'
    ])
  );

-- 5. De poort ---------------------------------------------------------------
create or replace function public.lid_van_levende_groep(gid uuid)
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
revoke all on function public.lid_van_levende_groep(uuid) from public, anon, authenticated;
grant execute on function public.lid_van_levende_groep(uuid) to authenticated;
comment on function public.lid_van_levende_groep(uuid) is
  'Actief lid van een lévende groep, ongeacht zichtbaarheid (A57, QS8-666). Het lichaam van lid_van_open_groep() '
  '(0102) zonder de zichtbaarheidstoets. Niet is_group_member(): dat opent een gearchiveerde groep.';

-- 6. groep_klassement() ----------------------------------------------------
create or replace function public.groep_klassement(p_group_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, punten integer, positie bigint, total_members bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with standen as (
    select
      m.user_id                                   as user_id,
      p.display_name                              as display_name,
      greatest(coalesce((
        select sum(pl.delta)
        from points_ledger pl
        where pl.group_id = p_group_id
          and pl.user_id  = m.user_id
      ), 0), 0)::integer                          as punten
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  gerangschikt as (
    select
      s.user_id,
      s.display_name,
      s.punten,
      rank() over (order by s.punten desc)        as positie,
      count(*) over ()                            as total_members
    from standen s
  )
  select
    g.user_id,
    g.display_name,
    g.punten,
    g.positie,
    g.total_members
  from gerangschikt g
  where lid_van_levende_groep(p_group_id)
    -- ⚠️ A57 (QS8-666): het klassement hangt aan een eigen schakelaar op de groep en niet
    --    meer aan de zichtbaarheid. Drie voorwaarden naast elkaar, elk zichtbaar:
    --    lidmaatschap en archief (hierboven), de schakelaar, en de teamgroep hieronder.
    and exists (select 1 from groups gr
                 where gr.id = p_group_id and gr.klassement_aan)
    -- QS8-661, besluit 22 en 25: nooit een klassement in een teamgroep. Een eigen
    -- voorwaarde, ook naast de CHECK `groups_team_geen_klassement`, zodat hij niet
    -- stil verdwijnt als de poort of de kolom verandert.
    and not exists (select 1 from groups gr
                     where gr.id = p_group_id and gr.organization_id is not null)
  -- ⚠️ Dezelfde volgorde als `positie`, plus twee tiebreakers. Zonder een
  --    deterministische volgorde kan één lid op twee pagina's staan en een
  --    ander op geen enkele — dat is niet cosmetisch maar een verkeerd
  --    klassement.
  order by g.punten desc, g.display_name asc, g.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

comment on function public.groep_klassement(uuid, integer, integer) is
  'Het klassement van een groep: de punten die ieder in deze groep verdiend heeft (A57, QS8-666). Nul rijen voor een niet-lid, '
  'een uitgezet lid, een gearchiveerde groep, een groep waar het klassement uit staat en een teamgroep. Geen delta en geen datum.';

-- 7. zet_groepszichtbaarheid() ---------------------------------------------
create or replace function public.zet_groepszichtbaarheid(p_group_id uuid, p_naar text, p_bevestigd boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_oud    text;
  v_recent integer;
  v_aan    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_naar is null or p_naar not in ('beschermd', 'open') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_visibility');
  end if;

  -- ⚠️⚠️ **Vóór de beheerderstoets, en dat was de bug.** Deze tak stond eronder,
  --    en een automatisch gevormde groep heeft per constructie géén beheerder:
  --    `is_group_admin()` is er altijd onwaar. 📏 Gemeten: een lid kreeg
  --    `not_admin` en nooit `automatisch`, dus de tak was onbereikbaar voor
  --    precies de groepen waarvoor hij geschreven is. Een grendel die zijn eigen
  --    geval niet haalt bewaakt niets — en de kop van 0300 beweerde dat de
  --    gebruiker hier een zin leest die niemand ooit gezien heeft.
  --
  --    ⚠️ Dit verruimt niets: het antwoord was al "nee". Wat verandert is wélke
  --    reden de gebruiker leest, en of de i18n-sleutel ervoor bereikbaar is.
  if exists (select 1 from groups g2 where g2.id = p_group_id and g2.automatisch) then
    return jsonb_build_object('ok', false, 'reason', 'automatisch');
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  -- ⚠️ `for update` en niet een kale select. Twee beheerders die tegelijk
  --    omzetten, zouden anders allebei "was beschermd" lezen en allebei een
  --    bericht plaatsen — en het auditspoor zou twee keer dezelfde overgang
  --    tonen terwijl er één was.
  select g.zichtbaarheid into v_oud
  from groups g
  where g.id = p_group_id
  for update;

  if v_oud is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_oud = p_naar then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  if p_naar = 'open' then
    select count(*) into v_recent
    from group_events e
    where e.group_id   = p_group_id
      and e.event_type = 'visibility_changed'
      and e.new_value ->> 'zichtbaarheid' = 'open'
      and e.created_at > now() - interval '1 day';

    if v_recent > 0 then
      return jsonb_build_object('ok', false, 'reason', 'too_soon');
    end if;
  end if;

  -- ⚠️ `current_user` is hier de eigenaar van deze functie en niet
  --    `authenticated`, dus `guard_group_update()` laat de kolom staan. Dat is
  --    geen omweg om het slot heen maar precies waar het slot voor bedoeld is:
  --    één route naar deze kolom, en die route toetst zelf.
  update groups set zichtbaarheid = p_naar where id = p_group_id;

  -- ⚠️ A57, besluit 45 (QS8-666): een groep die open wordt, krijgt het klassement erbij als
  --    het nog uit stond. Een teamgroep en een automatisch gevormde groep nooit; die hebben
  --    het klassement per constructie niet (CHECK's). `found` zegt of het echt omsloeg, zodat
  --    er alleen een rij en een bericht komen als er iets veranderd is.
  if p_naar = 'open' then
    update groups
       set klassement_aan = true
     where id = p_group_id
       and organization_id is null
       and not automatisch
       and not klassement_aan;
    v_aan := found;
  end if;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'visibility_changed',
    jsonb_build_object('zichtbaarheid', v_oud),
    jsonb_build_object('zichtbaarheid', p_naar)
  );

  perform plaats_systeembericht(
    p_group_id,
    case when p_naar = 'open' then 'group_opened' else 'group_protected' end,
    case
      when p_naar = 'open'
      then 'Deze groep staat vanaf nu open: leden zien ook elkaars tegenslag.'
      else 'Deze groep is weer beschermd: tegenslag van een ander is niet zichtbaar.'
    end,
    p_subject_id => auth.uid()
  );

  if v_aan then
    insert into group_events (group_id, actor_id, event_type, old_value, new_value)
    values (
      p_group_id,
      auth.uid(),
      'leaderboard_changed',
      jsonb_build_object('klassement', false),
      jsonb_build_object('klassement', true, 'reden', 'opened')
    );

    -- P5 (besluit Quinten 21-11-2026): ook een bericht als het klassement automatisch aangaat.
    -- Geen persoon, geen titel; het gaat over de groep (domeinregel 7, tweede slot).
    perform plaats_systeembericht(
      p_group_id,
      'leaderboard_enabled',
      'Het klassement staat aan in deze groep.',
      p_subject_id => auth.uid()
    );
  end if;

  return jsonb_build_object('ok', true, 'van', v_oud, 'naar', p_naar);
end;
$function$;
