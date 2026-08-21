-- 0056_ai_kosten_en_een_limiet.sql — QS8-42 (EPIC 3)
--
-- ROLLBACK-PAD:
--   drop function if exists ai_kosten_per_week(integer);
--   drop function if exists ai_dag_limiet();
--   -- en vraag_ai_job()/ai_verbruik() terug naar hun eigen `10`.
--
-- ⚠️ **Het dagplafond stond op twee plekken.** `vraag_ai_job()` had
--    `dag_limiet constant integer := 10` en `ai_verbruik()` gaf
--    `'limiet', 10` terug — twee kopieën van hetzelfde getal, in twee functies
--    die het over hetzelfde plafond hebben.
--
--    Dat is precies het patroon waar Q-TODO A32 over gaat: `weekpas_maximum()`
--    staat bewust alléén in de database en níét ook in TypeScript, "juist omdat
--    twee kopieën in dit project al een keer geruisloos uit elkaar zijn
--    gelopen". Hier waren het er alsnog twee, binnen dezelfde database. Wie het
--    plafond verhoogt in `vraag_ai_job` en `ai_verbruik` vergeet, krijgt een app
--    die "3 van de 10" toont terwijl de vierde geweigerd wordt.
--
--    `ai_dag_limiet()` is nu de enige plek. Aanpassen is één regel SQL en geen
--    release — zelfde vorm als `weekpas_maximum()`.
--
-- ⚠️ Het laatste acceptatiecriterium van QS8-42 vraagt een dashboard of query om
--    de totale kosten per week te zien. Dat is `ai_kosten_per_week()`, en hij is
--    **alleen voor `service_role`**: het is Quintens rekening en niet die van een
--    gebruiker, en de uitkomst zou anders zeggen hoeveel andere mensen de coach
--    gebruiken. De query staat in `docs/DEPLOY.md`.

begin;

-- ---------------------------------------------------------------------------
-- 1. Eén plek voor het dagplafond
-- ---------------------------------------------------------------------------

create or replace function public.ai_dag_limiet()
returns integer
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$ select 10; $$;

comment on function public.ai_dag_limiet() is
  'Het aantal AI-jobs per gebruiker per dag. Enige bron van waarheid: '
  'vraag_ai_job() en ai_verbruik() lezen hem allebei hieruit (QS8-42).';

revoke all on function public.ai_dag_limiet() from public, anon;
grant execute on function public.ai_dag_limiet() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. De twee bestaande functies lezen hem nu op
-- ---------------------------------------------------------------------------

create or replace function public.ai_verbruik()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'gebruikt', count(*),
    'limiet', ai_dag_limiet()
  )
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';
$$;

create or replace function public.vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
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

  if p_kind not in ('milestones', 'weekly_goals') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_kind');
  end if;

  -- ⚠️ Eigendom van het doel, niet lidmaatschap van een groep. De Doelcoach
  --    werkt uitsluitend voor de eigenaar; een groepsgenoot heeft hier niets te
  --    zoeken, ook niet als het doel gekoppeld is.
  if p_goal_id is not null and not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_goal');
  end if;

  hash := md5(p_input::text);

  -- Cache: dezelfde vraag is recent al beantwoord.
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

  -- Dedup: dezelfde vraag staat al klaar of draait.
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
$$;

-- ---------------------------------------------------------------------------
-- 3. Wat kost de Doelcoach?
-- ---------------------------------------------------------------------------
--
-- ⚠️ Geen `auth.uid()`-filter: dit gaat over álle gebruikers samen, want het is
--    één rekening bij Anthropic. Juist daarom is hij niet voor `authenticated`:
--    het totaal verraadt hoeveel andere mensen de coach gebruiken.

create or replace function public.ai_kosten_per_week(p_weken integer default 8)
returns table(
  week_start   date,
  jobs         bigint,
  gebruikers   bigint,
  invoertokens bigint,
  uitvoertokens bigint,
  kosten_cent  numeric
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    date_trunc('week', j.created_at)::date,
    count(*),
    count(distinct j.user_id),
    coalesce(sum(j.input_tokens), 0),
    coalesce(sum(j.output_tokens), 0),
    round(coalesce(sum(j.cost_cents), 0)::numeric, 2)
  from ai_jobs j
  where j.created_at > now() - (greatest(1, least(coalesce(p_weken, 8), 52)) * interval '7 days')
  group by 1
  order by 1 desc;
$$;

revoke all on function public.ai_kosten_per_week(integer) from public, anon, authenticated;

commit;
