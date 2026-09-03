import { describe, expect, it, vi } from 'vitest';

import { laad, terugvalZetters } from './useAsync';

/**
 * De belofte onder `useAsync` — en onder de 32 kopieën waar hij er vijf van vervangt.
 *
 * ⚠️ **De belofte is niet "de hook laadt data" maar "er wordt niets geschreven
 *    nadat dit scherm weg is".** Dat is wat de `levend`-vlag deed op 32 plekken,
 *    en de reden dat hij overal stond: een `setState` op een verdwenen component
 *    is een waarschuwing die niemand leest, en bij een trage verbinding een
 *    scherm dat de data van het vórige doel toont.
 *
 * ⚠️ **De vlag beschermt twee dingen, en alleen het eerste is voor de hand
 *    liggend.** Unmount is er één. De ander is een wisseling van `deps`: wie van
 *    doel A naar doel B navigeert terwijl het verzoek voor A nog loopt, mag het
 *    antwoord van A niet meer zien landen. React ruimt de vorige effect-run op
 *    vóór de volgende begint, dus dezelfde vlag dekt allebei — en dus toetst
 *    "geschreven na `leeft() === false`" allebei.
 *
 * ⚠️ Er zit géén React in deze test, en dat is een keuze. `renderHook` vraagt een
 *    testbibliotheek en een DOM-omgeving; dit project draait zijn tests in node.
 *    Een dependency toevoegen om één vlag te bewijzen is de verkeerde ruil — dus
 *    staat de bewaking als losse functie in `useAsync.ts` en wordt hij hier
 *    gevoed.
 */

function opneming() {
  return { data: vi.fn(), fout: vi.fn(), klaar: vi.fn() };
}

describe('laad — wat er gebeurt terwijl het scherm er nog is', () => {
  it('schrijft de data, wist de fout en meldt klaar', async () => {
    const zet = opneming();

    await laad(() => Promise.resolve(42), () => true, zet);

    expect(zet.data).toHaveBeenCalledWith(42);
    expect(zet.fout).toHaveBeenCalledWith(null);
    expect(zet.klaar).toHaveBeenCalledTimes(1);
  });

  it('schrijft bij een fout de fout, en niet de data', async () => {
    const zet = opneming();
    const stuk = new Error('mislukt');

    await laad(() => Promise.reject(stuk), () => true, zet);

    expect(zet.data).not.toHaveBeenCalled();
    expect(zet.fout).toHaveBeenCalledWith(stuk);
    expect(zet.klaar).toHaveBeenCalledTimes(1);
  });
});

describe('laad — wat er níét gebeurt zodra het scherm weg is', () => {
  it('schrijft niets meer na een geslaagd verzoek', async () => {
    const zet = opneming();

    // ⚠️ De vlag klapt om terwijl het verzoek loopt — dat is precies het moment
    //    dat de kopieën bewaakten.
    let levend = true;
    await laad(
      () => Promise.resolve('laat').then((w) => { levend = false; return w; }),
      () => levend,
      zet,
    );

    expect(zet.data).not.toHaveBeenCalled();
    expect(zet.fout).not.toHaveBeenCalled();
    expect(zet.klaar).not.toHaveBeenCalled();
  });

  it('schrijft niets meer na een mislukt verzoek', async () => {
    const zet = opneming();

    let levend = true;
    await laad(
      () => Promise.reject(new Error('te laat')).catch((e: unknown) => { levend = false; throw e; }),
      () => levend,
      zet,
    );

    expect(zet.fout).not.toHaveBeenCalled();
    expect(zet.klaar).not.toHaveBeenCalled();
  });

  it('meldt ook geen "klaar" — de derde toets die het makkelijkst wegvalt', async () => {
    // ⚠️ Dit is de toets die een drieëndertigste kopie zou vergeten. `.then()` en
    //    `.catch()` bewaken voelt volledig; de `.finally()` erbij niet. En juist
    //    die zet `loading` op false, dus zonder hem toont een verdwenen scherm
    //    zijn lege staat in plaats van niets.
    const zet = opneming();

    await laad(() => Promise.resolve(1), () => false, zet);

    expect(zet.klaar).not.toHaveBeenCalled();
  });

  it('leest de vlag op het moment van binnenkomen en niet bij de aanroep', async () => {
    // ⚠️ `leeft` is een functie en geen boolean. Zou je hier een waarde
    //    meegeven, dan staat hij bevroren op `true` en is de hele bewaking weg —
    //    een fout die er precies zo uitziet als de goede versie.
    const zet = opneming();
    let levend = true;

    const bezig = laad(() => new Promise<number>((klaar) => setTimeout(() => klaar(7), 5)), () => levend, zet);
    levend = false;
    await bezig;

    expect(zet.data).not.toHaveBeenCalled();
  });
});


/**
 * De tweede vorm: één waarde met een terugval — QS8-219.
 *
 * ⚠️ **Zes plekken hadden dit blokje, en `useAsync` past er niet op.** Ze hebben
 *    geen laadstand en geen foutstand; een fout zet de wáárde terug op iets
 *    neutraals. Door `useAsync` persen zou `data ?? terugval` betekenen, en dan
 *    houdt een mislukte hérlaadbeurt de oude waarde vast in plaats van terug te
 *    vallen — een gedragswijziging vermomd als opruimwerk.
 *
 * ⚠️ **De hele beslissing is één regel, en die regel is een val.** `laad()` roept
 *    `zet.fout(null)` aan ná een geslaagde lezing, om een eerdere fout te wissen.
 *    Wie dat niet weet, schrijft `fout: () => zet(terugval)` en overschrijft
 *    precies de waarde die er net in gezet is. Het scherm toont dan altijd de
 *    terugval, en dat ziet er niet uit als een fout — de terugval is een geldige
 *    waarde.
 *
 * ⚠️ Met de hand rood gemaakt: de `if (fout !== null)` weghalen maakt de eerste
 *    test hieronder rood, en `data: zet` vervangen door een lege functie de
 *    tweede.
 */
describe('terugvalZetters — de val zit in het wissen van de fout', () => {
  it('laat de geladen waarde staan na een geslaagde lezing', async () => {
    const geschreven: string[] = [];

    await laad<string>(
      () => Promise.resolve('uit de database'),
      () => true,
      terugvalZetters<string>((w) => geschreven.push(w), 'de terugval'),
    );

    // ⚠️ Niet alleen "de waarde is geschreven", maar ook "de terugval is er
    //    daarna niet overheen gegaan". Dat tweede is wat er misgaat.
    expect(geschreven).toEqual(['uit de database']);
  });

  it('schrijft de terugval bij een echte fout', async () => {
    const geschreven: string[] = [];

    await laad(
      () => Promise.reject(new Error('mislukt')),
      () => true,
      terugvalZetters<string>((w) => geschreven.push(w), 'de terugval'),
    );

    expect(geschreven).toEqual(['de terugval']);
  });

  it('schrijft niets nadat het scherm weg is, ook de terugval niet', async () => {
    // De belofte van deze hele module, en die geldt voor beide vormen.
    const geschreven: string[] = [];

    await laad(
      () => Promise.reject(new Error('mislukt')),
      () => false,
      terugvalZetters<string>((w) => geschreven.push(w), 'de terugval'),
    );

    expect(geschreven).toEqual([]);
  });

  it('meldt geen laadstand, want deze vorm kent er geen', async () => {
    // `klaar` is met opzet leeg: het scherm toont de terugval tot er iets beters
    // is. Zou hier een `setState` staan, dan is dat een render zonder reden.
    const zetters = terugvalZetters(() => {}, 0);

    expect(() => zetters.klaar()).not.toThrow();
  });
});
