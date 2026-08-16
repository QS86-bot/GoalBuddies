-- 0018_group_rpcs_return_reasons.sql — kenmerken in plaats van meldingen
--
-- ROLLBACK-PAD:
--   drop function if exists create_group(text, smallint, text);
--   drop function if exists rotate_invite_code(uuid);
--   drop function if exists set_invite_revoked(uuid, boolean);
--   -- daarna de versies uit 0016_buddy_groups.sql opnieuw uitvoeren
--
-- ⚠️ Gevonden bij de code-review van EPIC 5. De app vertaalde de tekst van een
--    exception naar het scherm zodra die "leesbaar" leek. Dat is onhoudbaar: er
--    is geen betrouwbare manier om onze eigen Nederlandse teksten te
--    onderscheiden van die van Postgres, en die van Postgres zien eruit als
--    `new row violates row-level security policy for table "groups"` of
--    `permission denied for table groups`. Dat lekt tabelnamen en het is Engels
--    databasejargon voor een Nederlandstalige gebruiker.
--
--    `shared/ui/AsyncView.tsx` schrijft het zelf al voor: nooit de rauwe
--    foutmelding tonen. De app deed op drie plekken precies dat.
--
-- De oplossing stond al in 0017: de database geeft een kort kenmerk terug en de
-- app kiest daar de zin bij. Dit trekt dat door naar de andere drie functies.
--
-- ⚠️ Alles wat een normale uitkomst is, is nu een resultaat. Wat overblijft als
--    exception is uitsluitend "niet ingelogd" — dat is een fout in de app en geen
--    uitkomst van een formulier.
--
-- ⚠️ `create_group` wordt in 0019 nog een keer vervangen, om de tijdzone te
--    valideren. Deze versie staat er als tussenstap omdat hij zo is toegepast.

-- ---------------------------------------------------------------------------
-- 1. create_group
-- ---------------------------------------------------------------------------

drop function if exists create_group(text, smallint, text);

create or replace function create_group(
  group_name text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam'
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw        groups;
  vandaag      integer;
  lidmaatschap integer;
  schone_naam  text;
  pogingen     integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  schone_naam := btrim(coalesce(group_name, ''));
  if length(schone_naam) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_short');
  end if;
  if length(schone_naam) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'name_too_long');
  end if;

  if huddle_day is null or huddle_day < 0 or huddle_day > 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_huddle_day');
  end if;

  select count(*) into vandaag
  from groups
  where created_by = auth.uid()
    and created_at > now() - interval '1 day';

  if vandaag >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  select count(*) into lidmaatschap
  from group_members
  where user_id = auth.uid() and status <> 'inactive';

  if lidmaatschap >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
  end if;

  -- ⚠️ Opnieuw proberen bij een botsing. `groups.invite_code` is uniek, dus een
  --    dubbele code zou anders als `unique_violation` naar buiten komen — een
  --    databasefout voor iets waar de gebruiker niets aan kan doen. Bij 59 bits
  --    is de kans verwaarloosbaar; drie pogingen kosten vier regels.
  loop
    pogingen := pogingen + 1;
    begin
      insert into groups (name, created_by, invite_code, huddle_day, tz)
      values (schone_naam, auth.uid(), generate_invite_code(), huddle_day, tz)
      returning * into nieuw;
      exit;
    exception when unique_violation then
      if pogingen >= 3 then raise; end if;
    end;
  end loop;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return jsonb_build_object('ok', true, 'group', to_jsonb(nieuw));
end;
$$;

comment on function create_group(text, smallint, text) is
  'Groep en oprichterslidmaatschap in een transactie (5.1). Geeft een kenmerk '
  'terug in plaats van een exception, zodat de app een eigen zin kan kiezen en '
  'er nooit Postgres-tekst op het scherm komt.';

revoke all on function create_group(text, smallint, text) from public, anon;
grant execute on function create_group(text, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. rotate_invite_code en set_invite_revoked
-- ---------------------------------------------------------------------------

drop function if exists rotate_invite_code(uuid);

create or replace function rotate_invite_code(p_group_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  nieuw := generate_invite_code();

  update groups
  set invite_code = nieuw, invite_revoked = false
  where id = p_group_id;

  return jsonb_build_object('ok', true, 'invite_code', nieuw);
end;
$$;

comment on function rotate_invite_code(uuid) is
  'Nieuwe uitnodigingscode voor een groep (5.1, "intrekbaar"). De oude link '
  'werkt daarna niet meer.';

revoke all on function rotate_invite_code(uuid) from public, anon;
grant execute on function rotate_invite_code(uuid) to authenticated;

drop function if exists set_invite_revoked(uuid, boolean);

create or replace function set_invite_revoked(p_group_id uuid, p_revoked boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  if not is_group_admin(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_admin');
  end if;

  update groups set invite_revoked = coalesce(p_revoked, true) where id = p_group_id;

  return jsonb_build_object('ok', true, 'invite_revoked', coalesce(p_revoked, true));
end;
$$;

comment on function set_invite_revoked(uuid, boolean) is
  'Sluit of heropent de uitnodigingslink zonder de code te vervangen.';

revoke all on function set_invite_revoked(uuid, boolean) from public, anon;
grant execute on function set_invite_revoked(uuid, boolean) to authenticated;
