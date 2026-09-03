-- 0152_het_groepsoverzicht_pagineert_met_een_cursor.sql — nazorg op 0016/0078,
-- de laatste offsetlijst van het project (QS8-149).
--
-- ROLLBACK-PAD:
--   drop function if exists public.group_overview(uuid, date, integer, timestamptz, uuid);
--   -- en de offsetversie terug uit 0151_reeksen_van_een_groep_zonder_de_hele_tabel.sql.
--   -- ⚠️ 0151 en niet 0120: 0151 verving de join op `group_visible_streaks` door
--   --    `zichtbare_reeksen_van_groep()`, en dat wil je bij een terugzetting niet
--   --    kwijtraken — dan is het weer 9384 definer-executies per overzicht.
--   -- ⚠️ Let op dat de offsetversie een ándere handtekening heeft, dus de drop
--   --    hierboven raakt hem niet en andersom ook niet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 28-08. Er waren er drie; dit is de laatste. `group_overview()`
-- pagineert met `limit`/`offset` over `(m.joined_at, m.user_id)` oplopend.
-- Verdwijnt er een rij vóór de cursor tussen twee pagina's, dan schuift alles
-- één plek naar voren en wordt er precies één lid overgeslagen.
--
-- Het mechanisme is identiek aan 0121 en 0125 en daar twee keer aangetoond. Wat
-- hier anders is, is de kans: een lid verdwijnt niet uit een groepsoverzicht
-- door iets dat de kíjker doet. Daar is een vertrek of een beheerdersactie voor
-- nodig, en die vallen niet samen met bladeren. Bij `openstaande_beoordelingen()`
-- was goedkeuren zélf de verschuiving, en dát is waarom die eerst ging.
--
-- ⚠️ **Vandaag is dit niet te reproduceren en dat staat hier met opzet.** Een
--    groep gaat niet boven twaalf actieve leden (`join_group_with_code`, 0016) en
--    de paginagrootte is twintig, dus er ís nooit een tweede pagina. De rij werd
--    daarom Laag gehouden met precies die voorwaarde. Hij wordt hier tóch
--    afgemaakt, om twee redenen: het is de laatste van de drie, en de vorm ligt
--    er twee keer klaar — over een half jaar, als het ledenmaximum omhoog is
--    gegaan, is het geen kopieerwerk meer maar archeologie.
--
-- ---------------------------------------------------------------------------
-- `total_members` moest anders, en op de manier van 0125
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het was `count(*) over ()`, en dat telt met een cursorfilter erop nog maar
--    de rijen die ná de cursor komen.** Bij 0121 is dat opgelost met een losse
--    scalaire subquery. Dat kan hier niet zonder de `where`, de lateral op
--    `goals` en de join op `zichtbare_reeksen_van_groep()` te herhalen — en een
--    tweede kopie van de rijselectie is precies de naad waar regel 18 over gaat.
--
--    Vandaar de CTE van 0125. De verzameling staat één keer beschreven, de teller
--    telt hem hélemaal, en de cursor knipt er daarna een pagina uit.
--
-- ⚠️ **`materialized` staat er met opzet, en het is een grendel en geen
--    besparing — dat verschil is gemeten en niet aangenomen.** Zonder dat woord
--    mág Postgres de CTE twee keer uitvoeren, één keer voor de teller en één keer
--    voor de pagina. Hier weegt dat zwaarder dan bij 0125, want deze CTE bevat
--    sinds 0151 een aanroep van `zichtbare_reeksen_van_groep()` — `security
--    definer`, dus niet in te linen; twee uitvoeringen zijn letterlijk twee keer
--    het werk van die functie.
--
--    📏 **Op de meetopstelling van 0151 (tien leden, 910 rijen in `user_streaks`)
--    kost het mét en zónder `materialized` allebei 133 definer-executies** —
--    gelijk aan 0151 zelf, dus de CTE kost daar niets. Postgres 16 kiest daar dus
--    uit zichzelf al één uitvoering. **Dat is precies waarom het woord er staat:
--    het is geen winst die ik meet maar een keuze die ik de planner niet wil
--    laten maken.** Een plan is geen belofte; hij mag morgen anders kiezen bij een
--    andere groepsgrootte of na een `analyze`.
--
-- ⚠️ **`total_members` is niet cosmetisch.** `fetchGroepsoverzicht()` rekent er
--    `meer` uit, en dat is de knop "meer leden laden". Zou het getal met de
--    cursor meebewegen, dan telt het af terwijl je bladert en verdwijnt de knop
--    voordat de lijst op is.
--
-- ---------------------------------------------------------------------------
-- Wat er níét verandert
-- ---------------------------------------------------------------------------
--
-- De projectie, de `where`, de lateral op `goals`, de venstertoets van De Ketting
-- en de join op `zichtbare_reeksen_van_groep()` zijn woordelijk overgenomen uit
-- 0151. Dit is een pagineringswijziging en geen autorisatiewijziging: elke
-- clausule die bepaalt wát je ziet staat er letterlijk hetzelfde, inclusief
-- `groepsdatum(m.group_id)` (0120) en `lid_van_open_groep(m.group_id)` (0079).
-- `tests/rls/epic8.test.ts`, `kettingklok.test.ts` en `epic13.test.ts` knippen
-- die clausules stuk voor stuk los en moeten daar groen op blijven.
--
-- ---------------------------------------------------------------------------

begin;

-- ⚠️ **De drop noemt de vólledige handtekening, en dat is geen formaliteit.**
--    `create or replace` kan een argumentenlijst niet wijzigen: het resultaat zou
--    een tweede functie naast de eerste zijn, met dezelfde naam. De offsetversie
--    bleef dan gewoon aanroepbaar en bleef de fout hierboven maken — precies wat
--    0121 en 0125 hierover opschreven.
drop function if exists public.group_overview(uuid, date, integer, integer);

create or replace function public.group_overview(
  p_group_id uuid,
  p_period_start date,
  p_limit integer default 20,
  p_na_joined_at timestamptz default null,
  p_na_user_id uuid default null
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  role text,
  member_status text,
  joined_at timestamp with time zone,
  goal_id uuid,
  goal_title text,
  goal_target_date date,
  milestones_total bigint,
  milestones_done bigint,
  current_streak integer,
  best_streak integer,
  last_cycle_start date,
  closed_this_period boolean,
  total_members bigint
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with leden as materialized (
    select
      m.user_id                                          as user_id,
      p.display_name                                     as display_name,
      p.avatar_url                                       as avatar_url,
      m.role                                             as role,
      m.status                                           as member_status,
      m.joined_at                                        as joined_at,
      d.id                                               as goal_id,
      d.title                                            as goal_title,
      d.target_date                                      as goal_target_date,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status <> 'dropped'
      ), 0)                                              as milestones_total,
      coalesce((
        select count(*) from milestones ms
        where ms.goal_id = d.id and ms.status = 'done'
      ), 0)                                              as milestones_done,
      s.current_streak                                   as current_streak,
      s.best_streak                                      as best_streak,
      s.last_cycle_start                                 as last_cycle_start,
      -- ⚠️ `coalesce(..., false)` om de venstertoets heen: valt hij ooit op `null`
      --    uit, dan is dat een weigering en geen antwoord. Zonder die coalesce
      --    zou `not null` weer `null` geven en viel het geval door naar de `else`.
      case
        when not coalesce(
          p_period_start <= groepsdatum(m.group_id) + 1
          and (
            p_period_start >= groepsdatum(m.group_id) - 6
            or lid_van_open_groep(m.group_id)
          ),
          false
        ) then null
        else exists (
          select 1 from chain_links c
          where c.group_id = m.group_id
            and c.user_id = m.user_id
            and c.group_period_start = p_period_start
        )
      end                                                as closed_this_period
    from group_members m
    join profiles p on p.id = m.user_id
    left join lateral (
      select gg.id, gg.title, gg.target_date
      from goals gg
      join goal_group_links l on l.goal_id = gg.id
      where l.group_id = m.group_id
        and gg.owner_id = m.user_id
        and gg.status = 'active'
      order by gg.target_date asc
      limit 1
    ) d on true
    left join zichtbare_reeksen_van_groep(p_group_id) s
      on s.user_id = m.user_id and s.goal_id = d.id
    where m.group_id = p_group_id
  )
  select
    q.user_id,
    q.display_name,
    q.avatar_url,
    q.role,
    q.member_status,
    q.joined_at,
    q.goal_id,
    q.goal_title,
    q.goal_target_date,
    q.milestones_total,
    q.milestones_done,
    q.current_streak,
    q.best_streak,
    q.last_cycle_start,
    q.closed_this_period,
    (select count(*) from leden) as total_members
  from leden q
  where
    -- ⚠️ **De cursor moet compleet zijn of hij telt niet.** Eén van de twee NULL
    --    betekent "geen cursor" en dus de eerste pagina, net als in 0121 en 0125.
    --    Een half ingevulde cursor stil als grens gebruiken levert `(x, null)` op,
    --    en dat is in SQL geen vergelijking maar NULL: de hele pagina valt dan weg
    --    zonder foutmelding.
    p_na_joined_at is null
    or p_na_user_id is null
    or (q.joined_at, q.user_id) > (p_na_joined_at, p_na_user_id)
  order by q.joined_at asc, q.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$$;

comment on function public.group_overview(uuid, date, integer, timestamptz, uuid) is
  'Het groepsoverzicht, gepagineerd met een cursor op (joined_at, user_id) in '
  'plaats van met een offset (0152, QS8-149) — de laatste van de drie. '
  '`total_members` komt uit een materialized CTE en telt de héle groep, niet '
  'alleen wat er na de cursor komt.';

-- ⚠️ `from public, anon, authenticated`: `alter default privileges` deelt elke
--    nieuwe functie in `public` aan alle drie uit, en een revoke die
--    `authenticated` niet noemt houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait. De drop hierboven maakte dit een níeuwe functie,
--    dus de grants van 0079 gelden er niet voor.
revoke all on function public.group_overview(uuid, date, integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.group_overview(uuid, date, integer, timestamptz, uuid)
  to authenticated;

commit;
