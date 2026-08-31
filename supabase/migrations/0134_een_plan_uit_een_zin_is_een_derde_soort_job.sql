-- 0134_een_plan_uit_een_zin_is_een_derde_soort_job.sql — ai_jobs.kind krijgt 'plan'
--
-- ROLLBACK-PAD:
--   alter table public.ai_jobs drop constraint if exists ai_jobs_kind_valid;
--   alter table public.ai_jobs add constraint ai_jobs_kind_valid
--     check (kind in ('milestones', 'weekly_goals', 'milestone_tip'));
--   -- daarna de versie van vraag_ai_job() uit 0123 opnieuw uitvoeren
--
--   ⚠️ Draai de constraint niet terug zolang er rijen met kind = 'plan' staan;
--      die weigert hij dan, en de migratie stopt halverwege. Eerst opruimen.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-201, de kern van het epic QS8-200. Uit de doorloop van 30-08: het instellen
-- van een doel kost negentien invoervelden en twee AI-rondes voordat er iets
-- bruikbaars op het scherm staat.
--
-- De nieuwe vorm is één zin en een datum. Daaruit leidt de Doelcoach in één ronde
-- af: titel, categorie, identiteitszin, mijlpalen, het eerste weekdoel met vloer
-- en plafond, en de haalbaarheidstegenspraak.
--
-- ⚠️ **Eén call en niet drie.** Drie losse jobs zijn drie plekken uit het
--    dagquotum van tien, drie wachttijden en drie kansen dat er één faalt.
--
-- ---------------------------------------------------------------------------
-- Wat deze migratie wél en niet raakt
-- ---------------------------------------------------------------------------
--
-- 📏 Nagemeten op productie vóór deze migratie, want twee dingen hadden een
--    schemawijziging kunnen afdwingen en doen dat allebei níet:
--
--   1. `ai_jobs.goal_id` is **nullable**. Dat moet ook, want bij `plan` bestaat
--      het doel nog niet — dat is juist wat er gemaakt gaat worden. De bestaande
--      eigendomscontrole in `vraag_ai_job` slaat zichzelf over bij een NULL
--      (`if p_goal_id is not null and not exists ...`), dus die klopt al.
--
--   2. `ai_jobs_select` staat op `user_id` en niet op `goal_id`. Een planjob
--      zonder doel is dus gewoon leesbaar voor zijn eigenaar. Stond die policy op
--      `goal_id`, dan had de gebruiker zijn eigen job niet kunnen ophalen en was
--      de hele keten stil kapot geweest — elk schakeltje af, de keten verbroken.
--
-- ⚠️ **Géén eigen invoercontrole zoals `milestone_tip` die heeft.** Die bestaat
--    daar omdat de invoer naar een mijlpaal verwijst die van de aanroeper moet
--    zijn. De invoer van `plan` verwijst nergens naar: het is vrije tekst en een
--    datum. `ai_invoer_max()` begrenst de omvang en dat is hier de hele eis.
--    Een controle toevoegen die niets afdwingt, is een controle die je leert
--    negeren.
--
-- ⚠️ **De dedup blijft zoals hij is, en dat heeft een zichtbaar gevolg.**
--    Dezelfde zin met dezelfde datum binnen een dag geeft hetzelfde plan terug
--    uit de cache (`hergebruikt: true`). Dat is goedkoop en snel, maar het
--    betekent dat "genereer opnieuw" met exact dezelfde invoer geen nieuw plan
--    oplevert. Wie dat wil veranderen, verandert de dedup en niet deze migratie.
--
-- ⚠️ **De body van `vraag_ai_job` hieronder is overgenomen uit
--    `pg_get_functiondef()` op productie (31-08)**, niet uit een bestand. 0123
--    heeft hem het laatst aangeraakt; hem uit 0103 overtypen zou de
--    tekstgrenzen van 0123 terugdraaien.

alter table public.ai_jobs drop constraint if exists ai_jobs_kind_valid;
alter table public.ai_jobs add constraint ai_jobs_kind_valid
  check (kind in ('milestones', 'weekly_goals', 'milestone_tip', 'plan'));

comment on column public.ai_jobs.goal_id is
  'Het doel waar deze job bij hoort. ⚠️ NULL bij kind = ''plan'' (0134): daar '
  'bestaat het doel nog niet — de job maakt juist het voorstel waaruit het doel '
  'ontstaat. ai_jobs_select staat daarom op user_id en niet op goal_id.';

create or replace function public.vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  dag_limiet constant integer := ai_dag_limiet();
  hash       text;
  gebruikt   integer;
  bestaande  ai_jobs%rowtype;
  nieuwe_id  uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- 0134: 'plan' erbij — één zin en een datum, zonder bestaand doel.
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

  insert into ai_jobs (user_id, goal_id, kind, input, input_hash)
  values (auth.uid(), p_goal_id, p_kind, p_input, hash)
  returning id into nieuwe_id;

  return jsonb_build_object(
    'ok', true, 'job_id', nieuwe_id, 'hergebruikt', false, 'reason', 'queued'
  );
end;
$function$;

comment on function public.vraag_ai_job(text, uuid, jsonb) is
  'De poort voor elke AI-job: quotum, dedup, invoergrens en eigendom. ⚠️ Vier '
  'soorten sinds 0134: milestones, weekly_goals, milestone_tip en plan. Een '
  'soort erbij vraagt hier én in de CHECK op ai_jobs.kind én in de kopie in '
  'src/modules/ai/jobs.ts, die onder test staat.';

revoke all on function public.vraag_ai_job(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.vraag_ai_job(text, uuid, jsonb) to authenticated;
