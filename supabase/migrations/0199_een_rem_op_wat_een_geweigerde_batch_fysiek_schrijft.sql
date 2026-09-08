-- 0199_een_rem_op_wat_een_geweigerde_batch_fysiek_schrijft.sql — een geweigerde
-- bulk-insert schrijft de rijen eerst en gooit ze daarna weg; deze rem begrenst
-- hoeveel er fysiek geschreven wordt (QS8-347).
--
-- ROLLBACK-PAD:
--   drop trigger if exists weekdoelen_rem on public.weekly_goals;
--   drop trigger if exists berichten_rem on public.chat_messages;
--   drop trigger if exists dagafvinkingen_rem on public.day_checkins;
--   drop trigger if exists weekreacties_rem on public.week_review_replies;
--   drop trigger if exists weekplanstappen_rem on public.weekly_plan_steps;
--   drop trigger if exists doelen_rem on public.goals;
--   drop trigger if exists mijlpalen_rem on public.milestones;
--   drop trigger if exists doelgebeurtenissen_rem on public.goal_events;
--   drop trigger if exists goedkeuringen_rem on public.completion_approvals;
--   drop function if exists public.rem_weekdoelen();
--   drop function if exists public.rem_berichten();
--   drop function if exists public.rem_dagafvinkingen();
--   drop function if exists public.rem_weekreacties();
--   drop function if exists public.rem_weekplanstappen();
--   drop function if exists public.rem_doelen();
--   drop function if exists public.rem_mijlpalen();
--   drop function if exists public.rem_doelgebeurtenissen();
--   drop function if exists public.rem_goedkeuringen();
--   -- en `sleutelzetters()` terugzetten op de definitie uit 0187:
--   -- die versie kent alleen `app.heropent_groep` en `app.hervat_lidmaatschap`.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Nagemeten tegen de lokale stack, één `authenticated`-sessie, één statement
--    van 50.000 doelen tegen het dagplafond van 200 uit 0192:
--
--      pg_total_relation_size('goals') vooraf   136 kB
--      insert 50.000 doelen                ->   23514 Te veel doelen in één dag
--      rijen van die gebruiker erna             0
--      pg_total_relation_size('goals') erna    9784 kB
--
--    De rijen zijn geweigerd en er blijft er geen één staan, maar de tabel is
--    met 9,6 MB gegroeid en die ruimte komt pas terug bij een `vacuum full`.
--    Daar komt WAL bij, die pas bij het volgende checkpoint vrijkomt.
--
-- 0192 zorgt dus dat de rijen niet **blijven**, niet dat ze niet **geschreven**
-- worden. Op een gratis tier van 500 MB zonder automatische backups vult een
-- handvol gelijktijdige POSTs de schijf alsnog — vanaf één gewoon account, met
-- de anon-key die per ontwerp in de bundel zit. Bij een volle schijf stopt
-- Postgres met schrijven, en dat raakt iedereen.
--
-- ---------------------------------------------------------------------------
-- ⚠️ De aanname die dit issue droeg, en die niet klopt
-- ---------------------------------------------------------------------------
--
-- QS8-347 schreef: *"Het is niet in de database op te lossen. Een `BEFORE`-trigger
-- heeft geen transitietabel en kan de batch dus niet tellen."* Het eerste deel
-- volgt niet uit het tweede, en dat is gemeten.
--
-- **Een `BEFORE INSERT ... FOR EACH ROW`-trigger ziet wél de rijen die eerder in
-- hetzelfde statement zijn ingevoegd.** Hij heeft daar geen transitietabel voor
-- nodig: hij telt gewoon de tabel, en de rijen van dit statement staan er al in.
--
-- 📏 Op een proeftabel, plafond 5, batch van 100:
--
--      trigger raise bij n=5   ->  vijf rijen fysiek geschreven, niet honderd
--
-- 📏 En op dezelfde vorm als 0192, plafond 200, batch van 50.000:
--
--      alleen de AFTER STATEMENT-teller   16 kB -> 4088 kB
--      met deze rem ervoor                16 kB ->   64 kB
--
-- 📏 En op de échte tabel, verse database, 50.000 doelen via een
--    `authenticated`-sessie:
--
--      zonder rem   136 kB -> 9784 kB   (9,6 MB aangroei)
--      met rem       40 kB ->  176 kB
--
-- Er hoeft dus niets aan de laag ervóór te veranderen. Dat is maar goed ook —
-- zie hieronder.
--
-- ---------------------------------------------------------------------------
-- Waarom de laag ervóór geen optie is (acceptatiecriterium 1 en 2)
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten in `docs/DEPLOY.md`: Hostinger serveert alléén de statische bundel
--    uit `public_html/goalbuddies`. De app praat daarna rechtstreeks met
--    `<ref>.supabase.co` — `supabase-js` → PostgREST over HTTPS (§"Verbindingen",
--    rij *De app (web en native)*). **Hostinger zit dus niet in het pad van een
--    API-verzoek**, en er is aan onze kant geen reverse proxy die een bodygrens
--    kan zetten.
--
--    Wat er wél vóór PostgREST staat is de edge van Supabase zelf. Die is op de
--    gratis tier niet in te stellen: `db-max-rows` begrenst het lézen en niet het
--    schrijven, en een bodygrens vraagt een instelling die het dashboard niet
--    aanbiedt.
--
-- ⚠️ **Dat verandert zodra er een langdraaiende Node-server op Hostinger komt**
--    (`docs/DEPLOY.md` §2.7). Loopt het verkeer daar ooit langs, dan is een
--    bodygrens daar alsnog de goedkoopste plek en is deze rem de tweede laag.
--    Deze migratie maakt die keuze niet onmogelijk; ze maakt hem alleen niet
--    nodig.
--
-- ---------------------------------------------------------------------------
-- Wat de rem telt, en waarom niet het venster
-- ---------------------------------------------------------------------------
--
-- De rem telt **de rijen van dít verzoek**, in een transactielokale teller
-- (`set_config('app.rem_<naam>', …, true)`). PostgREST voert elk verzoek in één
-- transactie uit, dus dat is precies "hoeveel rijen schrijft deze POST".
--
-- ⚠️⚠️ **De eerste versie telde het venster van een etmaal, net als de teller van
--    0192, en dat was fout op twee manieren.** Beide zijn door de
--    security-review van 08-09 gemeten en ik heb ze zelf nagespeeld.
--
--    **Fout 1 — het venster is gedeeld, de rem was dat niet.** De rollover
--    schrijft weekdoelen als `service_role`; die rijen tellen mee in het venster
--    van de eigenaar, terwijl hij ze niet gemaakt heeft. 📏 Met 450
--    rollover-weekdoelen op één doel gaf één eigen weekdoel:
--
--      met de vensterrem   23514 'Te veel weekdoelen in één verzoek (450 …)'
--      zonder de rem       42501 new row violates row-level security policy
--
--    Een melding die "in één verzoek" zegt bij een verzoek van één rij, en een
--    rem die de policy overstemt. De gebruiker was allebei de keren geblokkeerd —
--    het venster stond immers al boven het plafond — maar de verkeerde grendel
--    sprak, en dat is precies wat deze migratie elders belooft te vermijden.
--
--    **Fout 2 — de kosten waren kwadratisch.** Elke rij hertelde het venster,
--    inclusief de rijen die hetzelfde statement er net in had gezet. 📏 De
--    review mat 1924 ms voor een geweigerde batch van 50.000 mét die rem tegen
--    774 ms zonder: de rem maakte een geweigerd verzoek dúúrder.
--
--    Een teller die alleen dít verzoek telt, heeft geen van beide problemen. Hij
--    raakt het gedeelde venster niet aan, en hij kost per rij een
--    `current_setting` in plaats van een indexscan.
--
-- 📏 Gemeten na de herbouw, dezelfde geweigerde batch van 50.000 doelen:
--
--      met rem       11,5 ms
--      zonder rem  1030,4 ms
--
--    De rem maakt een geweigerd verzoek dus ~90× goedkoper in plaats van 2,5×
--    duurder, want hij stopt het statement bij rij 401 in plaats van na 50.000.
--
-- 📏 En een normale batch betaalt niets van betekenis. Twaalf mijlpalen voor een
--    gebruiker met 900 in het venster:
--
--      Trigger mijlpalen_rem         0,293 ms / 12 calls
--      Trigger mijlpalen_dagplafond  0,804 ms /  1 call
--      Execution Time                1,706 ms
--
--    Er wordt geen index voor deze rem aangelegd en er is er ook geen voor
--    nodig: hij kijkt niet in een tabel.
--
-- ---------------------------------------------------------------------------
-- Twee grendels, twee taken — en allebei bereikbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De rem vervangt de teller van 0192 niet, en hij mag hem ook niet
--    overstemmen.** Een grendel die altijd als eerste afgaat, maakt de grendel
--    erachter dode code die je kunt slopen zonder dat er iets rood wordt.
--
--    Vandaar `plafond * 2`, en dat getal is af te leiden. Een legitiem verzoek
--    kan hoogstens `plafond` nieuwe rijen bevatten — de teller weigert immers
--    alles daarboven — en het randgeval `plafond + 1` moet de tellér kunnen
--    weigeren, met zijn eigen melding die het aantal uit dit verzoek noemt. De
--    rem moet dus boven `plafond + 1` liggen, en `plafond * 2` is daar de
--    eenvoudigste waarde boven die geen nieuwe constante vraagt.
--
--      batch van plafond + 1   ->  alle rijen erin, AFTER-teller weigert met
--                                  '% erbij, % in het laatste etmaal'
--      batch van 50.000        ->  rem weigert bij rij 2 × plafond + 1
--
--    ⚠️ De eerste versie stond op `> plafond` en dat was óók fout: hij ging af
--    bij `plafond + 2`, wat op papier genoeg lijkt, maar twee bestaande tests
--    werden er rood van — `cyclusgrens.test.ts` verlaagt het plafond naar 3 en
--    biedt 5 rijen aan, en `afvinkgrens.test.ts` verwachtte 42501 van de policy.
--    De naadtoets in `tests/rls/bulkschrijf.test.ts` bewaakt dat de handhaver
--    aan het woord blijft.
--
-- ⚠️ **`auth.uid() is null` betekent doorlaten, net als in 0192.** De rollover en
--    de notificatiejob draaien als `service_role` en schrijven grote batches; een
--    rem die die breekt is geen rem maar een storing. De must-allow met 250 rijen
--    in `dagplafond-batch.test.ts` bewaakt dat.
--
-- ⚠️ **`security definer` is hier niet nodig voor leesrecht** — de rem kijkt in
--    geen enkele tabel — maar staat er wel, in dezelfde vorm als 0192, zodat een
--    lezer de negen functies naast elkaar kan leggen. `set_config` op een eigen
--    GUC-prefix mag elke rol.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat deze migratie níet oplost
-- ---------------------------------------------------------------------------
--
-- **De rem begrenst rijen per verzoek, niet verzoeken per seconde.** 📏 De
-- security-review mat 30 geweigerde POSTs van 500 maximale doelen: 905 kB per
-- verzoek, 7,6 MB/s vanaf één seriële client. 500 MB is daarmee in ongeveer een
-- minuut vol. Wat hier weggaat is de factor 100 per verzoek; wat blijft is dat
-- er geen rate limit vóór PostgREST staat. Dat is een andere laag en een andere
-- afweging, en het staat als rij in `docs/ENGINEER-REVIEW.md`.
--
-- **En de elf tabellen zonder dagteller blijven open.** 📏 `daily_moves`, 50.000
-- rijen in één POST: 32 kB -> 38 MB, **gecommit en zonder foutmelding** — erger
-- dan het geweigerde geval, want die ruimte komt nooit terug. Dat is QS8-344.
--
-- ⚠️⚠️ **Landt QS8-344 zonder rem, dan is dit defect opnieuw gebouwd op tien
--    tabellen.** Die branch zet er `after insert ... for each statement`-tellers
--    op, precies de vorm waar deze migratie de rem bij hoort te zetten.
--
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op negen functies en `drop trigger if exists`
-- vóór elke `create trigger`. De handtekeningen veranderen niet.
-- ---------------------------------------------------------------------------

create or replace function public.rem_weekdoelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_weekdoelen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_weekdoelen', v_n::text, true);
  if v_n > weekdoelen_plafond() * 2 then
    raise exception 'Te veel weekdoelen in één verzoek (% rijen, noodgrens %)',
      v_n, weekdoelen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_berichten() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_berichten', true), ''), '0')::integer + 1;
  perform set_config('app.rem_berichten', v_n::text, true);
  if v_n > berichten_plafond() * 2 then
    raise exception 'Te veel berichten in één verzoek (% rijen, noodgrens %)',
      v_n, berichten_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_dagafvinkingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_dagafvinkingen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_dagafvinkingen', v_n::text, true);
  if v_n > dagafvinkingen_plafond() * 2 then
    raise exception 'Te veel dagafvinkingen in één verzoek (% rijen, noodgrens %)',
      v_n, dagafvinkingen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_weekreacties() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_weekreacties', true), ''), '0')::integer + 1;
  perform set_config('app.rem_weekreacties', v_n::text, true);
  if v_n > weekreacties_plafond() * 2 then
    raise exception 'Te veel weekreacties in één verzoek (% rijen, noodgrens %)',
      v_n, weekreacties_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_weekplanstappen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_weekplanstappen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_weekplanstappen', v_n::text, true);
  if v_n > weekplanstappen_plafond() * 2 then
    raise exception 'Te veel weekplanstappen in één verzoek (% rijen, noodgrens %)',
      v_n, weekplanstappen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_doelen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_doelen', v_n::text, true);
  if v_n > doelen_plafond() * 2 then
    raise exception 'Te veel doelen in één verzoek (% rijen, noodgrens %)',
      v_n, doelen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_mijlpalen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_mijlpalen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_mijlpalen', v_n::text, true);
  if v_n > mijlpalen_plafond() * 2 then
    raise exception 'Te veel mijlpalen in één verzoek (% rijen, noodgrens %)',
      v_n, mijlpalen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelgebeurtenissen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_doelgebeurtenissen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_doelgebeurtenissen', v_n::text, true);
  if v_n > doelgebeurtenissen_plafond() * 2 then
    raise exception 'Te veel doelgebeurtenissen in één verzoek (% rijen, noodgrens %)',
      v_n, doelgebeurtenissen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

create or replace function public.rem_goedkeuringen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null then return new; end if;
  v_n := coalesce(nullif(current_setting('app.rem_goedkeuringen', true), ''), '0')::integer + 1;
  perform set_config('app.rem_goedkeuringen', v_n::text, true);
  if v_n > goedkeuringen_plafond() * 2 then
    raise exception 'Te veel goedkeuringen in één verzoek (% rijen, noodgrens %)',
      v_n, goedkeuringen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit verzoek schrijft er te veel in één keer. Verdeel het over meerdere verzoeken.';
  end if;
  return new;
end $$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie; `from public, anon` houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait. Beveiligingsregel 4, en de grendel eronder is
--    `tests/rls/functiegrants.test.ts`.
revoke all on function public.rem_weekdoelen() from public, anon, authenticated;
revoke all on function public.rem_berichten() from public, anon, authenticated;
revoke all on function public.rem_dagafvinkingen() from public, anon, authenticated;
revoke all on function public.rem_weekreacties() from public, anon, authenticated;
revoke all on function public.rem_weekplanstappen() from public, anon, authenticated;
revoke all on function public.rem_doelen() from public, anon, authenticated;
revoke all on function public.rem_mijlpalen() from public, anon, authenticated;
revoke all on function public.rem_doelgebeurtenissen() from public, anon, authenticated;
revoke all on function public.rem_goedkeuringen() from public, anon, authenticated;

-- ⚠️ **Over de volgorde, want die vraag komt anders bij de volgende lezer op.**
--    Tegenover de teller van 0192 speelt de naam geen rol: BEFORE ROW gaat altijd
--    vóór AFTER STATEMENT, dat ligt in het model vast.
--
--    Tegenover ándere BEFORE ROW-triggers telt de alfabetische naam wél, en op
--    vier van de negen tabellen staan die: `dagafvinkingen_rem` gaat vóór
--    `day_checkins_binnen_de_cyclus` en `berichten_rem` vóór
--    `chat_messages_stamp`. 📏 Dat heeft geen gemeten gevolg — de rem gaat pas af
--    boven tweemaal het plafond, en dan is de rij toch geweigerd — maar het is
--    geen eigenschap van het model en dus iets om te weten. Gevonden in de
--    security-review van 08-09.

drop trigger if exists weekdoelen_rem on public.weekly_goals;
create trigger weekdoelen_rem before insert on public.weekly_goals
  for each row execute function public.rem_weekdoelen();

drop trigger if exists berichten_rem on public.chat_messages;
create trigger berichten_rem before insert on public.chat_messages
  for each row execute function public.rem_berichten();

drop trigger if exists dagafvinkingen_rem on public.day_checkins;
create trigger dagafvinkingen_rem before insert on public.day_checkins
  for each row execute function public.rem_dagafvinkingen();

drop trigger if exists weekreacties_rem on public.week_review_replies;
create trigger weekreacties_rem before insert on public.week_review_replies
  for each row execute function public.rem_weekreacties();

drop trigger if exists weekplanstappen_rem on public.weekly_plan_steps;
create trigger weekplanstappen_rem before insert on public.weekly_plan_steps
  for each row execute function public.rem_weekplanstappen();

drop trigger if exists doelen_rem on public.goals;
create trigger doelen_rem before insert on public.goals
  for each row execute function public.rem_doelen();

drop trigger if exists mijlpalen_rem on public.milestones;
create trigger mijlpalen_rem before insert on public.milestones
  for each row execute function public.rem_mijlpalen();

drop trigger if exists doelgebeurtenissen_rem on public.goal_events;
create trigger doelgebeurtenissen_rem before insert on public.goal_events
  for each row execute function public.rem_doelgebeurtenissen();

drop trigger if exists goedkeuringen_rem on public.completion_approvals;
create trigger goedkeuringen_rem before insert on public.completion_approvals
  for each row execute function public.rem_goedkeuringen();

comment on function public.rem_doelen() is
  'Rem op de fysieke schrijfactie van een te grote batch (QS8-347, 0199). De '
  'handhaver is begrens_doelen(); deze functie telt alleen de rijen van dit ene '
  'verzoek en begrenst wat er onderweg naar een weigering op schijf terechtkomt.';

-- ---------------------------------------------------------------------------
-- De negen tellers aanmelden bij `sleutelzetters()`
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Deze migratie werd rood op een grendel die ik niet kende, en dat is
--    precies waar hij voor is.** `sleutelzetters()` (0153, uitgebreid in 0187)
--    meldt élke functie die een `app.`-sessie-instelling noemt en die niet in zijn
--    register staat. De reden is een echte: zo'n instelling kán een
--    ontgrendelsleutel zijn — `app.heropent_groep` is er een — en een tweede
--    functie die hem zet, is een tweede sleutel op hetzelfde slot.
--
--    De negen tellers hieronder zijn een ándere klasse: ze ontgrendelen niets,
--    geen enkele policy of CHECK leest ze, en ze bestaan alleen zolang de
--    transactie duurt. Maar "het is een andere klasse" is precies wat de
--    volgende schrijver ook denkt, en daarom staan ze hier **met naam en al** in
--    het register in plaats van dat de teller een uitzondering op vorm krijgt.
--    Elke rem mag exact zijn eigen instelling zetten en verder niets.
--
-- ⚠️ **Kan een client zo'n teller vervalsen?** Nee: PostgREST zet alleen
--    `request.*`-instellingen uit het JWT en de headers, en er is geen RPC die
--    `set_config` doorgeeft. En zou het ooit wél kunnen, dan is het gevolg dat de
--    rem niet afgaat — de toestand van vóór deze migratie — en niet dat er een
--    grens opengaat. Een teller is geen sleutel, en dat verschil is hier het
--    verschil tussen ongemak en een gat.

create or replace function public.sleutelzetters()
 returns table(naam text, bezwaar text)
 language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with sleutel(instelling, toegestaan) as (
    values
      ('app.heropent_groep',      array['heropen_groep', 'archief_blijft_archief']),
      ('app.hervat_lidmaatschap', array['join_group_with_code', 'guard_group_member_update']),
      -- De tellers van 0199. Elke rem mag alleen zijn eigen instelling zetten.
      ('app.rem_weekdoelen',         array['rem_weekdoelen']),
      ('app.rem_berichten',          array['rem_berichten']),
      ('app.rem_dagafvinkingen',     array['rem_dagafvinkingen']),
      ('app.rem_weekreacties',       array['rem_weekreacties']),
      ('app.rem_weekplanstappen',    array['rem_weekplanstappen']),
      ('app.rem_doelen',             array['rem_doelen']),
      ('app.rem_mijlpalen',          array['rem_mijlpalen']),
      ('app.rem_doelgebeurtenissen', array['rem_doelgebeurtenissen']),
      ('app.rem_goedkeuringen',      array['rem_goedkeuringen'])
  ),
  bekend as (
    select p.proname::text as naam, s.instelling, s.toegestaan
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join sleutel s
    where n.nspname = 'public'
      and p.prosrc like '%' || s.instelling || '%'
      and p.proname <> 'sleutelzetters'
  )
  select naam,
         'noemt ' || instelling || '; alleen ' ||
         array_to_string(toegestaan, '() en ') || '() horen die sleutel te kennen'
    from bekend
   where naam <> all (toegestaan)

  union all

  -- ⚠️ De derde tak: een `app.`-instelling die in geen enkel register hierboven
  --    staat. Zonder deze tak dekt de teller alleen de sleutels die iemand er al
  --    in heeft gezet, en is de vólgende sleutel weer ongeteld.
  select p.proname::text,
         -- ⚠️ De naam van deze functie staat met opzet niet in deze tekst.
         --    `keten:controle` telt een naam in de bron als een aanroeper, en
         --    strippen doet hij alleen commentaar — niet een tekenreeks. Een
         --    functie die zichzelf in een melding noemt, meldt zichzelf dus
         --    levend. Dezelfde klasse als het commentaargeval dat dat script in
         --    zijn eigen kop beschrijft: de tekst óver een functie is geen
         --    gebruik ervan.
         'noemt een app.-sessiesleutel die in geen enkel register van deze '
         'teller staat; een nieuwe sleutel hoort er met zijn eigen regel in '
         'te komen'
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname <> 'sleutelzetters'
     and p.prosrc ~ 'app\.[a-z_]+'
     and not exists (
       select 1 from sleutel s where p.prosrc like '%' || s.instelling || '%'
     )

   order by 1;
$$;
