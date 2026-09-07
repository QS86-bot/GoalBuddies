import { describe, expect, it } from 'vitest';

import { beoordeelWezen, wezentekst, type VerseGroep } from './rls/wezen';

/**
 * Het wezenoordeel van de RLS-harness, los gevoed — QS8-329.
 *
 * ⚠️ **Waarom dit bestand buiten `tests/rls/` staat.** Alles daaronder draait in
 *    de RLS-groep en slaat zichzelf over zonder database. Dit oordeel hóórt
 *    juist zonder database toetsbaar te zijn: dat is de hele reden dat het uit
 *    `harness.ts` is gehaald. Een bewaker die je alleen kunt ijken door een
 *    echte database in een toestand te brengen, ijk je in de praktijk niet.
 *
 * ⚠️ **Beide helften staan hieronder, en de tweede is even belangrijk als de
 *    eerste:** de vormen die hij moet melden én de vormen die hij met rust moet
 *    laten. Een bewaker die willekeurig rood wordt, leert je hem opnieuw te
 *    draaien — en dan is de eerstvolgende échte wees ook ruis.
 */

const ONS = 'onze-gebruiker';
const HUN = 'hun-gebruiker';

function groep(over: Partial<VerseGroep> = {}): VerseGroep {
  return {
    id: 'g1',
    naam: 'Een groep',
    status: 'active',
    createdBy: ONS,
    leden: 0,
    ...over,
  };
}

function beoordeel(
  verse: readonly VerseGroep[],
  over: {
    onzeGroepen?: string[];
    verseVreemdeProfielen?: number;
    andereRunGezien?: boolean;
  } = {},
): ReturnType<typeof beoordeelWezen> {
  return beoordeelWezen({
    verse,
    onzeGroepen: new Set(over.onzeGroepen ?? []),
    onzeGebruikers: new Set([ONS]),
    verseVreemdeProfielen: over.verseVreemdeProfielen ?? 0,
    andereRunGezien: over.andereRunGezien ?? false,
  });
}

describe('wat de bewaker moet melden', () => {
  it('een lege groep die deze run zelf heeft aangemeld', () => {
    const uit = beoordeel([groep({ createdBy: null })], { onzeGroepen: ['g1'] });

    expect(uit.soort).toBe('wezen');
    expect(uit.vanOns).toHaveLength(1);
  });

  it('een lege groep die door een gebruiker van ons is aangemaakt', () => {
    const uit = beoordeel([groep({ createdBy: ONS })]);

    expect(uit.soort).toBe('wezen');
    expect(uit.vanOns).toHaveLength(1);
  });

  it('een lege groep zonder aanmaker terwijl er niemand anders draait', () => {
    // ⚠️ **Dit is het lek van QS8-281 zelf**, en het moet blijven vallen:
    //    `verwijder_mijn_account()` zet `created_by` op NULL en het lidmaatschap
    //    cascadeert weg, waarna beide wegen naar die groep dicht zitten. Draait
    //    er niemand anders, dan kan die groep alleen van ons zijn.
    const uit = beoordeel([groep({ createdBy: null })]);

    expect(uit.soort).toBe('wezen');
    expect(uit.nietToeTeWijzen).toHaveLength(1);
    expect(wezentekst(uit)).toContain('zonder leden achter');
  });

  it('noemt in de tekst zowel de eigen als de niet toe te wijzen groepen', () => {
    const uit = beoordeel([
      groep({ id: 'eigen', createdBy: ONS }),
      groep({ id: 'zwevend', createdBy: null }),
    ]);

    const tekst = wezentekst(uit);
    expect(tekst).toContain('eigen');
    expect(tekst).toContain('zwevend');
    expect(tekst).toContain('2 groep(en)');
  });
});

describe('wat de bewaker met rust moet laten', () => {
  it('een groep waar nog iemand in zit', () => {
    expect(beoordeel([groep({ leden: 1 })]).soort).toBe('schoon');
  });

  it('een lege groep van een lévende gebruiker die niet van ons is', () => {
    // ⚠️ **Precies de valse rode van 07-09-2026.** `vertrek.test.ts` uit de
    //    andere run laat een groep even zonder leden achter; die groep wordt
    //    daar milliseconden later opgeruimd. Hij is niet van ons, dus hij is
    //    niet ons oordeel.
    const uit = beoordeel([groep({ createdBy: HUN })]);

    expect(uit.soort).toBe('schoon');
    expect(uit.vanEenAndereRun).toHaveLength(1);
    expect(wezentekst(uit)).toBe('');
  });

  it('een lege groep zonder aanmaker terwijl er aantoonbaar een tweede run draait', () => {
    // Niet groen maar ONGEMETEN: hij kán van hen zijn en hij kán van ons zijn.
    const uit = beoordeel([groep({ createdBy: null })], { verseVreemdeProfielen: 3 });

    expect(uit.soort).toBe('ongemeten');
    expect(wezentekst(uit)).toContain('ONGEMETEN');
    expect(wezentekst(uit)).toContain('niet gemeten');
  });

  it('helemaal niets', () => {
    const uit = beoordeel([]);

    expect(uit.soort).toBe('schoon');
    expect(wezentekst(uit)).toBe('');
  });
});

describe('de grens tussen ongemeten en rood', () => {
  it('een eigen wees blijft rood, óók als er een tweede run draait', () => {
    // ⚠️ De degradatie geldt alléén voor wat niet toe te wijzen is. Een groep
    //    die aantoonbaar van ons is, is van ons — hoeveel andere runs er ook
    //    draaien. Zonder deze test zou "er draait iemand anders" een
    //    ontsnappingsluik voor élke wees zijn.
    const uit = beoordeel([groep({ createdBy: ONS })], { verseVreemdeProfielen: 5 });

    expect(uit.soort).toBe('wezen');
  });

  it('onthoudt dat er eerder een andere run gezien is, ook als die nu niets toont', () => {
    // ⚠️ **De reparatie van een eerste versie die niet werkte.** Zonder geheugen
    //    keek de bewaker naar één moment, en de bevolking van de andere run
    //    knippert tussen twee testbestanden door naar nul. 📏 Gemeten: twee
    //    gelijktijdige runs gaven daardoor nog drie valse rode, telkens op een
    //    fixture die de ándere run met opzet leeg had achtergelaten.
    const uit = beoordeel([groep({ createdBy: null })], {
      verseVreemdeProfielen: 0,
      andereRunGezien: true,
    });

    expect(uit.soort).toBe('ongemeten');
  });

  it('een vreemde lege groep is zelf al bewijs dat er een tweede run draait', () => {
    // Zonder deze regel zou een tweede run die net géén verse profielen meer
    // maakt, alsnog een valse rode geven op de groep ernaast.
    const uit = beoordeel([
      groep({ id: 'hunne', createdBy: HUN }),
      groep({ id: 'zwevend', createdBy: null }),
    ]);

    expect(uit.andereRunActief).toBe(true);
    expect(uit.soort).toBe('ongemeten');
  });
});
