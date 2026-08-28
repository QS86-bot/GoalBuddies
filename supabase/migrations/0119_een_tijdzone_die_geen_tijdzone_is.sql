-- 0119_een_tijdzone_die_geen_tijdzone_is.sql — nazorg op 0107 en 0112
--
-- ROLLBACK-PAD:
--   drop trigger if exists profiles_tijdzone on public.profiles;
--   drop trigger if exists groups_tijdzone   on public.groups;
--   drop function if exists public.bewaak_tijdzone();
--   (Doe dit niet zonder de reden hieronder gelezen te hebben.)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `profiles.tz` en `groups.tz` zijn vrije tekstkolommen. Er stond geen enkele
-- toets op de inhoud — geen CHECK, geen trigger, geen domein — en beide zijn
-- rechtstreeks schrijfbaar voor de client: een gebruiker schrijft zijn eigen
-- `profiles.tz`, een beheerder de `groups.tz` van zijn groep.
--
-- Sinds 0107 leest `ketting_stand()` `profiles.tz`, en sinds 0112 leest
-- `maak_seizoensrecaps()` `groups.tz`. `at time zone` op een onbekende zone is
-- geen NULL en geen lege uitkomst maar een **fout**, en die fout slaat op tegen
-- ieder die de functie aanroept — niet tegen degene die de waarde schreef.
--
-- 📏 Empirisch gemeten op de lokale stack, als gewone ingelogde gebruiker:
--
--   * `update profiles set tz = 'Bogus/Zone'` → `UPDATE 1`. Geen weigering.
--     `ketting_stand()` geeft daarna voor **elk medelid van elke groep waar die
--     gebruiker in zit** `time zone "Bogus/Zone" not recognized`.
--   * `update groups set tz = 'Bogus/Zone'` als beheerder → `UPDATE 1`.
--     `maak_seizoensrecaps()` breekt daarna af op de éérste groep die hij
--     tegenkomt, en die job loopt in één lus over **alle** groepen. Eén groep
--     zet dus de seizoensrecap voor iedereen stil.
--
-- ⚠️ Dat tweede is de reden dat dit niet als "je verpest je eigen klok" te
--    lezen is. De schade landt buiten de schrijver, en bij de recap zelfs
--    buiten zijn groep.
--
-- ⚠️ **Wat dit níet is: een storing die vandaag loopt.** De app schrijft geen
--    vrije tekst — `apparaatTijdzone()` toetst met `isGeldigeTijdzone()` en
--    valt anders terug. 📏 Nagemeten of die twee lijsten het eens zijn, want
--    ICU en Postgres zijn twee verschillende zonedatabases: **alle 418 zones
--    die ICU kent, kent productie ook** (nul verschil). Langs de knoppen van de
--    app komt hier dus niets binnen. Dit dicht het pad eromheen — een
--    rechtstreekse `PATCH` op PostgREST, die elke ingelogde gebruiker kan doen.
--
-- ⚠️ **En onderweg is één bewering van mij onjuist gebleken, met meten.** Op de
--    lokale stack faalt `at time zone 'Asia/Calcutta'`, en daar leek uit te
--    volgen dat elke gebruiker in India de ketting van zijn groep breekt — V8
--    meldt namelijk `Asia/Calcutta` zelfs als het besturingssysteem
--    `Asia/Kolkata` zegt. Dat klopt niet voor productie: die kent **1196**
--    zones tegen **499** lokaal, inclusief alle achttien oude aliassen. Het was
--    een eigenschap van de lokale Debian-tzdata, niet van de app. De rij die
--    dát verschil bewaakt staat in `docs/ENGINEER-REVIEW.md`.
--
-- ---------------------------------------------------------------------------
-- Waarom een trigger en geen CHECK
-- ---------------------------------------------------------------------------
--
-- Een CHECK mag alleen IMMUTABLE aanroepen, en `pg_timezone_names` is dat niet:
-- de zonedatabase komt van het besturingssysteem en verandert bij een update.
-- Een functie die zichzelf IMMUTABLE noemt om er langs te komen, liegt tegen de
-- planner en tegen `pg_dump` — een restore zou de CHECK dan kunnen overslaan of
-- juist op een andere zonedatabase struikelen. Dus: een trigger, die bij elke
-- schrijfbeweging opnieuw kijkt.
--
-- ⚠️ **Geen rol is uitgezonderd, `service_role` inbegrepen.** Dat is dezelfde
--    keuze als bij de allowlist `chat_messages_system_event_bekend`. De job die
--    hier stuk van gaat draait juist áls `service_role`; een uitzondering voor
--    die rol zou het gat laten staan op precies het pad dat de schade doet.
--
-- ⚠️ **De NULL-tak is defensief en niet het geval dat hier speelt.** Beide
--    kolommen zijn NOT NULL met default `Europe/Amsterdam` — nagemeten, want
--    `information_schema.is_nullable = 'NO'` betekent *niet* nullable en dat is
--    één keer verkeerd om gelezen tijdens het bouwen van deze migratie. De tak
--    blijft staan omdat hij niets kost en de functie herbruikbaar houdt voor
--    een kolom die het ooit wél is; hij verandert vandaag niets.
--
-- ⚠️ **De lege string wordt wél geweigerd**, en dat is de tak die er toe doet:
--    `''` komt langs NOT NULL heen en `at time zone ''` faalt net zo hard als
--    `at time zone 'Bogus/Zone'`.
--
-- ---------------------------------------------------------------------------

create or replace function public.bewaak_tijdzone()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  -- NULL laten we door: op deze twee kolommen weigert NOT NULL hem al, en op
  -- een kolom die het ooit niet is vangen de lezers hem af. Alles wat er wél
  -- staat, moet een zone zijn die déze database kent — dat is precies de
  -- verzameling die `at time zone` aankan, en die verschilt per omgeving.
  if new.tz is not null
     and not exists (
       select 1 from pg_catalog.pg_timezone_names z where z.name = new.tz
     ) then
    raise exception '% is geen bekende tijdzone', new.tz
      using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.bewaak_tijdzone() is
  'Weigert een tz-waarde die Postgres niet kent. Zonder deze toets breekt '
  '`at time zone` bij het lézen, en die fout landt bij een ander dan de '
  'schrijver: ketting_stand() voor elk medelid, maak_seizoensrecaps() voor '
  'alle groepen tegelijk. Zie 0119.';

-- Een triggerfunctie is geen RPC. Zelfde grendel als 0052a en 0069: zonder dit
-- deelt `alter default privileges` hem uit aan anon én authenticated.
revoke all on function public.bewaak_tijdzone() from public, anon, authenticated;

drop trigger if exists profiles_tijdzone on public.profiles;
create trigger profiles_tijdzone
  before insert or update of tz on public.profiles
  for each row execute function public.bewaak_tijdzone();

drop trigger if exists groups_tijdzone on public.groups;
create trigger groups_tijdzone
  before insert or update of tz on public.groups
  for each row execute function public.bewaak_tijdzone();
