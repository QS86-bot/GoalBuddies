-- 0151_reeksen_van_een_groep_zonder_de_hele_tabel.sql — group_overview() leest de
-- reeksen van de groep via een functie mét groepsparameter, zodat de
-- autorisatietoets één keer draait in plaats van één keer per rij van
-- `user_streaks`.
--
-- ROLLBACK-PAD:
--   -- group_overview terug naar de vorm van 0120 (join op de view):
--   --   voer het CREATE OR REPLACE-blok voor `public.group_overview` uit
--   --   0120_de_ketting_leest_de_klok_van_de_groep.sql opnieuw uit.
--   --   ⚠️ 0120 en niet 0116: 0116 is de vórige vorm en rekent nog in UTC.
--   drop function if exists public.zichtbare_reeksen_van_groep(uuid);
--
--   ⚠️ In die volgorde: eerst `group_overview` terug, dan pas de functie weg.
--      Andersom staat er een moment lang een `group_overview` die naar een
--      functie wijst die niet meer bestaat.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Lokale stack, één groep van 10 leden, `track_functions = 'all'`, één aanroep
-- van `group_overview()` als gewoon lid. De ruis zijn reeksen van andere
-- gebruikers met andere doelen die níet aan deze groep hangen:
--
--   | reeksen in user_streaks | definer-executies | shares_group_with_goal |
--   | --                      | --                | --                     |
--   | 310                     | 3384              | 3109                   |
--   | 910                     | 9384              | 9109                   |
--
-- 3109 = 10 × 310 + 9, en 9109 = 10 × 910 + 9. De kosten zijn dus het aantal
-- léden van de groep maal het aantal rijen in de héle tabel — niet de een of de
-- ander maar het product, bij een ongewijzigde paginagrootte.
--
-- ⚠️ **De oorzaak is niet de functie maar de vorm van de join.**
--    `group_visible_streaks` staat op `security_barrier = true`. De barrière is
--    een subquery-grens: de view moet zijn eigen `where shares_group_with_goal()`
--    volledig afgewerkt hebben voordat de buitenkant zijn join-conditie
--    `s.goal_id = d.id` mag toepassen. Bij een `left join` met de view aan de
--    nullable kant kan dat sowieso niet anders. De functie draait dus één keer
--    per rij van `user_streaks`, ongeacht de groep.
--
-- ⚠️ **Vier reparaties zijn gemeten; drie werken niet.** Ze staan hier omdat een
--    volgende lezer ze anders opnieuw bedenkt:
--
--   | Vorm                                          | executies bij 910 rijen |
--   | --                                            | --                      |
--   | huidig — `left join` op de view               | 9384                    |
--   | `left join lateral` op de view                | 9384                    |
--   | huidig + `shares_group_with_goal` LEAKPROOF   | 9384                    |
--   | LATERAL + LEAKPROOF                           | 9384                    |
--   | de view vervangen door een groepsfunctie      | **133**                 |
--
--    `leakproof` was de goedkoopste én de gevaarlijkste kandidaat — het is een
--    beveiligingsbewering en geen optimalisatie. Hij is nu gemeten en verandert
--    **precies nul executies**, alleen en in combinatie met LATERAL.
--    **De blokkade is de subquery-grens, niet de lekbaarheid van de qual**, en
--    dat scheelt een security-discussie die nergens toe zou leiden.
--
-- Na deze migratie: **133 executies bij 310 rijen en 133 bij 910.** Vlak.
--
-- ⚠️ Tien daarvan zijn `shares_group_with_goal()` — één per doel ván de groep.
--    Die staan er met opzet; zie sectie 1.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Twee plekken, één regel — en waarom dat hier geen 0032/0034 is
-- ---------------------------------------------------------------------------
--
-- `group_visible_streaks` blijft bestaan. Hij is niet alleen een hulpje van
-- `group_overview`: `authenticated` heeft er SELECT op en de RLS-suite bevraagt
-- hem rechtstreeks via PostgREST (`policies`, `epic13`, `ontdekken`). Hem
-- opheffen zou een API-oppervlak weghalen dat onder test staat.
--
-- Daarmee staat de maskering van A41 op twee plekken, en dat is de vorm van de
-- duurste fout die dit project kent. De grendel is hier **geen gedeelde
-- hulpfunctie** — die zou per rij een extra definer-aanroep kosten en de winst
-- deels opeten — maar een test die de twee paden op dezelfde opstelling naast
-- elkaar legt, in béide richtingen, mét de gevallen waar ze uiteen kúnnen lopen:
-- een open groep, een doel dat in een open én een beschermde groep hangt, een
-- eigenaar die in déze groep inactief is maar in een tweede gedeelde groep nog
-- actief, en een gearchiveerde groep. Zie
-- `tests/rls/reeksen-van-een-groep.test.ts`.
--
-- ⚠️ **Het gearchiveerde geval zit achter twee onafhankelijke sloten en dat is
--    gemeten, niet aangenomen.** `shares_group_with_goal()` toetst
--    `gr.status <> 'archived'` zelf, en de `exists` hieronder doet het nog eens
--    voor `p_group_id`. Elk van de twee alléén weghalen laat alle elf tests
--    groen; pas als ze allebéi weg zijn wordt de gearchiveerde test rood. Dat is
--    geen gat in die test maar twee grendels die elkaar dekken — wie er ooit één
--    weghaalt omdat hij overbodig lijkt, haalt de andere niet ook weg.
--
-- ⚠️ **0078 heeft deze vorm expliciet afgewogen en afgewezen, en dat argument is
--    hier gewogen en niet vergeten.** De kop van 0078 zegt: *"een functie in
--    plaats van een view verliest de eigenschap waar 0019 om draaide: een kolom
--    die er niet is, kan niet lekken. Een functie mét de kolom in zijn
--    returntype lekt zodra iemand de `case` verkeerd schrijft."* Dat klopt nog
--    steeds. Wat er sindsdien bij is gekomen is een test die de `case` per tak
--    vastpint, met de hand rood gemaakt — en de afweging is nu een andere: de
--    view kost bij 910 rijen 9384 definer-executies per groepsoverzicht, en dat
--    weegt zwaarder dan een kolomlijst die één test verderop toch bewaakt wordt.
--    ⚠️ `total_points` staat daarom niet in het returntype én er staat een test
--    op dat hij er niet in kruipt (besluit A42).
--
-- ⚠️ **De maskering is letterlijk overgenomen, inclusief een eigenaardigheid.**
--    `deelt_open_groep_met_doel(d.id)` vraagt of de kijker een ópen groep deelt
--    met dit doel — welke dan ook, niet per se de groep die hij bekijkt. Een doel
--    dat in een open én een beschermde groep hangt, toont zijn `best_streak` dus
--    ook in de beschermde groep. Dat is bestaand gedrag, het is geen nieuw lek
--    (de kijker ziet die reeks via de open groep toch al), en het veranderen zou
--    scope-verbreding in een performance-migratie zijn. Het is als losse
--    bevinding opgeschreven in `docs/ENGINEER-REVIEW.md`.

-- ⚠️ **In één transactie**, zoals 0078, 0102 en 0141. Deze migratie vervangt een
--    functie én de aanroeper ervan; halverwege stoppen laat een `group_overview`
--    achter die naar iets wijst dat er nog niet is — precies de volgorde waar het
--    rollback-pad hierboven over waarschuwt.

begin;

-- ---------------------------------------------------------------------------
-- 1. De reeksen van één groep, met de toets één keer
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Waarom dit `security definer` is en moet zijn.** De functie leest
--    `user_streaks`, waar de kijker geen recht op heeft — precies de reden dat
--    `group_visible_streaks` bestaat. De autorisatie zit daarom in de `exists`
--    hieronder en nergens anders: die eist dat de kijker een levend, actief
--    lidmaatschap van déze groep heeft. Zonder die `exists` zou iedere
--    ingelogde gebruiker de reeksen van elke groep kunnen opvragen.
--
-- ⚠️ **De rijen zijn per constructie tot de groep beperkt** — `l.group_id =
--    p_group_id` — en de eigenaar moet er zelf ook nog actief lid van zijn
--    (`join group_members o`). Dat is dezelfde eis die
--    `shares_group_with_goal()` per doel stelt, maar dan één keer voor de hele
--    groep gesteld in plaats van 9109 keer.

create or replace function public.zichtbare_reeksen_van_groep(p_group_id uuid)
returns table (
  user_id uuid,
  goal_id uuid,
  current_streak integer,
  best_streak integer,
  last_cycle_start date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.user_id,
    s.goal_id,
    s.current_streak,
    -- ⚠️ Letterlijk de maskering van 0078. Zie de kop van deze migratie voor
    --    waarom hij hier staat en niet in een gedeelde hulpfunctie.
    case when d.owner_id = auth.uid() or deelt_open_groep_met_doel(d.id)
         then s.best_streak end,
    case when d.owner_id = auth.uid() or deelt_open_groep_met_doel(d.id)
         then s.last_cycle_start end
  from goal_group_links l
  join goals        d on d.id      = l.goal_id
  join user_streaks s on s.goal_id = d.id
                     and s.user_id = d.owner_id
  where l.group_id = p_group_id
    -- ⚠️ **Dezelfde rijfilter als de view, letterlijk, en dat is de hele reden
    --    dat hier een functieaanroep staat waar een join goedkoper zou zijn.**
    --    Een `join group_members o ... and o.status <> 'inactive'` op déze groep
    --    ligt voor de hand en is strénger: hij laat een lid weg dat hier
    --    inactief is maar wiens doel via een ándere gedeelde groep nog wél
    --    zichtbaar is. Dat is een gedragsverandering in het scherm dat elk
    --    groepslid opent, in een migratie die er geen hoort te hebben — en het
    --    zou de twee paden uit elkaar laten lopen zonder dat iemand daarover
    --    besloten heeft.
    --
    --    Zo blijft de gelijkheid met de view een eigenschap van de constructie
    --    en niet iets wat de test toevallig niet raakt. De kosten zijn één
    --    aanroep per doel ván de groep — begrensd door de groepsgrootte, waar de
    --    view er 9109 deed over de hele tabel.
    and shares_group_with_goal(d.id)
    -- De autorisatie van deze definer-functie zelf: de aanroeper moet lid zijn
    -- van de groep die hij opvraagt. `shares_group_with_goal()` hierboven toetst
    -- of hij een lévende groep met het doel deelt — niet of dat déze groep is.
    and exists (
      select 1
      from group_members m
      join groups gr on gr.id = m.group_id
      where m.group_id = p_group_id
        and m.user_id  = auth.uid()
        and m.status  <> 'inactive'
        and gr.status <> 'archived'
    );
$$;

-- ⚠️ **Geen `p_limit`/`p_offset`, en dat is een bewuste afwijking van onwrikbare
--    regel 10 met een grens erbij.** De functie geeft elke reeks van één groep.
--    `join_group_with_code()` (0016) laat een groep niet boven **twaalf actieve
--    leden** komen, dus de uitvoer is begrensd — maar door een functie en niet
--    door een constraint, en `group_members` kent geen CHECK die het afdwingt.
--    Pagineren zou hier bovendien niet helpen waar het pijn doet: `group_overview`
--    heeft de reeks nodig van precies díe leden die zijn eigen `limit` overleven,
--    en een tweede limiet binnenin zou daar rijen onder wegtrekken.
--    **Wordt zwaarder als:** het ledenmaximum omhooggaat of langs een ander pad
--    dan `join_group_with_code()` te omzeilen is — dan hoort hier een limiet, of
--    hoort het maximum een constraint te worden.

comment on function public.zichtbare_reeksen_van_groep(uuid) is
  'De reeksen van één groep, met dezelfde maskering als `group_visible_streaks` '
  '(besluit A41): `current_streak` voor elk lid, `best_streak` en '
  '`last_cycle_start` alleen voor de eigenaar zelf en voor een lid van een open '
  'groep. Bestaat naast die view omdat de view op `security_barrier` staat en '
  'zijn `where` dus per rij van de héle `user_streaks` draait — zie 0151. '
  'De twee paden staan naast elkaar onder test in reeksen-van-een-groep.test.ts.';

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` elke nieuwe functie uit aan alle drie; wie
--    `authenticated` niet noemt, houdt precies de rol over waaronder iedere
--    ingelogde gebruiker draait. Zie
--    docs/decisions/2026-08-28-revoke-from-public-is-niet-van-iedereen.md.
revoke all on function public.zichtbare_reeksen_van_groep(uuid) from public, anon, authenticated;
grant execute on function public.zichtbare_reeksen_van_groep(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1b. Wie leest de barrière-view nog?
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De belofte van deze migratie is prestatie, en zonder deze functie bewaakt
--    niets hem.** Zet iemand `left join group_visible_streaks s` terug in
--    `group_overview()`, dan blijft élke test in
--    `reeksen-van-een-groep.test.ts` groen — die bewaken juist dat de twee paden
--    hetzelfde geven, en dat blijft na zo'n terugzetting waar. De gelijkheid is
--    getoetst en de réden niet: regel 18 vraag 3.
--
-- ⚠️ **Waarom een lijst van lezers en niet een toets op `group_overview` alleen.**
--    De kostenvorm zit in de view en niet in zijn aanroeper: elke functie die
--    `group_visible_streaks` in een join gebruikt, draait
--    `shares_group_with_goal()` per rij van de héle `user_streaks`. Een controle
--    die één functienaam noemt, laat de tweede door — en dat is precies hoe deze
--    kostenpost er de eerste keer in kwam.
--
--    De view zelf blijft bestaan en blijft rechtstreeks leesbaar voor
--    `authenticated`; dáár is hij een API-oppervlak en geen join.

create or replace function public.barrierelezers()
  returns table (naam text, bezwaar text)
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select p.proname::text,
         'leest group_visible_streaks; die view staat op security_barrier en '
         'draait zijn where per rij van de hele user_streaks — zie 0151'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc like '%group_visible_streaks%'
    and p.proname <> 'barrierelezers'
  order by 1;
$$;

comment on function public.barrierelezers() is
  'Welke functies lezen `group_visible_streaks`? Hoort leeg te zijn sinds 0151. '
  'Bewaakt de reden van die migratie, niet zijn uitkomst: de gelijkheidstests '
  'blijven groen als iemand de join terugzet.';

revoke all on function public.barrierelezers() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. group_overview() gebruikt hem
-- ---------------------------------------------------------------------------
--
-- ⚠️ `create or replace` mag hier: het returntype verandert niet ten opzichte
--    van 0116. Alleen de bron van `s` verandert.
--
-- ⚠️ De rest van de body is letterlijk die van **0120**. Dat is met opzet: een
--    prestatiemigratie die en passant de kettinglogica herschrijft, is een
--    migratie waarvan niemand meer kan zeggen wat de winst was.
--
-- ⚠️ **0120 en niet 0116, en dat ging hier eerst mis.** De eerste versie van deze
--    migratie nam de body over uit 0116 — het laatste bestand dat
--    `create or replace function public.group_overview` in kléine letters
--    schrijft. 0120 schrijft hem in hoofdletters, want die body is geplakt uit
--    `pg_get_functiondef()`, en een grep op de kleine vorm loopt er langs.
--    Daarmee stond de tijdzonereparatie van 0120 stilzwijgend teruggedraaid:
--    `groepsdatum(m.group_id)` was weer `current_date`, precies de fout die dat
--    bestand dichtte.
--
--    `klokgrens:controle` ving het in de poort, op de twee regels waar het
--    misging. **De les is niet "kijk beter" maar: de laatste vorm van een functie
--    vind je niet met een grep op hoe jíj hem zou schrijven.**
--    `pg_get_functiondef()` is de waarheid — CLAUDE.md zegt dat over
--    reviewbevindingen, en het geldt net zo goed wanneer je zelf een body
--    overneemt.

CREATE OR REPLACE FUNCTION public.group_overview(p_group_id uuid, p_period_start date, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, member_status text, joined_at timestamp with time zone, goal_id uuid, goal_title text, goal_target_date date, milestones_total bigint, milestones_done bigint, current_streak integer, best_streak integer, last_cycle_start date, closed_this_period boolean, total_members bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    s.best_streak,
    s.last_cycle_start,
    -- ⚠️ `coalesce(..., false)` om de venstertoets heen: valt hij ooit op `null`
    --    uit, dan is dat een weigering en geen antwoord. Zonder die coalesce
    --    zou `not null` weer `null` geven en viel het geval door naar de `else`.
    case
      when not coalesce(
        p_period_start <= groepsdatum(m.group_id) + 1
        and (
          p_period_start >= groepsdatum(m.group_id) - 6
          or lid_van_open_groep(m.group_id)
        ),
        false
      ) then null
      else exists (
        select 1 from chain_links c
        where c.group_id = m.group_id
          and c.user_id = m.user_id
          and c.group_period_start = p_period_start
      )
    end,
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
  left join zichtbare_reeksen_van_groep(p_group_id) s
    on s.user_id = m.user_id and s.goal_id = d.id
  where m.group_id = p_group_id
  order by m.joined_at asc, m.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

commit;
