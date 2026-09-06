-- 0174_het_ai_dagquotum_kijkt_ook_naar_wat_een_job_kost.sql — een dagbudget in centen naast de telling van tien jobs (QS8-296)
--
-- ROLLBACK-PAD:
--   drop function if exists ai_dag_budget_cent();
--   plus `create or replace` op `ai_verbruik()` en `vraag_ai_job()` zonder de
--   budgettak — de vorige definities staan in 0056 en 0136.
--   ⚠️ Deze migratie voegt alleen een weigering en een extra sleutel in een
--   jsonb-antwoord toe. Bij een terugzet gaat er geen gegeven verloren.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Onwrikbare regel 6: *"Elke AI-call kost geld: cache, dedupliceer, quota per
-- gebruiker, log kosten per user-id."* Het loggen gebeurt, het quotum bestaat,
-- en de twee raakten elkaar niet.
--
-- Gemeten in de gedeployde `ai_verbruik()` en `vraag_ai_job()`:
--
--   ai_dag_limiet()  -> 10
--   de teller        -> count(*) from ai_jobs where user_id = auth.uid()
--
-- Tien jobs per dag, ongeacht hoe groot ze zijn. `ai_jobs` draagt al
-- `input_tokens`, `output_tokens` én `cost_cents` — er wordt per job vastgelegd
-- wat hij kostte, alleen keek de limiet er niet naar. Wie tien maximale prompts
-- stuurt, kost een veelvoud van wie er tien korte stuurt, en het quotum zag geen
-- verschil. Op een gratis tier zonder uitgavenplafond is dat de kant waar het
-- misgaat: de rekening loopt op de tokens, niet op het aantal aanroepen.
--
-- ---------------------------------------------------------------------------
-- ⚠️ Waarom de telling van tien blíjft, en dat geen tweede eenheid is
-- ---------------------------------------------------------------------------
--
-- Het issue vraagt om te tellen in centen *in plaats van* in rijen, en
-- waarschuwt terecht voor twee eenheden naast elkaar (de tekstlengte-affaire,
-- QS8-118). **Ik heb het budget ernáást gezet en niet ervoor in de plaats, om
-- twee redenen die allebei gemeten zijn.**
--
-- **1. Vervangen is een verslechtering op de misbruik-as.** Een budget begrenst
-- de rékening, niet het aantal aanroepen. Wie duizend piepkleine, telkens net
-- iets andere prompts stuurt, blijft ruim onder elk budget en doet toch duizend
-- HTTP-calls naar Anthropic. De dedupe in `vraag_ai_job` vangt alleen identieke
-- invoer. Rate limiting is onwrikbare regel 5 en kostenbeheersing is regel 6;
-- dat zijn twee beloftes en geen twee eenheden voor dezelfde belofte.
--
-- **2. ⚠️ En de telling ís de reservering — dit is de naad van dit issue.**
-- `cost_cents` bestaat pas als een job **klaar** is; toelating gebeurt als hij
-- **begint**. Daartussen staat een job op `queued` of `running` met
-- `cost_cents = null`. Een budget dat alleen `sum(cost_cents)` optelt, is dus te
-- racen: vuur er vijftig tegelijk af en ze worden allemaal toegelaten, want op
-- het moment van toelaten heeft nog niets iets gekost.
--
-- De telling van tien dekt precies dat gat. Er kunnen nooit meer dan tien jobs
-- per dag bestaan — in de lucht of afgerond — dus de maximale overschrijding van
-- het budget is tien maal wat één job hoogstens kost. Met `ai_invoer_max()` van
-- 8000 tekens invoer en `MAX_TOKENS` van 8000 uitvoer is dat grofweg 15 cent per
-- job, dus ten hoogste 150 cent voordat er ook maar iets geboekt is.
--
-- **De twee grenzen dekken elkaars blinde vlek**, en dat is de reden dat ze
-- allebei blijven staan. Haal je de telling weg, dan is het budget raceable;
-- haal je het budget weg, dan zie je het verschil tussen groot en klein niet.
--
-- ---------------------------------------------------------------------------
-- Waar het getal vandaan komt
-- ---------------------------------------------------------------------------
--
-- 100 cent per gebruiker per dag, en dat is een beredeneerde keuze en geen
-- meting — er zijn nog geen duizenden echte calls om een verdeling uit te halen
-- (QS8-187 telt er drie). De redenering:
--
--   een maximale job kost ~15 cent  ->  het budget bindt na ~6 à 7 daarvan
--   een gewone job kost veel minder ->  de telling van 10 bindt eerder
--
-- Dat is precies de bedoelde verdeling: **voor gewoon gebruik bindt de telling,
-- voor duur gebruik bindt het budget.** Zodra er echt verbruik is, hoort dit
-- getal opnieuw tegen `ai_kosten_per_week()` gelegd te worden.
--
-- ⚠️ Het staat in een functie en niet in een constante in de code, om dezelfde
--    reden als `ai_dag_limiet()` en `ai_invoer_max()`: één plek, en de client
--    krijgt het getal mee in het antwoord in plaats van het te herhalen.
--
-- ---------------------------------------------------------------------------
-- Idempotent: drie keer `create or replace`, geen DDL aan tabellen.
-- ---------------------------------------------------------------------------

/**
 * Het dagbudget per gebruiker, in dollarcent.
 *
 * ⚠️ Dezelfde eenheid als `ai_jobs.cost_cents` (`numeric(10,4)`), zodat er
 *    nergens omgerekend hoeft te worden. Een grens en een teller in twee
 *    eenheden is in dit project al een keer duur geweest (QS8-118).
 */
create or replace function ai_dag_budget_cent()
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$ select 100; $$;

revoke all on function ai_dag_budget_cent() from public, anon, authenticated;
grant execute on function ai_dag_budget_cent() to authenticated, service_role;

/**
 * Wat de aanroeper vandaag verbruikt heeft — in jobs én in centen.
 *
 * ⚠️ De sleutels `gebruikt` en `limiet` blijven staan en houden hun betekenis.
 *    Er komen er twee bij; dat breekt geen enkele lezer.
 *
 * ⚠️ `coalesce(sum(...), 0)`: een job die nog draait heeft `cost_cents = null`,
 *    en `sum` over uitsluitend nulls geeft `null`. Zonder de coalesce zou
 *    `besteed_cent` verdwijnen zodra iemand één lopende job heeft.
 */
create or replace function ai_verbruik()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gebruikt', count(*),
    'limiet', ai_dag_limiet(),
    'besteed_cent', round(coalesce(sum(j.cost_cents), 0)::numeric, 4),
    'budget_cent', ai_dag_budget_cent()
  )
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';
$$;

revoke all on function ai_verbruik() from public, anon, authenticated;
grant execute on function ai_verbruik() to authenticated, service_role;

/**
 * Vraagt een AI-job aan, of geeft er een uit de cache terug.
 *
 * ⚠️ **Ongewijzigd behalve de budgettak** (QS8-296). De rest staat er zoals 0136
 *    hem achterliet; hij staat hier voluit omdat `create or replace` geen
 *    gedeeltelijke wijziging kent.
 */
create or replace function vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  dag_limiet constant integer := ai_dag_limiet();
  hash       text;
  gebruikt   integer;
  besteed    numeric;
  budget     constant integer := ai_dag_budget_cent();
  bestaande  ai_jobs%rowtype;
  nieuwe_id  uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- 0136: 'plan' erbij — één zin en een datum, zonder bestaand doel.
  if p_kind not in ('milestones', 'weekly_goals', 'milestone_tip', 'plan') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_kind');
  end if;

  -- 0120: tien jobs per dag is pas een quotum als één job begrensd is.
  if p_input is null or char_length(p_input::text) > ai_invoer_max() then
    return jsonb_build_object(
      'ok', false, 'reason', 'invoer_te_groot', 'max', ai_invoer_max()
    );
  end if;

  if p_goal_id is not null and not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_goal');
  end if;

  if p_kind = 'milestone_tip' then
    if p_input is null
       or jsonb_typeof(p_input) <> 'object'
       or (select count(*) from jsonb_object_keys(p_input)) <> 1
       or p_input->>'milestone_id' is null then
      return jsonb_build_object('ok', false, 'reason', 'ongeldige_invoer');
    end if;

    if not exists (
      select 1 from milestones m
      where m.id      = (p_input->>'milestone_id')::uuid
        and m.goal_id = p_goal_id
        and m.status  = 'todo'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'mijlpaal_onbruikbaar');
    end if;

    if exists (
      select 1 from milestone_tips mt
      where mt.milestone_id = (p_input->>'milestone_id')::uuid
    ) then
      return jsonb_build_object('ok', true, 'hergebruikt', true, 'reason', 'al_aanwezig');
    end if;

    if (
      select count(*) from ai_jobs j
      where j.user_id = auth.uid()
        and j.kind    = 'milestone_tip'
        and j.input->>'milestone_id' = p_input->>'milestone_id'
    ) >= 3 then
      return jsonb_build_object('ok', false, 'reason', 'opgegeven');
    end if;
  end if;

  hash := md5(p_input::text);

  select * into bestaande
  from ai_jobs j
  where j.user_id    = auth.uid()
    and j.kind       = p_kind
    and j.input_hash = hash
    and j.status     = 'done'
    and j.created_at > now() - interval '1 day'
  order by j.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'job_id', bestaande.id, 'hergebruikt', true, 'reason', 'cache'
    );
  end if;

  select * into bestaande
  from ai_jobs j
  where j.user_id    = auth.uid()
    and j.kind       = p_kind
    and j.input_hash = hash
    and j.status in ('queued', 'running')
  order by j.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'job_id', bestaande.id, 'hergebruikt', true, 'reason', 'bezig'
    );
  end if;

  select count(*) into gebruikt
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';

  if gebruikt >= dag_limiet then
    return jsonb_build_object(
      'ok', false, 'reason', 'quota_reached', 'limiet', dag_limiet, 'gebruikt', gebruikt
    );
  end if;

  -- ⚠️ **Het dagbudget** (QS8-296). De telling hierboven ziet geen verschil
  --    tussen een maximale prompt en een korte; deze wel. Zie de kop van 0174
  --    voor waarom ze allebei blijven staan: de telling begrenst hoe ver dit
  --    budget geracet kan worden door jobs die nog draaien, want `cost_cents`
  --    bestaat pas als een job klaar is.
  --
  -- ⚠️ `coalesce`, want een lopende job heeft nog geen kosten en `sum` over
  --    alleen nulls geeft `null` — en `null >= budget` is `null`, dus de tak
  --    zou stilzwijgend nooit vuren.
  select coalesce(sum(j.cost_cents), 0) into besteed
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';

  if besteed >= budget then
    return jsonb_build_object(
      'ok', false, 'reason', 'budget_bereikt',
      'budget_cent', budget, 'besteed_cent', round(besteed, 4)
    );
  end if;

  insert into ai_jobs (user_id, goal_id, kind, input, input_hash)
  values (auth.uid(), p_goal_id, p_kind, p_input, hash)
  returning id into nieuwe_id;

  return jsonb_build_object(
    'ok', true, 'job_id', nieuwe_id, 'hergebruikt', false, 'reason', 'queued'
  );
end;
$function$;

revoke all on function vraag_ai_job(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function vraag_ai_job(text, uuid, jsonb) to authenticated, service_role;
