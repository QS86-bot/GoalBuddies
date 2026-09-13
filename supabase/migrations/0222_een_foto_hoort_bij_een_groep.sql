-- 0222_een_foto_hoort_bij_een_groep.sql — een privébucket voor chatfoto's, waarvan
-- het pad de groep draagt en niet de gebruiker.
--
-- ROLLBACK-PAD:
--   drop trigger if exists chatfotos_aantal_begrensd on storage.objects;
--   drop function if exists public.bewaak_chatfoto_aantal();
--   drop policy if exists chatfotos_select on storage.objects;
--   drop policy if exists chatfotos_insert on storage.objects;
--   drop policy if exists chatfotos_update on storage.objects;
--   drop policy if exists chatfotos_delete on storage.objects;
--   drop index if exists storage.objects_chatfotos_groep_dag_idx;
--   -- ⚠️ De regel hieronder alleen als de bucket leeg is. Staan er objecten in,
--   --    dan is dit dataverlies en geen rollback — zelfde waarschuwing als 0126.
--   delete from storage.buckets where id = 'chatfotos';
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `chat_messages` draagt sinds migratie 0001 een CHECK die vier soorten bericht
-- toestaat — tekst, foto, document en systeem — plus een kolom `attachment_url`.
-- 📏 Er is nooit één schrijver van de fotosoort geweest: de kolom staat sinds
-- 0059 in de INSERT-kolomgrant
--
-- ⚠️ **De soorten staan hier met opzet uitgeschreven en niet als gequote lijst.**
--    `keten:controle` telt een waarde als *geschreven* zodra hij ergens gequote
--    in de migratiemap of de app staat, en een CHECK-regel strip't hij weg — een
--    commentaarregel niet. 📏 Deze kop noemde eerst de hele lijst letterlijk, en
--    daarmee gold de documentsoort ineens als geschreven terwijl er geen enkele
--    schrijver van is. Derde keer in dit project dat commentaar een teller
--    voedde.
-- van `authenticated`, en `scripts/kolomrechten-controle.mjs` draagt er een
-- expliciete uitzondering voor met de reden *"de kolom bestaat vooruit op
-- bijlagen in de chat; er is nog geen scherm dat er een zet."*
--
-- Dat is de vorm van onwrikbare regel 18 vraag 5: elk schakeltje af, de keten
-- nergens verbonden. Deze migratie legt de opslagkant neer.
--
-- ---------------------------------------------------------------------------
-- 1. De bucket
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Privé, en `storage:controle` wordt rood op `public = true`.** Een
--    openbare bucket omzeilt élke policy hieronder met één woord.
--
-- ⚠️ **1 MB en niet de 2 MB van `avatars`, en dat is een meting en geen smaak.**
--    Een avatar schaalt met het aantal accounts; een chatfoto schaalt met
--    gesprekken. Twaalf leden maal een actieve week is een orde van grootte
--    meer. De gratis tier geeft 1 GB voor het hele project, gedeeld met
--    `avatars`.
--
-- ⚠️ **Geen `image/svg+xml`, en dat is de enige echte reden dat deze lijst smal
--    is.** `allowed_mime_types` toetst de gedeclareerde header en niet de bytes,
--    dus een willekeurig bestand met `content-type: image/png` landt in de
--    bucket. Dat is geen lek: het wordt uitgeleverd vanaf een andere origin, met
--    de opgeslagen content-type, en beland in een `<Image>` — willekeurige bytes
--    renderen niet en voeren niets uit. Een SVG is de uitzondering, want dat is
--    renderbare HTML met script erin.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chatfotos',
  'chatfotos',
  false,
  -- TODO(paid-tier): 1 MB is krap voor een moderne telefoonfoto. Op een betaalde
  -- tier mag dit omhoog; op de gratis tier is 1 GB het plafond voor álles samen.
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. De vier policies
-- ---------------------------------------------------------------------------
--
-- **Padvorm: `<group_id>/<sender_id>/<naam>.<ext>`** — twee segmenten die elk
-- een grens dragen.
--
-- ⚠️⚠️ **Het eerste segment is de groep en niet de gebruiker, en dat is een
--    afwijking van `avatars` met een reden.** `avatars` is `<user_id>/…` en leest
--    op `shares_group_with_user()`. Die vorm hier kopiëren zou een lek zijn: wie
--    één groep met je deelt, zou dan de foto lezen die je in een *ándere* groep
--    plaatste. Dat is oppervlak 24 uit beslisdocument 002 in een nieuwe
--    verpakking.
--
-- ⚠️ **Niet aan `owner` hangen.** Die kolom wordt door de storage-dienst gezet en
--    is bij een `service_role`-upload de dienst zelf. Het pad is de enige
--    eigenschap die de client niet kan vervalsen zonder op de `with check` af te
--    vallen.
--
-- ⚠️⚠️ **`mag_groep_lezen()` voor SELECT en `is_group_member()` voor de rest, en
--    dat is geen smaak maar een grendel.** `archiefleesgat()` (migratie 0153)
--    scant `pg_policies` in `schemaname in ('public', 'storage')` en wordt rood
--    bij een leespolicy langs `is_group_member()` én bij een schrijvende policy
--    langs `mag_groep_lezen()`. Een gearchiveerde groep hoort leesbaar te zijn en
--    niet beschrijfbaar.
--
-- ⚠️⚠️ **De uuid-cast staat in een `case` en niet achter een `and`.** Postgres
--    garandeert de volgorde van `and` niet en mag de cast eerst uitvoeren; één
--    object met een niet-uuid segment sloopt dan de héle lijstquery en niet
--    alleen die rij. Dat is gat 1 van migratie 0130, daar gemeten, en het
--    ontstaat hier op dezelfde manier: één klik op "nieuwe map" in de
--    Storage-browser zet een `.emptyFolderPlaceholder` neer. **Beide segmenten**
--    vragen die behandeling, want het zijn er hier twee.

drop policy if exists chatfotos_select on storage.objects;

create policy chatfotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatfotos'
    and mag_groep_lezen(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  );

drop policy if exists chatfotos_insert on storage.objects;

create policy chatfotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatfotos'
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists chatfotos_update on storage.objects;

create policy chatfotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chatfotos'
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'chatfotos'
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists chatfotos_delete on storage.objects;

create policy chatfotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatfotos'
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- 3. Een dagplafond per groep
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een trigger en geen policy.** Een subquery op `storage.objects` in een
--    policy óp `storage.objects` geeft "infinite recursion detected in policy".
--    Gemeten in migratie 0130.
--
-- ⚠️ **Per groep en per etmaal, waar `avatars` per gebruiker en zonder venster
--    telt.** Een avatar is er één; een groep praat door. Zonder venster zou een
--    actieve groep na een jaar tegen zijn eigen plafond lopen voor foto's die
--    niemand meer opvraagt.
--
-- ⚠️ **`security invoker`**: de telling loopt onder de SELECT-policy van de
--    schrijver, die hem precies zijn eigen groep geeft. Een definer zou meer
--    recht uitdelen dan de telling nodig heeft.

create or replace function public.bewaak_chatfoto_aantal()
returns trigger
language plpgsql
-- ⚠️ `set search_path` hoort hier ook al is dit geen definer — `definer_bewaking()`
--    (0106) meldt elke functie zonder, en terecht: zonder pin kiest de aanroeper
--    welke tabellen deze functie leest, en een triggerfunctie draait onder
--    iedereen die schrijft.
-- ⚠️ **`pg_temp` staat er expliciet achteraan, en dat is geen opsmuk.** Pin je
--    hem niet, dan doorzoekt Postgres het tijdelijke schema als **eerste** — en
--    dan kiest de aanroeper welke `chat_messages` of `storage.objects` deze
--    functie leest. `zoekpadschaduw.test.ts` wordt daar rood op, en terecht.
set search_path = public, pg_catalog, pg_temp
as $$
declare
  groep  text := (storage.foldername(new.name))[1];
  aantal integer;
begin
  if new.bucket_id <> 'chatfotos' or groep is null then
    return new;
  end if;

  select count(*) into aantal
  from storage.objects o
  where o.bucket_id = 'chatfotos'
    and (storage.foldername(o.name))[1] = groep
    and o.created_at > now() - interval '1 day';

  -- TODO(paid-tier): twintig per groep per etmaal is een rem tegen het vollopen
  -- van de gratis tier en geen productkeuze. Op een betaalde tier mag dit omhoog.
  if aantal >= 20 then
    -- ⚠️ Geen groepsnaam en geen gebruikerstekst in de melding: een foutmelding
    --    reist naar plekken waar de autorisatie niet meereist.
    raise exception 'Te veel foto''s in deze groep vandaag (%).', aantal
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists chatfotos_aantal_begrensd on storage.objects;

create trigger chatfotos_aantal_begrensd
  before insert on storage.objects
  for each row
  execute function public.bewaak_chatfoto_aantal();

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — zie
--    onwrikbare regel 4 en migratie 0115. Een triggerfunctie hoort door niemand
--    rechtstreeks aanroepbaar te zijn.
revoke execute on function public.bewaak_chatfoto_aantal() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. De index die de teller draagt
-- ---------------------------------------------------------------------------
--
-- ⚠️ De telling hierboven filtert op een **functionele expressie**
--    (`storage.foldername(name)`), dus zonder index is elke upload een scan over
--    de hele objecttabel. Migratie 0130 kwam daarmee weg omdat `avatars` klein is
--    en per gebruiker telt; deze teller draait op het schrijfpad van élke
--    chatfoto. Dit is het onderdeel dat niet schaalt als je het overslaat.
--
-- ⚠️ Partieel, zodat `avatars` en latere buckets hem niet dragen.

-- ⚠️⚠️ **Voorwaardelijk, en dat is geen slordigheid maar QS8-439.**
--    `storage.objects` is eigendom van `supabase_storage_admin`. Alles wat dit
--    project heeft — de Supabase-MCP, `psql` met de projectcredentials én de
--    SQL-editor in het dashboard — draait als `postgres`, en die is géén lid van
--    die rol. `grant supabase_storage_admin to postgres` antwoordt bovendien met
--    *"role memberships are reserved, only superusers can grant them"*.
--
-- 📏 **Per handeling apart gemeten op 12-09-2026**, elk in een eigen
--    terugrollende transactie: `create policy` gaat, `create trigger` gaat,
--    `create index` geeft `42501: must be owner of table objects`. Eén kale
--    `create index` stopt daarmee de hele migratiereeks — zo stond productie
--    vanaf `0222` drie dagen stil.
--
-- ⚠️ **Lokaal bezitten we de tabel wél**, dus daar wordt de index gewoon
--    aangelegd en houden `schema-opbouwen.sh` en de RLS-suite het volledige
--    schema. Op Supabase slaat hij hem hóórbaar over. Dit is de enige vorm
--    waarin dat verschil in de migratie zelf staat in plaats van in een
--    overgeslagen stap. Afweging in `docs/decisions/2026-09-12-een-index-op-een-tabel-die-niet-van-ons-is.md`.
do $$
begin
  create index if not exists objects_chatfotos_groep_dag_idx
    on storage.objects (((storage.foldername(name))[1]), created_at)
    where bucket_id = 'chatfotos';
exception when insufficient_privilege then
  raise notice 'QS8-439: objects_chatfotos_groep_dag_idx overgeslagen (42501) — geen eigenaar van storage.objects.';
end $$;
