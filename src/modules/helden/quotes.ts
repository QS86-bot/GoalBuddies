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
 * De sleutels van elke quote, voluit.
 *
 * ⚠️⚠️ **Voluit en niet samengesteld, om dezelfde twee redenen als bij
 *    `heldTekstSleutel()` en de quizsleutels (QS8-474).** Hier stond
 *    `` `held.${held}.quote${nummer}` as Sleutel ``, en die cast is precies zo
 *    sterk als de belofte dat de sleutel bestaat — `t()` valt bij een onbekende
 *    sleutel terug op de sleutel zelf, dus een typefout werd een scherm met
 *    `held.quip.quote4` erop, en Quip heeft er maar drie.
 *
 *    De tweede reden is dat `npm run catalogus:controle` een
 *    template-literal alleen herkent als hij **direct in `t()`** staat. Zolang
 *    deze helper er een samenstelde, bleven de vierenveertig quotesleutels
 *    onzichtbaar voor die controle — óók nadat QS8-475 ze op het scherm zette,
 *    en dan zou de reden "heldenquote zonder melding" stil onwaar zijn geworden
 *    bij vierenveertig rijen tegelijk.
 *
 * ⚠️ **Het aantal per held staat nog steeds in `HELDEN` en niet hier.** Deze
 *    tabel is de sleutellijst; het rooster blijft de bron van hoeveel er zijn.
 *    `quotes.test.ts` legt de twee naast elkaar, in beide richtingen — een
 *    sleutel hier zonder plek in het rooster en een plek zonder sleutel worden
 *    allebei rood.
 */
const QUOTESLEUTELS: Readonly<Record<Heldsleutel, readonly Quotesleutels[]>> = {
  strix: [
    {
      tekst: 'held.strix.quote1',
      bron: 'held.strix.quote1.bron',
    },
    {
      tekst: 'held.strix.quote2',
      bron: 'held.strix.quote2.bron',
    },
    {
      tekst: 'held.strix.quote3',
      bron: 'held.strix.quote3.bron',
    },
    {
      tekst: 'held.strix.quote4',
      bron: 'held.strix.quote4.bron',
    },
  ],
  ignis: [
    {
      tekst: 'held.ignis.quote1',
      bron: 'held.ignis.quote1.bron',
    },
    {
      tekst: 'held.ignis.quote2',
      bron: 'held.ignis.quote2.bron',
    },
    {
      tekst: 'held.ignis.quote3',
      bron: 'held.ignis.quote3.bron',
    },
    {
      tekst: 'held.ignis.quote4',
      bron: 'held.ignis.quote4.bron',
    },
  ],
  meridian: [
    {
      tekst: 'held.meridian.quote1',
      bron: 'held.meridian.quote1.bron',
    },
    {
      tekst: 'held.meridian.quote2',
      bron: 'held.meridian.quote2.bron',
    },
    {
      tekst: 'held.meridian.quote3',
      bron: 'held.meridian.quote3.bron',
    },
    {
      tekst: 'held.meridian.quote4',
      bron: 'held.meridian.quote4.bron',
    },
  ],
  forge: [
    {
      tekst: 'held.forge.quote1',
      bron: 'held.forge.quote1.bron',
    },
    {
      tekst: 'held.forge.quote2',
      bron: 'held.forge.quote2.bron',
    },
    {
      tekst: 'held.forge.quote3',
      bron: 'held.forge.quote3.bron',
    },
  ],
  lucerna: [
    {
      tekst: 'held.lucerna.quote1',
      bron: 'held.lucerna.quote1.bron',
    },
    {
      tekst: 'held.lucerna.quote2',
      bron: 'held.lucerna.quote2.bron',
    },
    {
      tekst: 'held.lucerna.quote3',
      bron: 'held.lucerna.quote3.bron',
    },
    {
      tekst: 'held.lucerna.quote4',
      bron: 'held.lucerna.quote4.bron',
    },
  ],
  quip: [
    {
      tekst: 'held.quip.quote1',
      bron: 'held.quip.quote1.bron',
    },
    {
      tekst: 'held.quip.quote2',
      bron: 'held.quip.quote2.bron',
    },
    {
      tekst: 'held.quip.quote3',
      bron: 'held.quip.quote3.bron',
    },
  ],
};

/**
 * De twee sleutels van één quote: zijn tekst en zijn bron.
 *
 * ⚠️ **Ze komen samen uit één functie omdat ze nooit los horen.** Een quote
 *    zonder bron is besluit 3 van QS8-468 gebroken, en een oproeper die twee
 *    aparte helpers heeft, kan de tweede vergeten zonder dat iets rood wordt.
 *
 * ⚠️ `nummer` is eenbasig, zoals de sleutels in de catalogus. Een nummer buiten
 *    bereik werpt in plaats van een sleutel te verzinnen die niet bestaat —
 *    faalt dicht, zoals `heldVoorTrigger()`.
 */
export function quoteSleutels(held: Heldsleutel, nummer: number): Quotesleutels {
  const gevonden = QUOTESLEUTELS[held][nummer - 1];
  if (!gevonden) throw new Error(`held ${held} heeft geen quote ${nummer}`);
  return gevonden;
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

/**
 * Welke quote deze held bij deze verschijning zegt.
 *
 * ⚠️⚠️ **Deterministisch uit het tijdstip, en met opzet géén `Math.random()`.**
 *    QS8-475 waarschuwt daar bij Quip voor: willekeur in een pad dat je wilt
 *    toetsen, is een test die soms faalt — en "flake" is in dit project geen
 *    root cause. Hier is het bovendien gratis op te lossen, want er ís een
 *    natuurlijke bron: het moment waarop de held sprak ligt al vast in
 *    `hero_appearances.shown_at`.
 *
 * ⚠️ **En het is niet alleen een testvoordeel.** Een willekeurige keuze bij elke
 *    render laat de quote onder je neus verspringen zodra het scherm opnieuw
 *    tekent. Dezelfde verschijning hoort dezelfde zin te geven, elke keer dat je
 *    ernaar kijkt.
 *
 * ⚠️ Valt terug op de eerste quote bij een tijdstempel die niet te lezen is.
 *    Een held zónder quote tonen zou de kaart halverwege laten ophouden.
 */
export function quoteVoorVerschijning(held: Heldsleutel, wanneer: string): Quotesleutels {
  const aantal = QUOTESLEUTELS[held].length;
  const moment = Date.parse(wanneer);

  if (!Number.isFinite(moment)) return quoteSleutels(held, 1);

  // ⚠️ Op hele minuten, niet op milliseconden. Twee verschijningen binnen
  //    dezelfde minuut horen niet per ongeluk een andere quote te krijgen als
  //    de tijdstempel ergens onderweg wordt afgerond.
  const minuten = Math.floor(moment / 60_000);
  return quoteSleutels(held, (((minuten % aantal) + aantal) % aantal) + 1);
}
