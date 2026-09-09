-- 0224_een_chatfoto_overleeft_zijn_eigenaar_niet.sql — wie zijn account verwijdert,
-- neemt zijn foto's mee; het gesprek blijft.
--
-- ROLLBACK-PAD:
--   drop trigger if exists profielen_chatfotos_mee on public.profiles;
--   drop function if exists public.wis_chatfotos_van_vertrekker();
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Zonder deze migratie breekt accountverwijdering.** Gemeten op de lokale
--    stack, met een fotobericht van één gebruiker:
--
--      delete from profiles where id = <a>
--      → 23514 / new row for relation "chat_messages"
--                violates check constraint "chat_messages_attachment_eigen_pad"
--
--    `chat_messages_sender_id_fkey` is sinds 0031 `on delete set null` — het
--    bericht blijft staan zonder naam, want *"een gesprek van drie mensen is ook
--    van de andere twee"*. Maar de CHECK van 0223 eist bij een bijlage een
--    `sender_id`, en `null` voldoet daar niet aan. Dit is exact dezelfde vorm als
--    `chat_messages_sender_required`, die 0031 om precies deze reden heeft moeten
--    herschrijven — de derde keer dat een CHECK op deze tabel een referentiële
--    actie blokkeert.
--
-- ---------------------------------------------------------------------------
-- Het besluit: de foto gaat weg, het gesprek blijft
-- ---------------------------------------------------------------------------
--
-- 0031 trekt de scheidslijn bij *"voor wie is de rij bewijs"*: je eigen data
-- cascadeert, en wat van de gróep is blijft staan zonder naam. Een chatfoto valt
-- aan de andere kant van die lijn dan een chatzin, en om twee redenen:
--
--   1. Een zin is woorden; een foto is meestal een gezicht. Artikel 17 AVG weegt
--      een portret zwaarder dan een zin tekst, en een chatfoto is — anders dan
--      een bewijsfoto bij een voltooiing (QS8-391) — vrijwel nooit bewijs vóór
--      iemand anders.
--   2. 0213 heeft de richting net gezet door de weergavenaam uit `body` te halen,
--      met de reden dat *"een echte wissing beter is dan een afscherming"*. Een
--      gezicht identificeert sterker dan een weergavenaam.
--
-- ⚠️ **Twee soorten fotoberichten, twee uitkomsten.** Stond er tekst bij, dan
--    blijft die tekst staan en verdwijnt alleen de foto — dat is wat de
--    vertrekker aan het gesprek heeft bijgedragen. Was het bericht *alleen* een
--    foto, dan is het bericht de foto: die rij gaat weg. Een lege bubbel
--    achterlaten kan bovendien niet, want `chat_messages_inhoud_vereist` (0024)
--    eist tekst óf een bijlage.
--
-- ⚠️⚠️ **Er komt met opzet geen terugvalzin in `body`.** Dat zou Nederlandse
--    tekst in de database vastzetten die het scherm daarna toont, en precies dát
--    heeft 0213 er met veel moeite uitgehaald. Een onvertaalbare zin is erger dan
--    een regel minder.
--
-- ⚠️⚠️ **Wat deze migratie NIET kan, en dat hoort een lezer te weten.** Een
--    `delete from storage.objects` haalt de **metadata-rij** weg; de blob blijft
--    in de objectopslag staan. Vanuit SQL is er geen manier om te garanderen dat
--    een bestand echt weg is — dat vraagt de Storage-API (`.remove()`) of een
--    Edge Function. De rij weghalen maakt het bestand wél onbereikbaar (er is
--    geen pad meer om te ondertekenen), en dat is de grens van wat hier haalbaar
--    is. Zie `docs/DEPLOY.md` §opslag.

create or replace function public.wis_chatfotos_van_vertrekker()
returns trigger
language plpgsql
security definer
-- ⚠️ `definer` omdat deze trigger draait tijdens een verwijdering die door de
--    gebruiker zelf gestart wordt, en `storage.objects` is voor `authenticated`
--    alleen langs de policies benaderbaar — die kennen deze gebruiker op dat
--    moment niet meer als lid van iets.
-- ⚠️ **`pg_temp` staat er expliciet achteraan, en dat is geen opsmuk.** Pin je
--    hem niet, dan doorzoekt Postgres het tijdelijke schema als **eerste** — en
--    dan kiest de aanroeper welke `chat_messages` of `storage.objects` deze
--    functie leest. `zoekpadschaduw.test.ts` wordt daar rood op, en terecht.
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- 1. De metadata-rijen van zijn foto's. Het tweede padsegment is de afzender.
  delete from storage.objects o
  where o.bucket_id = 'chatfotos'
    and (storage.foldername(o.name))[2] = old.id::text;

  -- 2. Berichten die alléén een foto waren: die rij ís de foto.
  delete from chat_messages m
  where m.sender_id = old.id
    and m.attachment_url is not null
    and btrim(coalesce(m.body, '')) = '';

  -- 3. Berichten met tekst én foto: de tekst blijft, de foto gaat weg.
  update chat_messages m
  set attachment_url = null
  where m.sender_id = old.id
    and m.attachment_url is not null;

  return old;
end;
$$;

drop trigger if exists profielen_chatfotos_mee on public.profiles;

-- ⚠️ `before delete`, zodat dit gebeurt vóór `chat_messages_sender_id_fkey` zijn
--    `set null` uitvoert. Erna zou de CHECK van 0223 al omgevallen zijn.
create trigger profielen_chatfotos_mee
  before delete on public.profiles
  for each row
  execute function public.wis_chatfotos_van_vertrekker();

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — onwrikbare
--    regel 4 en migratie 0115. Een triggerfunctie hoort door niemand
--    rechtstreeks aanroepbaar te zijn, en een definer al helemaal niet.
revoke execute on function public.wis_chatfotos_van_vertrekker() from public, anon, authenticated;
