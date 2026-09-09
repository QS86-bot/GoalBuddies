-- 0224_een_pad_heeft_een_canonieke_vorm.sql — de policy, de CHECK en de teller
-- accepteren voortaan dezelfde vorm van een pad.
--
-- ROLLBACK-PAD:
--   De vier policies en de teller terug in de vorm van 0221 (dat bestand is het
--   rollback-pad: het is idempotent en zet alles opnieuw neer). ⚠️ Daarmee komt
--   ook de omzeiling hieronder terug.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Uit de securityronde op QS8-71, en het is een gat in de rem en niet in de
-- leesgrens.
--
-- 📏 **Het dagplafond was met hoofdletters te omzeilen.** De policy van 0221
--    accepteerde het eerste segment via `[0-9a-fA-F]` en castte het daarna naar
--    `uuid` — hoofdletterongevoelig. De teller vergelijkt `text` met `text` en is
--    dat níét. Elke hoofdletter-variant van hetzelfde uuid was dus een eigen
--    tellerpotje, en een uuid heeft er 2^32.
--
--    Gemeten op de lokale stack, met twintig objecten in kleine letters:
--
--      kleine letters, 21e:  geweigerd (23514)
--      HOOFDLETTERS:         ER DOORHEEN
--
--    Wat een aanvaller ermee kan is geen inzage — die grens is langs vier routes
--    nagemeten en houdt — maar wél de gratis tier vullen: 1 GB voor het hele
--    project, gedeeld met `avatars`, dus de profielfoto's gaan mee onderuit.
--    Onwrikbare regel 5 vraagt om een limiet die dat tegenhoudt, en die was er
--    dus niet.
--
-- ⚠️ **De reparatie zit in de policy en niet in de teller**, en dat is met opzet
--    de smalste van de twee. De CHECK van 0222 accepteert al uitsluitend kleine
--    letters — hij bouwt zijn patroon uit `group_id::text`, en Postgres schrijft
--    een uuid altijd in kleine letters. De policy was dus de enige van de drie
--    sloten die ruimer stond dan de rest. Zou je in plaats daarvan de teller op
--    de gecaste uuid laten tellen, dan moet de index mee en accepteert de bucket
--    nog steeds paden die nooit in een bericht kunnen belanden: onzichtbare
--    ballast die wél opslag kost.
--
-- ⚠️ **En het pad is voortaan precies twee mappen diep.** 0221 toetste alleen
--    segment 1 en 2, dus `<groep>/<eigen uid>/../<andere groep>/x.png` werd
--    aangenomen. Er lekt niets — zo'n object is niet aan een bericht te koppelen
--    en alleen leesbaar voor de eigen groep — maar het zet sleutels in de bucket
--    die niet de vorm hebben die 0222 en 0223 aannemen, en 0223 ruimt op segment
--    twee op.
--
-- ---------------------------------------------------------------------------

drop policy if exists chatfotos_select on storage.objects;

create policy chatfotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatfotos'
    and array_length(storage.foldername(name), 1) = 2
    and mag_groep_lezen(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
  );

drop policy if exists chatfotos_insert on storage.objects;

create policy chatfotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatfotos'
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'chatfotos'
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
