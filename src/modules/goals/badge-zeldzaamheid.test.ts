import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BADGE_WAARDE } from './badge-zeldzaamheid';
import { BADGES } from './badges';

/**
 * Zeldzaamheid en XP per badge — QS8-735.
 *
 * ⚠️ Leest de **migratie** en niet de app: een bedrag in TypeScript naast een
 *    bedrag in SQL is dezelfde naad als bij `badges_bekend`.
 */

const MAP = fileURLToPath(new URL('../../../supabase/migrations/', import.meta.url));

/** De bedragen uit `xp_bedrag_badge()`. */
export function bedragenUitSql(sql: string): Readonly<Record<string, number>> {
  const blok = /function public\.xp_bedrag_badge[\s\S]*?case p_badge([\s\S]*?)end;/.exec(sql);
  const uit: Record<string, number> = {};
  for (const m of (blok?.[1] ?? '').matchAll(/when '([^']+)'\s+then\s+(\d+)/g)) {
    uit[m[1] ?? ''] = Number(m[2]);
  }
  return uit;
}

describe('bedragenUitSql', () => {
  it('leest de bedragen en laat een andere functie met rust', () => {
    const sql = `create or replace function public.xp_bedrag_badge(p_badge text) returns integer as $$
      select case p_badge when 'a' then 10 when 'b' then 25 end;
    $$;`;
    expect(bedragenUitSql(sql)).toEqual({ a: 10, b: 25 });
    expect(bedragenUitSql(`create function public.x() as $$ select case y when 'a' then 1 end; $$;`)).toEqual({});
  });
});

describe('BADGE_WAARDE', () => {
  const bestand = readdirSync(MAP).find((f) => f.startsWith('0304'));
  const sql = bestand ? readFileSync(MAP + bestand, 'utf8') : '';

  it('kent elke badge, en alleen die', () => {
    expect(Object.keys(BADGE_WAARDE).sort()).toEqual([...BADGES].sort());
  });

  it('draagt de indeling van Quinten', () => {
    expect(BADGE_WAARDE.first_goal.zeldzaamheid).toBe('gewoon');
    expect(BADGE_WAARDE.first_milestone.zeldzaamheid).toBe('gewoon');
    expect(BADGE_WAARDE.first_review.zeldzaamheid).toBe('gewoon');
    expect(BADGE_WAARDE.streak_4.zeldzaamheid).toBe('ongewoon');
    expect(BADGE_WAARDE.streak_12.zeldzaamheid).toBe('zeldzaam');
  });

  it('draagt dezelfde XP als xp_bedrag_badge() in migratie 0304', () => {
    expect(sql).not.toBe('');
    const uitSql = bedragenUitSql(sql);
    for (const badge of BADGES) expect(BADGE_WAARDE[badge].xp, badge).toBe(uitSql[badge]);
    expect(Object.keys(uitSql).sort()).toEqual([...BADGES].sort());
  });
});
