-- 0164_drie_families_van_vier.sql — twaalf gebieden in drie families, geen restgroep meer (A58)
--
-- ROLLBACK-PAD:
--   De drie CHECK's terug naar hun vorige inhoud:
--
--   alter table public.goals drop constraint if exists goals_category_valid;
--   alter table public.goals add constraint goals_category_valid
--     check (category in (
--       'business', 'study', 'other',
--       'fitness', 'nutrition', 'organization', 'productivity',
--       'learning', 'resilience', 'skills', 'self_care',
--       'connection', 'creativity', 'mindfulness', 'helping'));
--
--   alter table public.profiles drop constraint if exists profiles_focus_areas_geldig;
--   alter table public.profiles add constraint profiles_focus_areas_geldig check (
--     array_length(focus_areas, 1) is null
--     or (array_length(focus_areas, 1) <= 3
--         and focus_areas <@ array[
--           'fitness', 'nutrition', 'self_care', 'mindfulness',
--           'connection', 'helping', 'creativity',
--           'productivity', 'organization', 'learning', 'skills', 'resilience',
--           'business', 'study', 'other']::text[]));
--
--   alter table public.groups drop constraint if exists groups_categorie_geldig;
--   alter table public.groups add constraint groups_categorie_geldig check (
--     categorie is null or categorie in (
--       'fitness', 'nutrition', 'self_care', 'mindfulness',
--       'connection', 'helping', 'creativity',
--       'productivity', 'organization', 'learning', 'skills', 'resilience',
--       'business', 'study', 'other'));
--
--   ⚠️ **De omzetting hieronder is niet terug te draaien.** De CHECK's laten de
--      vier oude woorden daarna weer toe, maar welke rij vroeger `helping` was
--      en welke al `connection`, is dan niet meer te zien. Op een gevulde
--      database is dat gegevensverlies; op 04-09-2026 raakt het nul rijen
--      (gemeten, zie hieronder).
--
-- ---------------------------------------------------------------------------
-- Waar dit vandaan komt
-- ---------------------------------------------------------------------------
--
-- Quinten vroeg op 04-09-2026 bij vraag K2 terug: *"Hoe komen we aan vier
-- families/categorieën en waar staat dat voor?"* Het antwoord bleek dat ze nooit
-- ontworpen zijn. Er zijn groepen omdat vijftien knoppen naast elkaar geen keuze
-- is maar een muur (QS8-224), en de groepering is gelijkgetrokken met de
-- kleurfamilies van A55 omdat kleur anders niets betekent. De vierde groep —
-- `business`, `study`, `other` — is wat er overbleef nadat de eerste drie een
-- kleur hadden.
--
-- Besluit A58: twaalf gebieden in drie families van vier, geen restgroep.
--   Gezondheid  fitness · nutrition · self_care · mindfulness
--   Softskills  creativity · productivity · connection · other
--   Ambitie     business · study · building · skills
--
-- Vier gebieden vervallen en één komt erbij. Dat is een gegevenswijziging en
-- geen hernoeming: `helping`, `learning`, `organization` en `resilience` staan
-- in drie CHECK's en in drie tabellen.
--
-- 📏 Gemeten vlak vóór deze migratie, op de lokale opbouw: nul rijen in
--    `goals`, `profiles` en `groups` dragen een van de vier. Er zijn nog geen
--    echte gebruikers (WERKVOORRAAD §0.2), en dat is de aanname waaronder dit
--    goedkoop is. **Die aanname vervalt bij de eerste aanmelding**, en daarom
--    zet sectie 1 de rijen alsnog om in plaats van erop te vertrouwen.
--
-- ⚠️ De omzetting staat vóór de CHECK's en niet erna. Andersom zou de
--    `alter table ... add constraint` omvallen op de eerste rij die nog een oud
--    woord draagt, en dan is de migratie niet af te spelen op een database die
--    wél gevuld is — precies het geval waarvoor de bestanden bestaan.
--
-- ⚠️ `building` is nieuw en krijgt geen omzetting: er is geen oud gebied dat
--    erop lijkt. Hij bestaat pas vanaf deze migratie.
--
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- 1. De vier vervallen gebieden krijgen een plek
-- ---------------------------------------------------------------------------
--
-- De omzetting is conservatief: elk vervallen gebied gaat naar het gebied dat er
-- inhoudelijk het dichtst bij ligt, binnen de nieuwe families.
--
--   helping       → connection    (allebei: iets doen met of voor mensen)
--   learning      → study         (leren en studeren zijn hier hetzelfde)
--   organization  → productivity  (orde is hoe je meer gedaan krijgt)
--   resilience    → self_care     (veerkracht is zorg voor jezelf volhouden)

update public.goals
set category = case category
      when 'helping'      then 'connection'
      when 'learning'     then 'study'
      when 'organization' then 'productivity'
      when 'resilience'   then 'self_care'
      else category
    end
where category in ('helping', 'learning', 'organization', 'resilience');

update public.groups
set categorie = case categorie
      when 'helping'      then 'connection'
      when 'learning'     then 'study'
      when 'organization' then 'productivity'
      when 'resilience'   then 'self_care'
      else categorie
    end
where categorie in ('helping', 'learning', 'organization', 'resilience');

-- ⚠️ `focus_areas` is een array, dus de omzetting is per element én daarna
--    ontdubbeld. Wie zowel `connection` als `helping` had, houdt er ná de
--    omzetting één over — zonder `distinct` zou de rij twee keer hetzelfde
--    gebied dragen, en dat is een lijstje dat een gebruiker nooit zo heeft
--    ingevuld.
--
-- ⚠️ De CHECK laat maximaal drie gebieden toe. Ontdubbelen kan dat aantal alleen
--    verlágen, dus deze update kan de grens niet overschrijden.
update public.profiles
set focus_areas = (
      select array(
        select distinct case g
                 when 'helping'      then 'connection'
                 when 'learning'     then 'study'
                 when 'organization' then 'productivity'
                 when 'resilience'   then 'self_care'
                 else g
               end
        from unnest(focus_areas) as g
      )
    )
where focus_areas && array['helping', 'learning', 'organization', 'resilience']::text[];

-- ---------------------------------------------------------------------------
-- 2. De drie allowlists
-- ---------------------------------------------------------------------------
--
-- ⚠️ Alle drie dezelfde twaalf woorden, en dat is de naad die
--    `tests/rls/policies.test.ts`, `vragenlijst.test.ts` en `ontdekken.test.ts`
--    in béide richtingen bewaken. Loopt er één uit de pas, dan is dat rood.

alter table public.goals drop constraint if exists goals_category_valid;

alter table public.goals add constraint goals_category_valid
  check (category in (
    -- Gezondheid
    'fitness', 'nutrition', 'self_care', 'mindfulness',
    -- Softskills
    'creativity', 'productivity', 'connection', 'other',
    -- Ambitie
    'business', 'study', 'building', 'skills'
  ));

comment on column public.goals.category is
  'Het gebied waar dit doel over gaat, uit een allowlist van twaalf in drie '
  'families van vier (besluit A58). ⚠️ De lijst in src/shared/categorieen is een '
  'kopie van deze CHECK; tests/rls/policies.test.ts vergelijkt ze in beide '
  'richtingen. Een waarde toevoegen of weghalen is dus altijd een migratie.';

alter table public.profiles drop constraint if exists profiles_focus_areas_geldig;

alter table public.profiles add constraint profiles_focus_areas_geldig check (
  array_length(focus_areas, 1) is null
  or (
    array_length(focus_areas, 1) <= 3
    and focus_areas <@ array[
      'fitness', 'nutrition', 'self_care', 'mindfulness',
      'creativity', 'productivity', 'connection', 'other',
      'business', 'study', 'building', 'skills'
    ]::text[]
  )
);

alter table public.groups drop constraint if exists groups_categorie_geldig;

alter table public.groups add constraint groups_categorie_geldig check (
  categorie is null
  or categorie in (
    'fitness', 'nutrition', 'self_care', 'mindfulness',
    'creativity', 'productivity', 'connection', 'other',
    'business', 'study', 'building', 'skills'
  )
);

commit;
