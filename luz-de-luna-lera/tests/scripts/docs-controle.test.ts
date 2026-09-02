import { describe, expect, it } from 'vitest';

import { DOCUMENTEN, FEITEN, klachtenEigenaarschap, klachtenMigratiebereik } from '../../scripts/docs-controle.mjs';

/**
 * De ijking van `npm run docs:controle`.
 *
 * ⚠️ In GoalBuddies stond deze controle nooit onder test; hij is daar geijkt
 *    door de documenten zelf. Hier vanaf de eerste dag gevoed met beide kanten:
 *    de vormen die hij moet vinden en de vormen die hij met rust moet laten.
 */
describe('eigenaarschap', () => {
  it('zwijgt als elk feit bij zijn eigenaar staat', () => {
    expect(
      klachtenEigenaarschap({
        WERKVOORRAAD: '247 geslaagd, migraties 0001 t/m 0003 staan in de map.',
        PRD: 'Het Roots-traject kost € 900. Doel: 80 betaalde sessies en 5.000 volgers.',
        'CLAUDE.md': 'De prijs staat in het PRD.',
        'VOLGENDE-SESSIE': 'Lees WERKVOORRAAD voor de testteller.',
      }),
    ).toEqual([]);
  });

  it('meldt de prijs zodra die buiten het PRD staat', () => {
    const uit = klachtenEigenaarschap({ PRD: 'kost €900', 'CLAUDE.md': 'het traject van €900' });
    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('prijs');
    expect(uit[0]).toContain('CLAUDE.md');
  });

  it('meldt de testteller zodra die in de startprompt staat', () => {
    const uit = klachtenEigenaarschap({ WERKVOORRAAD: '12 geslaagd', 'VOLGENDE-SESSIE': 'er zijn 12 geslaagd' });
    expect(uit.map((k: string) => k.split(' ')[0])).toEqual(['de']);
    expect(uit[0]).toContain('testteller');
  });

  it('meldt het sessie- en volgersdoel buiten het PRD', () => {
    const uit = klachtenEigenaarschap({
      PRD: '80 betaalde sessies, 5.000 volgers',
      WERKVOORRAAD: 'we mikken op 80 sessies en 5000 Instagram-volgers',
    });
    expect(uit).toHaveLength(2);
  });

  it('laat een getal met rust dat geen feit is', () => {
    expect(klachtenEigenaarschap({ 'CLAUDE.md': '800 sessies zijn geen doel; €9.000 evenmin.' })).toEqual([]);
  });

  it('kent voor elk feit een bestaand eigenaarsdocument', () => {
    for (const feit of FEITEN) expect(Object.keys(DOCUMENTEN)).toContain(feit.eigenaar);
  });
});

describe('migratiebereik', () => {
  it('zwijgt als het genoemde bereik klopt', () => {
    expect(klachtenMigratiebereik({ hoogste: '0003', teksten: { W: 'Migraties `0001` t/m `0003` staan er.' } })).toEqual([]);
  });

  it('meldt een document dat achterloopt', () => {
    const uit = klachtenMigratiebereik({ hoogste: '0004', teksten: { W: 'migraties 0001 t/m 0003' } });
    expect(uit).toHaveLength(1);
    expect(uit[0]).toContain('0004');
  });

  it('meldt een bereik terwijl de map leeg is', () => {
    expect(klachtenMigratiebereik({ hoogste: null, teksten: { W: 'migraties 0001 t/m 0002' } })).toHaveLength(1);
  });

  it('laat een document zonder bereik met rust, ook bij een lege map', () => {
    expect(klachtenMigratiebereik({ hoogste: null, teksten: { W: 'Er staan nog geen migraties.' } })).toEqual([]);
  });
});
