import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `edge-tijd.test.ts`.
import { beoordeel, tel, UITGEZONDERD } from '../../scripts/levend-controle.mjs';

/**
 * De ijking van `npm run levend:controle`.
 *
 * ⚠️ **Een ratel kan twee kanten op falen, en de tweede is de interessante.** Te
 *    véél vlaggen is de voor de hand liggende: er is een kopie bijgekomen. Te
 *    wéinig moet óók rood zijn — anders zakt het plafond nooit mee, en houdt het
 *    ruimte open voor een kopie die niemand ziet terugkomen. Precies dat maakt
 *    het verschil tussen een ratel en een bovengrens.
 */

const bron = (pad: string, inhoud: string) => ({ pad, inhoud });
const VLAG = 'let levend = true;';

describe('tellen', () => {
  it('telt per bestand en in totaal', () => {
    const { totaal, perBestand } = tel([
      bron('app/a.tsx', `${VLAG}\n${VLAG}`),
      bron('app/b.tsx', VLAG),
      bron('app/c.tsx', 'niets bijzonders'),
    ]);

    expect(totaal).toBe(3);
    expect(perBestand).toEqual([
      { pad: 'app/a.tsx', aantal: 2 },
      { pad: 'app/b.tsx', aantal: 1 },
    ]);
  });

  it('telt `useAsync` zelf niet mee', () => {
    // ⚠️ Anders telt de ene plek waar de vlag hóórt te staan mee als schuld, en
    //    dan kan het plafond nooit op nul komen.
    const { totaal } = tel(UITGEZONDERD.map((pad: string) => bron(pad, `${VLAG}\n${VLAG}`)));

    expect(totaal).toBe(0);
  });

  it('herkent de vlag ook met afwijkende witruimte', () => {
    const { totaal } = tel([bron('app/a.tsx', 'let  levend   =  true')]);

    expect(totaal).toBe(1);
  });
});

describe('de ratel', () => {
  it('is rood als er een kopie bij komt', () => {
    const uitkomst = beoordeel([bron('app/a.tsx', `${VLAG}\n${VLAG}`)], 1);

    expect(uitkomst.teveel).toBe(true);
    expect(uitkomst.teruim).toBe(false);
  });

  it('is rood als er een af gaat en het plafond blijft staan', () => {
    // ⚠️ De helft die je vergeet te bouwen. Zonder deze tak zakt het plafond
    //    nooit mee en is de ratel na de eerste migratie weer een gewone grens.
    const uitkomst = beoordeel([bron('app/a.tsx', VLAG)], 5);

    expect(uitkomst.teruim).toBe(true);
    expect(uitkomst.teveel).toBe(false);
  });

  it('is groen als het precies klopt', () => {
    const uitkomst = beoordeel([bron('app/a.tsx', `${VLAG}\n${VLAG}`)], 2);

    expect(uitkomst.teveel).toBe(false);
    expect(uitkomst.teruim).toBe(false);
  });

  it('is groen bij nul en een plafond van nul', () => {
    // De stand waar dit naartoe hoort te bewegen.
    const uitkomst = beoordeel([bron('app/a.tsx', 'geen vlag hier')], 0);

    expect(uitkomst.totaal).toBe(0);
    expect(uitkomst.teveel).toBe(false);
    expect(uitkomst.teruim).toBe(false);
  });
});
