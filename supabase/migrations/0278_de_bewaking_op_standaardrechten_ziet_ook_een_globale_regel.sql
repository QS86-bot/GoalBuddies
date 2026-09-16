-- 0278_de_bewaking_op_standaardrechten_ziet_ook_een_globale_regel.sql —
-- `ddl_rechten_in_de_api()` filterde op `defaclnamespace = 'public'` en keek
-- daarmee langs een `alter default privileges` zónder `in schema`.
--
-- ROLLBACK-PAD:
--   Zet het namespace-filter in `ddl_rechten_in_de_api()` terug op
--   `d.defaclnamespace = 'public'::regnamespace` — dat is de vorm van 0191.
--   De functie wordt hier met `create or replace` herschreven; haar
--   handtekening, returntype en rechten blijven ongewijzigd, dus er is niets
--   te droppen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 **Gemeten op 16-09-2026 tegen de lokale stack op 0277**, in een
--    teruggedraaide transactie:
--
--      alter default privileges grant truncate on tables to anon;  -- zónder schema
--
--                                    nulmeting   na die regel
--      ddl_rechten_in_de_api()             0          0   <-- blind
--      standaardrechten_bewaking()         0          1
--
--    En dezelfde regel mét `in schema public` erbij gaf `ddl_rechten_in_de_api()`
--    wél 1. Het verschil zit dus uitsluitend in de vorm van de regel, niet in
--    wat hij uitdeelt.
--
-- ⚠️ **Een globale regel is niet zwakker maar sterker.** `alter default
--    privileges` zónder `in schema` landt in `pg_default_acl` op
--    `defaclnamespace = 0` en geldt daarmee voor **alle** schema's, `public`
--    inbegrepen. De kortere vorm is dus de gevaarlijkere — en het is de vorm
--    die je per ongeluk typt, want hij is korter.
--
-- ⚠️ **Dit is de klasse die 0191 half gedekt heeft.** Dat issue repareerde de
--    PUBLIC-kant (grantee-oid `0`) in vier bewakingen en liet de namespace-kant
--    staan. `standaardrechten_bewaking()` uit 0263 dekt allebei de kanten al —
--    `d.defaclnamespace in (0, 'public'::regnamespace)` — en die vorm wordt hier
--    overgenomen. Daarmee is de TRUNCATE/TRIGGER-belofte van 0073 de laatste die
--    langs deze weg te omzeilen was, en dat is hij nu niet meer.
--
-- ⚠️ **Alleen het namespace-filter verandert.** De `has_table_privilege`-helft,
--    het returntype, de `order by` en de rechten blijven woordelijk zoals 0191
--    ze achterliet. Een bewaking die je bij de reparatie ook herschrijft, is een
--    bewaking waarvan je daarna niet meer weet welke helft je gemeten hebt.
--
-- ---------------------------------------------------------------------------

create or replace function public.ddl_rechten_in_de_api()
returns table(waar text, eigenaar text, rol text, recht text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  -- ⚠️ `in (0, 'public'::regnamespace)` en niet `= 'public'::regnamespace`.
  --    `defaclnamespace = 0` is een regel zónder `in schema`: die geldt voor
  --    álle schema's en dus óók voor `public`. Zelfde vorm als
  --    `standaardrechten_bewaking()` (0263).
  where d.defaclnamespace in (0, 'public'::regnamespace)
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
$function$;

comment on function public.ddl_rechten_in_de_api() is
  'Meldt TRUNCATE/TRIGGER op de API-rollen — op de tabellen die er staan én via '
  'de standaardrechten, met of zonder `in schema` (0278).';

-- ⚠️ `create or replace` houdt de bestaande rechten in stand; deze twee regels
--    staan er omdat `tests/rls/functiegrants.test.ts` elk uitvoerrecht naast een
--    expliciete grant-regel legt. Een recht zonder grant-regel is geërfd en niet
--    besloten. De vorm is `from public, anon, authenticated` — `revoke ... from
--    public, anon` laat precies de rol staan waaronder iedere ingelogde
--    gebruiker draait.
revoke all on function public.ddl_rechten_in_de_api() from public, anon, authenticated;
grant execute on function public.ddl_rechten_in_de_api() to service_role;
