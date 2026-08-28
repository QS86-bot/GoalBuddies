import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `tekst-controle.test.ts`.
import { controleer } from '../../scripts/review-controle.mjs';

/**
 * De ijking van `npm run review:controle`.
 *
 * ⚠️ **Wat je niet kunt voeden, kun je niet ijken.** Dit script bewaakte tot
 *    25-08 één ding, en dat deed het goed. De twee toetsen die er die dag bij
 *    kwamen, kwamen er allebei omdat het document ze nodig had gehad en niemand
 *    het zag — twee Hoog-rijen die al maanden gerepareerd waren, en twee rijen
 *    met het zelfverzonnen risiconiveau `Gedicht` dat langs elk filter glipte.
 *
 * ⚠️ **De helft "moet met rust gelaten worden" is hier de belangrijkste.** De
 *    eerste versie van de reparatietoets keek ook naar het losse woord
 *    `opgelost` en meldde toen vier rijen die "gedeeltelijk opgelost", "kan
 *    opgelost worden door" en "nog niet opgelost" zeggen. Een controle die alles
 *    meldt, leer je te negeren.
 */

const rij = (titel: string, romp: string, risico: string) =>
  `| 2026-08-25 | ${titel} | ${romp} | ${risico} |`;

describe('wat de controle moet vinden', () => {
  it('een risiconiveau dat geen bekend woord is', () => {
    const klachten = controleer([rij('X', 'iets', 'Gedicht')]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('onbekend-niveau');
  });

  it('een beschrijving die opgelost zegt terwijl de kolom openstaat', () => {
    const klachten = controleer([rij('X', '✅ **Gedicht in 0066.** enzovoort', '**Hoog**')]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('stale');
  });

  it('dat ook zonder vinkje, als er "gedicht in 0037" staat', () => {
    const klachten = controleer([rij('X', 'Gedicht in 0037: een trigger weigert de rij.', 'Middel')]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('stale');
  });

  it('een open Laag-rij zonder herbeoordelingsvoorwaarde', () => {
    const klachten = controleer([rij('X', 'zelfbedrog, geen autorisatiegrens', 'Laag')]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('geen-voorwaarde');
  });

  it('een rij die zichzelf uit de agenda schrijft terwijl de kolom hem open houdt', () => {
    const klachten = controleer([
      rij('X', 'Blijft staan als context, niet als openstaand werk.', 'Middel'),
    ]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('geen-agendapunt');
  });

  it('ook in de vorm "geen bevinding maar een afweging"', () => {
    const klachten = controleer([
      rij('X', 'Dat is geen bevinding maar een afweging die je opnieuw kunt maken.', 'Middel'),
    ]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('geen-agendapunt');
  });

  it('ook op Hoog, want de agenda begint boven Laag', () => {
    const klachten = controleer([rij('X', 'Hier is geen openstaand werk meer.', '**Hoog**')]);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]?.soort).toBe('geen-agendapunt');
  });
});

describe('wat de controle met rust moet laten', () => {
  it('een afgehandelde rij', () => {
    expect(controleer([rij('X', '✅ **Gedicht in 0066.**', '~~Hoog~~ opgelost')])).toEqual([]);
  });

  it('een afgehandelde Laag-rij zonder voorwaarde', () => {
    // Doorgestreept is klaar; dan hoeft er geen herbeoordeling meer bij.
    expect(controleer([rij('X', '✅ klaar', '~~Laag~~ opgelost')])).toEqual([]);
  });

  it('een open Laag-rij mét voorwaarde', () => {
    const romp = 'zelfbedrog. **Wordt zwaarder als:** een beslissing hierop gaat leunen.';

    expect(controleer([rij('X', romp, 'Laag')])).toEqual([]);
  });

  it.each([
    'Gedeeltelijk opgelost: de kern is gedekt, de rest niet.',
    'Kan opgelost worden door de teller append-only te maken.',
    'Nog niet opgelost. Wie weg navigeert is zijn tekst kwijt.',
  ])('een rij die alleen het wóórd opgelost bevat: %s', (romp) => {
    // ⚠️ Precies de vier valse meldingen die de eerste versie opleverde.
    expect(controleer([rij('X', romp, 'Middel')])).toEqual([]);
  });

  it('een rij die "gedicht" zegt over iets ánders en zelf openstaat', () => {
    // ⚠️ De rij van 17-08 over het ontkoppelen: bewust niet gerepareerd, maar de
    //    escalatie erop is wél gedicht in 0066. De open-markering wint.
    const romp =
      '**Bewust niet gerepareerd:** zelfbedrog. **Wordt zwaarder als:** een ' +
      'beslissing erop leunt. Dat is op 22-08 gebeurd — gedicht in 0066.';

    expect(controleer([rij('X', romp, 'Laag')])).toEqual([]);
  });

  it('een rij die gemeten is maar bewust niet gerepareerd', () => {
    // ⚠️ De group_overview-rij: ✅ gemeten, en met opzet niet aangepast.
    const romp =
      '✅ **Gemeten op 25-08.** Warm 4,6 ms bij 50 leden. **Niet gerepareerd**, ' +
      'nu met een reden. **Wordt zwaarder als:** een groep boven de honderd komt.';

    expect(controleer([rij('X', romp, 'Laag')])).toEqual([]);
  });

  it('een regel die geen bevindingsrij is', () => {
    expect(controleer(['| Datum | Bestand | Onzeker | Risico |', '|---|---|---|---|', ''])).toEqual([]);
  });

  it('een rij die dezelfde woorden in een gewone zin gebruikt', () => {
    // ⚠️ "Context" en "afweging" komen in dit document tientallen keren voor. Zou
    //    de toets daarop aanslaan, dan meldt hij de halve lijst.
    const klachten = controleer([
      rij(
        'X',
        'De afweging staat in beslisdocument 002; de context is EPIC 7. **Wordt zwaarder als:** er een lid bij komt.',
        'Laag',
      ),
    ]);

    expect(klachten).toHaveLength(0);
  });

  it('een rij die zegt geen openstaand werk te zijn en dat ook in de kolom zet', () => {
    const klachten = controleer([
      rij('X', 'Blijft staan als context, niet als openstaand werk.', '~~Middel~~ context'),
    ]);

    expect(klachten).toHaveLength(0);
  });
});
