-- 0216_een_adempauze_ligt_binnen_een_venster.sql — `plan_adempauze()` begrensde
-- niet hoe ver vooruit een pauze mocht beginnen, en `breathers` groeide daardoor
-- onbeperkt (QS8-373)
--
-- ROLLBACK-PAD:
--   Zet `plan_adempauze()` terug naar de vorm van 0207. Het is een
--   `create or replace`, dus grants en `comment on function` blijven staan.
--
--   ⚠️ Rijen die na deze migratie geweigerd zijn, komen daarmee niet terug — die
--      zijn er nooit geweest. Er valt niets te herstellen.
--
-- ---------------------------------------------------------------------------
-- Wat er niet begrensd was
-- ---------------------------------------------------------------------------
--
-- Gevonden bij QS8-369, tijdens het opstellen van het register in
-- `tests/rls/plafonddekking.test.ts` — de test die de andere kant op vraagt:
-- welke tabel kan een client laten groeien zónder dagplafond?
--
-- 📏 Gemeten: één gebruiker, één doel, 200 aanroepen van `plan_adempauze()` met
--    niet-overlappende cyclusstarts (`v_start + i * 7`):
--
--      BREATHERS NA 200 AANROEPEN: 200
--      VERSTE START: 2030-07-01
--
--    Alle 200 gingen erin, in één transactie, zonder één weigering.
--
-- De drie bestaande toetsen zijn alle drie juist en gaan alle drie over iets
-- anders:
--
--   `te_lang`        de **lengte** van één pauze (52 cycli)
--   de overlaptoets  dat er geen twee pauzes op dezelfde cyclus liggen
--   de advisory lock dat twee gelijktijdige aanroepen elkaar niet inhalen
--
-- Cyclus 1, 2, 3 … tot in het jaar 3000 overlappen elkaar niet, dus ze kwamen er
-- stuk voor stuk doorheen. Onwrikbare regel 18 in zijn gewone vorm: elk onderdeel
-- klopt en het geheel lekt.
--
-- ---------------------------------------------------------------------------
-- Het venster
-- ---------------------------------------------------------------------------
--
-- Van 52 cycli terug tot 52 cycli vooruit, op de kalender van de eigenaar.
-- Daarmee liggen er hoogstens 105 cyclusstarts binnen bereik, en omdat pauzes
-- elkaar niet mogen overlappen is dát meteen de bovengrens op het aantal pauzes
-- per doel. **Een getal dat in de code staat in plaats van in een zin.**
--
-- ⚠️ **Dezelfde breedte als `weekdoel_cyclus_klopt()` (0198), en om dezelfde
--    reden een aannemelijkheidsgrens en geen afgeleide.** Die kop schrijft het
--    zelf op: 52 is gekozen, niet berekend. Een pauze in 2030 plannen is geen
--    misbruik dat je wilt begrenzen — het is een invoer die nergens op slaat.
--
-- ⚠️ **Waarom niet een dagplafond (de vorm van 0214).** Dat zou het tempo
--    begrenzen en niet de onzin: honderd pauzes per dag tegenhouden, maar de
--    pauze in het jaar 3000 gewoon toelaten. De grens hoort te zeggen wat een
--    adempauze ís, en dan volgt de bovengrens er vanzelf uit.
--
-- ⚠️ **Op de kalender van de eigenaar en niet die van de server.** Een gebruiker
--    in Auckland zit een dag verder dan de server, en die dag zou hier een
--    willekeurige weigering worden. `eigenaarsdatum()` doet dat al voor 0198;
--    domeinregel 2.
--
-- ⚠️ **Dit doorkruist de redenering achter `te_lang` niet.** Die bestaat omdat een
--    pauze die in het verleden begint niet meer te annuleren is (zie de kop van
--    `plan_adempauze()` en `annuleer_adempauze()`). Dit venster zegt alleen dat
--    "in het verleden" niet verder terug reikt dan een jaar en "in de toekomst"
--    niet verder dan een jaar. Wie een pauze plant die hij daarna nog wil
--    annuleren, zit er ruim binnen.
--
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.plan_adempauze(p_goal_id uuid, p_starts_cycle date, p_ends_cycle date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid        uuid := auth.uid();
  v_tz         text;
  v_startdag   smallint;
  v_id         uuid;
  v_week       record;
  v_hersteld   integer := 0;
  -- Hoogstens een jaar. Zie de kop.
  c_max_cycli  constant integer := 52;
  -- Het venster waarbinnen een pauze mag *beginnen* — QS8-373, zie de kop van
  -- 0216. Zelfde breedte als `weekdoel_cyclus_klopt()` (0198) en om dezelfde
  -- reden een aannemelijkheidsgrens, geen afgeleide.
  c_venster    constant integer := 52;
  v_vandaag    date;
begin
  -- ⚠️ De NULL-controle staat vooraan en niet impliciet in een vergelijking.
  --    `x = auth.uid()` met een lege `auth.uid()` is geen bewering maar een
  --    derde antwoord dat zich als "niet waar" gedraagt — dat gaf ooit de
  --    weekpasvoorraad van elk willekeurig doel terug.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  select p.tz, p.week_start_day into v_tz, v_startdag
  from profiles p where p.id = v_uid;

  if v_tz is null then
    return jsonb_build_object('ok', false, 'reason', 'geen_profiel');
  end if;

  if not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = v_uid
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  -- Beide datums moeten cyclusstarts van déze gebruiker zijn.
  if extract(dow from p_starts_cycle)::smallint <> v_startdag
     or extract(dow from p_ends_cycle)::smallint <> v_startdag then
    return jsonb_build_object('ok', false, 'reason', 'geen_cyclusstart');
  end if;

  if p_ends_cycle < p_starts_cycle then
    return jsonb_build_object('ok', false, 'reason', 'omgekeerde_periode');
  end if;

  -- ⚠️⚠️ **Hoe ver vooruit een pauze mag beginnen, en dat stond nergens**
  --    (QS8-373). De drie bestaande toetsen zijn alle drie juist en gaan alle
  --    drie over iets anders: `te_lang` over de **lengte** van één pauze, de
  --    overlaptoets over twee pauzes op dezelfde cyclus, en de advisory lock over
  --    gelijktijdigheid. Cyclus 1, 2, 3 … tot in het jaar 3000 overlappen elkaar
  --    niet, dus ze kwamen er stuk voor stuk doorheen.
  --
  -- 📏 Gemeten: 200 aanroepen met `v_start + i * 7` gaven 200 rijen in
  --    `breathers`, in één transactie, zonder één weigering — de verste pauze
  --    begon in 2030.
  --
  -- Met dit venster liggen er hoogstens 105 cyclusstarts binnen bereik, en omdat
  -- pauzes elkaar niet mogen overlappen is dát meteen de bovengrens per doel.
  -- Een echt getal in plaats van geen.
  --
  -- ⚠️ **Op de kalender van de eigenaar en niet die van de server**, net als
  --    `weekdoel_cyclus_klopt()`. Een gebruiker in Auckland zit een dag verder
  --    dan de server, en die dag zou hier een willekeurige weigering worden.
  --
  -- ⚠️ **Dit doorkruist de redenering achter `te_lang` niet.** Die bestaat omdat
  --    een pauze die in het verleden begint niet meer te annuleren is; dit venster
  --    zegt alleen dat "in het verleden" niet verder terug reikt dan een jaar, en
  --    "in de toekomst" niet verder dan een jaar. Wie een pauze plant die hij
  --    daarna nog wil annuleren, zit er ruim binnen.
  v_vandaag := coalesce(eigenaarsdatum(v_uid), current_date);

  if p_starts_cycle < v_vandaag - (c_venster - 1) * 7
     or p_starts_cycle > v_vandaag + c_venster * 7 then
    return jsonb_build_object('ok', false, 'reason', 'buiten_venster');
  end if;

  -- ⚠️ **`niet_vooraf` is hier weg — besluit van 30-08-2026, QS8-227.** Er stond
  --    een eis dat een pauze vóór de lopende cyclus aangekondigd werd, tegen een
  --    zondagavondontsnapping: wie zijn week niet gaat halen, kondigt een pauze
  --    aan en de rollover schrijft `excused` in plaats van `missed`.
  --
  --    Dat gevaar is niet weggeredeneerd maar aanvaard. De onderbouwing én de
  --    tegenspraak staan in
  --    `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`; de korte versie is
  --    dat de reeks en het minpunt hiermee vrijwillig worden, en dat dat een
  --    keuze van de eigenaar is en geen omissie.
  --
  -- ⚠️ **`te_lang` bestaat nog, maar betekent iets anders.** De grens van twee
  --    cycli is weg; er staat er een van een jaar voor in de plaats, en om een
  --    andere reden. Zie hieronder.

  -- ⚠️ **Een jaar, en dat is een bewuste afwijking van "elke lengte".** Niet
  --    tegen misbruik — die deur staat met dit besluit open en dat is de keuze —
  --    maar omdat een pauze die in het verleden begint volgens
  --    `annuleer_adempauze()` nooit meer te annuleren is. Zonder plafond maakt
  --    één verkeerd getypt jaartal het doel permanent onbruikbaar voor elke
  --    volgende adempauze, want die overlapt er dan mee. Reden en afweging in
  --    `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md` §7.
  if p_ends_cycle > p_starts_cycle + (c_max_cycli - 1) * 7 then
    return jsonb_build_object('ok', false, 'reason', 'te_lang');
  end if;

  -- ⚠️ **Het slot vóór de controle, en niet erna.** Zonder deze regel zijn de
  --    `if exists` hieronder en de `insert` erop twee losse statements: twee
  --    gelijktijdige aanroepen zien elkaars ongecommitte rij niet en leggen
  --    allebei een adempauze neer. Gemeten met twee parallelle sessies (06-09).
  --    Het slot hangt aan het doel, dus twee verschillende doelen wachten niet
  --    op elkaar, en `xact` laat hem los bij commit én bij rollback.
  perform pg_advisory_xact_lock(hashtextextended(p_goal_id::text, 0));

  -- Geen overlap met een adempauze die er al ligt op ditzelfde doel.
  if exists (
    select 1 from breathers b
    where b.user_id = v_uid
      and b.goal_id = p_goal_id
      and b.starts_cycle <= p_ends_cycle
      and b.ends_cycle   >= p_starts_cycle
  ) then
    return jsonb_build_object('ok', false, 'reason', 'overlapt');
  end if;

  insert into breathers (user_id, goal_id, starts_cycle, ends_cycle)
  values (v_uid, p_goal_id, p_starts_cycle, p_ends_cycle)
  returning id into v_id;

  -- ⚠️ **Terugwerkende kracht — het meeste werk van QS8-227 en het makkelijkst
  --    over het hoofd te zien.** Een pauze mag nu over een week liggen die de
  --    rollover al heeft afgesloten. Die week staat dan op `missed` met een
  --    minpunt eronder, en zonder dit blok verandert er niets: het scherm zegt
  --    "je pauzeert" en de score zegt het tegendeel.
  --
  -- ⚠️ **Het minpunt wordt teruggedraaid met een correctie en niet met een
  --    delete.** Domeinregel 6 zegt dat de geschiedenis append-only is; een
  --    `cycle_missed`-rij weghalen zou precies dat breken. Er komt dus een
  --    `correction`-rij bij met de tegengestelde delta, en de oude rij blijft
  --    staan. Het saldo klopt en het spoor ook.
  --
  -- ⚠️ **Per weekdoel en niet één keer per pauze.** `points_miss` staat op het
  --    wéékdoel, dus twee weekdoelen in dezelfde cyclus dragen elk hun eigen
  --    minpunt. Eén vaste `+1` zou daar te weinig of te veel terugdraaien.
  --
  -- ⚠️ **`missed` én `carried`, en die tweede stond hier eerst niet.** De
  --    motivering luidde dat `carried` "als nieuwe rij in een latere cyclus
  --    staat en geen minpunt heeft om terug te draaien". Dat is nagemeten en het
  --    klopt niet: `schuif_weekdoel_door()` weigert alles wat niet `missed` is
  --    en zet díe rij dan op `carried`, zónder het al geboekte `cycle_missed`
  --    aan te raken. Een `carried`-rij ís dus een gemiste week mét minpunt, en
  --    `herbereken_reeks()` telt hem ook als gemist
  --    (`w.status in ('missed', 'carried')`).
  --
  --    Zonder deze status deed een adempauze over een doorgeschoven week niets
  --    en zei het scherm toch dat het gelukt was. Gevonden in de
  --    security-review van 06-09-2026.
  --
  -- ⚠️ **`cancelled` blijft er wél buiten.** Die heeft de gebruiker zelf
  --    ingetrokken; er staat geen minpunt onder en er valt niets vrij te
  --    stellen.
  for v_week in
    select w.id, w.points_miss
      from weekly_goals w
     where w.goal_id = p_goal_id
       and w.status in ('missed', 'carried')
       and w.cycle_start_date >= p_starts_cycle
       and w.cycle_start_date <= p_ends_cycle
  loop
    update weekly_goals set status = 'excused' where id = v_week.id;

    -- ⚠️ De tegengestelde delta van wat er geboekt is, en niet van wat er nú op
    --    het weekdoel staat: `points_miss` is onveranderlijk na de rollover.
    --    Alleen boeken als er werkelijk iets geboekt is — een week die al
    --    beschermd was door een weekpas draagt geen `cycle_missed`.
    insert into points_ledger (user_id, goal_id, delta, reason, ref_type, ref_id)
    select v_uid, p_goal_id, -sum(pl.delta), 'correction', 'weekly_goal', v_week.id
      from points_ledger pl
     where pl.ref_type = 'weekly_goal'
       and pl.ref_id = v_week.id
       and pl.reason = 'cycle_missed'
       -- ⚠️ De som telt op wat er voor **deze** gebruiker geboekt is, terwijl de
       --    correctie op `v_uid` landt. Vandaag onbereikbaar — `weekly_goals`
       --    heeft geen eigen `user_id` en eigendom van een doel is niet over te
       --    dragen — maar zonder deze regel is die twee-eenheid een aanname en
       --    geen voorwaarde. Uit de security-review van 06-09-2026.
       and pl.user_id = v_uid
    having sum(pl.delta) is not null and sum(pl.delta) <> 0;

    v_hersteld := v_hersteld + 1;
  end loop;

  -- ⚠️ Eén keer ná de lus. `herbereken_reeks()` leest de hele geschiedenis van
  --    dit doel, dus hem per week aanroepen is hetzelfde antwoord maal N.
  if v_hersteld > 0 then
    perform herbereken_reeks(v_uid, p_goal_id);
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'hersteld', v_hersteld);
end;
$function$

;
