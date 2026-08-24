-- 0080_de_uitnodiging_noemt_de_zichtbaarheid.sql — QS8-132, het gat vóór de deur
--
-- ROLLBACK-PAD:
--   invite_preview(text) terug uit migratie 0019 §3 — zonder de sleutel
--   `zichtbaarheid` in het jsonb-antwoord. Geen schemawijziging, geen dump nodig.
--
-- ---------------------------------------------------------------------------
-- Wat hier misging, en waarom het geen bug in 0076 was
-- ---------------------------------------------------------------------------
--
-- 0076 legt vast dat het ómzetten van een groep nooit stilzwijgend is: expliciet
-- bevestigd, een rij in `group_events`, een systeembericht in de chat. Grens 3
-- van besluit A41, en die is afgedekt.
--
-- ⚠️ **Er is een tweede route waarlangs iemands tegenslag zichtbaar wordt, en
--    0076 dekt hem niet: meedoen.** Wie een uitnodigingslink volgt naar een
--    groep die al op `open` staat, maakt exact dezelfde overgang mee als een lid
--    van een groep die wordt opengezet — zijn gemiste weken worden zichtbaar
--    voor anderen — maar er is geen bericht, geen bevestiging en geen
--    auditspoor, want er verándert niets aan de groep.
--
--    Het systeembericht kan dit niet opvangen: dat gaat over een gebeurtenis in
--    het verleden, en wie nieuw is heeft het niet gelezen. De enige plek waar
--    dit kan staan, is het scherm waarop iemand besluit mee te doen.
--
-- ⚠️ **Gevonden bij de eigen controlepas op EPIC 13** (`CLAUDE.md` regel 19: wat
--    je uitstelt, vang je zelf op). Het is dezelfde vorm als onwrikbare regel 18
--    vraag 1 — twee correcte onderdelen, `zet_groepszichtbaarheid()` en
--    `join_group_with_code()`, met een naad ertussen die van geen van beide is.
--
-- ⚠️ **Waarom `create_group()` géén bevestiging nodig heeft en dit wél.** Bij het
--    aanmaken is de oprichter het enige lid: hij kiest iets over zijn eigen
--    zichtbaarheid en over niemand anders. Bij meedoen kiest hij over zichzelf in
--    een groep die er al is. In beide gevallen beslist de persoon over zijn eigen
--    weken — en dáárom is hier een **feit** genoeg en geen bevestigingsstap: hij
--    moet het weten vóórdat hij drukt, niet twee keer drukken.
--
-- ---------------------------------------------------------------------------
-- Waarom dit ook zonder account meegaat
-- ---------------------------------------------------------------------------
--
-- `invite_preview()` geeft zonder account bewust minder terug (0019): voornamen
-- in plaats van volledige namen, geen avatars, geen doeltitels. De
-- zichtbaarheidskeuze staat **buiten** die beperking, en dat is een keuze:
--
--   * Het is geen persoonsgegeven. Het zegt niets over een lid, alleen iets over
--     de groep — net als de naam en de huddledag, die er ook zonder account in
--     staan.
--   * Het is precies het feit dat iemand nodig heeft om te besluiten of hij een
--     account áánmaakt. Achterhouden tot na het inloggen zou betekenen dat de app
--     de belangrijkste eigenschap van de groep pas noemt als je al binnen bent.
--
-- ⚠️ Wie geen `zichtbaarheid` terugkrijgt (een oudere app tegen een nieuwe
--    server, of andersom), hoort `beschermd` aan te nemen. Dat staat zo in
--    `src/modules/buddies/api.ts` en het is dezelfde kant op als overal in dit
--    besluit: onbekend is beschermd.

begin;

create or replace function invite_preview(code text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public, pg_temp
as $$
declare
  g          groups%rowtype;
  aantal     integer;
  leden      jsonb;
  ingelogd   boolean := auth.uid() is not null;
begin
  select * into g
  from groups
  where invite_code = code
    and invite_revoked = false;

  -- ⚠️ Ingetrokken, verlopen en nooit-bestaan geven hetzelfde antwoord. Een
  --    apart antwoord per geval maakt hiervan een orakel dat vertelt welke codes
  --    bestaan — en dit is het enige eindpunt dat zonder account bereikbaar is.
  if g.id is null then
    return null;
  end if;

  select count(*) into aantal
  from group_members
  where group_id = g.id and status <> 'inactive';

  select coalesce(jsonb_agg(rij), '[]'::jsonb) into leden
  from (
    select jsonb_build_object(
      -- Zonder account alleen de voornaam: genoeg om te zien wie er zit, te
      -- weinig om iemand mee te vinden.
      'display_name', case
        when ingelogd then p.display_name
        else split_part(btrim(p.display_name), ' ', 1)
      end,
      'avatar_url', case when ingelogd then p.avatar_url else null end,
      'goal_title', case
        when ingelogd then (
          select gg.title
          from goals gg
          join goal_group_links l on l.goal_id = gg.id
          where l.group_id = g.id
            and gg.owner_id = m.user_id
            and gg.status = 'active'
          order by gg.target_date asc
          limit 1
        )
        else null
      end
    ) as rij
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = g.id and m.status <> 'inactive'
    order by m.joined_at asc
    limit 8
  ) t;

  return jsonb_build_object(
    'group_id',      g.id,
    'group_name',    g.name,
    'icon',          g.icon,
    'huddle_day',    g.huddle_day,
    -- ⚠️ Buiten de `ingelogd`-beperking, en dat is met opzet — zie de kop.
    'zichtbaarheid', g.zichtbaarheid,
    'member_count',  aantal,
    'detailed',      ingelogd,
    'members',       leden
  );
end;
$$;

comment on function invite_preview(text) is
  'De groep achter een uitnodigingslink (5.5). Zonder account: naam, aantal '
  'leden, huddledag, zichtbaarheid en voornamen. De zichtbaarheid staat er ook '
  'zonder account in — het is geen persoonsgegeven en het is precies het feit '
  'dat iemand nodig heeft vóór hij meedoet (besluit A41).';

revoke all on function invite_preview(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;

commit;
