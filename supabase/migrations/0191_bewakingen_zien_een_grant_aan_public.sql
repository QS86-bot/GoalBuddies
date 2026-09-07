-- 0191_bewakingen_zien_een_grant_aan_public.sql — vier bewakingen waren blind voor `grant … to public` (QS8-337)
--
-- ROLLBACK-PAD:
--   Elke functie terugzetten uit zijn vorige definitie, alle vier `create or
--   replace` zonder handtekeningwijziging (dus de grants blijven staan):
--     `tijdstempel_bewaking()`   uit 0173 (r.214)
--     `volgorde_bewaking()`      uit 0176 (r.322)
--     `viewrechten_bewaking()`   uit 0095 (r.96)
--     `ddl_rechten_in_de_api()`  uit 0073 (r.112)
--   Deze migratie schrijft geen enkele rij en verandert geen enkel ander
--   schema-object.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- Vier bewakingen leidden een recht af uit een grantee-náám in plaats van uit
-- het effectieve recht. Een recht dat via `grant … to public` is uitgedeeld
-- geldt voor élke rol, `anon` en `authenticated` incluis, maar staat in
-- `information_schema` op de rij `grantee = 'PUBLIC'` en in `aclexplode()` op
-- grantee-oid `0`. Alle vier keken erlangs.
--
-- 📏 Gemeten op de lokale stack, niet uit de bestanden gelezen:
--
--   basislijn tijdstempel_bewaking()                     0 bevindingen
--   grant insert (created_at) on commitments to public
--     has_column_privilege('authenticated', …)           t    ← het recht ís er
--     tijdstempel_bewaking()                             0    ← en hij zwijgt
--   dezelfde grant aan authenticated
--     tijdstempel_bewaking()                             1    ← die ziet hij wél
--
-- ⚠️ **Spiegelbeeld van onwrikbare regel 4.** Daar leest `revoke … from public,
-- anon` als "van iedereen" en houdt precies de rol over waaronder elke ingelogde
-- gebruiker draait. Hier leest `grant … to public` als onschuldig en is hij
-- onzichtbaar voor de grendel die er juist over gaat. Dezelfde verwarring tussen
-- de SQL-rol `PUBLIC` en "openbaar", en dit project heeft er al een keer voor
-- betaald.
--
-- ---------------------------------------------------------------------------
-- Waarom dit een eigen migratie is en niet bij QS8-334 hoorde
-- ---------------------------------------------------------------------------
--
-- QS8-334 repareerde dezelfde fout op drie plekken in `scripts/` en `tests/`, en
-- zocht daar naar meer. Het waren er acht. De vier hieronder stonden in de
-- **database** en niet in de map, en de zoektocht ging over bestanden.
--
-- ⚠️ Dat is precies waar CLAUDE.md voor waarschuwt: `pg_get_functiondef()` is de
-- waarheid en niet het migratiebestand. Bewijs uit deze ronde: de gedéployde
-- `schrijfrechten_bewaking()` gebruikt al `has_table_privilege`, terwijl
-- migratiebestand 0101 nog de oude vorm draagt. Wie op de map had gezocht, had
-- die als vijfde bevinding gemeld en de vier échte gemist.
--
-- ---------------------------------------------------------------------------
-- Wat er per bewaking op het spel stond
-- ---------------------------------------------------------------------------
--
--   tijdstempel_bewaking()   `created_at` in handen van de client — het
--                            wachtvenster van 0171 en de bedenktijd van
--                            domeinregel 5 zijn dan met één PATCH terug te zetten
--   volgorde_bewaking()      de volgordesleutel van het auditspoor wordt
--                            schrijfbaar; domeinregel 6 is append-only
--   viewrechten_bewaking()   een view wordt een schrijfbare achterdeur langs de
--                            kolomgrants van `profiles` heen — precies wat 0095
--                            moest dichthouden
--   ddl_rechten_in_de_api()  `truncate` op `points_ledger` via PostgREST
--
-- 📏 Vandaag geen live gat: 0× `to public` in de migraties tegen 175× `to
-- authenticated`. Het waren blinde grendels en geen open deuren. ⚠️ Maar het
-- dashboard en `alter default privileges` zijn geen migratie, dus die telling
-- zegt niets over wat er op productie staat.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. De servertijdstempels
-- ---------------------------------------------------------------------------
--
-- ⚠️ De rol staat nu in het bezwaar. Dat is geen opsmuk: `has_column_privilege`
--    zegt alleen *of* het recht er is, en zonder de rol erbij is een bevinding
--    niet meer terug te leiden naar de grant die hem veroorzaakte.

create or replace function public.tijdstempel_bewaking()
  returns table (tabel text, kolom text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with tijdstempels as (
    select c.table_name::text as tabel, c.column_name::text as kolom
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.data_type = 'timestamp with time zone'
      and c.column_default like '%now()%'
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
  'Meldt elke servertijdstempel-kolom die een client mag schrijven. Sinds 0191 '
  'via has_column_privilege in plaats van een filter op grantee-naam, zodat een '
  'grant aan PUBLIC niet langer onzichtbaar is (QS8-337).';

-- ---------------------------------------------------------------------------
-- 2. De volgordesleutel van het auditspoor
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen de vierde tak verandert. De andere vier lezen `pg_attribute`,
--    `pg_index` en `has_sequence_privilege` — die laatste toetst het effectieve
--    recht al en was dus nooit blind.

create or replace function public.volgorde_bewaking()
  returns table (tabel text, bevinding text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with register as (
    select * from volgorde_register()
  ),
  kolom as (
    select r.tabel, r.kolom, r.indexnaam, a.attidentity
    from register r
    left join pg_attribute a
      on a.attrelid = ('public.' || r.tabel)::regclass
     and a.attname  = r.kolom
     and a.attnum   > 0
     and not a.attisdropped
  )
  select k.tabel, 'volgordekolom ' || k.kolom || ' bestaat niet'
    from kolom k where k.attidentity is null
  union all
  select k.tabel, 'volgordekolom ' || k.kolom || ' is geen generated always as identity'
    from kolom k where k.attidentity is not null and k.attidentity <> 'a'
  union all
  select k.tabel, 'unieke sorteerindex ' || k.indexnaam || ' ontbreekt'
    from kolom k
   where not exists (
     select 1 from pg_index i
     join pg_class c on c.oid = i.indexrelid
     where i.indrelid = ('public.' || k.tabel)::regclass
       and c.relname  = k.indexnaam
       and i.indisunique
   )
  union all
  select k.tabel, 'volgordekolom ' || k.kolom || ' staat in een ' || r.recht
                  || '-grant van ' || rol.naam
    from kolom k
    cross join (values ('anon'), ('authenticated')) as rol(naam)
    cross join (values ('INSERT'), ('UPDATE')) as r(recht)
   where k.attidentity is not null
     and has_column_privilege(rol.naam, ('public.' || quote_ident(k.tabel))::regclass, k.kolom, r.recht)
  union all
  select k.tabel,
         'sequence ' || s.relname || ' is ' || p.recht || ' voor ' || p.rol
    from kolom k
    join pg_attribute a on a.attrelid = ('public.' || k.tabel)::regclass
                       and a.attname  = k.kolom
    join pg_depend    d on d.refobjid = a.attrelid
                       and d.refobjsubid = a.attnum
                       and d.deptype  = 'i'
    join pg_class     s on s.oid = d.objid and s.relkind = 'S'
    cross join (values ('anon', 'USAGE'), ('anon', 'UPDATE'), ('anon', 'SELECT'),
                       ('authenticated', 'USAGE'), ('authenticated', 'UPDATE'),
                       ('authenticated', 'SELECT')) as p(rol, recht)
   where has_sequence_privilege(p.rol, s.oid, p.recht)
  order by 1, 2;
$$;

comment on function public.volgorde_bewaking() is
  'Bewaakt de volgordesleutel van het auditspoor (0176). Sinds 0191 toetst de '
  'grant-tak has_column_privilege in plaats van een grantee-naam, zodat een '
  'grant aan PUBLIC niet langer onzichtbaar is (QS8-337).';

-- ---------------------------------------------------------------------------
-- 3. De views
-- ---------------------------------------------------------------------------
--
-- ⚠️ `aclexplode()` gaf hier grantee-oid `0` voor PUBLIC, en
--    `pg_get_userbyid(0)` levert geen rolnaam op die in de filter voorkomt — dus
--    viel PUBLIC eruit. `has_table_privilege` heeft dat probleem niet.

create or replace function public.viewrechten_bewaking()
  returns table (view_naam text, rol text, recht text)
  language sql
  stable
  security definer
  set search_path = public, pg_catalog, pg_temp
as $$
  select c.relname::text, rol.naam, r.recht
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as rol(naam)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('REFERENCES')) as r(recht)
  where n.nspname = 'public'
    and c.relkind = 'v'
    and has_table_privilege(rol.naam, c.oid, r.recht)
  order by 1, 2, 3;
$$;

comment on function public.viewrechten_bewaking() is
  'Meldt elke view waarop een client mag schrijven (0095). Sinds 0191 via '
  'has_table_privilege in plaats van aclexplode met een rolnaamfilter, zodat een '
  'grant aan PUBLIC niet langer onzichtbaar is (QS8-337).';

-- ---------------------------------------------------------------------------
-- 4. TRUNCATE en TRIGGER in de API
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Twee takken en twee verschillende reparaties.** De eerste leest bestaande
--    tabellen en kan naar `has_table_privilege`. De tweede leest
--    `pg_default_acl` — rechten op objecten die nog niet bestaan — en daar ís
--    geen `has_*_privilege` voor. Daar moet grantee-oid `0` dus met zoveel
--    woorden meegenomen worden; `0::regrole::text` geeft `-` en viel daardoor uit
--    de oude filter.

create or replace function public.ddl_rechten_in_de_api()
  returns table (waar text, eigenaar text, rol text, recht text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select c.relname::text, '-', rol.naam, r.recht
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) as rol(naam)
  cross join (values ('TRUNCATE'), ('TRIGGER')) as r(recht)
  where n.nspname = 'public'
    and c.relkind in ('r', 'v', 'p', 'm')
    and has_table_privilege(rol.naam, c.oid, r.recht)
  union all
  select '(standaardrechten)', d.defaclrole::regrole::text,
         case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end,
         case a.privilege_type when 'TRUNCATE' then 'TRUNCATE' else 'TRIGGER' end
  from pg_default_acl d,
       lateral aclexplode(d.defaclacl) a
  where d.defaclnamespace = 'public'::regnamespace
    and d.defaclobjtype = 'r'
    and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
    and a.privilege_type in ('TRUNCATE', 'TRIGGER')
    and exists (
      select 1 from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'v')
        and c.relowner = d.defaclrole
    )
  order by 1, 2, 3, 4;
$$;

comment on function public.ddl_rechten_in_de_api() is
  'Meldt TRUNCATE- en TRIGGER-rechten die via PostgREST bereikbaar zijn (0073). '
  'Sinds 0191 toetst de eerste tak has_table_privilege en neemt de tweede '
  'grantee-oid 0 (PUBLIC) mee, zodat een grant aan PUBLIC niet langer '
  'onzichtbaar is (QS8-337).';
