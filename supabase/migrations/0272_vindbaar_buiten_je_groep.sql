-- 0272_vindbaar_buiten_je_groep.sql — wie dat zelf aanzet, is buiten zijn groep te vinden op naam en foto, en op niets anders.
--
-- ROLLBACK-PAD:
--   drop function if exists public.zoek_mensen(text, integer, integer);
--   drop function if exists public.vindbaar_voor_mij(uuid);
--   drop index if exists public.profiles_vindbaar_naam_idx;
--   -- `mijn_profiel` terug naar de vorm van 0245 (zonder `vindbaar`);
--   -- zie die migratie voor de kolomlijst.
--   revoke update (vindbaar) on public.profiles from authenticated;
--   alter table public.profiles drop column if exists vindbaar;
--   -- en `avatars_select` terug naar de vorm van **0130** (zonder de derde
--   -- tak). ⚠️ Niet 0126: die heeft de kale `::uuid`-cast waarmee één
--   -- vreemde map in de bucket élke leesquery laat omvallen — 0130 is de
--   -- migratie die dat repareerde, en dus de vorm die hier stond.
--
--   ⚠️ De kolom droppen wist ieders keuze om vindbaar te zijn. Op een gevulde
--      database is dat geen rollback maar een besluit.
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
-- ⚠️⚠️ **De `with (…)` staat er letterlijk bij, en dat is de derde keer dat dit
--    misgaat.** `create or replace view` **vervangt** de reloptions-lijst: wat je
--    niet noemt, valt weg. 📏 Zonder deze regel is `pg_class.reloptions` voor
--    `mijn_profiel` leeg waar 0245 `security_invoker=false,security_barrier=true`
--    achterliet, en gaan de twee toetsen in `tests/rls/viewopties.test.ts` om.
--
--    Dit is geen nieuw gat maar het **intrekken van een bestaande grendel**, en
--    dat is de stillere van de twee: de view draait als eigenaar en gaat dus
--    langs RLS én langs de kolomgrant van 0089 heen — wat hem afgrendelt is
--    alleen zijn eigen `where id = auth.uid()`. Zonder `security_barrier` mag de
--    planner een goedkope qual van de aanroeper vóór die filter uitvoeren.
--
--    0237 maakte deze fout, 0245 schreef hem op, en die test bestaat er precies
--    voor. Hij deed zijn werk; dit is wat er daarna hoort te gebeuren.
create or replace view public.mijn_profiel
  with (security_invoker = false, security_barrier = true) as
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

-- ⚠️ **Partieel, op `lower()`, met `text_pattern_ops`, en met `id` als staart.**
--    📏 **Nagemeten met `explain (analyze, buffers)`, en de uitslag is
--    genuanceerder dan "de index wordt gebruikt" — vandaar beide plannen hier:**
--
--      selectieve set (weinig vindbaar)   -> Index Scan using profiles_vindbaar_naam_idx
--                                            Index Cond: lower(display_name)
--                                              ~>=~ 'zaai1a' AND ~<~ 'zaai1b'
--      50.000 vindbaar van 50.000         -> Bitmap Heap Scan, Recheck Cond: vindbaar
--                                            Filter: lower(display_name) ~~ 'zaai1a%'
--                                            217 rijen, 198 heapblokken, 0,55 ms
--
--    Dat tweede plan is geen defect maar selectiviteit: is iedereen vindbaar, dan
--    zegt de partiële voorwaarde niets meer en is een bitmapscan goedkoper. De
--    `text_pattern_ops`-reeks wérkt — dat is het eerste plan, en dat is precies
--    de stand die je in de praktijk hebt, want `vindbaar` staat standaard uit.
--
--    ⚠️ De reden dat dit hier staat en niet als "de index wordt gebruikt": een
--    meting op één selectiviteit is geen uitspraak over de andere.
--
--    - partieel op `vindbaar`: de index is zo groot als de vindbare populatie en
--      niet als de hele gebruikersgroep (onwrikbare regel 11);
--    - `lower(...)`: de query zoekt hoofdletterongevoelig, en een index op de
--      kale kolom wordt dan niet gebruikt;
--    - `text_pattern_ops`: zonder die operatorklasse gebruikt `like 'x%'` onder
--      een niet-C-collatie géén btree;
--    - `id` erachter: de sortering is `(lower(display_name), id)` en komt zo
--      volledig uit de index.
create index if not exists profiles_vindbaar_naam_idx
  on public.profiles (lower(display_name) text_pattern_ops, id)
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

  v_term := btrim(coalesce(p_term, ''));

  -- ⚠️ Een lege of eenletterige term geeft niets terug in plaats van alles. Dat
  --    is geen validatiefout maar de grens zelf: zoeken is hier een
  --    enumeratievector op namen, en één teken is geen zoekopdracht.
  --
  -- ⚠️⚠️ **Meten vóór de ontsnapping, en dat is een gemeten reparatie.** Stond
  --    deze toets erná, dan telde hij de backslashes mee die de ontsnapping er
  --    net in gezet had: `%`, `_` en `\` zijn één teken en worden er twee, dus
  --    precies die drie kwamen door een grens die "minstens twee" heet. 📏
  --    Nagemeten met een vindbaar profiel `%rarenaam`: `zoek_mensen('%')` gaf
  --    die rij terug waar `zoek_mensen('a')` niets gaf. Het lek was klein — de
  --    ontsnapping hield, dus je kreeg namen die met een letterlijke `%`
  --    beginnen en niet de populatie — maar het kostte een dagtellerslot en de
  --    grens deed niet wat eroverheen geschreven stond.
  if char_length(v_term) < 2 then
    return;
  end if;

  -- ⚠️ **De wildcards van LIKE horen bij de zoeker en niet bij de zoekterm.**
  --    Zonder deze ontsnapping is `%` een zoekterm die iedereen teruggeeft, en
  --    dan is de limiet hieronder het enige dat een volledige uitlezing van de
  --    naamlijst nog tegenhoudt. `\` eerst, anders ontsnapt hij de ontsnapping.
  v_term := replace(v_term, '\', '\\');
  v_term := replace(v_term, '%', '\%');
  v_term := replace(v_term, '_', '\_');

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
       -- ⚠️⚠️ **Zoeken op het begin van de naam en niet middenin, en dat is een
       --    meting en geen voorkeur.** `like '%x%'` kan geen enkele btree
       --    gebruiken: dat is een sequentiële scan over `profiles` bij élke
       --    toetsaanslag, op een tabel die naar 100k+ moet. `lower(...) like
       --    'x%'` gebruikt de index hierboven wél.
       --
       --    ⚠️ De prijs staat erbij: wie "de Vries" heet wordt niet gevonden op
       --    "vries". Middenin zoeken vraagt `pg_trgm`, en dat is een extensie
       --    die dit project vandaag niet heeft — een eigen besluit met een eigen
       --    meting, en geen regel die je er stilletjes bij schrijft.
       and lower(p.display_name) like lower(v_term) || '%' escape '\'
       -- ⚠️⚠️ **Dezelfde functie als de policy op de bucket, en dat is de naad.**
       --    Blokkeren werkt beide kanten op — wie jou blokkeerde verdwijnt uit
       --    jouw resultaten, en jij uit de zijne (QS8-232) — en die regel staat
       --    hier niet nog een keer uitgeschreven. Stond hij dat wél, dan zijn
       --    het twee plekken die uit elkaar kunnen lopen, en dan is de naam
       --    zichtbaar via het ene oppervlak en de foto via het andere.
       --
       --    ⚠️ `p.vindbaar` staat hierboven óók nog los, en dat is geen dubbele
       --       toets maar de index: `profiles_vindbaar_naam_idx` is partieel op
       --       die kolom, en een planner ziet de voorwaarde niet door een
       --       functieaanroep heen.
       and vindbaar_voor_mij(p.id)
     -- ⚠️ `id` erbij: zonder een unieke staart is de volgorde tussen twee
     --    gelijke namen niet vast, en dan kan paginering een rij overslaan of
     --    dubbel tonen.
     --
     -- ⚠️⚠️ **`lower(...)` en niet de kale kolom, en dat is een reparatie.** Hier
     --    stond `order by p.display_name`, terwijl de index op
     --    `lower(display_name)` staat — een index kan die ordening per definitie
     --    niet leveren, dus er kwam een `Sort` in het plan die bij elke pagina
     --    de hele matchende set opnieuw sorteert. Het zoeken is bovendien
     --    hoofdletterongevoelig; dan is sorteren dat ook horen te zijn.
     order by lower(p.display_name), p.id
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

-- ---------------------------------------------------------------------------
-- 3. De foto, en waarom die hier staat en niet in een vervolgissue
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten: zonder dit blok levert dit issue de helft van wat het belooft,
--    en er wordt niets rood van.** De bucket `avatars` is privé
--    (`storage.buckets.public = false`), dus een `<Image>` heeft een ondertekende
--    URL nodig, en die ontstaat alleen als `avatars_select` je doorlaat. Die
--    policy stond op *eigen map of gedeelde groep*:
--
--      (storage.foldername(name))[1] = auth.uid()::text
--        or shares_group_with_user(...)
--
--    Een vreemde die je via `zoek_mensen()` vindt, deelt per definitie geen
--    groep. `avatar_url` komt netjes terug, het tekenen levert nul URL's op, en
--    `Avatar` valt terug op initialen — **elk schakeltje af en de keten
--    onderbroken**. Dat is regel 18 vraag 5, en het besluit zegt met zoveel
--    woorden *"profielfoto en gebruikersnaam"*.
--
-- ⚠️ **Dezelfde grendel als de RPC en niet ruimer:** alleen wie zichzelf
--    vindbaar heeft gemaakt. Wie de schakelaar uit heeft, verandert er niets aan.
--
-- ⚠️⚠️ **Hier stond dat een bouwsessie dit deel niet kan toepassen, en dat was
--    onjuist.** `storage.objects` is inderdaad eigendom van
--    `supabase_storage_admin` en `postgres` is geen lid van die rol — maar
--    Supabase heeft de rechten op 12-09-2026 verruimd, en sindsdien gaan
--    `create policy` en `create trigger` daar wél. Alleen een `create index` op
--    die tabel wordt nog geweigerd, en die staat hier niet. 📏 De meting per
--    handeling, mét datum, staat in `docs/DEPLOY.md` §2 (QS8-439).
--
--    ⚠️ Dit is precies de val waar dat document voor waarschuwt: de oude meting
--       stond er zónder datum, werd als eigenschap gelezen in plaats van als
--       waarneming, en liet QS8-243 drie dagen wachten op een mens met exact
--       dezelfde rechten als een bouwsessie. **Lees een gemeten grens altijd
--       met zijn meetdatum erbij.**
-- ⚠️⚠️ **Een functie en geen `exists (select … from profiles)` in de policy zelf,
--    en dat is gemeten en niet beredeneerd.** Een policy-expressie draait met de
--    rechten van wie de query stelt. `authenticated` heeft op `profiles` alleen
--    een kolomgrant — `id, display_name, avatar_url` — dus een tak die
--    `p.vindbaar` leest, botst op dat recht. 📏 Nagemeten op de lokale stack:
--    de tak gaf niet *false* maar
--
--      ERROR: 42501: permission denied for table profiles
--
--    en die fout valt op de héle policy, dus op élke rij van de bucket. Zes
--    bestaande tests in `tests/rls/avatarbucket.test.ts` werden er rood van —
--    óók het lezen van je eigen foto, waar deze tak niets mee te maken heeft.
--
--    ⚠️ De les zit in de richting van de fout. Een tak die te weinig rechten
--    heeft, geeft hier geen stille *nee* maar een harde fout op het geheel: de
--    nieuwe tak had het bestáánde oppervlak gesloopt. Dat de suite dat vond, is
--    de verdienste van de must-allow-helft van die tests — een policy die alles
--    weigert is groen op elke weigertest.
--
--    Vandaar dezelfde vorm als de tak ernaast: `shares_group_with_user()` is om
--    exact dezelfde reden `security definer`, en leest `group_members` waar
--    `authenticated` ook niet zomaar bij kan.
--
-- ⚠️⚠️ **`_voor_mij` en niet `is_vindbaar`, en die naam draagt twee besluiten.**
--
--    1. **Hij toetst de aanroeper.** Een definer die `authenticated` mag
--       aanroepen en `auth.uid()` niet noemt, is een verhoogd recht dat niet
--       vraagt wie er klopt — de klasse van QS8-287/289, bewaakt door
--       `tests/rls/definer-aanroepertoets.test.ts` en `hulpfuncties.test.ts`.
--       Een vorm die alleen `profiles.vindbaar` van een willekeurig id
--       teruggeeft, is via `POST /rest/v1/rpc/…` een onbeperkt orakel op precies
--       de kolom die 0089's kolomgrant buiten `authenticated` houdt.
--
--    2. **Hij eert de blokkade, net als `zoek_mensen()`.** Zonder dat was de
--       blokkade eenzijdig verdwenen op dit ene oppervlak: wie jou blokkeerde
--       kon je foto nog lezen zodra je vindbaar werd. 0145 behandelt blokkeren
--       als *"je verdwijnt uit elkaars oppervlakken"*, en een oppervlak dat daar
--       stilzwijgend van afwijkt, is precies hoe een regel verwatert.
--
--    ⚠️ De vraag die deze functie beantwoordt is dus *"mag ík deze persoon
--       zien"* en niet *"staat zijn vinkje aan"*. Die twee lijken op elkaar en
--       zijn het niet: de eerste hangt aan de aanroeper, de tweede is een
--       eigenschap van een vreemde. Alleen de eerste hoort een `authenticated`
--       te mogen stellen.
create or replace function public.vindbaar_voor_mij(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from profiles p
     where p.id = other
       and p.vindbaar
       and (select auth.uid()) is not null
       and not exists (
         select 1
           from user_blocks b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
             or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
       )
  );
$$;

comment on function public.vindbaar_voor_mij(uuid) is
  'Of de aanroeper dit profiel buiten een gedeelde groep mag zien: het profiel '
  'staat op vindbaar en er ligt geen blokkade in welke richting dan ook. '
  'Security definer omdat `authenticated` op profiles een kolomgrant heeft die '
  '`vindbaar` niet noemt, en een policy-expressie met de rechten van de vrager '
  'draait. QS8-476.';

-- ⚠️ `authenticated` staat er met zoveel woorden bij — zie de revoke bij
--    `zoek_mensen()` hierboven voor de reden.
revoke all on function public.vindbaar_voor_mij(uuid) from public, anon, authenticated;
grant execute on function public.vindbaar_voor_mij(uuid) to authenticated;

drop policy if exists avatars_select on storage.objects;
-- ⚠️⚠️ **`to authenticated`, en het weglaten daarvan was hier een echte
--    verruiming.** 0126 en 0130 hadden het allebei; zonder die clausule staat de
--    policy op PUBLIC. 📏 Gemeten: `pg_policy.polroles` werd `{0}` in plaats van
--    de rol — en dat is inclusief `anon`.
--
--    ⚠️ **De lokale stack kan dit niet zien**, en dat is de reden dat het hier
--       met zoveel woorden staat. `supabase/shim/0000_supabase_shim.sql` geeft
--       `anon` geen enkel recht op `storage.objects`, dus lokaal komt er netjes
--       *permission denied* uit en blijft alles groen; op echt Supabase staat
--       daar wél een grant aan `anon`. Dat het vandaag niets weggeeft hangt dan
--       aan twee ánder sloten (anon heeft geen execute op de twee helpers, en
--       `auth.uid()` is null) — bescherming die je niet bedoeld hebt en die één
--       toekomstige grant ongedaan maakt.
create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or shares_group_with_user(
           case
             when (storage.foldername(name))[1] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then ((storage.foldername(name))[1])::uuid
             else null::uuid
           end
         )
      -- ⚠️ De derde tak, en hij leunt op dezelfde kolom als de RPC.
      or vindbaar_voor_mij(
           case
             when (storage.foldername(name))[1] ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then ((storage.foldername(name))[1])::uuid
             else null::uuid
           end
         )
    )
  );
