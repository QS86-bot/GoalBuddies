-- 0177_een_goedgekeurde_verschuiving_zet_de_straf_terug.sql — een straf bleef verschuldigd terwijl zijn deadline weer in de toekomst lag (QS8-308)
--
-- ROLLBACK-PAD:
--   `create or replace` op `beslis_deadline_verzoek()` zonder het terugzetblok
--   (definitie in 0171) en op `noteer_commitment()` zonder de `reverted`-tak
--   (definitie in 0153), plus:
--     alter table commitment_events drop constraint commitment_events_type_valid;
--     alter table commitment_events add constraint commitment_events_type_valid
--       check (event_type in ('created','confirmed','edited','triggered',
--                             'posted','resolved','cancelled'));
--   ⚠️ Die laatste faalt zolang er `reverted`-rijen staan, en dat hoort zo: het
--   auditspoor is append-only (domeinregel 6). Wie echt terug wil, verwijdert
--   die rijen bewust en niet per ongeluk.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Nawerk van QS8-307. Migratie 0174 houdt een straf tegen zolang er een open
-- deadline-verzoek staat, met een grens van een week op dat uitstel. Die grens
-- laat één toestand over:
--
--   1. Alice vraagt een verschuiving aan.
--   2. Niemand antwoordt. Na zeven dagen houdt het verzoek de straf niet meer
--      tegen; de rollover zet hem op `due`.
--   3. Op dag negen keurt de buddy het verzoek alsnog goed en `target_date`
--      schuift naar de toekomst.
--
-- De straf staat dan op `due` terwijl zijn deadline niet meer verstreken is.
-- ⚠️ **Dat botst rechtstreeks met domeinregel 11:** *een straf treedt alleen in
--    werking bij een verstreken deadline.* En met domeinregel 5, want de
--    gebruiker draagt dan een consequentie waarvan de voorwaarde niet meer
--    geldt.
--
-- ---------------------------------------------------------------------------
-- Waarom terugzetten en niet de goedkeuring weigeren
-- ---------------------------------------------------------------------------
--
-- De andere kant is overwogen: `beslis_deadline_verzoek()` had ook kunnen
-- weigeren zodra de straf al `due` staat. Dat is afgewezen omdat het de
-- eigenaar laat betalen voor de traagheid van zijn buddy — precies wat 0171 bij
-- de verlooptak níet wilde. Het akkoord van een buddy is bovendien exact de
-- rem die A7 voorschrijft; wie die rem haalt, hoort geen straf over te houden
-- aan het feit dat er een week overheen ging.
--
-- ⚠️ **Dit is geen uitkoopknop.** De eigenaar kan het niet alleen: er moet een
--    ander actief lid ja zeggen (0175), de gevraagde datum moet nog in de
--    toekomst liggen (0171), en er mag hooguit één open verzoek per doel staan
--    (`deadline_requests_een_open_per_doel`, 0032).
--
-- ---------------------------------------------------------------------------
-- De melding die al verstuurd is
-- ---------------------------------------------------------------------------
--
-- De getuige heeft gelezen dat de inzet verschuldigd werd. Er komt hier géén
-- tweede melding achteraan, en dat is een keuze:
--
--   - **Het beeld in de app corrigeert zichzelf.** `getuigenissen()` toont
--     alleen commitments met een status uit `commitment_zichtbaar_voor_persoon()`
--     — gemeten: `{due, resolved}`. Zodra de straf terug op `set` staat,
--     verdwijnt hij uit het blok van de getuige. Wat er stond klopt dan niet
--     meer en staat er ook niet meer.
--   - **Een tweede push is een tweede duw.** Domeinregel 5 zegt dat een
--     consequentie nooit stilzwijgend aangaat; hij zegt niet dat elke
--     correctie een melding verdient. Een bericht "toch niet verschuldigd" gaat
--     bovendien over de tegenslag van een ánder, en dat is precies het
--     oppervlak waar domeinregel 7 om vraagt terughoudend te zijn.
--   - **En het zou een migratie op een tweede allowlist vragen:**
--     `notifications_sent.kind` kent vier waarden. Een vijfde soort is een
--     eigen besluit en geen bijvangst van deze reparatie.
--
-- ⚠️ Wie hier ooit anders over beslist, leest eerst
--    `docs/decisions/2026-09-07-een-straf-die-terugkomt.md`.
--
-- ---------------------------------------------------------------------------
-- Het auditspoor, en de naad die daarin zat
-- ---------------------------------------------------------------------------
--
-- `noteer_commitment()` (trigger `commitments_audit`) schrijft bij elke
-- statuswijziging een rij, en zijn `case` viel voor alles wat geen `cancelled`
-- of `resolved` is terug op `'triggered'` — met de commentaarregel "unlocked en
-- due" erbij. Een terugzet van `due` naar `set` zou daar dus als **triggered**
-- in het spoor belanden: het tegenovergestelde van wat er gebeurde, in precies
-- de tabel die het moet vastleggen.
--
-- ⚠️ **Dat is regel 18 vraag 1 in het klein.** De trigger is correct voor de
--    overgangen die hij kende, en de nieuwe overgang is correct; de naad
--    ertussen is een `else` die alles opvangt. Vandaar `reverted` in de
--    allowlist én in de `case`, en een test die het spoor naleest in plaats van
--    alleen de kolom.
--
-- ---------------------------------------------------------------------------

alter table commitment_events drop constraint if exists commitment_events_type_valid;

alter table commitment_events
  add constraint commitment_events_type_valid
  check (event_type in ('created', 'confirmed', 'edited', 'triggered',
                        'posted', 'resolved', 'cancelled', 'reverted'));

create or replace function noteer_commitment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_soort      text;
  v_doelstatus text;
  v_actor      uuid;
begin
  if tg_op = 'INSERT' then
    v_soort := 'confirmed';
  elsif old.status is distinct from new.status then
    v_soort := case
                 when new.status = 'cancelled' then 'cancelled'
                 when new.status = 'resolved'  then 'resolved'
                 -- ⚠️ **Vóór de `else`, want die vangt alles op** (QS8-308).
                 --    Een straf die van `due` terugkomt naar `set` is het
                 --    tegenovergestelde van triggeren, en zonder deze regel
                 --    stond dat als `triggered` in het spoor.
                 when old.status = 'due' and new.status = 'set' then 'reverted'
                 else 'triggered'          -- unlocked en due
               end;
  else
    -- Alleen de tekst veranderd, of de begunstigde die verdween.
    v_soort := 'edited';
  end if;

  select g.status into v_doelstatus from goals g where g.id = new.goal_id;

  -- ⚠️ **Een actor die niet meer bestaat, is `null` en niet een foutmelding.**
  --    Tijdens het verwijderen van een account is `auth.uid()` een profiel dat
  --    er al niet meer is, en de foreign key weigert dan de spoorregel —
  --    waarmee de hele accountverwijdering omvalt.
  select case when exists (select 1 from profiles p where p.id = auth.uid())
              then auth.uid()
         end
    into v_actor;

  insert into commitment_events (commitment_id, actor_id, event_type, payload)
  values (
    new.id,
    v_actor,
    v_soort,
    jsonb_build_object(
      'type',       new.type,
      'van',        case when tg_op = 'INSERT' then null else old.status end,
      'naar',       new.status,
      'doelstatus', v_doelstatus
    )
  );

  return new;
end;
$$;

create or replace function beslis_deadline_verzoek(
  p_request_id uuid,
  p_akkoord boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        deadline_requests%rowtype;
  g        goals%rowtype;
  schoon   text := nullif(btrim(coalesce(p_note, '')), '');
  teruggezet integer := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into r from deadline_requests where id = p_request_id;

  if r.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if r.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'already_decided');
  end if;

  if r.requester_id = auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_yourself');
  end if;

  if not exists (
    select 1 from group_members m
    where m.group_id = r.group_id and m.user_id = auth.uid() and m.status <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  if schoon is not null and char_length(schoon) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;

  -- ⚠️ **Alleen bij een akkoord, en alleen als de gevraagde datum al voorbij
  --    is.** Afwijzen mag altijd — dat verschuift niets en laat niets afgaan.
  --    De grens is `eigenaarsdatum(r.requester_id)`: de dag van de aanvrager en
  --    niet die van de goedkeurder.
  --
  -- ⚠️ Vóór de `update` op `deadline_requests`, zodat het verzoek `open` blijft
  --    in plaats van als beslist weggeschreven te worden.
  if p_akkoord and r.new_date < eigenaarsdatum(r.requester_id) then
    return jsonb_build_object('ok', false, 'reason', 'verzoek_verlopen');
  end if;

  update deadline_requests
  set status        = case when p_akkoord then 'approved' else 'rejected' end,
      decided_by    = auth.uid(),
      decided_at    = now(),
      decision_note = schoon
  where id = r.id;

  if not p_akkoord then
    return jsonb_build_object('ok', true, 'moved', false);
  end if;

  select * into g from goals where id = r.goal_id;

  update goals set target_date = r.new_date where id = r.goal_id;

  -- ⚠️ **De straf komt terug van `due` naar `set`** (QS8-308). Domeinregel 11:
  --    een straf treedt alleen in werking bij een verstreken deadline, en die
  --    is dat na deze verschuiving niet meer. Zonder dit blok blijft hij
  --    verschuldigd terwijl zijn voorwaarde vervallen is.
  --
  -- ⚠️ **Alleen `penalty` en alleen vanaf `due`.** Een `resolved` of
  --    `cancelled` straf is afgehandeld en komt nooit terug; een beloning heeft
  --    met de streefdatum niets te maken.
  --
  -- ⚠️ **En alleen als de nieuwe datum écht in de toekomst ligt**, gemeten aan
  --    de dag van de eigenaar. De verlooptak hierboven dekt dat al, maar deze
  --    voorwaarde staat er zodat het blok op zichzelf klopt: hij zet niets
  --    terug waarvan de reden nog geldt.
  --
  -- ⚠️ `commitments_update` heeft `using (status = 'set' …)`, dus vanaf `due` is
  --    deze kolom voor geen enkele client te verzetten. Dat dit hier kan, komt
  --    doordat deze functie `security definer` is — en dat is precies waarom
  --    het auditspoor eronder niet optioneel is (domeinregel 6). De trigger
  --    `commitments_audit` schrijft de `reverted`-rij; sinds deze migratie
  --    heet die overgang ook zo in plaats van `triggered`.
  if r.new_date >= eigenaarsdatum(r.requester_id) then
    update commitments c
       set status = 'set'
     where c.goal_id = r.goal_id
       and c.type = 'penalty'
       and c.status = 'due';

    get diagnostics teruggezet = row_count;
  end if;

  -- ⚠️ De goedkeurder staat sinds 0085 in `approved_by_id` en niet meer in
  --    `new_value`: een uuid in jsonb heeft geen foreign key en overleeft dus
  --    het verwijderen van dat account.
  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value, approved_by_id)
  values (r.goal_id, r.requester_id, 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', r.new_date, 'request_id', r.id,
                             'straffen_teruggezet', teruggezet),
          auth.uid());

  return jsonb_build_object('ok', true, 'moved', true, 'straffen_teruggezet', teruggezet);
end;
$$;

revoke all on function beslis_deadline_verzoek(uuid, boolean, text) from public, anon, authenticated;
grant execute on function beslis_deadline_verzoek(uuid, boolean, text) to authenticated;
