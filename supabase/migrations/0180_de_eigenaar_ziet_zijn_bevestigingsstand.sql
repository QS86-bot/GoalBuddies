-- 0180_de_eigenaar_ziet_zijn_bevestigingsstand.sql — de eigenaar zag dát zijn week op bevestiging wachtte, niet hoeveel er nog nodig waren (QS8-174)
--
-- ROLLBACK-PAD:
--   drop function if exists public.mijn_bevestigingsstanden(uuid[]);
--   plus `create or replace` op `goedkeuringsdrempel_gehaald(uuid)` met de
--   inline telling uit 0122, en daarna
--   drop function if exists public.bevestigingsstand(uuid);
--   ⚠️ In die volgorde: `goedkeuringsdrempel_gehaald()` leunt na deze migratie
--   op `bevestigingsstand()`, en die eerst droppen laat de goedkeuringsroute
--   omvallen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-65 gaf een groep een drempel: één buddy, meerderheid of quorum. De
-- **beoordelaar** ziet in zijn wachtrij "1 van de 2 bevestigingen" — dat komt
-- uit `openstaande_beoordelingen()`. De **eigenaar** zag alleen dát zijn week op
-- bevestiging wachtte. Dat was vóór QS8-65 het hele verhaal; met een
-- meerderheidsregel is het onvolledig.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Eén teller, twee lezers — en dat is de kern van deze migratie
-- ---------------------------------------------------------------------------
--
-- `goedkeuringsdrempel_gehaald()` draagt in zijn kop de zin *de enige plek waar
-- bevestigingen geteld worden*. De voor de hand liggende oplossing — een tweede
-- functie die hetzelfde nog eens telt — zou die zin onwaar maken, en dan zijn er
-- twee opvattingen over wanneer een week rond is. Dat is precies de vorm van
-- regel 18: twee correcte onderdelen, en de naad ertussen die niemand bewaakt.
--
-- Dus is de telling eruit gehaald en in `bevestigingsstand()` gezet, en leest
-- `goedkeuringsdrempel_gehaald()` hem daar. De belofte blijft: er is één teller.
-- Wat erbij komt is een tweede lezer die de getallen laat zien in plaats van er
-- een oordeel van te maken.
--
-- ⚠️ **De helper is niet uitvoerbaar voor een client, en dat maakt de nieuwe
--    lezer een definer.** Het issue ontwierp `mijn_bevestigingsstanden()` als
--    `security invoker`, zodat RLS de rijen filtert *naast* de expliciete
--    eigenaarstoets — twee sloten in plaats van één. 📏 Dat overleefde de eerste
--    meting niet:
--
--      set local role authenticated;
--      select * from mijn_bevestigingsstanden(array[]::uuid[]);
--      -- ERROR: permission denied for function bevestigingsstand (42501)
--
--    Een invoker-functie draait onder de aanroeper, en die mag de teller niet
--    uitvoeren. De twee uitwegen zijn allebei een keuze:
--
--    * **`bevestigingsstand()` aan `authenticated` geven.** Dan is de teller een
--      nieuw oppervlak: een groepsgenoot kan er de stand van andermans
--      voltooiing uit lezen. Voor een beoordelaar is dat niets nieuws
--      (`openstaande_beoordelingen()` zegt al "1 van de 2"), maar voor élk nieuw
--      oppervlak is beschermd het antwoord tot iemand het tegendeel besluit.
--    * **`mijn_bevestigingsstanden()` definer maken.** Dan blijft het oppervlak
--      precies wat het issue ontwierp, en hangt de grens op één slot: de
--      expliciete `g.owner_id = (select auth.uid())`.
--
--    Het tweede, want het beschermt het oppervlak en niet de vorm. Dat ene slot
--    staat onder test met een groepsgenoot die andermans `weekly_goal_id`
--    aanbiedt — en tak 4 van `definer_bewaking()` (0167) bewaakt dat deze
--    definer zijn aanroeper toetst.
--
-- ---------------------------------------------------------------------------
-- De semantiek, en waarom er niet gewoon "de" stand is
-- ---------------------------------------------------------------------------
--
-- Een doel kan aan meerdere groepen hangen, en **elke groep oordeelt met zijn
-- eigen regel**; één groep die zijn eigen drempel haalt is genoeg. Er zijn dus
-- net zoveel standen als groepen, en de eerlijke om te tonen is de
-- dichtstbijzijnde: `order by (nodig - gedaan) asc, gedaan desc limit 1`.
--
-- ⚠️ **Geen namen.** Wie er bevestigd heeft is niet van de groep — `beoordelen`
-- legt dat al vast. Twee getallen en verder niets.
--
-- ⚠️ **Een array-parameter en geen enkel id.** Het dashboard toont alle
-- weekdoelen van de cyclus; per week los ophalen is de N+1 uit onwrikbare
-- regel 12, en dat is precies waarom deze rij zo lang op de dossierlijst stond.

-- ---------------------------------------------------------------------------
-- 1. De teller, uit `goedkeuringsdrempel_gehaald()` gelicht
-- ---------------------------------------------------------------------------

drop function if exists public.bevestigingsstand(uuid);

create function public.bevestigingsstand(p_completion_id uuid)
returns table(group_id uuid, gedaan integer, nodig integer)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    l.group_id,
    (select count(*)::integer
       from completion_approvals a
      where a.completion_id = p_completion_id
        and a.group_id      = l.group_id
        and a.status        = 'approved'
        -- ⚠️ Ingetrokken bevestigingen tellen niet mee. `approval_withdrawals`
        --    maakt een goedkeuring ongedaan zonder hem te wissen
        --    (domeinregel 6), dus de rij staat er nog en mag hier niet meetellen.
        and not exists (
          select 1 from approval_withdrawals x where x.approval_id = a.id
        )),
    coalesce(
      -- De bevroren drempel van het moment van indienen.
      (select r.approvals_required
         from completion_approval_rules r
        where r.completion_id = p_completion_id
          and r.group_id      = l.group_id),
      -- ⚠️ Geen bevroren rij betekent: deze groep is ná het indienen gekoppeld.
      --    Dan is er niets om te beschermen tegen terugwerkende kracht en geldt
      --    de regel van nu. Terugvallen op 1 zou een quorumgroep stilzwijgend op
      --    "één lid" zetten.
      vereiste_goedkeuringen(l.group_id, g.owner_id),
      1
    )::integer
  from completions       c
  join weekly_goals      w on w.id = c.weekly_goal_id
  join goals             g on g.id = w.goal_id
  join goal_group_links  l on l.goal_id = g.id
  where c.id = p_completion_id;
$$;

revoke execute on function public.bevestigingsstand(uuid) from public, anon, authenticated;

comment on function public.bevestigingsstand(uuid) is
  'De enige plek waar bevestigingen geteld worden — per groep, met de bevroren '
  'drempel. Bewust `security invoker`: vanuit een definer ziet hij alles, vanuit '
  'een invoker filtert RLS. Zie 0180 en QS8-174.';

-- ---------------------------------------------------------------------------
-- 2. De bestaande lezer, nu zonder eigen telling
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zelfde returntype en zelfde rechten als in 0122, dus `create or replace`
--    mag hier. Wat verandert is uitsluitend waar de getallen vandaan komen.

create or replace function public.goedkeuringsdrempel_gehaald(p_completion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- ⚠️ Per groep tellen en dan `exists`: één groep die zijn eigen drempel haalt
  --    is genoeg. Elke groep oordeelt met zijn eigen regel, en de strengheid van
  --    de een bepaalt niet of de ander mag geloven.
  select exists (
    select 1 from bevestigingsstand(p_completion_id) s
    where s.gedaan >= s.nodig
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. De nieuwe lezer
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De eigenaarstoets is hier het slot en niet een extraatje.** `weekly_goals`
--    laat in een open groep ook andermans weken zien (besluit A41), en de
--    bevestigingsstand van een ander is niets voor jou. Deze functie is een
--    definer (zie de kop), dus RLS filtert hier níét mee — de grens is een
--    eigenschap van deze functie en van niets anders.

drop function if exists public.mijn_bevestigingsstanden(uuid[]);

create function public.mijn_bevestigingsstanden(p_weekly_goal_ids uuid[])
returns table(weekly_goal_id uuid, gedaan integer, nodig integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, s.gedaan, s.nodig
  from weekly_goals w
  join goals       g on g.id = w.goal_id
  join completions c on c.weekly_goal_id = w.id and c.superseded_by is null
  cross join lateral (
    select b.gedaan, b.nodig
    from bevestigingsstand(c.id) b
    -- De dichtstbijzijnde groep: die zegt het eerlijkst hoe ver de week is.
    order by (b.nodig - b.gedaan) asc, b.gedaan desc
    limit 1
  ) s
  where w.id = any (p_weekly_goal_ids)
    and g.owner_id = (select auth.uid())
    and w.status = 'pending';
$$;

revoke execute on function public.mijn_bevestigingsstanden(uuid[]) from public, anon, authenticated;
grant  execute on function public.mijn_bevestigingsstanden(uuid[]) to authenticated;

comment on function public.mijn_bevestigingsstanden(uuid[]) is
  'Hoeveel bevestigingen de eigen weken nog nodig hebben, per weekdoel. Een '
  'array en geen enkel id: het dashboard toont een hele cyclus, en per week los '
  'ophalen is een N+1. Zie 0180 en QS8-174.';
