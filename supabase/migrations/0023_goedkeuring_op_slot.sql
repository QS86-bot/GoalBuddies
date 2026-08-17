-- 0023_goedkeuring_op_slot.sql — het raam naast de dichtgetimmerde deur
--
-- ROLLBACK-PAD:
--   grant update on weekly_goals to authenticated;
--   drop trigger if exists completions_mark_pending on completions;
--   drop function if exists mark_weekly_goal_pending(), markeer_doorgeschoven(uuid);
--   alter table completions drop constraint if exists completions_note_length;
--   alter table completion_approvals drop constraint if exists completion_approvals_comment_length;
--   -- daarna completion_approvals_insert uit 0003_rls.sql, en
--   -- award_points_on_approval + dien_opnieuw_in uit 0021/0022 opnieuw uitvoeren
--
-- ⚠️ Vier bevindingen van de security-review op EPIC 6. De eerste is de kern van
--    domeinregel 3 en had de hele epic omzeilbaar gemaakt.

-- ---------------------------------------------------------------------------
-- 1. De uitkomst van goedkeuring is niet meer zelf te schrijven
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het slot zat op de deur en het raam ernaast stond open. Goedkeuren zelf is
--    drievoudig dichtgetimmerd (een CHECK die zelfgoedkeuring verbiedt, een
--    trigger die `subject_id` vult, en een policy die lidmaatschap en koppeling
--    eist), maar het *effect* ervan — `weekly_goals.status = 'approved'` — was
--    met één PATCH-verzoek door de eigenaar zelf te zetten. Geen buddy nodig.
--
--    Daarmee was de hele epic te omzeilen zonder `completion_approvals` aan te
--    raken: `herbereken_reeks()` telt zo'n cyclus gewoon mee, en
--    `group_visible_streaks` toont die verzonnen reeks aan de groep. Dezelfde
--    route gaf `excused` (een gratis adempauze zonder weekpas) en herstelde een
--    week die de rollover al op `missed` had gezet, terwijl het minpunt bleef
--    staan.
--
-- ⚠️ Kolomrechten en niet een trigger, om dezelfde reden als in 0019: een
--    trigger die op een rolnaam beslist, faalt open. `revoke update (status)`
--    dwingt Postgres het af, ongeacht wie er belt.

revoke update on weekly_goals from authenticated, anon;

grant update (title, floor_text, ceiling_text, milestone_id)
  on weekly_goals to authenticated;

-- ⚠️ `rondAf()` zette de status in een tweede, los verzoek. Dat kan nu niet meer
--    en dat is maar goed ook: viel dat tweede verzoek weg, dan bereikte de week
--    nooit `pending`, stond hij in niemands wachtrij, en boekte de rollover een
--    minpunt voor een week die de gebruiker wél had afgemaakt. Een trigger doet
--    het nu, in dezelfde transactie als de voltooiing zelf.

create or replace function mark_weekly_goal_pending()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- Alleen vooruit vanaf een open week. Een goedgekeurde week terugzetten naar
  -- pending zou punten opnieuw laten boeken; een gemiste of doorgeschoven week
  -- terughalen zou de rollover-uitspraak ongedaan maken.
  update weekly_goals
  set status = 'pending'
  where id = new.weekly_goal_id
    and status in ('todo', 'pending');

  return new;
end;
$$;

comment on function mark_weekly_goal_pending() is
  'Een ingediende voltooiing zet het weekdoel op pending, in dezelfde '
  'transactie. De client kan status niet meer zelf schrijven (0023).';

drop trigger if exists completions_mark_pending on completions;
create trigger completions_mark_pending
  after insert on completions
  for each row execute function mark_weekly_goal_pending();

revoke all on function mark_weekly_goal_pending() from public, anon, authenticated;

-- Doorschuiven van een gemiste week (QS8-47) is de tweede en laatste
-- statusovergang die van de client komt.
create or replace function markeer_doorgeschoven(p_weekly_goal_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  w weekly_goals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status not in ('todo', 'missed') then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  update weekly_goals set status = 'carried' where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function markeer_doorgeschoven(uuid) is
  'Zet een openstaand weekdoel op carried (QS8-47). Enige route sinds 0023 de '
  'kolom status voor de client op slot heeft gezet.';

revoke all on function markeer_doorgeschoven(uuid) from public, anon;
grant execute on function markeer_doorgeschoven(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Goedkeuren mag alleen op een voltooiing die er nog staat
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het scenario: de eigenaar dient `ceiling` in, een buddy vraagt door, de
--    eigenaar corrigeert eerlijk naar `floor` — en een tweede buddy keurt
--    vervolgens de ingetrokken rij goed. Resultaat: +2 punten op een bewering
--    die de eigenaar zélf had ingetrokken.
--
--    `openstaande_beoordelingen` filtert `superseded_by is null` wél. Precies
--    het patroon dat 0006, 0007 en 0019 al drie keer hebben gedicht: het scherm
--    doet het goed, de policy niet.
--
-- ⚠️ En de inactieve-ledenkwestie, hier smal opgelost. `is_group_member()`
--    negeert `group_members.status`, waardoor een op `inactive` gezet lid blijft
--    goedkeuren en blijft doorvragen. Dat globaal repareren raakt elke policy in
--    het schema en de historische zichtbaarheid van vertrokken leden — dat is
--    een besluit (A18 in Q-TODO), geen reparatie. Hier staat het predicaat
--    daarom expliciet in de policy die het hardst telt.

drop policy if exists completion_approvals_insert on completion_approvals;
create policy completion_approvals_insert on completion_approvals for insert to authenticated
  with check (
    -- je beoordeelt altijd namens jezelf
    approver_id = auth.uid()
    -- en alleen als actief lid van de groep waarin je boekt
    and exists (
      select 1 from group_members m
      where m.group_id = completion_approvals.group_id
        and m.user_id = auth.uid()
        and m.status <> 'inactive'
    )
    -- en het doel moet daadwerkelijk aan díé groep gekoppeld zijn
    and exists (
      select 1
      from completions   c
      join weekly_goals  w on w.id = c.weekly_goal_id
      join goal_group_links l on l.goal_id = w.goal_id
      where c.id = completion_id
        and l.group_id = completion_approvals.group_id
        -- en het is niet je eigen voltooiing
        and c.user_id <> auth.uid()
        -- en de voltooiing is niet ingetrokken of vervangen
        and c.superseded_by is null
    )
  );

comment on policy completion_approvals_insert on completion_approvals is
  'Domeinregel 3, volledig: namens jezelf, als actief lid, in een groep waar het '
  'doel aan hangt, niet je eigen voltooiing, en alleen op de voltooiing die er '
  'nu staat.';

-- ---------------------------------------------------------------------------
-- 3. Reviewpunten zijn niet meer te farmen
-- ---------------------------------------------------------------------------
--
-- ⚠️ De lus die de review vond: twee accounts in een eigen groep met
--    `evidence_policy = 'optional'`. A roept `dien_opnieuw_in` aan (nieuwe
--    completion_id), B boekt `more_info` (+1), herhaal. Twee verzoeken per punt,
--    geen rem, en het weekdoel blijft op `pending` staan zodat de lus niet
--    eindigt. Bijvangst: onbegrensde rijgroei op een gratis tier van 500 MB.
--
--    De rem is één voorwaarde: een reviewpunt valt alleen op een voltooiing die
--    nog actief is en op een weekdoel dat nog op goedkeuring wacht.

create or replace function award_points_on_approval()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
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

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$$;

comment on function award_points_on_approval() is
  'Zet het weekdoel op approved, boekt de punten voor de eigenaar én het '
  'reviewpunt voor de beoordelaar — allebei alleen op een actieve voltooiing van '
  'een week die nog op een oordeel wacht. Zonder die twee voorwaarden zijn '
  'reviewpunten in een lus te verdienen.';

revoke all on function award_points_on_approval() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. dien_opnieuw_in haalt geen afgesloten week terug
-- ---------------------------------------------------------------------------
--
-- ⚠️ De enige statuscontrole was `status = 'approved'`. Stond het weekdoel op
--    `missed`, `carried` of `excused`, dan zette de functie hem doodleuk terug
--    op `pending`: de rollover-uitspraak ongedaan, terwijl het minpunt gewoon
--    bleef staan. Een gemiste week was zo alsnog te claimen.

create or replace function dien_opnieuw_in(
  p_weekly_goal_id uuid,
  p_achieved_level text,
  p_note text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  w      weekly_goals%rowtype;
  oud    completions%rowtype;
  nieuw  completions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_achieved_level not in ('floor', 'ceiling') then
    return jsonb_build_object('ok', false, 'reason', 'bad_level');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_approved');
  end if;

  -- ⚠️ Alleen een week die nog loopt. `missed`, `carried` en `excused` zijn
  --    uitspraken van de rollover of van een adempauze, en die hoort niemand met
  --    een tweede indiening ongedaan te maken.
  if w.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'week_gesloten');
  end if;

  select * into oud
  from completions
  where weekly_goal_id = p_weekly_goal_id and superseded_by is null;

  if oud.id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_replace');
  end if;

  begin
    insert into completions
      (weekly_goal_id, user_id, achieved_level, note, cycle_start_date, superseded_by)
    values
      (p_weekly_goal_id, auth.uid(), p_achieved_level,
       nullif(btrim(coalesce(p_note, '')), ''), w.cycle_start_date, oud.id)
    returning * into nieuw;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end;

  update completions set superseded_by = nieuw.id where id = oud.id;
  update completions set superseded_by = null where id = nieuw.id;

  return jsonb_build_object('ok', true, 'completion_id', nieuw.id);
end;
$$;

comment on function dien_opnieuw_in(uuid, text, text) is
  'Vervangt een voltooiing door een nieuwe, append-only (domeinregel 6). Alleen '
  'op een week die nog op een oordeel wacht: een gemiste of doorgeschoven week '
  'is geen tweede kans maar een uitspraak.';

revoke all on function dien_opnieuw_in(uuid, text, text) from public, anon;
grant execute on function dien_opnieuw_in(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Een notitie is een notitie en geen opslagmedium
-- ---------------------------------------------------------------------------
--
-- ⚠️ Zod begrenst op 2000 en 1000 tekens in de client, en de client is geen
--    grens. Eén verzoek met een notitie van tien megabyte vult de gratis tier en
--    wordt daarna via realtime naar elk groepslid geduwd. `daily_moves.body`
--    heeft deze CHECK al sinds 0001; dit trekt de andere twee gelijk. Geen
--    datamodelwijziging dus, maar het rechttrekken van een inconsistentie.

alter table completions
  drop constraint if exists completions_note_length;
alter table completions
  add constraint completions_note_length
  check (note is null or char_length(note) <= 2000);

alter table completion_approvals
  drop constraint if exists completion_approvals_comment_length;
alter table completion_approvals
  add constraint completion_approvals_comment_length
  check (comment is null or char_length(comment) <= 1000);
