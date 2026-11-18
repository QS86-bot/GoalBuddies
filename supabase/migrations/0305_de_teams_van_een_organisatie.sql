-- 0305_de_teams_van_een_organisatie.sql — elk actief lid van een organisatie
-- ziet de namen van haar teams, en niets meer (QS8-657, epic QS8-650).
--
-- ROLLBACK-PAD:
--   drop function if exists public.organisatieteams(uuid, integer, uuid);
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten door de spec-planner op QS8-657: er was geen route om de teams van
--    een organisatie op te sommen. `groups` is alleen leesbaar voor leden
--    (`mag_groep_lezen()`), en een organisatiebeheerder wordt bij
--    `maak_teamgroep()` met opzet geen lid (besluit 36). Hij zag dus geen enkel
--    team dat hij zelf aanmaakte.
--
-- **Besluit van Quinten, 18-11-2026** (reactie op QS8-657): een lijst voor elk
-- actief lid, met alleen id en naam. De keuzes staan in
-- `docs/decisions/2026-11-18-organisatieschermen.md`; het oppervlak is rij 50
-- in `docs/decisions/002-domeinregel7-oppervlakken.md`.
--
-- ⚠️⚠️ **Besluit 6: een beheerder ziet niet meer dan een lid.** De poort is
--    `is_organisatielid()`, en de rol komt nergens in voor. Een beheerder krijgt
--    exact wat een lid krijgt.
--
-- ⚠️ **Id en naam, en verder niets.** Geen leden, geen ledental, geen
--    voortgang, geen teambalk, geen zichtbaarheid (beschermd of open). Wat er
--    in een team gebeurt blijft aan het teamlidmaatschap (`mag_groep_lezen()`).
--
-- ⚠️ **Een niet-lid en een verzonnen id krijgen allebei nul rijen** (de vorm
--    van criterium 4 van QS8-652), en een gearchiveerd team staat er niet in.

-- De zoekvraag leunt op `groups_organisatie_idx` (0300); een team telt er
-- hooguit enkele tientallen per organisatie, dus de sortering op id is goedkoop.

create or replace function public.organisatieteams(
  p_organization_id uuid,
  p_limit           integer default 20,
  -- De nul-uuid en geen `DEFAULT NULL` (zelfde reden als `organisatieleden()`
  -- in 0299): weglaten geeft de eerste pagina, en een meegestuurde `null`
  -- betekent hetzelfde in plaats van stil een lege lijst.
  p_na_id           uuid default '00000000-0000-0000-0000-000000000000'
)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.name
    from groups g
   where g.organization_id = p_organization_id
     and g.status <> 'archived'
     and public.is_organisatielid(p_organization_id)
     and g.id > coalesce(p_na_id, '00000000-0000-0000-0000-000000000000'::uuid)
   order by g.id
   limit greatest(0, least(coalesce(p_limit, 20), 50));
$$;
comment on function public.organisatieteams(uuid, integer, uuid) is
  'De teams van je eigen organisatie: id en naam, gepagineerd op id (max 50). '
  'Elk actief lid krijgt dezelfde lijst, een beheerder niet meer (besluit 6). '
  'Een niet-lid en een verzonnen id krijgen nul rijen — QS8-657.';
revoke all on function public.organisatieteams(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.organisatieteams(uuid, integer, uuid) to authenticated;
