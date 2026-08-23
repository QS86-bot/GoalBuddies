-- 0060_subject_id_mag_leeglopen.sql — nazorg op mijn eigen 0059
--
-- ROLLBACK-PAD:
--   de versie van stamp_chat_message() uit 0059 terugzetten (die `subject_id`
--   hard terugzet). ⚠️ Doe dat niet: zie hieronder waaróm die versie kapot is.
--
-- ---------------------------------------------------------------------------
-- Wat er misging, en het staat al sinds 0033 in dit project opgeschreven
-- ---------------------------------------------------------------------------
--
-- `docs/WERKVOORRAAD.md` §8 punt 8:
--
--   "Een onveranderlijkheidstrigger sloopt stil een `on delete set null`. Een
--    referentiële actie is zelf een UPDATE op de kindtabel; staat daar een BEFORE
--    UPDATE-trigger die de kolom terugzet naar `old`, dan draait die de actie in
--    dezelfde bewerking terug."
--
-- 0059 heeft `subject_id` toegevoegd mét `on delete set null` én mét een regel
-- `new.subject_id := old.subject_id` in `stamp_chat_message()`. Precies de val
-- waar die aantekening voor bestaat, in de migratie die hem in zijn eigen kop
-- citeert — voor `actor_id` was hij wél toegepast en voor `subject_id` niet.
--
-- ⚠️ **En het gedrag is hier erger dan in 0031.** Daar draaide de trigger de
--    anonimisering stil terug: geen fout, wel een verwijzing naar een profiel dat
--    niet meer bestond. Hier wordt de kolom teruggezet naar een id dat Postgres
--    daarna opnieuw tegen de foreign key houdt, en dan faalt de hele DELETE:
--
--      ERROR: insert or update on table "chat_messages" violates foreign key
--             constraint "chat_messages_subject_id_fkey"
--
--    Gevolg: `verwijder_mijn_account()` valt om zodra je in één systeembericht
--    genoemd wordt — en dat ben je na één keer meedoen aan een groep.
--    Aangetoond tegen het echte project in een teruggedraaide transactie.
--
-- ⚠️ **Waarom "gevuld mag naar NULL" hier veilig is**, en dezelfde afweging als
--    bij `sender_id` in 0033: de enige UPDATE die een client mag doen, is zijn
--    eigen tekstbericht binnen het bewerkvenster (`chat_messages_update` eist
--    `sender_id = auth.uid()`). Zulke rijen hebben geen `subject_id`, dus voor de
--    client verandert er niets. De enige schrijver die deze tak nodig heeft, is de
--    referentiële actie zelf.

begin;

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
  --    Ze staan bewust naast elkaar en niet verspreid: het verschil tussen deze
  --    drie en de vier regels hierboven is de hele bug, en die moet je in één
  --    oogopslag zien.
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

commit;
