-- 0175_geen_servertijdstempel_in_handen_van_de_client.sql — negentien tabellen
-- (QS8-299, vervolg op 0173/QS8-295)
--
-- ROLLBACK-PAD:
--   Per tabel de tabelbrede grant terug en de kolomgrant weg:
--
--   revoke insert on table public.<tabel> from authenticated;
--   grant  insert on table public.<tabel> to authenticated;
--
--   en idem voor update. Dat zet de toestand van vóór deze migratie terug:
--   een tabelbrede grant subsumeert elke kolomgrant.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0173 sloot vier tabellen waar de client zijn eigen `created_at` mocht meesturen.
-- Dat is niet cosmetisch: elke teller en elk venster dat op zo'n kolom rekent —
-- een dagquotum, een bedenktijd, een wachtvenster — is dan te omzeilen door een
-- datum mee te sturen.
--
-- 📏 Gemeten op de opbouw van vandaag, met de query uit QS8-299:
--    **33 grants over 19 tabellen** op kolommen van type `timestamptz` met een
--    `now()`-default, aan `authenticated`, INSERT én UPDATE. `anon` heeft er geen
--    enkele; `service_role` houdt al zijn 86 grants.
--
-- ⚠️ **Het waren tabelbréde grants, en dat verandert de reparatie.** Een
--    `revoke insert(kolom)` doet niets tegen een `grant insert` op de hele tabel:
--    Postgres laat dan nog steeds elke kolom toe. De enige weg is de tabelgrant
--    intrekken en per kolom teruggeven. Dat is precies wat hieronder staat, en
--    het is de reden dat dit bestand lang is.
--
-- ⚠️ **De kolomlijsten zijn gegenereerd uit de catalogus en niet met de hand
--    getypt.** Met de hand overtypen is hier de manier om per ongeluk een kolom
--    te vergeten of toe te voegen.
--
-- ⚠️ **En ze zijn nóg smaller dan "alles behalve de tijdstempels", omdat
--    `kolomrechten:controle` dat afdwong.** De eerste versie gaf elke
--    niet-tijdstempelkolom terug — exact de rechten van vóór deze migratie, min
--    de tijdstempels. Die controle meldde daarop **23 kolommen met een grant die
--    niets gebruikt**, en dat is geen ruis: een tabelbrede grant verbergt zulke
--    rechten, en door hem naar kolomgrants om te zetten worden ze pas zichtbaar.
--    Die 23 zijn er dus uit gelaten in plaats van in een register gezet — de
--    controle heeft de inventarisatie gedaan die stap 1 van QS8-299 vraagt.
--    📏 De RLS-suite is het bewijs dat dat veilig is: 1061 groen, ná het smaller
--    maken.
--
-- 📏 Nagemeten dat geen enkele client deze kolommen stuurt: `created_at`,
--    `linked_at`, `joined_at`, `last_activity_at` en `updated_at` komen in `src/`
--    en `app/` alleen voor in lézingen (`rij.created_at ?? ''`) en in
--    typedeclaraties. `p_na_joined_at` is een RPC-parameter voor paginering en
--    geen kolomschrijving.
--
-- ⚠️ **De must-allow is de RLS-suite**, niet deze kop: als er tóch iets
--    legitiems een tijdstempel meestuurt, valt die suite om. Dat is de enige
--    toets die "niemand mag dit meer" onderscheidt van "de app is stuk".
--
-- ⚠️ **Overlap met 0173 is onschadelijk.** Vier tabellen worden daar ook
--    gesloten. Een revoke van een recht dat al weg is, is een no-op; welke van de
--    twee migraties eerst landt maakt dus niet uit.
--
-- ---------------------------------------------------------------------------

begin;


revoke insert on table public.approval_withdrawals from public, anon, authenticated;
grant insert (id, approval_id, completion_id, approver_id) on table public.approval_withdrawals to authenticated;

revoke update on table public.approval_withdrawals from public, anon, authenticated;
grant update (id, approval_id, completion_id, approver_id) on table public.approval_withdrawals to authenticated;

revoke update on table public.chat_messages from public, anon, authenticated;
grant update (id, group_id, sender_id, body, type, system_event, attachment_url, subject_id, actor_id, payload) on table public.chat_messages to authenticated;

revoke insert on table public.completion_approvals from public, anon, authenticated;
grant insert (completion_id, approver_id, subject_id, group_id, status, comment) on table public.completion_approvals to authenticated;

revoke insert on table public.daily_moves from public, anon, authenticated;
grant insert (user_id, weekly_goal_id, body, visibility, local_date) on table public.daily_moves to authenticated;

revoke update on table public.daily_moves from public, anon, authenticated;
grant update (id, user_id, weekly_goal_id, body, visibility, local_date) on table public.daily_moves to authenticated;

revoke insert on table public.day_checkins from public, anon, authenticated;
grant insert (weekly_goal_id, local_date) on table public.day_checkins to authenticated;

revoke insert on table public.deadline_requests from public, anon, authenticated;
grant insert (id, goal_id, group_id, requester_id, old_date, new_date, reason, status, decided_by, decided_at, decision_note) on table public.deadline_requests to authenticated;

revoke update on table public.deadline_requests from public, anon, authenticated;
grant update (id, goal_id, group_id, requester_id, old_date, new_date, reason, status, decided_by, decided_at, decision_note) on table public.deadline_requests to authenticated;

revoke insert on table public.goal_events from public, anon, authenticated;
grant insert (goal_id, actor_id, event_type, old_value, new_value) on table public.goal_events to authenticated;

revoke insert on table public.goal_group_links from public, anon, authenticated;
grant insert (goal_id, group_id) on table public.goal_group_links to authenticated;

revoke insert on table public.goal_interviews from public, anon, authenticated;
grant insert (goal_id, answers) on table public.goal_interviews to authenticated;

revoke update on table public.goal_interviews from public, anon, authenticated;
grant update (id, goal_id, answers) on table public.goal_interviews to authenticated;

revoke insert on table public.group_join_requests from public, anon, authenticated;
grant insert (id, group_id, user_id, bericht, status, decided_by, decided_at) on table public.group_join_requests to authenticated;

revoke update on table public.group_join_requests from public, anon, authenticated;
grant update (id, group_id, user_id, bericht, status, decided_by, decided_at) on table public.group_join_requests to authenticated;

revoke insert on table public.group_members from public, anon, authenticated;
grant insert (group_id, user_id, role, status) on table public.group_members to authenticated;

revoke update on table public.group_members from public, anon, authenticated;
grant update (group_id, user_id, role, status) on table public.group_members to authenticated;

revoke insert on table public.groups from public, anon, authenticated;
grant insert (id, name, icon, created_by, invite_code, invite_revoked, huddle_day, tz, evidence_policy, approval_rule, season_cadence, status, zichtbaarheid, approval_quorum, ontdekbaar, categorie, omschrijving, voertaal) on table public.groups to authenticated;

revoke insert on table public.milestones from public, anon, authenticated;
grant insert (id, goal_id, title, description, target_date, order_index, status, ai_generated, completed_at) on table public.milestones to authenticated;

revoke update on table public.milestones from public, anon, authenticated;
grant update (title, description, target_date, status, completed_at) on table public.milestones to authenticated;

revoke insert on table public.profiles from public, anon, authenticated;
grant insert (id, display_name, avatar_url, week_start_day, tz, reminder_time, reminder_enabled, reminder_tone, share_moves_by_default, onboarded_at, wants_own_goal, locale, focus_areas, minutes_per_day, when_i_do_it, what_breaks_it) on table public.profiles to authenticated;

revoke insert on table public.reports from public, anon, authenticated;
grant insert (id, reporter_id, subject_id, group_id, message_id, bericht_kopie, reden, toelichting, status) on table public.reports to authenticated;

revoke update on table public.reports from public, anon, authenticated;
grant update (id, reporter_id, subject_id, group_id, message_id, bericht_kopie, reden, toelichting, status) on table public.reports to authenticated;

revoke insert on table public.user_blocks from public, anon, authenticated;
grant insert (blocker_id, blocked_id) on table public.user_blocks to authenticated;

revoke update on table public.user_blocks from public, anon, authenticated;
grant update (blocker_id, blocked_id) on table public.user_blocks to authenticated;

revoke insert on table public.week_review_replies from public, anon, authenticated;
grant insert (week_review_id, author_id, body) on table public.week_review_replies to authenticated;

revoke update on table public.week_review_replies from public, anon, authenticated;
grant update (id, week_review_id, author_id, body) on table public.week_review_replies to authenticated;

revoke insert on table public.week_reviews from public, anon, authenticated;
grant insert (group_id, user_id, group_period_start, did_text, blocked_text, next_text) on table public.week_reviews to authenticated;

revoke update on table public.week_reviews from public, anon, authenticated;
grant update (group_id, user_id, group_period_start, did_text, blocked_text, next_text) on table public.week_reviews to authenticated;

revoke insert on table public.weekly_plan_steps from public, anon, authenticated;
grant insert (goal_id, milestone_id, order_index, title, floor_text, ceiling_text, ai_generated) on table public.weekly_plan_steps to authenticated;

revoke update on table public.weekly_plan_steps from public, anon, authenticated;
grant update (title, floor_text, ceiling_text) on table public.weekly_plan_steps to authenticated;

-- ---------------------------------------------------------------------------
-- De grendel die de vólgende vindt
-- ---------------------------------------------------------------------------
--
-- De regel, en hij is met opzet precies in plaats van fuzzy:
--
--   > Geen kolom van type `timestamptz` met een `now()`-default staat in een
--   > INSERT- of UPDATE-grant van `anon` of `authenticated`.
--
-- ⚠️ **Waarom niet "elke kolom die in een limietfunctie voorkomt".** Dat is de
--    échte belofte, maar er is een parser voor nodig om hem te toetsen, en een
--    controle die je niet kunt draaien bewaakt niets. Deze regel is een
--    catalogusvraag: goedkoop, exact, en hij vangt alle 33 gevallen van vandaag.
--
-- ⚠️ **Hij kan nu pas landen, en dat is geen toeval.** Vóór dit bestand meldde
--    hij er 33. Een controle die bij invoering rood staat en rood blíjft, leer je
--    wegklikken — dat is de reden dat hij niet in 0173 zat, en de reden dat de
--    revokes hierboven eerst komen.
--
-- ⚠️ **Het register is vandaag leeg, en het staat er tóch.** Niet als opsmuk:
--    de tweede tak is de andere kant van de ratel, dezelfde vorm als in 0167. Wie
--    hier ooit een uitzondering bijzet, krijgt er gratis de bewaking bij dat die
--    uitzondering verdwijnt zodra hij niets meer dekt. Een register zonder die
--    tak rot, en dan dekt een naam straks iets ánders dan waarvoor hij er staat.

create or replace function public.tijdstempel_bewaking()
returns table(tabel text, kolom text, bezwaar text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with tijdstempels as (
    select c.table_name::text as tabel, c.column_name::text as kolom
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.data_type = 'timestamp with time zone'
      and c.column_default like '%now()%'
  ),
  -- Bekend, benoemd, met reden en datum. Vandaag leeg.
  --
  -- ⚠️ Een regel hier is een schuld en geen vrijstelling: hij zegt "deze kolom
  --    mág de client zetten, en dit is waarom". Vervalt die reden, dan wordt de
  --    tweede tak rood.
  uitzonderingen(tabel, kolom, reden, sinds) as (
    select null::text, null::text, null::text, null::text where false
  )
  select cp.table_name::text,
         cp.column_name::text,
         'client mag een servertijdstempel schrijven (' || cp.privilege_type || ')'
  from information_schema.column_privileges cp
  join tijdstempels t
    on t.tabel = cp.table_name and t.kolom = cp.column_name
  where cp.table_schema = 'public'
    and cp.grantee in ('anon', 'authenticated')
    and cp.privilege_type in ('INSERT', 'UPDATE')
    and not exists (
      select 1 from uitzonderingen u
      where u.tabel = cp.table_name and u.kolom = cp.column_name
    )
  union all
  select u.tabel,
         u.kolom,
         'staat als uitzondering geregistreerd (' || u.sinds || ') maar is geen bezwaar meer'
  from uitzonderingen u
  where not exists (
    select 1
    from information_schema.column_privileges cp
    join tijdstempels t on t.tabel = cp.table_name and t.kolom = cp.column_name
    where cp.table_schema = 'public'
      and cp.table_name = u.tabel and cp.column_name = u.kolom
      and cp.grantee in ('anon', 'authenticated')
      and cp.privilege_type in ('INSERT', 'UPDATE')
  )
  order by 1, 2, 3;
$$;

comment on function public.tijdstempel_bewaking() is
  'Kolommen van type timestamptz met een now()-default die anon of authenticated '
  'mag schrijven — elke teller of venster dat erop rekent is dan te omzeilen. '
  'Tweede tak: een uitzondering in het eigen register die niets meer dekt. '
  'Zie migratie 0175 (QS8-299).';

-- ⚠️ De volledige vorm van onwrikbare regel 4. Deze functie is er voor
--    `adminDb()` in de testsuite; `authenticated` heeft hem niet nodig en zou er
--    alleen het schema mee kunnen uitlezen — de les van 0167.
revoke execute on function public.tijdstempel_bewaking() from public, anon, authenticated;

commit;
