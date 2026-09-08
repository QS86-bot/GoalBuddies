-- 0208_een_grendel_die_alleen_in_commentaar_staat_is_geen_grendel.sql —
-- `onveranderlijkheid_bewaking()` leest de code en niet de uitleg erboven (QS8-364)
--
-- ROLLBACK-PAD:
--   Zet `onveranderlijkheid_bewaking()` terug naar de vorm van 0086. Het is een
--   `create or replace`, dus de grants en `comment on function` blijven staan.
--
--   ⚠️ Terugdraaien zet de teller terug op groen voor `groups.created_by`, en
--      dan is dat groen weer gebaseerd op een zin die uitlegt waarom de grendel
--      er níét is.
--
-- ---------------------------------------------------------------------------
-- De meting
-- ---------------------------------------------------------------------------
--
-- 📏 Dezelfde query, één keer met en één keer zonder `--`-commentaar in de bron:
--
--   chat_messages.actor_id   (stamp_chat_message)   true   -> true
--   chat_messages.sender_id  (stamp_chat_message)   true   -> true
--   chat_messages.subject_id (stamp_chat_message)   true   -> true
--   groups.created_by        (guard_group_update)   true   -> **false**
--
--   Eén rij van de vier is groen dankzij proza. Dat is precies de vraag van
--   acceptatiecriterium 4 — en het antwoord is dus "één", gemeten en niet
--   aangenomen.
--
-- ⚠️ **`pg_get_functiondef()` geeft het lichaam inclusief commentaar**, en in
--    `guard_group_update()` staat de grendelvorm sinds 0202 alléén nog in een
--    regel die uitlegt waarom hij weg is:
--
--      --    Daar stond `if old.created_by is null or new.created_by is not null`
--
--    De code eronder is `new.created_by := old.created_by;` — onvoorwaardelijk.
--
-- ---------------------------------------------------------------------------
-- Twee regexen en niet één
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het issue noemt de grendel-regex. Deze functie leest de bron **twee keer**,
--    en de `where` heeft dezelfde blinde vlek: `new.<kolom> := old.<kolom>` in
--    een commentaarregel zou een rij oplevéren die er niet hoort, of — na een
--    herschrijving — er een laten verdwijnen. Allebei lezen nu de gestripte
--    bron. 📏 Vandaag verandert de rijenverzameling er niet van; het gat was er
--    wel.
--
-- ---------------------------------------------------------------------------
-- Waarom kaal strippen hier veilig is
-- ---------------------------------------------------------------------------
--
-- `regexp_replace(bron, '--[^\n]*', '', 'g')` kent het verschil niet tussen een
-- commentaarstreepje en twee streepjes in een stringliteral.
--
-- 📏 Nagemeten over álle BEFORE UPDATE-triggerfuncties: nul functies met
--    blokcommentaar, en nul regels met `--` binnen een stringliteral. Er valt
--    hier vandaag dus niets te veel weg te strippen.
--
-- ⚠️ **En als dat ooit wél gebeurt, faalt het de goede kant op.** Te veel
--    strippen haalt alleen tekst weg, en dan vindt de regex zijn vorm niet meer:
--    de uitkomst is een rij die als "kaal" gemeld wordt terwijl hij dat niet is.
--    Dat is een valse melding en geen vals groen — luid en niet stil.

create or replace function public.onveranderlijkheid_bewaking()
returns table(tabel text, trigger_naam text, functie text, kolom text, heeft_grendel boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with set_null as (
    select c.conrelid::regclass::text as tabel, a.attname::text as kolom
    from pg_constraint c
    join unnest(c.conkey) as k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and c.confdeltype = 'n'                    -- ON DELETE SET NULL
      and c.connamespace = 'public'::regnamespace
  ),
  before_update as (
    select t.tgrelid::regclass::text as tabel,
           t.tgname::text            as trigger_naam,
           p.proname::text           as functie,
           -- ⚠️ **Zonder commentaar** — QS8-364. Zie de kop: `pg_get_functiondef()`
           --    geeft de uitleg mee, en een grendel die alleen in een zin bestaat
           --    is geen grendel. Dit is dezelfde reparatie als de bronscan van
           --    QS8-325 en dezelfde gedachte als `keten:controle`: de tekst óver
           --    code is geen code.
           regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g') as bron
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and (t.tgtype & 2)  <> 0                   -- BEFORE
      and (t.tgtype & 16) <> 0                   -- UPDATE
  )
  select b.tabel, b.trigger_naam, b.functie, s.kolom,
         b.bron ~* ('old\.' || s.kolom || '\s+is\s+null\s+or\s+new\.'
                    || s.kolom || '\s+is\s+not\s+null')
  from before_update b
  join set_null s on s.tabel = b.tabel
  -- Alleen de kolommen die de trigger daadwerkelijk terugzet. Leest sinds 0208
  -- dezelfde gestripte bron als de grendeltoets hierboven.
  where b.bron ~* ('new\.' || s.kolom || '\s*:=\s*old\.' || s.kolom)
  order by b.tabel, s.kolom;
$function$;
