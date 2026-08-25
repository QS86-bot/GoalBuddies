-- 0086_onveranderlijkheid_botst_met_set_null.sql — de val die drie keer toesloeg
--
-- ROLLBACK-PAD:
--   drop function if exists onveranderlijkheid_bewaking();
--   -- en guard_group_update() opnieuw neerzetten met de kale regel
--   --   new.created_by := old.created_by;
--   -- op de plek van de grendel. ⚠️ Neem het lichaam uit pg_get_functiondef()
--   --    en niet uit 0076: daar is `zichtbaarheid` sindsdien bijgekomen.
--
-- ---------------------------------------------------------------------------
-- De val
-- ---------------------------------------------------------------------------
--
-- Een BEFORE UPDATE-trigger die een kolom hard terugzet (`new.x := old.x`)
-- sloopt de referentiële actie `on delete set null` op diezelfde kolom. Postgres
-- voert zo'n actie uit als een gewone UPDATE, dus de trigger draait mee, zet de
-- oude waarde terug — en dan weigert de foreign key hem, want het profiel is net
-- weg. **De hele DELETE valt om.**
--
-- Dit is in dit project **drie keer** gebeurd: 0031, 0033 en 0059 (gedicht in
-- 0060). WERKVOORRAAD §8 punt 8 beschrijft de val sinds 0033, en 0059 citeert
-- hem letterlijk in zijn eigen kop, past hem correct toe op `actor_id` — en
-- vergeet hem één regel lager voor `subject_id`.
--
-- ⚠️ **Dat is de reden dat dit een functie wordt en geen alinea.** De aantekening
--    bestond, werd gelezen, werd overgeschreven, en er werd naast gegrepen. Een
--    vierde keer voorkom je niet door het nóg een keer op te schrijven.
--
-- De juiste vorm is die van 0060: alleen van gevuld naar NULL mag erdoor, want
-- dat is precies wat `on delete set null` doet.
--
--     if old.x is null or new.x is not null then
--       new.x := old.x;
--     end if;

create or replace function onveranderlijkheid_bewaking()
  returns table (
    tabel         text,
    trigger_naam  text,
    functie       text,
    kolom         text,
    heeft_grendel boolean
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
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
           pg_get_functiondef(p.oid) as bron
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
  -- Alleen de kolommen die de trigger daadwerkelijk terugzet.
  where b.bron ~* ('new\.' || s.kolom || '\s*:=\s*old\.' || s.kolom)
  order by b.tabel, s.kolom;
$$;

comment on function onveranderlijkheid_bewaking() is
  'Elke BEFORE UPDATE-trigger die een kolom met on delete set null hard '
  'terugzet, met of hij de grendel uit 0060 heeft. Statisch af te leiden uit '
  'pg_constraint plus de functiebron — het voorstel uit docs/ENGINEER-REVIEW.md '
  'van 21-08-2026, dat alle drie de eerdere keren gewerkt zou hebben. '
  'Zonder zo''n functie kan een test die via PostgREST praat niet bij pg_trigger; '
  'zelfde reden als realtime_bewaking() (0027).';

revoke all on function onveranderlijkheid_bewaking() from public, anon;
grant execute on function onveranderlijkheid_bewaking() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- En de ene die hij vandaag vindt
-- ---------------------------------------------------------------------------
--
-- `guard_group_update()` zet `groups.created_by` hard terug, en die kolom heeft
-- `on delete set null`. Dat is de vierde keer dezelfde vorm.
--
-- ⚠️ **Het is vandaag géén bug, en dat is nagemeten en niet aangenomen.** Een
--    account opzeggen werkt: in een teruggedraaide transactie op het echte
--    project een profiel aangemaakt, een groep laten maken en het account
--    verwijderd — de DELETE lukt. Drie dingen houden het tegen:
--
--      1. `authenticated` heeft geen UPDATE-recht op `created_by` (de kolomgrant
--         noemt alleen name, icon, huddle_day, tz, evidence_policy,
--         approval_rule en season_cadence).
--      2. De cascade draait niet als `authenticated`, en dan stapt de trigger er
--         bij de eerste regel al uit.
--      3. `verwijder_mijn_account()` is security definer, dus `current_user` is
--         daar de eigenaar en niet de gebruiker.
--
-- ⚠️ **Maar reden 2 is precies het construct dat al op de review-agenda staat**
--    ("`guard_group_update` en `current_user`", 21-08): een trigger die op een
--    rolnaam beslist, faalt open. Wie die vroege uitstap ooit weghaalt — en de
--    review kan dat terecht voorstellen — maakt hier stilzwijgend de vierde keer
--    van. De veiligheid van vandaag hangt aan een regel die morgen weg kan.
--
-- Drie regels halen die afhankelijkheid eruit. Dat is goedkoper dan de
-- aantekening die het drie keer niet gered heeft.
--
-- ⚠️ Het lichaam komt uit `pg_get_functiondef()` en niet uit 0076: `zichtbaarheid`
--    is daar sindsdien bij gekomen.

create or replace function guard_group_update()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  new.id               := old.id;
  new.created_at       := old.created_at;
  new.invite_code      := old.invite_code;
  new.invite_revoked   := old.invite_revoked;
  new.status           := old.status;
  new.last_activity_at := old.last_activity_at;
  new.zichtbaarheid    := old.zichtbaarheid;

  -- ⚠️ De grendel van 0060, en niet de kale regel die hier stond. `created_by`
  --    heeft `on delete set null`: leeglopen moet erdoor, alles anders niet.
  if old.created_by is null or new.created_by is not null then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

comment on function guard_group_update() is
  'Houdt de onveranderlijke kolommen van groups op hun plek. ⚠️ created_by volgt '
  'de grendel uit 0060 en niet de kale toewijzing: die kolom heeft on delete set '
  'null, en een harde terugzetting laat het verwijderen van een account omvallen. '
  'onveranderlijkheid_bewaking() (0086) toetst dat er geen tweede zo''n kolom bij komt.';
