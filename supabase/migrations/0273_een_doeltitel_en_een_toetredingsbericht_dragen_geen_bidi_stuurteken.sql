-- 0273_een_doeltitel_en_een_toetredingsbericht_dragen_geen_bidi_stuurteken.sql
--   — twee teksten die een autorisatiegrens oversteken, en allebei zonder grendel.
--
-- ROLLBACK-PAD:
--   alter table public.goals
--     drop constraint if exists goals_title_geen_bidi;
--   alter table public.group_join_requests
--     drop constraint if exists group_join_requests_bericht_geen_bidi;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-498, voortgekomen uit de security-review op QS8-494 (migratie 0270) en
-- hier op 15-09-2026 opnieuw nagemeten op de lokale stack.
--
-- 0270 dekte `groups.name`, `groups.icon` en `groups.omschrijving` met de regel
-- *"vrije tekst die een niet-lid ziet vóórdat hij besluit te vertrouwen of toe
-- te treden"*. De overige groepszichtbare tekstkolommen bleven erbuiten met dit
-- argument:
--
--   > dat is inhoud van de schrijver zelf, gelezen door mensen die hem al kennen
--
-- ⚠️⚠️ **Dat argument is voor twee kolommen aantoonbaar onwaar, en het stond er
--    als 📏 terwijl het een aanname was.** Een meting die niet klopt is duurder
--    dan een ontbrekende meting, want de eerste lees je als bewijs — precies de
--    fout die het beslisdocument van 0270 zélf als aanleiding opschrijft.
--
-- ---------------------------------------------------------------------------
-- 1. `goals.title` — tekst van een lid, gelezen door een vreemde
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 15-09-2026, via de gewone weg en niet uit de bron geredeneerd.**
--    Een ingelogde niet-lid met een uitnodigingscode:
--
--      invite_preview('INV498ABCDEF') -> members[0].goal_title
--        = 'Sparen voor ' || chr(8238) || 'gpj.exe'      -- U+202E, RLO
--
--    De lidmaatschapstoets in die functie bestaat niet; de tak hangt aan
--    `ingelogd`:
--
--      'goal_title', case when ingelogd then ( select gg.title … ) else null end
--
--    en `app/uitnodiging/[code].tsx` rendert hem als `<Caption>` onder de
--    groepsnaam, bóven de meedoen-knop. Dezelfde functie, hetzelfde scherm en
--    dezelfde schade als waarvoor `groups_name_geen_bidi` gebouwd is.
--
-- 📏 `goals` droeg geen enkele bidi-CHECK — alleen `goals_title_len`,
--    `goals_description_len`, `goals_hours_sane`, `goals_status_valid`,
--    `goals_identity_statement_len`, `goals_ritme_valid` en
--    `goals_category_valid`.
--
-- ---------------------------------------------------------------------------
-- 2. `group_join_requests.bericht` — tekst ván een vreemde, vóór een besluit
-- ---------------------------------------------------------------------------
--
-- Dit is het spiegelbeeld, en het weegt minstens even zwaar. 0270 gaat over wat
-- een niet-lid **ziet**; hier schrijft een niet-lid, en een beheerder leest het
-- vlak vóór een **autorisatiebesluit** — de grens waar domeinregels 3, 4 en 7
-- alle drie op leunen.
--
-- 📏 Gemeten, dezelfde dag en dezelfde weg:
--
--      vraag_lidmaatschap_aan(<groep>, 'Laat me erin ' || chr(8238) || 'exe.gpj')
--        -> {"ok": true}
--      de beheerder leest daarna uit `group_join_requests`:
--        'Laat me erin ‮exe.gpj'        -- draagt het stuurteken nog
--
--    `app/groep/beheer/[id].tsx` zet naam → bericht → "Aannemen"/"Afwijzen"
--    onder elkaar. Een omgekeerd renderend bericht staat dus tussen de naam van
--    de aanvrager en de knop die hem binnenlaat.
--
-- ---------------------------------------------------------------------------
-- 3. Wat er bewust **niet** bij zit, en dat is deze keer gemeten
-- ---------------------------------------------------------------------------
--
-- QS8-498 noemt zes andere kandidaten. 📏 Voor alle zes is nagegaan of ze een
-- niet-lid of een pre-autorisatielezer bereiken, door de functies te nemen die
-- `authenticated` mag uitvoeren en te kijken wat ze teruggeven:
--
--   | kolom                    | bereikt een niet-lid | via              |
--   |--------------------------|----------------------|------------------|
--   | `goals.description`      | nee                  | —                |
--   | `weekly_goals.title`     | nee                  | —                |
--   | `milestones.title`       | nee                  | —                |
--   | `milestones.description` | nee                  | —                |
--   | `chat_messages.body`     | nee                  | —                |
--   | `daily_moves.body`       | nee                  | —                |
--
--    Er zijn **drie** routes naar een niet-lid, en geen ervan raakt die zes
--    kolommen aan:
--
--      `invite_preview()`  group_name, icon, huddle_day, zichtbaarheid,
--                          member_count, en per lid display_name, avatar_url
--                          (altijd null sinds 0128) en goal_title
--      `ontdek_groepen()`  naam, categorie, omschrijving, voertaal, huddle_day
--      `zoek_mensen()`     id, display_name, avatar_url            (0272)
--
--    ⚠️ Hier stond *"de twee routes"*, en dat sprak twaalf regels verderop
--       zichzelf tegen — daar staat `zoek_mensen()` als "een níeuw oppervlak
--       naar vreemden" genoemd. 0272 landde één commit vóór de claim van dit
--       issue, en de telling was van de dag ervoor. Een telling is precies het
--       soort bewering dat de volgende lezer overneemt zonder hem na te lopen.
--
-- ⚠️ **Dat is een meting van vandaag en geen eigenschap.** Komt er een oppervlak
--    bij dat een van die zes aan een niet-lid geeft, dan verschuift die rij en
--    hoort de CHECK erbij. Dat is precies de beweging die dit issue heeft laten
--    zien: 0270's rij was op de dag van schrijven al onwaar.
--
-- ⚠️⚠️ **En deze tabel beantwoordt één van de twee criteria van deze migratie,
--    niet allebei — dat hoort er met zoveel woorden bij te staan.** De kolom
--    hierboven vraagt *"bereikt dit een niet-lid"*. Maar §2 grendelt
--    `group_join_requests.bericht` op een ánder en **breder** criterium:
--    *"tekst die iemand leest vlak vóór een autorisatiebesluit"*. Langs dát
--    criterium vallen er vijf kolommen buiten, en ze staan hier opgesomd zodat
--    niemand deze tabel leest als "alles is nagegaan":
--
--      weekly_goals.title        ┐
--      weekly_goals.floor_text   ├ de goedkeurkaart — `openstaande_beoordelingen()`
--      weekly_goals.ceiling_text │ en `app/beoordelen.tsx`, boven Bevestigen
--      completions.note          ┘
--      deadline_requests.reason    `app/groep/[id].tsx` — als `<Body muted>`
--                                  direct bóven de regel die zegt dát er een
--                                  straf op het doel staat, en boven Akkoord
--
--    📏 Nagemeten op 15-09-2026: alle vijf dragen alleen een lengte-CHECK, en
--    `openstaande_beoordelingen()` geeft de eerste vier alle vier terug.
--
--    ⚠️ De laatste is de zwaarste: `beslis_deadline_verzoek()` kan een straf
--       vooruit schuiven (QS8-370, migratie 0218), en die waarschuwing staat
--       één regel ónder de tekst die de aanvrager zelf schreef. Een `reason` die
--       anders rendert dan hij is, is domeinregel 5 langs de tekstkant.
--
--    Dat gat bestond al vóór deze migratie en wordt hier **niet** gedicht — dat
--    is een eigen issue (QS8-501) en geen bijvangst. Wat hier wél gebeurt is
--    het opschrijven, want een scopetabel met een 📏 ernaast die een ándere
--    vraag beantwoordt dan de migratie stelt, is exact de vorm waar dit issue
--    over gaat.
--
-- 📏 En één die al goed stond: `profiles.display_name` draagt sinds 0269
--    `profiles_display_name_geen_bidi` én sinds 0271
--    `profiles_display_name_geen_onzichtbaar_middenin`. Dat is van belang omdat
--    `zoek_mensen()` (0272) een níeuw oppervlak naar vreemden is — daar was de
--    grendel er dus vóór het oppervlak.
--
-- ---------------------------------------------------------------------------
-- 4. Elke schrijver, opgesomd vóór dit issue "opgelost" heet
-- ---------------------------------------------------------------------------
--
-- De les van §7a in `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`.
--
-- 📏 `goals.title`:
--   1. **`POST`/`PATCH /rest/v1/goals`** — `has_column_privilege('authenticated',
--      'public.goals', 'title', 'insert')` en `'update'` zijn allebei `true`.
--   2. Vijf definer-functies raken `goals` schrijvend aan:
--      `beslis_deadline_verzoek`, `noteer_ontkoppeling`, `rond_doel_af`,
--      `zet_doelstatus` en `zet_streefdatum`.
--
-- 📏 `group_join_requests.bericht`:
--   1. `vraag_lidmaatschap_aan()` — de enige functie die de kolom schrijft — en
--      `beslis_lidmaatschapsverzoek()`.
--   2. **`POST`/`PATCH /rest/v1/group_join_requests` is dícht**, en dat is een
--      correctie: de kolomrechten staan op `true`, maar de policies sluiten die
--      route alsnog — `group_join_requests_insert` is `with check (false)` en
--      `group_join_requests_update` is `using (false)` (0144). Hier stond eerst
--      alleen die `true`, en dat leest als een open route die het niet is.
--      **Een grant is geen route zolang er een policy overheen ligt** — de
--      spiegelvorm van QS8-433, waar een grant juist géén slot bleek.
--
-- ⚠️⚠️ **En dát is precies waarom de grens een CHECK is en geen policy of
--    grant.** 📏 Een `security definer` komt langs een policy en langs een
--    kolomgrant — hij draait als de eigenaar — maar **niet** langs een CHECK:
--    die wordt tegen de rij getoetst, wie hem ook schrijft. Eén CHECK dekt dus
--    alle zeven paden hierboven, inclusief de paden die er morgen bij komen.
--
-- ---------------------------------------------------------------------------
-- 5. Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269 en 0270 en geen stijlkeuze.** Staat dit
--    blok ná de `add constraint`, dan draait het nooit: de ALTER valt om met
--    `check constraint … is violated by some row`, de transactie is afgebroken,
--    en alles erna wordt overgeslagen. Op productie levert dat een mislukte
--    deploy op met een melding die de rij niet noemt, terwijl het vangnet dat
--    daarvoor geschreven is niet vuurt.
--
-- ⚠️ Een `add constraint` **zonder** `not valid` toetst élke bestaande rij en
--    weigert; mét `not valid` gaat hij door. Hier staat met opzet geen
--    `not valid`: een bestaande rij met een stuurteken is precies het geval dat
--    iemand moet zien.
--
-- ⚠️ Wat er met zo'n rij moet gebeuren is een productbeslissing — je herschrijft
--    het doel of het bericht van een echte gebruiker — en dus geen migratiestap.
-- ⚠️⚠️ **`begin; … commit;` eromheen, en juist bij deze migratie.**
--    `docs/DEPLOY.md` §5 schrijft `psql -v ON_ERROR_STOP=1 -f <bestand>` voor,
--    zónder `--single-transaction`: elk statement commit dan apart. Staat er bij
--    de uitrol wél een schendende rij in `group_join_requests` maar niet in
--    `goals`, dan landt de eerste CHECK, valt de tweede om, en stopt psql —
--    half toegepast, met alleen de notice als spoor.
--
--    Dat weegt hier zwaarder dan elders omdat deze migratie er met opzet op
--    ontworpen is om lúid om te vallen op een bestaande rij. Een vangnet dat
--    zelf halverwege blijft hangen, is geen vangnet. 📏 50 van de 276 migraties
--    doen dit expliciet, 0271 incluis.
begin;

do $$
declare
  v_titel   bigint;
  v_bericht bigint;
begin
  select count(*) filter (where title <> public.zonder_bidi(title))
    into v_titel from public.goals;

  select count(*) filter (where bericht is not null
                            and bericht <> public.zonder_bidi(bericht))
    into v_bericht from public.group_join_requests;

  if v_titel + v_bericht > 0 then
    raise notice
      '⚠️ Bidi-stuurtekens gevonden: % in goals.title, % in '
      'group_join_requests.bericht. De CHECKs hierna gaan daarop om en deze '
      'migratie stopt. Bepaal eerst wat er met die teksten gebeurt — dat is '
      'een productbeslissing, geen migratiestap.',
      v_titel, v_bericht;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. De grens zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **In de database en niet in `doelSchema`.** Dat schema draait in de browser
--    van de aanvaller; het is een nette melding vóór de grens, niet de grens.
--    Precies die fout zat in de eerste versie van QS8-448. 📏 Er staat om
--    dezelfde reden ook geen spiegel in `src/`: 0270 deed dat voor `groups`
--    evenmin, en één regel op twee plekken is een regel die je maar half
--    verplaatst.
--
-- ⚠️⚠️ **`zonder_bidi()` is `immutable` en al gegund aan `authenticated`** (0269).
--    Die grant is hier gedeeld en geen detail: Postgres toetst EXECUTE op een
--    functie in een CHECK op het moment van **schrijven**, dus zonder hem valt
--    élke schrijving op `goals` om op `permission denied for function
--    zonder_bidi` — ook eentje die niets met bidi te maken heeft. 📏 Dat is in
--    0256, 0269 én 0270 gemeten en het was elke keer bijna een ship-stopper. De
--    must-allow-helft staat daarom expliciet in de toetsen.
--
--    ⚠️ Er staat hier met opzet géén tweede `grant`: één recht dat op twee
--       plekken wordt uitgedeeld, is een recht dat je maar half intrekt.
--       `tests/rls/functiegrants.test.ts` legt élke `grant execute`-regel uit de
--       migratiemap naast de functies die `authenticated` echt mag uitvoeren.
alter table public.goals drop constraint if exists goals_title_geen_bidi;
alter table public.group_join_requests
  drop constraint if exists group_join_requests_bericht_geen_bidi;

alter table public.goals
  add constraint goals_title_geen_bidi
  check (title = public.zonder_bidi(title));

alter table public.group_join_requests
  add constraint group_join_requests_bericht_geen_bidi
  check (bericht is null or bericht = public.zonder_bidi(bericht));

comment on constraint goals_title_geen_bidi on public.goals is
  'Een doeltitel draagt geen bidi-override of -isolaat — QS8-498. De titel gaat '
  'via invite_preview() naar een ingelogde niet-lid, op de uitnodigingskaart '
  'boven de meedoen-knop; een omgekeerde titel rendert als een andere tekst.';

comment on constraint group_join_requests_bericht_geen_bidi on public.group_join_requests is
  'Het bericht bij een toetredingsverzoek draagt geen bidi-stuurteken — '
  'QS8-498. Het is tekst van een niet-lid die een beheerder leest vlak voor hij '
  'op Aannemen of Afwijzen drukt.';

commit;
