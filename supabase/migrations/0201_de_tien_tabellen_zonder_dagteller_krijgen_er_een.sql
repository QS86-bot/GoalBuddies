-- 0201_de_tien_tabellen_zonder_dagteller_krijgen_er_een.sql — zes van de tien
-- tabellen die een client zonder enige rem kon vullen, krijgen het dagplafond
-- van 0192; de andere vier zijn al begrensd en krijgen er met opzet geen (QS8-344)
--
-- ROLLBACK-PAD:
--   drop trigger if exists commitments_dagplafond on public.commitments;
--   drop trigger if exists goedkeuringen_dagplafond on public.completion_approvals;
--   drop trigger if exists voltooiingen_dagplafond on public.completions;
--   drop trigger if exists dagzetten_dagplafond on public.daily_moves;
--   drop trigger if exists doelinterviews_dagplafond on public.goal_interviews;
--   drop trigger if exists doelkoppelingen_dagplafond on public.goal_group_links;
--   drop function if exists public.begrens_commitments();
--   drop function if exists public.begrens_goedkeuringen();
--   drop function if exists public.begrens_voltooiingen();
--   drop function if exists public.begrens_dagzetten();
--   drop function if exists public.begrens_doelinterviews();
--   drop function if exists public.begrens_doelkoppelingen();
--   drop function if exists public.commitments_plafond();
--   drop function if exists public.goedkeuringen_plafond();
--   drop function if exists public.voltooiingen_plafond();
--   drop function if exists public.dagzetten_plafond();
--   drop function if exists public.doelinterviews_plafond();
--   drop function if exists public.doelkoppelingen_plafond();
--   alter table public.goal_interviews drop constraint if exists goal_interviews_answers_len;
--
--   De vijf indexen mogen blijven staan; ze kosten niets en breken niets.
--
--   ⚠️ Deze migratie voegt alléén toe. Er wordt geen bestaande functie, policy
--      of constraint gewijzigd, dus het pad hierboven zet niets van vóór 0201
--      terug — er is niets om terug te zetten.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0192 gaf acht tabellen een dagplafond dat de batch meetelt. 📏 Achttien
-- tabellen zijn door een `authenticated` client te beschrijven; de overige tien
-- stonden in QS8-344 en hebben elk een eigen weging gekregen.
--
-- 📏 Nagemeten op 08-09-2026 tegen het schema ná 0193, met dezelfde query als in
--    QS8-344 (`cmd in ('INSERT','ALL')` én `with_check <> 'false'`, gekruist met
--    de INSERT-kolomgrants voor `authenticated`). De lijst van tien klopt nog
--    precies, en de acht van 0192 dragen inmiddels een `%dagplafond%`-trigger.
--
-- ⚠️ **Het venster leunt op een tijdstempel die de client niet kan zetten, en dat
--    is per tabel nagemeten** — zonder die eigenschap is de grens te ontwijken
--    door een datum in het verleden mee te sturen. 📏 Geen van de tien geeft
--    `authenticated` een INSERT-recht op zijn tijdstempel. Drie tabellen hebben
--    geen `created_at` maar een eigen naam ervoor, en die is net zo goed
--    servergezet: `completions.submitted_at`, `goal_group_links.linked_at` en
--    `group_members.joined_at`.
--
-- ⚠️ **`daily_moves` telt op `created_at` en níét op `local_date`.** Die tweede
--    staat wél in de kolomgrants — de gebruiker kiest zelf voor welke dag een
--    Dagzet telt — en een venster daarop is dus met één veld te ontwijken.
--
-- ---------------------------------------------------------------------------
-- De vier die géén plafond krijgen, met de meting die dat draagt
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de helft van dit issue die geen code oplevert.** Een plafond op een
--    tabel die al begrensd is, is een tweede getal dat hetzelfde zegt — en twee
--    plekken met hetzelfde getal is hoe ze uit elkaar gaan lopen (0192, §4).
--
-- **`profiles` — één rij per gebruiker, voor altijd.**
--   📏 `profiles_insert` heeft `with_check = (id = auth.uid())` en de PK is `id`.
--   Er is geen tweede rij mogelijk, hoe groot de POST ook is. De zestien
--   INSERT-kolommen maken hem de breedste van de tien en dat leest als de
--   grootste vector; hij is de enige die er helemaal geen is.
--
-- **`group_members` — al begrensd, maar niet door de policy alleen.**
--   ⚠️⚠️ **Hier stond eerst "tien rijen per dag, want de policy laat alleen jezelf
--   toe in een groep die je zelf maakte". Dat was de policy náméten en de rest
--   vergeten** — aangewezen door de security-review op deze branch. 📏 Er zijn
--   **drie** functies die in `group_members` schrijven, alle drie
--   `SECURITY DEFINER` en alle drie uitvoerbaar door `authenticated`, dus alle
--   drie lopen ze langs de policy heen:
--
--     create_group()                 weigert bij 10 groepen in het laatste etmaal
--                                    (`daily_limit`) of 10 actieve lidmaatschappen
--     join_group_with_code()         weigert bij 20 codepogingen in het venster
--                                    (`rate_limited`), 12 leden (`group_full`) of
--                                    10 lidmaatschappen (`too_many_groups`)
--     beslis_lidmaatschapsverzoek()  weigert bij 12 leden of 10 groepen (QS8-328)
--
--   Het echte dagtempo voor eigen rijen is dus de som van de eerste twee, zo'n
--   dertig, en de derde voegt alleen leden toe die zélf een verzoek deden. Ook
--   dat is een orde van grootte onder elk plafond dat hier zou passen, dus de
--   conclusie blijft staan — maar ze rust nu op de meting en niet op de policy.
--
--   ⚠️ De policy is dus niet de grens, en dat is precies het soort aanname dat
--      hier duur is: een `with_check` lezen zegt niets over wat een definer-RPC
--      ernaast mag. `groups_insert` heeft `with_check = false` en is RPC-only —
--      ook dát is een pad dat je alleen ziet als je naar de functies kijkt.
--
-- **`week_reviews` — al begrensd op ~50 rijen ooit, niet per dag.**
--   ⚠️⚠️ **Hier stond een plafond van 100, en dat was een getal dat liegt.**
--   `week_reviews_periode_grens` (een `BEFORE INSERT OR UPDATE`-trigger, geen
--   constraint) eist dat `group_period_start` binnen
--   `[current_date - 35, current_date + 1]` valt **én** op de huddledag van de
--   groep. 📏 Gemeten per huddledag: **vijf** geldige periodestarts voor de dagen
--   0, 1, 4, 5 en 6, en **zes** voor 2 en 3 — het hangt af van hoe het venster van
--   37 dagen valt. Met `week_reviews_one_per_period` (uniek op groep, gebruiker,
--   periodestart) en het lidmaatschapsplafond van tien groepen is het maximum dus
--   vijftig tot zestig rijen per venster.
--
--   ⚠️ **En dat is geen totaal-voor-altijd, want het venster schuift mee met
--   `current_date`.** Hier stond "ooit, niet per dag", en dat was te sterk: er
--   komt per groep elke week een nieuwe geldige periodestart bij. Het juiste getal
--   is zo'n zestig in de eerste vijf weken en daarna ongeveer één per groep per
--   week — een tempo waar geen dagplafond iets aan toevoegt.
--
--   ⚠️ **En een test ervoor zou groen zijn geweest om de verkeerde reden**, wat
--   erger is dan geen test. Honderdéén rijen aanbieden vraagt honderdéén
--   verschillende periodestarts, en dan weigert de periodetrigger de batch met
--   `22007` of `22023` — niet het dagplafond. Precies de valkuil die QS8-344
--   benoemt: een batch die door een ándere grendel geweigerd wordt, is groen
--   zonder iets te bewijzen. Het plafond zou nooit één keer gedraaid hebben.
--
-- **`user_blocks` — bewust geen plafond, en dat is een veiligheidskeuze.**
--   Een rem op blokkeren zit iemand in de weg die misbruik ontvlucht, en dat is
--   de verkeerde kant om te falen. 📏 De vorm begrenst hem bovendien al: de PK is
--   `(blocker_id, blocked_id)` met `blocker_id = auth.uid()`, en `blocked_id`
--   heeft een FK naar `profiles(id)`. Je kunt iemand dus hoogstens één keer
--   blokkeren, en alleen iemand die bestaat.
--   **Wordt zwaarder als:** profiel-id's in bulk op te vragen worden. Dan is het
--   aantal rijen niet meer begrensd door wie je kent maar door hoeveel accounts
--   er zijn, en dan hoort hier een plafond dat ruim boven elk echt gebruik ligt.
--
-- ---------------------------------------------------------------------------
-- De zes plafonds, en waarom ze zo hoog staan
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Ruim gekozen, net als in 0192: ze hoeven een echte gebruiker nooit te
--    raken, ze hoeven alleen de lus te binden.** Elk getal hieronder is een
--    veelvoud van wat een zwaar gebruiksdagje oplevert.
--
--   commitments      200   een straf en een beloning per doel; `goals` staat zelf
--                          op 200/dag, dus dit is ruim één per doel
--   goedkeuringen    200   een groep van twaalf met een handvol weekdoelen elk
--                          levert er in een hele wéék enkele tientallen op
--   voltooiingen     500   één per weekdoel per cyclus; gelijkgetrokken met
--                          `dagafvinkingen_plafond()`, dezelfde orde van grootte
--   dagzetten        500   idem — een Dagzet is een dagboekregel, geen batch
--   doelinterviews   200   één per doel bij het opzetten, dus gelijk aan `goals`
--   doelkoppelingen 1000   200 doelen per dag maal hoogstens tien groepen is
--                          2000; de helft daarvan is nog altijd ver boven het
--                          echte gebruik van één of twee groepen per doel
--
-- ⚠️ **`commitments` draagt domeinregel 5, en dit plafond raakt die regel niet.**
--    Het verandert niets aan wat een commitment belooft, wat het kost, of wanneer
--    het verschuldigd wordt; het begrenst alleen hoeveel je er per etmaal kunt
--    áánmaken. De consequentie van elk afzonderlijk commitment blijft exact wat
--    de gebruiker bevestigd heeft.
--
-- ⚠️ **`completion_approvals` raakt domeinregel 3, en ook daar verschuift niets.**
--    Wie mag goedkeuren staat in `completion_approvals_insert` en in
--    `completion_approvals_one_vote`; dit plafond zegt alleen hoevéél. Een lid dat
--    binnen één etmaal tweehonderd voltooiingen van groepsgenoten goedkeurt, doet
--    iets anders dan meeleven.
--
-- ---------------------------------------------------------------------------
-- De vorm is die van 0192, en dat is met opzet
-- ---------------------------------------------------------------------------
--
-- `auth.uid() is null` slaat de trigger over, zodat de rollover en de
-- notificatiejob er niet door geraakt worden — de tak beslist op de aanwezigheid
-- van een sessie en niet op een rolnaam, precies zoals 0083 eiste. De drie
-- redenen waarom die tak geen achterdeur is, staan uitgeschreven in 0192; 📏 de
-- eerste ervan is voor deze zes opnieuw nagemeten: `anon` heeft op geen van
-- hen ook maar één INSERT-kolomgrant.
--
-- `after insert ... for each statement` met een transitietabel: één vensterquery
-- per verzoek in plaats van één per rij. `nieuw` wordt alleen gebruikt om de
-- melding te kunnen invullen, niet om te beslissen — de telling is absoluut.

-- ---------------------------------------------------------------------------
-- 0. Een plafond telt rijen en geen bytes — `goal_interviews` had geen van beide
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Gevonden door de security-review op deze branch, en het is de reden dat
--    een rijplafond alléén hier niet genoeg was.** 📏 `goal_interviews` heeft
--    **nul** CHECK-constraints en `answers` is vrije `jsonb`. `interviewSchema`
--    in `src/modules/goals/interview-schemas.ts` begrenst elk antwoord op 1000
--    tekens — maar dat is de cliënt, en een vijandige POST gaat rechtstreeks naar
--    PostgREST met de anon-key die per ontwerp in de bundel zit.
--
--    📏 Gemeten: 200 rijen met onsamendrukbare inhoud, precies **binnen** het
--    plafond van 200, waren samen 40 MB — acht procent van de 500 MB gratis tier,
--    vanaf één gewoon account, zónder dat de nieuwe grendel één keer afging.
--
--    Dat is de vorm waar dit project een naam voor heeft: een deur die alleen
--    dichtzit omdat er verderop een `if` staat. Een rijplafond op een tabel met
--    ongebonden rijen begrenst niets wat er toe doet.
--
-- ⚠️ De grens staat op de hele `answers` en niet per veld, want de server kent de
--    vorm van dat object niet — alleen de cliënt doet dat. 20.000 tekens is ruim
--    het viervoudige van het grootste geldige interview (vijf antwoorden van
--    1000 tekens plus de sleutels, samen zo'n 5200) en laat ruimte voor een
--    zevende vraag, terwijl het het misbruikgeval met een factor tien terugbrengt.
--
-- ⚠️ `char_length` en niet `octet_length`: dat is de eenheid die dit project
--    overal gebruikt (CLAUDE.md, Emoji) en dezelfde die `commitments_body_len` en
--    `daily_moves_body_len` al hanteren.

alter table public.goal_interviews
  drop constraint if exists goal_interviews_answers_len;
alter table public.goal_interviews
  add constraint goal_interviews_answers_len
  check (char_length(answers::text) <= 20000);

-- ---------------------------------------------------------------------------
-- 1. De plafonds, op één plek
-- ---------------------------------------------------------------------------

create or replace function public.commitments_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.goedkeuringen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.voltooiingen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 500 $$;
create or replace function public.dagzetten_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 500 $$;
create or replace function public.doelinterviews_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 200 $$;
create or replace function public.doelkoppelingen_plafond() returns integer
  language sql immutable
  set search_path to 'public', 'pg_temp' as $$ select 1000 $$;

comment on function public.commitments_plafond() is
  'Het dagplafond op nieuwe commitments (QS8-344). Begrenst hoevéél je er per '
  'etmaal aanmaakt, nooit wat een afzonderlijk commitment inhoudt of kost.';
comment on function public.goedkeuringen_plafond() is
  'Het dagplafond op peer-goedkeuringen (QS8-344). Wie mag goedkeuren staat in '
  'completion_approvals_insert; dit zegt alleen hoeveel.';

-- ⚠️ **`revoke` noemt `authenticated` met zoveel woorden** (onwrikbare regel 4).
--    `alter default privileges` deelt élke nieuwe functie in `public` uit aan
--    `anon`, `authenticated` én `service_role`; `from public, anon` ziet eruit
--    als "van iedereen" en houdt precies de rol over waaronder iedere ingelogde
--    gebruiker draait.
--
-- ⚠️ En `authenticated` heeft ze niet nodig: ze worden alleen aangeroepen vanuit
--    de triggerfuncties hieronder, en die zijn `SECURITY DEFINER` — hun lichaam
--    draait met de rechten van de eigenaar. Er is geen pad waarlangs een client
--    deze functies zelf moet kunnen uitvoeren.
revoke all on function public.commitments_plafond() from public, anon, authenticated;
revoke all on function public.goedkeuringen_plafond() from public, anon, authenticated;
revoke all on function public.voltooiingen_plafond() from public, anon, authenticated;
revoke all on function public.dagzetten_plafond() from public, anon, authenticated;
revoke all on function public.doelinterviews_plafond() from public, anon, authenticated;
revoke all on function public.doelkoppelingen_plafond() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. De indexen die de telling per statement dragen (schaalbaarheidsregel 11)
-- ---------------------------------------------------------------------------
--
-- ⚠️ De trigger telt bij élke insert het venster van een etmaal. Zonder index
--    leest die telling meer dan ze hoeft, en dan is de rem zelf de vertraging.
--
-- 📏 **Gemeten, niet aangenomen** — de security-review op deze branch meldde dat
--    de drie indexen langs een join (`commitments`, `goal_interviews`,
--    `goal_group_links`) hun venster niet zouden dragen omdat `goal_id` er geen
--    predicaat is maar een joinsleutel. Nagemeten op `goal_interviews` met 10.500
--    rijen, één gebruiker met twintig doelen:
--
--      mét goal_interviews_vers_idx   Index Only Scan   47 buffers   1,94 ms
--      zonder                         Bitmap Heap Scan  175 buffers  3,49 ms
--
--    De planner kiest hem dus wél, en hij scheelt bijna een factor vier aan
--    buffers. De bevinding klopte niet, en de reden dat ze zo overtuigend leek is
--    het noemen waard: op een **lege** tabel geeft élke query een seq scan, en dan
--    lijkt elke index nutteloos. Twee eerdere pogingen van mij liepen op precies
--    die val — een plan van een lege tabel is geen meting.
--
--    ⚠️ Voor `commitments` en `goal_group_links` is dit niet op volume nagemeten
--       (de eerste heeft `commitments_een_open_per_soort`, één open commitment per
--       doel en soort, dus die rijen zijn niet in bulk te maken). De queryvorm is
--       identiek aan die van `goal_interviews`, dus het mechanisme is hetzelfde —
--       maar dat is een redenering en geen meting, en zo staat het hier.
--
-- ⚠️ **`completion_approvals` krijgt er géén, en dat is nagemeten en geen
--    vergeetachtigheid:** `completion_approvals_approver_idx (approver_id,
--    created_at DESC)` bestaat al en heeft precies de vorm die het venster
--    vraagt. Er een tweede naast zetten kost schrijftijd en levert niets.

create index if not exists commitments_vers_idx on public.commitments (goal_id, created_at desc);
create index if not exists completions_vers_idx on public.completions (user_id, submitted_at desc);
create index if not exists daily_moves_vers_idx on public.daily_moves (user_id, created_at desc);
create index if not exists goal_interviews_vers_idx on public.goal_interviews (goal_id, created_at desc);
create index if not exists goal_group_links_vers_idx on public.goal_group_links (goal_id, linked_at desc);

-- ---------------------------------------------------------------------------
-- 3. De grenzen die de batch wél tellen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elke functie heeft dezelfde vorm, en dat is met opzet leesbaar gehouden in
--    plaats van gegeneraliseerd: een transitietabel is bij naam gebonden aan de
--    trigger, en de vensterquery verschilt per tabel omdat de weg naar de
--    eigenaar verschilt. Eén functie met dynamische SQL zou dat verstoppen
--    achter een string.

create or replace function public.begrens_commitments() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from commitments c join goals g on g.id = c.goal_id
   where g.owner_id = (select auth.uid()) and c.created_at > now() - interval '1 day';
  if v_totaal > commitments_plafond() then
    raise exception 'Te veel commitments in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, commitments_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_goedkeuringen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from completion_approvals a
   where a.approver_id = (select auth.uid()) and a.created_at > now() - interval '1 day';
  if v_totaal > goedkeuringen_plafond() then
    raise exception 'Te veel goedkeuringen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, goedkeuringen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_voltooiingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from completions c
   where c.user_id = (select auth.uid()) and c.submitted_at > now() - interval '1 day';
  if v_totaal > voltooiingen_plafond() then
    raise exception 'Te veel voltooiingen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, voltooiingen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_dagzetten() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from daily_moves d
   where d.user_id = (select auth.uid()) and d.created_at > now() - interval '1 day';
  if v_totaal > dagzetten_plafond() then
    raise exception 'Te veel dagzetten in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, dagzetten_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_doelinterviews() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from goal_interviews i join goals g on g.id = i.goal_id
   where g.owner_id = (select auth.uid()) and i.created_at > now() - interval '1 day';
  if v_totaal > doelinterviews_plafond() then
    raise exception 'Te veel doelinterviews in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, doelinterviews_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

create or replace function public.begrens_doelkoppelingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer; v_batch integer;
begin
  if (select auth.uid()) is null then return null; end if;
  select count(*) into v_batch from nieuw;
  select count(*) into v_totaal from goal_group_links l join goals g on g.id = l.goal_id
   where g.owner_id = (select auth.uid()) and l.linked_at > now() - interval '1 day';
  if v_totaal > doelkoppelingen_plafond() then
    raise exception 'Te veel doelkoppelingen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, doelkoppelingen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per gebruiker en telt ook de rijen uit dit verzoek.';
  end if;
  return null;
end $$;

revoke all on function public.begrens_commitments() from public, anon, authenticated;
revoke all on function public.begrens_goedkeuringen() from public, anon, authenticated;
revoke all on function public.begrens_voltooiingen() from public, anon, authenticated;
revoke all on function public.begrens_dagzetten() from public, anon, authenticated;
revoke all on function public.begrens_doelinterviews() from public, anon, authenticated;
revoke all on function public.begrens_doelkoppelingen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. De triggers
-- ---------------------------------------------------------------------------

drop trigger if exists commitments_dagplafond on public.commitments;
create trigger commitments_dagplafond after insert on public.commitments
  referencing new table as nieuw for each statement execute function public.begrens_commitments();

drop trigger if exists goedkeuringen_dagplafond on public.completion_approvals;
create trigger goedkeuringen_dagplafond after insert on public.completion_approvals
  referencing new table as nieuw for each statement execute function public.begrens_goedkeuringen();

drop trigger if exists voltooiingen_dagplafond on public.completions;
create trigger voltooiingen_dagplafond after insert on public.completions
  referencing new table as nieuw for each statement execute function public.begrens_voltooiingen();

drop trigger if exists dagzetten_dagplafond on public.daily_moves;
create trigger dagzetten_dagplafond after insert on public.daily_moves
  referencing new table as nieuw for each statement execute function public.begrens_dagzetten();

drop trigger if exists doelinterviews_dagplafond on public.goal_interviews;
create trigger doelinterviews_dagplafond after insert on public.goal_interviews
  referencing new table as nieuw for each statement execute function public.begrens_doelinterviews();

drop trigger if exists doelkoppelingen_dagplafond on public.goal_group_links;
create trigger doelkoppelingen_dagplafond after insert on public.goal_group_links
  referencing new table as nieuw for each statement execute function public.begrens_doelkoppelingen();
