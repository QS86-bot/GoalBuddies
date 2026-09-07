/**
 * De vorm van de afvinkrijen, los van de database — QS8-301.
 *
 * ⚠️ **Waarom dit een eigen module is en niet in `afvinken.ts` staat.** Die
 *    importeert `lib/supabase`, en dat trekt AsyncStorage en React Native mee;
 *    de unit-tests draaien in Node. 📏 Nagemeten: een test die `afvinken.ts`
 *    importeert valt om in de transform, nog vóór er iets draait. Zelfde reden
 *    waarom `deadline-redenen.ts` bestaat en waarom `bewijseis.test.ts`
 *    rechtstreeks uit `schemas.ts` leest.
 *
 * ⚠️ **En het is niet alleen een testtruc.** Dit stuk draagt de enige belofte
 *    van de query eromheen: *geen enkele afgevinkte dag raakt onderweg zoek*.
 *    De `select` zelf belooft niets wat je kunt breken.
 */

/**
 * De rijen groeperen per weekdoel.
 *
 * ⚠️ Apart en geëxporteerd, want dit is het enige stuk van
 *    `fetchAfvinkingenPerWeekdoel()` dat een eigen belofte draagt — en het
 *    enige dat zonder database te toetsen is.
 */
export function groepeerPerWeekdoel(
  rijen: readonly { readonly weekly_goal_id: string; readonly local_date: string }[],
): ReadonlyMap<string, readonly string[]> {
  const perDoel = new Map<string, string[]>();
  for (const rij of rijen) {
    const dagen = perDoel.get(rij.weekly_goal_id);
    if (dagen === undefined) perDoel.set(rij.weekly_goal_id, [rij.local_date]);
    else dagen.push(rij.local_date);
  }
  return perDoel;
}
