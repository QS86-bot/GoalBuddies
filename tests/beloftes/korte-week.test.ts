// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScherm, ruimAllesOp } from '../render/scherm';

/**
 * Een korte week wordt genoemd — QS8-799, punt 2 (besluit Quinten 23-11-2026).
 *
 * ⚠️ **De belofte:** loopt de lopende week van de gebruiker nog minder dan één dag,
 *    in zijn tijdzone en op zijn week-startdag, dan zegt de bevestigstap dat. Met
 *    precies een dag of meer over zegt hij niets. Getoetst met twee klokken die op
 *    hetzelfde moment een verschillend antwoord geven, vlak vóór en na de grens, en
 *    op een zomertijdwissel waar "de laatste kalenderdag" het verkeerde antwoord is.
 * ⚠️ Getoetst langs de keten: `userCycleEndsWithin()` (shared/time) →
 *    `isKorteWeek()` → `naarBevestigen()` → de tekst in `BelofteBevestigen`.
 *
 * IJKING — met de hand, 23-11-2026:
 *   A  `<` -> `<=` in `userCycleEndsWithin()` -> rood: 'precies 24 uur'
 *   B  `endsAt` vervangen door `startsAt + 7 dagen - 1 uur` in `userCycleEndsWithin()`
 *      -> rood: beide klokken, precies 24 uur en de zomertijdwissel
 *   C  `korteWeek: isKorteWeek(klok, nu)` -> `korteWeek: false` in `keuze.ts` -> rood: 'de naad'
 *   D  de regel met `belofte.bevestig_kort` uit `BelofteBevestigen` -> rood: 'de bevestigstap zegt het'
 */

vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('../../src/lib/supabase', () => ({ supabase: () => ({}) }));
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const { isKorteWeek, KORTE_WEEK_UREN } = await import('../../src/modules/commitments');
const { userCycleEndsWithin } = await import('../../src/shared/time');
const { naarBevestigen } = await import('../../src/schermen/belofte/keuze');
const { BelofteBevestigen } = await import('../../src/schermen/belofte/BelofteBevestigen');
const { t } = await import('../../src/shared/i18n');

/** Maandag, Amsterdam: de week van 16 t/m 22-11-2026 eindigt op 22-11 23:00 UTC. */
const MAANDAG = { weekStartDay: 1 as const, tz: 'Europe/Amsterdam' };
/** Zondag, New York: de week van 22 t/m 28-11-2026 eindigt op 29-11 05:00 UTC. */
const ZONDAG = { weekStartDay: 0 as const, tz: 'America/New_York' };

const op = (iso: string) => new Date(iso);
const seconde = (iso: string, delta: number) => new Date(new Date(iso).getTime() + delta * 1000);

describe('de grens van één dag, in de week en tijdzone van de gebruiker', () => {
  it('het is één dag', () => {
    expect(KORTE_WEEK_UREN).toBe(24);
  });

  it('maandag/Amsterdam: vlak vóór de grens niet kort, vlak erna wel', () => {
    const grens = '2026-11-21T23:00:00Z';
    expect(isKorteWeek(MAANDAG, seconde(grens, -1))).toBe(false);
    expect(isKorteWeek(MAANDAG, seconde(grens, 1))).toBe(true);
    expect(isKorteWeek(MAANDAG, op('2026-11-22T22:59:59Z'))).toBe(true);
  });

  it('zondag/New York: vlak vóór de grens niet kort, vlak erna wel', () => {
    const grens = '2026-11-28T05:00:00Z';
    expect(isKorteWeek(ZONDAG, seconde(grens, -1))).toBe(false);
    expect(isKorteWeek(ZONDAG, seconde(grens, 1))).toBe(true);
  });

  it('precies 24 uur over is niet kort', () => {
    expect(isKorteWeek(MAANDAG, op('2026-11-21T23:00:00Z'))).toBe(false);
    expect(isKorteWeek(ZONDAG, op('2026-11-28T05:00:00Z'))).toBe(false);
  });

  it('hetzelfde moment, twee week-starts, twee antwoorden', () => {
    const zondagavond = op('2026-11-22T20:00:00Z');
    expect(isKorteWeek(MAANDAG, zondagavond)).toBe(true);
    expect(isKorteWeek(ZONDAG, zondagavond)).toBe(false);
  });

  it('een nieuwe week is nooit kort: net na de start staan er zeven dagen', () => {
    expect(isKorteWeek(MAANDAG, op('2026-11-22T23:00:01Z'))).toBe(false);
    expect(isKorteWeek(ZONDAG, op('2026-11-29T05:00:01Z'))).toBe(false);
  });

  it('zomertijdwissel: om 00:30 op de laatste zondag is er nog 24,5 uur over', () => {
    // 25-10-2026 heeft in Amsterdam 25 uur. Middernacht CEST = 24-10 22:00 UTC; de
    // week eindigt op 26-10 00:00 CET = 25-10 23:00 UTC. "Laatste kalenderdag" zou hier kort zeggen.
    expect(isKorteWeek(MAANDAG, op('2026-10-24T22:30:00Z'))).toBe(false);
    expect(isKorteWeek(MAANDAG, op('2026-10-24T23:00:01Z'))).toBe(true);
  });

  it('isKorteWeek() is de helper uit shared/time met één dag, en rekent zelf niets', () => {
    for (const moment of ['2026-11-21T22:00:00Z', '2026-11-22T12:00:00Z', '2026-11-28T06:00:00Z']) {
      for (const klok of [MAANDAG, ZONDAG]) {
        expect(isKorteWeek(klok, op(moment))).toBe(userCycleEndsWithin(klok, op(moment), 24));
      }
    }
  });
});

const LIJSTEN = { groepen: [{ id: 'g1', naam: 'Koffieclub' }], getuigen: [] };
const KEUZE = { tekst: 'Ik trakteer op koffie', soort: 'groep' as const, groepId: 'g1', persoonId: null };

describe('de naad: naarBevestigen() legt het vast op het moment van de week', () => {
  it('zondagavond in Amsterdam: kort, met de week die bijna om is', () => {
    const stap = naarBevestigen(KEUZE, LIJSTEN, MAANDAG, op('2026-11-22T20:00:00Z'));
    expect(stap?.korteWeek).toBe(true);
    expect(stap?.periode.start).toBe('2026-11-16');
  });

  it('dezelfde zondagavond met zondag als week-start: niet kort, een nieuwe week', () => {
    const stap = naarBevestigen(KEUZE, LIJSTEN, ZONDAG, op('2026-11-22T20:00:00Z'));
    expect(stap?.korteWeek).toBe(false);
    expect(stap?.periode.start).toBe('2026-11-22');
  });
});

afterEach(() => ruimAllesOp());

describe('de bevestigstap zegt het', () => {
  const toon = (korteWeek: boolean) => {
    const stap = naarBevestigen(KEUZE, LIJSTEN, MAANDAG, op('2026-11-22T20:00:00Z'));
    if (stap === null) throw new Error('de keuze is af, dus er hoort een stap te zijn');
    return renderScherm(() =>
      createElement(BelofteBevestigen, {
        goalId: 'd1',
        stap: { ...stap, korteWeek },
        klok: MAANDAG,
        onTerug: () => {},
        onKlaar: () => {},
      }),
    );
  };

  it('bij een korte week staat de waarschuwing erin', async () => {
    const scherm = await toon(true);
    expect(scherm.tekst()).toContain(t('belofte.bevestig_kort'));
  });

  it('bij een gewone week niet', async () => {
    const scherm = await toon(false);
    expect(scherm.tekst()).not.toContain(t('belofte.bevestig_kort'));
  });
});
