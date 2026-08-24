import { describe, expect, it } from 'vitest';

import { apparaatTijdzone, isGeldigeTijdzone, klokTijd } from './zoned';

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

// ---------------------------------------------------------------------------
// De tijdzone van het toestel — QS8-27, criterium 3
// ---------------------------------------------------------------------------

describe('isGeldigeTijdzone', () => {
  it('kent echte IANA-zones', () => {
    for (const zone of ['Europe/Amsterdam', 'America/New_York', 'Asia/Bangkok', 'UTC']) {
      expect(isGeldigeTijdzone(zone), zone).toBe(true);
    }
  });

  it('weigert onzin, en ook de lege string', () => {
    // De lege string staat er apart bij omdat dat het geval is dat een kapot
    // toestel oplevert, niet omdat `Intl` hem zou doorlaten — nagemeten: die
    // gooit er ook een RangeError op. De expliciete toets in
    // `isGeldigeTijdzone()` is dus een riem naast de bretels, en dat is hier de
    // bedoeling: hij staat er zodat de uitkomst niet afhangt van hoe streng een
    // engine toevallig is.
    for (const zone of ['Mars/Olympus_Mons', 'Amsterdam', '', '   ']) {
      expect(isGeldigeTijdzone(zone), JSON.stringify(zone)).toBe(false);
    }
  });
});

describe('apparaatTijdzone', () => {
  it('geeft een zone die de rest van deze module aankan', () => {
    // De uitkomst hangt af van de machine waarop dit draait, dus toets de
    // eigenschap en niet de waarde: wat hij teruggeeft moet bruikbaar zijn.
    const zone = apparaatTijdzone();

    expect(isGeldigeTijdzone(zone)).toBe(true);
    // Bruikbaar betekent hier: de rest van deze module kan er echt mee rekenen,
    // niet alleen dat `Intl` de naam kent.
    expect(klokTijd('2026-08-24T12:00:00Z', zone)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('valt terug op een echte zone als het toestel niets bruikbaars zegt', () => {
    // ⚠️ Dit is het geval dat in de praktijk misging: `resolvedOptions().timeZone`
    //    is in de typing een `string`, maar oudere JavaScriptCore-versies geven
    //    er `undefined` terug. De aanroeper in `modules/buddies` gaf dat
    //    ongecontroleerd door aan `groups.tz`.
    const echt = Intl.DateTimeFormat;

    try {
      // @ts-expect-error — met opzet een kapotte Intl, zoals oudere WebKit hem gaf.
      Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: undefined }) });

      expect(apparaatTijdzone()).toBe('Europe/Amsterdam');
    } finally {
      Intl.DateTimeFormat = echt;
    }
  });

  it('valt terug als Intl helemaal omvalt', () => {
    const echt = Intl.DateTimeFormat;

    try {
      // @ts-expect-error — met opzet stuk.
      Intl.DateTimeFormat = () => {
        throw new Error('geen Intl op dit toestel');
      };

      expect(apparaatTijdzone()).toBe('Europe/Amsterdam');
    } finally {
      Intl.DateTimeFormat = echt;
    }
  });

  it('geeft nooit UTC als terugval', () => {
    // ⚠️ Een echte zone en geen UTC. Wie hier belandt is bijna zeker in
    //    Nederland, en een gebruiker die stilzwijgend op UTC staat ziet zijn week
    //    in de zomer twee uur te vroeg omslaan zonder dat er iets fout lijkt.
    const echt = Intl.DateTimeFormat;

    try {
      // @ts-expect-error — met opzet stuk.
      Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: '' }) });

      expect(apparaatTijdzone()).not.toBe('UTC');
    } finally {
      Intl.DateTimeFormat = echt;
    }
  });
});
