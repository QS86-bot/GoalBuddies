-- 0315_een_tijdzone_die_intl_weigert_is_geen_tijdzone.sql — QS8-763, nazorg op 0119
--
-- ROLLBACK-PAD:
--   Zet `bewaak_tijdzone()` terug op de vorm van 0119: alleen de toets tegen
--   `pg_timezone_names`, zonder de weigerlijst. Dat opent het gat van QS8-763
--   weer: een profiel met `tz = 'Factory'` wordt door de rollover overgeslagen.
--   De data-reparatie onderaan is niet terug te draaien en hoeft dat niet: de
--   waarden die ze vervangt waren onbruikbaar.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0119 toetst `profiles.tz` en `groups.tz` tegen `pg_timezone_names`, en dat is
-- de verzameling die `at time zone` aankan. De rollover rekent echter in
-- TypeScript, met `Intl`, en dat is een andere zonedatabase. Een naam die
-- Postgres kent en `Intl` weigert, komt langs de trigger en laat
-- `closableUserCycle()` werpen; `afsluitbareCyclus()` vangt dat en slaat het
-- hele profiel over. Dat betekent: geen weekafsluiting, geen minpunt, geen
-- doelstraf `due` en geen beslissing over een weekbelofte (0313), zolang de
-- gebruiker de waarde laat staan. Eén PATCH op PostgREST volstaat.
--
-- 📏 Gemeten op de lokale stack (Postgres 16, Node met ICU 78.3), alle 499 namen
-- uit `pg_timezone_names` door `new Intl.DateTimeFormat('en', { timeZone })`:
-- precies drie weigeringen: `Factory` en de twee lokale artefacten die
-- `scripts/tijdzones-controle.mjs` al kent (`ALLEEN_LOKAAL`, bestaan op
-- productie niet). Als
-- `authenticated` gaf `update profiles set tz = 'Factory'` voor deze migratie
-- `UPDATE 1`.
--
-- ---------------------------------------------------------------------------
-- Waarom een lijst, en wat die niet is
-- ---------------------------------------------------------------------------
--
-- SQL kan `Intl` niet vragen. De lijst hieronder is dus een afschrift van een
-- meting, geen definitie van "wat Intl weigert".
--
-- ⚠️ **De `posix/`- en `right/`-spiegels (bevinding security-reviewer).** Productie
--    kent 598 `posix/`-namen (zie de kop van `scripts/tijdzones-controle.mjs`) en
--    `Intl` weigert ze allemaal (`posix/Europe/Amsterdam` geeft `Invalid time
--    zone`, gemeten met Node ICU 78.3). Lokaal bestaan ze niet, dus daar kon de
--    meting ze niet zien. Ze gaan daarom op voorvoegsel eruit, niet per naam.
--    Een echte zone staat nooit onder die voorvoegsels; wie `Europe/Amsterdam`
--    bedoelt, schrijft dat.
--
-- ⚠️ **De twee lokale artefacten staan hier met opzet niet in:** ze bestaan op
--    productie niet en `tijdzones:controle` weigert elk bestand dat ze noemt,
--    deze migratie ook. Wat de lijst beschermt is productie.
--
-- ⚠️ **Wat ongemeten is, en dat blijft zo:** of productie-Postgres (1196 namen,
--    waarvan 598 `posix/`-spiegels) méér namen kent die `Intl` weigert, en of
--    Deno in de Edge-runtime dezelfde weigert. `Factory` is op productie niet
--    gemeten. Een
--    naam die hier ontbreekt, valt nog steeds in de vangst van
--    `afsluitbareCyclus()`, en die meldt hem naar Sentry (`cyclus_onbepaalbaar`).
--    Wie zo'n melding ziet, voegt de naam hier toe en in
--    `ZONES_DIE_INTL_WEIGERT` in `scripts/tijdzones-controle.mjs`.
--
-- ⚠️ **Geen rol is uitgezonderd, `service_role` inbegrepen** — zelfde keuze als
--    0119. `lower()` omdat Postgres zonenamen hoofdletterongevoelig vergelijkt:
--    `at time zone 'factory'` werkt, en `Intl` weigert die spelling net zo.
--
-- ⚠️ **De volgorde in de functie is met opzet:** eerst de weigerlijst, dan de
--    toets tegen `pg_timezone_names`. De lijst is de strengere en goedkopere
--    helft, en de foutmelding noemt dan de échte reden.
--
-- ---------------------------------------------------------------------------

create or replace function public.bewaak_tijdzone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  -- NULL laten we door, zie 0119.
  if new.tz is not null then
    if lower(new.tz) = 'factory'
       or lower(new.tz) like 'posix/%'
       or lower(new.tz) like 'right/%' then
      raise exception '% is een naam die Postgres kent maar geen echte tijdzone', new.tz
        using errcode = '22023';
    end if;

    if not exists (
      select 1 from pg_catalog.pg_timezone_names z where z.name = new.tz
    ) then
      raise exception '% is geen bekende tijdzone', new.tz
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.bewaak_tijdzone() is
  'Weigert een tz-waarde die Postgres niet kent (0119), en Factory, die '
  'Postgres wel kent maar Intl weigert, plus de posix/- en right/-spiegels (0315, QS8-763). Zonder de tweede helft '
  'slaat de rollover een profiel stilzwijgend over.';

-- Een triggerfunctie is geen RPC (0052a, 0069, 0119).
revoke all on function public.bewaak_tijdzone() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wat er al staat
-- ---------------------------------------------------------------------------
--
-- ⚠️ `commitments.tz` is hier niet bij: dat is een bevroren kopie (bevries_commitmentzone)
--    die geen enkele wijziging toelaat. Een commitment dat is aangegaan met zo'n
--    profielzone houdt hem. Postgres rekent er gewoon mee en TypeScript leest de
--    kolom niet; de omvang op productie is ongemeten.
--
-- Een rij die er al een draagt, wordt door de rollover nu al overgeslagen. Terug
-- naar de kolomdefault is de enige waarde die niets beweert over de gebruiker;
-- elke andere zone zou een gok zijn. De trigger toetst de nieuwe waarde en laat
-- hem door.
update public.profiles
   set tz = 'Europe/Amsterdam'
 where lower(tz) = 'factory' or lower(tz) like 'posix/%' or lower(tz) like 'right/%';

update public.groups
   set tz = 'Europe/Amsterdam'
 where lower(tz) = 'factory' or lower(tz) like 'posix/%' or lower(tz) like 'right/%';
