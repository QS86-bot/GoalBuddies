import { describe, expect, it } from 'vitest';

import {
  AANSLUITPUNTEN,
  beoordeel,
  injectiepuntenIn,
  wordtAangesloten,
} from '../../scripts/aansluiting-controle.mjs';

/**
 * De ijking van `npm run aansluiting:controle`.
 *
 * ⚠️ **De klasse die deze controle vangt, is de duurste van dit project:** elk
 *    onderdeel af en getoetst, de keten nergens verbonden. Er is niets kapot,
 *    dus geen enkele test wordt rood. De vier gevallen van 26-08 stonden tussen
 *    de vijf dagen en drie maanden onopgemerkt, en alle vier zijn met de hand of
 *    bij toeval gevonden.
 *
 * ⚠️ **De tweede helft — wat hij met rust moet laten — is hier de zwaarste.**
 *    Zonder de synchroon-eis meldt de controle dertien namen waarvan er tien
 *    gewone schrijfacties zijn. Een controle die tien onschuldige dingen meldt,
 *    leert je hem te negeren.
 */

/** Een minimale bestandenlijst zoals `beoordeel()` hem verwacht. */
function bestand(pad: string, bron: string) {
  return { pad, bron };
}

describe('injectiepuntenIn vindt', () => {
  it('een synchrone zet-functie', () => {
    expect(injectiepuntenIn('export function zetTaal(t: string): void {}')).toEqual(['zetTaal']);
  });

  it('een synchrone set-functie', () => {
    expect(injectiepuntenIn('export function setErrorSink(s?: Sink): void {}')).toEqual([
      'setErrorSink',
    ]);
  });

  it('een const met een gewone functie erin', () => {
    expect(injectiepuntenIn('export const zetBron = (b: Bron): void => {};')).toEqual(['zetBron']);
  });

  it('meerdere in één bestand', () => {
    const bron = 'export function zetA(): void {}\nexport function setB(): void {}';
    expect(injectiepuntenIn(bron)).toEqual(['zetA', 'setB']);
  });
});

describe('injectiepuntenIn laat met rust', () => {
  it('een async schrijfactie', () => {
    // ⚠️ **Dit is de tien-tegen-drie-toets.** `zetStreefdatum`, `zetBeloning`,
    //    `zetDagzet` en zeven anderen schrijven data en zijn geen injectiepunt.
    //    Zonder deze regel meldt de controle ze alle tien.
    expect(injectiepuntenIn('export async function zetStreefdatum(d: string) {}')).toEqual([]);
  });

  it('een async const', () => {
    expect(injectiepuntenIn('export const zetDagzet = async (t: string) => {};')).toEqual([]);
  });

  it('een zet-functie die niet geëxporteerd wordt', () => {
    // Interne staat aanpassen is geen aansluitpunt van de app.
    expect(injectiepuntenIn('function zetIntern(x: number): void {}')).toEqual([]);
  });

  it('een naam die met zet begint maar geen hoofdletter volgt', () => {
    // `zetten`, `settings` — woorden, geen injectiepunten.
    expect(injectiepuntenIn('export function zetten(): void {}')).toEqual([]);
    expect(injectiepuntenIn('export function settings(): void {}')).toEqual([]);
  });
});

describe('wordtAangesloten', () => {
  const punt = bestand('src/lib/x.ts', 'export function zetA(): void {}');

  it('ziet een aanroep in een ander bestand', () => {
    const bestanden = [punt, bestand('app/_layout.tsx', 'zetA();')];
    expect(wordtAangesloten('zetA', bestanden, punt.pad)).toBe(true);
  });

  it('telt een aanroep in het eigen bestand niet mee', () => {
    // ⚠️ Dat was de stand van `setErrorSink()`: de laag was af en riep zichzelf
    //    aan, maar de app sloot hem nergens aan.
    const bestanden = [bestand('src/lib/x.ts', 'export function zetA(): void {}\nzetA();')];
    expect(wordtAangesloten('zetA', bestanden, 'src/lib/x.ts')).toBe(false);
  });

  it('telt een aanroep in een test niet mee', () => {
    // ⚠️ **De kern van deze controle.** Alle vier de dode ketens hadden een
    //    groene test; wat ontbrak was een aanroep in de app.
    const bestanden = [punt, bestand('src/lib/x.test.ts', 'zetA();')];
    expect(wordtAangesloten('zetA', bestanden, punt.pad)).toBe(false);
  });

  it('ziet een naam die alleen als deel van een langere naam voorkomt niet aan', () => {
    const bestanden = [punt, bestand('app/y.tsx', 'zetAlles();')];
    expect(wordtAangesloten('zetA', bestanden, punt.pad)).toBe(false);
  });
});

describe('beoordeel — de drie uitkomsten', () => {
  it('meldt een injectiepunt dat niemand aansluit', () => {
    const bestanden = [bestand('src/lib/x.ts', 'export function zetA(): void {}')];
    const uit = beoordeel(bestanden, { zetA: 'reden' }, {});

    expect(uit.losseDraden).toEqual(['zetA']);
    expect(uit.onbekend).toEqual([]);
    expect(uit.verdwenen).toEqual([]);
  });

  it('zwijgt over een injectiepunt dat wél aangesloten is', () => {
    const bestanden = [
      bestand('src/lib/x.ts', 'export function zetA(): void {}'),
      bestand('app/_layout.tsx', 'zetA();'),
    ];
    expect(beoordeel(bestanden, { zetA: 'reden' }, {}).losseDraden).toEqual([]);
  });

  it('meldt een nieuw injectiepunt dat in geen van beide registers staat', () => {
    // ⚠️ Zo veroudert het register niet stil. De bevinding noemde vier namen en
    //    één ervan bestond niet — die stond in een werkboom die nooit geland is.
    const bestanden = [bestand('src/lib/x.ts', 'export function zetNieuw(): void {}')];
    expect(beoordeel(bestanden, {}, {}).onbekend).toEqual(['zetNieuw']);
  });

  it('zwijgt over iets dat met reden geen injectiepunt is', () => {
    const bestanden = [bestand('src/lib/x.ts', 'export function zetB(): void {}')];
    const uit = beoordeel(bestanden, {}, { zetB: 'schrijft synchroon naar de cache' });

    expect(uit.onbekend).toEqual([]);
    expect(uit.losseDraden).toEqual([]);
  });

  it('meldt een registerregel waarvan de functie niet meer bestaat', () => {
    // Het geval `zetWebPushAan()`: een naam uit een werkboom die nooit landde.
    expect(beoordeel([bestand('src/lib/x.ts', '')], { zetWeg: 'reden' }, {}).verdwenen).toEqual([
      'zetWeg',
    ]);
  });
});

describe('het echte register', () => {
  it('geeft bij elk injectiepunt het gevolg en niet alleen een vinkje', () => {
    for (const [naam, reden] of Object.entries(AANSLUITPUNTEN as Record<string, string>)) {
      expect(reden.length, `${naam} heeft geen reden`).toBeGreaterThan(60);
    }
  });
});
