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

-- ⚠️ `security definer`: hij leest `pg_policies`, en dat geeft voor een gewone
--    rol alleen de policies terug waar die rol zelf in voorkomt. Zonder definer
--    meet hij dus minder dan hij belooft. Zelfde reden als `archiefleesgat()`.
create or replace function public.leesroute_bewaking()
returns table (naam text, bezwaar text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select (p.tablename || '.' || p.policyname)::text,
         'leespolicy schrijft de lidmaatschapstoets zelf uit in plaats van de '
           || 'gedeelde toets aan te roepen — een kopie mist stilzwijgend een '
           || 'voorwaarde (QS8-459)'
  from pg_policies p
  where p.schemaname = 'public'
    and p.cmd in ('SELECT', 'ALL')
    and (coalesce(p.qual, '') like '%goal_group_links%'
      or coalesce(p.qual, '') like '%group_members%')
    -- De gesanctioneerde routes. Noemt een policy er één, dan loopt hij langs een
    -- gedeelde definitie en is het geen eigen kopie.
    and coalesce(p.qual, '') not like '%shares_group_with_goal%'
    and coalesce(p.qual, '') not like '%shares_group_with_user%'
    and coalesce(p.qual, '') not like '%is_group_member%'
    and coalesce(p.qual, '') not like '%is_group_admin%'
    and coalesce(p.qual, '') not like '%deelt_open_groep_met_doel%'
    and coalesce(p.qual, '') not like '%lid_van_open_groep%'
    and coalesce(p.qual, '') not like '%mag_groep_lezen%'
    -- Een policy die niets doorlaat, laat ook niets te ruim door.
    and coalesce(p.qual, '') <> 'false'
  order by 1;
$function$;

comment on function public.leesroute_bewaking() is
  'Leespolicies die de lidmaatschapstabellen zelf uitschrijven in plaats van de '
  'gedeelde groepstoets aan te roepen — QS8-459. Nul rijen is de bedoeling.';

-- ⚠️ **`from public, anon, authenticated` en niet `from public`** — in Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan alle drie
--    (beveiligingsregel 4). Alleen de suite roept hem aan, als `postgres`.
revoke execute on function public.leesroute_bewaking() from public, anon, authenticated;
