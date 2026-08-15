-- 0001_schema.sql — tabellen, constraints en indexen
--
-- Volgt docs/decisions/001-datamodel.md (vastgesteld 15-08-2026).
-- Idempotent: elke statement is veilig opnieuw te draaien.
--
-- ROLLBACK-PAD (in deze volgorde, omgekeerd aan de afhankelijkheden):
--   drop table if exists ai_jobs, invite_events, chat_messages, commitment_events,
--     commitments, breathers, week_pass_events, user_streaks, points_ledger,
--     chain_links, week_reviews, daily_moves, completion_approvals, completions,
--     weekly_goals, milestones, goal_interviews, goal_events, goal_group_links,
--     goals, group_members, groups, profiles cascade;
--
-- ⚠️ Gratis tier heeft geen automatische backups. `pg_dump` vóór elke migratie
--    die op bestaande data draait.

-- ---------------------------------------------------------------------------
-- 1. Identiteit
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text        not null,
  avatar_url       text,
  week_start_day   smallint    not null default 1,   -- 0 = zondag … 6 = zaterdag
  tz               text        not null default 'Europe/Amsterdam',
  reminder_time    time,
  reminder_enabled boolean     not null default true,
  reminder_tone    text        not null default 'gentle',
  share_moves_by_default boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint profiles_week_start_day_range check (week_start_day between 0 and 6),
  constraint profiles_reminder_tone_valid  check (reminder_tone in ('gentle', 'firm')),
  constraint profiles_display_name_len     check (char_length(display_name) between 1 and 80)
);

comment on column profiles.week_start_day is
  'Klok 1: de persoonlijke cyclus. Alleen currentUserCycle() leest dit.';

-- ---------------------------------------------------------------------------
-- 2. Groepen
-- ---------------------------------------------------------------------------

create table if not exists groups (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  icon             text,
  created_by       uuid        not null references profiles (id),
  invite_code      text        not null unique,
  invite_revoked   boolean     not null default false,
  huddle_day       smallint    not null default 0,
  tz               text        not null default 'Europe/Amsterdam',
  evidence_policy  text        not null default 'note_required',
  approval_rule    text        not null default 'any',
  season_cadence   text        not null default 'quarterly',
  status           text        not null default 'active',
  last_activity_at timestamptz not null default now(),
  created_at       timestamptz not null default now(),

  constraint groups_huddle_day_range     check (huddle_day between 0 and 6),
  constraint groups_evidence_policy_valid
    check (evidence_policy in ('note_required', 'note_and_attachment', 'optional')),
  constraint groups_approval_rule_valid  check (approval_rule in ('any', 'majority')),
  constraint groups_season_cadence_valid check (season_cadence in ('monthly', 'quarterly')),
  constraint groups_status_valid         check (status in ('active', 'sleeping')),
  constraint groups_name_len             check (char_length(name) between 1 and 80)
);

comment on column groups.huddle_day is
  'Klok 2: de groepsperiode. Alleen currentGroupPeriod() leest dit.';

create table if not exists group_members (
  group_id  uuid        not null references groups (id)   on delete cascade,
  user_id   uuid        not null references profiles (id) on delete cascade,
  role      text        not null default 'member',
  status    text        not null default 'active',
  joined_at timestamptz not null default now(),

  primary key (group_id, user_id),
  constraint group_members_role_valid   check (role in ('admin', 'member')),
  constraint group_members_status_valid check (status in ('active', 'inactive', 'paused'))
);

create index if not exists group_members_user_idx on group_members (user_id);

create table if not exists invite_events (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references profiles (id) on delete cascade,
  group_id   uuid        references groups (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invite_events_user_created_idx
  on invite_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Doelen
-- ---------------------------------------------------------------------------

create table if not exists goals (
  id                       uuid        primary key default gen_random_uuid(),
  owner_id                 uuid        not null references profiles (id) on delete cascade,
  title                    text        not null,
  description              text,
  category                 text        not null default 'other',
  identity_statement       text,
  target_date              date        not null,
  available_hours_per_week numeric(4,1),
  max_points               integer     not null default 0,
  status                   text        not null default 'active',
  risk_status              text        not null default 'on_track',
  risk_reason              jsonb,
  risk_computed_at         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint goals_category_valid check (category in ('business', 'study', 'other')),
  constraint goals_status_valid
    check (status in ('active', 'completed', 'archived', 'missed')),
  constraint goals_risk_status_valid
    check (risk_status in ('on_track', 'watch', 'behind', 'unreachable')),
  constraint goals_title_len check (char_length(title) between 1 and 200),
  constraint goals_hours_sane
    check (available_hours_per_week is null
           or available_hours_per_week between 0 and 168)
);

comment on column goals.max_points is
  'Afgeleid: SUM(points_ceiling) over de weekdoelen. Onderhouden door trigger.';

create index if not exists goals_owner_status_idx on goals (owner_id, status);
create index if not exists goals_active_target_idx
  on goals (target_date) where status = 'active';

create table if not exists goal_events (
  id         uuid        primary key default gen_random_uuid(),
  goal_id    uuid        not null references goals (id)    on delete cascade,
  actor_id   uuid        not null references profiles (id),
  event_type text        not null,
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now(),

  constraint goal_events_type_valid check (event_type in (
    'created', 'deadline_moved', 'scope_reduced',
    'milestone_dropped', 'archived', 'completed'
  ))
);

create index if not exists goal_events_goal_created_idx
  on goal_events (goal_id, created_at desc);

create table if not exists goal_interviews (
  id         uuid        primary key default gen_random_uuid(),
  goal_id    uuid        not null references goals (id) on delete cascade,
  answers    jsonb       not null,
  created_at timestamptz not null default now()
);

create index if not exists goal_interviews_goal_idx on goal_interviews (goal_id);

create table if not exists goal_group_links (
  goal_id   uuid        not null references goals (id)  on delete cascade,
  group_id  uuid        not null references groups (id) on delete cascade,
  linked_at timestamptz not null default now(),

  primary key (goal_id, group_id)
);

-- Draagt het hele groepsoverzicht. Zie de N+1-waarschuwing in het beslisdocument.
create index if not exists goal_group_links_group_idx on goal_group_links (group_id);

create table if not exists milestones (
  id           uuid        primary key default gen_random_uuid(),
  goal_id      uuid        not null references goals (id) on delete cascade,
  title        text        not null,
  description  text,
  target_date  date,
  order_index  integer     not null,
  status       text        not null default 'todo',
  ai_generated boolean     not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint milestones_status_valid check (status in ('todo', 'done', 'dropped'))
);

-- Deferrable: herordenen is een reeks updates binnen één transactie.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'milestones_goal_order_uniq'
  ) then
    alter table milestones
      add constraint milestones_goal_order_uniq unique (goal_id, order_index)
      deferrable initially deferred;
  end if;
end $$;

create index if not exists milestones_goal_order_idx on milestones (goal_id, order_index);

-- ---------------------------------------------------------------------------
-- 4. Weekdoelen — het hart van het model
-- ---------------------------------------------------------------------------

create table if not exists weekly_goals (
  id               uuid        primary key default gen_random_uuid(),
  goal_id          uuid        not null references goals (id)      on delete cascade,
  milestone_id     uuid        references milestones (id)          on delete set null,
  title            text        not null,
  floor_text       text,                              -- optioneel (review 15-08-2026)
  ceiling_text     text,
  points_ceiling   integer     not null default 2,
  points_floor     integer     not null default 1,
  points_miss      integer     not null default -1,
  cycle_start_date date        not null,              -- uit currentUserCycle()
  cycle_index      integer     not null,
  status           text        not null default 'todo',
  ai_generated     boolean     not null default false,
  created_at       timestamptz not null default now(),

  constraint weekly_goals_status_valid check (
    status in ('todo', 'pending', 'approved', 'missed', 'carried', 'excused')
  ),
  constraint weekly_goals_points_ordered check (points_ceiling >= points_floor),
  constraint weekly_goals_miss_not_positive check (points_miss <= 0),
  constraint weekly_goals_title_len check (char_length(title) between 1 and 200)
);

comment on column weekly_goals.status is
  'Cache van completions + completion_approvals. Herbouwbaar; nooit de waarheid.';
comment on column weekly_goals.points_miss is
  'Minpunt bij een gemiste cyclus. Standaard -1 (review 15-08-2026).';

create index if not exists weekly_goals_goal_cycle_idx
  on weekly_goals (goal_id, cycle_start_date);
create index if not exists weekly_goals_pending_idx
  on weekly_goals (goal_id) where status = 'pending';
create index if not exists weekly_goals_milestone_idx
  on weekly_goals (milestone_id) where milestone_id is not null;

create table if not exists completions (
  id               uuid        primary key default gen_random_uuid(),
  weekly_goal_id   uuid        not null references weekly_goals (id) on delete cascade,
  user_id          uuid        not null references profiles (id),
  achieved_level   text        not null,
  note             text,
  attachment_url   text,
  cycle_start_date date        not null,
  submitted_at     timestamptz not null default now(),
  superseded_by    uuid        references completions (id),

  constraint completions_level_valid check (achieved_level in ('floor', 'ceiling')),
  constraint completions_no_self_supersede check (superseded_by is null or superseded_by <> id)
);

comment on table completions is
  'Append-only. Corrigeren gebeurt door een nieuwe rij en superseded_by op de oude.';

-- De actieve voltooiing is die zonder opvolger. Precies één per weekdoel.
create unique index if not exists completions_active_uniq
  on completions (weekly_goal_id) where superseded_by is null;

create table if not exists completion_approvals (
  id            uuid        primary key default gen_random_uuid(),
  completion_id uuid        not null references completions (id) on delete cascade,
  approver_id   uuid        not null references profiles (id),
  subject_id    uuid        not null references profiles (id),
  group_id      uuid        not null references groups (id),
  status        text        not null,
  comment       text,
  created_at    timestamptz not null default now(),

  -- ⚠️ De belangrijkste constraint in het schema: nooit jezelf goedkeuren.
  --    subject_id staat hier gedenormaliseerd omdat een CHECK geen subquery mag.
  --    Een trigger vult hem en bewaakt dat hij klopt met de voltooiing.
  constraint completion_approvals_not_self check (approver_id <> subject_id),
  constraint completion_approvals_status_valid check (status in ('approved', 'more_info')),
  constraint completion_approvals_one_vote unique (completion_id, approver_id)
);

create index if not exists completion_approvals_completion_idx
  on completion_approvals (completion_id);
create index if not exists completion_approvals_approver_idx
  on completion_approvals (approver_id, created_at desc);

create table if not exists daily_moves (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references profiles (id)     on delete cascade,
  weekly_goal_id uuid        references weekly_goals (id)          on delete set null,
  body           text        not null,
  visibility     text        not null default 'private',
  local_date     date        not null,
  created_at     timestamptz not null default now(),

  constraint daily_moves_visibility_valid check (visibility in ('private', 'group')),
  constraint daily_moves_body_len check (char_length(body) between 1 and 2000)
);

comment on column daily_moves.visibility is
  'Standaard privé (review 15-08-2026). Delen is een expliciete handeling.';

create index if not exists daily_moves_user_date_idx on daily_moves (user_id, local_date desc);
create index if not exists daily_moves_weekly_goal_idx
  on daily_moves (weekly_goal_id) where weekly_goal_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Groepsritueel en gedeelde score
-- ---------------------------------------------------------------------------

create table if not exists week_reviews (
  id                 uuid        primary key default gen_random_uuid(),
  group_id           uuid        not null references groups (id)   on delete cascade,
  user_id            uuid        not null references profiles (id) on delete cascade,
  group_period_start date        not null,              -- uit currentGroupPeriod()
  did_text           text,
  blocked_text       text,
  next_text          text,
  created_at         timestamptz not null default now(),

  constraint week_reviews_one_per_period unique (group_id, user_id, group_period_start)
);

comment on column week_reviews.blocked_text is
  'De enige plek in het model waar tegenslag staat die de groep kan zien. '
  'Toegestaan omdat de gebruiker het zelf schrijft en zelf verstuurt (domeinregel 7).';

create index if not exists week_reviews_group_period_idx
  on week_reviews (group_id, group_period_start desc);

create table if not exists chain_links (
  id                 uuid        primary key default gen_random_uuid(),
  group_id           uuid        not null references groups (id)   on delete cascade,
  user_id            uuid        not null references profiles (id) on delete cascade,
  group_period_start date        not null,
  created_at         timestamptz not null default now(),

  constraint chain_links_one_per_period unique (group_id, user_id, group_period_start)
);

create index if not exists chain_links_group_period_idx
  on chain_links (group_id, group_period_start desc);

-- ---------------------------------------------------------------------------
-- 6. Punten, reeksen en vergevingsmechanismen
-- ---------------------------------------------------------------------------

create table if not exists points_ledger (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references profiles (id) on delete cascade,
  group_id   uuid        references groups (id) on delete set null,
  goal_id    uuid        references goals (id)  on delete set null,
  delta      integer     not null,                       -- mag negatief zijn
  reason     text        not null,
  ref_type   text,
  ref_id     uuid,
  created_at timestamptz not null default now(),

  constraint points_ledger_reason_valid check (reason in (
    'completion_approved_floor', 'completion_approved_ceiling',
    'cycle_missed', 'review_given', 'milestone_done', 'goal_done', 'correction'
  ))
);

comment on table points_ledger is
  'Append-only en ALLEEN voor de eigenaar leesbaar. Een dalend totaal is zichtbaar '
  'bewijs van een gemiste week en botst met domeinregel 7.';

create index if not exists points_ledger_user_created_idx
  on points_ledger (user_id, created_at desc);
create index if not exists points_ledger_goal_idx
  on points_ledger (goal_id) where goal_id is not null;

-- Eén boeking per reden per referentie: voorkomt dubbele punten bij retries.
create unique index if not exists points_ledger_dedupe_idx
  on points_ledger (user_id, reason, ref_type, ref_id)
  where ref_id is not null;

create table if not exists user_streaks (
  user_id          uuid        not null references profiles (id) on delete cascade,
  goal_id          uuid        not null references goals (id)    on delete cascade,
  current_streak   integer     not null default 0,   -- in cycli, niet in dagen
  best_streak      integer     not null default 0,
  last_cycle_start date,
  total_points     integer     not null default 0,
  updated_at       timestamptz not null default now(),

  primary key (user_id, goal_id)
);

comment on table user_streaks is
  'Cache, volledig herbouwbaar uit points_ledger en completions.';

create table if not exists week_pass_events (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references profiles (id) on delete cascade,
  goal_id          uuid        not null references goals (id)    on delete cascade,
  event            text        not null,
  cycle_start_date date        not null,
  created_at       timestamptz not null default now(),

  constraint week_pass_events_valid check (event in ('earned', 'granted', 'spent'))
);

comment on table week_pass_events is
  'Een weekpas beschermt de reeks, niet het punt. Anders is missen gratis.';

create index if not exists week_pass_events_user_goal_idx on week_pass_events (user_id, goal_id);

create table if not exists breathers (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references profiles (id) on delete cascade,
  goal_id      uuid        not null references goals (id)    on delete cascade,
  starts_cycle date        not null,
  ends_cycle   date        not null,
  announced_at timestamptz not null default now(),

  constraint breathers_range_ordered check (ends_cycle >= starts_cycle)
);

create index if not exists breathers_user_range_idx
  on breathers (user_id, starts_cycle, ends_cycle);

-- ---------------------------------------------------------------------------
-- 7. Commitments
-- ---------------------------------------------------------------------------

create table if not exists commitments (
  id                   uuid        primary key default gen_random_uuid(),
  goal_id              uuid        not null references goals (id) on delete cascade,
  type                 text        not null,
  body                 text        not null,
  image_url            text,
  beneficiary_group_id uuid        references groups (id) on delete set null,
  status               text        not null default 'set',
  confirmed_at         timestamptz not null,     -- ⚠️ bevestiging is verplicht
  created_at           timestamptz not null default now(),

  constraint commitments_type_valid check (type in ('reward', 'penalty')),
  constraint commitments_status_valid
    check (status in ('set', 'unlocked', 'due', 'resolved', 'cancelled')),
  constraint commitments_penalty_has_beneficiary
    check (type = 'reward' or beneficiary_group_id is not null)
);

comment on column commitments.confirmed_at is
  'NOT NULL maakt domeinregel 5 een schema-eigenschap: nooit stilzwijgend geactiveerd.';
comment on column commitments.status is
  'Een straf wordt pas due bij een verstreken deadline, nooit bij een gemiste week.';

create index if not exists commitments_goal_idx on commitments (goal_id);
create index if not exists commitments_beneficiary_idx
  on commitments (beneficiary_group_id) where beneficiary_group_id is not null;

create table if not exists commitment_events (
  id            uuid        primary key default gen_random_uuid(),
  commitment_id uuid        not null references commitments (id) on delete cascade,
  actor_id      uuid        references profiles (id),    -- NULL = systeem
  event_type    text        not null,
  payload       jsonb,
  created_at    timestamptz not null default now(),

  constraint commitment_events_type_valid check (event_type in (
    'created', 'confirmed', 'edited', 'triggered', 'posted', 'resolved', 'cancelled'
  ))
);

create index if not exists commitment_events_commitment_idx
  on commitment_events (commitment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 8. Chat en AI-jobs
-- ---------------------------------------------------------------------------

create table if not exists chat_messages (
  id             uuid        primary key default gen_random_uuid(),
  group_id       uuid        not null references groups (id) on delete cascade,
  sender_id      uuid        references profiles (id),      -- NULL = systeembericht
  body           text,
  type           text        not null default 'text',
  system_event   text,
  attachment_url text,
  created_at     timestamptz not null default now(),

  constraint chat_messages_type_valid check (type in ('text', 'photo', 'doc', 'system')),
  constraint chat_messages_sender_required check (type = 'system' or sender_id is not null),
  constraint chat_messages_body_len check (body is null or char_length(body) <= 4000)
);

create index if not exists chat_messages_group_created_idx
  on chat_messages (group_id, created_at desc);

create table if not exists ai_jobs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references profiles (id) on delete cascade,
  goal_id       uuid        references goals (id) on delete cascade,
  kind          text        not null,
  status        text        not null default 'queued',
  input         jsonb       not null,
  input_hash    text        not null,
  output        jsonb,
  error         text,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  cost_cents    numeric(10,4),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz,

  constraint ai_jobs_kind_valid   check (kind in ('milestones', 'weekly_goals')),
  constraint ai_jobs_status_valid check (status in ('queued', 'running', 'done', 'failed'))
);

comment on table ai_jobs is
  'Maakt onwrikbare regel 8 afdwingbaar: de Edge Function schrijft een rij en keert '
  'terug, de client volgt via Realtime. input_hash + cost_cents dekken regel 6.';

create index if not exists ai_jobs_user_created_idx on ai_jobs (user_id, created_at desc);
create index if not exists ai_jobs_hash_idx         on ai_jobs (input_hash);
create index if not exists ai_jobs_queued_idx       on ai_jobs (created_at) where status = 'queued';
