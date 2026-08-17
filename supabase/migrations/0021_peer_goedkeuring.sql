-- 0021_peer_goedkeuring.sql — EPIC 6: beoordelen, bewijs en reviewpunten
--
-- ROLLBACK-PAD:
--   drop trigger if exists completions_evidence on completions;
--   drop function if exists enforce_evidence_policy(),
--     openstaande_beoordelingen(integer, integer),
--     dien_opnieuw_in(uuid, text, text);
--   alter publication supabase_realtime drop table completions, weekly_goals;
--   -- daarna award_points_on_approval() uit 0014_points_engine.sql opnieuw uitvoeren
--
-- ⚠️ Geen cyclusrekenwerk. `dien_opnieuw_in` neemt de `cycle_start_date` over
--    van het weekdoel dat er al staat; welke week het is, wordt uitsluitend in
--    `shared/time` bepaald (CLAUDE.md, correctheidsregel 7).

-- ---------------------------------------------------------------------------
-- 1. De bewijseis van de groep, afgedwongen in de database (6.5)
-- ---------------------------------------------------------------------------
--
-- ⚠️ `rondAf()` kreeg de bewijseis als parameter mee van de aanroeper. Dat is
--    precies de fout die 0006 en 0007 vier keer hebben gedicht: een client die
--    de regel meelevert waaraan hij getoetst wordt, is geen regel maar een
--    verzoek. Het acceptatiecriterium zegt het letterlijk: "serverside
--    afgedwongen, niet alleen in het formulier."
--
-- ⚠️ De strengste eis wint. Een doel kan aan meerdere groepen hangen (5.5) en
--    die kunnen verschillende eisen hebben. Dan is de veilige keuze de strengste
--    — anders bepaalt de losste groep hoeveel bewijs alle andere krijgen.
--
-- ⚠️ Alleen bij INSERT. "Wijzigen raakt bestaande voltooiingen niet met
--    terugwerkende kracht" is een acceptatiecriterium, en een trigger op UPDATE
--    zou oude rijen alsnog kunnen laten struikelen.
--
-- ⚠️ `note_and_attachment` wordt hier bewust nog niet op de bijlage getoetst:
--    er is geen Storage-bucket (Q-TODO A12), dus die eis zou onhaalbaar zijn.
--    Hij gedraagt zich tot die tijd als `note_required`, en het scherm zet de
--    optie zichtbaar uit.

create or replace function enforce_evidence_policy()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  eis text;
begin
  select case
           when bool_or(g.evidence_policy = 'note_and_attachment') then 'note_and_attachment'
           when bool_or(g.evidence_policy = 'note_required')       then 'note_required'
           else 'optional'
         end
    into eis
  from weekly_goals w
  join goal_group_links l on l.goal_id = w.goal_id
  join groups g on g.id = l.group_id
  where w.id = new.weekly_goal_id;

  -- Geen groep, geen eis. Solo werken mag, en dan is er niemand die bewijs
  -- vraagt (er is ook niemand die goedkeurt).
  if eis is null or eis = 'optional' then
    return new;
  end if;

  if new.note is null or btrim(new.note) = '' then
    raise exception 'Deze groep vraagt om een korte notitie bij het afronden'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_evidence_policy() is
  'De bewijseis van de groep (6.5), afgedwongen bij het invoegen. De strengste '
  'eis van alle gekoppelde groepen wint; zonder groep geldt er geen eis.';

drop trigger if exists completions_evidence on completions;
create trigger completions_evidence
  before insert on completions
  for each row execute function enforce_evidence_policy();

revoke all on function enforce_evidence_policy() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Punten voor de goedkeurder (6.6)
-- ---------------------------------------------------------------------------
--
-- ⚠️ Reviewen is een bijdrage aan de groep, geen klusje. Dit is de goedkoopste
--    manier om de succesmetriek uit de PRD te halen: ≥80% van de afgeronde
--    weekdoelen goedgekeurd binnen 48 uur.
--
-- ⚠️ Ook voor "vertel me meer". Het gaat om betrokkenheid en niet om ja zeggen —
--    zou alleen goedkeuren punten opleveren, dan is doorvragen duurder dan
--    wegkijken, en dat is precies de verkeerde prikkel.
--
-- ⚠️ Eén punt, en dus minder dan het plafond van een eigen weekdoel (+2).
--    Beoordelen hoort nooit lucratiever te zijn dan je eigen werk doen.
--
-- ⚠️ `goal_id` blijft leeg. Deze punten horen niet bij een doel van de
--    beoordelaar, en anders zouden ze meetellen in `user_streaks.total_points`
--    van een doel waar ze niets mee te maken hebben. Het profiel telt ze apart
--    op als "buddy-bijdrage".
--
-- ⚠️ De unieke index `points_ledger_dedupe_idx` maakt dit vanzelf "alleen de
--    eerste beoordeling telt": dezelfde reden voor dezelfde referentie kan maar
--    één keer geboekt worden. Zelfgoedkeuring blijft onmogelijk via de CHECK op
--    de tabel.

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
  -- De beoordelaar krijgt zijn punt ongeacht de uitkomst: goedkeuren en
  -- doorvragen zijn allebei betrokkenheid (6.6).
  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id)
  values (new.approver_id, null, new.group_id, 1, 'review_given', 'completion', new.completion_id)
  on conflict do nothing;

  -- "Vertel me meer" is geen goedkeuring: geen status, geen punten voor de
  -- indiener.
  if new.status <> 'approved' then
    return new;
  end if;

  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  -- ⚠️ Al goedgekeurd? Dan gebeurt er niets meer. Eén goedkeuring is genoeg
  --    (6.3), en een tweede buddy mag geen tweede keer punten opleveren.
  if w.status = 'approved' then
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
  'reviewpunt voor de beoordelaar, en herberekent de reeks — in een transactie. '
  'Het reviewpunt valt ook bij "vertel me meer", want het gaat om betrokkenheid.';

revoke all on function award_points_on_approval() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. De wachtrij: wat wacht er op mijn oordeel? (6.1)
-- ---------------------------------------------------------------------------
--
-- ⚠️ SECURITY INVOKER, net als `group_overview`. De functie voegt geen recht
--    toe: `completions_select`, `weekly_goals_select`, `goals_select` en
--    `profiles_select` gelden gewoon, en een niet-lid krijgt vanzelf nul rijen.
--
-- ⚠️ Wat hier staat is uitsluitend positief: iemand heeft iets áfgerond en
--    wacht op bevestiging. Er staat geen enkele rij in van iemand die iets níét
--    gedaan heeft (domeinregel 7).
--
-- ⚠️ Eén rij per voltooiing, ook als het doel aan twee van mijn groepen hangt.
--    De goedkeuring wordt in één groep geboekt; welke dat is, is dan een keuze
--    en geen toeval, dus hij ligt vast op de oudste koppeling.
--
-- ⚠️ Al beoordeeld door mij? Dan valt hij uit de lijst. Al goedgekeurd door
--    iemand anders? Dan staat het weekdoel op `approved` en valt hij er ook uit
--    — "het verzoek verdwijnt netjes" is een acceptatiecriterium van 6.1.

create or replace function openstaande_beoordelingen(
  p_limit integer default 20,
  p_offset integer default 0
)
  returns table (
    completion_id   uuid,
    weekly_goal_id  uuid,
    group_id        uuid,
    owner_id        uuid,
    owner_name      text,
    owner_avatar    text,
    goal_title      text,
    weekly_title    text,
    floor_text      text,
    ceiling_text    text,
    achieved_level  text,
    note            text,
    submitted_at    timestamptz,
    total_open      bigint
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  select
    c.id,
    w.id,
    k.group_id,
    g.owner_id,
    p.display_name,
    p.avatar_url,
    g.title,
    w.title,
    w.floor_text,
    w.ceiling_text,
    c.achieved_level,
    c.note,
    c.submitted_at,
    count(*) over ()
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
  where c.superseded_by is null
    and w.status = 'pending'
    and c.user_id <> auth.uid()
    and not exists (
      select 1 from completion_approvals a
      where a.completion_id = c.id and a.approver_id = auth.uid()
    )
  order by c.submitted_at asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function openstaande_beoordelingen(integer, integer) is
  'Wat wacht er op mijn oordeel (6.1). SECURITY INVOKER: de policies eronder '
  'doen de autorisatie. Bevat uitsluitend afgeronde weekdoelen — nooit iets dat '
  'iemand níét gedaan heeft.';

revoke all on function openstaande_beoordelingen(integer, integer) from public, anon;
grant execute on function openstaande_beoordelingen(integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Opnieuw indienen na "vertel me meer" (6.2, en QS8-46)
-- ---------------------------------------------------------------------------
--
-- ⚠️ `completions` heeft bewust geen UPDATE-policy: de geschiedenis is
--    append-only (domeinregel 6). Corrigeren gebeurt met een nieuwe rij plus
--    `superseded_by` op de oude, en dat kan de client dus niet zelf. Tot nu toe
--    gaf de app daarom een eerlijke melding dat het niet kon — dat stond als
--    los eindje in de werkvoorraad (QS8-46).
--
-- ⚠️ Een exception-blok in PL/pgSQL rolt alleen zíjn eigen werk terug, niet wat
--    ervóór gebeurde. De eerste versie van deze functie zette de oude voltooiing
--    opzij, ving daarna de bewijseis-fout op, en liet zo een weekdoel achter met
--    nul actieve voltooiingen — onzichtbaar en alleen met de hand te herstellen.
--    De markering wordt nu expliciet teruggedraaid. Saaier, en te lezen.

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

  select * into oud
  from completions
  where weekly_goal_id = p_weekly_goal_id and superseded_by is null;

  if oud.id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_replace');
  end if;

  -- ⚠️ Eerst de oude opzij, dan de nieuwe erin. Andersom botst het op
  --    `completions_active_uniq`, die maar één actieve voltooiing per weekdoel
  --    toestaat. `superseded_by` wijst tijdelijk naar zichzelf: een geldige
  --    "niet meer actief"-markering tot de nieuwe rij bestaat.
  update completions set superseded_by = oud.id where id = oud.id;

  begin
    insert into completions (weekly_goal_id, user_id, achieved_level, note, cycle_start_date)
    values (p_weekly_goal_id, auth.uid(), p_achieved_level, nullif(btrim(coalesce(p_note, '')), ''),
            w.cycle_start_date)
    returning * into nieuw;
  exception when check_violation then
    -- ⚠️ Zelf terugdraaien. Het exception-blok herstelt alleen zijn eigen werk;
    --    de markering hierboven stond er al en zou anders blijven staan.
    update completions set superseded_by = null where id = oud.id;
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end;

  update completions set superseded_by = nieuw.id where id = oud.id;
  update weekly_goals set status = 'pending' where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true, 'completion_id', nieuw.id);
end;
$$;

comment on function dien_opnieuw_in(uuid, text, text) is
  'Vervangt een voltooiing door een nieuwe, append-only (domeinregel 6). Nodig '
  'na "vertel me meer" en voor een correctie; de client kan superseded_by niet '
  'zelf zetten.';

revoke all on function dien_opnieuw_in(uuid, text, text) from public, anon;
grant execute on function dien_opnieuw_in(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Realtime op de wachtrij (6.1)
-- ---------------------------------------------------------------------------
--
-- ⚠️ "Realtime in de app binnen 2 seconden" vraagt dat de tabel in de
--    publicatie zit. Supabase past RLS toe op realtime-gebeurtenissen, dus een
--    lid krijgt uitsluitend voltooiingen te zien die `completions_select` ook
--    zou doorlaten — de policy is en blijft de bescherming.
--
--    `weekly_goals` zit er ook in, want de wachtrij verdwijnt pas als de status
--    naar `approved` gaat; zonder dat signaal blijft een verzoek staan tot
--    iemand het scherm herlaadt.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'completions'
    ) then
      alter publication supabase_realtime add table completions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weekly_goals'
    ) then
      alter publication supabase_realtime add table weekly_goals;
    end if;
  end if;
end;
$$;
