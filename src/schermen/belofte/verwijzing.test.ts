import { describe, expect, it } from 'vitest';

import { toonBelofteverwijzing, verwijzingsdoel } from './verwijzing';

describe('toonBelofteverwijzing', () => {
  it('zonder groep en zonder getuige: geen verwijzing', () => {
    expect(toonBelofteverwijzing({ groepen: 0, getuigen: 0 })).toBe(false);
  });
  it('met een groep: wel', () => {
    expect(toonBelofteverwijzing({ groepen: 1, getuigen: 0 })).toBe(true);
  });
  it('met alleen een getuige: wel', () => {
    expect(toonBelofteverwijzing({ groepen: 0, getuigen: 2 })).toBe(true);
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
