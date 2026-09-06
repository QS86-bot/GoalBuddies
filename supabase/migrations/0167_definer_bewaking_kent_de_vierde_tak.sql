-- 0167_definer_bewaking_kent_de_vierde_tak.sql — vijf definer-functies dicht, en een
-- grendel die de zesde vindt (QS8-289, vervolg op QS8-287/0165)
--
-- ROLLBACK-PAD:
--   De rechten terug:
--
--   grant execute on function public.check_waarden(text, text)          to authenticated;
--   grant execute on function public.systeembericht_allowlist()         to authenticated;
--   grant execute on function public.onveranderlijkheid_bewaking()      to authenticated;
--   grant execute on function public.uitnodigingscode_bewaking()        to authenticated;
--   grant execute on function public.goedkeuringsdrempel_gehaald(uuid)  to authenticated;
--
--   En `definer_bewaking()` terug naar de versie van 0156 — die staat daar
--   voluit en is met `create or replace` terug te zetten.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0165 sloot één geval: `verdien_badges()` was `SECURITY DEFINER`, uitvoerbaar
-- door `authenticated`, en toetste de aanroeper nergens. QS8-289 vroeg of er
-- meer van die vorm zijn.
--
-- 📏 Gemeten tegen de dráaiende database (`pg_get_functiondef()`, niet de
--    bestanden): **tien** functies zijn definer, uitvoerbaar door
--    `authenticated`, en noemen `auth.uid()` niet in hun lichaam.
--
-- ⚠️ **Drie van die tien zijn géén bevinding, en dat is de belangrijkste
--    vondst.** `groep_klassement`, `groep_teller` en `ketting_stand` toetsen de
--    aanroeper wel degelijk — via `lid_van_open_groep()` respectievelijk
--    `is_group_member()`, en díe noemen `auth.uid()`. Een tak die alleen naar
--    het eigen lichaam kijkt, meldt die drie ten onrechte. Een controle die
--    drie terechte functies aanwijst, leer je wegklikken; daarom kijkt de tak
--    hieronder één laag dieper (sectie 2).
--
-- 📏 Het lek zelf gereproduceerd met `role authenticated` en een `sub` die niet
--    eens in `profiles` staat:
--
--      uitnodigingscode_bewaking()   -> (30, 12, 240, t)
--      systeembericht_allowlist()    -> de allowlist
--      onveranderlijkheid_bewaking() -> 4 rijen tabel/trigger/functie/kolom
--      check_waarden('public','goals') -> de CHECK-waarden van elke tabel
--
-- ⚠️ `uitnodigingscode_bewaking()` is de scherpste: de openstaande dossierrij
--    van 16-08 over `invite_preview` noemt de entropie van de code — twaalf
--    tekens uit een alfabet van dertig — als de énige bescherming tegen raden.
--    Deze functie serveert precies die getallen op verzoek.
--
-- 📏 Aanroepers gemeten, niet beredeneerd: geen van de vijf heeft een aanroeper
--    in `src/`, `app/` of `supabase/functions/`, en de enige sql-aanroepers van
--    `goedkeuringsdrempel_gehaald` zijn `meld_goedkeuring`,
--    `award_points_on_approval` en `trek_goedkeuring_in` — alle drie definer met
--    eigenaar `postgres`, dus die draaien niet onder het recht van
--    `authenticated` en breken niet.
--
-- ⚠️ **Twee zusjes blijven met opzet staan**, want daar is de revoke níet
--    gratis; ze staan hieronder in het register mét reden en datum:
--    `vereiste_goedkeuringen` zit in `openstaande_beoordelingen()` (INVOKER) en
--    `groepsdatum` in `group_overview()` (INVOKER) én in de policy
--    `chain_links_select` — een policy-expressie draait onder het recht van de
--    aanroeper, dus een revoke zet De Ketting op slot voor iedereen. Beide
--    vragen een toets binnenín; dat is ander werk met een ander risico.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Vijf rechten intrekken
-- ---------------------------------------------------------------------------
--
-- ⚠️ De volledige vorm van onwrikbare regel 4: `from public, anon,
--    authenticated`. `from public, anon` alléén is precies de schrijfwijze die
--    het gat in 0113 veroorzaakte. `service_role` houdt het recht — de vier
--    bewakingsfuncties bestaan om via `adminDb()` in de testsuite gedraaid te
--    worden.

revoke execute on function public.check_waarden(text, text)
  from public, anon, authenticated;

revoke execute on function public.systeembericht_allowlist()
  from public, anon, authenticated;

revoke execute on function public.onveranderlijkheid_bewaking()
  from public, anon, authenticated;

revoke execute on function public.uitnodigingscode_bewaking()
  from public, anon, authenticated;

revoke execute on function public.goedkeuringsdrempel_gehaald(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. definer_bewaking() — de vierde tak, en een register dat niet mag rotten
-- ---------------------------------------------------------------------------
--
-- De eerste drie takken staan onveranderd; ze komen uit 0106, 0114 en 0156 en
-- de toelichting daar geldt nog steeds. Nieuw zijn de vierde en de vijfde.
--
-- ⚠️ **"Toetst de aanroeper" is transitief en niet tekstueel.** Een functie
--    voldoet als haar eigen lichaam `auth.uid()` noemt, óf als ze een functie in
--    `public` aanroept die dat (transitief) doet. Zonder die tweede helft melden
--    we `groep_klassement`, `groep_teller` en `ketting_stand` ten onrechte —
--    gemeten, zie de kop.
--
-- ⚠️ **Commentaar telt niet mee.** `pg_get_functiondef()` geeft het lichaam
--    inclusief `--`-regels, en een toelichting die `is_group_member()` noemt zou
--    anders als delegatie gelden. Ze worden er eerst uit geknipt.
--
-- ⚠️ **De aanroep wordt op de haak herkend** (`naam(`) en niet op de naam
--    alleen: een functie die `groepsdatum` in een kolomalias noemt, roept hem
--    niet aan.
--
-- ⚠️ **De vijfde tak is de andere kant van de ratel.** Een register zonder
--    houdbaarheidsdatum rot: staat er een naam op die niet meer bestaat of die
--    het recht niet meer heeft, dan dekt het register iets af wat er niet is en
--    dekt het straks stilzwijgend iets ánders af. Dan is dít rood.

create or replace function public.definer_bewaking()
returns table(naam text, bezwaar text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive
  -- Elk lichaam één keer, zonder commentaarregels.
  lichaam as (
    select p.oid,
           p.proname::text as fnaam,
           regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') as body
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  -- Wie de aanroeper toetst: zelf, of via een functie die het doet.
  toetsers as (
    select l.oid, l.fnaam
    from lichaam l
    where l.body like '%auth.uid()%'
    union
    select l.oid, l.fnaam
    from lichaam l
    join toetsers t on l.oid <> t.oid
                   and l.body ~ ('\m' || t.fnaam || '[[:space:]]*\(')
  ),
  -- Het register: bekend, benoemd, met reden en datum.
  --
  -- ⚠️ Een regel hier is een schuld en geen vrijstelling. Verdwijnt de reden,
  --    dan hoort de regel weg — en tak 5 wordt rood zodra hij niets meer dekt.
  uitzonderingen(fnaam, reden, sinds) as (
    values
      ('invite_preview',
       'bewust open voor anon: een uitnodigingslink werkt vóór het inloggen (0019, 0080)',
       '2026-08-16'),
      ('vereiste_goedkeuringen',
       'zit in openstaande_beoordelingen() (INVOKER); een revoke breekt de app, er is een toets binnenin nodig — QS8-289 deel B',
       '2026-09-06'),
      ('groepsdatum',
       'zit in group_overview() (INVOKER) en in de policy chain_links_select; een policy draait onder het recht van de aanroeper — QS8-289 deel B',
       '2026-09-06')
  )
  select p.proname::text, 'geen set search_path'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%')
  union all
  select p.proname::text, 'pg_temp hoort achteraan in het zoekpad'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select c from unnest(coalesce(p.proconfig, '{}')) c where c like 'search\_path=%' limit 1
  ) g(regel)
  cross join lateral (select btrim(substring(g.regel from 13))) v(pad)
  cross join lateral (select string_to_array(v.pad, ',')) d(delen)
  where n.nspname = 'public'
    and v.pad <> '""'
    and (
      coalesce(array_length(d.delen, 1), 0) < 2
      or btrim(d.delen[array_length(d.delen, 1)]) <> 'pg_temp'
    )
  union all
  select p.proname::text, 'uitvoerbaar door anon'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in (select u.fnaam from uitzonderingen u)
  union all
  -- Tak 4 — de klasse van QS8-287/QS8-289.
  select l.fnaam, 'definer, uitvoerbaar door authenticated, en toetst de aanroeper niet'
  from lichaam l
  join pg_proc p on p.oid = l.oid
  where p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not exists (select 1 from toetsers t where t.oid = l.oid)
    and l.fnaam not in (select u.fnaam from uitzonderingen u)
  union all
  -- Tak 5 — het register mag niet rotten.
  select u.fnaam, 'staat als uitzondering geregistreerd (' || u.sinds || ') maar is geen bezwaar meer'
  from uitzonderingen u
  where not exists (
    select 1
    from lichaam l
    join pg_proc p on p.oid = l.oid
    where l.fnaam = u.fnaam
      and p.prosecdef
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or (
          has_function_privilege('authenticated', p.oid, 'execute')
          and not exists (select 1 from toetsers t where t.oid = l.oid)
        )
      )
  )
  order by 1, 2;
$$;

comment on function public.definer_bewaking() is
  'Vijf takken: geen gepind zoekpad, pg_temp niet achteraan, definer open voor '
  'anon, definer open voor authenticated zonder toets op de aanroeper, en een '
  'register dat niet meer dekt wat het beweert. ⚠️ "Toetst de aanroeper" is '
  'transitief: auth.uid() in het eigen lichaam of in een functie die wordt '
  'aangeroepen. Zie migratie 0167 (QS8-289).';

commit;
