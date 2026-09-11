-- 0254_geen_immutable_functie_zonder_argumenten.sql — een grant is geen slot
-- zodra de functieaanroep uit het plan verdwijnt: PostgREST hergebruikt het plan
-- en de EXECUTE-toets komt er nooit meer aan te pas.
--
-- ROLLBACK-PAD:
--   alter function public.<naam>() immutable;   -- per functie, lijst onderaan
--   alter function public.ai_jobkosten_cent(numeric) immutable;
--   alter policy "commitments_select" on public.commitments using (…);  -- zonder
--     de twee `select`-wikkelingen uit §2 hieronder
--   ⚠️ Dat zet het gat terug. Doe het alleen met een gemeten reden.
--
-- ---------------------------------------------------------------------------
-- 1. Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- QS8-433. De meting is met de hand herhaald tegen de lokale PostgREST op
-- `berichten_plafond()` — een functie waar `anon` het uitvoerrecht níet heeft —
-- met de **bevoorrechte rol als eerste aanroeper op een verse pool**, want dat
-- is de volgorde die ertoe doet:
--
--   | stand van de functie          | service_role 20x | daarna anon 25x |
--   |-------------------------------|------------------|-----------------|
--   | `immutable` (vóór deze migratie) | 200 x 20      | **200 x 25**    |
--   | `stable` (erna)               | 200 x 20         | **401 x 25**    |
--
-- 📏 `has_function_privilege('anon', …, 'execute')` was in beide gevallen
--    `false`. De catalogus zegt nee en de API zegt ja.
--
-- ⚠️⚠️ **De volgorde is zelf een meetinstrument.** Begin je met mislukte
--    anon-aanroepen, dan cachet dát plan mét de functieaanroep erin en is alles
--    erna per ongeluk dicht. Het issue mat zo *2 van de 25*; met de bevoorrechte
--    rol eerst is het **25 van de 25**. Wie deze klasse nameet en met `anon`
--    begint, meet zijn eigen beschermlaag.
--
-- ---------------------------------------------------------------------------
-- 2. Er zijn twee routes en ze vragen elk iets anders
-- ---------------------------------------------------------------------------
--
-- Een aanroep verdwijnt op twee manieren uit het plan, en pas als béide dicht
-- zijn, sluit de grant:
--
--   A. **Constant folding.** Een `immutable` functie waarvan alle argumenten
--      constant zijn — nul argumenten, of allemaal een default — wordt bij het
--      plannen uitgerekend. `SET search_path` helpt hier **niet**.
--      📏 Gemeten: `immutable` + `set search_path` + nul argumenten lekt
--      `200 x 25`. Een `immutable` functie met één default-argument, aangeroepen
--      zonder argumenten, ook.
--
--   B. **SQL-inlining.** Een functie in `language sql` zonder `proconfig` en
--      zonder `security definer` wordt door `inline_function()` in het plan
--      opgenomen — óók als `stable`, en óók mét argumenten.
--      📏 Gemeten: `stable` + `sql` + géén `search_path` + nul argumenten lekt
--      `200 x 25`; dezelfde functie mét `set search_path` geeft `401 x 25`.
--      📏 En een `stable` sql-functie met een écht argument, aangeroepen mét dat
--      argument, lekt óók — daar is geen argumentgrens.
--
-- 📏 `plpgsql` is immuun voor route B: `stable` + `plpgsql` + géén
--    `search_path` geeft `401 x 25`. Alleen sql-functies worden ingelined.
--
-- ⚠️ **Route B is in dit project al dicht, en niet door deze migratie.** Elke
--    functie in `public` draagt een `SET search_path`, afgedwongen door de tak
--    `'geen set search_path'` in `definer_bewaking()` (0106/0167). 📏 Nul
--    functies zonder `proconfig`. Dat is een grendel die er voor iets ánders
--    staat en deze klasse toevallig meedekt — precies de naad uit onwrikbare
--    regel 18 vraag 1, en daarom staat hij hier opgeschreven en in
--    `volatiliteit-controle.mjs`.
--
-- Deze migratie sluit route A.
--
-- ---------------------------------------------------------------------------
-- 3. Wat er verandert
-- ---------------------------------------------------------------------------
--
-- §4: de achtentwintig functies die `immutable` zijn met nul argumenten gaan
-- naar `stable`. Dat is een **zwakkere** belofte, dus semantisch altijd veilig:
-- waar `immutable` mocht, mag `stable` ook.
--
-- ⚠️ **Alle achtentwintig en niet alleen de 22 waar de grant dicht is.** Zes mag
-- `authenticated` met reden uitvoeren en bij één geldt dat ook voor `anon`
-- (`commitment_zichtbaar_voor_groep()`, besloten in 0253). Daar valt niets te
-- lekken — maar een klasse met een uitzonderingslijst erin is er een die niemand
-- in één blik controleert.
--
-- §5: `ai_jobkosten_cent(numeric)` gaat mee. Die is `immutable` en roept
-- `ai_job_voorschot_cent()` aan, en die staat sinds §4 op `stable` — een
-- `immutable` functie die een `stable` functie aanroept is een onwaar label, en
-- Postgres dwingt dat niet af. Gevonden in de security-review.
--
-- §6: de twee aanroepen in `commitments_select` worden in een `select` gewikkeld.
-- ⚠️ Mét een `::text[]`-cast, en dat is geen opsmuk: `= any (subquery)` leest
-- Postgres als een verzameling rijen en niet als een array, en dan vindt hij
-- geen operator. 📏 Nagemeten in het plan: met de cast staat er
-- `InitPlan 7 (returns $6)` en `status = ANY ($6)` — één keer per query.
-- ⚠️ **Dat is een regressie van §4 en geen losse verbetering.** Als `immutable`
-- werden ze bij het plannen gevouwen; als `stable` worden ze per rij
-- geëvalueerd. De wikkeling maakt er een InitPlan van — dezelfde vorm als
-- `( SELECT auth.uid() )` twee conjuncten verderop, en dezelfde reden
-- (onwrikbare regel 12). `initplan_bewaking()` ziet deze klasse niet: die zoekt
-- alleen naar een kale `auth.uid()`.
--
-- ---------------------------------------------------------------------------
-- 4. Wat er per rij gemeten moest worden
-- ---------------------------------------------------------------------------
--
-- ⚠️ `ai_invoer_max()` staat in de CHECK-constraint `ai_jobs_input_len`.
--    📏 In een terugrollende transactie gemeten, vóór én na de alter: te lange
--    invoer wordt beide keren geweigerd met `23514`, korte invoer landt.
--    Postgres hervalideert een constraint niet bij `alter function`, dus dit was
--    niet uit de documentatie af te leiden.
--
-- 📏 Geen indexexpressie, gegenereerde kolom of view noemt een van de
--    achtentwintig — gemeten over `pg_index`, `pg_attrdef` en `pg_constraint`.
--    ⚠️ Hier stond dat Postgres daar een harde fout zou geven; dat is bij meting
--    onwaar gebleken (`alter function` slaagt gewoon, er wordt niets
--    hervalideerd). De inventarisatie klopt, het vangnet eronder bestond niet.
--
-- ⚠️ Idempotent: `alter function … stable` op een functie die al `stable` is, is
--    een no-op, en `alter policy … using (…)` zet dezelfde uitdrukking terug.
--
-- De grendel die deze klasse dichthoudt is `npm run volatiliteit:controle`.

-- ---------------------------------------------------------------------------
-- 5. De klasse van route A
-- ---------------------------------------------------------------------------

alter function public.ai_dag_budget_cent() stable;
alter function public.ai_dag_limiet() stable;
alter function public.ai_invoer_max() stable;
alter function public.ai_job_voorschot_cent() stable;
alter function public.bedenktijd() stable;
alter function public.berichten_plafond() stable;
alter function public.bijlage_bewaartermijn() stable;
alter function public.commitment_zichtbaar_voor_groep() stable;
alter function public.commitment_zichtbaar_voor_persoon() stable;
alter function public.commitments_plafond() stable;
alter function public.dagafvinkingen_plafond() stable;
alter function public.dagzetten_plafond() stable;
alter function public.doelen_plafond() stable;
alter function public.doelgebeurtenissen_plafond() stable;
alter function public.doelinterviews_plafond() stable;
alter function public.doelkoppelingen_plafond() stable;
alter function public.goedkeuringen_plafond() stable;
alter function public.groepsgebeurtenissen_plafond() stable;
alter function public.ketting_drempels() stable;
alter function public.mijlpalen_plafond() stable;
alter function public.pushtokens_plafond() stable;
alter function public.taken_plafond() stable;
alter function public.volgorde_register() stable;
alter function public.voltooiingen_plafond() stable;
alter function public.weekdoelen_plafond() stable;
alter function public.weekpas_maximum() stable;
alter function public.weekplanstappen_plafond() stable;
alter function public.weekreacties_plafond() stable;

-- ---------------------------------------------------------------------------
-- 6. De wikkel die nu een onwaar label draagt
-- ---------------------------------------------------------------------------

alter function public.ai_jobkosten_cent(numeric) stable;

-- ---------------------------------------------------------------------------
-- 7. Twee aanroepen die sinds §5 per rij zouden lopen
-- ---------------------------------------------------------------------------

alter policy "commitments_select" on public.commitments
  using (
    (exists (
       select 1 from goals g
       where g.id = commitments.goal_id and g.owner_id = (select auth.uid())))
    or (beneficiary_group_id is not null
        and status = any ((select commitment_zichtbaar_voor_groep())::text[])
        and mag_groep_lezen(beneficiary_group_id))
    or (beneficiary_user_id = (select auth.uid())
        and status = any ((select commitment_zichtbaar_voor_persoon())::text[])
        and deelt_groep_met_eigenaar(goal_id))
  );
