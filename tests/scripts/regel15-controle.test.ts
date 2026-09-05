import { describe, expect, it } from 'vitest';

import { GRENS, LAGEN, PLAFOND, beoordeel, laagVan, tel } from '../../scripts/regel15-controle.mjs';

/**
 * De ratel op coderegel 15 — QS8-190.
 *
 * ⚠️ **Een controle die je niet kunt voeden, kun je niet ijken** (CLAUDE.md bij
 *    regel 18). Vandaar dat `tel()` en `beoordeel()` hun vondsten als parameter
 *    krijgen: elke vorm is hier los aan te bieden, zonder de codebase te
 *    verbouwen.
 *
 * ⚠️ **En de helft die met rust gelaten moet worden weegt even zwaar.** Een
 *    ratel die alles meldt — testbestanden, functies precies óp de grens, code
 *    buiten de gemeten lagen — leer je uitzetten.
 *
 * IJKING — met de hand gedraaid op 05-09-2026:
 *
 *   A  `PLAFOND['app/']` op 65 zetten            → rood, met de vijf langste erbij
 *   B  `PLAFOND['app/']` op 67 zetten            → rood ("zakte onder zijn plafond")
 *   C  de testbestand-uitzondering eruit         → rood, met `.test.tsx` erin
 *   D  `laagVan` de langste laag níét eerst
 *      laten proberen                            → `src/shared/ui/` telt bij `src/`
 */

describe('laagVan', () => {
  it('wijst een scherm aan de schermlaag toe', () => {
    expect(laagVan('app/groep/beheer/[id].tsx')).toBe('app/');
  });

  /**
   * ⚠️ **De langste laag eerst, en dat is geen smaak.** `src/shared/ui/` begint
   *    met `src/`; wie op de eerste treffer stopt zonder te sorteren, telt elke
   *    component bij de verkeerde laag — en dan schuift het plafond stil.
   */
  it('wijst een gedeelde component aan `src/shared/ui/` en niet aan een bredere laag', () => {
    expect(laagVan('src/shared/ui/Weekplanblok.tsx')).toBe('src/shared/ui/');
  });

  it('laat een testbestand buiten de telling', () => {
    // `describe(() => …)` telt in ESLint als functie. Een suite van tweehonderd
    // regels is één blok met gevallen erin, geen functie die iemand overziet.
    expect(laagVan('app/groep/beheer/[id].test.tsx')).toBeNull();
    expect(laagVan('src/shared/ui/Weekplanblok.test.tsx')).toBeNull();
  });

  it('laat code buiten de gemeten lagen met rust', () => {
    expect(laagVan('src/modules/auth/useAvatarKeuze.ts')).toBeNull();
    expect(laagVan('scripts/poort.mjs')).toBeNull();
  });

  it('leest ook een pad met backslashes, want Windows draait mee in CI', () => {
    expect(laagVan('src\\shared\\ui\\Ketting.tsx')).toBe('src/shared/ui/');
  });
});

describe('tel', () => {
  it('telt alleen wat bóven de grens zit', () => {
    const { perLaag } = tel([
      { pad: 'app/a.tsx', regels: GRENS + 1 },
      { pad: 'app/b.tsx', regels: GRENS },
      { pad: 'app/c.tsx', regels: GRENS - 1 },
    ]);

    // ⚠️ Precies óp de grens telt niet mee: regel 15 zegt "<50 regels", en een
    //    controle die de grens zelf al meldt, meldt een functie die voldoet.
    expect(perLaag['app/']).toBe(1);
  });

  it('houdt de lagen uit elkaar', () => {
    const { perLaag } = tel([
      { pad: 'app/a.tsx', regels: 90 },
      { pad: 'src/shared/ui/B.tsx', regels: 90 },
      { pad: 'src/shared/ui/C.tsx', regels: 90 },
    ]);

    expect(perLaag).toEqual({ 'app/': 1, 'src/shared/ui/': 2 });
  });

  it('meldt apart wat boven de grens zit maar buiten elke laag valt', () => {
    // Die horen bij de lintregel en niet bij deze ratel; ze stil laten vallen
    // zou betekenen dat een derde laag ongemerkt kan ontstaan.
    const { perLaag, buiten } = tel([{ pad: 'src/modules/x.ts', regels: 90 }]);

    expect(buiten).toEqual(['src/modules/x.ts']);
    expect(perLaag['app/']).toBe(0);
  });

  it('overleeft een lege lijst', () => {
    expect(tel([]).perLaag).toEqual({ 'app/': 0, 'src/shared/ui/': 0 });
    expect(tel(undefined).buiten).toEqual([]);
  });
});

describe('beoordeel — de ratel slaat twee kanten op', () => {
  const plafond = { 'app/': 2, 'src/shared/ui/': 1 };
  const nMaal = (pad: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ pad: `${pad}${i}.tsx`, regels: 90 }));

  it('is groen op precies het plafond', () => {
    const uit = beoordeel([...nMaal('app/a', 2), ...nMaal('src/shared/ui/B', 1)], plafond);
    expect(uit.ok).toBe(true);
    expect(uit.teveel).toEqual([]);
    expect(uit.teruim).toEqual([]);
  });

  it('is rood zodra een laag erboven komt, en noemt wélke', () => {
    const uit = beoordeel([...nMaal('app/a', 3), ...nMaal('src/shared/ui/B', 1)], plafond);
    expect(uit.teveel).toEqual(['app/']);
    expect(uit.ok).toBe(false);
  });

  /**
   * ⚠️ **Dit is de helft die een ratel een ratel maakt.** Zonder haar is het een
   *    plafond waar je onder kunt blijven zitten: de winst wordt niet vastgezet
   *    en de volgende lange functie glijdt in de vrijgekomen ruimte.
   */
  it('is óók rood als een laag eronder zakt zonder dat het plafond meezakt', () => {
    const uit = beoordeel([...nMaal('app/a', 1), ...nMaal('src/shared/ui/B', 1)], plafond);
    expect(uit.teruim).toEqual(['app/']);
    expect(uit.ok).toBe(false);
  });

  it('kan allebei tegelijk melden', () => {
    const uit = beoordeel([...nMaal('app/a', 5)], plafond);
    expect(uit.teveel).toEqual(['app/']);
    expect(uit.teruim).toEqual(['src/shared/ui/']);
  });
});

describe('het plafond zelf', () => {
  it('noemt elke laag die de ratel telt', () => {
    // Zonder deze regel kan er een laag bijkomen zonder plafond, en die telt dan
    // stil mee als nul — precies de vorm waar de ratel tegen bestaat.
    expect(Object.keys(PLAFOND).sort()).toEqual([...LAGEN].sort());
  });

  it('staat op de grens uit de grondwet', () => {
    expect(GRENS).toBe(50);
  });
});
