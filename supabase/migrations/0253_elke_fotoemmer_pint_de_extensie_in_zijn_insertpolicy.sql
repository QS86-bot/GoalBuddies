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
-- 📏 Gemeten tegen de lokale stack uit alle 255 migratiebestanden — dat is de
-- stand vóór dit bestand; met 0253 erbij zijn het er 256:
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
-- ⚠️⚠️⚠️ **Hij pint de bestandsnaam. Hij sluit gééń enkele kruisrichting, en
--    die eerste versie van deze kop beweerde dat wél.** Dat is de fout die dit
--    issue kwam repareren, één laag hoger opnieuw gemaakt, en de securityronde op
--    deze branch heeft hem eruit gehaald. Hij staat hier uitgeschreven omdat hij
--    leerzamer is dan de reparatie.
--
--    **Waarom de pin geen richting sluit: bij een `copy` kiest de aanvaller de
--    doelnaam.** 📏 Gemeten in de SDK die in deze repo staat
--    (`@supabase/storage-js/dist/index.mjs:982-991`): `sourceKey` en
--    `destinationKey` zijn twee losse parameters. Wie een pdf van 4 MB uit
--    `chatdocs` in `chatfotos` wil hebben, noemt hem `onschuldig.jpg`.
--
--    📏 En zo gemeten, als `authenticated` met echte claims, ná deze migratie:
--
--      chatfotos    <groep>/<uid>/onschuldig.jpg            → DOORGELATEN
--      bewijsfotos  <weekdoel>/<uid>/onschuldig.jpg         → DOORGELATEN
--      avatars      <uid>/onschuldig.jpg                    → DOORGELATEN
--      chatdocs     <groep>/<uid>/eigenlijk-een-foto.pdf    → DOORGELATEN
--
--    Alle vier. Wat de pin dichtzet is de richting waarin de kopieerder zijn
--    bronextensie **behoudt**, en dat doet niemand.
--
-- ⚠️ **Wat deze migratie dan wél waard is, en waarom ze blijft.** Precies wat
--    0240 voor `chatdocs` deed en met dezelfde reden: *de vorm van de
--    bestandsnaam hoort in de policy en niet alleen in de padbouwer.* 📏 Daar was
--    de meting een lid dat `<groep>/<zelf>/evil.html` in de emmer plaatste. Die
--    klasse — een naam die niet bij de emmer past, hoe de rij er ook in komt —
--    is nu in alle vier de emmers een databaseeigenschap in plaats van een
--    clienteigenschap. Dat is een kleinere belofte dan "de copy-route is dicht",
--    en het is de belofte die waar is.
--
-- ⚠️⚠️ **De copy-route blijft dus open, en de zwaarste richting is niet de
--    richting die je zou verwachten.** `chatdocs` → een fotoemmer kruist zowel de
--    mime-allowlist als het plafond: 5242880 tegen 1048576 (`avatars` 2097152).
--    `bewijsfotos` → `chatfotos` is de ónschuldige — zelfde types, zelfde
--    plafond. Op databaseniveau is dit niet te sluiten: een INSERT-policy ziet
--    alleen de nieuwe rij en er bestaat geen kolom die de herkomst draagt. De
--    grendel zit aan de servicelaag (het `copy`-eindpunt) en staat als rij van
--    11-09 in `docs/ENGINEER-REVIEW.md`, op **Middel** en niet op Laag.
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
