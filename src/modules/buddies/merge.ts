/**
 * Twee lijsten samenvoegen tot één oplopende reeks zonder dubbele rijen.
 *
 * ⚠️ Dit stond twee keer: één keer voor chatberichten en één keer voor de reacties
 *    op de weekafsluiting, en die tweede stond in `app/` — dus domeinlogica in een
 *    scherm. Bevinding van de code-review op EPIC 7.
 *
 * ⚠️ Het id doet mee in de sortering, en dat is geen netheid. Zowel
 *    `stamp_chat_message()` als `stamp_week_review_reply()` zet `created_at` op
 *    `now()`, en dat is de tijd van de tránsactie: twee rijen uit dezelfde
 *    transactie dragen exact dezelfde tijd. Zonder tweede sleutel springen die twee
 *    bij elke sortering van plaats en verschuift de lijst onder je vinger. De
 *    database sorteert op dezelfde sleutel (migraties 0024 en 0026).
 *
 * ⚠️ Geen Supabase-client en geen React Native, zodat de regel zonder renderer te
 *    testen is.
 */

export interface OpTijdGeordend {
  readonly id: string;
  readonly created_at: string;
}

function vergelijk(a: OpTijdGeordend, b: OpTijdGeordend): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Voegt `nieuw` bij `bestaand` en levert één oplopende reeks op.
 *
 * ⚠️ Bij een dubbel id wint de nieuwe rij: die komt van de server en de oude kan
 *    een bijgewerkte tekst missen.
 */
export function voegOplopendSamen<T extends OpTijdGeordend>(
  bestaand: readonly T[],
  nieuw: readonly T[],
): readonly T[] {
  const perId = new Map<string, T>();
  for (const rij of bestaand) perId.set(rij.id, rij);
  for (const rij of nieuw) perId.set(rij.id, rij);

  return [...perId.values()].sort(vergelijk);
}
