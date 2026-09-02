import type { DoelStand } from './stand';

/**
 * Welke doelen het hoofdscherm bij naam moet kunnen noemen — QS8-226.
 *
 * ⚠️ **Een eigen bestand, en dat is geen indeling maar een voorwaarde.** De
 *    functie stond eerst onderin `stand.ts`, en die importeert de
 *    Supabase-client — en daarmee React Native. Een unit-test die hem aanraakte,
 *    viel om op `Flow is not supported` uit `react-native/index.js`. Dezelfde
 *    valkuil die `shared/ui/naming.ts` en `modules/goals/cycles.ts` al eerder
 *    opleverden; `import type` is bij het compileren weg en trekt dus niets mee.
 *
 * ⚠️ **De belofte die hier bewaakt wordt.** Het dashboard toont twee dingen die
 *    naar een doel wijzen: de standen (reeks, punten, weekpas) en de weekdoelen
 *    van deze week. Voor allebei heeft het scherm de titel nodig, en die kwam uit
 *    `fetchDoelen()` — pagina 0, de eerste twintig. `StandBlok` filtert elke
 *    stand weg waarvan hij de titel niet kent, met als reden *"dat is een
 *    gearchiveerd of verwijderd doel"*.
 *
 *    Bij eenentwintig actieve doelen klopte die reden niet meer: het
 *    eenentwintigste verdween stilzwijgend van het dashboard. Onwrikbare regel 18
 *    vraag 6 — een aanname die van "ze passen op één pagina" naar "er kunnen er
 *    meer zijn" gaat.
 *
 *    De reparatie is niet een tweede pagina ophalen maar de vraag omdraaien:
 *    vraag naar de doelen die je tóónt, in plaats van te hopen dat ze in de
 *    eerste pagina zaten.
 */
export function doelIdsInBeeld(
  standen: ReadonlyMap<string, DoelStand>,
  weekdoelen: readonly { readonly goal_id: string }[],
): readonly string[] {
  const ids = new Set<string>(standen.keys());
  for (const weekdoel of weekdoelen) ids.add(weekdoel.goal_id);
  return [...ids];
}
