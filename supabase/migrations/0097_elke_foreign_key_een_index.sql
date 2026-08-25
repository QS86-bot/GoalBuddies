-- 0097_elke_foreign_key_een_index.sql — onwrikbare regel 11, nagemeten
--
-- ROLLBACK-PAD:
--   drop index if exists public.ai_jobs_goal_idx;
--   drop index if exists public.breathers_goal_idx;
--   drop index if exists public.chain_links_user_idx;
--   drop index if exists public.commitment_events_actor_idx;
--   drop index if exists public.completion_approvals_group_idx;
--   drop index if exists public.completion_approvals_subject_idx;
--   drop index if exists public.completions_superseded_idx;
--   drop index if exists public.completions_user_idx;
--   drop index if exists public.goal_events_actor_idx;
--   drop index if exists public.group_events_actor_idx;
--   drop index if exists public.invite_events_group_idx;
--   drop index if exists public.points_ledger_group_idx;
--   drop index if exists public.user_streaks_goal_idx;
--   drop index if exists public.week_pass_events_goal_idx;
--   drop index if exists public.week_reviews_user_idx;
--   create index if not exists ai_jobs_user_recent_idx on ai_jobs (user_id, created_at desc);
--   drop function if exists public.indexdekking_bewaking();
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De rij van 19-08 in ENGINEER-REVIEW noemde één ontbrekende index. Het
--    zijn er vijftien.** Die rij ging over `breathers.goal_id` en stond op Laag
--    met "wordt zwaarder als `breathers` gevuld raakt". Dat klopte voor die ene
--    kolom, maar de rij is nooit tegen de hele database gelegd — en dat is
--    precies de vorm die regel 18 beschrijft: de bevinding toetste een
--    onderdeel terwijl de regel over het geheel gaat.
--
--    Gemeten op 25-08-2026, op het échte project én op de lokaal uit
--    `supabase/migrations/` opgebouwde database. Beide geven dezelfde vijftien,
--    dus dit is geen drift maar een gat in het schema zelf:
--
--      ai_jobs.goal_id                    goal_events.actor_id
--      breathers.goal_id                  group_events.actor_id
--      chain_links.user_id                invite_events.group_id
--      commitment_events.actor_id         points_ledger.group_id
--      completion_approvals.group_id      user_streaks.goal_id
--      completion_approvals.subject_id    week_pass_events.goal_id
--      completions.superseded_by          week_reviews.user_id
--      completions.user_id
--
-- ⚠️ **Postgres indexeert de kindkant van een foreign key nooit vanzelf**, en
--    dat is de valkuil: de ouderkant heeft altijd een unieke index (anders mag
--    de constraint niet bestaan), dus het vóélt gedekt. Een aantal van deze
--    kolommen komt wél voor in een samengestelde index, maar niet vooraan —
--    `user_streaks` heeft `(user_id, goal_id)` als sleutel, `week_pass_events`
--    heeft `(user_id, goal_id)`, `chain_links` heeft `(group_id, user_id,
--    group_period_start)`. Een btree kan daar niets mee zodra je alleen de
--    tweede kolom kent. Vandaar dat de bewaking hieronder op de vóórste
--    kolommen toetst en niet op "komt ergens in een index voor".
--
-- ⚠️ **De duurste plek is niet een query maar een cascade.** Dertien tabellen
--    hangen met `on delete cascade` aan `profiles` (zie 0095). Bij het
--    verwijderen van één gebruiker moet Postgres voor élke kindtabel de rijen
--    zoeken die naar hem wijzen; zonder index is dat een seq scan per tabel.
--    Vier van de vijftien hierboven zitten precies daar: `completions.user_id`,
--    `chain_links.user_id`, `week_reviews.user_id` en
--    `completion_approvals.subject_id`. Bij 100k gebruikers is het verwijderen
--    van één account dan een scan over de hele geschiedenis van iedereen.
--
-- ⚠️ **Nu is het gratis, straks niet.** Alle betrokken tabellen staan vandaag
--    op nul of bijna nul rijen, dus deze migratie bouwt vijftien lege indexen
--    en heeft geen lock die iets ophoudt. Daarom gewoon `create index` en niet
--    `concurrently`: dat laatste kan niet in een transactie en is pas nodig als
--    er data staat. Wie dit op een gevulde tabel herhaalt, gebruikt
--    `concurrently` en draait het buiten de migratieloop.
--
-- ⚠️ Partieel waar de kolom nullable is (`where … is not null`). Dat is niet
--    zuinigheid maar dezelfde vorm die `points_ledger_goal_idx` al had: een
--    cascade en een `join` zoeken altijd een bestaande waarde op, dus de
--    NULL-rijen horen niet in de index. Bij `completions.superseded_by` scheelt
--    dat alles — die kolom is per definitie leeg zolang een voltooiing de
--    geldige is.

-- ---------------------------------------------------------------------------
-- 1. De vijftien
-- ---------------------------------------------------------------------------

create index if not exists ai_jobs_goal_idx
  on ai_jobs (goal_id) where goal_id is not null;

create index if not exists breathers_goal_idx
  on breathers (goal_id);

create index if not exists chain_links_user_idx
  on chain_links (user_id) where user_id is not null;

create index if not exists commitment_events_actor_idx
  on commitment_events (actor_id) where actor_id is not null;

create index if not exists completion_approvals_group_idx
  on completion_approvals (group_id);

create index if not exists completion_approvals_subject_idx
  on completion_approvals (subject_id);

-- ⚠️ `completions_active_uniq` indexeert `weekly_goal_id` mét `where
--    superseded_by is null`, dus de opvolgerkolom zelf is daar niet uit te
--    lezen. Dit is de omgekeerde vraag: welke voltooiing verving déze.
create index if not exists completions_superseded_idx
  on completions (superseded_by) where superseded_by is not null;

create index if not exists completions_user_idx
  on completions (user_id);

create index if not exists goal_events_actor_idx
  on goal_events (actor_id);

create index if not exists group_events_actor_idx
  on group_events (actor_id) where actor_id is not null;

create index if not exists invite_events_group_idx
  on invite_events (group_id) where group_id is not null;

create index if not exists points_ledger_group_idx
  on points_ledger (group_id) where group_id is not null;

create index if not exists user_streaks_goal_idx
  on user_streaks (goal_id);

create index if not exists week_pass_events_goal_idx
  on week_pass_events (goal_id);

create index if not exists week_reviews_user_idx
  on week_reviews (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. En eentje die er twee keer stond
-- ---------------------------------------------------------------------------
--
-- ⚠️ `ai_jobs_user_recent_idx` (0038) en `ai_jobs_user_created_idx` (0001) zijn
--    woordelijk dezelfde index onder een andere naam: `(user_id, created_at
--    desc)`. `if not exists` kijkt naar de naam en niet naar de definitie, dus
--    de dubbele is er stil bijgekomen. Hij kost een schrijfactie bij elke
--    insert en levert niets — de planner kiest er altijd maar één.
--
--    De oudste blijft staan, want die staat in het basisschema.

drop index if exists ai_jobs_user_recent_idx;

-- ---------------------------------------------------------------------------
-- 3. Zodat de zestiende niet stil ontstaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een ontbrekende index is onzichtbaar: niets gaat stuk, er komt geen
--    foutmelding, en op een lege tabel is een seq scan zelfs sneller. Precies
--    zoals bij `realtime_bewaking()` (0027) en `viewrechten_bewaking()` (0095)
--    is de enige manier om dit vast te houden een functie die de stand
--    teruggeeft, plus een test die hem leeg verwacht.
--
-- ⚠️ Toetst op de vóórste kolommen van een index (`indkey[0..n-1]`), want dat
--    is wat een btree kan gebruiken. Een partiële index telt mee: de vraag die
--    een foreign key stelt gaat altijd over een bestaande waarde.

create or replace function indexdekking_bewaking()
returns table(tabel text, constraint_naam text, kolommen text)
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  with fk as (
    select c.conrelid as relid,
           c.conrelid::regclass::text as tabel,
           c.conname::text as constraint_naam,
           c.conkey,
           (select string_agg(a.attname, ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a
                on a.attrelid = c.conrelid and a.attnum = k.attnum) as kolommen
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
  )
  select fk.tabel, fk.constraint_naam, fk.kolommen
  from fk
  where not exists (
    select 1
    from pg_index i
    where i.indrelid = fk.relid
      and (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] = fk.conkey
  )
  order by 1, 2;
$$;

comment on function indexdekking_bewaking() is
  'Foreign keys in public waarvan de kindkolommen niet vooraan in een index '
  'staan. Hoort leeg te zijn — onwrikbare regel 11. Postgres indexeert de '
  'kindkant nooit vanzelf, en een cascade over een ongeindexeerde kolom is een '
  'seq scan. Zie migratie 0097 en tests/rls/indexdekking.test.ts.';

revoke all on function indexdekking_bewaking() from public, anon, authenticated;
grant execute on function indexdekking_bewaking() to service_role;
