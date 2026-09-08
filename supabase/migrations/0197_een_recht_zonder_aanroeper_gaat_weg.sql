-- 0197_een_recht_zonder_aanroeper_gaat_weg.sql — vijf kolomgrants en twee
-- DELETE-rechten die geen enkele aanroeper hebben, gaan weg (QS8-351)
--
-- ROLLBACK-PAD:
--   grant insert (blocked_id, blocker_id) on public.user_blocks to authenticated;
--   grant insert (group_id, role, status, user_id) on public.group_members to authenticated;
--   grant insert (avatar_url, display_name, focus_areas, id, locale, minutes_per_day,
--                 onboarded_at, reminder_enabled, reminder_time, reminder_tone,
--                 share_moves_by_default, tz, wants_own_goal, week_start_day,
--                 what_breaks_it, when_i_do_it) on public.profiles to authenticated;
--   grant update (body, id, local_date, user_id, visibility, weekly_goal_id)
--     on public.daily_moves to authenticated;
--   grant update (answers, goal_id, id) on public.goal_interviews to authenticated;
--   grant delete on public.daily_moves to authenticated;
--   grant delete on public.goal_interviews to authenticated;
--
--   ⚠️ Er verandert geen policy, geen functie en geen tabel. Terugdraaien is
--      precies deze zes regels en niets anders.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `kolomrechten:controle` (QS8-349) wees achttien `tabel|soort`-paren aan met
-- een kolomgrant voor `authenticated` terwijl niets in `src/` of `app/` naar die
-- tabel schrijft. Elf zijn inert (`using false` / `with check false`). De
-- overige zeven staan open voor een rechtstreeks PostgREST-verzoek — dezelfde
-- klasse als `chat_messages_update` (QS8-327): **een recht zonder knop**.
--
-- ⚠️ **Elke schrijver van deze tabellen is `SECURITY DEFINER`** — 📏 gemeten met
--    `pg_get_functiondef()` en niet uit de migratiebestanden gelezen:
--    `create_group`, `join_group_with_code`, `beslis_lidmaatschapsverzoek`,
--    `verlaat_groep`, `verwijder_lid`, `blokkeer`, `handle_new_user`. Een
--    `revoke` op `authenticated` raakt geen van zeven.
--
-- ⚠️ **En de client schrijft ze niet.** 📏 `daily_moves`: alleen `insert` en
--    `select`. `goal_interviews`: alleen `insert` en `select`. `group_members`,
--    `user_blocks`, `profiles`: alleen `select` (en op `profiles` een UPDATE,
--    die blijft staan). Nul `update`-aanroepen op `daily_moves`,
--    `goal_interviews` en `group_members` in de hele codebase.
--
-- ---------------------------------------------------------------------------
-- Wat er vandaag kan, en dat is de reden dat dit niet alleen opruimen is
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten met echte JWT's tegen de lokale stack, als gewone eigenaar, in
--    `tests/rls/rechten-zonder-aanroeper.test.ts`. Vier PATCH-verzoeken, vier
--    keer **géén foutcode** (`expected undefined to be '42501'`):
--
--     daily_moves    body        een dagboekregel herschrijven
--     daily_moves    visibility  een privéregel achteraf naar de groep tillen
--     daily_moves    local_date  een Dagzet dertig dagen terugdateren
--     goal_interviews answers    een interviewantwoord herschrijven
--
-- ⚠️ **De zichtbaarheid is de zwaarste van die vier.** Domeinregel 9 zegt dat de
--    Dagzet standaard privé is; dat je hem achteraf naar `group` mag tillen — of
--    terug, nadat de groep hem gezien heeft — is nooit besloten. Het volgt uit
--    een grant die niemand heeft ingetrokken.
--
-- ⚠️⚠️ **`group_members` UPDATE stond hier eerst óók bij, en die is er weer
--    uitgehaald. Dat is de belangrijkste meting van dit issue.**
--
--    📏 Met die revoke erbij vielen **21 bestaande tests in zeven bestanden** om:
--    `stille-weigering.test.ts` (heel QS8-314), `lidmaatschapsgrens.test.ts`,
--    `vertrek.test.ts`, `veiligheid.test.ts`, `vastgelopen.test.ts` en
--    `lidmaatschapsbesluit.test.ts`. 📏 Alleen die ene grant teruggeven maakte
--    alle zes bestanden weer groen — 100 tests.
--
--    **Dat is geen lastige testsuite maar het antwoord op de vraag.** Dit recht
--    is géén recht zonder aanroeper: 0102 en 0187 zijn er juist voor gebouwd.
--    `guard_group_member_update()` bestaat om precies dit pad te politiëren, en
--    de audittrigger schrijft een spoor "ook bij een uitzetting buiten de RPC
--    om". Intrekken maakt die guard onbereikbaar vanaf een client en heel
--    QS8-314 inhoudsloos: een testbestand dat groen blijft omdat het niets meer
--    kan bereiken.
--
--    ⚠️ **De "geen aanroeper"-meting keek naar `src/` en `app/`, en dat is de
--    verkeerde helft van dit systeem.** De client roept het niet aan; de
--    dátabase heeft er drie grendels voor. Een recht zonder aanroeper in de app
--    is iets anders dan een recht zonder doel.
--
--    Het gat dat de review op QS8-349 hier aanwees — een áctieve beheerder zet
--    een uitgezet lid met één PATCH terug op `active`, terwijl `verwijder_lid()`
--    ook `goal_group_links` en openstaande `deadline_requests` opruimt — is
--    daarmee niet verdwenen. Het is een **gat in de guard** en niet een losse
--    grant, en het staat als eigen issue.
--
-- ⚠️ **`user_blocks` INSERT laat een grendel door de grant heen vallen.**
--    `blokkeer()` geeft met opzet `ok: true` voor zowel een bestaand als een
--    onbestaand profiel-id — de functie zegt er zelf bij dat één antwoord
--    voorkomt dat je ermee kunt toetsen óf een account bestaat. Het
--    rechtstreekse pad mist die gelijkmaker: 📏 een onbestaand id geeft
--    `409 23503`, een bestaand id `201`. Dat is precies het bestaansorakel dat
--    de RPC dichtzet.
--
-- ⚠️ **`group_members` INSERT gaat wél weg, en dat is geen inconsistentie.**
--    `guard_group_member_update()` is een UPDATE-trigger; op de INSERT-kant
--    staat niets. 📏 En het terugzetten van die ene grant maakte géén enkele
--    bestaande test rood — er is niets dat hem gebruikt, in de app niet en in de
--    database niet. Alle drie de schrijvers zijn definer.
--
-- ⚠️ **`group_members` INSERT en `profiles` INSERT zijn vandaag onbereikbaar**,
--    en allebei door iets dat geen slot is. Bij `group_members` filtert
--    `groups_select` de `EXISTS (select 1 from groups …)` ín de policy: ben je
--    nog lid, dan botst de primaire sleutel; ben je vertrokken, dan zie je de
--    groep niet meer. Bij `profiles` is het de primaire sleutel — 📏 een POST
--    geeft `409 23505`, want `handle_new_user()` heeft de enige rij al gemaakt.
--    **Allebei zijn het gevolgen en geen grendels**, en allebei slaan ze om bij
--    een wijziging elders: `groups.ontdekbaar` bestaat al als kolom, en een
--    verbrede `groups_select` laat een vertrokken oprichter zichzelf met één
--    POST terugzetten als `role: admin`.
--
-- ---------------------------------------------------------------------------
-- Wat de revoke wél en niet sluit — een correctie uit de security-review
-- ---------------------------------------------------------------------------
--
-- ⚠️⚠️ **Hier stond dat die vier gevallen met de UPDATE-revoke gesloten waren.
--    Dat was te sterk, en het is precies de vorm die dit project verbiedt: de
--    test toetst de PATCH-vórm en de kop beloofde de uitkomst.**
--
--    📏 Nagemeten: `authenticated` heeft **tabelbrede DELETE** op `daily_moves`
--    én `goal_interviews`, en `daily_moves` INSERT draagt nog `local_date` en
--    `visibility` (die heeft de app nodig — `zetDagzet()` stuurt ze mee).
--    `daily_moves_write` is een `FOR ALL`-policy op `user_id = auth.uid()`, dus
--    weghalen-en-opnieuw-invoegen was gewoon een tweede weg naar dezelfde
--    uitkomst.
--
-- 📏 En DELETE is op allebei die tabellen zélf een recht zonder aanroeper: geen
--    `.delete()` in `src/` of `app/`, en geen enkele functie in het schema raakt
--    ze aan. Vandaar dat hij hier meegaat.
--
-- **Wat er ná deze migratie dicht is en wat niet:**
--
--   dicht   een bestaande Dagzet herschrijven, terugdateren of van
--           zichtbaarheid wisselen — er is geen UPDATE en geen DELETE meer
--   dicht   een bestaand interviewantwoord herschrijven of weghalen
--   OPEN    een **nieuwe** Dagzet invoeren met een willekeurige `local_date`
--
-- ⚠️ Dat laatste blijft, en het staat er met zoveel woorden bij in plaats van
--    dat de kop suggereert dat het weg is. `local_date` moet in de INSERT-grant
--    omdat de app hem meestuurt, en er staat geen CHECK en geen trigger op —
--    📏 nagemeten op `pg_constraint` en `pg_trigger`. Dat is dezelfde klasse als
--    `cycle_start_date` bij QS8-354: een dátumgrens die nergens staat. Het hoort
--    daar en niet hier.
--
-- ---------------------------------------------------------------------------
-- Wat er níet weggaat, en waarom dat gemeten is
-- ---------------------------------------------------------------------------
--
-- **`weekly_goals` UPDATE blijft staan.** De grant draagt vier kolommen —
-- `ceiling_text`, `floor_text`, `milestone_id`, `title` — en die zijn inhoud, geen
-- besluit. 📏 Nagemeten dat `status` er níét in zit: een client die
-- `status: 'approved'` PATCHt krijgt `42501`, dus de puntenlogica van
-- `sluit_weekdoel_af()` is er niet mee te omzeilen (acceptatiecriterium 4).
-- De policy staat alleen de eigenaar toe, dus het ergste geval is dat je je eigen
-- week hernoemt — en een bewerkscherm is aannemelijk (`app/doel/bewerk/` bestaat
-- al voor doelen).
--
-- ⚠️ **Dit is geen "vandaag onschadelijk" zonder grendel**, en dat verschil is
--    precies wat QS8-352 duur maakte. De grendel is de kolomlijst zelf, en die
--    staat sinds QS8-349 onder bewaking: `kolomrechten:controle` meldt het zodra
--    er een kolom bij een geregistreerd paar bij komt. Krijgt deze grant er ooit
--    een kolom bij die wél een besluit draagt, dan wordt de controle rood.
--
-- ---------------------------------------------------------------------------
-- De reparatie
-- ---------------------------------------------------------------------------
--
-- ⚠️ Elke `revoke` noemt `public`, `anon` én `authenticated` met zoveel woorden
--    (onwrikbare regel 4). `from public, anon` leest als "van iedereen" en houdt
--    juist de rol over waaronder iedere ingelogde gebruiker draait.

revoke insert (blocked_id, blocker_id)
  on public.user_blocks from public, anon, authenticated;

revoke insert (group_id, role, status, user_id)
  on public.group_members from public, anon, authenticated;

revoke insert (
  avatar_url, display_name, focus_areas, id, locale, minutes_per_day,
  onboarded_at, reminder_enabled, reminder_time, reminder_tone,
  share_moves_by_default, tz, wants_own_goal, week_start_day,
  what_breaks_it, when_i_do_it
) on public.profiles from public, anon, authenticated;

revoke update (body, id, local_date, user_id, visibility, weekly_goal_id)
  on public.daily_moves from public, anon, authenticated;

revoke update (answers, goal_id, id)
  on public.goal_interviews from public, anon, authenticated;

-- ⚠️⚠️ **En de DELETE erbij, want zonder dat sluit de UPDATE-revoke niets.**
--    Zie de sectie "Wat de revoke wél en niet sluit" hierboven: met een DELETE
--    ernaast is bewerken gewoon weghalen-en-opnieuw-invoegen. Postgres kent geen
--    kolom-DELETE-privilege, dus dit is tabelbreed — en dat is precies waarom
--    `kolomrechten:controle` deze klasse structureel niet kan zien.

revoke delete on public.daily_moves from public, anon, authenticated;

revoke delete on public.goal_interviews from public, anon, authenticated;
