-- 0299 — een bewijsfoto verdwijnt via de Storage-API bij accountverwijdering (QS8-692)
--
-- ⚠️⚠️ NUMMER 0299 IS EEN VOORLOPIG NUMMER. Productie draagt 0299–0302 die `main`
--    niet heeft (QS8-233/641), en `npm run migraties:controle` meldt (18-11) acht
--    branches met een eigen 0299 (qs8-661, 662, 665, 666, 687, 695, 696 en 699).
--    Hernummeren met `npm run migratie:hernummer` vóór dit op productie komt; wie
--    als tweede merget, hernummert (QS8-318).
--    ⚠️ Bij het hernummeren: `0299` staat hier ook als de productienummers hierboven
--    (niet meeveranderen) en in de `COMMENT ON`-strings verderop (die belanden in de
--    databasecatalogus). Kale verwijzingen raakt de tool niet aan; lees ze per regel.
--
-- ROLLBACK:
--   drop function if exists public.verlopen_bewijsfotos(integer);
--   -- en `wis_bewijsfotos_van_vertrekker()` terug naar de vorm uit 0230, dus
--   -- mét `delete from storage.objects` — ⚠️ daarmee faalt elke
--   -- accountverwijdering op productie weer (zie hieronder).
--   Geen dump nodig: deze migratie wijzigt geen rijen.
--
-- ---------------------------------------------------------------------------
-- Wat er kapot was
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op productie op 17-11-2026: **1.050 van de 1.050** verwijderingen via
--    `DELETE /auth/v1/admin/users/…` gaven HTTP 500, met
--    `Direct deletion from storage tables is not allowed. Use the Storage API
--    instead (SQLSTATE 42501)`. De keten: `verwijder_mijn_account()` →
--    `delete from auth.users` → cascade naar `profiles` → trigger
--    `profielen_bewijsfotos_mee` → `wis_bewijsfotos_van_vertrekker()` (0230) →
--    `delete from storage.objects` → `storage.protect_delete()`, een trigger van
--    Supabase zelf, die 42501 gooit zolang `storage.allow_delete_query` niet op
--    `'true'` staat. De hele transactie rolt terug en het account blijft bestaan.
--    Dat is het wisrecht van elke gebruiker, niet alleen van een testsuite.
--
-- ---------------------------------------------------------------------------
-- Waarom deze weg en niet `set_config('storage.allow_delete_query', …)`
-- ---------------------------------------------------------------------------
--
-- De grendel van Supabase bestaat om precies het ene te voorkomen dat 0230 deed:
-- een metadata-rij wegdoen en de blob laten staan. 0230 zelf schrijft dat op
-- (*"de blob blijft in de objectopslag staan"*), en 0235 trok daaruit de les voor
-- chatfoto's: laat de rij **staan**, dan is de foto meteen onleesbaar en kan de
-- opruimpas hem met `storage.remove()` — de enige weg die blob én rij weghaalt —
-- ophalen. Dit is dezelfde weg voor de bewijsfoto.
--
-- ⚠️ **De leesgrens hoeft niet te veranderen.** De leespolicy van 0227 zoekt een
--    weekdoel van de lezer; na de cascade bestaat dat niet meer, dus een wees is
--    onleesbaar zodra het account weg is. Dat is niet nagemeten tegen productie
--    maar volgt uit de policy zoals 0230 hem beschrijft.
--
-- ⚠️ Gevolg dat je moet weten: tussen het verwijderen van het account en de
--    eerstvolgende run van de rollover (elk uur) staat de blob nog op de opslag,
--    onleesbaar. De bytes gaan binnen een uur weg, niet in dezelfde transactie.
--    Faalt de opruimpas, dan staat dat in `bijlagenMislukt` en in Sentry.
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie doet
-- ---------------------------------------------------------------------------
--
-- 1. `wis_bewijsfotos_van_vertrekker()` blijft bestaan (de trigger hangt eraan)
--    maar raakt `storage.objects` niet meer.
-- 2. `verlopen_bewijsfotos(p_limiet)` geeft de paden terug van objecten in de
--    emmer `bewijsfotos` waarvan de eigenaar (tweede padsegment, 0230) geen
--    profiel meer heeft. Wist zelf niets; alleen service_role.
--
-- ⚠️ Een pad waarvan het tweede segment geen uuid is, wordt nooit teruggegeven:
--    dat is geen object van een verdwenen gebruiker maar een pad dat deze
--    functie niet begrijpt, en "niet kunnen toetsen" is geen reden om te wissen.
--
-- Idempotent: `create or replace`, `revoke`/`grant` zijn herhaalbaar.

create or replace function public.wis_bewijsfotos_van_vertrekker()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- ⚠️ Geen `delete from storage.objects` meer: Supabase weigert dat met 42501.
  --    De objecten blijven als wees staan, onleesbaar (0227), en
  --    `verlopen_bewijsfotos()` laat de opruimpas ze met `storage.remove()` wissen.
  return old;
end;
$$;

comment on function public.wis_bewijsfotos_van_vertrekker() is
  'Raakt storage.objects niet meer (QS8-692, 0299): een delete daarop faalt op '
  'productie met 42501. De bewijsfoto''s van een vertrekker blijven als wees '
  'staan tot verlopen_bewijsfotos() ze aanwijst en de rollover ze wist.';

revoke execute on function public.wis_bewijsfotos_van_vertrekker() from public, anon, authenticated;

create or replace function public.verlopen_bewijsfotos(p_limiet integer default 500)
returns table (pad text, reden text)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select o.name, 'wees'::text
  from storage.objects o
  cross join lateral (
    select (storage.foldername(o.name))[2] as eigenaar
  ) s
  where o.bucket_id = 'bewijsfotos'
    -- Alleen een tweede segment dat een uuid IS; zie de kop.
    and s.eigenaar ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.profiles p where p.id = s.eigenaar::uuid
    )
  order by o.created_at asc
  limit greatest(coalesce(p_limiet, 500), 1)
$$;

comment on function public.verlopen_bewijsfotos(integer) is
  'De paden van bewijsfoto''s waarvan de eigenaar geen profiel meer heeft '
  '(QS8-692, 0299). Wist zelf niets: een delete op storage.objects haalt de rij '
  'weg en het bestand niet, en wordt op productie met 42501 geweigerd.';

-- ⚠️ Onwrikbare regel 4: de revoke noemt `authenticated` met zoveel woorden.
revoke all on function public.verlopen_bewijsfotos(integer) from public, anon, authenticated;
grant execute on function public.verlopen_bewijsfotos(integer) to service_role;
