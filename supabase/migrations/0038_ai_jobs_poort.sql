-- 0038_ai_jobs_poort.sql — QS8-42 (en de poort waar QS8-38 doorheen moet)
--
-- ROLLBACK-PAD:
--   drop function if exists vraag_ai_job(text, uuid, jsonb);
--   drop index    if exists ai_jobs_user_recent_idx;
--   drop index    if exists ai_jobs_hash_idx;
--   -- `ai_jobs` zelf blijft: gedraaide jobs zijn geschiedenis én kostenboeking.
--
-- ⚠️ Waarom dit vóór de Edge Function komt. CLAUDE.md beveiligingsregel 6 laat
--    geen ruimte: "Elke AI-call kost geld: cache, dedupliceer, quota per
--    gebruiker, log kosten per user-id." Een Edge Function die zonder plafond op
--    je API-sleutel kan schieten, merk je pas op de rekening. Deze functie is de
--    enige weg naar een job, en dus de enige plek waar dat plafond hoort.
--
-- ⚠️ `ai_jobs` bestond al sinds 0001 en had alles al: `input_hash` voor dedup,
--    `model`, `input_tokens`, `output_tokens` en `cost_cents` voor de
--    kostenboeking, en een statusmachine. Er was geen schrijver. Dit is dezelfde
--    situatie als `chain_links` gisteren — een tabel die op papier klaar stond en
--    in de praktijk leeg bleef.
--
-- ⚠️ Geen `raise exception`, en dat is hier niet cosmetisch. De les van 0017:
--    PostgREST draait elke RPC in zijn eigen transactie, en gooien rolt die
--    terug — inclusief de job die je net had ingeschreven. Een quotum dat zijn
--    eigen tellingen terugdraait, telt nooit iets.
--
-- ⚠️ `md5(p_input::text)` is stabiel omdat `jsonb` sleutels normaliseert: twee
--    inhoudelijk gelijke invoeren geven dezelfde tekst en dus dezelfde hash,
--    ongeacht de volgorde waarin de client ze opstuurde. Bij `json` (zonder b)
--    zou dat niet gelden en was de dedup een loterij.

-- ---------------------------------------------------------------------------
-- 1. Indexen voor de twee vragen die deze poort stelt
-- ---------------------------------------------------------------------------
--
-- ⚠️ Onwrikbare regel 11: index op elke kolom in WHERE. Zonder deze twee scant
--    elke aanvraag de hele tabel, en dat is precies het pad dat bij groei het
--    vaakst gelopen wordt.

create index if not exists ai_jobs_user_recent_idx
  on ai_jobs (user_id, created_at desc);

create index if not exists ai_jobs_hash_idx
  on ai_jobs (input_hash, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. De poort
-- ---------------------------------------------------------------------------
--
-- ⚠️ Drie uitkomsten die geen nieuwe job opleveren, en ze zijn alle drie goed
--    nieuws voor de gebruiker:
--
--      `cache`     — identieke invoer die binnen een etmaal al beantwoord is.
--                    Kost niets, is meteen klaar, en telt niet mee in het quotum.
--      `bezig`     — dezelfde vraag staat al in de rij of draait. Twee keer op de
--                    knop drukken hoort geen twee facturen op te leveren.
--      `quota`     — de dagelijkse grens. Deze telt álle jobs van de laatste 24
--                    uur, ook mislukte: een kapotte prompt die twintig keer
--                    faalt, kost twintig keer geld.
--
-- ⚠️ Het quotum staat op 10 per dag. Dat is een getal zonder onderbouwing uit
--    data — er zijn nog geen gebruikers — en het is bewust aan de lage kant:
--    een grens die te krap blijkt hoor je van een gebruiker, een grens die te
--    ruim blijkt zie je pas op de rekening.

create or replace function vraag_ai_job(
  p_kind    text,
  p_goal_id uuid,
  p_input   jsonb
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  dag_limiet constant integer := 10;
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

comment on function vraag_ai_job(text, uuid, jsonb) is
  'De enige weg naar een AI-job — QS8-42. Dedupliceert op input_hash, hergebruikt '
  'een antwoord van binnen een etmaal, en houdt een quotum van 10 jobs per '
  'gebruiker per dag. Geeft een reason terug in plaats van te gooien: een '
  'exception zou in een SECURITY DEFINER-RPC de telling terugdraaien (les van 0017).';

revoke all on function vraag_ai_job(text, uuid, jsonb) from public, anon;
grant execute on function vraag_ai_job(text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Wat de gebruiker van zijn verbruik mag zien
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen je eigen verbruik, en geen kosten in euro's. Het aantal is wat je
--    nodig hebt om te weten hoeveel je nog kunt vragen; het bedrag is
--    bedrijfsinformatie en hoort in de logs, niet op een scherm.

create or replace function ai_verbruik()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'gebruikt', count(*),
    'limiet', 10
  )
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';
$$;

comment on function ai_verbruik() is
  'Hoeveel AI-jobs heb je het afgelopen etmaal gebruikt, en wat is de grens. '
  'Geen bedragen: die horen in de logs en niet op een scherm.';

revoke all on function ai_verbruik() from public, anon;
grant execute on function ai_verbruik() to authenticated;
