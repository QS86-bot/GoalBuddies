-- 0192_een_dagplafond_begrenst_ook_de_batch.sql — een dagplafond begrensde
-- wanneer je mocht beginnen, niet hoeveel je invoegde (QS8-343)
--
-- ROLLBACK-PAD:
--   drop trigger if exists <naam> on <tabel>;   -- de acht hieronder
--   drop function if exists public.begrens_<naam>();
--   drop function if exists public.<naam>_plafond();
--   en de vijf `*_over()` terugzetten uit hun laatste definitie vóór deze
--   migratie: `weekdoelen_over()` uit 0083, `berichten_over()` uit 0090,
--   `dagafvinkingen_over()` uit 0122, `weekreacties_over()` uit 0090 en
--   `weekplanstappen_over()` uit 0138. 📏 Nagemeten met een grep over de map:
--   dat zijn de laatste `create or replace` van elk.
--   De vier indexen mogen blijven staan; ze kosten niets en breken niets.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten als gewone `authenticated` gebruiker via PostgREST, tegen
--    `weekly_goals` — een tabel die de limiet **wél** heeft (200 per dag):
--
--      POST 300 weekdoelen in één verzoek, vanaf nul  ->  201, alle 300 geland
--
-- `weekdoelen_over()` is `STABLE SECURITY DEFINER` en telt gecommitte rijen.
-- Binnen één INSERT-statement ziet hij de snapshot van vóór dat statement, dus
-- de rijen die op dát moment ingevoegd worden tellen niet mee. Elke rij in de
-- batch leest dezelfde teller en komt tot hetzelfde antwoord.
--
-- ⚠️ **De limiet begrensde dus wanneer je mocht beginnen, niet hoeveel je
--    invoegde.** Stond je onder de drempel, dan was één verzoek genoeg voor een
--    onbegrensd aantal rijen. Dat is de vorm waar dit project een naam voor
--    heeft: een deur die alleen dichtzit omdat er verderop een `if` staat.
--
-- ---------------------------------------------------------------------------
-- Waarom nu wél een trigger — en waarom 0083 het tegenovergestelde besloot
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **0083 koos met zoveel woorden een policy en géén trigger**, met deze
--    reden: *"Een trigger zou voor beide gelden, en een trigger die op een
--    rolnaam beslist faalt open."* Die redenering staat nog steeds, en daarom
--    beslist deze trigger **niet op een rolnaam** maar op de aanwezigheid van
--    een sessie: `auth.uid() is null` betekent overslaan.
--
-- ⚠️ **En die tak kan niet als achterdeur dienen, wat de kern van het bezwaar
--    was.** Voor een client mét sessie slaat de trigger toe. Voor een client
--    zónder sessie is `auth.uid()` leeg — en dan weigert de policy hem al, want
--    élke `*_over()` geeft bij een lege `auth.uid()` nul terug en de policy eist
--    `> 0`. De enige aanroeper die de lege tak bereikt, is er een die RLS
--    sowieso omzeilt: `service_role`. 📏 Gemeten: `set role service_role` zonder
--    JWT-claims geeft `auth.uid() = NULL`, en dat is hoe de rollover en de
--    notificatiejob verbinden.
--
--    Anders gezegd: de trigger faalt niet open, want wie langs de lege tak komt,
--    was al langs de policy gekomen. Dezelfde vorm die
--    `guard_group_member_update()` gebruikt.
--
-- ---------------------------------------------------------------------------
-- De vorm van de grens
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een absolute telling en geen optelsom.** De trigger telt ná het statement
--    hoeveel rijen er in het venster staan en vergelijkt dát met het plafond.
--    De verleiding is om `count(*) from nieuw` bij `*_over()` op te tellen, maar
--    dan hangt de uitkomst af van de vraag of `*_over()` de zojuist ingevoegde
--    rijen al ziet — een snapshot-vraag met een subtiel antwoord, en precies het
--    soort aanname waar dit gat uit ontstaan is. De absolute telling heeft die
--    vraag niet: wat er staat, staat er.
--
-- ⚠️ **`nieuw` wordt alleen gebruikt om de melding te kunnen invullen**, niet om
--    te beslissen. Zonder transitietabel weet de gebruiker niet of hij er één te
--    veel of duizend te veel aanbood.
--
-- ⚠️ **De policy blijft staan naast de trigger.** Ze doen niet hetzelfde: de
--    policy weigert je te beginnen als je al op het plafond zit (403, en dat is
--    de melding die de app vandaag toont), de trigger weigert de batch die er
--    overheen gaat. De policy weghalen zou het gedrag veranderen dat de suite al
--    vastlegt, en twee remmen op één limiet is hier geen dubbeling maar diepte.
--
-- ⚠️ **Het plafond staat vanaf nu op één plek.** Het getal stond als letterlijke
--    waarde in `*_over()`; nu geeft `<naam>_plafond()` het, en zowel de teller
--    als de trigger leest die. Twee plekken met hetzelfde getal is hoe ze uit
--    elkaar gaan lopen — en dan begrenst de policy iets anders dan de trigger.
--
-- ---------------------------------------------------------------------------
-- De drie tabellen die helemaal geen plafond hadden
-- ---------------------------------------------------------------------------
--
-- 📏 `goals`, `milestones` en `goal_events` hadden geen teller: 500 doelen in
--    één verzoek landde in 101 ms. Bij ~376 byte per doelrij inclusief indexen
--    is de 500 MB van de gratis tier in minuten vol te schrijven vanaf één
--    gewoon account — en er zijn geen automatische backups.
--
-- ⚠️ Ze krijgen alléén een trigger en geen `*_over()`: er is geen policy die een
--    teller aanroept, en de trigger dekt zowel de batch als de druppel. Een
--    tweede mechanisme zou hier niets toevoegen.
--
-- ⚠️ **De plafonds zijn ruim gekozen en dat is met opzet.** Ze hoeven een echte
--    gebruiker nooit te raken; ze hoeven alleen de lus te binden. 0083 rekende
--    voor: tien doelen in één zitting met vijf weekdoelen elk is vijftig. Twee-
--    honderd doelen per dag is daar het twintigvoudige van. Voor `milestones` is
--    duizend gekozen omdat één AI-plan er een stuk of twaalf per doel neerzet en
--    `goals` zelf al op tweehonderd staat.
--
-- ⚠️ **Wat hier níét in zit.** 📏 Achttien tabellen zijn door een client te
--    beschrijven zonder enige teller; deze migratie dekt de acht uit QS8-343.
--    De overige vijftien staan in QS8-344, met de meting erbij. Ze in één
--    migratie meenemen zou van één reparatie een inventarisatie maken.

-- ---------------------------------------------------------------------------
-- 1. De plafonds, op één plek
-- ---------------------------------------------------------------------------

create or replace function public.weekdoelen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.berichten_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 500 $$;
create or replace function public.dagafvinkingen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 500 $$;
create or replace function public.weekreacties_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 100 $$;
create or replace function public.weekplanstappen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.doelen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.mijlpalen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 1000 $$;
create or replace function public.doelgebeurtenissen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 1000 $$;

comment on function public.weekdoelen_plafond() is
  'Het dagplafond uit 0083, sinds 0192 op één plek zodat de policy en de '
  'trigger niet uit elkaar kunnen lopen (QS8-343).';

-- ⚠️ **`revoke` noemt `authenticated` met zoveel woorden** (onwrikbare regel 4).
--    `alter default privileges` deelt élke nieuwe functie in `public` uit aan
--    `anon`, `authenticated` én `service_role`; `from public, anon` ziet eruit
--    als "van iedereen" en houdt precies de rol over waaronder iedere ingelogde
--    gebruiker draait.
--
-- ⚠️ **En `authenticated` heeft ze ook echt niet nodig.** De eerste versie hier
--    hield dat recht met de redenering dat de `*_over()`-tellers onder
--    `authenticated` draaien. Dat klopt niet: die tellers zijn zélf
--    `SECURITY DEFINER`, dus hun lichaam draait met de rechten van de eigenaar
--    en de plafondfunctie wordt daar aangeroepen. Hetzelfde geldt voor de
--    triggerfuncties. Er is geen pad waarlangs een client deze functies zelf
--    moet kunnen uitvoeren — dus gaat het recht eraf.
revoke all on function public.weekdoelen_plafond() from public, anon, authenticated;
revoke all on function public.berichten_plafond() from public, anon, authenticated;
revoke all on function public.dagafvinkingen_plafond() from public, anon, authenticated;
revoke all on function public.weekreacties_plafond() from public, anon, authenticated;
revoke all on function public.weekplanstappen_plafond() from public, anon, authenticated;
revoke all on function public.doelen_plafond() from public, anon, authenticated;
revoke all on function public.mijlpalen_plafond() from public, anon, authenticated;
revoke all on function public.doelgebeurtenissen_plafond() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De vijf tellers lezen voortaan het plafond in plaats van een eigen getal
-- ---------------------------------------------------------------------------
--
-- ⚠️ Gedrag ongewijzigd: hetzelfde getal, dezelfde vorm, dezelfde
--    `auth.uid()`-NULL-tak die dicht faalt. Alleen de bron van het getal
--    verschuift.

create or replace function public.weekdoelen_over() returns integer
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when (select auth.uid()) is null then 0 else greatest(0,
    weekdoelen_plafond() - (
      select count(*)::integer from weekly_goals w join goals g on g.id = w.goal_id
      where g.owner_id = (select auth.uid()) and w.created_at > now() - interval '1 day')) end;
$$;

create or replace function public.berichten_over() returns integer
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when (select auth.uid()) is null then 0 else greatest(0,
    berichten_plafond() - (
      select count(*)::integer from chat_messages m
      where m.sender_id = (select auth.uid()) and m.created_at > now() - interval '1 day')) end;
$$;

create or replace function public.dagafvinkingen_over() returns integer
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when (select auth.uid()) is null then 0 else greatest(0,
    dagafvinkingen_plafond() - (
      select count(*)::integer from day_checkins d
      join weekly_goals w on w.id = d.weekly_goal_id join goals g on g.id = w.goal_id
      where g.owner_id = (select auth.uid()) and d.created_at > now() - interval '1 day')) end;
$$;

create or replace function public.weekreacties_over() returns integer
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when (select auth.uid()) is null then 0 else greatest(0,
    weekreacties_plafond() - (
      select count(*)::integer from week_review_replies r
      where r.author_id = (select auth.uid()) and r.created_at > now() - interval '1 day')) end;
$$;

create or replace function public.weekplanstappen_over() returns integer
 language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select case when (select auth.uid()) is null then 0 else greatest(0,
    weekplanstappen_plafond() - (
      select count(*)::integer from weekly_plan_steps s join goals g on g.id = s.goal_id
      where g.owner_id = (select auth.uid()) and s.created_at > now() - interval '1 day')) end;
$$;

-- ---------------------------------------------------------------------------
-- 3. De indexen die de telling per statement draagt (schaalbaarheidsregel 11)
-- ---------------------------------------------------------------------------
--
-- ⚠️ De trigger telt bij élke insert het venster van een etmaal. Zonder index is
--    dat een seq scan over de hele tabel, en dan is de rem zelf de vertraging.
--    `day_checkins` en `weekly_plan_steps` hadden er geen — hun `*_over()` deed
--    die telling al zonder index, dus dit repareert stilletjes ook dat.

create index if not exists goals_owner_vers_idx on public.goals (owner_id, created_at desc);
create index if not exists milestones_vers_idx on public.milestones (goal_id, created_at desc);
create index if not exists day_checkins_vers_idx on public.day_checkins (weekly_goal_id, created_at desc);
create index if not exists weekly_plan_steps_vers_idx on public.weekly_plan_steps (goal_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. De grens die de batch wél telt
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elke functie heeft dezelfde vorm, en dat is met opzet leesbaar gehouden in
--    plaats van gegeneraliseerd: een transitietabel is bij naam gebonden aan de
--    trigger, en de vensterquery verschilt per tabel omdat de weg naar de
--    eigenaar verschilt. Eén functie met dynamische SQL zou dat verstoppen
--    achter een string.
--
-- ⚠️ `created_at` is nergens door de client te zetten (📏 nagemeten: geen enkele
--    van deze acht tabellen geeft `authenticated` een INSERT-recht op die
--    kolom — dat is het werk van QS8-295). Zonder die eigenschap zou het venster
--    te ontwijken zijn door een datum in het verleden mee te sturen.

create or replace function public.begrens_weekdoelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from weekly_goals w join goals g on g.id = w.goal_id
   where g.owner_id = (select auth.uid()) and w.created_at > now() - interval '1 day';
  if v_totaal > weekdoelen_plafond() then
    raise exception 'Te veel weekdoelen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, weekdoelen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_berichten() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from chat_messages m
   where m.sender_id = (select auth.uid()) and m.created_at > now() - interval '1 day';
  if v_totaal > berichten_plafond() then
    raise exception 'Te veel berichten in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, berichten_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_dagafvinkingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from day_checkins d
    join weekly_goals w on w.id = d.weekly_goal_id join goals g on g.id = w.goal_id
   where g.owner_id = (select auth.uid()) and d.created_at > now() - interval '1 day';
  if v_totaal > dagafvinkingen_plafond() then
    raise exception 'Te veel dagafvinkingen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, dagafvinkingen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_weekreacties() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from week_review_replies r
   where r.author_id = (select auth.uid()) and r.created_at > now() - interval '1 day';
  if v_totaal > weekreacties_plafond() then
    raise exception 'Te veel weekreacties in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, weekreacties_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_weekplanstappen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from weekly_plan_steps s join goals g on g.id = s.goal_id
   where g.owner_id = (select auth.uid()) and s.created_at > now() - interval '1 day';
  if v_totaal > weekplanstappen_plafond() then
    raise exception 'Te veel weekplanstappen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, weekplanstappen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_doelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from goals g
   where g.owner_id = (select auth.uid()) and g.created_at > now() - interval '1 day';
  if v_totaal > doelen_plafond() then
    raise exception 'Te veel doelen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, doelen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_mijlpalen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from milestones m join goals g on g.id = m.goal_id
   where g.owner_id = (select auth.uid()) and m.created_at > now() - interval '1 day';
  if v_totaal > mijlpalen_plafond() then
    raise exception 'Te veel mijlpalen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, mijlpalen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_doelgebeurtenissen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from goal_events e
   where e.actor_id = (select auth.uid()) and e.created_at > now() - interval '1 day';
  if v_totaal > doelgebeurtenissen_plafond() then
    raise exception 'Te veel doelgebeurtenissen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, doelgebeurtenissen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

revoke all on function public.begrens_weekdoelen() from public, anon, authenticated;
revoke all on function public.begrens_berichten() from public, anon, authenticated;
revoke all on function public.begrens_dagafvinkingen() from public, anon, authenticated;
revoke all on function public.begrens_weekreacties() from public, anon, authenticated;
revoke all on function public.begrens_weekplanstappen() from public, anon, authenticated;
revoke all on function public.begrens_doelen() from public, anon, authenticated;
revoke all on function public.begrens_mijlpalen() from public, anon, authenticated;
revoke all on function public.begrens_doelgebeurtenissen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. De triggers
-- ---------------------------------------------------------------------------
--
-- ⚠️ `for each statement` met een transitietabel, en niet `for each row`: één
--    telling per verzoek in plaats van één per rij. Bij een batch van 300 is dat
--    het verschil tussen één vensterquery en driehonderd.

drop trigger if exists weekdoelen_dagplafond on public.weekly_goals;
create trigger weekdoelen_dagplafond after insert on public.weekly_goals
  referencing new table as nieuw for each statement execute function public.begrens_weekdoelen();

drop trigger if exists berichten_dagplafond on public.chat_messages;
create trigger berichten_dagplafond after insert on public.chat_messages
  referencing new table as nieuw for each statement execute function public.begrens_berichten();

drop trigger if exists dagafvinkingen_dagplafond on public.day_checkins;
create trigger dagafvinkingen_dagplafond after insert on public.day_checkins
  referencing new table as nieuw for each statement execute function public.begrens_dagafvinkingen();

drop trigger if exists weekreacties_dagplafond on public.week_review_replies;
create trigger weekreacties_dagplafond after insert on public.week_review_replies
  referencing new table as nieuw for each statement execute function public.begrens_weekreacties();

drop trigger if exists weekplanstappen_dagplafond on public.weekly_plan_steps;
create trigger weekplanstappen_dagplafond after insert on public.weekly_plan_steps
  referencing new table as nieuw for each statement execute function public.begrens_weekplanstappen();

drop trigger if exists doelen_dagplafond on public.goals;
create trigger doelen_dagplafond after insert on public.goals
  referencing new table as nieuw for each statement execute function public.begrens_doelen();

drop trigger if exists mijlpalen_dagplafond on public.milestones;
create trigger mijlpalen_dagplafond after insert on public.milestones
  referencing new table as nieuw for each statement execute function public.begrens_mijlpalen();

drop trigger if exists doelgebeurtenissen_dagplafond on public.goal_events;
create trigger doelgebeurtenissen_dagplafond after insert on public.goal_events
  referencing new table as nieuw for each statement execute function public.begrens_doelgebeurtenissen();
