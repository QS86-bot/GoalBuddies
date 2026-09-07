-- 0185_cycle_index_wordt_door_niemand_gelezen.sql — een kolom die alleen geschreven werd, en de client een extra query per weekdoel kostte (QS8-147)
--
-- ⚠️⚠️ **DEPLOY DE ROLLOVER IN DEZELFDE RONDE ALS DEZE MIGRATIE.**
--   Deze migratie dropt `activeer_weekplanstap(uuid, date, integer)` en zet er
--   `(uuid, date)` neer. De gedeployde rollover roept nog de driearguments vorm
--   aan en krijgt van PostgREST `PGRST202`; die fout wordt zacht afgevangen met
--   `continue`, dus er schuift stil geen enkele weekplanstap meer in — elk uur,
--   voor iedereen — terwijl het afschrijven van gemiste weken doorloopt.
--   `npx supabase functions deploy rollover`. Zie `docs/DEPLOY.md` §2.3a.
--
-- ROLLBACK-PAD:
--   alter table public.weekly_goals add column cycle_index integer;
--   update public.weekly_goals set cycle_index = 1 where cycle_index is null;
--   alter table public.weekly_goals alter column cycle_index set not null;
--   plus de vier functies terugzetten uit 0091 (`schuif_weekdoel_door`) en 0138
--   (`weekplanstap_naar_weekdoel`, `activeer_weekplanstap`, `start_weekplanstap`),
--   en de kolomgrant op `cycle_index` opnieuw uitdelen — die komt uit
--   `0043` (r.95, INSERT) en `0044` (r.64), niet uit 0173 of 0180: 📏 0173 noemt
--   `weekly_goals` niet één keer en 0180 gunt alleen een functie. Draai die twee
--   migraties niet in hun geheel opnieuw; dat revoked en hergrant een stuk of
--   twaalf andere tabellen. Neem alleen `cycle_index` in de kolomlijst mee.
--   ⚠️⚠️ **De wáárden komen niet terug.** Dit is de destructieve helft van deze
--   migratie en de reden dat hij expliciet is afgestemd (07-09-2026): het
--   antwoord was "helemaal weg, ga uit van leeg". De kolom draagt een afgeleide
--   weekteller die nergens gelezen wordt; wat verloren gaat is een cache en geen
--   geschiedenis.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Dossierrij van 27-08-2026, risico Middel. 📏 Opnieuw nagemeten op 07-09 over
-- `src/`, `app/`, `supabase/` en `tests/`:
--
--   geschreven op   5 plekken (`weekly.ts` ×2, `weekplan.ts`, `rollover`, en
--                   de fixtures van de RLS-suite)
--   gelezen voor    nul. Geen enkele query selecteert hem, geen enkele functie
--   logica          noemt hem, `herbereken_reeks()` groepeert op
--                   `cycle_start_date`.
--
-- Migratie 0139 kwam tot dezelfde uitkomst en schreef hem op: *"hij wordt alleen
-- geschréven en nooit voor logica gelezen — het is een weekteller voor het
-- scherm."* Die migratie liet hem daarom bewust níét meeverhuizen bij een
-- week-startwijziging, en dat is het tweede argument: na zo'n wijziging schuift
-- het hele raster op en klopt de teller sowieso niet meer.
--
-- ⚠️ **De prijs stond niet in de kolom maar ernaast.** Om hem te vullen roept de
-- client `eersteCyclusVanDoel()` aan — één extra `maybeSingle()` vóór élk
-- aanmaken en élk doorschuiven van een weekdoel, op vijf aanroepplekken. Dat is
-- de hele opbrengst van dit issue: een query minder op een pad dat een gebruiker
-- meerdere keren per week loopt, voor een getal dat niemand opvraagt.
--
-- ---------------------------------------------------------------------------
-- Waarom weg en niet server-side afleiden
-- ---------------------------------------------------------------------------
--
-- Het issue bood twee uitwegen. De tweede — hem uit een trigger of een
-- gegenereerde kolom laten komen — is dicht, en dat is niet vanwege moeite:
--
-- `cycle_index` is *het aantal cycli tussen de eerste week van het doel en deze*,
-- en dat rekenen vraagt de week-startdag van de gebruiker. **Correctheidsregel 7
-- verbiedt elke week- of tijdberekening buiten `shared/time`.** De kop van 0139
-- zegt het met zoveel woorden: zo'n trigger zou *"wanneer begint een week"* in
-- SQL neerzetten, en daar is die regel tegen. Vandaar dat de client rekende en
-- de server schreef.
--
-- Blijft over: weg ermee. Dat is meteen de enige uitweg die de extra query
-- opruimt, want elke variant waarin de kolom blijft, houdt een schrijver.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Vier functies opnieuw, en dat is de gevaarlijkste beweging die er is
-- ---------------------------------------------------------------------------
--
-- De parameter zit in vier handtekeningen, en een returntype-wijziging kan niet
-- met `create or replace` — dus vier keer drop en opnieuw. CLAUDE.md noemt een
-- verhuizing de gevaarlijkste beweging die er is: de tests verhuizen mee en
-- blijven groen, want ze toetsen wat er in het bestand staat en niet wat het
-- bestand belóófde.
--
-- Wat er dus per functie overeind moet blijven, en wat hieronder één voor één
-- is overgenomen uit `pg_get_functiondef()` van de draaiende database:
--
--   schuif_weekdoel_door        not_logged_in · eigenaarschap · not_missed ·
--                               `weekdoelen_over() < 1` (de dagrem van 0083, die
--                               deze definer anders omzeilt) · status → carried
--   weekplanstap_naar_weekdoel  `for update` (twee overlappende rollover-rondes)
--                               · al_verbruikt · al_geactiveerd ·
--                               doel_niet_actief · de stap markeren
--   activeer_weekplanstap       `order by order_index, created_at, id` — drie
--                               kolommen, want bij gelijkspel kiest het queryplan
--                               anders (de fout van QS8-56)
--   start_weekplanstap          not_logged_in · het orakel-antwoord (onbekend en
--                               niet-van-jou geven hetzelfde) · `weekdoelen_over()`
--
-- ⚠️ **Er is niets bijgekomen, en de eerste versie van deze kop beweerde het
-- tegendeel.** Die zei dat de null-toets op `p_cycle_start_date` meeliftte op
-- `p_cycle_index is null` en dus vervangen moest worden. 📏 Allebei nagemeten en
-- allebei onwaar: 0091 toetst alleen `p_cycle_index` (r.177), dus een null-datum
-- mét een geldige index viel ook toen al door naar de insert en gaf dezelfde ruwe
-- `23502`. De test op `main` stuurde precies dat — `p_cycle_start_date: null` bij
-- `p_cycle_index: 6` — en verwachtte een ruwe fout, geen `ongeldige_cyclus`.
--
-- ⚠️⚠️ **De not-null van de kolom ís hier de grendel, en dat moet zo blijven.**
-- Een nette null-tak erbij maakt `tests/rls/doorschuiven.test.ts` blind; de
-- uitleg staat in de functie zelf, bij de aantekening die daar met zoveel
-- woorden zegt waarom er géén toets staat. Wie deze kop leest en de tak alsnog
-- toevoegt, sloopt die naad-test zonder dat iets rood wordt.
--
-- ⚠️ De grants worden per functie opnieuw uitgedeeld en zijn nagemeten vóór de
-- drop: `schuif_weekdoel_door` en `start_weekplanstap` voor `authenticated` én
-- `service_role`, `activeer_weekplanstap` alleen `service_role` (de rollover),
-- en `weekplanstap_naar_weekdoel` voor niemand — die is intern.
-- Onwrikbare regel 4: elke revoke noemt `authenticated` met zoveel woorden.
--
-- ⚠️ **Bij `schuif_weekdoel_door` en `start_weekplanstap` is `service_role` een
-- erfenis die hier tot besluit wordt verheven, en dat hoort erbij te staan.**
-- 📏 `0091:227` en `0138:542` gunnen alléén `authenticated`; de `svc=true` die
-- vóór de drop gemeten is, kwam dus uit `alter default privileges` en niet uit
-- een regel die iemand geschreven heeft. Het resultaat is één-op-één gelijk
-- gehouden — dat was hier de bedoeling, want een handtekeningwijziging is niet
-- het moment om ook rechten te verschuiven — maar wie dit recht ooit wil
-- weghalen, moet weten dat er nooit iemand ja tegen gezegd heeft.

-- ---------------------------------------------------------------------------
-- 1. schuif_weekdoel_door
-- ---------------------------------------------------------------------------

drop function if exists public.schuif_weekdoel_door(uuid, date, integer);

create or replace function public.schuif_weekdoel_door(
  p_weekly_goal_id   uuid,
  p_cycle_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  w     weekly_goals%rowtype;
  nieuw weekly_goals%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  -- ⚠️⚠️ **Hier staat met opzet géén null-toets op `p_cycle_start_date`**, en
  --    dat is een correctie op de eerste versie van deze migratie. Daar stond
  --    er wel een, als "nette vervanging" van de `p_cycle_index is null`-tak
  --    die verdween — en die maakte `tests/rls/doorschuiven.test.ts` rood.
  --
  --    Die test bewijst dat de update naar `carried` en de insert **één
  --    transactie** zijn, en hij doet dat door de insert láát te laten falen:
  --    `cycle_start_date` is `not null`, dus met een null-datum klapt hij ná de
  --    update, en die update rolt mee terug. Een vroege `return` maakt dat pad
  --    onbereikbaar — de test werd rood, en zonder die test zou niets meer
  --    zien of 0091's transactiebelofte nog staat.
  --
  --    Een grendel die eruitziet als een verbetering en een naad-test blind
  --    maakt, is duurder dan de ruwe fout die hij vervangt. De not-null van de
  --    kolom ís de grendel.

  select w2.* into w
  from weekly_goals w2
  join goals g on g.id = w2.goal_id
  where w2.id = p_weekly_goal_id and g.owner_id = auth.uid();

  if w.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if w.status <> 'missed' then
    return jsonb_build_object('ok', false, 'reason', 'not_missed');
  end if;

  -- ⚠️ De bovengrens van 0083, hier opnieuw. Deze functie is SECURITY DEFINER en
  --    loopt dus om `weekly_goals_insert` heen; zonder deze regel is doorschuiven
  --    het gat in die limiet.
  if weekdoelen_over() < 1 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_deze_dag');
  end if;

  update weekly_goals set status = 'carried' where id = p_weekly_goal_id;

  insert into weekly_goals (
    goal_id, milestone_id, title, floor_text, ceiling_text,
    points_ceiling, points_floor, points_miss,
    cycle_start_date, ai_generated
  )
  values (
    w.goal_id, w.milestone_id, w.title, w.floor_text, w.ceiling_text,
    w.points_ceiling, w.points_floor, w.points_miss,
    p_cycle_start_date, w.ai_generated
  )
  returning * into nieuw;

  return jsonb_build_object('ok', true, 'weekdoel', to_jsonb(nieuw));
end;
$$;

revoke execute on function public.schuif_weekdoel_door(uuid, date)
  from public, anon, authenticated;
grant  execute on function public.schuif_weekdoel_door(uuid, date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. weekplanstap_naar_weekdoel
-- ---------------------------------------------------------------------------

drop function if exists public.weekplanstap_naar_weekdoel(uuid, date, integer);

create or replace function public.weekplanstap_naar_weekdoel(
  p_step_id          uuid,
  p_cycle_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stap  weekly_plan_steps%rowtype;
  nieuw weekly_goals%rowtype;
begin
  if p_cycle_start_date is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  -- ⚠️ `for update` en niet een kale select. Twee rollover-rondes die elkaar
  --    overlappen — en die overlappen, want de job draait elk uur en kan
  --    uitlopen — lezen anders allebei dezelfde onverbruikte stap. De unieke
  --    index vangt dat alsnog, maar dan als een storingsmelding in het log in
  --    plaats van als een nette `al_geactiveerd`.
  select * into stap
  from weekly_plan_steps
  where id = p_step_id
  for update;

  if stap.id is null then
    return jsonb_build_object('ok', false, 'reason', 'onbekend');
  end if;

  if stap.activated_cycle is not null then
    return jsonb_build_object('ok', false, 'reason', 'al_verbruikt');
  end if;

  -- De grendel uit de kop, hier als vraag in plaats van als botsing. Twee
  -- stappen van hetzelfde doel in dezelfde cyclus is precies wat dit hele
  -- ontwerp voorkomt.
  if exists (
    select 1 from weekly_plan_steps
    where goal_id = stap.goal_id and activated_cycle = p_cycle_start_date
  ) then
    return jsonb_build_object('ok', false, 'reason', 'al_geactiveerd');
  end if;

  -- ⚠️ Alleen voor een lopend doel. Een gearchiveerd of afgerond doel dat nog
  --    een plan heeft liggen, zou anders elke week een weekdoel krijgen dat de
  --    eigenaar nooit gevraagd heeft — en dat kost hem een minpunt zodra de week
  --    verstrijkt.
  if not exists (
    select 1 from goals g where g.id = stap.goal_id and g.status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'doel_niet_actief');
  end if;

  insert into weekly_goals (
    goal_id, milestone_id, title, floor_text, ceiling_text,
    cycle_start_date, ai_generated
  )
  values (
    stap.goal_id, stap.milestone_id, stap.title, stap.floor_text, stap.ceiling_text,
    p_cycle_start_date, stap.ai_generated
  )
  returning * into nieuw;

  update weekly_plan_steps
     set weekly_goal_id  = nieuw.id,
         activated_cycle = p_cycle_start_date
   where id = stap.id;

  return jsonb_build_object('ok', true, 'weekdoel', to_jsonb(nieuw));
end;
$$;

-- ⚠️ **Voor niemand uitvoerbaar, `service_role` inbegrepen** — en dat laatste is
--    geen overdaad maar een meting. De eerste versie van deze migratie noemde
--    alleen `public, anon, authenticated`, en toen stond er:
--
--      weekplanstap_naar_weekdoel(uuid,date)  anon=false auth=false svc=true
--
--    terwijl de oude handtekening `svc=false` had. Supabase's
--    `alter default privileges` deelt élke nieuwe functie ook aan `service_role`
--    uit, dus een drop-en-opnieuw verruimt stilzwijgend. Dat de rollover er niet
--    bij hoeft, staat vast: hij roept `activeer_weekplanstap()` aan, en die is
--    SECURITY DEFINER en draait dus onder de eigenaar.
revoke execute on function public.weekplanstap_naar_weekdoel(uuid, date)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. activeer_weekplanstap
-- ---------------------------------------------------------------------------

drop function if exists public.activeer_weekplanstap(uuid, date, integer);

create or replace function public.activeer_weekplanstap(
  p_goal_id          uuid,
  p_cycle_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  volgende uuid;
begin
  select id into volgende
  from weekly_plan_steps
  where goal_id = p_goal_id and activated_cycle is null
  -- ⚠️ Drie kolommen en niet één. `order_index` is niet uniek — herordenen is
  --    een reeks updates en een unieke constraint zou daar een deferrable
  --    constraint van maken voor iets wat geen slot nodig heeft. Maar dan is
  --    `order by order_index` bij een gelijkspel géén volgorde: het queryplan
  --    kiest, en dezelfde data geeft twee keer een ander antwoord. Dat is
  --    precies de fout van QS8-56, daar met `groepen[0]` uit een lijst zonder
  --    `order by`.
  order by order_index asc, created_at asc, id asc
  limit 1;

  if volgende is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_stap');
  end if;

  return weekplanstap_naar_weekdoel(volgende, p_cycle_start_date);
end;
$$;

revoke execute on function public.activeer_weekplanstap(uuid, date)
  from public, anon, authenticated;
grant  execute on function public.activeer_weekplanstap(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 4. start_weekplanstap
-- ---------------------------------------------------------------------------

drop function if exists public.start_weekplanstap(uuid, date, integer);

create or replace function public.start_weekplanstap(
  p_step_id          uuid,
  p_cycle_start_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  eigenaar uuid;
begin
  if (select auth.uid()) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  select g.owner_id into eigenaar
  from weekly_plan_steps s
  join goals g on g.id = s.goal_id
  where s.id = p_step_id;

  -- ⚠️ Onbekend en niet-van-jou geven hetzelfde antwoord. Anders vertelt deze
  --    functie of een id bestaat, en dat is een orakel — dezelfde reden als bij
  --    `invite_preview()` in 0080.
  if eigenaar is null or eigenaar <> (select auth.uid()) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- ⚠️ De dagrem van `weekly_goals_insert` (0083/0091), hier opnieuw. Deze
  --    functie is SECURITY DEFINER en loopt dus om die policy heen; zonder deze
  --    regel is "start deze nu" het gat in die limiet. Precies de fout die 0091
  --    voor `schuif_weekdoel_door()` moest repareren.
  if weekdoelen_over() < 1 then
    return jsonb_build_object('ok', false, 'reason', 'te_veel_deze_dag');
  end if;

  return weekplanstap_naar_weekdoel(p_step_id, p_cycle_start_date);
end;
$$;

revoke execute on function public.start_weekplanstap(uuid, date)
  from public, anon, authenticated;
grant  execute on function public.start_weekplanstap(uuid, date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. En dan pas de kolom
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De drop vangt niets, en de eerste versie van deze kop beweerde van
--    wel** ("zolang een van de vier hem nog noemt, weigert de drop"). 📏 Nagedaan
--    op een wegwerptabel: een plpgsql-functie die `select b from tst` doet,
--    daarna `alter table tst drop column b` → `ALTER TABLE`, geen weigering, de
--    functie blijft staan en klapt pas bij aanroep met `column "b" does not
--    exist`. Postgres registreert geen afhankelijkheden voor plpgsql-lichamen,
--    en alle vier deze functies zijn plpgsql.
--
--    **Dat is de duurzame les van deze migratie**: bij het weghalen van een
--    kolom is er geen vangnet in de database. Wat het hier wél gevangen heeft is
--    de grep over `src/`, `app/`, `supabase/` en `tests/`, plus
--    `npm run keten:controle`. De volgorde hieronder is nog steeds de juiste —
--    eerst de functies, dan de kolom — maar als hygiëne en niet als grendel.

alter table public.weekly_goals drop column if exists cycle_index;
