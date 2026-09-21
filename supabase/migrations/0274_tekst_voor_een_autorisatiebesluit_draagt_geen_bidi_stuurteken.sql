-- 0274_tekst_voor_een_autorisatiebesluit_draagt_geen_bidi_stuurteken.sql
--   — vijf kolommen die iemand leest vlak vóór hij op een knop drukt die iets
--     toestaat.
--
-- ROLLBACK-PAD:
--   alter table public.weekly_goals
--     drop constraint if exists weekly_goals_title_geen_bidi,
--     drop constraint if exists weekly_goals_floor_text_geen_bidi,
--     drop constraint if exists weekly_goals_ceiling_text_geen_bidi;
--   alter table public.completions
--     drop constraint if exists completions_note_geen_bidi;
--   alter table public.deadline_requests
--     drop constraint if exists deadline_requests_reason_geen_bidi;
--   alter table public.weekly_plan_steps
--     drop constraint if exists weekly_plan_steps_title_geen_bidi,
--     drop constraint if exists weekly_plan_steps_floor_text_geen_bidi,
--     drop constraint if exists weekly_plan_steps_ceiling_text_geen_bidi;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-501, voortgekomen uit de security-review op QS8-498 (migratie 0273) en
-- hier op 15-09-2026 opnieuw nagemeten op de lokale stack.
--
-- 0273 grendelde twee kolommen op **twee verschillende criteria**:
--
--   goals.title                   bereikt een niet-lid        (invite_preview)
--   group_join_requests.bericht   wordt gelezen vlak vóór een autorisatiebesluit
--
-- De scopetabel van die migratie liep alleen het eerste criterium na. Langs het
-- tweede — het bredere, en volgens domeinregel 3 het zwaardere, want
-- lidmaatschap en goedkeuring zijn allebei autorisatiegrenzen — vielen er vijf
-- kolommen buiten. Dit bestand draagt die vijf.
--
-- ⚠️ **Het gat is dus niet nieuw en de reparatie is niet dringend geworden; wat
--    nieuw was, is dat iemand de vraag stelde.** De les staat in
--    `docs/decisions/2026-09-15-de-scope-van-een-grendel-is-zelf-een-bewering.md`:
--    een scopetabel wordt gelezen als *"dit is nagegaan"* en niet als *"nagegaan
--    op de vraag die er toevallig boven staat"*.
--
-- ---------------------------------------------------------------------------
-- 1. De goedkeurkaart — vier kolommen op één scherm
-- ---------------------------------------------------------------------------
--
-- 📏 `openstaande_beoordelingen()` geeft ze alle vier terug, en
--    `app/beoordelen.tsx` zet ze in één `Card` boven Bevestigen/Afwijzen:
--
--      weekly_goals.title          de weektitel
--      weekly_goals.floor_text     de vloer  (domeinregel 8)
--      weekly_goals.ceiling_text   het plafond
--      completions.note            het briefje bij de voltooiing
--
--    `goals.title` staat op precies diezelfde kaart en is sinds 0273 wél
--    beschermd; deze vier regels eronder waren dat niet.
--
-- ⚠️ **Waarom een goedkeuring een autorisatiegrens is en geen formaliteit:**
--    domeinregel 3 zegt dat alleen een lid van dezelfde buddy-groep een
--    voltooiing mag goedkeuren, nooit jezelf, afgedwongen in RLS én met een
--    constraint. Wat die grens waard is, hangt af van of de goedkeurder leest
--    wat er staat. Een `ceiling_text` die als iets anders rendert dan hij is,
--    haalt de betekenis uit de handeling zonder één policy te raken.
--
-- ---------------------------------------------------------------------------
-- 2. Het deadlineverzoek — de zwaarste van de vijf
-- ---------------------------------------------------------------------------
--
-- 📏 `deadline_requests.reason` staat als `<Body muted>` in
--    `app/groep/[id].tsx`, **direct boven** de regel
--    `deadlineverzoek.straf_staat_erop` en boven de Akkoord-knop.
--
--    Die regel is de kern van QS8-370 (migratie 0218): hij bestaat zodat niemand
--    blind een commitment device losser maakt. `beslis_deadline_verzoek()` mag
--    een straf vooruit schuiven — dat is de route die 0184 met zoveel woorden
--    openlaat — en dan mag het akkoord niet blind zijn.
--
-- ⚠️⚠️ **Een `reason` die anders rendert dan hij is, is domeinregel 5 langs de
--    tekstkant.** Die regel zegt dat een consequentie nooit stilzwijgend aan
--    gaat; de spiegelzijde, opgeschreven in 0218, is dat hij ook nooit
--    stilzwijgend losser gaat. De waarschuwing dát er een straf op het doel
--    staat is één regel — en die staat ónder een tekst die de aanvrager zelf
--    schrijft. Wie die tekst kan laten renderen als een geruststelling, heeft de
--    grendel van 0218 omzeild zonder hem aan te raken.
--
-- ---------------------------------------------------------------------------
-- 3. Elke schrijver, opgesomd vóór dit issue "opgelost" heet
-- ---------------------------------------------------------------------------
--
-- De les van §7a in `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`.
--
-- 📏 `weekly_goals.title`, `.floor_text`, `.ceiling_text`:
--   1. **`POST`/`PATCH /rest/v1/weekly_goals`** — kolomrechten `true` voor
--      INSERT én UPDATE, en de policies laten de eigenaar erdoor
--      (`weekly_goals_insert` eist `g.owner_id = auth.uid()` plus
--      `weekdoelen_over() > 0`; `_update` eist hetzelfde eigenaarschap). Dit is
--      een echte, open route.
--   2. `schuif_weekdoel_door()` en `weekplanstap_naar_weekdoel()` — allebei
--      `insert into weekly_goals (…, title, floor_text, ceiling_text, …)`. Ze
--      kopiëren bestaande tekst, dus ze kunnen niets binnenbrengen dat er niet
--      al stond — maar ze schrijven de kolom, en dat is wat telt.
--
-- ⚠️⚠️ **En bij die tweede is "kopiëren" precies het probleem, niet de
--    geruststelling.** Hier stond dat een kopiërende schrijver niets nieuws
--    binnenbrengt. Dat klopt over **veiligheid** en is onjuist over **gevolg**:
--    `weekplanstap_naar_weekdoel()` leest uit `weekly_plan_steps`, en die tabel
--    droeg alleen lengte-CHECKs. Een CHECK op de bestemming zonder een CHECK op
--    de bron verandert een geaccepteerde schrijfactie in een **uitgestelde**
--    fout.
--
--    📏 Gemeten op de lokale stack, in een teruggedraaide transactie:
--
--      insert into weekly_plan_steps (…, title, …)   -- 'Stap ' || chr(8238) || …
--        -> INSERT 0 1                                  geaccepteerd
--      insert into weekly_goals (…, title, …)  <- diezelfde tekst
--        -> new row violates check constraint "weekly_goals_title_geen_bidi"
--
--    En waar die fout landt, is het echte bezwaar: `rollover/index.ts` roept
--    `activeer_weekplanstap` aan en doet bij een fout `console.error` gevolgd
--    door `continue`. De gebruiker heeft die week geen weekdoel, ziet nergens
--    waarom, en het herhaalt zich elke week. Via de knop krijgt hij
--    `t('weekplan.starten_mislukt')` — een melding die nooit meer weggaat.
--
--    ⚠️ Dat is regel 18 vraag 5 in zijn zuiverste vorm: elk schakeltje werkt en
--       de keten loopt dood op wáárdeniveau binnen een functie. Geen van de drie
--       sporten — `schermingang:`, `exports:` of `keten:controle` — vindt dit.
--
--    Vandaar dat `weekly_plan_steps` hieronder dezelfde drie CHECKs krijgt. Dat
--    is inhoudelijk ook juister: **een weekplanstap ís het weekdoel van volgende
--    week**, dus hij staat over zeven dagen op precies dezelfde goedkeurkaart.
--
--    ⚠️ En er is een tweede route naar die tabel die de gebruiker niet zelf
--       typt: `maakWeekplan()` schrijft rijen met `ai_generated = true`. Wat het
--       model teruggeeft kan een stuurteken bevatten dat uit `goals.description`
--       geëchood is — die kolom draagt er geen grendel op.
--
-- 📏 `completions.note`:
--   1. **`POST /rest/v1/completions`** — INSERT-grant `true`, policy eist
--      `user_id = auth.uid()` én eigenaarschap van het weekdoel. **UPDATE is
--      dicht**: de kolomgrant voor UPDATE staat op `false`. Dat past bij
--      domeinregel 6 (voltooiingen zijn append-only).
--   2. `dien_opnieuw_in()` — `insert into completions`, neemt de notitie mee.
--
-- 📏 `deadline_requests.reason`:
--   1. `vraag_deadline_verschuiving()` — `insert into deadline_requests (…,
--      reason) values (…, schoon)`, waar `schoon` een `btrim` van de invoer is.
--      Dit is de enige schrijver van de kolom.
--   2. **De directe REST-weg is dícht.** De kolomrechten staan op `true`, maar
--      `deadline_requests_insert` is `with check (false)` en `_update` is
--      `using (false)`. Zelfde vorm als `group_join_requests` in 0273: **een
--      grant is geen route zolang er een policy overheen ligt.**
--
-- ⚠️⚠️ **En dát is waarom de grens een CHECK is en geen policy of grant.** 📏 Een
--    `security definer` komt langs een policy en langs een kolomgrant — hij
--    draait als de eigenaar — maar **niet** langs een CHECK: die wordt tegen de
--    rij getoetst, wie hem ook schrijft. Eén CHECK per kolom dekt dus alle
--    routes hierboven, plus `COPY`, `service_role` en een `pg_restore`.
--
--    De opsomming is daarmee een **controle** en geen afhankelijkheid: hij staat
--    er omdat §7a dat vraagt, niet omdat de grendel erop leunt.
--
-- ---------------------------------------------------------------------------
-- 4. Wat dit níet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen wijziging aan `completions` als tabel.** Die staat in de
--    realtime-publicatie, samen met `weekly_goals` en `chat_messages`. Een
--    CHECK raakt `REPLICA IDENTITY` niet en verandert niets aan wat er over de
--    lijn gaat; het verbod uit CLAUDE.md blijft onverkort gelden en wordt hier
--    niet aangeraakt.
--
-- ⚠️ **Geen spiegel in de client-schema's.** 0270 deed dat voor `groups` niet en
--    0273 voor `goals` niet, om dezelfde reden: één regel op twee plekken is een
--    regel die je maar half verplaatst. 📏 `weekly-schemas.ts`,
--    `completion-schemas.ts` en `deadline-schemas.ts` doen alleen `.trim()` en
--    `.max()`, dus vanaf nu geeft de database op deze velden een CHECK-fout waar
--    de gebruiker een generieke melding ziet.
--
--    ⚠️ Hier stond dat die prijs *"als Laag-rij op de novemberagenda staat"*, en
--       dat was onjuist: de bestaande rij gaat alleen over `doelSchema.title`.
--       Er staat er sinds 15-09-2026 wél een voor deze drie schema's. **Een
--       verwijzing naar een vangnet is zelf een bewering** — dezelfde klasse als
--       de meting die dit issue heeft voortgebracht.
--
-- ⚠️ **Geen nieuwe grant.** `zonder_bidi()` is sinds 0269 gegund aan
--    `authenticated` en dat is genoeg. Een tweede grant erbij zou een recht op
--    twee plekken uitdelen, en dat is een recht dat je maar half intrekt.
--
-- ---------------------------------------------------------------------------
-- 4a. Wat er langs het criterium gelegd is en afviel — en dat is gemeten
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze sectie stond er eerst niet, en juist dit issue bestaat omdat een
--    scopetabel ontbrak.** 0273 §3 liep zes kandidaten na; de opvolger deed dat
--    niet, en dan is er over een half jaar geen spoor dat iemand ze bekeken
--    heeft. De discipline moet meeverhuizen met het probleem.
--
-- Het criterium: *tekst die iemand leest vlak vóór een handeling die iets
-- toestaat.* 📏 Nagelopen door élk scherm met zo'n knop te nemen en te kijken
-- welke vrije tekst erboven staat:
--
--   | besluit                | functie                        | tekst erboven          | gedekt door |
--   |------------------------|--------------------------------|------------------------|-------------|
--   | voltooiing goedkeuren  | `openstaande_beoordelingen()`  | naam, doeltitel,       | 0269, 0273, |
--   |                        |                                | weektitel, vloer,      | **0274**    |
--   |                        |                                | plafond, notitie       |             |
--   | lid aannemen           | `beslis_lidmaatschapsverzoek()`| naam, bericht          | 0269, 0273  |
--   | uitstel toestaan       | `beslis_deadline_verzoek()`    | toelichting            | **0274**    |
--
-- En wat er níet bij hoeft, elk met de reden:
--
--   - **de groepschat** — elke knop is versturen, ouder laden, bijlage kiezen of
--     terug. Geen handeling die iets toestaat.
--   - **de weekafsluiting** — opslaan, reageren, eigen reactie weghalen. Idem.
--   - **het ledenscherm** — vóór "Blokkeer" en "Zet eruit" staat alleen
--     `display_name`, gegrendeld sinds 0269.
--   - **de stuurloze straf** — `herstel_stuurloze_straf()` toont alleen namen;
--     het commitment-lichaam staat niet op die kaart.
--   - **`completion_approvals.comment` en `deadline_requests.decision_note`** —
--     vrije tekst van een groepsgenoot, maar gelezen *ná* het besluit. Opnieuw
--     indienen of een besluit lezen autoriseert niets voor een ander. Dit is de
--     eerstvolgende ring als het criterium ooit verbreedt.
--   - **`commitments.body`** via `getuigenissen()` — staat op het startscherm van
--     de getuige, maar er hoort geen knop bij die kaart. Wel de persoon aan wie
--     de straf verschuldigd wordt (domeinregel 11), dus dit is een randgeval dat
--     verschuift zodra die kaart een handeling krijgt.
--   - **`reports.{reden,toelichting,bericht_kopie}`** — 📏 en dit is de scherpste
--     van de lijst: `reports_select` staat al open voor een beheerder die niet
--     zelf het onderwerp is, en zijn vervolghandeling is `verwijder_lid()` of
--     een blokkade — een echte autorisatiebeslissing. Er is vandaag alleen géén
--     leesscherm (`reports` komt in `app/` nergens voor aan de leeskant) en
--     `reports_update` is `false`. **Dit oppervlak bestaat dus in de database en
--     mist alleen de UI**; komt die er, dan hoort de CHECK er vóór het scherm.
--
-- ⚠️ Zoals altijd: dit is een meting van vandaag en geen eigenschap.
--
-- ---------------------------------------------------------------------------
-- 5. Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269, 0270 en 0273.** Staat dit blok ná de
--    `add constraint`, dan draait het nooit: de ALTER valt om, de transactie is
--    afgebroken, en alles erna wordt overgeslagen. Op productie levert dat een
--    mislukte deploy op met een melding die de rij niet noemt, terwijl het
--    vangnet dat daarvoor geschreven is niet vuurt.
--
-- ⚠️ Bewust geen `not valid`: een bestaande rij met een stuurteken hóórt een
--    mislukte deploy te zijn en geen gegrandfatherde rij. Wat ermee moet
--    gebeuren is een productbeslissing en geen migratiestap.
--
-- 📏 Op de lokale stack vandaag: 0 rijen in alle vijf de kolommen.
begin;

do $$
declare
  v_titel   bigint;
  v_vloer   bigint;
  v_plafond bigint;
  v_notitie bigint;
  v_reden   bigint;
  v_stap    bigint;
begin
  select count(*) filter (where title <> public.zonder_bidi(title)),
         count(*) filter (where floor_text is not null
                            and floor_text <> public.zonder_bidi(floor_text)),
         count(*) filter (where ceiling_text is not null
                            and ceiling_text <> public.zonder_bidi(ceiling_text))
    into v_titel, v_vloer, v_plafond
    from public.weekly_goals;

  select count(*) filter (where note is not null
                            and note <> public.zonder_bidi(note))
    into v_notitie from public.completions;

  select count(*) filter (where reason is not null
                            and reason <> public.zonder_bidi(reason))
    into v_reden from public.deadline_requests;

  select count(*) filter (where title <> public.zonder_bidi(title))
       + count(*) filter (where floor_text is not null
                            and floor_text <> public.zonder_bidi(floor_text))
       + count(*) filter (where ceiling_text is not null
                            and ceiling_text <> public.zonder_bidi(ceiling_text))
    into v_stap from public.weekly_plan_steps;

  if v_titel + v_vloer + v_plafond + v_notitie + v_reden + v_stap > 0 then
    raise notice
      '⚠️ Bidi-stuurtekens gevonden: % in weekly_goals.title, % in floor_text, '
      '% in ceiling_text, % in completions.note, % in deadline_requests.reason, '
      '% in weekly_plan_steps. De CHECKs hierna gaan daarop om en deze migratie '
      'stopt. Bepaal eerst wat er met die teksten gebeurt — dat is een '
      'productbeslissing, geen migratiestap.',
      v_titel, v_vloer, v_plafond, v_notitie, v_reden, v_stap;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. De grens zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **`zonder_bidi()` is `immutable` en al gegund aan `authenticated`** (0269).
--    Die grant is gedeeld en geen detail: Postgres toetst EXECUTE op een functie
--    in een CHECK op het moment van **schrijven**, dus zonder hem valt élke
--    schrijving op deze drie tabellen om op `permission denied for function
--    zonder_bidi` — ook eentje die niets met bidi te maken heeft. 📏 Dat is in
--    0256, 0269, 0270 én 0273 gemeten en het was elke keer bijna een
--    ship-stopper. De must-allow-helft staat daarom in de toetsen.
--
-- ⚠️ **Welke kolom een null-tak krijgt, is nagemeten en niet aangenomen.** 📏
--    `information_schema.columns`:
--
--      weekly_goals.title          not null     -> geen null-tak
--      weekly_goals.floor_text     nullable     -> null-tak
--      weekly_goals.ceiling_text   nullable     -> null-tak
--      completions.note            nullable     -> null-tak
--      deadline_requests.reason    not null     -> de null-tak is dode code
--      weekly_plan_steps.title     not null     -> geen null-tak
--      weekly_plan_steps.floor_text    nullable -> null-tak
--      weekly_plan_steps.ceiling_text  nullable -> null-tak
--
--    ⚠️ Hier stond dat *"de vier andere kolommen nullable zijn"*, en dat was
--       onjuist: `deadline_requests.reason` is `not null` sinds 0032. De
--       null-tak op die CHECK blijft staan — hij kost niets en hij is niet fout
--       — maar de **bewering** moest weg. Dit issue bestaat omdat een kopregel
--       die als vaststelling leest, de volgende lezer belet te twijfelen; dan
--       mag deze kop dat zelf niet doen.
alter table public.weekly_goals
  drop constraint if exists weekly_goals_title_geen_bidi,
  drop constraint if exists weekly_goals_floor_text_geen_bidi,
  drop constraint if exists weekly_goals_ceiling_text_geen_bidi;

alter table public.completions
  drop constraint if exists completions_note_geen_bidi;

alter table public.deadline_requests
  drop constraint if exists deadline_requests_reason_geen_bidi;

alter table public.weekly_plan_steps
  drop constraint if exists weekly_plan_steps_title_geen_bidi,
  drop constraint if exists weekly_plan_steps_floor_text_geen_bidi,
  drop constraint if exists weekly_plan_steps_ceiling_text_geen_bidi;

alter table public.weekly_goals
  add constraint weekly_goals_title_geen_bidi
  check (title = public.zonder_bidi(title)),
  add constraint weekly_goals_floor_text_geen_bidi
  check (floor_text is null or floor_text = public.zonder_bidi(floor_text)),
  add constraint weekly_goals_ceiling_text_geen_bidi
  check (ceiling_text is null or ceiling_text = public.zonder_bidi(ceiling_text));

alter table public.completions
  add constraint completions_note_geen_bidi
  check (note is null or note = public.zonder_bidi(note));

alter table public.deadline_requests
  add constraint deadline_requests_reason_geen_bidi
  check (reason is null or reason = public.zonder_bidi(reason));

alter table public.weekly_plan_steps
  add constraint weekly_plan_steps_title_geen_bidi
  check (title = public.zonder_bidi(title)),
  add constraint weekly_plan_steps_floor_text_geen_bidi
  check (floor_text is null or floor_text = public.zonder_bidi(floor_text)),
  add constraint weekly_plan_steps_ceiling_text_geen_bidi
  check (ceiling_text is null or ceiling_text = public.zonder_bidi(ceiling_text));

comment on constraint weekly_plan_steps_title_geen_bidi on public.weekly_plan_steps is
  'Een weekplanstap draagt geen bidi-stuurteken — QS8-501. Hij wordt door '
  'weekplanstap_naar_weekdoel() een weekdoel, en staat dan op de goedkeurkaart. '
  'Zonder deze CHECK landt het stuurteken hier en valt de omzetting een week '
  'later om in een achtergrondtaak die de fout wegslikt.';

comment on constraint weekly_plan_steps_floor_text_geen_bidi on public.weekly_plan_steps is
  'De vloer van een weekplanstap draagt geen bidi-stuurteken — QS8-501. Zelfde '
  'route en zelfde reden als de titel.';

comment on constraint weekly_plan_steps_ceiling_text_geen_bidi on public.weekly_plan_steps is
  'Het plafond van een weekplanstap draagt geen bidi-stuurteken — QS8-501. '
  'Zelfde route en zelfde reden als de titel.';

comment on constraint weekly_goals_title_geen_bidi on public.weekly_goals is
  'Een weektitel draagt geen bidi-override of -isolaat — QS8-501. Hij staat op '
  'de goedkeurkaart boven Bevestigen; een goedkeurder hoort te lezen wat er '
  'staat (domeinregel 3).';

comment on constraint weekly_goals_floor_text_geen_bidi on public.weekly_goals is
  'De vloer draagt geen bidi-stuurteken — QS8-501. Hij bepaalt of de week telt '
  '(domeinregel 8) en staat op de goedkeurkaart.';

comment on constraint weekly_goals_ceiling_text_geen_bidi on public.weekly_goals is
  'Het plafond draagt geen bidi-stuurteken — QS8-501. Zelfde kaart, zelfde '
  'reden als de vloer.';

comment on constraint completions_note_geen_bidi on public.completions is
  'Het briefje bij een voltooiing draagt geen bidi-stuurteken — QS8-501. Het is '
  'het laatste dat een goedkeurder leest voor hij op Bevestigen drukt.';

comment on constraint deadline_requests_reason_geen_bidi on public.deadline_requests is
  'De toelichting bij een uitstelverzoek draagt geen bidi-stuurteken — QS8-501. '
  'Hij staat direct boven de regel die zegt dat er een straf op het doel staat, '
  'en boven Akkoord; beslis_deadline_verzoek() kan die straf vooruit schuiven '
  '(QS8-370). Een toelichting die anders rendert dan hij is, maakt een '
  'commitment device stilzwijgend losser (domeinregel 5).';

commit;
