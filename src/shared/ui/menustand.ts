import { MENU_BEGINSTAND_OPEN } from './tabbladen';

/**
 * De open/dicht-stand van het menu op een telefoon — QS8-795.
 *
 * ⚠️ **Eén stand voor de hele app, niet één per scherm.** `Screen` tekent de
 *    `Taakbalk` per scherm, en de tabbladen blijven gemount zodra ze bezocht zijn.
 *    Een `useState` in de balk betekende dus: elk tabblad onthoudt zijn eigen open
 *    stand en toont die weer als je terugkomt. Gemeten op 22-11-2026: open op
 *    Doelen, naar Groep (dicht), open, naar Doelen -> Doelen is open, en daarna
 *    Groep ook. Het besluit van QS8-728 is "start dicht", bij élke navigatie.
 *    Met één gedeelde stand is er niets om te onthouden.
 *
 * ⚠️ **Aanname:** `usePathname()` geeft de pagina van de hele app, ook in een verborgen tabblad
 *    (nagekeken in expo-router 57.0.13: `build/hooks/usePathname.js` en
 *    `build/global-state/useRouteInfo.js`). Na een upgrade eenmaal met de hand: open, Groep, open, Doelen.
 *
 * Puur en zonder React, zodat de volgorde van de tests dezelfde is als die van
 * een gebruiker. Het component leest hem met `useSyncExternalStore`.
 */
let open = MENU_BEGINSTAND_OPEN;
const luisteraars = new Set<() => void>();

function zet(nieuw: boolean): void {
  if (open === nieuw) return;
  open = nieuw;
  luisteraars.forEach((l) => l());
}

export const leesMenuOpen = (): boolean => open;
export const wisselMenu = (): void => zet(!open);
/** Elke navigatie begint met een dicht menu. */
export const menuBijNavigatie = (): void => zet(MENU_BEGINSTAND_OPEN);

export function abonneerMenu(l: () => void): () => void {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}
