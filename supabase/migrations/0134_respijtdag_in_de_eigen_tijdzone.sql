-- 0134_respijtdag_in_de_eigen_tijdzone.sql — één dag respijt voor iedereen (QS8-173)
--
-- ROLLBACK-PAD:
--   De vorige definitie van `wikkel_commitments_af()` staat in migratie 0090 en
--   is daar ongewijzigd terug te halen met `create or replace`; de handtekening
--   verandert niet. `eigenaarsdatum()` mag daarna blijven staan of weg met
--   `drop function if exists public.eigenaarsdatum(uuid);`.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `wikkel_commitments_af()` besliste met
--
--   v_op_tijd := current_date <= v_doel.target_date + 1
--
-- of een straf verschuldigd wordt. `current_date` is de serverdatum in UTC, dus
-- die `+ 1` betekende niet voor iedereen hetzelfde:
--
--   | zone   | respijt vóór | respijt ná |
--   |--------|--------------|------------|
--   | UTC−8  | 0 dagen      | 1 dag      |
--   | UTC+0  | 1 dag        | 1 dag      |
--   | UTC+10 | 2 dagen      | 1 dag      |
--
-- Voor een zone áchter UTC loopt `current_date` een dag vóór op de eigen datum
-- van de eigenaar, en dan wordt de `+ 1` precies opgegeten.
--
-- ⚠️ **Niemand werd vóór zijn streefdatum gestraft**, ook niet vóór deze
--    migratie: op de streefdatum zelf geldt `eigen_vandaag <= target_date` in
--    elke zone. Alleen de extra dag varieerde. Dát is de reden dat de rij in
--    `docs/ENGINEER-REVIEW.md` op Laag stond en niet op Middel.
--
-- Besluit van Quinten, 31-08-2026: **de `+ 1` blijft, maar hij wordt voor
-- iedereen gelijk.** Dit is correctheidsregel 7 in zijn zuiverste vorm — "vandaag"
-- hoort berekend te worden in de tijdzone van de gebruiker — en het raakt
-- domeinregel 5, want een straf is het duurste dat deze app een mens kan
-- aandoen. Dan is niet te verdedigen dat de uitkomst afhangt van waar je woont.
--
-- ⚠️ **En het maakt de belofte uitspreekbaar.** Vóór deze migratie kon je niet in
--    één zin zeggen wat een gebruiker krijgt. Nu wel: **je hebt tot het eind van
--    de dag ná je streefdatum.**

-- ---------------------------------------------------------------------------
-- 1. De helper, naar het model van `groepsdatum()`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Een eigen helper en geen `at time zone` ter plaatse.** `groepsdatum(gid)`
--    bestaat al voor de groepskant en doet precies dit; een tweede opvatting van
--    "welke dag is het voor deze persoon" verspreid over losse functies is hoe
--    correctheidsregel 7 in SQL verwatert. `plan_adempauze()` rekent het vandaag
--    nog inline uit; die mag hier later op aansluiten, maar dat is een aparte
--    wijziging en geen slipstream.
--
-- ⚠️ `profiles.tz` is `not null` met een default, dus de `select` geeft alleen
--    `null` terug als het profiel zelf niet bestaat. De aanroeper hieronder vangt
--    dat af — zie de opmerking daar, want de richting van die val doet ertoe.
create or replace function public.eigenaarsdatum(uid uuid)
returns date
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $$
  select (now() at time zone p.tz)::date
  from profiles p
  where p.id = uid;
$$;

-- ⚠️ `from public, anon, authenticated` en niet `from public, anon`. In Supabase
--    deelt `alter default privileges` élke nieuwe functie in `public` uit aan
--    alle drie; `from public, anon` ziet eruit als "van iedereen" en houdt precies
--    de rol over waaronder iedere ingelogde gebruiker draait. Zie CLAUDE.md
--    beveiligingsregel 4 en het beslisdocument van 28-08.
revoke all on function public.eigenaarsdatum(uuid) from public, anon, authenticated;

-- ⚠️ Bewust géén `grant` aan `authenticated`. Deze helper heeft geen scherm en
--    geen client-aanroeper; hij wordt alleen gebruikt door de definer-functie
--    hieronder, die zijn eigen rechten meebrengt. `groepsdatum()` heeft dat recht
--    wél, en dat is geen inconsistentie maar een verschil in gebruik.
grant execute on function public.eigenaarsdatum(uuid) to service_role;

comment on function public.eigenaarsdatum(uuid) is
  'De datum van vandaag in de tijdzone van deze gebruiker. Tegenhanger van '
  'groepsdatum() voor de eigenaarskant (QS8-173).';

-- ---------------------------------------------------------------------------
-- 2. De beslissing zelf
-- ---------------------------------------------------------------------------
create or replace function public.wikkel_commitments_af(p_goal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_doel      record;
  v_vandaag   date;
  v_op_tijd   boolean;
  v_vrij      integer := 0;
  v_verlopen  integer := 0;
  v_vervallen integer := 0;
begin
  select g.id, g.target_date, g.status, g.owner_id
    into v_doel
    from goals g
   where g.id = p_goal_id;

  if v_doel.id is null then
    return jsonb_build_object('vrijgespeeld', 0, 'verlopen', 0, 'vervallen', 0);
  end if;

  -- ⚠️ **De terugval is `current_date` en dat is met opzet de mildste kant.**
  --    `eigenaarsdatum()` geeft alleen `null` als het profiel weg is. Zou die
  --    `null` doorlopen, dan wordt `v_op_tijd` zelf `null`, gaat de `if`
  --    hieronder naar de `else`, en vervalt de beloning van iemand die niets
  --    verkeerd deed. Een ontbrekend profiel mag nooit een straf opleveren.
  v_vandaag := coalesce(eigenaarsdatum(v_doel.owner_id), current_date);

  -- Eén dag speling, in de tijdzone van de eigenaar. Zie de kop: vóór 0134 stond
  -- hier `current_date`, en dan kreeg de een nul dagen respijt en de ander twee.
  v_op_tijd := v_vandaag <= v_doel.target_date + 1;

  -- De beloning. Alleen op tijd; te laat is geen beloning maar een troostprijs.
  if v_op_tijd then
    update commitments
       set status = 'unlocked'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_vrij = row_count;
  else
    update commitments
       set status = 'cancelled'
     where goal_id = p_goal_id and type = 'reward' and status = 'set';
    get diagnostics v_verlopen = row_count;
  end if;

  -- De straf vervalt: het doel is af, dus hij gaat nooit meer af. `cancelled` en
  -- niet `resolved` — de begunstigde groep mag dit nooit lezen.
  update commitments
     set status = 'cancelled'
   where goal_id = p_goal_id and type = 'penalty' and status = 'set';
  get diagnostics v_vervallen = row_count;

  return jsonb_build_object(
    'vrijgespeeld', v_vrij,
    'verlopen',     v_verlopen,
    'vervallen',    v_vervallen
  );
end;
$function$;

revoke all on function public.wikkel_commitments_af(uuid) from public, anon, authenticated;
grant execute on function public.wikkel_commitments_af(uuid) to service_role;
