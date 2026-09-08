-- 0200_een_cyclus_begint_op_de_startdag_ook_bij_een_update.sql — de invariant
-- van 0198 gold bij INSERT en niet voor de tabel (QS8-357)
--
-- ROLLBACK-PAD:
--   Zet `zet_week_startdag()` terug naar de vorm van 0139/0155. Het is één
--   `create or replace`, dus grants en `comment on function` blijven staan; er
--   valt verder niets terug te draaien.
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- 0198 vestigt de invariant *een cyclus begint op de week-startdag van de
-- eigenaar*, en zegt dat met zoveel woorden. Hij doet dat met een
-- `before insert`-trigger op `weekly_goals`, dus de invariant gold bij INSERT
-- en niet voor de tabel.
--
-- 📏 `zet_week_startdag()` schrijft met een `update` en komt daar dus langs:
--
--   zet_week_startdag(p_dag => 4, p_oude_start => <maandag>, p_nieuwe_start => <dinsdag>)
--     -> {"ok": true, "verzet": 1}
--     -> weekly_goals.cycle_start_date op een dinsdag, profiles.week_start_day = 4
--
-- ⚠️ **De bestaande grendel zag er niets van, en dat is het punt.** Die eist dat
--    vandaag in béide cycli valt, en dat is een datumbereik — geen uitspraak
--    over de dag waaróp een cyclus begint. Twee grendels, twee vragen.
--
-- ---------------------------------------------------------------------------
-- Wat dit vandaag niet is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen puntenlek**, en dat is gemeten en niet aangenomen. De venstertoets
--    houdt de geschreven datum dicht bij vandaag, en de rollover selecteert met
--    een bereikvergelijking (`.lt('cycle_start_date', ...)`) en niet op
--    gelijkheid — dus het minpunt komt gewoon. Er valt niets mee te verdienen.
--
-- 📏 En de client raakt het niet: `src/modules/auth/profile.ts` geeft altijd een
--    echte `userCycle().startDate` mee.
--
-- **Waarom het er dan toe doet:** een lezer van 0198 neemt aan dat elke rij in
-- `weekly_goals` een echte cyclusstart draagt. De volgende grendel of query die
-- dáárop leunt, leunt op iets wat de database niet afdwingt. Dat is de vorm uit
-- regel 18 — elk onderdeel klopt en het geheel niet — en het is goedkoper om nu
-- te repareren dan om er later een tweede grendel op te bouwen.
--
-- ---------------------------------------------------------------------------
-- Waarom een toets in de RPC en geen trigger op de UPDATE
-- ---------------------------------------------------------------------------
--
-- Een `before update`-trigger zou de invariant voor de héle tabel afdwingen, en
-- dat klinkt sterker. Twee metingen wijzen de andere kant op:
--
-- * 📏 `cycle_start_date` staat **niet** in de UPDATE-kolomgrant van
--   `authenticated` (die draagt `ceiling_text`, `floor_text`, `milestone_id`,
--   `title`), dus een client komt er rechtstreeks niet bij. `zet_week_startdag()`
--   is de enige schrijver.
-- * De trigger van 0198 toetst óók een **venster** rond vandaag. Bij een update
--   is dat verkeerd: de rollover en `schuif_weekdoel_door()` raken rijen die
--   ouder zijn dan dat venster, en een trigger die op elke update vuurt zou die
--   weigeren. Dan is de reparatie duurder dan het gat.
--
-- ⚠️ Een toets in de RPC is dus geen zwakkere keuze maar de smalle: hij zit op de
--   énige plek waar het gat is, en hij houdt de vorm van 0198 aan
--   (`extract(dow from ...)::smallint`) zodat er geen tweede opvatting van
--   "welke dag is dit" ontstaat — correctheidsregel 7.
--
-- ⚠️ **Wat dat níet dekt en dat hoort erbij:** `service_role` en een toekomstige
--    tweede schrijver komen er nog steeds langs. Dat staat als rij in
--    `docs/ENGINEER-REVIEW.md`.

CREATE OR REPLACE FUNCTION public.zet_week_startdag(p_dag smallint, p_oude_start date, p_nieuwe_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid      uuid := auth.uid();
  v_vandaag  date;
  v_verzet   integer := 0;
  v_oude_dag smallint;
begin
  -- ⚠️ Expliciet op null toetsen en niet op `<> `. Zonder sessie is `auth.uid()`
  --    NULL, en `null <> x` is NULL en dus niet waar — de val die veertig regels
  --    kostte en in elke definer-functie sindsdien zo staat.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_logged_in');
  end if;

  if p_dag is null or p_dag < 0 or p_dag > 6 then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_dag');
  end if;

  if p_oude_start is null or p_nieuwe_start is null then
    return jsonb_build_object('ok', false, 'reason', 'ongeldige_cyclus');
  end if;

  -- De eigen datum van deze gebruiker, uit de gedeelde helper van 0137. Niet
  -- `current_date`: die is UTC, en dan verschilt de grens per woonplaats.
  v_vandaag := eigenaarsdatum(v_uid);

  -- ⚠️ Een ontbrekend profiel is hier **weigeren** en niet doorlaten. Bij
  --    `wikkel_commitments_af()` viel de terugval de milde kant op omdat de
  --    twijfel daar een beloning kostte; hier zou doorlaten de grens hieronder
  --    uitschakelen, en dat is de kant die geld kost.
  if v_vandaag is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  -- ---------------------------------------------------------------------
  -- De grendel, en dit is het deel dat ertoe doet
  -- ---------------------------------------------------------------------
  --
  -- ⚠️ **Een RPC die een cliënt-berekende datum aanneemt, is een route naar een
  --    weggepoetste week.** Zonder deze toets kon je een `todo` die op het punt
  --    staat gemist te worden naar de huidige cyclus schuiven, en dan komt het
  --    minpunt nooit. Dat is dezelfde klasse als de vier routes die 0043 t/m
  --    0046 hebben dichtgezet.
  --
  -- ⚠️ **De toets is een datumbereik en geen weekberekening**, en dat is met
  --    opzet: zo ontstaat er geen tweede opvatting van "welke week is het" in
  --    SQL. Beide cycli moeten vandáág bevatten. Daarmee is het legitieme geval
  --    precies gekarakteriseerd — je verhuist van de cyclus waar je nú in zit
  --    naar de cyclus waar je onder de nieuwe dag nú in zit — en een `todo` uit
  --    een écht voorbije week haalt hem nooit.
  if v_vandaag < p_oude_start or v_vandaag >= p_oude_start + 7
     or v_vandaag < p_nieuwe_start or v_vandaag >= p_nieuwe_start + 7 then
    return jsonb_build_object('ok', false, 'reason', 'cyclus_bevat_vandaag_niet');
  end if;

  -- ---------------------------------------------------------------------
  -- De tweede grendel: een cyclus begint op de week-startdag — QS8-357
  -- ---------------------------------------------------------------------
  --
  -- ⚠️⚠️ **De venstertoets hierboven zegt niets over de dag waarop een cyclus
  --    begint**, en dat is precies wat 0198 als invariant vestigt. Die migratie
  --    doet dat met een -trigger op `weekly_goals`, en deze
  --    functie schrijft met een `update` — waar die trigger niet vuurt.
  --
  -- 📏 Gemeten vóór deze reparatie: `zet_week_startdag(4, <maandag>, <dinsdag>)`
  --    gaf `{ok: true, verzet: 1}` en zette `cycle_start_date` op een dinsdag,
  --    terwijl `week_start_day` op donderdag kwam te staan. Beide datums lagen
  --    binnen het venster, dus de toets hierboven zag er niets van.
  --
  -- ⚠️ **De vorm is die van `weekdoel_cyclus_klopt()`**, met opzet:
  --    `extract(dow from ...)::smallint`. Een tweede opvatting van "welke dag is
  --    dit" in SQL is precies wat correctheidsregel 7 verbiedt.
  if extract(dow from p_nieuwe_start)::smallint <> p_dag then
    return jsonb_build_object('ok', false, 'reason', 'cyclus_valt_niet_op_startdag');
  end if;

  -- ⚠️ **En de óude cyclus tegen de óude dag.** Zonder deze toets verhuist de
  --    RPC een rij die zelf al scheef stond: de uitkomst is dan recht, maar de
  --    selectie (`where w.cycle_start_date = p_oude_start`) niet — en dan
  --    verplaatst hij een weekdoel dat helemaal niet in de lopende cyclus hoorde.
  --
  -- ⚠️ Dit moet vóór de `update profiles` staan. Erna is `week_start_day` al de
  --    níeuwe dag en toetst deze regel zichzelf.
  select p.week_start_day into v_oude_dag from profiles p where p.id = v_uid;

  -- ⚠️ Geen dag bekend: dan valt er niets te toetsen. Een ontbrekend profiel is
  --    hierboven al afgevangen op `v_vandaag`, dus dit is de rest — en die laat
  --    de oude toets aan de venstergrens, zoals `weekdoel_cyclus_klopt()` dat
  --    ook doet bij een ontbrekende `week_start_day`.
  if v_oude_dag is not null
     and extract(dow from p_oude_start)::smallint <> v_oude_dag then
    return jsonb_build_object('ok', false, 'reason', 'oude_cyclus_valt_niet_op_startdag');
  end if;

  update profiles set week_start_day = p_dag where id = v_uid;

  -- ⚠️ Alleen als er iets te verhuizen valt. Bij gelijke data (de onboarding
  --    zet zijn dag terwijl er nog geen weekdoel bestaat) is dit een no-op, en
  --    dan hoort er geen lege `update` te draaien die `updated_at` aanraakt.
  if p_nieuwe_start <> p_oude_start then
    update weekly_goals w
       set cycle_start_date = p_nieuwe_start
      from goals g
     where g.id = w.goal_id
       and g.owner_id = v_uid
       and w.cycle_start_date = p_oude_start
       -- Alleen `todo`. Zie de kop voor de reden per status.
       and w.status = 'todo';

    get diagnostics v_verzet = row_count;
  end if;

  return jsonb_build_object('ok', true, 'verzet', v_verzet);
end;
$function$;
