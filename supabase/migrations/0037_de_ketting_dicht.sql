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
--   drop trigger  if exists week_reviews_periode_grens on week_reviews;
--   drop function if exists bewaak_week_review_periode();
--   drop policy   if exists chain_links_update on chain_links;
--   drop policy   if exists chain_links_delete on chain_links;
--   -- en het herstel van de twee bestaande objecten:
--   --   chain_links_select terug naar `using (is_group_member(group_id))` (0003)
--   --   group_overview() terug naar de versie zonder venster (0019)
--   -- De kolom `earned_cycle_start` en de index blijven staan: een kolom laten
--   -- vallen wist geschiedenis, en dat mag niet (domeinregel 6).
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
--    De vier reparaties die een bestaande tabel, policy of functie raken, staan
--    in secties 4 tot en met 7. Quinten heeft ze op 19-08-2026 alle vier
--    goedgekeurd; zonder dat akkoord had deze migratie alleen secties 1 tot 3.
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

  -- ⚠️ De sluitende variant van de ±7-dagengrens hierboven: dezelfde cyclus
  --    levert hoogstens één schakel op, ongeacht welke periode de client noemt.
  --    De partiële unieke index in sectie 8 dwingt het af; deze toets bestaat om
  --    een bruikbare reden terug te geven in plaats van een stille `do nothing`.
  if exists (
    select 1 from chain_links c
    where c.group_id           = p_group_id
      and c.user_id            = auth.uid()
      and c.earned_cycle_start = p_cycle_start
      and c.group_period_start <> p_period_start
  ) then
    return jsonb_build_object('ok', false, 'reason', 'cycle_already_used');
  end if;

  -- ⚠️ `on conflict do nothing` zonder doel: er zijn nu twee unieke beperkingen
  --    op deze tabel (per periode én per cyclus) en een insert kan op allebei
  --    stuklopen. Met een expliciet doel zou de tweede alsnog gooien.
  insert into chain_links (group_id, user_id, group_period_start, earned_cycle_start)
  values (p_group_id, auth.uid(), p_period_start, p_cycle_start)
  on conflict do nothing;

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
-- 4. `chain_links` onthoudt wélke cyclus de schakel verdiend heeft
-- ---------------------------------------------------------------------------
--
-- ⚠️ Akkoord van Quinten, 19-08-2026. Zonder deze kolom is de ±7-dagengrens uit
--    sectie 2 krap maar niet sluitend: één goedgekeurde cyclus kan dan nog twee
--    periodes raken. Met de partiële unieke index kan dat niet meer.
--
-- ⚠️ Bestaande rijen krijgen NULL, en dat is de bedoeling: een schakel uit route
--    1 (de weekafsluiting) is niet aan een cyclus verdiend en hoort buiten deze
--    index te vallen. Vandaar `where earned_cycle_start is not null`.
--
-- ⚠️ De kolom wordt hier toegevoegd terwijl `ketting_schakel()` hierboven er al
--    naar verwijst. Dat mag: een plpgsql-body wordt pas bij uitvoering gebonden,
--    en deze migratie draait als één transactie.

alter table chain_links add column if not exists earned_cycle_start date;

comment on column chain_links.earned_cycle_start is
  'De persoonlijke cyclus waarmee deze schakel verdiend is, of NULL bij een '
  'schakel uit de weekafsluiting. Zorgt via de partiele unieke index dat een '
  'goedgekeurde cyclus hoogstens een schakel oplevert.';

create unique index if not exists chain_links_one_per_cycle
  on chain_links (group_id, user_id, earned_cycle_start)
  where earned_cycle_start is not null;

-- ---------------------------------------------------------------------------
-- 5. Een weekafsluiting kan niet meer in een willekeurige week staan
-- ---------------------------------------------------------------------------
--
-- ⚠️ Akkoord van Quinten was voor een CHECK; het is een trigger geworden en dat
--    is geen slordigheid. PostgreSQL accepteert `current_date` in een CHECK — ik
--    heb het uitgeprobeerd — maar de constraint is dan niet immutable: bij een
--    restore van een dump van vandaag falen over veertig dagen precies de rijen
--    die toen geldig waren. In een project zonder automatische backups, waar de
--    dump het enige vangnet is, is een constraint die restores breekt erger dan
--    het gat dat hij dicht. Een BEFORE-trigger geeft dezelfde bescherming en
--    raakt de restore niet.
--
-- ⚠️ Deze trigger gooit wél een exception, anders dan alles in 0036. Valkuil 8
--    gaat over een SECURITY DEFINER-RPC die iets wil ónthouden; hier is weigeren
--    de hele opdracht en valt er niets te bewaren.
--
-- ⚠️ Vooraf gecontroleerd: nul bestaande rijen vallen buiten dit venster, dus
--    deze trigger breekt geen bestaande gegevens.

create or replace function bewaak_week_review_periode()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.group_period_start > current_date + 1
     or new.group_period_start < current_date - 35 then
    raise exception 'group_period_start % ligt buiten het toegestane venster',
      new.group_period_start
      using errcode = '22007';
  end if;

  return new;
end;
$$;

comment on function bewaak_week_review_periode() is
  'Houdt group_period_start binnen hetzelfde venster dat De Ketting hanteert. '
  'Een trigger en geen CHECK, omdat een CHECK met current_date niet immutable '
  'is en daarmee een restore van een oudere dump breekt.';

revoke all on function bewaak_week_review_periode() from public, anon, authenticated;

drop trigger if exists week_reviews_periode_grens on week_reviews;
create trigger week_reviews_periode_grens
  before insert or update on week_reviews
  for each row execute function bewaak_week_review_periode();

-- ---------------------------------------------------------------------------
-- 6. Het lek: `chain_links` gaf de hele aanwezigheidsmatrix prijs
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is de belangrijkste regel van deze migratie. `chain_links_select` was
--    `using (is_group_member(group_id))` zonder periodegrens. Zolang de tabel
--    leeg was, was dat theorie; 0036 vulde hem. Eén verzoek buiten de UI om gaf
--    per lid de lijst periodes waarin hij opdaagde — en het complement daarvan
--    is de lijst gemiste weken, met naam en datum.
--
-- ⚠️ Waarom een venster van 8 dagen. Een lopende periode is hoogstens zeven
--    dagen oud, plus één dag speling voor het verschil tussen de serverdatum in
--    UTC en de tijdzone van de groep. Binnen de lopende periode betekent een
--    ontbrekende schakel "nog niet"; zodra de periode gesloten is, betekent hij
--    "gemist" — en dat is precies wat domeinregel 7 verbiedt.
--
-- ⚠️ Je eigen schakels blijven altijd zichtbaar, ook oude. Je eigen
--    geschiedenis is van jou: domeinregel 7 zegt dat eigen tegenvallers privé
--    zichtbaar zijn voor jezelf.
--
-- ⚠️ Historische schakels blijven staan (domeinregel 6, append-only). Ze
--    verlaten alleen de database niet meer per persoon. Wil de groep ooit een
--    historische ketting zien, dan gaat dat via een SECURITY DEFINER-functie die
--    uitsluitend aantallen per periode teruggeeft, zoals `ketting_stand()`.

drop policy if exists chain_links_select on chain_links;
create policy chain_links_select on chain_links for select to authenticated
  using (
    user_id = auth.uid()
    or (is_group_member(group_id) and group_period_start >= current_date - 8)
  );

-- ⚠️ Expliciet geweigerd in plaats van weggelaten. RLS weigert een ontbrekende
--    policy al, maar in de SQL is "bewust dicht" dan niet te onderscheiden van
--    "vergeten" — en domeinregel 6 (append-only) hangt hier juist aan.
drop policy if exists chain_links_update on chain_links;
create policy chain_links_update on chain_links for update to authenticated
  using (false);

drop policy if exists chain_links_delete on chain_links;
create policy chain_links_delete on chain_links for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- 7. `group_overview()` lekte hetzelfde raster, netter verpakt
-- ---------------------------------------------------------------------------
--
-- ⚠️ `p_period_start` was een vrije parameter: een lus over vijftig weken gaf
--    `closed_this_period` per lid over die vijftig weken. Dat lek bestond al
--    vóór De Ketting en staat los van QS8-80.
--
-- ⚠️ De functie is verder ongewijzigd overgenomen uit de live-definitie
--    (`pg_get_functiondef`, 19-08-2026) en niet uit een migratiebestand — repo
--    en platform kunnen uit elkaar lopen (besluit 003) en dan zou ik een oudere
--    versie terugzetten. Alleen het `exists`-blok heeft een venster gekregen.
--
-- ⚠️ Buiten het venster geeft de kolom `false` en geen fout. `false` betekent in
--    deze kolom altijd "nog niet", en dat is de veilige uitkomst; een exception
--    zou het groepsoverzicht laten crashen op een datum die de client zelf koos.

create or replace function group_overview(
  p_group_id uuid,
  p_period_start date,
  p_limit integer default 20,
  p_offset integer default 0
)
  returns table (
    user_id            uuid,
    display_name       text,
    avatar_url         text,
    role               text,
    member_status      text,
    joined_at          timestamptz,
    goal_id            uuid,
    goal_title         text,
    goal_target_date   date,
    milestones_total   bigint,
    milestones_done    bigint,
    current_streak     integer,
    closed_this_period boolean,
    total_members      bigint
  )
  language sql
  stable
  set search_path = public, pg_temp
as $$
  select
    m.user_id,
    p.display_name,
    p.avatar_url,
    m.role,
    m.status,
    m.joined_at,
    d.id,
    d.title,
    d.target_date,
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status <> 'dropped'
    ), 0),
    coalesce((
      select count(*) from milestones ms
      where ms.goal_id = d.id and ms.status = 'done'
    ), 0),
    s.current_streak,
    (
      p_period_start >= current_date - 8
      and p_period_start <= current_date + 1
      and exists (
        select 1 from chain_links c
        where c.group_id = m.group_id
          and c.user_id = m.user_id
          and c.group_period_start = p_period_start
      )
    ),
    count(*) over ()
  from group_members m
  join profiles p on p.id = m.user_id
  left join lateral (
    select gg.id, gg.title, gg.target_date
    from goals gg
    join goal_group_links l on l.goal_id = gg.id
    where l.group_id = m.group_id
      and gg.owner_id = m.user_id
      and gg.status = 'active'
    order by gg.target_date asc
    limit 1
  ) d on true
  left join group_visible_streaks s
    on s.user_id = m.user_id and s.goal_id = d.id
  where m.group_id = p_group_id
  order by m.joined_at asc, m.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function group_overview(uuid, date, integer, integer) is
  'Het groepsoverzicht. closed_this_period is alleen betekenisvol binnen de '
  'lopende periode; daarbuiten altijd false, zodat een lus over oude periodes '
  'niemands aanwezigheidsgeschiedenis prijsgeeft (domeinregel 7).';
