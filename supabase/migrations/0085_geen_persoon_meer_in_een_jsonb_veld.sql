-- 0085_geen_persoon_meer_in_een_jsonb_veld.sql — de algemene regel van 0059, nagelopen
--
-- ROLLBACK-PAD:
--   alter table public.goal_events drop column if exists approved_by_id;
--   -- en beslis_deadline_verzoek(uuid, boolean, text) opnieuw neerzetten met
--   -- 'approved_by', auth.uid() terug in het jsonb-object. ⚠️ Neem het lichaam
--   --    uit pg_get_functiondef() en niet uit 0032: die versie is ouder dan de
--   --    lidmaatschapstoets en de notitielengte die er sindsdien in staan.
--
-- ---------------------------------------------------------------------------
-- De regel, en waar hij nog niet gold
-- ---------------------------------------------------------------------------
--
-- Migratie 0059 loste dit op voor `chat_messages` en schreef de algemene regel
-- op: **een verwijzing naar een persoon hoort nooit in een jsonb-veld, in geen
-- enkele tabel.** Een uuid in jsonb heeft geen foreign key, dus `on delete set
-- null` raakt hem niet — en dan blijft de naam van een verwijderd account
-- afleidbaar uit een rij die volgens 0031/0033 juist geanonimiseerd hoort te
-- zijn.
--
-- De bevinding van 21-08 noemde twee kandidaten en liet een derde open. Op
-- 25-08 zijn alle tien de jsonb-kolommen van het schema nagelopen:
--
--   | kolom                      | inhoud                                | oordeel |
--   |----------------------------|---------------------------------------|---------|
--   | `goal_events.new_value`    | `target_date`, **`approved_by`**, `request_id` | ⚠️ raak |
--   | `goal_events.old_value`    | `target_date`                          | schoon  |
--   | `chat_messages.payload`    | parameters; personen in `subject_id`/`actor_id` (0059) | schoon |
--   | `commitment_events.payload`| `event`, `bereik`, `group_id`          | schoon  |
--   | `goal_risk.reason`         | getallen en een redencode              | schoon  |
--   | `group_events.old/new_value`| `zichtbaarheid`                       | schoon  |
--   | `goal_interviews.answers`  | de eigen antwoorden van de gebruiker   | schoon  |
--   | `ai_jobs.input`            | doeltitel, streefdatum, interview      | schoon  |
--   | `ai_jobs.output`           | mijlpalen                              | schoon  |
--
-- ⚠️ `ai_jobs.input` is cliëntgestuurd en zou dus alles kunnen bevatten, maar wat
--    de app erin zet gaat over het dóel en niet over een ander mens. De persoon
--    die de job aanvroeg staat in `ai_jobs.user_id`, een echte kolom.
--
-- ---------------------------------------------------------------------------
-- De ene raak: `approved_by` in `goal_events.new_value`
-- ---------------------------------------------------------------------------
--
-- `beslis_deadline_verzoek()` (0032) schrijft bij een goedgekeurde verschuiving:
--
--     jsonb_build_object('target_date', r.new_date,
--                        'approved_by', auth.uid(),
--                        'request_id',  r.id)
--
-- ⚠️ **Twee mensen in één rij, en de kolom was al bezet.** `actor_id` is de
--    aanvrager (`r.requester_id`), dus de goedkeurder paste er niet meer bij en
--    ging het jsonb-veld in. Exact dezelfde beweging als bij
--    `completion_approved` in 0059, en om exact dezelfde reden.
--
-- ⚠️ **En het is erger dan een gemiste anonimisering, want de anonimisering
--    wérkt hier al — één tabel verderop.** `deadline_requests.decided_by` heeft
--    `on delete set null`; die kolom wordt netjes leeggemaakt als de goedkeurder
--    zijn account opzegt. De kopie in `goal_events.new_value` heeft geen foreign
--    key en blijft staan, en `goal_events_select` geeft élke groepsgenoot van
--    het doel leesrecht op die kolom. De ene helft van het systeem poetst uit
--    wat de andere helft bewaart.
--
-- ⚠️ En omdat `goal_events_insert` een gebruiker toestaat zelf een rij op zijn
--    eigen doel te zetten, was `approved_by` bovendien te verzinnen. Als kolom
--    kan dat niet meer: hij is voor geen enkele client schrijfbaar.

alter table public.goal_events
  add column if not exists approved_by_id uuid references public.profiles (id) on delete set null;

comment on column public.goal_events.approved_by_id is
  'De buddy die een deadline-verschuiving goedkeurde — A7. Een volwaardige kolom '
  'en niet een sleutel in new_value, want een uuid in jsonb heeft geen foreign '
  'key en overleeft dus het verwijderen van dat account (0059, en de algemene '
  'regel die daar staat). Alleen door zet-functies te vullen.';

-- ⚠️ Onwrikbare regel 11: elke foreign key krijgt een index.
create index if not exists goal_events_approved_by_idx
  on public.goal_events (approved_by_id) where approved_by_id is not null;

-- ⚠️ Geen client mag hem zetten. `goal_events_insert` laat een gebruiker een rij
--    op zijn eigen doel schrijven, en zonder deze intrekking kon hij daarin
--    zetten dat wie dan ook zijn verschuiving had goedgekeurd.
revoke insert (approved_by_id), update (approved_by_id)
  on public.goal_events from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Wat er al stond verhuist mee
-- ---------------------------------------------------------------------------
--
-- ⚠️ Idempotent en in deze volgorde: eerst overzetten wat nog een bestaand
--    profiel is, dan de sleutel in álle gevallen weghalen. Die tweede stap is de
--    hele reden van deze migratie — een uuid van een verwijderd account hoort
--    juist wél weg, en die kan de eerste stap niet overzetten omdat de foreign
--    key hem terecht weigert.

update public.goal_events e
   set approved_by_id = (e.new_value->>'approved_by')::uuid
 where e.approved_by_id is null
   and e.new_value ? 'approved_by'
   and exists (select 1 from public.profiles p where p.id = (e.new_value->>'approved_by')::uuid);

update public.goal_events e
   set new_value = e.new_value - 'approved_by'
 where e.new_value ? 'approved_by';

-- ---------------------------------------------------------------------------
-- En de functie schrijft hem voortaan in de kolom
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Het lichaam komt uit `pg_get_functiondef()` en niet uit migratie 0032.**
--    De gedeployde functie is sindsdien gegroeid: er zit een lidmaatschapstoets
--    in (`m.status <> 'inactive'`), een `not_yourself`-tak en een grens van 1000
--    tekens op de notitie. Uit het bestand overschrijven had die drie stil
--    teruggedraaid — precies wat 0075 deed door van de verkeerde voorganger te
--    kopiëren. Alleen de `insert into goal_events` is anders dan wat er draait.

create or replace function beslis_deadline_verzoek(
  p_request_id uuid,
  p_akkoord    boolean,
  p_note       text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
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
$$;

comment on function beslis_deadline_verzoek(uuid, boolean, text) is
  'Een buddy keurt een deadline-verschuiving goed of af (A7). Nooit jezelf, en '
  'niet als je geen actief lid meer bent. De goedkeurder wordt vastgelegd in '
  'goal_events.approved_by_id — een kolom met een foreign key, zodat hij '
  'meeverdwijnt als dat account wordt opgezegd (0059, 0085).';
