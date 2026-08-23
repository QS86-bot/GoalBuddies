-- 0064 — Geen minpunt als niemand je week kón beoordelen (QS8-110)
--
-- Besluit van Quinten, 22-08-2026: optie C uit
-- docs/research/wat-krijg-je-bij-een-gehaalde-week.md.
--
-- ⚠️ **Het probleem dat dit oplost.** De hele positieve kant hangt aan
--    `award_points_on_approval()`, een trigger op `completion_approvals`. Wie
--    geen buddy heeft, krijgt nooit een goedkeuring, dus zijn weekdoel blijft
--    eeuwig `pending` — geen punten, geen weekpas, en `herbereken_reeks()` telt
--    alleen `approved`, dus ook geen reeks. De rollover loopt intussen over álle
--    profielen zonder naar groepen te kijken en boekt het minpunt wél.
--
--    Een gebruiker zonder buddy kon daardoor uitsluitend dalen. Dat botst met
--    domeinregel 10 ("de reeks dient de gebruiker, nooit andersom") en met
--    `regels.ts`, dat solo werken uitdrukkelijk toestaat.
--
-- ⚠️ **De voorwaarde is niet "heeft een groep".** `completion_approvals_not_self`
--    verbiedt jezelf goedkeuren, dus alleen in een groep zitten is niet genoeg:
--    er moet een ánder actief lid zijn. Anders zou iemand die alleen in zijn
--    eigen groep zit nog steeds alleen kunnen dalen — dezelfde fout, een laag
--    dieper.
--
-- ⚠️ Een slapende groep telt gewoon mee. Slapen onderdrukt nudges (QS8-60), het
--    ontneemt niemand het recht om te beoordelen.
--
-- ⚠️ `p_owner_id is null` geeft expliciet `false` en niet "vergelijk maar".
--    `m.user_id <> null` is in SQL geen controle maar een derde antwoord, dat
--    zich in een `if` als onwaar gedraagt — de valkuil die eerder de
--    weekpasvoorraad van elk willekeurig doel teruggaf. Hier is `false` bovendien
--    de milde kant: geen minpunt.
--
-- Idempotent: `create or replace` plus `revoke`. Twee keer draaien is een no-op.
--
-- ROLLBACK:
--   drop function if exists public.kan_beoordeeld_worden(uuid, uuid);
--   (de rollover valt dan terug op "altijd een minpunt" zodra ook die is
--    teruggezet; laat ze niet uit elkaar lopen)
--
-- Geen dump vooraf nodig: dit voegt alleen een functie toe en wijzigt geen data.

create or replace function public.kan_beoordeeld_worden(
  p_goal_id  uuid,
  p_owner_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_goal_id is not null
     and p_owner_id is not null
     and exists (
       select 1
       from goal_group_links l
       join group_members m on m.group_id = l.group_id
       where l.goal_id = p_goal_id
         and m.user_id is distinct from p_owner_id
         and m.status = 'active'
     );
$$;

comment on function public.kan_beoordeeld_worden(uuid, uuid) is
  'Kan iemand anders een week van dit doel goedkeuren? Voorwaarde voor het '
  'minpunt bij een gemiste week (QS8-110, optie C).';

-- ⚠️ Zelfde behandeling als de andere definer-functies sinds 0011: de client
--    heeft hier niets te zoeken. Alleen de rollover roept hem aan, en die draait
--    als service_role.
revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from public;
revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from anon;
revoke all on function public.kan_beoordeeld_worden(uuid, uuid) from authenticated;
grant execute on function public.kan_beoordeeld_worden(uuid, uuid) to service_role;
