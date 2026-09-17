-- 0285_een_regelovergang_is_geen_nul_pixelteken.sql — `zonder_onzichtbaar_middenin()`
-- strijkt sinds 0271 het hele bereik `U+0001`–`U+001F`, en daar zitten TAB, LF en
-- CR in. Die drie gaan eruit, en de belofte die er stilzwijgend op meelifte —
-- *een naam is één regel* — krijgt een eigen functie en eigen CHECKs (QS8-507).
--
-- ROLLBACK-PAD:
--   In één transactie, met ON_ERROR_STOP aan.
--
--     begin;
--     alter table public.profiles           drop constraint if exists profiles_display_name_een_regel;
--     alter table public.groups             drop constraint if exists groups_name_een_regel;
--     alter table public.groups             drop constraint if exists groups_icon_een_regel;
--     alter table public.goals              drop constraint if exists goals_title_een_regel;
--     alter table public.milestones         drop constraint if exists milestones_title_een_regel;
--     alter table public.weekly_goals       drop constraint if exists weekly_goals_title_een_regel;
--     alter table public.weekly_plan_steps  drop constraint if exists weekly_plan_steps_title_een_regel;
--     alter table public.commitments        drop constraint if exists commitments_body_een_regel;
--     drop function if exists public.zonder_regelovergang(text);
--     -- en `zonder_onzichtbaar_middenin()` terug naar de vorm van 0271:
--     -- vervang in zijn tekenklasse `\0001-\0008\000B\000C\000E-\001F` door `\0001-\001F`.
--     commit;
--
--   ⚠️ Dat laatste zet de fout terug die deze migratie repareert. Doe het alleen
--      als de CHECKs hierboven óók weg zijn — anders weigeren tien multiline-
--      velden opnieuw elke alinea.
--
-- ---------------------------------------------------------------------------
-- De meting
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de gedeployde functie (16-09-2026), gevonden in de
--    security-review op QS8-507:
--
--      newline       nul-pixelregel laat door: nee
--      tab           nul-pixelregel laat door: nee
--      CR            nul-pixelregel laat door: nee
--      nbsp          nul-pixelregel laat door: ja
--      gewone tekst  nul-pixelregel laat door: ja
--
-- ⚠️⚠️ **Dat klopt niet met de onderbouwing van de regel zelf.** Die luidt *"een
--    teken dat als nul pixels rendert is nooit inhoud"*. Een regelovergang
--    rendert niet als nul pixels — hij rendert als lay-out. De regel strijkt dus
--    méér dan hij belooft, en precies dat verschil kost een gebruiker zijn
--    alinea's.
--
-- 📏 En het raakt geen randgeval: **tien** van de twaalf kolommen van 0284 en
--    **vier** van de dertien van 0283 hangen aan een `multiline`-invoerveld —
--    `groups.omschrijving`, `completions.note`, `deadline_requests.reason`,
--    `group_join_requests.bericht`, `week_reviews.{did,blocked,next}_text`,
--    `week_review_replies.body`, `reports.toelichting`, `goals.description`,
--    `milestones.description`, `daily_moves.body`, `todo_items.body` en
--    `deadline_requests.decision_note`.
--
-- ⚠️ **Twee gedragingen, en de tweede is de ergste omdat niemand hem merkt.**
--    Een schrijfroute zónder client-spiegel geeft `opslaan mislukt` op tekst waar
--    niets aan te zien is. Een route mét spiegel slaat de tekst wél op, maar
--    zónder alinea's: wie zijn weekafsluiting in drie alinea's schrijft, leest
--    hem terug als één doorlopende zin. Bij `reports.toelichting` is dat het
--    meldformulier voor intimidatie.
--
-- ---------------------------------------------------------------------------
-- De functie corrigeren, en niet een tweede ernaast zetten
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Een `zonder_onzichtbaar_middenin_proza()` erbij zou de kopieervorm zijn
--    waar CLAUDE.md voor waarschuwt** — *elke definer-functie is een kopie van de
--    vorige*. Er zijn dan twee bijna gelijke tekenklassen die uit elkaar gaan
--    lopen, en de volgende lezer moet raden welke voor zijn kolom geldt.
--
--    De fout zit in de functie zelf, gemeten tegen zijn eigen onderbouwing. Dus
--    wordt de functie gerepareerd, en gaat de reparatie in één keer naar élke
--    kolom die hem gebruikt — de dertien van 0283 incluis. **Een reparatie die
--    de instanties opruimt en het mechanisme laat staan, groeit terug.**
--
-- ⚠️ De nieuwe tekenklasse is **afgeleid uit `pg_get_functiondef()`** en niet
--    overgetypt: bij QS8-499 zijn twee ijkingen ongeldig gebleken doordat het
--    naschrijven van deze functie er stilletjes elf bereiken uit liet vallen.
--    Eén vervanging, `\0001-\001F` → `\0001-\0008\000B\000C\000E-\001F`.
--
-- 📏 `U+000B` (vertical tab) en `U+000C` (form feed) blijven wél gestreken: ze
--    zijn geen lay-out die een gebruiker typt, en ze renderen per platform
--    verschillend. Alleen TAB, LF en CR gaan eruit.
--
-- ---------------------------------------------------------------------------
-- En de belofte die eronder vandaan komt: een naam is één regel
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder deze helft zou deze migratie een grendel weghalen.** Vandaag
--    weigert `display_name` een regelovergang — per ongeluk, want hij zit in het
--    C0-bereik. Dat is toevallig het juiste gedrag: een naam met een
--    regelovergang erin rendert over twee regels of wordt afgekapt, en dat is een
--    spoofingvector. `groups.name` net zo.
--
--    Die belofte is een **ándere** dan de nul-pixelregel, en hij hoort dus een
--    eigen functie en eigen CHECKs te krijgen in plaats van mee te liften.
--
-- 📏 Welke kolommen: gemeten door per veld te kijken of het JSX-element
--    `multiline` draagt. Acht kolommen zijn eenregelig.
--
-- ⚠️⚠️ **En `weekly_goals.ceiling_text`/`floor_text` zitten er met opzet NIET
--    bij, hoewel hun veld eenregelig is.** 📏 Gemeten: `weekplan.plafond` en
--    `weekplan.vloer` (`weekly_plan_steps`) zijn wél `multiline`, en
--    `weekplanstap_naar_weekdoel()` kopieert die kolommen ongewijzigd naar
--    `weekly_goals`. Een CHECK op de bestemming die de bron niet heeft, breekt de
--    rollover — bij een gebruiker die niets verkeerd deed en er niets aan kan
--    doen. **Een kopie erft de grenzen van zijn bron**, dezelfde regel die in
--    0284 `reports.bericht_kopie` uit de scope hield.
--
--    `title` zit er wél bij, aan **beide** kanten van die kopieerroute: daar zijn
--    bron en bestemming even streng en breekt er niets.
--
-- ---------------------------------------------------------------------------
-- Staat er al zo een? — en dit blok staat vóór de CHECKs
-- ---------------------------------------------------------------------------
--
-- 📏 Op de lokale stack vandaag: 0 rijen in alle acht kolommen.
begin;

-- ---------------------------------------------------------------------------
-- 1. De correctie
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.zonder_onzichtbaar_middenin(p_ruw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select regexp_replace(
    coalesce(p_ruw, ''),
    '[' || U&'\0001-\0008\000B\000C\000E-\001F\007F-\009F\00AD\115F-\1160\17B4-\17B5\200B\202A-\202E\2060-\206F\3164\FEFF\FFA0\FFF0-\FFFB\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E001F\+0E0080-\+0E00FF\+0E01F0-\+0E0FFF' || ']',
    '',
    'g'
  );
$function$;

comment on function public.zonder_onzichtbaar_middenin(text) is
  'Strijkt tekens die als nul pixels renderen. TAB, LF en CR horen daar NIET bij '
  '— die zijn lay-out en geen leegte; zie 0285 (QS8-507). Voor "dit veld is één '
  'regel" is er zonder_regelovergang().';

-- ---------------------------------------------------------------------------
-- 2. De belofte die een eigen naam krijgt
-- ---------------------------------------------------------------------------

create or replace function public.zonder_regelovergang(p_ruw text)
returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $fn$
  select regexp_replace(coalesce(p_ruw, ''), '[' || U&'\0009\000A\000D' || ']', '', 'g');
$fn$;

comment on function public.zonder_regelovergang(text) is
  'Strijkt TAB, LF en CR. Voor kolommen waarvan het invoerveld eenregelig is; '
  'zie 0285 (QS8-507) voor welke dat zijn en waarom ceiling_text/floor_text er '
  'niet bij horen.';

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon` — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan `authenticated`,
--    en dat is precies de rol waaronder iedere ingelogde gebruiker draait.
revoke all on function public.zonder_regelovergang(text) from public, anon, authenticated;
grant execute on function public.zonder_regelovergang(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2b. `schone_naam()` houdt de belofte die hij altijd had
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder dit blok haalt deze migratie een grendel wég.** `schone_naam()`
--    stelt `zonder_onzichtbaar_middenin()` samen, en strijkt daardoor vandaag
--    een regelovergang midden in een naam. Corrigeer je alleen die functie, dan
--    laat `schone_naam()` hem opeens staan.
--
--    📏 Gemeten op de TypeScript-spiegel vlak na de correctie:
--    `schoneNaam('Jan' || LF || 'Admin')` gaf `'Jan\nAdmin'` — de naam die als
--    twee regels rendert, precies waar 0269 voor gebouwd is.
--
-- ⚠️ **En hij moet aan béíde kanten tegelijk**, want `schone_naam()` en
--    `schoneNaam()` staan onder een naadtest die het hele codepuntbereik afloopt
--    (`tests/rls/naamnormalisatie.test.ts`). Eén kant veranderen maakt die toets
--    rood — wat hij hoort te doen.
--
-- ⚠️ De nieuwe vorm is **afgeleid uit `pg_get_functiondef()`**: één extra laag om
--    de binnenste aanroep, verder niets aangeraakt.

CREATE OR REPLACE FUNCTION public.schone_naam(p_ruw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select regexp_replace(
    regexp_replace(
      public.zonder_onzichtbaar_tussen_letters(
        public.zonder_losse_tags(
          public.zonder_regelovergang(
            public.zonder_onzichtbaar_middenin(public.zonder_bidi(coalesce(p_ruw, '')))
          )
        )
      ),
      '^[' || rand || ']+', ''
    ),
    '[' || rand || ']+$', ''
  )
  from (
    select U&'\0001-\0020\007F-\00A0\00AD\034F\061C\115F-\1160\1680\17B4-\17B5\180B-\180E\2000-\200F\2028-\202F\205F-\2064\2066-\206F\2800\3000\3164\FEFF\FFA0\FFF9-\FFFB\+0E0000-\+0E001F' as rand
  ) s;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Staat er al zo een?
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_totaal bigint := 0;
begin
  for r in
  select 'profiles.display_name' as kolom, count(*) as aantal from public.profiles where display_name <> public.zonder_regelovergang(display_name)
  union all
  select 'groups.name' as kolom, count(*) as aantal from public.groups where name <> public.zonder_regelovergang(name)
  union all
  select 'groups.icon' as kolom, count(*) as aantal from public.groups where icon is not null and icon <> public.zonder_regelovergang(icon)
  union all
  select 'goals.title' as kolom, count(*) as aantal from public.goals where title <> public.zonder_regelovergang(title)
  union all
  select 'milestones.title' as kolom, count(*) as aantal from public.milestones where title <> public.zonder_regelovergang(title)
  union all
  select 'weekly_goals.title' as kolom, count(*) as aantal from public.weekly_goals where title <> public.zonder_regelovergang(title)
  union all
  select 'weekly_plan_steps.title' as kolom, count(*) as aantal from public.weekly_plan_steps where title <> public.zonder_regelovergang(title)
  union all
  select 'commitments.body' as kolom, count(*) as aantal from public.commitments where body <> public.zonder_regelovergang(body)
  loop
    if r.aantal > 0 then
      raise notice '⚠️ %: % rij(en) dragen een regelovergang.', r.kolom, r.aantal;
      v_totaal := v_totaal + r.aantal;
    end if;
  end loop;

  if v_totaal > 0 then
    raise notice
      '⚠️ In totaal % rij(en). De CHECKs hierna gaan daarop om en deze migratie '
      'stopt. Bepaal eerst wat er met die teksten gebeurt — dat is een '
      'productbeslissing, geen migratiestap.', v_totaal;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. De grenzen zelf
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint if exists profiles_display_name_een_regel;
alter table public.profiles
  add constraint profiles_display_name_een_regel
  check (display_name = public.zonder_regelovergang(display_name));

alter table public.groups
  drop constraint if exists groups_name_een_regel;
alter table public.groups
  add constraint groups_name_een_regel
  check (name = public.zonder_regelovergang(name));

alter table public.groups
  drop constraint if exists groups_icon_een_regel;
alter table public.groups
  add constraint groups_icon_een_regel
  check (icon is null or icon = public.zonder_regelovergang(icon));

alter table public.goals
  drop constraint if exists goals_title_een_regel;
alter table public.goals
  add constraint goals_title_een_regel
  check (title = public.zonder_regelovergang(title));

alter table public.milestones
  drop constraint if exists milestones_title_een_regel;
alter table public.milestones
  add constraint milestones_title_een_regel
  check (title = public.zonder_regelovergang(title));

alter table public.weekly_goals
  drop constraint if exists weekly_goals_title_een_regel;
alter table public.weekly_goals
  add constraint weekly_goals_title_een_regel
  check (title = public.zonder_regelovergang(title));

alter table public.weekly_plan_steps
  drop constraint if exists weekly_plan_steps_title_een_regel;
alter table public.weekly_plan_steps
  add constraint weekly_plan_steps_title_een_regel
  check (title = public.zonder_regelovergang(title));

alter table public.commitments
  drop constraint if exists commitments_body_een_regel;
alter table public.commitments
  add constraint commitments_body_een_regel
  check (body = public.zonder_regelovergang(body));

commit;
