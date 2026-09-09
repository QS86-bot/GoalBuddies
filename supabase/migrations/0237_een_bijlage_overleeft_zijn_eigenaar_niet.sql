-- 0237_een_bijlage_overleeft_zijn_eigenaar_niet.sql — het AVG-verwijderpad dekt
-- voortaan beide chat-emmers, en zet de soort terug.
--
-- ROLLBACK-PAD:
--   drop trigger if exists profielen_bijlagen_mee on public.profiles;
--   drop function if exists public.wis_bijlagen_van_vertrekker();
--   -- daarna 0224 opnieuw uitvoeren: die zet
--   -- `wis_chatfotos_van_vertrekker()` en de trigger `profielen_chatfotos_mee`
--   -- terug in hun oude vorm.
--   ⚠️ Terugdraaien mét documenten in de database breekt accountverwijdering:
--      de oude functie kent `chatdocs` niet, en dan valt `delete from profiles`
--      om op de CHECK van 0236. Ruim eerst `chatdocs` op, of draai 0236 mee
--      terug.
--
-- ---------------------------------------------------------------------------
-- 1. Zonder deze migratie breekt accountverwijdering — opnieuw
-- ---------------------------------------------------------------------------
--
-- `wis_chatfotos_van_vertrekker()` (0224) doet drie dingen, en twee ervan zijn al
-- soort-agnostisch: stap 2 en 3 filteren op `attachment_url is not null` en
-- raken een `doc`-rij dus vanzelf. **Dat is toevallig goed en wordt hier
-- opzettelijk goed**, met een test eronder — anders versmalt de volgende lezer
-- die statements naar `type = 'photo'` en breekt het stil.
--
-- Stap 1 filtert wél op `bucket_id = 'chatfotos'` en **moet mee**. Anders komt
-- de 23514 van 0224 terug: `chat_messages_sender_id_fkey` is sinds 0031
-- `on delete set null`, de pad-CHECK eist bij een bijlage een `sender_id`, en
-- dan valt `delete from profiles` om zodra iemand ooit een document plaatste.
--
-- ---------------------------------------------------------------------------
-- 2. Waarom een document dezelfde behandeling krijgt als een foto
-- ---------------------------------------------------------------------------
--
-- 0224 redeneerde: *"een zin is woorden; een foto is meestal een gezicht, en
-- artikel 17 AVG weegt een portret zwaarder."* Een document is geen gezicht —
-- maar `jaarrekening-2026.pdf` of een doktersbrief is eerder een bijzondere
-- categorie persoonsgegevens dan een kiekje. **Dezelfde kant van de scheidslijn
-- van 0031, langs een andere route.**
--
-- ⚠️ En de **bestandsnaam is zelf een persoonsgegeven** (`aangifte-jan-de-vries.pdf`),
--    dus die moet ook weg. Dat gebeurt langs dezelfde drie statements.
--
-- ---------------------------------------------------------------------------
-- 3. ⚠️⚠️ De soort blijft staan, want hij is onveranderlijk
-- ---------------------------------------------------------------------------
--
-- De eerste versie van deze migratie zette `type` terug op `text`, zodat een
-- `doc`-rij zonder bijlage niet op de naam-CHECK van 0236 zou omvallen.
--
-- 📏 Dat werd geweigerd, en de database had gelijk:
--
--   delete from profiles where id = <a>
--   → Aan een chatbericht zijn alleen de tekst en de bijlage te wijzigen
--     (stamp_chat_message)
--
-- `stamp_chat_message()` maakt `type` onveranderlijk. **En dat hoort zo**: `type`
-- is precies het veld dat bepaalt tegen welke emmer de client tekent (0236 §1),
-- dus het is het laatste veld dat je los zou moeten maken om een opruiming te
-- laten slagen.
--
-- De reparatie zit daarom in 0236: de naam-eis hangt aan de **bijlage** en niet
-- aan de soort. Een `doc`-rij zonder bijlage is toegestaan, en het scherm toont
-- daar "dit document is niet meer beschikbaar" — wat waar is.
--
-- ⚠️ Twee correcte grendels die elkaar in de weg zitten, en de goedkoopste
--    uitweg (de onveranderlijkheid verruimen) is de verkeerde. Het staat hier
--    omdat de volgende lezer anders dezelfde afweging opnieuw maakt en misschien
--    de andere kant op valt.
--
-- ---------------------------------------------------------------------------
-- 4. Hernoemd, en dat is bewust
-- ---------------------------------------------------------------------------
--
-- `wis_chatfotos_van_vertrekker` zou een naam zijn die liegt over wat het lichaam
-- doet. Dit project heeft dat geval al opgeschreven bij `zonderAvatar` →
-- `zonderVerlopendeUrls`: **de naam noemt de eigenschap, niet het veld van
-- toen.** De oude functie gaat eruit, de trigger heet mee.
--
-- ⚠️ **Wat deze migratie NIET kan.** Een `delete from storage.objects` haalt de
--    **metadata-rij** weg; de blob blijft in de objectopslag staan. Vanuit SQL is
--    er geen manier om te garanderen dat een bestand echt weg is — dat vraagt de
--    Storage-API (`.remove()`) of een Edge Function. De rij weghalen maakt het
--    bestand wél onbereikbaar, want er is geen pad meer om te ondertekenen.
--    Zelfde grens als bij 0224 en 0230, met dezelfde open Laag-rij.

create or replace function public.wis_bijlagen_van_vertrekker()
returns trigger
language plpgsql
security definer
-- ⚠️ `definer` omdat deze trigger draait tijdens een verwijdering die de
--    gebruiker zelf start, en `storage.objects` is voor `authenticated` alleen
--    langs de policies benaderbaar — die kennen deze gebruiker op dat moment
--    niet meer als lid van iets.
-- ⚠️ `pg_temp` expliciet achteraan: zonder die pin doorzoekt Postgres het
--    tijdelijke schema als eerste, en dan kiest de aanroeper welke
--    `storage.objects` deze definer-functie leest.
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- 1. De metadata-rijen van zijn bijlagen, in **beide** chat-emmers. Het tweede
  --    padsegment is de afzender.
  delete from storage.objects o
  where o.bucket_id in ('chatfotos', 'chatdocs')
    and (storage.foldername(o.name))[2] = old.id::text;

  -- 2. Berichten die alléén een bijlage waren: die rij ís de bijlage.
  delete from chat_messages m
  where m.sender_id = old.id
    and m.attachment_url is not null
    and btrim(coalesce(m.body, '')) = '';

  -- 3. Berichten met tekst én een bijlage: de tekst blijft, de bijlage gaat weg.
  --
  -- ⚠️ `type` blijft staan: `stamp_chat_message()` maakt hem onveranderlijk, en
  --    dat hoort zo. De naam-CHECK van 0236 hangt daarom aan de bijlage. Zie §3.
  update chat_messages m
  set attachment_url = null,
      attachment_name = null
  where m.sender_id = old.id
    and m.attachment_url is not null;

  return old;
end;
$$;

-- De oude trigger en functie gaan eruit; de naam noemt de eigenschap.
drop trigger if exists profielen_chatfotos_mee on public.profiles;
drop trigger if exists profielen_bijlagen_mee on public.profiles;
drop function if exists public.wis_chatfotos_van_vertrekker();

-- ⚠️ `before delete`, zodat dit gebeurt vóór `chat_messages_sender_id_fkey` zijn
--    `set null` uitvoert. Erna zou de CHECK van 0236 al omgevallen zijn.
create trigger profielen_bijlagen_mee
  before delete on public.profiles
  for each row
  execute function public.wis_bijlagen_van_vertrekker();

-- ⚠️ `from public, anon, authenticated` — onwrikbare regel 4 en migratie 0115.
revoke execute on function public.wis_bijlagen_van_vertrekker() from public, anon, authenticated;
