-- 0219_de_beheerder_ziet_dat_een_aanvrager_eerder_lid_was.sql — een beheerder die
-- een lidmaatschapsverzoek beoordeelt, ziet of die persoon eerder lid was (QS8-332)
--
-- ROLLBACK-PAD:
--   drop function if exists public.verzoekers_eerder_lid(uuid);
--
--   Voegt alleen toe: één leesfunctie, geen tabel, geen kolom, geen policy. De
--   app valt zonder deze functie terug op de lijst zoals hij vóór dit issue was.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Sinds 0189 werkt de weg terug: een uitgezet lid mag lidmaatschap aanvragen en
-- een beheerder die aanneemt maakt hem weer actief lid. De beheerder die op
-- "aannemen" tikt ziet alleen `id, user_id, bericht, created_at` en de naam uit
-- `profiles` — niets over een eerder lidmaatschap. Met meer dan één beheerder is
-- dat het gat: beheerder A zet iemand weg, beheerder B ziet later een gewoon
-- ogend verzoek en neemt het aan.
--
-- 📏 Gemeten op een lokale opbouw uit deze map, tegen `pg_get_functiondef()` en
--    `pg_policies` — niet uit de migratiebestanden geredeneerd:
--
--   `verwijder_lid()`   -> `group_members.status = 'inactive'` + `member_removed`
--   `verlaat_groep()`   -> **verwijdert** de lidmaatschapsrij + `member_left`
--
--   Twee verschillende sporen dus, en geen van beide is compleet: wie vertrok
--   laat geen rij achter, wie weggestuurd werd laat er juist wél een achter.
--   Deze functie leest ze allebei, want een van de twee alleen is een halve
--   geschiedenis.
--
-- ⚠️ **En de twee gebeurtenissen dragen de persoon in een ándere kolom.** Dat is
--    bij het bouwen gemeten en niet aangenomen: de eerste versie van deze functie
--    joinde op `subject_id`, en de test vond `vertrokken` daarna niet.
--
--      `member_removed`  actor_id = de beheerder, subject_id = de uitgezette
--      `member_left`     actor_id = de vertrekker, **subject_id is null**
--
--    Vandaar `coalesce(subject_id, actor_id)`. Bij `member_removed` wint
--    `subject_id`, bij `member_left` valt hij terug op de actor — en dat klopt
--    daar, want wie vertrekt is zijn eigen onderwerp.
--
-- ---------------------------------------------------------------------------
-- Wie dit mag zien, en waarom niet meer dan dit
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Alleen een actieve beheerder van díé groep**, en dat is een besluit en
--    geen implementatiekeuze — het staat als rij in
--    `docs/decisions/002-domeinregel7-oppervlakken.md`. Een niet-beheerder krijgt
--    geen fout maar **nul rijen**, dezelfde vorm als `groep_klassement()` in een
--    beschermde groep.
--
-- ⚠️ **Drie dingen komen er met opzet níét uit**, en alle drie zijn ze wél
--    beschikbaar in de rij die deze functie leest:
--
--      `actor_id`   wie de uitzetting deed. De beheerder moet weten dát er iets
--                   was, niet wie het deed — dat maakt van de beslislijst een
--                   plek waar het handelen van een mede-beheerder ter discussie
--                   staat, en die vraag hoort in de groep en niet in een lijst.
--      `old_value`  de rol en status van vóór de uitzetting; niets ervan draagt
--                   bij aan de beslissing die hier genomen wordt.
--      de reden     die bestaat niet als veld, en dat blijft zo (0145).
--
-- ⚠️ **`vertrokken` zit er bewust in naast `verwijderd`.** Zou deze functie
--    alleen uitzettingen teruggeven, dan ís de aanwezigheid van de regel het
--    negatieve signaal en zegt het label niets meer. Nu gaat het oppervlak over
--    geschiedenis en niet over straf — domeinregel 7, tweede vraag.
--
-- ⚠️ **Géén nieuw pad naar `group_events` voor een client.** De rij van 04-09 in
--    `docs/ENGINEER-REVIEW.md` staat op Laag met de voorwaarde *"wordt zwaarder
--    als er een scherm op `group_events` gebouwd wordt"*. Dit is dat scherm, en
--    daarom leest de client die tabel níét: de functie doet het server-side en
--    geeft twee velden terug. 📏 Na deze migratie leest nog steeds geen enkele
--    client `group_events` — nagemeten over `src`, `app` en `supabase/functions`.
--    Wat er wél verandert is dat het féít nu ergens getóónd wordt; de rij is
--    daarop bijgewerkt.

create or replace function public.verzoekers_eerder_lid(p_group_id uuid)
returns table (user_id uuid, soort text, op timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.user_id,
    case laatste.event_type
      when 'member_removed' then 'verwijderd'
      when 'member_left'    then 'vertrokken'
      else 'eerder_lid'
    end as soort,
    laatste.created_at as op
  from group_join_requests r
  -- ⚠️ Een `left join` en geen `join`: wie vertrók heeft geen rij meer, en die
  --    hoort hier evengoed in.
  left join group_members m
    on  m.group_id = r.group_id
    and m.user_id  = r.user_id
    and m.status   = 'inactive'
  left join lateral (
    select ge.event_type, ge.created_at
      from group_events ge
     where ge.group_id = r.group_id
       -- ⚠️ Zie de kop: `member_left` laat `subject_id` leeg en zet de persoon in
       --    `actor_id`. Een join op `subject_id` alleen vindt de helft.
       and coalesce(ge.subject_id, ge.actor_id) = r.user_id
       and ge.event_type in ('member_removed', 'member_left')
     order by ge.created_at desc
     limit 1
  ) laatste on true
  where r.group_id = p_group_id
    and r.status   = 'pending'
    -- Eén van de twee sporen volstaat; `eerder_lid` is de uitkomst als alleen de
    -- inactieve rij er is en de gebeurtenis ontbreekt.
    and (m.user_id is not null or laatste.event_type is not null)
    and is_group_admin(p_group_id);
$$;

-- ⚠️ **`authenticated` met zoveel woorden** — onwrikbare regel 4. In Supabase
--    deelt `alter default privileges` élke nieuwe functie uit aan `anon`,
--    `authenticated` én `service_role`; `from public, anon` houdt precies de rol
--    over waaronder iedere ingelogde gebruiker draait.
revoke all on function public.verzoekers_eerder_lid(uuid) from public, anon, authenticated;
grant execute on function public.verzoekers_eerder_lid(uuid) to authenticated;

comment on function public.verzoekers_eerder_lid(uuid) is
  'Per openstaand lidmaatschapsverzoek: was deze aanvrager eerder lid, en hoe eindigde dat. '
  'Alleen voor een actieve beheerder van de groep; een ander krijgt nul rijen. '
  'Geeft bewust geen actor, geen oude rol en geen reden terug — QS8-332.';
