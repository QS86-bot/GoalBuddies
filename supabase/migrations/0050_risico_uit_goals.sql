-- 0050_risico_uit_goals.sql — domeinregel 7, vóór EPIC 12
--
-- ROLLBACK-PAD:
--   alter table public.goals
--     add column if not exists risk_status text not null default 'on_track',
--     add column if not exists risk_reason jsonb,
--     add column if not exists risk_computed_at timestamptz;
--   -- daarna goal_dashboard opnieuw met die drie kolommen erin, en:
--   drop table if exists public.goal_risk;
--
-- ⚠️ Waarom deze migratie bestaat, en waarom nú.
--    `goals_select` is `owner_id = auth.uid() or shares_group_with_goal(id)`, en
--    RLS beslist over rijen en niet over kolommen. Een groepsgenoot kreeg dus de
--    héle rij van een gekoppeld doel — inclusief `risk_status` (`'behind'`,
--    `'unreachable'`) en de jsonb-onderbouwing in `risk_reason`. Dat zijn per
--    definitie tegenslagsignalen over iemand anders.
--
--    Vandaag is dat onschadelijk: de Risico-radar bestaat niet en elke rij staat
--    op `on_track`. **EPIC 12 is precies wat daar verandering in brengt.**
--    Beslisdocument 002 §4a zegt het zelf, bij besluit A17: "Vanaf de dag dat
--    die radar draait, ís deze kolom een afgeleide van andermans tegenslag — en
--    dan is de vraag of het besluit nog hetzelfde uitvalt. **Herbevestigen vóór
--    EPIC 12.**" Quinten heeft dat op 20-08-2026 herbevestigd, en de uitkomst is
--    de andere kant op: dicht.
--
--    Dit is dezelfde vorm als `excused` in 0047, één week eerder gevonden: een
--    kolom die niets lekt zolang niemand hem vult, met een vuller die eraan komt.
--
-- ⚠️ **Waarom een eigen tabel en niet een kolomgrant of een gesplitste policy.**
--    Drie routes zijn overwogen:
--
--    1. `revoke select (risk_status, ...) on goals from authenticated` — werkt
--       niet. Een kolomgrant geldt per rol, niet per rij, dus de eigenaar
--       verliest zijn eigen risicostand net zo goed.
--    2. `goals_select` terug naar eigenaar-only plus een definer-view met
--       kolomlijst voor de groep. Dat is wat ENGINEER-REVIEW voorstelde, en het
--       breekt `group_overview()`: die is `STABLE` en niet `SECURITY DEFINER`,
--       dus hij leest `goals` onder de RLS van de aanroeper. Een groepsoverzicht
--       zonder doeltitels is geen groepsoverzicht.
--    3. **Deze:** de drie kolommen naar een eigen tabel met eigenaar-only RLS.
--
--    Drie wint omdat de bescherming dan **structureel** is in plaats van een
--    policy die je goed moet blijven onthouden. Er is geen rij om te lekken, dus
--    er is ook geen kolomlijst die iemand over een half jaar per ongeluk
--    uitbreidt. Dat is precies de eigenschap die de `excused`-bug had voorkomen.
--
-- ⚠️ Geen dataverlies: `goals` is leeg en alle drie de kolommen staan overal op
--    hun standaardwaarde. Gecontroleerd vóór het droppen.
--
-- ⚠️ `goal_dashboard` verliest de drie kolommen. Ze werden door geen enkel
--    scherm gerenderd — `DoelMetVoortgang.risk_status` bestond wel en werd
--    nergens getoond. EPIC 12 leest straks `goal_risk` rechtstreeks, en dat is
--    ook waar het hoort: voortgang en risico zijn twee dingen.

begin;

-- ---------------------------------------------------------------------------
-- 1. De nieuwe thuisbasis van de Risico-radar
-- ---------------------------------------------------------------------------

create table if not exists public.goal_risk (
  goal_id      uuid primary key references public.goals(id) on delete cascade,
  status       text not null default 'on_track',
  -- De onderbouwing: welke signalen leidden tot deze stand. Bewust jsonb, want
  -- de Risico-radar is een heuristiek die gaat veranderen (ENGINEER-REVIEW).
  reason       jsonb,
  computed_at  timestamptz not null default now(),

  constraint goal_risk_status_valid
    check (status in ('on_track', 'at_risk', 'behind', 'unreachable'))
);

comment on table public.goal_risk is
  'De Risico-radar (EPIC 12). Uitsluitend leesbaar voor de eigenaar van het '
  'doel: dit is een afgeleide van gemiste weken en dus tegenslag over een '
  'persoon (domeinregel 7). Stond tot 0050 als drie kolommen op goals, waar '
  'goals_select hem aan elke groepsgenoot gaf.';

alter table public.goal_risk enable row level security;

-- ⚠️ Eigenaar-only, en er is met opzet géén tak voor groepsgenoten. Wil de
--    gebruiker zijn groep om hulp vragen (QS8-95), dan gaat dat via een
--    handeling van hemzelf — niet doordat de groep deze tabel kan lezen. Dat is
--    de route die domeinregel 7 openlaat.
drop policy if exists goal_risk_select on public.goal_risk;
create policy goal_risk_select on public.goal_risk
  for select to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = goal_risk.goal_id and g.owner_id = auth.uid()
    )
  );

-- ⚠️ Niemand schrijft dit vanuit de client. De radar draait server-side; een
--    zelfgekozen risicostand is een verzonnen stand. Geen INSERT-, UPDATE- of
--    DELETE-policy en geen tabelrecht — `service_role` omzeilt RLS en kan wel.
revoke all on public.goal_risk from anon;
revoke insert, update, delete on public.goal_risk from authenticated;
grant select on public.goal_risk to authenticated;

-- ---------------------------------------------------------------------------
-- 2. goal_dashboard opnieuw, zonder de risicokolommen
-- ---------------------------------------------------------------------------
--
-- ⚠️ `security_invoker = true` blijft staan. Dat is wat ervoor zorgt dat de
--    tellingen onder de RLS van de aanroeper vallen — en sinds 0047 is dat ook
--    wat `excused` uit de telling van een groepsgenoot houdt.

drop view if exists public.goal_dashboard;

create view public.goal_dashboard
with (security_invoker = true) as
  select
    g.id,
    g.owner_id,
    g.title,
    g.description,
    g.category,
    g.identity_statement,
    g.target_date,
    g.available_hours_per_week,
    g.max_points,
    g.status,
    g.created_at,
    g.updated_at,
    (select count(*) from public.milestones m
      where m.goal_id = g.id and m.status <> 'dropped') as milestones_total,
    (select count(*) from public.milestones m
      where m.goal_id = g.id and m.status = 'done') as milestones_done,
    (select count(*) from public.weekly_goals w
      where w.goal_id = g.id) as weekly_total,
    (select count(*) from public.weekly_goals w
      where w.goal_id = g.id and w.status = 'approved') as weekly_approved
  from public.goals g;

grant select on public.goal_dashboard to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De kolommen weg bij goals
-- ---------------------------------------------------------------------------
--
-- ⚠️ Pas ná het herbouwen van de view, anders faalt de drop op de afhankelijkheid.

alter table public.goals drop column if exists risk_status;
alter table public.goals drop column if exists risk_reason;
alter table public.goals drop column if exists risk_computed_at;

commit;
