import { useSyncExternalStore } from 'react';

/**
 * Wacht er een melding op de beheerder? — QS8-777.
 *
 * ⚠️ **Een stand en geen vraag.** `Taakbalk` staat in `shared/ui` en mag de datalaag niet kennen, en elke
 *    navigatie zou anders zelf een RPC doen. Een wacht in `app/_layout.tsx` en de kaart op Profiel zetten hier de
 *    uitkomst van `fetchOpenstaandeMeldingen()`; de balk leest alleen of er een stip komt.
 *
 * ⚠️ **De rol staat hier nergens.** De stand is `true` zodra de RPC een rij teruggaf, en die geeft alleen een
 *    rij aan wie mag beoordelen. Voor iedereen anders blijft hij `false` en is er niets te zien.
 *
 * ⚠️ **Een mislukte lading zet hem niet om.** Een storing is geen "er wacht niets": de kaart op Profiel zegt
 *    dan zelf dat het ophalen mislukte, en de stip blijft zoals hij was.
 */
let wacht = false;
const luisteraars = new Set<() => void>();

export function zetMeldingWacht(waarde: boolean): void {
  if (wacht === waarde) return;
  wacht = waarde;
  for (const l of luisteraars) l();
}

const abonneer = (l: () => void) => {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
};

export function useMeldingWacht(): boolean {
  // Server en eerste clientronde: geen stip (zelfde reden als `useTaakbalkVorm`).
  return useSyncExternalStore(abonneer, () => wacht, () => false);
}
