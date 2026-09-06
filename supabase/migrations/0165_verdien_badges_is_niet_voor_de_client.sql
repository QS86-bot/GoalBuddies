-- 0165_verdien_badges_is_niet_voor_de_client.sql — het uitvoerrecht van authenticated erop intrekken (QS8-287)
--
-- ROLLBACK-PAD:
--   grant execute on function public.verdien_badges(uuid) to authenticated;
--
--   ⚠️ Dat is het gat weer openzetten. Zie hieronder wat het toestaat.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- `verdien_badges(p_user_id uuid)` is `SECURITY DEFINER`, was uitvoerbaar door
-- `authenticated`, en bevat **nergens** een `auth.uid()`. Hij neemt een
-- willekeurig gebruikers-id aan, schrijft badges voor die persoon, en geeft
-- terug hoeveel hij er toekende.
--
-- 📏 Gemeten op de lokale opbouw, 06-09-2026. Alice heeft één afgerond doel;
--    Bob deelt niets met haar en draait als `authenticated` met zijn eigen
--    `sub` in `request.jwt.claims`:
--
--      bob roept aan voor alice -> 1
--      bob voor zichzelf        -> 0
--      badges van alice daarna  -> 1
--
-- Twee dingen tegelijk, en het tweede is het ergste:
--
--   1. **Bob schrijft in de badge-tabel van Alice.** `badges` heeft geen
--      INSERT-policy — `verdien_badges()` is sinds 0113 bewust de enige
--      schrijver — dus dit was de enige weg naar die tabel, en hij stond open
--      voor iedere ingelogde gebruiker.
--
--   2. **De retourwaarde is een orakel op privégegevens.** `badges_select` is
--      `user_id = auth.uid()`: badges zijn privé, en dat is een besluit van
--      27-08-2026 ("een badgemuur naast een ledenlijst maakt van de ontbrekende
--      badge het signaal"). Het getal dat Bob terugkrijgt vertelt hem hoevéél
--      badges Alice zojuist verdiend had; herhaald aanroepen vertelt hem
--      wannéér ze iets bereikt. Dat is domeinregel 7 langs een achterdeur.
--
-- ⚠️ De schrijfactie zelf is goedaardig: hij kent alleen badges toe die de ander
--    écht verdiend heeft. Het lek zit in het getal, en de ongeautoriseerde
--    schrijfweg is de tweede helft.
--
-- ---------------------------------------------------------------------------
-- Waarom het recht eraf gaat en er geen toets bij komt
-- ---------------------------------------------------------------------------
--
-- 📏 Gemeten: de app roept `verdien_badges` **nul keer** aan vanuit de client.
--    Alleen `database.types.ts` kent hem, en dat bestand is gegenereerd.
--
-- De enige echte aanroeper is de trigger `badge_na_gebeurtenis`. Die is
-- `SECURITY DEFINER` met eigenaar `postgres` (nagemeten via `pg_get_userbyid`),
-- dus hij draait niet onder het recht van `authenticated` en breekt hier niet
-- van.
--
-- ⚠️ **Een `auth.uid() = p_user_id`-toets binnenin zou de verkeerde reparatie
--    zijn**, en dat is nagegaan: de trigger roept hem aan met de **eigenaar van
--    het doel**, terwijl de handelende gebruiker een goedkeurende buddy kan
--    zijn. Zo'n toets zou juist de legitieme interne weg breken.
--
-- ⚠️ `service_role` houdt het recht. Dat is de rol van de Edge Functions, en die
--    draait niet namens een gebruiker.
--
-- ---------------------------------------------------------------------------
-- Hoe dit erin geslopen is — en wat de grendel van 0115 niet ziet
-- ---------------------------------------------------------------------------
--
-- 0113 regel 227:
--
--   revoke all on function public.verdien_badges(uuid) from public, anon;
--
-- ⚠️ `authenticated` ontbreekt daar, precies de val die onwrikbare regel 4
--    beschrijft. Regel 235 gaf het recht daarna expliciet weg
--    (`grant execute ... to authenticated, service_role`).
--
-- ⚠️ **Daarom zag `tests/rls/functiegrants.test.ts` hier niets**, en dat is een
--    grens van die grendel die het waard is om te kennen: hij toetst of een
--    migratie het recht met zoveel woorden gúnt — besloten in plaats van geërfd
--    — en niet óf dat recht nódig is. Een expliciete grant die niemand gebruikt,
--    is voor die test in orde. Deze migratie repareert het geval; de klasse
--    staat als rij in `docs/ENGINEER-REVIEW.md`.
--
-- ---------------------------------------------------------------------------

begin;

-- ⚠️ De volledige vorm uit onwrikbare regel 4, ook al haalt `public, anon` hier
--    niets meer weg: `from public, anon` alléén is precies de schrijfwijze die
--    dit gat veroorzaakt heeft, en die hoort in dit bestand niet nog een keer te
--    staan.
revoke execute on function public.verdien_badges(uuid) from public, anon, authenticated;

comment on function public.verdien_badges(uuid) is
  'Kent de badges toe die deze gebruiker verdiend heeft, en geeft het aantal '
  'nieuwe terug. ⚠️ NIET uitvoerbaar door authenticated (QS8-287): de functie '
  'heeft geen auth.uid()-toets, dus wie hem mag aanroepen schrijft in andermans '
  'badges en leest aan het getal af hoeveel die ander zojuist verdiende. De '
  'enige aanroeper is de trigger badge_na_gebeurtenis, en die draait als '
  'definer met eigenaar postgres.';

commit;
