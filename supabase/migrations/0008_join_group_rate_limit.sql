-- 0008_join_group_rate_limit.sql — uitnodigingscodes zijn niet oneindig te raden
--
-- ROLLBACK-PAD:
--   drop function if exists join_group_with_code(text);
--   -- daarna de versie uit 0002_functions_triggers.sql opnieuw uitvoeren
--
-- `join_group_with_code` had geen enkele limiet. De tabel `invite_events` bestond
-- mét een index op `(user_id, created_at desc)` — precies gebouwd voor rate
-- limiting — maar werd door geen regel code geschreven of gelezen.
--
-- CLAUDE.md beveiligingsregel 5 eist een limiet per gebruiker per dag.
--
-- Twee wijzigingen tegelijk, beide uit de security-review van QS8-98.

create or replace function join_group_with_code(code text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target   groups%rowtype;
  pogingen integer;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  if pogingen >= 20 then
    raise exception 'Te veel pogingen. Probeer het morgen opnieuw.';
  end if;

  -- ⚠️ Eerst loggen, dan pas zoeken. Andersom telt een mislukte poging niet mee,
  --    en juist die wil je tellen — brute-force bestaat uit mislukte pogingen.
  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  -- ⚠️ Ingetrokken en niet-bestaand geven bewust dezelfde melding. Een apart
  --    antwoord per geval maakt van deze functie een orakel dat vertelt welke
  --    codes bestaan.
  if target.id is null then
    raise exception 'Deze uitnodigingslink werkt niet meer';
  end if;

  -- ⚠️ Bewust GEEN onvoorwaardelijke `set status = 'active'` meer. Dat liet een
  --    lid dat een beheerder op 'inactive' had gezet zichzelf terugzetten met de
  --    code die hij nog had — een moderatie-bypass. Terugkeren na een
  --    zelfgekozen pauze mag wel: alleen 'paused' gaat terug naar actief.
  insert into group_members (group_id, user_id, role, status)
  values (target.id, auth.uid(), 'member', 'active')
  on conflict (group_id, user_id) do update
    set status = case
      when group_members.status = 'paused' then 'active'
      else group_members.status
    end;

  update groups
  set status = 'active', last_activity_at = now()
  where id = target.id;

  return target.id;
end;
$$;

comment on function join_group_with_code(text) is
  'Enige route naar lidmaatschap (5.2). Telt elke poging in invite_events en '
  'weigert na 20 per dag; een ingetrokken code is niet te onderscheiden van een '
  'code die nooit bestaan heeft.';
