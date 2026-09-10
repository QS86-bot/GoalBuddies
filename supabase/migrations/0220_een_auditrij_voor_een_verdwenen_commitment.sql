-- 0220_een_auditrij_voor_een_verdwenen_commitment.sql — `noteer_commitment()`
-- schrijft geen spoorregel meer voor een commitment dat in dezelfde statement al
-- weggecascadeerd is (QS8-361)
--
-- ROLLBACK-PAD:
--   Zet `noteer_commitment()` terug naar de vorm van 0059. Het is een
--   `create or replace`, dus de trigger, de grants en `comment on function`
--   blijven staan en er valt verder niets terug te draaien.
--
--   ⚠️ Terugdraaien zet het gat van dit issue terug: een bulkverwijdering die
--      een eigenaar én zijn getuige in één statement raakt, valt dan weer om.
--
-- ---------------------------------------------------------------------------
-- De meting
-- ---------------------------------------------------------------------------
--
-- 📏 Opstelling gecommit in een eerdere transactie — dus zoals de app hem heeft —
--    en daarna in één statement verwijderd:
--
--   delete from auth.users where id in (<eigenaar>, <getuige>);
--
--   ERROR:  insert or update on table "commitment_events" violates foreign key
--           constraint "commitment_events_commitment_id_fkey"
--   DETAIL: Key (commitment_id)=(…) is not present in table "commitments".
--   CONTEXT: PL/pgSQL function noteer_commitment()
--
--   Eén voor één, in twee statements: `{"ok": true}`.
--
-- ⚠️ **Dat verschil is de hele bug.** Eén statement raakt twee cascades tegelijk:
--    via `goals` wordt het commitment **verwijderd**, en via `profiles` wordt
--    `beneficiary_user_id` op NULL gezet. Die tweede is een UPDATE, dus deze
--    AFTER-trigger vuurt — voor een rij die er niet meer is.
--
-- ⚠️ **Geen zelfbedieningspad**: `verwijder_mijn_account()` verwijdert één
--    gebruiker. Dit is wat een bulkverwijdering doet — een AVG-opschoning, een
--    retentiejob, een `delete ... where id in (...)` op het dashboard. Dat is de
--    dag waarop het stukgaat, en dan onverwacht.
--
-- ---------------------------------------------------------------------------
-- Waarom de grendel op het bestáán van het commitment staat
-- ---------------------------------------------------------------------------
--
-- De voor de hand liggende reparatie is: sla de spoorregel over zodra de
-- begunstigde verdwijnt. ⚠️ **Dat is fout, en gemeten fout.** Verwijdert alléén
-- de getuige zijn account, dan blijft het commitment gewoon bestaan en is
-- "de begunstigde is weg" een echte gebeurtenis die in het spoor hoort — 0059
-- noemt hem met zoveel woorden (`edited`). 📏 Nagemeten: met deze grendel staat
-- die `edited`-rij er nog steeds.
--
-- De grendel toetst daarom niet wát er verandert maar óf het onderwerp er nog is.
-- Dat is dezelfde vorm als de `v_actor`-regel er twee blokken onder, die al
-- bestond: een verwijzing naar iets dat verdwijnt, is geen fout maar een reden om
-- minder op te schrijven.
--
-- ⚠️ **En het is geen verlies aan spoor.** `commitment_events.commitment_id`
--    heeft `on delete cascade`: verdwijnt het commitment, dan verdwijnt zijn hele
--    spoor. Een rij schrijven op weg naar buiten is werk dat niemand ooit leest —
--    het enige dat het doet is de verwijdering laten omvallen.

--
-- ⚠️ **Deze migratie heette `0207` op zijn branch, en vier gelande migraties
--    verwijzen nog naar dat nummer.** In het `sleutelzetters()`-register van
--    0208, 0214, 0215 en 0217 staat de zin *"deze vijf komen uit 0207
--    (QS8-361)"*. Die staat er terecht: op het moment van schrijven dróég deze
--    migratie dat nummer op zijn branch, en het is een verhaal over een
--    merge-moment en niet een verwijzing naar een bestand.
--
--    ⚠️ **Ze zijn met opzet niet meegehernummerd.** Die vier staan al op `main`
--    en hun tekst zit ín een `create or replace function`-lichaam; een gelande
--    migratie herschrijven om een kruisverwijzing recht te zetten is een groter
--    risico dan een nummer dat naar het verleden wijst. Wie vanaf die kant zoekt,
--    komt via deze regel hier uit.

create or replace function public.noteer_commitment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_soort      text;
  v_doelstatus text;
  v_actor      uuid;
begin
  -- ⚠️ **Het onderwerp kan in dezelfde statement al weg zijn** — QS8-361. Zie de
  --    kop: één `delete` die een eigenaar én zijn getuige raakt, verwijdert het
  --    commitment via `goals` en zet tegelijk `beneficiary_user_id` op NULL via
  --    `profiles`. Die tweede vuurt deze trigger voor een rij die niet meer
  --    bestaat, en de foreign key weigert de spoorregel — waarmee de hele
  --    verwijdering omvalt.
  --
  --    De retourwaarde van een AFTER-trigger wordt genegeerd; `null` staat hier
  --    omdat het leest als "en verder niets".
  if tg_op = 'UPDATE' and not exists (select 1 from commitments c where c.id = new.id) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_soort := 'confirmed';
  elsif old.status is distinct from new.status then
    v_soort := case
                 when new.status = 'cancelled' then 'cancelled'
                 when new.status = 'resolved'  then 'resolved'
                 -- ⚠️ **Vóór de `else`, want die vangt alles op** (QS8-308).
                 --    Een straf die van `due` terugkomt naar `set` is het
                 --    tegenovergestelde van triggeren, en zonder deze regel
                 --    stond dat als `triggered` in het spoor.
                 when old.status = 'due' and new.status = 'set' then 'reverted'
                 else 'triggered'          -- unlocked en due
               end;
  else
    -- Alleen de tekst veranderd, of de begunstigde die verdween.
    v_soort := 'edited';
  end if;

  select g.status into v_doelstatus from goals g where g.id = new.goal_id;

  -- ⚠️ **Een actor die niet meer bestaat, is `null` en niet een foutmelding.**
  --    Tijdens het verwijderen van een account is `auth.uid()` een profiel dat
  --    er al niet meer is, en de foreign key weigert dan de spoorregel —
  --    waarmee de hele accountverwijdering omvalt.
  select case when exists (select 1 from profiles p where p.id = auth.uid())
              then auth.uid()
         end
    into v_actor;

  insert into commitment_events (commitment_id, actor_id, event_type, payload)
  values (
    new.id,
    v_actor,
    v_soort,
    jsonb_build_object(
      'type',       new.type,
      'van',        case when tg_op = 'INSERT' then null else old.status end,
      'naar',       new.status,
      'doelstatus', v_doelstatus
    )
  );

  return new;
end;
$function$;
