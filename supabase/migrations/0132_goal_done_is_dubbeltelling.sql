-- 0132_goal_done_is_dubbeltelling.sql — `goal_done` uit points_ledger.reason halen (QS8-215)
--
-- ROLLBACK-PAD:
--   alter table points_ledger drop constraint points_ledger_reason_valid;
--   alter table points_ledger add constraint points_ledger_reason_valid check (reason in (
--     'completion_approved_floor', 'completion_approved_ceiling',
--     'cycle_missed', 'review_given', 'milestone_done', 'goal_done', 'correction'
--   ));
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Gemeten op 31-08-2026 tegen een opgebouwde database, met `pg_get_functiondef()`
-- over elke functie in `public` die `points_ledger` noemt — plus de Edge
-- Functions, want die schrijven er via PostgREST rechtstreeks in en staan dus
-- niet in `pg_proc`:
--
--   completion_approved_ceiling   award_points_on_approval
--   completion_approved_floor     award_points_on_approval
--   review_given                  award_points_on_approval
--   correction                    trek_goedkeuring_in
--   cycle_missed                  supabase/functions/rollover/index.ts:305
--   milestone_done                — niemand
--   goal_done                     — niemand, en nul voorkomens in src/, app/ en
--                                   supabase/functions/
--
-- Besluit van Quinten, 31-08-2026: het afronden van een doel is per definitie al
-- verdiend via de weekdoelen eronder. Domeinregel 10 zegt dat het puntenplafond
-- van een doel de sóm is van de plafondpunten van zijn weekdoelen; een aparte
-- boeking bovenop die som maakt het plafond onvoorspelbaar, en juist dat plafond
-- is het getal dat een gebruiker vooraf moet kunnen zien.
--
-- ⚠️ De aanleiding in QS8-215 klopte niet, en dat is de moeite van het opschrijven
--    waard. Het issue zei dat `milestone_done` wél geboekt wordt en `goal_done`
--    niet, en juist die asymmetrie maakte er een productvraag van. Gemeten is
--    `milestone_done` óók dood als puntenreden: elk voorkomen ervan is het
--    gebeurtenistype van een systeembericht (`chat_messages`), een ándere enum
--    die toevallig dezelfde waardenaam draagt.
--
--    Twee enums met dezelfde naam in twee tabellen: elk onderdeel klopt en de
--    conclusie over het geheel niet. Dat is de vorm uit CLAUDE.md regel 18.
--
-- ⚠️ `cycle_missed` leek in de eerste meting óók dood, en dat was een meetfout.
--    Hij wordt geboekt door de rollover-Edge-Function en niet door een
--    databasefunctie, dus een meting die alleen `pg_proc` afloopt ziet hem niet.
--    Was die meting blijven staan, dan had deze migratie het minpunt uit
--    domeinregel 10 geschrapt. **Meet de Edge Functions mee.**
--
-- ---------------------------------------------------------------------------
-- Wat hier NIET gebeurt, en waarom
-- ---------------------------------------------------------------------------
--
-- ⚠️ `milestone_done` blijft staan, hoewel hij even dood is. Hem schrappen is een
--    tweede besluit — telt het halen van een mijlpaal apart mee? — en dat is
--    dezelfde vraag die voor `goal_done` aan Quinten is voorgelegd. Eén besluit
--    per keer; hij staat als vraag in QS8-215 en verdwijnt niet stilzwijgend mee
--    in de slipstream van deze migratie.
--
-- ⚠️ Geen `points_ledger`-rijen te herstellen: er is er nooit één met
--    `goal_done` geschreven. Nagemeten vóór deze migratie (zie hieronder).

-- ---------------------------------------------------------------------------
-- De grendel: schrap niets zolang er een rij is die de nieuwe CHECK breekt.
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is geen voorzorg maar de enige rem die er is. Een CHECK die je smaller
--    maakt terwijl er data buiten valt, laat Postgres weigeren — maar met een
--    melding die naar de constraint wijst en niet naar de oorzaak. Deze `raise`
--    zegt wél wat er aan de hand is, en hij is meteen het bewijs dat er niets
--    verloren gaat.
do $$
declare
  v_aantal int;
begin
  select count(*) into v_aantal from points_ledger where reason = 'goal_done';

  if v_aantal > 0 then
    raise exception
      'Er staan % boekingen met reason = goal_done. Deze migratie zou ze onbereikbaar '
      'maken voor elke toekomstige update. Beslis eerst wat ermee moet (QS8-215).',
      v_aantal;
  end if;
end $$;

alter table points_ledger drop constraint if exists points_ledger_reason_valid;

alter table points_ledger add constraint points_ledger_reason_valid check (reason in (
  'completion_approved_floor', 'completion_approved_ceiling',
  'cycle_missed', 'review_given', 'milestone_done', 'correction'
));

comment on constraint points_ledger_reason_valid on points_ledger is
  'De redenen die geboekt mogen worden. goal_done is er op 31-08-2026 uit gehaald: '
  'het afronden van een doel is al verdiend via de weekdoelen eronder, en een '
  'aparte boeking zou dubbeltelling zijn (domeinregel 10, QS8-215).';
