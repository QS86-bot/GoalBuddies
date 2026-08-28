-- 0124_avatars_in_een_eigen_emmer.sql — de eerste bucket van dit project
--
-- ROLLBACK-PAD:
--   drop policy if exists avatars_insert on storage.objects;
--   drop policy if exists avatars_update on storage.objects;
--   drop policy if exists avatars_delete on storage.objects;
--   drop policy if exists avatars_select on storage.objects;
--   delete from storage.buckets where id = 'avatars';
--   ⚠️ Die laatste regel werkt alleen als de bucket leeg is. Staat er al een
--      avatar in, dan is dit geen rollback maar dataverlies — leeg hem dan eerst
--      bewust, of laat de bucket staan.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `profiles.avatar_url` bestaat sinds het begin en is altijd leeg gebleven: er
-- was geen bucket en geen uploadpad. 📏 Gemeten op 28-08-2026: nul `.storage`-
-- aanroepen in `src/` en `app/`. Niets was stuk — `Avatar` valt terug op
-- initialen — maar de kolom was dood hout, dezelfde vorm als `profiles.locale`
-- vóór QS8-115 (CLAUDE.md regel 18, vraag 5).
--
-- ---------------------------------------------------------------------------
-- Privé, en dat is geen voorzichtigheid maar een bestaand besluit
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`public = true` was de voor de hand liggende keuze en die is hier al
--    afgewezen.** `scripts/storage-controle.mjs` wordt rood op élke openbare
--    bucket, met de reden erbij: een openbare bucket omzeilt RLS volledig, en
--    dat is één woord in een insert. Wie de bucket openbaar maakt, ruilt de
--    policies hieronder in voor "de URL is onraadbaar".
--
-- ⚠️ **Dat kost wat, en dat hoort erbij te staan.** Een privébucket betekent dat
--    elke weergave een signed URL nodig heeft. In een lijst — de chat, het
--    groepsoverzicht, de wachtrij — is dat een N+1 als je per avatar tekent.
--    Daarom tekent de datalaag ze in één keer (`createSignedUrls`, meervoud) en
--    staat dat als eis in `docs/DEPLOY.md`. Schaalbaarheidsregel 12 is hier geen
--    theorie: het groepsoverzicht is de plek die het beslisdocument met naam
--    noemt.
--
-- ---------------------------------------------------------------------------
-- De vier policies, en waarom het pad de eigenaar draagt
-- ---------------------------------------------------------------------------
--
-- Een object heet `<user_id>/<willekeurig>.<ext>`. Het eerste padsegment ís de
-- eigenaar, en dáár hangen de schrijfpolicies aan — niet aan `owner`, de kolom
-- die Supabase zelf vult.
--
-- ⚠️ **Waarom niet aan `owner`.** Die kolom wordt gezet door de storage-API en
--    is bij een `service_role`-upload de dienst zelf. Het pad is de enige
--    eigenschap die de cliënt niet kan vervalsen zonder de policy te breken:
--    schrijven naar `<iemand anders>/…` valt af op de `WITH CHECK`. Dat is
--    dezelfde redenering als bij `completion_approvals.subject_id` — de grens
--    hangt aan iets dat de schrijver niet zelf kiest.
--
-- ⚠️ **Lezen is ruimer dan schrijven, en precies zo ruim als de app.** Je eigen
--    avatar altijd; die van een ander alleen als je een groep met hem deelt.
--    `shares_group_with_user()` bestaat al (SECURITY DEFINER, STABLE) en wordt
--    elders voor dezelfde vraag gebruikt — een tweede versie ernaast zou twee
--    antwoorden op één vraag zijn.
--
-- ⚠️ **Geen domeinregel 7 hier.** Een avatar is geen afgeleide van een gemiste
--    week. De vraag uit CLAUDE.md ("kan hieruit iemands gemiste week worden
--    afgeleid") is met nee te beantwoorden, en dat is de reden dat lezen op
--    groepslidmaatschap mag staan en niet strenger hoeft.
--
-- ---------------------------------------------------------------------------
-- De grenzen staan op de bucket en niet alleen in het formulier
-- ---------------------------------------------------------------------------
--
-- Onwrikbare regel 3: input wordt servergevalideerd. Een client-side check op
-- bestandsgrootte is een gemak voor de gebruiker; de bucket is de grendel.
-- 2 MB en drie beeldtypes — genoeg voor een avatar, en klein genoeg dat de
-- gratis tier (1 GB) niet het probleem wordt dat een testronde stillegt.
--
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------

drop policy if exists avatars_select on storage.objects;

create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or shares_group_with_user(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists avatars_insert on storage.objects;

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update on storage.objects;

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_delete on storage.objects;

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
