-- 0296_een_melding_krijgt_een_lezer_en_een_afhandeling.sql — `reports` had een
-- schrijfpad en geen lezer, en dat werd blokkerend door het besluit van 22-09
-- (QS8-586)
--
-- ROLLBACK-PAD:
--   drop function if exists public.handel_melding_af(uuid, text);
--   drop function if exists public.openstaande_meldingen(integer, timestamptz, uuid);
--   drop function if exists public.is_platform_beheerder();
--   alter table public.reports drop constraint if exists reports_afhandeling_is_heel;
--   alter table public.reports drop column if exists afgehandeld_door;
--   alter table public.reports drop column if exists afgehandeld_op;
--   alter table public.profiles drop column if exists platform_beheerder;
--   drop index if exists reports_escalatie_idx;
--
--   ⚠️ Terugdraaien laat `reports` weer als schrijf-only tabel achter: melden
--      werkt, en niemand kan er meer bij. Dat is de toestand die dit issue
--      beschrijft, niet een neutrale uitgangspositie.
--
--   ⚠️ De twee kolommen op `reports` en de vlag op `profiles` zijn **toevoegend**
--      op tabellen die vandaag inhoud kunnen hebben; droppen ervan wist de
--      afhandelgeschiedenis. 📏 Op productie staat `reports` vandaag op **0**
--      rijen, dus vandaag kost dat niets — maar dat is een meting met een datum.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 22-09-2026**, op een lokaal opgebouwd schema (Postgres 16,
--    298 migraties op een lege database):
--
--    * `from('reports')` over `src/`, `app/` en `supabase/`: **nul** treffers.
--    * De enige functie die `reports` léést is `meldingen_over()`, en die telt
--      je **eigen** meldingen voor het dagquotum — hij geeft een `integer` terug
--      en raakt de inhoud van een melding niet aan.
--
--    ⚠️ **Dat onderscheid is de moeite waard**, want een volgende sessie die op
--       `from('reports')` grept vindt niets, en een sessie die op `reports`
--       grept vindt `meldingen_over()` en zou kunnen concluderen dat er een
--       lezer ís. Er is een lezer voor het **quotum** en geen lezer voor de
--       **melding**.
--
-- ⚠️⚠️ **En één geval is met echte rijen gemeten, want het bepaalt de vorm van
--    deze migratie.** `reports_select` is
--    `reporter_id = auth.uid() OR (is_group_admin(group_id) AND subject_id <> auth.uid())`.
--    Een melding **over de groepsbeheerder** komt dus bij niemand aan die kan
--    handelen. Gemeten met een groep, een beheerder en een melder:
--
--      melden gaf                                 {"ok": true}
--      de MELDER ziet                             1 melding
--      de BEHEERDER (het onderwerp) ziet          0 meldingen
--
--    Dat is precies het geval dat in een groep met onbekenden het zwaarst weegt,
--    en het is de reden dat een escalatieroute hier niet optioneel is.
--
-- ---------------------------------------------------------------------------
-- De gekozen vorm, en wat er is afgewogen
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 22-09-2026: **groepsbeheerder plus escalatie**, en de
-- afhandeling via een RPC.
--
-- ⚠️ **De escalatie is smal gehouden.** De platformbeheerder ziet **niet** alle
--    meldingen, maar alleen die waar de groep aantoonbaar niets mee kan: het
--    onderwerp is zelf beheerder van die groep. Een bredere platformblik zou
--    betekenen dat één account elke melding in elke groep leest, en dat is een
--    privacybelofte die niemand gedaan heeft.
--
-- ⚠️ **`reporter_id` gaat niet mee naar de lezer.** Wie er gemeld heeft is niet
--    nodig om een melding te beoordelen, en het weglaten beschermt de melder
--    tegen een beheerder die het hem betaald zet. Wat er wél in zit is
--    `meldingen_over_onderwerp` — hoeveel losse meldingen er over dit onderwerp
--    in deze groep openstaan — want *"vijf mensen melden dezelfde persoon"* is
--    het signaal dat telt, en dat kan zonder één naam prijs te geven.
--
-- ⚠️ **RLS kan geen kolommen beperken**, dus dit loopt via een `security
--    definer`-RPC met een expliciete kolomlijst en niet via een verruiming van
--    `reports_select`. Zelfde vorm en zelfde reden als `getuigenissen()` (0169)
--    en `straffen_bij_uitstelverzoek()` (0218).
--
-- ⚠️ **Onwrikbare regel 10: geen ongepagineerde lijstquery.** `openstaande_meldingen()`
--    draagt een cursor (`p_na_at`, `p_na_id`) en een plafond, net als
--    `openstaande_beoordelingen()` sinds 0125.
--
-- ⚠️ `status` had zijn levenscyclus al in de CHECK (`open`, `reviewed`,
--    `dismissed`) maar geen enkele weg ertussen: `reports_update` is `false`.
--    Die blijft `false`; `handel_melding_af()` is de enige route.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Het platformbegrip — zo klein als het kan
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen rolmodel met moderatoren.** Eén booleaanse vlag, standaard `false`,
--    en géén schrijfrecht voor welke client dan ook — zelfde grendel als
--    `groups.zichtbaarheid` (A41): de kolom bestaat, de app kan hem niet zetten.
alter table public.profiles
  add column if not exists platform_beheerder boolean not null default false;

comment on column public.profiles.platform_beheerder is
  'Mag geëscaleerde meldingen lezen en afhandelen — QS8-586. Voor geen enkele '
  'client schrijfbaar; zetten gebeurt met de hand op de database.';

-- ⚠️ `authenticated` krijgt hier bewust géén `update`. Een vlag die de houder
--    zelf kan zetten is geen vlag.
revoke update (platform_beheerder) on public.profiles from public, anon, authenticated;

create or replace function public.is_platform_beheerder()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select p.platform_beheerder from public.profiles p where p.id = (select auth.uid())),
    false);
$function$;

comment on function public.is_platform_beheerder() is
  'Of de aanroeper de platformbeheerder is — QS8-586. Alleen voor de '
  'escalatieroute van meldingen.';

revoke execute on function public.is_platform_beheerder() from public, anon, authenticated;
grant execute on function public.is_platform_beheerder() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De afhandeling wordt op de rij zelf vastgelegd
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists afgehandeld_door uuid references public.profiles(id) on delete set null,
  add column if not exists afgehandeld_op   timestamptz;

-- ⚠️ **Heel of niet.** Een rij die `reviewed` is zonder te zeggen door wie, is
--    een afhandeling zonder spoor — en dan is de kolom administratie in plaats
--    van bewijs. Zelfde vorm als `profiles_stilte_is_heel_of_niet`.
alter table public.reports drop constraint if exists reports_afhandeling_is_heel;
alter table public.reports add constraint reports_afhandeling_is_heel check (
  (status = 'open'  and afgehandeld_door is null and afgehandeld_op is null)
  or
  (status <> 'open' and afgehandeld_door is not null and afgehandeld_op is not null)
);

-- ⚠️ De client mag deze twee niet schrijven; `handel_melding_af()` doet het.
revoke insert (afgehandeld_door, afgehandeld_op) on public.reports from public, anon, authenticated;
revoke update (afgehandeld_door, afgehandeld_op) on public.reports from public, anon, authenticated;

-- ⚠️ Onwrikbare regel 11 — index op de kolom waarop de escalatieroute filtert.
create index if not exists reports_escalatie_idx
  on public.reports (status, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 3. De lezer
-- ---------------------------------------------------------------------------
create or replace function public.openstaande_meldingen(
  p_limit  integer     default 20,
  p_na_at  timestamptz default null,
  p_na_id  uuid        default null
)
returns table (
  id                        uuid,
  group_id                  uuid,
  groepsnaam                text,
  subject_id                uuid,
  onderwerp_naam            text,
  reden                     text,
  toelichting               text,
  bericht_kopie             text,
  status                    text,
  created_at                timestamptz,
  meldingen_over_onderwerp  integer,
  via_escalatie             boolean
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠️ Twee routes in één lijst, en ze sluiten elkaar niet uit:
  --
  --   a. je bent beheerder van de groep en niet zelf het onderwerp;
  --   b. je bent platformbeheerder én het onderwerp is beheerder van die groep
  --      — het geval dat route (a) per definitie niet kan afhandelen.
  --
  -- ⚠️ `reporter_id` staat met opzet niet in de kolomlijst; zie de kop.
  select r.id,
         r.group_id,
         g.name,
         r.subject_id,
         p.display_name,
         r.reden,
         r.toelichting,
         r.bericht_kopie,
         r.status,
         r.created_at,
         (select count(*)::integer
            from public.reports a
           where a.group_id = r.group_id
             and a.subject_id = r.subject_id
             and a.status = 'open'),
         not (public.is_group_admin(r.group_id) and r.subject_id <> (select auth.uid()))
  from public.reports r
       join public.groups   g on g.id = r.group_id
       join public.profiles p on p.id = r.subject_id
  where r.status = 'open'
    and (
      (public.is_group_admin(r.group_id) and r.subject_id <> (select auth.uid()))
      or
      (public.is_platform_beheerder()
       and exists (select 1
                     from public.group_members m
                    where m.group_id = r.group_id
                      and m.user_id  = r.subject_id
                      and m.role     = 'admin'))
    )
    -- ⚠️ De cursor, en beide helften of geen van beide — zelfde vorm als
    --    `openstaande_beoordelingen()` (0125). Een half ingevulde cursor
    --    behandelen we als "geen cursor".
    and (p_na_at is null or p_na_id is null
         or (r.created_at, r.id) < (p_na_at, p_na_id))
  order by r.created_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;

comment on function public.openstaande_meldingen(integer, timestamptz, uuid) is
  'Openstaande meldingen voor de groepsbeheerder, plus de geëscaleerde gevallen '
  'voor de platformbeheerder — QS8-586. Zonder reporter_id: wie meldde is niet '
  'nodig om te beoordelen.';

revoke execute on function public.openstaande_meldingen(integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.openstaande_meldingen(integer, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. De afhandeling
-- ---------------------------------------------------------------------------
create or replace function public.handel_melding_af(
  p_report_id uuid,
  p_status    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_mij     uuid := (select auth.uid());
  v_rij     public.reports;
  v_mag     boolean;
begin
  if v_mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  -- ⚠️ `not_allowed` en niet `not_found` voor een bestaande rij die je niet mag
  --    zien: anders is deze RPC een orakel dat vertelt of een melding-id bestaat.
  if p_status is null or p_status not in ('reviewed', 'dismissed') then
    return jsonb_build_object('ok', false, 'reason', 'status_invalid');
  end if;

  select * into v_rij from public.reports where id = p_report_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  -- Dezelfde twee routes als de lezer, en met opzet in dezelfde volgorde.
  v_mag := (public.is_group_admin(v_rij.group_id) and v_rij.subject_id <> v_mij)
        or (public.is_platform_beheerder()
            and exists (select 1
                          from public.group_members m
                         where m.group_id = v_rij.group_id
                           and m.user_id  = v_rij.subject_id
                           and m.role     = 'admin'));

  if not v_mag then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;

  -- ⚠️ Alleen een openstaande melding is af te handelen. Zonder deze poort kan
  --    een tweede beheerder een oordeel van de eerste overschrijven, en dan is
  --    `afgehandeld_door` niet meer wie het besloot.
  if v_rij.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_handled');
  end if;

  update public.reports
     set status           = p_status,
         afgehandeld_door = v_mij,
         afgehandeld_op   = now()
   where id = p_report_id;

  return jsonb_build_object('ok', true);
end;
$function$;

comment on function public.handel_melding_af(uuid, text) is
  'Zet een openstaande melding op reviewed of dismissed, met wie en wanneer — '
  'QS8-586. De enige weg: reports_update blijft false.';

revoke execute on function public.handel_melding_af(uuid, text) from public, anon, authenticated;
grant execute on function public.handel_melding_af(uuid, text) to authenticated;
