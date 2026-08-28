-- 0107_ketting_stand_peilt_per_lid.sql — de adempauze wordt in UTC gepeild en dat kost de groep een voltallige week
--
-- ROLLBACK-PAD:
--   Herstel de versie uit 0071 (of de laatste migratie die `ketting_stand()`
--   herschreef): vervang `(now() at time zone p.tz)::date` weer door
--   `current_date` en haal de `join profiles p on p.id = m.user_id` weg. De
--   functie is verder ongewijzigd; er is geen datamigratie en niets om terug te
--   draaien in de tabellen.
--
-- ---------------------------------------------------------------------------
-- Waarom dit bestaat
-- ---------------------------------------------------------------------------
--
-- ⚠️ De bevinding van 25-08 zag het goed en trok de verkeerde conclusie. Hij
--    noemde `current_date between b.starts_cycle and b.ends_cycle` de enige
--    échte péiling tussen twaalf voorkomens van `current_date` — dat klopt — en
--    besloot toen dat het echte antwoord "een tijdzone per lid in deze query"
--    vraagt en dat dat "een ontwerpwijziging en geen regel" is.
--
--    Dat is naar de verkeerde bron gekeken. `profiles.tz` bestaat sinds het
--    begin, en `plan_adempauze()` en `annuleer_adempauze()` schrijven de
--    peiling al precies zo op: `(now() at time zone v_tz)::date`. Wat hier
--    ontbrak is één join. Geen ontwerpwijziging — het bestaande patroon.
--
-- ⚠️ **En de rij vreesde een gevolg dat de fout zélf al veroorzaakt.** Hij
--    schreef dat een goedkope `± 1`-reparatie gevaarlijk is omdat teller én
--    noemer meelopen en `voltallig` daardoor kan kantelen. Nagemeten op
--    28-08-2026 in de lokale stack, met twee leden in één groep die alleen in
--    `tz` verschillen en een adempauze op de dag die het ene lid "vandaag"
--    noemt:
--
--      ketting_stand() nu   -> {"schakels": 1, "in_aanmerking": 2, "voltallig": false}
--      met de eigen klok    -> {"schakels": 1, "in_aanmerking": 1, "voltallig": true}
--
--    Het lid ligt op zijn eigen kalender in zijn adempauze en hoort niet in de
--    noemer. In UTC staat hij er wél in, dus de groep krijgt zijn voltallige
--    week niet te zien. `voltallig` kantelt dus niet dóór de reparatie — hij
--    staat vandaag verkeerd en de reparatie zet hem recht.
--
-- ⚠️ **De richting van de fout is de reden dat dit meer is dan netheid.** De
--    Ketting is een oppervlak dat alleen positieve signalen draagt
--    (domeinregel 7); een gemiste voltallige week is een aanmoediging die de
--    groep verdiend had en niet krijgt. Een fout die iets wégneemt is stiller
--    dan een die iets toevoegt, want niemand mist wat er nooit stond.
--
-- ⚠️ **Dit lekt niets nieuws.** `in_aanmerking` telde al mee wie er in een
--    adempauze zit, en een adempauze is een vooraf geplande en bevestigde
--    keuze — `plan_adempauze()` weigert de lopende cyclus met `niet_vooraf` —
--    en geen gemiste week. Wat verandert is uitsluitend op welke kalender de
--    dag wordt afgelezen.
--
-- ⚠️ **Waarom `p.tz` en niet `week_start_day`.** De startdag bepaalt waar de
--    cyclus begint; de tijdzone bepaalt wanneer een dág omslaat. Deze peiling
--    vraagt het tweede. `starts_cycle` en `ends_cycle` staan al in de
--    persoonlijke cyclus van dát lid, dus de grenzen klopten; alleen het punt
--    waarmee ze vergeleken werden stond op de verkeerde klok.
--
-- ⚠️ **`p.tz` kan niet NULL zijn** — `profiles.tz` is `not null` met een
--    standaard, en `plan_adempauze()` weigert zelfs een profiel zonder `tz`
--    met `geen_profiel`. Een `coalesce` hier zou een geval afdekken dat het
--    schema al uitsluit, en zou een echt gat stil maken.
--
-- ⚠️ **Een `join` en geen `left join`, met opzet.** Elk lid heeft een profiel
--    (de trigger op `auth.users` maakt hem aan). Zou dat ooit niet zo zijn, dan
--    valt dat lid uit de noemer en dat merk je — een `left join` zou hem er met
--    een verkeerde klok in houden en niets zeggen.

create or replace function public.ketting_stand(p_group_id uuid, p_period_start date)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with in_aanmerking as (
    select m.user_id
    from group_members m
    join profiles     p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status not in ('inactive', 'paused')
      and not exists (
        select 1
        from breathers        b
        join goals            g on g.id = b.goal_id
        join goal_group_links l on l.goal_id = g.id
        where b.user_id  = m.user_id
          and l.group_id = p_group_id
          -- ⚠️ De klok van het lid zelf, niet die van de server. Zie de kop:
          --    `current_date` stond hier en kostte de groep een voltallige week
          --    zodra één lid in een andere tijdzone zat.
          and (now() at time zone p.tz)::date between b.starts_cycle and b.ends_cycle
      )
  ),
  schakels as (
    select count(*) as aantal
    from chain_links c
    join in_aanmerking a on a.user_id = c.user_id
    where c.group_id = p_group_id
      and c.group_period_start = p_period_start
  )
  select jsonb_build_object(
    'schakels',      (select aantal from schakels),
    'in_aanmerking', (select count(*) from in_aanmerking),
    'voltallig',     (select aantal from schakels) >= greatest((select count(*) from in_aanmerking), 1)
  )
  where is_group_member(p_group_id);
$$;
