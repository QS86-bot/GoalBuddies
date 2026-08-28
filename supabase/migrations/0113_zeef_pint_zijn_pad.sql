-- 0113_zeef_pint_zijn_pad.sql — drie functies zonder search_path, en de zeef die daardoor niets zeeft
--
-- ROLLBACK-PAD:
--   Herstel de drie functies uit 0103 zonder `set search_path` en met de
--   ongekwalificeerde aanroep, en herstel `definer_bewaking()` uit 0106 (met de
--   `p.prosecdef`-filter op de eerste tak). Geen datamigratie; er verandert niets
--   aan wat de functies teruggeven.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De bevinding van 27-08 noemde dit "één regel per functie" en repareerde
--    hem bewust niet, omdat 0103 van een parallelle sessie kwam en er tijdens
--    het toepassen aan zitten precies is hoe twee schrijvers elkaar in de weg
--    lopen.** Die reden is op 28-08 vervallen: die sessie is geland (PR #72).
--
-- ⚠️ **En het gat is aantoonbaar, niet theoretisch.** `tip_noemt_tegenvaller()`
--    roept `tegenvaller_woorden()` óngekwalificeerd aan en pint zijn pad niet.
--    Gemeten op 28-08-2026:
--
--      tip_noemt_tegenvaller('je hebt een week gemist')            -> true
--      … met een eigen `tegenvaller_woorden()` vóór public in het pad -> false
--
--    De zeef laat dan alles door. Dat is precies de vorm die dit project bij
--    élke definer-functie wél dichtzet.
--
-- ⚠️ **De ernst blijft laag, en dat is ook gemeten en niet aangenomen.** Om het
--    pad te kapen heb je een eigen schema nodig, en `authenticated` krijgt
--    `permission denied for database` op `create schema`. De enige echte
--    aanroeper is de trigger `mijlpaaltip_weigert_tegenvaller()`, die zijn pad
--    wél pint en die de helpers dat laat erven. Dit is dus geen lek dat
--    vandaag openstaat maar een slot dat als enige ontbreekt.
--
-- ⚠️ **En dát is de reden om het nú te doen in plaats van te wachten op de dag
--    dat het telt: 120 van de 123 functies in `public` pinnen hun pad al.**
--    Geteld, niet geschat. Drie uitzonderingen op een regel die verder overal
--    geldt, is geen uitzondering maar een gat — en een regel die 120 keer klopt
--    is goedkoop af te dwingen.
--
-- ⚠️ **Daarom wordt `definer_bewaking()` verbreed en niet alleen de drie
--    gerepareerd.** Die functie toetste `set search_path` alleen op
--    SECURITY DEFINER-functies, en juist deze drie zijn dat níet — de bewaking
--    die 0106 optuigde keek er dus langs. De meting hierboven laat zien waarom
--    dat te smal was: een ongepind pad hoeft geen rechtenverhoging te geven om
--    een uitkomst te veranderen. Het tweede bezwaar (uitvoerbaar door `anon`)
--    blijft wél alleen over definer-functies gaan; daar ís het alleen daar een
--    bezwaar.
--
--    De naam blijft `definer_bewaking()`. Hem hernoemen zou elke aanroeper en de
--    RLS-test raken voor een functie die nog steeds hetzelfde bewaakt — dat het
--    eerste bezwaar nu breder kijkt, staat in zijn eigen commentaar.

-- ---------------------------------------------------------------------------
-- 1. De drie functies pinnen hun pad, en de aanroep wordt gekwalificeerd
-- ---------------------------------------------------------------------------

create or replace function public.tegenvaller_woorden()
returns text[]
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select array[
    'achter',
    'gemist',
    'mislukt',
    'helaas',
    'jammer',
    'volgende keer beter',
    'niet gehaald',
    'behind',
    'missed',
    'failed',
    'unfortunately',
    'better luck'
  ];
$$;

create or replace function public.tip_noemt_tegenvaller(p_tekst text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  -- ⚠️ `public.` ervoor, en dat is het punt van deze migratie. Een gepind pad
  --    dekt de aanroep hier al, maar een gekwalificeerde naam blijft kloppen ook
  --    als iemand dat pad ooit weghaalt — twee sloten, zoals overal in dit
  --    schema.
  select exists (
    select 1
    from unnest(public.tegenvaller_woorden()) as woord
    where position(lower(woord) in lower(coalesce(p_tekst, ''))) > 0
  );
$$;

-- ⚠️ **Het lichaam hieronder is letterlijk dat van 0103 en is met opzet niet
--    "opgeschoond".** Bij het schrijven van deze migratie werden de
--    `\uXXXX`-reeksen één keer per ongeluk als échte tekens overgenomen. Dat
--    ziet er identiek uit en is het niet: Postgres kent `\uwxyz` als
--    régex-escape, dus de reeks hoort in de bron te blijven staan. Een
--    `create or replace` herschrijft de hele functie, en alles wat je daarbij
--    overtypt kan stil veranderen — dezelfde valkuil die 0075 vier regels kostte.
create or replace function public.tip_bevat_emoji(p_tekst text)
returns boolean
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(p_tekst, '') ~ '[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F]'
      or coalesce(p_tekst, '') ~ '[\U0001F000-\U0001FAFF]';
$$;

-- ---------------------------------------------------------------------------
-- 2. De bewaking kijkt voortaan naar élke functie, niet alleen naar definers
-- ---------------------------------------------------------------------------

create or replace function public.definer_bewaking()
returns table (naam text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  -- ⚠️ **Geen `prosecdef`-filter meer op deze tak, en dat is de wijziging van
  --    0113.** Een functie zonder gepind pad hoeft geen rechten te verhogen om
  --    schade te doen: `tip_noemt_tegenvaller()` was niet definer en gaf met een
  --    gekaapt pad toch het verkeerde antwoord. De bewaking van 0106 keek daar
  --    langs omdat hij alleen definer-functies telde.
  select p.proname::text, 'geen set search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
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
