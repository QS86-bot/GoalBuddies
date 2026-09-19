-- 0292_tijdstempel_bewaking_kent_de_synoniemen_van_now.sql — de bewaking leest de
-- parseboom van een default in plaats van zijn spelling, en er komt een tweede
-- bewaking bij die de vensterkolom van elk dagplafond opzoekt (QS8-558).
--
-- ROLLBACK-PAD:
--   Zet `tijdstempel_bewaking()` terug op de vorm van 0173 (`column_default like
--   '%now()%'`) en `drop function public.dagplafondvenster_bewaking();`.
--   Beide zijn lees-only bewakingsfuncties: er gaat geen data verloren.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Rij 603 van `docs/ENGINEER-REVIEW.md` belooft dat het venster van een
-- dagplafond op een kolom rust die de client niet kan zetten. 📏 Nagemeten op
-- stand 0291: die belofte houdt — achttien `*_dagplafond`-triggers, geen enkele
-- vensterkolom schrijfbaar voor `anon` of `authenticated`.
--
-- Wat er niet klopte is waar de belofte op leunde.
--
-- 1. **De rij noemt `created_at`, en dat is niet de enige vensterkolom.**
--    📏 Van de achttien vensters rusten er veertien op `created_at`, één op
--    `completions.submitted_at`, één op `goal_group_links.linked_at`, en twee
--    tellen via `tel_dagteller()` in `dagtellers` en rusten op géén rijkolom.
--    Wie op het wóórd `created_at` nakijkt — precies wat de rij voorschrijft —
--    mist er twee.
--
-- 2. **`tijdstempel_bewaking()` selecteerde op `column_default like '%now()%'`.**
--    📏 Gemeten op een wegwerptabel met acht `timestamptz`-kolommen: `now()` en
--    `timezone('utc', now())` werden gezien; `CURRENT_TIMESTAMP`,
--    `transaction_timestamp()`, `statement_timestamp()`, `clock_timestamp()` en
--    een eigen `mijn_klok()` alle vijf **niet**.
--
--    ⚠️⚠️ 📏 En `select now() = transaction_timestamp()` geeft `t`. `now()` ís
--    `transaction_timestamp()`; `CURRENT_TIMESTAMP` is de SQL-standaardspelling
--    van datzelfde. Twee van die vijf blinde vlekken waren dus dezelfde functie
--    onder een andere naam, en Postgres normaliseert ze niet — `pg_get_expr`
--    drukt ze letterlijk af zoals ze getypt zijn.
--
--    De bewaking meldde dan *nul bezwaren* omdat ze niet gekeken had, niet omdat
--    er niets was. Dezelfde vorm als QS8-412 en `rls:dekking`.
--
-- ⚠️ **`pg_depend` is geen uitweg, en dat is nagemeten zodat de volgende het niet
--    nog eens hoeft te proberen.** Ingebouwde functies zijn *pinned*, dus een
--    default die `now()` aanroept legt geen afhankelijkheid vast op `pg_proc`.
--    📏 Alle acht testkolommen gaven `false`, `now()` zelf incluis.
--
-- ⚠️⚠️ **Wat deze migratie vandaag verandert aan de uitslag is niets, en dat
--    hoort er te staan.** 📏 Gemeten op 0291: 49 van de 58 `timestamptz`-kolommen
--    dragen een serverklok-default, en **alle 49** werden ook door de oude
--    `like '%now()%'` gevonden — deze codebase spelt hem overal `now()`. Oude
--    vorm: 0 bezwaren. Nieuwe vorm: 0 bezwaren. De winst is prospectief: hij
--    zit in de spelling die nog niemand getypt heeft. `0176` noemt
--    `clock_timestamp()` als default twee keer in zijn eigen kop, dus dat is
--    geen verzonnen toekomst.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Een serverklok herken je aan wat de default dóét, niet aan hoe hij heet
-- ---------------------------------------------------------------------------
--
-- ⚠️ De vraag is niet "staat het woord `now()` erin" maar "wordt deze waarde bij
--    het invoegen door de server bepaald". Dat is een eigenschap van de
--    parseboom: roept de default een `stable` of `volatile` functie aan, dan
--    hangt hij aan iets dat per rij kan verschillen. Een `immutable` default is
--    een constante en die draagt geen grendel.
--
-- ⚠️⚠️ **De `SQLVALUEFUNCTION`-tak is niet overbodig.** `CURRENT_TIMESTAMP` is in
--    Postgres 16 géén functieaanroep maar een eigen knooptype, dus er staat geen
--    `:funcid` in de boom om op te joinen. 📏 Zonder die tak komt `b timestamptz
--    default current_timestamp` er nog steeds doorheen — precies de kolom waar
--    dit issue mee begon.
--
-- ⚠️ **De gemeten grenzen van deze vorm, en de meeste vallen de veilige kant op.**
--    📏 `(date '2020-01-01')::timestamptz` en `'2020-01-01'::text::timestamptz`
--    worden als serverklok geteld terwijl ze een constant moment zijn: de eerste
--    omdat `date → timestamptz` `stable` is, de tweede omdat hij dezelfde
--    `COERCEVIAIO`-vorm draagt als `'now'::text::timestamptz`. Dat zijn valse
--    alarmen, en ze eisen dan dat zo'n kolom dicht staat — strenger dan nodig in
--    plaats van losser. 📏 `'epoch'::timestamptz` wordt wél met rust gelaten
--    (Postgres vouwt hem tot een constante). Geen van de drie komt in dit schema
--    voor.
--
-- ⚠️⚠️ **En één gat valt de onveilige kant op, dus het staat hier en niet
--    weggeschreven.** Een functie die liegt over zijn eigen vluchtigheid — een
--    wrapper die als `immutable` gemarkeerd is maar `clock_timestamp()`
--    teruggeeft — wordt **niet** gezien: 📏 `provolatile` is dan `i`, en dat is
--    precies wat deze functie als "constante" leest. Dat is niet te repareren
--    zonder het lichaam van elke functie te volgen, en het staat daarom als
--    gemeten restklasse in het beslisdocument in plaats van als een belofte die
--    deze functie niet waarmaakt.
--
--    ⚠️ Dat voorbeeld stond hier eerst als uitgeschreven `create function` in
--    commentaar, en 📏 `keten:controle` las het als een échte functie en werd
--    rood op een functie die nergens bestaat. Dat is dezelfde klasse als het gat
--    dat de security-ronde in sectie 3a vond, één laag hoger: een controle die
--    brontekst leest en commentaar niet wegknipt. Zie de rij van 19-09-2026 in
--    `docs/ENGINEER-REVIEW.md`.
create or replace function public.serverklok_default(p_tabel oid, p_kolomnummer smallint)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  select exists (
    select 1
    from pg_attrdef d
    where d.adrelid = p_tabel
      and d.adnum = p_kolomnummer
      and (
        -- CURRENT_TIMESTAMP en broers: een eigen knooptype, geen :funcid.
        d.adbin::text ~ 'SQLVALUEFUNCTION'
        -- ⚠️ **`'now'::text::timestamptz` is een échte klok per rij** en komt als
        --    `COERCEVIAIO` de boom in, zónder `:funcid`. 📏 Gemeten over drie
        --    transacties met pauzes ertussen: drie verschillende waarden, gelijk
        --    aan `now()`. `'now'`, `'today'`, `'tomorrow'` en `'yesterday'`
        --    delen die knoopvorm. Dit is dus geen constante-cast maar de klasse
        --    die deze migratie juist zegt te dichten.
        or d.adbin::text ~ 'COERCEVIAIO'
        -- now(), transaction_timestamp(), clock_timestamp(), een eigen functie:
        -- alles wat niet immutable is, wordt bij het invoegen bepaald.
        -- ⚠️ `:opfuncid` staat erbij omdat een operator zijn functie onder díe
        --    veldnaam draagt; `:funcid` alleen ziet een volatiele operator niet.
        or exists (
          select 1
          from regexp_matches(d.adbin::text, ':(?:op)?funcid (\d+)', 'g') m
          join pg_proc p on p.oid = m[1]::oid
          where p.provolatile in ('s', 'v')
        )
      )
  );
$$;

comment on function public.serverklok_default(oid, smallint) is
  'Bepaalt uit de parseboom van een kolomdefault of de server de waarde bij het '
  'invoegen zet. Leest niet de spelling: `CURRENT_TIMESTAMP` en '
  '`transaction_timestamp()` zijn dezelfde functie als `now()` en kwamen er vóór '
  'QS8-558 onveranderd langs.';

revoke execute on function public.serverklok_default(oid, smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Dezelfde bewaking, nu op de eigenschap in plaats van op het woord
-- ---------------------------------------------------------------------------
--
-- ⚠️ De uitzonderingen-CTE blijft leeg en blijft staan: hij is de plek waar een
--    bewuste afwijking met reden en datum landt, en tak 5 hieronder wordt rood
--    zodra zo'n regel niets meer dekt. Zelfde vorm als `definer_bewaking()`.
create or replace function public.tijdstempel_bewaking()
returns table(tabel text, kolom text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  with tijdstempels as (
    select c.relname::text as tabel, a.attname::text as kolom
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid = 'timestamptz'::regtype
      and public.serverklok_default(c.oid, a.attnum)
  ),
  uitzonderingen(tabel, kolom, reden, sinds) as (
    select null::text, null::text, null::text, null::text where false
  ),
  gevonden as (
    select t.tabel, t.kolom, rol.naam as rol, r.recht
    from tijdstempels t
    cross join (values ('anon'), ('authenticated')) as rol(naam)
    cross join (values ('INSERT'), ('UPDATE')) as r(recht)
    where has_column_privilege(rol.naam, ('public.' || quote_ident(t.tabel))::regclass, t.kolom, r.recht)
  )
  select g.tabel,
         g.kolom,
         'client mag een servertijdstempel schrijven (' || g.recht || ' voor ' || g.rol || ')'
  from gevonden g
  where not exists (
    select 1 from uitzonderingen u
    where u.tabel = g.tabel and u.kolom = g.kolom
  )
  union all
  select u.tabel,
         u.kolom,
         'staat als uitzondering geregistreerd (' || u.sinds || ') maar is geen bezwaar meer'
  from uitzonderingen u
  where not exists (
    select 1 from gevonden g
    where g.tabel = u.tabel and g.kolom = u.kolom
  )
  order by 1, 2, 3;
$$;

comment on function public.tijdstempel_bewaking() is
  'Elke timestamptz die de server bij het invoegen zet, en die `anon` of '
  '`authenticated` mag schrijven. Sinds QS8-558 gemeten aan de parseboom van de '
  'default in plaats van aan het woord `now()` erin.';

revoke execute on function public.tijdstempel_bewaking() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3a. Commentaar is geen code, en dat moest een grendel worden
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit is er bij gekomen na de security-ronde op dit issue, en het gat dat
--    hij vond was ernstiger dan het gat dat dit issue repareerde.**
--    `dagplafondvenster_bewaking()` las `prosrc` als platte tekst, en `prosrc`
--    bevat het commentaar. 📏 Gemeten met een tabel waarvan het échte venster
--    `client_tijd` was (voor de client schrijfbaar) en met één commentaarregel
--    erboven in de huisstijl van dit project — *"Bij de meeste tabellen is dat
--    created_at > now() - interval '1 day'"* — koos de bewaking `created_at`,
--    vond die dicht, en meldde **nul bezwaren**. `tijdstempel_bewaking()` ook.
--    Het dagplafond stond volledig open.
--
--    📏 En dezelfde vorm zette tak 1 uit: een functie met *"We gebruiken hier
--    bewust NIET tel_dagteller( )"* in commentaar telde als tellervorm en kwam
--    er stil doorheen, terwijl hij géén venster afdwong.
--
-- ⚠️ **Dat is precies waar de kop van deze migratie voor waarschuwt**, en het
--    stond er al in: *een grendel die groen staat omdat hij zijn invoer niet
--    begreep, bewaakt niets.* Tak 1 dekte "geen treffer" en niet "de verkeerde
--    treffer", en dat tweede is het gevaarlijke geval.
--
-- ⚠️⚠️ **De knip die een controle scherp houdt, is zelf een grendel** (QS8-412,
--    waar een knip op regelcommentaar alles ná de dubbele slash van een URL
--    opat). Daarom is dit een scanner en geen reguliere expressie: een streepje-
--    streepje in een string begint geen commentaar, en een aanhalingsteken in
--    commentaar begint geen string. Met een regex is dat onderscheid niet te
--    maken, en dan verplaats je het gat in plaats van het te dichten. Zijn eigen
--    ijking staat in `tests/rls/dagplafondvenster.test.ts`.
--
-- ⚠️ **`pg_depend` is hier geen alternatief, en dat is nagemeten.** Een
--    plpgsql-lichaam wordt bij het aanmaken niet ontleed, dus er staat geen
--    afhankelijkheid vast. 📏 `begrens_pushtokens` → `tel_dagteller`: `false`.
--    Tekst is de enige bron die er is; dan moet de tekst wel kloppen.
create or replace function public.code_zonder_commentaar(p_bron text)
returns text
language plpgsql
immutable
-- ⚠️ `set search_path` ook hier, al is dit geen `security definer`. De poort
--    vroeg erom: `definer-aanroepertoets.test.ts` én `hulpfuncties.test.ts`
--    werden allebei rood op het ontbreken ervan, onafhankelijk van elkaar. De
--    regel is in dit project niet "definers hebben een search_path" maar "elke
--    functie heeft er een" — en een functie zonder is een functie waarvan de
--    aanroepcontext bepaalt welke `substr` hij krijgt.
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $fn$
declare
  v_uit  text := '';
  v_i    integer := 1;
  v_n    integer := length(p_bron);
  v_twee text;
  v_merk text;
  v_eind integer;
  v_diep integer;
begin
  while v_i <= v_n loop
    v_twee := substr(p_bron, v_i, 2);

    if v_twee = '--' then
      -- regelcommentaar: tot de regelovergang, die zelf blijft staan
      v_eind := position(E'\n' in substr(p_bron, v_i));
      if v_eind = 0 then exit; end if;
      v_uit := v_uit || ' ' || E'\n';
      v_i := v_i + v_eind;

    elsif v_twee = '/*' then
      -- blokcommentaar, en in Postgres mag dat nesten
      v_diep := 1;
      v_i := v_i + 2;
      while v_i <= v_n and v_diep > 0 loop
        v_twee := substr(p_bron, v_i, 2);
        if v_twee = '/*' then v_diep := v_diep + 1; v_i := v_i + 2;
        elsif v_twee = '*/' then v_diep := v_diep - 1; v_i := v_i + 2;
        else v_i := v_i + 1;
        end if;
      end loop;
      v_uit := v_uit || ' ';

    elsif substr(p_bron, v_i, 1) = $q$'$q$ then
      -- string: twee aanhalingstekens is een ontsnapt teken en sluit hem niet
      v_i := v_i + 1;
      while v_i <= v_n loop
        if substr(p_bron, v_i, 1) = $q$'$q$ then
          if substr(p_bron, v_i + 1, 1) = $q$'$q$ then v_i := v_i + 2;
          else v_i := v_i + 1; exit;
          end if;
        else v_i := v_i + 1;
        end if;
      end loop;
      v_uit := v_uit || ' ';

    else
      -- dollarhaakjes: $$ of $naam$, tot dezelfde merker terugkomt
      v_merk := (regexp_match(substr(p_bron, v_i), '^[$][A-Za-z_][A-Za-z0-9_]*[$]|^[$][$]'))[1];
      if v_merk is not null then
        v_eind := position(v_merk in substr(p_bron, v_i + length(v_merk)));
        if v_eind = 0 then exit; end if;
        v_uit := v_uit || ' ';
        v_i := v_i + length(v_merk) + v_eind - 1 + length(v_merk);
      else
        v_uit := v_uit || substr(p_bron, v_i, 1);
        v_i := v_i + 1;
      end if;
    end if;
  end loop;

  return v_uit;
end
$fn$;

comment on function public.code_zonder_commentaar(text) is
  'Haalt commentaar, stringliteralen en dollargeciteerde blokken uit een '
  'functielichaam, zodat een controle die dat lichaam leest niet op een zin in '
  'een comment afgaat. Een scanner en geen regex: streepje-streepje in een '
  'string begint geen commentaar en een aanhalingsteken in commentaar begint '
  'geen string (QS8-558, na de security-ronde).';

revoke execute on function public.code_zonder_commentaar(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3b. De belofte zelf: het venster van een dagplafond staat niet open
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Waarom dit naast `tijdstempel_bewaking()` staat en er niet in valt.**
--    Die bewaking toetst een eigenschap van een ónderdeel: *deze kolom wordt
--    door de server gezet, dus de client mag hem niet schrijven*. De belófte van
--    rij 603 is een eigenschap van het gehéél: *het venster waar dit dagplafond
--    op rekent, is niet door de gestrafte te verzetten*. Regel 18, vraag 2.
--
--    Het verschil is te meten. 📏 De achttien vensters rusten op drie
--    verschillende kolommen — veertien op `created_at`, één op
--    `completions.submitted_at`, één op `goal_group_links.linked_at` — en twee
--    tellen in `dagtellers` en rusten op geen rijkolom. Een bewaking die van de
--    kolom uitgaat, weet niet wélke kolom een grendel draagt; deze zoekt hem op
--    in de functie die de grendel ís.
--
-- ⚠️⚠️ **Tak 1 is de helft die het zwaarst weegt.** Een `begrens_*`-functie
--    waarin geen van beide vormen te vinden is, is hier een **bezwaar** en geen
--    stilte. Zonder die tak zou een teller die zijn venster anders opschrijft —
--    met een variabele, via een hulpfunctie, met een andere interval-notatie —
--    deze bewaking groen laten omdat ze hem niet kón lezen. Een grendel die
--    groen staat omdat hij zijn invoer niet begreep, bewaakt niets.
--
-- ⚠️ **En de `tel_dagteller()`-vorm is de must-allow, met zijn eigen meting.**
--    Die telt niet de rijen van de tabel maar een teller in `dagtellers`, dus er
--    ís geen vensterkolom om open te zetten — dat is de stérkere vorm, niet een
--    uitzondering. Wat hem draagt is dat `dagtellers` dicht staat, en tak 4
--    toetst precies dat. 📏 Vandaag: `SELECT`, `INSERT` en `UPDATE` voor
--    `authenticated` alle drie `false`.
create or replace function public.dagplafondvenster_bewaking()
returns table(tabel text, trigger_naam text, functie text, venster text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  with plafonds as (
    select c.relname::text as tabel,
           c.oid as tabeloid,
           t.tgname::text as trig,
           p.proname::text as fn,
           public.code_zonder_commentaar(p.prosrc) as code
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
    where c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
      and t.tgname like '%dagplafond%'
  ),
  vensters as (
    -- ⚠️ `regexp_matches(… 'g')` en niet `regexp_match`: **alle** treffers, niet
    --    de eerste. De alias ervoor wordt weggeknipt — de functies schrijven
    --    `m.created_at`, `c.submitted_at`, `l.linked_at`.
    select p.tabel, p.trig, count(distinct m[1]) as aantal, min(m[1]) as kolom
    from plafonds p
    cross join lateral regexp_matches(
      p.code, '(?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)\s*>\s*now\(\)\s*-\s*interval', 'g'
    ) m
    group by p.tabel, p.trig
  ),
  bestaat as (
    -- ⚠️⚠️ **Het kolomnúmmer en niet de kolomnaam.**
    --    `has_column_privilege(rol, tabel, 'naam', recht)` **werpt** een fout
    --    zodra die naam niet op die tabel staat: 📏 `ERROR: column "bestaat_niet"
    --    of relation "t" does not exist`. Tak 2 hieronder bestaat juist voor dat
    --    geval, dus een bewaking die de naam doorgeeft kan omvallen op precies
    --    de vorm die ze hoort te melden.
    --
    -- ⚠️ **En hier hoort de meting bij te staan in plaats van de stelligheid.**
    --    📏 De vorm met de naam plus een guard-voorwaarde ernaast is hierop
    --    uitgeprobeerd en gaf **geen** fout: nul rijen, netjes. De planner
    --    evalueerde de guard eerst. Dit is dus geen reparatie van een gemeten
    --    omval maar het weghalen van een afhankelijkheid van iets dat SQL niet
    --    belooft — de volgorde van `where`-clausules ligt niet vast, en een
    --    grendel die op de planner van vandaag steunt is een grendel waarvan
    --    niemand merkt wanneer hij losraakt.
    select p.tabel, p.tabeloid, p.trig, p.fn,
           v.kolom, coalesce(v.aantal, 0) as aantal_vensters,
           (p.code like '%tel_dagteller(%') as via_teller,
           a.attnum as kolomnummer
    from plafonds p
    left join vensters v on v.tabel = p.tabel and v.trig = p.trig
    left join pg_attribute a
      on a.attrelid = p.tabeloid and a.attname = v.kolom
     and a.attnum > 0 and not a.attisdropped
  )
  -- 1. Onleesbare vorm: geen vensterkolom en geen tellertabel.
  select b.tabel, b.trig, b.fn, '-',
         'vorm niet herkend: geen vensterkolom en geen tel_dagteller() — niet na te meten'
  from bestaat b
  where b.aantal_vensters = 0 and not b.via_teller

  union all

  -- 1b. Méér dan één vensterkolom: dan is "welke draagt het plafond" een keuze,
  --     en een stille keuze voor de eerste is precies het gat van de
  --     security-ronde. Dit is een bezwaar en geen sortering.
  select b.tabel, b.trig, b.fn, b.kolom,
         'meer dan één vensterkolom gevonden (' || b.aantal_vensters ||
         ') — welke het plafond draagt is niet af te leiden'
  from bestaat b
  where b.aantal_vensters > 1

  union all

  -- 2. Wel één vensterkolom, maar niet op de tabel van de trigger.
  select b.tabel, b.trig, b.fn, b.kolom,
         'vensterkolom staat niet op de tabel van deze trigger — niet na te meten'
  from bestaat b
  where b.aantal_vensters = 1 and b.kolomnummer is null

  union all

  -- 3. De vensterkolom is door de client te verzetten. Dit is het defect.
  select b.tabel, b.trig, b.fn, b.kolom,
         'client mag de vensterkolom schrijven (' || r.recht || ' voor ' || rol.naam || ')'
  from bestaat b
  cross join (values ('anon'), ('authenticated')) as rol(naam)
  cross join (values ('INSERT'), ('UPDATE')) as r(recht)
  where b.aantal_vensters = 1
    and b.kolomnummer is not null
    and has_column_privilege(rol.naam, b.tabeloid, b.kolomnummer, r.recht)

  union all

  -- 4. De tellervorm rust op `dagtellers`; staat die open, dan telt hij niets.
  select b.tabel, b.trig, b.fn, 'dagtellers.' || k.kolom,
         'client mag de tellertabel schrijven (' || r.recht || ' voor ' || rol.naam || ')'
  from bestaat b
  cross join (values ('venster_start'), ('aantal')) as k(kolom)
  cross join (values ('anon'), ('authenticated')) as rol(naam)
  cross join (values ('INSERT'), ('UPDATE')) as r(recht)
  where b.via_teller
    and has_column_privilege(rol.naam, 'public.dagtellers'::regclass, k.kolom, r.recht)

  order by 1, 2, 5;
$$;

comment on function public.dagplafondvenster_bewaking() is
  'Zoekt voor elke *_dagplafond-trigger de kolom op waar zijn etmaalvenster op '
  'rust, en meldt het zodra `anon` of `authenticated` die kan schrijven — of '
  'zodra de vorm van de functie niet te lezen is. De belofte van rij 603 van '
  'docs/ENGINEER-REVIEW.md, mechanisch in plaats van met de hand (QS8-558).';

revoke execute on function public.dagplafondvenster_bewaking() from public, anon, authenticated;

commit;
