import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `klokgrens-controle.test.ts`.
import { beoordeel, ontleed, REGISTER } from '../../scripts/pinuitzonderingen-controle.mjs';

/**
 * De ijking van `npm run pin:controle`.
 *
 * ⚠️ Wat dit script bewaakt is geen kolom en geen policy maar een **uitzondering**:
 *    `guard_group_update()` stapt opzij voor elke rol die geen client is, en een
 *    `SECURITY DEFINER`-functie draait als zijn eigenaar. Vijf functies maken
 *    daar met opzet gebruik van. De zesde die er ooit bijkomt, erft dat recht
 *    zonder dat iemand het merkt — er gaat niets kapot, er wordt niets rood, en
 *    dat is precies de vorm die dit project telkens duur betaalt.
 */

const REGISTERTJE = new Map([['rotate_invite_code', 'vervangt de uitnodigingscode']]);

describe('lezen', () => {
  it('houdt één functienaam per regel over', () => {
    expect(ontleed('archiveer_groep\nrotate_invite_code\n')).toEqual([
      'archiveer_groep',
      'rotate_invite_code',
    ]);
  });

  it('laat lege regels vallen — `psql -At` sluit af met een lege regel', () => {
    expect(ontleed('\n  archiveer_groep  \n\n')).toEqual(['archiveer_groep']);
  });
});

describe('het register', () => {
  it('meldt een functie die er niet in staat', () => {
    // De zesde uitzondering, die niemand als uitzondering herkent.
    const uit = beoordeel(['rotate_invite_code', 'nieuwe_functie'], REGISTERTJE);

    expect(uit.onbekend).toEqual(['nieuwe_functie']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een reden voor een functie die weg is', () => {
    // ⚠️ De helft die je vergeet te bouwen. Zonder deze tak vult het register
    //    zich met redenen voor code die niet meer bestaat, en dan bewaakt het
    //    niets meer.
    const uit = beoordeel([], REGISTERTJE);

    expect(uit.verdwenen).toEqual(['rotate_invite_code']);
    expect(uit.onbekend).toEqual([]);
  });

  it('is stil als beide kanten kloppen', () => {
    const uit = beoordeel(['rotate_invite_code'], REGISTERTJE);

    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });
});

describe('het echte register', () => {
  it('geeft bij elke functie een reden en niet alleen een vinkje', () => {
    // Een register zonder redenen is een lijst uitzonderingen. De volgende lezer
    // moet kunnen zien waaróm deze functie langs de pin mag.
    for (const [functie, reden] of REGISTER as Map<string, string>) {
      expect(reden.length, `${functie} heeft geen reden`).toBeGreaterThan(40);
    }
  });
});
