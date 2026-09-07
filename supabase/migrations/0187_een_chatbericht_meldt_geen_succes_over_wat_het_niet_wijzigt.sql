-- 0187_een_chatbericht_meldt_geen_succes_over_wat_het_niet_wijzigt.sql — stille terugzetting op chat_messages (QS8-326)
--
-- ROLLBACK-PAD:
--   `stamp_chat_message()` terugzetten uit `0086_onveranderlijkheid_botst_met_set_null.sql`.
--   `create or replace` zonder handtekeningwijziging, dus er hoeven geen grants
--   opnieuw uitgedeeld te worden en de trigger blijft staan zoals hij staat.
--   Deze migratie raakt geen gegevens: ze schrijft geen enkele rij.
--
-- ---------------------------------------------------------------------------
-- Wat er stil was
-- ---------------------------------------------------------------------------
--
-- `stamp_chat_message()` zet bij een UPDATE acht kolommen terug en werpt nergens.
-- Een client die er een verandert, krijgt HTTP 200 met de oude rij terug.
--
-- 📏 Gemeten op de lokale stack, als `authenticated` afzender binnen het
-- bewerkvenster:
--
--   alleen `body`                 body verandert                       (bedoeld)
--   `body` + `type = 'system'`    body verandert, type blijft `text`   (half stil)
--   alleen `payload`              **succes, en er verandert niets**    (volledig stil)
--
-- Die derde is de zuivere vorm van QS8-314: de server meldt succes over een
-- wijziging die hij zelf heeft teruggedraaid.
--
-- ---------------------------------------------------------------------------
-- Waarom werpen hier mag, en wat het níet mag raken
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De grens loopt niet bij "is er iets veranderd" maar bij "wie verandert
-- het".** `chat_messages` heeft drie foreign keys naar `profiles` met
-- `on delete set null`:
--
--   chat_messages_sender_id_fkey   ON DELETE SET NULL
--   chat_messages_actor_id_fkey    ON DELETE SET NULL
--   chat_messages_subject_id_fkey  ON DELETE SET NULL
--
-- Een verwijderd account voert dus zélf een UPDATE uit die dwars door deze
-- trigger gaat. 📏 Nagemeten: `delete from profiles` zet alle drie de kolommen op
-- NULL en het bericht blijft staan — precies wat 0033 belooft, anonimiseren en
-- niet wissen. **Een kale `is distinct from` zou daar op afgaan en het
-- verwijderen van een account breken.**
--
-- Dat is de naad van dit issue (regel 18, vraag 1): de trigger is correct, de
-- foreign key is correct, en ze raken elkaar op precies één overgang — gevuld
-- naar NULL op de drie persoonskolommen. Die overgang blijft daarom
-- ongemoeid; élke andere verandering aan een gepinde kolom werpt.
--
-- 📏 **En er is geen aanroeper die hierdoor omvalt.** Nagemeten over de hele
-- client: er is géén enkele `.update()` op `chat_messages` — `chat.ts` doet een
-- insert (r.214) en een delete (r.252) en verder niets. Ook geen enkele functie
-- in het schema werkt de tabel bij. Het bewerkvenster van vijftien minuten uit
-- `chat_messages_update` heeft dus vandaag geen client; de stille weg was alleen
-- met een rechtstreeks PostgREST-verzoek te bereiken. Werpen kan hier dus geen
-- bestaande stroom breken, en dát is gemeten en niet aangenomen.
--
-- ⚠️ `body` en `attachment_url` blijven vrij bewerkbaar. De toets hangt aan
-- `is distinct from` per kolom en niet aan een rol, dus een verzoek dat alleen de
-- tekst wijzigt blijft een gewone update — zelfde vorm als bij `group_members`.
--
-- ⚠️ **Werpen is hier veiliger dan zwijgen, ook al staat deze tabel in de
-- realtime-publicatie.** Een `raise` in een BEFORE-trigger breekt het statement
-- af: geen rijwijziging, dus ook geen realtime-gebeurtenis. Zwijgen laat een rij
-- door die de client anders denkt te hebben.

create or replace function public.stamp_chat_message()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;

  -- ⚠️⚠️ **Eerst melden, dan pas pinnen** (QS8-326). Tot 0187 werd hieronder
  --    stilzwijgend teruggezet en kreeg de beller HTTP 200 over een wijziging
  --    die niet gebeurd is.
  --
  --    De drie persoonskolommen dragen een uitzondering en die is de hele reden
  --    dat deze toets niet één regel is: `on delete set null` op `sender_id`,
  --    `actor_id` en `subject_id` laat Postgres zélf een UPDATE doen als een
  --    profiel verdwijnt. Alleen gevuld → NULL is dus toegestaan; dat is de
  --    foreign key en geen client. Alles anders is een poging.
  if new.group_id     is distinct from old.group_id
     or new.type         is distinct from old.type
     or new.system_event is distinct from old.system_event
     or new.created_at   is distinct from old.created_at
     or new.payload      is distinct from old.payload
     or (new.subject_id is distinct from old.subject_id and new.subject_id is not null)
     or (new.actor_id   is distinct from old.actor_id   and new.actor_id   is not null)
     or (new.sender_id  is distinct from old.sender_id  and new.sender_id  is not null)
  then
    raise exception 'Aan een chatbericht zijn alleen de tekst en de bijlage te wijzigen'
      using errcode = 'check_violation',
            hint = 'group_id, type, system_event, created_at, payload en de drie persoonskolommen liggen vast zodra het bericht er staat.';
  end if;

  new.group_id     := old.group_id;
  new.type         := old.type;
  new.system_event := old.system_event;
  new.created_at   := old.created_at;

  -- `payload` blijft hard terug: geen foreign key, dus geen referentiële actie
  -- die hier doorheen moet.
  new.payload      := old.payload;

  -- ⚠️ De drie persoonskolommen volgen alle drie hetzelfde patroon, en dat is de
  --    correctie van 0059: alleen van gevuld naar NULL mag erdoor, want dat is
  --    precies wat `on delete set null` doet. Alles anders wordt teruggedraaid.
  --
  --    ⚠️ Sinds 0187 is dit een vangnet en niet meer de grendel: wat hier nog
  --    teruggezet zou worden, is hierboven al geworpen. Het blijft staan omdat
  --    een pin die niets meer doet goedkoper is dan een pin die je weghaalt en
  --    later mist — en omdat de gevuld→NULL-tak wél nog werk doet.
  if old.subject_id is null or new.subject_id is not null then
    new.subject_id := old.subject_id;
  end if;

  if old.actor_id is null or new.actor_id is not null then
    new.actor_id := old.actor_id;
  end if;

  if old.sender_id is null or new.sender_id is not null then
    new.sender_id := old.sender_id;
  end if;

  return new;
end;
$$;

comment on function public.stamp_chat_message() is
  'Zet created_at bij INSERT en houdt de metagegevens van een chatbericht vast bij '
  'UPDATE. Sinds 0187 (QS8-326) werpt hij op een poging in plaats van stil terug te '
  'zetten; alleen gevuld naar NULL op sender_id, actor_id en subject_id gaat door, '
  'want dat is on delete set null en geen client.';
