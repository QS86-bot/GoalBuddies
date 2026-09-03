import { describe, expect, it } from 'vitest';

import {
  toonDatum,
  toonDatumKort,
  toonDatumLang,
  toonKlokTijd,
  toonMoment,
  toonTijd,
} from './opmaak';

/**
 * Datums en tijden in de notatie van de gebruiker — QS8-221.
 *
 * ⚠️ **De vaste uitkomsten hieronder hangen aan de Intl-data van Node.** Waar
 *    dat te bros is, toetst deze suite de eigenschap in plaats van de letter —
 *    "de dag komt vóór de maand" is de belofte, niet het scheidingsteken.
 */

describe('toonDatum', () => {
  it('schrijft een Nederlandse datum met de dag voorop', () => {
    expect(toonDatum('2026-12-31', 'nl')).toBe('31-12-2026');
  });

  it('schrijft een Amerikaanse datum met de maand voorop', () => {
    expect(toonDatum('2026-12-31', 'en-US')).toBe('12/31/2026');
  });

  it('volgt de regio en niet alleen de taal', () => {
    // ⚠️ Dit is de reden dat `opmaaktaal()` bestaat naast `taal()`. De catalogus
    //    kent twee talen; de notatie van een datum kent er honderden. Een Britse
    //    en een Amerikaanse telefoon lezen dezelfde Engelse catalogus en horen
    //    een ándere datumvolgorde te zien.
    expect(toonDatum('2026-12-31', 'en-GB')).not.toBe(toonDatum('2026-12-31', 'en-US'));
  });

  it('verschuift geen dag, ook niet ten westen van Greenwich', () => {
    // ⚠️ **De belangrijkste test in dit bestand.** Een `date`-kolom is een
    //    kalenderdag zonder tijd. `new Date('2026-01-01')` is middernacht UTC;
    //    zou dat in een lokale zone geformatteerd worden, dan staat er in Los
    //    Angeles 31 december. Een streefdatum die per gebruiker een dag
    //    verschuift, is het soort fout dat je pas ziet als iemand zich meldt.
    for (const locale of ['nl', 'en-US', 'en-GB']) {
      expect(toonDatum('2026-01-01', locale)).toMatch(/2026/);
      expect(toonDatum('2026-01-01', locale)).not.toMatch(/2025/);
    }
  });

  it('geeft rommel onveranderd terug in plaats van Invalid Date', () => {
    // Een lege plek waar een streefdatum hoort te staan, verbergt dat er iets
    // mis is. De ISO-waarde is tenminste te lezen.
    expect(toonDatum('geen datum', 'nl')).toBe('geen datum');
    expect(toonDatum('', 'nl')).toBe('');
    expect(toonDatum('2026-13-45', 'nl')).toBe('2026-13-45');
  });
});

describe('toonDatumKort', () => {
  it('laat het jaar weg', () => {
    expect(toonDatumKort('2026-12-31', 'nl')).not.toMatch(/2026/);
    expect(toonDatumKort('2026-12-31', 'nl')).toMatch(/31/);
  });
});

describe('toonDatumLang', () => {
  it('noemt de weekdag, want dat is de reden om de lange vorm te kiezen', () => {
    // 31 december 2026 is een donderdag.
    expect(toonDatumLang('2026-12-31', 'nl').toLowerCase()).toContain('donderdag');
    expect(toonDatumLang('2026-12-31', 'en-GB').toLowerCase()).toContain('thursday');
  });

  it('houdt dezelfde weekdag aan in elke locale', () => {
    // De weekdag is een eigenschap van de datum en niet van de taal. Zou de
    // UTC-grens hier misgaan, dan verschilt hij per locale.
    expect(toonDatumLang('2026-01-01', 'en-US').toLowerCase()).toContain('thursday');
  });
});

describe('toonTijd', () => {
  it('houdt een 24-uursklok waar die geldt', () => {
    expect(toonTijd('20:00', 'nl')).toBe('20:00');
  });

  it('padt het uur op een 24-uursklok', () => {
    // ⚠️ `Intl` doet dit niet vanzelf: `hour: 'numeric'` geeft in het Nederlands
    //    `7:05`, en dat leest als een los getal in plaats van als een klok.
    expect(toonTijd('07:05', 'nl')).toBe('07:05');
    expect(toonTijd('00:30', 'en-GB')).toBe('00:30');
  });

  it('padt het uur juist níét op een 12-uursklok', () => {
    // `08:00 PM` is de fout in de andere richting, en die maakt `hour: '2-digit'`
    // als je hem overal toepast.
    expect(toonTijd('20:00', 'en-US')).not.toMatch(/^08/);
  });

  it('geeft een 12-uursklok waar die geldt', () => {
    // ⚠️ Dit keert het besluit om dat in `klokTijd()` stond: *"`h23` en niet de
    //    landsinstelling. De app is Nederlands en een 24-uursklok is hier het
    //    enige juiste antwoord."* Dat klopte tot QS8-115 er Engels bij zette.
    expect(toonTijd('20:00', 'en-US')).toMatch(/8[:.]00/);
    expect(toonTijd('20:00', 'en-US').toUpperCase()).toContain('PM');
  });

  it('slikt de secondenvorm die Postgres teruggeeft', () => {
    expect(toonTijd('20:00:00', 'nl')).toBe('20:00');
  });

  it('laat iets dat geen tijd is met rust', () => {
    expect(toonTijd('', 'nl')).toBe('');
    expect(toonTijd('kwart over acht', 'nl')).toBe('kwart over acht');
    expect(toonTijd('25:00', 'nl')).toBe('25:00');
  });
});

describe('toonKlokTijd', () => {
  it('rekent naar de zone van de lezer', () => {
    const moment = '2026-08-18T07:05:00Z';

    expect(toonKlokTijd(moment, 'UTC', 'nl')).toBe('07:05');
    expect(toonKlokTijd(moment, 'Europe/Amsterdam', 'nl')).toBe('09:05');
    expect(toonKlokTijd(moment, 'America/New_York', 'nl')).toBe('03:05');
  });

  it('houdt rekening met zomertijd', () => {
    expect(toonKlokTijd('2026-01-18T12:00:00Z', 'Europe/Amsterdam', 'nl')).toBe('13:00');
    expect(toonKlokTijd('2026-08-18T12:00:00Z', 'Europe/Amsterdam', 'nl')).toBe('14:00');
  });

  it('volgt ook hier de klok van de locale', () => {
    expect(toonKlokTijd('2026-08-18T18:05:00Z', 'UTC', 'en-US').toUpperCase()).toContain('PM');
  });

  it('geeft een lege string bij een onleesbaar tijdstempel', () => {
    // ⚠️ Anders dan bij een datum, en met reden: een chatregel zonder tijd erboven
    //    is beter dan een chatregel met `Invalid Date`.
    expect(toonKlokTijd('geen moment', 'UTC', 'nl')).toBe('');
  });
});

describe('toonMoment', () => {
  it('geeft dag én tijd in de zone van de lezer', () => {
    const uit = toonMoment('2026-12-31T23:30:00Z', 'Europe/Amsterdam', 'nl');

    // Half één 's nachts in Amsterdam is de dag erna.
    expect(uit).toContain('01-01-2027');
    expect(uit).toContain('00:30');
  });

  it('is de dag ervóór ten westen van Greenwich', () => {
    // ⚠️ Precies het geval dat misging: `confirmed_at.slice(0, 10)` gaf de
    //    UTC-dag, dus wie in Los Angeles om 17:00 iets vastlegde, zag de dag erna
    //    staan bij zijn eigen commitment.
    expect(toonMoment('2027-01-01T01:00:00Z', 'America/Los_Angeles', 'nl')).toContain('31-12-2026');
  });

  it('geeft een lege string bij een onleesbaar tijdstempel', () => {
    expect(toonMoment('', 'UTC', 'nl')).toBe('');
  });
});
