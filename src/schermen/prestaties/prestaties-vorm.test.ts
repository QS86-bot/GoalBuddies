import { describe, expect, it } from 'vitest';

import { BADGE_WAARDE } from '@/modules/goals/badge-zeldzaamheid';
import { BADGES } from '@/modules/goals/badges';
import { PICTOGRAM_BETEKENISSEN } from '@/shared/ui/pictogrammen';

import { BADGE_VORM, CATEGORIEEN, niveauVoortgang, prestatiesPerCategorie } from './prestaties-vorm';

const alles = (v: Parameters<typeof prestatiesPerCategorie>[0]) => prestatiesPerCategorie(v, BADGES, BADGE_WAARDE);

describe('prestatiesPerCategorie', () => {
  it('toont elke badge die de app kent, ook zonder één verdiende', () => {
    const alle = alles([]).flatMap((g) => g.prestaties);
    expect(alle.map((p) => p.badge).sort()).toEqual([...BADGES].sort());
    expect(alle.every((p) => p.behaaldOp === null)).toBe(true);
  });

  it('zet de datum bij de verdiende en laat de rest open', () => {
    const alle = alles([{ badge: 'streak_4', earned_at: '2026-11-01T10:00:00Z' }]).flatMap(
      (g) => g.prestaties,
    );
    expect(alle.find((p) => p.badge === 'streak_4')?.behaaldOp).toBe('2026-11-01T10:00:00Z');
    expect(alle.filter((p) => p.behaaldOp !== null)).toHaveLength(1);
  });

  it('draagt zeldzaamheid en XP van de ene bron', () => {
    const alle = alles([]).flatMap((g) => g.prestaties);
    expect(alle.find((p) => p.badge === 'streak_12')).toMatchObject({ zeldzaamheid: 'zeldzaam', xp: 50 });
    expect(alle.find((p) => p.badge === 'first_goal')).toMatchObject({ zeldzaamheid: 'gewoon', xp: 10 });
  });

  it('geeft elke categorie minstens één badge', () => {
    for (const g of alles([])) expect(g.prestaties.length, g.categorie).toBeGreaterThan(0);
    expect(alles([]).map((g) => g.categorie)).toEqual([...CATEGORIEEN]);
  });
});

describe('BADGE_VORM', () => {
  it('kent elke badge, en elk pictogram mag een prestatie dragen', () => {
    expect(Object.keys(BADGE_VORM).sort()).toEqual([...BADGES].sort());
    for (const badge of BADGES) {
      expect(PICTOGRAM_BETEKENISSEN[BADGE_VORM[badge].pictogram], badge).toContain('prestatie');
    }
  });
});

describe('niveauVoortgang', () => {
  it('loopt alleen omhoog binnen 0..1', () => {
    expect(niveauVoortgang(20, 20, 50)).toBe(0);
    expect(niveauVoortgang(35, 20, 50)).toBeCloseTo(0.5);
    expect(niveauVoortgang(49, 20, 50)).toBeGreaterThan(niveauVoortgang(35, 20, 50));
    expect(niveauVoortgang(999, 20, 50)).toBe(1);
    expect(niveauVoortgang(0, 20, 50)).toBe(0);
  });

  it('is vol op het hoogste niveau en bij een kapotte breedte', () => {
    expect(niveauVoortgang(2600, 2500, null)).toBe(1);
    expect(niveauVoortgang(5, 20, 20)).toBe(1);
  });

  it('begint onder het eerste niveau bij nul', () => {
    expect(niveauVoortgang(0, 0, 20)).toBe(0);
    expect(niveauVoortgang(10, 0, 20)).toBe(0.5);
  });
});
