-- ---------------------------------------------------------------------------
-- 0113 — Badges, en ze zijn privé (QS8-78, PRD 8.4)
-- ---------------------------------------------------------------------------
--
-- ROLLBACK-PAD (in deze volgorde):
--
--   drop trigger if exists badges_na_reeks       on public.user_streaks;
--   drop trigger if exists badges_na_mijlpaal    on public.milestones;
--   drop trigger if exists badges_na_doel        on public.goals;
--   drop trigger if exists badges_na_beoordeling on public.completion_approvals;
--   drop function if exists public.badge_na_gebeurtenis();
--   drop function if exists public.verdien_badges(uuid);
--   drop table if exists public.badges;
--
-- ⚠️ De tabel weggooien wist verdiende badges. Dat kan hier zonder bezwaar zolang
--    er nul rijen staan; met echte gebruikers is het een besluit en geen
--    migratiestap — een badge is per ontwerp onherroepelijk (zie punt 2).
--
-- ---------------------------------------------------------------------------
-- Waarom deze kop zo lang is
-- ---------------------------------------------------------------------------
--
-- QS8-78 is één zin uit de PRD: *"Als gebruiker verdien ik badges voor mijlpalen
-- als '4 weken op rij' of 'eerste doel afgerond'."* Er staan geen
-- acceptatiecriteria onder. Alles hieronder is dus een keuze die **ik** gemaakt
-- heb en niet een eis die iemand gesteld heeft; ze staan hier zodat Quinten ze
-- kan omgooien in plaats van ze te moeten reconstrueren.
--
-- Volledige onderbouwing: `docs/decisions/2026-08-27-badges-zijn-prive.md`.
--
-- ---------------------------------------------------------------------------
-- 1. Badges zijn PRIVÉ, en dat is de belangrijkste keuze
-- ---------------------------------------------------------------------------
--
-- CLAUDE.md, besluit A41: *"Voor élk níeuw oppervlak is beschermd het antwoord
-- tot iemand het tegendeel besluit. Bouw niets 'vast open'; dat is precies hoe
-- een standaard verschuift zonder dat iemand het besloten heeft."*
--
-- Een badgemuur naast een ledenlijst is bovendien de zuiverste vorm van het
-- probleem dat domeinregel 7 beschrijft: **de badge die er níét staat, is het
-- signaal.** Wie na twaalf weken geen `streak_12` heeft, heeft zichtbaar een week
-- gemist — en dat is precies wat de groepsfeed nooit mag dragen.
--
-- `badges_select` is daarom `user_id = auth.uid()`, zonder uitzondering. Dezelfde
-- vorm als `points_ledger` (A42), `week_pass_events` (0039) en `goal_risk`
-- (0050). Het is géén oppervlak dat op `groups.zichtbaarheid` varieert: er is in
-- een open groep niets extra's te openen, want er gaat sowieso niets naar buiten.
--
-- ---------------------------------------------------------------------------
-- 2. Een badge verdwijnt nooit, en dat is een domeinregel en geen sentiment
-- ---------------------------------------------------------------------------
--
-- De reeksbadges hangen aan `best_streak` en niet aan `current_streak`. Zou een
-- badge verdwijnen als je reeks breekt, dan **ís het verdwijnen zelf de melding
-- dat je een week gemist hebt** — een tegenslagsignaal met een omweg, in je eigen
-- app, op het moment dat je het het minst kunt gebruiken.
--
-- Structureel afgedwongen: `badges` heeft géén UPDATE- en géén DELETE-policy, en
-- ook `service_role` heeft geen enkele reden om er een te krijgen. Dat is
-- dezelfde vorm als domeinregel 6 (streaks en voltooiingen zijn append-only).
--
-- ---------------------------------------------------------------------------
-- 3. Vijf badges, en waarom precies deze
-- ---------------------------------------------------------------------------
--
--   first_goal       — je eerste afgeronde doel        (staat in de PRD-zin)
--   streak_4         — vier weken op rij               (staat in de PRD-zin)
--   streak_12        — twaalf weken op rij             (een kwartaal; zelfde vorm)
--   first_milestone  — je eerste gehaalde mijlpaal     (de kleinste eerste winst)
--   first_review     — je eerste bevestigde buddyweek  (zie hieronder)
--
-- De eerste twee komen letterlijk uit de PRD. De andere drie zijn van dezelfde
-- soort: **een drempel die je passeert en daarna gepasseerd blijft.**
--
-- ⚠️ `first_review` beloont het gedrag waar dit hele product op leunt — iemand
--    anders zijn week bevestigen. Zonder beoordelaars is er geen peer-goedkeuring
--    en dus geen app. Het is bovendien de enige badge die niet over je eigen
--    prestatie gaat, en dat is met opzet.
--
-- ⚠️ **Wat er bewust níét bij zit:** een badge voor punten (die zijn privé én ze
--    kunnen dalen — A42), een badge voor "de meeste van je groep" (een ranglijst
--    is ook een lijst van wie onderaan staat), en een badge voor iets dat je
--    ondanks een tegenvaller haalt ("teruggekomen na een gemiste week") — dat
--    laatste maakt van een gemiste week een voorwaarde, en dan staat de tegenslag
--    alsnog in de app, alleen met een lint eromheen.
--
-- ---------------------------------------------------------------------------
-- 4. Eén functie die alles opnieuw uitrekent, en dat is de vangrail
-- ---------------------------------------------------------------------------
--
-- `verdien_badges(p_user_id)` evalueert **elke** voorwaarde opnieuw en voegt toe
-- wat er nieuw waar is, met `on conflict do nothing`. Hij is dus volledig en
-- idempotent.
--
-- Dat is bewust zo: er zijn vier momenten waarop een badge kan ontstaan, en die
-- roepen alle vier dezelfde functie aan. **Een vergeten aanroep vertraagt een
-- badge dan hooguit tot de volgende gebeurtenis — hij raakt er nooit een kwijt.**
-- Zou elke trigger zijn eigen badge inserten, dan is een gemist pad een badge die
-- nooit meer komt, en dat merk je pas als een gebruiker het meldt.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De tabel
-- ---------------------------------------------------------------------------

create table if not exists public.badges (
  user_id   uuid        not null references auth.users (id) on delete cascade,
  badge     text        not null,
  earned_at timestamptz not null default now(),

  primary key (user_id, badge),

  -- ⚠️ Een allowlist en geen vrije tekst. Dezelfde reden als bij
  --    `chat_messages_system_event_bekend`: de app heeft voor élke badge een naam
  --    en een uitleg nodig, en een badge zonder zin is een leeg vakje op het
  --    scherm. `badges.test.ts` legt deze lijst naast de app.
  constraint badges_bekend check (badge in (
    'first_goal',
    'first_milestone',
    'first_review',
    'streak_4',
    'streak_12'
  ))
);

create index if not exists badges_user_idx on public.badges (user_id);

alter table public.badges enable row level security;

-- ⚠️ **Alleen jijzelf.** Zie punt 1 in de kop: een badgemuur naast een ledenlijst
--    maakt van de ontbrekende badge het signaal.
drop policy if exists badges_select on public.badges;
create policy badges_select on public.badges
  for select to authenticated
  using (user_id = auth.uid());

-- ⚠️ Géén INSERT-, UPDATE- of DELETE-policy. `verdien_badges()` is de enige
--    schrijver en draait als DEFINER; een client die zijn eigen badges kan
--    schrijven, heeft geen badges maar een tekstveld.
drop policy if exists badges_insert on public.badges;
drop policy if exists badges_update on public.badges;
drop policy if exists badges_delete on public.badges;

revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;

-- ⚠️ **Ook `service_role` krijgt geen UPDATE of DELETE**, en dat is punt 2: een
--    badge die verdwijnt ís de melding dat je een week gemist hebt. Er is geen
--    pad waarlangs dat per ongeluk kan.
grant select, insert on public.badges to service_role;

comment on table public.badges is
  'Verdiende badges, uitsluitend leesbaar voor de eigenaar. Nooit te wijzigen of '
  'te verwijderen: een badge die verdwijnt is een gemiste week met een omweg — '
  'QS8-78.';

-- ---------------------------------------------------------------------------
-- Alles opnieuw uitrekenen, en toevoegen wat nieuw waar is
-- ---------------------------------------------------------------------------

create or replace function public.verdien_badges(p_user_id uuid)
  returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  erbij integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  -- ⚠️ Eén insert met een `values`-lijst en een `where` per rij. Zo staat elke
  --    voorwaarde één keer op één plek, en is "welke badges bestaan er" hier
  --    letterlijk af te lezen.
  with kandidaten as (
    select 'first_goal'::text as badge
     where exists (
       select 1 from goals g where g.owner_id = p_user_id and g.status = 'completed'
     )
    union all
    select 'first_milestone'
     where exists (
       select 1 from milestones m
       join goals g on g.id = m.goal_id
       where g.owner_id = p_user_id and m.status = 'done'
     )
    union all
    -- ⚠️ Ingetrokken beoordelingen tellen niet mee. Een badge voor iets dat je
    --    hebt teruggenomen, is geen badge (domeinregel 6: intrekken maakt
    --    ongedaan zonder te wissen).
    select 'first_review'
     where exists (
       select 1 from completion_approvals a
       where a.approver_id = p_user_id
         and not exists (
           select 1 from approval_withdrawals x where x.approval_id = a.id
         )
     )
    union all
    -- ⚠️ **`best_streak` en niet `current_streak`** — punt 2 in de kop. Een badge
    --    die verdwijnt als je reeks breekt, is een tegenslagsignaal.
    select 'streak_4'
     where exists (
       select 1 from user_streaks s where s.user_id = p_user_id and s.best_streak >= 4
     )
    union all
    select 'streak_12'
     where exists (
       select 1 from user_streaks s where s.user_id = p_user_id and s.best_streak >= 12
     )
  ),
  toegevoegd as (
    insert into badges (user_id, badge)
    select p_user_id, k.badge from kandidaten k
    on conflict (user_id, badge) do nothing
    returning 1
  )
  select count(*)::int into erbij from toegevoegd;

  return erbij;
end;
$$;

revoke all on function public.verdien_badges(uuid) from public, anon;

-- ⚠️ `authenticated` mag hem wél aanroepen, en dat is veilig: de functie schrijft
--    alleen badges die op grond van de data al verdiend zíjn. Wie hem voor een
--    ander aanroept, kent die ander hooguit een badge toe die hij toch al hoorde
--    te hebben — en leest er niets van terug, want `badges_select` is
--    eigenaar-only. Het scheelt een gebruiker een badge die tot de volgende
--    gebeurtenis moet wachten.
grant execute on function public.verdien_badges(uuid) to authenticated, service_role;

comment on function public.verdien_badges(uuid) is
  'Rekent elke badgevoorwaarde opnieuw uit en voegt toe wat nieuw waar is. '
  'Volledig en idempotent, zodat een vergeten aanroep een badge hooguit '
  'vertraagt — QS8-78.';

-- ---------------------------------------------------------------------------
-- De vier momenten waarop een badge kan ontstaan
-- ---------------------------------------------------------------------------

create or replace function public.badge_na_gebeurtenis()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  wie uuid;
begin
  -- ⚠️ Welke gebruiker het betreft hangt af van de tabel, en dat is de enige
  --    reden dat deze functie bestaat in plaats van vier losse triggers met
  --    dezelfde inhoud.
  --
  -- ⚠️ **`if/elsif` en géén `case ... when ... then new.<kolom>`.** Dat laatste
  --    stond hier eerst en viel meteen om: plpgsql bereidt bij een `case` álle
  --    takken voor, dus op een trigger over `goals` faalt `new.user_id` met
  --    *record "new" has no field "user_id"* — en dan gaat de hele UPDATE
  --    onderuit, niet alleen de badge. Bij `if/elsif` wordt alleen de genomen
  --    tak geëvalueerd.
  if tg_table_name = 'user_streaks' then
    wie := new.user_id;
  elsif tg_table_name = 'completion_approvals' then
    wie := new.approver_id;
  elsif tg_table_name = 'milestones' then
    select g.owner_id into wie from goals g where g.id = new.goal_id;
  elsif tg_table_name = 'goals' then
    wie := new.owner_id;
  end if;

  -- ⚠️ Een badge mag nooit een schrijfactie laten omvallen. Verdient iemand hem
  --    net niet, of gaat er iets mis, dan telt de onderliggende gebeurtenis nog
  --    steeds — dezelfde afweging als bij `meld_goedkeuring()`.
  begin
    perform verdien_badges(wie);
  exception
    when others then
      raise warning 'Badges bijwerken voor % is niet gelukt: %', wie, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.badge_na_gebeurtenis() from public, anon, authenticated;

drop trigger if exists badges_na_reeks on public.user_streaks;
create trigger badges_na_reeks
  after insert or update on public.user_streaks
  for each row execute function public.badge_na_gebeurtenis();

drop trigger if exists badges_na_mijlpaal on public.milestones;
create trigger badges_na_mijlpaal
  after update on public.milestones
  for each row when (new.status = 'done' and old.status is distinct from 'done')
  execute function public.badge_na_gebeurtenis();

drop trigger if exists badges_na_doel on public.goals;
create trigger badges_na_doel
  after update on public.goals
  for each row when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.badge_na_gebeurtenis();

drop trigger if exists badges_na_beoordeling on public.completion_approvals;
create trigger badges_na_beoordeling
  after insert on public.completion_approvals
  for each row execute function public.badge_na_gebeurtenis();
