import type { Sleutel } from '../../shared/i18n';

import { HELDEN, type Heldsleutel } from './helden';

/**
 * De quotes van de zes helden — QS8-469.
 *
 * ⚠️ **Elke quote draagt zijn bron, en dat is besluit 3 van 14-09-2026 en geen
 *    opmaakkeuze.** Besluit 1 haalt de historische naam uit de hoofd-UI; de
 *    bronvermelding onder een citaat is iets anders dan een personage vernoemen.
 *    Correct attribueren voorkomt bovendien dat een echt citaat als verzonnen
 *    app-copy leest.
 *
 * ⚠️ **De quotetekst wordt niet vertaald maar gekozen.** Ali, Earhart,
 *    Nightingale en Twain schreven Engels: `en.ts` draagt hun origineel, `nl.ts`
 *    de vertaling uit het brondocument. Aurelius schreef Grieks en Da Vinci
 *    Italiaans: daar draagt `en.ts` de gevestigde publiek-domeinvertaling die
 *    het brondocument noemt (George Long 1862; Richter/MacCurdy). Een
 *    terugvertaling van het Nederlands naar het Engels zou een vijfde versie van
 *    een citaat maken dat al vier keer door een vertaler is gegaan.
 */

/**
 * Quotes die niet in de app horen, met de reden.
 *
 * ⚠️ **Dit is een register en geen commentaar, want dit is precies een belofte
 *    die stil breekt.** Alle vier komen ze bovenaan als je op de held zoekt, en
 *    een latere sessie die "een mooie quote erbij" doet heeft geen enkele reden
 *    te vermoeden dat juist deze vier afgekeurd zijn. Het brondocument
 *    waarschuwt er per held voor; hier wordt het toetsbaar.
 *
 * ⚠️ **De fragmenten zijn Engels omdat de valse toeschrijvingen Engels
 *    circuleren.** Een Nederlandse vertaling ervan glipt langs dit filter — dat
 *    is een bekende grens van deze controle en geen vergeten geval. De tweede,
 *    sterkere grendel staat in `quotes.test.ts`: het aantal quotes per held ligt
 *    vast in `HELDEN`, dus een quote toevoegen dwingt je langs dit register.
 */
export const AFGEKEURDE_QUOTES: readonly { readonly fragment: string; readonly reden: string }[] = [
  {
    fragment: 'the most difficult thing is the decision to act',
    reden: 'Toegeschreven aan Amelia Earhart, maar niet naar een originele bron te herleiden.',
  },
  {
    fragment: 'i love those who can smile in trouble',
    reden: 'Toegeschreven aan Da Vinci; is aantoonbaar van Thomas Paine, The American Crisis (1776).',
  },
  {
    fragment: 'twenty years from now you will be more disappointed',
    reden: 'Bekende Twain-nepquote; niet met zekerheid van hem.',
  },
  {
    fragment: 'the secret of getting ahead is getting started',
    reden: 'Bekende Twain-nepquote; niet met zekerheid van hem.',
  },
] as const;

export interface Quotesleutels {
  readonly tekst: Sleutel;
  readonly bron: Sleutel;
}

/**
 * De twee sleutels van één quote: zijn tekst en zijn bron.
 *
 * ⚠️ **Ze komen samen uit één functie omdat ze nooit los horen.** Een quote
 *    zonder bron is besluit 3 van QS8-468 gebroken, en een oproeper die twee
 *    aparte helpers heeft, kan de tweede vergeten zonder dat iets rood wordt.
 */
export function quoteSleutels(held: Heldsleutel, nummer: number): Quotesleutels {
  return {
    tekst: `held.${held}.quote${nummer}` as Sleutel,
    bron: `held.${held}.quote${nummer}.bron` as Sleutel,
  };
}

/**
 * Elke quotesleutel van elke held, met zijn bronsleutel ernaast.
 *
 * ⚠️ Dit is de lijst waar `quotes.test.ts` de catalogus mee vergelijkt — in
 *    béide richtingen. Een sleutel hier zonder tekst in de catalogus is een lege
 *    quote op het scherm; een tekst in de catalogus zonder sleutel hier is een
 *    quote die niemand ooit te zien krijgt, en dat is de stillere van de twee.
 */
export function alleQuoteSleutels(): readonly Quotesleutels[] {
  return HELDEN.flatMap((h) =>
    Array.from({ length: h.aantalQuotes }, (_, i) => quoteSleutels(h.sleutel, i + 1)),
  );
}
