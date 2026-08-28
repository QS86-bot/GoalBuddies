import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `levend-controle.test.ts`.
import {
  beoordeel,
  ontleed,
  metEchteGrens,
  REGISTER,
  zonderCommentaar,
} from '../../scripts/klokgrens-controle.mjs';

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

/**
 * `zonderCommentaar` — de controle melde op 28-08 zijn eigen uitleg.
 *
 * ⚠️ **Hoe dat kon.** De SQL-kant zoekt regel voor regel naar `current_date` en
 *    weet niets van commentaar. Migratie 0107 haalde de péiling uit
 *    `ketting_stand()` en zette er een regel commentaar neer die vertelt dat hij
 *    daar wég is — met het woord erin. De controle las dat als een twaalfde
 *    voorkomen zonder reden.
 *
 * ⚠️ **Dezelfde vorm die `pin:controle` op 27-08 had**, en dezelfde oplossing:
 *    de beslissing uit de SQL halen en hier onder test zetten. Een controle die
 *    je niet kunt voeden, kun je niet ijken.
 *
 * ⚠️ **De tweede helft is de belangrijkste.** Een strippert die te gretig knipt,
 *    maakt een échte grens onzichtbaar — en dan bewaakt het register niets meer
 *    terwijl het groen meldt. Dat is een stillere fout dan de fout die hij
 *    repareert.
 */
describe('zonderCommentaar', () => {
  it('knipt een regel af bij zijn commentaar', () => {
    expect(zonderCommentaar('and x = 1 -- current_date stond hier')).toBe('and x = 1 ');
  });

  it('laat een regel zonder commentaar heel', () => {
    expect(zonderCommentaar('and p > current_date + 1')).toBe('and p > current_date + 1');
  });

  it('knipt een regel die alleen maar commentaar is helemaal weg', () => {
    expect(zonderCommentaar('-- current_date is hier weggehaald').trim()).toBe('');
  });

  it('ziet een streepje binnen een tekenreeks niet aan voor commentaar', () => {
    // ⚠️ Niet theoretisch: een foutmelding of systeembericht mag een streepje
    //    bevatten, en dan zou de hele grens erachter verdwijnen.
    const regel = "raise exception 'niet-vandaag' when p > current_date;";
    expect(zonderCommentaar(regel)).toBe(regel);
  });

  it('telt een ontsnapt aanhalingsteken niet als einde van de tekenreeks', () => {
    const regel = "raise exception 'het''s -- niet' when p > current_date;";
    expect(zonderCommentaar(regel)).toBe(regel);
  });

  it('knipt wél als het commentaar ná een tekenreeks komt', () => {
    expect(zonderCommentaar("x = 'a' -- current_date")).toBe("x = 'a' ");
  });
});

describe('metEchteGrens', () => {
  it('houdt een regel waar de grens écht staat', () => {
    expect(metEchteGrens(['f :: and p > current_date + 1'])).toEqual([
      'f :: and p > current_date + 1',
    ]);
  });

  it('laat een regel vallen die het woord alleen in commentaar noemt', () => {
    // Precies het geval uit migratie 0107.
    expect(metEchteGrens(['ketting_stand :: -- `current_date` stond hier en is weg'])).toEqual([]);
  });

  it('houdt een regel met een grens én commentaar erachter', () => {
    const regel = 'f :: and p > current_date + 1 -- zie 0037';
    expect(metEchteGrens([regel])).toEqual([regel]);
  });

  it('laat `ontleed` met rust — die is een ontleder en geen filter', () => {
    // ⚠️ De reden dat dit twee functies zijn. Verhuist het filter ooit terug in
    //    `ontleed()`, dan kantelt deze en de bestaande ontleedtests eronder.
    expect(ontleed('a :: regel zonder het woord')).toEqual(['a :: regel zonder het woord']);
  });
});
