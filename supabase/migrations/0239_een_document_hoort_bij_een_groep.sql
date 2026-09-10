-- 0239_een_document_hoort_bij_een_groep.sql — een eigen bucket voor documenten in
-- de groepschat, met een allowlist van precies één type.
--
-- Dossier: docs/decisions/2026-09-10-een-document-is-geen-foto.md
--
-- ROLLBACK-PAD:
--   drop policy if exists chatdocs_select on storage.objects;
--   drop policy if exists chatdocs_insert on storage.objects;
--   drop policy if exists chatdocs_delete on storage.objects;
--   delete from storage.buckets where id = 'chatdocs';
--
--   ⚠️ Die laatste regel alleen als de bucket **leeg** is. Een bucket met
--      objecten weggooien is dataverlies en geen terugdraaien.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ 1. DIT IS DE DERDE KOPIE VAN DEZELFDE VORM, EN DE VEILIGHEID KOMT
--          ERGENS ANDERS VANDAAN
-- ---------------------------------------------------------------------------
--
-- 0222 (`chatfotos`) en 0227 (`bewijsfotos`) zien er identiek uit: dezelfde
-- padvorm, dezelfde vier policies, dezelfde tellers. **Juist daarom is de kans
-- het grootst dat het veiligheidsargument meegekopieerd wordt zonder dat iemand
-- merkt dat het hier niet meer geldt.**
--
-- §6 van `docs/decisions/2026-09-09-een-foto-in-de-chat.md` zegt waaróm het bij
-- een fotobucket niet erg is dat `allowed_mime_types` alleen de **gedeclareerde**
-- header toetst en niet de bytes:
--
--   *"Dat is geen lek, en waarom niet is een eigenschap van de consument: het
--   wordt uitgeleverd vanaf een andere origin, met de opgeslagen content-type,
--   en beland in een `<Image>` — willekeurige bytes renderen niet en voeren
--   niets uit."*
--
-- **Die tweede helft is hier onwaar.** Een document beland niet in een
-- `<Image>`. Het gaat naar de systeembrowser. Een `text/html` of `image/svg+xml`
-- die vanaf de storage-origin wordt uitgeleverd, ís dan uitvoerbare code.
--
-- ⚠️ **De veiligheid is daarmee verhuisd van de consument naar de allowlist,
--    en dat is fragieler.** Bij een foto kon niemand er per ongeluk aan draaien;
--    hier is verbreden één regel in een migratie. Vandaar dat er een
--    **beloftetest** onder ligt (`tests/beloftes/een-document-voert-niets-uit.test.ts`)
--    en geen commentaarregel — dat laatste is precies wat 0150 heeft geleerd:
--    een afspraak die alleen in een migratiekop staat, is geen grendel.
--
-- ⚠️⚠️ **En "deze ene array" was het bijna niet, en dat is op 10-09-2026
--    gemeten en niet geredeneerd.** Policies worden over emmers heen ge-OR'd:
--    bij een `update` die `bucket_id` wijzigt dekt de `using` van de brónemmer
--    de oude rij en de `with check` van de dóélemmer de nieuwe, en op
--    databaseniveau kijkt niets terug naar het type. 📏 Met een `chatdocs_update`
--    erin, als `authenticated`:
--
--      update storage.objects set bucket_id = 'chatdocs', name = '<g>/<u>/x.pdf'
--       where bucket_id = 'chatfotos' and name = '<g>/<u>/x.jpg';   → 1 rij
--
--    Vanaf `avatars` net zo. Het effectieve typebereik van deze emmer was dus de
--    unie over élke emmer waar een lid vandaan mag verhuizen — vandaag
--    {pdf, jpeg, png, webp} en alle vier inert, maar dat is een eigenschap van
--    de ándere emmers en niet van deze.
--
--    ✅ **Die route is dicht: er is geen `chatdocs_update`** — zie het blok
--    verderop. Zonder UPDATE-policy op de doelemmer voldoet de nieuwe rij aan
--    geen enkele `with check`, en dan is de verhuizing hierhéén onmogelijk.
--    📏 Nagemeten na het intrekken: dezelfde `update` geeft nul rijen.
--
-- ⚠️ **Wat er wél open blijft is de aanname bij de buurman.** `avatars` en
--    `bewijsfotos` dragen hun UPDATE-recht nog, dus daartússen kan het nog, en
--    een vijfde emmer met `image/svg+xml` erin (heel gewoon, voor iconen) is er
--    één die niemand hier komt lezen. Daarom leest de beloftetest sinds 10-09
--    **elke** `insert into storage.buckets` in de hele migratiemap en niet
--    alleen die hieronder, en staat de rest van die klasse als QS8-407 open.
--
-- ---------------------------------------------------------------------------
-- 2. Waarom precies `application/pdf` en niets anders
-- ---------------------------------------------------------------------------
--
-- De vraag is niet "welk formaat is gangbaar" maar **"routeert een browser dit
-- ooit naar de HTML-parser, direct of via XSLT"**. Bij twijfel is het antwoord
-- nee.
--
--   text/html, application/xhtml+xml,        nooit — actief
--   image/svg+xml, application/xml,
--   text/xml, text/xsl                        (XML met XSLT rendert HTML)
--   text/plain                                nee — historisch sniffbaar
--   application/octet-stream                  nee — ontkoppelt type van extensie
--                                                  en laat daarmee álles binnen
--   application/pdf                           ja — gaat naar de PDF-viewer
--
-- ⚠️ **Wat er wél doorheen komt en aanvaard is:** een échte, welgevormde PDF met
--    JavaScript erin. In de ingebouwde viewers van Chrome en Safari grotendeels
--    inert; wie hem downloadt en in Acrobat opent, voert hem uit. Dat is vanuit
--    deze repository niet te sluiten en het staat als aanvaard restrisico in
--    `docs/ENGINEER-REVIEW.md` — dezelfde klasse als de bearer-token-aanvaarding
--    van §5 van het chatfotodossier.
--
-- ⚠️ `.docx`/`.xlsx` zijn verdedigbaar (ZIP-container, inert, geen macro's in de
--    `x`-varianten) en zijn één migratie erbij. Ze horen een eigen besluit te
--    zijn, want elk type verbreedt de allowlist én de kiezer, en de app kan ze
--    tóch niet tonen.
--
-- ---------------------------------------------------------------------------
-- 3. Een eigen bucket, en deze keer niet om de reden van 0227
-- ---------------------------------------------------------------------------
--
-- Bij `bewijsfotos` dwong een **andere sleuteldimensie** een tweede emmer af.
-- Die reden geldt hier niet: de sleutel is identiek aan die van `chatfotos`
-- (`<group_id>/<sender_id>/`). De reden is een andere en hij is beslissend:
--
-- ⚠️ **`file_size_limit` en `allowed_mime_types` staan per bucket, en er is geen
--    manier om er twee waarden in te zetten.** Zou dit in `chatfotos` opgaan,
--    dan is de uitkomst de **unie**: het fotopad accepteert dan `application/pdf`
--    op 5 MB, en een "foto" van 5 MB belandt in een `<Image>`. Het smalle
--    typeslot van 0222 — het énige dat SVG buitenhoudt — gaat dan open.
--
-- En de dagtellers van 0233 sleutelen op `(<emmer>, 'groep', <groep>)`: één
-- emmer is één pot, dus twintig foto's zouden elk document blokkeren terwijl de
-- kostenprofielen (1 MB tegen 5 MB) totaal verschillen.
--
-- ---------------------------------------------------------------------------
-- 4. De grootte, voorgerekend
-- ---------------------------------------------------------------------------
--
-- De gratis tier geeft 1 GB voor het héle project, nu gedeeld door **vier**
-- emmers. Per groep per etmaal, in het slechtste geval:
--
--   avatars       10/gebruiker × 2 MB
--   chatfotos     20/groep     × 1 MB  =  20 MB per groep
--   bewijsfotos   10/uploader  × 1 MB
--   chatdocs       4/groep     × 5 MB  =  20 MB per groep
--
-- ⚠️ **De regel achter die getallen is belangrijker dan de getallen zelf:
--    byte-pariteit met `chatfotos`.** Een document is vijf keer zo groot, dus er
--    mogen er vijf keer zo weinig. Wie dit later verruimt, redeneert in bytes en
--    niet in stuks.
--
-- ⚠️ En eerlijk: 20 MB per groep per etmaal vult 1 GB in vijftig groepsdagen.
--    **Het plafond is een rem en geen budget.** Wat de tier vandaag beschermt is
--    dat er nog geen gebruikers zijn.
--
-- 1 MB zou onbruikbaar zijn: dat is twee tot vier gescande pagina's op 150 dpi.
-- De bestanden die mensen wíllen delen — een gescand formulier, een
-- trainingsschema — zitten op 1 tot 4 MB.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chatdocs',
  'chatdocs',
  false,
  -- TODO(paid-tier): 5 MB is een rem tegen het vollopen van de gratis tier en
  -- geen productkeuze. Zie §4.
  5242880,
  -- ⚠️ Eén type, en de beloftetest bewaakt dat er geen actief type bij komt.
  array['application/pdf']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- De vier policies — de vorm van 0225 en niet die van 0222
-- ---------------------------------------------------------------------------
--
-- ⚠️ `[0-9a-f]` en niet `[0-9a-fA-F]`, en precies twee mappen diep. Dat is de
--    reparatie die 0225 nodig had nadat het dagplafond van `chatfotos` met
--    hoofdletters te omzeilen bleek: de uuid-cast is hoofdletterongevoelig, de
--    teller vergelijkt tekst en is dat niet.
--
-- ⚠️ De cast staat in een `case` en niet achter een `and`: Postgres garandeert
--    die volgorde niet, en één object met een niet-uuid eerste segment sloopt
--    dan de héle lijstquery in plaats van alleen die rij (gat 1 van 0130).
--
-- ⚠️ `mag_groep_lezen()` leest, `is_group_member()` schrijft. Dat is geen smaak
--    maar een grendel: `archiefleesgat()` (0153) wordt rood bij een leespolicy
--    langs `is_group_member()` én bij een schrijvende langs `mag_groep_lezen()`.
--    Een gearchiveerde groep is leesbaar en niet beschrijfbaar.

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
  );

drop policy if exists chatdocs_insert on storage.objects;

create policy chatdocs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatdocs'
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
    -- ⚠️ **De vorm van de bestandsnaam hoort in de policy en niet alleen in
    --    `chatdocPad()`.** 📏 Gemeten in de securityronde van 10-09-2026: een lid
    --    plaatste `<groep>/<zelf>/evil.html` in deze emmer. Onbereikbaar vandaag —
    --    de CHECK van 0239 eist `.pdf`, dus geen bericht kan ernaar wijzen — maar
    --    "het pad eindigt op .pdf" was daarmee een eigenschap van de cliënt, en dit
    --    is de laag die dat hoort te weten. `array_length(...) = 2` hierboven pint
    --    de diepte; deze regel pint de naam.
    --
    -- ⚠️ Alleen op de twee schrijfpaden. Op `delete` zou hij een object dat er om
    --    wat voor reden dan ook al staat, onverwijderbaar maken — een grendel die
    --    de opruiming tegenhoudt in plaats van de plaatsing.
    and name ~ '/[A-Za-z0-9._-]{1,80}\.pdf$'
  );

-- ---------------------------------------------------------------------------
-- ⚠️⚠️ GEEN UPDATE-RECHT, EN DAT IS EEN BESLUIT DAT OP 10-09-2026 LANDDE
-- ---------------------------------------------------------------------------
--
-- Hier stond een `chatdocs_update` in de vorm van 0222. Die is er niet meer, om
-- dezelfde reden als in §1b van 0235 (QS8-396): die migratie trok
-- `chatfotos_update` in terwijl deze branch openstond, en de nieuwste emmer
-- hoort niet de losste te zijn.
--
-- Twee dingen die het recht opende, allebei gemeten:
--
--   1. **Het dagplafond was met één vlag te omzeilen.** `insert … on conflict do
--      update` vuurt de BEFORE INSERT-trigger — die slaagt, want de teller groeit
--      niet mee — en de verhuistrigger niet, dus er komt geen tel bij. Dat is
--      `upload(..., { upsert: true })` als ongelimiteerde ingress op een tier die
--      5 GB per maand meet. 📏 Gemeten bij 0235 op `chatfotos`: één nette upload
--      gaf één tellerrij, vijftig upserts daarna óók één.
--
--   2. **Een lid kon zijn eigen object naar een ándere emmer verhuizen.** 📏 In
--      de securityronde van 10-09-2026 gemeten en zelf nageverifieerd, als
--      `authenticated` met echte claims:
--
--        update storage.objects set bucket_id = 'chatdocs', name = '<g>/<u>/x.pdf'
--         where bucket_id = 'chatfotos' and name = '<g>/<u>/x.jpg';   → 1 rij
--
--      Policies worden over emmers heen ge-OR'd — de `using` van de brónemmer
--      dekt de oude rij en de `with check` van de doelemmer de nieuwe — dus het
--      effectieve typebereik van deze emmer was de unie over alle vier. Vandaag
--      inert, morgen niet. Wat er van die klasse overblijft, staat in QS8-407.
--
-- ⚠️ **En het recht had sowieso geen reden.** 📏 Nagelopen in de hele app:
--    `uploadChatdoc()` doet `upsert: false`, en er is geen `.move()` en geen
--    `.copy()` in `src/` of `app/`. Geen recht zonder reden — zelfde regel als
--    bij het bewerkrecht op `chat_messages` in 0193.
--
-- ⚠️ **Onwrikbare regel 1 vraagt vier policies per tabel, en dit zijn er drie.**
--    `storage.objects` is niet onze tabel maar die van de opslagdienst; vier
--    policies zijn hier een emmer-conventie en geen tabelregel, en `chatfotos`
--    draagt er sinds 0235 ook drie. Een vierde die niemand gebruikt is precies
--    wat 0193 een *recht zonder knop* noemde.
--
-- ⚠️ Het restrisico is hetzelfde als daar, en het staat in
--    `docs/ENGINEER-REVIEW.md`: of de Storage-API bij een gewone upload zélf een
--    rij bijwerkt namens `authenticated`, is op de lokale steiger niet te meten —
--    die tabel is een schil met vijf kolommen. Zo ja, dan faalt het versturen
--    zichtbaar en is dit één regel terug.

drop policy if exists chatdocs_update on storage.objects;

drop policy if exists chatdocs_delete on storage.objects;

create policy chatdocs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatdocs'
    and array_length(storage.foldername(name), 1) = 2
    and is_group_member(
          case
            when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid
          end
        )
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
