-- 0335 — de rollover sluit de verstreken weken van een profiel in de database af (QS8-687)
--
-- ⚠️⚠️ NUMMER VOORLOPIG (QS8-687). Opnieuw gebouwd op `main` van 21-11-2026 (besluit Quinten
--    20-11-2026: toch bouwen, op een nieuwe tak; de oude tak is verouderd en dient alleen als
--    bron, tag `archief/qs8-687-oude-tak`). Wie als tweede merget, hernummert (QS8-318), met
--    `npm run migratie:hernummer`.
--
-- Wat dit doet
--   Eén functie, `sluit_verstreken_weken_af(p_owner_id, p_grens)`, die voor één
--   eigenaar elke verstreken week afsluit zoals `supabase/functions/rollover`
--   dat tot nu toe met 2 tot 4 verzoeken per week deed: vrijstellen bij een
--   adempauze, anders status `missed`, het minpunt, en daarna de weekpas.
--
-- Waarom (QS8-685, security-review)
--   De edge function schreef die drie stappen als losse verzoeken. Valt het
--   platform tussen `status = 'missed'` en het minpunt, dan blijft die week
--   voorgoed half verwerkt: volgende runs zoeken alleen `todo` en `cancelled`.
--   Hier is elke week één subtransactie: alles of niets, en een mislukte week
--   laat de andere weken van dit profiel gewoon doorgaan.
--
-- ⚠️⚠️ De grens komt van buiten. De cyclusgrens is cyclusrekenwerk en dat staat
--    in `shared/time` (correctheidsregel 7); `p_grens` is dezelfde
--    `afsluitbaar.startDate` die de edge function al meegaf aan de selectie.
--    Deze functie rekent geen week uit en kent geen tijdzone.
--
-- ⚠️⚠️ De volgorde binnen een week is domeinregel 10 en is woordelijk die van de
--    edge function: eerst `missed`, dan het minpunt, dan de weekpas.
--    `verbruik_weekpas()` toetst zelf dat de week `missed` is. Het minpunt
--    loopt nog steeds langs `geen_minpunt_zonder_beoordelaar()` (0065); die
--    trigger slaat de rij stil over en dat blijft zo.
--
-- ⚠️ `on conflict do nothing` op het minpunt. In de edge function was een
--    dubbele boeking een foutmelding in het log; in een transactie zou ze de
--    hele week terugdraaien. Het minpunt bestaat dan al — dat is precies wat de
--    unieke index wil — en de rest van de week gaat door.
--
-- ⚠️ Alleen `service_role`. De functie deelt minpunten uit voor een willekeurige
--    `p_owner_id`; een recht dat `authenticated` erft (`pg_default_acl`) zou
--    elke ingelogde gebruiker een ander laten afrekenen. Zie de revoke onderaan.
--
-- Geen wijziging aan bestaande functies, tabellen of policies. Alleen
-- toevoegen, dus de gedeployde rollover blijft werken tot de nieuwe versie
-- gedeployd is: migratie eerst, deploy daarna (docs/DEPLOY.md §2.3a).
--
-- Idempotent: `create or replace`, `revoke`/`grant` zijn herhaalbaar.
--
-- ROLLBACK:
--   drop function if exists public.sluit_verstreken_weken_af(uuid, date);
--   (Geen dump nodig: de functie wijzigt zelf niets tot ze wordt aangeroepen.)

create or replace function public.sluit_verstreken_weken_af(
  p_owner_id uuid,
  p_grens    date
)
returns table (
  gemist           integer,
  vrijgesteld      integer,
  gered            integer,
  geraakte_doelen  uuid[],
  mislukt          integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  week      record;
  v_gemist  integer := 0;
  v_vrij    integer := 0;
  v_gered   integer := 0;
  v_mislukt integer := 0;
  v_doelen  uuid[]  := '{}';
  v_pauze   boolean;
  v_pas     boolean;
begin
  -- ⚠️ Oudste eerst, zoals de edge function: bij meer gemiste weken dan er
  --    passen bepaalt de volgorde welke week een pas krijgt, en dezelfde data
  --    moet twee keer hetzelfde antwoord geven.
  for week in
    select w.id, w.goal_id, w.cycle_start_date, w.points_miss
      from public.weekly_goals w
      join public.goals g on g.id = w.goal_id
     where g.owner_id = p_owner_id
       -- ⚠️ `cancelled` hoort er net zo goed bij als `todo` — A40, migratie 0045.
       and w.status in ('todo', 'cancelled')
       and w.cycle_start_date < p_grens
     order by w.cycle_start_date asc, w.id asc
  loop
    -- Ook een vrijgestelde of mislukte week verandert de reeks: de lijst met
    -- geraakte doelen komt uit alles wat open stond, niet uit wat slaagde.
    if not (week.goal_id = any (v_doelen)) then
      v_doelen := v_doelen || week.goal_id;
    end if;

    begin
      select exists (
        select 1 from public.breathers b
         where b.user_id = p_owner_id
           and b.goal_id = week.goal_id
           and b.starts_cycle <= week.cycle_start_date
           and b.ends_cycle   >= week.cycle_start_date
      ) into v_pauze;

      -- ⚠️ `and status in (…)` op beide updates (security-review M2): de lus leest
      --    een momentopname, en dient de eigenaar intussen een voltooiing in
      --    (`todo` wordt `pending`), dan zou een update op alleen `id` die week
      --    alsnog op `missed` zetten, mét minpunt. Geen rij geraakt = overslaan.
      if v_pauze then
        update public.weekly_goals set status = 'excused'
         where id = week.id and status in ('todo', 'cancelled');
        if found then
          v_vrij := v_vrij + 1;
        end if;
      else
        update public.weekly_goals set status = 'missed'
         where id = week.id and status in ('todo', 'cancelled');
        if found then
          insert into public.points_ledger (user_id, goal_id, delta, reason, ref_type, ref_id)
          values (p_owner_id, week.goal_id, week.points_miss, 'cycle_missed', 'weekly_goal', week.id)
          on conflict do nothing;

          select public.verbruik_weekpas(p_owner_id, week.goal_id, week.cycle_start_date)
            into v_pas;

          v_gemist := v_gemist + 1;
          if v_pas is true then
            v_gered := v_gered + 1;
          end if;
        end if;
      end if;
    exception when others then
      -- De subtransactie van dit blok is teruggedraaid: deze week staat weer
      -- open en komt bij de volgende run opnieuw aan bod. Geen gebruikerstekst
      -- in de melding, alleen het weekdoel en de SQLSTATE.
      --
      -- ⚠️ **En het getal gaat terug naar de aanroeper** (security-review M1): een
      --    week die elke run faalt blijft anders stil `todo`, zonder minpunt, en
      --    de eigenaar kan er dan nog een voltooiing voor indienen. `raise
      --    warning` komt alleen in het Postgres-log, niet bij supabase-js.
      v_mislukt := v_mislukt + 1;
      raise warning 'QS8-687: week % niet afgesloten (SQLSTATE %)', week.id, sqlstate;
    end;
  end loop;

  return query select v_gemist, v_vrij, v_gered, v_doelen, v_mislukt;
end;
$$;

revoke all on function public.sluit_verstreken_weken_af(uuid, date) from public, anon, authenticated;
grant execute on function public.sluit_verstreken_weken_af(uuid, date) to service_role;

comment on function public.sluit_verstreken_weken_af(uuid, date) is
  'Sluit de verstreken weken van één eigenaar af in de database (QS8-687): '
  'vrijstellen bij adempauze, anders missed + minpunt + weekpas, per week één '
  'subtransactie. p_grens komt uit shared/time. Alleen service_role.';
