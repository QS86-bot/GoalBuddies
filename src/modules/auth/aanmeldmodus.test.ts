import { describe, expect, it } from 'vitest';

import { ROUTE_AANMELDEN, andereModus, beginModus } from './aanmeldmodus';

/**
 * IJking van waarop het aanmeldscherm opent — QS8-248.
 *
 * ⚠️ **De belofte is niet "de functie leest een parameter".** Die is triviaal. De
 *    belofte is: *wie uitlogt, komt terug op inloggen* — en alleen een route die
 *    er ondubbelzinnig om vraagt, opent het aanmeldformulier. Het scherm begon
 *    op `useState(true)`, en die ene `true` zette de titel, de knop, de
 *    wachtwoordhint én `autoComplete="new-password"`. Die laatste is de duurste:
 *    een wachtwoordmanager biedt dan een **nieuw** wachtwoord aan in plaats van
 *    het opgeslagene.
 *
 * ⚠️ **De must-allow-helft telt hier even zwaar.** Een functie die bij het minste
 *    of geringste "aanmelden" zegt, zet het probleem alleen maar om: dan komt de
 *    nieuwe gebruiker goed terecht en de terugkerende niet. Vandaar dat de
 *    afwijzingen hieronder met naam en al benoemd staan.
 */

describe('beginModus', () => {
  /** ⚠️ Dit is de bug. Geen parameters is de gewone toestand: uitloggen, bookmark, adresbalk. */
  it.each([
    ['geen parameters', {}],
    ['null', null],
    ['undefined', undefined],
  ])('opent op inloggen bij %s', (_naam, params) => {
    expect(beginModus(params)).toBe('inloggen');
  });

  it.each([
    ['1', '1'],
    ['true', 'true'],
    ['ja', 'ja'],
    ['TRUE in hoofdletters', 'TRUE'],
    ['met spaties eromheen', ' 1 '],
  ])('opent op aanmelden bij nieuw=%s', (_naam, waarde) => {
    expect(beginModus({ nieuw: waarde })).toBe('aanmelden');
  });

  /**
   * ⚠️ **De helft die telt.** Een aanwezigheidstoets (`params.nieuw !== undefined`)
   *    ziet er korter uit en maakt `?nieuw=0` óók een aanmeldscherm — precies het
   *    tegenovergestelde van wat er staat.
   */
  it.each([
    ['0', '0'],
    ['false', 'false'],
    ['leeg', ''],
    ['iets anders', 'misschien'],
  ])('blijft op inloggen bij nieuw=%s', (_naam, waarde) => {
    expect(beginModus({ nieuw: waarde })).toBe('inloggen');
  });

  /**
   * ⚠️ **Geen `[0]` op een lijst die er ook twee kan bevatten** — CLAUDE.md-vraag 6.
   *    `useLocalSearchParams()` geeft een `string[]` bij een herhaalde parameter,
   *    en `?nieuw=1&nieuw=0` is geen ondubbelzinnige ja. De standaard wint, en
   *    dat is hier ook de veilige kant: vanaf inloggen ben je met één tik op het
   *    aanmeldformulier en raak je niets kwijt.
   */
  it.each([
    ['twee waarden', ['1', '0']],
    ['één waarde in een lijst', ['1']],
    ['een getal', 1],
    ['een object', { nieuw: true }],
  ])('valt terug op inloggen bij %s', (_naam, waarde) => {
    expect(beginModus({ nieuw: waarde })).toBe('inloggen');
  });

  it('trekt zich niets aan van andere parameters', () => {
    expect(beginModus({ code: 'abc', nieuw: '1' })).toBe('aanmelden');
    expect(beginModus({ code: 'abc' })).toBe('inloggen');
  });
});

describe('andereModus', () => {
  it('wisselt beide kanten op', () => {
    expect(andereModus('inloggen')).toBe('aanmelden');
    expect(andereModus('aanmelden')).toBe('inloggen');
  });

  /** Twee keer wisselen brengt je terug — anders is de knop geen wisselknop. */
  it.each(['inloggen', 'aanmelden'] as const)('is zijn eigen omkering vanaf %s', (modus) => {
    expect(andereModus(andereModus(modus))).toBe(modus);
  });
});

/**
 * ⚠️ **De naad, en de enige test hier die iets vindt wat geen van de twee
 *    onderdelen fout doet.** `ROUTE_AANMELDEN` is een string en `beginModus` is
 *    een lezer; elk voor zich kan kloppen terwijl ze langs elkaar heen praten.
 *    Wordt de constante ooit `?nieuw=yes` of `?aanmelden=1`, dan komt de
 *    uitnodigingsknop stil op *inloggen* uit — geen foutmelding, geen rode test,
 *    alleen een gebruiker die op het verkeerde formulier begint. Precies de bug
 *    die dit issue is.
 */
describe('de naad tussen de route en de lezer', () => {
  it('ROUTE_AANMELDEN komt daadwerkelijk op aanmelden uit', () => {
    const query = new URLSearchParams(ROUTE_AANMELDEN.split('?')[1] ?? '');
    expect(beginModus(Object.fromEntries(query))).toBe('aanmelden');
  });

  it('wijst naar het aanmeldscherm en niet naar een ander pad', () => {
    expect(ROUTE_AANMELDEN.split('?')[0]).toBe('/aanmelden');
  });
});
