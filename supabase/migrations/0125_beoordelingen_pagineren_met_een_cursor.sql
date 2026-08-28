-- 0125_beoordelingen_pagineren_met_een_cursor.sql — nazorg op 0054/0111 (QS8-62)
--
-- ROLLBACK-PAD:
--   drop function if exists public.openstaande_beoordelingen(integer, timestamptz, uuid);
--   -- en de offsetversie terug uit 0111, regel 613 e.v. Let op: dat is een
--   -- ándere handtekening (integer, integer), dus de drop hierboven raakt hem
--   -- niet en andersom ook niet. De projectie is identiek gebleven.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dit is dezelfde fout als 0121, op de tweede van de drie offsetlijsten die er
-- nog stonden. `openstaande_beoordelingen()` pagineert met `limit`/`offset` op
-- `submitted_at` oplopend, en de `where` bevat `w.status = 'pending'` plus
-- "ik heb er nog geen oordeel over gegeven".
--
-- ⚠️ **Wat hier anders is dan bij de reacties, is wie de verschuiving
--    veroorzaakt.** Daar moest iemand ánders een reactie verwijderen. Hier haalt
--    goedkeuren de rij uit de lijst, en goedkeuren is waar dit scherm vóór is.
--    De gebruiker duwt de rijen dus zelf omhoog door precies te doen wat er van
--    hem gevraagd wordt.
--
-- 📏 **Aangetoond en niet beredeneerd**, met `p_limit = 2` en vier wachtende
--    beoordelingen:
--
--     pagina 1 (offset 0):  beoordeling 1, beoordeling 2
--     beoordeling 1 wordt goedgekeurd  ← de knop op dit scherm
--     pagina 2 (offset 2):  beoordeling 4        ← beoordeling 3 is verdwenen
--
--    Beoordeling 3 komt pas terug als je het scherm opnieuw opent. Dat is een
--    buddy die op zijn oordeel wacht en het niet krijgt, en niemand die het
--    merkt: er is geen foutmelding en de lijst ziet er compleet uit.
--
-- ⚠️ **Onder één pagina valt er niets te verschuiven**, en dat is waarom dit
--    Middel is en geen Hoog. Een groep moet meer dan twintig openstaande
--    beoordelingen tegelijk hebben voordat iemand hier last van heeft.
--
-- ---------------------------------------------------------------------------
-- De vorm komt uit 0121 en is niet nieuw bedacht
-- ---------------------------------------------------------------------------
--
-- Cursor op `(submitted_at, id)`, dezelfde twee kolommen in dezelfde richting
-- als de `order by`. `completions.submitted_at` is `not null` (0001), dus die
-- twee vormen samen een totale ordening en er is geen rij die permanent achter
-- de cursor kan blijven hangen.
--
-- ⚠️ **De cursor moet compleet zijn of hij telt niet.** Eén van de twee waarden
--    NULL betekent "geen cursor" en dus de eerste pagina. Een half ingevulde
--    cursor stil als grens gebruiken levert `(x, null)` op, en dat is in SQL
--    geen vergelijking maar NULL: de hele pagina valt dan weg zonder
--    foutmelding.
--
-- ---------------------------------------------------------------------------
-- `total_open` moest anders, en anders dan bij 0121
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het was `count(*) over ()`, en dat telt met een cursorfilter erop nog
--    maar de rijen die ná de cursor komen.** Bij 0121 is dat opgelost door de
--    teller een losse scalaire subquery te maken. Dat kan hier niet zonder de
--    hele `where` inclusief twee laterals te herhalen — en een tweede kopie van
--    een autorisatievoorwaarde is precies het soort naad waar regel 18 over
--    gaat: twee plekken die hetzelfde moeten zeggen en het een keer niet doen.
--
--    Vandaar een CTE. De verzameling staat één keer beschreven, de teller telt
--    hem hélemaal, en de cursor knipt er daarna een pagina uit.
--
-- ⚠️ **`materialized` staat er met opzet.** Zonder dat woord mag Postgres de CTE
--    twee keer uitvoeren — één keer voor de teller en één keer voor de pagina —
--    en dan kost elke pagina twee volledige scans in plaats van één. Met `offset`
--    was dit één scan, en een paginering die het aantal query's verdubbelt is
--    geen reparatie.
--
-- ⚠️ **Dit getal is niet cosmetisch.** `app/(tabs)/groep.tsx` toont er de teller
--    "er wachten er N op jou" mee, en dat is de enige plek waar een gebruiker
--    ziet dát er iets op hem wacht. Zou hij met de cursor meebewegen, dan telt
--    de teller af terwijl je bladert en staat er op pagina drie een lager getal
--    dan er wacht.
--
-- ---------------------------------------------------------------------------
-- Wat er níét verandert
-- ---------------------------------------------------------------------------
--
-- De projectie, de `where` en de twee laterals zijn ongewijzigd overgenomen uit
-- 0111. Dit is een pagineringswijziging en geen autorisatiewijziging: elke
-- clausule die bepaalt wát je mag zien staat er letterlijk hetzelfde, inclusief
-- `m.status <> 'inactive'`, `c.user_id <> auth.uid()` en de
-- ingetrokken-oordeel-uitzondering (A19). `tests/rls/beoordelingsgrens.test.ts`
-- knipt die clausules stuk voor stuk los en moet daar groen op blijven.
--
-- ---------------------------------------------------------------------------

drop function if exists public.openstaande_beoordelingen(integer, integer);

create or replace function public.openstaande_beoordelingen(
  p_limit integer default 20,
  p_na_at timestamptz default null,
  p_na_id uuid default null
)
  returns table (
    completion_id      uuid,
    weekly_goal_id     uuid,
    group_id           uuid,
    owner_id           uuid,
    owner_name         text,
    owner_avatar       text,
    goal_title         text,
    weekly_title       text,
    floor_text         text,
    ceiling_text       text,
    achieved_level     text,
    note               text,
    submitted_at       timestamptz,
    approvals_done     integer,
    approvals_required integer,
    total_open         bigint
  )
  language sql
  stable
  set search_path = public, pg_temp
as $$
  with wachtrij as materialized (
    select
      c.id             as completion_id,
      w.id             as weekly_goal_id,
      k.group_id       as group_id,
      g.owner_id       as owner_id,
      p.display_name   as owner_name,
      p.avatar_url     as owner_avatar,
      g.title          as goal_title,
      w.title          as weekly_title,
      w.floor_text     as floor_text,
      w.ceiling_text   as ceiling_text,
      c.achieved_level as achieved_level,
      c.note           as note,
      c.submitted_at   as submitted_at,
      s.gedaan         as approvals_done,
      s.nodig          as approvals_required
    from completions c
    join weekly_goals w on w.id = c.weekly_goal_id
    join goals g on g.id = w.goal_id
    join profiles p on p.id = g.owner_id
    join lateral (
      select l.group_id
      from goal_group_links l
      join group_members m on m.group_id = l.group_id
      where l.goal_id = g.id
        and m.user_id = auth.uid()
        and m.status <> 'inactive'
      order by l.linked_at asc
      limit 1
    ) k on true
    join lateral (
      select
        (select count(*)::int
           from completion_approvals a
          where a.completion_id = c.id
            and a.group_id      = k.group_id
            and a.status        = 'approved'
            and not exists (
              select 1 from approval_withdrawals x where x.approval_id = a.id
            )) as gedaan,
        coalesce(
          (select r.approvals_required::int
             from completion_approval_rules r
            where r.completion_id = c.id
              and r.group_id      = k.group_id),
          vereiste_goedkeuringen(k.group_id, g.owner_id)::int
        ) as nodig
    ) s on true
    where c.superseded_by is null
      and w.status = 'pending'
      and c.user_id <> auth.uid()
      and not exists (
        select 1 from completion_approvals a
        where a.completion_id = c.id
          and a.approver_id = auth.uid()
          -- Een ingetrokken oordeel telt niet als oordeel (Q-TODO A19).
          and not exists (
            select 1 from approval_withdrawals x where x.approval_id = a.id
          )
      )
  )
  select
    q.completion_id,
    q.weekly_goal_id,
    q.group_id,
    q.owner_id,
    q.owner_name,
    q.owner_avatar,
    q.goal_title,
    q.weekly_title,
    q.floor_text,
    q.ceiling_text,
    q.achieved_level,
    q.note,
    q.submitted_at,
    q.approvals_done,
    q.approvals_required,
    (select count(*) from wachtrij) as total_open
  from wachtrij q
  where
    p_na_at is null
    or p_na_id is null
    or (q.submitted_at, q.completion_id) > (p_na_at, p_na_id)
  order by q.submitted_at asc, q.completion_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.openstaande_beoordelingen(integer, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.openstaande_beoordelingen(integer, timestamptz, uuid)
  to authenticated;

comment on function public.openstaande_beoordelingen(integer, timestamptz, uuid) is
  'Wat er op jouw oordeel wacht, oplopend, met een cursor op (submitted_at, id) — '
  'QS8-62, uitgebreid in QS8-65. Met `offset` sloeg goedkeuren een rij over; zie 0125.';
