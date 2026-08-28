/**
 * Wat `prefers-reduced-motion` met een animatie doet — één plek, en testbaar.
 *
 * ⚠️ **Zonder imports, en dat is de hele reden dat dit bestand bestaat.**
 *    `a11y.ts` haalt `AccessibilityInfo` uit `react-native`, en dat is
 *    Flow-syntaxis die een node-test niet leest. Gevolg: de belofte "wie om
 *    minder beweging vraagt, krijgt geen beweging" stond in vier componenten
 *    uitgeschreven en was door niets te toetsen. Zelfde vorm als
 *    `vertrekwacht.ts`: de kern puur, de React-kant eromheen.
 *
 * ⚠️ **`web` komt als parameter binnen en wordt hier niet uitgerekend.** Dat is
 *    wat het bestand importvrij houdt; de aanroeper geeft `Platform.OS === 'web'`
 *    door. Een `Platform`-import hier zou dezelfde muur terugzetten.
 *
 * ⚠️ **De duur blijft een parameter en wordt met opzet niet gelijkgetrokken.**
 *    De voortgangsbalken doen 260 ms en `FloorCeiling` doet er 220. Dat verschil
 *    is een ontwerpkeuze van iemand anders, en een opruimronde hoort die niet
 *    stilzwijgend weg te poetsen.
 */

/** De stijl die een web-overgang aanzet, of niets. */
export interface BewegingsStijl {
  readonly transitionDuration?: string;
}

/**
 * De overgangsstijl voor een balk die van breedte verandert.
 *
 * Geeft een leeg object bij `prefers-reduced-motion` én op native — daar bestaat
 * `transitionDuration` niet en zou het een stijl zijn die nergens op slaat.
 *
 * ⚠️ **Niet cosmetisch.** Voor mensen met vestibulaire klachten is een
 *    schuivende voortgangsbalk misselijkmakend, en dit is een app die je elke
 *    week opent. Dat stond al in `a11y.ts` en het is de reden dat deze functie
 *    een eigen test heeft in plaats van vier keer overgetypt te worden.
 */
export function bewegingsStijl(reduced: boolean, web: boolean, ms: number): BewegingsStijl {
  if (reduced || !web) return {};
  return { transitionDuration: `${ms}ms` };
}

/**
 * Animatieduur in ms, of 0 als de gebruiker om minder beweging heeft gevraagd.
 *
 * ⚠️ Voor `Animated.timing`, waar een getal in gaat en geen stijl. `Viering.tsx`
 *    schreef dit met de hand uit terwijl `motionDuration()` in `a11y.ts` precies
 *    dit deed en door niemand werd aangeroepen — inclusief een commentaarregel
 *    die beweerde dat hij het wél deed.
 */
export function bewegingsDuur(reduced: boolean, ms: number): number {
  return reduced ? 0 : ms;
}
