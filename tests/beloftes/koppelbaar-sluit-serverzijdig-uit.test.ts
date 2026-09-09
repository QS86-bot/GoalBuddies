/**
 * Het koppelscherm stuurt geen uitsluitlijst meer over de URL — QS8-345.
 *
 * ⚠️ **De belofte is niet "de code roept een RPC aan" maar "de vraag groeit niet
 *    mee met het aantal koppelingen".** QS8-342 haalde de uitsluiting uit het
 *    scherm en zette hem in de query, als `not.in` over de al gekoppelde id's.
 *    Daarmee klopte `count` — maar die lijst gaat mee in de URL, en 📏 rond de
 *    410 id's (≈15,3 KB) geeft `fetch` een harde `Headers Overflow Error`.
 *    Dezelfde doodlopende weg als QS8-342, verschoven van 21 doelen naar ~410.
 *
 * ⚠️ **Waarom een bronbewaking en geen gedragstest.** Dat de RPC het juiste
 *    antwoord geeft, staat in `tests/rls/koppelbare-doelen.test.ts` — met echte
 *    JWT's en vijfhonderd koppelingen. Wat díe test niet kan zien is of iemand
 *    de uitsluiting ooit terugverhuist naar de client: dan is het antwoord nog
 *    steeds goed, tot je er genoeg koppelingen naast zet. Dat is acceptatie-
 *    criterium 4 van dit issue, en het is een eigenschap van de vórm.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, één mutatie per grendel:
 *
 *   A  een `.not('id','in',…)` terugzetten in de vraag  → 1 rood
 *   A2 hetzelfde met `.filter('id','not.in',…)`         → 1 rood (was groen vóór
 *      de verbreding hieronder)
 *   B  een tweede `await supabase()` in de functie      → 1 rood: "stelt één vraag
 *      en niet twee"
 *   C  de functie hernoemen                             → 2 rood: "vindt de functie
 *      in de bron" én de telling, want die vindt dan niets meer
 *
 * ⚠️ **B bleef bij de eerste poging groen, en dat was de mutatie en niet de
 *    grendel.** Ik verving de éérste `const pagina = opties.pagina ?? 0;` in het
 *    bestand, en die staat in `fetchDoelen()` — regel 128 in plaats van 185. De
 *    grendel keek dus naar een functie waar niets aan veranderd was. Een groene
 *    ijking is geen uitslag maar een vraag: opnieuw gedraaid met de mutatie
 *    binnen `fetchKoppelbareDoelen()` zelf, en toen wél rood.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const BRON = join(__dirname, '..', '..', 'src', 'modules', 'goals', 'api.ts');

/** Het lichaam van `fetchKoppelbareDoelen()`, van signatuur tot sluitende accolade. */
function lichaam(): string {
  const bron = readFileSync(BRON, 'utf8');
  const start = bron.indexOf('export async function fetchKoppelbareDoelen(');
  if (start === -1) return '';
  const eind = bron.indexOf('\n}\n', start);
  return eind === -1 ? '' : bron.slice(start, eind);
}

describe('de koppelbare doelen worden serverzijdig uitgesloten', () => {
  /**
   * ⚠️ Zonder deze regel is de rest groen om niets: verdwijnt of hernoemt de
   *    functie, dan vindt de afleiding hierboven een lege string en meldt ze
   *    vrolijk niets.
   */
  it('vindt de functie in de bron', () => {
    expect(lichaam(), 'fetchKoppelbareDoelen() staat niet meer in src/modules/goals/api.ts').not.toBe(
      '',
    );
  });

  /**
   * ⚠️⚠️ **Op de vórm en niet op één methodenaam, en dat is een gemeten
   *    reparatie.** De eerste versie wees alleen `.not(` af. 📏 De security-review
   *    op deze branch zette de uitsluiting terug met
   *    `.filter('id', 'not.in', …)` — functioneel identiek, één woord anders — en
   *    de grendel bleef groen; tegen de echte PostgREST gaf diezelfde mutatie bij
   *    420 id's weer `TypeError: fetch failed`. Ik heb dat zelf nagedraaid en het
   *    klopt. Een grendel die je op één woord zet, loop je met een ander woord om.
   *
   *    Wat de belofte werkelijk zegt is: **in deze vraag zit geen lijst die met
   *    de data meegroeit.** Vandaar de vier filtervormen die zo'n lijst kunnen
   *    dragen, plus `join(` — het teken dat er überhaupt een lijst tot string
   *    gemaakt wordt.
   */
  it('bouwt geen uitsluitlijst in de vraag, in welke vorm dan ook', () => {
    // ⚠️ **De aanhalingsteken hoort erbij, en dat is meteen misgegaan.** Zonder
    //    hem meldde deze grendel `.filter((d): d is DoelMetVoortgang => …)` —
    //    het opruimen van de uitkomst, geen vraagfilter. Een PostgREST-filter
    //    neemt een kolomnaam als string; een array-filter neemt een functie. Die
    //    ene letter is het verschil tussen een grendel en een valse melding.
    const vormen = [/\.not\(['"`]/, /\.filter\(['"`]/, /\.or\(['"`]/, /\.in\(['"`]/, /\.join\(/];
    const gevonden = vormen.filter((vorm) => vorm.test(lichaam())).map((v) => v.source);

    expect(
      gevonden,
      'een lijst in de vraag gaat over de URL mee, en die klift rond de 410 id\'s — zie QS8-345',
    ).toEqual([]);
  });

  /**
   * ⚠️ **Eén verzoek en niet twee in serie** (acceptatiecriterium 2). De oude vorm
   *    haalde eerst de gekoppelde id's op en stelde daarna pas de echte vraag.
   */
  it('stelt één vraag en niet twee', () => {
    const aanroepen = lichaam().match(/supabase\(\)/g) ?? [];

    expect(aanroepen, 'twee `supabase()`-aanroepen betekent twee verzoeken in serie').toHaveLength(
      1,
    );
  });
});
