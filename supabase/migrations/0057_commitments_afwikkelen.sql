-- 0057_commitments_afwikkelen.sql — QS8-83 en QS8-84 (EPIC 9)
--
-- ROLLBACK-PAD:
--   drop trigger if exists commitments_audit on public.commitments;
--   drop function if exists noteer_commitment();
--   drop function if exists rond_doel_af(uuid);
--   drop function if exists wikkel_commitments_af(uuid);
--   drop function if exists maak_straffen_verschuldigd(uuid, date);
--   drop policy if exists commitments_update on public.commitments;
--   create policy commitments_update on public.commitments for update to authenticated
--     using (exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
--            and status = 'set');
--   revoke update on public.commitments from authenticated;
--   grant update on public.commitments to authenticated;
--   -- en de vorige meld_commitment() terugzetten uit 0025/0028.
--
-- ---------------------------------------------------------------------------
-- Wat hier gebeurt, en waarom het bij elkaar hoort
-- ---------------------------------------------------------------------------
--
-- EPIC 9 vraagt twee dingen: een beloning die vrijkomt als je je doel op tijd
-- haalt (QS8-83), en een straf die verschuldigd wordt als je je streefdatum mist
-- (QS8-84). De bérichten daarvoor bestonden al sinds 0025: `meld_commitment()`
-- plaatst `commitment_unlocked` in elke gekoppelde groep en `commitment_due`
-- alleen in de begunstigde groep, en `commitments_select` geeft die groep pas
-- leesrecht vanaf `unlocked`/`due`/`resolved`.
--
-- Wat ontbrak was álles wat de status verzet. Niets in de codebase zette ooit
-- een commitment op `unlocked` of `due`, dus die trigger heeft nog nooit gedraaid.
--
-- ⚠️ **En er ontbrak meer dan dat.** Bij het uitzoeken bleken twee dingen die
--    QS8-85 al opgeleverd leek te hebben, in de praktijk niet te werken. Allebei
--    tegen de echte database aangetoond, in een teruggedraaide transactie:
--
--    1. **`trekIn()` kon nooit gewerkt hebben.** `commitments_update` had wel een
--       `using` maar geen `with check`. Postgres gebruikt de `using` dan óók als
--       controle op de nieuwe rij, dus `status = 'set'` gold voor de uitkomst —
--       en `status = 'cancelled'` schrijven gaf `42501`. 0006 wilde voorkomen dat
--       de client zelf een status kiest, en nam de enige overgang mee die de
--       client juist wél moet kunnen maken.
--
--    2. **`commitment_events` weigerde elke insert.** RLS staat aan, er is alleen
--       een SELECT-policy, en `logCommitmentEvent()` slikt de fout via
--       `reportError`. Vandaar dat die tabel nul rijen heeft. QS8-84
--       acceptatiecriterium 7 vraagt een volledig auditspoor; dat was niet te
--       bouwen zonder dit eerst recht te zetten.
--
--    Ze staan in deze migratie en niet in een eigen issue omdat EPIC 9 er
--    precies bovenop bouwt: zonder 1 kun je een commitment niet intrekken vóór
--    het afgaat, en zonder 2 is er geen auditspoor om in te schrijven.
--
-- ⚠️ **Het auditspoor gaat weg bij de client.** Tot nu toe schreef `api.ts` zelf
--    zijn `confirmed`- en `cancelled`-regels. Dat is de verkeerde kant op: een
--    client die zijn eigen audittrail bijhoudt, kan hem ook overslaan, en
--    `actor_id` werd niet meegestuurd — dus elke clientregel zag eruit als een
--    systeemregel (`actor_id IS NULL`, zie 001-datamodel §2.7). Vanaf nu schrijft
--    een trigger de regels, met `auth.uid()` als actor. Daarmee is het auditspoor
--    een schema-eigenschap zoals `confirmed_at NOT NULL` dat al was: niet over te
--    slaan en niet te vervalsen. `commitment_events` houdt dus bewust géén
--    INSERT-policy — weigeren is hier het juiste antwoord (regel 1: een
--    append-only audittabel die de client niet mag schrijven).
--
-- ⚠️ **Twee klokken, allebei in het voordeel van de gebruiker, en dat is met
--    opzet asymmetrisch.**
--
--    De straf loopt via de rollover. Die kent `profiles.tz` en rekent de lokale
--    datum van de eigenaar uit met `shared/time` (correctheidsregel 7), dus
--    `maak_straffen_verschuldigd()` krijgt die datum aangereikt en vergelijkt
--    exact: verstreken is `streefdatum < de eigen datum van vandaag`.
--
--    De beloning loopt via `rond_doel_af()`, een RPC die de client aanroept. Daar
--    is geen betrouwbare tijdzone: de server staat op UTC en wat de client over
--    zijn zone zegt, mag hier niet meetellen — dat zou een gebruiker zelf laten
--    bepalen of hij op tijd was. Vandaar één dag speling (`target_date + 1`):
--    tussen UTC-12 en UTC+14 loopt een lokale datum hooguit een dag uit de pas
--    met UTC, dus niemand die in zijn eigen tijdzone op tijd was, wordt zijn
--    beloning geweigerd. De fout valt zo altijd de goede kant op — een beloning
--    is iets dat je jezelf hebt beloofd, en te streng zijn kost meer dan te mild.
--
-- ⚠️ **Een straf op een afgerond doel wordt `cancelled` en niet `resolved`.**
--    Dat is een domeinregel 7-keuze en geen smaak: `commitments_select` geeft de
--    begunstigde groep leesrecht vanaf `unlocked`, `due` én `resolved`. Zou een
--    straf die nooit is afgegaan op `resolved` komen, dan leest die groep alsnog
--    wat jij jezelf had opgelegd — terwijl er niets gebeurd is. `cancelled` staat
--    niet in die lijst en blijft dus van jou alleen. `resolved` is gereserveerd
--    voor een straf die verschúldigd was en daarna afgehandeld is; die heeft de
--    groep sowieso al gezien.
--
-- ⚠️ **Archiveren redt je niet.** `maak_straffen_verschuldigd()` slaat alleen
--    `completed` over. Een gearchiveerd doel houdt zijn straf, want archiveren is
--    omkeerbaar (`zet_doelstatus`) en zou anders precies de ontsnapping zijn die
--    A35, A39 en A40 samen vier migraties hebben gekost: de regel stond in de
--    issue en nergens in de database.

begin;

-- ---------------------------------------------------------------------------
-- 1. Intrekken weer mogelijk maken — met een expliciete `with check`
-- ---------------------------------------------------------------------------
--
-- ⚠️ De policy bepaalt wélke waarde, de kolomgrant bepaalt wélke kolom. Dat is
--    twee sloten voor twee verschillende vragen, en ze zijn allebei nodig: RLS
--    kan geen kolommen beperken (de vaste les van dit project — 0006, 0010, 0019,
--    0023, 0029, 0043), en een kolomgrant kan geen waarde beperken. Zonder de
--    grant kon de eigenaar `type` van `penalty` naar `reward` schrijven of
--    `confirmed_at` verzetten, en dan is de bevestiging uit domeinregel 5 een
--    veld dat je zelf naar achteren kunt schuiven.

drop policy if exists commitments_update on public.commitments;

create policy commitments_update on public.commitments
  for update to authenticated
  using (
    status = 'set'
    and exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
  )
  with check (
    status in ('set', 'cancelled')
    and exists (select 1 from goals g where g.id = goal_id and g.owner_id = auth.uid())
  );

revoke update on public.commitments from authenticated, anon;
grant update (body, image_url, status) on public.commitments to authenticated;

comment on policy commitments_update on public.commitments is
  'Eigenaar mag tekst bijwerken en intrekken zolang de status `set` is. De '
  '`with check` staat er expliciet: zonder die regel gebruikt Postgres de '
  '`using` ook als controle op de nieuwe rij, en dan is intrekken onmogelijk.';

-- ---------------------------------------------------------------------------
-- 2. Het auditspoor, geschreven door de database zelf
-- ---------------------------------------------------------------------------
--
-- QS8-84 acceptatiecriterium 7: instelling, bevestiging, trigger en bericht
-- moeten alle vier in `commitment_events` staan. Drie ervan komen hiervandaan;
-- `posted` komt uit `meld_commitment()`, want alleen die functie weet of het
-- bericht er écht gekomen is.
--
-- ⚠️ `actor_id` is `auth.uid()`, en dat is `NULL` zodra de rollover of een
--    andere server-taak de rij verzet. Dat is precies de betekenis die
--    001-datamodel §2.7 eraan geeft: NULL = systeem. Het verschil tussen "ik heb
--    mijn straf ingetrokken" en "het systeem heeft hem laten vervallen" is
--    daarmee af te lezen zonder dat iemand het hoeft mee te sturen.
--
-- ⚠️ De payload draagt óók de doelstatus. Zonder dat veld is een `cancelled`-regel
--    niet uit elkaar te houden: introk je hem zelf, of verviel hij omdat het doel
--    werd afgerond? Met `doelstatus` vertelt de regel zichzelf, en dat is beter
--    dan een reden die de aanroeper moet meesturen en dus kan vergeten.

create or replace function public.noteer_commitment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_soort      text;
  v_doelstatus text;
begin
  if tg_op = 'INSERT' then
    v_soort := 'confirmed';
  elsif old.status is distinct from new.status then
    v_soort := case new.status
                 when 'cancelled' then 'cancelled'
                 when 'resolved'  then 'resolved'
                 else 'triggered'          -- unlocked en due
               end;
  else
    -- Alleen de tekst veranderd.
    v_soort := 'edited';
  end if;

  select g.status into v_doelstatus from goals g where g.id = new.goal_id;

  insert into commitment_events (commitment_id, actor_id, event_type, payload)
  values (
    new.id,
    auth.uid(),
    v_soort,
    jsonb_build_object(
      'type',       new.type,
      'van',        case when tg_op = 'INSERT' then null else old.status end,
      'naar',       new.status,
      'doelstatus', v_doelstatus
    )
  );

  return new;
end;
$$;

-- ⚠️ Geen `exception when others` hier, en dat is het verschil met
--    `meld_commitment()`. Een systeembericht dat niet geplaatst wordt, is
--    vervelend; een consequentie die in werking treedt zónder spoor is precies
--    wat domeinregel 5 verbiedt. Faalt de audittrail, dan gaat de hele handeling
--    terug.
drop trigger if exists commitments_audit on public.commitments;
create trigger commitments_audit
  after insert or update on public.commitments
  for each row execute function public.noteer_commitment();

-- ⚠️ **Intrekken hoort in dezelfde migratie als het aanmaken.** Een triggerfunctie
--    staat anders gewoon in de API, aanroepbaar door `anon` én `authenticated`.
--    Dat is exact wat 0051 fout deed en 0052 moest repareren, en de test die dat
--    bewaakt (`triggerfuncties_in_de_api()`, in `tests/rls/risicoradar.test.ts`)
--    heeft deze migratie er dan ook op betrapt. Een nieuwe SECURITY
--    DEFINER-functie erft niets.
revoke all on function public.noteer_commitment() from public, anon, authenticated;

-- ⚠️ De naam bepaalt de volgorde. Postgres draait triggers op dezelfde
--    gebeurtenis alfabetisch, en `commitments_audit` gaat vóór
--    `commitments_systeembericht`. Daardoor staat `triggered` in de audittrail
--    altijd vóór de `posted` die erop volgt — precies de volgorde waarin het
--    gebeurd is.

-- ---------------------------------------------------------------------------
-- 3. `meld_commitment()` schrijft voortaan op dat hij geplaatst heeft
-- ---------------------------------------------------------------------------
--
-- Ongewijzigd ten opzichte van 0025/0028, op de twee `posted`-regels na. De
-- teksten blijven zoals ze waren: ze noemen de persoon en de gebeurtenis en
-- verder niets — geen titel, geen bedrag, geen niveau (beslisdocument 002 §3).

create or replace function public.meld_commitment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_owner_id uuid;
begin
  begin
    if old.status = new.status then return new; end if;

    select g.owner_id into v_owner_id from goals g where g.id = new.goal_id;
    if v_owner_id is null then return new; end if;

    if new.type = 'reward' and new.status = 'unlocked' then
      perform plaats_systeembericht_in_doelgroepen(
        new.goal_id,
        'commitment_unlocked',
        weergavenaam(v_owner_id) || ' heeft een beloning vrijgespeeld.'
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_unlocked', 'bereik', 'doelgroepen'));

    elsif new.type = 'penalty'
      and new.status = 'due'
      and new.beneficiary_group_id is not null
    then
      perform plaats_systeembericht(
        new.beneficiary_group_id,
        'commitment_due',
        'De inzet die ' || weergavenaam(v_owner_id)
          || ' zelf heeft ingesteld, is verschuldigd geworden.'
      );

      insert into commitment_events (commitment_id, actor_id, event_type, payload)
      values (new.id, null, 'posted',
              jsonb_build_object('event', 'commitment_due',
                                 'bereik', 'begunstigde_groep',
                                 'group_id', new.beneficiary_group_id));
    end if;
  exception
    when others then
      raise warning 'Systeembericht voor commitment % is niet geplaatst: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. De beloning vrijspelen — QS8-83
-- ---------------------------------------------------------------------------
--
-- ⚠️ Intern. Er is geen scherm dat dit los aanroept, en het mag er ook geen
--    zijn: wie zijn eigen beloning kan vrijspelen zonder zijn doel af te ronden,
--    heeft geen commitment device maar een knop.

create or replace function public.wikkel_commitments_af(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_doel      record;
  v_op_tijd   boolean;
  v_vrij      integer := 0;
  v_verlopen  integer := 0;
  v_vervallen integer := 0;
begin
  select g.id, g.target_date, g.status into v_doel from goals g where g.id = p_goal_id;
  if v_doel.id is null then
    return jsonb_build_object('vrijgespeeld', 0, 'verlopen', 0, 'vervallen', 0);
  end if;

  -- Zie de kop: één dag speling, omdat de server op UTC staat en de tijdzone van
  -- de client hier niet mee mag tellen.
  v_op_tijd := current_date <= v_doel.target_date + 1;

  -- De beloning. Alleen op tijd; te laat is geen beloning maar een troostprijs.
  if v_op_tijd then
    update commitments
       set status = 'unlocked'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_vrij = row_count;
  else
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_verlopen = row_count;
  end if;

  -- De straf vervalt: het doel is af, dus hij gaat nooit meer af. `cancelled` en
  -- niet `resolved` — zie de kop, de begunstigde groep mag dit nooit lezen.
  update commitments
     set status = 'cancelled'
   where goal_id = p_goal_id and type = 'penalty' and status = 'set';
  get diagnostics v_vervallen = row_count;

  return jsonb_build_object(
    'vrijgespeeld', v_vrij,
    'verlopen',     v_verlopen,
    'vervallen',    v_vervallen
  );
end;
$$;

revoke all on function public.wikkel_commitments_af(uuid) from public, anon, authenticated;
grant execute on function public.wikkel_commitments_af(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Een doel afronden — de gebeurtenis die QS8-83 nodig had
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit pad bestond niet.** `goals.status` kende `completed` sinds 0001,
--    `meld_doel_af()` stond klaar om er een systeembericht op te plaatsen, en
--    `zet_doelstatus()` kon alleen archiveren — sinds 0035 heeft `authenticated`
--    geen schrijfrecht meer op de kolom. Er was dus geen enkele manier waarop een
--    doel ooit `completed` werd, en daarmee geen moment waarop een beloning kón
--    vrijkomen. Zelfde patroon als QS8-112: op Done, maar niemand kon erbij.
--
-- ⚠️ **Waarom er geen open mijlpaal mag staan.** Afronden is de enige handeling
--    die je eigen straf laat vervallen (§4). Zou je dat mogen doen terwijl er nog
--    werk open staat, dan is elk commitment device te ontlopen met één druk op de
--    knop. Een mijlpaal laten vállen kan wel — `dropped` — maar dat is een
--    bewuste, aparte handeling die zichtbaar in de geschiedenis blijft staan
--    (domeinregel 6). De uitweg bestaat dus nog, maar hij is niet meer gratis en
--    niet meer onzichtbaar. Besluit van Quinten, 21-08-2026.

create or replace function public.rond_doel_af(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  g       goals%rowtype;
  v_open  integer;
  v_afloop jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select * into g from goals where id = p_goal_id;

  if g.id is null or g.owner_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if g.status = 'completed' then
    return jsonb_build_object('ok', false, 'reason', 'already_completed');
  end if;

  if g.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  select count(*) into v_open
    from milestones m
   where m.goal_id = p_goal_id and m.status = 'todo';

  if v_open > 0 then
    return jsonb_build_object('ok', false, 'reason', 'open_milestones', 'aantal', v_open);
  end if;

  -- ⚠️ Dit laat `meld_doel_af()` afgaan: "X heeft een doel afgerond", in elke
  --    gekoppelde groep. Positief signaal, dus domeinregel 7 is niet in het
  --    geding — maar het is onomkeerbaar, en het scherm zegt dat vooraf.
  update goals set status = 'completed' where id = p_goal_id;

  v_afloop := wikkel_commitments_af(p_goal_id);

  -- De Risico-radar hangt aan `goals.status`: een afgerond doel loopt geen
  -- risico meer. `herbereken_risico()` zet de rij zelf op `on_track` zodra de
  -- status niet `active` is (0051), dus hier alleen even aantikken.
  perform herbereken_risico(p_goal_id);

  return jsonb_build_object('ok', true, 'commitments', v_afloop);
end;
$$;

revoke all on function public.rond_doel_af(uuid) from public, anon;
grant execute on function public.rond_doel_af(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. De straf verschuldigd maken — QS8-84
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`p_vandaag` komt van buiten, en dat is correctheidsregel 7.** De aanroeper
--    is de rollover, en die rekent de lokale datum van deze eigenaar uit met
--    `shared/time` uit zijn `week_start_day` en `tz`. Hier wordt geen datum
--    afgeleid en geen tijdzone toegepast; er wordt alleen vergeleken. Zou deze
--    functie `current_date` gebruiken, dan gaat de straf voor een gebruiker in
--    Auckland een dag te vroeg af — en te vroeg is hier het enige dat echt niet
--    mag.
--
-- ⚠️ **Alleen `set`, en dus idempotent.** Twee keer draaien vindt de tweede keer
--    niets: een straf die al `due` is, staat niet meer in de selectie. Dat is
--    dezelfde eigenschap waar de rollover elders op leunt.
--
-- ⚠️ **Geen enkele gemiste week komt hier voor** (QS8-84, criterium 2). Er staat
--    bewust niets over `weekly_goals` in deze functie: de enige twee dingen
--    waar hij naar kijkt zijn de streefdatum en of het doel afgerond is.

create or replace function public.maak_straffen_verschuldigd(
  p_owner_id uuid,
  p_vandaag  date
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_aantal integer;
begin
  if p_owner_id is null or p_vandaag is null then
    return 0;
  end if;

  update commitments c
     set status = 'due'
    from goals g
   where g.id = c.goal_id
     and g.owner_id = p_owner_id
     and c.type = 'penalty'
     and c.status = 'set'
     and g.status <> 'completed'
     and g.target_date < p_vandaag;

  get diagnostics v_aantal = row_count;
  return v_aantal;
end;
$$;

revoke all on function public.maak_straffen_verschuldigd(uuid, date) from public, anon, authenticated;
grant execute on function public.maak_straffen_verschuldigd(uuid, date) to service_role;

commit;
