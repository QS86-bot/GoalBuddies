-- 0142_vijftien_doelcategorieen.sql — twaalf focusgebieden erbij (QS8-224)
--
-- ROLLBACK-PAD:
--   ⚠️ **Niet zomaar terug te draaien zodra er één doel in een nieuwe categorie
--      staat.** De oude CHECK terugzetten laat dan de `alter table` omvallen op
--      precies die rij, en dat is correct gedrag: de rij is echte data.
--
--   Op een lege of ongewijzigde tabel:
--     alter table public.goals drop constraint if exists goals_category_valid;
--     alter table public.goals add constraint goals_category_valid
--       check (category in ('business', 'study', 'other'));
--
--   Staan er doelen in een nieuwe categorie, dan hoort er eerst een keuze
--   gemaakt te worden over wat die worden — `other` is het enige veilige
--   antwoord — en dat is een besluit en geen migratiestap.
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Uit de review van 30-08: er waren drie categorieën — `business`, `study` en
-- `other` — en `other` is de standaard op `/doel/nieuw`. Voor een app die vooral
-- over sporten, afvallen en persoonlijke projecten gaat, betekent dat dat
-- vrijwel elk doel in "overig" belandt.
--
-- De twaalf gebieden komen van Quinten, uit de onboarding van Habit Huddle, en
-- staan vastgesteld in QS8-224.
--
-- ---------------------------------------------------------------------------
-- Waarom dit een migratie is en niet één regel TypeScript
-- ---------------------------------------------------------------------------
--
-- ⚠️ `CATEGORIEEN` in `src/modules/goals/schemas.ts` is een **kopie** van deze
--    CHECK en geen bron. `tests/rls/policies.test.ts` legt de twee naast elkaar
--    in béide richtingen, en dat is er niet voor niets: toen 0032 en 0034 uit
--    elkaar liepen, vergeleek de test de app-lijst met **zichzelf** en bleef
--    groen terwijl de database iets anders toestond.
--
-- ⚠️ **Deze migratie voegt alleen toe.** Alle drie de bestaande waarden blijven
--    geldig, dus geen enkel bestaand doel verandert of wordt geweigerd. Dat is
--    ook wat het acceptatiecriterium eist.
--
-- ---------------------------------------------------------------------------
-- Waarom `goals.category` en niet een tabel met categorieën
-- ---------------------------------------------------------------------------
--
-- Voor de hand liggend bij vijftien waarden, en hier toch niet gedaan. Een
-- categorie is geen gegeven van de gebruiker maar een **woordenlijst van de
-- app**: hij hoort bij een label in twee talen, bij een pictogram en straks bij
-- een kleurfamilie (A55), en die drie staan geen van drieën in de database.
--
-- Een tabel zou die lijst beschrijfbaar maken en er een tweede bron van maken,
-- terwijl de CHECK precies dezelfde rol speelt als bij `status`,
-- `goal_events.event_type` en `points_ledger.reason` — allemaal allowlists van
-- de app, allemaal een CHECK. Zelfde argument als in 0101 voor de lijst in
-- `check_waarden()`: hij hoort bij een besluit, niet bij data.

begin;

alter table public.goals drop constraint if exists goals_category_valid;

alter table public.goals add constraint goals_category_valid
  check (category in (
    -- De drie van vóór deze migratie. Blijven staan, want er hangen doelen aan.
    'business', 'study', 'other',

    -- De twaalf focusgebieden (QS8-224). Sleutels in het Engels, labels in
    -- beide catalogi — zelfde vorm als de drie hierboven.
    'fitness', 'nutrition', 'organization', 'productivity',
    'learning', 'resilience', 'skills', 'self_care',
    'connection', 'creativity', 'mindfulness', 'helping'
  ));

comment on column public.goals.category is
  'Het gebied waar dit doel over gaat, uit een allowlist van vijftien '
  '(QS8-224). ⚠️ De lijst in src/modules/goals/schemas.ts is een kopie van deze '
  'CHECK; tests/rls/policies.test.ts vergelijkt ze in beide richtingen. Een '
  'waarde toevoegen is dus altijd een migratie.';

commit;
