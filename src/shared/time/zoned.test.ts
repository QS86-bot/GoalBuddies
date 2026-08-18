import { describe, expect, it } from 'vitest';

import { klokTijd } from './zoned';

/**
 * `klokTijd` staat in `shared/time` en niet bij de chat, omdat het een
 * tijdberekening is (CLAUDE.md, correctheidsregel 7). Wat hier vastligt, is
 * precies wat er misgaat als een scherm het zelf doet.
 */

describe('klokTijd', () => {
  it('rekent naar de tijdzone van de lezer en niet naar die van de server', () => {
    // ⚠️ Dit is het hele punt. Hetzelfde moment hoort in Amsterdam een ander
    //    getal te zijn dan in UTC; zou een scherm de string uit Postgres knippen,
    //    dan staat er de tijd van de server bij een bericht van je buddy.
    const moment = '2026-08-18T07:05:00Z';

    expect(klokTijd(moment, 'UTC')).toBe('07:05');
    expect(klokTijd(moment, 'Europe/Amsterdam')).toBe('09:05');
    expect(klokTijd(moment, 'America/New_York')).toBe('03:05');
  });

  it('gebruikt een 24-uursklok en vult met nullen', () => {
    expect(klokTijd('2026-08-18T23:07:00Z', 'UTC')).toBe('23:07');
    expect(klokTijd('2026-08-18T00:00:00Z', 'UTC')).toBe('00:00');
  });

  it('houdt rekening met zomertijd', () => {
    // Amsterdam staat in januari op UTC+1 en in augustus op UTC+2. Een vaste
    // offset zou hier één van de twee fout doen.
    expect(klokTijd('2026-01-18T12:00:00Z', 'Europe/Amsterdam')).toBe('13:00');
    expect(klokTijd('2026-08-18T12:00:00Z', 'Europe/Amsterdam')).toBe('14:00');
  });

  it('geeft een lege string bij een tijdstempel die niet te lezen is', () => {
    // ⚠️ Een chatregel zonder tijd is beter dan een chatregel met `Invalid Date`
    //    erboven — en beter dan een scherm dat omvalt op één rare rij.
    expect(klokTijd('geen datum', 'UTC')).toBe('');
    expect(klokTijd('', 'UTC')).toBe('');
  });
});
