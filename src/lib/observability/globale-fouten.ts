/**
 * Fouten die niemand opving — QS8-24, criterium 1.
 *
 * ⚠️ **Waarom dit apart moet.** `reportError()` vangt wat de code zélf afvangt:
 *    34 plekken die netjes een `catch` hebben. Wat er níét in zit is precies wat
 *    je het liefst zou willen weten — de fout waar geen `catch` omheen staat, de
 *    `Promise` die afgewezen wordt zonder `.catch()`. Zonder deze koppeling
 *    meldt de app alleen de fouten waarvan iemand al had bedacht dat ze konden
 *    optreden.
 *
 * ⚠️ **Alleen web, en dat is een grens en geen omissie.** Op native zou dit via
 *    `ErrorUtils.setGlobalHandler()` gaan. Die code kan hier niet draaien en is
 *    ook niet te toetsen: er is geen `eas.json`, geen EAS-project, en dus geen
 *    native build. Ongetoetste code schrijven die pas over maanden voor het eerst
 *    uitgevoerd wordt, is dezelfde fout als `sentry:proef` die nooit gedraaid
 *    had — en die kostte 26-08 twee ronden. Wat er wél op native werkt is elke
 *    expliciete `reportError()`; dat zijn dezelfde 34 plekken.
 *
 * ⚠️ **`melden` krijgt de fout en niet de gebeurtenis.** Het schoonmaken gebeurt
 *    verderop in `reportError()`, en dat hoort maar op één plek te zitten. Deze
 *    module beslist alleen *wat* er gemeld wordt, niet wat er de deur uit mag.
 */

/** Het stukje `window` dat we nodig hebben. Losgetrokken zodat de test het kan leveren. */
export interface Luisteraar {
  addEventListener(soort: string, handler: (gebeurtenis: unknown) => void): void;
  removeEventListener(soort: string, handler: (gebeurtenis: unknown) => void): void;
}

/** De twee soorten die een onafgevangen fout aankondigen. */
export const SOORTEN = ['error', 'unhandledrejection'] as const;

export type Soort = (typeof SOORTEN)[number];

/**
 * Haalt de fout uit een browsergebeurtenis.
 *
 * ⚠️ De twee soorten dragen hem op een andere plek: `ErrorEvent.error` en
 *    `PromiseRejectionEvent.reason`. Dat verschil is de hele reden dat deze
 *    functie bestaat en getoetst wordt.
 *
 * ⚠️ Valt terug op de gebeurtenis zelf als geen van beide velden er is. Dat
 *    levert in het slechtste geval een `NonError` op met een matige melding —
 *    beter dan een melding die verdwijnt omdat de vorm onverwacht was.
 */
export function foutUit(gebeurtenis: unknown): unknown {
  if (typeof gebeurtenis !== 'object' || gebeurtenis === null) return gebeurtenis;

  const velden = gebeurtenis as { error?: unknown; reason?: unknown };

  if (velden.error !== undefined && velden.error !== null) return velden.error;
  if (velden.reason !== undefined && velden.reason !== null) return velden.reason;

  return gebeurtenis;
}

/** Waar de melding vandaan komt, als tag in Sentry. */
export function waarVoor(soort: Soort): string {
  return soort === 'error' ? 'globaal.fout' : 'globaal.belofte';
}

/**
 * Koppelt de afvang. Geeft een functie terug die hem weer losmaakt.
 *
 * ⚠️ De losmaakfunctie bestaat voor de test en niet voor de app: die koppelt één
 *    keer bij het opstarten en laat het staan. Zonder losmaken lekt elke test
 *    zijn handler naar de volgende.
 */
export function koppelGlobaleFouten(
  doel: Luisteraar,
  melden: (fout: unknown, waar: string) => void,
): () => void {
  const handlers = SOORTEN.map((soort) => {
    const handler = (gebeurtenis: unknown): void => {
      melden(foutUit(gebeurtenis), waarVoor(soort));
    };
    doel.addEventListener(soort, handler);
    return { soort, handler };
  });

  return () => {
    for (const { soort, handler } of handlers) doel.removeEventListener(soort, handler);
  };
}
