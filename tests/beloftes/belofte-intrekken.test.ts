// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from '../render/scherm';

import { roeptAan, zonderCommentaar } from './roept-aan';

/**
 * Intrekken van een weekbelofte vraagt een tweede bevestiging — QS8-799, punt 1 en 3
 * (besluit Quinten 23-11-2026).
 *
 * ⚠️⚠️ **De belofte is "de eerste tik schrijft niets", en dat wordt gemeten aan de
 *    netwerkgrens**: de Supabase-client is hier de enige mock, en de test telt of er
 *    een `update` de deur uit ging. De echte `trekBelofteIn()` en de echte
 *    component draaien; alleen het netwerk is vervangen (regel 18 vraag 2).
 * ⚠️ En "Deze belofte" in plaats van "Dit commitment" wordt getoond langs dezelfde
 *    weg als in de app: nul rijen terug (de belofte werd `due` tussen renderen en
 *    tikken), de echte melding van `trekBelofteIn()`, op het scherm.
 *
 * IJKING — met de hand, 23-11-2026:
 *   A  `onPress={() => setVraagt(true)}` -> `onPress={() => void bevestig()}` in `Intrekken`
 *      -> rood: 'de eerste tik schrijft niets'
 *   B  `trekBelofteIn(belofteId)` -> `trekIn(belofteId)` in `BestaandeBelofte.tsx` (trekIn() is sinds QS8-814 weg)
 *      -> rood: 'zegt belofte' en grendel 1
 *   C  `<Body muted>{t('belofte.intrekken_getuige')}</Body>` weggehaald -> rood: 'noemt de gevolgen'
 *   D  de tak `if (fout?.beslist === true)` in `Intrekken` weggehaald -> rood: 'na "beslist"'
 *   E  `beslist: false` -> `beslist: true` bij de storing in `trekBelofteIn()` -> rood: 'bij een storing'
 *   F  " Vernieuw het scherm om te zien hoe." terug achter de nl-melding -> rood: 'de woorden van het besluit'
 *   G  `t('belofte.intrekken_uitslag')` -> `t('straf.terug')` in `Intrekken` -> rood: 'na "beslist"'
 */

vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const update = vi.fn();
const rijen = { waarde: [{ id: 'b1' }] as readonly { id: string }[], fout: null as null | { message: string } };
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      update: (waarden: unknown) => {
        update(waarden);
        return { eq: () => ({ select: async () => (rijen.fout ? { data: null, error: rijen.fout } : { data: rijen.waarde, error: null }) }) };
      },
    }),
  }),
}));
vi.mock('../../src/lib/observability', () => ({ reportError: () => undefined }));

const { BestaandeBelofte } = await import('../../src/schermen/belofte/BestaandeBelofte');
const { belofteperiode } = await import('../../src/modules/commitments');
const { t } = await import('../../src/shared/i18n');
const { nl } = await import('../../src/shared/i18n/nl');
const { en } = await import('../../src/shared/i18n/en');
const { now } = await import('../../src/shared/time');

const KLOK = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' };
const DEZE_WEEK = belofteperiode(KLOK, now()).start;
const BELOFTE = {
  id: 'b1',
  goal_id: 'd1',
  type: 'penalty',
  body: 'Ik trakteer op koffie',
  image_url: null,
  beneficiary_group_id: 'g1',
  beneficiary_user_id: null,
  status: 'set',
  confirmed_at: '2026-11-23T08:00:00Z',
  created_at: '2026-11-23T08:00:00Z',
  periode_start: DEZE_WEEK,
} as const;

const onKlaar = vi.fn();
const toon = () =>
  renderScherm(() =>
    createElement(BestaandeBelofte, {
      belofte: BELOFTE as unknown as Parameters<typeof BestaandeBelofte>[0]['belofte'],
      klok: KLOK,
      dezeWeek: DEZE_WEEK,
      onKlaar,
    }),
  );

beforeEach(() => {
  update.mockReset();
  onKlaar.mockReset();
  rijen.waarde = [{ id: 'b1' }];
  rijen.fout = null;
});
afterEach(() => ruimAllesOp());

describe('intrekken in twee stappen', () => {
  it('de eerste tik schrijft niets en vraagt het', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    expect(update).not.toHaveBeenCalled();
    expect(onKlaar).not.toHaveBeenCalled();
    expect(scherm.knoppen()).toContain(t('belofte.intrekken_ja'));
  });

  it('de vraag noemt de gevolgen: de belofte vervalt, en de getuige ziet niets', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    expect(scherm.tekst()).toContain(t('belofte.intrekken_kop'));
    expect(scherm.tekst()).toContain(t('belofte.intrekken_gevolg'));
    expect(scherm.tekst()).toContain(t('belofte.intrekken_getuige'));
  });

  it('"Nee" gaat terug en schrijft ook niets', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('belofte.intrekken_nee'));
    expect(update).not.toHaveBeenCalled();
    expect(scherm.knoppen()).toContain(t('straf.intrekken'));
    expect(scherm.knoppen()).not.toContain(t('belofte.intrekken_ja'));
  });

  it('pas de tweede bevestiging trekt in, precies één keer en alleen de stand', async () => {
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('belofte.intrekken_ja'));
    await scherm.wacht();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(onKlaar).toHaveBeenCalledTimes(1);
  });

  it('werd de belofte intussen beslist (due of gehouden), dan zegt de melding "belofte" en niet "commitment"', async () => {
    rijen.waarde = [];
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('belofte.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.tekst()).toContain(t('belofte.fout.al_afgegaan'));
    expect(scherm.tekst()).not.toMatch(/Dit commitment|in werking getreden/);
    expect(onKlaar).not.toHaveBeenCalled();
  });

  it('na "beslist" verdwijnt de intrekknop en komt er "Bekijk de uitslag", die het scherm herlaadt (besluit Quinten 23-11)', async () => {
    rijen.waarde = [];
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('belofte.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.knoppen()).toEqual([t('belofte.intrekken_uitslag')]);
    expect(scherm.tekst()).toContain(t('belofte.fout.al_afgegaan'));
    await scherm.klik(t('belofte.intrekken_uitslag'));
    expect(onKlaar).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('bij een storing blijft de intrekknop staan: opnieuw proberen heeft dan wel zin', async () => {
    rijen.fout = { message: 'netwerk' };
    const scherm = await toon();
    await scherm.klik(t('straf.intrekken'));
    await scherm.klik(t('belofte.intrekken_ja'));
    await scherm.wacht();
    expect(scherm.tekst()).toContain(t('commitment.fout.intrekken'));
    expect(scherm.knoppen()).toContain(t('belofte.intrekken_ja'));
    expect(scherm.knoppen()).not.toContain(t('belofte.intrekken_uitslag'));
  });
});

describe('het woord, in beide talen', () => {
  it('nl zegt "Deze belofte", en en "This promise"', () => {
    expect(nl['belofte.fout.al_afgegaan']).toMatch(/^Deze belofte /);
    expect(en['belofte.fout.al_afgegaan']).toMatch(/^This promise /);
  });

  it('de melding en de knop zijn de woorden van het besluit (Quinten, 23-11-2026, 05:35 UTC)', () => {
    expect(nl['belofte.fout.al_afgegaan']).toBe('Deze belofte kan niet meer worden ingetrokken: ze is intussen beslist.');
    expect(en['belofte.fout.al_afgegaan']).toBe(
      'This promise can no longer be withdrawn: it has been decided in the meantime.',
    );
    expect(nl['belofte.intrekken_uitslag']).toBe('Bekijk de uitslag');
    expect(en['belofte.intrekken_uitslag']).toBe('See the outcome');
  });

  it('er staat geen tweede knop "Terug" in de kaart: de vroegere sleutel bestaat niet meer', () => {
    expect(Object.keys(nl)).not.toContain('belofte.intrekken_terug');
    expect(Object.keys(en)).not.toContain('belofte.intrekken_terug');
  });

  // QS8-814 (besluit Quinten 23-11-2026): ook de doelstraf zegt nu "intussen beslist",
  // en de oude melding "Dit commitment is al in werking getreden" bestaat niet meer.
  it('de oude melding "in werking getreden" is weg, ook voor de doelstraf (QS8-814)', () => {
    expect(Object.values(nl).join('\n')).not.toMatch(/al in werking getreden en kan niet meer/);
    expect(nl['straf.fout.al_afgegaan']).toMatch(/^Deze straf /);
  });
});

const WORTEL = join(import.meta.dirname, '..', '..');
const SCHERM = 'src/schermen/belofte/BestaandeBelofte.tsx';

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return naam === 'node_modules' ? [] : bestanden(pad);
    return /\.(ts|tsx)$/.test(naam) && !/\.test\.tsx?$/.test(naam) ? [pad] : [];
  });
}

describe('de weg naar intrekken', () => {
  it('grendel 1: trekBelofteIn() wordt alleen in BestaandeBelofte aangeroepen', () => {
    const aanroepers = ['app', 'src']
      .flatMap((map) => bestanden(join(WORTEL, map)))
      .map((pad) => relative(WORTEL, pad).replaceAll('\\', '/'))
      .filter((pad) => pad !== 'src/modules/commitments/api.ts')
      .filter((pad) => roeptAan(readFileSync(join(WORTEL, pad), 'utf8'), 'trekBelofteIn'));
    expect(aanroepers).toEqual([SCHERM]);
  });

  it('grendel 2: het beloftescherm roept de kale trekIn() nergens aan', () => {
    for (const pad of bestanden(join(WORTEL, 'src', 'schermen', 'belofte'))) {
      expect(roeptAan(zonderCommentaar(readFileSync(pad, 'utf8')), 'trekIn'), relative(WORTEL, pad)).toBe(false);
    }
  });
});
