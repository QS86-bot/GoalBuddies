/**
 * Wat er daadwerkelijk de deur uit gaat — QS8-24, criterium "geen
 * persoonsgegevens in events".
 *
 * ⚠️ `scrub.test.ts` toetst de schoonmaakfuncties los. Dit bestand toetst de
 *    plek waar ze wórden aangeroepen, en dat is een ander soort test: het lek
 *    van 24-08 zat niet in `scrubMessage()` — die deed het goed — maar in
 *    `reportError()`, die de geschoonde melding nam en er de ruwe stack naast
 *    zette. Beide functies waren correct; de bedrading niet.
 *
 *    Dat is precies het patroon dat dit project al vaker heeft gehaald: elk
 *    onderdeel klopt en het geheel lekt. Daarom hoort er een test op de rand te
 *    staan en niet alleen op de onderdelen.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { reportError, setErrorSink, type ErrorEvent } from './index';

function vang(): { gebeurtenissen: ErrorEvent[] } {
  const gebeurtenissen: ErrorEvent[] = [];
  setErrorSink({ capture: (e) => gebeurtenissen.push(e) });
  return { gebeurtenissen };
}

afterEach(() => {
  setErrorSink(undefined);
});

describe('reportError', () => {
  it('stuurt niets naar buiten wat de gebruiker heeft ingetypt', () => {
    const { gebeurtenissen } = vang();

    reportError(
      new Error(
        "duplicate key value violates unique constraint: Key (invite_code)=('zomer-2026') " +
          'already exists — meld het aan sanne@voorbeeld.nl',
      ),
      'buddies.create',
      { doeltitel: 'Elke week naar de sportschool', groupId: 'niet-een-uuid' },
    );

    const alles = JSON.stringify(gebeurtenissen);

    // De drie soorten die er echt toe doen: een geciteerde databasewaarde, een
    // e-mailadres, en een tekst die de gebruiker zelf heeft geschreven.
    expect(alles).not.toContain('zomer-2026');
    expect(alles).not.toContain('sanne@voorbeeld.nl');
    expect(alles).not.toContain('sportschool');

    // En wat er wél in hoort te staan, want zonder dat is een rapport nutteloos.
    expect(gebeurtenissen[0]?.where).toBe('buddies.create');
    expect(gebeurtenissen[0]?.name).toBe('Error');
  });

  it('laat een uuid staan, want die zegt niets zonder de database', () => {
    const { gebeurtenissen } = vang();
    const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

    reportError(new Error('mislukt'), 'goals.load', { goalId: id });

    expect(gebeurtenissen[0]?.context['goalId']).toBe(id);
  });

  it('gooit zelf nooit, ook niet als de sink stukgaat', () => {
    // Een kapotte foutrapportage mag geen tweede fout veroorzaken bovenop de
    // eerste. Zonder deze garantie verliest de gebruiker zijn handeling door de
    // melding erover.
    setErrorSink({
      capture: () => {
        throw new Error('sink is stuk');
      },
    });

    expect(() => reportError(new Error('x'), 'ergens')).not.toThrow();
  });
});
