-- 0027_realtime_bewaking.sql — QS8-74, van afspraak naar test
--
-- ROLLBACK-PAD:
--   drop function if exists realtime_bewaking();
--
-- ⚠️ Waarom dit bestaat. Q-TODO A20 legt vast dat `completions`, `weekly_goals` en
--    sinds EPIC 7 ook `chat_messages` nooit `REPLICA IDENTITY FULL` mogen krijgen.
--    Supabase past RLS toe op INSERT- en UPDATE-gebeurtenissen, maar **niet op
--    DELETE**. Met de standaard replica identity gaat er bij een verwijdering
--    alleen een uuid over de lijn; met `FULL` gaat de volledige oude rij mee —
--    inclusief `status = 'missed'`, de notitie, of de tekst van een privégesprek —
--    naar iedereen die zich op die tabel abonneert.
--
--    `publish` is een optie van de publicatie en niet per tabel in te stellen, dus
--    er ís geen technische rem. A20 noemt dat "een afspraak en geen slot", met het
--    voorstel om hem in CLAUDE.md te zetten. Dat is gebeurd — en een afspraak in
--    een document is precies het soort ding waar een sessie over een half jaar
--    langs loopt.
--
--    Deze functie maakt er een test van. Ze leest niets anders dan de catalogus,
--    geeft geen rijgegevens terug en is uitsluitend voor `service_role`: de rol die
--    de testsuite gebruikt en die in productie nergens in de browser komt.
--
-- ⚠️ Bewust géén functie die iets kán zetten. Dit is een meter, geen kraan.

create or replace function realtime_bewaking()
  returns table (
    tabel            text,
    in_publicatie    boolean,
    replica_identity text
  )
  language sql
  stable
  security definer
  set search_path = public, pg_catalog, pg_temp
as $$
  select
    c.relname::text,
    exists (
      select 1 from pg_publication_tables t
      where t.pubname = 'supabase_realtime'
        and t.schemaname = 'public'
        and t.tablename = c.relname
    ),
    case c.relreplident
      when 'd' then 'default'
      when 'n' then 'nothing'
      when 'f' then 'full'
      when 'i' then 'index'
      else c.relreplident::text
    end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
  order by c.relname;
$$;

comment on function realtime_bewaking() is
  'Welke tabellen in de realtime-publicatie staan en met welke replica identity. '
  'Bestaat om Q-TODO A20 testbaar te maken: nooit REPLICA IDENTITY FULL op een '
  'tabel die realtime uitzendt. Alleen voor service_role.';

revoke all on function realtime_bewaking() from public, anon, authenticated;
grant execute on function realtime_bewaking() to service_role;
