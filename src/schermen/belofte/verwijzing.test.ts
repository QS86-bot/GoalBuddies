import { describe, expect, it } from 'vitest';

import { toonBelofteverwijzing, verwijzingsdoel } from './verwijzing';
import { doelenNaVragenlijst, VERWIJZING_PARAM, verwijzingAangevraagd } from './verwijzingsparameter';

describe('toonBelofteverwijzing', () => {
  const met = { aangevraagd: true };
  it('zonder groep en zonder getuige: geen verwijzing', () => {
    expect(toonBelofteverwijzing({ ...met, groepen: 0, getuigen: 0 })).toBe(false);
  });
  it('met een groep: wel', () => {
    expect(toonBelofteverwijzing({ ...met, groepen: 1, getuigen: 0 })).toBe(true);
  });
  it('met alleen een getuige: wel', () => {
    expect(toonBelofteverwijzing({ ...met, groepen: 0, getuigen: 2 })).toBe(true);
  });
  it('zonder de parameter: nooit, ook niet met groep en getuige (naad vragenlijst ↔ doelenlijst)', () => {
    expect(toonBelofteverwijzing({ aangevraagd: false, groepen: 3, getuigen: 3 })).toBe(false);
  });
});

describe('de parameter van de vragenlijst naar de doelenlijst', () => {
  it('wat bewaar() meestuurt, leest de doelenlijst als aangevraagd (rondreis)', () => {
    const href = doelenNaVragenlijst();
    expect(href.pathname).toBe('/doelen');
    expect(verwijzingAangevraagd(href.params[VERWIJZING_PARAM])).toBe(true);
  });
  it('een doelenlijst zonder, met een andere of een lege waarde: niet aangevraagd', () => {
    expect(verwijzingAangevraagd(undefined)).toBe(false);
    expect(verwijzingAangevraagd('')).toBe(false);
    expect(verwijzingAangevraagd('1')).toBe(false);
    expect(verwijzingAangevraagd(['na-vragenlijst'])).toBe(false);
  });
});

describe('verwijzingsdoel', () => {
  it('precies één doel: dat doel', () => {
    expect(verwijzingsdoel({ paginaNr: 0, totaal: 1, doelIds: ['a'] })).toBe('a');
  });
  it('geen doel of nog niet geladen: geen verwijzing', () => {
    expect(verwijzingsdoel({ paginaNr: 0, totaal: 0, doelIds: [] })).toBeNull();
    expect(verwijzingsdoel({ paginaNr: 0, totaal: undefined, doelIds: [] })).toBeNull();
  });
  it('twee doelen: geen verwijzing', () => {
    expect(verwijzingsdoel({ paginaNr: 0, totaal: 2, doelIds: ['a', 'b'] })).toBeNull();
  });
  it('de totaalteller wint van de getoonde rijen (naad pagina ↔ totaal)', () => {
    expect(verwijzingsdoel({ paginaNr: 0, totaal: 21, doelIds: ['a'] })).toBeNull();
  });
  it('een latere pagina: geen verwijzing', () => {
    expect(verwijzingsdoel({ paginaNr: 1, totaal: 1, doelIds: ['a'] })).toBeNull();
  });
});
