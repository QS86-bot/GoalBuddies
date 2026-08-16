-- 0017_join_group_result.sql — een mislukte poging telde helemaal niet mee
--
-- ROLLBACK-PAD:
--   drop function if exists join_group_with_code(text);
--   -- daarna de versie uit 0016_buddy_groups.sql opnieuw uitvoeren
--
-- ⚠️ Gevonden door de nieuwe test "weigert na twintig pogingen per dag" uit
--    EPIC 5, en het is een echt gat en geen testfout.
--
-- 0008 schreef eerst een rij in `invite_events` en zocht daarna pas de code op,
-- met de redenering: "andersom telt een mislukte poging niet mee, en juist die
-- wil je tellen — brute-force bestaat uit mislukte pogingen." Die redenering
-- klopt. De uitvoering niet.
--
-- PostgREST draait elke RPC in zijn eigen transactie. `raise exception` breekt
-- die transactie af, en daarmee verdwijnt óók de zojuist geschreven
-- `invite_events`-rij. Het resultaat: elke mislukte poging liet geen enkel spoor
-- na en de teller bleef op nul staan. De limiet van twintig gold in de praktijk
-- alleen voor twintig gelúkte toetredingen — precies het geval dat geen
-- bescherming nodig heeft.
--
-- De reparatie is de functie geen exception meer laten gooien voor iets dat een
-- normale uitkomst is. Ze geeft nu een resultaat terug, de transactie commit, en
-- de poging blijft staan.
--
-- ⚠️ De les is breder dan deze functie: **in een SECURITY DEFINER-RPC overleeft
--    niets een `raise exception`.** Alles wat je wilt onthouden over een
--    mislukte poging — een teller, een auditregel, een blokkade — moet in de
--    happy path staan of via een aparte weg gaan. Dit patroon komt terug bij
--    elke rate limiter die hierna gebouwd wordt.
--
-- ⚠️ `invalid` dekt zowel ingetrokken als nooit-bestaan. Dat blijft met opzet
--    één antwoord: een aparte reden per geval maakt hiervan een orakel dat
--    vertelt welke codes bestaan.

drop function if exists join_group_with_code(text);

create or replace function join_group_with_code(code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  target       groups%rowtype;
  pogingen     integer;
  leden        integer;
  lidmaatschap integer;
  al_lid       boolean;
begin
  -- Niet ingelogd blijft wél een exception: er is dan geen poging om te tellen
  -- en geen gebruiker om hem aan te hangen. Dit pad is voor de client een fout
  -- in de app, niet een uitkomst van het formulier.
  if auth.uid() is null then
    raise exception 'Niet ingelogd';
  end if;

  select count(*) into pogingen
  from invite_events
  where user_id = auth.uid()
    and created_at > now() - interval '1 day';

  -- ⚠️ Vóór de insert, niet erna. Zou een geweigerde poging ook geteld worden,
  --    dan schuift het venster met elke poging mee op en loopt de blokkade nooit
  --    af.
  if pogingen >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into invite_events (user_id) values (auth.uid());

  select * into target
  from groups
  where invite_code = code
    and invite_revoked = false;

  if target.id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select exists (
    select 1 from group_members
    where group_id = target.id and user_id = auth.uid()
  ) into al_lid;

  -- Wie er al in zit, komt gewoon binnen: geen limiettoets, geen foutmelding.
  if not al_lid then
    select count(*) into leden
    from group_members
    where group_id = target.id and status <> 'inactive';

    if leden >= 12 then
      return jsonb_build_object('ok', false, 'reason', 'group_full');
    end if;

    select count(*) into lidmaatschap
    from group_members
    where user_id = auth.uid() and status <> 'inactive';

    if lidmaatschap >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'too_many_groups');
    end if;
  end if;

  -- ⚠️ Bewust GEEN onvoorwaardelijke `set status = 'active'`. Dat liet een lid
  --    dat een beheerder op 'inactive' had gezet zichzelf terugzetten met de code
  --    die hij nog had — een moderatie-bypass. Terugkeren na een zelfgekozen
  --    pauze mag wel: alleen 'paused' gaat terug naar actief.
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

  return jsonb_build_object('ok', true, 'group_id', target.id);
end;
$$;

comment on function join_group_with_code(text) is
  'Enige route naar lidmaatschap (5.2). Geeft een resultaat terug in plaats van '
  'een exception te gooien, want een exception rolt de transactie terug en '
  'daarmee de poging die geteld moest worden.';

revoke all on function join_group_with_code(text) from public, anon;
grant execute on function join_group_with_code(text) to authenticated;
