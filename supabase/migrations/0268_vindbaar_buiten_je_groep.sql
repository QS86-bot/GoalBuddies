-- 0268_vindbaar_buiten_je_groep.sql — wie dat zelf aanzet, is buiten zijn groep te vinden op naam en foto, en op niets anders.
--
-- ROLLBACK-PAD:
--   drop function if exists public.zoek_mensen(text, integer, integer);
--   drop index if exists public.profiles_vindbaar_naam_idx;
--   -- `mijn_profiel` terug naar de vorm van 0245 (zonder `vindbaar`);
--   -- zie die migratie voor de kolomlijst.
--   revoke update (vindbaar) on public.profiles from authenticated;
--   alter table public.profiles drop column if exists vindbaar;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 14-09-2026 (QS8-476): "Ik wil ook dat mijn profielfoto en
-- gebruikersnaam buiten mijn groep, dus publiekelijk, te zien is zodat mensen
-- buiten mijn groep mij kunnen vinden."
--
-- Stand daarvoor: `profiles_select` is
-- `id = (select auth.uid()) or shares_group_with_user(id)`. Wie nergens lid is,
-- bestaat voor niemand — de dode hoek van het epic over buddy's die je nog niet
-- kent.
--
-- ---------------------------------------------------------------------------
-- 1. De schakelaar: opt-in, standaard uit
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`default false`, en dat is een keuze die hier zichtbaar hoort te staan.**
--    Het besluit hierboven gaat over Quintens eigen profiel; het zegt niet dat
--    iedere volgende gebruiker vindbaar wordt zodra hij zich aanmeldt. CLAUDE.md:
--    *"Voor élk níeuw oppervlak is beschermd het antwoord tot iemand het
--    tegendeel besluit."* Wie gevonden wil worden, zet het aan.
--
--    Onderbouwing in `docs/decisions/2026-09-14-vindbaar-is-een-keuze.md`.

alter table public.profiles
  add column if not exists vindbaar boolean not null default false;

comment on column public.profiles.vindbaar is
  'Of dit profiel buiten de eigen groepen vindbaar is via zoek_mensen(). '
  'Opt-in, standaard uit — QS8-476.';

-- ⚠️ **Een kolomgrant en niet alleen een policy.** `profiles` deelt zijn rechten
--    per kolom uit: `authenticated` heeft SELECT op alleen
--    `id, display_name, avatar_url`, en UPDATE op een expliciete lijst. Zonder
--    deze regel kan de eigenaar zijn eigen schakelaar niet omzetten, en een
--    policy alleen zou dat niet repareren.
grant update (vindbaar) on public.profiles to authenticated;

-- ⚠️ De eigenaar leest zijn eigen profiel via `mijn_profiel` en niet via de
--    tabel — daar staat de SELECT-grant immers op drie kolommen. De schakelaar
--    moet zijn eigen stand kunnen tonen, dus hij hoort in de view.
--
--    ⚠️ De kolomlijst is overgenomen uit de gedéployde view (0245 + 0237) en
--    niet uit het hoofd: een `create or replace view` die een kolom laat vallen,
--    is een stille wijziging waar git geen conflict op geeft.
create or replace view public.mijn_profiel as
  select id,
         display_name,
         avatar_url,
         week_start_day,
         tz,
         reminder_time,
         reminder_enabled,
         reminder_tone,
         share_moves_by_default,
         created_at,
         updated_at,
         onboarded_at,
         wants_own_goal,
         locale,
         focus_areas,
         minutes_per_day,
         when_i_do_it,
         what_breaks_it,
         notify_approval_request,
         notify_approval_received,
         notify_cycle_summary,
         notify_commitment_witness,
         quiet_from,
         quiet_to,
         vindbaar
    from public.profiles p
   where id = (select auth.uid());

-- ⚠️ Een partiële index: alleen vindbare profielen worden ooit doorzocht, en dat
--    is verreweg de kleinste kant van de tabel. Onwrikbare regel 11.
create index if not exists profiles_vindbaar_naam_idx
  on public.profiles (display_name)
  where vindbaar;

-- ---------------------------------------------------------------------------
-- 2. zoek_mensen(): een RPC met een kolomlijst, geen tak op de policy
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **RLS kan geen kolommen beperken, en dát is de reden dat dit een functie
--    is.** Een extra tak op `profiles_select` zou de héle rij weggeven aan
--    iedereen: tijdzone, week-startdag, de vier meldingsvoorkeuren, de stille
--    uren, `wants_own_goal`, `focus_areas`, `when_i_do_it`, `what_breaks_it`.
--    Dat is exact de fout die QS8-370 op `commitments_select` vond. Zelfde vorm
--    en zelfde reden als `getuigenissen()` (0169) en
--    `straffen_bij_uitstelverzoek()` (0218).
--
-- ⚠️⚠️ **Vindbaarheid is identiteit en geen voortgang — domeinregel 7.** Hieruit
--    mag niets komen waaruit een gemiste week, een reeks, een puntentotaal, een
--    doeltitel of een groepslidmaatschap af te leiden is. Drie kolommen, en een
--    vierde erbij is een besluit en geen uitbreiding.
create or replace function public.zoek_mensen(
  p_term   text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (id uuid, display_name text, avatar_url text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ik    uuid := (select auth.uid());
  v_term  text;
  v_limit integer;
begin
  if v_ik is null then
    raise exception 'Niet ingelogd' using errcode = 'insufficient_privilege';
  end if;

  -- ⚠️ **De wildcards van LIKE horen bij de zoeker en niet bij de zoekterm.**
  --    Zonder deze ontsnapping is `%` een zoekterm die iedereen teruggeeft, en
  --    dan is de limiet hieronder het enige dat een volledige uitlezing van de
  --    naamlijst nog tegenhoudt. `\` eerst, anders ontsnapt hij de ontsnapping.
  v_term := btrim(coalesce(p_term, ''));
  v_term := replace(v_term, '\', '\\');
  v_term := replace(v_term, '%', '\%');
  v_term := replace(v_term, '_', '\_');

  -- ⚠️ Een lege of eenletterige term geeft niets terug in plaats van alles. Dat
  --    is geen validatiefout maar de grens zelf: zoeken is hier een
  --    enumeratievector op namen, en één teken is geen zoekopdracht.
  if char_length(v_term) < 2 then
    return;
  end if;

  -- ⚠️ **Het plafond staat vóór de query en telt per gebruiker per dag**
  --    (onwrikbare regel 5). `tel_dagteller()` werpt `check_violation` zodra het
  --    plafond door is; die uitzondering rolt de transactie terug, dus een
  --    geweigerde poging laat de teller niet doorgroeien.
  perform tel_dagteller(
    'zoek_mensen', 'gebruiker', v_ik::text, 200, interval '1 day', 'zoekopdrachten'
  );

  -- Paginering met harde randen: een client die 10000 vraagt, krijgt 50.
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
    select p.id, p.display_name, p.avatar_url
      from public.profiles p
     where p.vindbaar
       and p.id <> v_ik
       and p.display_name ilike '%' || v_term || '%' escape '\'
       -- ⚠️ Blokkeren werkt beide kanten op: wie jou blokkeerde verdwijnt uit
       --    jouw resultaten, en jij uit de zijne. Eén richting zou een
       --    geblokkeerde je alsnog laten vinden en uitnodigen (QS8-232).
       and not exists (
         select 1 from public.user_blocks b
          where (b.blocker_id = v_ik and b.blocked_id = p.id)
             or (b.blocker_id = p.id and b.blocked_id = v_ik)
       )
     -- ⚠️ `id` erbij: zonder een unieke staart is de volgorde tussen twee
     --    gelijke namen niet vast, en dan kan paginering een rij overslaan of
     --    dubbel tonen.
     order by p.display_name, p.id
     limit v_limit
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function public.zoek_mensen(text, integer, integer) is
  'Zoekt profielen die zichzelf vindbaar hebben gemaakt, op naamfragment. '
  'Geeft uitsluitend id, display_name en avatar_url — vindbaarheid is '
  'identiteit en geen voortgang (domeinregel 7). QS8-476.';

-- ⚠️ **`authenticated` staat er met zoveel woorden bij.** `alter default
--    privileges` deelt elke nieuwe functie in `public` uit aan anon,
--    authenticated én service_role; `from public, anon` houdt precies de rol
--    over waaronder iedere ingelogde gebruiker draait.
revoke all on function public.zoek_mensen(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.zoek_mensen(text, integer, integer) to authenticated;
