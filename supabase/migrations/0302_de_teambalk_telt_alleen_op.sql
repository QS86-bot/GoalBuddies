-- 0302_de_teambalk_telt_alleen_op.sql — de voortgangsteller van een teamdoel en
-- de RPC die er één getal uit geeft (QS8-655, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0301 van QS8-654, en productie draagt al
--    0299–0302 van QS8-233 (QS8-641). Het nummer botst met productie; niet
--    hernummeren zonder besluit van Quinten.
--
-- ROLLBACK-PAD (de teller is bij het landen leeg; met tellingen erin is dit
-- grens 2, want ze zijn niet terug te rekenen, en vraagt het eerst een `pg_dump`):
--   drop function if exists public.teambalk(uuid);
--   drop trigger if exists milestones_geteld_blijft on public.milestones;
--   drop function if exists public.getelde_mijlpaal_blijft();
--   drop trigger if exists milestones_teamteller on public.milestones;
--   drop function if exists public.tel_teammijlpaal();
--   drop table if exists public.team_progress_events;   -- met zijn trigger
--   drop function if exists public.teamteller_alleen_erbij();
--   drop function if exists public.teamteller_niet_leeg();
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- Besluit 7 en 16 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- tabel 6 van de spec, en de keuzes in
-- `docs/decisions/2026-11-17-de-teambalk-telt-alleen-op.md`.
--
-- 1. `team_progress_events`: één rij per mijlpaal van een aandeel die voor het
--    eerst op `done` gaat. **Geen gebruikerskolom en geen tijdstip dat ertoe
--    doet**, zodat de teller per persoon niet terug te rekenen is.
-- 2. Alleen erbij. Een UPDATE of DELETE weigert, ook voor `service_role`. Twee
--    uitzonderingen, en allebei komen ze van een foreign key en niet van een
--    aanroeper: de mijlpaal verdwijnt (de rij blijft, `milestone_id` wordt leeg,
--    de telling daalt niet) en het teamdoel zelf verdwijnt (dan gaat de hele
--    teller mee).
-- 3. `teambalk()`: het aantal rijen. Geen noemer, geen persoon, geen datum, geen
--    delta. Wie het teamdoel niet mag lezen, krijgt `null`, net als bij een
--    verzonnen id.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De tabel
-- ---------------------------------------------------------------------------

create table if not exists public.team_progress_events (
  id           uuid primary key default gen_random_uuid(),
  team_goal_id uuid not null references public.team_goals(id) on delete cascade,
  milestone_id uuid references public.milestones(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint team_progress_events_een_per_mijlpaal unique (team_goal_id, milestone_id)
);

create index if not exists team_progress_events_milestone_idx on public.team_progress_events (milestone_id);

comment on table public.team_progress_events is
  'De teller achter de teambalk (QS8-655). Append-only, zonder persoon. Alleen leesbaar via teambalk().';

-- ---------------------------------------------------------------------------
-- 2. Alleen erbij
-- ---------------------------------------------------------------------------

create or replace function public.teamteller_alleen_erbij()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- ⚠️ **De twee uitzonderingen herkent hij aan de diepte, niet aan de rol.**
  --    Een foreign-keyactie draait zelf als trigger op de verwijzende tabel, dus
  --    deze trigger zit dan een niveau dieper dan bij een rechtstreekse
  --    aanroep. Een rechtstreekse UPDATE of DELETE, ook van `service_role`,
  --    heeft diepte 1 en weigert.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    -- De mijlpaal is weg: alleen `milestone_id` mag leeg worden, verder niets.
    -- De gedaante `new.x is null and old.x is not null` is wat
    -- `onveranderlijkheid_bewaking()` als grendel herkent (de vorm van 0262).
    if new.milestone_id is null and old.milestone_id is not null
       and new.id = old.id and new.team_goal_id = old.team_goal_id
       and new.created_at = old.created_at then
      return new;
    end if;
  end if;
  raise exception 'De teamteller telt alleen op'
    using errcode = 'check_violation',
          hint = 'Een teambalk die daalt is precies het signaal dat besluit 7 verbiedt.';
end;
$$;
revoke all on function public.teamteller_alleen_erbij() from public, anon, authenticated;

drop trigger if exists team_progress_events_alleen_erbij on public.team_progress_events;
create trigger team_progress_events_alleen_erbij
  before update or delete on public.team_progress_events
  for each row execute function public.teamteller_alleen_erbij();

-- ⚠️ **En geen TRUNCATE** (securityreview QS8-655, L1). Rij-triggers grijpen bij
--    een TRUNCATE niet in, en `service_role` heeft dat recht standaard. Een
--    statement-trigger en geen `revoke`: `tests/rls/policies.test.ts` eist dat
--    `service_role` zijn tabelrechten houdt, en de trigger geldt voor iedereen.
create or replace function public.teamteller_niet_leeg()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'De teamteller telt alleen op' using errcode = 'check_violation';
end;
$$;
revoke all on function public.teamteller_niet_leeg() from public, anon, authenticated;

drop trigger if exists team_progress_events_niet_leeg on public.team_progress_events;
create trigger team_progress_events_niet_leeg
  before truncate on public.team_progress_events
  for each statement execute function public.teamteller_niet_leeg();

-- ⚠️⚠️ **Een getelde mijlpaal is niet meer rechtstreeks te verwijderen**
--    (securityreview QS8-655, H1, gemeten: 3000 in drie rondes). Zonder dit
--    blies één lid de balk onbeperkt op: duizend mijlpalen, op gedaan, weg, en
--    opnieuw. Het dagplafond telt alleen mijlpalen die nog bestaan, en elke
--    verwijdering liet een rij met een lege `milestone_id` achter die niet met
--    de UNIQUE botst. De vorm volgt domeinregel 6: wat geteld is, is
--    geschiedenis. Een cascade van het doel of het account (diepte > 1) mag wel;
--    dan blijft de rij staan en daalt de balk niet. Het geldt ook na `dropped`,
--    want de toets is "is hij geteld" en niet "is hij nu gedaan".
create or replace function public.getelde_mijlpaal_blijft()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if pg_trigger_depth() = 1
     and exists (select 1 from team_progress_events e where e.milestone_id = old.id) then
    raise exception 'Een mijlpaal die in de teambalk telt, blijft staan'
      using errcode = 'check_violation',
            hint = 'Zet hem op dropped als hij niet meer van toepassing is.';
  end if;
  return old;
end;
$$;
revoke all on function public.getelde_mijlpaal_blijft() from public, anon, authenticated;

drop trigger if exists milestones_geteld_blijft on public.milestones;
create trigger milestones_geteld_blijft
  before delete on public.milestones
  for each row execute function public.getelde_mijlpaal_blijft();

-- ---------------------------------------------------------------------------
-- 3. De vuller: de eerste keer dat een mijlpaal van een aandeel gedaan is
-- ---------------------------------------------------------------------------

create or replace function public.tel_teammijlpaal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'done' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'done' then return new; end if;

  -- ⚠️ **Alleen zolang het aandeel aan zijn teamgroep hangt.** Na vertrek uit de
  --    organisatie of de teamgroep is de koppeling weg (0300, `verwijder_lid()`).
  --    Wat er al geteld was blijft staan (besluit 14); wat de vertrokken
  --    eigenaar daarna aan zijn eigen doel doet, is niet meer van het team.
  --    `on conflict do nothing`: gedaan, terug naar te doen, en weer gedaan telt
  --    één keer.
  insert into team_progress_events (team_goal_id, milestone_id)
  select s.team_goal_id, new.id
    from team_goal_shares s
    join team_goals t on t.id = s.team_goal_id
    join goal_group_links l on l.goal_id = s.goal_id and l.group_id = t.group_id
   where s.goal_id = new.goal_id
  on conflict (team_goal_id, milestone_id) do nothing;

  return new;
end;
$$;
revoke all on function public.tel_teammijlpaal() from public, anon, authenticated;

drop trigger if exists milestones_teamteller on public.milestones;
create trigger milestones_teamteller
  after insert or update of status on public.milestones
  for each row execute function public.tel_teammijlpaal();

-- ---------------------------------------------------------------------------
-- 4. Grants en policies
-- ---------------------------------------------------------------------------
--
-- Geen directe SELECT: alleen `teambalk()`. Een leesbare tabel zou per rij een
-- tijdstip geven, en tijdstippen naast elkaar leggen is een delta per dag.

revoke all on table public.team_progress_events from public, anon, authenticated;
alter table public.team_progress_events enable row level security;

drop policy if exists team_progress_events_select on public.team_progress_events;
create policy team_progress_events_select on public.team_progress_events
  for select to authenticated using (false);
drop policy if exists team_progress_events_insert on public.team_progress_events;
create policy team_progress_events_insert on public.team_progress_events
  for insert to authenticated with check (false);
drop policy if exists team_progress_events_update on public.team_progress_events;
create policy team_progress_events_update on public.team_progress_events
  for update to authenticated using (false) with check (false);
drop policy if exists team_progress_events_delete on public.team_progress_events;
create policy team_progress_events_delete on public.team_progress_events
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- 5. teambalk(): één getal
-- ---------------------------------------------------------------------------

create or replace function public.teambalk(p_team_goal_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- ⚠️ Eén antwoord, `null`, voor een onbekend id en voor een teamdoel dat je
  --    niet mag lezen: dezelfde poort als `team_goals_select`. Een organisatie-
  --    beheerder die geen lid is, krijgt dus ook `null` (besluit 6 en 36).
  select case
           when public.mag_groep_lezen(t.group_id)
           then (select count(*)::integer from team_progress_events e where e.team_goal_id = t.id)
         end
    from team_goals t
   where t.id = p_team_goal_id;
$$;
revoke all on function public.teambalk(uuid) from public, anon, authenticated;
grant execute on function public.teambalk(uuid) to authenticated;
