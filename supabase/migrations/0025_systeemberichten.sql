-- 0025_systeemberichten.sql — QS8-70, de groep hoort het goede nieuws
--
-- ROLLBACK-PAD:
--   drop trigger if exists group_members_systeembericht on group_members;
--   drop trigger if exists completions_systeembericht on completions;
--   drop trigger if exists completion_approvals_systeembericht on completion_approvals;
--   drop trigger if exists milestones_systeembericht on milestones;
--   drop trigger if exists goals_systeembericht on goals;
--   drop trigger if exists commitments_systeembericht on commitments;
--   drop function if exists meld_nieuw_lid(), meld_voltooiing(), meld_goedkeuring(),
--     meld_mijlpaal(), meld_doel_af(), meld_commitment();
--   drop function if exists plaats_systeembericht(uuid, text, text),
--     plaats_systeembericht_in_doelgroepen(uuid, text, text), weergavenaam(uuid);
--   alter table chat_messages drop constraint if exists chat_messages_system_event_bekend;
--
-- ⚠️ Dit is de gevaarlijkste migratie van EPIC 7, want een systeembericht is het
--    kanaal dat de groep vertrouwt. Drie regels waar hij op gebouwd is:
--
--    1. **Alleen positieve gebeurtenissen** (domeinregel 7). Er is geen trigger
--       op een gemiste week, een verbroken reeks, een doorgeschoven weekdoel, een
--       laten vallen mijlpaal of een doel dat op `missed` of `archived` gaat. Dat
--       is geen omissie; het is de hele opdracht. Zie de allowlist hieronder.
--
--    2. **Geen titels, notities of aantallen in de tekst.** Een systeembericht
--       noemt de persoon en de gebeurtenis, nooit de doeltitel, de weektitel, de
--       mijlpaaltitel of het bewijs. De reden is de valkuil die dit project al
--       vier keer heeft gehaald: een bericht is een onveranderlijke kopie die de
--       autorisatie overleeft waaronder hij gemaakt is. Ontkoppelt iemand later
--       zijn doel van de groep — en dát is de manier waarop je toestemming
--       intrekt — dan verdwijnt de doeltitel uit `group_overview`, maar een
--       chatbericht met die titel erin blijft voor altijd staan. Het detail hoort
--       op het beoordeelscherm, waar RLS er nog bij is.
--
--    3. **Een systeembericht mag nooit de handeling laten mislukken.** Het is
--       een aankondiging, niet de gebeurtenis. Elke insert staat daarom in een
--       eigen exception-blok: dat rolt alleen zijn eigen werk terug, en de
--       voltooiing of de goedkeuring blijft staan. Zonder die grens kost een
--       kapot bericht iemand zijn week.
--
-- ⚠️ De naam wordt vastgelegd op het moment van schrijven en niet bij het lezen
--    opgezocht. Een chatlog hoort te zeggen wat er toen stond; dat een
--    naamswijziging oude regels niet herschrijft, is hier een eigenschap.

-- ---------------------------------------------------------------------------
-- 1. De allowlist — welke systeemgebeurtenissen mogen bestaan
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is het slot onder domeinregel 7 op de chat, en het is met opzet een
--    CHECK en geen afspraak. Wie een nieuw type systeembericht wil, moet een
--    migratie schrijven — en komt dan langs deze lijst en langs de vraag die
--    erboven staat: kan hieruit iemands gemiste week worden afgeleid?
--
--    `chain_milestone` staat er bewust níét bij. De Ketting bestaat nog niet
--    (QS8-80, EPIC 8) en niets schrijft `chain_links`. Hem hier alvast toelaten
--    zou de vraag wegnemen op het moment dat hij gesteld moet worden.
alter table chat_messages drop constraint if exists chat_messages_system_event_bekend;
alter table chat_messages add constraint chat_messages_system_event_bekend check (
  system_event is null
  or system_event in (
    'group_sleeping',       -- 5.9, migratie 0016
    'member_joined',
    'completion_pending',
    'completion_approved',
    'milestone_done',
    'goal_completed',
    'commitment_unlocked',
    'commitment_due'
  )
);

comment on column chat_messages.system_event is
  'Allowlist in chat_messages_system_event_bekend. Uitsluitend positieve '
  'gebeurtenissen (domeinregel 7); een nieuw type vraagt een migratie.';

-- ---------------------------------------------------------------------------
-- 2. Gereedschap
-- ---------------------------------------------------------------------------

/**
 * De weergavenaam van een gebruiker, of een neutrale terugval.
 *
 * ⚠️ SECURITY DEFINER omdat de triggers hieronder als het systeem draaien en
 *    `profiles_select` niet in de weg mag zitten. Niet aan een clientrol geven:
 *    dan is dit een functie die elke naam in de database opvraagt.
 */
create or replace function weergavenaam(p_user_id uuid)
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.display_name from profiles p where p.id = p_user_id),
    'Een buddy'
  );
$$;

revoke all on function weergavenaam(uuid) from public, anon, authenticated;

/**
 * Plaatst één systeembericht in één groep.
 *
 * ⚠️ Het exception-blok is de kern van regel 3 hierboven. Faalt de insert — de
 *    groep is net verwijderd, de allowlist kent het type niet, de tekst is leeg —
 *    dan verliest de gebruiker zijn aankondiging en niet zijn voltooiing. Geen
 *    lege catch: er gaat een `warning` de logs in (CLAUDE.md, coderegel 14).
 *
 * ⚠️ `type = 'system'` en `sender_id = null`. Dat is precies wat
 *    `chat_messages_insert` een client verbiedt (gat A5, gedicht in 0006 en
 *    0010), dus deze functie is SECURITY DEFINER en wordt aan geen enkele
 *    clientrol gegeven. Kon een lid dit aanroepen, dan is domeinregel 7 van
 *    buitenaf te breken met één RPC.
 */
create or replace function plaats_systeembericht(
  p_group_id uuid,
  p_event    text,
  p_body     text
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    insert into chat_messages (group_id, sender_id, type, system_event, body)
    values (p_group_id, null, 'system', p_event, p_body);
  exception
    when others then
      raise warning 'Systeembericht % voor groep % is niet geplaatst: %',
        p_event, p_group_id, sqlerrm;
  end;
end;
$$;

comment on function plaats_systeembericht(uuid, text, text) is
  'Eén systeembericht in één groep, en nooit ten koste van de handeling die het '
  'aankondigt. Alleen voor het systeem: geen enkele clientrol mag hem aanroepen.';

revoke all on function plaats_systeembericht(uuid, text, text)
  from public, anon, authenticated;

/**
 * Hetzelfde bericht in elke groep waar dit doel aan gekoppeld is.
 *
 * ⚠️ Koppelen ís de toestemming (QS8-54). Een doel dat aan niets gekoppeld is,
 *    levert nul berichten op — en dat is de reden dat deze functie over
 *    `goal_group_links` loopt en niet over de groepen van de eigenaar.
 */
create or replace function plaats_systeembericht_in_doelgroepen(
  p_goal_id uuid,
  p_event   text,
  p_body    text
)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select l.group_id from goal_group_links l where l.goal_id = p_goal_id loop
    perform plaats_systeembericht(r.group_id, p_event, p_body);
  end loop;
end;
$$;

revoke all on function plaats_systeembericht_in_doelgroepen(uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Nieuw lid
-- ---------------------------------------------------------------------------
--
-- ⚠️ De oprichter krijgt geen bericht. `create_group()` zet hem in dezelfde
--    transactie als lid neer, en "Quinten doet mee" als eerste regel in een groep
--    die Quinten zelf net gemaakt heeft, leest als een storing.
create or replace function meld_nieuw_lid()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from groups g where g.id = new.group_id and g.created_by = new.user_id
  ) then
    return new;
  end if;

  perform plaats_systeembericht(
    new.group_id,
    'member_joined',
    weergavenaam(new.user_id) || ' doet mee.'
  );

  return new;
end;
$$;

revoke all on function meld_nieuw_lid() from public, anon, authenticated;

drop trigger if exists group_members_systeembericht on group_members;
create trigger group_members_systeembericht
  after insert on group_members
  for each row execute function meld_nieuw_lid();

-- ---------------------------------------------------------------------------
-- 4. Een week wacht op bevestiging
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen de eerste voltooiing van een weekdoel. `dien_opnieuw_in()` maakt na
--    een "vertel me meer" een nieuwe rij (append-only, domeinregel 6). Zou elke
--    rij een bericht opleveren, dan staat er twee keer "heeft een week afgerond"
--    voor dezelfde week — en daaruit leest de hele groep dat de eerste poging een
--    vraag opriep. Dat is precies het schaamtemoment dat 7.6 verbiedt.
--
-- ⚠️ Het niveau (vloer of plafond) staat er niet bij. Vloer gehaald betekent dat
--    de week telt (domeinregel 8); het verschil zit alleen in de punten, en die
--    zijn privé (domeinregel 10).
create or replace function meld_voltooiing()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_goal_id uuid;
begin
  if exists (
    select 1 from completions c
    where c.weekly_goal_id = new.weekly_goal_id and c.id <> new.id
  ) then
    return new;
  end if;

  select w.goal_id into v_goal_id from weekly_goals w where w.id = new.weekly_goal_id;
  if v_goal_id is null then return new; end if;

  perform plaats_systeembericht_in_doelgroepen(
    v_goal_id,
    'completion_pending',
    weergavenaam(new.user_id) || ' heeft een week afgerond en wacht op bevestiging.'
  );

  return new;
end;
$$;

revoke all on function meld_voltooiing() from public, anon, authenticated;

drop trigger if exists completions_systeembericht on completions;
create trigger completions_systeembericht
  after insert on completions
  for each row execute function meld_voltooiing();

-- ---------------------------------------------------------------------------
-- 5. Een week is bevestigd
-- ---------------------------------------------------------------------------
--
-- ⚠️ Uitsluitend bij `approved`. Een "vertel me meer" is een vráág, en de vraag
--    hoort tussen de twee mensen die hem stellen en krijgen. Publiek gemaakt
--    wordt hij een openbare twijfel over andermans week, en dan stelt niemand
--    hem nog — waarmee de knop die EPIC 6 juist gelijkwaardig heeft gemaakt
--    weer duurder is dan wegkijken.
create or replace function meld_goedkeuring()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.status <> 'approved' then return new; end if;

  perform plaats_systeembericht(
    new.group_id,
    'completion_approved',
    weergavenaam(new.approver_id) || ' bevestigde de week van '
      || weergavenaam(new.subject_id) || '.'
  );

  return new;
end;
$$;

revoke all on function meld_goedkeuring() from public, anon, authenticated;

-- ⚠️ AFTER en niet BEFORE, en dat is hier een eis en geen smaak. `subject_id`
--    komt van de client met de eigen id van de beoordelaar erin; de
--    BEFORE-trigger `completion_approvals_subject` overschrijft hem met de echte
--    eigenaar. Een BEFORE-trigger zou dus "Tim bevestigde de week van Tim" in de
--    groep zetten.
drop trigger if exists completion_approvals_systeembericht on completion_approvals;
create trigger completion_approvals_systeembericht
  after insert on completion_approvals
  for each row execute function meld_goedkeuring();

-- ---------------------------------------------------------------------------
-- 6. Een mijlpaal gehaald
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen de overgang naar `done`. `dropped` is de derde stand van deze kolom
--    en dat is een tegenslagsignaal over iemand anders — precies wat
--    `goal_events.milestone_dropped` al lekt (Q-TODO A7) en waar hier geen
--    tweede route bij komt.
create or replace function meld_mijlpaal()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if new.status <> 'done' or old.status = 'done' then return new; end if;

  select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
  if v_owner_id is null then return new; end if;

  perform plaats_systeembericht_in_doelgroepen(
    new.goal_id,
    'milestone_done',
    weergavenaam(v_owner_id) || ' heeft een mijlpaal gehaald.'
  );

  return new;
end;
$$;

revoke all on function meld_mijlpaal() from public, anon, authenticated;

drop trigger if exists milestones_systeembericht on milestones;
create trigger milestones_systeembericht
  after update of status on milestones
  for each row execute function meld_mijlpaal();

-- ---------------------------------------------------------------------------
-- 7. Een doel afgerond
-- ---------------------------------------------------------------------------
--
-- ⚠️ Uitsluitend `completed`. `goals.status` kent ook `missed` en `archived`, en
--    dat zijn de twee die de groep nooit te zien krijgt. Een expliciete
--    gelijkheid en geen `<> 'active'`: dat laatste laat er twee door zodra
--    iemand een status toevoegt.
create or replace function meld_doel_af()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;

  perform plaats_systeembericht_in_doelgroepen(
    new.id,
    'goal_completed',
    weergavenaam(new.owner_id) || ' heeft een doel afgerond.'
  );

  return new;
end;
$$;

revoke all on function meld_doel_af() from public, anon, authenticated;

drop trigger if exists goals_systeembericht on goals;
create trigger goals_systeembericht
  after update of status on goals
  for each row execute function meld_doel_af();

-- ---------------------------------------------------------------------------
-- 8. Commitments: beloning vrij, straf verschuldigd
-- ---------------------------------------------------------------------------
--
-- ⚠️ De straf is de enige uitzondering op domeinregel 7 in de hele app, en hij
--    staat er met naam: "de enige uitzondering is een straf die de gebruiker
--    zelf vooraf heeft ingesteld en bevestigd" (`confirmed_at` is NOT NULL, dus
--    dat is een schema-eigenschap). Domeinregel 11 zegt daarbij wanneer:
--    uitsluitend bij een verstreken deadline, nooit bij een gemiste week — en
--    dat is precies wat `status = 'due'` betekent.
--
-- ⚠️ De straf gaat alleen naar de begunstigde groep en niet naar elke groep waar
--    het doel aan hangt. `commitments_select` geeft leesrecht aan die ene groep
--    vanaf `unlocked`/`due`/`resolved`; een bericht in een andere groep zou
--    verder gaan dan de policy.
--
-- ⚠️ De tekst noemt de afspraak niet en beschuldigt niemand. Wat er staat is dat
--    er iets in werking is getreden dat de gebruiker zelf heeft ingesteld.
--
-- ⚠️ EPIC 9 bestaat nog niet: niets zet vandaag een commitment op `unlocked` of
--    `due`. Deze trigger staat er omdat de kolom en de statussen er wél al zijn,
--    en omdat de vraag "mag dit de groep in" nú het goedkoopst te beantwoorden
--    is — niet als EPIC 9 onder tijdsdruk staat.
create or replace function meld_commitment()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if old.status = new.status then return new; end if;

  select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
  if v_owner_id is null then return new; end if;

  if new.type = 'reward' and new.status = 'unlocked' then
    perform plaats_systeembericht_in_doelgroepen(
      new.goal_id,
      'commitment_unlocked',
      weergavenaam(v_owner_id) || ' heeft een beloning vrijgespeeld.'
    );
  elsif new.type = 'penalty'
    and new.status = 'due'
    and new.beneficiary_group_id is not null
  then
    perform plaats_systeembericht(
      new.beneficiary_group_id,
      'commitment_due',
      'De inzet die ' || weergavenaam(v_owner_id)
        || ' zelf heeft ingesteld, is verschuldigd geworden.'
    );
  end if;

  return new;
end;
$$;

revoke all on function meld_commitment() from public, anon, authenticated;

drop trigger if exists commitments_systeembericht on commitments;
create trigger commitments_systeembericht
  after update of status on commitments
  for each row execute function meld_commitment();
