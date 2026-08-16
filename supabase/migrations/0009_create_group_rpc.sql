-- 0009_create_group_rpc.sql — een groep aanmaken kan wél vanuit de client
--
-- ROLLBACK-PAD:
--   drop function if exists create_group(text, text, smallint, text);
--
-- Gevonden door de RLS-testsuite van QS8-98: dit kon helemaal niet.
--
-- `groups_select` eist `is_group_member(id)`, en `group_members_insert_founder`
-- toetste het oprichterschap met een subquery op `groups` die zelf ook onder RLS
-- draait. De oprichter moest dus lid zijn om zijn groep te mogen zien, en zijn
-- groep zien om lid te mogen worden. Daar kwam niemand doorheen.
--
-- Bijkomend: Postgres past de SELECT-policy óók toe op de `RETURNING`-rij van een
-- INSERT. `insert into groups (...) returning id` gaf daardoor de misleidende
-- melding "new row violates row-level security policy", terwijl de insert zelf
-- prima mocht.
--
-- Eén RPC lost allebei op, en is sowieso nodig: twee losse inserts kunnen
-- halverwege stranden en laten dan een groep zonder leden achter — een groep die
-- vervolgens voor niemand zichtbaar is, ook niet voor zijn eigen oprichter.

create or replace function create_group(
  group_name text,
  invite_code text,
  huddle_day smallint default 0,
  tz text default 'Europe/Amsterdam'
)
  returns groups
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  nieuw groups;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  insert into groups (name, created_by, invite_code, huddle_day, tz)
  values (group_name, auth.uid(), invite_code, huddle_day, tz)
  returning * into nieuw;

  insert into group_members (group_id, user_id, role, status)
  values (nieuw.id, auth.uid(), 'admin', 'active');

  return nieuw;
end;
$$;

comment on function create_group(text, text, smallint, text) is
  'Groep en oprichterslidmaatschap in een transactie. Zonder deze RPC is een '
  'groep aanmaken onmogelijk: zie de kringloop tussen groups_select en '
  'group_members_insert_founder.';

grant execute on function create_group(text, text, smallint, text) to authenticated;
