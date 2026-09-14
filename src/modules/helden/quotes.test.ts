import { describe, expect, it } from 'vitest';

import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

import { HELDEN } from './helden';
import { AFGEKEURDE_QUOTES, alleQuoteSleutels, quoteSleutels } from './quotes';

/**
 * QS8-469.
 *
 * ⚠️ **De belofte is "geen quote zonder bron" en "geen quote die niemand
 *    goedkeurde", en allebei breken ze stil.** Een quote zonder bron ziet er op
 *    het scherm uit als app-copy; een afgekeurde quote ziet er uit als een
 *    mooie vondst. Geen van beide maakt iets rood zonder deze toetsen.
 */

const CATALOGI = [
  ['nl', nl],
  ['en', en],
] as const;

/** Elke catalogussleutel die over een quote gaat, ongeacht wie hem toevoegde. */
function quoteSleutelsInCatalogus(catalogus: Readonly<Record<string, string>>): string[] {
  return Object.keys(catalogus).filter((s) => /^held\.[a-z]+\.quote\d+$/.test(s));
}

describe('het register en de catalogus dekken elkaar', () => {
  it('heeft voor elke geregistreerde quote een tekst en een bron', () => {
    for (const [taal, catalogus] of CATALOGI) {
      for (const { tekst, bron } of alleQuoteSleutels()) {
        expect(catalogus[tekst], `${taal}:${tekst}`).toBeTruthy();
        expect(catalogus[bron], `${taal}:${bron}`).toBeTruthy();
      }
    }
  });

  /**
   * ⚠️ **De andere richting, en dat is de stillere van de twee.** Een sleutel in
   *    het register zonder tekst geeft een lege quote — dat ziet iemand. Een
   *    tekst in de catalogus zonder sleutel in het register is een quote die
   *    niemand ooit te zien krijgt, en die valt nooit op. Hij is bovendien langs
   *    `AFGEKEURDE_QUOTES` geglipt, want die lijst wordt gelezen wanneer je het
   *    register aanpast.
   */
  it('kent geen quote in de catalogus die niet in het register staat', () => {
    const geregistreerd = new Set(alleQuoteSleutels().map((q) => q.tekst as string));

    for (const [taal, catalogus] of CATALOGI) {
      for (const sleutel of quoteSleutelsInCatalogus(catalogus)) {
        expect(geregistreerd.has(sleutel), `${taal}:${sleutel} staat niet in HELDEN`).toBe(true);
      }
    }
  });

  it('telt per held precies zoveel quotes als het rooster zegt', () => {
    for (const [taal, catalogus] of CATALOGI) {
      for (const h of HELDEN) {
        const gevonden = quoteSleutelsInCatalogus(catalogus).filter((s) =>
          s.startsWith(`held.${h.sleutel}.`),
        );
        expect(gevonden, `${taal}:${h.sleutel}`).toHaveLength(h.aantalQuotes);
      }
    }
  });

  it('nummert de quotes aaneengesloten vanaf 1', () => {
    // ⚠️ Een gat in de nummering laat `alleQuoteSleutels()` een sleutel afleiden
    //    die niet bestaat, en dan is de eerste toets hierboven rood zonder te
    //    zeggen waaróm. Zelfde gedachte als het gat in de migratienummering.
    for (const h of HELDEN) {
      for (let n = 1; n <= h.aantalQuotes; n += 1) {
        expect(Object.keys(nl)).toContain(quoteSleutels(h.sleutel, n).tekst as string);
      }
    }
  });
});

describe('afgekeurde quotes komen er niet in', () => {
  it('noemt per afgekeurde quote een reden', () => {
    expect(AFGEKEURDE_QUOTES.length).toBeGreaterThan(0);
    for (const { fragment, reden } of AFGEKEURDE_QUOTES) {
      expect(fragment.trim()).not.toBe('');
      expect(reden.trim(), fragment).not.toBe('');
    }
  });

  it('vindt geen enkel afgekeurd fragment in een catalogus', () => {
    for (const [taal, catalogus] of CATALOGI) {
      const alleTekst = Object.values(catalogus).join(' \n ').toLowerCase();
      for (const { fragment } of AFGEKEURDE_QUOTES) {
        expect(alleTekst.includes(fragment.toLowerCase()), `${taal}: ${fragment}`).toBe(false);
      }
    }
  });

  /**
   * ⚠️ **Vraag 3 van regel 18: breek de belofte met de hand en kijk of hij rood
   *    wordt.** Dit voedt de controle een catalogus mét een afgekeurde quote
   *    erin. Zonder deze toets is "de scan werkt" een aanname met een groen
   *    vinkje — en dit project heeft al een keer een grendel geijkt via een pad
   *    dat een éérdere grendel al afving.
   */
  it('wordt wél rood op een catalogus die er een bevat', () => {
    const besmet = {
      'held.meridian.quote9':
        'The most difficult thing is the decision to act, the rest is merely tenacity.',
    };
    const alleTekst = Object.values(besmet).join(' \n ').toLowerCase();

    const geraakt = AFGEKEURDE_QUOTES.filter(({ fragment }) =>
      alleTekst.includes(fragment.toLowerCase()),
    );

    expect(geraakt).toHaveLength(1);
    expect(geraakt[0]?.fragment).toBe('the most difficult thing is the decision to act');
  });
});
