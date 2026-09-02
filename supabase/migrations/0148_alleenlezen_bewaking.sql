-- 0148_alleenlezen_bewaking.sql — welke policyhelften de client altijd weigeren,
-- uitgerekend in plaats van opgeschreven.
--
-- ROLLBACK-PAD:
--   drop function if exists public.alleenlezen_bewaking();
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gemeten op 01-09-2026 met `npm run rls:dekking` (QS8-185): **81 van de 102
-- meetbare policyhelften worden door een test bewaakt, 21 niet** (QS8-262). Dat
-- is geen lijst van beveiligingsgaten — de policies zijn vermoedelijk correct.
-- Wat ontbreekt is de test die het merkt als iemand ze omzet: het verschil
-- tussen "het klopt" en "het blijft kloppen".
--
-- Deze migratie doet de eerste ronde daarvan, en die ronde heeft een vorm.
--
-- ---------------------------------------------------------------------------
-- 1. Waarom een functie en geen lijst in een testbestand
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een lijst met namen erin gebeiteld kijkt de andere kant op, en dat is in
--    dit project al een keer misgegaan.** 0101 trok schrijfrechten in op vier
--    tabellen en zette er een bewaking naast met díe vier namen erin. Op 28-08
--    stonden er 58 rechten voor `anon` over 21 tabellen — geen enkele in die
--    lijst. 0118 verving hem door de regel die de lijst uitrékent, en sindsdien
--    vindt hij de tabel die er morgen bijkomt.
--
--    Dit is dezelfde beweging voor de andere kant van hetzelfde slot: tabellen
--    die de client alleen mag **lezen**, waar schrijven via een definer-functie
--    loopt en de policy letterlijk `false` zegt. `alleenlezen_bewaking()` rekent
--    uit wélke dat zijn; `tests/rls/alleenlezen.test.ts` legt zijn eigen lijst
--    met fixtures ernaast en wordt rood zodra de twee uiteenlopen.
--
--    **In béide richtingen, en dat is de helft die ertoe doet.** Komt er een
--    tabel bij: rood, tot iemand er een fixture voor schrijft. Valt er een
--    `false` weg: ook rood — en dát is de regressie waar QS8-262 om vroeg.
--
-- ---------------------------------------------------------------------------
-- 2. `has_any_column_privilege` en niet `has_table_privilege`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dat is geen smaak maar de fout die op 01-09 een hele meting bedierf.**
--    Een tabel met alleen kolomgrants geeft `false` op `has_table_privilege`
--    terwijl de client wel degelijk mag schrijven; die ene toets sloot
--    `goals_insert`, `completions_insert` en `profiles_update` uit een meting
--    die daarna geruststellend te laag uitkwam. DELETE kent geen kolomvorm —
--    `has_any_column_privilege(..., 'DELETE')` gooit zelfs `unrecognized
--    privilege type` — dus die blijft `has_table_privilege`.
--
-- ⚠️ **Zonder recht is de policy niet de grendel maar de grant.** Dan kan geen
--    enkele test over die policy omvallen: de DELETE geeft `42501` óók met de
--    policy wagenwijd open. Dat is regel 18 vraag 3, en daarom staat de
--    rechtentoets in deze functie en niet in het testbestand. `chain_links` en
--    `milestone_tips` vallen er zo vanzelf uit; die worden bewaakt in
--    `tests/rls/schrijfrechten.test.ts`, waar ze thuishoren.
--
-- ---------------------------------------------------------------------------
-- 3. Wat `for all` hier doet
-- ---------------------------------------------------------------------------
--
-- Een `for all`-policy is één policy voor vier opdrachten, en welk recht daarbij
-- hoort is dus niet één ding. Vandaag heeft geen enkele `for all`-policy een
-- `false`-helft. Zou dat veranderen, dan komt hij hier binnen als
-- `opdracht = 'ALL'` en wordt het testbestand rood omdat er geen fixture voor
-- is. **Stilzwijgend overslaan is precies wat 0101 deed.**

create or replace function public.alleenlezen_bewaking()
returns table (
  tabel     text,
  opdracht  text,
  helft     text
)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  select p.tablename::text, p.cmd::text, h.helft
  from pg_policies p
  cross join lateral (values ('using', p.qual), ('check', p.with_check)) as h(helft, uitdrukking)
  -- ⚠️ **`to_regclass` en niet `format(...)` rechtstreeks, en dat is geen
  --    netheid.** De eerste versie bouwde `'public.' || tablename` en gaf dat
  --    aan `has_table_privilege()`, met `schemaname = 'public'` in dezelfde
  --    `where`. Postgres mag `where`-voorwaarden in elke volgorde uitvoeren, dus
  --    de rechtentoets liep óók op de storage-policies op `objects` — en die
  --    tabel heet `storage.objects`, niet `public.objects`. Resultaat: `relation
  --    "public.objects" does not exist`, en de hele functie viel om.
  --    `to_regclass` geeft `null` waar de naam niet oplost in plaats van te
  --    gooien, en het schema komt nu uit de rij zelf.
  --    ⚠️ Gevonden doordat de test hem aanriep, niet door hem te lezen.
  cross join lateral (
    select to_regclass(format('%I.%I', p.schemaname, p.tablename)) as rel
  ) r
  where p.schemaname = 'public'
    and p.permissive = 'PERMISSIVE'
    and h.uitdrukking = 'false'
    and 'authenticated' = any (p.roles)
    and r.rel is not null
    and case p.cmd
          when 'DELETE' then has_table_privilege('authenticated', r.rel, 'DELETE')
          when 'ALL' then true
          else has_any_column_privilege('authenticated', r.rel, p.cmd)
        end
  order by 1, 2, 3;
$$;

comment on function public.alleenlezen_bewaking() is
  'Elke policyhelft die letterlijk `false` is terwijl `authenticated` het recht '
  'wél heeft — dus waar de policy de grendel is en niet de grant. Voedt '
  'tests/rls/alleenlezen.test.ts, dat er fixtures naast legt.';

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`: in Supabase
--    deelt `alter default privileges` élke nieuwe functie ook aan
--    `authenticated` uit, en die rol is precies degene die je eruit wilt hebben.
--    Op 28-08 stond `seizoensrecap_cijfers()` daardoor op productie voor iedere
--    ingelogde gebruiker open (beveiligingsregel 4).
revoke all on function public.alleenlezen_bewaking() from public, anon, authenticated;
grant execute on function public.alleenlezen_bewaking() to service_role;
