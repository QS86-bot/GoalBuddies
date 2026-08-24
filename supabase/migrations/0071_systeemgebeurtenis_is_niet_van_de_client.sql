-- 0071_systeemgebeurtenis_is_niet_van_de_client.sql — QS8-70, bevinding uit de
-- eigen veiligheidspas op 0070
--
-- ROLLBACK-PAD:
--   drop policy if exists chat_messages_insert on chat_messages;
--   create policy chat_messages_insert on chat_messages for insert to authenticated
--     with check (sender_id = auth.uid() and is_group_member(group_id) and type <> 'system');
--   drop policy if exists chat_messages_update on chat_messages;
--   create policy chat_messages_update on chat_messages for update to authenticated
--     using (sender_id = auth.uid() and created_at > now() - interval '15 minutes')
--     with check (sender_id = auth.uid() and is_group_member(group_id) and type <> 'system');
--   -- en meld_ketting_mijlpaal() terug naar de versie uit 0070 (zonder de
--   -- type/sender_id-toets in de telling).
--
-- ⚠️ Wat er mis was. `chat_messages_insert` verbiedt `type = 'system'` — dat was
--    gat A5, gedicht in 0006 en 0010 — maar zegt niets over `system_event`. Een
--    gewoon lid kon dus een **eigen** bericht plaatsen met
--    `system_event = 'chain_milestone'` erop: `type = 'text'`, `sender_id` van
--    hemzelf, en de CHECK-allowlist laat de naam toe zodra hij erop staat.
--
--    Tot 0070 was dat onschadelijk. `ChatRegel.tsx` en `isSysteembericht()`
--    kijken naar `sender_id is null` en `type`, niet naar `system_event`, dus zo'n
--    rij rendert gewoon als een bericht van die persoon. Er viel niets mee te
--    vervalsen.
--
-- ⚠️ **0070 maakte het wél schadelijk, en dat is de reden dat deze migratie
--    dezelfde dag komt.** `meld_ketting_mijlpaal()` telt hoevéél mijlpalen er al
--    gemeld zijn door de `chain_milestone`-berichten van de groep te tellen. Wie
--    er zeven zelf plaatst, zet daarmee élke echte mijlpaalaankondiging van die
--    groep permanent uit. Geen datalek en geen domeinregel-7-lek — wel een
--    functie die op gegevens leunt die de client kan schrijven.
--
--    Dit is de valkuil uit `CLAUDE.md` letterlijk: *vraag bij elke nieuwe
--    beslissing die op een bestaande primitieve handeling leunt of daar een
--    weggelegde bevinding over staat.* Hier stond er geen — het gat was nog
--    nergens opgeschreven, want zonder 0070 was er niets om ermee te doen.
--
-- ⚠️ Twee sloten, want één is hier te weinig:
--
--      1. De policy laat `system_event` niet meer toe van een client. Dat haalt
--         de handeling zelf weg.
--      2. De telling in `meld_ketting_mijlpaal()` accepteert alleen rijen die
--         `plaats_systeembericht()` geschreven kán hebben (`type = 'system'` én
--         `sender_id is null`). Dat maakt de functie juist ongeacht wat er in de
--         tabel staat — ook voor rijen die er vóór deze migratie al in stonden.
--
--    Slot 2 alleen zou volstaan voor de mijlpaal, maar laat het schrijfrecht
--    staan voor de volgende functie die er wél op leunt. Slot 1 alleen zou de
--    bestaande rijen niet opruimen. Samen zijn ze sluitend.
--
-- ⚠️ Breekt dit de app? Nee. `verstuurBericht()` in `src/modules/buddies/chat.ts`
--    schrijft `group_id`, `sender_id`, `body` en `type` en heeft `system_event`
--    nooit gezet; er is geen andere clientroute naar deze tabel.
--
-- Vooraf: `pg_dump` (onwrikbare regel 20). Op 24-08-2026 stonden er 0 rijen in
-- `chat_messages`.
--
-- Idempotent: `drop policy if exists` + `create policy`, en `create or replace`.

-- ---------------------------------------------------------------------------
-- 1. Een systeemgebeurtenis komt nooit van een client
-- ---------------------------------------------------------------------------

drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_insert on chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and is_group_member(group_id)
    and type <> 'system'
    and system_event is null
  );

drop policy if exists chat_messages_update on chat_messages;
create policy chat_messages_update on chat_messages
  for update to authenticated
  using (
    sender_id = auth.uid()
    and created_at > now() - interval '15 minutes'
  )
  with check (
    sender_id = auth.uid()
    and is_group_member(group_id)
    and type <> 'system'
    and system_event is null
  );

-- ⚠️ `stamp_chat_message()` zet `system_event` bij een UPDATE al terug naar de
--    oude waarde, dus de `with check` hierboven is de tweede rem op dezelfde
--    handeling. Dat is met opzet: die trigger bewaakt de onveranderlijkheid van
--    een bestaande rij, deze policy bewaakt wat er überhaupt in mag.

-- ---------------------------------------------------------------------------
-- 2. De mijlpaaltelling kijkt alleen naar echte systeemberichten
-- ---------------------------------------------------------------------------

create or replace function meld_ketting_mijlpaal()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_drempels integer[] := ketting_drempels();
  v_schakels integer;
  v_gemeld   integer;
  v_bereikt  integer := 0;
  i          integer;
begin
  begin
    select count(*) into v_schakels
    from chain_links c
    where c.group_id = new.group_id;

    -- ⚠️ `type` en `sender_id` staan er sinds 0071 bij. Alleen
    --    `plaats_systeembericht()` schrijft deze combinatie; een door een lid
    --    geplaatste rij met hetzelfde `system_event` telt niet mee en kan de
    --    aankondiging dus niet meer wegdrukken.
    select count(*) into v_gemeld
    from chat_messages m
    where m.group_id     = new.group_id
      and m.system_event = 'chain_milestone'
      and m.type         = 'system'
      and m.sender_id is null;

    for i in 1 .. coalesce(array_length(v_drempels, 1), 0) loop
      if v_schakels >= v_drempels[i] then
        v_bereikt := i;
      end if;
    end loop;

    for i in v_gemeld + 1 .. v_bereikt loop
      perform plaats_systeembericht(
        new.group_id,
        'chain_milestone',
        'De Ketting van deze groep telt ' || v_drempels[i] || ' schakels.'
      );
    end loop;
  exception
    when others then
      raise warning 'Ketting-mijlpaal voor groep % is niet gemeld: %',
        new.group_id, sqlerrm;
  end;

  return new;
end;
$$;

comment on function meld_ketting_mijlpaal() is
  'Meldt een ronde stand van De Ketting in de groepschat — QS8-70. Noemt geen '
  'persoon: de mijlpaal is van de groep. Telt gemelde mijlpalen in plaats van '
  'exact op een drempel te toetsen, zodat een gemiste of gedubbelde melding '
  'zichzelf herstelt. Telt sinds 0071 uitsluitend echte systeemberichten.';

revoke all on function meld_ketting_mijlpaal() from public, anon, authenticated;
