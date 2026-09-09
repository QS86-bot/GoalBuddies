-- 0227_een_bewijsfoto_hoort_bij_een_weekdoel.sql — een eigen bucket voor bewijs
-- bij een voltooiing, gesleuteld op het weekdoel en niet op een groep.
--
-- ROLLBACK-PAD:
--   drop policy if exists bewijsfotos_select on storage.objects;
--   drop policy if exists bewijsfotos_insert on storage.objects;
--   drop policy if exists bewijsfotos_update on storage.objects;
--   drop policy if exists bewijsfotos_delete on storage.objects;
--   drop function if exists public.mag_bewijsfoto_lezen(text);
--   drop function if exists public.mag_weekdoel_van_mij(uuid);
--   drop index if exists public.completions_attachment_url_idx;
--   delete from storage.buckets where id = 'bewijsfotos';
--
--   ⚠️ Die laatste regel alleen als de bucket **leeg** is. Een bucket met
--      objecten weggooien is dataverlies en geen terugdraaien — zelfde
--      waarschuwing als bij 0126 en 0222.
--
-- ---------------------------------------------------------------------------
-- 1. Waarom een eigen bucket, en niet `chatfotos`
-- ---------------------------------------------------------------------------
--
-- `chatfotos` (0222) is `<group_id>/<sender_id>/<naam>` en leest op
-- `mag_groep_lezen(segment 1)`. Een chatbericht hangt aan precies één groep;
-- een voltooiing hangt aan een weekdoel, dat aan een doel hangt, dat aan **nul
-- of meer** groepen hangt. Die vorm hier hergebruiken breekt op drie plaatsen,
-- en ze zijn geen van drieën theoretisch:
--
--   1. **Nul groepen.** Een solo-doel heeft geen `group_id`. Er is dan geen
--      sleutel — dus of de solo-gebruiker kan geen bewijs plaatsen, of er komt
--      een sentinelwaarde in het pad. Een sentinel in een autorisatiesleutel is
--      een tak die maar in één modus bestaat, en dat is precies de vorm die dit
--      project al twee keer een lek heeft opgeleverd.
--
--   2. **Twee groepen.** Je zou er één moeten kiezen bij het uploaden.
--      `completions_select` kent geen groepsvoorkeur, dus een beoordelaar uit de
--      ándere gekoppelde groep leest de voltooiing wél en de foto **niet**: hij
--      krijgt bewijs voorgeschoteld dat hij niet kan inzien. De reparatie
--      daarvoor zou een `or` over alle gekoppelde groepen zijn — zie punt 1.
--
--   3. **De koppeling beweegt en het pad niet.** Het pad ligt vast op het
--      uploadmoment; `goal_group_links` niet. Koppel het doel morgen aan een
--      derde groep en het publiek van de rij groeit terwijl dat van het object
--      blijft staan. Twee autorisaties die over tijd uit elkaar lopen, zonder
--      dat iets rood wordt.
--
-- ⚠️ **En de avatar-vorm `<user_id>/<naam>` (0126) is hier een écht lek**, niet
--    alleen een mismatch. Die leest op `shares_group_with_user()`, dus iedereen
--    die één groep met je deelt zou élke bewijsfoto van je lezen — ook die van
--    een doel dat aan géén groep hangt en dat dus voor niemand zichtbaar is.
--    Dat is oppervlak 24 uit dossier 002 in een derde verpakking, en het is
--    strenger dan de Carol-meting van 0222.
--
-- ---------------------------------------------------------------------------
-- 2. De padvorm: `<weekly_goal_id>/<owner_id>/<naam>.<ext>`
-- ---------------------------------------------------------------------------
--
-- Segment 1 draagt de leesgrens, segment 2 de schrijfgrens én de sleutel waarop
-- een accountverwijdering kan opruimen — dezelfde rolverdeling als 0222.
--
-- Het weekdoel is de fijnste sleutel die op het uploadmoment al bestáát: de
-- `completion_id` bestaat dan nog niet, en de client mag `completions.id` niet
-- zetten (0147 haalde die uit de grant). Bovendien zijn `weekly_goal_id` en
-- `user_id` allebei `not null` kolommen van `completions`, dus 0229 kan de
-- kolomgrens als **CHECK** schrijven en niet als trigger. Elke andere
-- sleuteldimensie (het doel, een groep) vraagt een subquery en dus een trigger,
-- en dat is één slot minder.
--
-- ---------------------------------------------------------------------------
-- 3. ⚠️⚠️ DE POLICY KOPIEERT HET PREDICAAT NIET — HIJ STELT DE VRAAG
-- ---------------------------------------------------------------------------
--
-- **Dit is de val in deze migratie, en ik ben er zelf in gelopen.** De eerste
-- versie had twee `security definer` hulpfuncties die het predicaat van
-- `completions_select` overschreven:
--
--     owner_id = auth.uid() or shares_group_with_goal(g.id)
--
-- Dat lijkt een getrouwe kopie. Het is er geen, en het verschil is een lek.
--
-- 📏 Gemeten op de lokale stack. Beschermde groep, doel eraan gekoppeld, Bob is
--    actief lid, en het weekdoel staat op `missed`:
--
--      shares_group_with_goal(doel)  = true
--      Bob ziet het weekdoel         = 0
--      Bob ziet de voltooiing        = 0
--      Bob ziet het OBJECT           = 1     ← het lek
--
-- ⚠️⚠️ **`completions_select` erft het statusfilter van `weekly_goals_select`,
--    en dat staat nergens in zijn eigen tekst.** Zijn `exists` leest
--    `weekly_goals`, en **RLS geldt óók binnen een policy-subquery**. Staat het
--    weekdoel op `missed`, `carried`, `cancelled` of `excused`, dan is de rij
--    onzichtbaar voor een groepsgenoot — zonder dat `completions_select` het
--    woord `status` bevat.
--
--    Een `security definer` hulpfunctie omzeilt precies die overerving. Het
--    onderdeel klopte (het predicaat was letterlijk overgeschreven) en het
--    geheel lekte: de beoordelaar kreeg de bewijsfoto van een gemiste week die
--    hij niet mag zien — en een gemiste week is precies wat domeinregel 7
--    beschermt.
--
-- ⚠️ **De reparatie is niet "het filter erbij kopiëren".** Dan staat er een
--    tweede kopie die opnieuw kan verlopen — en dat is de vorm die onwrikbare
--    regel 18 zeven keer heeft zien mislukken. De policy stelt nu de **vraag**
--    in plaats van hem na te bouwen:
--
--        exists (select 1 from completions c where c.attachment_url = name)
--
--    `mag_bewijsfoto_lezen()` is daarom nadrukkelijk **`security invoker`**, en
--    dat is de hele grendel: de RLS van `completions` beslist, inclusief alles
--    wat die transitief erft. Verandert `completions_select` ooit, dan beweegt
--    dit oppervlak vanzelf mee. Er is niets meer om uit de pas te laten lopen.
--
-- ⚠️ Er hoort een index onder die lookup: hij draait op het leespad van élke
--    ondertekening. Zie onderaan.
--
-- ---------------------------------------------------------------------------
-- 4. De tak voor de eigenaar, en waarom die geen `or`-gat is
-- ---------------------------------------------------------------------------
--
-- Tussen de upload en de insert bestaat de voltooiing nog niet — `rondAf()`
-- uploadt eerst, want `attachment_url` is alleen bij INSERT te zetten (0229 §2).
-- In dat venster zou de eigenaar zijn eigen net geplaatste bestand niet mogen
-- lezen, en de compenserende opruiming na een mislukte insert zou ook niet
-- kunnen.
--
-- Vandaar `(storage.foldername(name))[2] = auth.uid()`: je mag lezen wat je zelf
-- geplaatst hebt. ⚠️ Dat is géén verruiming, en dat is te bewijzen: de
-- insertpolicy hieronder laat je uitsluitend in je eigen map schrijven **en**
-- alleen onder een weekdoel dat van jou is. Deze tak kan dus per constructie
-- alleen objecten raken die je zelf mocht aanmaken.
--
-- ---------------------------------------------------------------------------
-- 5. De schrijfkant is een ander predicaat dan de leeskant
-- ---------------------------------------------------------------------------
--
-- Een groepsgenoot mag het bewijs zien; alleen de eigenaar mag het plaatsen.
-- Twee functies dus, en niet één met een vlag — zelfde reden dat 0153
-- `mag_groep_lezen()` naast `is_group_member()` zette.
--
-- ⚠️ `mag_weekdoel_van_mij()` is óók `security invoker`. De eigenaarstak van
--    `weekly_goals_select` draagt geen statusfilter, dus de eigenaar leest zijn
--    eigen weekdoel in elke status — en dat is precies wat hier nodig is.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bewijsfotos',
  'bewijsfotos',
  false,
  -- TODO(paid-tier): 1 MB is een rem tegen het vollopen van de gratis tier
  -- (1 GB voor het hele project, gedeeld met `avatars` en `chatfotos`) en geen
  -- productkeuze.
  1048576,
  -- ⚠️ Geen SVG. Een SVG is renderbare HTML met script erin; de andere drie
  --    renderen als beeld of helemaal niet. Zelfde lijst als `avatars` en
  --    `chatfotos`, en de extensie staat bovendien in de CHECK van 0229: twee
  --    onafhankelijke sloten op hetzelfde.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------

create or replace function public.mag_bewijsfoto_lezen(pad text)
returns boolean
language sql
stable
-- ⚠️⚠️ **GEEN `security definer`, en dat is de grendel en niet een omissie.**
--    Deze functie stelt de vraag aan `completions`, en het antwoord moet komen
--    van de RLS van die tabel — inclusief het statusfilter dat `completions_select`
--    transitief erft van `weekly_goals_select`. Met `definer` valt die overerving
--    weg en lekt dit oppervlak een gemiste week. Zie §3; de meting staat daar.
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from completions c where c.attachment_url = pad
  );
$$;

create or replace function public.mag_weekdoel_van_mij(w uuid)
returns boolean
language sql
stable
-- ⚠️ Ook invoker. De eigenaarstak van `weekly_goals_select` heeft geen
--    statusfilter, dus dit klopt in elke status van het weekdoel.
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from weekly_goals wg
    join goals g on g.id = wg.goal_id
    where wg.id = w
      and g.owner_id = (select auth.uid())
  );
$$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — onwrikbare
--    regel 4 en migratie 0115. `alter default privileges` deelt élke nieuwe
--    functie in `public` uit aan alle drie de rollen, en `authenticated` is
--    precies de rol waaronder iedere ingelogde gebruiker draait. Daarna
--    expliciet granten, zodat het recht besloten is en niet geërfd —
--    `functiegrants.test.ts` legt dat naast elkaar.
revoke execute on function public.mag_bewijsfoto_lezen(text) from public, anon, authenticated;
revoke execute on function public.mag_weekdoel_van_mij(uuid) from public, anon, authenticated;
grant  execute on function public.mag_bewijsfoto_lezen(text) to authenticated;
grant  execute on function public.mag_weekdoel_van_mij(uuid) to authenticated;

-- ⚠️ De lookup van `mag_bewijsfoto_lezen()` draait op het leespad van élke
--    ondertekening. Zonder index is dat een scan over `completions`.
--    Onwrikbare regel 11. Partieel, want alleen rijen mét bijlage doen mee.
create index if not exists completions_attachment_url_idx
  on public.completions (attachment_url)
  where attachment_url is not null;

-- ---------------------------------------------------------------------------
-- De vier policies
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De uuid-cast zit in een `case` en niet achter een `and`.** Postgres
--    garandeert de volgorde van `and` niet en mag de cast eerst uitvoeren; één
--    object met een niet-uuid eerste segment sloopt dan de héle lijstquery en
--    niet alleen die rij. Gemeten als gat 1 van 0130, en het is geen theorie:
--    één klik op "nieuwe map" in de Storage-browser zet een
--    `.emptyFolderPlaceholder` neer.
--
-- ⚠️ **`[0-9a-f]` en niet `[0-9a-fA-F]`, en precies twee mappen diep.** Dat is
--    de reparatie van 0225 vooruit toegepast in plaats van er opnieuw in te
--    trappen: de uuid-cast is hoofdletterongevoelig, de teller van 0228
--    vergelijkt `text` met `text` en is dat niet, en de CHECK van 0229 bouwt
--    zijn patroon uit `weekly_goal_id::text` — Postgres schrijft een uuid altijd
--    in kleine letters. Drie sloten op dezelfde vorm.
--
-- ⚠️ **Niet aan `owner` hangen.** Die kolom wordt door de storage-dienst gezet
--    en is bij een `service_role`-upload de dienst zelf. Het pad is de enige
--    eigenschap die de client niet kan vervalsen zonder op de `with check` te
--    vallen.

drop policy if exists bewijsfotos_select on storage.objects;

create policy bewijsfotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bewijsfotos'
    and array_length(storage.foldername(name), 1) = 2
    and (
      -- Je eigen bewijs, ook in het venster tussen de upload en de insert (§4).
      (storage.foldername(name))[2] = (select auth.uid())::text
      -- Of: je mag de voltooiing lezen waar dit pad aan hangt. De RLS van
      -- `completions` beslist — zie §3.
      or mag_bewijsfoto_lezen(name)
    )
  );

drop policy if exists bewijsfotos_insert on storage.objects;

create policy bewijsfotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bewijsfotos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and mag_weekdoel_van_mij(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  );

drop policy if exists bewijsfotos_update on storage.objects;

create policy bewijsfotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bewijsfotos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and mag_weekdoel_van_mij(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  )
  with check (
    bucket_id = 'bewijsfotos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and mag_weekdoel_van_mij(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  );

drop policy if exists bewijsfotos_delete on storage.objects;

-- ⚠️ De eigenaar mag zijn eigen bewijsfoto weghalen, ook nadat de voltooiing
--    bestaat. Dat is de compenserende handeling na een mislukte insert
--    (`rondAf()` ruimt op als de rij niet landt), en zonder die policy laat elke
--    mislukking een wees achter.
--
--    Het is géén route naar geschiedenisvervalsing: de voltooiing is
--    append-only (domeinregel 6) en blijft staan met een pad dat daarna niet
--    meer te ondertekenen is — het scherm maakt daar "niet meer beschikbaar"
--    van. De rij vertelt dus nog steeds dat er bewijs geleverd is.
create policy bewijsfotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bewijsfotos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and mag_weekdoel_van_mij(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  );
