-- 0310_een_groep_krijgt_een_dagbericht_en_geen_full_house.sql — één positieve
-- dagmelding per groep per lid, standaard uit; full house is niet gebouwd (QS8-755)
--
-- ROLLBACK-PAD (pas na een pg_dump; stap 1 is een delete van ontdubbelrijen):
--   delete from public.notifications_sent where kind = 'group_digest';
--   drop trigger if exists notifications_sent_groepsdigest_grens on public.notifications_sent;
--   drop function if exists public.notifications_sent_groepsdigest_grens();
--   drop function if exists public.groepsdigest_voor(uuid, date);
--   drop function if exists public.groepsdigest_gebeurtenissen();
--   drop function if exists public.groepsdigest_dagmax();
--   drop function if exists public.groepsdigest_aan();
--   drop index if exists public.notifications_sent_groepsdigest_per_dag;
--   drop index if exists public.notifications_sent_per_onderwerp;
--   create unique index notifications_sent_per_onderwerp
--     on public.notifications_sent (user_id, kind, ref_id) where ref_id is not null;
--   alter table public.notifications_sent
--     drop constraint if exists notifications_sent_groepsdigest_heeft_groep,
--     drop constraint if exists notifications_sent_kind_bekend,
--     add constraint notifications_sent_kind_bekend check (kind in ('nudge',
--       'approval_request','approval_received','cycle_summary',
--       'commitment_witness','commitment_reverted'));
--   revoke update (notify_group_digest) on public.profiles from authenticated;
--   alter table public.profiles drop column if exists notify_group_digest;
--   -- en daarna mijn_profiel: `create or replace` kan geen kolom laten vallen, dus
--   -- drop view public.mijn_profiel; create view met de kolommen van 0298,
--   -- alter view … owner to postgres; grant select … to authenticated.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): index-
--    wissel op een gevulde tabel, een herdefinitie van een view, grants en een
--    trigger. Een bouwsessie zet dit niet op productie.
--
-- ---------------------------------------------------------------------------
-- Wat dit is, en wat het niet is
-- ---------------------------------------------------------------------------
--
-- Eén pushmelding per groep per lid per dag: "er is iets te vieren in <groep>".
-- Geen namen, geen aantallen, geen titels. Bron is uitsluitend een positief
-- groepssysteembericht van een ánder lid dat de ontvanger via `chat_messages`
-- toch al kan lezen — de melding voegt dus geen informatie toe, hij verplaatst
-- alleen het moment waarop je het hoort.
--
-- ⚠️⚠️ **FULL HOUSE IS MET OPZET NIET GEBOUWD.** "Iedereen heeft zijn weekdoel
--    gehaald" maakt de afwezigheid van het bericht zelf tot een signaal dat
--    iemand het niet haalde (domeinregel 7, vraag 1), en dat geldt in een open
--    en een beschermde groep. Drie redenen die elk op zich genoeg zijn:
--    (1) weekdoelen lopen op de klok van elke gebruiker, "iedereen haalde het in
--    de groepsperiode" is niet eenduidig te definiëren; (2) een lid in
--    adempauze is privé (0307): telt het niet mee, dan verraadt de melding de
--    pauze, telt het wel mee, dan komt er voor die groep nooit een full house en
--    is de afwezigheid structureel; (3) `chain_milestone` in chat-schemas.ts
--    wijst "voltallig deze week" al af (002 §2). "Bijna" en "nog X te gaan" zijn
--    er nooit. Vraag voor Quinten: zie het beslisdocument.
--
-- ⚠️ **Opt-in en minimaal drie actieve leden zijn ook database-regels** (RPC én trigger),
--    niet alleen job-regels: de toestemming van de gebruiker hangt niet aan één `!== true`.
--
-- ⚠️ **Standaard uit, tweemaal.** `groepsdigest_aan()` geeft `false`: de eerste
--    uitgaande stroom naar echte mensen is grens 1 van de Beslisbevoegdheid, en
--    de aanzet is een handeling (een migratie van één regel die die functie
--    herdefinieert), geen standaardwaarde. Daarnaast is `notify_group_digest`
--    opt-in (`default false`): wie niets doet, krijgt niets.
--
-- ⚠️ **De vlag staat in de database en niet in een env-var**, omdat alleen daar
--    de RPC én de trigger hem afdwingen en de RLS-suite hem kan toetsen.
--
-- ⚠️ **Geen verwijzing naar `groups.zichtbaarheid`** in de RPC: een open en een
--    beschermde groep geven identieke uitvoer. `zichtbaarheid:controle` bewaakt dat.
--
-- ⚠️ **Geen nieuw type systeembericht**; `chat_messages_system_event_bekend`
--    blijft ongemoeid.

begin;

-- ---------------------------------------------------------------------------
-- 1. Een zevende soort melding en haar sleutels
-- ---------------------------------------------------------------------------
alter table public.notifications_sent drop constraint if exists notifications_sent_kind_bekend;
alter table public.notifications_sent add constraint notifications_sent_kind_bekend
  check (kind in ('nudge', 'approval_request', 'approval_received', 'cycle_summary',
                  'commitment_witness', 'commitment_reverted', 'group_digest'));

alter table public.notifications_sent drop constraint if exists notifications_sent_groepsdigest_heeft_groep;
alter table public.notifications_sent add constraint notifications_sent_groepsdigest_heeft_groep
  check (kind <> 'group_digest' or (ref_type = 'group' and ref_id is not null));

-- ⚠️ `per_onderwerp` is uniek op (user, kind, ref_id): met ref_id = groep zou je
--    maar één keer ooit een digest per groep krijgen. De digest valt er dus uit
--    en krijgt zijn eigen index mét de datum. De andere soorten houden hun
--    eenmaligheid (0178, 0293 leunen daarop).
drop index if exists public.notifications_sent_per_onderwerp;
create unique index if not exists notifications_sent_per_onderwerp
  on public.notifications_sent (user_id, kind, ref_id)
  where ref_id is not null and kind <> 'group_digest';

create unique index if not exists notifications_sent_groepsdigest_per_dag
  on public.notifications_sent (user_id, ref_id, local_date)
  where kind = 'group_digest';

-- ---------------------------------------------------------------------------
-- 2. De vlag, het plafond en de allowlist — registers in een functielichaam
-- ---------------------------------------------------------------------------
create or replace function public.groepsdigest_aan()
returns boolean language sql stable set search_path = public, pg_temp
as $$ select false $$;

create or replace function public.groepsdigest_dagmax()
returns integer language sql immutable set search_path = public, pg_temp
as $$ select 3 $$;

-- ⚠️ Alleen gebeurtenissen die de groep al leest en die uitsluitend positief
--    zijn. Niet: commitment_*, completion_pending, deadline_requested,
--    group_sleeping, member_joined, milestone_done, chain_milestone (de Ketting
--    en de mijlpaalaankondiging blijven dicht), prestatie_gedeeld (0309).
create or replace function public.groepsdigest_gebeurtenissen()
returns text[] language sql immutable set search_path = public, pg_temp
as $$ select array['completion_approved', 'goal_completed']::text[] $$;

revoke all on function public.groepsdigest_aan() from public, anon, authenticated;
revoke all on function public.groepsdigest_dagmax() from public, anon, authenticated;
revoke all on function public.groepsdigest_gebeurtenissen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profielschakelaar: opt-in
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_group_digest boolean not null default false;

comment on column public.profiles.notify_group_digest is
  'Eén positieve dagmelding per groep. Opt-in (default false) en bovendien uit zolang '
  'groepsdigest_aan() false geeft. QS8-755.';

-- ⚠️ Alleen grant, nooit een revoke (0237). Geen select-grant: de eigenaar leest via de view.
grant update (notify_group_digest) on public.profiles to authenticated;

create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true) as
  select id,
         display_name,
         avatar_url,
         week_start_day,
         tz,
         reminder_time,
         reminder_enabled,
         reminder_tone,
         share_moves_by_default,
         created_at,
         updated_at,
         onboarded_at,
         wants_own_goal,
         locale,
         focus_areas,
         minutes_per_day,
         when_i_do_it,
         what_breaks_it,
         notify_approval_request,
         notify_approval_received,
         notify_cycle_summary,
         notify_commitment_witness,
         quiet_from,
         quiet_to,
         vindbaar,
         platform_beheerder,
         notify_group_digest
    from public.profiles p
   where id = (select auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Wie een digest hoort te krijgen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geeft per groep alleen (group_id, groepsnaam): geen aantal, geen persoon.
-- ⚠️ Het venster loopt van de vorige digest voor die groep (of 24 uur terug) tot
--    nu minus het intrekvenster: een goedkeuring die nog ingetrokken kan worden
--    belt niet ("ingetrokken goedkeuringen" is een dicht oppervlak).
-- ⚠️ Gedempt (0305), slapend, teamgroep, niet-actief lid: niets.
create or replace function public.groepsdigest_voor(p_user_id uuid, p_lokale_datum date)
returns table (group_id uuid, groepsnaam text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select g.id, g.name
  from group_members gm
  join groups g on g.id = gm.group_id
  where public.groepsdigest_aan()
    and gm.user_id = p_user_id
    and gm.status = 'active'
    and g.status = 'active'
    and not public.is_teamgroep(g.id)
    -- ⚠️ De opt-in staat óók hier en in de trigger, en niet alleen in de job (security-review M2).
    and exists (select 1 from profiles p where p.id = p_user_id and p.notify_group_digest)
    -- ⚠️ Vanaf drie actieve leden (security-review M3): in een groep van twee zou
    --    "geen melding" betekenen dat de ander niets goedgekeurd kreeg — dezelfde reden
    --    waarom full house niet bestaat. Besluit van Quinten nodig of dit mag zakken.
    and (select count(*) from group_members x
         where x.group_id = g.id and x.status = 'active') >= 3
    and not exists (select 1 from groep_demping d
                    where d.user_id = p_user_id and d.group_id = g.id)
    and not exists (select 1 from notifications_sent n
                    where n.user_id = p_user_id and n.kind = 'group_digest'
                      and n.ref_id = g.id and n.local_date = p_lokale_datum)
    and exists (
      select 1 from chat_messages m
      where m.group_id = g.id
        and m.type = 'system'
        and m.sender_id is null
        and m.system_event = any (public.groepsdigest_gebeurtenissen())
        and m.subject_id is distinct from p_user_id
        -- De goedkeurder weet het al: een eigen klik is geen nieuws (critical-user).
        and m.actor_id is distinct from p_user_id
        and m.created_at >= gm.joined_at
        and m.created_at <= now() - make_interval(mins => public.intrekvenster_minuten() + 5)
        and m.created_at > greatest(
              coalesce((select max(n.sent_at) from notifications_sent n
                where n.user_id = p_user_id and n.kind = 'group_digest' and n.ref_id = g.id),
                now() - interval '24 hours'),
              now() - interval '24 hours')
              - make_interval(mins => public.intrekvenster_minuten() + 5)
    )
  order by g.id
  limit greatest(0, public.groepsdigest_dagmax() - (
    select count(*) from notifications_sent n
    where n.user_id = p_user_id and n.kind = 'group_digest'
      and n.sent_at > now() - interval '24 hours'
  ));
$$;

comment on function public.groepsdigest_voor(uuid, date) is
  'Groepen waarover deze persoon een positieve dagmelding hoort te krijgen. Alleen '
  'service_role. Geeft geen aantallen of personen. QS8-755.';

revoke all on function public.groepsdigest_voor(uuid, date) from public, anon, authenticated;
grant execute on function public.groepsdigest_voor(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. De database houdt zelf de grens, ook als de job iets vergeet
-- ---------------------------------------------------------------------------
create or replace function public.notifications_sent_groepsdigest_grens()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('group_digest:' || new.user_id::text, 0));

  if not public.groepsdigest_aan() then
    raise exception using errcode = 'P0001', message = 'group_digest_geweigerd';
  end if;

  if not exists (select 1 from group_members gm
                 join groups g on g.id = gm.group_id
                 join profiles p on p.id = gm.user_id
                 where gm.group_id = new.ref_id and gm.user_id = new.user_id
                   and gm.status = 'active' and g.status = 'active'
                   and p.notify_group_digest)
     or public.is_teamgroep(new.ref_id)
     or (select count(*) from group_members x
         where x.group_id = new.ref_id and x.status = 'active') < 3
     or exists (select 1 from groep_demping d
                where d.user_id = new.user_id and d.group_id = new.ref_id) then
    raise exception using errcode = 'P0001', message = 'group_digest_geweigerd';
  end if;

  if (select count(*) from notifications_sent n
      where n.user_id = new.user_id and n.kind = 'group_digest' and n.id <> new.id
        and n.sent_at > now() - interval '24 hours') >= public.groepsdigest_dagmax() then
    raise exception using errcode = 'P0001', message = 'group_digest_geweigerd';
  end if;

  return new;
end;
$$;

revoke all on function public.notifications_sent_groepsdigest_grens() from public, anon, authenticated;

drop trigger if exists notifications_sent_groepsdigest_grens on public.notifications_sent;
create trigger notifications_sent_groepsdigest_grens
  before insert or update on public.notifications_sent
  for each row when (new.kind = 'group_digest')
  execute function public.notifications_sent_groepsdigest_grens();

commit;
