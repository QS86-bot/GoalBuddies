-- 0260_goal_events_krijgt_een_grens_op_vorm_en_omvang.sql — `old_value` en
-- `new_value` krijgen een grens op omvang én op welke sleutels erin mogen
-- (QS8-464).
--
-- ROLLBACK-PAD:
--   alter table public.goal_events drop constraint if exists goal_events_waarde_omvang;
--   alter table public.goal_events drop constraint if exists goal_events_waarde_sleutels;
--   drop function if exists public.goal_event_sleutels_kloppen(text, jsonb, jsonb);
--   Geen kolom, policy of bestaande CHECK gewijzigd.
--
-- ⚠️ **Vóór het deployen: tel wat er niet doorheen komt.** Productie staat op
--    `0221` en deze tabel is append-only, dus er kan van alles in staan wat deze
--    twee grenzen niet halen. Beide CHECKs gaan er daarom als `not valid` in en
--    worden daarna met zoveel woorden gevalideerd. Wat dat oplevert is een
--    **weigering op een genoemde stap**: faalt het, dan staat er
--    `validate constraint goal_events_waarde_sleutels` in de melding en niet een
--    `add constraint` waarvan je nog moet uitzoeken wélke rij hem tegenhield.
--
--    ⚠️ Wat het **niet** oplevert is een halve toestand om op door te bouwen.
--    `supabase db push` en de MCP-tool draaien elke migratie in een transactie,
--    dus een omgevallen `validate` rolt óók de `not valid` terug; alleen de
--    lokale opbouw (`schema-opbouwen.sh`, `psql -f` zonder `--single-transaction`)
--    laat hem staan. Reken dus niet op "de grens staat alvast voor nieuwe rijen"
--    — tel vooraf:
--
--      select count(*) filter (
--               where char_length(coalesce(old_value, 'null'::jsonb)::text) > 4000
--                  or char_length(coalesce(new_value, 'null'::jsonb)::text) > 4000
--             ) as te_groot,
--             count(*) filter (
--               where not public.goal_event_sleutels_kloppen(event_type, old_value, new_value)
--             ) as ongewogen
--        from public.goal_events;
--
--    (De tweede kolom kan pas nádat de functie hieronder er is. Is er iets, dan
--    is dat een besluit voor Quinten en geen ding dat een migratie stilzwijgend
--    opruimt — deze tabel is een auditspoor.)
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- 📏 Middel-rij 519 uit `docs/ENGINEER-REVIEW.md` (06-09-2026), op 13-09
--    nagemeten. De enige CHECK op deze tabel was `goal_events_type_valid` — een
--    allowlist van vier `event_type`-waarden. Op `old_value` en `new_value` stond
--    **niets**: geen vorm, geen grens, geen type. `logGoalEvent()` neemt
--    `oud: Json, nieuw: Json` en geeft ze ongewijzigd door.
--
--    Als gewone `authenticated` met eigen JWT, end-to-end:
--
--      insert into goal_events (..., new_value)
--      values (..., jsonb_build_object('rommel', repeat('x', 5000000)));
--      -> GELUKT: 56 kB in één rij
--
--    Vijf miljoen tekens, geaccepteerd. Op de gratis tier is dat een reële
--    vector, en deze tabel is append-only: het gaat er nooit meer uit.
--
-- ⚠️ **En elke gekoppelde groep leest dit mee** via `goal_events_select`.
--    `goal_events_bewaking()` (0181) bewaakt de **naam** van een gebeurtenis en
--    niet de **inhoud**; zet een toekomstige feature een toelichting in
--    `new_value`, dan leest groep A wat voor groep B bedoeld was terwijl de
--    allowlist onveranderd op vier staat. Deze tabel is langs precies die weg al
--    een keer gelekt (0085).
--
-- ---------------------------------------------------------------------------
-- Twee grenzen, want één is te weinig
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen een omvangsgrens houdt een vrije-tekstveld `reden` niet tegen — en
--    dát is het lek uit de rij. Alleen een sleutelgrens laat een toegestane
--    sleutel met een megabyte erin staan. Daarom allebei.
--
-- ⚠️ `char_length(...::text)` en niet `pg_column_size()`: dat laatste meet de
--    gecomprimeerde opslag na TOAST en is geen stabiele grondslag voor een CHECK.
--    Gemeten: dezelfde 5 MB gaf `56 kB` als kolomgrootte.
--
-- ---------------------------------------------------------------------------
-- Een register schrijf je van de schrijver af, niet van de naam af
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Dit register heeft één ronde lang de verkeerde soort gehad, en de
--    must-allow eronder was het ermee eens.** 📏 `straffen_teruggezet` heet als
--    een boolean en is een `integer` (zie de registerkop hieronder). De eerste
--    versie zei `boolean`, en de toets in `goalgebeurtenissen.test.ts` voedde
--    `'straffen_teruggezet', true` aan — een vorm die geen enkele schrijver
--    produceert. Register en toets waren het dus met elkáár eens en allebei
--    oneens met het schema, en de suite bleef groen op 29 toetsen.
--
--    Wat het ving was `tests/rls/uitstelbeslisser-ziet-de-straf.test.ts`, dat de
--    échte RPC aanroept: twee toetsen rood, en de reden stond niet in de melding
--    maar in het serverlog (`DETAIL: Failing row contains …`).
--
-- ⚠️ **De les is vraag 2 van regel 18 op een fixture in plaats van op een test:**
--    een must-allow die je uit je eigen register overschrijft, toetst je register
--    tegen zichzelf. Hij hoort uit de schrijver te komen. Daarom staat er sinds
--    deze ronde een toets in `goalgebeurtenissen.test.ts` die `zet_streefdatum()`
--    écht aanroept, en verwijst diezelfde suite naar de straf-suite voor
--    `beslis_deadline_verzoek()` — de enige twee schrijvers in de database.
--
-- ---------------------------------------------------------------------------

-- ⚠️⚠️ **4000, en dat getal is gemeten en niet geschat.** 📏 Hier stond eerst
--    2000 met de onderbouwing *"ruim tienvoudig boven het huidige maximum"*, en
--    de security-review heeft dat weerlegd. De legitieme payload van vandaag is
--    **213** tekens (`created` met een titel van 200) en **112**
--    (`deadline_moved` in zijn echte vorm) — maar dat is het geval waarin de
--    titel geen ontsnapping vraagt. De json-tekst hangt aan wát er in die titel
--    staat, en dat is per teken tot zesmaal zo lang:
--
--      200 gewone tekens ->  213      200 aanhalingstekens ->  413
--      200 emoji         ->  213      200 stuurtekens      -> 1213
--
--    1213 is dus het slechtste geval dat het schema vandaag toestaat, niet 213.
--    Tienvoudig was het nooit; op 2000 was het 1,65×.
--
-- ⚠️⚠️ **Dit getal is afgeleid van `goals_title_len`, en dat is een koppeling
--    tussen twee migraties die git niet ziet.** Gaat die CHECK ooit van 200 naar
--    bijvoorbeeld 500, dan wordt het slechtste geval hier 3013 — onder 4000, maar
--    ruim bóven de 2000 die hier eerst stond, en dan weigert deze grens een titel
--    die het schema zelf goedkeurt. Dat is een dichte deur en geen grens.
--    Verhoog je `goals_title_len`, kom dan hier langs.
--
--    Tegen de misbruikkant maakt 2000 of 4000 niets uit: allebei liggen ze ruim
--    duizendvoudig onder de vijf miljoen hierboven. Tegen de valse weigering
--    maakt het alles uit, en dat is de kant waar deze grens kan omvallen zonder
--    dat iemand het merkt.
alter table public.goal_events drop constraint if exists goal_events_waarde_omvang;

alter table public.goal_events
  add constraint goal_events_waarde_omvang
  check (
    char_length(coalesce(old_value, 'null'::jsonb)::text) <= 4000
    and char_length(coalesce(new_value, 'null'::jsonb)::text) <= 4000
  )
  not valid;

alter table public.goal_events validate constraint goal_events_waarde_omvang;

-- ---------------------------------------------------------------------------

-- ⚠️ `immutable`: hij hangt alleen van zijn invoer af. Dat moet ook, want de
--    CHECK hieronder roept hem aan.
--
-- ⚠️ **Het register staat in het functielichaam en niet in een tabel** — zelfde
--    reden als `sleutelzetters()`: in één blik naast de code te lezen, geen RLS
--    en geen grant nodig, en niet leeg te raken zonder dat iemand het merkt.
--    ⚠️ Breid je het uit, kopieer het lichaam dan van `main` (registerdrift).
--
-- ⚠️⚠️ **Een niet-object faalt dicht.** `jsonb_object_keys()` wérpt op een
--    scalar of een array, en een CHECK die werpt is een schrijffout en geen
--    weigering. Daarom eerst `jsonb_typeof(...) = 'object'`: alles wat geen
--    object en geen SQL-NULL is, wordt geweigerd — óók `'null'::jsonb`.
--    `goal_events_bewaking()` leerde dat een bewaking die niet zegt dat hij het
--    niet begreep, gevaarlijker is dan geen bewaking.
--
-- ⚠️⚠️ **En de soort van de wáárde telt mee, niet alleen de sleutel.** 📏 Dat
--    stond er eerst niet, en de security-review mat het gat: `jsonb_object_keys()`
--    geeft alleen de **buitenste** sleutels, dus
--
--      new_value = {"title": {"reden": "…", "gemiste_week": true}}
--
--    kwam er gewoon in — één laagje diep weggestopt onder een sleutel die mág, en
--    met ruimte tot aan de omvangsgrens (1846 tekens gemeten met 1800 tekens
--    vrije tekst erin). Dat is woordelijk het scenario van reviewrij 519, en de
--    toets die een plátte `reden` weigerde liet de geneste door. Een sleutelgrens
--    zonder soortgrens is een grens om een deur die openstaat.
create or replace function public.goal_event_sleutels_kloppen(
  p_type text, p_oud jsonb, p_nieuw jsonb
)
returns boolean
language sql
immutable
-- ⚠️⚠️ **`'pg_temp'` staat er met zoveel woorden bij, en achteraan.** 📏 Dit
--    stond er eerst niet en drie grendels werden er rood van in dezelfde run —
--    `zoekpadschaduw`, `hulpfuncties` en `definer-aanroepertoets`. Noemt een
--    `search_path` `pg_temp` niet, dan zet Postgres hem **vooraan**, en dan kan
--    een tijdelijk object in de sessie van de aanroeper een relatie- of typenaam
--    overschaduwen. Exact dezelfde fout is één dag eerder in 0256 gemaakt en
--    daar opgeschreven; hier stond hij opnieuw.
set search_path to 'pg_catalog', 'pg_temp'
as $$
  with toegestaan(gebeurtenis, kant, sleutel, soort) as (
    -- Het register, per gebeurtenis, per kant, **met de soort van de waarde**.
    -- De schrijvers in het gedeployde schema, en wat ze er écht in zetten:
    --   created         new  {title: string}                            (client)
    --   archived        beide leeg                                      (client)
    --   completed       beide leeg                                      (client)
    --   deadline_moved  oud  {target_date: string}                      (zet_streefdatum,
    --                   new  {target_date: string,                       beslis_deadline_verzoek)
    --                         request_id: string,
    --                         straffen_teruggezet: number}
    --
    -- ⚠️⚠️ **`straffen_teruggezet` is een getal en geen boolean, en dat is met de
    --    hand gemeten en niet aan de naam afgelezen.** 📏 In
    --    `beslis_deadline_verzoek()` staat `teruggezet integer := 0`, gevuld met
    --    `get diagnostics teruggezet = row_count` — het is het áántal straffen dat
    --    vooruitgeschoven is, niet de vraag óf er een vooruitgeschoven is. De
    --    eerste versie van dit register zei `boolean`, want zo léést die naam, en
    --    toen weigerde deze CHECK élk akkoord op een uitstelverzoek.
    values
      ('created',        'nieuw', 'title',               'string'),
      ('deadline_moved', 'oud',   'target_date',         'string'),
      ('deadline_moved', 'nieuw', 'target_date',         'string'),
      ('deadline_moved', 'nieuw', 'request_id',          'string'),
      ('deadline_moved', 'nieuw', 'straffen_teruggezet', 'number')
  ),
  waarde(kant, v) as (
    values ('oud', p_oud), ('nieuw', p_nieuw)
  )
  select not exists (
    select 1
    from waarde w
    where w.v is not null
      and (
        -- Geen object: dicht. Zie de kop.
        jsonb_typeof(w.v) <> 'object'
        -- Of er zit een sleutel in die niet gewogen is, óf zijn waarde heeft een
        -- andere soort dan gewogen is.
        or exists (
          select 1
          from jsonb_object_keys(w.v) k
          where not exists (
            select 1 from toegestaan t
            where t.gebeurtenis = p_type
              and t.kant = w.kant
              and t.sleutel = k
              and t.soort = jsonb_typeof(w.v -> k)
          )
        )
      )
  );
$$;

comment on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb) is
  'Of de sleutels in old_value/new_value gewogen zijn voor dit event_type — QS8-464. '
  'Het register staat in het lichaam; goal_events_waarde_sleutels dwingt het af.';

-- ⚠️⚠️ **`revoke` én daarna een `grant` aan `authenticated`.** 📏 De les van
--    QS8-453: Postgres toetst EXECUTE op een functie in een CHECK op het moment
--    van schrijven, dus zónder deze grant valt élke `goal_events`-insert van een
--    ingelogde gebruiker om op `permission denied` — ook een volkomen normale.
--    Gemeten, met de grant in een teruggerolde transactie weggehaald: een
--    doodgewone `created`-insert door de eigenaar van het doel valt om met
--    `permission denied for function goal_event_sleutels_kloppen`. De must-allow
--    in de suite loopt daarom langs de échte schrijfroute en niet als `postgres`
--    — die is eigenaar van de functie en heeft EXECUTE hoe dan ook.
revoke execute on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb)
  to authenticated;

alter table public.goal_events drop constraint if exists goal_events_waarde_sleutels;

alter table public.goal_events
  add constraint goal_events_waarde_sleutels
  check (public.goal_event_sleutels_kloppen(event_type, old_value, new_value))
  not valid;

alter table public.goal_events validate constraint goal_events_waarde_sleutels;
