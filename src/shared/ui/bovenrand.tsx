import { createContext, useContext, type ReactNode } from 'react';

/**
 * Wie de bovenrand van het scherm al opgegeten heeft — QS8-246.
 *
 * ⚠️ **Dit bestaat omdat de tabbalk sinds QS8-246 bovenaan staat, en die neemt
 *    de veilige zone zélf.** Gemeten in
 *    `expo-router/build/react-navigation/bottom-tabs/views/BottomTabBar.js`:
 *    met `tabBarPosition: 'top'` zet de balk `paddingTop: insets.top`. Zou
 *    `Screen` daar zijn eigen `insets.top` bovenop leggen, dan staat er op een
 *    toestel met een notch twee keer een inkeping aan ruimte — en precies dat is
 *    het geval dat op een simulator zonder notch onzichtbaar blijft.
 *
 * ⚠️ **Een context en geen prop, want een prop is te vergeten.** Elk scherm
 *    onder `app/(tabs)` zit hier automatisch in; een nieuw tabblad erft het
 *    zonder dat iemand eraan hoeft te denken. Een `bovenrandAl={true}` op vier
 *    schermen is vier kansen om het bij de vijfde te vergeten, en dan is het
 *    verschil een paar pixels die niemand meldt.
 *
 * ⚠️ **Schermen buiten de tabs blijven zelf verantwoordelijk.** Die staan op een
 *    stack zónder balk erboven; daar is `insets.top` wél de juiste rekensom. De
 *    standaardwaarde `false` zegt dat, en is de veilige kant: te veel ruimte is
 *    lelijk, te weinig is onleesbaar onder een notch.
 */
const BovenrandContext = createContext(false);

/** Zegt tegen alles eronder dat de veilige bovenrand al verrekend is. */
export function BovenrandAlVerrekend({ children }: { readonly children: ReactNode }) {
  return <BovenrandContext.Provider value={true}>{children}</BovenrandContext.Provider>;
}

/** Of er boven dit scherm al iets staat dat de veilige zone genomen heeft. */
export function useBovenrandAlVerrekend(): boolean {
  return useContext(BovenrandContext);
}

/**
 * Hoeveel veilige ruimte een scherm zélf nog bovenaan moet vrijhouden.
 *
 * ⚠️ **De rekensom is één regel en staat toch apart, want de fout die hij
 *    voorkomt is niet zichtbaar.** Twee keer `insets.top` optellen geeft op een
 *    toestel zónder notch nul verschil en op een toestel mét notch een dubbele
 *    marge — en dit project heeft geen simulator met een notch. Een benoemde
 *    functie is te voeden en dus te ijken; een ternair midden in een
 *    stijl-array is dat niet.
 */
export function veiligeBovenrand(insetTop: number, alVerrekend: boolean): number {
  return alVerrekend ? 0 : insetTop;
}

