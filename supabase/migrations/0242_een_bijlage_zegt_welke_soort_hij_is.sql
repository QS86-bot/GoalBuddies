-- 0242_een_bijlage_zegt_welke_soort_hij_is.sql — de kolomgrens wordt aan de
-- soort gepaard, en een document krijgt zijn oorspronkelijke naam.
--
-- Dossier: docs/decisions/2026-09-10-een-document-is-geen-foto.md
--
-- ROLLBACK-PAD:
--   alter table public.chat_messages drop constraint if exists chat_messages_attachment_name_vorm;
--   alter table public.chat_messages drop constraint if exists chat_messages_doc_heeft_naam;
--   alter table public.chat_messages drop constraint if exists chat_messages_attachment_eigen_pad;
--   -- daarna de CHECK van 0223 opnieuw zetten (type <> 'system', alleen beeldextensies),
--   alter table public.chat_messages drop column if exists attachment_name;
--   revoke insert on public.chat_messages from public, anon, authenticated;
--   grant insert (group_id, sender_id, body, type, system_event, attachment_url)
--     on public.chat_messages to authenticated;
--   drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);
--   -- en tot slot groepschat() terugzetten in de vorm van vóór deze migratie,
--   -- mét de revoke/grant eronder.
--
-- ---------------------------------------------------------------------------
-- 1. De soort is het enige dat zegt waartegen je moet tekenen
-- ---------------------------------------------------------------------------
--
-- `attachment_url` draagt `<groep>/<afzender>/<naam>.<ext>` — **zonder emmer**.
-- Dat was geen probleem zolang er één was. Met twee emmers op dezelfde padvorm
-- is `chat_messages.type` het enige dat vertelt of dit pad in `chatfotos` of in
-- `chatdocs` staat.
--
-- Deze CHECK is wat dat waarmaakt: **de extensie bepaalt de emmer, want de
-- extensie is aan de soort gepaard.** De client leidt de emmer af uit `type` en
-- nooit uit een parameter.
--
-- ⚠️⚠️ Zonder die paring laten twee losse correcte takken — een goede fotoregel
--    en een goede documentregel — zich probleemloos samenvoegen tot een CHECK
--    die een `photo`-rij naar een `.pdf` laat wijzen. **En dat breekt niets
--    zichtbaars**: de client tekent tegen de verkeerde emmer, krijgt `null`, en
--    de bubbel zegt "niet meer beschikbaar". Geen enkele onderdeeltest wordt
--    daar rood van. Vandaar `tests/rls/een-document-is-wat-het-zegt.test.ts`.
--
-- ⚠️ **`type <> 'system'` is verdwenen en dat is een verstrakking, geen
--    omissie.** `type = 'photo' or type = 'doc'` is strikt smaller: het sluit
--    `system` uit én `text`, en dat laatste liet de oude CHECK toe. Een
--    tekstbericht met een bijlage is onzin en kon tot nu toe bestaan. Niets
--    schrijft het vandaag, dus er breekt niets.
--
-- ---------------------------------------------------------------------------
-- 2. De naam is gebruikerstekst, en dat heeft drie gevolgen
-- ---------------------------------------------------------------------------
--
-- Bij een foto heet het bestand `<tijd>-<toeval>.jpg` en niemand mist de
-- oorspronkelijke naam. Bij een document ís `jaarrekening-2026.pdf` de helft van
-- de informatie. Die naam gaat daarom in een eigen kolom — niet in het pad (dat
-- zou de vorm-CHECK breken en emoji uitsluiten) en niet in `payload` (dat is de
-- plek voor systeemberichtgetallen).
--
-- ⚠️ **`char_length` telt codepunten**, gelijk aan `telTekens()` uit
--    `src/shared/tekst`, en dat is wat de database telt. Zod's `.length` telt
--    UTF-16-eenheden en is altijd >= deze grens; bij een **boven**grens is dat
--    de veilige kant op, maar de client moet toch met `telTekens()` tellen,
--    anders wijst de teller onder het invoerveld iets anders aan dan de database
--    weigert. Zie `docs/decisions/2026-08-28-tekst-zonder-grens.md`.
--
-- ⚠️⚠️ **De tekenklasse sluit bidi-overrides uit, en dát is de reden dat deze
--    CHECK bestaat en niet alleen een lengtegrens is.** Met een RLO (U+202E)
--    erin rendert een naam in de bubbel achterstevoren: wat er staat als
--    `verslag<RLO>fdp.exe` leest de gebruiker als `verslagexe.pdf`, terwijl het
--    pad `.pdf` zegt en de bytes iets anders zijn. Dat is een leugen die de app
--    met het vertrouwen van de groep erachter vertelt.
--
--    De klasse dekt de besturingstekens, DEL, LRM/RLM, de vijf embedding- en
--    override-tekens (U+202A t/m U+202E), de vier isolaten (U+2066 t/m U+2069)
--    en de padscheider.
--
-- ⚠️ **Emoji mógen erin** (QS8-111: de gebruiker mag ze overal typen). De klasse
--    raakt ze niet.
--
-- 📏 Gemeten tegen deze database, vóór de migratie:
--
--      verslag<RLO>fdp.exe     geweigerd
--      jaarrekening-2026.pdf   toegelaten
--      verslag <emoji>.pdf     toegelaten
--      ../etc/passwd           geweigerd
--      a<newline>b.pdf         geweigerd
--
-- ⚠️ En de getoonde soort in de UI komt uit het **pad**, dat door de CHECK van §1
--    vastligt, en niet uit de naam. Zo kunnen die twee nooit misleidend uit
--    elkaar lopen.
--
-- ---------------------------------------------------------------------------
-- 3. De RPC krijgt de naam, en verder verandert er niets
-- ---------------------------------------------------------------------------
--
-- ⚠️ `create or replace` kán niet: de returntable krijgt een kolom erbij en dat
--    is een ander returntype. De `drop` noemt daarom de **handtekening** en niet
--    alleen de naam — een drop van `f(uuid, timestamptz, uuid, integer)` dekt
--    geen andere `f`, en een controle die op naam vergelijkt laat precies die
--    bug door (CLAUDE.md, onwrikbare regel 20).
--
-- ⚠️ Een gedropte functie neemt zijn grants mee en erft daarna van
--    `alter default privileges`. De revoke/grant onderaan is dus geen opsmuk;
--    `functiegrants.test.ts` wordt rood zonder. `security invoker` blijft, en
--    het lichaam is letterlijk overgenomen uit `pg_get_functiondef()` met alleen
--    de kolom erbij.

alter table public.chat_messages
  add column if not exists attachment_name text;

alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_eigen_pad;

alter table public.chat_messages
  add constraint chat_messages_attachment_eigen_pad check (
    attachment_url is null
    or (
      sender_id is not null
      and (
        (type = 'photo' and attachment_url ~ (
          '^' || group_id::text || '/' || sender_id::text
              || '/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'))
        or
        (type = 'doc' and attachment_url ~ (
          '^' || group_id::text || '/' || sender_id::text
              || '/[A-Za-z0-9._-]{1,80}\.pdf$'))
      )
    )
  );

alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_name_vorm;

-- ⚠️⚠️ **De tekenklasse dekt de hele Cf-familie die een label kan vervalsen of
--    breken, en niet alleen de overrides.** 📏 De eerste versie noemde
--    `\u200E\u200F` en liet U+061C (ARABIC LETTER MARK), U+200B–U+200D
--    (zero-width) en U+2028/2029 (line/paragraph separator) door — gemeten in de
--    securityronde van 10-09-2026. Geen van drieën is een override, dus
--    `verslag<RLO>fdp.exe` bleef dicht; wat er fout aan was, is dat twee van de
--    drie bidi-marks geweigerd werden en de derde niet. Dat is een willekeurige
--    grens, en een willekeurige grens is er een die de volgende lezer verschuift.
--
-- ⚠️ Eén klasse, twee plekken: `schoneBestandsnaam()` in
--    `src/modules/buddies/chatdoc.ts` draagt dezelfde tekens, en
--    `tests/beloftes/een-document-voert-niets-uit.test.ts` legt ze naast elkaar.
--    Verruim je de een, dan is de ander een rode test en geen vergeten regel.
alter table public.chat_messages
  add constraint chat_messages_attachment_name_vorm check (
    attachment_name is null
    or (
      type = 'doc'
      and attachment_url is not null
      and char_length(attachment_name) between 1 and 120
      and attachment_name !~ '[\u0000-\u001F\u007F\u061C\u200B-\u200F\u202A-\u202E\u2028\u2029\u2066-\u2069/]'
    )
  );

alter table public.chat_messages
  drop constraint if exists chat_messages_doc_heeft_naam;

-- ⚠️ De tegenhanger van de CHECK hierboven: een document zónder naam geeft een
--    bubbel zonder onderwerp, en het scherm heeft dan niets te tonen.
--
-- ⚠️⚠️ **De eis hangt aan de bijlage en niet aan de soort, en dat is geen
--    slordigheid maar een botsing die de database gevonden heeft.**
--    `stamp_chat_message()` maakt `type` **onveranderlijk**: *"id, group_id,
--    type, system_event, created_at, payload en de drie persoonskolommen liggen
--    vast zodra het bericht er staat."* Een `doc`-rij kan zijn soort dus nooit
--    meer kwijt.
--
--    📏 De eerste versie eiste `type <> 'doc' or attachment_name is not null` en
--    liet 0243 de soort op `text` terugzetten bij een accountverwijdering. Dat
--    werd geweigerd:
--
--      delete from profiles where id = <a>
--      → Aan een chatbericht zijn alleen de tekst en de bijlage te wijzigen
--
--    De keuze was toen: de onveranderlijkheidsgrendel verruimen, of deze CHECK
--    aan de bijlage hangen. **Het eerste mag niet** — `type` is precies het veld
--    dat bepaalt tegen welke emmer de client tekent (§1), en dat hoort het
--    minst veranderlijke veld van de rij te zijn.
--
--    Dus: een document draagt een naam **zolang het een bijlage heeft**. Gaat de
--    bijlage weg (AVG, 0243), dan gaat de naam mee — die is zelf een
--    persoonsgegeven — en blijft er een `doc`-rij zonder bijlage over. Het scherm
--    toont daar "dit document is niet meer beschikbaar", en dat is waar.
alter table public.chat_messages
  add constraint chat_messages_doc_heeft_naam check (
    attachment_url is null
    or type <> 'doc'
    or attachment_name is not null
  );

-- ⚠️ De kolomgrant somt élke kolom op. Laat je er één weg, dan faalt de insert
--    met 42501 — dat is het defect van 0089, en `kolomrechten:controle` bewaakt
--    dat er geen grant zonder schrijfpad overblijft.
revoke insert on public.chat_messages from public, anon, authenticated;
grant insert (group_id, sender_id, body, type, system_event, attachment_url, attachment_name)
  on public.chat_messages to authenticated;

drop function if exists public.groepschat(uuid, timestamptz, uuid, integer);

CREATE OR REPLACE FUNCTION public.groepschat(p_group_id uuid, p_before_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, sender_id uuid, sender_name text, sender_avatar text, body text, type text, attachment_url text, attachment_name text, system_event text, subject_id uuid, subject_name text, actor_id uuid, actor_name text, payload jsonb, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    m.id,
    m.sender_id,
    p.display_name,
    p.avatar_url,
    m.body,
    m.type,
    m.attachment_url,
    m.attachment_name,
    m.system_event,
    m.subject_id,
    s.display_name,
    m.actor_id,
    a.display_name,
    m.payload,
    m.created_at
  from chat_messages m
  left join profiles p on p.id = m.sender_id
  left join profiles s on s.id = m.subject_id
  left join profiles a on a.id = m.actor_id
  where m.group_id = p_group_id
    and (
      p_before_at is null
      or p_before_id is null
      or (m.created_at, m.id) < (p_before_at, p_before_id)
    )
  order by m.created_at desc, m.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$function$;

revoke all on function public.groepschat(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.groepschat(uuid, timestamptz, uuid, integer) to authenticated;
