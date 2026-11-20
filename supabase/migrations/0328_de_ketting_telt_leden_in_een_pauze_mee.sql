-- 0328_de_ketting_telt_leden_in_een_pauze_mee.sql — QS8-769, nazorg op 0204 en 0307
--
-- ROLLBACK-PAD:
--   Zet `ketting_stand()` terug op de vorm van 0204: in `in_aanmerking` valt een lid
--   weg met een lopende pauze (`not exists (select 1 from breathers …)`), en de join
--   op `profiles` voor `p.tz` komt terug. Dat opent het restant B1 weer: het aantal
--   bolletjes zakt zodra iemand pauzeert. Geen data te herstellen: de functie
--   schrijft niets.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Besluit van Quinten, 20-11-2026 (B1/V4 uit QS8-753): leden in een pauze tellen
-- gewoon mee. 0307 maakte `breathers` eigenaar-only, maar liet `ketting_stand()`
-- ongemoeid als benoemd restant (`docs/decisions/2026-11-19-de-adempauze-is-van-jou-alleen.md`
-- §6, B1). Die functie laat een lid met een lopende pauze uit `in_aanmerking`
-- vallen en geeft dat getal aan elk groepslid. Zakt het aantal bolletjes, dan
-- pauzeert er iemand; in een duo is dat de ander, en met de leesbare `chain_links`
-- is bij naam te raden wie. Dat is de afleiding waar domeinregel 7 voor bestaat.
--
-- ---------------------------------------------------------------------------
-- Wat er verandert
-- ---------------------------------------------------------------------------
--
-- `in_aanmerking` is nu elk lid dat niet `inactive` is, met of zonder pauze. De
-- pauze komt in de functie niet meer voor, en de join op `profiles` (alleen voor
-- de klok van het lid in de pauzetoets) ook niet. `schakels` telt de schakels van
-- dezelfde leden: een pauzerend lid dat een schakel heeft, telt nu mee, en een
-- dat er geen heeft maakt de week niet voltallig.
--
-- ⚠️ **Het gevolg dat Quinten accepteert:** De Ketting wordt in een pauzeweek niet
--    voltallig zolang een pauzerend lid geen schakel heeft. Wat er dan te lezen
--    valt is niet te onderscheiden van een lid dat zijn week nog niet af heeft;
--    dat is het doel van deze wijziging.
--
-- ⚠️ **Het lichaam is dat van 0204**, de laatste definitie op main
--    (`grep "function public.ketting_stand"`: 0107 en 0204, geen latere). Alleen
--    het pauzeblok en de join op `profiles` zijn eruit. Kop, `security definer`,
--    zoekpad, grants en de `where is_group_member(…)` zijn gelijk gebleven.
--
-- ⚠️ **Wat dit níet raakt:** `breathers` blijft eigenaar-only (0307), `plan_adempauze()`
--    en `annuleer_adempauze()` zijn ongewijzigd, en `chain_links` krijgt geen nieuwe
--    policy.
--
-- ---------------------------------------------------------------------------

create or replace function public.ketting_stand(p_group_id uuid, p_period_start date)
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
      -- ⚠️ Een lid in een pauze telt mee (QS8-769). Hier stond een
      --    `not exists (… breathers …)`: het getal dat dat gaf, zakte zodra er
      --    iemand pauzeerde, en dat leest elk groepslid.
      and m.status <> 'inactive'
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

revoke all on function public.ketting_stand(uuid, date) from public, anon, authenticated;
grant execute on function public.ketting_stand(uuid, date) to authenticated;
