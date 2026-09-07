-- 0166_adempauze_vrije_datums_en_terugwerkende_kracht.sql — de adempauze mag elke lengte hebben en ook achteraf (QS8-227)
--
-- ROLLBACK-PAD:
--   `alter table breathers add constraint breathers_hoogstens_twee_cycli
--    check (ends_cycle >= starts_cycle and ends_cycle <= starts_cycle + 7);`
--   plus `create or replace` op `plan_adempauze()` met de versie uit 0048 — die
--   draagt `te_lang`, `niet_vooraf` en geen herstelblok. ⚠️ Een terugzet laat
--   reeds herstelde weken op `excused` staan mét hun correctierij; dat is
--   geschiedenis en hoort niet teruggedraaid te worden (domeinregel 6).
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Review van 30-08-2026: bij het inplannen zijn er maar twee weken om uit te
-- kiezen, en de vraag "hoe lang?" hoort weg. De gebruiker wil vrije begin- en
-- einddatums en meerdere pauzes naast elkaar.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Wat hier bewust wordt opgegeven
-- ---------------------------------------------------------------------------
--
-- `niet_vooraf` bestond tegen een zondagavondontsnapping: wie ziet aankomen dat
-- hij zijn week niet haalt, kondigt een adempauze aan en de rollover schrijft
-- `excused` in plaats van `missed`. Dat is dezelfde ontsnapping die 0043 t/m
-- 0046 en 0066 vanuit andere hoeken hebben dichtgezet.
--
-- **Dit besluit zet er één bewust weer open.** Het is genomen door Quinten op
-- 30-08-2026, mét het tegenadvies erbij, en het gevolg is dat de reeks en het
-- minpunt vrijwillig worden. De volledige afweging inclusief de tegenspraak
-- staat in `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md`.
--
-- ⚠️ **`breathers_hele_cycli` en de weekdagtoets blijven staan**, en dat is geen
-- halfslachtigheid. Die twee zijn geen anti-misbruikregel maar een
-- correctheidsregel: de rollover werkt per cyclus, dus een pauze van woensdag
-- tot woensdag dekt twee hálve cycli en dan doet de rollover iets anders dan het
-- scherm belooft. Het scherm rondt vrije datums zichtbaar af naar hele weken.
--
-- ⚠️ **De overlapcontrole en `breathers_geen_dubbele_start` blijven ook.** Twee
-- pauzes over dezelfde week is een ongeldige toestand en geen vrijheid.
--
-- ⚠️ **En de overlapcontrole heeft er een slot bij nodig, want zonder was ze er
-- geen.** `if exists (...) then return` en de `insert` erna zijn twee losse
-- statements: in read committed zien twee gelijktijdige aanroepen elkaars
-- ongecommitte rij niet en komen ze er allebei door. Nagemeten in de
-- security-review van 06-09-2026 met twee parallelle sessies: **twee
-- overlappende adempauzes op hetzelfde doel.** `breathers_geen_dubbele_start`
-- vangt dat niet af zodra de begindatums verschillen.
--
-- Daarom een `pg_advisory_xact_lock` op het doel, vóór de controle. Geen
-- `exclude`-constraint: die vraagt `btree_gist`, en dit project draait op nul
-- extensies — een eerste extensie op de gratis tier is een grotere beslissing
-- dan deze bug rechtvaardigt. De grendel staat onder test.
--
-- ⚠️ **Er komt één grens bij die er niet stond: een jaar.** Dat is een bewuste
-- afwijking van "elke lengte" uit QS8-227 en ze staat met reden in
-- `docs/decisions/2026-09-06-de-adempauze-wordt-vrij.md` §7. De korte versie:
-- `annuleer_adempauze()` weigert alles waarvan `starts_cycle <= vandaag`, dus
-- een pauze die in het verleden begint is **nooit meer te annuleren**. Zonder
-- bovengrens is één verkeerd getypt jaartal een doel dat permanent op pauze
-- staat, zonder weg terug in de app. Gemeten in dezelfde review: `9999-12-27`
-- werd geaccepteerd, 415853 weken.
--
-- ---------------------------------------------------------------------------
-- Idempotent: een `drop constraint if exists` en `create or replace` op één
-- functie. De handtekening verandert niet.
-- ---------------------------------------------------------------------------

alter table breathers drop constraint if exists breathers_hoogstens_twee_cycli;

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
$function$;
