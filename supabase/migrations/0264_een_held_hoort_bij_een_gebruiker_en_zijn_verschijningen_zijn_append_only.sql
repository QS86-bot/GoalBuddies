-- 0264_een_held_hoort_bij_een_gebruiker_en_zijn_verschijningen_zijn_append_only.sql
-- — twee tabellen voor de zes helden van QS8-468: welke held van wie is, en
-- welke held wanneer gesproken heeft. Allebei eigenaar-only; de tweede
-- append-only (QS8-471).
--
-- ROLLBACK-PAD:
--   drop trigger if exists hero_profiles_tijd on public.hero_profiles;
--   drop function if exists public.zet_heldkeuze_tijd();
--   drop index if exists public.hero_appearances_gebruiker_tijd_idx;
--   drop table if exists public.hero_appearances;
--   drop table if exists public.hero_profiles;
--
-- ⚠️ Beide tabellen zijn nieuw en dus leeg; `drop table` valt hier niet onder
--    grens 2 van de beslisbevoegdheid. Wordt dit teruggedraaid nádat er helden
--    in staan, dan is dat een andere handeling met een `pg_dump` ervoor.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-468, besluit 1 en 5 van 14-09-2026. Het register van de zes helden staat
-- sinds QS8-469 in `src/modules/helden`; dit is de plek waar een gebruiker er
-- een van krijgt. 📏 Nagemeten in het schema: er was geen tabel die dit kon
-- dragen — `profiles` is de identiteit, `points_ledger` is de score, en
-- `notifications_sent` is een verzendlog zonder plek voor een stem.
--
-- ---------------------------------------------------------------------------
-- Wat hier met opzet níet staat
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Geen enkele groepstak, ook niet "alvast een beetje".** De
--    groepszichtbaarheid van besluit 5 is QS8-477 en loopt via een RPC met een
--    expliciete kolomlijst — zelfde vorm en zelfde reden als
--    `straffen_bij_uitstelverzoek()` (0218) en `getuigenissen()` (0169).
--
--    De reden is scherper dan "netjes gescheiden": **RLS kan geen kolommen
--    beperken.** Een vierde tak op `hero_appearances_select` geeft de hele rij
--    weg, en die rij draagt `trigger`. Twee van de zes triggerwaarden zijn
--    tegenslagsignalen: wie ziet dat Ignis (`misser`) of Lucerna (`stilte`)
--    langs is geweest, weet dat er iets gemist is. Dat is letterlijk het
--    schaamtemoment waar domeinregel 7 voor bestaat.
--
-- ⚠️ **Geen realtime.** Deze tabellen komen niet in de publicatie en krijgen
--    geen `REPLICA IDENTITY FULL`. Supabase past RLS toe op INSERT en UPDATE
--    maar niet op DELETE: met `FULL` gaat bij een verwijdering de volledige oude
--    rij over de lijn naar iedereen die zich abonneert — inclusief
--    `trigger = 'misser'`. `realtime_bewaking()` (0027) maakt dat toetsbaar.
--
-- ---------------------------------------------------------------------------
-- 1. hero_profiles — welke held van wie is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`user_id` is de primaire sleutel en niet een gewone kolom.** Eén held per
--    gebruiker is een eigenschap van het model en geen regel die de app aanhoudt;
--    als PK is hij afgedwongen én levert hij de index op de foreign key gratis
--    (onwrikbare regel 11).
--
-- ⚠️ **De zes waarden zijn een kopie van `HELDSLEUTELS` in
--    `src/modules/helden/helden.ts` en geen bron.** Dezelfde vorm als de
--    CHECK's op `goals.category`: de module bezit de lijst, de database dwingt
--    hem af, en `tests/rls/helden.test.ts` legt ze in béide richtingen naast
--    elkaar. Een waarde erbij is dus altijd eerst een migratie.
create table if not exists public.hero_profiles (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  hero_key  text        not null,
  source    text        not null default 'quiz',
  chosen_at timestamptz not null default now(),

  constraint hero_profiles_hero_key_geldig
    check (hero_key in ('strix', 'ignis', 'meridian', 'forge', 'lucerna', 'quip')),

  -- ⚠️ `quiz` is de uitslag van de vier vragen, `keuze` is wat de gebruiker bij
  --    gelijkspel zelf aanwees (besluit 7, QS8-474). Dat onderscheid staat hier
  --    en niet in de app, omdat het de enige plek is waar later te zien is of de
  --    quiz een held heeft aangewezen of dat de gebruiker hem gekozen heeft.
  constraint hero_profiles_source_geldig
    check (source in ('quiz', 'keuze'))
);

alter table public.hero_profiles enable row level security;

drop policy if exists hero_profiles_select on public.hero_profiles;
create policy hero_profiles_select on public.hero_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists hero_profiles_insert on public.hero_profiles;
create policy hero_profiles_insert on public.hero_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ⚠️ Je held mag veranderen — de quiz is opnieuw te doen. Wat niet verandert is
--    van wíe de rij is: `user_id` staat in geen enkele `grant update`, en deze
--    `with check` sluit de weg er alsnog omheen.
drop policy if exists hero_profiles_update on public.hero_profiles;
create policy hero_profiles_update on public.hero_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists hero_profiles_delete on public.hero_profiles;
create policy hero_profiles_delete on public.hero_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️ **`from public, anon, authenticated` en niet `from public, anon`.** In
--    Supabase deelt `alter default privileges` élke nieuwe tabel in `public` uit
--    aan alle drie; `from public, anon` ziet eruit als "van iedereen" en houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait. Zie
--    `docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md`.
revoke all on table public.hero_profiles from public, anon, authenticated;
grant select                            on table public.hero_profiles to authenticated;
grant insert (user_id, hero_key, source) on table public.hero_profiles to authenticated;
grant update (hero_key, source)          on table public.hero_profiles to authenticated;
grant delete                            on table public.hero_profiles to authenticated;

-- ⚠️ **De database bepaalt wanneer er gekozen is, niet de client.** `chosen_at`
--    staat in geen enkele grant, dus een client kán hem niet zetten; deze
--    trigger zorgt dat hij bij een wijziging óók echt meeschuift. Zonder hem
--    blijft er na "ik doe de quiz opnieuw" een datum staan die over de vorige
--    keuze gaat.
create or replace function public.zet_heldkeuze_tijd() returns trigger
  language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  new.chosen_at := now();
  return new;
end;
$$;

revoke all on function public.zet_heldkeuze_tijd() from public, anon, authenticated;

drop trigger if exists hero_profiles_tijd on public.hero_profiles;
create trigger hero_profiles_tijd
  before insert or update on public.hero_profiles
  for each row execute function public.zet_heldkeuze_tijd();

-- ---------------------------------------------------------------------------
-- 2. hero_appearances — welke held wanneer gesproken heeft
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Append-only, en dat staat hier op twee sloten die allebei nodig zijn.**
--    De policies voor UPDATE en DELETE staan er mét `using (false)` — niet omdat
--    een policy zonder rijen iets toevoegt bovenop een ontbrekende grant, maar
--    omdat een ontbrekende policy geen dichte deur is maar een ongestelde vraag
--    (onwrikbare regel 1). Het échte slot is dat er voor `authenticated` géén
--    `grant insert`, `grant update` of `grant delete` op deze tabel staat.
--
--    Zelfde keuze als bij `daily_moves` sinds 0197 en bij streaks: corrigeren
--    gebeurt met een nieuw record, niet door geschiedenis te overschrijven
--    (domeinregel 6).
--
--    ⚠️ Sinds de security-review van 14-09-2026 schrijft de client hier
--       helemaal niet meer — zie de noot bij `hero_appearances_insert`. Voor een
--       client is deze tabel dus niet append-only maar read-only; append-only
--       beschrijft wat `service_role` ermee mag.
create table if not exists public.hero_appearances (
  id       uuid        primary key default gen_random_uuid(),
  user_id  uuid        not null references public.profiles (id) on delete cascade,
  hero_key text        not null,
  trigger  text        not null,
  shown_at timestamptz not null default now(),

  constraint hero_appearances_hero_key_geldig
    check (hero_key in ('strix', 'ignis', 'meridian', 'forge', 'lucerna', 'quip')),

  -- ⚠️ Een kopie van `TRIGGERS` uit `src/modules/helden/helden.ts`, zelfde
  --    afspraak als bij `hero_key` hierboven. `misser` en `stilte` zijn de twee
  --    tegenslagsignalen; zie de waarschuwing bovenaan dit bestand.
  constraint hero_appearances_trigger_geldig
    check (trigger in ('mijlpaal', 'misser', 'nieuw_doel', 'vastlopen', 'stilte', 'tussendoor'))
);

-- ⚠️ **`(user_id, shown_at desc)` en niet twee losse indexen.** QS8-475 stelt bij
--    elke nudge-ronde één vraag: *heeft er vandaag al een held gesproken voor
--    deze gebruiker?* Dat is een bereikvraag op één gebruiker, en die wordt
--    volledig uit deze index beantwoord. Hij dekt bovendien de foreign key op
--    `user_id` (onwrikbare regel 11), want dat is de leidende kolom.
create index if not exists hero_appearances_gebruiker_tijd_idx
  on public.hero_appearances (user_id, shown_at desc);

alter table public.hero_appearances enable row level security;

drop policy if exists hero_appearances_select on public.hero_appearances;
create policy hero_appearances_select on public.hero_appearances
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️⚠️ **Geen client schrijft hier, ook de eigenaar niet.** Een verschijning is
--    een systeemuitspraak over het gedrag van de gebruiker en geen invoer van de
--    gebruiker — zelfde soort rij als `badges`, `points_ledger`, `goal_events` en
--    `notifications_sent`, die `authenticated` alle vier alléén SELECT geven.
--    Schrijven gebeurt door de Edge Function onder `service_role`, die RLS
--    passeert.
--
--    Dat is niet alleen consistentie. Zodra QS8-477 verschijningen aan een open
--    groep toont, is een zelfgeschreven rij een reputatiesignaal dat de
--    gebruiker zelf verzint: `trigger = 'mijlpaal'` zonder mijlpaal. Besloten op
--    14-09-2026 na de security-review op dit issue.
drop policy if exists hero_appearances_insert on public.hero_appearances;
create policy hero_appearances_insert on public.hero_appearances
  for insert to authenticated
  with check (false);

drop policy if exists hero_appearances_update on public.hero_appearances;
create policy hero_appearances_update on public.hero_appearances
  for update to authenticated
  using (false) with check (false);

drop policy if exists hero_appearances_delete on public.hero_appearances;
create policy hero_appearances_delete on public.hero_appearances
  for delete to authenticated
  using (false);

revoke all on table public.hero_appearances from public, anon, authenticated;
grant select on table public.hero_appearances to authenticated;
-- ⚠️ **Alleen SELECT, en dat is het hele slot.** Geen `grant insert`, geen
--    `grant update`, geen `grant delete`. De drie policies hierboven staan er
--    omdat een ontbrekende policy geen dichte deur is maar een ongestelde vraag
--    (onwrikbare regel 1) — maar wat een client tegenhoudt, is de grant die er
--    niet is.
