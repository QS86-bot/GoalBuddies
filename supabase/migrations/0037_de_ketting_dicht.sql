-- 0037_de_ketting_dicht.sql — QS8-80, reparatie van 0036
--
-- ROLLBACK-PAD:
--   -- De vorige versies staan in 0036_de_ketting_krijgt_schrijvers.sql; die
--   -- opnieuw uitvoeren zet alle drie de functies terug. Let op: dat heropent
--   -- de gaten hieronder, dus doe het alleen om een acuut defect te keren.
--   drop function if exists ketting_stand(uuid, date);
--   drop function if exists ketting_schakel(uuid, date, date);
--   drop trigger  if exists week_reviews_ketting on week_reviews;
--   drop function if exists ketting_uit_weekafsluiting();
--
-- ⚠️ Waarom deze migratie er één dag na 0036 is. De reviewketen (code-critic,
--    security-reviewer, critical-user, 19-08-2026) kwam met drie onafhankelijke
--    oordelen "blokkerend" op dezelfde migratie. Wat ze samen aantoonden:
--
--      1. Route 1 was niet strenger dan route 2 maar juist zwakker. De kop van
--         0036 beweerde het tegenovergestelde en dat was gewoon fout.
--      2. Eén ooit goedgekeurd weekdoel was oneindig herbruikbaar.
--      3. `ketting_stand()` gaf twee leden van dezelfde groep een verschillend
--         antwoord op een teller die gedeeld is.
--      4. Teller en noemer telden verschillende mensen, en de test van 0036 legde
--         die tegenstrijdigheid vast als gewenst gedrag.
--
--    Wat hier níét in zit staat onderaan: dat vraagt een wijziging aan een
--    bestaande tabel of policy en dus een besluit van Quinten.
--
-- ⚠️ 0036 wordt niet bewerkt maar overschreven. Een toegepaste migratie
--    aanpassen is de fout die besluit 003 §6 met naam noemt — dan gaat de repo
--    iets anders beweren dan er gedraaid heeft.

-- ---------------------------------------------------------------------------
-- 1. Route 1 krijgt dezelfde grens als route 2
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het gat: `week_reviews.group_period_start` is een gewone kolom zonder
--    CHECK, en `week_reviews_write` staat `for all` toe op je eigen rijen. Een
--    lid kon dus een weekafsluiting met een zelfgekozen datum wegschrijven, de
--    schakel incasseren, zijn eigen rij verwijderen en herhalen — een sluitende
--    ketting van twee jaar in een halve minuut. Schakels zijn append-only, dus
--    dat is onherstelbaar.
--
-- ⚠️ De grens staat hier in de trigger en niet als CHECK op de tabel, omdat een
--    CHECK op een bestaande tabel een datamodelwijziging is. Gevolg: een
--    backdated wéékafsluiting blijft mogelijk, maar levert geen schakel meer op.
--    De echte reparatie hoort op de tabel; zie de lijst onderaan.
--
-- ⚠️ `current_date + 1` en niet `current_date`. `current_date` is de serverdatum
--    in UTC en `groupPeriod()` rekent in de tijdzone van de groep. In
--    Europe/Amsterdam begint een periode om 00:00 lokale tijd, wat 22:00 UTC de
--    vorige dag is; in dat venster is een geldige periodestart één dag "in de
--    toekomst". Zonder deze marge weigert de ketting elke nacht twee uur lang,
--    en in Pacific/Auckland twaalf uur. Dat is het middernachtprobleem uit
--    domeinregel 2, en het is een marge en geen berekening.

create or replace function ketting_uit_weekafsluiting()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if new.group_period_start > current_date + 1
     or new.group_period_start < current_date - 35 then
    raise warning 'ketting: periode % buiten venster voor weekafsluiting %',
      new.group_period_start, new.id;
    return new;
  end if;

  begin
    insert into chain_links (group_id, user_id, group_period_start)
    values (new.group_id, new.user_id, new.group_period_start)
    on conflict on constraint chain_links_one_per_period do nothing;
  exception
    -- ⚠️ Geen lege catch meer (coderegel 14). De rechtvaardiging blijft staan:
    --    een ketting-schakel mag nooit een weekafsluiting terugdraaien. Maar
    --    `on conflict do nothing` vangt de énige verwachte fout al af, dus alles
    --    wat hier belandt is per definitie iets wat je wilt weten. Dit project
    --    heeft een hele epic lang niet gemerkt dat er níéts naar deze tabel
    --    schreef; een stille handler bouwt precies die blindheid opnieuw in.
    --
    -- ⚠️ Nooit `did_text` of `blocked_text` in de melding. Dat is de enige plek
    --    in het model waar iemands tegenslag letterlijk staat, en databaselogs
    --    zijn geen privéruimte.
    when others then
      raise warning 'ketting: schakel mislukt voor weekafsluiting % (%): %',
        new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

comment on function ketting_uit_weekafsluiting() is
  'Schrijft de ketting-schakel bij een weekafsluiting, binnen hetzelfde venster '
  'dat ketting_schakel() hanteert. Meldt een mislukte schakel als warning en '
  'laat de weekafsluiting altijd staan.';

revoke all on function ketting_uit_weekafsluiting() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Route 2: één goedgekeurde cyclus is niet langer oneindig herbruikbaar
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het gat: `p_cycle_start` had helemaal geen grens. Wie in maart één weekdoel
--    goedgekeurd kreeg, kon in augustus elke week een schakel ophalen met die
--    maartse cyclus — de ketting bewees dan niet dat iemand opdaagt, maar dat
--    hij ooit is opgedaagd. Binnen het venster leverde één doel bovendien tot
--    36 schakels op, want `p_period_start` hoeft niet op een periodegrens te
--    liggen.
--
-- ⚠️ De reparatie is een vergelijking tussen twee waarden die de client zelf
--    meegeeft, en dus geen cyclusberekening: de opgegeven groepsperiode moet
--    binnen een week van de opgegeven persoonlijke cyclus liggen. Een periode
--    duurt zeven dagen, dus dit laat precies de overlap toe die echt bestaat.
--    Volledig sluitend wordt het pas met een kolom op `chain_links` die
--    vastlegt wélke cyclus de schakel verdiend heeft; zie de lijst onderaan.
--
-- ⚠️ `g.status = 'active'` erbij: een gearchiveerd of afgerond doel leverde
--    tot nu toe gewoon schakels.

create or replace function ketting_schakel(
  p_group_id     uuid,
  p_period_start date,
  p_cycle_start  date
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  geschreven integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  if not is_group_member(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;

  if p_period_start > current_date + 1 or p_period_start < current_date - 35 then
    return jsonb_build_object('ok', false, 'reason', 'period_out_of_range');
  end if;

  if p_period_start not between p_cycle_start - 7 and p_cycle_start + 7 then
    return jsonb_build_object('ok', false, 'reason', 'cycle_period_mismatch');
  end if;

  if not exists (
    select 1
    from weekly_goals     w
    join goals            g on g.id = w.goal_id
    join goal_group_links l on l.goal_id = g.id
    where g.owner_id         = auth.uid()
      and g.status           = 'active'
      and l.group_id         = p_group_id
      and w.cycle_start_date = p_cycle_start
      and w.status           = 'approved'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_approved_goal');
  end if;

  insert into chain_links (group_id, user_id, group_period_start)
  values (p_group_id, auth.uid(), p_period_start)
  on conflict on constraint chain_links_one_per_period do nothing;

  get diagnostics geschreven = row_count;

  return jsonb_build_object('ok', true, 'created', geschreven > 0);
end;
$$;

comment on function ketting_schakel(uuid, date, date) is
  'Verdient een ketting-schakel met een goedgekeurd weekdoel — QS8-80. De '
  'opgegeven groepsperiode moet binnen een week van de opgegeven cyclus liggen; '
  'beide komen van shared/time en SQL rekent hier niets uit.';

revoke all on function ketting_schakel(uuid, date, date) from public, anon;
grant execute on function ketting_schakel(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De stand geeft iedereen hetzelfde antwoord
-- ---------------------------------------------------------------------------
--
-- ⚠️ Drie fouten in één functie, en de eerste is de vervelendste. `ketting_stand`
--    was SECURITY INVOKER, terwijl `breathers_select` andermans adempauze alleen
--    toont als het doel een groep met je deelt. Twee leden van dezelfde groep
--    kregen daardoor een verschillende `in_aanmerking` terug — op een teller die
--    per definitie gedeeld is. Nu SECURITY DEFINER met een expliciete
--    lidmaatschapstoets: dezelfde vraag geeft voor iedereen hetzelfde antwoord,
--    en een buitenstaander krijgt nog steeds niets.
--
-- ⚠️ Teller en noemer telden verschillende mensen: de teller alle rijen van de
--    periode, de noemer alleen actieve leden. Dat kon "3 van 2 — voltallig"
--    opleveren, en de test van 0036 legde dat vast als gewenst gedrag. Beide
--    tellen nu dezelfde verzameling. De schakels van vertrokken of uitgezette
--    leden blijven in de tabel staan (domeinregel 6, criterium 5); ze tellen
--    alleen niet mee in de stand van deze periode.
--
-- ⚠️ De adempauze-toets keek naar élk doel van een lid. Een pauze op je
--    gitaardoel haalde je uit de noemer van je hardloopgroep. Nu beperkt tot
--    doelen die via `goal_group_links` aan déze groep hangen.
--
-- ⚠️ `status = 'paused'` telt nu mee als "niet in aanmerking". Er waren twee
--    manieren om te pauzeren en de functie honoreerde de verkeerde.
--
-- ⚠️ Eén CTE in plaats van vier scalaire subqueries. De noemerdefinitie stond
--    twee keer, al met verschillende opmaak; wie er over een jaar één van
--    aanpast krijgt een antwoord dat zichzelf tegenspreekt, en dat faalt niet
--    luid.

create or replace function ketting_stand(
  p_group_id     uuid,
  p_period_start date
)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with in_aanmerking as (
    select m.user_id
    from group_members m
    where m.group_id = p_group_id
      and m.status not in ('inactive', 'paused')
      and not exists (
        select 1
        from breathers        b
        join goals            g on g.id = b.goal_id
        join goal_group_links l on l.goal_id = g.id
        where b.user_id  = m.user_id
          and l.group_id = p_group_id
          and current_date between b.starts_cycle and b.ends_cycle
      )
  ),
  schakels as (
    select count(*) as aantal
    from chain_links c
    join in_aanmerking a on a.user_id = c.user_id
    where c.group_id = p_group_id
      and c.group_period_start = p_period_start
  )
  select jsonb_build_object(
    'schakels',      (select aantal from schakels),
    'in_aanmerking', (select count(*) from in_aanmerking),
    'voltallig',     (select aantal from schakels) >= greatest((select count(*) from in_aanmerking), 1)
  )
  where is_group_member(p_group_id);
$$;

comment on function ketting_stand(uuid, date) is
  'De stand van De Ketting in één periode — QS8-80. Twee getallen en een vlag, '
  'nooit wie ontbreekt (domeinregel 7). SECURITY DEFINER met een expliciete '
  'lidmaatschapstoets, zodat elk lid hetzelfde getal ziet; als INVOKER hing de '
  'noemer af van wiens adempauzes de aanroeper mag zien.';

revoke all on function ketting_stand(uuid, date) from public, anon;
grant execute on function ketting_stand(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Wat hier bewust NIET in zit
-- ---------------------------------------------------------------------------
--
-- Deze vier vragen een wijziging aan een bestaande tabel, policy of functie en
-- staan daarmee op de lijst "Wat je NOOIT doet zonder te vragen" in CLAUDE.md.
-- Ze zijn alle vier voorgelegd aan Quinten op 19-08-2026 en staan in
-- `docs/ENGINEER-REVIEW.md`:
--
--   a. `chain_links_select` geeft elk lid élke rij, met naam en periode. Voor een
--      afgesloten periode is een ontbrekende rij het bewijs van een gemiste week.
--      Dit is het lek; de rest is fraudebestrijding.
--   b. `group_overview()` accepteert elke `p_period_start` en geeft
--      `closed_this_period` per lid — hetzelfde raster, nettere verpakking.
--      Bestond al vóór De Ketting.
--   c. Een CHECK op `week_reviews.group_period_start`, zodat een backdated
--      weekafsluiting niet alleen geen schakel oplevert maar niet bestaat.
--   d. Een kolom op `chain_links` die vastlegt wélke cyclus de schakel verdiend
--      heeft, met een partiële unieke index. Pas dan levert één goedgekeurde
--      cyclus gegarandeerd één schakel op.
