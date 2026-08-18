-- 0031_account_verwijderen.sql — Q-TODO A3
--
-- ROLLBACK-PAD:
--   drop function if exists verwijder_mijn_account();
--   alter table groups                alter column created_by set not null;
--   alter table completion_approvals  alter column approver_id set not null;
--   alter table commitment_events     alter column actor_id    set not null;
--   -- en de zeven foreign keys terug naar hun oude vorm (zonder on delete):
--   --   groups_created_by_fkey, completions_user_id_fkey,
--   --   completion_approvals_approver_id_fkey, completion_approvals_subject_id_fkey,
--   --   completion_approvals_group_id_fkey, goal_events_actor_id_fkey,
--   --   commitment_events_actor_id_fkey, chat_messages_sender_id_fkey
--   alter table chat_messages drop constraint chat_messages_sender_required;
--   alter table chat_messages add constraint chat_messages_sender_required
--     check (type = 'system' or sender_id is not null);
--
-- Besluit van Quinten (Q-TODO A3, 18-08-2026):
--   "Cascade voor je eigen data, maar anonimiseren bij goedkeuringen."
--
-- ⚠️ Dit was geen nette wens maar een kapot pad: een account verwijderen faalde
--    volledig. Zeven kolommen wijzen naar `profiles` zonder `on delete`, dus de
--    eerste de beste voltooiing blokkeerde de verwijdering en de Auth-API meldde
--    alleen "Database error deleting user". Het staat sinds QS8-98 in
--    `tests/rls/harness.ts` beschreven, waar de opruimfunctie de verwijzende
--    rijen met de hand wegveegt — dat is de werkomweg, dit is de reparatie.
--
-- ⚠️ De scheidslijn is niet "van wie is de rij" maar "voor wie is de rij
--    bewijs". Een goedkeuring die jij aan een ander gaf, is bewijs voor die
--    ander: verdwijnt hij als jij vertrekt, dan verliest je buddy met
--    terugwerkende kracht een bevestigde week. Daarom blijft de rij staan en
--    verdwijnt alleen jouw naam eruit.
--
-- ⚠️ Chatberichten zijn hier bij de goedkeuringen ingedeeld, en dat is een keuze
--    waarover geen besluit lag. Een gesprek van drie mensen is ook van de andere
--    twee, en reacties eronder verwijzen ernaar; cascade laat gaten vallen in de
--    geschiedenis van mensen die niets verwijderd hebben. Zeg het als je het
--    anders wilt — dan is het één regel.
--
-- ⚠️ Anonimiseren gebeurt met `set null` en niet met een grafsteen-profiel.
--    `profiles.id` hangt met cascade aan `auth.users`, dus een profiel
--    "Verwijderd lid" vraagt een echte rij in `auth.users` — een systeemrij in
--    het schema van GoTrue, die geen enkele migratie hoort te bezitten. Een lege
--    verwijzing is eerlijker: er is geen persoon meer.

-- ---------------------------------------------------------------------------
-- 1. Eigen data verdwijnt mee
-- ---------------------------------------------------------------------------
--
-- Deze twee stonden zonder `on delete` en blokkeerden daarmee de verwijdering.
-- Ze horen bij jou: je voltooiingen, en de goedkeuringen die over jouw weken
-- gaan. Dat de goedkeuring van een ander daarmee ook weggaat is juist: hij was
-- bewijs over jou, en jij bent er niet meer.

alter table completions
  drop constraint if exists completions_user_id_fkey;
alter table completions
  add constraint completions_user_id_fkey
  foreign key (user_id) references profiles (id) on delete cascade;

alter table completion_approvals
  drop constraint if exists completion_approvals_subject_id_fkey;
alter table completion_approvals
  add constraint completion_approvals_subject_id_fkey
  foreign key (subject_id) references profiles (id) on delete cascade;

-- ⚠️ `goal_events` sterft in de praktijk al met het doel (`goal_id` cascadeert,
--    en de INSERT-policy staat alleen de eigenaar toe, dus de acteur is altijd
--    de eigenaar). De ontbrekende `on delete` maakte de verwijdering desondanks
--    afhankelijk van de volgorde waarin Postgres de cascades uitvoert. Nu niet
--    meer.
alter table goal_events
  drop constraint if exists goal_events_actor_id_fkey;
alter table goal_events
  add constraint goal_events_actor_id_fkey
  foreign key (actor_id) references profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Wat bewijs is voor iemand anders, blijft staan zonder jouw naam
-- ---------------------------------------------------------------------------

alter table completion_approvals
  alter column approver_id drop not null;
alter table completion_approvals
  drop constraint if exists completion_approvals_approver_id_fkey;
alter table completion_approvals
  add constraint completion_approvals_approver_id_fkey
  foreign key (approver_id) references profiles (id) on delete set null;

comment on column completion_approvals.approver_id is
  'NULL betekent: de beoordelaar heeft zijn account verwijderd. De goedkeuring '
  'blijft geldig — hij was bewijs voor de ander (Q-TODO A3).';

-- ⚠️ De CHECK `approver_id <> subject_id` blijft ongemoeid: `null <> x` is null
--    en een CHECK faalt alleen op `false`. Zelfgoedkeuring blijft dus verboden
--    en een geanonimiseerde rij blijft toegestaan.

alter table chat_messages
  drop constraint if exists chat_messages_sender_id_fkey;
alter table chat_messages
  add constraint chat_messages_sender_id_fkey
  foreign key (sender_id) references profiles (id) on delete set null;

-- ⚠️ Deze CHECK was de reden dat `set null` op een chatbericht niet kón: hij
--    eiste een afzender voor alles wat geen systeembericht is. Het onderscheid
--    dat hij bewaakte — een gewoon bericht mag zich niet voordoen als
--    systeembericht — zit al in `type` en in de allowlist op `system_event`, en
--    `stamp_chat_message()` zet `type` bij een UPDATE terug. Wat overblijft is de
--    lezing: afzender leeg én type niet 'system' betekent "verwijderd lid".
alter table chat_messages
  drop constraint if exists chat_messages_sender_required;
alter table chat_messages
  add constraint chat_messages_sender_required
  check (type <> 'system' or sender_id is null);

comment on column chat_messages.sender_id is
  'NULL bij een systeembericht (type = system), en bij een gewoon bericht van '
  'iemand die zijn account verwijderd heeft. De app toont dat laatste als '
  'Verwijderd lid (Q-TODO A3).';

alter table commitment_events
  alter column actor_id drop not null;
alter table commitment_events
  drop constraint if exists commitment_events_actor_id_fkey;
alter table commitment_events
  add constraint commitment_events_actor_id_fkey
  foreign key (actor_id) references profiles (id) on delete set null;

-- ⚠️ De oprichter mag vertrekken zonder de groep mee te nemen. `created_by` was
--    NOT NULL en zonder `on delete`, dus één vertrekkende oprichter blokkeerde
--    zijn eigen verwijdering én hield een groep gegijzeld waar anderen in zitten.
alter table groups
  alter column created_by drop not null;
alter table groups
  drop constraint if exists groups_created_by_fkey;
alter table groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. Een groep verwijderen liep vast op dezelfde soort verwijzing
-- ---------------------------------------------------------------------------
--
-- ⚠️ Buiten de scope van A3 gevonden en toch hier gerepareerd, want het is
--    hetzelfde defect en het staat in de weg: `groups_delete` staat een
--    beheerder toe de groep te verwijderen, maar `completion_approvals.group_id`
--    wees zonder `on delete` naar `groups`. Eén goedgekeurde week in die groep en
--    de knop gaf een foreign-key-fout.

alter table completion_approvals
  drop constraint if exists completion_approvals_group_id_fkey;
alter table completion_approvals
  add constraint completion_approvals_group_id_fkey
  foreign key (group_id) references groups (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 4. De knop zelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ Verwijdert de rij in `auth.users`; al het bovenstaande volgt daaruit via de
--    cascades. Daarmee verdwijnt het e-mailadres, het wachtwoord en elke
--    gekoppelde identiteit — dat is wat de AVG vraagt. Wat blijft is
--    pseudonieme geschiedenis zonder naam.
--
-- ⚠️ Onomkeerbaar en zonder bevestigingsstap in de database. De bevestiging
--    hoort in het scherm te staan, want alleen daar weet je of de gebruiker
--    begrepen heeft wat hij weggooit.
--
-- ⚠️ Geeft `{ok, reason}` terug in plaats van te gooien, zoals elke RPC in dit
--    project sinds 0017.

create or replace function verwijder_mijn_account()
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  mij uuid := auth.uid();
begin
  if mij is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- ⚠️ Laatste beheerder van een groep met andere leden? Dan eerst het
  --    beheerderschap overdragen. Zonder deze regel blijft er een groep achter
  --    die niemand meer kan beheren: de code niet roteren, geen lid uitzetten,
  --    de groep niet opheffen. Dat is geen verwijdering maar een wrak.
  if exists (
    select 1
    from group_members mijn
    where mijn.user_id = mij
      and mijn.role    = 'admin'
      and mijn.status <> 'inactive'
      and exists (
        select 1 from group_members ander
        where ander.group_id = mijn.group_id
          and ander.user_id <> mij
          and ander.status <> 'inactive'
      )
      and not exists (
        select 1 from group_members mede
        where mede.group_id = mijn.group_id
          and mede.user_id <> mij
          and mede.role     = 'admin'
          and mede.status  <> 'inactive'
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'last_admin');
  end if;

  delete from auth.users where id = mij;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function verwijder_mijn_account() is
  'Verwijdert het account van de aanroeper (AVG, Q-TODO A3). Eigen data '
  'cascadeert; goedkeuringen die je aan anderen gaf en je chatberichten blijven '
  'staan zonder naam. Weigert zolang je de laatste beheerder van een bewoonde '
  'groep bent.';

revoke all on function verwijder_mijn_account() from public, anon;
grant execute on function verwijder_mijn_account() to authenticated;
