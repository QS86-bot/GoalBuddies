import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  groepPatchSchema,
  leesSeizoenscadans,
  SEIZOENSCADANSEN,
  seizoenscadansLabels,
} from './schemas';

/**
 * Seizoenen per groep — QS8-79 (PRD 8.5).
 *
 * ⚠️ De eerste test leest de **migratie** en niet de app. Dezelfde reden als bij
 *    `goedkeuringsregels.test.ts`: een lijst in TypeScript naast een CHECK in SQL
 *    is een naad, en 0032/0034 heeft laten zien wat er gebeurt als je alleen de
 *    ene kant toetst.
 *
 * ⚠️ `season_cadence` staat sinds migratie **0001** in het schema, met zijn CHECK.
 *    Deze test leest die dus uit `0001_schema.sql` en niet uit 0112 — 0112 raakt
 *    de kolom niet aan.
 */

const SCHEMA = fileURLToPath(new URL('../../../supabase/migrations/0001_schema.sql', import.meta.url));

/** De waarden uit `groups_season_cadence_valid`. */
export function cadansenUitDeCheck(sql: string): readonly string[] {
  const blok = /constraint groups_season_cadence_valid\s*\n?\s*check \(season_cadence in \(([^)]*)\)\)/.exec(
    sql,
  );
  const binnenkant = blok?.[1];
  if (binnenkant === undefined) return [];

  return [...binnenkant.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? '');
}

describe('cadansenUitDeCheck', () => {
  it('leest de waarden uit de CHECK', () => {
    const sql = "constraint groups_season_cadence_valid check (season_cadence in ('monthly', 'quarterly')),";
    expect(cadansenUitDeCheck(sql)).toEqual(['monthly', 'quarterly']);
  });

  it('laat een ándere constraint met rust', () => {
    expect(cadansenUitDeCheck("check (approval_rule in ('any', 'majority'))")).toEqual([]);
  });

  it('geeft niets terug als de constraint er niet is', () => {
    expect(cadansenUitDeCheck('create table groups ();')).toEqual([]);
  });
});

describe('de app en de database kennen dezelfde cadansen', () => {
  it('heeft precies de waarden die de CHECK toestaat', () => {
    const sql = readFileSync(SCHEMA, 'utf8');
    expect([...SEIZOENSCADANSEN].sort()).toEqual([...cadansenUitDeCheck(sql)].sort());
  });
});

describe('leesSeizoenscadans', () => {
  it('herkent beide cadansen', () => {
    expect(leesSeizoenscadans('monthly')).toBe('monthly');
    expect(leesSeizoenscadans('quarterly')).toBe('quarterly');
  });

  /**
   * ⚠️ Onbekend is `quarterly`, de kolomstandaard uit 0001. Een onbekende waarde
   *    als `monthly` lezen laat het scherm een kortere cadans tonen dan de
   *    database aanhoudt, en dan wacht de groep op een recap die niet komt.
   */
  it('leest een onbekende waarde als de standaard uit de database', () => {
    expect(leesSeizoenscadans(null)).toBe('quarterly');
    expect(leesSeizoenscadans(undefined)).toBe('quarterly');
    expect(leesSeizoenscadans('weekly')).toBe('quarterly');
    expect(leesSeizoenscadans(3)).toBe('quarterly');
  });
});

describe('elke cadans heeft een eigen label', () => {
  it('laat er geen leeg en geen dubbel', () => {
    const labels = SEIZOENSCADANSEN.map((c) => seizoenscadansLabels()[c]);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(SEIZOENSCADANSEN.length);
  });
});

describe('groepPatchSchema neemt de cadans aan', () => {
  it('accepteert beide waarden', () => {
    for (const cadans of SEIZOENSCADANSEN) {
      expect(groepPatchSchema.safeParse({ season_cadence: cadans }).success, cadans).toBe(true);
    }
  });

  it('weigert een cadans die de database niet kent', () => {
    expect(groepPatchSchema.safeParse({ season_cadence: 'weekly' }).success).toBe(false);
  });
});
