-- 0266_een_teruggedraaide_weekboeking_mag_opnieuw_geboekt_worden.sql — een week die
-- na een ingetrokken goedkeuring alsnog door de termijn wordt goedgekeurd, levert
-- weer punten op in plaats van netto nul.
--
-- ROLLBACK-PAD:
--   drop index if exists points_ledger_dedupe_idx;
--   create unique index points_ledger_dedupe_idx on public.points_ledger
--     (user_id, reason, ref_type, ref_id)
--     where ref_id is not null and reason <> 'review_given';
--   alter table public.points_ledger drop column if exists ronde;
--   -- en `keur_vastgelopen_goedkeuringen_goed()` terug naar de vorm van 0194:
--   -- `insert … values (…, true) on conflict do nothing;` zonder rondebepaling.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten pad (QS8-456), een gewone volgorde en geen randgeval:
--
--   1. je buddy keurt je week goed        -> completion_approved_ceiling  +2
--   2. je buddy trekt het in              -> correction                   -2
--                                            weekly_goals.status -> pending
--   3. je buddy verlaat de groep
--   4. de termijn draait                  -> afgehandeld = 1
--                                            weekstatus -> approved
--                                            totaal punten -> 0
--
-- De week staat op `approved` en de eigenaar heeft er **netto nul punten** voor.
-- De +2-rij uit stap 1 bezet `points_ledger_dedupe_idx` op
-- `(user_id, reason, ref_type, ref_id)`, dus het `on conflict do nothing` in
-- `keur_vastgelopen_goedkeuringen_goed()` slikt de boeking van stap 4.
--
-- ---------------------------------------------------------------------------
-- Waarom "opnieuw uitbetalen" en niet "de week niet goedkeuren"
-- ---------------------------------------------------------------------------
--
-- Het issue laat beide open. De doorslag gaf een meting en niet een redenering:
-- 📏 `intrekvenster_minuten()` geeft **15**. Intrekken kan dus alleen binnen een
-- kwartier na goedkeuren.
--
-- ⚠️ **Een venster van vijftien minuten is een ongedaan-maken-knop en geen
--    oordeel.** Niemand herweegt andermans week veertien minuten later op de
--    inhoud en draait zichzelf terug; en gebeurt dat tóch, dan staat de week
--    weer op `pending` en kan elke groepsgenoot hem alsnog goedkeuren. Er is hier
--    dus geen menselijk oordeel dat een termijn zou overrulen — dat was het
--    argument vóór de andere optie, en het houdt geen stand.
--
-- ⚠️⚠️ **En de andere optie heeft een misbruikvorm die deze niet heeft.** Sluit
--    je een ingetrokken week permanent uit van de termijn, dan kost één misklik
--    plus een vertrekkende buddy de eigenaar zijn punten voorgoed — en dan is
--    goedkeuren-intrekken-vertrekken een manier om iemands week onbetaalbaar te
--    maken. De termijn bestaat juist voor "de eigenaar heeft het werk gedaan en
--    niemand keurde op tijd goed", en dat is precies deze situatie.
--
-- Zie `docs/decisions/2026-09-14-een-kwartier-is-een-ongedaanmaken-knop.md`.
--
-- ---------------------------------------------------------------------------
-- Wat dit NIET is
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Geen reparatie van QS8-454.** Die gaat over dezelfde index maar een andere
--    vraag: dat een week een vloer- **én** een plafondboeking kan dragen, omdat
--    `reason` in de sleutel zit. Die blijft hier onveranderd in de sleutel staan,
--    dus dat gat blijft precies zoals het was — dat is een eigen issue met een
--    eigen besluit over die sleutel. `ronde` staat die reparatie niet in de weg.
--
-- ⚠️ **Geen nieuw groepszichtbaar oppervlak.** `points_ledger` is eigenaar-only
--    (domeinregel 10) en `ronde` verandert daar niets aan.
--
-- ⚠️ **Geen herschrijving van geschiedenis.** De +2 en de −2 uit stap 1 en 2
--    blijven staan; er komt een rij bíj. Domeinregel 6, append-only.

-- ---------------------------------------------------------------------------
-- 1. De ronde
-- ---------------------------------------------------------------------------

-- ⚠️ **Wat `ronde` betekent: de hoeveelste keer deze (gebruiker, reden, ding)
--    geboekt is.** Ronde 1 is de normale boeking. Een hogere ronde bestaat
--    alleen doordat een eerdere ronde is teruggedraaid — de week zou anders niet
--    op `pending` staan en de termijn zou er niet aan toekomen.
--
-- ⚠️ Hij zit in de dedupe-sleutel en niet ernaast: binnen één ronde is dubbel
--    boeken nog steeds onmogelijk, en dát is waar die index voor bestaat.
alter table public.points_ledger
  add column if not exists ronde smallint not null default 1;

alter table public.points_ledger
  drop constraint if exists points_ledger_ronde_positief;
alter table public.points_ledger
  add constraint points_ledger_ronde_positief check (ronde >= 1);

comment on column public.points_ledger.ronde is
  'De hoeveelste boeking van deze (user_id, reason, ref_type, ref_id). Ronde 1 is '
  'normaal; hoger kan alleen nadat een eerdere ronde is teruggedraaid (QS8-456).';

drop index if exists points_ledger_dedupe_idx;

create unique index points_ledger_dedupe_idx
  on public.points_ledger (user_id, reason, ref_type, ref_id, ronde)
  where ref_id is not null and reason <> 'review_given';

-- ---------------------------------------------------------------------------
-- 2. De termijn boekt in de volgende ronde
-- ---------------------------------------------------------------------------

create or replace function public.keur_vastgelopen_goedkeuringen_goed(
  p_termijn_dagen integer default 7,
  p_owner_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rij      record;
  v_week     weekly_goals%rowtype;
  v_voltooid completions%rowtype;
  v_punten   integer;
  v_reden    text;
  v_ronde    smallint;
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

    -- ⚠️⚠️ **De reparatie van QS8-456.** Stond hier `on conflict do nothing` met
    --    ronde 1, dan slikte de index de boeking zodra er ooit een goedkeuring
    --    voor deze week was die daarna is ingetrokken — en bleef de week
    --    `approved` met netto nul punten.
    --
    -- ⚠️ De hoogste ronde plus één, en niet "ronde 2": een week kan in theorie
    --    meer dan één keer goedgekeurd-en-ingetrokken zijn, en dan is 2 al bezet.
    --
    -- ⚠️ Twee termijnruns tegelijk komen allebei op dezelfde ronde uit; de unieke
    --    index laat er dan één door. Dat is de bedoeling en daarom blijft het
    --    `on conflict do nothing` eronder staan.
    select coalesce(max(p.ronde), 0) + 1 into v_ronde
    from points_ledger p
    where p.user_id  = v_rij.owner_id
      and p.reason   = v_reden
      and p.ref_type = 'weekly_goal'
      and p.ref_id   = v_week.id;

    update weekly_goals set status = 'approved' where id = v_week.id;

    -- ⚠️ `group_id` is `null` en dat is geen omissie: er ís geen groep meer, want
    --    dat is nu juist waarom deze week vastliep. De normale route boekt de
    --    groep van de beoordelaar; die bestaat hier per definitie niet.
    --
    -- ⚠️ `zonder_beoordelaar = true` is het spoor. Dit is de énige plek in het
    --    schema die hem op `true` zet; `award_points_on_approval()` laat de
    --    standaard `false` staan, en dat is de naad die
    --    `tests/rls/vastgelopen.test.ts` bewaakt.
    insert into points_ledger (user_id, goal_id, group_id, delta, reason, ref_type, ref_id, ronde, zonder_beoordelaar)
    values (v_rij.owner_id, v_week.goal_id, null, v_punten, v_reden, 'weekly_goal', v_week.id, v_ronde, true)
    on conflict do nothing;

    perform verdien_weekpassen(v_rij.owner_id, v_week.goal_id);
    perform herbereken_reeks(v_rij.owner_id, v_week.goal_id);

    v_aantal := v_aantal + 1;
  end loop;

  return v_aantal;
end;
$function$;
