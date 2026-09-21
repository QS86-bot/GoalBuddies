import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings; TypeScript leest de JSDoc ernaast.
import { klachtenVan, loop } from '../../scripts/tabelcellen-controle.mjs';

/**
 * QS8-500 — elke markdown-tabelrij telt evenveel cellen als zijn kop.
 *
 * ⚠️⚠️ **Deze tests bestaan omdat de controle vandaag over een lege klasse
 *    draait.** 📏 Bij het bouwen: 587 tabellen, 3274 rijen, 210 bestanden, nul
 *    afwijkingen. Een controle die nog nooit rood is geweest, is een aanname —
 *    dus wordt hier élke vorm los aangeboden, de vormen die hij moet vínden én
 *    de vormen die hij met rust moet laten.
 *
 * ⚠️ **De tweede helft is even belangrijk als de eerste.** Een controle die
 *    alles meldt, leer je uitzetten. `docs/` staat vol met strepen in
 *    codeblokken en met ontsnapte strepen in celinhoud; geen daarvan is een
 *    fout.
 *
 * 📏 IJKING op het échte document, met de hand gedraaid op 16-09-2026, mutatie
 *    per grendel — niet één mutatie voor de hele controle:
 *
 *   A  rij 9 van `002-domeinregel7-oppervlakken.md` zijn zesde cel terug
 *      (de stand die daar van 10-09 t/m 16-09 in stond)
 *      → exitcode 1, één klacht: `:65  6 cellen in plaats van 5`
 *   B  de Stand-**cel** van rij 33 weggehaald
 *      → exitcode 1, één klacht: `:406  3 cellen in plaats van 4`
 *
 *   ⚠️ B was in de eerste poging fout opgezet: daar ging de *inhoud* van de cel
 *      weg en niet de cel zelf, dus de rij hield vier cellen met een lege
 *      laatste en de controle zweeg terecht. Dat is precies de vorm die
 *      CLAUDE.md afwijst — een ijking die zijn geval langs de grendel voert,
 *      bewijst niets. Vandaar dat B nu de scheidingsstreep meeneemt.
 */

const KOP = '| # | Naam | Stand |\n|---|---|---|\n';

describe('klachtenVan — wat hij moet vinden', () => {
  it('meldt een rij met een cel te veel, en noemt beide getallen', () => {
    const { klachten } = klachtenVan(`${KOP}| 1 | Iets | ✅ | erbij |\n`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ gevonden: 4, verwacht: 3, regel: 3 });
  });

  it('meldt een rij met een cel te weinig', () => {
    const { klachten } = klachtenVan(`${KOP}| 1 | Iets |\n`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ gevonden: 2, verwacht: 3 });
  });

  it('meldt een niet-ontsnapte streep in een codespan — dat is de klasse van QS8-415', () => {
    // ⚠️ Dit is het geval waar de hele controle voor bestaat. GFM knipt binnen
    //    backticks gewoon door; wie "maar het staat in code" denkt, denkt het
    //    verkeerde model.
    const { klachten } = klachtenVan(`${KOP}| 1 | \`a | b\` | ✅ |\n`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ gevonden: 4, verwacht: 3 });
  });

  it('telt per tabel opnieuw, zodat twee tabellen in één bestand niet vermengen', () => {
    const tekst = `${KOP}| 1 | Iets | ✅ |\n\n| A | B |\n|---|---|\n| x | y |\n`;
    const uitslag = klachtenVan(tekst);

    expect(uitslag.klachten).toEqual([]);
    expect(uitslag.tabellen).toBe(2);
    expect(uitslag.rijen).toBe(2);
  });
});

describe('klachtenVan — wat hij met rust moet laten', () => {
  it('laat een ontsnapte streep in celinhoud staan', () => {
    expect(klachtenVan(`${KOP}| 1 | \`a \\| b\` | ✅ |\n`).klachten).toEqual([]);
  });

  it('ziet een regel met strepen zonder scheidingsregel niet als tabel', () => {
    // Zo staan er tientallen in codeblokken en in geciteerde uitvoer.
    const uitslag = klachtenVan('Een zin.\n| geen kop | dus geen tabel |\nNog een zin.\n');

    expect(uitslag.klachten).toEqual([]);
    expect(uitslag.tabellen).toBe(0);
    expect(uitslag.rijen).toBe(0);
  });

  it('leest een ingesprongen tabel gewoon mee', () => {
    const uitslag = klachtenVan('  | # | Naam |\n  |---|---|\n  | 1 | Iets |\n');

    expect(uitslag.klachten).toEqual([]);
    expect(uitslag.tabellen).toBe(1);
  });

  it('zwijgt over een lege laatste cel, want dat is een andere belofte', () => {
    // 📏 Nul rijen in `docs/` hebben er vandaag een. Deze controle gaat over de
    //    céltelling; een lege stand is een leesbaarheidsvraag en geen
    //    rendervraag, en die hier meenemen zou de scope stil verbreden.
    expect(klachtenVan(`${KOP}| 1 | Iets |  |\n`).klachten).toEqual([]);
  });

  it('stopt de tabel bij de eerste regel die er geen is', () => {
    const uitslag = klachtenVan(`${KOP}| 1 | Iets | ✅ |\n\n| los | en zonder kop |\n`);

    expect(uitslag.klachten).toEqual([]);
    expect(uitslag.rijen).toBe(1);
  });
});

describe('loop — de zeef ziet wat hij beweert te zien', () => {
  it('leest de documenten en vindt daar vandaag niets', () => {
    const { klachten } = loop();

    expect(klachten).toEqual([]);
  });

  it('telt genoeg tabellen dat nul klachten iets betekent', () => {
    // ⚠️ Zonder deze toets is groen niet van een kapotte zeef te onderscheiden.
    //    Het getal staat laag: het bewaakt dat er gelézen wordt, niet hoeveel.
    const { tabellen, rijen, bestanden } = loop();

    expect(tabellen).toBeGreaterThan(200);
    expect(rijen).toBeGreaterThan(1000);
    expect(bestanden).toBeGreaterThan(100);
  });

  it('vindt nul tabellen bij een lege bronlijst — daar gaat het script rood op', () => {
    expect(loop([]).tabellen).toBe(0);
  });
});
