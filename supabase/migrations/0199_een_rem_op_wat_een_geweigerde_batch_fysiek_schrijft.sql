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
-- Twee grendels, twee taken — en allebei bereikbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De rem vervangt de teller van 0192 niet, en hij mag hem ook niet
--    overstemmen.** Een grendel die altijd als eerste afgaat, maakt de grendel
--    erachter dode code die je kunt slopen zonder dat er iets rood wordt —
--    precies de vorm die dit project telkens duur betaalt.
--
--    ⚠️ **De eerste versie stond op `> plafond`, en dat was fout.** Hij liet
--    `plafond + 1` rijen door en weigerde de volgende, wat op papier de teller
--    precies één batchgrootte ruimte liet. 📏 Twee bestaande tests werden er rood
--    van, en allebei terecht:
--
--      cyclusgrens.test.ts   verlaagt het plafond naar 3 en biedt 5 rijen aan.
--                            De rem ging af bij rij 5, dus de AFTER-teller kwam
--                            niet meer aan bod en de melding noemde de batch niet.
--      afvinkgrens.test.ts   verwachtte 42501 van de policy en kreeg 23514 van
--                            de rem.
--
--    De les is niet "de tests moeten mee". De rem is geen tweede plafond maar
--    een noodstop, en dan hoort zijn drempel **buiten het bereik van het beleid**
--    te liggen in plaats van er één rij boven. Vandaar `plafond * 2`: het
--    kleinste veelvoud dat een legitiem verzoek nooit haalt — de teller en de
--    policy weigeren immers al bij het plafond zelf — en dat geen nieuwe
--    constante nodig heeft.
--
--      batch van plafond + 1   ->  alle rijen erin, AFTER-teller weigert met
--                                  '% erbij, % in het laatste etmaal'
--      batch van 50.000        ->  rem weigert bij rij 2 × plafond + 2
--
--    De teller blijft dus de handhaver met de exacte melding, de policy blijft
--    42501 geven waar hij dat gaf, en de rem is alleen de rem.
--
-- ⚠️ **`auth.uid() is null` betekent doorlaten, net als in 0192.** De rollover en
--    de notificatiejob draaien als `service_role` en schrijven grote batches; een
--    rem die die breekt is geen rem maar een storing. De must-allow met 250 rijen
--    in `dagplafond-batch.test.ts` bewaakt dat.
--
-- ⚠️ **`security definer`, om dezelfde reden als 0192**: de vensterquery loopt
--    over `goals` van de eigenaar, en die hoeft de invoerder niet te mogen lezen.
--
-- ⚠️ **Kosten.** De rem telt per rij, en dat is een indexlookup: 0192 legde voor
--    élk van deze vensters al een `(eigenaar, created_at desc)`-index aan. Een
--    normale batch is klein (het AI-plan zet twaalf mijlpalen neer), dus dat zijn
--    twaalf lookups. Er wordt geen index toegevoegd; die staan er allemaal al.
--
-- ---------------------------------------------------------------------------
-- Idempotent: `create or replace` op negen functies en `drop trigger if exists`
-- vóór elke `create trigger`. De handtekeningen veranderen niet.
-- ---------------------------------------------------------------------------

create or replace function public.rem_weekdoelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from weekly_goals w join goals g on g.id = w.goal_id
   where g.owner_id = (select auth.uid()) and w.created_at > now() - interval '1 day';
  if v_totaal > weekdoelen_plafond() * 2 then
    raise exception 'Te veel weekdoelen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, weekdoelen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_berichten() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from chat_messages m
   where m.sender_id = (select auth.uid()) and m.created_at > now() - interval '1 day';
  if v_totaal > berichten_plafond() * 2 then
    raise exception 'Te veel berichten in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, berichten_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_dagafvinkingen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from day_checkins d
   join weekly_goals w on w.id = d.weekly_goal_id join goals g on g.id = w.goal_id
   where g.owner_id = (select auth.uid()) and d.created_at > now() - interval '1 day';
  if v_totaal > dagafvinkingen_plafond() * 2 then
    raise exception 'Te veel dagafvinkingen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, dagafvinkingen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_weekreacties() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from week_review_replies r
   where r.author_id = (select auth.uid()) and r.created_at > now() - interval '1 day';
  if v_totaal > weekreacties_plafond() * 2 then
    raise exception 'Te veel weekreacties in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, weekreacties_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_weekplanstappen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from weekly_plan_steps s join goals g on g.id = s.goal_id
   where g.owner_id = (select auth.uid()) and s.created_at > now() - interval '1 day';
  if v_totaal > weekplanstappen_plafond() * 2 then
    raise exception 'Te veel weekplanstappen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, weekplanstappen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from goals g
   where g.owner_id = (select auth.uid()) and g.created_at > now() - interval '1 day';
  if v_totaal > doelen_plafond() * 2 then
    raise exception 'Te veel doelen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, doelen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_mijlpalen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from milestones m join goals g on g.id = m.goal_id
   where g.owner_id = (select auth.uid()) and m.created_at > now() - interval '1 day';
  if v_totaal > mijlpalen_plafond() * 2 then
    raise exception 'Te veel mijlpalen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, mijlpalen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_doelgebeurtenissen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from goal_events e
   where e.actor_id = (select auth.uid()) and e.created_at > now() - interval '1 day';
  if v_totaal > doelgebeurtenissen_plafond() * 2 then
    raise exception 'Te veel doelgebeurtenissen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, doelgebeurtenissen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
  end if;
  return new;
end $$;

create or replace function public.rem_goedkeuringen() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare v_totaal integer;
begin
  if (select auth.uid()) is null then return new; end if;
  select count(*) into v_totaal from completion_approvals a
   where a.approver_id = (select auth.uid()) and a.created_at > now() - interval '1 day';
  if v_totaal > goedkeuringen_plafond() * 2 then
    raise exception 'Te veel goedkeuringen in één verzoek (% in het laatste etmaal, noodgrens %)',
      v_totaal, goedkeuringen_plafond() * 2
      using errcode = 'check_violation',
            hint = 'Dit is de noodstop van 0199 op tweemaal het dagplafond, niet het dagplafond zelf. '
                   'Het dagplafond wordt door de teller van 0192 gehandhaafd.';
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

-- ⚠️ **De rem staat vóór de teller, en de volgorde is niet aan toeval overgelaten.**
--    Postgres vuurt gelijksoortige triggers op alfabetische naam; deze zijn
--    `*_rem` en die van 0192 zijn `*_dagplafond`. Dat maakt hier niets uit — de
--    ene is BEFORE ROW en de andere AFTER STATEMENT, dus de volgorde ligt al
--    vast in het model en niet in de naam. Het staat er omdat de vraag anders
--    bij de volgende lezer opkomt.

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
  'handhaver is begrens_doelen(); deze functie begrenst alleen wat er onderweg '
  'naar die weigering op schijf terechtkomt.';
