/**
 * Wat een keuzeknop tegen een schermlezer zegt — QS8-794.
 *
 * ⚠️ **Eén vorm: de wisselknop, `aria-pressed`.** Een radio (`role="radio"` + `aria-checked`) is
 *    geprobeerd en teruggedraaid: in react-native-web 0.21 laat `PressResponder` de spatiebalk alleen door op
 *    een `<button>` of rol `button` (`isValidKeyPress`), dus op een radio werkt alleen Enter en scrolt de
 *    pagina bij een spatie. Een toegankelijkheidsfix die het toetsenbord slechter maakt, is geen fix. Een
 *    radio kan terug zodra hij een eigen spatie-afhandeling en een toets daarop heeft; zie
 *    `docs/decisions/2026-11-23-een-gekozen-keuzeknop-is-een-wisselknop-of-een-radio.md`.
 *
 * ⚠️ **Op web komt alleen de losse `aria-*`-prop in de DOM.** react-native-web 0.21 leest
 *    `accessibilityState` niet; `Button` zette alleen die, dus een schermlezer hoorde nooit welke keuze
 *    gekozen was. Gemeten in QS8-794 aan de echte DOM (`tests/render/keuzeknop.test.ts`). Op native is het
 *    omgekeerd: daar is `accessibilityState` de weg, en `aria-pressed` bestaat niet in de typen. Beide kanten
 *    staan er daarom.
 *
 * Het bestand importeert geen `react-native`, zodat het zonder renderer te toetsen is.
 */

export interface KeuzeEigenschappen {
  /** Wat in `accessibilityState` erbij hoort; native leest dit, web negeert het. */
  readonly state: { readonly selected: boolean };
  /** De losse `aria-*`-props; alleen gevuld op web. */
  readonly aria: { readonly 'aria-pressed'?: boolean };
}

/**
 * De eigenschappen die `Button` voor een gekozen stand op zijn `Pressable` zet.
 *
 * `state` gaat altijd mee; `aria` alleen op web, want op native is een onbekende prop ruis.
 */
export function keuzeEigenschappen(gekozen: boolean, web: boolean): KeuzeEigenschappen {
  const state = { selected: gekozen };
  return web ? { state, aria: { 'aria-pressed': gekozen } } : { state, aria: {} };
}
