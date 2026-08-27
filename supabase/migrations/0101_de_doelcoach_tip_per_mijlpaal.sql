-- 0101 — De Doelcoach-tip per mijlpaal (QS8-137, besluit A48 variant 2)
--
-- ⚠️ **DIT IS 0101 EN NIET 0100, EN DAT IS EEN KEUZE.** `0100` is van PR #36
--    (QS8-57, een groep verlaten). Die stond er eerder en houdt het nummer; deze
--    migratie is op verzoek doorgeschoven.
--
--    **Gevolg zolang #36 niet gemerged is: op déze branch ontbreekt 0100 en ziet
--    `npm run migraties:controle` een gat.** Dat is de ernstigste van de drie
--    dingen die dat script vangt, en hier is het geen fout maar een
--    momentopname: het gat sluit zichzelf zodra #36 op `main` staat en deze
--    branch die merge binnenhaalt.
--
--    ⚠️ **Land #36 dus vóór #41.** Landt #36 om welke reden dan ook níet, dan
--    hoort deze migratie alsnog 0100 te worden — een gat laten staan is erger
--    dan een nummer opschuiven, want de bestanden zijn de enige manier om dit
--    schema ergens anders op te bouwen.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK-PAD
-- ---------------------------------------------------------------------------
--   drop trigger if exists mijlpaaltip_weigert_tegenvaller on public.milestone_tips;
--   drop function if exists public.mijlpaaltip_weigert_tegenvaller();
--   drop function if exists public.tip_noemt_tegenvaller(text);
--   drop function if exists public.tip_bevat_emoji(text);
--   drop function if exists public.tegenvaller_woorden();
--   drop table if exists public.milestone_tips;
--   drop index if exists public.ai_jobs_tip_mijlpaal_idx;
--   alter table public.ai_jobs drop constraint ai_jobs_kind_valid;
--   alter table public.ai_jobs add constraint ai_jobs_kind_valid
--     check (kind in ('milestones', 'weekly_goals'));
--   -- en vraag_ai_job(text, uuid, jsonb) terug zonder 'milestone_tip'. ⚠️ Neem
--   --    het lichaam uit pg_get_functiondef() en niet uit 0056: dat bestand is
--   --    ouder dan elke wijziging die er sindsdien in is gegaan.
--
-- ⚠️ Terugrollen kan alleen zolang er geen `milestone_tip`-rij in `ai_jobs`
--    staat. Die moeten er eerst uit, en dat is geschiedenis weggooien.
--
-- Idempotent: `create or replace`, `create table if not exists`, `drop … if exists`.
--
-- ---------------------------------------------------------------------------
-- 1. Wat dit is, en wat het uitdrukkelijk níet vervangt
-- ---------------------------------------------------------------------------
--
-- Besluit A48 (QS8-110) had twee varianten en Quinten koos op 25-08-2026 het
-- gefaseerde advies: variant 3 nu, variant 2 erbovenop zodra er mijlpalen zijn.
-- Variant 3 staat er — een vaste set van vijf regels per doelcategorie in
-- `src/shared/ui/tips.ts`. Dit is variant 2: bij een gehaalde week een korte tip
-- die op je **eigen volgende mijlpaal** slaat.
--
-- ⚠️ **De vaste set blijft de terugval en wordt niet vervangen**, en dat is de
--    reden dat de volgorde andersom is dan de sterkte van de varianten. Wie geen
--    mijlpaal heeft, krijgt bij variant 2 alleen niets — en dat is élke nieuwe
--    gebruiker in zijn eerste week, precies de gebruiker die deze beloning moest
--    vasthouden. Elke route die hieronder geen tip oplevert (geen mijlpaal, geen
--    gegenereerde tip, een mislukte generatie, een uitgeput dagquotum) valt
--    daarom stil terug op `weektip()`.
--
-- ---------------------------------------------------------------------------
-- 2. Een eigen tabel, en niet een kolom op `milestones`
-- ---------------------------------------------------------------------------
--
-- ⚠️ **`milestones_select` loopt via `shares_group_with_goal()`.** Een kolom
--    `coach_tip` op `milestones` zou die tip dus aan élke groepsgenoot geven, en
--    RLS kan geen kolommen beperken — dat is zeven keer eerder misgegaan in dit
--    project. Voor élk nieuw oppervlak is beschermd het antwoord tot iemand het
--    tegendeel besluit, en niemand heeft hier iets anders besloten.
--
--    Dit is woordelijk hetzelfde argument als bij `goal_risk` (migratie 0050),
--    waar de drie risicokolommen om precies deze reden uit `goals` verhuisden.
--    Dezelfde vorm dus: een eigen tabel, eigenaar-only, en voor geen enkele
--    client schrijfbaar.
--
-- ⚠️ **De tip gaat óók niet naar de groep als hij positief is.** Hij is een
--    afgeleide van wat de coach van jouw voortgang vindt, en dat is precies het
--    soort gegeven waarvan de Risico-radar heeft laten zien hoe snel het een
--    uitspraak over je gemiste weken wordt (A17, teruggedraaid in 0050).

create table if not exists public.milestone_tips (
  milestone_id uuid        primary key references public.milestones (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id)      on delete cascade,
  body         text        not null,
  -- ⚠️ De taal waarin de tip gegenereerd is. `weektip()` volgt de taal vanzelf
  --    (hij komt uit de catalogus); een gegenereerde zin doet dat niet. Zonder
  --    deze kolom krijgt iemand die op Engels overschakelt een Nederlandse zin
  --    onder zijn weekdoelkaart, en dat is erger dan de vaste terugval.
  locale       text        not null,
  created_at   timestamptz not null default now(),

  -- ⚠️ Een ondergrens én een bovengrens. De ondergrens vangt een leeg of
  --    afgekapt antwoord ("Ja."); de bovengrens houdt het een regel onder een
  --    weekdoelkaart en geen alinea. `char_length` telt codepunten, en dat is de
  --    eenheid die dit project overal aanhoudt (QS8-118).
  constraint milestone_tips_body_len check (char_length(btrim(body)) between 10 and 300),
  -- Spiegelt `TALEN` in `src/shared/i18n/types.ts`.
  constraint milestone_tips_locale_valid check (locale in ('nl', 'en'))
);

comment on table public.milestone_tips is
  'De gegenereerde Doelcoach-tip per mijlpaal — QS8-137, besluit A48 variant 2. '
  'Eigenaar-only, en voor geen enkele client schrijfbaar: alleen de Edge Function '
  'schrijft hier onder service_role. Een eigen tabel en geen kolom op milestones, '
  'want die tabel is leesbaar voor groepsgenoten en RLS kan geen kolommen '
  'beperken — zelfde argument als goal_risk (0050).';

-- Onwrikbare regel 11, en sinds 0097 een test die er zelf naar zoekt.
create index if not exists milestone_tips_user_idx on public.milestone_tips (user_id);

alter table public.milestone_tips enable row level security;

-- ⚠️ Eigenaar-only, en er is met opzet géén tak voor groepsgenoten.
drop policy if exists milestone_tips_select on public.milestone_tips;
create policy milestone_tips_select on public.milestone_tips
  for select to authenticated
  using (user_id = auth.uid());

-- ⚠️ `using (false)` en niet "geen policy": onwrikbare regel 1 wil op elke tabel
--    een policy voor alle vier de werkwoorden, zodat er stáát dat erover
--    nagedacht is. Zelfde vorm als `groups_delete` sinds 0092.
--
-- ⚠️ En de grants erbij, want een ontbrekende policy weigert stil bij UPDATE en
--    DELETE (valkuil 5) terwijl een ingetrokken tabelrecht luid weigert. Hier is
--    luid het juiste gedrag: er hoort niemand te schrijven.
drop policy if exists milestone_tips_insert on public.milestone_tips;
create policy milestone_tips_insert on public.milestone_tips
  for insert to authenticated with check (false);

drop policy if exists milestone_tips_update on public.milestone_tips;
create policy milestone_tips_update on public.milestone_tips
  for update to authenticated using (false) with check (false);

drop policy if exists milestone_tips_delete on public.milestone_tips;
create policy milestone_tips_delete on public.milestone_tips
  for delete to authenticated using (false);

revoke all on public.milestone_tips from anon;
revoke insert, update, delete on public.milestone_tips from authenticated;
grant select on public.milestone_tips to authenticated;

-- ---------------------------------------------------------------------------
-- 3. De zeef, en waarom hij in de database staat
-- ---------------------------------------------------------------------------
--
-- Het acceptatiecriterium: *"Er staat een zeef op de gegenereerde tekst die een
-- tegenvaller weigert."* De vaste regels hebben zo'n zeef al — maar dat is een
-- **test**, en een test kan een gegenereerde zin niet vooraf lezen.
--
-- ⚠️ **In de database en niet in TypeScript**, om de reden die in dit project
--    het vaakst is opgeschreven: de regel is pas afgedwongen als de dátabase hem
--    afdwingt. De tip komt hier binnen via `service_role` vanuit de Edge
--    Function, en die omzeilt RLS volledig. Een zeef in de app-laag zou dus
--    precies de schrijver overslaan waar hij voor bedoeld is.
--
-- ⚠️ **Eén woordenlijst en twee lezers.** `tegenvaller_woorden()` is de bron;
--    `src/shared/ui/tips.ts` draagt dezelfde lijst voor de vaste regels, en
--    `tests/rls/mijlpaaltip.test.ts` legt de twee naast elkaar op **gelijkheid**.
--    Dat is de les van 0032/0034: twee kopieën van dezelfde lijst lopen uit
--    elkaar zodra niemand ze vergelijkt, en twee insluitingen zijn geen
--    gelijkheid (valkuil 11).

create or replace function public.tegenvaller_woorden()
  returns text[]
  language sql
  immutable
as $$
  select array[
    'achter',
    'gemist',
    'mislukt',
    'helaas',
    'jammer',
    'volgende keer beter',
    'niet gehaald',
    'behind',
    'missed',
    'failed',
    'unfortunately',
    'better luck'
  ];
$$;

comment on function public.tegenvaller_woorden() is
  'De woorden die een tip nooit mag bevatten — domeinregel 7, ook voor tekst die '
  'alleen de eigenaar ziet. Dit is de bron; `src/shared/ui/tips.ts` draagt een '
  'kopie voor de vaste regels en `tests/rls/mijlpaaltip.test.ts` toetst de '
  'gelijkheid van de twee.';

/**
 * ⚠️ Deelstringvergelijking en geen woordgrenzen, en dat is met opzet de ruime
 *    kant. "achtergrond" valt hierdoor ook af — een vals positief — en dat is
 *    hier goedkoop: een geweigerde tip valt terug op de vaste set, en dat is een
 *    volwaardig antwoord. Een gemiste tegenvaller is dat niet.
 */
create or replace function public.tip_noemt_tegenvaller(p_tekst text)
  returns boolean
  language sql
  immutable
as $$
  select exists (
    select 1
    from unnest(tegenvaller_woorden()) as woord
    where position(lower(woord) in lower(coalesce(p_tekst, ''))) > 0
  );
$$;

/**
 * Staat er een emoji in?
 *
 * ⚠️ **Apart van de tegenvallerzeef, want het is een andere regel.** QS8-111:
 *    de app gebruikt zelf geen emoji in tekst — niet in knoppen, niet in
 *    statuslabels, niet in meldingen. De gebruiker mag ze overal typen, maar een
 *    gegenereerde zin is geen gebruikerstekst; die komt van de app.
 *
 * ⚠️ **En `npm run emoji:controle` ziet dit niet.** Dat script leest de
 *    broncode; een zin die een model vanavond bedenkt staat nergens in een
 *    bestand. Voor gegenereerde tekst is deze CHECK het enige slot dat er is.
 */
create or replace function public.tip_bevat_emoji(p_tekst text)
  returns boolean
  language sql
  immutable
as $$
  select coalesce(p_tekst, '') ~ '[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F]'
      or coalesce(p_tekst, '') ~ '[\U0001F000-\U0001FAFF]';
$$;

create or replace function public.mijlpaaltip_weigert_tegenvaller()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  -- ⚠️ Een `raise` en geen stille correctie. Dit is een trigger en geen SECURITY
  --    DEFINER-RPC, dus de les van 0017 speelt hier niet: er valt niets te
  --    bewaren. En stil weigeren zou betekenen dat de Edge Function denkt dat de
  --    tip is opgeslagen terwijl er niets staat.
  if tip_noemt_tegenvaller(new.body) then
    raise exception 'tip_noemt_tegenvaller'
      using hint = 'De gegenereerde tip bevat een tegenvaller. Domeinregel 7 geldt ook hier.';
  end if;

  if tip_bevat_emoji(new.body) then
    raise exception 'tip_bevat_emoji'
      using hint = 'De app gebruikt zelf geen emoji in tekst (QS8-111).';
  end if;

  return new;
end;
$$;

drop trigger if exists mijlpaaltip_weigert_tegenvaller on public.milestone_tips;
create trigger mijlpaaltip_weigert_tegenvaller
  before insert or update on public.milestone_tips
  for each row execute function public.mijlpaaltip_weigert_tegenvaller();

revoke all on function public.mijlpaaltip_weigert_tegenvaller() from public, anon, authenticated;
grant execute on function public.tegenvaller_woorden() to authenticated;
grant execute on function public.tip_noemt_tegenvaller(text) to authenticated;
grant execute on function public.tip_bevat_emoji(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Het derde soort job
-- ---------------------------------------------------------------------------
--
-- ⚠️ **Eén keer per mijlpaal, en dat is iets anders dan de cache van
--    `vraag_ai_job()`.** Die cache kijkt 24 uur terug op `input_hash`; hij
--    voorkomt een dubbele vraag op één dag, niet een tweede vraag over een maand.
--    "Eén keer per mijlpaal, voor altijd" wordt hier afgedwongen door de
--    primaire sleutel op `milestone_tips.milestone_id` plus een
--    `on conflict do nothing` bij het wegschrijven: bestaat de tip al, dan
--    verandert er niets. En de app vraagt niet eens, want hij vraagt alleen als
--    er nog geen rij is.

-- ⚠️ Zonder deze index scant de pogingentelling hieronder de hele jobtabel, en
--    dat gebeurt bij élke goedgekeurde week. Partieel op het kind, want voor de
--    andere twee soorten bestaat `milestone_id` niet.
create index if not exists ai_jobs_tip_mijlpaal_idx
  on public.ai_jobs ((input->>'milestone_id'))
  where kind = 'milestone_tip';

alter table public.ai_jobs drop constraint if exists ai_jobs_kind_valid;
alter table public.ai_jobs add constraint ai_jobs_kind_valid
  check (kind in ('milestones', 'weekly_goals', 'milestone_tip'));

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

  -- ⚠️ `milestone_tip` erbij sinds 0101 (QS8-137). Deze lijst en
  --    `ai_jobs_kind_valid` moeten gelijk blijven; ze staan daarom in dezelfde
  --    migratie en er is geen enkele reden om ze ooit los te wijzigen.
  if p_kind not in ('milestones', 'weekly_goals', 'milestone_tip') then
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
$$;

comment on function public.vraag_ai_job(text, uuid, jsonb) is
  'De poort voor élke AI-job: eigendomstoets, cache, dedup en het dagquotum. '
  'Sinds 0101 met een derde soort, `milestone_tip` (QS8-137) — dat quotum is '
  'gedeeld met de mijlpalen en de weekstappen, en dat is met opzet: het is één '
  'rekening.';
