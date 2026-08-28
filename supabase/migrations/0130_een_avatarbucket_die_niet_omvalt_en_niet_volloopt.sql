-- 0130_een_avatarbucket_die_niet_omvalt_en_niet_volloopt.sql — twee gaten in 0126
--
-- ROLLBACK-PAD:
--   drop trigger if exists avatars_aantal_begrensd on storage.objects;
--   drop function if exists public.bewaak_avatar_aantal();
--   En `avatars_select` terugzetten op de versie van 0126 (de kale cast).
--
-- ---------------------------------------------------------------------------
-- Gat 1 — één vreemde map legt het lezen van de hele bucket plat
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack: één object `avatars/tmp/upload.png` erin, en dan
--    als groepsgenoot een lijst opvragen:
--
--      ERROR: invalid input syntax for type uuid: "tmp"
--
-- `((storage.foldername(name))[1])::uuid` in `avatars_select` gooit op élke rij
-- waarvan het eerste segment geen uuid is, en een fout in een policy-expressie
-- sloopt de héle query — niet alleen die ene rij.
--
-- ⚠️ **`authenticated` kan zo'n object niet maken** (de insert-policy eist dat het
--    segment gelijk is aan `auth.uid()`), en de gerichte query die
--    `createSignedUrls` doet (`name = any(...)`) blijft ook werken. Wat het wél
--    raakt: `service_role`, een seed-script, en de Storage-browser van het
--    dashboard — die zet bij "nieuwe map" een `<map>/.emptyFolderPlaceholder`
--    neer. Eén klik daar en de bucket is in het dashboard niet meer te bekijken,
--    en een toekomstige opruimjob voor wezen — die `uploadAvatar` zelf
--    aankondigt — valt stil met een melding die niets uitlegt.
--
-- ⚠️ **Een `case` en geen `and` ervóór.** Postgres garandeert de volgorde van
--    `and` niet en mag de cast eerst uitvoeren; bij een `case`-expressie is de
--    volgorde wél gegarandeerd. `shares_group_with_user(null)` is `false` — de
--    functie is een `exists(...)` — dus een vreemde map levert netjes niets op in
--    plaats van een fout.
--
-- ---------------------------------------------------------------------------
-- Gat 2 — één gebruiker kan de opslag van iedereen vullen
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten: als `authenticated` 500 objecten in de eigen map ingevoegd, in één
--    statement, zonder enige weerstand. Geen trigger, geen quotum.
--
-- De gratis tier is **1 GB voor het hele project** en de bucket laat 2 MB per
-- bestand toe: 512 uploads en niemand kan er meer bij. Dat `uploadAvatar` de
-- vorige avatar opruimt, helpt niet — dat is applicatielogica, en wie dit doet
-- gebruikt de app niet maar praat rechtstreeks met de storage-API.
--
-- ⚠️ **Onwrikbare regel 5 noemt dit met naam** ("rate limiting op … dure
--    endpoints"), en er ligt een vorm klaar: `ai_dag_limiet()` (0056) en
--    `invite_events` doen hetzelfde voor de Doelcoach en voor uitnodigingen.
--
-- ⚠️ **Een trigger en geen policy.** De grens is "hoeveel staan er al", en dat is
--    een telling over dezelfde tabel. In een policy-expressie op `storage.objects`
--    zou een subquery op `storage.objects` de policy opnieuw aanroepen — Postgres
--    weigert dat met "infinite recursion detected in policy". Een trigger telt
--    gewoon.
--
-- ⚠️ **En hij is `security invoker`, met opzet.** De telling loopt onder de
--    SELECT-policy van de schrijver, en die geeft hem zijn eigen map volledig.
--    Een `security definer` zou hier alleen maar meer rechten uitdelen dan de
--    telling nodig heeft.
--
-- ⚠️ **Tien en niet één.** De app heeft er één nodig; de ruimte erboven is voor
--    wezen die ontstaan als het bijwerken van het profiel faalt nadat het bestand
--    er al staat (die volgorde staat in `uploadAvatar` en is bewust). Tien × 2 MB
--    is 20 MB per account — genoeg om niets te breken, te weinig om de tier mee
--    plat te leggen.
--
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select on storage.objects;

create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or shares_group_with_user(
           case
             when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
               then ((storage.foldername(name))[1])::uuid
           end
         )
    )
  );

-- ---------------------------------------------------------------------------

create or replace function public.bewaak_avatar_aantal()
returns trigger
language plpgsql
-- ⚠️ **`set search_path` hoort hier, ook al is dit geen `security definer`.**
--    `definer_bewaking()` (0106) meldt elke functie zonder, en dat is terecht:
--    zonder pin kiest de áánroeper welke tabellen deze functie leest, en een
--    triggerfunctie draait onder iedereen die schrijft. Gevonden doordat
--    `tests/rls/hulpfuncties.test.ts` rood ging op de eerste versie hiervan.
set search_path = public, pg_catalog
as $$
declare
  map    text := (storage.foldername(new.name))[1];
  aantal integer;
begin
  if new.bucket_id <> 'avatars' or map is null then
    return new;
  end if;

  select count(*) into aantal
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = map;

  -- ⚠️ Tien is de grens uit de kop hierboven. Eén is genoeg voor de app; de rest
  --    is ruimte voor wezen. Zie migratie 0130.
  if aantal >= 10 then
    raise exception 'Te veel avatars voor deze gebruiker (%).', aantal
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists avatars_aantal_begrensd on storage.objects;

create trigger avatars_aantal_begrensd
  before insert on storage.objects
  for each row
  execute function public.bewaak_avatar_aantal();

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — zie de
--    aantekening bij onwrikbare regel 4 in CLAUDE.md en migratie 0115. Een
--    triggerfunctie hoort door niemand rechtstreeks aanroepbaar te zijn.
revoke execute on function public.bewaak_avatar_aantal() from public, anon, authenticated;
