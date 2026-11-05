import { describe, expect, it } from 'vitest';
import { geldigeKeuze, moetKiezen, type Kandidaat } from './groepskeuze';

const a: Kandidaat = { id: 'a' };
const b: Kandidaat = { id: 'b' };
const team: Kandidaat = { id: 't', soort: 'team' };

describe('geldigeKeuze — geen stille standaard bij twee of meer', () => {
  it('niemand: niets', () => {
    expect(geldigeKeuze([], '')).toBe('');
    expect(geldigeKeuze([], 'a')).toBe('');
  });

  it('precies één: dat is het antwoord, de keuze wordt niet gevraagd', () => {
    expect(geldigeKeuze([a], '')).toBe('a');
    expect(moetKiezen([a])).toBe(false);
  });

  it('twee of meer zonder keuze: leeg, nooit de eerste', () => {
    expect(geldigeKeuze([a, b], '')).toBe('');
    expect(geldigeKeuze([b, a], '')).toBe('');
    expect(moetKiezen([a, b])).toBe(true);
  });

  it('een bestaande keuze wint', () => {
    expect(geldigeKeuze([a, b], 'b')).toBe('b');
    expect(geldigeKeuze([a], 'a')).toBe('a');
  });

  it('een keuze die niet meer bestaat valt niet terug op een andere rij', () => {
    expect(geldigeKeuze([a, b], 'weg')).toBe('');
    // Eén overgebleven kandidaat is wel eenduidig, ook na een verdwenen keuze.
    expect(geldigeKeuze([b], 'a')).toBe('b');
  });
});

describe('een teamgroep is nooit de standaard', () => {
  it('als enige kandidaat: leeg, en het scherm moet de keuze tonen', () => {
    expect(geldigeKeuze([team], '')).toBe('');
    expect(moetKiezen([team])).toBe(true);
  });

  it('naast een gewone groep: leeg', () => {
    expect(geldigeKeuze([team, a], '')).toBe('');
    expect(geldigeKeuze([a, team], '')).toBe('');
  });

  it('een expliciete keuze voor het team telt wel', () => {
    expect(geldigeKeuze([team, a], 't')).toBe('t');
  });
});
