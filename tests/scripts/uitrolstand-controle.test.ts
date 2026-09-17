import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  beoordeel,
  dagenTussen,
  leeftijd,
  STANDBESTAND,
  versiesInMap,
} from '../../scripts/uitrolstand-controle.mjs';

/**
 * QS8-517 — de sleutelloze lezing van `supabase/uitgerold.json`.
 *
 * ⚠️ **Elke grendel apart geijkt, en niet één mutatie voor de hele controle.**
 *    CLAUDE.md is daar stellig over: een ijking die zijn geval door een pad
 *    voert dat een éérdere grendel al afvangt, bewaakt niets van wat hij
 *    belooft. Een stand met een kapotte `hoogste` valt al om op de veldtoets en
 *    bereikt de vergelijking met de map nooit — dus elk geval hieronder begint
 *    bij een stand die verder in orde is.
 *
 * ⚠️ **En de tweede helft telt even zwaar: de vormen die hij met rust moet
 *    laten.** Een controle die alles meldt, leer je te negeren. Het gat tussen
 *    map en productie is daarvan de belangrijkste — dat is tussen twee
 *    uitrollen de normale toestand.
 */

/** De map zoals hij er bij deze tests uitziet: drie letterversies inbegrepen. */
const MAP = ['0001', '0039a', '0040', '0041', '0042'];

/** Een stand die klopt met `MAP`: t/m `0041`, dus vier bestanden, één gat. */
const GOED = {
  project: 'wehgocadxehottiiyvsc',
  hoogste: '0041',
  registerrijen: 4,
  gemeten: '2026-09-16',
  bron: 'migratieregister() via npm run register:controle',
};

const VANDAAG = '2026-09-17';

/** @returns de stand met precies één veld anders — dat is de mutatie. */
function met(afwijking: Record<string, unknown>) {
  return { ...GOED, ...afwijking };
}

describe('de nulmeting', () => {
  it('meldt niets over een stand die klopt', () => {
    const uitslag = beoordeel(GOED, MAP, VANDAAG);
    expect(uitslag.fouten).toEqual([]);
  });

  it('telt de bestanden ónder de lijn, letterversies meegerekend', () => {
    // ⚠️ `0039a` hoort erbij. Zou de vergelijking op nummers gaan in plaats van
    //    op versies, dan telde die niet mee en zou de goede stand rood worden.
    expect(beoordeel(GOED, MAP, VANDAAG).onder).toBe(4);
  });
});

describe('het gat is nieuws en geen fout', () => {
  it('laat een map die vooruitloopt met rust', () => {
    const uitslag = beoordeel(GOED, MAP, VANDAAG);
    expect(uitslag.fouten).toEqual([]);
    expect(uitslag.gat).toEqual(['0042']);
  });

  it('meldt ook geen fout als er geen gat is', () => {
    const gelijk = met({ hoogste: '0042', registerrijen: 5 });
    const uitslag = beoordeel(gelijk, MAP, VANDAAG);
    expect(uitslag.fouten).toEqual([]);
    expect(uitslag.gat).toEqual([]);
  });

  it('meldt een gat van vijftig bestanden nog steeds niet als fout', () => {
    // ⚠️ De drift van QS8-505 wás 52 bestanden. Dat dit géén fout is, is het
    //    besluit van QS8-517 en geen omissie: tussen twee uitrollen is een gat
    //    de juiste toestand, en een controle die daar rood van wordt is een
    //    controle die je uitzet. Wat er wél gebeurt, staat in `leeftijd()`.
    const veel = Array.from({ length: 52 }, (_, i) => `01${String(i + 10).padStart(2, '0')}`);
    const uitslag = beoordeel(GOED, [...MAP, ...veel], VANDAAG);
    expect(uitslag.fouten).toEqual([]);
    expect(uitslag.gat).toHaveLength(53);
  });
});

describe('grendel 1 — de velden zelf', () => {
  it('wordt rood op een stand die geen object is', () => {
    expect(beoordeel(null, MAP, VANDAAG).fouten).toHaveLength(1);
  });

  it('wordt rood op een `hoogste` die geen versie is', () => {
    // ⚠️ Toetst de klacht over de **vorm** en niet de veldnaam. 📏 Bij het ijken
    //    bleef deze test groen met de veldtoets eruit: een tijdstempel staat ook
    //    niet in de map, dus grendel 2 vuurde — en die tekst noemt `hoogste`
    //    óók. Assertie op de naam alleen bewaakte hier niets.
    const fouten = beoordeel(met({ hoogste: '20260916120000' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('is geen versie van de vorm');
  });

  it('wordt rood op `registerrijen` als tekst', () => {
    // ⚠️ `'4'` en niet `4`: JSON uit een ander script kan het als tekst leveren,
    //    en `'4' !== 4` zou verderop een verschil melden dat er niet is.
    //
    // ⚠️ 📏 Zelfde vondst als hierboven: met de veldtoets eruit bleef deze test
    //    groen, want `'4' !== 4` liet grendel 4 vuren en díe tekst noemt
    //    `registerrijen` net zo goed. Vandaar de assertie op de vormklacht.
    const fouten = beoordeel(met({ registerrijen: '4' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('is geen positief geheel getal');
  });

  it('wordt rood op een `gemeten` zonder dagvorm', () => {
    const fouten = beoordeel(met({ gemeten: '16-09-2026' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('`gemeten`');
  });

  it('wordt rood op een meting zonder herkomst', () => {
    const fouten = beoordeel(met({ bron: '   ' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('`bron`');
  });

  it('komt niet tóch aan de mapvergelijking toe als een veld kapot is', () => {
    // ⚠️ Anders zou een kapotte `hoogste` een tweede, verwarrende klacht over de
    //    map opleveren — en dan wijst de uitslag naar de verkeerde reparatie.
    const uitslag = beoordeel(met({ hoogste: 'kapot' }), MAP, VANDAAG);
    expect(uitslag.fouten).toHaveLength(1);
    expect(uitslag.gat).toEqual([]);
  });
});

describe('grendel 2 — een `hoogste` zonder bestand in de map', () => {
  it('wordt rood, want dan is het schema elders niet op te bouwen', () => {
    const fouten = beoordeel(met({ hoogste: '0040a' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('geen bestand bij');
  });
});

describe('grendel 3 — `hoogste` boven de map', () => {
  it('wordt rood als productie verder is dan de map', () => {
    const fouten = beoordeel(met({ hoogste: '0099', registerrijen: 5 }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('boven het hoogste bestand in de map');
  });
});

describe('grendel 4 — het aantal registerrijen', () => {
  it('wordt rood bij te wéinig rijen — het gat ónder de lijn', () => {
    // ⚠️ **Dit is de vangst die dit script zijn bestaansrecht geeft.** De
    //    bovenkant klopt (`0041` bestaat, ligt in de map), en tóch draait er een
    //    ander schema: er ontbreekt er één onder de lijn.
    const fouten = beoordeel(met({ registerrijen: 3 }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('ónder de lijn');
  });

  it('wordt rood bij te véél rijen — een rij zonder bestand', () => {
    const fouten = beoordeel(met({ registerrijen: 5 }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('zonder bestand in de map');
  });

  it('noemt de twee richtingen verschillend, want de reparatie verschilt', () => {
    const weinig = beoordeel(met({ registerrijen: 3 }), MAP, VANDAAG).fouten.join('');
    const veel = beoordeel(met({ registerrijen: 5 }), MAP, VANDAAG).fouten.join('');
    expect(weinig).not.toEqual(veel);
  });
});

describe('grendel 5 — een meting uit de toekomst', () => {
  it('wordt rood', () => {
    const fouten = beoordeel(met({ gemeten: '2026-09-18' }), MAP, VANDAAG).fouten;
    expect(fouten.join('\n')).toContain('in de toekomst');
  });

  it('laat de dag zelf met rust', () => {
    expect(beoordeel(met({ gemeten: VANDAAG }), MAP, VANDAAG).fouten).toEqual([]);
  });
});

describe('de leeftijd van de meting — drie gevallen, drie teksten', () => {
  it('geeft drie verschillende tonen', () => {
    expect(leeftijd(0).toon).toBe('vers');
    expect(leeftijd(7).toon).toBe('vers');
    expect(leeftijd(8).toon).toBe('oud');
    expect(leeftijd(30).toon).toBe('oud');
    expect(leeftijd(31).toon).toBe('stoffig');
  });

  it('schrijft drie verschillende zinnen', () => {
    // ⚠️ De les van QS8-435: één vaste zin voor elke leeftijd deed niets, want
    //    hij stond er ook bij een beeld van tien seconden oud. Drie tonen met
    //    dezelfde tekst zou dezelfde fout zijn, alleen beter verstopt.
    const zinnen = new Set([leeftijd(0).zin, leeftijd(20).zin, leeftijd(60).zin]);
    expect(zinnen.size).toBe(3);
  });

  it('noemt het aantal dagen in de tekst en niet alleen in de toon', () => {
    expect(leeftijd(60).zin).toContain('60');
  });

  it('rekent in hele dagen over een maandgrens heen', () => {
    expect(dagenTussen('2026-08-31', '2026-09-01')).toBe(1);
    expect(dagenTussen('2026-09-17', '2026-09-17')).toBe(0);
    expect(dagenTussen('2026-09-18', '2026-09-17')).toBe(-1);
  });
});

describe('het bestand in deze repo', () => {
  it('klopt met de map zoals hij nu is', () => {
    // ⚠️ Dit is de enige test die de échte map leest. Hij dekt de naad tussen
    //    `versiesInMap()` en `beoordeel()`: de rest voert een handgemaakte lijst
    //    in en zou groen blijven als het uitlezen van de map zelf stukging.
    const stand = JSON.parse(readFileSync(STANDBESTAND, 'utf8'));
    const uitslag = beoordeel(stand, versiesInMap(process.cwd()), VANDAAG);
    expect(uitslag.fouten).toEqual([]);
  });
});
