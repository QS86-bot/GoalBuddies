-- 0101_service_role_tabellen_weigeren_luid.sql — schrijfrechten intrekken
--
-- ROLLBACK-PAD:
--   drop function if exists public.schrijfrechten_bewaking();
--   grant insert, update, delete on public.points_ledger,   public.user_streaks,
--                                    public.week_pass_events, public.chain_links
--     to anon, authenticated;
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Vier tabellen die per ontwerp alleen door `service_role` geschreven
--    worden, droegen nog de standaard Supabase-tabelgrants.** `points_ledger`,
--    `user_streaks`, `week_pass_events` en `chain_links` hebben bewust álleen
--    een SELECT-policy — en `anon` en `authenticated` hielden INSERT, UPDATE en
--    DELETE als tabelrecht.
--
-- ⚠️ **De gegevens waren veilig; het faalgedrag was stil.** Voor INSERT levert
--    het een harde `42501` op: er is geen rij om weg te filteren. Voor UPDATE en
--    DELETE niet — RLS filtert de rijen weg, en een DELETE die nul rijen raakt is
--    geen fout. De client kreeg HTTP 204 en een ongewijzigde tabel.
--
-- ⚠️ **Waarom dat toch opgeruimd hoort te worden.** Een test die op `42501`
--    rekent, wordt op zo'n tabel groen zonder iets te bewijzen; en een lezer die
--    de grants naast de policies legt, ziet vier tabellen die eruitzien alsof de
--    client er iets mag. De rij van 19-08 in `docs/ENGINEER-REVIEW.md` noemde het
--    al en zette het bewust apart: het raakt vier tabellen tegelijk en hoorde niet
--    bij QS8-81.
--
-- ---------------------------------------------------------------------------
-- Wie er wél schrijft, en waarom die er geen last van heeft
-- ---------------------------------------------------------------------------
--
-- Op 27-08-2026 nagemeten tegen de gedeployde database, met
-- `pg_get_functiondef()` over álle functies in `public`:
--
--   * `award_points_on_approval`, `trek_goedkeuring_in` → `points_ledger`
--   * `herbereken_reeks`                                → `user_streaks`
--   * `ketting_schakel`, `ketting_uit_weekafsluiting`   → `chain_links`
--   * `verbruik_weekpas`, `verdien_weekpassen`          → `week_pass_events`
--
-- Alle zeven zijn SECURITY DEFINER en draaien dus met de rechten van de
-- eigenaar, niet met die van de aanroeper. Daarbuiten schrijft alleen de
-- Edge Function `rollover`, en die gebruikt de service-role-sleutel.
--
-- In `src/` en `app/` staat geen enkele schrijfactie op deze vier tabellen —
-- alleen `select` op `user_streaks` (`stand.ts`) en een `count` op
-- `points_ledger` (`approvals.ts`).
--
-- ---------------------------------------------------------------------------

revoke insert, update, delete on public.points_ledger    from anon, authenticated;
revoke insert, update, delete on public.user_streaks     from anon, authenticated;
revoke insert, update, delete on public.week_pass_events from anon, authenticated;
revoke insert, update, delete on public.chain_links      from anon, authenticated;

-- ---------------------------------------------------------------------------
-- En een bewaking, want een grant komt stil terug
-- ---------------------------------------------------------------------------
--
-- ⚠️ `alter default privileges` van Supabase geeft nieuwe tabellen in `public`
--    automatisch de volle set aan `anon` en `authenticated`. Dat is precies hoe
--    deze vier eraan kwamen. Een volgende tabel die alleen door `service_role`
--    geschreven hoort te worden, krijgt ze dus ook — zonder dat iemand iets doet.
--
-- ⚠️ De lijst staat in de functie en niet in een tabel: hij hoort bij een
--    besluit, niet bij data, en een tabel zou hem beschrijfbaar maken. Zelfde
--    keuze als bij `check_waarden()` (0082).

create or replace function public.schrijfrechten_bewaking()
returns table (tabel text, rol text, recht text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select g.table_name::text, g.grantee::text, g.privilege_type::text
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.table_name in ('points_ledger', 'user_streaks', 'week_pass_events', 'chain_links')
    and g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  order by 1, 2, 3;
$$;

revoke all on function public.schrijfrechten_bewaking() from public, anon, authenticated;
grant execute on function public.schrijfrechten_bewaking() to service_role;
