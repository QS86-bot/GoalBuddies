-- 0156_pg_temp_in_het_zoekpad_van_vier_functies.sql — een tijdelijke tabel kon vier functies sturen (QS8-269)
--
-- ROLLBACK-PAD:
--   `create or replace` op dezelfde vier functies met `set search_path =
--   public, pg_catalog` (dus zonder `pg_temp`), en de derde tak uit
--   `definer_bewaking()` weer weg. Er verandert geen data en geen
--   handtekening; alleen het zoekpad en één tak van een bewakingsfunctie.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gemeten, in één sessie op de lokale stack:
--
--   zonder temp table: 2026-09-04
--   met temp table:    2026-09-05
--
-- na `create temp table profiles (id uuid, tz text)` met
-- `tz = 'Pacific/Kiritimati'`. `eigenaarsdatum()` is `SECURITY DEFINER` en las
-- de tabel van de aanvaller.
--
-- ⚠️ **Waarom een gepind zoekpad hier niet genoeg was.** Alle vier deze functies
--    hébben een `set search_path`; hij noemt alleen `pg_temp` niet. Postgres
--    doorzoekt het tijdelijke schema dan **als eerste** voor relaties — het staat
--    impliciet vooraan in plaats van dat het er niet is. `definer_bewaking()`
--    keek naar het ontbréken van een pad en zag deze vier dus niet.
--
-- ⚠️ **Vier en niet twee.** De security-review noemde `eigenaarsdatum` en
--    `groepsdatum`. Een mechanische telling over álle functies in `public` met
--    een gepind pad geeft er vier: `bewaak_tijdzone` en `bewaak_avatar_aantal`
--    staan er ook op. Dat verschil is de reden dat deze migratie de klasse
--    opsomt in plaats van de twee namen te repareren.
--
-- ⚠️ **Maar alleen de twee definers waren aantoonbaar te sturen**, en dat hoort
--    er eerlijk bij te staan. `bewaak_tijdzone` leest
--    `pg_catalog.pg_timezone_names` en `bewaak_avatar_aantal` leest
--    `storage.objects` — allebei met schema ervoor, en dus niet te
--    overschaduwen. Ze staan hier omdat de régel uniform hoort te zijn, niet
--    omdat ze een gat waren.
--
-- ⚠️ **Vandaag was het geen open deur.** PostgREST biedt geen DDL en er is geen
--    functie met dynamische SQL die `authenticated` mag uitvoeren, dus een
--    aanvaller krijgt zijn `create temp table` er niet in. Dit is
--    defense-in-depth. `CLAUDE.md` bij regel 19 zegt waarom dat geen reden is om
--    te wachten: elke definer-functie is een kopie van de vorige, en 145 van de
--    149 doen het wél goed.
--
-- ---------------------------------------------------------------------------
-- De derde tak in `definer_bewaking()` is de eigenlijke reparatie
-- ---------------------------------------------------------------------------
--
-- Vier namen herstellen lost vandaag op; een tak in de bewaking lost morgen op.
-- `tests/rls/hulpfuncties.test.ts` eist dat `definer_bewaking()` nul rijen
-- geeft, dus vanaf nu maakt een vijfde functie zonder `pg_temp` die test rood.
--
-- ⚠️ De tak kijkt naar **élke** functie in `public` met een gepind pad en niet
--    alleen naar definers — dezelfde verruiming als 0114 op de eerste tak, en om
--    dezelfde reden: een overschaduwde relatie verandert een uitkomst zonder dat
--    er rechten aan te pas komen.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op vijf functies, geen handtekening wijzigt.
-- ---------------------------------------------------------------------------

-- eigenaarsdatum
CREATE OR REPLACE FUNCTION public.eigenaarsdatum(uid uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select (now() at time zone p.tz)::date
  from profiles p
  where p.id = uid;
$function$;

-- groepsdatum
CREATE OR REPLACE FUNCTION public.groepsdatum(gid uuid)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  select (now() at time zone g.tz)::date
  from groups g
  where g.id = gid;
$function$;

-- bewaak_tijdzone
CREATE OR REPLACE FUNCTION public.bewaak_tijdzone()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
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
$function$;

-- bewaak_avatar_aantal
CREATE OR REPLACE FUNCTION public.bewaak_avatar_aantal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  map    text := (storage.foldername(new.name))[1];
  aantal integer;
begin
  if new.bucket_id <> 'avatars' or map is null then
    return new;
  end if;

  select count(*) into aantal
  from storage.objects o
  where o.bucket_id = 'avatars'
    and (storage.foldername(o.name))[1] = map;

  -- ⚠️ Tien is de grens uit de kop hierboven. Eén is genoeg voor de app; de rest
  --    is ruimte voor wezen. Zie migratie 0130.
  if aantal >= 10 then
    raise exception 'Te veel avatars voor deze gebruiker (%).', aantal
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

-- definer_bewaking() — de derde tak erbij
create or replace function public.definer_bewaking()
returns table(naam text, bezwaar text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- ⚠️ **Geen `prosecdef`-filter meer op deze tak, en dat is de wijziging van
  --    0114.** Een functie zonder gepind pad hoeft geen rechten te verhogen om
  --    schade te doen: `tip_noemt_tegenvaller()` was niet definer en gaf met een
  --    gekaapt pad toch het verkeerde antwoord. De bewaking van 0106 keek daar
  --    langs omdat hij alleen definer-functies telde.
  select p.proname::text, 'geen set search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
  union all
  -- ⚠️ **De derde tak, sinds 0156.** Een pad dat `pg_temp` niet noemt is niet
  --    "zonder tijdelijk schema" maar "met het tijdelijke schema vooraan":
  --    Postgres doorzoekt `pg_temp` dan als eerste voor relaties. Gemeten op
  --    `eigenaarsdatum()`: met een tijdelijke tabel `profiles` in de sessie gaf
  --    de definer-functie de rij van de aanvaller terug.
  --
  --    Net als de eerste tak over élke functie en niet alleen over definers —
  --    een overschaduwde relatie verandert een uitkomst zonder dat er rechten
  --    aan te pas komen.
  select p.proname::text, 'zoekpad noemt pg_temp niet'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
    and not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%pg\_temp%')
  union all
  -- ⚠️ Dit bezwaar blijft wél alleen over definer-functies gaan: een gewone
  --    functie die `anon` mag aanroepen draait met de rechten van `anon`, en dan
  --    is er niets verhoogd. Alleen bij een definer is het een bezwaar.
  select p.proname::text, 'uitvoerbaar door anon'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname <> 'invite_preview'
  order by 1, 2;
$$;
