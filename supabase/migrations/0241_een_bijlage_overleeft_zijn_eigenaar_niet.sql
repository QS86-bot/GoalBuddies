-- 0241_een_bijlage_overleeft_zijn_eigenaar_niet.sql — het AVG-verwijderpad kent
-- voortaan ook documenten: de naam gaat mee, de soort blijft staan, en de foto
-- houdt de behandeling die 0235 hem net gaf.
--
-- Dossier: docs/decisions/2026-09-10-een-document-is-geen-foto.md
--
-- ROLLBACK-PAD:
--   drop trigger if exists profielen_bijlagen_mee on public.profiles;
--   drop function if exists public.wis_bijlagen_van_vertrekker();
--   -- daarna 0224 opnieuw uitvoeren: die zet
--   -- `wis_chatfotos_van_vertrekker()` en de trigger `profielen_chatfotos_mee`
--   -- terug in hun oude vorm.
--   ⚠️ Terugdraaien mét documenten in de database breekt accountverwijdering:
--      de oude functie kent `chatdocs` niet, en dan valt `delete from profiles`
--      om op de CHECK van 0240. Ruim eerst `chatdocs` op, of draai 0240 mee
--      terug.
--
-- ---------------------------------------------------------------------------
-- 1. Zonder deze migratie breekt accountverwijdering — opnieuw
-- ---------------------------------------------------------------------------
--
-- `wis_chatfotos_van_vertrekker()` — 0224, herzien in §4 van 0235 — is voor twee
-- van zijn statements al soort-agnostisch: ze filteren op `attachment_url is not
-- null` en raken een `doc`-rij dus vanzelf. **Dat is toevallig goed en wordt
-- hier opzettelijk goed**, met een test eronder — anders versmalt de volgende
-- lezer ze naar `type = 'photo'` en breekt het stil.
--
-- Zonder deze migratie komt de 23514 van 0224 terug: `chat_messages_sender_id_fkey`
-- is sinds 0031 `on delete set null`, de pad-CHECK eist bij een bijlage een
-- `sender_id`, en dan valt `delete from profiles` om zodra iemand ooit een
-- document plaatste.
--
-- ⚠️⚠️ **En er is een tweede reden die pas met 0240 ontstond, en die is
--    dwingender.** De naam-CHECK zegt: een `attachment_name` mag er alleen zijn
--    bij een `doc` **mét** bijlage. Het statement dat `attachment_url` op `null`
--    zet, laat `attachment_name` staan — en dan valt de verwijdering om op
--    `chat_messages_attachment_name_vorm`. De naam moet dus in hetzelfde
--    statement mee, en dat is niet optioneel.
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
-- `doc`-rij zonder bijlage niet op de naam-CHECK van 0240 zou omvallen.
--
-- 📏 Dat werd geweigerd, en de database had gelijk:
--
--   delete from profiles where id = <a>
--   → Aan een chatbericht zijn alleen de tekst en de bijlage te wijzigen
--     (stamp_chat_message)
--
-- `stamp_chat_message()` maakt `type` onveranderlijk. **En dat hoort zo**: `type`
-- is precies het veld dat bepaalt tegen welke emmer de client tekent (0240 §1),
-- dus het is het laatste veld dat je los zou moeten maken om een opruiming te
-- laten slagen.
--
-- De reparatie zit daarom in 0240: de naam-eis hangt aan de **bijlage** en niet
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
-- ---------------------------------------------------------------------------
-- 5. ⚠️⚠️ De foto blijft staan en het document niet, en dat is geen inconsistentie
-- ---------------------------------------------------------------------------
--
-- Terwijl deze branch openstond landde QS8-396 (0235) op `main`, en §4 daarvan
-- draait precies de handeling terug die deze migratie in zijn eerste vorm
-- kopieerde: `wis_chatfotos_van_vertrekker()` wíst de metadata-rij, en daarmee
-- staat de blob buiten het bereik van élke SQL-pas — er wijst dan niets meer
-- naar dat pad. *"Niet onleesbaar en dus weg; onvindbaar en dus voor altijd."*
-- Sinds 0235 blijft het object daarom staan als wees, en haalt de opruimpas
-- blob én rij weg met `storage.remove()`.
--
-- 📏 Deze migratie draaide dat terug zonder dat git een conflict zag — andere
--    bestanden, hetzelfde functielichaam. Twee tests van hén werden er rood van,
--    en dát is wat het gevonden heeft.
--
-- **Voor een document geldt die redenering niet, en het verschil zit in de
-- leespolicy.** `chatfotos_select` hangt sinds 0235 §1 aan het **bericht**: is er
-- geen bericht meer dat naar dat pad wijst, dan is de wees meteen onleesbaar.
-- `chatdocs_select` hangt aan het **pad** — twee mapsegmenten en
-- `mag_groep_lezen()` — dus een verweesd document blijft voor élk groepslid
-- leesbaar. Een wees achterlaten is hier dus geen respijt maar een lek, en
-- precies het tegenovergestelde van wat artikel 17 vraagt.
--
-- Dus: de foto blijft staan (0235 wint), het document gaat weg (0224 wint), en
-- allebei volgen ze dezelfde regel — *het object is nooit langer leesbaar dan
-- de toestemming*.
--
-- ⚠️ **De prijs staat hier met zoveel woorden.** Een `delete from
--    storage.objects` haalt de metadata-rij weg; de blob blijft in de
--    objectopslag staan en is daarna vanuit SQL niet meer op te ruimen. Dat is
--    dezelfde grens als bij 0230, en het is de reden dat de goede eindvorm een
--    berichtgebonden `chatdocs_select` plus een opruimpas is — dan kan een
--    document dezelfde weg als de foto. Dat is QS8-408, met een rij in
--    `docs/ENGINEER-REVIEW.md`.

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
  -- 1. De metadata-rijen van zijn **documenten**, en met opzet niet die van zijn
  --    foto's. Het tweede padsegment is de afzender.
  --
  -- ⚠️⚠️ `chatfotos` staat hier niet, en dat is geen omissie — zie §5. Een
  --    verweesde foto is meteen onleesbaar (`chatfotos_select` hangt aan het
  --    bericht) en wordt door de opruimpas van 0235 écht weggehaald, blob en al.
  --    Een verweesd document blijft leesbaar, want `chatdocs_select` hangt aan
  --    het pad. Wie dit ooit gelijktrekt, trekt éérst de leespolicy gelijk.
  delete from storage.objects o
  where o.bucket_id = 'chatdocs'
    and (storage.foldername(o.name))[2] = old.id::text;

  -- 2. Berichten die alléén een bijlage waren: die rij ís de bijlage.
  delete from chat_messages m
  where m.sender_id = old.id
    and m.attachment_url is not null
    and btrim(coalesce(m.body, '')) = '';

  -- 3. Berichten met tekst én een bijlage: de tekst blijft, de bijlage gaat weg.
  --
  -- ⚠️ `type` blijft staan: `stamp_chat_message()` maakt hem onveranderlijk, en
  --    dat hoort zo. De naam-CHECK van 0240 hangt daarom aan de bijlage. Zie §3.
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
--    `set null` uitvoert. Erna zou de CHECK van 0240 al omgevallen zijn.
create trigger profielen_bijlagen_mee
  before delete on public.profiles
  for each row
  execute function public.wis_bijlagen_van_vertrekker();

-- ⚠️ `from public, anon, authenticated` — onwrikbare regel 4 en migratie 0115.
revoke execute on function public.wis_bijlagen_van_vertrekker() from public, anon, authenticated;
