/**
 * Wat een keuzeknop tegen een schermlezer zegt — QS8-794.
 *
 * ⚠️ **Twee vormen en geen derde, want "gekozen" betekent twee dingen.**
 *    - `wissel`: een knop die je aan en uit zet (meer antwoorden kunnen tegelijk
 *      gekozen zijn, of een gekozen antwoord haal je weg met een tweede tik).
 *      Dat is een wisselknop: `aria-pressed`.
 *    - `radio`: precies één van een vaste groep, en een tik op de gekozene haalt hem
 *      niet weg. Dat is een radio: `role="radio"` met `aria-checked`, in een
 *      container met `role="radiogroup"`.
 *    Welke van de twee past staat per gebruik in
 *    `docs/decisions/2026-11-23-een-gekozen-keuzeknop-is-een-wisselknop-of-een-radio.md`.
 *
 * ⚠️ **Op web komt alleen de losse `aria-*`-prop in de DOM.** react-native-web 0.21
 *    leest `accessibilityState` niet; `Button` zette alleen die, dus een schermlezer
 *    hoorde nooit welke keuze gekozen was. Gemeten in QS8-794 aan de echte DOM
 *    (`tests/render/keuzeknop.test.ts`). Op native is het omgekeerd: daar is
 *    `accessibilityState` de weg, en `aria-pressed` bestaat niet in de typen. Beide
 *    kanten staan er daarom, en dit bestand legt vast welke waar toeziet.
 *
 * Het bestand importeert geen `react-native`, zodat het zonder renderer te toetsen is.
 */

export type KeuzeVorm = 'wissel' | 'radio';

export interface Keuze {
  readonly vorm: KeuzeVorm;
  readonly gekozen: boolean;
}

export interface KeuzeEigenschappen {
  /** Wat in `accessibilityState` erbij hoort; native leest dit, web negeert het. */
  readonly state: { readonly selected?: boolean; readonly checked?: boolean };
  /** De losse `aria-*`-props; alleen gevuld op web. */
  readonly aria: {
    readonly role?: 'radio';
    readonly 'aria-pressed'?: boolean;
    readonly 'aria-checked'?: boolean;
  };
}

/**
 * De eigenschappen die `Button` voor een keuze op zijn `Pressable` zet.
 *
 * `state` gaat altijd mee; `aria` alleen op web, want op native is een onbekende prop ruis.
 */
export function keuzeEigenschappen(keuze: Keuze, web: boolean): KeuzeEigenschappen {
  const radio = keuze.vorm === 'radio';
  const state = radio ? { checked: keuze.gekozen } : { selected: keuze.gekozen };

  if (!web) return { state, aria: {} };
  if (radio) return { state, aria: { role: 'radio', 'aria-checked': keuze.gekozen } };
  return { state, aria: { 'aria-pressed': keuze.gekozen } };
}
