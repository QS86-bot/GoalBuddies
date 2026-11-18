-- 0308_twee_systeemberichten_voor_teams.sql — `team_goal_created` en
-- `team_goal_completed` in de allowlist, en het eerste van de twee geplaatst bij
-- een nieuw teamdoel (QS8-656, epic QS8-650).
--
-- ⚠️ **Voorlopig nummer.** Bouwt op 0307 van QS8-661. De batchsessie hernummert
--    bij het landen, na 0302 van QS8-233 (besluit van Quinten, 18-11-2026).
--
-- ROLLBACK-PAD (een `chat_messages`-rij met een van de twee typen laat de oude
-- CHECK niet meer toe; die rijen gaan dan eerst weg, en dat is grens 2):
--   drop trigger if exists team_goals_systeembericht on public.team_goals;
--   drop function if exists public.meld_teamdoel();
--   alter table public.chat_messages drop constraint if exists chat_messages_system_event_bekend;
--   -- en de CHECK uit 0208 terugzetten.
--
-- ---------------------------------------------------------------------------
-- Wat dit doet
-- ---------------------------------------------------------------------------
--
-- 1. De allowlist `chat_messages_system_event_bekend` krijgt twee typen. Een
--    kopie van de lijst uit 0208, plus deze twee. Ook voor `service_role`. De
--    kopie in `src/modules/buddies/chat-schemas.ts` gaat mee.
-- 2. `team_goal_created` wordt geplaatst door een trigger op `team_goals`, en
--    dus langs elke route waarlangs een teamdoel ontstaat. **Geen titel en geen
--    persoon**: `subject_id` blijft leeg, en de zin noemt alleen dát er een
--    teamdoel is. Een titel in een bericht is een onveranderlijke kopie die de
--    autorisatie overleeft (domeinregel 7, de tweede van de drie sloten), en de
--    aanmaker staat ook niet in de kolomgrant van `team_goals` (0305).
-- 3. `team_goal_completed` heeft nog geen schrijver. Afronden met goedkeuring is
--    QS8-662; die plaatst hem.
--
-- ⚠️ **Wat een uitblijvend `team_goal_completed` zegt.** De regel in
--    `chat-schemas.ts` (QS8-79) is dat een bericht alleen komt als zijn
--    afwezigheid geen signaal wordt. Een teamdoel dat zijn streefdatum haalt
--    zonder afrondbericht, zegt wél iets: dat het team het niet haalde. Dat is
--    groepsbrede tegenslag en geen persoonlijke; het noemt niemand. Zie rij 43 en
--    46 in `docs/decisions/002-domeinregel7-oppervlakken.md` en het
--    beslisdocument van dit issue.
--
-- ---------------------------------------------------------------------------

alter table public.chat_messages
  drop constraint if exists chat_messages_system_event_bekend;

alter table public.chat_messages
  add constraint chat_messages_system_event_bekend
  check (
    system_event is null
    or system_event = any (array[
      'chain_milestone', 'commitment_due', 'commitment_unlocked',
      'completion_approved', 'completion_pending', 'deadline_requested',
      'goal_completed', 'group_opened', 'group_protected', 'group_sleeping',
      'member_joined', 'milestone_done', 'season_recap', 'group_discoverable',
      'huddle_day_changed',
      -- QS8-656
      'team_goal_created', 'team_goal_completed'
    ])
  );

create or replace function public.meld_teamdoel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Geen persoon (`p_subject_id` blijft leeg) en geen titel. De weergave komt
  -- uit de catalogus (`systeembericht.team_goal_created`); de `body` is alleen
  -- de terugvalzin.
  perform plaats_systeembericht(
    new.group_id,
    'team_goal_created',
    'Er is een nieuw teamdoel.'
  );
  return new;
end;
$$;
revoke all on function public.meld_teamdoel() from public, anon, authenticated;

drop trigger if exists team_goals_systeembericht on public.team_goals;
create trigger team_goals_systeembericht
  after insert on public.team_goals
  for each row execute function public.meld_teamdoel();
