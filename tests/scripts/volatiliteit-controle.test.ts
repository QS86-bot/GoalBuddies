import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `rls-dekking.test.ts`.
import { beoordeel, MAG_IMMUTABLE_BLIJVEN, ontleed } from '../../scripts/volatiliteit-controle.mjs';

/**
 * IJking van `volatiliteit-controle` — QS8-433.
 *
 * ⚠️ **Wat deze controle bewaakt is geen stijlregel.** 📏 Gemeten tegen de lokale
 *    PostgREST op `berichten_plafond()`, een functie waar `anon` het uitvoerrecht
 *    níet heeft: acht keer 401, dan één aanroep als `service_role`, en daarna
 *    **200 op 25 van de 25** als `anon`. De catalogus zei de hele tijd `false`.
 *    Na migratie 0254 is het 401 op 25 van de 25.
 *
 * ⚠️ **De negatieve controle hoort erbij**, want zonder haar is "immutable is de
 *    oorzaak" een vermoeden: `realtime_bewaking()` is `stable` met nul argumenten
 *    en blijft ná dezelfde priming dicht. Het is de volatiliteit en niet het
 *    aantal argumenten.
 *
 * IJKING — met de hand gedraaid op 11-09-2026, mutatie per grendel:
 *
 *   A  `ontleed` de rollen laten vallen                → 2 rood
 *   B  `beoordeel` een lege `nieuw` laten teruggeven   → 1 rood
 *   C  `beoordeel` het register laten negeren          → 2 rood (must-allow)
 *   D  de verdwenen-tak eruit                          → 1 rood
 */

describe('ontleed', () => {
  it('leest naam en rollen uit de psql-uitvoer', () => {
    expect(ontleed('berichten_plafond|f|f\nintrekvenster_minuten|t|t\n')).toEqual([
      { naam: 'berichten_plafond', anon: false, auth: false },
      { naam: 'intrekvenster_minuten', anon: true, auth: true },
    ]);
  });

  /**
   * ⚠️ **Wie het recht heeft, is de helft van de melding.** Een functie die
   *    `anon` mag uitvoeren is een ander gesprek dan een die alleen
   *    `service_role` mag — en zonder dat onderscheid leest elke melding
   *    hetzelfde.
   */
  it('houdt de rollen uit elkaar', () => {
    const [f] = ontleed('ai_invoer_max|f|t');

    expect(f.anon).toBe(false);
    expect(f.auth).toBe(true);
  });

  it('valt niet om op een lege uitvoer', () => {
    expect(ontleed('')).toEqual([]);
    expect(ontleed('\n  \n')).toEqual([]);
  });
});

describe('beoordeel', () => {
  const f = (naam: string) => ({ naam, anon: false, auth: false });

  it('meldt een functie die niet in het register staat', () => {
    expect(beoordeel([f('nieuw_plafond')], {}).nieuw).toEqual([f('nieuw_plafond')]);
  });

  /**
   * ⚠️ **De must-allow, en die draagt het hele register.** Een controle die ook
   *    meldt wat er mét reden staat, leert je hem te negeren — en dan bewaakt
   *    hij niets meer.
   */
  it('laat een functie met een reden met rust', () => {
    const register = { vaste_volgorde: 'staat in een indexexpressie; Postgres eist immutable' };

    expect(beoordeel([f('vaste_volgorde')], register).nieuw).toEqual([]);
  });

  /**
   * ⚠️ De andere kant van de ratel: een reden voor iets dat er niet meer is,
   *    dekt ooit stilletjes een nieuwe functie met dezelfde naam.
   */
  it('meldt een registerrij die de klasse verlaten heeft', () => {
    const register = { weg_gerefactord: 'ooit een reden' };

    expect(beoordeel([f('iets_anders')], register).verdwenen).toEqual(['weg_gerefactord']);
  });

  it('zegt niets als beide kanten kloppen', () => {
    const register = { blijft: 'met reden' };
    const uit = beoordeel([f('blijft')], register);

    expect(uit.nieuw).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });
});

/**
 * ⚠️ **Het register hoort vandaag leeg te zijn**, en dat is geen toeval maar het
 *    besluit van 0254: `stable` is een zwakkere belofte dan `immutable`, dus waar
 *    `immutable` mocht mag `stable` ook. Komt hier ooit een rij bij, dan draagt
 *    die een méting — niet een redenering.
 */
describe('het register zelf', () => {
  it('is leeg, en elke rij die er ooit bij komt draagt een reden', () => {
    for (const [naam, reden] of Object.entries(MAG_IMMUTABLE_BLIJVEN)) {
      expect(typeof reden, `${naam} heeft geen reden`).toBe('string');
      expect((reden as string).length, `${naam} heeft een lege reden`).toBeGreaterThan(20);
    }
  });
});
