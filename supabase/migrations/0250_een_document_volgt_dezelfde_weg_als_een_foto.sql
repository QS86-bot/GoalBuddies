-- 0250_een_document_volgt_dezelfde_weg_als_een_foto.sql — de leesgrens van
-- `chatdocs` hangt voortaan aan het bericht, er is een opruimpas met een
-- bewaartermijn, en een vertrekker laat geen onbereikbare blob meer achter.
--
-- Issue: QS8-408 · Dossier: docs/decisions/2026-09-10-een-document-is-geen-foto.md §5
--
-- ROLLBACK-PAD:
--   drop index if exists storage.objects_bijlage_ouderdom_idx;
--   drop function if exists public.verlopen_chatdocs(integer);
--   drop function if exists public.chatdoc_bewaartermijn();
--   -- daarna 0240 §"policies" opnieuw uitvoeren voor de padgebonden
--   -- `chatdocs_select`, en 0243 voor de vorm van
--   -- `wis_bijlagen_van_vertrekker()` mét de `delete from storage.objects`.
--
--   ⚠️ Terugdraaien zonder die twee is een lek en geen herstel: de policy blijft
--      dan berichtgebonden terwijl de opruimpas weg is, en dan blijven wezen
--      staan die niemand meer opruimt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Op 10-09-2026 landden QS8-396 (0235) en QS8-72 (0240 t/m 0243) op dezelfde
-- dag, uit twee sessies naast elkaar. De eerste vorm van 0243 draaide §4 van
-- 0235 terug — twee verschillende bestanden, hetzelfde functielichaam, geen
-- git-conflict. Twee tests van QS8-396 werden er rood van, en dát heeft het
-- gevonden.
--
-- Bij het repareren bleef er een asymmetrie staan die geen besluit was:
--
--                          | chatfoto            | chatdoc
--   bij accountverwijdering| blijft staan (wees) | wordt gewist
--   waarom                 | een wees is meteen  | een wees blijft leesbaar
--                          | onleesbaar          | voor élk groepslid
--   de prijs               | geen                | de blob blijft achter en is
--                          |                     | vanuit SQL onopruimbaar
--
-- Dat verschil kwam volledig uit de leespolicy: `chatfotos_select` hangt sinds
-- 0235 §1 aan het **bericht**, `chatdocs_select` hing aan het **pad**. Deze
-- migratie haalt de oorzaak weg, en dan mag de rest gelijkgetrokken worden.
--
-- ---------------------------------------------------------------------------
-- 1. De leesgrens hangt aan het bericht
-- ---------------------------------------------------------------------------
--
-- Woordelijk de vorm van 0235 §1, met `chatdocs` in plaats van `chatfotos`.
-- Wat daar staat geldt hier onverkort en wordt niet herhaald; wat hier ánders
-- is, staat hieronder.
--
-- ⚠️ **De index van 0235 dekt dit al.** `chat_messages_bijlage_idx` staat op
--    `attachment_url where attachment_url is not null` en kent geen emmer — het
--    pad is de sleutel, en die is voor beide emmers dezelfde kolom. Een tweede
--    index zou dezelfde rijen nog een keer indexeren.
--
-- ⚠️⚠️ **Het eigenaarsbeen moet mee, en dat is bij een document dwingender dan
--    bij een foto.** Postgres past de SELECT-policy óók toe op `delete … where`,
--    dus zonder die tak kan de plaatser zijn eigen wees niet opruimen. Bij de
--    foto stierf daarmee de compenserende opruiming in `chat.ts`; bij het
--    document geldt hetzelfde pad — `stuurBericht()` doet upload → insert, en
--    ruimt bij een mislukte insert het object op met `verwijderChatdoc()`.
--    Zonder de tak faalt dat stil: `remove()` geeft geen fout op nul rijen.
--
-- ⚠️ **Dit breekt het verzenden niet.** 📏 Nagelopen in `chat.ts` en
--    `chatdoc.ts`: er wordt nergens een ondertekende URL gemaakt vóór de insert.
--    `tekenChatdoc()` draait pas op een tik, en dan ís er een bericht — dat is
--    zelfs sterker dan bij de foto, waar de pagina tekent zodra de rij binnen
--    is.

drop policy if exists chatdocs_select on storage.objects;

create policy chatdocs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatdocs'
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
      or (storage.foldername(name))[2] = (select auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- 2. De bewaartermijn — eenentwintig dagen, en dat is een aanname
-- ---------------------------------------------------------------------------
--
-- **Besluit van Quinten, 10-09-2026: 21 dagen** — gelijk aan de chatfoto.
--
-- ⚠️⚠️ **Dit is bewust gevráágd en niet aangenomen, en dat is de uitzondering op
--    de gewoonte.** CLAUDE.md zegt: kies zelf en bouw door. Deze keuze raakt
--    allebei de grenzen uit *Beslisbevoegdheid* tegelijk: de app **toont** de
--    termijn aan de gebruiker (grens 1 — wat er tegen een mens beloofd wordt) en
--    de rollover **wist er onherroepelijk bestanden mee** op een tier zonder
--    backups (grens 2). Een rollback zet de pas uit en zet geen documenten terug.
--
--    Het alternatief dat is afgewogen en niet gekozen: een langere termijn voor
--    documenten, omdat een gescand formulier of een trainingsschema vaker ná drie
--    weken teruggezocht wordt dan een kiekje. Quinten koos één termijn voor alle
--    bijlagen — één zin in de interface, één ding om te onthouden.
--
--    Verandert dat ooit, dan is het één getal hier en één in
--    `CHATDOC_BEWAARDAGEN`, en de test hieronder wijst je erop als je er maar één
--    aanpast.
--
-- ⚠️ **Een eigen functie en niet `chatfoto_bewaartermijn()` hergebruiken.** De
--    twee zijn vandaag gelijk en dat is toeval, geen regel: het zijn twee
--    productkeuzes over twee soorten inhoud. Ze delen wél een test die vastlegt
--    dát ze vandaag gelijk zijn, zodat een toekomstig verschil een besluit is en
--    geen drift.
--
-- ⚠️ Geen cyclusrekenwerk: eenentwintig dagen is een leeftijd en geen week, dus
--    dit mag in SQL staan (correctheidsregel 7). Zelfde afweging als 0235 §3.

-- ⚠️⚠️ **Onwrikbare regel 11, en dit repareert óók de pas van 0235.** 📏 Gemeten
--    in de securityronde en zelf nagedaan:
--
--      explain: Limit -> Sort (Sort Key: created_at) -> Seq Scan on objects
--
--    `storage.objects` draagt alleen `objects_pkey`, `objects_bucket_id_name_key`
--    en een partiële op `avatars`; op `created_at` staat niets. Elke ronde van de
--    rollover scande dus de héle objecttabel, en sinds deze migratie twee keer.
--
--    Dat is geen lek maar een job die op de gratis tier stil in zijn tijdslimiet
--    loopt — en dán wordt de bewaartermijn onwaar zonder dat er iets rood wordt,
--    want een lage `bijlagenOpgeruimd` is niet te onderscheiden van "er was niets
--    op te ruimen". Precies de open rij die daarover al in
--    `docs/ENGINEER-REVIEW.md` staat.
--
-- ⚠️ Eén partiële index voor beide emmers: de twee passen filteren op dezelfde
--    twee kolommen, en de `where` houdt hem klein.
create index if not exists objects_bijlage_ouderdom_idx
  on storage.objects (bucket_id, created_at)
  where bucket_id in ('chatfotos', 'chatdocs');

create or replace function public.chatdoc_bewaartermijn()
returns interval
language sql
immutable
set search_path = public, pg_catalog, pg_temp
as $$ select interval '21 days' $$;

comment on function public.chatdoc_bewaartermijn() is
  'Hoe lang een gedeeld document op de server blijft (QS8-408): 21 dagen. '
  'Gelijk aan chatfoto_bewaartermijn(), maar een eigen keuze — zie 0250 §2. '
  'Een plek, zodat de melding in de app en de opruimpas niet uiteenlopen.';

-- ---------------------------------------------------------------------------
-- 3. De opruimpas — wat er weg mag, niet wat er weg gáát
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze functie verwijdert niets, en dat is geen halve maatregel.** Een
--    `delete from storage.objects` haalt de metadata-rij weg en laat de blob
--    staan; alleen de Storage-API (`.remove()`) haalt allebei weg. De database
--    bepaalt **wat** er weg mag, de rollover voert het uit. Zelfde arbeidsdeling
--    en dezelfde reden als 0235 §3.
--
-- ⚠️ **De respijttermijn is dragend en geen marge.** Een upload die net geslaagd
--    is heeft nog geen berichtrij — dat venster is de hele reden dat wezen
--    bestaan. Zou de pas die meteen meenemen, dan wist hij het document dat op
--    ditzelfde moment verstuurd wordt. Een uur is ruim; een document is hooguit
--    5 MB en de client doet upload en insert achter elkaar.
--
-- ⚠️ **Een zusterfunctie en geen gedeelde `verlopen_bijlagen(emmer)`.** Dat is
--    afgewogen en niet vergeten. De twee passen delen hun *vorm* en niet hun
--    *regel*: de emmer en de termijn zijn per soort inhoud een eigen keuze, en
--    het lichaam is vier regels. Wat wél zou gaan rotten als het twee keer
--    bestond, is de uitvoerende helft — het blokgewijs wissen, het aftoppen, het
--    doortellen bij een fout — en díé staat sinds deze wijziging één keer in
--    `supabase/functions/rollover/index.ts`.
--
--    De tegenproef die dit project kent (0233/0234: *"twee tellers voor één
--    regel is een halve familie"*) gaat over twee grendels die dezélfde regel
--    moesten handhaven. Dit zijn er twee met elk een eigen getal.

create or replace function public.verlopen_chatdocs(p_limiet integer default 500)
returns table (pad text, reden text)
language sql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select o.name,
         case
           when o.created_at < now() - chatdoc_bewaartermijn() then 'verlopen'
           else 'wees'
         end
  from storage.objects o
  where o.bucket_id = 'chatdocs'
    and (
      o.created_at < now() - chatdoc_bewaartermijn()
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

comment on function public.verlopen_chatdocs(integer) is
  'De documentpaden die weg mogen: ouder dan chatdoc_bewaartermijn(), of een '
  'wees zonder chatbericht (met een uur respijt). Wist zelf niets — een delete '
  'op storage.objects haalt de rij weg en het bestand niet. QS8-408, 0250.';

-- ⚠️ Onwrikbare regel 4: de `revoke` noemt `authenticated` met zoveel woorden.
--    Alleen de rollover roept deze twee aan, en die draait als `service_role`.
revoke all on function public.verlopen_chatdocs(integer) from public, anon, authenticated;
revoke all on function public.chatdoc_bewaartermijn() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Een vertrekker laat nu ook bij een document een wees achter
-- ---------------------------------------------------------------------------
--
-- Dit is de reparatie die 0243 §5 aankondigde en niet kon doen. Nu §1 er is, is
-- een verweesd document meteen onleesbaar — er is geen bericht meer dat naar dat
-- pad wijst — en haalt de pas van §3 blob én rij weg binnen de bewaartermijn.
--
-- ⚠️⚠️ **Het weglaten van de `delete` ís de reparatie, en dat leest averechts.**
--    De rij láten staan is wat het bestand écht doet verdwijnen; hem wissen liet
--    de blob achter op een plek waar geen enkele SQL-pas nog bij kan — *"niet
--    onleesbaar en dus weg, maar onvindbaar en dus voor altijd"* (0235 §4).
--
-- ⚠️ Het lichaam is verder woordelijk dat van 0243, inclusief de nulstelling van
--    `attachment_name`. Die is dwingend en geen nettigheid: `attachment_url` op
--    `null` zetten terwijl de naam blijft staan, valt om op
--    `chat_messages_attachment_name_vorm` (0242) en breekt accountverwijdering.
--
-- ⚠️ De functie heet nog steeds `wis_bijlagen_van_vertrekker` en dekt nu voor
--    beide emmers hetzelfde: hij knipt de kóppeling door en wist geen objecten
--    meer. De naam noemt nog steeds de eigenschap.

create or replace function public.wis_bijlagen_van_vertrekker()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  -- 1. Berichten die alléén een bijlage waren: die rij ís de bijlage.
  delete from chat_messages m
  where m.sender_id = old.id
    and m.attachment_url is not null
    and btrim(coalesce(m.body, '')) = '';

  -- 2. Berichten met tekst én een bijlage: de tekst blijft, de bijlage gaat weg.
  --
  -- ⚠️ `type` blijft staan: `stamp_chat_message()` maakt hem onveranderlijk, en
  --    de naam-CHECK van 0242 hangt daarom aan de bijlage en niet aan de soort.
  update chat_messages m
  set attachment_url = null,
      attachment_name = null
  where m.sender_id = old.id
    and m.attachment_url is not null;

  -- 3. De objecten blijven staan — als wees, en dus onleesbaar. De opruimpas
  --    haalt ze op (`verlopen_chatfotos()`, `verlopen_chatdocs()`) en de
  --    rollover wist ze met `storage.remove()`, die als enige de blob meeneemt.
  return old;
end;
$$;

comment on function public.wis_bijlagen_van_vertrekker() is
  'Knipt de bijlagen van een vertrekker los van hun berichten, in beide '
  'chat-emmers, maar laat de objecten staan zodat de opruimpassen de bytes '
  'daadwerkelijk kunnen weghalen. QS8-72 (0243), gelijkgetrokken in QS8-408.';

revoke execute on function public.wis_bijlagen_van_vertrekker() from public, anon, authenticated;
