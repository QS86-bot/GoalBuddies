/**
 * Wanneer de kaart "er wacht iets op jou" te zien is — QS8-148.
 *
 * ⚠️ **Deze twee regels zijn een keer fout gegaan en dat is de reden dat ze hier
 *    staan in plaats van in een component.** De kaart verborg zichzelf als het
 *    tellen mislukte: in de trein stond er dan niets, terwijl er drie mensen op
 *    een oordeel wachtten, zonder enige manier om dat te controleren. Dat raakt
 *    de succesmetriek uit de PRD rechtstreeks — ≥80% goedgekeurd binnen 48 uur —
 *    want wie het niet ziet, beoordeelt niet.
 *
 *    Een regel die in een `if` boven aan een schermcomponent staat, verhuist mee
 *    met dat component en wordt bij de tweede kopie stilzwijgend anders. Sinds
 *    QS8-148 hangt de kaart op twee tabbladen; dan is één plek waar "wanneer
 *    tonen we hem" beslist wordt geen netheid meer maar een voorwaarde.
 *
 * ⚠️ Dit bestand importeert alleen een type, en dat is bij het compileren weg.
 *    Alles wat bewezen moet worden staat hier; `TeBeoordelenKaart.tsx` sluit het
 *    alleen aan. Dezelfde scheiding als bij `vertrekwacht.ts` en
 *    `useVertrekwacht.ts` — een testrunner in Node hoeft er geen React Native
 *    voor te laden.
 */
import type { Sleutel } from '../i18n';

/** Wat de kaart van de buitenwereld weet. */
export interface Beoordeelstand {
  /** Hoeveel voltooiingen er op jouw oordeel wachten. */
  readonly aantal: number;
  /** Is het tellen mislukt? Dan is `aantal` niets waard. */
  readonly mislukt: boolean;
}

/**
 * Moet de kaart getoond worden?
 *
 * ⚠️ **Op nul blijft hij weg, bij een storing juist niet.** Die twee zien er als
 *    één regel uit en zijn het niet:
 *
 *    * Een kaart die permanent "0 te beoordelen" meldt, leert mensen om er niet
 *      meer naar te kijken — en dan is hij nutteloos op het moment dat er wél
 *      iets staat.
 *    * Een kaart die bij een storing verdwijnt, líegt: hij zegt "niets" waar het
 *      antwoord "onbekend" is. Beter een keer voor niets kijken dan nooit weten
 *      dat er iets was.
 */
export function toonBeoordeelkaart({ aantal, mislukt }: Beoordeelstand): boolean {
  if (mislukt) return true;
  return aantal > 0;
}

/**
 * Welke tekst er in de kop hoort.
 *
 * ⚠️ Een sleutel en geen zin, want de catalogus bepaalt de taal. Het enige dat
 *    hier beslist wordt, is wélke van de drie — en dat is precies de keuze die
 *    bij een tweede kopie van de kaart uit elkaar zou lopen.
 */
export function beoordeelkopSleutel({ aantal, mislukt }: Beoordeelstand): Sleutel {
  if (mislukt) return 'groepen.wachten_onbekend';
  return aantal === 1 ? 'groepen.wacht_een' : 'groepen.wachten_meer';
}
