import { describe, expect, it } from 'vitest';

import {
  beschrijf,
  gebeurtenisId,
  maakVerzending,
  meldEdgeFout,
  ontleedDsn,
  type Verzending,
} from './edge-rapport';

/**
 * QS8-24 criterium 4 — de Edge Functions melden hun fouten.
 *
 * ⚠️ **De zwaarste test hier is `gaat er niets persoonlijks over de lijn`**, en
 *    dat is geen stijlkeuze. `scrub.test.ts` toetst `scrubMessage()` los, en die
 *    was groen op de dag dat `reportError()` de rúwe stack ernaast zette — de
 *    eerste regel van een stack ís de melding, dus alles ging er alsnog uit.
 *    Dat geval staat in CLAUDE.md bij regel 18. De les: toets wat de sink
 *    daadwerkelijk krijgt, niet wat een onderdeel belooft.
 *
 * ⚠️ **Wat deze tests níét bewijzen:** dat Sentry de envelope accepteert. Ze
 *    toetsen de vorm regel voor regel, en dat is iets anders dan een 200 van de
 *    ingest — een test kan alleen bevestigen wat de schrijver al dacht.
 *
 *    Dat gat is op 26-08-2026 gesloten, maar níét hier: `npm run sentry:proef`
 *    stuurde een echte envelope en kreeg HTTP 200 (event `4dff8230…`). Deze
 *    tests bewaken de vorm tussen die runs door; het proefscript bewaakt of er
 *    daadwerkelijk iets aankomt. Haal ze niet door elkaar.
 */

const DSN = 'https://abc123def456@o4507.ingest.sentry.io/6789';
const NU = new Date('2026-08-25T16:30:00.000Z');
const ID = '0f9a1b2c-3d4e-5f60-8a9b-0c1d2e3f4a5b';

/**
 * Vangt op wat er verstuurd zou worden, in plaats van het te versturen.
 *
 * ⚠️ Geeft standaard 200 terug. Sinds 26-08 kijkt `meldEdgeFout()` naar de
 *    HTTP-status, dus een vervoer dat niets teruggeeft is geen geldig vervoer
 *    meer — en dat is precies de bedoeling.
 */
function vanger(status = 200): {
  opgevangen: Verzending[];
  vervoer: (v: Verzending) => Promise<number>;
} {
  const opgevangen: Verzending[] = [];
  return {
    opgevangen,
    vervoer: (v) => {
      opgevangen.push(v);
      return Promise.resolve(status);
    },
  };
}

describe('ontleedDsn', () => {
  it('haalt sleutel, host en project-id uit een gewone DSN', () => {
    expect(ontleedDsn(DSN)).toEqual({
      sleutel: 'abc123def456',
      host: 'o4507.ingest.sentry.io',
      projectId: '6789',
    });
  });

  /**
   * ⚠️ `null` en niet gooien. Een onbruikbare DSN is een configuratiefout en mag
   *    nooit de functie omvertrekken die hij juist moest bewaken.
   */
  it.each([
    ['leeg', ''],
    ['undefined', undefined],
    ['geen url', 'dit-is-geen-url'],
    ['zonder sleutel', 'https://o4507.ingest.sentry.io/6789'],
    ['zonder project-id', 'https://abc123@o4507.ingest.sentry.io/'],
    ['verkeerd protocol', 'ftp://abc123@o4507.ingest.sentry.io/6789'],
  ])('geeft null bij %s', (_naam, waarde) => {
    expect(ontleedDsn(waarde)).toBeNull();
  });
});

describe('gebeurtenisId', () => {
  it('maakt er 32 hex-tekens van zonder streepjes', () => {
    const id = gebeurtenisId(ID);
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('maakVerzending', () => {
  const dsn = { sleutel: 'sleutel', host: 'host.example', projectId: '42' };

  it('richt zich op het envelope-eindpunt van het project', () => {
    const v = maakVerzending(
      dsn,
      { id: 'a'.repeat(32), waar: 'rollover', runtime: 'deno', server: 'edge', naam: 'Error', melding: 'stuk', context: {} },
      NU,
    );

    expect(v.url).toBe('https://host.example/api/42/envelope/');
    expect(v.headers['Content-Type']).toBe('application/x-sentry-envelope');
    expect(v.headers['X-Sentry-Auth']).toContain('sentry_key=sleutel');
    expect(v.headers['X-Sentry-Auth']).toContain('sentry_version=7');
  });

  it('bouwt drie regels: kop, itemkop en de gebeurtenis', () => {
    const v = maakVerzending(
      dsn,
      { id: 'b'.repeat(32), waar: 'doelcoach', runtime: 'deno', server: 'edge', naam: 'TypeError', melding: 'db is niet gedefinieerd', context: { code: '42501' } },
      NU,
    );

    const regels = v.body.split('\n');
    expect(regels).toHaveLength(3);

    expect(JSON.parse(regels[0] ?? '')).toEqual({
      event_id: 'b'.repeat(32),
      sent_at: '2026-08-25T16:30:00.000Z',
    });

    const itemkop = JSON.parse(regels[1] ?? '') as { type: string; length: number };
    expect(itemkop.type).toBe('event');
    // ⚠️ De lengte moet in octetten kloppen en niet in tekens; een melding met
    //    een accent zou er anders naast zitten.
    expect(itemkop.length).toBe(new TextEncoder().encode(regels[2] ?? '').length);

    const gebeurtenis = JSON.parse(regels[2] ?? '') as {
      exception: { values: { type: string; value: string }[] };
      tags: Record<string, string>;
    };
    expect(gebeurtenis.exception.values[0]).toEqual({
      type: 'TypeError',
      value: 'db is niet gedefinieerd',
    });
    expect(gebeurtenis.tags).toEqual({ waar: 'doelcoach', runtime: 'deno' });
  });

  /**
   * ⚠️ **Weglaten en niet verzinnen.** Zonder `SENTRY_ENVIRONMENT` hoort er geen
   *    `environment` in de gebeurtenis te staan — ook niet `'production'`. Een
   *    verzonnen waarde maakt een fout uit een proefdeploy niet te onderscheiden
   *    van een echte, precies op het moment dat je erop vertrouwt.
   */
  it('zet de omgeving erin als hij bekend is', () => {
    const v = maakVerzending(
      dsn,
      {
        id: 'd'.repeat(32),
        waar: 'rollover',
        runtime: 'deno',
        server: 'edge',
        naam: 'Error',
        melding: 'stuk',
        context: {},
        omgeving: 'staging',
      },
      NU,
    );

    const gebeurtenis = JSON.parse(v.body.split('\n')[2] ?? '') as { environment?: string };
    expect(gebeurtenis.environment).toBe('staging');
  });

  it('laat het veld weg als de omgeving onbekend is', () => {
    const v = maakVerzending(
      dsn,
      { id: 'e'.repeat(32), waar: 'rollover', runtime: 'deno', server: 'edge', naam: 'Error', melding: 'stuk', context: {} },
      NU,
    );

    const gebeurtenis = JSON.parse(v.body.split('\n')[2] ?? '') as Record<string, unknown>;
    expect('environment' in gebeurtenis).toBe(false);
  });

  it('telt de lengte in octetten en niet in tekens', () => {
    const v = maakVerzending(
      dsn,
      { id: 'c'.repeat(32), waar: 'x', runtime: 'deno', server: 'edge', naam: 'Error', melding: 'één café — 😀', context: {} },
      NU,
    );

    const regels = v.body.split('\n');
    const itemkop = JSON.parse(regels[1] ?? '') as { length: number };
    const payload = regels[2] ?? '';

    expect(itemkop.length).toBe(new TextEncoder().encode(payload).length);
    expect(itemkop.length).toBeGreaterThan(payload.length);
  });
});

describe('meldEdgeFout — de naad', () => {
  it('doet niets zonder DSN, en raakt het vervoer niet aan', async () => {
    const { opgevangen, vervoer } = vanger();

    const uitkomst = await meldEdgeFout(new Error('stuk'), 'rollover', {
      dsn: undefined,
      nu: NU,
      id: ID,
      vervoer,
    });

    expect(uitkomst).toBe('geen-dsn');
    expect(opgevangen).toEqual([]);
  });

  it('verstuurt niets bij een onbruikbare DSN', async () => {
    const { opgevangen, vervoer } = vanger();

    const uitkomst = await meldEdgeFout(new Error('stuk'), 'rollover', {
      dsn: 'kapot',
      nu: NU,
      id: ID,
      vervoer,
    });

    expect(uitkomst).toBe('onbruikbare-dsn');
    expect(opgevangen).toEqual([]);
  });

  /**
   * ⚠️ **Dit is de test waar het om gaat.** Niet "scrubMessage werkt" maar "er
   *    gaat geen gebruikerstekst de deur uit". De fout hieronder draagt een
   *    e-mailadres in de melding, een token, een geciteerde Postgres-waarde, én
   *    dezelfde melding nog een keer in de eerste regel van de stack — precies
   *    de route waarlangs het op 24-08 alsnog lekte.
   */
  it('laat niets persoonlijks over de lijn gaan', async () => {
    const { opgevangen, vervoer } = vanger();

    const fout = new Error(
      'insert failed for quinten@voorbeeld.nl met token eyJhbGciOi.JIUzI1NiJ9.abc en waarde \'Mijn gemiste week\'',
    );
    fout.stack = `${fout.name}: ${fout.message}\n    at doeIets (file:///src/index.ts:12:3)`;

    const uitkomst = await meldEdgeFout(fout, 'notificaties', {
      dsn: DSN,
      nu: NU,
      id: ID,
      extra: {
        code: '23514',
        // Niet op de allowlist: moet weg, ook al staat er iets onschuldigs in.
        notitie: 'Ik heb deze week niets gedaan',
        email: 'quinten@voorbeeld.nl',
      },
      vervoer,
    });

    expect(uitkomst).toBe('verstuurd');
    expect(opgevangen).toHaveLength(1);

    const lijn = opgevangen[0]?.body ?? '';

    // Het bewijs: geen van deze fragmenten staat in wat er verstuurd wordt.
    expect(lijn).not.toContain('quinten@voorbeeld.nl');
    expect(lijn).not.toContain('voorbeeld.nl');
    expect(lijn).not.toContain('eyJhbGciOi');
    expect(lijn).not.toContain('Mijn gemiste week');
    expect(lijn).not.toContain('Ik heb deze week niets gedaan');

    // En wat er wél in hoort te staan, staat erin.
    expect(lijn).toContain('23514');
    expect(lijn).toContain('notificaties');
  });

  it('scheert de stack net zo goed als de melding', async () => {
    const { opgevangen, vervoer } = vanger();

    const fout = new Error('mislukt voor iemand@voorbeeld.nl');
    // De eerste regel van een stack ís de melding — dat was het lek van 24-08.
    fout.stack = 'Error: mislukt voor iemand@voorbeeld.nl\n    at x (file:///a.ts:1:1)';

    await meldEdgeFout(fout, 'rollover', { dsn: DSN, nu: NU, id: ID, vervoer });

    const lijn = opgevangen[0]?.body ?? '';
    expect(lijn).not.toContain('iemand@voorbeeld.nl');
    // De stack gaat wél mee, alleen geschoond.
    expect(lijn).toContain('file:///a.ts');
  });

  /**
   * ⚠️ **Dit is het gat dat de tests niet konden zien tot er een echte DSN was.**
   *    `fetch()` verwerpt alleen bij een netwerkfout; een 400 of 403 van de
   *    ingest is een geslaagde belofte. Deze laag zei daardoor `'verstuurd'`
   *    terwijl er niets aankwam — en dat is precies het "stilletjes niet
   *    werken" dat de kop van het bestand erger noemt dan geen DSN.
   *
   *    Gevonden op 26-08-2026 door de envelope met de echte sleutel naar de
   *    echte ingest te sturen. De proxy van de bouwomgeving gaf 403 en de code
   *    meldde tevreden dat het gelukt was.
   */
  it.each([
    ['400 — de envelope deugt niet', 400],
    ['401 — verkeerde sleutel', 401],
    ['403 — geblokkeerd onderweg', 403],
    ['429 — over de limiet', 429],
    ['500 — de ingest is stuk', 500],
  ])('meldt %s als geweigerd en niet als verstuurd', async (_naam, status) => {
    const { opgevangen, vervoer } = vanger(status);

    const uitkomst = await meldEdgeFout(new Error('stuk'), 'rollover', {
      dsn: DSN,
      nu: NU,
      id: ID,
      vervoer,
    });

    expect(uitkomst).toBe('geweigerd');
    // Het is wél de deur uit gegaan; hij kwam alleen niet aan.
    expect(opgevangen).toHaveLength(1);
  });

  it.each([
    ['200', 200],
    ['202 — wat de ingest in de praktijk geeft', 202],
    ['204', 204],
  ])('rekent %s als verstuurd', async (_naam, status) => {
    const { vervoer } = vanger(status);

    const uitkomst = await meldEdgeFout(new Error('stuk'), 'rollover', {
      dsn: DSN,
      nu: NU,
      id: ID,
      vervoer,
    });

    expect(uitkomst).toBe('verstuurd');
  });

  it('gooit niet als het vervoer omvalt', async () => {
    const uitkomst = await meldEdgeFout(new Error('stuk'), 'rollover', {
      dsn: DSN,
      nu: NU,
      id: ID,
      vervoer: () => Promise.reject(new Error('netwerk weg')),
    });

    expect(uitkomst).toBe('mislukt');
  });

  it('verwerkt ook iets dat geen Error is', async () => {
    const { opgevangen, vervoer } = vanger();

    await meldEdgeFout('zomaar een string met piet@voorbeeld.nl', 'doelcoach', {
      dsn: DSN,
      nu: NU,
      id: ID,
      vervoer,
    });

    const lijn = opgevangen[0]?.body ?? '';
    expect(lijn).toContain('NonError');
    expect(lijn).not.toContain('piet@voorbeeld.nl');
  });
});

describe('beschrijf', () => {
  it('houdt alleen contextsleutels van de allowlist over', () => {
    const uit = beschrijf(new Error('x'), { code: '42501', notitie: 'geheim' });

    expect(uit.context['code']).toBe('42501');
    expect(uit.context['notitie']).not.toBe('geheim');
  });
});
