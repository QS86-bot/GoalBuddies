/**
 * De vijftien gebieden waar dit product over praat — QS8-224, migratie 0142.
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
 */
export const CATEGORIEEN = [
  'fitness',
  'nutrition',
  'self_care',
  'mindfulness',
  'connection',
  'helping',
  'creativity',
  'productivity',
  'organization',
  'learning',
  'skills',
  'resilience',
  'business',
  'study',
  'other',
] as const;

export type Categorie = (typeof CATEGORIEEN)[number];

/** Hoort deze waarde bij de woordenlijst? Voor alles wat van de server komt. */
export function isCategorie(waarde: unknown): waarde is Categorie {
  return typeof waarde === 'string' && (CATEGORIEEN as readonly string[]).includes(waarde);
}
