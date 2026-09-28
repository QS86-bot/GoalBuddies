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

  // ⚠️⚠️ **Deze toets legde tot 22-09-2026 vast dat de controle hier zwéég, en
  //    dat was precies het gat van QS8-595.** De belofte in zijn naam klopt nog
  //    — de tabel stópt, en de losse rij telt niet als gelezen rij — maar de
  //    stilte eromheen was geen belofte maar een aanname: 📏 daardoor bleven
  //    320 rijen van `ENGINEER-REVIEW.md` ongelezen én ongemeld. De rij wordt nu
  //    als **weesrij** gemeld; de toetsen daarvoor staan onderaan dit bestand.
  //
  //    Dat is de les van regel 18 vraag 3 in zijn vervelendste vorm: een toets
  //    kan groen blijven terwijl de belofte breekt, óók als hij zélf het gedrag
  //    vastlegt dat de belofte breekt.
  it('stopt de tabel bij de eerste regel die er geen is, en meldt de rest als wees', () => {
    const uitslag = klachtenVan(`${KOP}| 1 | Iets | ✅ |\n\n| los | en zonder kop |\n`);

    expect(uitslag.rijen).toBe(1);
    expect(uitslag.klachten).toHaveLength(1);
    expect(uitslag.klachten[0]).toMatchObject({ regel: 5, aantal: 1 });
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

/**
 * QS8-595 — een rij die zijn kop kwijt is, rendert helemaal niet als tabel.
 *
 * ⚠️⚠️ **De controle van QS8-500 hierboven was groen omdat hij niet keek.**
 *    📏 Gemeten op 22-09-2026 op `docs/ENGINEER-REVIEW.md`: twee lege regels
 *    midden in de hoofdtabel, en daardoor las `klachtenVan()` **428** van de
 *    748 datarijen. Met de hand rood gemaakt: een rij met drie cellen onder een
 *    kop van vier, toegevoegd aan het **einde** van het bestand, gaf exitcode
 *    **0** — de zeef zag hem niet.
 *
 * 📏 **En het is geen telfout maar een renderfout**, gemeten met `cmark-gfm`,
 *    de renderer van GitHub zelf: die 320 rijen kwamen eruit als **twee
 *    alinea's** van 552.087 en 80.135 tekens — muren tekst met strepen erin,
 *    geen kolommen. Na de reparatie: 750 `<tr>` en nul pijp-alinea's.
 *
 * ⚠️ De vier bestanden die dit opleverde staan in het beslisdocument. Het
 *    scherpste is `002-domeinregel7-oppervlakken.md`: dáár stonden rij 19 t/m
 *    41 in de alinea, inclusief twee rijen met een verkeerd celaantal die
 *    niemand kon zien omdat ze niet gelezen werden.
 */
describe('klachtenVan — de weesrij', () => {
  const KOP4 = '| # | Naam | Wat | Stand |\n|---|---|---|---|\n';

  // ⚠️ Must-finds.
  it('meldt een rij die door een lege regel van zijn kop gescheiden is', () => {
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n| 2 | c | d | ✅ |\n`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ regel: 5, aantal: 1, verwacht: 4 });
  });

  it('meldt een reeks als één bevinding, met zijn lengte erin', () => {
    // ⚠️ 320 losse regels zijn geen bevinding maar een muur, en een muur leer je
    //    overslaan. De reeks heeft één oorzaak, dus één melding.
    const rijen = '| x | y | z | ✅ |\n'.repeat(5);
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n${rijen}`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ aantal: 5 });
  });

  it('meldt hem ook als hij de laatste regel van het bestand is', () => {
    // 📏 Precies de vorm waarmee de oude controle met de hand rood is gemaakt en
    //    groen bleef: een kapotte rij aan het einde van `ENGINEER-REVIEW.md`.
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n| 2 | c | ✅ |`);

    expect(klachten).toHaveLength(1);
    expect(klachten[0]).toMatchObject({ aantal: 1 });
  });

  it('telt een weesrij niet mee als gelezen rij — anders verbergt hij zichzelf', () => {
    const uitslag = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n| 2 | c | d | ✅ |\n`);

    expect(uitslag.rijen).toBe(1);
  });

  // ⚠️ Must-allows. Zonder deze helft is "alles is een treffer" ook groen.
  it('laat een tweede tabel met een eigen kop met rust — dat is de gewone vorm', () => {
    // 📏 Twee van de zes eerste treffers waren dit, en allebei terecht.
    const tweede = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n${tweede}`);

    expect(klachten).toEqual([]);
  });

  it('laat een rij met rust waar gewone tekst tussen staat — dat is geen tabel meer', () => {
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\nEen alinea.\n\n| los | stuk |\n`);

    expect(klachten).toEqual([]);
  });

  // ⚠️⚠️ **Deze toets is met de hand rood gemaakt en bléék niet rood te worden,
  //    en dat staat hier in plaats van dat hij stilletjes blijft staan.** Met de
  //    codefence-knip eruit blijft hij groen: de fenceregel zelf is óók een
  //    niet-tabelregel, dus hij sluit de verlaten kop sowieso. Wat de knip wél
  //    draagt is de toets hieronder — een hele tabel binnen een codeblok. Deze
  //    blijft staan als must-allow op de vorm die in `docs/` voorkomt, niet als
  //    grendel.
  it('laat een streep in een codeblok met rust', () => {
    const code = '```\n| dit is uitvoer |\n| en dit ook     |\n```\n';
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n\n${code}`);

    expect(klachten).toEqual([]);
  });

  // ⚠️ **Dít is de grendel die de codefence draagt**, en hij bewaakt een vorm die
  //    vandaag nergens in `docs/` staat: 📏 mét en zónder de knip telt de
  //    controle 721 tabellen en 4216 rijen. Hij staat er voor het moment dat
  //    iemand een tabel als voorbeeld toont — vals alarm is hier de duurste
  //    uitkomst, want een controle die alles meldt leer je overslaan.
  it('telt een tabel binnen een codeblok niet als tabel', () => {
    const uitslag = klachtenVan('```\n| a | b |\n|---|---|\n| 1 | 2 |\n```\n');

    expect(uitslag.tabellen).toBe(0);
    expect(uitslag.rijen).toBe(0);
  });

  it('laat een tabel zonder lege regels volledig met rust', () => {
    const { klachten } = klachtenVan(`${KOP4}| 1 | a | b | ✅ |\n| 2 | c | d | ✅ |\n`);

    expect(klachten).toEqual([]);
  });

  it('laat een losse rij zonder tabel erboven met rust — die was nooit een tabel', () => {
    expect(klachtenVan('| los | stuk |\n').klachten).toEqual([]);
  });
});
