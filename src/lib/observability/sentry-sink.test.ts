import { afterEach, describe, expect, it } from 'vitest';

import { koppelGlobaleFouten, type Luisteraar } from './globale-fouten';
import { reportError, setErrorSink } from './index';
import { maakSentrySink } from './sentry-sink';
import type { Verzending } from './edge-rapport';

/**
 * QS8-24 criterium 1 — de app meldt zijn fouten.
 *
 * ⚠️ **De zwaarste test hier is `laat niets persoonlijks over de lijn gaan`, en
 *    hij gaat bewust door `reportError()` heen.** De sink zelf schoont niet — dat
 *    doet `reportError()` — dus een test die alleen de sink voedt, bewijst niets
 *    over wat er daadwerkelijk verstuurd wordt. Dat is precies het onderscheid
 *    dat dit project op 24-08 gemist heeft: `scrubMessage()` stond groen terwijl
 *    het geheel lekte.
 *
 * ⚠️ **En dit is wat er tot 26-08-2026 ontbrak:** `setErrorSink()` werd door niets
 *    in de productiecode aangeroepen. Alle 34 aanroepen van `reportError()`
 *    eindigden in `console.error`. De onderste test hier bewaakt de naad die dat
 *    dichtzet.
 */

const DSN = 'https://abc123def456@o4507.ingest.sentry.io/6789';
const NU = new Date('2026-08-26T20:00:00.000Z');
const ID = '0f9a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b';

function vanger(): { verstuurd: Verzending[]; vervoer: (v: Verzending) => void } {
  const verstuurd: Verzending[] = [];
  return { verstuurd, vervoer: (v) => verstuurd.push(v) };
}

function sinkMetVanger(): { verstuurd: Verzending[]; zet: () => void } {
  const { verstuurd, vervoer } = vanger();
  const sink = maakSentrySink({ dsn: DSN, runtime: 'web', nu: () => NU, id: () => ID, vervoer });
  return {
    verstuurd,
    zet: () => {
      if (sink === undefined) throw new Error('sink hoort te bestaan bij een geldige DSN');
      setErrorSink(sink);
    },
  };
}

afterEach(() => {
  setErrorSink(undefined);
});

describe('maakSentrySink — wanneer er wél en niet een sink komt', () => {
  /**
   * ⚠️ `undefined` en geen sink-die-niets-doet. Zonder sink valt `reportError()`
   *    terug op `console.error`, en dat wil je in ontwikkeling zien. Een stille
   *    sink laat de melding verdwijnen zónder dat er iets aankomt.
   */
  it.each([
    ['geen DSN', undefined],
    ['lege DSN', ''],
    ['onbruikbare DSN', 'dit-is-geen-url'],
    ['DSN zonder sleutel', 'https://o4507.ingest.sentry.io/6789'],
  ])('geeft undefined bij %s', (_naam, dsn) => {
    expect(maakSentrySink({ dsn, runtime: 'web' })).toBeUndefined();
  });

  it('geeft een sink bij een bruikbare DSN', () => {
    expect(maakSentrySink({ dsn: DSN, runtime: 'web' })).toBeDefined();
  });
});

describe('de envelope die de app bouwt', () => {
  it('meldt zich als app en niet als edge', () => {
    const { verstuurd, zet } = sinkMetVanger();
    zet();

    reportError(new Error('stuk'), 'goals.create');

    const gebeurtenis = JSON.parse((verstuurd[0]?.body ?? '').split('\n')[2] ?? '') as {
      server_name: string;
      tags: Record<string, string>;
      logger: string;
    };

    expect(gebeurtenis.server_name).toBe('app');
    expect(gebeurtenis.tags['runtime']).toBe('web');
    expect(gebeurtenis.tags['waar']).toBe('goals.create');
    expect(gebeurtenis.logger).toBe('goals.create');
  });

  /**
   * ⚠️ Tot 26-08 stond `runtime` hard op `'deno'` in `maakVerzending()`, want er
   *    was één aanroeper. Een standaardwaarde zou nu betekenen dat een fout uit
   *    de browser zich als Edge Function voordoet, en dat merk je pas als je in
   *    Sentry naar de verkeerde logs zit te kijken.
   */
  it('draagt het platform waarop hij draait', () => {
    for (const platform of ['web', 'ios', 'android']) {
      const { verstuurd, vervoer } = vanger();
      const sink = maakSentrySink({
        dsn: DSN,
        runtime: platform,
        nu: () => NU,
        id: () => ID,
        vervoer,
      });
      sink?.capture({ where: 'x', name: 'Error', message: 'y', context: {} });

      const gebeurtenis = JSON.parse((verstuurd[0]?.body ?? '').split('\n')[2] ?? '') as {
        tags: Record<string, string>;
      };
      expect(gebeurtenis.tags['runtime']).toBe(platform);
    }
  });

  /** Weglaten en niet verzinnen — een verzonnen versie koppelt source maps fout. */
  it('laat de release weg als hij onbekend is', () => {
    const { verstuurd, vervoer } = vanger();
    const sink = maakSentrySink({ dsn: DSN, runtime: 'web', nu: () => NU, id: () => ID, vervoer });
    sink?.capture({ where: 'x', name: 'Error', message: 'y', context: {} });

    const gebeurtenis = JSON.parse((verstuurd[0]?.body ?? '').split('\n')[2] ?? '') as Record<
      string,
      unknown
    >;
    expect('release' in gebeurtenis).toBe(false);
  });

  it('zet de release erin als hij bekend is', () => {
    const { verstuurd, vervoer } = vanger();
    const sink = maakSentrySink({
      dsn: DSN,
      runtime: 'web',
      release: 'goalbuddies@0.1.0',
      nu: () => NU,
      id: () => ID,
      vervoer,
    });
    sink?.capture({ where: 'x', name: 'Error', message: 'y', context: {} });

    const gebeurtenis = JSON.parse((verstuurd[0]?.body ?? '').split('\n')[2] ?? '') as {
      release?: string;
    };
    expect(gebeurtenis.release).toBe('goalbuddies@0.1.0');
  });
});

describe('de naad: van reportError tot aan de lijn', () => {
  /**
   * ⚠️ **Dit is de test waar het om gaat**, en hij gaat met opzet door
   *    `reportError()` heen in plaats van rechtstreeks de sink te voeden. De
   *    sink schoont namelijk níét — dat doet `reportError()` — dus alleen deze
   *    route bewijst wat er daadwerkelijk verstuurd wordt.
   */
  it('laat niets persoonlijks over de lijn gaan', () => {
    const { verstuurd, zet } = sinkMetVanger();
    zet();

    const fout = new Error(
      "opslaan mislukt voor quinten@voorbeeld.nl met token eyJhbGciOi.JIUzI1NiJ9.abc en waarde 'Mijn gemiste week'",
    );
    fout.stack = `${fout.name}: ${fout.message}\n    at slaOp (app/doel.tsx:12:3)`;

    reportError(fout, 'goals.save', {
      code: '23514',
      notitie: 'Ik heb deze week niets gedaan',
      email: 'quinten@voorbeeld.nl',
    });

    const lijn = verstuurd[0]?.body ?? '';

    expect(lijn).not.toContain('quinten@voorbeeld.nl');
    expect(lijn).not.toContain('voorbeeld.nl');
    expect(lijn).not.toContain('eyJhbGciOi');
    expect(lijn).not.toContain('Mijn gemiste week');
    expect(lijn).not.toContain('Ik heb deze week niets gedaan');

    // En wat er wél in hoort te staan.
    expect(lijn).toContain('23514');
    expect(lijn).toContain('goals.save');
    expect(lijn).toContain('app/doel.tsx');
  });

  it('gooit niet als het vervoer omvalt', () => {
    const sink = maakSentrySink({
      dsn: DSN,
      runtime: 'web',
      nu: () => NU,
      id: () => ID,
      vervoer: () => {
        throw new Error('netwerk weg');
      },
    });
    if (sink === undefined) throw new Error('sink hoort te bestaan');
    setErrorSink(sink);

    expect(() => reportError(new Error('stuk'), 'x')).not.toThrow();
  });
});

describe('koppelGlobaleFouten', () => {
  /** Een nep-`window` dat opschrijft wat er geregistreerd wordt. */
  function nepVenster(): {
    doel: Luisteraar;
    vuur: (soort: string, gebeurtenis: unknown) => void;
    aantalHandlers: () => number;
  } {
    const handlers = new Map<string, ((g: unknown) => void)[]>();

    return {
      doel: {
        addEventListener: (soort, handler) => {
          handlers.set(soort, [...(handlers.get(soort) ?? []), handler]);
        },
        removeEventListener: (soort, handler) => {
          handlers.set(soort, (handlers.get(soort) ?? []).filter((h) => h !== handler));
        },
      },
      vuur: (soort, gebeurtenis) => {
        for (const handler of handlers.get(soort) ?? []) handler(gebeurtenis);
      },
      aantalHandlers: () => [...handlers.values()].reduce((som, lijst) => som + lijst.length, 0),
    };
  }

  /**
   * ⚠️ De twee soorten dragen de fout op een andere plek: `error` in `.error`,
   *    `unhandledrejection` in `.reason`. Precies dat verschil is de reden dat
   *    `foutUit()` bestaat, en de reden dat dit getoetst wordt.
   */
  it('haalt de fout uit een onafgevangen fout', () => {
    const { doel, vuur } = nepVenster();
    const gemeld: { fout: unknown; waar: string }[] = [];

    koppelGlobaleFouten(doel, (fout, waar) => gemeld.push({ fout, waar }));
    const echt = new Error('viel om');
    vuur('error', { error: echt });

    expect(gemeld).toEqual([{ fout: echt, waar: 'globaal.fout' }]);
  });

  it('haalt de fout uit een afgewezen belofte', () => {
    const { doel, vuur } = nepVenster();
    const gemeld: { fout: unknown; waar: string }[] = [];

    koppelGlobaleFouten(doel, (fout, waar) => gemeld.push({ fout, waar }));
    const echt = new Error('afgewezen');
    vuur('unhandledrejection', { reason: echt });

    expect(gemeld).toEqual([{ fout: echt, waar: 'globaal.belofte' }]);
  });

  /** Een onverwachte vorm mag niet verdwijnen; hij gaat als zichzelf mee. */
  it('meldt de gebeurtenis zelf als er geen fout in zit', () => {
    const { doel, vuur } = nepVenster();
    const gemeld: unknown[] = [];

    koppelGlobaleFouten(doel, (fout) => gemeld.push(fout));
    vuur('error', { iets: 'anders' });

    expect(gemeld).toEqual([{ iets: 'anders' }]);
  });

  it('maakt zich weer los', () => {
    const { doel, vuur, aantalHandlers } = nepVenster();
    const gemeld: unknown[] = [];

    const losmaken = koppelGlobaleFouten(doel, (fout) => gemeld.push(fout));
    expect(aantalHandlers()).toBe(2);

    losmaken();
    expect(aantalHandlers()).toBe(0);

    vuur('error', { error: new Error('na het losmaken') });
    expect(gemeld).toEqual([]);
  });

  /**
   * ⚠️ De hele keten in één test: een onafgevangen fout met vuil erin, via de
   *    globale afvang en `reportError()`, tot aan de bytes. Als deze groen is en
   *    de losse delen ook, dan is er geen naad meer waar het uit kan lekken.
   */
  it('levert een onafgevangen fout geschoond af bij de sink', () => {
    const { verstuurd, zet } = sinkMetVanger();
    zet();

    const { doel, vuur } = nepVenster();
    koppelGlobaleFouten(doel, (fout, waar) => reportError(fout, waar));

    vuur('unhandledrejection', { reason: new Error('mislukt voor iemand@voorbeeld.nl') });

    const lijn = verstuurd[0]?.body ?? '';
    expect(lijn).toContain('globaal.belofte');
    expect(lijn).not.toContain('iemand@voorbeeld.nl');
  });
});
