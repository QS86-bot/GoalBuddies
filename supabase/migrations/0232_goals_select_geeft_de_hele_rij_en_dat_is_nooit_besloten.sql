-- 0232_goals_select_geeft_de_hele_rij_en_dat_is_nooit_besloten.sql — `goals` krijgt
-- een kolomgrens voor niet-eigenaars (QS8-392 en QS8-393, één oorzaak).
--
-- ROLLBACK-PAD:
--   drop function if exists public.koppelbare_doelen(uuid);
--   drop view if exists public.mijn_doelvelden;
--   revoke select on public.goals from public, anon, authenticated;
--   grant select on public.goals to anon, authenticated;
--   -- en goal_dashboard terug naar de vorm uit 0146, dus mét
--   --   identity_statement, available_hours_per_week en max_points.
--
-- ⚠️ Deze migratie verwijdert geen gegevens en verandert geen kolom. Hij trekt
--    leesrechten in en geeft ze smaller terug; het rollback-pad zet ze terug.
--    Valt niet onder grens 2 van de beslisbevoegdheid.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- De volledige beveiligingsdoorlichting van 09-09-2026 vond twee lekken op
-- dezelfde tabel. Twee reviewers vonden de tweede onafhankelijk van elkaar; alle
-- drie de metingen hieronder zijn daarna zelf nagedaan (onwrikbare regel 19).
--
-- 📏 **Lek 1 (QS8-392) — de interviewantwoorden van de Doelcoach.** Anna en Bram
--    zitten in één **beschermde** groep, Anna's doel is gekoppeld:
--
--      BRAM via goals:          Ik ben iemand die niet meer drinkt na mijn scheiding | uren=4.0
--      BRAM via goal_dashboard: Ik ben iemand die niet meer drinkt na mijn scheiding
--      EVE (buiten de groep):   rijen=0
--
--    Boven dat invoerveld staat `coach.alleen_voor_jou`: *"Je antwoorden zijn
--    alleen voor jou en de Doelcoach. Je groep ziet ze nooit."* Die zin was
--    onwaar. Bij die vraag schrijven mensen op waar ze vandaan komen —
--    verslaving, scheiding, ziekte — en dat is een andere categorie dan een
--    gemiste week.
--
-- 📏 **Lek 2 (QS8-393) — `max_points` telt de weken mee die de policy verbergt.**
--    `weekly_goals_select` verbergt `missed`, `carried`, `cancelled` en
--    `excused` voor een niet-eigenaar; `recalc_goal_max_points()` sommeert over
--    álles behalve `excused`. `points_ceiling` staat vast op 2 en is niet
--    schrijfbaar, dus het verschil is geen vermoeden maar een exacte teller:
--
--      WERKELIJKHEID: max_points=8 | weken totaal=4   (2x missed, 1x carried, 1x todo)
--      CAROL ziet:    max_points=8 | zichtbare weken=1 | som zichtbaar=2
--                     =>  VERBORGEN WEKEN = 3
--
--    Een adempauze geeft géén gat (`excused` telt niet mee), dus het gat wijst
--    uitsluitend op tegenslag. En bij dagelijks pollen is het niet alleen
--    hoevéél maar wélke week: `max_points` beweegt niet terwijl het weekdoel uit
--    de lijst verdwijnt zodra de rollover hem op `missed` zet.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ De oorzaak is niet "iemand vergat een kolom"
-- ---------------------------------------------------------------------------
--
-- `goals_select` is **nooit als oppervlak opgeschreven**. Het register in
-- `docs/decisions/002-domeinregel7-oppervlakken.md` telt 64 oppervlakken en dit
-- is er geen van; `identity_statement` en `max_points` komen er geen van beide
-- in voor. Daardoor is de vraag die beide gevallen gevonden zou hebben nooit
-- gesteld.
--
-- 📏 Het precedent staat in de eigen code, in de typedefinitie van `Doel`
--    (`src/modules/goals/api.ts`), drie regels bóven `identity_statement`:
--
--      "Geen `risk_status` meer. Die stond tot migratie 0050 als kolom op
--       `goals`, en `goals_select` gaf elke groepsgenoot de héle rij."
--
--    Die les is in augustus op één kolom toegepast en niet op de tabel. Dit is
--    dezelfde reparatie, nu voor de rij als geheel — en met de rij in het
--    register erbij, zodat de vólgende kolom de vraag wél tegenkomt.
--
-- **De vraag die dit gevonden zou hebben, en die vanaf nu bij domeinregel 7
-- hoort:** staat er op een groepsleesbare rij een getal dat over verborgen rijen
-- rekent?
--
-- ---------------------------------------------------------------------------
-- 1. Waarom een kolomgrant en geen policy
-- ---------------------------------------------------------------------------
--
-- ⚠️ **RLS kan geen kolommen beperken.** De eis is hier "deze kolom mag je niet
--    lezen" en niet "deze rij mag je niet zien" — de rij móet zichtbaar blijven,
--    dat is de koppelfeature. CLAUDE.md: *een policy alleen is altijd te weinig.*
--
-- ⚠️⚠️ **En een `revoke select (kolom)` werkt hier níet, want het recht zit niet
--    op de kolom.** 📏 Gemeten vóór deze migratie:
--
--      relacl van goals: authenticated=rx/postgres
--
--    Dat is een **tabelbrede** SELECT. Postgres weigert dan stilzwijgend een
--    kolomgewijze intrekking ("no privileges could be revoked"). De enige vorm
--    die werkt is: het tabelrecht intrekken en per kolom teruggeven. Wie dat
--    omdraait, krijgt een migratie die groen draait en niets doet.
--
-- ⚠️ **`anon` verliest zijn SELECT hier ook**, en dat is een meeliftende
--    reparatie met een eigen reden. 📏 De doorlichting mat dat 27 tabellen een
--    geërfde `anon`-SELECT dragen die uitsluitend dicht blijft doordat er géén
--    policy voor `anon` bestaat — en dat één `create policy … using (…)` zónder
--    `TO`-clausule (de standaardvorm, die `TO PUBLIC` betekent) ze in één klap
--    opent, zonder dat één bewaking rood wordt. Dat is voor `goals` het
--    zwaarste geval van die 27. De rest staat als rij in ENGINEER-REVIEW.

revoke select on public.goals from public, anon, authenticated;

-- ⚠️ **Vijf kolommen komen niet terug, en drie ervan zijn de bevinding.**
--
--    * `identity_statement` en `available_hours_per_week` — QS8-392.
--    * `max_points` — QS8-393.
--    * `beoordelaar_weggehaald_op` — 📏 geen enkele client leest hem, en een
--      niet-lege waarde betekent *"je beoordelaar is weggehaald"*: een
--      tegenslag-signaal over een ánder op een groepsleesbare rij. Niet gemeten
--      als uitbuitbaar, wel dezelfde klasse, en een recht zonder aanroeper hoort
--      weg (de regel van 0197).
--    * `losgekoppeld_op` — 📏 ook geen lezer. Zelfvergrendelend (is het doel
--      losgekoppeld, dan geeft `shares_group_with_goal()` de rij toch al niet
--      meer terug), maar er is geen reden hem uit te delen.
--
-- ⚠️ De schrijfrechten blijven ongemoeid: `insert` en `update` op
--    `identity_statement` en `available_hours_per_week` staan als kolomgrant en
--    die zijn hier niet aangeraakt. Je mag je eigen antwoord dus schrijven; je
--    leest het terug via `mijn_doelvelden` hieronder.
grant select (
  id,
  owner_id,
  title,
  description,
  category,
  target_date,
  status,
  created_at,
  updated_at,
  ritme
) on public.goals to authenticated;

-- ---------------------------------------------------------------------------
-- 2. `goal_dashboard` verliest dezelfde drie kolommen
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **De view moet `security_invoker = true` blijven, en dat is de valstrik
--    van deze migratie.** `weekly_total` telt de weekdoelen van het doel; hij
--    klopt per kijker (📏 eigenaar 2, groepsgenoot 1) juist omdát de subquery
--    als de aanroeper draait en de RLS op `weekly_goals` dus meetelt.
--
--    Zou je hem op `security_invoker = false` zetten om de drie kolommen te
--    kunnen maskeren, dan telt `weekly_total` opeens álle weekdoelen mee — de
--    verborgen inbegrepen — en heb je **een tweede exemplaar van precies het lek
--    dat je aan het dichten was**, in een andere kolom. Vandaar dat de kolommen
--    hier weggaan in plaats van gemaskeerd te worden, en dat de eigenaar ze uit
--    een aparte view leest.
--
-- ⚠️ `create or replace view` kan geen kolom laten vallen, dus hij moet eerst
--    weg.
--
-- ⚠️⚠️ **En er hángt iets aan, wat mijn eerste versie miste.** Ik had de
--    afhankelijkheden opgezocht via `pg_rewrite` — dat vindt views die op views
--    leunen — en concludeerde dat er niets aan hing. 📏 Postgres wist het beter:
--
--      ERROR: cannot drop view goal_dashboard because other objects depend on it
--      DETAIL: function koppelbare_doelen(uuid) depends on type goal_dashboard
--
--    `koppelbare_doelen()` geeft `setof goal_dashboard` terug en hangt dus aan
--    het **rijtype** van de view, niet aan zijn definitie. Dat is een andere
--    soort afhankelijkheid dan waar ik naar keek, en de les is de omgekeerde van
--    gebruikelijk: hier ving de database een gat in mijn analyse, en dat doet hij
--    alleen omdat de migratie in één transactie draait. Met `cascade` was de
--    functie zonder een woord verdwenen.
--
--    Hij gaat er dus eerst uit en komt onderaan ongewijzigd terug. Hij is
--    `stable` en géén definer — de RLS van de aanroeper telt mee — en hij
--    filtert zelf al op `owner_id = auth.uid()`, dus hij lekt niets van de
--    kolommen die deze migratie juist afsluit.
drop function if exists public.koppelbare_doelen(uuid);
drop view if exists public.goal_dashboard;

create view public.goal_dashboard with (security_invoker = true) as
select
  g.id,
  g.owner_id,
  g.title,
  g.description,
  g.category,
  g.target_date,
  g.status,
  g.created_at,
  g.updated_at,
  (select count(*) from milestones m where m.goal_id = g.id and m.status <> 'dropped') as milestones_total,
  (select count(*) from milestones m where m.goal_id = g.id and m.status = 'done') as milestones_done,
  (select count(*) from weekly_goals w where w.goal_id = g.id) as weekly_total,
  (select count(*) from weekly_goals w where w.goal_id = g.id and w.status = 'approved') as weekly_approved,
  g.ritme
from goals g;

comment on view public.goal_dashboard is
  'Een doel met zijn tellingen, voor eigenaar en groepsgenoot. security_invoker '
  'blijft aan: daar hangt weekly_total van af (QS8-393, 0232). De prive kolommen '
  'van de eigenaar staan in mijn_doelvelden.';

-- ⚠️ Alleen `authenticated`. De view stond ook aan `anon` gegund; die kreeg er
--    niets uit (geen policy op `goals` noemt `anon`), maar een grant die niets
--    geeft hoort weg — zelfde opruiming als 0118.
revoke all on public.goal_dashboard from public, anon, authenticated;
grant select on public.goal_dashboard to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De eigenaar leest zijn eigen kolommen uit een view die alleen hem kent
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Dit is de vorm van `mijn_profiel` (0012) en niet iets nieuws.** Die view
--    bestaat sinds jaar en dag, staat op `security_invoker = false` met
--    `security_barrier = true` en een expliciete kolomlijst, en 📏 de
--    doorlichting van vandaag heeft hem nagemeten: een buitenstaander krijgt nul
--    rijen. Supabase' linter meldt zo'n view als ERROR
--    (`security_definer_view`); dat is hier een valse positief, en het "advies"
--    opvolgen breekt de feature.
--
-- ⚠️ **Definer kán hier veilig, waar het bij `goal_dashboard` niet kon**, en het
--    verschil is de `where`: deze view geeft uitsluitend rijen van de aanroeper
--    zelf terug. Er is dus geen kijker voor wie een telling anders zou moeten
--    uitvallen. Dát is waarom `max_points` hier wél mag staan.
drop view if exists public.mijn_doelvelden;

create view public.mijn_doelvelden with (security_invoker = false, security_barrier = true) as
select
  g.id,
  g.identity_statement,
  g.available_hours_per_week,
  g.max_points
from goals g
where g.owner_id = (select auth.uid());

comment on view public.mijn_doelvelden is
  'De kolommen van een doel die alleen de eigenaar mag lezen (QS8-392/QS8-393, '
  '0232). Definer met een eigen where, zoals mijn_profiel; goals zelf geeft ze '
  'sinds deze migratie aan niemand meer.';

-- ⚠️ Onwrikbare regel 4: de `revoke` noemt `authenticated` met zoveel woorden.
--    `alter default privileges` deelt élk nieuw object in `public` uit aan
--    `anon`, `authenticated` én `service_role`; `from public, anon` houdt precies
--    de rol over waaronder iedere ingelogde gebruiker draait.
revoke all on public.mijn_doelvelden from public, anon, authenticated;
grant select on public.mijn_doelvelden to authenticated;

-- ---------------------------------------------------------------------------
-- 4. `koppelbare_doelen()` terug, ongewijzigd
-- ---------------------------------------------------------------------------
--
-- ⚠️ Letterlijk het lichaam uit 0210. Hij staat hier alleen omdat hij aan het
--    rijtype van de view hangt en dus mee moest; er verandert niets aan wat hij
--    doet of aan wie hem mag aanroepen.
create or replace function public.koppelbare_doelen(p_group_id uuid)
returns setof goal_dashboard
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  select d.*
  from goal_dashboard d
  where d.owner_id = (select auth.uid())
    and d.status = 'active'
    and not exists (
      select 1 from goal_group_links l
      where l.goal_id = d.id and l.group_id = p_group_id
    )
  order by d.target_date asc, d.id asc
$$;

revoke all on function public.koppelbare_doelen(uuid) from public, anon, authenticated;
grant execute on function public.koppelbare_doelen(uuid) to authenticated;
