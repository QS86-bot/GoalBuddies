import { describe, expect, it } from 'vitest';

import { apparaatTijdzone, isGeldigeTijdzone, klokTijd, localDateIn, utcFromZoned } from './zoned';

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

/**
 * `utcFromZoned` in het gat van de voorjaarsovergang — en náást het gat.
 *
 * ⚠️ **De rij van 15-08 zei: "zolang cycli op middernacht beginnen speelt dit
 *    alleen in tijdzones die om middernacht wisselen", en noemde dat
 *    onbereikbaar.** Nagemeten op 28-08-2026 over alle 418 IANA-zones en elke
 *    dag van 2024 t/m 2027: die zones bestaan. Vijf stuks, één dag per jaar —
 *    Cairo, Beirut, Havana, Santiago en de Azoren.
 *
 * ⚠️ **En bij drie ervan viel de grens een kalenderdag terug**, terwijl het
 *    commentaar bij de functie beloofde dat we op het eerstvolgende bestaande
 *    moment landen. Dat is het middernachtprobleem uit domeinregel 2: een reeks
 *    die op de verkeerde dag breekt.
 *
 * ⚠️ **De tweede helft van deze suite is de belangrijkste, en die is er pas na
 *    een fout van mijzelf.** De eerste reparatie nam simpelweg de latere van de
 *    twee kandidaten. Dat dichtte de drie gaten en verzette 71 ándere dagen een
 *    uur: bij een hérfstovergang bestaat middernacht wél — twee keer — en daar
 *    hoort de eerste. Auckland, Sydney, Melbourne, Jeruzalem en Chisinau zaten
 *    daarbij. Zonder de tests hieronder was dat pas opgevallen bij een gebruiker.
 */
describe('utcFromZoned rond een klokverzetting', () => {
  /** De lokale wandklok op `at`, als `JJJJ-MM-DD UU`. */
  function lokaal(tz: string, at: Date): string {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
      })
        .formatToParts(at)
        .map((x) => [x.type, x.value]),
    );
    return `${p.year}-${p.month}-${p.day} ${String(Number(p.hour) % 24).padStart(2, '0')}`;
  }

  describe('een middernacht die niet bestaat', () => {
    // ⚠️ Alle vijf de zones die dit wereldwijd hebben, met het jaar erbij: de
    //    datum verschuift per jaar, dus een test met "de laatste zondag van
    //    maart" zou hier een eigen berekening introduceren — precies wat
    //    correctheidsregel 7 verbiedt. Vandaar vaste, nagemeten datums.
    const GATEN: [string, number, number, number][] = [
      ['America/Havana', 2026, 3, 8],
      ['America/Santiago', 2026, 9, 6],
      ['Atlantic/Azores', 2026, 3, 29],
      ['Africa/Cairo', 2026, 4, 24],
      ['Asia/Beirut', 2026, 3, 29],
    ];

    it.each(GATEN)('%s houdt de gevraagde kalenderdag op %s-%s-%s', (tz, jaar, maand, dag) => {
      // ⚠️ **Dit is de belofte, en niet "het wordt 01:00".** Welk uur het wordt
      //    hangt af van hoe groot de sprong is; dát de dag klopt, is wat een
      //    cyclusgrens nodig heeft.
      const at = utcFromZoned(tz as never, jaar, maand, dag);
      const verwacht = `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')}`;

      expect(localDateIn(tz as never, at)).toBe(verwacht);
    });

    it('landt ná de sprong en niet ervóór', () => {
      // Havana springt van 00:00 naar 01:00; het eerste bestaande moment is 01:00.
      expect(lokaal('America/Havana', utcFromZoned('America/Havana' as never, 2026, 3, 8))).toBe(
        '2026-03-08 01',
      );
    });
  });

  describe('een middernacht die twee keer bestaat', () => {
    // ⚠️ **De tegenhanger, en de reden dat de eerste reparatie fout was.** Bij
    //    een herfstovergang bestaat middernacht wél; de gevraagde wandklok komt
    //    er gewoon uit, en dan mag er niets verschuiven.
    const HERFST: [string, number, number, number][] = [
      ['Pacific/Auckland', 2026, 4, 5],
      ['Australia/Sydney', 2026, 4, 5],
      ['Asia/Jerusalem', 2026, 10, 25],
      ['Europe/Chisinau', 2026, 10, 25],
    ];

    it.each(HERFST)('%s blijft op middernacht staan op %s-%s-%s', (tz, jaar, maand, dag) => {
      const at = utcFromZoned(tz as never, jaar, maand, dag);

      expect(lokaal(tz, at)).toBe(
        `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')} 00`,
      );
    });
  });

  describe('een gewone dag', () => {
    it('blijft precies op de gevraagde wandklok', () => {
      const at = utcFromZoned('Europe/Amsterdam' as never, 2026, 6, 15, 9, 30, 0);
      expect(lokaal('Europe/Amsterdam', at)).toBe('2026-06-15 09');
      expect(localDateIn('Europe/Amsterdam' as never, at)).toBe('2026-06-15');
    });

    it('geeft in UTC hetzelfde terug als erin gaat', () => {
      expect(utcFromZoned('UTC' as never, 2026, 6, 15, 12, 0, 0).toISOString()).toBe(
        '2026-06-15T12:00:00.000Z',
      );
    });
  });
});
