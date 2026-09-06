-- 0170_een_straf_gaat_nooit_af_binnen_een_dag_en_een_verlopen_verzoek_verschuift_niets.sql — de twee routes waarlangs een straf alsnog meteen afgaat (QS8-293)
--
-- ROLLBACK-PAD:
--   `create or replace` op `maak_straffen_verschuldigd()` zonder de
--   `created_at`-conjunct (definitie in 0057) en op `beslis_deadline_verzoek()`
--   zonder de verlooptak (definitie in 0085).
--   ⚠️ Deze migratie voegt alleen weigeringen toe; er gaat bij een terugzet
--   niets verloren behalve de bescherming zelf.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De tweede security-ronde op 0169. Die migratie zette drie grenzen en beweerde
-- daarmee de spamvector af te knijpen tot "één dag speling, inherent aan
-- tijdzones". **Dat was voor de tweede keer te veel beweerd**, en beide routes
-- hieronder zijn end-to-end nagemeten tegen de draaiende database.
--
-- ---------------------------------------------------------------------------
-- Route 1 — `profiles.tz` staat aan beide kanten van de vergelijking
-- ---------------------------------------------------------------------------
--
-- De grens van 0169 vergelijkt `goals.target_date` met `mijn_datum()`. De
-- rollover vergelijkt dezelfde kolom met `localDateIn(profiel.tz, now())`
-- (`supabase/functions/rollover/index.ts`). **Dat zijn twee momenten, en de
-- waarde ertussen is een kolom die de gebruiker zelf schrijft** — `tz` staat in
-- de UPDATE-kolomgrant van `authenticated`.
--
-- Gemeten, als gewone `authenticated`-gebruiker, in één transactie:
--
--   A  mijn_datum west = 2026-09-06   (server utc = 2026-09-06)   -- tz = Etc/GMT+12
--   B  doel met die datum aangemaakt als gebruiker: ja
--   C  straf erop aangemaakt als gebruiker: ja
--   D  mijn_datum oost  = 2026-09-07   (verschil = 1 dagen)       -- tz = Etc/GMT-14
--   E  rollover verschuldigd = 1    status = due
--   F  bob leest de straf: 1 rij(en)
--
-- Nul vertraging. De derde grens van 0169 kostte de aanvaller één `PATCH
-- /profiles` in plaats van één dag geduld.
--
-- ⚠️ **Er is geen uur waarop dit niet werkt.** `Etc/GMT+12` en `Etc/GMT-14`
--    liggen 26 uur uit elkaar, dus hun datums verschillen áltijd minstens één
--    dag. De statische speling van `mijn_datum()` is inderdaad één dag — dat
--    stukje van de redenering in 0169 klopte — maar de grens vergelijkt twee
--    momenten, en dan is één dag statische speling twee dagen stúúrbare speling.
--
-- ⚠️ **Waarom de reparatie niet in `mijn_datum()` of in de policy zit.** Elke
--    grens die in gebruikerstijd rekent, is met dezelfde kolom te verzetten. De
--    eigenschap die je wilt hangt aan de serverklok en aan niets anders:
--
--       *een straf die je vastlegt, kan niet binnen een dag verschuldigd worden.*
--
--    Dat is geen tweede kopie van de policyregel maar een ándere belofte op een
--    ándere plek — precies het onderscheid dat 0168 en 0169 elders wél maakten.
--    `now()` en `c.created_at` zijn allebei serverwaarden; er is geen kolom die
--    een gebruiker kan draaien om ze uit elkaar te trekken.
--
-- ⚠️ **En het is op zichzelf een betere belofte.** Domeinregel 5 zegt dat een
--    commitment device nooit stilzwijgend in werking treedt. Een dag tussen het
--    vastleggen en het afgaan is precies dat: je hebt altijd nog een nacht om
--    hem in te trekken. Voor een eerlijke gebruiker verandert er hooguit dat een
--    straf op een doel dat vandaag afloopt een paar uur later afgaat.
--
-- ---------------------------------------------------------------------------
-- Route 2 — een goedkeuring die de deadline naar het verleden zet
-- ---------------------------------------------------------------------------
--
-- 0169 zette de datumgrens in `goals_insert`, `zet_streefdatum()` en
-- `vraag_deadline_verschuiving()`, en liet `beslis_deadline_verzoek()` er met
-- zoveel woorden buiten: *"een verzoek dat bij het indienen geldig was, mag niet
-- stranden doordat een buddy er een week over doet."*
--
-- Die redenering klopte over het verzoek en zag één ding over het hoofd: **de
-- goedkeuring is dan de trekker van een commitment device.** Gelezen uit
-- `pg_get_functiondef()`: `update goals set target_date = r.new_date` zonder
-- enige toets.
--
--   Alice vraagt op 1 september om 3 september. Volkomen legitiem.
--   Bob keurt goed op 6 september.
--   `target_date` wordt 2026-09-03, dus verstreken.
--   De straf die er al op stond, gaat bij de eerstvolgende rollover af.
--
-- Alice deed op dat moment niets. Haar buddy was traag. Dat is domeinregel 5
-- ("nooit stilzwijgend geactiveerd") en domeinregel 11 tegelijk.
--
-- ⚠️ **De weigering is smal en niet algemeen.** Een verzoek waarvan de datum nog
--    in de toekomst ligt, wordt behandeld zoals altijd — een buddy die er een
--    week over doet bij een datum drie weken verderop, verandert niets. Alleen
--    een verzoek waarvan de gevraagde datum inmiddels vóórbij is, kan niet meer
--    ingewilligd worden: dat is geen datum meer waar iemand nog naartoe kan
--    werken, en inwilligen zou een straf laten afgaan in plaats van ruimte te
--    geven. De aanvrager kan een nieuw verzoek indienen.
--
-- ⚠️ **`eigenaarsdatum(r.requester_id)` en niet `mijn_datum()`.** De grens is de
--    dag van de áánvrager. `mijn_datum()` zou de dag van de goedkeurder nemen,
--    en dan hangt de uitkomst af van waar de buddy toevallig woont.
--
-- ⚠️ De verlooptak staat **vóór** het bijwerken van `deadline_requests`: een
--    verlopen verzoek blijft `open` en wordt niet stilletjes als beslist
--    weggeschreven. Anders is de knop van de goedkeurder verbruikt zonder dat er
--    iets gebeurd is.
--
-- ---------------------------------------------------------------------------
-- Idempotent: twee keer `create or replace`, geen DDL aan tabellen.
-- ---------------------------------------------------------------------------

/**
 * Zet de straffen van één eigenaar op `due` waarvan de streefdatum voorbij is.
 *
 * ⚠️ **De `created_at`-conjunct is de enige grendel hier die niet in
 *    gebruikerstijd rekent** (QS8-293, tweede ronde). Zie de kop: `p_vandaag`
 *    komt uit `profiles.tz`, en die kolom schrijft de gebruiker zelf.
 */
create or replace function maak_straffen_verschuldigd(p_owner_id uuid, p_vandaag date)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_aantal integer;
begin
  if p_owner_id is null or p_vandaag is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.status <> 'completed'
     and g.target_date < p_vandaag
     -- ⚠️ **Serverklok, en met opzet niet `p_vandaag`.** Een straf die je
     --    vastlegt, gaat nooit binnen een dag af. Dat sluit de tz-route uit de
     --    kop (de aanvaller moet weer een echte dag wachten) en het is de
     --    belofte die domeinregel 5 hier hoort te geven: er zit altijd een nacht
     --    tussen het vastleggen en het afgaan.
     and c.created_at < now() - interval '24 hours';

  get diagnostics v_aantal = row_count;
  return v_aantal;
end;
$function$;

/**
 * Beslist over een deadline-verzoek (A7).
 *
 * ⚠️ **De verlooptak is nieuw sinds QS8-293, tweede ronde.** Zie de kop: zonder
 *    haar is een trage goedkeuring de trekker van een straf.
 */
create or replace function beslis_deadline_verzoek(p_request_id uuid, p_akkoord boolean, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r      deadline_requests%rowtype;
  g      goals%rowtype;
  schoon text := nullif(btrim(coalesce(p_note, '')), '');
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

  -- ⚠️ De goedkeurder staat sinds 0085 in `approved_by_id` en niet meer in
  --    `new_value`: een uuid in jsonb heeft geen foreign key en overleeft dus
  --    het verwijderen van dat account.
  insert into goal_events (goal_id, actor_id, event_type, old_value, new_value, approved_by_id)
  values (r.goal_id, r.requester_id, 'deadline_moved',
          jsonb_build_object('target_date', g.target_date),
          jsonb_build_object('target_date', r.new_date, 'request_id', r.id),
          auth.uid());

  return jsonb_build_object('ok', true, 'moved', true);
end;
$function$;
