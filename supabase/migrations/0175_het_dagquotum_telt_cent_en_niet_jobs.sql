-- 0175_het_dagquotum_telt_cent_en_niet_jobs.sql — het dagquotum weegt wat een job
-- kost in plaats van hem te tellen (QS8-296)
--
-- ROLLBACK-PAD:
--   -- ⚠️ In deze volgorde, en de reden is niet vanzelfsprekend: een functielichaam
--   --    is in Postgres een string en geen afhankelijkheid. De drie helpers
--   --    droppen terwijl ai_verbruik() en vraag_ai_job() ze nog aanroepen lukt
--   --    gewoon — en breekt daarna bij de eerste aanroep in plaats van bij de drop.
--   -- 1. ai_verbruik() terug naar de versie uit 0056
--   -- 2. vraag_ai_job() terug naar de versie uit 0136
--   -- 3. daarna pas:
--   drop function if exists public.ai_jobkosten_cent(numeric);
--   drop function if exists public.ai_dag_budget_cent();
--   drop function if exists public.ai_job_voorschot_cent();
--   -- 4. en de vreemde sleutel terug naar cascade — ⚠️ alleen als je het gat
--   --    van hieronder bewust terugzet:
--   alter table public.ai_jobs drop constraint if exists ai_jobs_goal_id_fkey;
--   alter table public.ai_jobs add constraint ai_jobs_goal_id_fkey
--     foreign key (goal_id) references public.goals(id) on delete cascade;
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-296, de laatste openstaande helft van de controleronde van 28-08. De eerste
-- helft is 0123: één job is sinds toen begrensd op `ai_invoer_max()` = 8.000
-- codepunten. Dit is de andere helft: de dág was dat niet.
--
-- 📏 Gemeten op productie op 06-09-2026, vóór deze migratie:
--
--   * `ai_dag_limiet()` geeft **10** en de poort telde met `count(*)`. Tien jobs
--     per dag, ongeacht hun omvang.
--   * `ai_jobs` draagt `input_tokens`, `output_tokens` én `cost_cents` sinds 0001.
--     Er wórdt dus al per job geboekt wat hij kostte; alleen de poort keek er niet naar.
--   * `vraag_ai_job()` op productie is byte voor byte de versie uit 0136
--     (`pg_get_functiondef()`, md5 `d17235a9…`, 3656 tekens — gelijk aan de
--     lokale stack). Het lichaam hieronder is daar de kopie van, niet een
--     overtypsel uit een ouder bestand.
--
-- ⚠️ **En de meting die het meest zegt: er ís geen meting.** `ai_jobs` bevat drie
--    rijen, alle drie `failed` (QS8-195, de CORS-periode), en **nul** met een
--    `cost_cents`. Er is dus geen enkele echte call om een gemiddelde uit te
--    trekken. Elk bedrag hieronder komt daarom uit de grenzen die de code zélf al
--    afdwingt, en dat staat hier met zoveel woorden omdat het een aanname is:
--
--      uitvoer  MAX_TOKENS = 8.000 (doelcoach/index.ts), à 1500 cent/Mtok  → 12,0 cent
--      invoer   ai_invoer_max() = 8.000 codepunten + systeemprompt,
--               ruim geschat 4.000 tokens, à 300 cent/Mtok                →  1,2 cent
--      ------------------------------------------------------------------------
--      één job in het slechtste geval                                     ≈ 13,2 cent
--
--    ⚠️ Die prijzen zijn 300 / 1500 en niet 200 / 1000, en dat is in dezelfde
--       ronde rechtgezet: de introductieprijs van Sonnet 5 liep tot en met
--       31-08-2026 en `PRIJS_PER_MTOK_CENT` stond op 06-09 nog op het oude getal.
--       Zes dagen `cost_cents` staan dus ongeveer een derde te laag geboekt — al
--       is dat vandaag zonder gevolg, want er is geen enkele geslaagde job.
--
--    Tien daarvan is **132 cent per gebruiker per dag** — dat is wat het quotum
--    vandaag toestaat. Op een tier zonder uitgavenplafond is dat de kant waar het
--    misgaat, want de rekening bij Anthropic loopt op tokens en niet op aanroepen.
--
-- ---------------------------------------------------------------------------
-- Wat er verandert: één eenheid, en het is cent
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Twee eenheden naast elkaar is de duurste fout van dit project** (QS8-118:
--    tekstlengte in UTF-16 én in codepunten). Daarom telt hier álles in
--    dollarcent: de poort, `ai_verbruik()` en het budget. Tokens zijn géén
--    eenheid maar twéé — invoer en uitvoer hebben een andere prijs — en cent is
--    precies de omrekening die dat verschil al draagt. `cost_cents` bestaat al,
--    `ai_kosten_per_week()` somt hem al op; er komt dus geen nieuwe grootheid bij.
--
-- ⚠️ **`ai_dag_limiet()` blijft, maar is geen poort meer.** Hij is nu de
--    hoeveelheid *gewone* jobs die een dag past, en het budget is daaruit
--    afgeleid: `budget = limiet × voorschot`. Zo staat het getal 10 nog steeds op
--    precies één plek — dezelfde reden waarom 0056 hem ooit uit twee functies
--    heeft weggehaald.
--
-- ⚠️ **Het voorschot is een bódem en niet alleen een schatting, en dat is de kern.**
--    Een limiet die pas telt als de kosten binnen zijn, stopt de job die het
--    budget opmaakt niet: die is dan al gedraaid en al betaald. Daarom kost élke
--    job minstens het voorschot vanaf het moment dat hij in de tabel staat:
--
--      kosten van een job = greatest(coalesce(cost_cents, 0), voorschot)
--
--    Gevolgen, alle drie bedoeld:
--      * een `queued` of `running` job (nog geen `cost_cents`) eet meteen budget.
--        ⚠️ Dat alléén is niet genoeg om een burst te stoppen — de poort leest en
--        schrijft in twee stappen, en dat is te racen. Wat het wél doet is de
--        burst duur maken zodra de rijen er staan; het serialiseren gebeurt met
--        een `pg_advisory_xact_lock` per gebruiker, zie punt 6 hieronder;
--      * een `failed` job houdt het voorschot — de Edge Function schrijft daar
--        geen kosten, en het commentaar dáár zegt al "een call die halverwege
--        afbreekt is al betaald";
--      * een job die door een gat in de meting op `cost_cents = 0` uitkomt telt
--        alsnog voor het voorschot. Dat gat bestáát: `doelcoach/index.ts` doet
--        `data.usage?.input_tokens ?? 0`, dus een antwoord zonder usage-blok
--        boekt een gratis job. **Nul is geen bedrag, het is een ontbrekend bedrag.**
--
-- 📏 Wat dat samen doet met het plafond van een dag:
--
--      vandaag       10 × 13,2 = 132 cent
--      hierna        budget 30 cent, plus hoogstens één job overschot ≈ 43 cent
--
--    📏 Beide getallen zijn met de hand nagemeten op de lokale stack, met jobs à
--       13,2 cent: de poort weigert bij de derde. Met het budget losgekoppeld van
--       `limiet × voorschot` weigert hij pas bij de achtste — dat verschil ís de
--       wijziging.
--
--    De overschrijding is begrensd op één job in het slechtste geval, en dát is
--    waarom `ai_invoer_max()` en `MAX_TOKENS` ertoe doen: zonder die twee is de
--    laatste job onbegrensd en dan is dit budget een suggestie.
--
-- ⚠️ **Een gewone gebruiker merkt hier niets van, en dat is geen bijvangst maar
--    de eis.** Het voorschot staat op 3 cent — de bovenkant van wat een normale
--    job kost, niet het gemiddelde: bij 300 / 1500 kost een gewone ronde (≈2.500
--    tokens in, ≈1.200 uit) zo'n 2,5 cent. Een normale job kost dus precies één
--    plek van de tien. Wie tien gewone jobs draait, houdt tien gewone jobs. Wie
--    máximale jobs draait, krijgt er drie. Dat is de hele wijziging.
--
-- ⚠️ **Dit getal is een aanname en hoort her-ijkt te worden.** Zodra er honderd
--    echte jobs geboekt zijn, staat het antwoord in `ai_kosten_per_week()` en is
--    dit één regel SQL. Zolang dat niet gebeurd is, is 3 cent de behoedzame kant
--    van een schatting en geen meting.

begin;

-- ---------------------------------------------------------------------------
-- 0. Een verbruiksrij overleeft het doel waar hij bij hoorde
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Zonder dit is al het onderstaande een suggestie**, en het is gevonden
--    door de security-review op deze migratie. `ai_jobs.goal_id` droeg
--    `on delete cascade` naar `goals` (sinds 0001), en `verwijder_doel()` is
--    definer met `execute` voor `authenticated`. Die functie weigert bij een
--    groepskoppeling, weekdoelen, punten of een lopend commitment, en bij een
--    doel ouder dan `bedenktijd()` — maar een vers doel met alléén AI-jobs
--    eronder voldoet aan alle vijf.
--
-- 📏 Nagemeten, en de twee getallen sluiten precies op elkaar aan: `bedenktijd()`
--    is **24 uur** en het quotumvenster is `now() - interval '1 day'`. Élke job
--    die meetelt hangt dus aan een doel dat nog verwijderbaar is. Drie gewone
--    API-verzoeken — doel maken, quotum opmaken, doel weggooien — en de dag
--    begint opnieuw. Onbeperkt, want er staat geen grens op het aantal doelen.
--
-- ⚠️ **`set null` en niet "weigeren te verwijderen".** Het doel mág weg; dat is
--    een bestaande belofte (0058) en die verandert hier niet. Wat niet mag is dat
--    de rekening meegaat. De kolom is al nullable en `plan`-jobs staan er sinds
--    0136 al op NULL, dus dit is geen nieuwe toestand voor welke lezer dan ook.
--
-- ⚠️ Regel 18, vraag 5, in zuivere vorm: elk schakeltje was af — de poort telde
--    goed, `cost_cents` zat dicht — en de keten liep toch rond, langs een knop
--    die niets met de Doelcoach te maken heeft. De test staat in
--    `tests/rls/ai-budget.test.ts` en is met de hand rood gemaakt.

alter table public.ai_jobs drop constraint if exists ai_jobs_goal_id_fkey;
alter table public.ai_jobs add constraint ai_jobs_goal_id_fkey
  foreign key (goal_id) references public.goals(id) on delete set null;

comment on constraint ai_jobs_goal_id_fkey on public.ai_jobs is
  'set null en niet cascade sinds 0175: een verbruiksrij overleeft het doel waar '
  'hij bij hoorde, anders is het dagbudget te resetten door het doel weg te '
  'gooien binnen bedenktijd() (QS8-296).';

-- ---------------------------------------------------------------------------
-- 1. Wat een gewone job kost — de bodem onder elke job
-- ---------------------------------------------------------------------------

-- ⚠️ `pg_catalog, pg_temp` en niet `public, pg_temp`, en dat verschil met de twee
--    functies hieronder is opzet: deze noemt geen enkel object in `public`, net
--    als `ai_invoer_max()` in 0123. Wie hier kopieert, kopieert de nauwste vorm
--    die het geval toelaat.
create or replace function public.ai_job_voorschot_cent()
returns numeric
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $$ select 3::numeric; $$;

comment on function public.ai_job_voorschot_cent() is
  'Wat één gewone AI-job kost, in dollarcent, en tegelijk de bodem: een job die '
  'nog geen cost_cents heeft (queued, running, failed) of er nul boekt, telt '
  'hiervoor. Aanname en geen meting — ai_jobs had nul geslaagde jobs op 06-09-2026. '
  'Her-ijken met ai_kosten_per_week() zodra er echte calls staan (QS8-296).';

revoke all on function public.ai_job_voorschot_cent() from public, anon, authenticated;
grant execute on function public.ai_job_voorschot_cent() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Het dagbudget — afgeleid, zodat het getal 10 op één plek blijft staan
-- ---------------------------------------------------------------------------

create or replace function public.ai_dag_budget_cent()
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$ select ai_dag_limiet() * ai_job_voorschot_cent(); $$;

comment on function public.ai_dag_budget_cent() is
  'Het dagbudget per gebruiker in dollarcent. Afgeleid en niet apart ingesteld: '
  'ai_dag_limiet() gewone jobs à ai_job_voorschot_cent(). Wie het plafond wil '
  'verzetten, verzet één van die twee (QS8-296).';

revoke all on function public.ai_dag_budget_cent() from public, anon, authenticated;
grant execute on function public.ai_dag_budget_cent() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Wat één job van het budget opeet
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Eén functie en niet twee kopieën van dezelfde uitdrukking.** `ai_verbruik()`
--    en `vraag_ai_job()` moeten hetzelfde bedrag zien, anders toont de app "je
--    hebt nog ruimte" terwijl de poort weigert. Dat is exact het geval dat 0056
--    heeft opgeruimd toen het getal 10 in twee functies stond.

create or replace function public.ai_jobkosten_cent(p_cost_cents numeric)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$ select greatest(coalesce(p_cost_cents, 0), ai_job_voorschot_cent()); $$;

comment on function public.ai_jobkosten_cent(numeric) is
  'Wat één job van het dagbudget opeet: zijn echte kosten, met het voorschot als '
  'bodem. NULL en 0 betekenen allebei "kosten onbekend" en tellen voor het '
  'voorschot — nul is geen bedrag maar een ontbrekend bedrag (QS8-296).';

revoke all on function public.ai_jobkosten_cent(numeric) from public, anon, authenticated;
grant execute on function public.ai_jobkosten_cent(numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 4. ai_dag_limiet() betekent iets anders dan gisteren
-- ---------------------------------------------------------------------------
--
-- Alleen het commentaar; de waarde en de rechten blijven zoals ze waren. Wie hier
-- leest dat dit "de poort" is, bouwt de count-poort terug.

comment on function public.ai_dag_limiet() is
  'Het aantal gewone AI-jobs per gebruiker per dag. ⚠️ Sinds 0175 geen poort meer '
  'maar een van de twee getallen waar ai_dag_budget_cent() uit volgt — de poort '
  'telt cent. Enige bron van waarheid voor het aantal (QS8-42, QS8-296).';

-- ---------------------------------------------------------------------------
-- 5. ai_verbruik() rapporteert in dezelfde eenheid als de poort weegt
-- ---------------------------------------------------------------------------
--
-- ⚠️ `jobs` staat er nog steeds bij, en dat is geen tweede eenheid: het is een
--    aantal en geen budget. De poort kijkt er niet naar; het scherm en de tests
--    hebben er iets aan.

create or replace function public.ai_verbruik()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'gebruikt_cent', coalesce(sum(ai_jobkosten_cent(j.cost_cents)), 0),
    'budget_cent', ai_dag_budget_cent(),
    'jobs', count(*)
  )
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';
$$;

comment on function public.ai_verbruik() is
  'Het dagverbruik van de aanroeper in dollarcent, naast het dagbudget. ⚠️ Alleen '
  'over de eigen jobs (auth.uid()) — anders dan ai_kosten_per_week(), dat over '
  'alle gebruikers gaat en daarom service_role blijft (QS8-296).';

-- ⚠️ **De rechten staan hier opnieuw, en dat is geen ruis.** `create or replace`
--    laat de ACL staan, dus vandaag verandert er niets. Maar de énige revoke voor
--    deze functie stond in 0038 en luidt `from public, anon` — precies de vorm
--    die onwrikbare regel 4 verbiedt, want `alter default privileges` deelt in
--    Supabase óók aan `authenticated` uit. Wie hem ooit dropt en opnieuw
--    aanmaakt, erft dat recht zonder dat iemand het besloten heeft. Gemeld door
--    de security-review op deze migratie.
revoke all on function public.ai_verbruik() from public, anon, authenticated;
grant execute on function public.ai_verbruik() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. De poort
-- ---------------------------------------------------------------------------
--
-- ⚠️ Het lichaam is de versie uit 0136 — gecontroleerd tegen `pg_get_functiondef()`
--    op productie, zie de kop. Alleen het quotumblok en de retourwaarde daarvan
--    zijn anders; alles ervóór (soort, invoergrens, eigendom, milestone_tip,
--    cache, dedup) staat er ongewijzigd in.

create or replace function public.vraag_ai_job(p_kind text, p_goal_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  hash          text;
  gebruikt_cent numeric;
  bestaande     ai_jobs%rowtype;
  nieuwe_id     uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
  end if;

  -- 0136: 'plan' erbij — één zin en een datum, zonder bestaand doel.
  if p_kind not in ('milestones', 'weekly_goals', 'milestone_tip', 'plan') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_kind');
  end if;

  -- 0120: tien jobs per dag is pas een quotum als één job begrensd is.
  -- 0175: en een budget per dag is pas een budget als die grens er nog staat —
  --       hij begrenst wat de láátste toegelaten job er nog overheen kan doen.
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

  -- ⚠️⚠️ **Zonder dit slot telt de poort N keer opnieuw bij N verzoeken tegelijk.**
  --    Hij leest wat er verbruikt is en schrijft daarna pas; PostgREST geeft elk
  --    HTTP-verzoek zijn eigen transactie, dus twee gelijktijdige verzoeken zien
  --    allebei hetzelfde oude getal en komen allebei door. 📏 Gemeten met twintig
  --    parallelle aanvragen op een leeg venster: **13 tot 14 toegelaten waar er
  --    10 passen**. Bij vijftig verbindingen is het budget vijftig keer zo groot.
  --
  --    De lock is per gebruiker (`auth.uid()` gehasht) en valt vrij bij commit,
  --    dus er is geen wachtrij tussen gebruikers en niets om op te ruimen.
  --
  -- ⚠️ Dit was géén regressie — de `count(*)`-poort van vóór 0175 was even
  --    raceable — maar het is wél precies de belofte die deze migratie doet, en
  --    een eerdere versie van deze kop beweerde dat een burst er niet langs kwam.
  --    Gevonden door de security-review, en de zin is rechtgezet.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  -- 0175: het quotum weegt cent en telt geen rijen.
  select coalesce(sum(ai_jobkosten_cent(j.cost_cents)), 0) into gebruikt_cent
  from ai_jobs j
  where j.user_id = auth.uid()
    and j.created_at > now() - interval '1 day';

  -- ⚠️ **Geen getal in het antwoord, en dat is met opzet.** De oude versie gaf
  --    `limiet` en `gebruikt` mee zodat de melding het plafond niet zelf hoefde
  --    te noemen. Een plafond in cent is geen getal dat een gebruiker mag zien —
  --    en het aantal jobs zegt niets meer, want de één loopt bij drie tegen deze
  --    muur en de ander bij tien. Wie de cijfers nodig heeft, roept
  --    `ai_verbruik()` aan; die is er precies voor.
  if gebruikt_cent >= ai_dag_budget_cent() then
    return jsonb_build_object('ok', false, 'reason', 'quota_reached');
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
  'De poort voor elke AI-job: budget, dedup, invoergrens en eigendom. ⚠️ Het '
  'quotum weegt sinds 0175 dollarcent (ai_dag_budget_cent()) en telt geen rijen; '
  'quota_reached geeft daarom geen getal terug — cent hoort niet op het scherm en '
  'een aantal jobs zegt niets meer. Zie ai_verbruik(). ⚠️ Vier '
  'soorten sinds 0136: milestones, weekly_goals, milestone_tip en plan. Een soort '
  'erbij vraagt hier én in de CHECK op ai_jobs.kind én in de kopie in '
  'src/modules/ai/jobs.ts, die onder test staat.';

revoke all on function public.vraag_ai_job(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.vraag_ai_job(text, uuid, jsonb) to authenticated;

commit;
