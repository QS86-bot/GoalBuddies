-- 0161_de_ledenlijst_hangt_niet_af_van_wie_kijkt.sql — de naad die 0160 blootlegde
--
-- ROLLBACK-PAD:
--   De vorige vorm is deze functie zónder de regel `and m.status <> 'inactive'`
--   in de `where` van de CTE `leden`. Voer 0152 opnieuw uit; de signatuur
--   verandert hier niet, dus er hoeft niets gedropt te worden.
--
--   ⚠️ Terugrollen zet het gedrag terug dat hieronder gemeten is: de ledenlijst
--      en `total_members` gaan dan weer afhangen van welke ándere groepen de
--      kijker met het uitgezette lid deelt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gevonden door de `security-reviewer` op 0160 (QS8-146) en zelf nagemeten
-- voordat hij verwerkt is.
--
-- `group_overview()` is `SECURITY INVOKER` en doet `from group_members m join
-- profiles p on p.id = m.user_id` — een **inner join zonder statustoets**. Vóór
-- 0160 ging dat nooit mis: elk profiel van een groepsgenoot was leesbaar, dus de
-- rij overleefde altijd. Sinds 0160 beslist `profiles_select` mee, en die vraagt
-- of je een gróép deelt met die persoon — érgens, niet per se deze.
--
-- 📏 **Gemeten in één transactie, beide kijkers, dezelfde groep.** Bob is uit
--    groep A gezet. Carol zit met hem óók in groep B; Dave niet:
--
--      carol (deelt groep B met bob):  a/active, b/inactive, c/active, d/active  total=4
--      dave  (deelt niets met bob):    a/active,             c/active, d/active  total=3
--
-- ⚠️ **Dat is erger dan allebei de vaste standen.** Wélke leden je ziet en welk
--    getal er onder staat, hangen af van iets dat de kijker niet kan zien en dat
--    niets met deze groep te maken heeft. `total_members` wordt daarmee
--    kijkerafhankelijk, en `src/modules/buddies/api.ts` rekent daar de teller mee
--    uit.
--
-- ⚠️ **De richting van de reparatie is niet willekeurig.** Het scherm dat de
--    opvolgerkeuze bouwt filtert `member_status !== 'inactive'` al weg
--    (`app/groep/[id].tsx`), en `verwijder_lid()` weigert een tweede uitzetting
--    met `already_removed` — dus een uitgezette rij in de ledenlijst levert een
--    kaart op met een knop die alleen een foutmelding kan geven. De database
--    hoort dit te doen en niet het scherm: dat is regel 18 vraag 1, de naad
--    tussen twee onderdelen die ieder voor zich kloppen.
--
-- ⚠️ **Geen enkele andere regel verandert.** De body hieronder is de gedéployde
--    `pg_get_functiondef()` van 0152 met uitsluitend die ene voorwaarde erbij —
--    niet overgetypt uit een migratiebestand, want tussen 0152 en nu is er aan
--    deze functie gesleuteld.
--
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_na_joined_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_na_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- ⚠️ **Deze regel stond hier niet, en sinds 0160 is dat zichtbaar.** Zie
      --    de kop: de inner join op `profiles` besliste het antwoord, en die
      --    loopt langs `profiles_select`.
      and m.status <> 'inactive'
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
$function$;

comment on function public.group_overview(uuid, date, integer, timestamptz, uuid) is
  'Het groepsoverzicht, gepagineerd met een cursor op (joined_at, user_id) — '
  'QS8-206/0152. Toont uitsluitend leden die er nog bij horen: sinds 0161 '
  'filtert de functie zelf op status, in plaats van dat de inner join op '
  'profiles het per ongeluk voor hem doet (QS8-146).';
