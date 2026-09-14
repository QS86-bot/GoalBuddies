-- 0263_een_weekafsluiting_is_niet_te_wissen.sql — `week_reviews_write` was
-- `for all`, dus een lid kon zijn eigen weekafsluiting met één DELETE weghalen
-- terwijl de schakel in De Ketting bleef staan (QS8-486)
--
-- ROLLBACK-PAD:
--   drop policy if exists week_reviews_insert on public.week_reviews;
--   drop policy if exists week_reviews_update on public.week_reviews;
--   create policy week_reviews_write on public.week_reviews for all to authenticated
--     using (user_id = (select auth.uid()) and is_group_member(group_id))
--     with check (user_id = (select auth.uid()) and is_group_member(group_id));
--   grant delete on table public.week_reviews to authenticated;
--
-- ---------------------------------------------------------------------------
-- Wat er stuk was
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten op de lokale stack als gewone ingelogde eigenaar — geen
--    `service_role`, geen definer-functie, gewoon de policy:
--
--   STAP 1 na insert : wr=1 chain=1
--   STAP 2 na delete : wr=0 chain=1     <- DELETE 1
--   STAP 3 opnieuw   : wr=1 chain=1
--
-- Drie sloten, en geen van drieën hield:
--
--   grant    `authenticated` had tabelbrede DELETE op `week_reviews`
--   policy   `week_reviews_write` was `for all`, dus de DELETE viel eronder
--   trigger  alle vier de triggers zijn INSERT of UPDATE — geen enkele op DELETE
--
-- ⚠️ **Domeinregel 6.** Streaks en voltooiingen zijn append-only; corrigeren
--    gaat via een correctie-record en niet door geschiedenis weg te halen. De
--    weekafsluiting ís de afsluiting van die week.
--
-- ⚠️⚠️ **En de schakel bleef staan.** Ná het wissen telt `chain_links` nog
--    steeds 1: De Ketting zegt dat de week afgesloten is, terwijl de afsluiting
--    niet meer bestaat. Opnieuw invoegen maakt er géén tweede schakel bij, dus
--    er was geen tellervervalsing — wel een toestand waarin de twee elkaar
--    tegenspreken, en niets dat dat opmerkt.
--
-- ---------------------------------------------------------------------------
-- ⚠️⚠️ Er stond een groene test die precies dit belooft
-- ---------------------------------------------------------------------------
--
-- `tests/rls/archief-leesbaar.test.ts` heeft een geval dat
-- "laat niemand zijn eigen weekafsluiting meer wissen" heet en dat groen is.
-- 📏 Nagemeten waaróm: die opstelling archiveert de groep vóór de poging, en in
-- een gearchiveerde groep is `is_group_member()` onwaar. De delete botst daar op
-- het archief en niet op een append-only-regel; in een lopende groep gaat
-- dezelfde handeling gewoon door.
--
-- Dat is regel 18 vraag 2 — de test toetst een eigenschap van het archief
-- terwijl zijn naam de belofte noemt — en vraag 3 erachteraan: hij blijft groen
-- terwijl de belofte in élke lopende groep breekt. **Een grendel die de
-- verkeerde kant op kijkt is duurder dan geen grendel**, want een omissie valt
-- op en een groene test met de juiste naam niet. Zie
-- `docs/decisions/2026-09-14-een-weekafsluiting-is-geen-klad.md`.
--
-- ---------------------------------------------------------------------------
-- Wat er níet breekt — gemeten, niet aangenomen
-- ---------------------------------------------------------------------------
--
-- 📏 Geen enkele functie in `public` doet `delete from week_reviews`: de twee
--    routes waarlangs zo'n rij vandaag verdwijnt zijn referentiële acties, en
--    die draaien als het systeem en niet als `authenticated`.
--
--      week_reviews_user_id_fkey   -> profiles(id)  on delete SET NULL
--      week_reviews_group_id_fkey  -> groups(id)    on delete CASCADE
--
--    Accountverwijdering laat de rij dus staan met een lege `user_id`, en een
--    verwijderde groep neemt hem mee. Allebei zonder de grant die hier weggaat.
--
-- ⚠️ `bewaarWeekafsluiting()` is een **upsert** en blijft werken: PostgREST maakt
--    daar `insert … on conflict … do update` van, en dat vraagt INSERT én UPDATE
--    — precies de twee die hieronder terugkomen. Deze migratie splitst `for all`
--    en versmalt hem niet: `using` en `with check` blijven woordelijk gelijk.

-- ---------------------------------------------------------------------------
-- 1. De `for all` uit elkaar, zonder de twee overgebleven takken te veranderen
-- ---------------------------------------------------------------------------

drop policy if exists week_reviews_write on public.week_reviews;
drop policy if exists week_reviews_insert on public.week_reviews;
drop policy if exists week_reviews_update on public.week_reviews;

create policy week_reviews_insert on public.week_reviews
  for insert to authenticated
  with check (user_id = (select auth.uid()) and is_group_member(group_id));

create policy week_reviews_update on public.week_reviews
  for update to authenticated
  using (user_id = (select auth.uid()) and is_group_member(group_id))
  with check (user_id = (select auth.uid()) and is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- 2. En het recht zelf weg
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alle drie de rollen met zoveel woorden (onwrikbare regel 4). In Supabase
--    deelt `alter default privileges` élke nieuwe tabel uit aan `anon`,
--    `authenticated` én `service_role`; `from public, anon` laat precies de rol
--    staan waaronder iedere ingelogde gebruiker draait.

revoke delete on table public.week_reviews from public, anon, authenticated;

comment on policy week_reviews_insert on public.week_reviews is
  'Je legt je eigen weekafsluiting vast in een groep waar je lid van bent (0263).';

comment on policy week_reviews_update on public.week_reviews is
  'Je werkt je eigen weekafsluiting bij; wissen kan niet — domeinregel 6 (0263).';
