import { describe, expect, it } from 'vitest';

import { isBruikbareZone, VOORSTELLEN_MAX, zoekTijdzones } from './tijdzone';

/**
 * QS8-27, criterium 1 — het zoeken in de tijdzonelijst.
 *
 * ⚠️ De lijst komt hier uit de test en niet uit `Intl`. Wat `Intl` teruggeeft
 *    verschilt per platform en per Node-versie; wat het zóekgedrag belooft, niet.
 */
const LIJST = [
  'Africa/Abidjan',
  'America/Argentina/Buenos_Aires',
  'America/New_York',
  'Asia/Bangkok',
  'Europe/Amsterdam',
  'Europe/Lisbon',
  'Pacific/Auckland',
  'US/Eastern',
];

describe('zoeken in de tijdzones', () => {
  it('vindt een zone op de plaatsnaam', () => {
    expect(zoekTijdzones('amsterdam', LIJST)).toEqual(['Europe/Amsterdam']);
  });

  it('vindt een zone met een spatie waar een liggend streepje staat', () => {
    // ⚠️ De gebruiker typt wat hij leest, en hij leest "New York".
    expect(zoekTijdzones('new york', LIJST)).toEqual(['America/New_York']);
  });

  it('zet de plaatsnaam die met de term begint vooraan', () => {
    // "a" komt in bijna alles voor. Wat bovenaan hoort te staan, is de zone
    // waarvan de pláátsnaam met "a" begint — anders is de eerste knop nooit de
    // goede en is een lijst van acht net zo onbruikbaar als een van vierhonderd.
    const gevonden = zoekTijdzones('a', LIJST);

    expect(gevonden[0]).toBe('Africa/Abidjan');
    expect(gevonden.slice(0, 4)).toContain('Europe/Amsterdam');
    expect(gevonden.slice(0, 4)).toContain('Pacific/Auckland');
  });

  it('geeft bij een lege term niets terug', () => {
    // Vierhonderd zones alfabetisch afkappen levert acht keer Afrika op, en dat
    // leest als een kapotte lijst in plaats van als "typ iets".
    expect(zoekTijdzones('', LIJST)).toEqual([]);
    expect(zoekTijdzones('   ', LIJST)).toEqual([]);
  });

  it('geeft er nooit meer dan het maximum', () => {
    const veel = Array.from({ length: 50 }, (_, i) => `Test/Zone_${i}`);

    expect(zoekTijdzones('zone', veel)).toHaveLength(VOORSTELLEN_MAX);
  });

  it('is ongevoelig voor hoofdletters', () => {
    expect(zoekTijdzones('LISBON', LIJST)).toEqual(['Europe/Lisbon']);
  });
});

describe('een ingetypte zone', () => {
  it('accepteert een echte IANA-zone', () => {
    // ⚠️ De uitweg voor een toestel zonder `Intl.supportedValuesOf`: er is dan
    //    geen lijst om uit te kiezen, maar `Intl.DateTimeFormat` kent de zone
    //    nog steeds. Zonder die uitweg kan juist de oudste telefoon zijn
    //    tijdzone niet zetten.
    expect(isBruikbareZone('Europe/Lisbon')).toBe(true);
    expect(isBruikbareZone('  Asia/Bangkok  ')).toBe(true);
  });

  it('weigert wat geen zone is', () => {
    // Een onbekende zone laat `currentUserCycle()` stukgaan, en dan klopt "deze
    // week" niet meer voor deze gebruiker.
    expect(isBruikbareZone('Europa/Amsterdam')).toBe(false);
    expect(isBruikbareZone('')).toBe(false);
  });
});
