-- 0006_close_rls_gaps.sql — de zeven gaten uit de security-review van QS8-98
--
-- Alle zeven zijn met een test bevestigd, niet beredeneerd. De tests staan in
-- tests/rls/policies.test.ts als `it.fails` en slaan om zodra deze migratie
-- gedraaid is: ze gaan dan zelf klagen, zodat de markering weg móét.
--
-- ROLLBACK-PAD:
--   drop trigger if exists group_members_guard on group_members;
--   drop trigger if exists chat_messages_stamp on chat_messages;
--   drop trigger if exists completions_pin_cycle on completions;
--   drop function if exists guard_group_member_update, stamp_chat_message,
--     pin_completion_cycle;
--   -- en de vier policies opnieuw uitvoeren zoals ze in 0003_rls.sql staan
--
-- ⚠️ `npm run db:dump` vóór het draaien. Deze migratie raakt geen data, maar de
--    gratis tier heeft geen backups en de regel kent geen uitzonderingen.
--
-- ⚠️ Eén rode draad door alles hieronder: **een policy kan geen kolommen
--    beperken.** RLS beslist over rijen, niet over velden. Overal waar de eis is
--    "deze kolom mag je niet veranderen", is een trigger nodig — de policy alleen
--    is dan altijd te weinig. Dat is de fout die in 0003 vier keer gemaakt is.

-- ---------------------------------------------------------------------------
-- 1. group_members — een lid kan zichzelf geen admin maken
-- ---------------------------------------------------------------------------
--
-- `group_members_update` had geen `with check`. Postgres gebruikt dan de
-- `using`-expressie óók als check, en die eist alleen `user_id = auth.uid()`.
-- De kolom `role` stond nergens vast: wie via een geldige uitnodigingscode
-- binnenkwam, maakte zichzelf met één update admin — en kon daarna via
-- `groups_delete` de hele groep met alle geschiedenis wissen.

create or replace function guard_group_member_update()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  -- Systeemcontext (service_role, Edge Functions): auth.uid() is dan null en er
  -- is geen gebruiker om tegen te toetsen. Die route loopt niet via de client.
  if auth.uid() is null then
    return new;
  end if;

  -- ⚠️ SECURITY DEFINER is hier noodzakelijk: deze lookup draait op dezelfde
  --    tabel als waar de trigger op staat, en zou onder RLS in recursie lopen.
  --    De functie geeft niets terug en beslist alleen over de nieuwe rij.
  if exists (
    select 1 from group_members m
    where m.group_id = old.group_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  ) then
    -- Een admin mag rollen en status beheren, maar nog steeds niet iemand naar
    -- een andere groep verplaatsen: lidmaatschap loopt uitsluitend via de code.
    new.group_id := old.group_id;
    new.user_id  := old.user_id;
    return new;
  end if;

  -- Een gewoon lid mag precies één ding: zijn eigen status zetten (actief,
  -- inactief, gepauzeerd). Al het andere gaat terug naar de oude waarde.
  new.role      := old.role;
  new.group_id  := old.group_id;
  new.user_id   := old.user_id;
  new.joined_at := old.joined_at;

  return new;
end;
$$;

comment on function guard_group_member_update() is
  'RLS kan geen kolommen beperken. Deze trigger doet dat wel: rol en groep liggen '
  'vast voor niet-admins, lidmaatschap loopt alleen via join_group_with_code.';

drop trigger if exists group_members_guard on group_members;
create trigger group_members_guard
  before update on group_members
  for each row execute function guard_group_member_update();

-- De policy krijgt alsnog een expliciete `with check`. De trigger is het slot;
-- dit maakt de bedoeling leesbaar in plaats van impliciet.
drop policy if exists group_members_update on group_members;
create policy group_members_update on group_members for update to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from group_members m
      where m.group_id = group_members.group_id
        and m.user_id = auth.uid() and m.role = 'admin'
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from group_members m
      where m.group_id = group_members.group_id
        and m.user_id = auth.uid() and m.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. chat_messages — geen vals systeembericht, geen verhuizing
-- ---------------------------------------------------------------------------
--
-- De INSERT-policy blokkeerde `type = 'system'`, de UPDATE-policy niet. Een lid
-- plaatste dus een gewoon bericht en werkte het bij naar een systeembericht.
-- Systeemberichten zijn het kanaal dat de groep vertrouwt; dit was de directe
-- route om domeinregel 7 van buitenaf te breken.

drop policy if exists chat_messages_update on chat_messages;
create policy chat_messages_update on chat_messages for update to authenticated
  using (
    sender_id = auth.uid()
    and created_at > now() - interval '15 minutes'
  )
  with check (
    sender_id = auth.uid()
    -- Zonder deze regel is het bericht naar een willekeurige groep te verplaatsen.
    and is_group_member(group_id)
    -- En zonder deze is het om te toveren tot systeembericht.
    and type <> 'system'
  );

-- `created_at` was client-instelbaar bij INSERT. Een bericht met een datum in de
-- toekomst bleef daarmee voor altijd bewerkbaar: het venster van 15 minuten was
-- geen venster. De tijd hoort van de server te komen, altijd.
create or replace function stamp_chat_message()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists chat_messages_stamp on chat_messages;
create trigger chat_messages_stamp
  before insert on chat_messages
  for each row execute function stamp_chat_message();

-- ---------------------------------------------------------------------------
-- 3. commitments — een straf begint altijd op 'set'
-- ---------------------------------------------------------------------------
--
-- `commitments_insert` controleerde alleen doeleigenaarschap. Niet de status, en
-- niet of je lid bent van de begunstigde groep. Een straf was dus direct als
-- `due` aan te maken, waarna een willekeurige groep meteen leesrecht kreeg op de
-- tekst — frontale schending van domeinregel 11.

drop policy if exists commitments_insert on commitments;
create policy commitments_insert on commitments for insert to authenticated
  with check (
    exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
    -- Een commitment begint altijd ongeactiveerd. Naar 'due' gaan doet de
    -- rollover-job bij een verstreken deadline, nooit de client.
    and status = 'set'
    -- Je kunt alleen een groep aanwijzen waar je zelf in zit. Anders is dit een
    -- kanaal om tekst in een vreemde groep te plaatsen.
    and (beneficiary_group_id is null or is_group_member(beneficiary_group_id))
  );

-- ---------------------------------------------------------------------------
-- 4. daily_moves — geen dagzet onder andermans weekdoel
-- ---------------------------------------------------------------------------
--
-- `daily_moves_write` checkte alleen `user_id = auth.uid()`, niet van wie
-- `weekly_goal_id` was. Iemand kon dus tekst in de doeldraad van een ander
-- plaatsen — en met domeinregel 7 in het achterhoofd is dat precies het
-- mechanisme om een groepsgenoot publiek af te vallen.

drop policy if exists daily_moves_write on daily_moves;
create policy daily_moves_write on daily_moves for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      weekly_goal_id is null
      or exists (
        select 1 from weekly_goals w
        join goals g on g.id = w.goal_id
        where w.id = daily_moves.weekly_goal_id and g.owner_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. completions — de cyclus komt van het weekdoel, niet van de client
-- ---------------------------------------------------------------------------
--
-- `cycle_start_date` was client-gekozen en werd nergens getoetst. Een gebruiker
-- kon een voltooiing indienen met een datum van drie weken terug om een gemiste
-- week alsnog te claimen, of van volgende week om vooruit te scoren.
--
-- ⚠️ Dit hoort een trigger te zijn en geen CHECK: een CHECK mag geen subquery
--    doen, en de juiste waarde staat in een andere tabel.

create or replace function pin_completion_cycle()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  juiste date;
begin
  select w.cycle_start_date into juiste
  from weekly_goals w
  where w.id = new.weekly_goal_id;

  if juiste is null then
    raise exception 'Weekdoel % bestaat niet', new.weekly_goal_id;
  end if;

  -- Niet weigeren maar overschrijven. De client heeft hier niets te kiezen, en
  -- een foutmelding zou suggereren dat er iets te kiezen viel.
  new.cycle_start_date := juiste;

  return new;
end;
$$;

comment on function pin_completion_cycle() is
  'De cyclus van een voltooiing komt uit het weekdoel. Voorkomt backdating van '
  'een gemiste week en vooruitscoren op een week die nog niet begonnen is.';

drop trigger if exists completions_pin_cycle on completions;
create trigger completions_pin_cycle
  before insert on completions
  for each row execute function pin_completion_cycle();
