-- 0260_goal_events_krijgt_een_grens_op_vorm_en_omvang.sql — `old_value` en
-- `new_value` krijgen een grens op omvang én op welke sleutels erin mogen, van
-- welke soort en hoe lang (QS8-464).
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
--    De telling:
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
--    ⚠️ **Daarom staat het functieblok vóór beide constraints en niet erna.** 📏
--    Die volgorde is een bevinding uit de security-review en geen smaak: stond de
--    functie onderaan, dan viel het deployen om op `validate constraint
--    goal_events_waarde_omvang` vóórdat de tweede kolom van deze telling ooit te
--    draaien was. Een draaiboek dat pas uitvoerbaar is nadat de migratie geslaagd
--    is, is geen draaiboek.
--
--    Is er iets, dan is dat een besluit voor Quinten en geen ding dat een
--    migratie stilzwijgend opruimt — deze tabel is een auditspoor.
--
-- ⚠️ Wat `not valid` hier **niet** oplevert is een halve toestand om op door te
--    bouwen. `supabase db push` en de MCP-tool draaien elke migratie in een
--    transactie, dus een omgevallen `validate` rolt óók de `not valid` terug;
--    alleen de lokale opbouw (`schema-opbouwen.sh`, `psql -f` zonder
--    `--single-transaction`) laat hem staan. Reken dus niet op "de grens staat
--    alvast voor nieuwe rijen" — tel vooraf.
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
-- Drie grenzen, want twee waren nog te weinig
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alleen een omvangsgrens houdt een vrije-tekstveld `reden` niet tegen — en
--    dát is het lek uit de rij. Alleen een sleutelgrens laat een toegestane
--    sleutel met een megabyte erin staan. Daarom allebei.
--
-- ⚠️⚠️ **En sleutel plus soort was nog altijd te weinig, want een `string` heeft
--    geen lengte.** 📏 Dat is de bevinding van de tweede security-review, en ze
--    is end-to-end gereproduceerd met twee gewone gebruikers:
--
--      A schrijft  event_type='created', new_value = {"title": "<3976 tekens>"}
--      -> INSERT 0 1
--      B leest     (gewoon lid van een BESCHERMDE groep)
--      -> 3976 tekens vrije tekst
--
--    De bronkolom `goals_title_len` staat op **200**; de auditkopie kreeg er
--    3976. Daarmee was `new_value.title` net zo breed als een heel chatbericht
--    (`chat_messages_body_len` = 4000) maar zonder de allowlist en de
--    groepsgebonden RLS die `chat_messages` wél heeft — en `goal_events_select`
--    volgt het **doel** en varieert niet op `groups.zichtbaarheid`, dus ook een
--    beschermde groep las mee. Dat is woordelijk het scenario van rij 519, en de
--    twee grenzen die hem zouden dichten lieten het staan.
--
--    ⚠️ **Geen enkele toets zág dat**, en dat is de leerzame kant: de must-allow
--    zat op 1213 en de must-block op 5.000.000. De band ertussen was leeg. Regel
--    18 vraag 3, letterlijk — de test blijft groen terwijl de belofte breekt.
--
--    Daarom draagt het register een **vierde** kolom: `maxlengte`, en voor
--    `title` is dat 200, hetzelfde getal als `goals_title_len`. De auditkopie van
--    een titel is niet breder dan de titel.
--
-- ⚠️ `char_length(w.v ->> k)` en niet `char_length((w.v -> k)::text)`: `->>`
--    geeft de **gedecodeerde** tekst, dus dit telt codepunten net als
--    `goals_title_len` en `char_length` in Postgres. Dezelfde eenheid aan beide
--    kanten, zoals de emoji-regel eist. 📏 Gemeten: 200 gewone tekens, 200 emoji
--    en 200 aanhalingstekens landen alle drie op precies 200; een gezin van vier
--    kost elf codepunten, dus 25 ervan zijn 175.
--
-- ⚠️ `char_length(...::text)` en niet `pg_column_size()` voor de omvangsgrens:
--    dat laatste meet de gecomprimeerde opslag na TOAST en is geen stabiele
--    grondslag voor een CHECK. Gemeten: dezelfde 5 MB gaf `56 kB` als
--    kolomgrootte.
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

-- ⚠️ `immutable`: hij hangt alleen van zijn invoer af. Dat moet ook, want de
--    CHECK verderop roept hem aan.
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
-- ⚠️⚠️ **En de soort én de lengte van de wáárde tellen mee, niet alleen de
--    sleutel.** 📏 De soort stond er eerst niet: `jsonb_object_keys()` geeft
--    alleen de **buitenste** sleutels, dus
--
--      new_value = {"title": {"reden": "…", "gemiste_week": true}}
--
--    kwam er gewoon in — één laagje diep weggestopt onder een sleutel die mág, en
--    met ruimte tot aan de omvangsgrens (1846 tekens gemeten met 1800 tekens
--    vrije tekst erin). De lengte stond er de ronde daarna nóg niet, en toen ging
--    dezelfde vrije tekst er **plat** in: 3976 tekens onder `title`. Een
--    sleutelgrens zonder soortgrens is een grens om een deur die openstaat; een
--    soortgrens zonder lengtegrens is er een om een deur op een kier.
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
  with toegestaan(gebeurtenis, kant, sleutel, soort, maxlengte) as (
    -- Het register: per gebeurtenis, per kant, **met de soort én de lengte van
    -- de waarde**. De schrijvers in het gedeployde schema, en wat ze er écht in
    -- zetten:
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
    --
    -- De lengtes, elk gemeten tegen wat de schrijver kan produceren:
    --   title                200  — exact `goals_title_len`, de bronkolom
    --   target_date           32  — een `date` rendert als 10 tekens
    --   request_id            36  — een uuid is er altijd precies 36
    --   straffen_teruggezet   20  — een `integer` is er hoogstens 11
    --
    -- ⚠️ Alleen `title` is vrije gebruikerstekst; de andere drie zijn
    --    machinewaarden en staan hier ruim maar dicht. Een grens die een
    --    machinewaarde net niet raakt, kost niets en sluit het kanaal wél.
    values
      ('created',        'nieuw', 'title',               'string',  200),
      ('deadline_moved', 'oud',   'target_date',         'string',   32),
      ('deadline_moved', 'nieuw', 'target_date',         'string',   32),
      ('deadline_moved', 'nieuw', 'request_id',          'string',   36),
      ('deadline_moved', 'nieuw', 'straffen_teruggezet', 'number',   20)
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
        -- andere soort dan gewogen is, óf hij is langer dan gewogen is.
        or exists (
          select 1
          from jsonb_object_keys(w.v) k
          where not exists (
            select 1 from toegestaan t
            where t.gebeurtenis = p_type
              and t.kant = w.kant
              and t.sleutel = k
              and t.soort = jsonb_typeof(w.v -> k)
              and char_length(w.v ->> k) <= t.maxlengte
          )
        )
      )
  );
$$;

comment on function public.goal_event_sleutels_kloppen(text, jsonb, jsonb) is
  'Of de sleutels in old_value/new_value gewogen zijn voor dit event_type, met '
  'hun soort en hun lengte — QS8-464. Het register staat in het lichaam; '
  'goal_events_waarde_sleutels dwingt het af.';

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

-- ---------------------------------------------------------------------------

-- ⚠️⚠️ **4000, en dat getal is gemeten en niet geschat.** 📏 Hier stond eerst
--    2000 met de onderbouwing *"ruim tienvoudig boven het huidige maximum"*, en
--    de security-review heeft dat weerlegd. De legitieme payload van vandaag is
--    **213** tekens (`created` met een titel van 200) en **109**
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
--    ⚠️ Verhoog je `goals_title_len`, kom dan hier langs — **op twee plekken**:
--    dit getal én `maxlengte` voor `title` in het register hierboven.
--
-- ⚠️ **Deze grens is sinds de lengtekolom het vangnet en niet de grens.** Wat een
--    sleutel mag dragen staat in het register; dit plafond vangt op wat daar
--    doorheen zou komen als er ooit een sleutel bij komt waarvan iemand de lengte
--    vergeet. Tegen de misbruikkant maakt 2000 of 4000 niets uit — allebei liggen
--    ze ruim duizendvoudig onder de vijf miljoen hierboven. Tegen de valse
--    weigering maakt het alles uit, en dat is de kant waar een grens kan omvallen
--    zonder dat iemand het merkt.
alter table public.goal_events drop constraint if exists goal_events_waarde_omvang;

alter table public.goal_events
  add constraint goal_events_waarde_omvang
  check (
    char_length(coalesce(old_value, 'null'::jsonb)::text) <= 4000
    and char_length(coalesce(new_value, 'null'::jsonb)::text) <= 4000
  )
  not valid;

alter table public.goal_events validate constraint goal_events_waarde_omvang;

alter table public.goal_events drop constraint if exists goal_events_waarde_sleutels;

alter table public.goal_events
  add constraint goal_events_waarde_sleutels
  check (public.goal_event_sleutels_kloppen(event_type, old_value, new_value))
  not valid;

alter table public.goal_events validate constraint goal_events_waarde_sleutels;
