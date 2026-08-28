-- 0123_tekst_zonder_grens_is_opslag_van_een_ander.sql — veertien lengtegrenzen
-- en een bovengrens op de AI-invoer
--
-- ROLLBACK-PAD:
--   alter table public.chat_messages drop constraint if exists chat_messages_attachment_url_len;
--   alter table public.commitments   drop constraint if exists commitments_image_url_len;
--   alter table public.completions   drop constraint if exists completions_attachment_url_len;
--   alter table public.goals         drop constraint if exists goals_description_len;
--   alter table public.goals         drop constraint if exists goals_identity_statement_len;
--   alter table public.groups        drop constraint if exists groups_icon_len;
--   alter table public.groups        drop constraint if exists groups_invite_code_len;
--   alter table public.groups        drop constraint if exists groups_tz_len;
--   alter table public.milestones    drop constraint if exists milestones_description_len;
--   alter table public.milestones    drop constraint if exists milestones_title_len;
--   alter table public.profiles      drop constraint if exists profiles_avatar_url_len;
--   alter table public.profiles      drop constraint if exists profiles_tz_len;
--   alter table public.weekly_goals  drop constraint if exists weekly_goals_ceiling_text_len;
--   alter table public.weekly_goals  drop constraint if exists weekly_goals_floor_text_len;
--   alter table public.ai_jobs       drop constraint if exists ai_jobs_input_len;
--   drop function if exists public.tekstgrenzen_bewaking();
--   drop function if exists public.ai_invoer_max();
--   vraag_ai_job() terug naar de versie van 0103 (de tak `invoer_te_groot` eruit).
--
-- ---------------------------------------------------------------------------
-- Wat er mis was
-- ---------------------------------------------------------------------------
--
-- Bevinding 4 van de controleronde van 28-08. Die noemde zes tekstkolommen
-- zonder lengtegrens. Generiek nagemeten zijn het er **veertien**: elke
-- tekstkolom die `authenticated` mag schrijven en waar geen enkele CHECK de
-- lengte begrenst.
--
-- ⚠️ **De Zod-schema's begrenzen ze wél, en dat is precies het probleem.**
--    `doelSchema` zegt `description` maximaal 2000 en `identity_statement`
--    maximaal 200; `mijlpaalSchema` en `weekly-schemas.ts` doen hetzelfde. Maar
--    een verzoek aan PostgREST komt langs geen enkel Zod-schema. Elk onderdeel
--    klopt en het geheel lekt — onwrikbare regel 18, en de reden dat regel 3
--    ("alle input servergevalideerd") over de sérver gaat.
--
-- ⚠️ **Vier ervan stonden niet in de bevinding en zijn hier de moeite waard.**
--    `chat_messages.attachment_url` en `commitments.image_url` wórden door een
--    CHECK genoemd — de eerste door "er moet inhoud zijn", de tweede door de
--    https-vorm — maar geen van beide begrenst een lengte. Een controle die
--    "wordt genoemd door een CHECK" als dekking telt, laat die twee door; deze
--    migratie telt daarom alleen een échte lengtetoets, plus een waardenlijst
--    (`= ANY (array[...])`), want die begrenst de lengte vanzelf.
--
-- ⚠️ **`groups.tz` en `profiles.tz` krijgen hier een lengtegrens en geen
--    geldigheidstoets, en dat is met opzet.** De langste IANA-zonenaam is 30
--    tekens (`America/North_Dakota/New_Salem`), dus 64 is ruim. Dat `profiles.tz`
--    onzin mag bevatten is een ánder gat — het legde in augustus de hele rollover
--    om — en staat als **A38** open. `groups.tz` heeft dezelfde vorm: 0019
--    valideert hem in `create_group()`, maar dezelfde migratie geeft
--    `grant update (…, tz, …)` aan `authenticated`, dus een beheerder loopt om
--    die validatie heen. **Deze migratie lost dat niet op en doet ook niet alsof.**
--
-- ⚠️ **De grenzen zijn gelijk aan wat de client al hanteert**, en die richting is
--    de veilige. Zod's `.max()` telt UTF-16-eenheden en `char_length` telt
--    codepunten, en `.length` is altijd ≥ `char_length` — dus alles wat het
--    formulier goedkeurt, past hier. Andersom (een ondergrens) zou het gevaarlijk
--    zijn; zie de emoji-sectie in CLAUDE.md. `milestones.title` krijgt daarom een
--    ondergrens van 1 en niet van 3, gelijk aan `goals_title_len`.
--
-- ---------------------------------------------------------------------------

alter table public.chat_messages drop constraint if exists chat_messages_attachment_url_len;
alter table public.chat_messages add constraint chat_messages_attachment_url_len
  check (attachment_url is null or char_length(attachment_url) <= 1000);

alter table public.commitments drop constraint if exists commitments_image_url_len;
alter table public.commitments add constraint commitments_image_url_len
  check (image_url is null or char_length(image_url) <= 1000);

alter table public.completions drop constraint if exists completions_attachment_url_len;
alter table public.completions add constraint completions_attachment_url_len
  check (attachment_url is null or char_length(attachment_url) <= 1000);

alter table public.goals drop constraint if exists goals_description_len;
alter table public.goals add constraint goals_description_len
  check (description is null or char_length(description) <= 2000);

alter table public.goals drop constraint if exists goals_identity_statement_len;
alter table public.goals add constraint goals_identity_statement_len
  check (identity_statement is null or char_length(identity_statement) <= 200);

alter table public.groups drop constraint if exists groups_icon_len;
alter table public.groups add constraint groups_icon_len
  check (icon is null or char_length(icon) <= 100);

alter table public.groups drop constraint if exists groups_invite_code_len;
alter table public.groups add constraint groups_invite_code_len
  check (char_length(invite_code) between 1 and 64);

alter table public.groups drop constraint if exists groups_tz_len;
alter table public.groups add constraint groups_tz_len
  check (tz is null or char_length(tz) <= 64);

alter table public.milestones drop constraint if exists milestones_description_len;
alter table public.milestones add constraint milestones_description_len
  check (description is null or char_length(description) <= 2000);

alter table public.milestones drop constraint if exists milestones_title_len;
alter table public.milestones add constraint milestones_title_len
  check (char_length(title) >= 1 and char_length(title) <= 200);

alter table public.profiles drop constraint if exists profiles_avatar_url_len;
alter table public.profiles add constraint profiles_avatar_url_len
  check (avatar_url is null or char_length(avatar_url) <= 1000);

alter table public.profiles drop constraint if exists profiles_tz_len;
alter table public.profiles add constraint profiles_tz_len
  check (tz is null or char_length(tz) <= 64);

alter table public.weekly_goals drop constraint if exists weekly_goals_ceiling_text_len;
alter table public.weekly_goals add constraint weekly_goals_ceiling_text_len
  check (ceiling_text is null or char_length(ceiling_text) <= 200);

alter table public.weekly_goals drop constraint if exists weekly_goals_floor_text_len;
alter table public.weekly_goals add constraint weekly_goals_floor_text_len
  check (floor_text is null or char_length(floor_text) <= 200);

-- ---------------------------------------------------------------------------
-- Het dagquotum telde jobs en niet tekens
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`vraag_ai_job()` schreef zijn eigen risico al op en begrensde het niet.**
--    In de kop van de `milestone_tip`-tak staat: *"zou de functie tekst uit het
--    verzoek gebruiken, dan is het quotum een formaliteit — dan stuur je gewoon
--    je eigen prompt en betaalt Quinten de rekening."* Voor `milestones` en
--    `weekly_goals` stelt de client de invoer wél samen, en daar stond geen enkele
--    bovengrens op. Een invoer van 450.000 tekens werd geaccepteerd, opgeslagen
--    in `ai_jobs.input` en door de Edge Function naar het model gestuurd.
--
--    Tien jobs per dag klinkt als een quotum. Tien jobs van elk een kwart miljoen
--    tekens is het niet.
--
-- ⚠️ **De grens is gemeten aan wat een echte aanvraag nodig heeft**, niet gegokt.
--    Het zwaarste geval is `weekly_goals` met een volledig interview: doeltitel
--    (≤ 200) + mijlpaaltitel (≤ 200) + vijf interviewantwoorden van elk ≤ 1000
--    (`ANTWOORD_MAX` in `interview-schemas.ts`) + twee datums + de sleutels. Dat
--    is ruim onder de 6.000 tekens. **8.000 is dus twee keer wat het formulier
--    maximaal kan produceren** en tegelijk een factor 56 minder dan wat er nu
--    doorheen kwam.
--
-- ⚠️ Codepunten en geen UTF-16-eenheden, dezelfde eenheid als hierboven en als
--    `telTekens()` in `src/shared/tekst`.
--
-- ⚠️ De grens staat in een eigen functie en niet als getal in de CHECK én in
--    `vraag_ai_job()`. Twee plekken met hetzelfde getal is één plek te veel —
--    dezelfde reden als bij `ai_dag_limiet()` in 0056.

create or replace function public.ai_invoer_max()
returns integer
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$ select 8000; $$;

comment on function public.ai_invoer_max() is
  'De bovengrens op de invoer van één AI-job, in codepunten. Twee keer wat het '
  'formulier maximaal kan opleveren; zie 0123.';

revoke all on function public.ai_invoer_max() from public, anon, authenticated;
grant execute on function public.ai_invoer_max() to service_role;

-- ⚠️ De CHECK roept de functie aan in plaats van het getal te herhalen. Dat mag
--    omdat hij `immutable` is; wat het níét doet is bestaande rijen opnieuw
--    toetsen als het getal ooit omlaag gaat. Bij een verlaging hoort dus een
--    `validate constraint`-ronde, en bij een verhoging niets.
alter table public.ai_jobs drop constraint if exists ai_jobs_input_len;
alter table public.ai_jobs add constraint ai_jobs_input_len
  check (char_length(input::text) <= public.ai_invoer_max());

-- ---------------------------------------------------------------------------
-- En de poort zelf, zodat de gebruiker een reden krijgt in plaats van een
-- constraintfout
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- ⚠️ `milestone_tip` erbij sinds 0103 (QS8-137). Deze lijst en
  --    `ai_jobs_kind_valid` moeten gelijk blijven; ze staan daarom in dezelfde
  --    migratie en er is geen enkele reden om ze ooit los te wijzigen.
  if p_kind not in ('milestones', 'weekly_goals', 'milestone_tip') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_kind');
  end if;

  -- -------------------------------------------------------------------------
  -- ⚠️ De bovengrens op de invoer — 0123
  -- -------------------------------------------------------------------------
  --
  -- Tien jobs per dag is pas een quotum als één job begrensd is. Tot 0123 stond
  -- hier niets: een invoer van 450.000 tekens werd geaccepteerd, opgeslagen en
  -- naar het model gestuurd. De grens staat in `ai_invoer_max()` en niet als
  -- getal op twee plekken.
  --
  -- ⚠️ Vóór de eigendomstoets, want dit kost geen query.
  if p_input is null or char_length(p_input::text) > ai_invoer_max() then
    return jsonb_build_object(
      'ok', false, 'reason', 'invoer_te_groot', 'max', ai_invoer_max()
    );
  end if;

  -- ⚠️ Eigendom van het doel, niet lidmaatschap van een groep. De Doelcoach
  --    werkt uitsluitend voor de eigenaar; een groepsgenoot heeft hier niets te
  --    zoeken, ook niet als het doel gekoppeld is.
  if p_goal_id is not null and not exists (
    select 1 from goals g where g.id = p_goal_id and g.owner_id = auth.uid()
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_your_goal');
  end if;

  -- -------------------------------------------------------------------------
  -- De poort voor `milestone_tip` — QS8-137
  -- -------------------------------------------------------------------------
  --
  -- ⚠️ **De invoer is precies één sleutel, en dat is het belangrijkste slot van
  --    deze hele feature.** De kop van `doelcoach/index.ts` schrijft het al op:
  --    zou de functie tekst uit het verzoek gebruiken, dan is het quotum een
  --    formaliteit — dan stuur je gewoon je eigen prompt en betaalt Quinten de
  --    rekening. Voor de mijlpalen en de weekstappen wordt de invoer door de
  --    client samengesteld en dat is daar een bewuste afweging (de doeltitel is
  --    zíjn tekst). Hier niet: een tip vraagt om één id, en de Edge Function
  --    haalt de titel en de omschrijving zélf op.
  if p_kind = 'milestone_tip' then
    if p_input is null
       or jsonb_typeof(p_input) <> 'object'
       or (select count(*) from jsonb_object_keys(p_input)) <> 1
       or p_input->>'milestone_id' is null then
      return jsonb_build_object('ok', false, 'reason', 'ongeldige_invoer');
    end if;

    -- De mijlpaal moet bestaan, bij dit doel horen en nog te doen zijn. Een tip
    -- voor een gehaalde mijlpaal is een betaalde call zonder ontvanger.
    if not exists (
      select 1 from milestones m
      where m.id      = (p_input->>'milestone_id')::uuid
        and m.goal_id = p_goal_id
        and m.status  = 'todo'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'mijlpaal_onbruikbaar');
    end if;

    -- ⚠️ **Er is er al een: klaar, en geen job.** Dit is de eigenlijke betekenis
    --    van "één keer per mijlpaal", en het is de reden dat de cache verderop
    --    hier niet volstaat: die vervalt na 24 uur. Vanaf uur 25 zou dezelfde
    --    vraag elke week opnieuw een factuur opleveren, en niets wordt daar rood
    --    van behalve de rekening.
    if exists (
      select 1 from milestone_tips mt
      where mt.milestone_id = (p_input->>'milestone_id')::uuid
    ) then
      return jsonb_build_object('ok', true, 'hergebruikt', true, 'reason', 'al_aanwezig');
    end if;

    -- ⚠️ **En een bovengrens op het aantal pogingen.** Zonder deze telling kost
    --    een mijlpaaltitel waar het model steeds een geweigerde tip voor
    --    bedenkt, élke week opnieuw geld — en de gebruiker ziet daar niets van,
    --    want hij krijgt gewoon de vaste regel. Drie is genoeg om een incident
    --    te overleven en weinig genoeg om niet te blijven betalen.
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
$function$;

-- ---------------------------------------------------------------------------
-- En een bewaking, want de vijftiende kolom komt vanzelf
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Veertien kolommen repareren en het daarbij laten, is de fout van 0101 nog
--    een keer.** De regel is uit te rekenen: een tekstkolom die `authenticated`
--    mag schrijven, hoort een lengtegrens te hebben.
--
-- ⚠️ **Twee soorten dekking tellen, en precies twee.**
--    * Een échte lengtetoets: `char_length(kolom)` of `length(kolom)` in een CHECK.
--    * Een waardenlijst: `kolom = ANY (array[...])`. Die begrenst de lengte
--      vanzelf en is de vorm van elke `status`- en `type`-kolom in dit schema.
--
--    Wat **niet** telt is "de kolom wordt ergens door een CHECK genoemd". Dat was
--    de eerste versie van deze regel, en hij liet `chat_messages.attachment_url`
--    en `commitments.image_url` door: die worden genoemd door respectievelijk een
--    inhoudseis en een https-vorm, en geen van beide zegt iets over lengte.
--    Een https-URL kan een megabyte zijn.

create or replace function public.tekstgrenzen_bewaking()
returns table (tabel text, kolom text)
language sql
stable
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
  with schrijfbaar as (
    select distinct c.relname::text as tabel, a.attname::text as kolom, c.oid as tabeloid
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in ('text'::regtype, 'varchar'::regtype)
      and (has_column_privilege('authenticated', c.oid, a.attname, 'INSERT')
        or has_column_privilege('authenticated', c.oid, a.attname, 'UPDATE'))
  ),
  toetsen as (
    select k.conrelid, pg_get_constraintdef(k.oid) as def
    from pg_constraint k
    where k.contype = 'c'
  )
  select s.tabel, s.kolom
  from schrijfbaar s
  where not exists (
    select 1 from toetsen t
    where t.conrelid = s.tabeloid
      and t.def ~ ('(char_)?length\([^)]{0,12}\m' || s.kolom || '\M')
  )
  and not exists (
    select 1 from toetsen t
    where t.conrelid = s.tabeloid
      and t.def ~ ('\m' || s.kolom || '\M = ANY')
  )
  order by 1, 2;
$$;

revoke all on function public.tekstgrenzen_bewaking() from public, anon, authenticated;
grant execute on function public.tekstgrenzen_bewaking() to service_role;
