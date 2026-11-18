-- 0299_een_accountverwijdering_loopt_niet_meer_op_de_storagegrendel.sql — elke
-- accountverwijdering op productie faalde met 42501 op Supabase' grendel tegen
-- een kale delete in `storage.objects` (QS8-701).
--
-- ⚠️ **Voorlopig nummer.** Productie staat hoger dan `main`; de batchsessie
--    hernummert bij het landen.
--
-- ROLLBACK-PAD (alleen een functielichaam; geen gegevens):
--   `wis_bewijsfotos_van_vertrekker()` terugzetten uit 0230: het lichaam
--   hieronder zonder de twee `set_config`-regels en zonder `v_oud`. ⚠️ Daarmee
--   faalt accountverwijdering op productie weer voor iedereen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op 18-11-2026, met `storage.protect_delete()` en zijn twee triggers
-- letterlijk overgenomen van productie (sinds QS8-701 in de steiger,
-- `supabase/shim/0000_supabase_shim.sql`):
--
--   select verwijder_mijn_account();          -- als een gebruiker ZONDER bewijsfoto
--     ERROR 42501: Direct deletion from storage tables is not allowed.
--     ... wis_bewijsfotos_van_vertrekker() line 5
--   delete from auth.users where id = <b>;    -- als postgres
--     ERROR 42501, zelfde plek
--
-- De grendel is een `before delete`-trigger **per statement**: hij vuurt ook als
-- de delete geen enkele rij raakt. Daarom faalde het ook voor wie nooit een foto
-- maakte. Hetzelfde gold voor de Auth Admin API (`deleteUser`), die op dezelfde
-- `delete from auth.users` uitkomt; dat is afgeleid en niet gemeten.
--
-- 📏 Op productie gelezen (alleen lezen): dit is de énige functie in `public` die
-- een `delete from storage.objects` doet, en haar lichaam is gelijk aan dat van
-- 0230 (md5 `0bae0fb4…` aan beide kanten).
--
-- ---------------------------------------------------------------------------
-- De keuze: de instelling rond deze ene delete, en daarna terug
-- ---------------------------------------------------------------------------
--
-- Twee kandidaten uit het issue:
--
--   1. De instelling binnen de functie zetten, alleen voor deze delete. Dat
--      maakt waar wat 0230 al besloot: de rij gaat mee, het bestand is daarmee
--      onbereikbaar (er is geen pad meer om te ondertekenen).
--   2. De foto's via de Storage-API wissen (een Edge Function vóór de
--      verwijdering). Dat haalt ook de blob weg, maar maakt accountverwijdering
--      afhankelijk van een tweede dienst en een tweede stap die los kan falen.
--
-- Gekozen: **1**. Het is de kleinste wijziging die het wisrecht herstelt, en de
-- wees-blob is een bekende en weggezette grens (0230, `docs/DEPLOY.md` §2.6a).
-- Die grens verandert hier niet. 📏 `storage.objects` is op productie leeg
-- (QS8-700), dus er bestaat vandaag geen enkele wees.
--
-- ⚠️ **"Daarna terug" is de helft die telt.** `set_config(…, true)` geldt tot het
--    eind van de transactie. Zonder het terugzetten zou elke volgende delete in
--    dezelfde transactie de grendel ook passeren. `verwijder_mijn_account()` en
--    wat de aanroeper er nog achteraan doet, horen dat niet te kunnen. De oude
--    waarde gaat dus terug, of `false` als er geen was.
--    `tests/rls/accountverwijdering-storagegrendel.test.ts` toetst beide kanten.
--
-- ---------------------------------------------------------------------------

create or replace function public.wis_bewijsfotos_van_vertrekker()
returns trigger
language plpgsql
security definer
-- ⚠️ Zie 0230 voor `definer` en de `pg_temp`-pin; dit lichaam verandert daar niets aan.
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_oud text := current_setting('storage.allow_delete_query', true);
begin
  -- ⚠️ QS8-701: Supabase' grendel weigert elke SQL-delete op `storage.objects`
  --    (42501), ook als er geen rij matcht. Alleen voor déze delete open, en
  --    meteen daarna terug: zie de kop van 0299.
  perform set_config('storage.allow_delete_query', 'true', true);

  -- Het tweede padsegment is de eigenaar. De voltooiingen zelf gaan langs de
  -- cascade van 0031; hier gaat alleen wat daar niet aan hangt.
  delete from storage.objects o
  where o.bucket_id = 'bewijsfotos'
    and (storage.foldername(o.name))[2] = old.id::text;

  perform set_config('storage.allow_delete_query', coalesce(v_oud, 'false'), true);

  return old;
end;
$$;

-- ⚠️ `create or replace` laat de rechten staan; dit herhaalt 0230 voor wie dit
--    bestand los leest. `from public, anon, authenticated`: onwrikbare regel 4.
revoke execute on function public.wis_bewijsfotos_van_vertrekker() from public, anon, authenticated;
