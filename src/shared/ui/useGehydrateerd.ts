import { useSyncExternalStore } from 'react';

/**
 * Is de app in de browser klaar met hydrateren? — QS8-740.
 *
 * ⚠️ **Op de server en tijdens de hydratie is dit `false`, daarna `true`.** Dat
 *    is `useSyncExternalStore` met een server-snapshot: React gebruikt die bij
 *    het tekenen op de server én bij de eerste clientronde, dus beide zien
 *    hetzelfde in tekst en structuur, en pas daarná schakelt de client over. In
 *    onze code is er geen effect en geen `setState`; React doet de omschakeling
 *    zelf, via een passief effect ná de hydratie (react-dom 19.2.3), dus de
 *    app start een taak later dan de hydratie, niet in dezelfde tik.
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
 * ⚠️ **De prijs, en hij is gemeten.** Voor `/` is de prerender een uitgelogd scherm
 *    dat een bezoeker niet hoort te zien. Maar `/aanmelden` en `/uitnodiging/[code]`
 *    zijn openbaar (`bestemmingVoor()` in `routewacht.ts`), en daar stond er vóór
 *    deze wijziging meteen tekst. Nu is het een leeg vlak tot de bundel binnen
 *    en gehydrateerd is: 📏 eerste tekst na ~60 ms vóór, ~280 ms na, en ~1780 ms
 *    na met een bundel die 1500 ms te laat komt (lokaal, ongethrottled en
 *    vertraagd). Zie
 *    `docs/decisions/2026-11-19-de-prerender-is-neutraal-en-de-app-start-na-de-hydratie.md`.
 */
const abonneer = (): (() => void) => () => undefined;
const opClient = (): boolean => true;
const opServer = (): boolean => false;

export function useGehydrateerd(): boolean {
  return useSyncExternalStore(abonneer, opClient, opServer);
}
