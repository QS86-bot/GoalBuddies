-- 0267_een_week_draagt_hoogstens_een_goedkeuringsboeking_per_ronde.sql — dezelfde
-- week kon een vloer- **én** een plafondboeking dragen, omdat `reason` in de
-- dedupe-sleutel zit en die twee verschillende redenen zijn.
--
-- ROLLBACK-PAD:
--   drop index if exists points_ledger_goedkeuring_per_ronde_idx;
--
--   ⚠️ Dit pad is veilig en dat is een verschil met 0266: deze migratie voegt een
--      index **toe** en verandert er geen. Er is dus geen toestand die de
--      terugweg kan blokkeren, en niets om vooraf te meten.
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
