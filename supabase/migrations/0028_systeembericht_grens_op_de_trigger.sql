-- 0028_systeembericht_grens_op_de_trigger.sql — de vangnetgrens één laag naar buiten
--
-- ROLLBACK-PAD:
--   -- de zes meld_*-functies uit 0025_systeemberichten.sql opnieuw uitvoeren
--
-- ⚠️ Bevinding van de security-review op EPIC 7, en het is de valkuil van 0022 in
--    een nieuwe jas. 0025 belooft in zijn kop: "elke insert staat in een eigen
--    exception-blok, dus de voltooiing of de goedkeuring blijft staan". Dat was
--    waar voor de ínsert — die zit in `plaats_systeembericht()` — maar niet voor
--    de rest van het aankondigingspad. De opzoek-`select`s in de zes
--    `meld_*`-functies en de `for`-lus in
--    `plaats_systeembericht_in_doelgroepen()` stonden erbuiten.
--
--    Vandaag onschadelijk: `select ... into` zonder `strict` gooit niet bij nul
--    rijen. Maar de garantie hing daarmee aan een eigenschap van één PL/pgSQL-vorm,
--    niet aan de structuur. Voegt iemand later een join toe, zet hij `strict` erbij,
--    of verandert een van de aangeroepen functies, dan rolt de hele transactie
--    terug — inclusief de voltooiing, de goedkeuring of de toetreding die de
--    aankondiging alleen maar wilde melden. Dat is precies het soort latente fout
--    dat dit project al twee keer heeft gehaald (0017 en 0022), en beide keren pas
--    door een test gevonden.
--
-- ⚠️ De juiste plek voor de grens is de trigger, want dat is de naad tussen de
--    handeling van de gebruiker en de aankondiging erover. Staat het vangnet daar,
--    dan kan niets wat iemand later ín het pad zet de handeling nog slopen. Het
--    blok in `plaats_systeembericht()` blijft staan als tweede laag; dat kost
--    niets en het houdt één mislukt bericht van de lus weg zonder de andere
--    groepen mee te nemen.
--
-- ⚠️ `return new` staat buiten het blok, zodat een AFTER-trigger ook op het
--    faalpad netjes terugkeert in plaats van NULL te geven.

create or replace function meld_nieuw_lid()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    -- De oprichter krijgt geen bericht: `create_group()` zet hem in dezelfde
    -- transactie als lid neer, en "Quinten doet mee" als eerste regel in een groep
    -- die Quinten zelf net gemaakt heeft, leest als een storing.
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
  exception
    when others then
      raise warning 'Systeembericht member_joined is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_nieuw_lid() from public, anon, authenticated;

create or replace function meld_voltooiing()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_goal_id uuid;
begin
  begin
    -- ⚠️ Alleen de eerste voltooiing van een weekdoel. `dien_opnieuw_in()` maakt na
    --    een "vertel me meer" een nieuwe rij (append-only, domeinregel 6). Twee keer
    --    "heeft een week afgerond" voor dezelfde week vertelt de hele groep dat de
    --    eerste poging een vraag opriep.
    if exists (
      select 1 from completions c
      where c.weekly_goal_id = new.weekly_goal_id and c.id <> new.id
    ) then
      return new;
    end if;

    select w.goal_id into v_goal_id from weekly_goals w where w.id = new.weekly_goal_id;
    if v_goal_id is null then return new; end if;

    -- Het niveau (vloer of plafond) staat er niet bij: vloer gehaald betekent dat de
    -- week telt (domeinregel 8), en het verschil zit alleen in de punten — privé.
    perform plaats_systeembericht_in_doelgroepen(
      v_goal_id,
      'completion_pending',
      weergavenaam(new.user_id) || ' heeft een week afgerond en wacht op bevestiging.'
    );
  exception
    when others then
      raise warning 'Systeembericht completion_pending is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_voltooiing() from public, anon, authenticated;

create or replace function meld_goedkeuring()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    -- ⚠️ Uitsluitend `approved`. Een "vertel me meer" is een vráág, en die hoort
    --    tussen de twee mensen die hem stellen en krijgen.
    if new.status <> 'approved' then return new; end if;

    perform plaats_systeembericht(
      new.group_id,
      'completion_approved',
      weergavenaam(new.approver_id) || ' bevestigde de week van '
        || weergavenaam(new.subject_id) || '.'
    );
  exception
    when others then
      raise warning 'Systeembericht completion_approved is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_goedkeuring() from public, anon, authenticated;

create or replace function meld_mijlpaal()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  begin
    -- ⚠️ Alleen de overgang naar `done`. `dropped` is een tegenslagsignaal over
    --    iemand anders en komt de groep niet in.
    if new.status <> 'done' or old.status = 'done' then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.goal_id,
      'milestone_done',
      weergavenaam(v_owner_id) || ' heeft een mijlpaal gehaald.'
    );
  exception
    when others then
      raise warning 'Systeembericht milestone_done is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_mijlpaal() from public, anon, authenticated;

create or replace function meld_doel_af()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  begin
    -- ⚠️ Een expliciete gelijkheid op `completed` en geen `<> 'active'`: dat laatste
    --    laat er twee door zodra iemand een status toevoegt. `missed` en `archived`
    --    krijgt de groep nooit te zien.
    if new.status <> 'completed' or old.status = 'completed' then return new; end if;

    perform plaats_systeembericht_in_doelgroepen(
      new.id,
      'goal_completed',
      weergavenaam(new.owner_id) || ' heeft een doel afgerond.'
    );
  exception
    when others then
      raise warning 'Systeembericht goal_completed is niet geplaatst: %', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_doel_af() from public, anon, authenticated;

create or replace function meld_commitment()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
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
      -- ⚠️ De enige uitzondering op domeinregel 7 in de hele app, en alleen omdat de
      --    gebruiker de straf zelf heeft ingesteld en bevestigd (`confirmed_at` is
      --    NOT NULL). Alleen naar de begunstigde groep, want alleen die heeft vanaf
      --    `due` leesrecht op het commitment (domeinregel 11).
      perform plaats_systeembericht(
        new.beneficiary_group_id,
        'commitment_due',
        'De inzet die ' || weergavenaam(v_owner_id)
          || ' zelf heeft ingesteld, is verschuldigd geworden.'
      );
    end if;
  exception
    when others then
      raise warning 'Systeembericht voor commitment % is niet geplaatst: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function meld_commitment() from public, anon, authenticated;
