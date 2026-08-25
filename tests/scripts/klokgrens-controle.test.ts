import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `levend-controle.test.ts`.
import { beoordeel, ontleed, REGISTER } from '../../scripts/klokgrens-controle.mjs';

/**
 * De ijking van `npm run klokgrens:controle`.
 *
 * ⚠️ **Een register kan twee kanten op falen, en de tweede is de interessante.**
 *    Een `current_date` erbij is de voor de hand liggende: er staat een aanname
 *    in een grens die niemand beoordeeld heeft. Een regel die uit het schema
 *    verdwijnt terwijl hij hier blijft staan, moet óók rood zijn — anders vult
 *    het register zich met redenen voor code die weg is, en dan is het een
 *    document en geen controle.
 *
 * ⚠️ De inhoud van `REGISTER` staat hier bewust niet onder test. Dat zou de
 *    lijst met zichzelf vergelijken, en precies dát was de fout van 0032/0034:
 *    de test legde de app-lijst naast de app-lijst en werd nooit rood. De
 *    inhoud wordt geijkt tegen `pg_get_functiondef()`, in het script zelf.
 */

describe('ontleden', () => {
  it('houdt één sleutel per regel over', () => {
    const uit = ontleed('a :: regel een\nb :: regel twee\n');

    expect(uit).toEqual(['a :: regel een', 'b :: regel twee']);
  });

  it('laat lege regels en randwitruimte vallen', () => {
    // `psql -At` sluit af met een lege regel, en dat is geen voorkomen.
    const uit = ontleed('\n  a :: regel een  \n\n');

    expect(uit).toEqual(['a :: regel een']);
  });
});

describe('het register', () => {
  const register = new Map([['f :: p > current_date + 1', 'de bovengrens']]);

  it('meldt een voorkomen dat er niet in staat', () => {
    const uit = beoordeel(['f :: p > current_date + 1', 'g :: p <= current_date'], register);

    expect(uit.onbekend).toEqual(['g :: p <= current_date']);
    expect(uit.verdwenen).toEqual([]);
  });

  it('meldt een regel die het schema niet meer heeft', () => {
    // ⚠️ De helft die je vergeet te bouwen.
    const uit = beoordeel([], register);

    expect(uit.verdwenen).toEqual(['f :: p > current_date + 1']);
    expect(uit.onbekend).toEqual([]);
  });

  it('is stil als beide kanten kloppen', () => {
    const uit = beoordeel(['f :: p > current_date + 1'], register);

    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });

  it('ziet een verplaatste `current_date` als iets nieuws', () => {
    // ⚠️ Dezelfde functie, dezelfde grens, één teken anders: de `+ 1` weg. Dat
    //    ís de bevinding van 19-08, en hij moet hier rood worden en niet
    //    wegvallen tegen de regel die er wél in staat.
    const uit = beoordeel(['f :: p > current_date'], register);

    expect(uit.onbekend).toEqual(['f :: p > current_date']);
    expect(uit.verdwenen).toEqual(['f :: p > current_date + 1']);
  });
});

describe('het echte register', () => {
  it('geeft bij elke regel een reden en niet alleen een vinkje', () => {
    // Een register zonder redenen is een lijst uitzonderingen. De volgende
    // lezer moet kunnen zien waaróm een grens mag staan zoals hij staat.
    for (const [sleutel, reden] of REGISTER as Map<string, string>) {
      expect(sleutel, `${sleutel} heeft geen functienaam`).toContain(' :: ');
      expect(reden.length, `${sleutel} heeft geen reden`).toBeGreaterThan(30);
    }
  });
});
