-- 0140_een_doel_krijgt_een_ritme.sql — dagelijks, x keer per week, of alleen de week (QS8-253)
--
-- ROLLBACK-PAD:
--   drop trigger if exists completions_niveau_uit_dagen on public.completions;
--   drop trigger if exists day_checkins_binnen_de_cyclus on public.day_checkins;
--   drop function if exists public.niveau_uit_dagen();
--   drop function if exists public.afvinking_binnen_de_cyclus();
--   drop function if exists public.dagafvinkingen_over();
--   drop table if exists public.day_checkins;
--   alter table public.weekly_goals drop constraint if exists weekly_goals_dagen_geordend;
--   alter table public.weekly_goals drop column if exists ceiling_days;
--   alter table public.weekly_goals drop column if exists floor_days;
--   alter table public.goals drop constraint if exists goals_ritme_valid;
--   alter table public.goals drop column if exists ritme;
--
--   ⚠️ De kolomgrants hoeven hier niet apart teruggedraaid: een grant hangt aan
--      de kolom en verdwijnt met `drop column` mee.
--
--   ⚠️ `day_checkins` gaat in zijn geheel weg en dat kost geschiedenis: de dagen
--      waarop iemand heeft opgedaagd. Wat er níét mee weggaat zijn de punten en
--      de voltooiingen — die staan in `points_ledger` en `completions` en zijn
--      append-only (domeinregel 6). Wat je verliest is de onderbouwing, niet de
--      uitkomst.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit A53, Quinten, 31-08-2026. Voorgelegd was de vraag óf er een dagreeks
-- bij moest en of die domeinregel 9 zou wijzigen. Het antwoord was een derde
-- ding:
--
--   *Bij het ingeven van het te bereiken doel moet er de keuze komen of het een
--    doel is waaraan dagelijks gewerkt wordt, meerdere keren per week, of dat
--    alleen gekeken wordt naar het weekresultaat.*
--
-- "Elke dag mediteren" en "deze week drie klantgesprekken voeren" zijn niet
-- dezelfde soort belofte, en de app dwong ze tot nu toe in dezelfde vorm.
--
-- ---------------------------------------------------------------------------
-- Het weekdoel draagt zijn eigen regel, en het doel alleen de voorkeur
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`goals.ritme` bepaalt niet hoe een week beoordeeld wordt.** Dat doet
--    `weekly_goals.ceiling_days`. Is die gevuld, dan telt deze week dagen; is
--    hij leeg, dan gedraagt hij zich exact zoals vóór deze migratie.
--
--    Waarom niet gewoon het doel lezen: dan verandert het oordeel over een
--    afgelopen week zodra iemand het ritme van zijn doel omzet. Een week die
--    op vrijdag "drie van vijf dagen" was, moet dat blijven. **De rij draagt de
--    regel waaronder hij is aangemaakt** — dezelfde gedachte als
--    `pin_completion_cycle` in 0006 en als het systeembericht in besluit 002 §3.
--
--    `goals.ritme` is daarmee wat het is: de voorkeur die het scherm gebruikt om
--    het volgende weekdoel voor te stellen, en straks de vraag of er een
--    dagreeks bestaat.
--
-- ---------------------------------------------------------------------------
-- Waarom een eigen tabel en geen tweede betekenis voor `daily_moves`
-- ---------------------------------------------------------------------------
--
-- De Dagzet zit al in `daily_moves` en heeft ook een `local_date` en een
-- `weekly_goal_id`. Verleidelijk, en fout — om precies het argument dat migratie
-- 0138 voor `weekly_plan_steps` maakte:
--
--   1. **`body` is verplicht.** Een afvinking heeft geen tekst. Die kolom
--      nullable maken verandert wat een Dagzet ís.
--   2. **Een Dagzet heeft geen gevolg en een afvinking wel** (domeinregel 9,
--      zoals afgebakend door A53). Zet je ze in één tabel, dan gaat élke telling
--      over `daily_moves` ineens over dingen die meetellen, en is de vraag niet
--      "welke tellingen pas ik aan" maar "welke ben ik vergeten".
--   3. **Ze hebben tegengestelde zichtbaarheidsregels.** Een Dagzet mág je met
--      je groep delen (`visibility`); de afwézigheid van een afvinking is
--      tegenslag en gaat de groep nooit aan. Eén policy kan die twee niet
--      allebei bedienen.
--
-- ---------------------------------------------------------------------------
-- Domeinregel 7 wordt hier strenger, niet losser
-- ---------------------------------------------------------------------------
--
-- Een dagelijkse afvinking is **fijnmaziger tegenslag** dan een gemiste week: uit
-- een rooster met gaten lees je iemands week af, dag voor dag.
--
-- `day_checkins` is daarom eigenaar-only, met opzet géén tak voor groepsgenoten,
-- en dat geldt ook in een **open** groep (A41) — `groups.zichtbaarheid` komt in
-- geen enkele policy hieronder voor. Wat de groep wél ziet is wat ze altijd al
-- zag: het weekdoel, en de voltooiing zodra die is ingediend.
--
-- Opgenomen als oppervlak 27 in `docs/decisions/002-domeinregel7-oppervlakken.md`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Het ritme op het doel
-- ---------------------------------------------------------------------------

alter table public.goals
  add column if not exists ritme text not null default 'weekly';

alter table public.goals drop constraint if exists goals_ritme_valid;
alter table public.goals add constraint goals_ritme_valid
  check (ritme in ('weekly', 'times_per_week', 'daily'));

comment on column public.goals.ritme is
  'De voorkeur van de gebruiker: weekly (alleen het weekresultaat), '
  'times_per_week, of daily. ⚠️ Bepaalt NIET hoe een week beoordeeld wordt — '
  'dat doet weekly_goals.ceiling_days. Dit veld stuurt het voorstel voor het '
  'volgende weekdoel, en straks of er een dagreeks bestaat (A53).';

-- ⚠️ **Een nieuwe kolom is niet schrijfbaar, en dat is geen detail.** `goals`
--    heeft sinds 0046 een kolomgrant voor INSERT en geen tabelgrant; een kolom
--    die daar niet in staat, levert `42501` op zodra de client hem meestuurt —
--    en de client stuurt hem mee, want `doelSchema` geeft `ritme` een default.
--    Zonder deze regel is élk doel aanmaken kapot en niet alleen een ritme-doel.
--
--    Precies de keten uit onwrikbare regel 18 vraag 5, maar dan andersom: bij
--    QS8-113 lag er een kolom die niemand kon vullen; hier zou een bestaand
--    schrijfpad breken op een kolom die erbij kwam. Beide kanten zijn onzichtbaar
--    zonder een database, en deze is gevonden door de suite lokaal te draaien.
grant insert (ritme) on public.goals to authenticated;

-- ⚠️ **Met opzet geen UPDATE.** Het ritme wordt bij het aanmaken gekozen; er is
--    geen scherm dat het achteraf verzet, en een grant zonder schrijfpad is
--    precies het dode hout van QS8-113. Komt dat scherm er, dan hoort de grant
--    in díe migratie — samen met het antwoord op de vraag wat er dan met de
--    lopende week gebeurt (niets: die draagt zijn eigen `ceiling_days`).

-- ---------------------------------------------------------------------------
-- 2. De vloer en het plafond in dagen
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is geen nieuw mechanisme maar domeinregel 8 op een andere eenheid. Bij
--    een weekdoel zijn vloer en plafond tekst ("1 gesprek ingepland" /
--    "3 gesprekken gevoerd"); bij een ritme-doel zijn het aantallen dagen.
--    `daily` is daarmee `times_per_week` met plafond 7, en geen tweede feature.

alter table public.weekly_goals add column if not exists floor_days integer;
alter table public.weekly_goals add column if not exists ceiling_days integer;

alter table public.weekly_goals drop constraint if exists weekly_goals_dagen_geordend;
alter table public.weekly_goals add constraint weekly_goals_dagen_geordend check (
  -- Beide leeg: een gewoon weekdoel, zoals alles wat er nu staat.
  (floor_days is null and ceiling_days is null)
  -- Of een ritme-weekdoel: een plafond binnen de week, en een vloer die er niet
  -- boven ligt. De vloer mag ontbreken — hij is optioneel gebleven bij de review
  -- van 15-08 en dat verandert hier niet.
  or (
    ceiling_days between 1 and 7
    and (floor_days is null or floor_days between 1 and ceiling_days)
  )
);

comment on column public.weekly_goals.ceiling_days is
  'Het aantal dagen dat deze week op zijn best oplevert. NULL = een gewoon '
  'weekdoel dat op tekst wordt beoordeeld. Is deze kolom gevuld, dan telt de '
  'week dagen en leidt niveau_uit_dagen() het bereikte niveau af (QS8-253).';

-- Zelfde reden als bij `goals.ritme` hierboven: 0043 geeft `weekly_goals` een
-- kolomgrant voor INSERT. `weekdoelSchema` zet beide velden standaard op NULL en
-- stuurt ze dus altijd mee, ook bij een gewoon weekdoel.
grant insert (floor_days, ceiling_days) on public.weekly_goals to authenticated;

-- ⚠️ Geen UPDATE, en hier weegt dat zwaarder dan bij `goals.ritme`: `ceiling_days`
--    ís het oordeel over deze week. Wie hem halverwege van 5 naar 3 zet, haalt
--    zijn plafond met terugwerkende kracht. Dat is dezelfde soort verzetbaarheid
--    die 0043 t/m 0046 voor `cycle_start_date` en de punten hebben dichtgezet.

-- ---------------------------------------------------------------------------
-- 3. De afvinkingen zelf
-- ---------------------------------------------------------------------------

create table if not exists public.day_checkins (
  id             uuid        primary key default gen_random_uuid(),
  weekly_goal_id uuid        not null references public.weekly_goals (id) on delete cascade,
  -- ⚠️ De datum in de tijdzone van de gebruiker, aangeleverd door de client.
  --    Welke dag het "daar" is, wordt uitsluitend in `shared/time` bepaald
  --    (correctheidsregel 7) — precies zoals bij `daily_moves.local_date`. Wat
  --    de server wél toetst is dat die datum binnen de cyclus van het weekdoel
  --    valt; zie `afvinking_binnen_de_cyclus()`.
  local_date     date        not null,
  created_at     timestamptz not null default now()
);

comment on table public.day_checkins is
  'Eén rij per dag waarop aan een ritme-weekdoel is gewerkt (QS8-253). '
  'Uitsluitend leesbaar en schrijfbaar voor de eigenaar van het doel — ook in '
  'een open groep (A41): een rooster met gaten is fijnmaziger tegenslag dan een '
  'gemiste week, en domeinregel 7 wordt daardoor strenger en niet losser.';

-- ⚠️ **De grendel.** Twee keer op dezelfde dag afvinken telt één keer, en dat is
--    een index en geen afspraak. Zonder deze index is elk dagdoel met één knop
--    op zeven te krijgen.
create unique index if not exists day_checkins_een_per_dag
  on public.day_checkins (weekly_goal_id, local_date);

-- Onwrikbare regel 11: een index op elke foreign key en op elke kolom waarop
-- gefilterd wordt. De unieke index hierboven dekt `weekly_goal_id` al als
-- voorloopkolom; deze dekt het opruimen per datum.
create index if not exists day_checkins_datum_idx
  on public.day_checkins (local_date);

-- ---------------------------------------------------------------------------
-- 4. De dagelijkse rem
-- ---------------------------------------------------------------------------

-- ⚠️ **Deze functie staat ná de tabel, en dat is geen smaak.** Een `language
--    sql`-body wordt bij `create` geparseerd en tegen het schema gelegd; stond
--    dit blok vóór sectie 3, dan valt de migratie om op `relation
--    "day_checkins" does not exist`. Bij `plpgsql` gebeurt dat niet — daar wordt
--    de body pas bij de eerste aanroep ontleed, en dat is precies waarom
--    `afvinking_binnen_de_cyclus()` hieronder wél op zijn oorspronkelijke plek
--    kon staan. De policies in sectie 6 roepen deze functie aan, dus verder naar
--    achteren kan hij niet.

/**
 * Hoeveel dagafvinkingen mag de ingelogde gebruiker nu nog maken?
 *
 * Zelfde vorm en zelfde reden als `weekdoelen_over()` uit 0091 en
 * `weekplanstappen_over()` uit 0138 — beveiligingsregel 5.
 *
 * ⚠️ De unieke index in sectie 3 begrenst één weekdoel al tot zeven afvinkingen.
 *    Wat hij níét begrenst is het aantal wéékdoelen, en dus is dit geen dubbele
 *    beveiliging maar de enige die telt bij misbruik.
 *
 * ⚠️ Faalt dicht bij een lege `auth.uid()` — nul, en niet de hele limiet.
 */
create or replace function public.dagafvinkingen_over()
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
      500 - (
        select count(*)::integer
        from day_checkins d
        join weekly_goals w on w.id = d.weekly_goal_id
        join goals g on g.id = w.goal_id
        where g.owner_id = (select auth.uid())
          and d.created_at > now() - interval '1 day'
      )
    )
  end;
$$;

comment on function public.dagafvinkingen_over() is
  'Het resterende afvinkbudget van de ingelogde gebruiker over het laatste '
  'etmaal (beveiligingsregel 5, vorm uit 0091). Geeft zonder sessie nul terug.';

revoke all on function public.dagafvinkingen_over() from public, anon, authenticated;
grant execute on function public.dagafvinkingen_over() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Een afvinking valt binnen de week waar hij bij hoort
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Zonder deze toets is een ritme-doel met één verzoek te halen.** De datum
--    komt van de client — dat moet, want alleen `shared/time` weet welke dag het
--    is in de tijdzone van de gebruiker. Maar een client die zeven willekeurige
--    datums stuurt, zou daarmee elke week op plafond zetten.
--
-- ⚠️ **Dit is geen weekberekening en dat onderscheid is de reden dat het hier
--    mag staan.** Er wordt geen week afgeleid, geen week-startdag toegepast en
--    geen tijdzone gelezen: de vraag is of een datum in de zeven dagen ligt die
--    beginnen bij een datum die al in de rij staat. Datzelfde argument staat in
--    de kop van 0138 bij `min(cycle_start_date)`.
--
-- ⚠️ Een trigger en geen CHECK: een CHECK mag geen subquery doen, en de cyclus
--    staat in een andere tabel. Zelfde vorm als `pin_completion_cycle` (0006).

create or replace function public.afvinking_binnen_de_cyclus()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  start_datum date;
begin
  select w.cycle_start_date into start_datum
  from weekly_goals w
  where w.id = new.weekly_goal_id;

  if start_datum is null then
    raise exception 'Weekdoel % bestaat niet', new.weekly_goal_id;
  end if;

  if new.local_date < start_datum or new.local_date > start_datum + 6 then
    raise exception
      'Een afvinking van % valt buiten de week die op % begint',
      new.local_date, start_datum
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.afvinking_binnen_de_cyclus() is
  'Weigert een dagafvinking met een datum buiten de zeven dagen van het '
  'weekdoel. De datum komt van de client (correctheidsregel 7); dat hij in de '
  'juiste week valt, is niet aan de client.';

revoke all on function public.afvinking_binnen_de_cyclus()
  from public, anon, authenticated;

drop trigger if exists day_checkins_binnen_de_cyclus on public.day_checkins;
create trigger day_checkins_binnen_de_cyclus
  before insert on public.day_checkins
  for each row execute function public.afvinking_binnen_de_cyclus();

-- ---------------------------------------------------------------------------
-- 6. RLS — eigenaar-only, en geen tak voor de groep
-- ---------------------------------------------------------------------------

alter table public.day_checkins enable row level security;

drop policy if exists day_checkins_select on public.day_checkins;
create policy day_checkins_select on public.day_checkins
  for select to authenticated
  using (
    exists (
      select 1
      from public.weekly_goals w
      join public.goals g on g.id = w.goal_id
      where w.id = day_checkins.weekly_goal_id and g.owner_id = (select auth.uid())
    )
  );

drop policy if exists day_checkins_insert on public.day_checkins;
create policy day_checkins_insert on public.day_checkins
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.weekly_goals w
      join public.goals g on g.id = w.goal_id
      where w.id = day_checkins.weekly_goal_id and g.owner_id = (select auth.uid())
    )
    and public.dagafvinkingen_over() > 0
  );

-- ⚠️ Wél verwijderen, níét wijzigen. Een afvinking heeft geen veld dat je kunt
--    bijstellen: hij bestaat of hij bestaat niet. Een UPDATE-policy zou de
--    mogelijkheid openen om `local_date` te verzetten, en dat is de backdating
--    die `afvinking_binnen_de_cyclus()` net dichtzet.
drop policy if exists day_checkins_delete on public.day_checkins;
create policy day_checkins_delete on public.day_checkins
  for delete to authenticated
  using (
    exists (
      select 1
      from public.weekly_goals w
      join public.goals g on g.id = w.goal_id
      where w.id = day_checkins.weekly_goal_id and g.owner_id = (select auth.uid())
    )
  );

revoke all on public.day_checkins from anon;
revoke update on public.day_checkins from authenticated;
grant select, insert, delete on public.day_checkins to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Het bereikte niveau komt uit de dagen, niet uit het formulier
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de kern van de migratie.** Bij een gewoon weekdoel kiest de
--    gebruiker of hij zijn vloer of zijn plafond haalde, en de buddy beoordeelt
--    dat. Bij een ritme-weekdoel staat het antwoord al in de database: hij heeft
--    vier van de vijf dagen afgevinkt. Het formulier laten kiezen zou betekenen
--    dat je met één dag een plafond kunt claimen.
--
-- ⚠️ **Overschrijven en niet weigeren**, precies zoals `pin_completion_cycle`:
--    de client heeft hier niets te kiezen, en een foutmelding zou suggereren dat
--    er iets te kiezen viel. De enige uitzondering is onder de vloer — dan is er
--    geen week om in te dienen, en dat hóórt een weigering te zijn.
--
-- ⚠️ **Domeinregel 3 blijft onaangeroerd.** De dagen bepalen het níveau; een
--    buddy bepaalt of het waar is. `completions_mark_pending` uit 0023 doet nog
--    steeds zijn werk en er is geen route naar `approved` bijgekomen.

create or replace function public.niveau_uit_dagen()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  w        weekly_goals%rowtype;
  gehaald  integer;
  ondergrens integer;
begin
  select * into w from weekly_goals where id = new.weekly_goal_id;

  if w.id is null then
    raise exception 'Weekdoel % bestaat niet', new.weekly_goal_id;
  end if;

  -- Een gewoon weekdoel: niets aan de hand, de gebruiker kiest zelf.
  if w.ceiling_days is null then
    return new;
  end if;

  select count(*)::integer into gehaald
  from day_checkins d
  where d.weekly_goal_id = new.weekly_goal_id;

  -- ⚠️ Zonder vloer is het plafond de ondergrens. Dat is geen strengheid maar
  --    wat "geen vloer" betekent: er is één niveau, en dat haal je of niet.
  ondergrens := coalesce(w.floor_days, w.ceiling_days);

  if gehaald < ondergrens then
    raise exception
      'Deze week staat op % van de % dagen en haalt de vloer niet',
      gehaald, ondergrens
      using errcode = 'check_violation';
  end if;

  new.achieved_level := case when gehaald >= w.ceiling_days then 'ceiling' else 'floor' end;

  return new;
end;
$$;

comment on function public.niveau_uit_dagen() is
  'Bij een ritme-weekdoel (ceiling_days gevuld) komt achieved_level uit het '
  'aantal afgevinkte dagen en niet uit het formulier — anders is een plafond '
  'met één dag te claimen. Onder de vloer wordt geweigerd: dan is er geen week '
  'om in te dienen. Bij een gewoon weekdoel doet deze functie niets.';

revoke all on function public.niveau_uit_dagen() from public, anon, authenticated;

drop trigger if exists completions_niveau_uit_dagen on public.completions;
create trigger completions_niveau_uit_dagen
  before insert on public.completions
  for each row execute function public.niveau_uit_dagen();

commit;
