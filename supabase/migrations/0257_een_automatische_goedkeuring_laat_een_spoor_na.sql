-- 0257_een_automatische_goedkeuring_laat_een_spoor_na.sql — een week die de
-- termijn goedkeurt is achteraf te onderscheiden van een echte peer-goedkeuring,
-- zonder de dedupe-grendel op `points_ledger` te verzwakken (QS8-453).
--
-- ROLLBACK-PAD:
--   CREATE OR REPLACE FUNCTION public.keur_vastgelopen_goedkeuringen_goed(...)
--     ... (de versie uit 0194, zonder `zonder_beoordelaar` in de insert),
--   gevolgd door:
--     alter table public.points_ledger drop column if exists zonder_beoordelaar;
--   Geen policy, geen index en geen CHECK gewijzigd.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Middel-rij van 02-09-2026 uit `docs/ENGINEER-REVIEW.md`, op 13-09 nagemeten
--    tegen `pg_get_functiondef()`. `keur_vastgelopen_goedkeuringen_goed()` keurt
--    een week goed die door niemand beoordeeld kán worden — de groep bestaat niet
--    meer — en boekt de punten met **dezelfde `reason` als een echte
--    peer-goedkeuring**: `completion_approved_ceiling` of `_floor`. Geen
--    `group_events`-rij, geen systeembericht.
--
--    Het enige onderscheid was `group_id is null`, en dat deelt hij met
--    `cycle_missed` (CHECK `points_ledger_gemist_is_niet_van_een_groep`, 0141).
--    Een uitzondering op een **autorisatiegrens** (domeinregel 3: alleen een
--    groepsgenoot mag goedkeuren) die geen spoor nalaat, is achteraf niet te
--    reconstrueren en dus ook niet met een correctie-record recht te zetten
--    (domeinregel 6).
--
-- ---------------------------------------------------------------------------
-- Waarom een kolom en geen eigen `reason`
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De reviewrij stelde een eigen `reason` voor — `completion_auto_approved_*`
--    — "zonder het puntenmodel te raken". 📏 Dat laatste is gemeten onwaar.**
--    De dedupe-index draagt `reason` in zijn sleutel:
--
--      points_ledger_dedupe_idx UNIQUE (user_id, reason, ref_type, ref_id)
--        WHERE ref_id IS NOT NULL AND reason <> 'review_given'
--
--    Gemeten met twee boekingen voor dezelfde week:
--
--      completion_approved_ceiling    -> geboekt
--      completion_approved_ceiling    -> ERROR: duplicate key ... dedupe_idx  ✅
--      een ándere reason, zelfde week -> geboekt
--      => aantal boekingen: 2, som delta: 4
--
--    Vier punten voor een week met een plafond van twee. De
--    `on conflict do nothing` hieronder beschermt dan niets meer, want de twee
--    routes zouden verschillende indexsleutels hebben.
--
-- ⚠️ **En `reason` staat daar met reden in, dus hem eruit halen is ook geen
--    reparatie.** Een `correction` moet naast een goedkeuring kunnen staan — dat
--    ís domeinregel 6. De index kiest bewust voor "één boeking per (gebruiker,
--    reden, week)"; een nieuwe reden verruimt die regel stilzwijgend.
--
--    Dit is regel 18 vraag 6 in zijn zuiverste vorm: de wijziging zou de aanname
--    *"er is precies één boeking per week"* optillen naar *"er kunnen er meer
--    zijn"*, en de grendel die dat tegenhield is precies de grendel die je
--    omzeilt. Een kolom raakt die sleutel niet.
--
-- ⚠️ **Geen `group_events`-rij.** Dat was het andere alternatief, en het valt af
--    op zijn eigen aanname: er ís geen groep om hem aan te hangen. Dat is nu juist
--    waarom deze week vastliep.
--
-- ---------------------------------------------------------------------------

-- ⚠️ `not null default false` en geen `boolean` die `null` mag zijn: "we weten
--    het niet" is hier geen bestaande toestand. Elke bestaande rij is óf via de
--    peer-route geboekt, óf via de automatische — en die twee zijn uit elkaar te
--    houden, zie de backfill hieronder.
--
-- ⚠️ **`authenticated` heeft een tabelbrede SELECT op `points_ledger`**, dus deze
--    kolom is meteen leesbaar voor wie de rij mag zien. Dat is hier goed en het is
--    nagemeten: `points_ledger_select` is `user_id = auth.uid()` en er is geen
--    INSERT-, UPDATE- of DELETE-policy. De eigenaar leest dus zijn eigen spoor en
--    niemand anders — domeinregel 10 (het puntentotaal is privé) blijft staan, en
--    er komt geen groepsoppervlak bij, dus domeinregel 7 is niet in het geding.
alter table public.points_ledger
  add column if not exists zonder_beoordelaar boolean not null default false;

-- ⚠️⚠️ **En een backfill, want `false` voor alles is aantoonbaar onjuist.** 📏 De
--    automatische route bestaat sinds 0135, productie staat op `0221`, en
--    `.github/workflows/rollover.yml` draait `cron: '0 * * * *'` en roept
--    `keur_vastgelopen_goedkeuringen_goed(7)` onvoorwaardelijk aan. Er staan dus
--    al automatisch goedgekeurde weken in het grootboek, en die zouden zonder
--    deze regel als peer-goedgekeurd gelabeld worden.
--
-- ⚠️ **Het onderscheid stond al in de kop van dit bestand en werd niet gebruikt.**
--    Nagemeten: `completion_approvals.group_id` is `not null` en
--    `award_points_on_approval()` boekt altijd `new.group_id`, dus een
--    peer-goedkeuring heeft per definitie een groep. De automatische route boekt
--    `null`. Met drie historische rijen naast elkaar selecteert dit predicaat er
--    exact één: de automatische, niet de peer-rij en niet `cycle_missed` (die
--    heeft een andere `reason`).
--
-- ⚠️ Idempotent: een tweede run zet dezelfde rijen nog een keer op `true`.
update public.points_ledger
   set zonder_beoordelaar = true
 where reason in ('completion_approved_ceiling', 'completion_approved_floor')
   and group_id is null
   and zonder_beoordelaar is distinct from true;

comment on column public.points_ledger.zonder_beoordelaar is
  'True als deze punten zijn toegekend doordat de goedkeuringstermijn verliep en '
  'er geen groepsgenoot meer was om te beoordelen — QS8-453. Staat naast de '
  'punten en niet in `reason`, omdat `reason` in points_ledger_dedupe_idx zit.';

-- ---------------------------------------------------------------------------

-- ⚠️ Woordelijk de functie uit 0194, met precies twee wijzigingen: de
--    `insert` noemt `zonder_beoordelaar` en de kop legt uit waarom. Overtypen met
--    verbeteringen zou hier een tweede lijst maken die uiteenloopt — dezelfde
--    fout als 0032/0034, en de kop van 0194 waarschuwt er zelf voor.
CREATE OR REPLACE FUNCTION public.keur_vastgelopen_goedkeuringen_goed(p_termijn_dagen integer DEFAULT 7, p_owner_ids uuid[] DEFAULT NULL)
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

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    --
    -- ⚠️ `zonder_beoordelaar = true` is het spoor. Dit is de énige plek in het
    --    schema die hem op `true` zet; `award_points_on_approval()` laat de
    --    standaard `false` staan, en dat is de naad die
    --    `tests/rls/vastgelopen.test.ts` bewaakt.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, zonder_beoordelaar)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id, true)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$;

-- ⚠️ Geen `drop` en dus blijven de grants staan — `create or replace` behoudt ze.
--    Nagemeten na het afspelen: `anon` en `authenticated` mogen hem nog steeds
--    niet uitvoeren, alleen `service_role`. Zie het rechtenblok van 0194 voor het
--    gat dat een `drop` hier wél zou slaan.

comment on function public.keur_vastgelopen_goedkeuringen_goed(integer, uuid[]) is
  'Keurt weken goed waarvan de goedkeuringstermijn verliep zonder beoordelaar, en '
  'markeert die boekingen met points_ledger.zonder_beoordelaar — QS8-453.';
