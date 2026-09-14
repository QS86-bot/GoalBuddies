import { describe, expect, it } from 'vitest';

import { contrastRatio, WCAG } from './contrast';
import { kleinsteAfstand, MIN_AFSTAND } from './kleurafstand';
import {
  heldkleurenNavy,
  heldkleurenNavyLight,
  HELDPALETSLEUTELS,
  navy,
  navyLight,
  type Heldpalet,
  type Palette,
} from './tokens';

/**
 * QS8-470, epic QS8-468.
 *
 * ⚠️ **De twee kleuren van een held worden verschillend getoetst, en dat is de
 *    hele opzet van dit bestand.** `accent` is een voorgrond en moet leesbaar
 *    zijn op de ondergrond waar hij op staat. `primair` is een vulling: hij
 *    tint de badge en de rand, hij ís geen tekst of lijn. Een contrasteis op
 *    `primair` tegen de schermgrond toetst iets wat nooit beloofd is — en zou
 *    alle zes de helden rood maken op navy, terwijl er niets mis is.
 */

const THEMAS: readonly (readonly [string, Heldpalet, Palette])[] = [
  ['navy', heldkleurenNavy, navy],
  ['navy-licht', heldkleurenNavyLight, navyLight],
];

describe('elk accent is leesbaar op zijn eigen thema', () => {
  it('haalt de drempel voor UI-componenten op bg én panel', () => {
    for (const [naam, palet, kleuren] of THEMAS) {
      for (const sleutel of HELDPALETSLEUTELS) {
        const accent = palet[sleutel].accent;
        for (const [waar, grond] of [
          ['bg', kleuren.bg],
          ['panel', kleuren.panel],
        ] as const) {
          expect(
            contrastRatio(accent, grond),
            `${naam}:${sleutel}:${waar} (${accent} op ${grond})`,
          ).toBeGreaterThanOrEqual(WCAG.AA_LARGE);
        }
      }
    }
  });

  /**
   * ⚠️ **Het lichte thema bestaat omdat de codexwaarden op wit onleesbaar zijn.**
   *    📏 Gemeten 14-09-2026: Ignis `#F2B705` haalt 1.67 op `navyLight.bg`,
   *    Quip 2.04, Lucerna 1.98, Strix 2.20, Meridian 3.00 — vijf van de zes
   *    onder de drempel. Alleen Forge haalde het al en staat daarom in beide
   *    thema's op dezelfde waarde.
   */
  it('maakt het accent donkerder in het lichte thema, behalve waar dat niet hoefde', () => {
    const gelijk = HELDPALETSLEUTELS.filter(
      (s) => heldkleurenNavy[s].accent === heldkleurenNavyLight[s].accent,
    );

    expect(gelijk).toEqual(['forge']);
  });

  it('laat de primair ongemoeid tussen de thema’s', () => {
    // ⚠️ Besluit van 14-09-2026: de helden houden de kleuren die ze gekregen
    //    hebben. Het lichte thema past alleen de helderheid van de voorgrond
    //    aan; de vulling is in beide thema's dezelfde codexwaarde.
    for (const sleutel of HELDPALETSLEUTELS) {
      expect(heldkleurenNavyLight[sleutel].primair, sleutel).toBe(
        heldkleurenNavy[sleutel].primair,
      );
    }
  });
});

/**
 * ⚠️⚠️ **Deze suite eist géén `MIN_AFSTAND`, en dat is een besluit en geen
 *    omissie.** De zes helden zijn één kleurfamilie: codexprincipe 01 zegt "één
 *    systeem, zes gezichten — alleen het kleurenpaar en symbool verschillen".
 *    Het symbool draagt de identiteit, de kleur de stemming.
 *
 *    📏 Voorgelegd op 14-09-2026 mét de meting: zes onderscheidbare kleuren zijn
 *    haalbaar (maximaal 16.07 op navy, 19.35 op licht), maar alleen door twee
 *    helden naar bijna-wit en grijs te duwen, of door de tinten los te laten
 *    waar de namen en symbolen op gebouwd zijn. Quinten heeft de oorspronkelijke
 *    kleuren behouden.
 *
 *    Wat hier wél staat is een **bodem**: de gemeten afstand van vandaag. Ze
 *    mogen niet verder naar elkaar toe kruipen. Zo is "één familie" een keuze
 *    die vastligt in plaats van een grens die stil verschuift — zelfde gedachte
 *    als de ratel van `regel15:controle`.
 */
describe('de zes blijven één familie, en kruipen niet dichter naar elkaar', () => {
  /**
   * 📏 Gemeten op 14-09-2026 met `kleinsteAfstand`, inclusief kleurenblindheid:
   *    navy 1.0828, navy-licht 0.3875. Hieronder staan ze naar beneden afgerond
   *    op twee decimalen — een bodem die gelijk is aan de meting zelf wordt rood
   *    op het laatste bit, en dat meldt afronding in plaats van drift.
   */
  const BODEM = { navy: 1.08, 'navy-licht': 0.38 } as const;

  it('houdt de gemeten onderlinge afstand van de accenten vast', () => {
    for (const [naam, palet] of THEMAS) {
      const accenten = HELDPALETSLEUTELS.map((s) => palet[s].accent);
      const gemeten = kleinsteAfstand(accenten);
      const bodem = BODEM[naam as keyof typeof BODEM];

      expect(gemeten, `${naam}: ${gemeten.toFixed(2)} zakte onder de bodem`).toBeGreaterThanOrEqual(
        bodem,
      );
    }
  });

  it('legt vast dat dit ver onder MIN_AFSTAND ligt, want dat is het punt', () => {
    // ⚠️ Deze assertie staat er omgekeerd met opzet. Wordt hij ooit rood, dan is
    //    iemand de zes gaan spreiden — en dan is dat een besluit dat langs
    //    codexprincipe 01 moet, niet een test die je bijstelt.
    const accenten = HELDPALETSLEUTELS.map((s) => heldkleurenNavy[s].accent);
    expect(kleinsteAfstand(accenten)).toBeLessThan(MIN_AFSTAND);
  });
});
