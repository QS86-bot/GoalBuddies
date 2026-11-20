-- 0326_een_teamdoel_rondt_af_met_een_teamgenoot.sql — een lid vraagt de
-- afronding van een teamdoel aan, een teamgenoot keurt goed, en wie een aandeel
-- had krijgt eenmalig +2, ten hoogste één keer per seizoen (QS8-662).
--
-- ⚠️ **Hernummerd van 0306 naar 0326 op 20-11-2026**, in de ketenlaan 0316–0327
--    (besluit Quinten). Bouwt op 0325 van QS8-660.
--
-- ROLLBACK-PAD (met teambonussen in het puntenboek is dit grens 2: die rijen
-- moeten eerst weg, en dat is score die gebruikers gezien hebben):
--   drop function if exists public.keur_teamdoel_goed(uuid);
--   drop function if exists public.vraag_teamdoel_afronding(uuid);
--   drop trigger if exists team_goals_afronding on public.team_goals;
--   drop function if exists public.bewaak_teamafronding();
--   alter table public.team_goals drop constraint if exists team_goals_niet_zelf_goedgekeurd;
--   alter table public.team_goals drop column if exists afronding_goedgekeurd_op,
--     drop column if exists afronding_goedgekeurd_door,
--     drop column if exists afronding_gevraagd_op,
--     drop column if exists afronding_gevraagd_door;
--   drop index if exists public.points_ledger_teambonus_per_seizoen_idx;
--   alter table public.points_ledger drop constraint if exists points_ledger_teambonus_heeft_seizoen;
--   alter table public.points_ledger drop column if exists seizoen;
--   alter table public.points_ledger drop constraint points_ledger_reason_valid;
--   -- en de CHECK uit 0132 terugzetten.
--
-- ---------------------------------------------------------------------------
-- Wat dit doet, en waar het vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 28, 30 en 35 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- domeinregel 10 in CLAUDE.md (de teambonus), en de besluiten van Quinten van
-- 18-11-2026 als reacties op QS8-662:
--
-- 1. Een seizoen is een **vast kwartaal** in de tijdzone van de teamgroep, via
--    `seizoensgrens()`. **Niet** `groups.season_cadence`: een beheerder kan die
--    op maandelijks zetten, en dan zou het plafond drie keer zo hoog worden.
-- 2. Een goedgekeurde afronding is **definitief**: geen intrekvenster, geen
--    correctieboeking.
-- 3. Wie het seizoensplafond al bereikt heeft, **ziet niets**: geen rij in het
--    puntenboek, geen melding. Het teamdoel wordt gewoon afgerond.
-- 5. **Minstens één gedane stap** (besluit van 18-11-2026 op review M2): een
--    teamdoel rondt pas af als de teambalk boven nul staat.
-- 4. Wat telt is de stand **op het moment van goedkeuren**: wie dan een
--    gekoppeld aandeel heeft, actief lid van de teamgroep is én actief lid van
--    de organisatie, krijgt de +2.
--
-- **Domeinregel 3:** de goedkeurder is nooit degene die de afronding vroeg. Dat
-- staat in de RPC, in een CHECK op de twee kolommen, en in een trigger die de
-- overgang naar `completed` alleen toelaat met twee verschillende personen,
-- ook voor `service_role`.
--
-- **Domeinregel 7:** de bonus staat alleen in het puntenboek van de eigenaar
-- (eigenaar-only, rij 6 in 002). Het afrondbericht `team_goal_completed` noemt
-- niemand; de vrager en de goedkeurder staan niet in de kolomgrant.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De reden in het puntenboek
-- ---------------------------------------------------------------------------

alter table public.points_ledger drop constraint if exists points_ledger_reason_valid;
alter table public.points_ledger add constraint points_ledger_reason_valid check (reason in (
  'completion_approved_floor', 'completion_approved_ceiling',
  'cycle_missed', 'review_given', 'milestone_done', 'correction',
  -- QS8-662: de teambonus, eenmalig +2 per persoon per teamdoel (besluit 28).
  'team_goal_bonus'
));

-- ⚠️⚠️ **Het kwartaal staat op de rij, en de database weigert er twee**
--    (securityreview H1, beredeneerd en op predicaatniveau gedraaid). Eerst werd
--    het kwartaal per goedkeuring omgerekend naar de tijdzone van díe teamgroep.
--    Met teamgroepen in verschillende tijdzones viel een eerdere bonus uit een
--    oostelijker groep dan nog in het vorige kwartaal, en rond de jaarwisseling
--    haalde iemand zo één bonus per tijdzone: tot +76 in plaats van +2. Nu draagt
--    elke bonus zijn kwartaallabel (het begin, in de tijdzone van de groep die
--    hem gaf), en een unieke index staat er hoogstens één per label toe, ook voor
--    `service_role`. Rond een kwartaalwissel kan iemand nog een bonus met het
--    oude en één met het nieuwe label krijgen; dat is één per kwartaal.
alter table public.points_ledger add column if not exists seizoen date;
alter table public.points_ledger drop constraint if exists points_ledger_teambonus_heeft_seizoen;
alter table public.points_ledger add constraint points_ledger_teambonus_heeft_seizoen
  check (reason <> 'team_goal_bonus' or seizoen is not null);
create unique index if not exists points_ledger_teambonus_per_seizoen_idx
  on public.points_ledger (user_id, seizoen) where reason = 'team_goal_bonus';

-- ---------------------------------------------------------------------------
-- 2. De afronding op het teamdoel
-- ---------------------------------------------------------------------------

alter table public.team_goals
  add column if not exists afronding_gevraagd_door  uuid references public.profiles(id) on delete set null,
  add column if not exists afronding_gevraagd_op    timestamptz,
  add column if not exists afronding_goedgekeurd_door uuid references public.profiles(id) on delete set null,
  add column if not exists afronding_goedgekeurd_op timestamptz;

create index if not exists team_goals_afronding_gevraagd_door_idx
  on public.team_goals (afronding_gevraagd_door) where afronding_gevraagd_door is not null;
create index if not exists team_goals_afronding_goedgekeurd_door_idx
  on public.team_goals (afronding_goedgekeurd_door) where afronding_goedgekeurd_door is not null;

-- Domeinregel 3 als constraint. Null aan één kant mag: de foreign key zet een
-- verwijderd account op null, en dat is geen zelfgoedkeuring.
alter table public.team_goals drop constraint if exists team_goals_niet_zelf_goedgekeurd;
alter table public.team_goals add constraint team_goals_niet_zelf_goedgekeurd check (
  afronding_goedgekeurd_door is null
  or afronding_gevraagd_door is null
  or afronding_goedgekeurd_door <> afronding_gevraagd_door
);

-- De overgang naar `completed` vraagt twee verschillende, bestaande personen,
-- en is definitief (besluit 2). Ook voor `service_role`.
create or replace function public.bewaak_teamafronding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'completed' and new.status is distinct from 'completed' then
    raise exception 'Een afgerond teamdoel is definitief' using errcode = 'check_violation';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.afronding_gevraagd_door is null
       or new.afronding_goedgekeurd_door is null
       or new.afronding_gevraagd_door = new.afronding_goedgekeurd_door then
      raise exception 'Een teamdoel rondt af met de goedkeuring van een teamgenoot, nooit van jezelf'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.bewaak_teamafronding() from public, anon, authenticated;

drop trigger if exists team_goals_afronding on public.team_goals;
create trigger team_goals_afronding
  before update of status on public.team_goals
  for each row execute function public.bewaak_teamafronding();

-- ⚠️ De vrager en de goedkeurder komen **niet** in de kolomgrant van 0319: wie
--    afrondde is een persoon, en rij 46 belooft een afronding zonder persoon.
--    Of er een aanvraag openstaat, leest een lid via de RPC's hieronder.

-- ---------------------------------------------------------------------------
-- 3. De aanvraag
-- ---------------------------------------------------------------------------

create or replace function public.vraag_teamdoel_afronding(p_team_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_team team_goals%rowtype;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  select * into v_team from team_goals where id = p_team_goal_id for update;
  -- ⚠️ Eén antwoord voor "bestaat niet" en "geen lid", zoals bij `neem_aandeel()`.
  if not found or not public.is_group_member(v_team.group_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;
  if v_team.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'niet_actief');
  end if;
  -- ⚠️ Een aanvraag van een verwijderd account telt niet meer (securityreview
  --    M1): de foreign key zet de aanvrager op null, en zonder deze regel bleef
  --    het teamdoel voorgoed vastzitten op `al_gevraagd`.
  if v_team.afronding_gevraagd_op is not null and v_team.afronding_gevraagd_door is not null then
    return jsonb_build_object('ok', false, 'reason', 'al_gevraagd');
  end if;
  -- Besluit van Quinten (18-11-2026, review M2): minstens één gedane stap.
  if not exists (select 1 from team_progress_events e where e.team_goal_id = p_team_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'nog_geen_stap');
  end if;

  update team_goals
     set afronding_gevraagd_door = v_uid,
         afronding_gevraagd_op   = now()
   where id = p_team_goal_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.vraag_teamdoel_afronding(uuid) from public, anon, authenticated;
grant execute on function public.vraag_teamdoel_afronding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. De goedkeuring, en de teambonus
-- ---------------------------------------------------------------------------

create or replace function public.keur_teamdoel_goed(p_team_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_team          team_goals%rowtype;
  v_tz            text;
  v_seizoensbegin date;
  r               record;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;
  select * into v_team from team_goals where id = p_team_goal_id for update;
  if not found or not public.is_group_member(v_team.group_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;
  if v_team.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'niet_actief');
  end if;
  if v_team.afronding_gevraagd_op is null then
    return jsonb_build_object('ok', false, 'reason', 'niet_gevraagd');
  end if;
  -- Review M1: de aanvrager heeft zijn account verwijderd. Dan is er geen
  -- aanvraag meer; een ander lid kan opnieuw aanvragen.
  if v_team.afronding_gevraagd_door is null then
    update team_goals set afronding_gevraagd_op = null where id = p_team_goal_id;
    return jsonb_build_object('ok', false, 'reason', 'niet_gevraagd');
  end if;
  -- Besluit van Quinten (18-11-2026, review M2): minstens één gedane stap, ook
  -- op het moment van goedkeuren.
  if not exists (select 1 from team_progress_events e where e.team_goal_id = p_team_goal_id) then
    return jsonb_build_object('ok', false, 'reason', 'nog_geen_stap');
  end if;
  -- Domeinregel 3: nooit jezelf. De trigger en de CHECK houden dit ook tegen;
  -- hier staat het voor een nette reden.
  if v_team.afronding_gevraagd_door = v_uid then
    return jsonb_build_object('ok', false, 'reason', 'eigen_afronding');
  end if;

  update team_goals
     set status                     = 'completed',
         afronding_goedgekeurd_door = v_uid,
         afronding_goedgekeurd_op   = now()
   where id = p_team_goal_id;

  -- Het lopende kwartaal in de tijdzone van de teamgroep (besluit 1).
  -- `seizoensgrens()` geeft het vórige seizoen; het lopende begint de dag na
  -- zijn einde. Altijd 'quarterly', nooit `groups.season_cadence`.
  select g.tz into v_tz from groups g where g.id = v_team.group_id;
  select s.season_end + 1 into v_seizoensbegin
    from public.seizoensgrens(v_tz, 'quarterly', now()) s;

  -- De stand op dit moment (besluit 4): een gekoppeld aandeel, actief lid van
  -- de teamgroep én van de organisatie.
  for r in
    select s.user_id
      from team_goal_shares s
      join goal_group_links l     on l.goal_id = s.goal_id and l.group_id = v_team.group_id
      join group_members m        on m.group_id = v_team.group_id
                                 and m.user_id  = s.user_id
                                 and m.status  <> 'inactive'
      join organization_members o on o.organization_id = v_team.organization_id
                                 and o.user_id = s.user_id
                                 and o.status  = 'active'
     where s.team_goal_id = p_team_goal_id
     order by s.user_id
  loop
    -- ⚠️ Eén persoon tegelijk: zonder deze lock kunnen twee teamdoelen die
    --    tegelijk worden goedgekeurd allebei "nog geen bonus dit seizoen" zien.
    perform pg_advisory_xact_lock(hashtextextended('teambonus:' || r.user_id::text, 0));

    -- Ten hoogste één teambonus per persoon per seizoen (besluit 35). Wie hem
    -- al heeft, ziet niets (besluit 3).
    -- De lock en deze toets geven een nette weg; de grendel is de unieke index
    -- op (user_id, seizoen), en `on conflict do nothing` laat hem zwijgen.
    if exists (
      select 1 from points_ledger pl
       where pl.user_id = r.user_id
         and pl.reason  = 'team_goal_bonus'
         and pl.seizoen = v_seizoensbegin
    ) then
      continue;
    end if;

    -- Eenmalig per persoon per teamdoel: `points_ledger_dedupe_idx` op
    -- (user_id, reason, ref_type, ref_id, ronde). Eenmalig per kwartaallabel:
    -- `points_ledger_teambonus_per_seizoen_idx`.
    insert into points_ledger (user_id, group_id, delta, reason, ref_type, ref_id, seizoen)
    values (r.user_id, v_team.group_id, 2, 'team_goal_bonus', 'team_goal', p_team_goal_id, v_seizoensbegin)
    on conflict do nothing;
  end loop;

  -- Het afrondbericht van 0323: geen persoon, geen titel.
  perform plaats_systeembericht(v_team.group_id, 'team_goal_completed', 'Het team heeft een teamdoel afgerond.');

  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.keur_teamdoel_goed(uuid) from public, anon, authenticated;
grant execute on function public.keur_teamdoel_goed(uuid) to authenticated;
