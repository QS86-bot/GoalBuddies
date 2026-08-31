-- 0138_een_weekplan_is_nog_geen_weekdoel.sql — geplande weekstappen krijgen een eigen tabel (QS8-203)
--
-- ROLLBACK-PAD:
--   drop function if exists public.weekplan_kandidaten(uuid);
--   drop function if exists public.herorden_weekplan(uuid, uuid[]);
--   drop function if exists public.activeer_weekplanstap(uuid, date, integer);
--   drop function if exists public.start_weekplanstap(uuid, date, integer);
--   drop function if exists public.weekplanstap_naar_weekdoel(uuid, date, integer);
--   drop function if exists public.weekplanstappen_over();
--   drop table if exists public.weekly_plan_steps;
--
--   ⚠️ De tabel gaat in zijn geheel weg en dat mag: hij bevat uitsluitend
--      vooruitblik. Alles wat een weekdoel gewórden is, staat in `weekly_goals`
--      en blijft daar staan — met zijn punten, zijn status en zijn voltooiingen.
--      Wat je verliest is het plan vanaf hier, niet de geschiedenis.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Uit de review van 30-08-2026: "op basis van de mijlpalen wil ik dat er
-- automatisch weekdoelen gegenereerd worden." Dat kan vandaag niet, en het is
-- ook niet zomaar aan te zetten — om een reden die in het puntenmodel zit en
-- niet in de code.
--
-- ⚠️ **Elk weekdoel verhoogt het puntenplafond** (domeinregel 10, en
--    `goals.max_points` wordt door een trigger onderhouden als
--    `SUM(points_ceiling)` over `weekly_goals`). En `maakWeekdoel()` zet een
--    weekdoel altijd in de **huidige** cyclus, want de client mag "deze week"
--    niet zelf bepalen (correctheidsregel 7).
--
--    Zes voorgestelde weekstappen in één keer overnemen betekent dus zes
--    weekdoelen in dezelfde week: **vijf gegarandeerd gemiste weken en vijf
--    minpunten, voor iets wat de app zélf heeft voorgesteld.** Dat is precies
--    waarom `/doel/weekdoelen/[id]` vandaag geen "alles toevoegen"-knop heeft.
--
-- Besluit van Quinten, 30-08-2026: **plan vooruit, activeer per week.**
--
-- ---------------------------------------------------------------------------
-- Waarom een eigen tabel en geen kolom op `weekly_goals`
-- ---------------------------------------------------------------------------
--
-- ⚠️ Een geplande stap ís nog geen weekdoel, en hem in `weekly_goals` zetten met
--    een vlaggetje erbij laat hem meetellen in élke telling die er nu al is —
--    `max_points` via de trigger, `herbereken_reeks()`, `goal_dashboard`,
--    `weekdoelen_over()`, de rollover die hem `missed` zou stempelen. Dan is de
--    vraag niet "welke tellingen moet ik aanpassen" maar "welke tellingen ben ik
--    vergeten", en die tweede vraag beantwoordt zich pas als er een minpunt te
--    veel geboekt is.
--
--    Een eigen tabel begint bij nul tellingen. Dat is de hele reden.
--
-- ---------------------------------------------------------------------------
-- Domeinregel 7 — de twee vragen, voor een nieuw oppervlak
-- ---------------------------------------------------------------------------
--
-- 1. **Kan hieruit iemands gemiste week worden afgeleid?** Ja, indirect: wie
--    ziet dat stap 3 vorige week is geactiveerd en deze week nog steeds stap 3
--    de laatste is, weet dat er niets geactiveerd is. Belangrijker nog: een
--    weekplan is een vooruitblik op je eigen werk en gaat een groepsgenoot
--    sowieso niets aan.
-- 2. **Kan iemand het buiten de UI om uitlezen?** Alleen als er een policy is
--    die dat toestaat. Die is er niet.
--
-- **Eigenaar-only, alle vier de werkwoorden, en met opzet géén tak voor
-- groepsgenoten** — dezelfde vorm als `goal_risk` in 0050. Ook in een **open**
-- groep (besluit A41) blijft dit dicht: `groups.zichtbaarheid` komt in geen
-- enkele policy hieronder voor. Voor élk nieuw oppervlak is beschermd het
-- antwoord tot iemand het tegendeel besluit, en niemand heeft dat hier besloten.
--
-- ⚠️ En een geplande stap is dus ook **geen belofte aan de groep**: hij
--    verschijnt nergens in de groepsfeed, in De Ketting of in een systeembericht.
--    Er komt geen nieuw type systeembericht bij, en dat is bewust — pas als een
--    stap een écht weekdoel wordt, gelden de bestaande regels en de bestaande
--    berichten.
--
-- ---------------------------------------------------------------------------
-- Waar de idempotentie zit, en waarom niet op `weekly_goals`
-- ---------------------------------------------------------------------------
--
-- De rollover draait elk uur. Hij mag dus niet elke ronde een volgende stap
-- inschuiven — dan staat er zondagavond een weekdoel of zeven.
--
-- ⚠️ **De voor de hand liggende grendel bestaat niet en mag niet bestaan.** Een
--    unieke constraint op `weekly_goals (goal_id, cycle_start_date)` zou dit in
--    één regel oplossen, maar besluit **A37** (24-08-2026) staat twee weekdoelen
--    op hetzelfde doel in één week juist toe, en migratie 0074 rekent daarmee.
--    Zie ook de kop van 0083, waar dezelfde voorgestelde constraint al eens is
--    afgewezen.
--
-- De grendel staat daarom op de nieuwe tabel, waar hij niets terugdraait:
--
--      weekly_plan_steps_een_per_cyclus  unique (goal_id, activated_cycle)
--                                        where activated_cycle is not null
--
-- Eén doel activeert per cyclus hoogstens één geplande stap. Een tweede ronde
-- van de rollover botst op die index en `activeer_weekplanstap()` geeft
-- `al_geactiveerd` terug in plaats van een tweede weekdoel te maken. **Dat is de
-- hele idempotentie, en hij is een index en geen afspraak.**
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. De tabel
-- ---------------------------------------------------------------------------

create table if not exists public.weekly_plan_steps (
  id             uuid        primary key default gen_random_uuid(),
  goal_id        uuid        not null references public.goals (id)      on delete cascade,
  milestone_id   uuid        references public.milestones (id)          on delete set null,
  order_index    integer     not null,
  title          text        not null,
  floor_text     text,
  ceiling_text   text,
  ai_generated   boolean     not null default false,

  -- ⚠️ Twee kolommen voor één gebeurtenis, en dat is opzet.
  --
  --    `activated_cycle` is de waarheid: is hij gevuld, dan is deze stap
  --    verbruikt en komt hij nooit meer terug. `weekly_goal_id` is de
  --    terugverwijzing en mag leeglopen — `verwijder_weekdoel()` (0046) staat de
  --    eigenaar toe een vers weekdoel weg te gooien, en dan is de rij weg terwijl
  --    de stap verbruikt blijft.
  --
  --    Er is daarom **geen** constraint die eist dat ze allebei gevuld of allebei
  --    leeg zijn. Zo'n constraint zou `verwijder_weekdoel()` laten falen op een
  --    weekdoel dat uit een plan komt, en dat is een storingsmelding op een
  --    handeling die niets met plannen te maken heeft.
  weekly_goal_id uuid        references public.weekly_goals (id)        on delete set null,
  activated_cycle date,

  created_at     timestamptz not null default now(),

  -- Dezelfde grenzen als `weekly_goals` — 200 uit 0001 voor de titel, 200 uit
  -- 0123 voor de vloer- en plafondtekst. Een stap wordt letterlijk een weekdoel,
  -- dus een ruimere grens hier is een storingsmelding daar.
  constraint weekly_plan_steps_title_len
    check (char_length(title) between 1 and 200),
  constraint weekly_plan_steps_floor_text_len
    check (floor_text is null or char_length(floor_text) <= 200),
  constraint weekly_plan_steps_ceiling_text_len
    check (ceiling_text is null or char_length(ceiling_text) <= 200),

  -- ⚠️ Een bovengrens op de plánlengte, en 52 is geen willekeurig getal: een
  --    plan dat verder reikt dan een jaar is geen plan meer. Zonder deze grens is
  --    `order_index` een vrij veld en is de enige rem de dagelijkse teller
  --    hieronder — die beschermt de opslag, niet de betekenis.
  constraint weekly_plan_steps_order_bereik
    check (order_index between 1 and 52)
);

comment on table public.weekly_plan_steps is
  'Geplande weekstappen onder een mijlpaal (QS8-203). Een stap is nog géén '
  'weekdoel: hij telt niet mee in max_points, levert geen punten op en kan geen '
  'minpunt kosten. De rollover activeert er hoogstens één per doel per cyclus. '
  'Uitsluitend leesbaar en schrijfbaar voor de eigenaar van het doel — ook in '
  'een open groep (A41), want een vooruitblik op je eigen werk is geen belofte '
  'aan de groep.';

comment on column public.weekly_plan_steps.activated_cycle is
  'De cyclus waarin deze stap een weekdoel is geworden. NULL = nog gepland. Dit '
  'is de waarheid over "verbruikt", niet weekly_goal_id — die mag leeglopen als '
  'de eigenaar het weekdoel weggooit.';

-- Onwrikbare regel 11: een index op elke foreign key en op elke kolom waarop
-- gefilterd of gesorteerd wordt.
create index if not exists weekly_plan_steps_goal_order_idx
  on public.weekly_plan_steps (goal_id, order_index);
create index if not exists weekly_plan_steps_milestone_idx
  on public.weekly_plan_steps (milestone_id) where milestone_id is not null;
create index if not exists weekly_plan_steps_weekdoel_idx
  on public.weekly_plan_steps (weekly_goal_id) where weekly_goal_id is not null;

-- ⚠️ De query van de rollover: welke doelen hebben nog een openstaande stap.
--    Partieel, want een verbruikte stap wordt nooit meer gezocht.
create index if not exists weekly_plan_steps_open_idx
  on public.weekly_plan_steps (goal_id, order_index) where activated_cycle is null;

-- ⚠️ **De grendel.** Zie de kop: dit is wat de rollover idempotent maakt, en het
--    is een index en geen afspraak.
create unique index if not exists weekly_plan_steps_een_per_cyclus
  on public.weekly_plan_steps (goal_id, activated_cycle)
  where activated_cycle is not null;

-- ---------------------------------------------------------------------------
-- 2. De dagelijkse rem
-- ---------------------------------------------------------------------------

/**
 * Hoeveel geplande weekstappen mag de ingelogde gebruiker nu nog aanmaken?
 *
 * Zelfde vorm en zelfde reden als `weekdoelen_over()` uit 0091: het getal staat
 * op één plek, en zowel de policy als een toekomstige definer-functie leest hem
 * daar. 200 per etmaal is ruim voor vier doelen met een jaarplan en krap genoeg
 * om een lus te stoppen.
 *
 * ⚠️ Faalt dicht bij een lege `auth.uid()` — nul, en niet de hele limiet.
 */
create or replace function public.weekplanstappen_over()
  returns integer
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select case
    when (select auth.uid()) is null then 0
    else greatest(
      0,
      200 - (
        select count(*)::integer
        from weekly_plan_steps s
        join goals g on g.id = s.goal_id
        where g.owner_id = (select auth.uid())
          and s.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.weekplanstappen_over() is
  'Het resterende budget aan geplande weekstappen van de ingelogde gebruiker '
  'over het laatste etmaal (beveiligingsregel 5, vorm uit 0091). Geeft zonder '
  'sessie nul terug.';

revoke all on function public.weekplanstappen_over() from public, anon, authenticated;
grant execute on function public.weekplanstappen_over() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS — eigenaar-only, alle vier de werkwoorden
-- ---------------------------------------------------------------------------

alter table public.weekly_plan_steps enable row level security;

drop policy if exists weekly_plan_steps_select on public.weekly_plan_steps;
create policy weekly_plan_steps_select on public.weekly_plan_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = weekly_plan_steps.goal_id and g.owner_id = (select auth.uid())
    )
  );

-- ⚠️ `(select auth.uid())` en niet de kale aanroep — migratie 0122 en
--    `initplan_bewaking()`. Postgres evalueert de kale vorm per rij; in een
--    subquery één keer per query.

-- ⚠️ De dagelijkse rem staat in de INSERT-policy en niet alleen in de app.
--    Beveiligingsregel 5, en dezelfde vorm als `weekdoelen_over()` uit 0091:
--    een tabel die de eigenaar zelf mag vullen is een opslagvector, ook als er
--    geen punt mee te winnen valt. Dat onderscheid maakt 0083 §"opslagmisbruik
--    en geen scoremisbruik" en het geldt hier onverkort.
drop policy if exists weekly_plan_steps_insert on public.weekly_plan_steps;
create policy weekly_plan_steps_insert on public.weekly_plan_steps
  for insert to authenticated
  with check (
    exists (
      select 1 from public.goals g
      where g.id = weekly_plan_steps.goal_id and g.owner_id = (select auth.uid())
    )
    and public.weekplanstappen_over() > 0
  );

-- ⚠️ Herordenen en bijstellen mag; een verbruikte stap veranderen niet. Anders
--    kun je de geschiedenis van je eigen plan herschrijven nadat er een weekdoel
--    uit ontstaan is — en dat weekdoel draagt dan een tekst die nergens meer
--    vandaan komt. Dezelfde gedachte als domeinregel 6.
drop policy if exists weekly_plan_steps_update on public.weekly_plan_steps;
create policy weekly_plan_steps_update on public.weekly_plan_steps
  for update to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = weekly_plan_steps.goal_id and g.owner_id = (select auth.uid())
    )
    and weekly_plan_steps.activated_cycle is null
  )
  with check (
    exists (
      select 1 from public.goals g
      where g.id = weekly_plan_steps.goal_id and g.owner_id = (select auth.uid())
    )
    -- ⚠️ Zichzelf activeren is precies wat hier niet mag: dan schrijft de client
    --    een cyclus, en dat is correctheidsregel 7 door de achterdeur. Activeren
    --    loopt uitsluitend via de functies hieronder.
    and weekly_plan_steps.activated_cycle is null
    and weekly_plan_steps.weekly_goal_id is null
  );

drop policy if exists weekly_plan_steps_delete on public.weekly_plan_steps;
create policy weekly_plan_steps_delete on public.weekly_plan_steps
  for delete to authenticated
  using (
    exists (
      select 1 from public.goals g
      where g.id = weekly_plan_steps.goal_id and g.owner_id = (select auth.uid())
    )
    -- Een verbruikte stap weggooien zou het weekdoel losmaken van zijn herkomst
    -- en de grendel hierboven vrijgeven. De vooruitblik mag weg, de
    -- geschiedenis niet.
    and weekly_plan_steps.activated_cycle is null
  );

revoke all on public.weekly_plan_steps from anon;
grant select, insert, update, delete on public.weekly_plan_steps to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Activeren — het gedeelde hart
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Drie functies en niet één, omdat er twee verschillende bellers zijn met
--    twee verschillende bewijzen.** De rollover belt als `service_role` en heeft
--    geen `auth.uid()`; de gebruiker belt met een sessie en heeft er wel een.
--
--    Eén functie die "geen `auth.uid()`" als "dus service_role" leest, ís de
--    NULL-val die dit project al eens veertig regels gekost heeft (CLAUDE.md,
--    regel 19, reden 2). Dus: één interne functie met het werk, en twee
--    ingangen die elk hun eigen toegangsbewijs eisen.
--
-- ⚠️ `p_cycle_start_date` en `p_cycle_index` komen van de beller en dat moet ook.
--    Correctheidsregel 7: de database weet de week-startdag van deze gebruiker
--    niet en hoort die niet uit te rekenen. Dezelfde verdeling als
--    `schuif_weekdoel_door()` in 0091 en `verbruik_weekpas()` in 0039.

/**
 * Zet één geplande stap om in een weekdoel. Intern — geen enkele rol mag hem
 * rechtstreeks aanroepen.
 *
 * Doet géén autorisatie. Dat is het werk van de twee ingangen hieronder, en het
 * staat hier expliciet zodat de volgende lezer niet denkt dat het al gebeurd is.
 */
create or replace function public.weekplanstap_naar_weekdoel(
  p_step_id uuid,
  p_cycle_start_date date,
  p_cycle_index integer
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  stap weekly_plan_steps%rowtype;
  nieuw weekly_goals%rowtype;
begin
  if p_cycle_start_date is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  if p_cycle_index is null or p_cycle_index < 1 then
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
    cycle_start_date, cycle_index, ai_generated
  )
  values (
    stap.goal_id, stap.milestone_id, stap.title, stap.floor_text, stap.ceiling_text,
    p_cycle_start_date, p_cycle_index, stap.ai_generated
  )
  returning * into nieuw;

  update weekly_plan_steps
     set weekly_goal_id = nieuw.id,
         activated_cycle = p_cycle_start_date
   where id = stap.id;

  return jsonb_build_object('ok', true, 'weekdoel', to_jsonb(nieuw));
end;
$$;

comment on function public.weekplanstap_naar_weekdoel(uuid, date, integer) is
  'Intern (QS8-203): zet één geplande weekstap om in een weekdoel. Doet géén '
  'autorisatie — dat is het werk van activeer_weekplanstap() (service_role) en '
  'start_weekplanstap() (de eigenaar). Aan geen enkele rol gegeven.';

-- ⚠️ Aan niemand, ook niet aan `service_role`. De twee ingangen hieronder zijn
--    SECURITY DEFINER en roepen hem aan als eigenaar van de functie; een grant
--    is daarvoor niet nodig. Wat wél nodig is, is dat hij niet als
--    `/rest/v1/rpc/weekplanstap_naar_weekdoel` in de API staat — dat is de les
--    van 0069.
revoke all on function public.weekplanstap_naar_weekdoel(uuid, date, integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Ingang 1 — de rollover
-- ---------------------------------------------------------------------------

/**
 * Activeert de eerstvolgende geplande stap van één doel. Alleen voor de rollover.
 *
 * ⚠️ Kiest de stap zelf in plaats van hem aangewezen te krijgen. De rollover
 *    weet welk doel aan de beurt is; wélke stap dat is, is een eigenschap van
 *    het plan en niet van de job. Laagste openstaande `order_index` wint.
 */
create or replace function public.activeer_weekplanstap(
  p_goal_id uuid,
  p_cycle_start_date date,
  p_cycle_index integer
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

  return weekplanstap_naar_weekdoel(volgende, p_cycle_start_date, p_cycle_index);
end;
$$;

comment on function public.activeer_weekplanstap(uuid, date, integer) is
  'Schuift de eerstvolgende geplande weekstap van een doel in als weekdoel van '
  'de opgegeven cyclus (QS8-203). Alleen voor de rollover: service_role. '
  'Idempotent via de unieke index weekly_plan_steps_een_per_cyclus — een tweede '
  'ronde in dezelfde cyclus geeft al_geactiveerd.';

revoke all on function public.activeer_weekplanstap(uuid, date, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ingang 2 — "start deze nu"
-- ---------------------------------------------------------------------------

/**
 * De eigenaar haalt een geplande stap naar voren.
 *
 * ⚠️ Dit is een aangewezen stap en niet de eerstvolgende: het scherm heeft een
 *    knop bij elke stap, en "start deze nu" op stap 4 hoort stap 4 te starten.
 *    De rest van het plan schuift niet op — de volgorde blijft, alleen deze rij
 *    is verbruikt.
 */
create or replace function public.start_weekplanstap(
  p_step_id uuid,
  p_cycle_start_date date,
  p_cycle_index integer
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

  return weekplanstap_naar_weekdoel(p_step_id, p_cycle_start_date, p_cycle_index);
end;
$$;

comment on function public.start_weekplanstap(uuid, date, integer) is
  'De eigenaar haalt een geplande weekstap naar voren (QS8-203). Toetst de '
  'sessie, het eigenaarschap en de dagrem uit 0083, en laat het werk daarna aan '
  'weekplanstap_naar_weekdoel(). De cyclus komt van de client '
  '(correctheidsregel 7).';

revoke all on function public.start_weekplanstap(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.start_weekplanstap(uuid, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Herordenen
-- ---------------------------------------------------------------------------

/**
 * Herordent de nog niet verbruikte stappen van één doel.
 *
 * Zelfde vorm als `herorden_mijlpalen()` uit 0049, en om dezelfde reden: een lus
 * van losse updates vanuit de client laat bij een afgebroken verbinding een half
 * herordend plan achter, en dan staat er een volgorde die niemand gekozen heeft.
 *
 * ⚠️ De lijst moet **precies** de openstaande stappen zijn — niet een deel
 *    ervan. Twee insluitingen zijn geen gelijkheid; dat is de valkuil die
 *    migratie 0032 een groene test opleverde die niets bewees, en 0049 toetst
 *    hem daarom als verzamelingsgelijkheid. Hier idem.
 *
 * ⚠️ Verbruikte stappen doen niet mee. Hun `order_index` is geschiedenis: hij
 *    zegt op welke plek in het plan het weekdoel ontstond, en dat verandert niet
 *    meer omdat je de rest omgooit.
 */
create or replace function public.herorden_weekplan(
  p_goal_id uuid,
  p_ids     uuid[]
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_bestaand uuid[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select array_agg(s.id order by s.id) into v_bestaand
  from weekly_plan_steps s
  where s.goal_id = p_goal_id and s.activated_cycle is null;

  if coalesce(v_bestaand, '{}') is distinct from (
    select array_agg(x order by x) from unnest(p_ids) as x
  ) then
    return jsonb_build_object('ok', false, 'reason', 'lijst_klopt_niet');
  end if;

  update weekly_plan_steps s
     set order_index = nieuw.positie
    from (
      select id, ordinality::integer as positie
      from unnest(p_ids) with ordinality as t(id, ordinality)
    ) as nieuw
   where s.id = nieuw.id
     and s.goal_id = p_goal_id
     and s.activated_cycle is null;

  return jsonb_build_object('ok', true, 'aantal', coalesce(array_length(p_ids, 1), 0));
end;
$$;

comment on function public.herorden_weekplan(uuid, uuid[]) is
  'Herordent de openstaande weekplanstappen van een doel in één transactie '
  '(QS8-203, vorm uit 0049). Eist de volledige lijst, niet een deel ervan.';

revoke all on function public.herorden_weekplan(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.herorden_weekplan(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Wat de rollover moet weten, in één vraag
-- ---------------------------------------------------------------------------

/**
 * De doelen van één gebruiker die deze cyclus een stap kunnen krijgen, met de
 * vroegste cyclus die dat doel al kent.
 *
 * ⚠️ **Dit bestaat om onwrikbare regel 12.** De rollover heeft per doel twee
 *    dingen nodig — is er nog een openstaande stap, en wat is de vroegste cyclus
 *    van dit doel — en die tweede vraag is precies de query die `eersteCyclusVanDoel()`
 *    in de app per doel stelt. In een scherm is dat één doel; in een job die
 *    over élke gebruiker en élk doel loopt, is het de klassieke N+1.
 *
 * ⚠️ **`min(cycle_start_date)` is geen weekberekening**, en dat onderscheid is de
 *    reden dat dit in SQL mag staan. Er wordt geen week afgeleid, geen
 *    week-startdag toegepast en geen tijdzone gelezen: dit is de kleinste van een
 *    stel opgeslagen datums. Het omrekenen naar een cyclusnummer gebeurt in
 *    `shared/time`, in de Edge Function, met `cyclesBetween()` —
 *    correctheidsregel 7.
 *
 * ⚠️ `eerste_cyclus` is NULL als het doel nog geen enkel weekdoel heeft. Dan is
 *    de week die nu ontstaat per definitie week 1, precies zoals
 *    `eersteCyclusVanDoel()` dat afhandelt.
 */
create or replace function public.weekplan_kandidaten(p_owner_id uuid)
  returns table (goal_id uuid, eerste_cyclus date)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select g.id,
         (select min(w.cycle_start_date) from weekly_goals w where w.goal_id = g.id)
  from goals g
  where g.owner_id = p_owner_id
    and g.status = 'active'
    and exists (
      select 1 from weekly_plan_steps s
      where s.goal_id = g.id and s.activated_cycle is null
    )
  order by g.id;
$$;

comment on function public.weekplan_kandidaten(uuid) is
  'De actieve doelen van een gebruiker met nog minstens één openstaande '
  'weekplanstap, plus de vroegste cyclus die het doel al kent (QS8-203). Eén '
  'vraag in plaats van twee per doel — onwrikbare regel 12. Alleen voor de '
  'rollover: service_role.';

revoke all on function public.weekplan_kandidaten(uuid) from public, anon, authenticated;

commit;
