-- 0012_profiles_onboarding.sql — onboarding afgerond, en de buddy-rol
--
-- ROLLBACK-PAD:
--   alter table profiles drop column if exists onboarded_at;
--   alter table profiles drop column if exists wants_own_goal;
--
-- Twee kolommen die EPIC 1 nodig heeft en die er niet waren.
--
-- ⚠️ Allebei nullable met een default, dus bestaande rijen blijven geldig en de
--    migratie herschrijft de tabel niet.

-- ---------------------------------------------------------------------------
-- 1. onboarded_at
-- ---------------------------------------------------------------------------
--
-- Zonder deze kolom moet de app raden of iemand de uitleg gehad heeft. De
-- verleiding is om dat af te leiden — "heeft al een doel", of "display_name
-- wijkt af van het e-mailadres". Allebei fout: iemand die binnenkomt om een
-- vriend te helpen krijgt nooit een eigen doel (QS8-30), en een naam die
-- toevallig gelijk is aan je e-mailprefix bestaat echt.
--
-- Een expliciete kolom is één regel en scheelt een klasse bugs waarbij mensen de
-- onboarding elke keer opnieuw krijgen.

alter table profiles add column if not exists onboarded_at timestamptz;

comment on column profiles.onboarded_at is
  'Null = de onboarding is nog niet afgerond. Nooit afleiden uit andere velden.';

-- ---------------------------------------------------------------------------
-- 2. wants_own_goal
-- ---------------------------------------------------------------------------
--
-- QS8-30: wie via een uitnodiging binnenkomt om een vriend te helpen, hoeft geen
-- eigen doel. De PRD-persona "The Buddy" heeft er expliciet geen, en een
-- verplichte doel-trechter is precies de drempel die uitnodigingen laat
-- mislukken.
--
-- ⚠️ Dit is een voorkeur, geen slot. Er hangt geen enkele policy aan en geen
--    enkel scherm mag erop vastlopen: het bepaalt alleen wat de app áánbiedt.
--    "Eigen doel starten" blijft altijd zichtbaar.
--
-- Default `true`, want de gewone route is dat je voor jezelf komt.

alter table profiles add column if not exists wants_own_goal boolean not null default true;

comment on column profiles.wants_own_goal is
  'False = binnengekomen als buddy, wil (nog) geen eigen doel. Stuurt alleen wat '
  'de UI aanbiedt; nooit een autorisatiegrens en nooit een blokkade.';
