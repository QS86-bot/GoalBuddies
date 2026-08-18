-- 0033_anonimiseren_overleeft_de_stempel.sql — reparatie op 0031 (Q-TODO A3)
--
-- ROLLBACK-PAD:
--   -- stamp_chat_message() uit 0010_chat_message_immutable_fields.sql opnieuw
--   -- uitvoeren. Let op: dan is `on delete set null` op chat_messages.sender_id
--   -- opnieuw stuk en laat een verwijderd account daar een verwijzing achter
--   -- naar een profiel dat niet meer bestaat.
--
-- ⚠️ Gevonden door de test bij 0031, en het is de subtielste fout van deze ronde.
--
--    `chat_messages.sender_id` kreeg in 0031 een `on delete set null`, zodat een
--    bericht blijft staan zonder naam als iemand zijn account opzegt. De
--    constraint was correct, werd op INSERT netjes afgedwongen — en deed op
--    DELETE van het profiel niets.
--
--    De reden: een referentiële actie is zelf een UPDATE op de kindtabel.
--    `stamp_chat_message()` is een BEFORE UPDATE-trigger die alles behalve de
--    tekst terugzet naar de oude waarde, ook `sender_id`. De actie zette hem dus
--    op NULL en de trigger zette hem in dezelfde bewerking weer terug. Postgres
--    controleert de sleutel daarna niet opnieuw, dus er kwam geen fout: de
--    ouderrij verdween en het kind hield een verwijzing naar een profiel dat niet
--    meer bestaat.
--
--    Zichtbaar gevolg: een verwijderd account bleef in de groepschat als afzender
--    staan, en `weergavenaam()` op dat id gaf niets meer. Precies de
--    AVG-verplichting die A3 moest afdekken, stil niet nagekomen.
--
-- ⚠️ De les erbij, want dit patroon staat op meer plekken in dit schema: een
--    onveranderlijkheidstrigger en een `on delete set null` op dezelfde kolom
--    sluiten elkaar uit, en de database waarschuwt daar niet voor.
--
--    `guard_group_update()` heeft hetzelfde probleem niet, en per ongeluk goed:
--    die begint met `if current_user not in ('authenticated', 'anon') then return
--    new; end if;`, en een referentiële actie draait als de eigenaar van de
--    tabel. `groups.created_by` wordt daardoor wél netjes leeggezet. Dat is geen
--    ontwerp maar geluk, en het staat nu opgeschreven.
--
-- ⚠️ Er wordt géén rolnaam gebruikt om dit op te lossen. `docs/WERKVOORRAAD.md`
--    §7 zegt met zoveel woorden dat een trigger die op een rolnaam beslist open
--    faalt. In plaats daarvan wordt precies één overgang toegestaan — van een
--    afzender naar geen afzender — en verder niets. Een gebruiker komt daar niet
--    bij: `chat_messages_update` eist in zijn `with check` dat `sender_id =
--    auth.uid()`, en `null = auth.uid()` is null, dus de policy weigert.

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
  new.type         := old.type;
  new.system_event := old.system_event;
  new.created_at   := old.created_at;

  -- ⚠️ Eén uitzondering: een afzender mag verdwijnen. Dat is de referentiële
  --    actie van `chat_messages_sender_id_fkey` bij een verwijderd account
  --    (Q-TODO A3). Elke andere wijziging aan `sender_id` — naar een ander
  --    profiel, of van leeg naar gevuld — gaat gewoon terug.
  if old.sender_id is null or new.sender_id is not null then
    new.sender_id := old.sender_id;
  end if;

  return new;
end;
$$;

comment on function stamp_chat_message() is
  'Een bericht hoort bij het gesprek waar het geplaatst is. Alleen body en '
  'attachment_url zijn te bewerken; groep, type en tijd liggen vast. De afzender '
  'ligt ook vast, met één uitzondering: hij mag leeggezet worden, want dat is de '
  'referentiële actie bij een verwijderd account (Q-TODO A3, migratie 0033).';

revoke all on function stamp_chat_message() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wat er al kapot was rechtzetten
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elke afzender die naar een verdwenen profiel wijst, wordt alsnog leeggezet.
--    Idempotent: staat er niets meer open, dan raakt dit geen rij.

update chat_messages m
set sender_id = null
where m.sender_id is not null
  and not exists (select 1 from profiles p where p.id = m.sender_id);
