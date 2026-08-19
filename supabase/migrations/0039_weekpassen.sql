-- 0039_weekpassen.sql — QS8-81 (EPIC 8)
--
-- ROLLBACK-PAD:
--   drop function if exists weekpas_stand(uuid);
--   drop function if exists verbruik_weekpas(uuid, uuid, date);
--   drop function if exists verdien_weekpassen(uuid, uuid);
--   drop function if exists weekpas_maximum();
--   drop index if exists week_pass_events_uniek;
--   -- Herstel daarna de vorige versie van award_points_on_approval(); die staat
--   -- in 0022 en verschilt op precies één regel (de perform hieronder).
--   -- Verdiende en verbruikte passen blijven staan: het zijn gebeurtenissen en
--   -- die worden niet teruggedraaid (domeinregel 6, append-only).
--
-- ⚠️ Waarom deze migratie bestaat. `week_pass_events` staat sinds 0001 in het
--    schema en `herbereken_reeks()` leest hem al: een gemiste cyclus met een
--    `spent`-gebeurtenis breekt de reeks niet. Dat pad is tot vandaag nooit
--    doorlopen, want er was geen enkele schrijver. Sinds de rollover elk uur
--    draait (19-08) wordt het echt gebruikt zodra het gevuld wordt.
--
-- ⚠️ Een weekpas beschermt de reeks, niet het punt (CLAUDE.md domeinregel 10).
--    Deze migratie raakt `points_ledger` dus met geen enkele regel aan. De
--    rollover boekt het minpunt zoals hij dat altijd deed; de pas zorgt er
--    alleen voor dat `herbereken_reeks()` de teller niet op nul zet. Zou de pas
--    ook het punt terugdraaien, dan is missen gratis en zegt de score niets.
--
-- ⚠️ Domeinregel 7. Een verbruikte weekpas is het bewijs van een gemiste week en
--    dus privé. `week_pass_events` heeft alleen een SELECT-policy op de eigenaar
--    en dat blijft zo: alle functies hieronder zijn SECURITY DEFINER en de tabel
--    blijft dicht voor een rechtstreekse insert. Er komt om dezelfde reden géén
--    systeembericht bij een verbruikte pas — dat zou een gemiste week in de
--    groepschat zetten. `chat_messages_system_event_bekend` wordt hier dus
--    bewust niet aangeraakt.
--
-- ⚠️ De vraag die de werkvoorraad stelt bij elke tabel die van leeg naar gevuld
--    gaat: wat betekent een ontbrekende rij nu? Voor `week_pass_events` is dat
--    "deze gemiste week is niet gered". Dat is een gevoelig gegeven, en precies
--    daarom is de tabel alleen voor de eigenaar leesbaar en heeft
--    `weekpas_stand()` hieronder een expliciete eigenaarstoets in plaats van op
--    RLS te leunen. De groep ziet alleen `current_streak` (A15) en daaruit volgt
--    niets nieuws: een geredde reeks loopt gewoon door.

-- ---------------------------------------------------------------------------
-- 1. Eén gebeurtenis per soort per cyclus
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is het slot dat alles hieronder idempotent maakt, en dat is geen luxe:
--    de rollover draait elk uur en mag bij een tweede run niets veranderen. Voor
--    `spent` zegt de index bovendien iets inhoudelijks — je kunt niet twee
--    passen uitgeven aan dezelfde gemiste week.
create unique index if not exists week_pass_events_uniek
  on public.week_pass_events (user_id, goal_id, event, cycle_start_date);

-- ---------------------------------------------------------------------------
-- 2. De maximale voorraad — één bron van waarheid
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een functie en geen constante in twee talen. De app leest dit getal via
--    `weekpas_stand()` en houdt er dus geen eigen kopie van. Twee kopieën die
--    gelijk moeten blijven zijn in deze codebase één keer geruisloos uit elkaar
--    gelopen (valkuil 18); de goedkoopste oplossing is er maar één hebben.
--
-- ⚠️ Twee, en dat is een keuze. Zes voltooide cycli per pas met een voorraad van
--    twee betekent: je mag twee weken missen zonder je reeks te verliezen, en
--    daarna is het op. Hoger maakt de pas waardeloos — dan is missen kosteloos
--    en meet de reeks niets meer. Lager maakt hem tot een fooi.
create or replace function public.weekpas_maximum()
  returns integer
  language sql
  immutable
as $$ select 2 $$;

-- ---------------------------------------------------------------------------
-- 3. Verdienen
-- ---------------------------------------------------------------------------
--
-- Eén pas per zes voltooide cycli, plus één cadeau na de éérste voltooide
-- cyclus. Dat cadeau is de vertaling van Habit Huddle, dat de eerste freeze
-- weggeeft na de tweede check-in: een pas die je nooit gehad hebt, leert je niet
-- dat hij bestaat.
--
-- ⚠️ Alleen de huidige mijlpaal telt. Komt de zesde voltooide cyclus binnen
--    terwijl je voorraad vol is, dan vervalt die pas; hij wordt niet later
--    alsnog bijgeschreven. Anders verschijnt er een pas op het moment dat je er
--    een verbruikt, en dan is de bovengrens geen bovengrens.
create or replace function public.verdien_weekpassen(p_user_id uuid, p_goal_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  voltooid  integer;
  mijlpaal  date;
  soort     text;
  voorraad  integer;
begin
  -- Voltooide cycli, niet voltooide weekdoelen: twee weekdoelen in dezelfde week
  -- zijn samen één week. `herbereken_reeks()` telt op dezelfde manier.
  select count(distinct w.cycle_start_date), max(w.cycle_start_date)
    into voltooid, mijlpaal
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.status = 'approved';

  if coalesce(voltooid, 0) = 0 then
    return;
  end if;

  if voltooid = 1 then
    soort := 'granted';
  elsif voltooid % 6 = 0 then
    soort := 'earned';
  else
    return;
  end if;

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = p_user_id
     and e.goal_id = p_goal_id;

  if voorraad >= weekpas_maximum() then
    return;
  end if;

  insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  values (p_user_id, p_goal_id, soort, mijlpaal)
  on conflict do nothing;
end;
$$;

revoke all on function public.verdien_weekpassen(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verbruiken
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geeft een resultaat terug en gooit nooit. In een SECURITY DEFINER-functie
--    overleeft niets een `raise exception`: PostgREST draait elke aanroep in zijn
--    eigen transactie en rolt bij een fout ook terug wat je net wilde onthouden.
--    Dat is precies waar de uitnodigingslimiet op stukliep (0017).
--
-- ⚠️ Alleen aanroepbaar als service_role, want dit is de rollover-job. Een
--    gebruiker die zijn eigen pas mag inzetten, kan hem inzetten op een week die
--    nog loopt — en dan beschermt de pas niets.
create or replace function public.verbruik_weekpas(
  p_user_id uuid,
  p_goal_id uuid,
  p_cycle_start_date date
)
  returns boolean
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  voorraad  integer;
  gezet     integer;
begin
  -- Is deze cyclus echt gemist? De aanroeper zegt het, maar de aanroeper is een
  -- job en jobs hebben bugs. Zonder deze regel kan een pas verdwijnen aan een
  -- week die nooit gemist is.
  if not exists (
    select 1 from weekly_goals w
     where w.goal_id = p_goal_id
       and w.cycle_start_date = p_cycle_start_date
       and w.status = 'missed'
  ) then
    return false;
  end if;

  -- ⚠️ Telt de week al mee, dan is er niets te redden. Een cyclus met zowel een
  --    goedgekeurd als een gemist weekdoel houdt de reeks al in de lucht via de
  --    `approved`-tak van `herbereken_reeks()`; er dan tóch een pas aan uitgeven
  --    kost de gebruiker iets schaars voor niets.
  if exists (
    select 1 from weekly_goals w
     where w.goal_id = p_goal_id
       and w.cycle_start_date = p_cycle_start_date
       and w.status = 'approved'
  ) then
    return false;
  end if;

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = p_user_id
     and e.goal_id = p_goal_id;

  if voorraad < 1 then
    return false;
  end if;

  insert into week_pass_events (user_id, goal_id, event, cycle_start_date)
  values (p_user_id, p_goal_id, 'spent', p_cycle_start_date)
  on conflict do nothing;

  get diagnostics gezet = row_count;
  return gezet > 0;
end;
$$;

revoke all on function public.verbruik_weekpas(uuid, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. De stand, voor het dashboard
-- ---------------------------------------------------------------------------
--
-- ⚠️ SECURITY DEFINER mét een eigen eigenaarstoets, en niet INVOKER. Als INVOKER
--    zou deze functie draaien onder de SELECT-policy van `weekly_goals`, en die
--    laat een groepsgenoot bij de rijen van een gekoppeld doel. Dan kon een
--    groepslid de voorraad van een ander opvragen — en een verbruikte pas is een
--    gemiste week (domeinregel 7). De toets staat er daarom expliciet.
--
-- ⚠️ Geeft `null` bij een doel dat niet van jou is, en hetzelfde `null` bij een
--    doel dat niet bestaat. Dat onderscheid hoort niet uit deze functie te komen.
create or replace function public.weekpas_stand(p_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  eigenaar   uuid;
  voorraad   integer;
  voltooid   integer;
  verbruikt  date;
begin
  select g.owner_id into eigenaar from goals g where g.id = p_goal_id;

  if eigenaar is null or eigenaar <> auth.uid() then
    return null;
  end if;

  select coalesce(sum(case when e.event = 'spent' then -1 else 1 end), 0)
    into voorraad
    from week_pass_events e
   where e.user_id = eigenaar
     and e.goal_id = p_goal_id;

  select max(e.cycle_start_date) into verbruikt
    from week_pass_events e
   where e.user_id = eigenaar
     and e.goal_id = p_goal_id
     and e.event = 'spent';

  select count(distinct w.cycle_start_date) into voltooid
    from weekly_goals w
   where w.goal_id = p_goal_id
     and w.status = 'approved';

  return jsonb_build_object(
    'voorraad', voorraad,
    'maximum', weekpas_maximum(),
    'voltooide_cycli', coalesce(voltooid, 0),
    -- Hoeveel voltooide cycli nog tot de volgende pas. Zonder één voltooide
    -- cyclus is dat er één (het cadeau), daarna telt het per zes.
    'tot_volgende', case when coalesce(voltooid, 0) = 0 then 1 else 6 - (voltooid % 6) end,
    'laatst_verbruikt', verbruikt
  );
end;
$$;

revoke all on function public.weekpas_stand(uuid) from public, anon;
grant execute on function public.weekpas_stand(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. De verdien-haak in de goedkeuring
-- ---------------------------------------------------------------------------
--
-- Ongewijzigd ten opzichte van 0022 op één regel na: `verdien_weekpassen()`
-- draait vlak vóór `herbereken_reeks()`, op het moment dat de week echt op
-- `approved` komt. Daarmee is een goedgekeurde week het enige dat een pas
-- oplevert — een zelf ingediende week telt niet, net zomin als voor de punten.
create or replace function public.award_points_on_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'pg_temp'
as $$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
begin
  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ Een ingetrokken voltooiing levert niets op, voor niemand. De policy
  --    weigert de rij inmiddels ook, maar deze functie boekt punten en hoort
  --    niet te leunen op één slot.
  if c.superseded_by is not null then
    return new;
  end if;

  -- De beoordelaar krijgt zijn punt ongeacht de uitkomst: goedkeuren en
  -- doorvragen zijn allebei betrokkenheid (6.6). Maar alleen zolang de week
  -- écht op een oordeel wacht — anders is het een lus.
  if w.status = 'pending' then
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
    values (new.approver_id, null, new.group_id, 1, 'review_given', 'completion', new.completion_id)
    on conflict do nothing;
  end if;

  -- "Vertel me meer" is geen goedkeuring: geen status, geen punten voor de
  -- indiener.
  if new.status <> 'approved' then
    return new;
  end if;

  -- ⚠️ Al goedgekeurd? Dan gebeurt er niets meer. Eén goedkeuring is genoeg
  --    (6.3), en een tweede buddy mag geen tweede keer punten opleveren.
  if w.status <> 'pending' then
    return new;
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
    reden  := 'completion_approved_ceiling';
  else
    punten := w.points_floor;
    reden  := 'completion_approved_floor';
  end if;

  update weekly_goals set status = 'approved' where id = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id)
  on conflict do nothing;

  -- Weekpassen — QS8-81. Staat vóór de herberekening omdat verdienen de reeks
  -- niet raakt: een pas telt pas mee als hij verbruikt is.
  perform verdien_weekpassen(g_owner, w.goal_id);

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$$;
