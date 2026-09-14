-- 0267_een_week_draagt_hoogstens_een_goedkeuringsboeking_per_ronde.sql — dezelfde
-- week kon een vloer- **én** een plafondboeking dragen, omdat `reason` in de
-- dedupe-sleutel zit en die twee verschillende redenen zijn.
--
-- ROLLBACK-PAD:
--   drop index if exists points_ledger_goedkeuring_per_ronde_idx;
--
--   En `award_points_on_approval()` en `keur_vastgelopen_goedkeuringen_goed()`
--   terug naar hun vorm van 0266 — daar telden ze de ronde per `reason`. Die
--   twee horen bij de index en moeten sámen terug: de teller alleen terugzetten
--   laat precies het gat achter dat hieronder beschreven staat.
--
--   ⚠️ Het index-deel is risicoloos — deze migratie voegt een index **toe** en
--      verandert er geen, dus er is geen toestand die de terugweg blokkeert. Dat
--      is een verschil met 0266.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `points_ledger_dedupe_idx` heet de grendel tegen dubbel boeken, en drie
-- schrijfpaden leunen er met `on conflict do nothing` op. Maar `reason` zit in
-- de sleutel, en `completion_approved_floor` en `completion_approved_ceiling`
-- zijn twee verschillende redenen voor dezelfde week.
--
-- 📏 Gemeten op de draaiende stand (14-09-2026, ná 0266), in een terugrollende
--    transactie:
--
--      completion_approved_ceiling, week W, delta 2  -> geboekt
--      completion_approved_floor,   week W, delta 1  -> geboekt
--      -> rijen: 2, som delta: 3
--
--    Drie punten voor een week met een plafond van twee.
--
-- ⚠️ **Waarom dit vandaag niet knalt, en waarom dat niet genoeg is.** Alle drie
--    de goedkeuringsroutes zetten `weekly_goals.status = 'approved'` en slaan
--    over wat niet meer `pending` is, dus de tweede boeking is langs de normale
--    weg onbereikbaar. Maar dat is precies de vorm uit onwrikbare regel 18: elk
--    onderdeel klopt en de belofte hangt aan het gehéél. De index héét de
--    grendel; wat hem werkelijk tegenhoudt is een statuscontrole twee lagen
--    hoger. Verschuift die — een derde route, een herstelpad, een correctie die
--    de status terugzet — dan valt de grendel stil weg. Het puntentotaal is
--    precies de plek waar dat niet mag (domeinregel 10).
--
--    En het is niet af te doen met "we boeken toch nooit twee keer": een grendel
--    die niet afdwingt wat hij belooft, is een grendel waar de volgende
--    schrijver op vertrouwt.
--
-- ---------------------------------------------------------------------------
-- Waarom een tweede index en niet `reason` uit de bestaande sleutel halen
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`reason` kán niet zomaar uit `points_ledger_dedupe_idx`.** Een
--    `correction` moet naast een goedkeuring kunnen staan — dat ís domeinregel
--    6: corrigeren gebeurt met een record, niet door geschiedenis te
--    overschrijven. Haal je `reason` uit die sleutel, dan botst elke intrekking
--    op de goedkeuring die hij corrigeert.
--
-- Vandaar richting 1 uit het issue: een **tweede**, partiële unieke index die
-- alleen de twee goedkeuringsredenen samenneemt. `correction` blijft vrij, de
-- vloer/plafond-dubbeling sluit.
--
-- ⚠️⚠️ **En `ronde` moet erin, anders draait deze migratie 0266 terug.** Sinds
--    QS8-456 boekt een week die na een ingetrokken goedkeuring alsnog wordt
--    goedgekeurd in `max(ronde) + 1` — dan staan er legitiem twee
--    `completion_approved_ceiling`-rijen voor dezelfde week, op ronde 1 en 2.
--    Zonder `ronde` in deze index zou die tweede boeting botsen en was de week
--    weer `approved` met netto nul. 📏 Nagemeten in beide richtingen, zie de
--    ijking in het issue.
--
--    Dat is precies wat het beslisdocument van 0266 voorspelde: *"`ronde` staat
--    die reparatie niet in de weg — wie `reason` er ooit uit haalt, houdt de
--    ronde gewoon."*
--
-- ---------------------------------------------------------------------------
-- Wat dit NIET is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen vervanging van `points_ledger_dedupe_idx`.** Die blijft staan en
--    doet zijn werk voor élke reden: één rij per (gebruiker, reden, ding,
--    ronde). Deze index komt er bovenop en voegt één ding toe: de twee
--    goedkeuringsredenen tellen sámen als één.
--
-- ⚠️ **Geen verandering aan de invariant die 0266 naar plpgsql verhuisde.** Dat
--    een hógere ronde alleen mag bestaan ná een terugdraaiing, wordt nog steeds
--    afgedwongen door de `status`-guard in drie functies en niet door de
--    database. Die rij staat open in `docs/ENGINEER-REVIEW.md` met zijn eigen
--    voorwaarde; deze migratie raakt hem niet.
--
-- ---------------------------------------------------------------------------
-- Bestaande rijen
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten vóór het aanmaken: **nul** weken dragen vandaag meer dan één
--    goedkeuringsboeking per ronde, dus de index kan zonder opschoning worden
--    aangemaakt. De query die dat toetst staat hieronder en faalt luid als het
--    ooit niet zo is — een `create unique index` die op data stukloopt is een
--    veel slechter bericht dan een expliciete melding.

do $$
declare
  v_botsingen integer;
begin
  select count(*) into v_botsingen
  from (
    select user_id, ref_type, ref_id, ronde
    from points_ledger
    where ref_id is not null
      and reason in ('completion_approved_floor', 'completion_approved_ceiling')
    group by user_id, ref_type, ref_id, ronde
    having count(*) > 1
  ) b;

  if v_botsingen > 0 then
    raise exception
      'Er zijn % week(en) met meer dan één goedkeuringsboeking per ronde. Ruim die '
      'eerst op — welke rij weg mag is een besluit over iemands punten en hoort '
      'niet door een falende index genomen te worden.', v_botsingen;
  end if;
end $$;

-- ⚠️ **De twee goedkeuringsredenen samen, per ronde.** `correction`,
--    `cycle_missed`, `milestone_done` en `review_given` vallen erbuiten: die
--    hebben hun eigen regels en `correction` moet juist naast een goedkeuring
--    kunnen staan (domeinregel 6).
drop index if exists points_ledger_goedkeuring_per_ronde_idx;

create unique index points_ledger_goedkeuring_per_ronde_idx
  on public.points_ledger (user_id, ref_type, ref_id, ronde)
  where ref_id is not null
    and reason in ('completion_approved_floor', 'completion_approved_ceiling');

comment on index public.points_ledger_goedkeuring_per_ronde_idx is
  'Een week draagt hoogstens één goedkeuringsboeking per ronde: vloer en plafond '
  'tellen samen als één. `points_ledger_dedupe_idx` telt ze apart, want `reason` '
  'zit daar in de sleutel (QS8-454).';

-- ---------------------------------------------------------------------------
-- 2. De teller en de index moeten dezelfde rijen bestrijken
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit deel komt uit de security-ronde, en zonder deze helft repareerde
--    de index hierboven het ene gat door een ander te openen.** 📏 Gemeten:
--
--      1. Alice keurt Bobs week goed op **vloer**      -> +1, ronde 1
--      2. Alice trekt in (binnen het kwartier)         -> correction -1
--      3. Bob dient opnieuw in, nu op **plafond**
--      4. Alice keurt opnieuw goed
--         -> week `approved`, punten Bob: **0**
--
--    Beide goedkeuringsfuncties tellen `max(ronde) + 1` **per `reason`**, terwijl
--    de nieuwe index over béíde goedkeuringsredenen heen sleutelt. Wisselt het
--    niveau tussen twee rondes, dan begint de telling weer op 1 en houdt de index
--    die ronde al bezet — waarna `on conflict do nothing` de botsing slikt.
--
-- ⚠️ **Dat is geen randgeval.** De meest voor de hand liggende reden om een
--    goedkeuring in te trekken is juist dat het niveau niet klopte, en
--    `dien_opnieuw_in()` laat de eigenaar het niveau vrij kiezen zolang de week
--    `pending` staat — wat `trek_goedkeuring_in()` net heeft gedaan.
--
-- ⚠️⚠️ **En bij de termijnroute valt er méér weg dan de punten.** Daar wordt ook
--    `zonder_beoordelaar = true` niet geschreven — het spoor uit 0257 (QS8-453),
--    volgens de kop van die functie "de énige plek in het schema" die het zet.
--    De functie meldt intussen gewoon `afgehandeld = 1`.
--
-- De regel is dus: **de sleutel van de teller bestrijkt dezelfde rijen als de
-- sleutel van de index.** Allebei de functies tellen nu over de twee
-- goedkeuringsredenen samen.
--
-- ⚠️ `trek_goedkeuring_in()` blijft ongewijzigd: die telt zijn `correction`-ronde
--    apart, en `correction` valt buiten het indexpredicaat.

CREATE OR REPLACE FUNCTION public.award_points_on_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c        completions%rowtype;
  w        weekly_goals%rowtype;
  g_owner  uuid;
  punten   integer;
  reden    text;
  v_ronde  smallint;
begin
  select * into c from completions where id = new.completion_id;
  select * into w from weekly_goals where id = c.weekly_goal_id;
  select owner_id into g_owner from goals where id = w.goal_id;

  if c.superseded_by is not null then
    return new;
  end if;

  -- ⚠️ **Eén punt per buddy per cyclus** (besluit A51). De verwijzing is de
  --    eigenaar van het weekdoel — de buddy voor wie je opdaagt — en niet de
  --    voltooiing. Een tweede weekdoel van dezelfde buddy in dezelfde week
  --    levert daarom niets extra's op; een andere buddy of een andere week wel.
  --
  -- ⚠️ De cyclus komt uit `weekly_goals` en wordt hier niet uitgerekend.
  --    Correctheidsregel 7: de database rekent geen weken uit. Het is de cyclus
  --    van de éigenaar, want dat is de week die beoordeeld wordt.
  --
  -- ⚠️ "Vertel me meer" claimt het punt voor die cyclus, en de goedkeuring die er
  --    later op volgt levert niets extra's op. Dat is bedoeld: een echte vraag
  --    stellen ís de aandacht die dit punt beloont, en het haalt de prikkel weg
  --    om snel af te stempelen.
  --
  -- ⚠️ **Dit punt hangt níét aan de drempel** (QS8-65). Wie als eerste van drie
  --    bevestigt heeft dezelfde aandacht gegeven als wie als derde bevestigt.
  --    Zou het punt pas bij het halen van de drempel vallen, dan betaalt alleen
  --    de laatste beoordelaar zich uit en wordt vroeg kijken onaantrekkelijk.
  if w.status = 'pending' and g_owner is not null and w.cycle_start_date is not null then
    insert into points_ledger (
      user_id, goal_id, group_id, delta, reason, ref_type, ref_id, cycle_start_date
    )
    values (
      new.approver_id, null, new.group_id, 1, 'review_given',
      'buddy_cycle', g_owner, w.cycle_start_date
    )
    on conflict do nothing;
  end if;

  if new.status <> 'approved' then
    return new;
  end if;

  if w.status <> 'pending' then
    return new;
  end if;

  -- ⚠️ **De regel van QS8-65, en de enige plek waar hij de week raakt.** Tot deze
  --    migratie bevestigde één goedkeuring de week onvoorwaardelijk. Nu telt
  --    `goedkeuringsdrempel_gehaald()` per groep tegen de drempel die bij het
  --    indienen bevroren is. Bij `approval_rule = 'any'` — de standaard en de
  --    enige stand die vandaag bestaat — is die drempel 1 en verandert er niets.
  if not goedkeuringsdrempel_gehaald(new.completion_id) then
    return new;
  end if;

  if c.achieved_level = 'ceiling' then
    punten := w.points_ceiling;
    reden  := 'completion_approved_ceiling';
  else
    punten := w.points_floor;
    reden  := 'completion_approved_floor';
  end if;

  update weekly_goals set status = 'approved' where id = w.id;

  -- ⚠️⚠️ **Dezelfde rondebepaling als de termijn, en dat is de reparatie van
  --  de security-ronde op QS8-456.** Zonder deze regels boekt deze trigger
  --  impliciet ronde 1, en dán botst hij op de rij van een góedkeuring die
  --  daarna is ingetrokken — 📏 gemeten: week `approved`, netto **nul**.
  --
  --  Dat is bovendien de wáárschijnlijkste vorm van deze bug: hier hoeft
  --  niemand de groep te verlaten en hoeft er geen week termijn te verstrijken,
  --  alleen een tweede groepsgenoot die alsnog goedkeurt.
  select coalesce(max(p.ronde), 0) + 1 into v_ronde
  from points_ledger p
  where p.user_id  = g_owner
    -- ⚠️⚠️ **Dezelfde verzameling als `points_ledger_goedkeuring_per_ronde_idx`,
    --    en niet per `reason`.** Die index sleutelt op
    --    `(user_id, ref_type, ref_id, ronde)` over béíde goedkeuringsredenen
    --    heen. Telde je hier per reden, dan begint de telling bij een
    --    niveauwissel weer op 1 terwijl de index die ronde al bezet houdt —
    --    en `on conflict do nothing` slikt de botsing.
    --
    -- 📏 Gemeten (QS8-454, security-ronde): vloer goedgekeurd, ingetrokken,
    --    opnieuw ingediend op plafond, opnieuw goedgekeurd -> week `approved`,
    --    punten **0**. Precies de bug die 0266 repareerde, langs een achterdeur
    --    terug. De sleutel van de teller en de sleutel van de index moeten
    --    dezelfde rijen bestrijken.
    and p.reason   in ('completion_approved_floor', 'completion_approved_ceiling')
    and p.ref_type = 'weekly_goal'
    and p.ref_id   = w.id;

  insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde)
  values (g_owner, w.goal_id, new.group_id, punten, reden, 'weekly_goal', w.id, v_ronde)
  on conflict do nothing;

  perform verdien_weekpassen(g_owner, w.goal_id);

  perform herbereken_reeks(g_owner, w.goal_id);

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen integer DEFAULT 7, p_owner_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_ronde    smallint;
  v_aantal   integer := 0;
begin
  if p_termijn_dagen is null or p_termijn_dagen < 1 then
    raise exception 'p_termijn_dagen moet minstens 1 zijn, kreeg %', p_termijn_dagen;
  end if;

  -- ⚠️ **`vastgelopen_goedkeuringen()` is de enige definitie van "vastgelopen",
  --    en dat blijft zo.** Die functie spiegelt `te_beoordelen_voor()` met
  --    dezelfde vier voorwaarden; hier een eigen variant naast zetten is precies
  --    de tweede lijst die in 0032/0034 uit elkaar liep.
  for v_rij in
    select * from vastgelopen_goedkeuringen() v
    where p_owner_ids is null or v.owner_id = any (p_owner_ids)
  loop
    -- ⚠️ **De tak van 0147.** Wat de eigenaar zelf heeft gemaakt, wordt wél
    --    gemeld door `vastgelopen_goedkeuringen()` maar hier niet afgehandeld.
    continue when v_rij.beurt_bij_eigenaar;

    select * into v_voltooid from completions where id = v_rij.completion_id;

    -- De termijn loopt vanaf het indienen. Zie de kop van 0194.
    continue when v_voltooid.submitted_at is null
              or v_voltooid.submitted_at > now() - make_interval(days => p_termijn_dagen);

    select * into v_week from weekly_goals where id = v_voltooid.weekly_goal_id;

    -- ⚠️ Alleen een week die nog écht wacht. `vastgelopen_goedkeuringen()` filtert
    --    daar al op, maar tussen die query en deze regel kan een goedkeuring
    --    binnenkomen; dan hoort deze functie niets meer te doen.
    continue when v_week.status is distinct from 'pending';

    -- ⚠️ **Dezelfde redenen en dezelfde volgorde als `award_points_on_approval()`.**
    --    Twee paden naar een goedgekeurde week met verschillende gevolgen is hoe
    --    het puntenmodel stil uit elkaar loopt; wat de trigger doet, doet dit ook.
    --
    -- ⚠️⚠️ **En dat is precies waarom het spoor níet in `reason` zit** — QS8-453.
    --    `reason` bepaalt de punten én zit in `points_ledger_dedupe_idx`; een
    --    eigen waarde hier zou de dedupe per ongeluk opheffen. Zie de kop.
    if v_voltooid.achieved_level = 'ceiling' then
      v_punten := v_week.points_ceiling;
      v_reden  := 'completion_approved_ceiling';
    else
      v_punten := v_week.points_floor;
      v_reden  := 'completion_approved_floor';
    end if;

    -- ⚠️⚠️ **De reparatie van QS8-456.** Stond hier `on conflict do nothing` met
    --    ronde 1, dan slikte de index de boeking zodra er ooit een goedkeuring
    --    voor deze week was die daarna is ingetrokken — en bleef de week
    --    `approved` met netto nul punten.
    --
    -- ⚠️ De hoogste ronde plus één, en niet "ronde 2": een week kan in theorie
    --    meer dan één keer goedgekeurd-en-ingetrokken zijn, en dan is 2 al bezet.
    --
    -- ⚠️ Twee termijnruns tegelijk komen allebei op dezelfde ronde uit; de unieke
    --    index laat er dan één door. Dat is de bedoeling en daarom blijft het
    --    `on conflict do nothing` eronder staan.
    select coalesce(max(p.ronde), 0) + 1 into v_ronde
    from points_ledger p
    where p.user_id  = v_rij.owner_id
      -- ⚠️⚠️ **Dezelfde verzameling als `points_ledger_goedkeuring_per_ronde_idx`,
      --    en niet per `reason`.** Zie de gelijkluidende kop in
      --    `award_points_on_approval()`. 📏 Gemeten in de security-ronde op
      --    QS8-454: bij een niveauwissel tussen twee rondes begint de telling
      --    weer op 1, botst de insert op de index, slikt `on conflict do
      --    nothing` hem, en staat de week `approved` met **0** punten — én
      --    zonder het spoor `zonder_beoordelaar`, terwijl deze functie wel
      --    `afgehandeld = 1` meldt.
      and p.reason   in ('completion_approved_floor', 'completion_approved_ceiling')
      and p.ref_type = 'weekly_goal'
      and p.ref_id   = v_week.id;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    --
    -- ⚠️ `zonder_beoordelaar = true` is het spoor. Dit is de énige plek in het
    --    schema die hem op `true` zet; `award_points_on_approval()` laat de
    --    standaard `false` staan, en dat is de naad die
    --    `tests/rls/vastgelopen.test.ts` bewaakt.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde, zonder_beoordelaar)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id, v_ronde, true)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$

;
