-- 0010_chat_message_immutable_fields.sql — alleen de tekst is te bewerken
--
-- ROLLBACK-PAD:
--   drop trigger if exists chat_messages_stamp on chat_messages;
--   drop function if exists stamp_chat_message();
--   -- daarna de versie uit 0006_close_rls_gaps.sql opnieuw uitvoeren
--
-- 0006 zette `is_group_member(group_id)` in de `with check` van
-- `chat_messages_update`. Dat blokkeert verplaatsen naar een vreemde groep, maar
-- niet naar een andere groep waar je zélf ook in zit — de check slaagt dan
-- gewoon. Gevonden doordat de test in tests/rls/policies.test.ts bleef falen
-- nadat 0006 gedraaid was.
--
-- Een policy is hier het verkeerde gereedschap. De eis luidt niet "welke rijen
-- mag je aanraken" maar "welke kolommen liggen vast", en dat kan RLS niet.
--
-- ⚠️ De regel is: een bericht hoort bij het gesprek waar het geplaatst is. Je
--    mag je tekst rechtzetten, meer niet. Zonder deze trigger kan iemand de
--    geschiedenis van twee groepen door elkaar husselen — en met `type` erbij is
--    het bovendien de route naar een vals systeembericht.

create or replace function stamp_chat_message()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- De tijd komt van de server. Was hij client-instelbaar, dan bleef een
    -- bericht met een datum in de toekomst voor altijd bewerkbaar en was het
    -- venster van 15 minuten geen venster.
    new.created_at := now();
    return new;
  end if;

  -- UPDATE: alles behalve de tekst gaat terug naar de oude waarde.
  new.group_id     := old.group_id;
  new.sender_id    := old.sender_id;
  new.type         := old.type;
  new.system_event := old.system_event;
  new.created_at   := old.created_at;

  return new;
end;
$$;

comment on function stamp_chat_message() is
  'Een bericht hoort bij het gesprek waar het geplaatst is. Alleen body en '
  'attachment_url zijn te bewerken; groep, afzender, type en tijd liggen vast.';

drop trigger if exists chat_messages_stamp on chat_messages;
create trigger chat_messages_stamp
  before insert or update on chat_messages
  for each row execute function stamp_chat_message();
