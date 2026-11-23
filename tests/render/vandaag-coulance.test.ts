// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { freezeNow, unfreezeNow } from '@/shared/time';

import './scherm';

/**
 * De naad van QS8-806: het profiel gaat met zijn `created_at` de klok in.
 *
 * ⚠️ **Waarom deze test er is naast die van `shared/time` en `modules/goals`.**
 *    Die twee bewijzen dat de functies het account kúnnen meenemen. Ze bleven
 *    groen als het Vandaag-scherm er een vaste datum of een lege string in
 *    stopte — en dan zag een account van vijf minuten oud de kaart "Je vorige
 *    week loopt nog even door" gewoon weer. Onwrikbare regel 18, vraag 1: de
 *    test hoort óp de naad, niet alleen aan weerszijden ervan.
 *
 * ⚠️ Twee week-starts, elk op zijn eigen rollover plus vier uur (domeinregel 1).
 *
 * IJKING — met de hand, 23-11-2026, over deze test, `src/shared/time/cycle.test.ts`
 * en `src/modules/goals/cycles.test.ts` samen (57 tests):
 *   A  `tijdVan()` geeft een vaste oude datum door i.p.v. `profiel.created_at`
 *      -> rood: alleen de twee 'nieuw account'-gevallen hieronder; shared/time en
 *      goals blijven groen. Dat is de naad.
 *   B  `existedBeforeCycle()` met `<=` -> rood: (a) de grens.
 *   C  `existedBeforeCycle()` vergelijkt de UTC-datum -> rood: (a) en (c) middernacht.
 *   D  `existedBeforeCycle()` geeft altijd `true` -> rood: 7, in alle drie de bestanden.
 *   E  `afsluitbareCyclus()` negeert `sinds` -> rood: 4, in goals en hier.
 */

vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
vi.mock('@/lib/supabase', () => ({ supabase: () => ({}) }));
vi.mock('@/lib/observability', () => ({ reportError: () => undefined }));

const { tijdVan } = await import('@/schermen/vandaag/tijd-vorm');

afterEach(() => unfreezeNow());

const gevallen = [
  // Maandag 23 november 2026, 05:00 in Amsterdam; de week begon om 00:00 lokaal.
  { naam: 'maandag', dag: 1, nu: '2026-11-23T04:00:00Z', vers: '2026-11-23T02:00:00Z', week: '2026-11-23', vorige: '2026-11-16' },
  // Zondag 22 november 2026, 05:00 in Amsterdam; de week begon om 00:00 lokaal.
  { naam: 'zondag', dag: 0, nu: '2026-11-22T04:00:00Z', vers: '2026-11-22T02:00:00Z', week: '2026-11-22', vorige: '2026-11-15' },
] as const;

const profiel = (dag: number, created_at: string) => ({ week_start_day: dag, tz: 'Europe/Amsterdam', created_at });

describe('Vandaag rekent met de aanmaakdatum van het account — QS8-806', () => {
  for (const g of gevallen) {
    it(`toont een nieuw account geen vorige week (startdag ${g.naam})`, () => {
      freezeNow(new Date(g.nu));
      const tijd = tijdVan(profiel(g.dag, g.vers));

      expect(tijd.coulance).toBe(false);
      expect(tijd.afTeSluitenStart).toBe(g.week);
      expect(tijd.afTeSluitenStart).toBe(tijd.cyclusStart);
    });

    it(`houdt de kaart voor een account van vóór de rollover (startdag ${g.naam})`, () => {
      freezeNow(new Date(g.nu));
      const tijd = tijdVan(profiel(g.dag, '2026-01-01T00:00:00Z'));

      expect(tijd.coulance).toBe(true);
      expect(tijd.afTeSluitenStart).toBe(g.vorige);
      expect(tijd.cyclusStart).toBe(g.week);
    });
  }

  it('geeft zonder profiel niets', () => {
    const tijd = tijdVan(null);
    expect(tijd.coulance).toBe(false);
    expect(tijd.afTeSluiten).toBeNull();
  });
});
