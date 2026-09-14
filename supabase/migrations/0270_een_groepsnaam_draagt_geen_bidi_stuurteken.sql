-- 0270_een_groepsnaam_draagt_geen_bidi_stuurteken.sql — de drie vrije
-- tekstkolommen die een **niet-lid** van een groep te zien krijgt, kunnen de
-- tekens eromheen niet meer omkeren (QS8-494).
--
-- ROLLBACK-PAD:
--   alter table public.groups drop constraint if exists groups_name_geen_bidi;
--   alter table public.groups drop constraint if exists groups_icon_geen_bidi;
--   alter table public.groups drop constraint if exists groups_omschrijving_geen_bidi;
--
--   Geen kolom, geen policy, geen functie gewijzigd. `zonder_bidi()` blijft
--   staan — die is van 0269 en `profiles` leunt erop.
--
--   ⚠️ **Stap 0, verplicht en vóór stap 1 bij het toepassen.** Het `do $$`-blok
--      onderin dit bestand meet hoeveel rijen de CHECKs zouden weigeren, en het
--      staat met opzet **vóór** de `alter table` — anders draait het nooit. Zie
--      hieronder.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gevonden in de security-review op QS8-450 en zelf nagemeten op 14-09-2026.
--    Migratie 0269 zette een CHECK op `profiles.display_name`; `groups` kreeg er
--    geen, en de rij in `docs/ENGINEER-REVIEW.md` hield dat laag met de
--    voorwaarde *"wordt zwaarder als er een uitnodigingsoppervlak komt … of
--    zodra groepsnamen doorzoekbaar worden voor niet-leden"*.
--
--    **Allebei bestonden al**, en dat is de fout waar QS8-123 voor bestaat:
--
--        proname     | prosecdef | anon_mag | auth_mag
--      --------------+-----------+----------+----------
--      invite_preview| t         | t        | t
--      ontdek_groepen| t         | f        | t
--
-- ---------------------------------------------------------------------------
-- Waarom precies deze drie kolommen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De regel is: vrije tekst die een niet-lid ziet vóórdat hij besluit te
--    vertrouwen of toe te treden.** Dat is een grens die te meten is en geen
--    gevoel, en hij is per functie nagelopen:
--
--      `invite_preview(code)`  -> `group_name`, `icon`   — **uitvoerbaar door `anon`**
--      `ontdek_groepen(...)`   -> `naam`, `omschrijving` — niet-leden, ingelogd
--
--    📏 `categorie` en `voertaal` gaan óók mee, maar die dragen een CHECK met een
--    vaste waardenlijst (`groups_categorie_geldig`, `groups_voertaal_geldig`) en
--    kunnen dus per constructie geen stuurteken bevatten. Ze staan hier met
--    reden niet bij.
--
-- ⚠️ **Dit verruimt het besluit van 0269 niet.** Daar is met zoveel woorden
--    gekozen om doeltitels, mijlpalen en chatberichten buiten te laten: dat is
--    inhoud van de schrijver zélf, en die mag zeggen wat hij wil. Een groepsnaam
--    is iets anders — een **vreemde** leunt erop om te beslissen of hij toetreedt.
--    Dat argument geldt voor deze drie en niet voor de andere zes.
--
-- ⚠️ **Drie constraints en niet één.** Een gebundelde CHECK meldt bij een
--    schending alleen zijn eigen naam, en dan weet de schrijver niet wélke kolom
--    hem tegenhoudt. 📏 Dat is in de security-ronde op QS8-450 precies de les
--    geweest die de toets daar aanscherpte: `23514` alleen zegt "een CHECK
--    weigerde dit" en niet welke.
--
-- ---------------------------------------------------------------------------
-- De twee schrijvers, en allebei gemeten
-- ---------------------------------------------------------------------------
--
-- 📏 De les van §7a in `docs/decisions/2026-09-13-twee-poorten-die-elkaar-niet-kenden.md`:
--    een issue dat een leesbaar oppervlak beschermt, moet élke schrijver van dat
--    oppervlak opsommen. Voor `groups.name` zijn het er twee:
--
--    1. **`create_group()`** — `security definer`, zet de naam bij het aanmaken.
--    2. **`PATCH /rest/v1/groups`** — 📏 `has_column_privilege('authenticated',
--       'public.groups', 'name', 'UPDATE')` is **`t`**, `groups_update` is
--       `is_group_admin(id)`, en `guard_group_update()` noemt `name` **niet**.
--       Een beheerder verzet de naam dus rechtstreeks.
--
--    ⚠️ Van de dertien functies die `groups` bijwerken raakt alleen
--       `create_group()` deze kolommen aan; de andere twaalf zetten `status`,
--       `last_activity_at`, `invite_code`, `invite_revoked`, `zichtbaarheid`,
--       `ontdekbaar` en `huddle_day`. Nagemeten op `prosrc`, niet aangenomen.
--
-- ⚠️ **Allebei weigeren, en geen van beide strijkt** — anders dan bij
--    `display_name` in 0269. Daar strijkt de aanmeldtrigger omdat een
--    **provider** de naam aanlevert en een geweigerde aanmelding een account
--    kost. Hier typt de gebruiker zelf, op beide routes, en dan is een melding
--    het juiste antwoord: hij kan het meteen verbeteren.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `drop … if exists` eerst, want de migratie moet idempotent zijn.
--    `npm run idempotent:controle` speelt elke migratie direct na zichzelf nog
--    een keer af op een eigen lege database.
alter table public.groups drop constraint if exists groups_name_geen_bidi;
alter table public.groups drop constraint if exists groups_icon_geen_bidi;
alter table public.groups drop constraint if exists groups_omschrijving_geen_bidi;

-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De volgorde is de les van 0269 en geen stijlkeuze.** 📏 Daar stond dit
--    blok eerst ná de `add constraint`, en dan draait het nooit: de ALTER valt om
--    met `check constraint … is violated by some row`, de transactie is afgebroken,
--    en alles erna wordt overgeslagen. Op productie levert dat een mislukte deploy
--    op met een melding die de rij niet noemt, terwijl het vangnet dat daarvoor
--    geschreven was niet vuurt.
--
-- ⚠️ En om dezelfde reden staat er hier **niet** dat Postgres bestaande rijen met
--    rust laat. 📏 Allebei de kanten op gemeten bij 0269: een `add constraint`
--    **zónder** `not valid` toetst élke bestaande rij en weigert; mét `not valid`
--    gaat hij door.
--
-- ⚠️ Wat er met zo'n rij moet gebeuren is een productbeslissing — je herschrijft
--    de naam van de groep van een echte gebruiker — en dus geen migratiestap.
do $$
declare
  v_naam         bigint;
  v_icon         bigint;
  v_omschrijving bigint;
begin
  select
    count(*) filter (where name <> public.zonder_bidi(name)),
    count(*) filter (where icon is not null and icon <> public.zonder_bidi(icon)),
    count(*) filter (where omschrijving is not null
                       and omschrijving <> public.zonder_bidi(omschrijving))
  into v_naam, v_icon, v_omschrijving
  from public.groups;

  if v_naam + v_icon + v_omschrijving > 0 then
    raise notice
      '⚠️ Groepen met een bidi-stuurteken: % in name, % in icon, % in '
      'omschrijving. De CHECKs hierna gaan daarop om en deze migratie stopt. '
      'Bepaal eerst wat er met die teksten gebeurt — dat is een '
      'productbeslissing, geen migratiestap.',
      v_naam, v_icon, v_omschrijving;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- De grens zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **In de database en niet in `groepSchema`.** Dat schema draait in de
--    browser van de aanvaller; het is een nette melding vóór de grens, niet de
--    grens. Precies die fout zat in de eerste versie van QS8-448.
--
-- ⚠️⚠️ **`zonder_bidi()` is `immutable` en al gegund aan `authenticated`** (0269).
--    Die grant is hier gedeeld en geen detail: Postgres toetst EXECUTE op een
--    functie in een CHECK op het moment van **schrijven**, dus zonder hem valt
--    élke groepsschrijving om op `permission denied for function zonder_bidi` —
--    ook eentje die niets met bidi te maken heeft. 📏 Dat is in 0256 en 0269
--    allebei gemeten en het was allebei de keren bijna een ship-stopper. De
--    must-allow-helft staat daarom expliciet in de toetsen.
--
--    ⚠️ Er staat hier met opzet géén tweede `grant`: één recht dat op twee
--       plekken wordt uitgedeeld, is een recht dat je maar half intrekt.
--       `tests/rls/functiegrants.test.ts` legt élke `grant execute`-regel uit de
--       migratiemap naast de functies die `authenticated` echt mag uitvoeren.
alter table public.groups
  add constraint groups_name_geen_bidi
  check (name = public.zonder_bidi(name));

alter table public.groups
  add constraint groups_icon_geen_bidi
  check (icon is null or icon = public.zonder_bidi(icon));

alter table public.groups
  add constraint groups_omschrijving_geen_bidi
  check (omschrijving is null or omschrijving = public.zonder_bidi(omschrijving));

comment on constraint groups_name_geen_bidi on public.groups is
  'Een groepsnaam draagt geen bidi-override of -isolaat — QS8-494. De naam gaat '
  'via invite_preview() naar een uitgelogde bezoeker en via ontdek_groepen() '
  'naar niet-leden; een omgekeerde naam rendert als een andere groep.';

comment on constraint groups_icon_geen_bidi on public.groups is
  'Het icoon van een groep draagt geen bidi-stuurteken — QS8-494. Het staat in '
  'invite_preview() naast de naam, en een override werkt door op wat ernaast '
  'gerenderd wordt.';

comment on constraint groups_omschrijving_geen_bidi on public.groups is
  'De omschrijving van een groep draagt geen bidi-stuurteken — QS8-494. Hij gaat '
  'via ontdek_groepen() naar niet-leden die beslissen of ze toetreden.';
