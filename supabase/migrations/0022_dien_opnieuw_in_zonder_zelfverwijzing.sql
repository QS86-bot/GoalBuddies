-- 0022_dien_opnieuw_in_zonder_zelfverwijzing.sql
--
-- ROLLBACK-PAD:
--   -- de versie uit 0021_peer_goedkeuring.sql opnieuw uitvoeren
--
-- ⚠️ De vorige versie zette de oude voltooiing tijdelijk op `superseded_by =
--    id` om ruimte te maken onder `completions_active_uniq`. Dat mag niet, en
--    het schema zegt het al sinds 0001: `completions_no_self_supersede` verbiedt
--    precies die zelfverwijzing. Terecht — een rij die naar zichzelf wijst, is
--    geen "vervangen door" maar een lus, en elke query die de keten volgt loopt
--    erop vast.
--
--    Gevonden door de test, niet door de code te lezen. Dat is de tweede keer
--    in deze functie dat een aanname over de database niet klopte; de eerste
--    was dat een exception-blok de transactie zou terugdraaien. Allebei het
--    soort fout dat je alleen ziet door hem uit te voeren.
--
-- De volgorde die wél werkt houdt zich aan alle drie de regels tegelijk:
--
--   1. Voeg de nieuwe rij in mét `superseded_by = oud.id`. Hij is daarmee nog
--      niet actief, dus `completions_active_uniq` (uniek per weekdoel wáár
--      superseded_by null is) heeft er geen last van, en hij wijst niet naar
--      zichzelf.
--   2. Zet de oude op de nieuwe. Nu is er even geen actieve voltooiing, en dat
--      mag: de index eist uniciteit, geen aanwezigheid.
--   3. Maak de nieuwe actief.
--
-- Alle drie de tussenstanden zijn geldig, en de transactie maakt ze onzichtbaar
-- voor iedereen behalve deze functie.

create or replace function dien_opnieuw_in(
  p_weekly_goal_id uuid,
  p_achieved_level text,
  p_note text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  w      weekly_goals%rowtype;
  oud    completions%rowtype;
  nieuw  completions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if p_achieved_level not in ('floor', 'ceiling') then
    return jsonb_build_object('ok', false, 'reason', 'bad_level');
  end if;

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_approved');
  end if;

  select * into oud
  from completions
  where weekly_goal_id = p_weekly_goal_id and superseded_by is null;

  if oud.id is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_replace');
  end if;

  begin
    -- Stap 1: de nieuwe rij komt binnen als "niet actief".
    insert into completions
      (weekly_goal_id, user_id, achieved_level, note, cycle_start_date, superseded_by)
    values
      (p_weekly_goal_id, auth.uid(), p_achieved_level,
       nullif(btrim(coalesce(p_note, '')), ''), w.cycle_start_date, oud.id)
    returning * into nieuw;
  exception when check_violation then
    -- De bewijseis van de groep. Er is nog niets veranderd aan de oude rij, dus
    -- er valt hier ook niets terug te draaien.
    return jsonb_build_object('ok', false, 'reason', 'note_required');
  end;

  -- Stap 2 en 3: de ketting omdraaien.
  update completions set superseded_by = nieuw.id where id = oud.id;
  update completions set superseded_by = null where id = nieuw.id;

  update weekly_goals set status = 'pending' where id = p_weekly_goal_id;

  return jsonb_build_object('ok', true, 'completion_id', nieuw.id);
end;
$$;

comment on function dien_opnieuw_in(uuid, text, text) is
  'Vervangt een voltooiing door een nieuwe, append-only (domeinregel 6). De '
  'nieuwe rij komt binnen als niet-actief en wordt het pas nadat de oude naar '
  'hem wijst: zo blijven completions_active_uniq en '
  'completions_no_self_supersede allebei overeind.';

revoke all on function dien_opnieuw_in(uuid, text, text) from public, anon;
grant execute on function dien_opnieuw_in(uuid, text, text) to authenticated;
