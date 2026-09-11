-- 0253_elke_fotoemmer_pint_de_extensie_in_zijn_insertpolicy.sql — `copy` is een INSERT, en de INSERT-policy van de doelemmer is de enige poort die hij passeert
--
-- ROLLBACK-PAD:
--   De drie policies terugzetten zoals ze vóór deze migratie stonden — dat is de
--   vorm uit 0225 (chatfotos), 0227 (bewijsfotos) en 0126 (avatars), zonder de
--   `name ~ …`-regel aan het eind:
--
--     drop policy if exists chatfotos_insert on storage.objects;
--     create policy chatfotos_insert on storage.objects
--       for insert to authenticated
--       with check (
--         bucket_id = 'chatfotos'
--         and array_length(storage.foldername(name), 1) = 2
--         and is_group_member(
--               case
--                 when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--                   then ((storage.foldername(name))[1])::uuid
--               end
--             )
--         and (storage.foldername(name))[2] = (select auth.uid())::text
--       );
--
--     drop policy if exists bewijsfotos_insert on storage.objects;
--     create policy bewijsfotos_insert on storage.objects
--       for insert to authenticated
--       with check (
--         bucket_id = 'bewijsfotos'
--         and array_length(storage.foldername(name), 1) = 2
--         and (storage.foldername(name))[2] = (select auth.uid())::text
--         and mag_weekdoel_van_mij(
--               case
--                 when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--                   then ((storage.foldername(name))[1])::uuid
--               end
--             )
--       );
--
--     drop policy if exists avatars_insert on storage.objects;
--     create policy avatars_insert on storage.objects
--       for insert to authenticated
--       with check (
--         bucket_id = 'avatars'
--         and (storage.foldername(name))[1] = (select auth.uid())::text
--       );
--
-- ⚠️ **Dit is DDL op `storage.objects`, en die tabel is van
--    `supabase_storage_admin`.** Een bouwsessie krijgt hier `42501: must be owner
--    of table objects`; lokaal gaat het wél, want daar is `postgres` de eigenaar.
--    Toepassen op productie hoort dus van Quintens machine te komen — zie
--    `docs/DEPLOY.md` §2.2 en §2.6b. Dit bestand sluit aan op de reeks die daar
--    al op wacht.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-416, gevonden in de wekelijkse audit van 10-09-2026 en daarna nagemeten.
--
-- 0239 trok elk UPDATE-pad op `storage.objects` in en schreef erbij dat daarmee
-- óók het move/copy-eindpunt van de Storage-API dicht was. Die tweede helft
-- klopt niet, en dezelfde zin stond in 0235, in 0240 en in twee dossierrijen.
--
-- 📏 Gemeten tegen de lokale stack uit alle 255 migratiebestanden:
--
--     select polcmd::text, count(*) from pg_policy pol
--       join pg_class c on c.oid = pol.polrelid
--       join pg_namespace n on n.oid = c.relnamespace
--      where n.nspname = 'storage' and c.relname = 'objects' group by 1;
--     → a|4   d|4   r|4        (géén 'w', géén '*')
--
-- **`move` is een UPDATE en is dus dicht. `copy` schrijft een nieuwe rij** — een
-- INSERT — en die raakt de drop van 0239 niet. De enige poort die een `copy`
-- passeert is de INSERT-policy van de **doelemmer**, en drie van de vier
-- toetsten alleen de map en de eigenaar, niet de naam.
--
-- 📏 En de route bestaat in de SDK die in deze repo staat:
--
--     node_modules/@supabase/storage-js  → 2.112.3
--     dist/index.d.mts:1149  copy(fromPath, toPath, options?: DestinationOptions)
--     dist/index.d.mts:279   interface DestinationOptions { destinationBucket?: string }
--
-- ⚠️ **Waarom het verweer in 0239 niet dekt.** Dat onderbouwde de drop met "nul
--    treffers op `.move(` of `.copy(` in `src/` en `app/`". Dat bewijst dat
--    **wij** het recht niet nodig hebben, niet dat de **route** dicht is: een
--    client praat rechtstreeks met de Storage-API en onze eigen call sites zeggen
--    daar niets over. Zelfde vorm als "de schermen hielden de regel aan terwijl
--    de database hem lekte".
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie wél en niet sluit
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Hij sluit de kruisrichtingen en niet de bytes, en dat verschil hoort
--    hier te staan** — anders draagt dit bestand precies de te ruime belofte die
--    het komt repareren.
--
--    Dicht:   een `.pdf`-naam in een fotoemmer, en een beeldnaam in `chatdocs`
--             (die laatste stond al sinds 0240).
--    Open:    een `copy` van `bewijsfotos` naar `chatfotos`. Beide emmers dragen
--             `{image/jpeg, image/png, image/webp}`, dus een `.jpg` is daar aan
--             weerszijden een geldige naam.
--
--    Dat laatste is **geen rechtenverhoging**: wie de bron mag lezen, mag die
--    bytes al hebben en had ze ook kunnen downloaden en opnieuw uploaden —
--    dezelfde klasse als een schermafdruk. Wat er wel aan verandert is dat het
--    in één hop gaat en dat `keurChatfoto()` daarbij nooit gedraaid heeft. De
--    grendel daarvoor is niet een policy op de naam maar de herkomst, en die
--    hoort niet in deze migratie: zie de dossierrij van 11-09 in
--    `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ **De vorm is die van `chatdocs_insert` uit 0240 en niet een nieuwe.** Daar
--    staat `name ~ '/[A-Za-z0-9._-]{1,80}\.pdf$'` — niet aan het begin
--    geankerd, wél aan het eind. De diepte van het pad wordt hierboven al gepind
--    door `array_length(storage.foldername(name), 1) = 2`; deze regel pint de
--    náám. Eén conventie voor alle vier de emmers is hier meer waard dan een
--    strakkere regex per emmer.
--
-- ⚠️ **Alleen op het INSERT-pad.** Op `delete` zou dezelfde regel een object dat
--    er om wat voor reden dan ook al staat onverwijderbaar maken — een grendel
--    die de opruiming tegenhoudt in plaats van de plaatsing. Dezelfde afweging
--    staat met zoveel woorden in 0240.
--
-- ⚠️ **`avatars` houdt zijn diepte ongepind, en dat is een keuze.** Die policy
--    toetst `(storage.foldername(name))[1] = auth.uid()` zonder
--    `array_length(...) = 1`, dus `<uid>/a/b.jpg` mag. Dat is geen gat — het
--    blijft de eigen map van de uploader — en het pinnen ervan is een eigen
--    besluit met zijn eigen regressierisico op bestaande objecten. Deze migratie
--    raakt het niet aan.
--
-- 📏 **Breekt dit een bestaande upload?** Nee, gemeten aan de drie padbouwers:
--    `avatarPad()`, `chatfotoPad()` en `bewijsfotoPad()` zetten alle drie
--    `<base36-tijd>-<random>.<ext>` neer met `ext` uit
--    `{'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}`. Die naam
--    valt binnen `[A-Za-z0-9._-]{1,80}` en eindigt op een extensie uit de lijst.
--
-- ---------------------------------------------------------------------------
-- 1. chatfotos_insert — de naam erbij
-- ---------------------------------------------------------------------------

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
    and name ~ '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'
  );

-- ---------------------------------------------------------------------------
-- 2. bewijsfotos_insert — idem
-- ---------------------------------------------------------------------------
--
-- ⚠️ De CHECK van 0229 op `completions.proof_url` draagt dezelfde extensielijst.
--    Dat is met opzet twee sloten op hetzelfde: die CHECK bewaakt waar een
--    voltooiing naar mag wíjzen, deze policy wat er in de emmer mag stáán. Een
--    object zonder verwijzing was tot vandaag door geen van beide geraakt.

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
    and name ~ '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'
  );

-- ---------------------------------------------------------------------------
-- 3. avatars_insert — idem
-- ---------------------------------------------------------------------------

drop policy if exists avatars_insert on storage.objects;

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'
  );
