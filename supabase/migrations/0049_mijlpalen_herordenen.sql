-- 0049_mijlpalen_herordenen.sql — QS8-39 (EPIC 3)
--
-- ROLLBACK-PAD:
--   drop function if exists herorden_mijlpalen(uuid, uuid[]);
--
-- ⚠️ Waarom dit een RPC is en geen reeks updates vanuit de client.
--    `milestones_goal_order_uniq` is UNIQUE (goal_id, order_index) en staat op
--    DEFERRABLE INITIALLY DEFERRED. Dat betekent dat je binnen één transactie
--    vrij mag schuiven en de controle pas bij commit valt — precies wat
--    herordenen nodig heeft, want onderweg botsen de nummers altijd.
--
--    PostgREST draait elk verzoek in zijn eigen transactie. Drie mijlpalen
--    herordenen met drie PATCH-verzoeken is dus drie transacties, en de tweede
--    loopt gegarandeerd op de unieke index stuk. Wat je overhoudt is een
--    halfverschoven lijst zonder foutmelding die daarover gaat.
--
-- ⚠️ De functie eist de **volledige** lijst en niet een deelverzameling. Met een
--    deelverzameling kun je twee mijlpalen op dezelfde plek zetten of gaten
--    laten vallen, en dan is `order_index` geen volgorde meer maar een suggestie.
--    Dat is dezelfde soort strengheid als bij `plaats_systeembericht`: liever
--    weigeren met een reden dan half doen.
--
-- ⚠️ Geeft een resultaat terug in plaats van te gooien (de les van 0017: in een
--    SECURITY DEFINER-RPC overleeft niets een `raise exception`).

begin;

create or replace function public.herorden_mijlpalen(
  p_goal_id uuid,
  p_ids     uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := auth.uid();
  v_bestaand uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ⚠️ Twee insluitingen zijn geen gelijkheid — de valkuil die migratie 0032
  --    een groene test opleverde die niets bewees. Hier wordt de gelijkheid van
  --    twee verzamelingen getoetst, en niet twee keer een kant.
  select array_agg(m.id order by m.id) into v_bestaand
  from milestones m
  where m.goal_id = p_goal_id and m.status <> 'dropped';

  if coalesce(v_bestaand, '{}') is distinct from (
    select array_agg(x order by x) from unnest(p_ids) as x
  ) then
    return jsonb_build_object('ok', false, 'reason', 'lijst_klopt_niet');
  end if;

  -- De schuif zelf. Binnen deze transactie mogen de nummers botsen; de
  -- deferred constraint kijkt pas bij commit.
  update milestones m
     set order_index = nieuw.positie
    from (
      select id, ordinality::integer as positie
      from unnest(p_ids) with ordinality as t(id, ordinality)
    ) as nieuw
   where m.id = nieuw.id and m.goal_id = p_goal_id;

  return jsonb_build_object('ok', true, 'aantal', array_length(p_ids, 1));
end;
$$;

revoke all on function public.herorden_mijlpalen(uuid, uuid[]) from public, anon;
grant execute on function public.herorden_mijlpalen(uuid, uuid[]) to authenticated;

commit;
