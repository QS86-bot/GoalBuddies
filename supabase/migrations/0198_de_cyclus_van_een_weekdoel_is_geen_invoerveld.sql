-- 0198_de_cyclus_van_een_weekdoel_is_geen_invoerveld.sql — een client kiest niet
-- langer op welke dag zijn week begint, en hoeveel goedkeuringen hij per dag
-- uitdeelt (QS8-354).
--
-- ROLLBACK-PAD:
--   drop trigger if exists weekdoel_cyclus on weekly_goals;
--   drop function if exists weekdoel_cyclus_klopt();
--   drop trigger if exists goedkeuringen_dagplafond on completion_approvals;
--   drop function if exists begrens_goedkeuringen();
--   drop function if exists goedkeuringen_plafond();
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 0195 (QS8-352) haalde `points_ceiling` en `points_floor` uit de INSERT-grant,
-- dus een client kan niet meer kiezen **wat** een week waard is. Hij kon nog wel
-- kiezen **hoeveel** weken er zijn.
--
-- 📏 Volledig nagespeeld met twee gewone accounts in één open groep, drie
--    verzoeken per week, tegen de lokale stack:
--
--      POST /weekly_goals {cycle_start_date: '2021-03-03'}  -> 201
--      POST /completions                                     -> 201
--      POST /completion_approvals (door de buddy)            -> 201
--
--    Drie keer herhaald op willekeurige woensdagen in 2021, terwijl Anna's
--    `week_start_day` 1 (maandag) is. Uitkomst:
--
--      points_ledger Anna : +6 over 3 boekingen
--      points_ledger Bram : +3 over 3 boekingen (review_given)
--      groep_klassement() : Anna 6 (positie 1), Bram 3 (positie 2)
--
--    Het klassement van A54 telt per ontwerp alleen op — dat is precies wat hem
--    verenigbaar maakt met domeinregel 7, en het is ook waarom dit niet te
--    corrigeren is zonder die belofte te breken.
--
-- 📏 Er stond geen enkele CHECK op `cycle_start_date` (nul rijen in
--    `pg_constraint`), en op `completion_approvals` stond geen dagteller — de
--    vijf triggers daar doen iets anders.
--
-- ---------------------------------------------------------------------------
-- Waarom de dag van de eigenaar, en niet "een geldige datum"
-- ---------------------------------------------------------------------------
--
-- Een cyclus begint op de week-startdag van de gebruiker; dat is domeinregel 1 en
-- de reden dat `profiles.week_start_day` bestaat. Een `cycle_start_date` die daar
-- niet op valt hoort bij geen enkele cyclus en kan dus ook niet het resultaat van
-- de app zijn.
--
-- ⚠️ **De vorm is overgenomen en niet bedacht:** `plan_adempauze()` toetst al
--    `extract(dow from p_starts_cycle)::smallint <> v_startdag` tegen
--    `profiles.week_start_day`. Correctheidsregel 7 gaat over rékenen aan weken;
--    dit is dezelfde vergelijking die daar al staat, niet een tweede berekening.
--
-- ---------------------------------------------------------------------------
-- Het venster, en waar de breedte vandaan komt
-- ---------------------------------------------------------------------------
--
-- Acceptatiecriterium 2 vraagt een breedte die uit de bestáánde features komt en
-- niet uit een rond getal.
--
-- ⚠️ **Eerst wat het venster níet doet, want daar liep de eerste versie van deze
--    migratie op vast.** Hij had `56 dagen terug`, met "acht cycli" eronder, en
--    hij was gemotiveerd alsof hij het volume begrensde. 📏 Nagerekend doet hij
--    dat niet, en geen enkele breedte doet dat:
--
--      * er staat geen unieke constraint op `(goal_id, cycle_start_date)` — 0083
--        zegt dat met zoveel woorden — dus dezelfde cyclus mag honderd keer;
--      * `completion_approved_ceiling` dedupliceert op de completion en niet op
--        de cyclus, dus honderd weken in één cyclus zijn honderd boekingen.
--
--    Met een venster van drie cycli haalt het scenario uit het issue dus
--    **exact hetzelfde aantal punten** als zonder venster. Wat het volume wél
--    begrenst is de dagteller: `weekdoelen_plafond()` = 200 (0192) aan de
--    schrijfkant, en de teller op `completion_approvals` hieronder aan de
--    goedkeurkant. Dát is criterium 3, en dat is de grendel die telt.
--
--    Dit venster is een **aannemelijkheidsgrens**: een weekdoel in 2021 op een
--    account van vorige week is geen legitiem gebruik, en het vervuilt
--    `points_ledger`, `groep_klassement()` en de Risico-radar met geschiedenis
--    die nooit geleefd is. Het is opgeschreven als wat het is, omdat een grendel
--    die zwaarder gemotiveerd wordt dan hij draagt de volgende lezer laat denken
--    dat het volume gedekt is.
--
-- 📏 Gemeten wat er client-zijdig een `cycle_start_date` kiest — dat zijn er
--    drie, en vooruit reiken ze één cyclus:
--
--      maakWeekdoel()                -> cyclus.startDate  (de lopende)
--      weekplanstap_naar_weekdoel()  -> de cyclus die de beller meegeeft
--      schuif_weekdoel_door()        -> weekly.ts:306 geeft cyclus.startDate mee;
--                                       de RPC zelf begrenst hem niet
--
--    De rollover schrijft geen weekdoelen — hij doet alleen `update` — en draait
--    als `service_role`, dus die valt hieronder sowieso buiten. Vooruit is
--    daarom **één cyclus**: de opvolger die `schuif_weekdoel_door()` neerlegt,
--    en de gebruiker wiens tijdzone de serverdatum een dag vooruit is.
--
-- ⚠️ **Achteruit is niet uit de schrijfkant af te leiden, en daarom wordt hij
--    overgenomen in plaats van bedacht.** De app schrijft alleen de lopende
--    cyclus; strikt genomen zou nul cycli terug de "gemeten" grens zijn. Maar dat
--    is geen aannemelijkheidsgrens meer, dat is een tweede rolgrens — en een
--    gebruiker die zijn week op de rollovergrens indient zou hem raken.
--
--    **De 52 hieronder is dus gekozen en niet afgeleid, en dat staat er met
--    zoveel woorden.** Er stond eerst dat hij overgenomen was van
--    `plan_adempauze()`, met de instructie de twee synchroon te houden. 📏 Dat
--    was verkeerd gelezen en de security-review van 08-09 heeft het gemeten:
--    `c_max_cycli = 52` begrenst daar de **lengte** van een adempauze
--    (`p_ends_cycle > p_starts_cycle + (c_max_cycli - 1) * 7`), niet hoe ver
--    terug hij mag liggen — `plan_adempauze()` met `p_starts_cycle` in 2020
--    geeft gewoon `{"ok": true}`, want `niet_vooraf` is er in QS8-227 bewust
--    uitgehaald.
--
--    Een koppeling die er niet is, is erger dan geen koppeling: wie over een half
--    jaar de adempauzelengte naar acht weken zet, versmalt dan het
--    geschiedenisvenster van weekdoelen mee zonder dat te bedoelen. Dus geen
--    gedeelde constante en geen instructie om ze gelijk te houden.
--
--    Wat er wél van de adempauze overblijft is een **precedent voor de schaal**:
--    een jaar is de orde van grootte die dit project al eerder als bovengrens op
--    een cyclusgebonden datum gekozen heeft. Dat is genoeg om 52 te verkiezen
--    boven 8 of boven 500, en het is te weinig om het een afleiding te noemen.
--
-- 📏 Wat dat weigert en toelaat, gemeten op 2026-09-08:
--
--      2021-03-03 (het geval uit de meting hierboven) -> geweigerd
--      2024-03-04                                     -> geweigerd
--      2026-03-02 (26 cycli terug)                    -> toegestaan
--      de volgende cyclus                             -> toegestaan
--      twee cycli vooruit                             -> geweigerd
--
-- ⚠️ **Op de kalender van de eigenaar en niet op die van de server.** Zonder dat
--    zou een gebruiker in Auckland op elke dagovergang zijn eigen lopende cyclus
--    geweigerd zien. `eigenaarsdatum()` staat er sinds 0134 voor, en 0155 haalde
--    om precies deze reden drie losse `current_date`-en uit `herbereken_risico()`.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat deze migratie níet waarmaakt
-- ---------------------------------------------------------------------------
--
-- **De invariant geldt bij INSERT, niet voor de tabel.** De trigger staat op
-- `before insert`, en `cycle_start_date` staat niet in de UPDATE-kolomgrant van
-- `authenticated` — maar `zet_week_startdag()` is `security definer`, staat wél
-- open voor `authenticated`, en toetst niet dat `p_nieuwe_start` op `p_dag` valt.
-- 📏 Gemeten in de security-review van 08-09, en zelf nagekeken op
-- `pg_get_functiondef()`:
--
--      zet_week_startdag(p_dag => 1, p_oude_start => 2026-09-07,
--                        p_nieuwe_start => 2026-09-08)  -> {"ok":true,"verzet":1}
--      resultaat: cycle_start_date 2026-09-08 (dow 2), profiel week_start_day 1
--
-- Er lekt geen punt uit: de RPC eist dat vandaag in béide cycli valt, dus de
-- datum blijft dicht bij vandaag, en de rollover selecteert met een
-- bereikvergelijking (`< afsluitbaar.startDate`) — het minpunt komt gewoon.
--
-- ⚠️ **Maar reken hier niet op de invariant.** Dat staat hier omdat een lezer van
--    déze migratie anders aanneemt dat elke rij in `weekly_goals` een echte
--    cyclusstart draagt, en dat is na deze migratie nog steeds niet waar. De
--    reparatie is een dagtoets in `zet_week_startdag()` zelf; die hoort bij die
--    functie en niet hier, want ze vraagt haar eigen must-allows. Ligt als
--    QS8-357 in Linear.
--
-- ---------------------------------------------------------------------------
-- Waarom beide grendels alleen voor een client gelden
-- ---------------------------------------------------------------------------
--
-- ⚠️ `if (select auth.uid()) is null then return …` staat er in de vorm van 0192,
--    en om dezelfde reden: de rollover, `service_role` en de testopbouw schrijven
--    weken die vér terug liggen en dat is legitiem — de aanvalsvector is de
--    client. Een grendel die de rollover breekt, is geen grendel maar een storing.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `security definer` omdat de trigger `profiles` van de eigenaar leest, en een
--    gewone gebruiker dat profiel niet hoeft te mogen lezen om zijn eigen weekdoel
--    te maken.
create or replace function weekdoel_cyclus_klopt()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_startdag smallint;
  v_owner    uuid;
  v_vandaag  date;

  -- ⚠️ **Een eigen constante en geen kopie.** `plan_adempauze()` heeft er ook een
  --    van 52, maar die begrenst iets anders (de lengte van een adempauze) en
  --    hoort hier niet aan vast te zitten. Zie de kop.
  c_venster_cycli constant integer := 52;
begin
  if v_uid is null then return new; end if;

  select g.owner_id into v_owner from goals g where g.id = new.goal_id;

  -- ⚠️⚠️ **Zwijgen zodra de invoerder niet de eigenaar is, en dat is geen
  --    versoepeling.** `weekly_goals_insert` eist `g.owner_id = auth.uid()` in
  --    zijn `with check`, dus zo'n rij komt er sowieso niet in — maar een
  --    `before insert`-trigger draait vóór die controle en antwoordt dus al.
  --    📏 Gemeten in de security-review van 08-09: B kent de goal-id van A (die
  --    mag hij lezen) en stuurt zeven inserts; zes komen terug met 23514 'een
  --    cyclus begint op je eigen week-startdag' en één met 42501 van de policy.
  --    Die ene verraadt `profiles.week_start_day` van A — een kolom waarop
  --    `profiles` aan géén enkele client leesrecht geeft.
  --
  --    Dat is een nieuw groepszichtbaar oppervlak, en de regel bij domeinregel 7
  --    is dat een nieuw oppervlak dicht is tot iemand het tegendeel besluit. Er
  --    gaat geen handhaving verloren: de policy weigert de rij toch.
  if v_owner is distinct from v_uid then return new; end if;

  select p.week_start_day into v_startdag from profiles p where p.id = v_owner;

  -- ⚠️ Geen profiel: dan valt er niets te toetsen en laat deze trigger het aan de
  --    foreign key en de policy. Zwijgen is hier juist, want een fout over een
  --    ontbrekend profiel wijst de lezer de verkeerde kant op.
  if v_startdag is null then return new; end if;

  if extract(dow from new.cycle_start_date)::smallint <> v_startdag then
    raise exception 'Een cyclus begint op je eigen week-startdag'
      using errcode = 'check_violation',
            hint = 'cycle_start_date moet op profiles.week_start_day vallen; de app rekent hem uit.';
  end if;

  -- ⚠️ **De kalender van de eigenaar en niet die van de server.** `current_date`
  --    is UTC; een gebruiker in Auckland zit twaalf uur verderop en zou op elke
  --    dagovergang een cyclus geweigerd zien die voor hém de lopende is.
  --    `eigenaarsdatum()` staat er sinds 0134 voor precies dit doel, en 0155
  --    haalde om dezelfde reden drie losse `current_date`-en uit
  --    `herbereken_risico()`. De `coalesce` volgt die aanroeper: geen profiel is
  --    hierboven al afgevangen, en terugvallen op de serverdatum is dan de
  --    veiligste rest.
  v_vandaag := coalesce(eigenaarsdatum(v_owner), current_date);

  -- ⚠️ `(c_venster_cycli - 1) * 7` = 357 dagen: de 52e cyclusstart terug valt er
  --    op de startdag zelf precies op. Geen enkel ijkgeval ligt op die rand —
  --    zie de kop van `tests/rls/cyclusgrens.test.ts`.
  if new.cycle_start_date < v_vandaag - (c_venster_cycli - 1) * 7
     or new.cycle_start_date > v_vandaag + 7 then
    raise exception 'Deze cyclus ligt buiten het venster waarin je weekdoelen maakt'
      using errcode = 'check_violation',
            hint = 'Van 52 cycli terug tot de volgende cyclus, op je eigen kalender; zie 0198.';
  end if;

  return new;
end;
$$;

revoke all on function weekdoel_cyclus_klopt() from public, anon, authenticated;

drop trigger if exists weekdoel_cyclus on weekly_goals;

create trigger weekdoel_cyclus
  before insert on weekly_goals
  for each row execute function weekdoel_cyclus_klopt();

-- ---------------------------------------------------------------------------
-- De dagteller op goedkeuringen — de vorm van 0192
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Hetzelfde getal als `weekdoelen_plafond()`, en dat is geen toeval.** Je
--    kunt niet meer weken goedkeuren dan er kunnen bestaan, en die zijn per
--    gebruiker al op 200 per dag begrensd. Een hoger getal hier zou niets meer
--    toestaan; een lager getal zou een groep met veel leden in de weg zitten.
create or replace function goedkeuringen_plafond()
returns integer
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$ select 200 $$;

-- ⚠️⚠️ **`AFTER INSERT ... FOR EACH STATEMENT` met een transitietabel, precies
--    zoals 0192.** Een `BEFORE`-trigger heeft geen transitietabel en kan de batch
--    dus niet meetellen; een teller die alleen gecommitte rijen ziet, begrenst
--    wanneer je mag beginnen en niet hoeveel je invoegt. Dat was QS8-343.
create or replace function begrens_goedkeuringen()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_totaal integer;
  v_batch  integer;
begin
  if (select auth.uid()) is null then return null; end if;

  select count(*) into v_batch from nieuw;

  select count(*) into v_totaal
  from completion_approvals a
  where a.approver_id = (select auth.uid())
    and a.created_at > now() - interval '1 day';

  if v_totaal > goedkeuringen_plafond() then
    raise exception 'Te veel goedkeuringen in één dag (% erbij, % in het laatste etmaal, plafond %)',
      v_batch, v_totaal, goedkeuringen_plafond()
      using errcode = 'check_violation',
            hint = 'Het dagplafond geldt per beoordelaar en telt ook de rijen uit dit verzoek.';
  end if;

  return null;
end;
$$;

revoke all on function begrens_goedkeuringen() from public, anon, authenticated;
revoke all on function goedkeuringen_plafond() from public, anon, authenticated;

drop trigger if exists goedkeuringen_dagplafond on completion_approvals;

create trigger goedkeuringen_dagplafond
  after insert on completion_approvals
  referencing new table as nieuw
  for each statement execute function begrens_goedkeuringen();
