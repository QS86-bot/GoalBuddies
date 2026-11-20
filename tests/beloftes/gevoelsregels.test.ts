import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GEVOELENS as GEVOELENS_DOELEN } from '../../src/modules/goals/vragenlijst-schemas';
import {
  GEVOELENS,
  gevoelRegel,
  nudgeBericht,
  type Taalcode,
} from '../../src/modules/notifications/regels';
import { TEGENVALLER_WOORDEN } from '../../src/shared/ui/tips';

import { zonderCommentaar } from './roept-aan';

/**
 * De herinneringszin per gevoel — QS8-733.
 *
 * ⚠️ **Elke variant apart, niet één lus met één verdict.** Besluit van Quinten: "een test
 *    controleert elke variant op woorden die falen suggereren" (regel 7). Een lus die bij
 *    de eerste faalt, laat de rest ongezien; hier is elk gevoel in elke taal een eigen
 *    geval, en de naam van het geval zegt welke zin het is.
 *
 * ⚠️ **De belofte is dat een eigen omschrijving nooit in een melding komt.** Dat is
 *    structureel: `nudgeBericht()` krijgt een gevoels-*sleutel*, en de Edge Function leest
 *    `feeling` maar nergens `feeling_own`. De tweede helft toetst dat op de bron, omdat de
 *    Deno-kant buiten `tsc` valt en een type daar dus geen grendel is.
 */

const TALEN: readonly Taalcode[] = ['nl', 'en'];
const EXTRA_VERWIJT = ['niet gedaan', 'nog niets', 'nog steeds', 'weer niet', 'not yet', 'still no'];

describe('de zes gevoelens', () => {
  it('zijn dezelfde lijst in de doelenmodule en de notificatiemodule', () => {
    expect([...GEVOELENS_DOELEN]).toEqual([...GEVOELENS]);
  });

  it.each(GEVOELENS.flatMap((g) => TALEN.map((taal) => [g, taal] as const)))(
    '%s (%s) heeft een zin zonder woorden die falen suggereren',
    (gevoel, taal) => {
      const zin = gevoelRegel(gevoel, taal);

      expect(zin, `geen zin voor ${gevoel}/${taal}`).not.toBeNull();
      const klein = (zin ?? '').toLowerCase();
      for (const woord of [...TEGENVALLER_WOORDEN, ...EXTRA_VERWIJT]) {
        expect(klein.includes(woord), `"${zin}" bevat "${woord}"`).toBe(false);
      }
    },
  );

  it.each(GEVOELENS.flatMap((g) => TALEN.map((taal) => [g, taal] as const)))(
    '%s (%s) noemt geen emoji, getal of naam',
    (gevoel, taal) => {
      const zin = gevoelRegel(gevoel, taal) ?? '';

      expect(/\p{Extended_Pictographic}/u.test(zin), zin).toBe(false);
      expect(/\d/.test(zin), zin).toBe(false);
    },
  );

  it('geven elk een andere zin, per taal', () => {
    for (const taal of TALEN) {
      const zinnen = GEVOELENS.map((g) => gevoelRegel(g, taal));
      expect(new Set(zinnen).size).toBe(GEVOELENS.length);
    }
  });

  it('geven niets bij geen gevoel, en niets bij een onbekende sleutel', () => {
    expect(gevoelRegel(null, 'nl')).toBeNull();
    expect(gevoelRegel(undefined, 'nl')).toBeNull();
    // ⚠️ Ook een eigen omschrijving is hier "onbekend": ze kan de nudge niet in.
    expect(gevoelRegel('stap voor stap', 'nl')).toBeNull();
  });
});

describe('nudgeBericht met een gevoel', () => {
  it('houdt de toon van de gebruiker en voegt de zin eraan toe', () => {
    for (const toon of ['gentle', 'firm'] as const) {
      const zonder = nudgeBericht(toon, 'nl');
      const met = nudgeBericht(toon, 'nl', 'calm');

      expect(met.titel).toBe(zonder.titel);
      expect(met.body.startsWith(zonder.body)).toBe(true);
      expect(met.body).toContain(gevoelRegel('calm', 'nl'));
    }
  });

  it('is zonder gevoel gelijk aan wat er al was', () => {
    expect(nudgeBericht('gentle', 'en', null).body).toBe(nudgeBericht('gentle', 'en').body);
  });
});

describe('de Edge Function', () => {
  function bronnen(map: string): string[] {
    return readdirSync(map, { withFileTypes: true }).flatMap((e) => {
      const pad = join(map, e.name);
      if (e.isDirectory()) return bronnen(pad);
      return /\.(ts|tsx)$/.test(e.name) ? [pad] : [];
    });
  }

  it('leest nergens feeling_own', () => {
    const treffers = bronnen('supabase/functions').filter((pad) =>
      readFileSync(pad, 'utf8').includes('feeling_own'),
    );

    expect(treffers, 'een eigen omschrijving kan zo in een melding terechtkomen').toEqual([]);
  });

  it('leest wel feeling, en geeft hem door aan nudgeBericht', () => {
    const bron = zonderCommentaar(readFileSync('supabase/functions/notificaties/index.ts', 'utf8'));

    expect(bron).toMatch(/reminder_tone, feeling,/);
    expect(bron).toMatch(/nudgeBericht\(toon, taalVan\(profiel\), profiel\.feeling\)/);
  });
});
