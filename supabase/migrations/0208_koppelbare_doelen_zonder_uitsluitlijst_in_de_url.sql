-- 0208_koppelbare_doelen_zonder_uitsluitlijst_in_de_url.sql — de uitsluitlijst
-- van het koppelscherm ging mee in de URL, en die heeft een grens (QS8-345)
--
-- ROLLBACK-PAD:
--   drop function if exists public.koppelbare_doelen(uuid);
--
--   ⚠️ Voegt alléén toe. Geen policy, view of grant van vóór 0208 wordt
--      gewijzigd, dus er is niets terug te zetten. De client-kant valt terug op
--      de `not.in`-vorm zodra deze functie weg is — met de grens die dit issue
--      beschrijft.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- QS8-342 haalde de uitsluiting uit het scherm en zette hem in de query: eerst
-- de al gekoppelde doel-id's ophalen, dan `not.in` over die lijst. Daarmee klopt
-- `count`, en dus ook de lege staat — dat was de hele reparatie.
--
-- Maar die lijst gaat mee in de URL. 📏 Gemeten tegen de lokale PostgREST met
-- echte JWT's, oplopend aantal id's:
--
--     380 id's   URL = 14156 tekens   -> HTTP 200
--     410 id's   URL = 15266 tekens   -> HTTP 200
--     420 id's   URL = 15636 tekens   -> HARDE FOUT: Headers Overflow Error
--
-- Wie zoveel eigen doelen aan één groep koppelt, krijgt het koppelblok van dat
-- groepsscherm permanent in de foutstaat en komt er binnen de app niet meer uit.
-- **Dezelfde doodlopende weg als QS8-342, verschoven van 21 doelen naar ~410.**
--
-- ⚠️ En dat is precies het argument dat de JSDoc van `fetchKoppelbareDoelen()`
--    zélf tegen bladeren-met-aftrekken maakte: een oplossing die met de omvang
--    meegroeit, groeit ook mee de klif af.
--
-- ---------------------------------------------------------------------------
-- De vorm
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen paginatie in de functie zelf, en dat is de reden dat `count` blijft
--    kloppen.** Zou hij `offset`/`limit` dragen, dan telt PostgREST wat er
--    terugkomt en niet wat er is — en dan liegt `meer` en de lege staat weer,
--    precies wat QS8-342 repareerde. De functie geeft de hele verzameling terug
--    en de client zet er `Range` en `count=exact` op: één verzoek, exacte telling.
--
-- ⚠️ **`security invoker`.** `goal_dashboard` staat zelf op `security_invoker =
--    true`; een definer-functie eromheen zou die eigenschap stilzwijgend
--    ongedaan maken en de view aan iedereen tonen. Dit is gebruiksgemak en geen
--    grens — de echte controle is `goal_group_links_insert` (lid van de groep én
--    eigenaar van het doel), en die verandert hier niet.
--
-- ⚠️ **De eigenaar komt uit `auth.uid()` en niet uit een parameter.** De oude
--    client-kant nam `userId` mee; als parameter zou dat een knop zijn om de
--    doelenlijst van een ánder op te vragen. Dat de view daar RLS op heeft, maakt
--    het niet minder een parameter die niemand nodig heeft.
--
-- ⚠️ **`not exists` en geen `not in`.** De PK van `goal_group_links` is
--    `(goal_id, group_id)`, dus de toets is een indexlookup per rij in plaats van
--    een lijst die met het aantal koppelingen meegroeit. Dat is de hele winst:
--    O(1) per doel in plaats van O(aantal koppelingen) in de URL.
--
-- ⚠️ **Sorteren op `target_date, id` en niet op `target_date` alleen.** Zonder de
--    tweede sleutel mag Postgres bij gelijke datums elke volgorde kiezen, en dan
--    kan een doel bij het bladeren twee keer verschijnen of overgeslagen worden.
--    De oude vorm had dat gebrek ook; hij verhuist niet mee.

create or replace function public.koppelbare_doelen(p_group_id uuid)
  returns setof goal_dashboard
  language sql
  stable
  security invoker
  set search_path to 'public', 'pg_temp' as $$
  select d.*
  from goal_dashboard d
  where d.owner_id = (select auth.uid())
    and d.status = 'active'
    and not exists (
      select 1 from goal_group_links l
      where l.goal_id = d.id and l.group_id = p_group_id
    )
  order by d.target_date asc, d.id asc
$$;

comment on function public.koppelbare_doelen(uuid) is
  'De actieve doelen van de aanroeper die nog niet aan p_group_id hangen '
  '(QS8-345). Serverzijdig uitsluiten, zodat de uitsluitlijst niet meer in de '
  'URL past te hoeven. Zonder paginatie: de client zet er Range en count=exact '
  'op, en dan blijft de telling exact.';

-- ⚠️ **`revoke` noemt `authenticated` met zoveel woorden** (onwrikbare regel 4):
--    `alter default privileges` deelt élke nieuwe functie in `public` uit aan
--    `anon`, `authenticated` én `service_role`, en `from public, anon` houdt
--    precies de rol over waaronder iedere ingelogde gebruiker draait. Eerst
--    alles eraf, dan bewust één recht terug.
revoke all on function public.koppelbare_doelen(uuid) from public, anon, authenticated;
grant execute on function public.koppelbare_doelen(uuid) to authenticated;
