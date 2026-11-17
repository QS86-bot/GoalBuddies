-- 0301_teamdoelen_en_aandelen.sql — teamdoelen, aandelen en de koppelgrendel
-- die een aandeel aan zijn teamgroep vastzet (QS8-654, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0300 van QS8-653 en 0299 van QS8-652, en
--    productie draagt al 0299–0302 van QS8-233 (QS8-641). Wie als tweede landt
--    hernummert (`npm run migratie:hernummer`); de inhoud hangt niet aan het
--    nummer.
--
-- ROLLBACK-PAD (bij het landen zijn beide tabellen leeg; met teamdoelen erin is
-- dit grens 2 en vraagt het eerst een `pg_dump`):
--   drop trigger if exists goal_group_links_aandeel_in_teamgroep on public.goal_group_links;
--   drop function if exists public.aandeel_blijft_in_teamgroep();
--   alter table public.groups drop constraint if exists groups_team_beschermd_tot_qs8_661;
--   drop function if exists public.neem_aandeel(uuid, text);
--   drop function if exists public.maak_teamdoel(uuid, text, date, text);
--   drop table if exists public.team_goal_shares;   -- met zijn trigger en functie
--   drop function if exists public.vul_aandeel();
--   drop table if exists public.team_goals;         -- met zijn trigger en functie
--   drop function if exists public.bewaak_teamdoel();
--   -- de aandeeldoelen zelf blijven staan: het zijn gewone persoonlijke doelen
--   -- (besluit 10), en weggooien zou geschiedenis van de eigenaar wissen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit 10, 11, 17, 20 en 21 in
-- `docs/decisions/2026-11-03-zakelijk-gebruik-met-organisaties-en-teamdoelen.md`,
-- tabel 4 en 5 van de spec, en de keuzes van deze migratie in
-- `docs/decisions/2026-11-17-teamdoelen-en-aandelen.md`.
--
-- 📏 **De koppelgrendel is de reden dat dit niet alleen twee tabellen zijn.**
--    `fill_approval_subject()` (laatste definitie 0275) eist van een
--    goedkeurder dat hij actief lid is van `new.group_id`, en dat het doel van
--    de voltooiing aan díé groep hangt. Elke groep waaraan het doel hangt
--    volstaat. Een aandeel dat ook aan een vriendengroep hangt, kan dus door een
--    vriend worden goedgekeurd, en dat is precies wat besluit 5 uitsluit.
--    `goal_group_links_aandeel_in_teamgroep` maakt die tweede koppeling
--    onmogelijk, ook voor `service_role`.
--
-- 1. `team_goals`: één gedeeld doel per teamgroep. Lezen via
--    `mag_groep_lezen()` en dus via het lidmaatschap; een organisatiebeheerder
--    die geen lid is, leest het niet (besluit 6 en 36). Schrijven alleen via
--    `maak_teamdoel()`. `created_by` staat niet in de kolomgrant: rij 46 in 002
--    belooft een teambericht zonder persoon, en een aanmaker in de rij zou
--    datzelfde via een omweg geven.
-- 2. `team_goal_shares`: welk persoonlijk doel het aandeel van wie is. **Alleen
--    de eigenaar leest zijn eigen aandeel.** Of een teamgenoot mag zien dát
--    iemand een aandeel heeft, is niet besloten (rij 44 in 002), en beschermd
--    is het antwoord tot iemand het tegendeel besluit.
-- 3. `neem_aandeel()` maakt het aandeel als een **nieuw** persoonlijk doel met
--    de streefdatum van het teamdoel (besluit 20) en koppelt het in dezelfde
--    transactie aan de teamgroep. Een bestaand doel ombouwen kan niet: dat zou
--    een streefdatum overschrijven die alleen via A7 mag verschuiven, en het
--    doel kan al aan een andere groep hangen.
--
-- ⚠️ **Wat hier níet zit.** De voortgang van een aandeel blijft via de
--    bestaande leesroutes voor teamgenoten zichtbaar zoals bij elk gekoppeld
--    doel (rij 1, 3 en 34 van 002). De uitzondering voor aandeeldoelen
--    (besluit 11 en 21) is QS8-661, en die moet landen voordat er een open
--    teamgroep in productie bestaat. In een beschermde teamgroep is een gemist
--    weekdoel van een aandeel vandaag al dicht (criterium 6a, getoetst).
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. team_goals
-- ---------------------------------------------------------------------------

create table if not exists public.team_goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  group_id        uuid not null references public.groups(id) on delete cascade,
  title           text not null,
  description     text,
  target_date     date not null,
  status          text not null default 'active',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint team_goals_status_valid check (status in ('active', 'completed', 'archived')),
  constraint team_goals_title_len check (char_length(title) between 1 and 200),
  constraint team_goals_title_een_regel check (title = public.zonder_regelovergang(title)),
  constraint team_goals_title_geen_bidi check (title = public.zonder_bidi(title)),
  constraint team_goals_title_geen_nul_pixels check (title = public.zonder_onzichtbaar_middenin(title)),
  constraint team_goals_description_len check (description is null or char_length(description) <= 2000),
  constraint team_goals_description_geen_bidi check (description is null or description = public.zonder_bidi(description)),
  constraint team_goals_description_geen_nul_pixels
    check (description is null or description = public.zonder_onzichtbaar_middenin(description))
);

create index if not exists team_goals_group_idx on public.team_goals (group_id);
create index if not exists team_goals_organization_idx on public.team_goals (organization_id);
create index if not exists team_goals_created_by_idx on public.team_goals (created_by);

comment on table public.team_goals is
  'Een teamdoel (QS8-654). Leesbaar voor de leden van de teamgroep, schrijfbaar alleen via RPC. '
  'De periode is die van de groep, de huddledag (besluit 17).';

-- De groep hoort bij de organisatie, en geen van beide verhuist ooit. Ook voor
-- `service_role`: een teamdoel dat in een groep zonder organisatie belandt, is
-- een gewoon groepsobject waar de teamregels niet meer voor gelden.
create or replace function public.bewaak_teamdoel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
begin
  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.group_id is distinct from old.group_id) then
    raise exception 'Een teamdoel verhuist niet naar een andere groep of organisatie'
      using errcode = 'check_violation';
  end if;

  select g.organization_id into v_org from groups g where g.id = new.group_id;
  if v_org is null or v_org is distinct from new.organization_id then
    raise exception 'Een teamdoel hoort bij een teamgroep van dezelfde organisatie'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bewaak_teamdoel() from public, anon, authenticated;

drop trigger if exists team_goals_bewaakt on public.team_goals;
create trigger team_goals_bewaakt
  before insert or update on public.team_goals
  for each row execute function public.bewaak_teamdoel();

-- ---------------------------------------------------------------------------
-- 2. team_goal_shares
-- ---------------------------------------------------------------------------

create table if not exists public.team_goal_shares (
  goal_id      uuid primary key references public.goals(id) on delete cascade,
  team_goal_id uuid not null references public.team_goals(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint team_goal_shares_een_per_persoon unique (team_goal_id, user_id)
);

create index if not exists team_goal_shares_user_idx on public.team_goal_shares (user_id);

comment on table public.team_goal_shares is
  'Welk persoonlijk doel het aandeel van wie is (QS8-654, besluit 10). Alleen de eigenaar '
  'leest zijn eigen aandeel; of een teamgenoot mag zien dát iemand een aandeel heeft, is niet besloten.';

-- `user_id` volgt de eigenaar van het doel, een aandeel verhuist niet, en een
-- aandeel hangt aan geen andere groep dan zijn teamgroep.
create or replace function public.vul_aandeel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eigenaar uuid;
  v_groep    uuid;
begin
  if tg_op = 'UPDATE'
     and (new.goal_id is distinct from old.goal_id
          or new.team_goal_id is distinct from old.team_goal_id) then
    raise exception 'Een aandeel verhuist niet naar een ander doel of teamdoel'
      using errcode = 'check_violation';
  end if;

  select g.owner_id into v_eigenaar from goals g where g.id = new.goal_id;
  if v_eigenaar is null then
    raise exception 'Doel % bestaat niet', new.goal_id using errcode = 'foreign_key_violation';
  end if;
  new.user_id := v_eigenaar;

  select t.group_id into v_groep from team_goals t where t.id = new.team_goal_id;
  if exists (select 1 from goal_group_links l
              where l.goal_id = new.goal_id and l.group_id is distinct from v_groep) then
    raise exception 'Een aandeel hangt alleen aan zijn teamgroep'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.vul_aandeel() from public, anon, authenticated;

drop trigger if exists team_goal_shares_vul on public.team_goal_shares;
create trigger team_goal_shares_vul
  before insert or update on public.team_goal_shares
  for each row execute function public.vul_aandeel();

-- ---------------------------------------------------------------------------
-- 3. De koppelgrendel op goal_group_links
-- ---------------------------------------------------------------------------

create or replace function public.aandeel_blijft_in_teamgroep()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1
      from team_goal_shares s
      join team_goals t on t.id = s.team_goal_id
     where s.goal_id = new.goal_id
       and t.group_id is distinct from new.group_id
  ) then
    return new;
  end if;

  -- ⚠️ **Een niet-eigenaar krijgt de melding van de policy, woordelijk, en
  --    geen doorgang.** Een `before`-trigger antwoordt vóór de policy, en een
  --    eigen melding zou een vreemde laten zien dat dit doel een aandeel is.
  --    `weekdoel_cyclus_klopt()` (0198) zwijgt daarom en laat de policy weigeren.
  --    Hier kan dat niet: de securityreview van QS8-654 (M1) liet zien dat zwijgen
  --    de grendel opent voor elke context zónder policy erachter, zoals een
  --    definer-functie die namens een ander koppelt. Dus weigeren, met precies
  --    de code en de tekst die `goal_group_links_insert` geeft. Een test
  --    vergelijkt beide antwoorden.
  if v_uid is not null
     and not exists (select 1 from goals g where g.id = new.goal_id and g.owner_id = v_uid) then
    raise exception 'new row violates row-level security policy for table "goal_group_links"'
      using errcode = '42501';
  end if;

  raise exception 'Een aandeel hangt alleen aan zijn teamgroep'
    using errcode = 'check_violation',
          hint = 'Een vriend mag een werkaandeel niet kunnen goedkeuren (besluit 5).';
end;
$$;
revoke all on function public.aandeel_blijft_in_teamgroep() from public, anon, authenticated;

drop trigger if exists goal_group_links_aandeel_in_teamgroep on public.goal_group_links;
create trigger goal_group_links_aandeel_in_teamgroep
  before insert or update on public.goal_group_links
  for each row execute function public.aandeel_blijft_in_teamgroep();

-- ---------------------------------------------------------------------------
-- 3b. Geen open teamgroep zolang aandeeldoelen niet dicht zijn
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een tijdelijke grendel, en hij wijkt af van besluit 18** (een teamgroep
--    mag open zijn). Securityreview H1: met deze migratie bestaan aandelen, en in
--    een open groep leest een teamgenoot via de open-groepstakken van rij 1, 3 en
--    34 het gemiste weekdoel van ieders aandeel. Besluit 11 en 21 verbieden dat;
--    de uitzondering is QS8-661. Tot die landt was "geen open teamgroep" alleen
--    een zin in het beslisdocument, en de regel is pas afgedwongen als de
--    database hem afdwingt. Eén CHECK dekt `maak_teamgroep()` en
--    `zet_groepszichtbaarheid()` allebei, ook voor `service_role`.
--    **QS8-661 haalt hem weg**, in dezelfde migratie die de uitzondering bouwt.
alter table public.groups drop constraint if exists groups_team_beschermd_tot_qs8_661;
alter table public.groups add constraint groups_team_beschermd_tot_qs8_661
  check (organization_id is null or zichtbaarheid = 'beschermd');

-- ---------------------------------------------------------------------------
-- 4. Grants en policies
-- ---------------------------------------------------------------------------

revoke all on table public.team_goals from public, anon, authenticated;
revoke all on table public.team_goal_shares from public, anon, authenticated;
-- ⚠️ `created_by` staat hier met opzet niet tussen (zie de kop, punt 1).
grant select (id, organization_id, group_id, title, description, target_date, status, created_at)
  on public.team_goals to authenticated;
grant select (goal_id, team_goal_id, user_id, created_at) on public.team_goal_shares to authenticated;

alter table public.team_goals enable row level security;
alter table public.team_goal_shares enable row level security;

drop policy if exists team_goals_select on public.team_goals;
create policy team_goals_select on public.team_goals
  for select to authenticated
  using (public.mag_groep_lezen(group_id));
drop policy if exists team_goals_insert on public.team_goals;
create policy team_goals_insert on public.team_goals
  for insert to authenticated with check (false);
drop policy if exists team_goals_update on public.team_goals;
create policy team_goals_update on public.team_goals
  for update to authenticated using (false) with check (false);
drop policy if exists team_goals_delete on public.team_goals;
create policy team_goals_delete on public.team_goals
  for delete to authenticated using (false);

drop policy if exists team_goal_shares_select on public.team_goal_shares;
create policy team_goal_shares_select on public.team_goal_shares
  for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists team_goal_shares_insert on public.team_goal_shares;
create policy team_goal_shares_insert on public.team_goal_shares
  for insert to authenticated with check (false);
drop policy if exists team_goal_shares_update on public.team_goal_shares;
create policy team_goal_shares_update on public.team_goal_shares
  for update to authenticated using (false) with check (false);
drop policy if exists team_goal_shares_delete on public.team_goal_shares;
create policy team_goal_shares_delete on public.team_goal_shares
  for delete to authenticated using (false);

-- ---------------------------------------------------------------------------
-- 5. maak_teamdoel(): elk teamlid (besluit 20)
-- ---------------------------------------------------------------------------

-- ⚠️ Geen `DEFAULT NULL` (defaultnull:controle, QS8-594): de streefdatum is
--    verplicht, en een lege beschrijving is ''. Zo zegt het type wat de functie
--    aanneemt.
create or replace function public.maak_teamdoel(
  p_group_id uuid,
  p_titel text,
  p_streefdatum date,
  p_beschrijving text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_org   uuid;
  v_titel text := btrim(coalesce(p_titel, ''));
  v_besch text := nullif(btrim(coalesce(p_beschrijving, '')), '');
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  -- ⚠️ Eén antwoord voor "geen lid", "geen teamgroep" en "bestaat niet": een
  --    eigen reden zou een buitenstaander laten aftasten welke groep een team is.
  select g.organization_id into v_org from groups g where g.id = p_group_id;
  if v_org is null or not public.is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;

  if char_length(v_titel) < 1 or char_length(v_titel) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_titel');
  end if;
  if v_besch is not null and char_length(v_besch) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_beschrijving');
  end if;
  -- De streefdatum leest de kalender van de groep: een teamdoel volgt de
  -- groepsklok (besluit 17), niet die van wie hem aanmaakt.
  if p_streefdatum is null or p_streefdatum < public.groepsdatum(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_streefdatum');
  end if;

  -- Dezelfde orde van grootte als de daglimiet van `maak_teamgroep()`: tien per
  -- etmaal per aanmaker. Een afgesproken limiet is er niet (besluit 30 noemt
  -- hem); dit is een rem tegen een lus, geen beleid.
  if (select count(*) from team_goals
       where created_by = v_uid and created_at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  begin
    insert into team_goals (organization_id, group_id, title, description, target_date, created_by)
    values (v_org, p_group_id, v_titel, v_besch, p_streefdatum, v_uid)
    returning id into v_id;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_tekst');
  end;

  return jsonb_build_object('ok', true, 'team_goal_id', v_id);
end;
$$;
revoke all on function public.maak_teamdoel(uuid, text, date, text) from public, anon, authenticated;
grant execute on function public.maak_teamdoel(uuid, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. neem_aandeel(): een nieuw persoonlijk doel, gekoppeld aan de teamgroep
-- ---------------------------------------------------------------------------

-- `p_titel` leeg of weggelaten: het aandeel krijgt de titel van het teamdoel.
create or replace function public.neem_aandeel(p_team_goal_id uuid, p_titel text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_team   team_goals%rowtype;
  v_titel  text;
  v_doel   uuid;
begin
  if v_uid is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  select * into v_team from team_goals where id = p_team_goal_id;
  -- ⚠️ Hetzelfde antwoord als bij een onbekend id: een niet-lid leest het
  --    teamdoel niet, dus hoort hij ook niet te horen dat het bestaat.
  if not found or not public.is_group_member(v_team.group_id) then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;
  -- ⚠️ **Het eigen lidmaatschap vastzetten** (securityreview, L1). Zonder lock kan
  --    een gelijktijdig vertrek de koppelingen opruimen vóór deze functie de
  --    hare legt, en dan hangt het aandeel aan een groep waar de eigenaar geen
  --    lid meer van is. Dezelfde vorm als `bewaak_teamlidmaatschap()` (0300).
  perform 1 from group_members m
   where m.group_id = v_team.group_id and m.user_id = v_uid and m.status <> 'inactive'
     for share;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'niet_toegestaan');
  end if;
  if v_team.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'niet_actief');
  end if;
  if exists (select 1 from team_goal_shares
              where team_goal_id = p_team_goal_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'al_aandeel');
  end if;
  -- Het aandeel neemt de datum over (besluit 20), en die moet voor de eigenaar
  -- nog niet voorbij zijn: dezelfde eis als `goals_insert`.
  if v_team.target_date < public.mijn_datum() then
    return jsonb_build_object('ok', false, 'reason', 'streefdatum_verstreken');
  end if;

  v_titel := btrim(coalesce(p_titel, ''));
  if v_titel = '' then
    v_titel := v_team.title;
  end if;
  if char_length(v_titel) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_titel');
  end if;
  -- ⚠️ **Vooraf toetsen en geen `exception when check_violation` om de insert**
  --    (securityreview, L4). Het dagplafond op `goals` is een statement-trigger
  --    die ook `check_violation` gooit; gevangen werd dat `ongeldige_tekst`, en
  --    dat stuurt de gebruiker naar de verkeerde oorzaak. Dit zijn de drie
  --    CHECK's op `goals.title`; het plafond gaat nu ongevangen naar de client,
  --    met zijn eigen melding.
  if v_titel <> public.zonder_regelovergang(v_titel)
     or v_titel <> public.zonder_bidi(v_titel)
     or v_titel <> public.zonder_onzichtbaar_middenin(v_titel) then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_tekst');
  end if;

  insert into goals (owner_id, title, target_date, category)
  values (v_uid, v_titel, v_team.target_date, 'business')
  returning id into v_doel;

  -- ⚠️ Eerst het aandeel en dan de koppeling: zo staat de grendel al op het doel
  --    vóór het aan een groep hangt. Twee gelijktijdige aanroepen botsen op
  --    `team_goal_shares_een_per_persoon`; de tweede krijgt `al_aandeel`.
  begin
    insert into team_goal_shares (goal_id, team_goal_id, user_id)
    values (v_doel, p_team_goal_id, v_uid);
  exception when unique_violation then
    -- Het subblok draait alleen zijn eigen insert terug. Het doel van hierboven
    -- staat erbuiten en moet dus expliciet weg.
    delete from goals where id = v_doel;
    return jsonb_build_object('ok', false, 'reason', 'al_aandeel');
  end;

  insert into goal_group_links (goal_id, group_id) values (v_doel, v_team.group_id);

  return jsonb_build_object('ok', true, 'goal_id', v_doel);
end;
$$;
revoke all on function public.neem_aandeel(uuid, text) from public, anon, authenticated;
grant execute on function public.neem_aandeel(uuid, text) to authenticated;
