-- ---------------------------------------------------------------------------
-- 0112 — Seizoenen per groep, met één recap (QS8-79, PRD 8.5)
-- ---------------------------------------------------------------------------
--
-- ROLLBACK-PAD (in deze volgorde):
--
--   drop function if exists public.maak_seizoensrecaps(timestamptz);
--   drop function if exists public.seizoensrecap_cijfers(uuid, date, date);
--   drop function if exists public.seizoensgrens(text, text, timestamptz);
--   drop table if exists public.season_recaps;
--   alter table public.chat_messages drop constraint chat_messages_system_event_bekend;
--   alter table public.chat_messages add constraint chat_messages_system_event_bekend
--     check (system_event is null or system_event in (
--       'group_sleeping','member_joined','completion_pending','completion_approved',
--       'milestone_done','goal_completed','commitment_unlocked','commitment_due',
--       'deadline_requested','chain_milestone','group_opened','group_protected'));
--
-- ⚠️ **Die laatste stap faalt op elke `season_recap`-rij die er dan staat.** Een
--    systeembericht is een onveranderlijke kopie (beslisdocument 002 §3), dus
--    weggooien is geen migratiestap maar een besluit. Staat hier met opzet niet
--    als kant-en-klare `delete`.
--
-- ⚠️ **`groups.season_cadence` wordt niet aangeraakt en hoeft dus niet terug.**
--    De kolom en zijn CHECK staan sinds 0001, de kolomgrant sinds 0019. Er heeft
--    tot nu toe alleen niets naar gekeken — `dode-keten-controle` kende hem als
--    bewust dode waarde met QS8-79 als reden. Dit is QS8-79.
--
-- ---------------------------------------------------------------------------
-- 1. Waarom de grens in SQL wordt uitgerekend en dat géén correctheidsregel 7
--    breekt
-- ---------------------------------------------------------------------------
--
-- CLAUDE.md, correctheidsregel 7: geen enkele tijd- of weekberekening buiten
-- `shared/time`. Die regel gaat over de **twee klokken** — de persoonlijke
-- week-startdag en de huddledag van de groep. Beide zijn instellingen van een
-- mens, en beide bepalen wanneer een week begint.
--
-- Een seizoensgrens is geen van beide: een kwartaal of een maand is een
-- kalenderfeit dat voor iedereen op dezelfde dag valt, ongeacht wiens week op
-- dinsdag begint. Er is dus niets te kiezen en niets uit te lijnen — alleen
-- `date_trunc()` in de tijdzone van de groep.
--
-- ⚠️ **Wat hier wél had gekund en met opzet niet gebeurt:** de recap over "de
--    laatste dertien weekcycli" laten lopen. Dat zou wél weekrekenwerk zijn, en
--    dan hoorde het in `shared/time`. Een kalenderkwartaal is bewust gekozen
--    omdat het dat probleem niet heeft.
--
-- ---------------------------------------------------------------------------
-- 2. Eén bericht, en waarom dat een acceptatiecriterium is
-- ---------------------------------------------------------------------------
--
-- Habit Huddle heeft losse recap-berichten moeten terugdraaien: een reeks
-- meldingen achter elkaar leest als spam en niet als een moment. Daarom draagt
-- `season_recap` al zijn cijfers in één `payload`, en plaatst
-- `maak_seizoensrecaps()` er precies één per groep per seizoen. De primaire
-- sleutel op `season_recaps (group_id, season_start)` ís die belofte: een tweede
-- poging botst in plaats van een tweede bericht te maken.
--
-- ---------------------------------------------------------------------------
-- 3. Alleen wat er wél gedaan is — en wat dat uitsluit
-- ---------------------------------------------------------------------------
--
-- Domeinregel 7. De drie cijfers zijn alle drie **groepstotalen zonder namen**,
-- en alle drie monotoon: afgeronde weken, gehaalde mijlpalen, schakels in De
-- Ketting. Dezelfde vorm als `ketting_stand()` en als de mijlpaalaankondiging
-- uit 0070 — een teller die alleen omhoog gaat, verraadt niemand.
--
-- ⚠️ **Geen namen, geen "wie het meest", geen achterblijvers.** Een ranglijst is
--    per definitie ook een lijst van wie onderaan staat.
--
-- ⚠️ **En géén recap als alle drie de cijfers nul zijn.** "Jullie hebben samen 0
--    weken afgerond" is een tegenslagbericht met een vrolijke kop erop. In een
--    stille groep zwijgt de recap; `slaap_stille_groepen()` doet daar al wat er
--    te doen valt.
--
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- De gebeurtenis op de allowlist
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een nieuw type systeembericht vraagt een migratie, en dat is een van de
--    drie sloten uit CLAUDE.md die je niet mag omzeilen. De CHECK geldt ook voor
--    `service_role`. De kopie in `src/modules/buddies/chat-schemas.ts` staat
--    onder test, dus een toevoeging daar zonder deze regel is óók rood.

alter table public.chat_messages drop constraint if exists chat_messages_system_event_bekend;
alter table public.chat_messages add constraint chat_messages_system_event_bekend
  check (system_event is null or system_event in (
    'group_sleeping',
    'member_joined',
    'completion_pending',
    'completion_approved',
    'milestone_done',
    'goal_completed',
    'commitment_unlocked',
    'commitment_due',
    'deadline_requested',
    'chain_milestone',
    'group_opened',
    'group_protected',
    'season_recap'
  ));

-- ---------------------------------------------------------------------------
-- Welk seizoen is er zojuist afgelopen?
-- ---------------------------------------------------------------------------

create or replace function public.seizoensgrens(
  p_tz      text,
  p_cadence text,
  p_op      timestamptz default now()
)
  returns table (season_start date, season_end date, is_eerste_dag boolean, is_acht_uur boolean)
  language sql
  stable
  set search_path = public, pg_temp
as $$
  -- ⚠️ Alles in de tijdzone van de gróép. `now()` is UTC; wat "de eerste dag van
  --    het kwartaal om 08:00" is, hangt af van waar de groep woont.
  with lokaal as (
    select p_op at time zone coalesce(nullif(p_tz, ''), 'UTC') as t
  ),
  huidig as (
    select
      date_trunc(case when p_cadence = 'monthly' then 'month' else 'quarter' end, l.t) as begin,
      l.t
    from lokaal l
  )
  select
    -- Het seizoen dat net afgelopen is: precies één cadans terug.
    (h.begin - (case when p_cadence = 'monthly' then interval '1 month'
                     else interval '3 months' end))::date,
    (h.begin - interval '1 day')::date,
    h.t::date = h.begin::date,
    extract(hour from h.t)::int = 8
  from huidig h;
$$;

revoke all on function public.seizoensgrens(text, text, timestamptz) from public, anon;
grant execute on function public.seizoensgrens(text, text, timestamptz) to authenticated, service_role;

comment on function public.seizoensgrens(text, text, timestamptz) is
  'Het seizoen dat net afgelopen is, plus of het nú de eerste dag om 08:00 is in '
  'de tijdzone van de groep — QS8-79.';

-- ---------------------------------------------------------------------------
-- De cijfers van één seizoen
-- ---------------------------------------------------------------------------

create or replace function public.seizoensrecap_cijfers(
  p_group_id uuid,
  p_van      date,
  p_tot      date
)
  returns table (weken integer, mijlpalen integer, schakels integer)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  -- ⚠️ **Alle drie groepstotalen zonder namen** (domeinregel 7). Wie hier ooit
  --    een `user_id` bij zet, maakt er een ranglijst van — en een ranglijst is
  --    ook een lijst van wie onderaan staat.
  select
    (select count(*)::int
       from weekly_goals w
       join goal_group_links l on l.goal_id = w.goal_id
      where l.group_id = p_group_id
        and w.status = 'approved'
        and w.cycle_start_date between p_van and p_tot),

    -- ⚠️ Op `completed_at` en niet op `target_date`: het gaat om wat er in dit
    --    seizoen gedáán is, niet om wat erin gepland stond.
    (select count(*)::int
       from milestones m
       join goal_group_links l on l.goal_id = m.goal_id
      where l.group_id = p_group_id
        and m.status = 'done'
        and m.completed_at is not null
        and (m.completed_at at time zone 'UTC')::date between p_van and p_tot),

    (select count(*)::int
       from chain_links c
      where c.group_id = p_group_id
        and c.group_period_start between p_van and p_tot);
$$;

revoke all on function public.seizoensrecap_cijfers(uuid, date, date) from public, anon;
grant execute on function public.seizoensrecap_cijfers(uuid, date, date) to service_role;

comment on function public.seizoensrecap_cijfers(uuid, date, date) is
  'De drie groepstotalen van een seizoen: afgeronde weken, gehaalde mijlpalen en '
  'schakels. Nooit per persoon — domeinregel 7. QS8-79.';

-- ---------------------------------------------------------------------------
-- Wat er verstuurd is, en dus niet nog een keer
-- ---------------------------------------------------------------------------

create table if not exists public.season_recaps (
  group_id     uuid        not null references groups (id) on delete cascade,
  season_start date        not null,
  season_end   date        not null,
  weken        integer     not null,
  mijlpalen    integer     not null,
  schakels     integer     not null,
  created_at   timestamptz not null default now(),

  primary key (group_id, season_start)
);

alter table public.season_recaps enable row level security;

-- ⚠️ Leden mogen hun eigen seizoenen teruglezen. Dezelfde cijfers staan al in de
--    chat; deze tabel is de bron, zodat een later seizoensoverzicht ze niet
--    hoeft te herberekenen over data die intussen veranderd kan zijn.
drop policy if exists season_recaps_select on public.season_recaps;
create policy season_recaps_select on public.season_recaps
  for select to authenticated
  using (is_group_member(group_id));

-- ⚠️ Geen INSERT-, UPDATE- of DELETE-policy. `maak_seizoensrecaps()` is de enige
--    schrijver en draait als `service_role` vanuit de rollover.
drop policy if exists season_recaps_insert on public.season_recaps;
drop policy if exists season_recaps_update on public.season_recaps;
drop policy if exists season_recaps_delete on public.season_recaps;

revoke all on public.season_recaps from anon, authenticated;
grant select on public.season_recaps to authenticated;
grant all on public.season_recaps to service_role;

comment on table public.season_recaps is
  'Eén rij per groep per seizoen. De primaire sleutel ís de belofte "één bericht '
  'per seizoen" — een tweede poging botst in plaats van te posten. QS8-79.';

-- ---------------------------------------------------------------------------
-- De job
-- ---------------------------------------------------------------------------

create or replace function public.maak_seizoensrecaps(p_op timestamptz default now())
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  g        record;
  grens    record;
  cijfers  record;
  gemaakt  integer := 0;
  stil     integer := 0;
begin
  -- ⚠️ Alleen `service_role`. Deze functie plaatst berichten in groepschats;
  --    een ingelogde gebruiker die hem kan aanroepen, kan de hele boel laten
  --    afgaan wanneer het hem uitkomt.
  if current_setting('request.jwt.claim.role', true) is not null
     and current_setting('request.jwt.claim.role', true) <> 'service_role' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  for g in
    select gr.id, gr.tz, gr.season_cadence
    from groups gr
    where gr.status <> 'archived'
  loop
    select * into grens
    from seizoensgrens(g.tz, g.season_cadence, p_op);

    -- ⚠️ **Precies op de eerste dag van het nieuwe seizoen, om 08:00 lokaal.**
    --    Dat is acceptatiecriterium 3, en het is bewust strak: de rollover draait
    --    elk uur, dus zonder deze twee toetsen zou de recap op het moment van de
    --    kalenderomslag komen — middenin de nacht.
    continue when not (grens.is_eerste_dag and grens.is_acht_uur);

    continue when exists (
      select 1 from season_recaps r
      where r.group_id = g.id and r.season_start = grens.season_start
    );

    select * into cijfers
    from seizoensrecap_cijfers(g.id, grens.season_start, grens.season_end);

    -- ⚠️ Een recap van nul is een tegenslagbericht met een vrolijke kop erop.
    --    In een stille groep zwijgt hij; zie punt 3 in de kop.
    if coalesce(cijfers.weken, 0) = 0
       and coalesce(cijfers.mijlpalen, 0) = 0
       and coalesce(cijfers.schakels, 0) = 0 then
      stil := stil + 1;
      continue;
    end if;

    insert into season_recaps (group_id, season_start, season_end, weken, mijlpalen, schakels)
    values (g.id, grens.season_start, grens.season_end,
            cijfers.weken, cijfers.mijlpalen, cijfers.schakels)
    on conflict do nothing;

    perform plaats_systeembericht(
      g.id,
      'season_recap',
      -- ⚠️ Noodterugval, precies zoals 0059 het bedoelde: de app maakt de zin uit
      --    `system_event` plus de payload. Deze tekst is alleen voor een client
      --    die de gebeurtenis nog niet kent.
      'Het seizoen zit erop.',
      null,
      null,
      jsonb_build_object(
        'weken', cijfers.weken,
        'mijlpalen', cijfers.mijlpalen,
        'schakels', cijfers.schakels
      )
    );

    gemaakt := gemaakt + 1;
  end loop;

  return jsonb_build_object('ok', true, 'recaps', gemaakt, 'stil', stil);
end;
$$;

revoke all on function public.maak_seizoensrecaps(timestamptz) from public, anon, authenticated;
grant execute on function public.maak_seizoensrecaps(timestamptz) to service_role;

-- ⚠️ **`p_op` bestaat om deze functie testbaar te maken, en dat is geen luxe.**
--    Met een harde `now()` is de hele timingtak — eerste dag van het seizoen, om
--    08:00 in de tijdzone van de groep — alleen te toetsen door te wachten tot 1
--    januari. Dat is een belofte die geen test kan raken, en dat is precies wat
--    onwrikbare regel 18 vraag 3 verbiedt.
--
--    De rollover roept hem zonder argument aan, dus in productie is het `now()`.
comment on function public.maak_seizoensrecaps(timestamptz) is
  'Plaatst één seizoensrecap per groep, op de eerste dag van het nieuwe seizoen '
  'om 08:00 in de tijdzone van de groep. Draait elk uur vanuit de rollover — QS8-79.';
