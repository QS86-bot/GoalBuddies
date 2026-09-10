-- 0251_een_bewaartermijn_voor_alle_bijlagen.sql — één bewaartermijn voor beide
-- chat-emmers, in plaats van twee functies met dezelfde stand.
--
-- Issue: QS8-411 · Besluit: QS8-408, reactie van Quinten 10-09-2026 11:37
--
-- ROLLBACK-PAD:
--   -- 0235 §3 opnieuw uitvoeren voor `chatfoto_bewaartermijn()` en de oude
--   -- `verlopen_chatfotos()`, en 0250 §2/§3 voor `chatdoc_bewaartermijn()` en
--   -- de oude `verlopen_chatdocs()`; daarna:
--   drop function if exists public.bijlage_bewaartermijn();
--
--   ⚠️ Terugdraaien zet twee functies terug die hetzelfde getal dragen. Dat is
--      precies wat dit issue wegneemt, dus doe het alleen als er een reden is om
--      de twee termijnen uit elkaar te laten lopen — en schrijf die dan op.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Op QS8-408 stond op 10-09-2026 om 11:37 een besluit van Quinten, en dat ging
-- over méér dan het getal:
--
--   *"Stap 2: geen eigen constante en geen tweede knop. Als de termijn ergens
--   een naam heeft (`src/shared/bewaartermijn/`), leest de documentpas diezelfde
--   waarde. **Twee constanten met dezelfde stand is een halve familie**, en dat
--   is in dit project de duurdere vorm — dezelfde afweging als bij de dagteller
--   van QS8-399 en de emmers van QS8-407."*
--
-- Migratie 0250 deed het tegenovergestelde: `chatdoc_bewaartermijn()` náást
-- `chatfoto_bewaartermijn()`, `CHATDOC_BEWAARDAGEN` náást `CHATFOTO_BEWAARDAGEN`,
-- en twee i18n-sleutels. De bouwsessie las bij het claimen de beschrijving van
-- het issue en niet de reacties; het besluit stond in een reactie.
--
-- ⚠️⚠️ **Wat dit duurder maakte dan een gewone afwijking: de keuze is
--    verdédigd.** §2 van 0250 en §10 van het dossier leggen uit waaróm het er
--    twee zijn, en er stond een test onder die de twee-vorm vastlegde. Een
--    volgende lezer vindt dan een onderbouwing voor iets dat tegen een besluit
--    ingaat, en gaat die niet in twijfel trekken. Die passages zijn met deze
--    migratie rechtgezet.
--
-- ---------------------------------------------------------------------------
-- 1. Waarom `bijlage_bewaartermijn()` en niet één van de twee bestaande namen
-- ---------------------------------------------------------------------------
--
-- Het besluit zegt "één waarde", niet "welke naam". De naam is toch een keuze,
-- en `chatfoto_bewaartermijn()` laten staan zou een functie geven die
-- "chatfoto" heet en ook documenten bedient.
--
-- ⚠️ **Dat geval heeft dit project al twee keer opgeschreven**, en allebei de
--    keren was hernoemen het antwoord: `zonderAvatar` → `zonderVerlopendeUrls`
--    (de naam noemde het veld van toen en niet de eigenschap) en
--    `wis_chatfotos_van_vertrekker` → `wis_bijlagen_van_vertrekker` (0243, toen
--    hij beide emmers ging dekken). Dit is dezelfde beweging, dezelfde reden.
--
-- ⚠️ De **volgorde** is dragend: eerst de nieuwe functie, dan de twee passen
--    erop laten wijzen, en pas dán de oude droppen. Andersom staat er een
--    ogenblik een pas die naar een functie wijst die er niet meer is.

create or replace function public.bijlage_bewaartermijn()
returns interval
language sql
immutable
set search_path = public, pg_catalog, pg_temp
as $$ select interval '21 days' $$;

comment on function public.bijlage_bewaartermijn() is
  'Hoe lang een gedeelde bijlage op de server blijft: 21 dagen. Besluit van '
  'Quinten, 09-09-2026 voor de chatfoto en 10-09-2026 voor het document — '
  'uitdrukkelijk één termijn voor beide (QS8-408, QS8-411). Eén plek, zodat de '
  'melding in de app en de twee opruimpassen niet uiteen kunnen lopen.';

-- ⚠️ Onwrikbare regel 4: de `revoke` noemt `authenticated` met zoveel woorden.
--    Alleen de opruimpassen lezen dit, en die draaien als `service_role`.
revoke all on function public.bijlage_bewaartermijn() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De twee passen lezen dezelfde waarde
-- ---------------------------------------------------------------------------
--
-- Woordelijk de lichamen van 0235 §3 en 0250 §3, met alleen de termijnfunctie
-- vervangen. De emmer blijft per pas verschillen — dát is wat ze onderscheidt,
-- en dat is geen halve familie maar twee emmers.
--
-- ⚠️ **De passen blijven twee functies en dat is bewust.** Het besluit ging over
--    de **termijn** ("één waarde"), niet over de vorm van de pas. Ze verschillen
--    in de enige regel die ertoe doet — `bucket_id` — en samenvoegen tot
--    `verlopen_bijlagen(p_emmer)` zou een parameter maken van iets dat de
--    aanroeper toch al per emmer kent. De uitvoerende helft is al gedeeld, in
--    één lus in `supabase/functions/rollover/index.ts`.

create or replace function public.verlopen_chatfotos(p_limiet integer default 500)
returns table (pad text, reden text)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select o.name,
         case
           when o.created_at < now() - bijlage_bewaartermijn() then 'verlopen'
           else 'wees'
         end
  from storage.objects o
  where o.bucket_id = 'chatfotos'
    and (
      o.created_at < now() - bijlage_bewaartermijn()
      or (
        o.created_at < now() - interval '1 hour'
        and not exists (
          select 1 from chat_messages m where m.attachment_url = o.name
        )
      )
    )
  order by o.created_at asc
  limit greatest(coalesce(p_limiet, 500), 1)
$$;

create or replace function public.verlopen_chatdocs(p_limiet integer default 500)
returns table (pad text, reden text)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select o.name,
         case
           when o.created_at < now() - bijlage_bewaartermijn() then 'verlopen'
           else 'wees'
         end
  from storage.objects o
  where o.bucket_id = 'chatdocs'
    and (
      o.created_at < now() - bijlage_bewaartermijn()
      or (
        o.created_at < now() - interval '1 hour'
        and not exists (
          select 1 from chat_messages m where m.attachment_url = o.name
        )
      )
    )
  order by o.created_at asc
  limit greatest(coalesce(p_limiet, 500), 1)
$$;

comment on function public.verlopen_chatfotos(integer) is
  'De fotopaden die weg mogen: ouder dan bijlage_bewaartermijn(), of een wees '
  'zonder chatbericht (met een uur respijt). Wist zelf niets — een delete op '
  'storage.objects haalt de rij weg en het bestand niet. QS8-396, 0235; de '
  'termijn is gedeeld sinds QS8-411, 0251.';

comment on function public.verlopen_chatdocs(integer) is
  'De documentpaden die weg mogen: ouder dan bijlage_bewaartermijn(), of een '
  'wees zonder chatbericht (met een uur respijt). Wist zelf niets — een delete '
  'op storage.objects haalt de rij weg en het bestand niet. QS8-408, 0250; de '
  'termijn is gedeeld sinds QS8-411, 0251.';

-- ---------------------------------------------------------------------------
-- 3. De twee oude termijnfuncties gaan weg
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Niet laten staan "voor de zekerheid".** Twee functies met dezelfde stand
--    zijn precies wat dit issue wegneemt; eentje die niemand meer aanroept is
--    bovendien een dode keten, en `keten:controle` zou hem terecht melden.
--
-- ⚠️ `drop function` en geen `or replace`: een functie die een ander returntype
--    of een andere naam krijgt, is een andere functie.

drop function if exists public.chatfoto_bewaartermijn();
drop function if exists public.chatdoc_bewaartermijn();
