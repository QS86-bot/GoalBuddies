-- 0304_xp_is_een_aparte_teller_die_alleen_optelt_en_niemand_anders_leest.sql
-- — `xp_grootboek`: XP als aparte, append-only teller naast de punten, alleen
-- leesbaar voor de eigenaar, met toekenning in dezelfde transactie als de
-- handeling die hem oplevert en een eenmalige terugwerkende boeking (QS8-734).
--
-- ROLLBACK-PAD (in deze volgorde, in één transactie en met ON_ERROR_STOP):
--   drop trigger if exists xp_na_badge   on public.badges;
--   drop trigger if exists xp_na_weekpunten on public.points_ledger;
--   drop function if exists public.xp_na_badge();
--   drop function if exists public.xp_na_weekpunten();
--   drop function if exists public.mijn_xp();
--   drop function if exists public.xp_niveau(integer);
--   drop function if exists public.xp_drempels();
--   drop function if exists public.xp_bedrag_badge(text);
--   drop table if exists public.xp_grootboek;
--
-- ⚠️ **De tabel weggooien wist verdiende XP, en dat is hier een besluit en geen
--    migratiestap.** Zolang er alleen terugwerkende rijen staan is alles
--    herbouwbaar: draai deze migratie opnieuw en `points_ledger` en `badges`
--    leveren dezelfde rijen. Staan er rijen die ná de uitrol verdiend zijn, dan
--    is een `pg_dump` van `xp_grootboek` de enige manier terug (grens 2 van de
--    beslisbevoegdheid). De migratie zelf doet geen `drop`, `delete` of
--    `truncate` op bestaande data: ze voegt alleen toe.
--
-- ⚠️ **Wacht op Quintens "backup gedaan"** (docs/PROMPT-SESSIE.md §12d): de
--    migratie bevat `grant`, `revoke`, `policy` én een terugwerkende boeking op
--    gevulde tabellen, en wordt dus niet door een bouwsessie op productie gezet.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-722 en QS8-734, besluit van Quinten van 19-11-2026: XP is een **aparte
-- teller naast je punten**, die alleen optelt en alleen voor de eigenaar leesbaar
-- is. Niet een hernoeming van je punten: die kunnen dalen, en een dalend niveau
-- is bewijs van een gemiste week (domeinregel 7 en 10). Uitgeschreven in
-- `docs/decisions/2026-11-19-de-nieuwe-huisstijl-vervangt-a55-en-rustig-gereedschap.md`
-- en `docs/decisions/2026-11-19-xp-is-een-eigen-grootboek-met-een-trigger-als-haak.md`.
--
-- Bedragen (besluit, bijstelbaar na gebruik, en dit bestand is de enige bron):
--   weekdoel op plafond 20, op vloer 10, gemist 0, adempauze 0 (nooit een rij);
--   badge naar zeldzaamheid: first_goal, first_milestone, first_review gewoon
--   = 10, streak_4 ongewoon = 25, streak_12 zeldzaam = 50 (tot 200 legendarisch).
-- Niveaus: tien, genummerd, drempels in totaal-XP 20, 50, 100, 180, 300, 480,
--   750, 1150, 1700, 2500. Onder 20 XP is het niveau 0.
--
-- ---------------------------------------------------------------------------
-- Keuzes van de bouwsessie (geen besluit van Quinten nodig)
-- ---------------------------------------------------------------------------
--
-- 1. **De haak is een trigger op de bron van de punten, niet een tweede
--    schrijfpad.** `points_ledger` is waar een goedgekeurde week, via elk pad
--    (goedkeuring, vastgelopen-termijn, zonder beoordelaar), zijn punten boekt;
--    een AFTER INSERT-trigger op precies die twee redenen draait dus in dezelfde
--    transactie en over dezelfde rij als de punten, en het puntenmodel zelf
--    (0266/0267) blijft onaangeraakt. Idem voor `badges`: `verdien_badges()` en
--    elke andere schrijver komen langs dezelfde trigger. Een vergeten aanroep is
--    zo niet mogelijk; dat is dezelfde vangrail als bij `verdien_badges()`.
-- 2. **Een week levert hoogstens 20 XP op, en een badge één keer.** Een week kan
--    twee goedkeuringsrondes hebben (0266) en zowel een vloer- als een
--    plafondrij dragen. Vloer en daarna plafond: de vloerrij blijft (10) en het
--    plafond vult aan tot 20 (een tweede rij van 10). Plafond en daarna vloer:
--    niets erbij. Nooit een negatieve of corrigerende rij.
--    ⚠️ **Aanname:** een goedkeuring die binnen het kwartier wordt ingetrokken
--    (`intrekvenster_minuten()`) en daarna niet opnieuw wordt goedgekeurd, laat
--    de XP staan, want XP daalt nooit. Klein bedrag, klein venster; de
--    terugwerkende boeking (punt 4) telt zo'n week wél niet.
-- 3. **Het niveau is een afleiding, nooit een kolom.** `xp_niveau(totaal)` en
--    `mijn_xp()` zijn de enige bron van de drempels; de app kent geen constante.
-- 4. **De terugwerkende boeking telt een week alleen als hij nu nog staat.**
--    Een week waarvan de goedkeuring is ingetrokken en nooit opnieuw is
--    goedgekeurd (evenveel intrekkingen als goedkeuringsrijen in `points_ledger`)
--    is niet verdiend; geteld in rijen en niet in punten, want een week mag 0
--    punten waard zijn en telt dan toch. Heeft
--    een week zowel een plafond- als een vloerrij, dan telt het plafond. Terwijl
--    de levende trigger de eerste boeking neemt (punt 2): bij een verschil is de
--    terugwerkende kant de rijkere, en dat is de kant die Quinten bedoelde met
--    "wat een gebruiker al heeft verdiend".
-- 5. **Geen ongepagineerde lijst en geen realtime.** De tabel komt niet in de
--    publicatie en krijgt geen `REPLICA IDENTITY FULL` (Supabase past RLS niet
--    toe op DELETE; `realtime_bewaking()` uit 0027 maakt dat toetsbaar). De app
--    leest een totaal via `mijn_xp()`, nooit een lijst.
--
-- ---------------------------------------------------------------------------
-- Wat hier met opzet níet staat
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Geen enkele groepstak, ook niet "alvast een beetje".** Domeinregel 7 en
--    10: XP is nooit zichtbaar voor een ander, ook niet in een open groep, en
--    nooit in een systeembericht of groepsoverzicht. Er is geen gedeeld totaal
--    (A42): wie het totaal deelt, deelt het missen via een omweg.
-- ⚠️ **Geen negatieve rij en geen rij voor een gemiste week of adempauze.** De
--    CHECK `bedrag > 0` is de grendel; "geen rij" is de uitvoering.
-- ⚠️ **Geen UPDATE en geen DELETE voor `authenticated` of `service_role`**, in
--    grants én in policies. De rij gaat alleen weg via `on delete cascade` bij
--    accountverwijdering.
-- ⚠️ **Geen INSERT voor `authenticated` of `service_role` op deze tabel.** De
--    trigger-functies zijn `security definer` en de enige schrijvers; een client
--    die zijn eigen XP kan schrijven heeft geen teller maar een tekstveld.
--    ⚠️ **Maar `service_role` mag wél in `points_ledger` en `badges` schrijven**
--    (zoals vandaag), en de triggers zetten dat om in XP. Die sleutel kan dus
--    wel XP laten ontstaan, via de bron. Wie hem heeft kan alles al; er is hier
--    geen grendel die dat tegenhoudt en er wordt er geen beweerd.

-- ---------------------------------------------------------------------------
-- 1. De bedragen en de drempels: één bron
-- ---------------------------------------------------------------------------

-- ⚠️ `xp_bedrag_badge` kent elke badge uit `badges_bekend` (0113) en geeft NULL
--    voor een onbekende. Een nieuwe badge zonder bedrag is een vergeten
--    beslissing; `tests/rls/xp.test.ts` legt de twee lijsten naast elkaar.
create or replace function public.xp_bedrag_badge(p_badge text)
  returns integer
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select case p_badge
    when 'first_goal'      then 10   -- gewoon
    when 'first_milestone' then 10   -- gewoon
    when 'first_review'    then 10   -- gewoon
    when 'streak_4'        then 25   -- ongewoon
    when 'streak_12'       then 50   -- zeldzaam
  end;
$$;

-- De drempels van niveau 1 tot en met 10, in totaal-XP. De enige plek.
create or replace function public.xp_drempels()
  returns integer[]
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select array[20, 50, 100, 180, 300, 480, 750, 1150, 1700, 2500];
$$;

-- Het niveau bij een totaal: het aantal drempels dat gehaald is. 0 onder de
-- eerste drempel, 10 vanaf de laatste. Een totaal onder nul bestaat niet (de
-- tabel kent geen negatief bedrag), maar de functie faalt er niet op.
create or replace function public.xp_niveau(p_totaal integer)
  returns integer
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select count(*)::integer
    from unnest(public.xp_drempels()) as d(drempel)
   where coalesce(p_totaal, 0) >= d.drempel;
$$;

-- ---------------------------------------------------------------------------
-- 2. De tabel
-- ---------------------------------------------------------------------------

create table if not exists public.xp_grootboek (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles (id) on delete cascade,
  bron          text        not null,
  -- ⚠️ Geen foreign key naar `weekly_goals`: een weekdoel mag verdwijnen
  --    (`verwijder_weekdoel`) en de verdiende XP blijft staan. Zelfde keuze als
  --    `points_ledger.ref_id`.
  weekdoel_id   uuid,
  badge         text,
  bedrag        integer     not null,
  verdiend_op   timestamptz not null default now(),
  terugwerkend  boolean     not null default false,

  constraint xp_grootboek_bron_bekend
    check (bron in ('weekdoel_plafond', 'weekdoel_vloer', 'badge')),

  -- ⚠️ Een rij draagt precies één sleutel en die hoort bij zijn bron. Zonder
  --    deze CHECK kan een badgerij ook een weekdoel dragen, en dan is de unieke
  --    sleutel hieronder geen sleutel maar een suggestie.
  constraint xp_grootboek_sleutel_hoort_bij_bron
    check (
      (bron = 'badge' and badge is not null and weekdoel_id is null)
      or (bron <> 'badge' and weekdoel_id is not null and badge is null)
    ),

  -- ⚠️ **De grendel tegen dalen.** Strikt groter dan nul: een gemiste week of
  --    een adempauze boekt géén rij, en een negatieve rij bestaat niet.
  constraint xp_grootboek_bedrag_telt_alleen_op
    check (bedrag > 0 and bedrag <= 200)
);

comment on table public.xp_grootboek is
  'XP: een aparte teller naast points_ledger. Alleen leesbaar voor de eigenaar, '
  'append-only en nooit negatief: een dalend niveau is bewijs van een gemiste '
  'week (domeinregel 7 en 10). Het totaal is een som; het niveau een afleiding '
  '(xp_niveau). QS8-734.';

-- Dezelfde week of badge geeft nooit twee keer XP (onwrikbare regel 9 in de
-- geest). Beide beginnen met `user_id` en dekken dus ook de foreign key.
create unique index if not exists xp_grootboek_weekdoel_uniek_idx
  on public.xp_grootboek (user_id, weekdoel_id, bron)
  where weekdoel_id is not null;

create unique index if not exists xp_grootboek_badge_uniek_idx
  on public.xp_grootboek (user_id, badge)
  where badge is not null;

-- ⚠️ Een gewone index naast de twee partiële: de som in `mijn_xp()` leest alle
--    rijen van één gebruiker, en een partiële index dekt de foreign key niet
--    voor een controle die op een gewone index zoekt (onwrikbare regel 11).
create index if not exists xp_grootboek_user_idx
  on public.xp_grootboek (user_id);

alter table public.xp_grootboek enable row level security;

-- ⚠️ **Alleen jijzelf, zonder uitzondering.** Geen groepstak.
drop policy if exists xp_grootboek_select on public.xp_grootboek;
create policy xp_grootboek_select on public.xp_grootboek
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ⚠️ Expliciet dicht en niet afwezig (onwrikbare regel 1): een ontbrekende
--    policy is geen dichte deur maar een ongestelde vraag. De grants hieronder
--    geven `authenticated` bovendien geen enkel schrijfrecht, dus dit is de
--    tweede grendel naast de eerste.
drop policy if exists xp_grootboek_insert on public.xp_grootboek;
create policy xp_grootboek_insert on public.xp_grootboek
  for insert to authenticated
  with check (false);

drop policy if exists xp_grootboek_update on public.xp_grootboek;
create policy xp_grootboek_update on public.xp_grootboek
  for update to authenticated
  using (false) with check (false);

drop policy if exists xp_grootboek_delete on public.xp_grootboek;
create policy xp_grootboek_delete on public.xp_grootboek
  for delete to authenticated
  using (false);

-- ⚠️ **`from public, anon, authenticated` en niet `from public, anon`.** Zie
--    docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md.
revoke all on table public.xp_grootboek from public, anon, authenticated;
grant select on table public.xp_grootboek to authenticated;
-- ⚠️ `service_role` houdt zijn leesrecht en verliest alles wat schrijft: geen
--    insert, geen update, geen delete. De schrijvers zijn de definer-functies
--    hieronder (eigenaar van de tabel), zodat ook de sleutel van een server-job
--    niets rechtstreeks kan toevoegen. TRUNCATE en TRIGGER laten we staan: `ddl_rechten_van_
--    service_role()` (policies.test.ts) eist ze op elke tabel, voor onderhoud,
--    en dat geldt voor `badges` en `points_ledger` net zo.
revoke insert, update, delete on table public.xp_grootboek from service_role;

-- ---------------------------------------------------------------------------
-- 3. De toekenning: een trigger op de bron van de punten
-- ---------------------------------------------------------------------------

-- ⚠️ `security definer` met een vaste `search_path`, want `authenticated` heeft
--    geen insert op de tabel. Geen eigen autorisatiepoort: de trigger draait
--    over een rij die al door een policy en een definer-functie heen is
--    gekomen. De rij die hij schrijft hoort bij `new.user_id`, nooit bij
--    `auth.uid()`.
create or replace function public.xp_na_weekpunten() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_bron     text;
  v_bedrag   integer;
  v_bestaand integer;
begin
  -- ⚠️ Alleen de twee redenen die een gehaalde week betekenen, met een
  --    verwijzing naar het weekdoel. `cycle_missed` (−1), `correction`,
  --    `review_given` en `milestone_done` geven nooit XP: een gemiste week en
  --    een adempauze boeken geen rij.
  if new.ref_type is distinct from 'weekly_goal' or new.ref_id is null then
    return new;
  end if;

  -- ⚠️ Een week levert hoogstens 20 XP op, in welke volgorde en na hoeveel
  --    rondes ook (zie punt 2 in de kop): een plafond vult aan tot 20 wat een
  --    eerdere vloer al gaf, een vloer geeft niets als er al XP voor die week
  --    staat. Altijd een positief bedrag of geen rij, nooit een correctie.
  -- ⚠️ Eén week tegelijk: de som hieronder en de insert erna moeten één
  --    onverdeelde stap zijn, anders zien een vloer- en een plafondrij van twee
  --    gelijktijdige transacties elkaar niet en geeft één week 30 (de unieke
  --    sleutel loopt per bron en vangt dat niet). Vandaag bepaalt de goedkeuring
  --    zijn `ronde` zo dat zulke rijen elkaar uitsluiten, maar dat is een
  --    eigenschap van dat pad en niet van deze trigger.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || new.ref_id::text, 0));

  select coalesce(sum(x.bedrag), 0) into v_bestaand
    from public.xp_grootboek x
   where x.user_id = new.user_id and x.weekdoel_id = new.ref_id;

  if new.reason = 'completion_approved_ceiling' then
    v_bron := 'weekdoel_plafond';
    v_bedrag := 20 - v_bestaand;
  elsif new.reason = 'completion_approved_floor' then
    v_bron := 'weekdoel_vloer';
    v_bedrag := case when v_bestaand = 0 then 10 else 0 end;
  else
    return new;
  end if;

  if v_bedrag <= 0 then
    return new;
  end if;

  insert into public.xp_grootboek (user_id, bron, weekdoel_id, bedrag, verdiend_op)
  values (new.user_id, v_bron, new.ref_id, v_bedrag, new.created_at)
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.xp_na_badge() returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_bedrag integer := public.xp_bedrag_badge(new.badge);
begin
  -- ⚠️ Geen `raise`: deze trigger draait in de transactie van de badge (en van
  --    de goedkeuring die erachter hangt), en een fout hier zou die terugdraaien.
  --    Een badge zonder bedrag geeft dus geen rij; `tests/rls/xp.test.ts` legt
  --    `badges_bekend` naast `xp_bedrag_badge()` zodat dat rood wordt in de suite.
  if v_bedrag is null then
    return new;
  end if;

  insert into public.xp_grootboek (user_id, bron, badge, bedrag, verdiend_op)
  values (new.user_id, 'badge', new.badge, v_bedrag, new.earned_at)
  on conflict do nothing;

  return new;
end;
$$;

-- ⚠️ Een trigger-functie heeft geen enkele reden om door een client
--    aanroepbaar te zijn.
revoke all on function public.xp_na_weekpunten() from public, anon, authenticated;
revoke all on function public.xp_na_badge() from public, anon, authenticated;
revoke all on function public.xp_bedrag_badge(text) from public, anon, authenticated;
revoke all on function public.xp_drempels() from public, anon, authenticated;
revoke all on function public.xp_niveau(integer) from public, anon, authenticated;

drop trigger if exists xp_na_weekpunten on public.points_ledger;
create trigger xp_na_weekpunten
  after insert on public.points_ledger
  for each row execute function public.xp_na_weekpunten();

drop trigger if exists xp_na_badge on public.badges;
create trigger xp_na_badge
  after insert on public.badges
  for each row execute function public.xp_na_badge();

-- ---------------------------------------------------------------------------
-- 4. De enige leesroute naar een totaal en een niveau
-- ---------------------------------------------------------------------------

-- ⚠️ **Eigen totaal, geen parameter.** Er is geen `p_user_id` om te misbruiken:
--    de functie leest `auth.uid()` en niets anders, dus er bestaat geen manier
--    om andermans XP te vragen. Geeft altijd één rij (nul XP is niveau 0), ook
--    zonder rijen. `security invoker`: de policy blijft de poort.
create or replace function public.mijn_xp()
  returns table (
    totaal           integer,
    niveau           integer,
    drempel_huidig   integer,
    drempel_volgende integer
  )
  language sql
  stable
  security invoker
  set search_path = public, pg_temp
as $$
  with som as (
    select coalesce(sum(x.bedrag), 0)::integer as totaal
      from public.xp_grootboek x
     where x.user_id = (select auth.uid())
  )
  select s.totaal,
         public.xp_niveau(s.totaal),
         case when public.xp_niveau(s.totaal) = 0 then 0
              else (public.xp_drempels())[public.xp_niveau(s.totaal)] end,
         (public.xp_drempels())[public.xp_niveau(s.totaal) + 1]
    from som s;
$$;

revoke all on function public.mijn_xp() from public, anon, authenticated;
grant execute on function public.mijn_xp() to authenticated;
-- ⚠️ `mijn_xp()` leest via `security invoker`, dus `xp_niveau()` en
--    `xp_drempels()` moeten voor de aanroeper uitvoerbaar zijn. Ze lekken niets
--    (pure functies over een getal), maar de recht-zonder-grant-regel (0115)
--    wil dat dat gezegd wordt.
grant execute on function public.xp_niveau(integer) to authenticated;
grant execute on function public.xp_drempels() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Terugwerkend: wat al verdiend is, krijgt eenmalig XP
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Alleen toevoegen, en idempotent door de unieke sleutels.** Een tweede run
--    (of `idempotent:controle`, direct na de eerste) vindt elke sleutel al
--    bezet en voegt niets toe. Geen `drop`, `delete` of `truncate`.
--
-- Weken: per weekdoel één rij, plafond wint van vloer, alleen als de week nu nog
-- staat (meer goedkeuringsrijen dan intrekkingen, zie punt 4 in de kop). `verdiend_op`
-- is het moment van de eerste boeking.
insert into public.xp_grootboek (user_id, bron, weekdoel_id, bedrag, verdiend_op, terugwerkend)
select w.user_id,
       case when w.heeft_plafond then 'weekdoel_plafond' else 'weekdoel_vloer' end,
       w.ref_id,
       (case when w.heeft_plafond then 20 else 10 end) - w.al_geboekt,
       w.eerste,
       true
  from (
    select p.user_id,
           p.ref_id,
           bool_or(p.reason = 'completion_approved_ceiling') as heeft_plafond,
           min(p.created_at) filter (
             where p.reason in ('completion_approved_ceiling', 'completion_approved_floor')
           ) as eerste,
           count(*) filter (where p.reason <> 'correction') as goedkeuringen,
           count(*) filter (where p.reason = 'correction') as intrekkingen,
           coalesce((select sum(x.bedrag) from public.xp_grootboek x
                      where x.user_id = p.user_id and x.weekdoel_id = p.ref_id), 0) as al_geboekt
      from public.points_ledger p
     where p.ref_type = 'weekly_goal'
       and p.ref_id is not null
       and p.reason in ('completion_approved_ceiling', 'completion_approved_floor', 'correction')
     group by p.user_id, p.ref_id
  ) w
 where w.goedkeuringen > w.intrekkingen
   and w.eerste is not null
   and (case when w.heeft_plafond then 20 else 10 end) - w.al_geboekt > 0
on conflict do nothing;

-- Badges: elke verdiende badge, tegen het bedrag uit `xp_bedrag_badge()`.
insert into public.xp_grootboek (user_id, bron, badge, bedrag, verdiend_op, terugwerkend)
select b.user_id, 'badge', b.badge, public.xp_bedrag_badge(b.badge), b.earned_at, true
  from public.badges b
 where public.xp_bedrag_badge(b.badge) is not null
on conflict do nothing;
