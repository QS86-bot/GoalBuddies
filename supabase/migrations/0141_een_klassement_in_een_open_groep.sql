-- 0141_een_klassement_in_een_open_groep.sql — punten per lid, alleen waar de groep dat heeft afgesproken (QS8-254)
--
-- ROLLBACK-PAD:
--   drop function if exists public.groep_klassement(uuid, integer, integer);
--   drop function if exists public.groep_teller(uuid);
--   alter table public.points_ledger
--     drop constraint if exists points_ledger_gemist_is_niet_van_een_groep;
--
--   ⚠️ Er gaat geen gegeven verloren. Deze migratie voegt twee leesfuncties toe
--      en één CHECK; er wordt geen kolom, rij of policy aangeraakt.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit A54, Quinten, 31-08-2026: er komt een klassement per lid. Dat draait
-- besluit A42 terug, dat op 24-08 juist herbevestigd was met deze zin:
--
--   *Punten zijn privé. Een dalend totaal is zichtbaar bewijs van een gemiste
--    week, en dat botst met domeinregel 7.*
--
-- Die redenering is niet vervallen, en deze migratie is de vorm waarin ze
-- gerespecteerd blijft: het klassement volgt `groups.zichtbaarheid`. Een groep
-- die onder besluit A41 heeft afgesproken elkaars tegenslag te zien, krijgt het
-- klassement; een beschermde groep krijgt de optelteller.
--
-- Dat is geen afzwakking maar de goedkoopste uitvoering. De machinerie voor
-- "deze groep heeft ja gezegd" staat er al, met alle zorgvuldigheid eromheen:
-- `zet_groepszichtbaarheid()` eist een actieve beheerder, een expliciete
-- bevestiging, een rij in `group_events` en een systeembericht. Er hoeft geen
-- tweede toestemmingsvorm bij.
--
-- ---------------------------------------------------------------------------
-- Welke punten, en waarom dat de scherpste vraag van dit issue was
-- ---------------------------------------------------------------------------
--
-- Er zijn twee getallen die allebei "de score van dit lid" heten:
--
--   A. het **groepstotaal** — `sum(delta) where group_id = deze groep`
--   B. het **persoonlijke totaal** — `sum(delta)` over alles
--
-- Dit klassement toont **A**, en dat is een besluit met gevolgen. Gemeten in het
-- schema, niet aangenomen:
--
--   * `cycle_missed` wordt geboekt door de rollover (`supabase/functions/
--     rollover/index.ts`) **zonder `group_id`** — een gemiste week is niet aan
--     één groep toe te rekenen, want een doel kan in meerdere groepen hangen.
--   * `completion_approved_*` en `review_given` dragen wél een `group_id`: de
--     goedkeuring vond in een specifieke groep plaats.
--
-- **Daarmee kan het groepstotaal niet dalen door een gemiste week, en dat is
-- precies de eigenschap waar A42 om vroeg.** Een laag getal betekent "hier
-- weinig verdiend" en niet "hier weken gemist" — dat tweede is niet af te leiden
-- omdat het cijfer er niet in zit.
--
-- ⚠️ **Die eigenschap was een toevalligheid en is met deze migratie een
--    grendel.** `points_ledger_gemist_is_niet_van_een_groep` legt vast wat de
--    rollover vandaag doet. Zonder die CHECK is één `group_id` erbij in een
--    latere Edge Function genoeg om dit klassement stilzwijgend in een
--    tegenslagmeter te veranderen — en geen enkele test die vandaag bestaat zou
--    daar rood van worden.
--
-- ---------------------------------------------------------------------------
-- Wat er hierdoor wél afleidbaar wordt, en waarom dat geen nieuw oppervlak is
-- ---------------------------------------------------------------------------
--
-- Een ingetrokken goedkeuring (oppervlak 17) is bewust dicht, óók in een open
-- groep. En die boekt in 0030 twee negatieve `correction`-rijen mét `group_id`:
-- −1 bij de intrekker en −punten bij de eigenaar van de week. Het groepstotaal
-- daalt daar dus wél van.
--
-- Dat is nagelopen en aanvaard, om twee redenen die allebei in de code staan:
--
--   1. **Het venster is vijftien minuten** (`0030`, `created_at <= now() -
--      interval '15 minutes'`). Wat afleidbaar is, is dus niet "X heeft een week
--      gemist" maar "er is zojuist een goedkeuring ingetrokken".
--   2. **Er is al een luider signaal, en dat is bewust zo gebouwd.** Dezelfde
--      functie verwíjdert de aankondiging uit de groepschat. Een regel die
--      verdwijnt uit een kanaal dat mensen lezen, valt meer op dan een getal dat
--      terugveert. Het klassement is hier dus niet de zwakste schakel, en het
--      openen ervan verandert niets aan wat er al af te leiden was.
--
-- Opgenomen als **oppervlak 28** in
-- `docs/decisions/002-domeinregel7-oppervlakken.md`, met deze afweging erbij.
--
-- ---------------------------------------------------------------------------
-- Wat dit klassement structureel níét kan tonen
-- ---------------------------------------------------------------------------
--
-- Het issue noemt drie dingen die er nooit in mogen, en alle drie zijn hier
-- onmogelijk gemaakt in de **handtekening** en niet in het scherm:
--
--   | Verboden | Waarom het hier niet kán |
--   |---|---|
--   | een minpunt in beeld | er is geen kolom voor een `delta` |
--   | een grafiek per lid over de tijd | er is geen kolom voor een datum |
--   | nadruk op de laatste plaats | `positie` telt op vanaf 1; er is geen `van` |
--
-- Een belofte die alleen in een component staat, verhuist mee met dat component
-- en verdwijnt bij de tweede schrijver (onwrikbare regel 18). Een kolom die niet
-- bestaat, is er over een jaar nog steeds niet.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. Een gemiste week hoort bij niemands groep
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit legt vast wat de rollover al doet. Valt deze migratie om op productie,
--    dan is dat gééń defect in de CHECK maar het bewijs dat er ergens een
--    `cycle_missed` mét groep geboekt is — en dan is dit klassement niet veilig
--    en die rij het echte probleem.

alter table public.points_ledger
  drop constraint if exists points_ledger_gemist_is_niet_van_een_groep;

alter table public.points_ledger
  add constraint points_ledger_gemist_is_niet_van_een_groep
  check (reason <> 'cycle_missed' or group_id is null);

comment on constraint points_ledger_gemist_is_niet_van_een_groep on public.points_ledger is
  'Een gemiste week is niet aan één groep toe te rekenen — een doel kan in '
  'meerdere groepen hangen. Sinds QS8-254 is dit ook een grendel: het '
  'groepsklassement kan alleen niet dalen door een gemiste week zolang deze '
  'CHECK staat (besluit A54, A42).';

-- ---------------------------------------------------------------------------
-- 2. De optelteller — in béide groepstanden
-- ---------------------------------------------------------------------------
--
-- ⚠️ Dit is de vorm die besluit A42 zélf al toestond: "een teller die alleen
--    optelt — 'deze groep heeft samen 47 weken afgerond'. Die gaat nooit omlaag
--    en verraadt niemand." Dezelfde vorm als `ketting_stand()` (0107) en de
--    seizoensrecap (0112).
--
-- ⚠️ **Dezelfde telwijze als `seizoensrecap_cijfers()`, met opzet.** Twee
--    plekken die "afgeronde weken in deze groep" verschillend tellen, geven
--    dezelfde groep twee getallen — en dan is het niet meer een feit maar een
--    mening van een scherm. Het enige verschil is het ontbrekende
--    seizoensvenster: deze teller telt vanaf het begin.
--
-- ⚠️ SECURITY DEFINER met een expliciete lidmaatschapstoets, om de reden die in
--    `ketting.ts` staat: als INVOKER hangt het antwoord af van wat de áánroeper
--    mag zien, en dan geeft een gedeelde teller twee leden een ander getal.

create or replace function public.groep_teller(p_group_id uuid)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'weken', (
      select count(*)::int
      from weekly_goals w
      join goal_group_links l on l.goal_id = w.goal_id
      where l.group_id = p_group_id
        and w.status = 'approved'
    ),
    'mijlpalen', (
      select count(*)::int
      from milestones m
      join goal_group_links l on l.goal_id = m.goal_id
      where l.group_id = p_group_id
        and m.status = 'done'
        and m.completed_at is not null
    )
  )
  where is_group_member(p_group_id);
$$;

comment on function public.groep_teller(uuid) is
  'Twee groepstotalen die alleen optellen: afgeronde weken en gehaalde '
  'mijlpalen. Nooit per persoon, en dus in béide zichtbaarheidstanden '
  'beschikbaar — besluit A42. Geeft nul rijen aan een niet-lid.';

revoke all on function public.groep_teller(uuid) from public, anon, authenticated;
grant execute on function public.groep_teller(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Het klassement — alleen in een open groep
-- ---------------------------------------------------------------------------
--
-- ⚠️ **De grens staat hier en niet in het scherm.** Een klassement dat alleen in
--    de UI verborgen wordt, is met één verzoek aan PostgREST alsnog uit te
--    lezen. `lid_van_open_groep()` (0102) draagt de hele toets: actief lid, van
--    een lévende groep, die op `open` staat.
--
-- ⚠️ **SECURITY DEFINER is hier geen gemak maar een noodzaak.** `points_ledger`
--    heeft sinds 0003 één SELECT-policy: `user_id = auth.uid()`. Een
--    INVOKER-functie zou voor elk ander lid nul teruggeven en dus een klassement
--    van één persoon opleveren. RLS kan bovendien geen kolommen beperken — de
--    eis is "je mag de deltas en de data niet lezen, wél het totaal", en dat is
--    per definitie een functie met een expliciete kolomlijst (CLAUDE.md,
--    domeinregel 7; de les van 0050).
--
-- ⚠️ **De positie wordt bepaald vóór de paginering.** Zou `rank()` ná `limit`
--    komen, dan begint pagina twee weer bij 1. Vandaar de CTE: eerst het hele
--    klassement, dan pas het venster.
--
-- ⚠️ **`greatest(..., 0)` op het totaal.** Vandaag kan dit getal niet negatief
--    worden — `cycle_missed` draagt geen groep (sectie 1) en elke negatieve
--    `correction` uit 0030 draait een even grote positieve rij terug. Maar
--    "kan vandaag niet" is een aanname, en de prijs van een verkeerde aanname is
--    hier "−2" naast iemands naam in een groepsscherm. Dat is exact de schade
--    waar domeinregel 7 tegen beschermt, dus de veilige kant wint.
--    De óngeknipte eigenschap staat onder test in `tests/rls/klassement.test.ts`,
--    zodat een defect rood wordt in de suite en niet zichtbaar op een scherm.
--
-- ⚠️ **Uitgezette leden staan er niet in.** `status = 'inactive'` betekent dat
--    iemand uit de groep is; die in een ranglijst laten staan is een naam tonen
--    die verder nergens meer op het scherm voorkomt. `paused` blíjft er wel in:
--    een adempauze is een aangekondigde eigen handeling (oppervlak 21) en geen
--    vertrek.

create or replace function public.groep_klassement(
  p_group_id uuid,
  p_limit    integer default 20,
  p_offset   integer default 0
)
  returns table (
    user_id       uuid,
    display_name  text,
    punten        integer,
    positie       bigint,
    total_members bigint
  )
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  with standen as (
    select
      m.user_id                                   as user_id,
      p.display_name                              as display_name,
      greatest(coalesce((
        select sum(pl.delta)
        from points_ledger pl
        where pl.group_id = p_group_id
          and pl.user_id  = m.user_id
      ), 0), 0)::integer                          as punten
    from group_members m
    join profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and m.status <> 'inactive'
  ),
  gerangschikt as (
    select
      s.user_id,
      s.display_name,
      s.punten,
      rank() over (order by s.punten desc)        as positie,
      count(*) over ()                            as total_members
    from standen s
  )
  select
    g.user_id,
    g.display_name,
    g.punten,
    g.positie,
    g.total_members
  from gerangschikt g
  where lid_van_open_groep(p_group_id)
  -- ⚠️ Dezelfde volgorde als `positie`, plus twee tiebreakers. Zonder een
  --    deterministische volgorde kan één lid op twee pagina's staan en een
  --    ander op geen enkele — dat is niet cosmetisch maar een verkeerd
  --    klassement.
  order by g.punten desc, g.display_name asc, g.user_id asc
  limit greatest(0, least(coalesce(p_limit, 20), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.groep_klassement(uuid, integer, integer) is
  'Het puntenklassement van een OPEN groep: naam, totaal en positie, meer niet '
  '(besluit A54). Geen deltas en geen datums — die kolommen bestaan niet, zodat '
  'de belofte niet in een component hoeft te staan. Geeft nul rijen in een '
  'beschermde groep en aan een niet-lid.';

revoke all on function public.groep_klassement(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.groep_klassement(uuid, integer, integer) to authenticated;

commit;
