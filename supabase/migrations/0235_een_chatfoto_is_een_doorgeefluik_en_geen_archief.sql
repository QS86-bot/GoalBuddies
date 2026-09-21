-- 0235_een_chatfoto_is_een_doorgeefluik_en_geen_archief.sql — de leesgrens gaat
-- aan het bericht hangen, de bucket krijgt een bewaartermijn, en het plafond
-- telt handelingen in plaats van voorraad (QS8-396, deel 2 van QS8-394).
--
-- ROLLBACK-PAD:
--   drop function if exists public.verlopen_chatfotos(integer);
--   drop function if exists public.chatfoto_bewaartermijn();
--   drop index if exists public.chat_messages_bijlage_idx;
--   -- en chatfotos_select terug naar de vorm uit 0225, dus zonder de
--   --   exists-tak op chat_messages en zonder het eigenaarsbeen;
--   --   wis_chatfotos_van_vertrekker() terug naar de vorm uit 0224, dus mét de
--   --   `delete from storage.objects` als eerste stap;
--   --   chatfotos_update terug in de vorm uit 0222.
--   --
--   -- ⚠️ Het plafond staat níét in deze migratie — dat is `dagtellers` uit 0233
--   --    en 0234 (QS8-399 en QS8-401). Deze rollback raakt het niet.
--
-- ⚠️ **Wat een rollback niet terughaalt: de bytes.** Alles wat de opruimpas
--    inmiddels met `storage.remove()` heeft weggehaald, is weg — er is geen
--    prullenbak en er zijn op de gratis tier geen automatische backups. Een
--    rollback zet de bewaartermijn uit; hij zet geen foto's terug. Zie
--    `docs/DEPLOY.md` §2.9.
--
-- ⚠️ Dit verwijdert geen gegevens. De opruimpas draait niet vanuit deze migratie:
--    `verlopen_chatfotos()` **geeft paden terug** en wist niets. Zie §3 voor
--    waarom dat geen halve maatregel is maar de enige die werkt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 09-09-2026 (QS8-394): het WhatsApp-model is niet "geen
-- server" — WhatsApp uploadt media versleuteld naar zijn eigen servers en gooit
-- ze weg zodra ze afgeleverd zijn. Wat wij daarvan kunnen kopiëren zonder
-- sleutelbeheer is de tweede helft: **de server bewaart het niet lang.**
--
-- ⚠️ **Wat er niet meer staat, kan niet lekken.** Dat is de hele redenering, en
--    hij staat los van de vraag óf er ooit versleuteld gaat worden (QS8-397).
--    Uitgeschreven in `docs/decisions/2026-09-09-wat-er-niet-staat-kan-niet-lekken.md`.
--
-- 📏 En er lag een gemeten lek dat dezelfde oorzaak heeft. Uit de doorlichting
--    van 09-09-2026, gereproduceerd met een object zonder berichtrij:
--
--      berichten met deze bijlage: 0
--      B ziet: <groep>/<uid>/nooit-verstuurd.jpg
--
--    `chatfotos_select` hing uitsluitend aan het **pad** en aan
--    `mag_groep_lezen()`. Twee routes daarheen, en de tweede is de ernstige:
--
--      * **nooit verstuurd** — de upload slaagt, de `insert` sneuvelt (de rem van
--        0090, een netwerkfout, de app dicht tussen twee aanroepen) en de
--        compenserende `remove()` komt niet aan. Volgens de gebruiker is de foto
--        nooit verstuurd.
--      * **verwijderd** — `verwijderBericht()` wist eerst de rij en dán het
--        bestand. Sluit de app ertussen, dan is het bericht weg uit de chat en
--        staat het bestand er nog. Wie een foto plaatst en er direct spijt van
--        krijgt, krijgt "weg" te zien terwijl elk ander lid het bestand opsomt
--        met één `storage.list()` en ophaalt met `createSignedUrl`.
--
--    ⚠️ Het beslisdocument van QS8-71 bespreekt "het object overleeft de rij"
--       wél, maar uitsluitend als **opslagkosten**. Dat het intussen leesbaar is,
--       stond er niet. Dat verschil is de bevinding.
--
-- ---------------------------------------------------------------------------
-- 1. De leesgrens hangt aan het bericht en niet aan de map
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een `exists` op een ándere tabel, dus geen recursie.** Bij 0130 liep een
--    policy op `storage.objects` vast op zichzelf; dit is `chat_messages` en dat
--    is een andere relatie.
--
-- ⚠️⚠️ **En de subquery draait onder de RLS van de aanroeper**, want een policy
--    wordt geëvalueerd met zijn rechten. `chat_messages_select` is
--    `mag_groep_lezen(group_id)`, dus de nieuwe tak is strikt **smaller** dan wat
--    er stond: je ziet het bestand alleen als je het bericht ziet. Dat is precies
--    de bedoeling — de foto is een bijlage bij een bericht en heeft daarbuiten
--    geen bestaansrecht.
--
-- ⚠️ **Dit breekt het verzenden niet.** 📏 Nagelopen in `chat.ts`: de client doet
--    upload → insert, en maakt géén ondertekende URL vóór de insert. De
--    voorvertoning gebruikt de bytes die hij zelf gekozen heeft. Er is dus geen
--    moment waarop de verzender zijn eigen object moet kunnen lézen zonder dat er
--    een bericht is.

-- ⚠️ Onwrikbare regel 11: de policy filtert hierop, dus er hoort een index op.
--    Zonder deze index leest élk `storage.list()` de hele berichtentabel.
create index if not exists chat_messages_bijlage_idx
  on public.chat_messages (attachment_url)
  where attachment_url is not null;

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
    and (
      exists (
        select 1 from public.chat_messages m
        where m.attachment_url = storage.objects.name
      )
      -- ⚠️⚠️ **Het eigenaarsbeen is geen verzachting maar een gemeten noodzaak.**
      --    Postgres past de SELECT-policy óók toe op `delete … where`. Zonder deze
      --    tak kan de plaatser zijn eigen wees niet meer opruimen, en dan sterven
      --    allebei de compenserende opruimingen in `chat.ts` — stil, want
      --    `remove()` geeft geen fout op nul rijen. 📏 Gemeten, dezelfde delete
      --    als eigenaar: mét de tak `DELETE 1`, zonder `DELETE 0`.
      --
      --    Dat maakt de reparatie eróger dan de bug die hij sluit: vóór 0235 was
      --    de foto na "verwijderen" meteen weg, daarna zou hij tot de volgende
      --    opruimronde blijven staan — en een ondertekende URL van vóór dat
      --    moment blijft zijn volle uur werken (`CHATFOTO_GELDIGHEID_S`).
      --
      -- ⚠️ Het lek dat de kop noemt, blijft dicht: dat ging over **elk ánder
      --    lid** dat het bestand opsomde. De plaatser leest hier zijn eigen bytes,
      --    en die heeft hij zelf gekozen.
      or (storage.foldername(name))[2] = (select auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- 1b. Een chatfoto wordt niet bijgewerkt, dus er is geen UPDATE-recht
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder dit is het plafond van §2 met één vlag te omzeilen.** 📏 Gemeten
--    als `authenticated`, op een pad dat wél een bericht heeft:
--
--      nette upload            -> tellerrijen: 1
--      50x upsert op dat pad   -> tellerrijen: 1
--
--    `insert … on conflict do update` vuurt de BEFORE INSERT-trigger (die slaagt,
--    want de teller groeit niet mee) maar niet de AFTER **INSERT**-trigger, dus
--    er komt geen tellerrij bij. `upload(..., { upsert: true })` is dan
--    ongelimiteerde ingress én egress op een tier die 5 GB per maand meet —
--    precies de lus die §2 zegt te sluiten.
--
-- ⚠️ **De teller óók op UPDATE laten tellen was het alternatief en is het niet
--    geworden.** Dan zou élke metadata-update van de opslagdienst quota kosten,
--    en acht downloads zouden je een etmaal buitensluiten. Het onderscheid dat je
--    daarvoor nodig hebt (`version` verandert wel, `last_accessed_at` niet) is op
--    de lokale steiger niet te meten: die tabel heeft vijf kolommen. Een grendel
--    die je niet kunt ijken, is een aanname.
--
-- ⚠️ **Het recht had sowieso geen reden.** 📏 Nagelopen in de hele app: alle drie
--    de buckets uploaden met `upsert: false`, er is geen `.move()` en geen
--    `.copy()`. `chatfotos_update` stond er sinds 0222 als vorm, niet als
--    behoefte. Geen recht zonder reden.
--
-- ⚠️⚠️ **PRECISERING OP 11-09-2026 (QS8-416): "wij roepen het niet aan" is een
--    reden om het recht in te trekken, en géén bewijs dat de route dicht is.**
--    Een client praat rechtstreeks met de Storage-API; onze call sites zeggen
--    daar niets over. Voor `.move()` klopt de conclusie alsnog — dat is een
--    UPDATE en die is met deze drop weg. Voor `.copy()` niet: dat schrijft een
--    **nieuwe rij** en passeert alleen de INSERT-policy van de doelemmer. Sinds
--    0255 pint die de bestandsnaam — maar dat sluit de route **niet**: bij een
--    `copy` kiest de client de doelnaam, dus een pdf uit `chatdocs` heet in
--    `chatfotos` gewoon `onschuldig.jpg`. De copy-route staat open en hoort bij
--    de rij van 11-09 in `docs/ENGINEER-REVIEW.md`.
--
-- ⚠️ Het restrisico staat in `docs/ENGINEER-REVIEW.md`: of de Storage-API bij een
--    gewone upload of download zélf een rij bijwerkt namens `authenticated`, is
--    hier niet te meten. Zo ja, dan faalt het versturen zichtbaar en is dit één
--    regel terug.
drop policy if exists chatfotos_update on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Het plafond — niet hier, en dat is een samenvoeging
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze migratie had zijn eigen teller (`chatfoto_uploads`) en die is
--    vervallen.** Op dezelfde dag bouwde QS8-399 dezelfde reparatie generiek
--    voor alle drie de emmers (0233), en 0234 trok hem daarna breder dan opslag:
--    `dagtellers` + `tel_dagteller()`, één rij per domein, soort en sleutel in
--    plaats van een rij per upload.
--
--    Twee tellers voor één regel is een halve familie, en die is erger dan een
--    hele. De generieke vorm wint: hij dekt ook `avatars` en `bewijsfotos`, hij
--    is geen groeivector, en hij geeft de gebruiker een melding die van een
--    netwerkfout te onderscheiden is. `bewaak_chatfoto_aantal()` staat daarom in
--    de migratie ervóór en niet hier.
--
-- ⚠️⚠️ **Wat déze migratie eraan toevoegt, staat in §1b en is niet cosmetisch.**
--    De teller van 0233 hangt aan INSERT (plus een trigger op verhuizingen),
--    en een `insert … on conflict do update` op hetzelfde pad is geen van beide.
--    📏 Gemeten met die teller: één nette upload gaf één tel, en vijftig upserts
--    daarna telden niet mee. Het ingetrokken UPDATE-recht is wat die route sluit.
--
-- ⚠️ **En de teller overleeft de opruimpas van §3, want hij hangt niet aan
--    `storage.objects`.** Dat is precies de eigenschap die deze twee migraties
--    aan elkaar knoopt: hoe agressiever de pas, hoe vaker er ruimte vrijkomt
--    onder een plafond dat levende rijen telt. `dagtellers` telt die niet.
--
-- ⚠️ Snoeien hoeft niet: het is één rij per sleutel die ter plekke bijgewerkt
--    wordt, geen rij per upload. De `snoei_chatfoto_teller()` die hier stond, is
--    daarmee vervallen.

-- ---------------------------------------------------------------------------
-- 3. De bewaartermijn — en waarom deze functie niets wist
-- ---------------------------------------------------------------------------
--
-- **Besluit van Quinten, 09-09-2026: 21 dagen.**
--
-- ⚠️⚠️ **`verlopen_chatfotos()` geeft paden terug en verwijdert niets, en dat is
--    geen halve maatregel.** Een `delete from storage.objects` haalt de
--    **metadata-rij** weg; het bestand blijft op de opslag staan. Dat staat al
--    als bevinding in `docs/ENGINEER-REVIEW.md` (QS8-71, 0224). Een SQL-only
--    opruiming zou de foto dus onleesbaar maken en tóch bewaren — precies de
--    belofte die dit issue waar moet maken, half.
--
--    Alleen de Storage-API (`.remove()`) haalt blob én rij weg. Die draait in de
--    rollover-functie, en die roept deze RPC aan. De database bepaalt **wat** er
--    weg mag; de edge-functie voert het uit.
--
-- ⚠️ **De respijttermijn is dragend en geen marge.** Een upload die net geslaagd
--    is heeft nog geen berichtrij — dat venster is de hele reden dat wezen
--    bestaan. Zou de pas die meteen meenemen, dan wist hij de foto die op ditzelfde
--    moment verstuurd wordt. Een uur is ruim voor een upload van hooguit 1 MB.
create or replace function public.chatfoto_bewaartermijn()
returns interval
language sql
immutable
set search_path = public, pg_catalog, pg_temp
as $$ select interval '21 days' $$;

comment on function public.chatfoto_bewaartermijn() is
  'Hoe lang een chatfoto op de server blijft (QS8-396). Besluit van Quinten op '
  '09-09-2026: 21 dagen. Eén plek, zodat de melding en de pas niet uiteenlopen.';

create or replace function public.verlopen_chatfotos(p_limiet integer default 500)
returns table (pad text, reden text)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select o.name,
         case
           when o.created_at < now() - chatfoto_bewaartermijn() then 'verlopen'
           else 'wees'
         end
  from storage.objects o
  where o.bucket_id = 'chatfotos'
    and (
      o.created_at < now() - chatfoto_bewaartermijn()
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
  'De paden die weg mogen: ouder dan de bewaartermijn, of een wees zonder '
  'chatbericht (met een uur respijt). Wist zelf niets — een delete op '
  'storage.objects haalt de rij weg en het bestand niet. QS8-396, 0235.';

-- ⚠️ Onwrikbare regel 4: de `revoke` noemt `authenticated` met zoveel woorden.
--    Alleen de rollover-functie roept dit aan, en die draait als `service_role`.
revoke all on function public.verlopen_chatfotos(integer) from public, anon, authenticated;
revoke all on function public.chatfoto_bewaartermijn() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Een vertrekker laat geen onbereikbare blob achter
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`wis_chatfotos_van_vertrekker()` (0224) deed precies het ene dat de
--    opruimpas onmogelijk maakt: hij wiste de **metadata-rij**.** De blob bleef
--    staan, en daarmee stond hij buiten het bereik van élke SQL-pas — er is dan
--    niets meer dat naar dat pad wijst. Dat is niet "onleesbaar en dus weg";
--    dat is onvindbaar en dus voor altijd.
--
--    De reparatie is de rij juist láten staan en alleen de kóppeling door te
--    knippen. Dan gebeurt er twee dingen, allebei beter dan wat er stond:
--      * meteen onleesbaar — §1 hangt de leesgrens aan het bericht, en er is
--        geen bericht meer dat naar dit pad wijst;
--      * binnen het respijtuur écht weg — `verlopen_chatfotos()` ziet hem als
--        `wees`, en de rollover haalt blob én rij weg met `storage.remove()`.
--
-- ⚠️ Stap 2 en 3 blijven letterlijk zoals ze waren: een bericht dat alléén een
--    foto was, verdwijnt; een bericht met tekst én foto houdt zijn tekst. Wat
--    hier verandert is uitsluitend dat de **bytes** nu ook echt weggaan.
--
-- ⚠️ De `before delete`-volgorde blijft dragend: de FK op `sender_id` is
--    `on delete set null`, dus na de verwijdering is niet meer te zien welke
--    berichten van de vertrekker waren. Deze trigger draait ervóór.
create or replace function public.wis_chatfotos_van_vertrekker()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- 1. Berichten die alléén een foto waren: die rij ís de foto.
  delete from chat_messages m
  where m.sender_id = old.id
    and m.attachment_url is not null
    and btrim(coalesce(m.body, '')) = '';

  -- 2. Berichten met tekst én foto: de tekst blijft, de foto gaat weg.
  update chat_messages m
  set attachment_url = null
  where m.sender_id = old.id
    and m.attachment_url is not null;

  -- 3. De objecten blijven staan — als wees, en dus onleesbaar. De opruimpas
  --    haalt ze op met `verlopen_chatfotos()` en wist ze met `storage.remove()`,
  --    die als enige de blob meeneemt. Zie de kop van deze sectie.
  return old;
end $$;

comment on function public.wis_chatfotos_van_vertrekker() is
  'Knipt de chatfoto''s van een vertrekker los van hun berichten (0224), maar '
  'laat de objecten staan zodat de opruimpas van 0235 de bytes daadwerkelijk '
  'kan weghalen. Een gewiste metadata-rij laat de blob onbereikbaar achter.';

revoke all on function public.wis_chatfotos_van_vertrekker() from public, anon, authenticated;
