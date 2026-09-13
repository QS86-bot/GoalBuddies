-- 0259_een_leespolicy_routeert_via_de_gedeelde_groepstoets.sql — een leespolicy
-- mag de lidmaatschapstabellen niet zelf uitschrijven; hij routeert via de
-- gedeelde groepstoets (QS8-459).
--
-- ROLLBACK-PAD:
--   drop function if exists public.leesroute_bewaking();
--   Geen tabel, kolom, policy of grant gewijzigd — deze migratie voegt alleen
--   een bewakingsfunctie toe.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Middel-rij 520 uit `docs/ENGINEER-REVIEW.md` (06-09-2026), op 13-09
--    nagemeten — en de meting gaf iets anders dan de rij verwachtte.
--
--    De rij zei dat een verruiming van `shares_group_with_goal()` onopgemerkt
--    zou blijven. **Dat is niet zo.** Alle vijf de voorwaarden in die functie
--    zijn met de hand weggehaald en de RLS-suite werd elke keer rood:
--
--      de kijker hoeft geen actief lid te zijn   ->  3 tests rood
--      de eigenaar hoeft geen actief lid te zijn ->  4 tests rood
--      de groep mag gearchiveerd zijn            ->  4 tests rood
--      de eigenaar-join helemaal weg             ->  4 tests rood
--      de kijker mag iedereen zijn               -> 20 tests rood
--
--    En `goal_events_select` op `using (true)` gooien geeft 1 rode test.
--
-- ⚠️⚠️ **Maar de verruiming die er in de praktijk uitziet als een refactor, komt
--    er wél doorheen.** 📏 Gemeten: vervang in `goal_events_select` de aanroep
--    `shares_group_with_goal(g.id)` door een eigen `exists` over
--    `goal_group_links` + `group_members` — dezelfde vorm, maar zónder de eis dat
--    de **eigenaar** nog lid is en zónder de archieftoets. Uitslag:
--
--      1796 passed | 0 failed
--
--    De hele suite blijft groen terwijl een uitgetreden lid en een gearchiveerde
--    groep er weer bij kunnen. Dat is de vorm van regel 18: elk onderdeel klopt,
--    en de naad — *loopt deze policy nog langs de gedeelde toets* — is van
--    niemand.
--
-- ---------------------------------------------------------------------------
-- Waarom een routetoets en niet de expressie vastpinnen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een letterlijke vergelijking op `pg_get_expr()` is bros: commentaar,
--    witruimte en een hernoemd alias veranderen legitiem, en een controle die
--    daarop rood wordt leer je uitzetten. Wat je wél hard kunt stellen is de
--    **route**: een leespolicy die groepsgenoten iets laat zien, hoort dat via de
--    gedeelde toets te doen en niet via een eigen kopie.
--
-- ⚠️ Dezelfde vorm als de derde tak van `archiefleesgat()` (0164), die voor
--    **schrijvende** policies eist dat er érgens een archieftoets in zit. Die tak
--    dekt `p.cmd <> 'SELECT'`; deze dekt de leeskant, en dat was de helft die
--    niemand had.
--
-- ⚠️ `p.cmd in ('SELECT', 'ALL')` en alleen `p.qual`: de `using`-helft van een
--    `for all` stuurt óók SELECT aan. Dat is de les van QS8-458, één migratie
--    terug.
--
-- 📏 Groen bij invoering: van de leespolicies noemt er **geen enkele** de
--    lidmaatschapstabellen rechtstreeks. De enige policy in `public` die dat wél
--    doet is `goal_group_links_delete`, en dat is een DELETE — buiten bereik van
--    deze tak, en al een benoemde uitzondering in `archiefleesgat()`.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `security definer`, om dezelfde reden als `archiefleesgat()` en
--    `alleenlezen_bewaking()`: deze bewakingsfuncties draaien allemaal als
--    eigenaar, zodat de suite ze op één manier kan aanroepen.
--
--    ⚠️ **Niet omdat `pg_policies` rolgefilterd zou zijn** — dat stond hier eerst
--       en het is nagemeten onwaar: `postgres` ziet er 95 en `authenticated` ook
--       95. Een uitgeschreven reden die niet klopt, reist mee naar de volgende
--       functie; de `revoke` hieronder is wat de toegang regelt.
create or replace function public.leesroute_bewaking()
returns table (naam text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- ⚠️⚠️ **Twee takken, en dat is een correctie die een security-review afdwong.**
  --    De eerste versie had één platte lijst gesanctioneerde toetsen, met
  --    `mag_groep_lezen` erop. 📏 Gemeten: die toetst alleen de **kijker** en doet
  --    **geen** archieftoets, dus
  --
  --      using (exists (select 1 from goal_group_links l
  --                     where l.goal_id = g.id and mag_groep_lezen(l.group_id)))
  --
  --    noemt netjes een gesanctioneerde naam en laat precies de verruiming door
  --    waar deze grendel voor bestaat. Met echte rijen, als `authenticated`:
  --
  --      gearchiveerde groep -> shares_group_with_goal = false, deze route = true
  --
  --    Een gearchiveerde groep die weer meeleest, ziet ook `missed`-weekdoelen —
  --    het schaamtemoment waar domeinregel 7 voor bestaat.
  --
  -- ⚠️ De splitsing volgt het register in `tests/rls/hulpfunctiemodel.test.ts`:
  --    alleen `shares_group_with_goal` en `deelt_open_groep_met_doel` dragen
  --    `nietInactief: 2` én `archief: true`. Dat zijn de enige twee die een
  --    **doel** mogen ontsluiten. `mag_groep_lezen` is met opzet zwakker (0153):
  --    een groepslezing mag een archief overleven, een doellezing niet.

  -- Tak 1 — de policy ontsluit een **doel**: alleen de twee sterke routes tellen.
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy ontsluit een doel maar routeert niet via shares_group_with_goal() '
           || 'of deelt_open_groep_met_doel() — een zwakkere route laat een archief of '
           || 'een uitgetreden eigenaar door (QS8-459)'
  from pg_policies p
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') like '%goal_group_links%'
    and coalesce(p.qual, '') not like '%shares_group_with_goal%'
    and coalesce(p.qual, '') not like '%deelt_open_groep_met_doel%'
    and coalesce(p.qual, '') <> 'false'

  union all

  -- Tak 2 — de policy ontsluit **groepslidmaatschap** zonder doel: de bredere
  -- lijst mag, want hier speelt de eigenaar van een doel geen rol.
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy schrijft de lidmaatschapstoets zelf uit in plaats van een '
           || 'gedeelde toets aan te roepen — een kopie mist stilzwijgend een '
           || 'voorwaarde (QS8-459)'
  from pg_policies p
  where p.schemaname in ('public', 'storage')
    and p.cmd in ('SELECT', 'ALL')
    and coalesce(p.qual, '') like '%group_members%'
    and coalesce(p.qual, '') not like '%goal_group_links%'
    and coalesce(p.qual, '') not like '%shares_group_with_goal%'
    and coalesce(p.qual, '') not like '%deelt_open_groep_met_doel%'
    and coalesce(p.qual, '') not like '%shares_group_with_user%'
    and coalesce(p.qual, '') not like '%is_group_member%'
    and coalesce(p.qual, '') not like '%is_group_admin%'
    and coalesce(p.qual, '') not like '%lid_van_open_groep%'
    and coalesce(p.qual, '') not like '%mag_groep_lezen%'
    and coalesce(p.qual, '') <> 'false'

  order by 1;
$function$;

comment on function public.leesroute_bewaking() is
  'Leespolicies die de lidmaatschapstabellen zelf uitschrijven of via een te zwakke '
  'route ontsluiten — QS8-459. Nul rijen is de bedoeling.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`** — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.leesroute_bewaking() from public, anon, authenticated;
