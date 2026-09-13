-- 0260_goal_events_krijgt_een_grens_op_vorm_en_omvang.sql — `old_value` en
-- `new_value` krijgen een grens op omvang én op welke sleutels erin mogen
-- (QS8-464).
--
-- ROLLBACK-PAD:
--   alter table public.goal_events drop constraint if exists goal_events_waarde_omvang;
--   alter table public.goal_events drop constraint if exists goal_events_waarde_sleutels;
--   drop function if exists public.goal_event_sleutels_kloppen(text, jsonb, jsonb);
--   Geen kolom, policy of bestaande CHECK gewijzigd.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Middel-rij 519 uit `docs/ENGINEER-REVIEW.md` (06-09-2026), op 13-09
--    nagemeten. De enige CHECK op deze tabel was `goal_events_type_valid` — een
--    allowlist van vier `event_type`-waarden. Op `old_value` en `new_value` stond
--    **niets**: geen vorm, geen grens, geen type. `logGoalEvent()` neemt
--    `oud: Json, nieuw: Json` en geeft ze ongewijzigd door.
--
--    Als gewone `authenticated` met eigen JWT, end-to-end:
--
--      insert into goal_events (..., new_value)
--      values (..., jsonb_build_object('rommel', repeat('x', 5000000)));
--      -> GELUKT: 56 kB in één rij
--
--    Vijf miljoen tekens, geaccepteerd. Op de gratis tier is dat een reële
--    vector, en deze tabel is append-only: het gaat er nooit meer uit.
--
-- 📏 De legitieme payloads van vandaag, ter vergelijking:
--
--      created met een titel van 200 tekens (het maximum) -> 213 tekens
--      deadline_moved in zijn echte vorm                  -> 112 tekens
--
--    De schrijver had dus ruwweg 25.000× speling.
--
-- ⚠️ **En elke gekoppelde groep leest dit mee** via `goal_events_select`.
--    `goal_events_bewaking()` (0181) bewaakt de **naam** van een gebeurtenis en
--    niet de **inhoud**; zet een toekomstige feature een toelichting in
--    `new_value`, dan leest groep A wat voor groep B bedoeld was terwijl de
--    allowlist onveranderd op vier staat. Deze tabel is langs precies die weg al
--    een keer gelekt (0085).
--
-- ---------------------------------------------------------------------------
-- Twee grenzen, want één is te weinig
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen een omvangsgrens houdt een vrije-tekstveld `reden` niet tegen — en
--    dát is het lek uit de rij. Alleen een sleutelgrens laat een toegestane
--    sleutel met een megabyte erin staan. Daarom allebei.
--
-- ⚠️ `char_length(...::text)` en niet `pg_column_size()`: dat laatste meet de
--    gecomprimeerde opslag na TOAST en is geen stabiele grondslag voor een CHECK.
--    Gemeten: dezelfde 5 MB gaf `56 kB` als kolomgrootte.
--
-- ---------------------------------------------------------------------------

-- ⚠️ 2000 en niet 213: ruim tienvoudig boven het huidige maximum, zodat een
--    legitieme uitbreiding niet meteen een migratie vraagt, en nog altijd vier
--    ordes onder het misbruik hierboven.
alter table public.goal_events drop constraint if exists goal_events_waarde_omvang;

alter table public.goal_events
  add constraint goal_events_waarde_omvang
  check (
    char_length(coalesce(old_value, 'null'::jsonb)::text) <= 2000
    and char_length(coalesce(new_value, 'null'::jsonb)::text) <= 2000
  );

-- ---------------------------------------------------------------------------

-- ⚠️ `immutable`: hij hangt alleen van zijn invoer af. Dat moet ook, want de
--    CHECK hieronder roept hem aan.
--
-- ⚠️ **Het register staat in het functielichaam en niet in een tabel** — zelfde
--    reden als `sleutelzetters()`: in één blik naast de code te lezen, geen RLS
--    en geen grant nodig, en niet leeg te raken zonder dat iemand het merkt.
--    ⚠️ Breid je het uit, kopieer het lichaam dan van `main` (registerdrift).
--
-- ⚠️⚠️ **Een niet-object faalt dicht.** `jsonb_object_keys()` wérpt op een
--    scalar of een array, en een CHECK die werpt is een schrijffout en geen
--    weigering. Daarom eerst `jsonb_typeof(...) = 'object'`: alles wat geen
--    object en geen `null` is, wordt geweigerd. Dat is de juiste kant op —
--    `goal_events_bewaking()` leerde dat een bewaking die niet zegt dat hij het
--    niet begreep, gevaarlijker is dan geen bewaking.
create or replace function public.goal_event_sleutels_kloppen(
  p_type text, p_oud jsonb, p_nieuw jsonb
)
returns boolean
language sql
immutable
set search_path to 'pg_catalog'
as $$
  with toegestaan(kant, sleutels) as (
    -- Het register, per gebeurtenis. Gemeten tegen élke schrijver in het schema:
    --   created         new  {title}                                    (client)
    --   deadline_moved  oud  {target_date}
    --                   new  {target_date, request_id, straffen_teruggezet}
    --   archived        beide null
    --   completed       beide null
    values
      ('oud', case p_type
                when 'deadline_moved' then array['target_date']
                else array[]::text[] end),
      ('nieuw', case p_type
                  when 'created' then array['title']
                  when 'deadline_moved'
                    then array['target_date', 'request_id', 'straffen_teruggezet']
                  else array[]::text[] end)
  ),
  waarde(kant, v) as (
    values ('oud', p_oud), ('nieuw', p_nieuw)
  )
  select not exists (
    select 1
    from waarde w
    join toegestaan t on t.kant = w.kant
    where w.v is not null
      and (
        -- Geen object en niet `null`: dicht.
        jsonb_typeof(w.v) <> 'object'
        -- Of er zit een sleutel in die niet gewogen is.
        or exists (
          select 1 from jsonb_object_keys(w.v) k
          where k <> all (t.sleutels)
        )
      )
  );
$$;

comment on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb) is
  'Of de sleutels in old_value/new_value gewogen zijn voor dit event_type — QS8-464. '
  'Het register staat in het lichaam; goal_events_waarde_sleutels dwingt het af.';

-- ⚠️⚠️ **`revoke` én daarna een `grant` aan `authenticated`.** 📏 De les van
--    QS8-453: Postgres toetst EXECUTE op een functie in een CHECK op het moment
--    van schrijven, dus zónder deze grant valt élke `goal_events`-insert van een
--    ingelogde gebruiker om op `permission denied` — ook een volkomen normale.
--    De must-allow in de suite staat er om precies die reden.
revoke execute on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb)
  to authenticated;

alter table public.goal_events drop constraint if exists goal_events_waarde_sleutels;

alter table public.goal_events
  add constraint goal_events_waarde_sleutels
  check (public.goal_event_sleutels_kloppen(event_type, old_value, new_value));
