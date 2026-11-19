import { useSyncExternalStore } from 'react';

/**
 * Is de app in de browser klaar met hydrateren? — QS8-740.
 *
 * ⚠️ **Op de server en tijdens de hydratie is dit `false`, daarna `true`.** Dat
 *    is `useSyncExternalStore` met een server-snapshot: React gebruikt die bij
 *    het tekenen op de server én bij de eerste clientronde, dus beide zien
 *    hetzelfde, en pas daarná schakelt de client over. Er is geen effect en geen
 *    `setState` bij betrokken.
 *
 * ⚠️ **Waarom de app dit nodig heeft.** De taal van de app is een
 *    procesbrede variabele (`src/shared/i18n`) en komt uit het apparaat. Tijdens
 *    `expo export` bestaat er geen apparaat: Node heeft een globale `navigator`
 *    waarvan `language` de `LANG` van de bouwmachine volgt. 📏 Gemeten op een
 *    lokale export (19-11-2026): bouwmachine `en-US` geeft een Engelse prerender,
 *    bouwmachine `nl-NL` een Nederlandse, en elke client met een andere taal dan
 *    de prerender geeft React-fout #418. Wat de gebruiker te zien krijgt hangt
 *    zo af van waar `npm run deploy` draait. Door vóór de hydratie niets te
 *    tekenen wat van de taal afhangt, kan er niets verschillen.
 *
 * ⚠️ **Niet aanroepen op een plek waar de server-uitvoer ertoe doet voor
 *    zoekmachines of delen.** De prerender van deze app is een uitgelogd scherm
 *    dat een bezoeker toch nooit hoort te zien (de routewacht stuurt hem naar
 *    aanmelden); zie `docs/decisions/2026-11-19-de-prerender-is-neutraal-en-de-app-start-na-de-hydratie.md`.
 */
const abonneer = (): (() => void) => () => undefined;
const opClient = (): boolean => true;
const opServer = (): boolean => false;

export function useGehydrateerd(): boolean {
  return useSyncExternalStore(abonneer, opClient, opServer);
}
