-- 0153_een_archief_is_leesbaar_en_omkeerbaar.sql — nazorg op 0092 (QS8-217).
--
-- ROLLBACK-PAD:
--   drop function if exists public.heropen_groep(uuid, boolean);
--   -- de tien SELECT-policies terug naar `is_group_member(...)`: voer de
--   -- betreffende `create policy`-blokken opnieuw uit uit 0016, 0037, 0045,
--   -- 0076, 0092 en 0102. `mag_groep_lezen()` mag daarna weg:
--   drop function if exists public.mag_groep_lezen(uuid);
--   drop function if exists public.archiefleesgat();
--   -- de CHECK terug zonder 'group_reopened':
--   alter table public.group_events drop constraint if exists group_events_type_valid;
--   alter table public.group_events add constraint group_events_type_valid
--     check (event_type in ('admin_transferred','group_archived','member_left',
--                           'visibility_changed','discoverable_changed',
--                           'join_request_decided','member_removed'));
--   -- en `archief_blijft_archief()` terug naar de vorm van 0092 (zonder de GUC).
--
--   ⚠️ Terugrollen kan alleen zolang geen enkele groep is heropend; een groep die
--      op `active` staat na een heropening ziet er daarna uit als een groep die
--      nooit gearchiveerd is geweest. De `group_events`-rij blijft wel staan.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 25-08, risico Laag, met open eind. 0092 zette de archieftoets in
-- `is_group_member()` omdat daar tien schrijfpolicies langslopen — tien losse
-- voorwaarden is tien kansen om er één te vergeten. Maar `groups_select` loopt
-- langs diezelfde functie, en dus zijn de chat, de weekafsluitingen en De Ketting
-- van een gearchiveerde groep voor niemand meer te openen.
--
-- Er werd niets gewist. Maar **"archief" belooft leesbaarheid die er niet is**,
-- en de bevestigingstekst zei dat daarom ook met zoveel woorden.
--
-- 📏 **Gemeten in `pg_policies` en niet geteld in de migratiebestanden:** zeventien
--    policies lopen langs `is_group_member()` — **elf SELECT** en zes die schrijven
--    (INSERT, UPDATE, en één ALL op `week_reviews`).
--
-- De splitsing is dus precies de splitsing die de dossierrij beschrijft: de
-- schrijfkant houdt `is_group_member()` ongewijzigd, de leeskant krijgt een eigen
-- functie. **De archieftoets blijft daarmee op één plek per richting staan**, en
-- dat is nog steeds het punt van 0092.
--
-- ---------------------------------------------------------------------------
-- Tien van de elf, en de elfde is de interessante
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`chain_links_select` gaat NIET open, en dat is domeinregel 7.**
--    Die policy draagt sinds 0037 een venster: van een ánder zie je alleen de
--    lopende periode, want daarin betekent een ontbrekende schakel "nog niet" en
--    nooit "gemist". In een gearchiveerde groep is élke periode afgesloten, dus
--    een ontbrekende schakel betekent daar altijd het tweede. De rij openzetten
--    zou precies het lek zijn dat 0037 dichtte, met "archief" als omweg.
--
--    Je eigen kettinggeschiedenis blijft leesbaar: de eerste tak van die policy
--    (`user_id = auth.uid()`) heeft geen lidmaatschapstoets en raakt dit niet.
--
-- ⚠️ **`weekly_goals_select` staat er niet tussen en gaat ook niet open.** Die
--    loopt langs `shares_group_with_goal()`, dat zijn eigen archieftoets heeft.
--    Dat is de zwaarste tabel van domeinregel 7 — hij draagt `missed`, `carried`
--    en `excused` — en "leesbaar archief" is geen reden om daar aan te komen.
--    Het gevolg is dat een gearchiveerde groep zijn chat en weekafsluitingen
--    toont maar niet de weekdoelen zelf. Dat is een gat in de belofte en het is
--    de veilige kant ervan; het staat als losse bevinding in
--    `docs/ENGINEER-REVIEW.md`.
--
-- De tien die wél opengaan dragen geen tegenslag over een ánder die er niet al
-- stond vóór het archiveren: de groep zelf, wie erin zat, welke doelen eraan
-- hingen, de chat (waarvan de systeemberichten al een allowlist hebben, 0034),
-- de weekafsluitingen en hun reacties (vraag 2 deelt de gebruiker zélf — de
-- eerste van de drie routes uit domeinregel 7), de commitments die verschuldigd
-- werden, de deadline-verzoeken (A7, die vraag je zelf aan), de groepsgebeurtenissen
-- en de seizoensrecaps (per domeinregel 7 alleen positieve signalen).
--
-- ⚠️ **Archiveren verruimt niets.** Elke rij die na deze migratie zichtbaar is in
--    een gearchiveerde groep, was zichtbaar toen de groep nog liep. De maskering
--    van A41 wordt zelfs strénger: `lid_van_open_groep()` en
--    `deelt_open_groep_met_doel()` hebben allebei hun eigen archieftoets, dus een
--    ópen groep gedraagt zich na archiveren als een beschermde. Dat is met opzet
--    niet aangeraakt.
--
-- ---------------------------------------------------------------------------
-- De weg terug, en waarom er een sleutel bij hoort
-- ---------------------------------------------------------------------------
--
-- `archief_blijft_archief()` (0092) pint `status` vast voor **elke** rol, ook
-- `service_role` en definer-functies. Dat is met opzet: drie van de vier routes
-- terug naar `active` zijn definer-functies, dus een rolfilter zou hier juist
-- het gat zijn.
--
-- Een `heropen_groep()` moet daar dus doorheen. De discriminator kan geen rol
-- zijn en geen tabelinhoud; wat wél onderscheidt is **welke functie er draait**.
-- Vandaar één transactielokale instelling die alleen `heropen_groep()` zet.
--
-- ⚠️ **Hij draagt het groeps-id en niet `true`, en dat verschil is de hele
--    zorgvuldigheid.** Een booleaanse vlag ontgrendelt binnen die transactie élke
--    gearchiveerde groep die er toevallig langskomt; een id ontgrendelt er precies
--    één, de groep waarvoor de beheerder net getekend heeft. Lekt de instelling
--    ooit — via een toekomstige functie die `set_config` doorgeeft — dan is de
--    schade begrensd tot die ene rij in plaats van tot de hele tabel.
--
-- ⚠️ **`is_group_admin()` is hier onbruikbaar** en dat is geen bug: hij geeft
--    onwaar voor een gearchiveerde groep. `heropen_groep()` kijkt daarom
--    rechtstreeks in `group_members`. Dat stond al in de kop van 0092.
--
-- ⚠️ **`set_config(..., true)` — transactielokaal.** Zonder die `true` blijft de
--    instelling voor de rest van de sessie staan, en PostgREST hergebruikt
--    verbindingen uit een pool. Dan is de ontgrendeling niet één transactie lang
--    geldig maar tot iemand anders diezelfde verbinding krijgt.

begin;

-- ---------------------------------------------------------------------------
-- 1. De leeskant krijgt een eigen functie
-- ---------------------------------------------------------------------------
--
-- ⚠️ Identiek aan `is_group_member()` op één regel na: de archieftoets is eruit.
--    Dat verschil is de hele functie, en daarom staat het hier als commentaar en
--    niet als vanzelfsprekendheid.

create or replace function public.mag_groep_lezen(gid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from group_members m
    where m.group_id = gid
      and m.user_id  = auth.uid()
      and m.status  <> 'inactive'
  );
$$;

comment on function public.mag_groep_lezen(uuid) is
  'Actief lid, óók van een gearchiveerde groep — de leeskant van '
  '`is_group_member()` (0153, QS8-217). Uitsluitend voor SELECT-policies: elke '
  'policy die schrijft hoort langs `is_group_member()` te lopen, die zijn '
  'archieftoets houdt. `archiefleesgat()` telt of dat zo blijft.';

revoke all on function public.mag_groep_lezen(uuid) from public, anon, authenticated;
grant execute on function public.mag_groep_lezen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De tien SELECT-policies om
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elk hieronder is de gedéployde qual uit `pg_policies`, met uitsluitend
--    `is_group_member` vervangen door `mag_groep_lezen`. Niet overgeschreven uit
--    een migratiebestand: `pg_get_functiondef()` en `pg_policies` zijn de
--    waarheid, en tussen 0016 en 0122 is aan een aantal van deze policies nog
--    gesleuteld (`auth.uid()` in een subquery, 0122).

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists commitments_select on public.commitments;
create policy commitments_select on public.commitments
  for select to authenticated
  using (
    exists (
      select 1 from goals g
      where g.id = commitments.goal_id and g.owner_id = (select auth.uid())
    )
    or (
      beneficiary_group_id is not null
      and status = any (commitment_zichtbaar_voor_groep())
      and mag_groep_lezen(beneficiary_group_id)
    )
  );

drop policy if exists deadline_requests_select on public.deadline_requests;
create policy deadline_requests_select on public.deadline_requests
  for select to authenticated
  using (requester_id = (select auth.uid()) or mag_groep_lezen(group_id));

drop policy if exists goal_group_links_select on public.goal_group_links;
create policy goal_group_links_select on public.goal_group_links
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists group_events_select on public.group_events;
create policy group_events_select on public.group_events
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated
  using (mag_groep_lezen(id));

drop policy if exists season_recaps_select on public.season_recaps;
create policy season_recaps_select on public.season_recaps
  for select to authenticated
  using (mag_groep_lezen(group_id));

drop policy if exists week_review_replies_select on public.week_review_replies;
create policy week_review_replies_select on public.week_review_replies
  for select to authenticated
  using (
    exists (
      select 1 from week_reviews r
      where r.id = week_review_replies.week_review_id and mag_groep_lezen(r.group_id)
    )
  );

drop policy if exists week_reviews_select on public.week_reviews;
create policy week_reviews_select on public.week_reviews
  for select to authenticated
  using (mag_groep_lezen(group_id));

-- ---------------------------------------------------------------------------
-- 3. De teller die de splitsing bewaakt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze functie is de splitsing een afspraak en geen grendel.** De
--    reden dat 0092 de archieftoets in één functie zette, was dat tien losse
--    voorwaarden tien kansen zijn om er één te vergeten. Twee functies naast
--    elkaar hebben datzelfde probleem één laag hoger: de volgende SELECT-policy
--    krijgt `is_group_member()` omdat dat de naam is die iedereen kent, en dan
--    is één tabel stilzwijgend dicht in het archief.
--
--    Deze functie telt wat er niet klopt, in béide richtingen: een SELECT-policy
--    die nog langs de schrijffunctie loopt, én een schrijfpolicy die langs de
--    leesfunctie loopt — dat tweede is het gevaarlijke, want dan mag je schrijven
--    in een gearchiveerde groep.

create or replace function public.archiefleesgat()
  returns table (naam text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select (p.tablename || '.' || p.policyname)::text,
         'SELECT-policy loopt langs is_group_member(); die sluit een archief uit'
  from pg_policies p
  where p.schemaname = 'public'
    and p.cmd = 'SELECT'
    and coalesce(p.qual, '') like '%is_group_member%'
    -- ⚠️ De uitzondering met naam en reden, niet met een stilzwijgen: De Ketting
    --    hóórt dicht te blijven. Zie de kop van deze migratie.
    and p.policyname <> 'chain_links_select'
  union all
  select (p.tablename || '.' || p.policyname)::text,
         'schrijvende policy loopt langs mag_groep_lezen(); die laat een archief door'
  from pg_policies p
  where p.schemaname = 'public'
    and p.cmd <> 'SELECT'
    and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%mag_groep_lezen%'
  order by 1;
$$;

comment on function public.archiefleesgat() is
  'Policies die aan de verkeerde kant van de lees/schrijf-splitsing van 0153 '
  'staan. Hoort leeg te zijn. Tweezijdig: een SELECT-policy die een archief '
  'uitsluit én — gevaarlijker — een schrijfpolicy die er een doorlaat.';

revoke all on function public.archiefleesgat() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Een gebeurtenis die nog niet bestond
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een allowlist-CHECK, net als `chat_messages_system_event_bekend` (0034):
--    een nieuw type vraagt een migratie en is niet stilletjes toe te voegen.

alter table public.group_events drop constraint if exists group_events_type_valid;
alter table public.group_events add constraint group_events_type_valid
  check (event_type in (
    'admin_transferred', 'group_archived', 'member_left', 'visibility_changed',
    'discoverable_changed', 'join_request_decided', 'member_removed',
    'group_reopened'
  ));

-- ---------------------------------------------------------------------------
-- 5. Het slot krijgt één sleutel
-- ---------------------------------------------------------------------------

create or replace function public.archief_blijft_archief()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.status = 'archived' and new.status is distinct from 'archived' then
    -- ⚠️ De sleutel draagt het groeps-id. Een booleaan zou binnen deze
    --    transactie élke gearchiveerde groep ontgrendelen die langskomt; zo is
    --    het er precies één. `nullif` want een niet-gezette instelling komt als
    --    lege string terug en niet als NULL.
    if nullif(current_setting('app.heropent_groep', true), '') is distinct from old.id::text then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.archief_blijft_archief() is
  'Houdt een gearchiveerde groep gearchiveerd, tenzij `app.heropent_groep` het '
  'id van precies deze groep draagt — en dat zet alleen `heropen_groep()` '
  '(0153). Geldt verder voor élke rol, ook service_role en definer-functies: '
  'drie van de vier routes terug naar active zijn definer-functies, dus de '
  'rolfilter van guard_group_update() zou hier juist het gat zijn. Pint vast in '
  'plaats van te gooien (les van 0017).';

-- ---------------------------------------------------------------------------
-- 6. Heropenen
-- ---------------------------------------------------------------------------

create or replace function public.heropen_groep(
  p_group_id uuid,
  p_bevestigd boolean default false
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  -- ⚠️ Rechtstreeks in `group_members` en niet via `is_group_admin()`: die geeft
  --    onwaar voor een gearchiveerde groep, en dat is precies de toestand waar
  --    deze functie voor bestaat. Stond al in de kop van 0092.
  if not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
      and m.user_id  = auth.uid()
      and m.role     = 'admin'
      and m.status  <> 'inactive'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  if p_bevestigd is not true then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed');
  end if;

  select g.status into v_status
  from groups g
  where g.id = p_group_id
  for update;

  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_group');
  end if;

  if v_status <> 'archived' then
    return jsonb_build_object('ok', false, 'reason', 'unchanged');
  end if;

  -- De sleutel, transactielokaal en met het id erin.
  perform set_config('app.heropent_groep', p_group_id::text, true);

  update groups set status = 'active' where id = p_group_id;

  -- ⚠️ Teruglezen en niet aannemen. `archief_blijft_archief()` pint stil vast in
  --    plaats van te gooien, dus een mislukte heropening geeft zonder deze
  --    controle `ok: true` terwijl er niets veranderd is — precies de vorm die
  --    dit project als zijn duurste kent.
  select g.status into v_status from groups g where g.id = p_group_id;
  if v_status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'pinned');
  end if;

  insert into group_events (group_id, actor_id, event_type, old_value, new_value)
  values (
    p_group_id,
    auth.uid(),
    'group_reopened',
    jsonb_build_object('status', 'archived'),
    jsonb_build_object('status', 'active')
  );

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.heropen_groep(uuid, boolean) is
  'Haalt een groep terug uit het archief (0153, QS8-217). Vraagt een actieve '
  'beheerder — rechtstreeks uit group_members, want is_group_admin() geeft '
  'onwaar voor een archief — en een expliciete bevestiging, en laat een rij na '
  'in group_events. Leest de status terug: de pin van archief_blijft_archief() '
  'weigert stil, dus zonder die controle zou een mislukte heropening ok geven.';

revoke all on function public.heropen_groep(uuid, boolean) from public, anon, authenticated;
grant execute on function public.heropen_groep(uuid, boolean) to authenticated;

commit;
