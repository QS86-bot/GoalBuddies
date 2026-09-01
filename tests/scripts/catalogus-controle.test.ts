import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings — zelfde patroon als `dsn-controle.test.ts`.
import {
  NOG_NIET_AANGESLOTEN,
  beoordeelCatalogus,
  letterlijkeStrings,
  projectbron,
  routeVan,
  sjabloonvormen,
  sleutelsUit,
} from '../../scripts/catalogus-controle.mjs';

/**
 * IJking van `catalogus:controle`.
 *
 * ⚠️ **De belofte is niet "de controle vindt een ongebruikte sleutel".** Dat is
 *    een grep, en die meldt hier **122 van de 1221 sleutels** — want de helft van
 *    deze catalogus wordt samengesteld. De belofte is: *hij vindt een tekst die
 *    niemand kan tonen, en laat de honderd die wél getoond worden met rust.*
 *
 *    Die tweede helft is hier niet beleefdheid maar de enige reden dat de
 *    controle bruikbaar is. Op 24-08 meldde `tekst:controle` maandenlang nul
 *    terwijl er zeven onvertaalde zinnen stonden; het spiegelbeeld — honderd
 *    meldingen waarvan er zes kloppen — leer je net zo snel negeren.
 *
 * ⚠️ **Elke vorm wordt hier los aangeboden**, want een controle die je niet kunt
 *    voeden, kun je niet ijken (CLAUDE.md, bij regel 18). De vier soorten
 *    aanroepers staan hieronder elk apart, en de vormen die géén aanroeper zijn
 *    ook.
 *
 * IJKING — met de hand gedraaid op 01-09-2026, één mutatie per grendel:
 *
 *   A  `letterlijk`-tak eruit                      → 6 rood
 *   B  `samengesteld`-tak eruit                    → 4 rood
 *   C  het gat aan het begin op één segment zetten → 3 rood
 *   D  de kop-eis bij `prefix` weghalen            → 1 rood
 *   E  `overbodig`/`verdwenen` niet melden         → 2 rood
 *
 * ⚠️ **D is de grendel die het makkelijkst te verliezen is en het meeste kost.**
 *    Zonder de eis dat de gevonden kop letterlijk in de bron staat, verklaart één
 *    `t(`${sleutel}.titel`)` élke sleutel op `.titel` levend — en dan is de
 *    controle groen zonder iets te bewijzen.
 */

describe('sleutelsUit', () => {
  it('leest de sleutels uit een catalogusbestand', () => {
    const bron = `export const nl = {\n  'a.b': 'x',\n  'c.d.e': 'y',\n};\n`;
    expect(sleutelsUit(bron)).toEqual(['a.b', 'c.d.e']);
  });

  it('laat een sleutel met hoofdletters of streepjes met rust', () => {
    expect(sleutelsUit(`  'A.b': 'x',\n  'c-d': 'y',\n`)).toEqual([]);
  });

  it.each([
    ['leeg', ''],
    ['undefined', undefined],
  ])('geeft een lege lijst bij %s', (_naam, bron) => {
    expect(sleutelsUit(bron)).toEqual([]);
  });
});

describe('sjabloonvormen', () => {
  it('leest een gat uit een t-aanroep', () => {
    expect(sjabloonvormen('t(`systeembericht.${x}` as Sleutel)')).toEqual([['systeembericht.', '']]);
  });

  it('leest twee gaten in één vorm', () => {
    expect(sjabloonvormen('t(`commitment.${a}.${b}.titel`)')).toEqual([
      ['commitment.', '.', '.titel'],
    ]);
  });

  /** Een gat aan het begin geeft een leeg eerste deel; daar hangt `routeVan` op. */
  it('geeft een leeg eerste deel bij een gat aan het begin', () => {
    expect(sjabloonvormen('t(`${sleutel}.titel`)')).toEqual([['', '.titel']]);
  });

  it('ontdubbelt dezelfde vorm', () => {
    expect(sjabloonvormen('t(`a.${x}`); t(`a.${y}`)')).toEqual([['a.', '']]);
  });

  /** Een template zonder gat is gewoon een letterlijke sleutel; die telt elders al mee. */
  it('slaat een template zonder gat over', () => {
    expect(sjabloonvormen('t(`gewoon.een.sleutel`)')).toEqual([]);
  });

  /**
   * ⚠️ **De must-allow-helft.** Elke backtick-string meetellen maakt de controle
   *    ruimer dan hij mag zijn: een willekeurige template ergens in de code is
   *    geen sleutelaanroep.
   */
  it.each([
    ['een gewone template', 'const x = `hallo ${naam}`;'],
    ['een testnaam', 'it(`kapt af op ${MAX}`, () => {});'],
    ['een functie die toevallig op t eindigt', 'formaat(`iets.${x}`)'],
  ])('telt %s niet mee', (_naam, bron) => {
    expect(sjabloonvormen(bron)).toEqual([]);
  });
});

describe('routeVan', () => {
  const stand = (bron: string) => ({
    letterlijk: letterlijkeStrings(bron),
    vormen: sjabloonvormen(bron),
  });

  it('vindt een letterlijke aanroeper', () => {
    expect(routeVan('auth.fout.uitloggen', stand("t('auth.fout.uitloggen')"))).toBe('letterlijk');
  });

  it('vindt een samengestelde aanroeper met een vaste kop', () => {
    expect(routeVan('systeembericht.member_joined', stand('t(`systeembericht.${e}`)'))).toBe(
      'samengesteld',
    );
  });

  it('vindt een aanroeper met twee gaten', () => {
    expect(routeVan('commitment.reward.set.titel', stand('t(`commitment.${a}.${b}.titel`)'))).toBe(
      'samengesteld',
    );
  });

  /**
   * ⚠️ **Het geval waar de eerste versie op strandde.** De kop staat niet in de
   *    aanroep maar als losse string ergens anders, en overspant twee segmenten.
   */
  it('vindt een kop die elders als losse string staat', () => {
    const bron = "bouw('bevestiging.weekdoel_afsluiten'); t(`${sleutel}.titel`)";
    expect(routeVan('bevestiging.weekdoel_afsluiten.titel', stand(bron))).toBe('prefix');
  });

  /**
   * ⚠️ **D uit de ijking, en de belangrijkste toets in dit bestand.** Zonder de
   *    kop-eis verklaart één `t(`${x}.titel`)` élke sleutel op `.titel` levend.
   */
  it('verklaart een sleutel níet levend als de kop nergens staat', () => {
    expect(routeVan('iets.heel.anders.titel', stand('t(`${sleutel}.titel`)'))).toBeNull();
  });

  /**
   * ⚠️ Een gat middenin is één segment. Zou daar een punt mogen, dan dekt
   *    `commitment.${a}.${b}.titel` ook `commitment.a.b.c.d.titel` af.
   */
  it('laat een gat middenin niet over een punt heen lopen', () => {
    expect(routeVan('commitment.a.b.c.d.titel', stand('t(`commitment.${a}.${b}.titel`)'))).toBeNull();
  });

  it('geeft null als er niets is', () => {
    expect(routeVan('niemand.roept.mij', stand('const x = 1;'))).toBeNull();
  });
});

describe('beoordeelCatalogus', () => {
  const bron = "t('leeft.wel')";
  const sleutels = ['leeft.wel', 'leeft.niet'];

  it('meldt een sleutel die niemand kan tonen', () => {
    expect(beoordeelCatalogus({ sleutels, bron }).onverwacht).toEqual(['leeft.niet']);
  });

  it('zwijgt over een sleutel die met een reden op de lijst staat', () => {
    const uit = beoordeelCatalogus({
      sleutels,
      bron,
      uitzonderingen: { 'leeft.niet': 'wacht op QS8-000' },
    });
    expect(uit.onverwacht).toEqual([]);
  });

  /**
   * ⚠️ **Een uitzondering die niet meer nodig is, is zelf een bevinding.** Anders
   *    rot de lijst en dekt hij op een dag iets af wat niemand meer bedoeld heeft
   *    — dezelfde reden dat `review:controle` een rij eist die zegt wanneer hij
   *    zwaarder wordt.
   */
  it('meldt een uitzondering die inmiddels een aanroeper heeft', () => {
    const uit = beoordeelCatalogus({
      sleutels,
      bron,
      uitzonderingen: { 'leeft.wel': 'oude reden' },
    });
    expect(uit.overbodig).toEqual(['leeft.wel']);
  });

  it('meldt een uitzondering waarvan de sleutel niet meer bestaat', () => {
    const uit = beoordeelCatalogus({
      sleutels,
      bron,
      uitzonderingen: { 'allang.weg': 'oude reden' },
    });
    expect(uit.verdwenen).toEqual(['allang.weg']);
  });
});

/**
 * ⚠️ **De ijking tegen de werkelijkheid.** Een controle die je alleen op
 *    verzonnen voorbeelden draait, is groen op alles wat je bedacht hebt. Deze
 *    voert hem de échte catalogus en de échte bron, en legt het aantal vast dat
 *    op 01-09-2026 met de hand is nagelopen.
 */
describe('de echte catalogus', () => {
  const sleutels = sleutelsUit(
    readFileSync(join(process.cwd(), 'src', 'shared', 'i18n', 'nl.ts'), 'utf8'),
  );

  it('bevat sleutels om te toetsen', () => {
    expect(sleutels.length).toBeGreaterThan(1000);
  });

  it('heeft voor élke sleutel een aanroeper, op de lijst met redenen na', () => {
    const uit = beoordeelCatalogus({
      sleutels,
      bron: projectbron(process.cwd()),
      uitzonderingen: NOG_NIET_AANGESLOTEN,
    });

    expect(uit.onverwacht, 'deze teksten kan niemand tonen').toEqual([]);
    expect(uit.overbodig, 'deze uitzonderingen mogen weg').toEqual([]);
    expect(uit.verdwenen, 'deze uitzonderingen wijzen naar niets').toEqual([]);
  });

  /**
   * ⚠️ **De ondergrens die zegt dat de controle nog iets dóet.** Zou de analyse
   *    ooit te ruim worden — een gat dat over punten heen loopt, bijvoorbeeld —
   *    dan verklaart hij alles levend en meldt hij vrolijk niets. Zes is het
   *    aantal dat op 01-09 met de hand is nagelopen; dit getal hoort omláág te
   *    gaan als iemand ze aansluit, en dan gaat `overbodig` rood.
   */
  it('vindt nog steeds de zes gaten die met de hand geteld zijn', () => {
    const uit = beoordeelCatalogus({
      sleutels,
      bron: projectbron(process.cwd()),
      uitzonderingen: NOG_NIET_AANGESLOTEN,
    });
    expect(uit.aantalDood).toBe(Object.keys(NOG_NIET_AANGESLOTEN).length);
  });

  /** Elke uitzondering draagt een reden en geen naam. */
  it.each(Object.entries(NOG_NIET_AANGESLOTEN as Record<string, string>))(
    '%s zegt waarom hij er nog staat',
    (_sleutel, reden) => {
      expect(reden.length).toBeGreaterThan(40);
    },
  );
});
