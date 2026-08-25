-- 0096_de_cache_tegen_de_gebeurtenissen.sql — rij van 15-08 in ENGINEER-REVIEW
--
-- ROLLBACK-PAD:
--   drop function if exists public.herstel_weekdoelstatus();
--   drop function if exists public.weekdoelstatus_afwijkingen();
--
-- ⚠️ Terugrollen kost niets: beide functies lezen en repareren, ze veranderen
--    geen model. Wat je kwijtraakt is het zicht op drift.
--
-- ---------------------------------------------------------------------------
-- Waarom
-- ---------------------------------------------------------------------------
--
-- `docs/decisions/001-datamodel.md` legt vast dat `weekly_goals.status` een
-- cache is van `completions` plus `completion_approvals` — bewuste
-- denormalisatie, zodat een lijstscherm niet per weekdoel twee tabellen hoeft
-- te bevragen. De bevinding van 15-08 vroeg er twee dingen bij: een herstelweg
-- en een toets die de cache tegen de gebeurtenissen aan houdt. Die waren er
-- geen van beide.
--
-- ⚠️ **Een cache die uit de pas loopt, doet dat stil.** Er gaat niets kapot, er
--    weigert geen policy en geen enkele test wordt rood — het scherm laat alleen
--    iets anders zien dan er gebeurd is. Dat is precies de vorm die dit project
--    telkens duur betaalt, en de reden dat dit een controle wordt en geen zin in
--    een document.
--
-- ---------------------------------------------------------------------------
-- Wat er wél en niet af te leiden is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Maar drie van de zeven statussen volgen uit de gebeurtenissen**, en die
--    grens is het belangrijkste ontwerpbesluit in dit bestand:
--
--      todo     — geen levende voltooiing
--      pending  — een levende voltooiing, nog geen goedkeuring
--      approved — een levende voltooiing met een goedkeuring die niet is
--                 ingetrokken
--
--    `missed`, `carried`, `excused` en `cancelled` zijn bestuurlijke toestanden.
--    Ze komen van de rollover, van een weekpas, van doorschuiven of van de
--    gebruiker die zijn weekdoel zelf afsluit, en er is geen voltooiing waaruit
--    je ze kunt herleiden. Een controle die ze tóch beoordeelt, meldt elke
--    gemiste week als drift — en een controle die overdrijft, leer je te
--    negeren. Ze blijven hier dus buiten beschouwing, en dat is een bewuste
--    blinde vlek en geen omissie.
--
-- ⚠️ Twee dingen tellen niet mee als bewijs, en allebei omdat ze een gebeurtenis
--    ongedaan maken zonder hem te wissen (domeinregel 6):
--
--      * een voltooiing met `superseded_by` — opnieuw ingediend, dus de oude
--        telt niet meer;
--      * een goedkeuring waarvoor een rij in `approval_withdrawals` staat.
--
--    Wie die twee vergeet, krijgt een controle die `pending` als `approved`
--    leest zodra iemand een goedkeuring intrekt.

-- ---------------------------------------------------------------------------
-- 1. Wat er zou moeten staan
-- ---------------------------------------------------------------------------

create or replace function verwachte_weekdoelstatus(p_weekly_goal_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1
      from completions c
      join completion_approvals a on a.completion_id = c.id
      where c.weekly_goal_id = p_weekly_goal_id
        and c.superseded_by is null
        and a.status = 'approved'
        and not exists (select 1 from approval_withdrawals w where w.approval_id = a.id)
    ) then 'approved'
    when exists (
      select 1 from completions c
      where c.weekly_goal_id = p_weekly_goal_id and c.superseded_by is null
    ) then 'pending'
    else 'todo'
  end;
$$;

comment on function verwachte_weekdoelstatus(uuid) is
  'De status die uit de gebeurtenissen volgt, voor de drie afleidbare waarden. '
  'Zegt niets over missed, carried, excused of cancelled — zie migratie 0096.';

-- ---------------------------------------------------------------------------
-- 2. Waar het uit de pas loopt
-- ---------------------------------------------------------------------------

create or replace function weekdoelstatus_afwijkingen()
returns table(weekly_goal_id uuid, opgeslagen text, verwacht text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.status, verwachte_weekdoelstatus(w.id)
  from weekly_goals w
  -- ⚠️ Alleen de afleidbare drie. Zie de kop: een gemiste week is geen drift.
  where w.status in ('todo', 'pending', 'approved')
    and w.status <> verwachte_weekdoelstatus(w.id)
  order by w.id;
$$;

comment on function weekdoelstatus_afwijkingen() is
  'Weekdoelen waarvan de statuscache niet klopt met completions en '
  'completion_approvals. Hoort leeg te zijn. Zie tests/rls/statuscache.test.ts.';

-- ---------------------------------------------------------------------------
-- 3. De herstelweg
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Veilig van vorm en niet van voorzichtigheid.** Deze functie schrijft
--    uitsluitend rijen die nú al in een van de drie afleidbare statussen staan,
--    en zet ze naar een van diezelfde drie. Een `missed` of `excused` kan hij
--    dus niet aanraken, ook niet als iemand hem per ongeluk twee keer draait.
--
-- ⚠️ Hij boekt géén punten en raakt `points_ledger` niet aan. Een cache
--    rechtzetten is iets anders dan een gebeurtenis alsnog laten plaatsvinden;
--    wie punten mist na een herstel, heeft een tweede probleem dat een
--    correctie-record verdient (domeinregel 6) en geen stille bijboeking.

create or replace function herstel_weekdoelstatus()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hersteld integer;
begin
  with af as (select * from weekdoelstatus_afwijkingen())
  update weekly_goals w
  set status = af.verwacht
  from af
  where w.id = af.weekly_goal_id;

  get diagnostics hersteld = row_count;
  return hersteld;
end;
$$;

comment on function herstel_weekdoelstatus() is
  'Zet de statuscache terug naar wat de gebeurtenissen zeggen, alleen voor de '
  'drie afleidbare statussen. Boekt geen punten. Zie migratie 0096.';

-- ⚠️ Alleen `service_role`. Dit is gereedschap voor de rollover en de audit, geen
--    clientoppervlak — en `herstel_weekdoelstatus()` schrijft. Zelfde keuze als
--    bij `realtime_bewaking()` (0027) en `viewrechten_bewaking()` (0095).
revoke all on function verwachte_weekdoelstatus(uuid) from public, anon, authenticated;
revoke all on function weekdoelstatus_afwijkingen() from public, anon, authenticated;
revoke all on function herstel_weekdoelstatus() from public, anon, authenticated;
grant execute on function verwachte_weekdoelstatus(uuid) to service_role;
grant execute on function weekdoelstatus_afwijkingen() to service_role;
grant execute on function herstel_weekdoelstatus() to service_role;
