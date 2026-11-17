-- 0300_een_organisatiebeheerder_benoemen_en_terugtreden.sql — een organisatie
-- hangt niet langer aan één persoon: een beheerder benoemt een lid tot
-- beheerder, en een beheerder kan zelf terugtreden, zolang er één overblijft
-- (QS8-695, epic QS8-650).
--
-- ROLLBACK-PAD (de audittabel is bij het landen leeg; met rijen erin is dit
-- grens 2 en vraagt het eerst een `pg_dump`):
--   drop function if exists public.treed_terug_als_organisatiebeheerder(uuid);
--   drop function if exists public.benoem_organisatiebeheerder(uuid, uuid);
--   drop table if exists public.organization_role_events;
--   delete from public.dagtellers where domein = 'organisatierollen';
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten van 17-11-2026 (reactie op QS8-652): "beheerder benoemen"
-- kwam niet mee in 0299 en is een eigen issue geworden. 📏 Na 0299 kan een
-- organisatie precies één beheerder hebben — de aanmaker — en die kan niet
-- vertrekken. De keuzes van deze migratie staan in
-- `docs/decisions/2026-11-17-een-organisatiebeheerder-benoemen.md`.
--
-- ⚠️ **Wat hier níet in zit, en met opzet:**
--    - een andere beheerder degraderen of uitzetten (keuze 9 van 0299 blijft:
--      één beheerder sluit de ander niet buiten). `treed_terug_…` neemt
--      daarom geen `p_user_id`.
--    - een herdefinitie van `verlaat_organisatie()` of
--      `zet_organisatielid_uit()`. QS8-653 hangt een trigger aan die
--      schrijfacties, en een tweede `create or replace` hier kan bij het
--      samenvoegen stil een lichaam overschrijven (QS8-358).
--    - de laatste beheerder via accountverwijdering: QS8-659.
--
-- ---------------------------------------------------------------------------
-- De invariant: elke schrijver die het aantal actieve beheerders kan
-- verlagen, lockt eerst de organisatierij en telt daarna
-- ---------------------------------------------------------------------------
--
-- Vandaag zijn dat `verlaat_organisatie()` (0299) en
-- `treed_terug_als_organisatiebeheerder()` (hier). Twee beheerders die tegelijk
-- terugtreden of vertrekken, worden zo achter elkaar gezet: de tweede telt ná
-- de commit van de eerste en krijgt `laatste_beheerder`.
--
-- ⚠️ **VOLATILE en niet STABLE.** In READ COMMITTED krijgt elk statement in een
--    volatile functie een verse snapshot, dus de telling ná de `for update`
--    ziet wat de vorige houder commitde. Een `stable` functie houdt de snapshot
--    van de aanroep vast, en dan beschermt de lock niets.
--
-- ⚠️ **Eerst de autorisatie, dan de lock** (de les van L2 in 0299): een
--    buitenstaander mag de organisatierij niet kunnen vergrendelen.
--
-- ⚠️ **En na de lock opnieuw kijken.** Een beheerder die in een parallelle
--    transactie net terugtrad, mag daarna niet alsnog iemand benoemen.
--
-- ---------------------------------------------------------------------------
-- Gevolg buiten deze migratie (gemeten tegen QS8-653, niet op deze tak)
-- ---------------------------------------------------------------------------
--
-- 📏 `is_teambeheerder()` in QS8-653 leest `is_organisatiebeheerder()` live.
--    Een benoemde beheerder is daarmee meteen beheerder van elk team van de
--    organisatie, en wie terugtreedt verliest dat meteen (besluit 34). De
--    vertrek-trigger van QS8-653 hangt aan `update of status` en vuurt dus niet
--    op een rolwijziging. Na het samenvoegen hoort daar een toets op de naad bij.

-- ---------------------------------------------------------------------------
-- 1. Het spoor: wie benoemde wie, en wie trad terug
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen leesoppervlak.** Alle vier de policies zijn `false` en er is geen
--    grant voor `authenticated`: alleen de twee RPC's hieronder schrijven, en
--    niemand leest via de API. Besluit 6 en 002 rij 42 blijven zoals ze zijn.
--    Bij groepen is het promoveren in 0199 weggehaald met de zin *"wie
--    promoveren alsnog wil, bouwt er een RPC voor met een `group_events`-rij"* —
--    dit is die rij, voor organisaties.

create table if not exists public.organization_role_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id        uuid references public.profiles(id) on delete set null,
  subject_id      uuid not null references public.profiles(id) on delete cascade,
  event_type      text not null,
  created_at      timestamptz not null default now()
);

alter table public.organization_role_events drop constraint if exists organization_role_events_type_geldig;
alter table public.organization_role_events add constraint organization_role_events_type_geldig
  check (event_type in ('beheerder_benoemd', 'beheerder_teruggetreden'));

create index if not exists organization_role_events_org_idx
  on public.organization_role_events (organization_id, created_at);
create index if not exists organization_role_events_actor_idx
  on public.organization_role_events (actor_id);
create index if not exists organization_role_events_subject_idx
  on public.organization_role_events (subject_id);

revoke all on table public.organization_role_events from public, anon, authenticated;
alter table public.organization_role_events enable row level security;

drop policy if exists organization_role_events_select on public.organization_role_events;
create policy organization_role_events_select on public.organization_role_events
  for select to authenticated using (false);
drop policy if exists organization_role_events_insert on public.organization_role_events;
create policy organization_role_events_insert on public.organization_role_events
  for insert to authenticated with check (false);
drop policy if exists organization_role_events_update on public.organization_role_events;
create policy organization_role_events_update on public.organization_role_events
  for update to authenticated using (false) with check (false);
drop policy if exists organization_role_events_delete on public.organization_role_events;
create policy organization_role_events_delete on public.organization_role_events
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- 2. Benoemen
-- ---------------------------------------------------------------------------

create or replace function public.benoem_organisatiebeheerder(
  p_organization_id uuid,
  p_user_id         uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eén reden voor elke weigering, vóór de lock: geen beheerder, onbekende
  --    organisatie, jezelf, een onbekende gebruiker.
  if p_user_id is null or p_user_id = v_uid
     or not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  perform 1 from organizations where id = p_organization_id for update;

  -- Na de lock opnieuw: wie net terugtrad, benoemt niemand meer.
  if not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  -- Dagteller (regel 5): een lus van benoemen en terugtreden vult anders het
  -- spoor onbeperkt. Per organisatie, gedeeld met terugtreden.
  if public.dagteller_stand('organisatierollen', 'organisatie', p_organization_id::text,
                            interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- ⚠️ Alleen een actief lid met de rol member. Al beheerder, inactief of geen
  --    lid geeft dezelfde weigering — net als `zet_organisatielid_uit()`.
  update organization_members
     set role = 'admin'
   where organization_id = p_organization_id and user_id = p_user_id
     and role = 'member' and status = 'active';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  insert into organization_role_events (organization_id, actor_id, subject_id, event_type)
  values (p_organization_id, v_uid, p_user_id, 'beheerder_benoemd');

  perform public.tel_dagteller('organisatierollen', 'organisatie', p_organization_id::text,
                               20, interval '1 day', 'rolwijzigingen in een organisatie');

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.benoem_organisatiebeheerder(uuid, uuid) is
  'Een beheerder benoemt een actief lid (rol member) tot beheerder. Elke '
  'weigering geeft niet_toegestaan, zodat de RPC geen orakel is. Laat een rij '
  'na in organization_role_events. Dagteller: 20 rolwijzigingen per '
  'organisatie per etmaal — QS8-695.';
revoke all on function public.benoem_organisatiebeheerder(uuid, uuid) from public, anon, authenticated;
grant execute on function public.benoem_organisatiebeheerder(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Terugtreden
-- ---------------------------------------------------------------------------

create or replace function public.treed_terug_als_organisatiebeheerder(p_organization_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- Een lid, een buitenstaander en een verzonnen id krijgen hetzelfde
  -- antwoord, vóór de lock.
  if not public.is_organisatiebeheerder(p_organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  perform 1 from organizations where id = p_organization_id for update;

  if not exists (select 1 from organization_members
                  where organization_id = p_organization_id and user_id = v_uid
                    and role = 'admin' and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  -- ⚠️ Dit is geen orakel: alleen een beheerder komt hier, en die ziet de
  --    andere beheerders toch al in de ledenlijst.
  if not exists (select 1 from organization_members
                  where organization_id = p_organization_id and user_id <> v_uid
                    and role = 'admin' and status = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'laatste_beheerder');
  end if;

  if public.dagteller_stand('organisatierollen', 'organisatie', p_organization_id::text,
                            interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  update organization_members
     set role = 'member'
   where organization_id = p_organization_id and user_id = v_uid;

  insert into organization_role_events (organization_id, actor_id, subject_id, event_type)
  values (p_organization_id, v_uid, v_uid, 'beheerder_teruggetreden');

  perform public.tel_dagteller('organisatierollen', 'organisatie', p_organization_id::text,
                               20, interval '1 day', 'rolwijzigingen in een organisatie');

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.treed_terug_als_organisatiebeheerder(uuid) is
  'Een beheerder treedt terug naar lid, zolang er een andere actieve beheerder '
  'is (laatste_beheerder). Lockt de organisatierij, zodat twee beheerders die '
  'tegelijk terugtreden of vertrekken er nooit nul achterlaten — QS8-695.';
revoke all on function public.treed_terug_als_organisatiebeheerder(uuid) from public, anon, authenticated;
grant execute on function public.treed_terug_als_organisatiebeheerder(uuid) to authenticated;
