/**
 * De twaalf gebieden waar dit product over praat — QS8-224, migratie 0142, en
 * teruggebracht van vijftien naar twaalf door besluit A58 (migratie 0164).
 *
 * ⚠️ **Deze lijst stond tot QS8-231 in `modules/goals/schemas.ts`, en dat kon
 *    niet blijven.** Een groep krijgt sinds 0144 dezelfde categorie als
 *    zoekingang, en `modules/buddies` mag `modules/goals` alleen via
 *    `index.ts` aanspreken — die trekt de Supabase-client mee, en dan is geen
 *    enkele schemaregel van `buddies` nog los te testen.
 *
 *    Een vierde kopie was het alternatief, en dat is precies de fout van
 *    0032/0034: twee lijsten die uit elkaar lopen zonder dat iets rood wordt.
 *    Woordenschat die meer dan één module deelt, hoort in `shared` — net als
 *    `shared/time`. `modules/goals/schemas.ts` exporteert hem door, dus voor
 *    elke bestaande lezer verandert er niets.
 *
 * ⚠️ **Een kopie van de CHECK en geen bron.** Drie CHECK-constraints dragen deze
 *    woorden: `goals_category_valid` (0142), `profiles_focus_areas_geldig`
 *    (0143) en `groups_categorie_geldig` (0144). `tests/rls/policies.test.ts`,
 *    `tests/rls/vragenlijst.test.ts` en `tests/rls/ontdekken.test.ts` leggen ze
 *    er alle drie in béide richtingen naast. Een waarde erbij is dus altijd
 *    eerst een migratie.
 *
 * ⚠️ De volgorde is die van `CATEGORIE_GROEPEN` en niet alfabetisch: dit is de
 *    volgorde waarin een gebruiker ze te zien krijgt.
 *
 * ⚠️ **Twaalf en niet meer vijftien — besluit A58, 04-09-2026.** Er stonden er
 *    vijftien in vier groepen, en die vierde groep was geen familie maar een
 *    restje: wat er overbleef nadat A55 drie kleuren had gevonden. Nu zijn het
 *    drie families van vier, en `other` is een lid van Softskills in plaats van
 *    de kop van een restgroep.
 *
 *    Vervallen: `helping`, `learning`, `organization` en `resilience`. Nieuw:
 *    `building`. Dat is een gegevenswijziging en geen hernoeming — zie migratie
 *    0164 en `docs/decisions/2026-09-04-drie-families-en-de-kleuren-die-niet-kunnen.md`.
 */
export const CATEGORIEEN = [
  // Gezondheid
  'fitness',
  'nutrition',
  'self_care',
  'mindfulness',

  // Softskills
  'creativity',
  'productivity',
  'connection',
  'other',

  // Ambitie
  'business',
  'study',
  'building',
  'skills',
] as const;

export type Categorie = (typeof CATEGORIEEN)[number];

/** Hoort deze waarde bij de woordenlijst? Voor alles wat van de server komt. */
export function isCategorie(waarde: unknown): waarde is Categorie {
  return typeof waarde === 'string' && (CATEGORIEEN as readonly string[]).includes(waarde);
}
