-- 0066 — "Kon iemand deze week beoordelen" wordt een grendel (QS8-110, K1)
--
-- Repareert een gat dat 0064/0065 zelf openzetten. De security-review van
-- 23-08-2026 vond het; deze migratie sluit het.
--
-- ⚠️ **Wat er misging.** 0065 stelt de vraag "kon iemand deze week beoordelen"
--    op het moment dát het minpunt geboekt wordt, en 0064 beantwoordt hem door
--    te kijken of er op dát moment een `goal_group_links`-rij bestaat. Beide
--    kanten van die rij zijn een knop in de eigen app:
--
--      goal_group_links_delete  — de doeleigenaar mag verwijderen, onvoorwaardelijk
--      goal_group_links_insert  — en terugzetten zolang hij lid is
--
--    Dus: zie vrijdag dat je je week niet haalt, ontkoppel het doel van je
--    groep, laat de rollover langslopen (status wordt `missed`, maar het
--    minpunt vervalt), koppel maandag terug. Doe dat elke slechte week en je
--    score kan alleen nog omhoog. Dat is letterlijk wat domeinregel 10
--    verbiedt: "anders is missen gratis en zegt de score niets".
--
--    Dezelfde klasse als de vier routes uit 0043 t/m 0046, en gevonden op
--    dezelfde manier: door direct te reviewen in plaats van later.
--
-- ⚠️ **Waarom een grendel en niet een betere vraag.** De vraag "kon iemand
--    beoordelen" gaat over de week die voorbij is, en `goal_group_links` heeft geen
--    historie. Die historie alsnog bouwen is een tabel erbij voor één vraag.
--    Goedkoper en strenger: leg het antwoord vast op het weekdoel zelf, en laat
--    het maar één kant op bewegen.
--
--      * bij het aanmaken van het weekdoel: was er toen een medebeoordelaar?
--      * gaat het doel gedurende de cyclus alsnog een groep in: grendel om.
--      * gaat het doel de groep uit: de grendel blijft staan.
--
--    Monotoon, dus ontkoppelen levert niets meer op. Wie écht solo is, heeft de
--    grendel nooit omgezet en krijgt nog steeds geen minpunt — dat was de hele
--    bedoeling van QS8-110 en die blijft overeind.
--
-- ⚠️ **De grendel is niet door de client te verlagen.** Er staat een BEFORE
--    UPDATE-trigger op die `beoordeelbaar` terugzet naar `oud or nieuw`. Zonder
--    die trigger is de reparatie een decoratie: `weekly_goals` is voor de
--    eigenaar bij te werken, dus dan zet je hem gewoon zelf op false. Dit is
--    hetzelfde soort slot als bij domeinregel 7 — de regel is pas afgedwongen
--    als de dátabase hem afdwingt, niet als de UI hem netjes aanhoudt.
--
-- ⚠️ **M1 uit dezelfde review: één definitie van "telt mee als medelid".**
--    0064 schreef `m.status = 'active'`, maar de policy die goedkeuring toestaat
--    gebruikt `m.status <> 'inactive'` (0023, regel 148), en dat doen nog elf
--    andere plekken. Gevolg van dat verschil: staat je enige buddy op `paused`,
--    dan mág die je week goedkeuren (+2 blijft mogelijk) terwijl
--    `kan_beoordeeld_worden` false zegt en je minpunt vervalt. Dezelfde
--    asymmetrie als K1, alleen via de status van iemand anders.
--
--    `paused` wordt vandaag nergens gezet, dus dit is latent — maar
--    `join_group_with_code` zet hem expliciet terug naar `active` (0016, regel
--    421), dus de waarde is voorzien en komt er. De vraag hier is precies "kon
--    iemand goedkeuren", dus de definitie van de goedkeuringspolicy is de juiste.
--
-- ⚠️ **`revoke` op de triggerfunctie**, wat 0065 niet deed en 0064 wel. Postgres
--    weigert een triggerfunctie buiten triggercontext, dus praktisch onschadelijk
--    — maar de inconsistentie is precies hoe hier eerder fouten zijn gekopieerd
--    (zie CLAUDE.md regel 19, reden 2).
--
-- Idempotent: `add column if not exists`, `create or replace`, `drop trigger if exists`.
--
-- ROLLBACK:
--   drop trigger if exists weekdoel_beoordeelbaar_bij_insert on public.weekly_goals;
--   drop trigger if exists weekdoel_beoordeelbaar_blijft_staan on public.weekly_goals;
--   drop trigger if exists koppeling_zet_beoordeelbaar_om on public.goal_group_links;
--   drop function if exists public.zet_beoordeelbaar_bij_insert();
--   drop function if exists public.beoordeelbaar_blijft_staan();
--   drop function if exists public.koppeling_zet_beoordeelbaar_om();
--   alter table public.weekly_goals drop column if exists beoordeelbaar;
--   -- en zet 0065's functie terug op de live-variant (zie 0065).

-- ---------------------------------------------------------------------------
-- 1. Eén definitie van "telt mee als medebeoordelaar" (M1)
-- ---------------------------------------------------------------------------

create or replace function public.kan_beoordeeld_worden(p_goal_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select p_goal_id is not null
     and p_owner_id is not null
     and exists (
       select 1
       from goal_group_links l
       join group_members m on m.group_id = l.group_id
       where l.goal_id = p_goal_id
         and m.user_id is distinct from p_owner_id
         -- Gelijk aan de goedkeuringspolicy uit 0023. Zie de kop.
         and m.status is distinct from 'inactive'
     );
$$;

revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from public;
revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from anon;
revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from authenticated;
grant execute on function public.kan_beoordeeld_worden(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. De grendel op het weekdoel
-- ---------------------------------------------------------------------------

alter table public.weekly_goals
  add column if not exists beoordeelbaar boolean not null default false;

comment on column public.weekly_goals.beoordeelbaar is
  'Grendel (0066): stond dit doel tijdens deze cyclus ooit in een groep met een '
  'ander niet-inactief lid? Gaat alleen van false naar true. Bepaalt of een '
  'gemiste cyclus een minpunt oplevert (QS8-110). Nooit door de client te '
  'verlagen; zie beoordeelbaar_blijft_staan().';

-- Zetten bij het aanmaken. De client mag de waarde meesturen, hij wordt
-- overschreven — anders is een weekdoel met `beoordeelbaar = false` gewoon een
-- INSERT-veld en is de hele grendel gratis te omzeilen.
create or replace function public.zet_beoordeelbaar_bij_insert()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_owner uuid;
begin
  select g.owner_id into v_owner from goals g where g.id = new.goal_id;

  new.beoordeelbaar := kan_beoordeeld_worden(new.goal_id, v_owner);

  return new;
end;
$$;

-- Verlagen kan niet. `oud or nieuw` en niet `oud`: de koppelingstrigger
-- hieronder zet hem juist wél om, en die loopt via een gewone UPDATE.
create or replace function public.beoordeelbaar_blijft_staan()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  new.beoordeelbaar := coalesce(old.beoordeelbaar, false)
                    or coalesce(new.beoordeelbaar, false);
  return new;
end;
$$;

drop trigger if exists weekdoel_beoordeelbaar_bij_insert on public.weekly_goals;
create trigger weekdoel_beoordeelbaar_bij_insert
  before insert on public.weekly_goals
  for each row execute function public.zet_beoordeelbaar_bij_insert();

drop trigger if exists weekdoel_beoordeelbaar_blijft_staan on public.weekly_goals;
create trigger weekdoel_beoordeelbaar_blijft_staan
  before update on public.weekly_goals
  for each row execute function public.beoordeelbaar_blijft_staan();

-- ---------------------------------------------------------------------------
-- 3. Een doel dat alsnog een groep in gaat, zet de grendel om
-- ---------------------------------------------------------------------------

-- ⚠️ Alleen onafgewikkelde weekdoelen (`todo`/`cancelled`). Voor een cyclus die
--    al `missed`, `approved` of `excused` is, is het punt al geboekt of juist
--    bewust niet — die met terugwerkende kracht van antwoord laten veranderen
--    zou een geschiedenis herschrijven, en die zijn hier append-only
--    (domeinregel 6).
--
-- ⚠️ Dit is bewust de gulle kant op: koppel je een doel dat al weken solo
--    openstaat alsnog aan een groep, dan tellen die openstaande weken vanaf nu
--    mee. Dat kan een minpunt opleveren voor een week waarin je feitelijk geen
--    buddy had. De andere kant op fout gaan is erger: dan is missen weer gratis.
create or replace function public.koppeling_zet_beoordeelbaar_om()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  update weekly_goals w
     set beoordeelbaar = true
   where w.goal_id = new.goal_id
     and w.status in ('todo', 'cancelled')
     and w.beoordeelbaar is distinct from true;

  return new;
end;
$$;

drop trigger if exists koppeling_zet_beoordeelbaar_om on public.goal_group_links;
create trigger koppeling_zet_beoordeelbaar_om
  after insert on public.goal_group_links
  for each row execute function public.koppeling_zet_beoordeelbaar_om();

-- ---------------------------------------------------------------------------
-- 4. Het minpunt leest voortaan de grendel, niet de stand van nu
-- ---------------------------------------------------------------------------

create or replace function public.geen_minpunt_zonder_beoordelaar()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_beoordeelbaar boolean;
begin
  if new.reason is distinct from 'cycle_missed' then
    return new;
  end if;

  if new.goal_id is null then
    return new;
  end if;

  -- ⚠️ Zonder verwijzing naar het weekdoel valt de regel niet te toetsen, en
  --    dan blijft het zoals het was: punt boeken. Bij twijfel is "missen kost
  --    een punt" de conservatieve kant — de andere kant is de kant die 0065
  --    per ongeluk op ging.
  if new.ref_type is distinct from 'weekly_goal' or new.ref_id is null then
    return new;
  end if;

  select w.beoordeelbaar into v_beoordeelbaar
    from weekly_goals w
   where w.id = new.ref_id;

  -- Weekdoel weg of onvindbaar: zelfde redenering als hierboven.
  if v_beoordeelbaar is null then
    return new;
  end if;

  if v_beoordeelbaar then
    return new;
  end if;

  raise notice
    'QS8-110: minpunt overgeslagen voor doel % van gebruiker % — geen beoordelaar.',
    new.goal_id, new.user_id;

  return null;
end;
$$;

revoke all on function public.geen_minpunt_zonder_beoordelaar() from public;
revoke all on function public.geen_minpunt_zonder_beoordelaar() from anon;
revoke all on function public.geen_minpunt_zonder_beoordelaar() from authenticated;

drop trigger if exists minpunt_alleen_met_beoordelaar on public.points_ledger;
create trigger minpunt_alleen_met_beoordelaar
  before insert on public.points_ledger
  for each row execute function public.geen_minpunt_zonder_beoordelaar();
