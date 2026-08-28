import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BADGES, badgeLabels, badgeUitleg, kentBadge } from './badges';

/**
 * Badges — QS8-78 (PRD 8.4), migratie 0113.
 *
 * ⚠️ De eerste test leest de **migratie** en niet de app. Dezelfde naad als bij
 *    `SYSTEEM_GEBEURTENISSEN` en `GOEDKEURINGSREGELS`: een lijst in TypeScript
 *    naast een CHECK in SQL. Migratie 0032/0034 heeft laten zien wat er gebeurt
 *    als je alleen de ene kant toetst — de CHECK kreeg er een waarde bij, de app
 *    bleef staan, en er werd niets rood.
 */

const MIGRATIE = fileURLToPath(
  new URL('../../../supabase/migrations/0113_badges_die_nooit_verdwijnen.sql', import.meta.url),
);

/** De waarden uit `badges_bekend`. */
export function badgesUitDeCheck(sql: string): readonly string[] {
  const blok = /constraint badges_bekend check \(badge in \(([\s\S]*?)\)\)/.exec(sql);
  const binnenkant = blok?.[1];
  if (binnenkant === undefined) return [];

  return [...binnenkant.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

describe('badgesUitDeCheck', () => {
  it('leest de waarden, ook over meerdere regels', () => {
    const sql = `constraint badges_bekend check (badge in (
      'first_goal',
      'streak_4'
    ))`;
    expect(badgesUitDeCheck(sql)).toEqual(['first_goal', 'streak_4']);
  });

  it('laat een ándere constraint met rust', () => {
    expect(badgesUitDeCheck("check (badge_soort in ('a','b'))")).toEqual([]);
  });

  it('geeft niets terug als de constraint er niet is', () => {
    expect(badgesUitDeCheck('create table badges ();')).toEqual([]);
  });
});

describe('de app en de database kennen dezelfde badges', () => {
  it('heeft precies de waarden die de CHECK toestaat', () => {
    // ⚠️ Wordt deze rood, voeg dan niet blind een naam toe. Een badge zonder zin
    //    is een leeg vakje op het scherm; elke badge heeft een label én een
    //    uitleg nodig — zie de twee tests hieronder.
    const sql = readFileSync(MIGRATIE, 'utf8');
    expect([...BADGES].sort()).toEqual([...badgesUitDeCheck(sql)].sort());
  });
});

describe('kentBadge', () => {
  it('herkent elke badge uit de lijst', () => {
    for (const badge of BADGES) expect(kentBadge(badge), badge).toBe(true);
  });

  /**
   * ⚠️ Een server die vooruitloopt op een geïnstalleerde app is een normale
   *    toestand. Zo'n badge valt weg in plaats van als leeg vakje op het scherm
   *    te belanden.
   */
  it('kent een badge die deze app nog niet heeft niet', () => {
    expect(kentBadge('streak_52')).toBe(false);
    expect(kentBadge('')).toBe(false);
  });
});

describe('elke badge heeft een naam en een uitleg', () => {
  it('laat er geen leeg', () => {
    for (const badge of BADGES) {
      expect(badgeLabels()[badge].length, badge).toBeGreaterThan(0);
      expect(badgeUitleg()[badge].length, badge).toBeGreaterThan(0);
    }
  });

  it('geeft elke badge een eigen naam en een eigen uitleg', () => {
    // Twee badges met dezelfde zin is een copy-paste, en dan staat er op het
    // scherm twee keer hetzelfde zonder dat iemand ziet waarom.
    expect(new Set(BADGES.map((b) => badgeLabels()[b])).size).toBe(BADGES.length);
    expect(new Set(BADGES.map((b) => badgeUitleg()[b])).size).toBe(BADGES.length);
  });

  /**
   * ⚠️ **De uitleg staat in de verleden tijd**, en dat is geen stijlkwestie. Een
   *    badge die je al hebt, is geen opdracht meer — "rond een doel af" leest als
   *    een taak die nog openstaat. Deze test grijpt naar de vorm en niet naar een
   *    letterlijke zin: elke uitleg begint met "Je ".
   */
  it('spreekt de gebruiker aan over wat hij gedaan heeft', () => {
    for (const badge of BADGES) {
      expect(badgeUitleg()[badge].startsWith('Je '), badge).toBe(true);
    }
  });
});
