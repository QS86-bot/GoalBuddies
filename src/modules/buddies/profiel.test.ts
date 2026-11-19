import { describe, expect, it } from 'vitest';

import { PROFIEL_RPC_KOLOMMEN } from './profiel-kolommen';
import {
  isEigenTab,
  leesDoelen,
  leesGroepen,
  leesProfiel,
  profielTabs,
  PROFIEL_TABS_ANDER,
} from './profiel-lezen';

describe('de tabs van een profiel', () => {
  it('geeft een ander alleen voltooiingen en groepen', () => {
    expect(profielTabs(false)).toEqual(['voltooiingen', 'groepen']);
  });

  it('laat statistieken en prestaties voor een ander niet bestaan', () => {
    const tabs: readonly string[] = profielTabs(false);
    expect(tabs).not.toContain('statistieken');
    expect(tabs).not.toContain('prestaties');
  });

  it('geeft jezelf dezelfde twee en de twee eigen tabs erbij', () => {
    expect(profielTabs(true)).toEqual([...PROFIEL_TABS_ANDER, 'statistieken', 'prestaties']);
    expect(profielTabs(true).filter(isEigenTab)).toEqual(['statistieken', 'prestaties']);
  });
});

describe('de parsers', () => {
  it('nemen alleen de beloofde velden over', () => {
    const rij = {
      id: 'u1',
      display_name: 'Anna',
      avatar_url: null,
      ben_ik: false,
      current_streak: 0,
      best_streak: 9,
    };
    const profiel = leesProfiel([rij]);
    expect(profiel).toEqual({ userId: 'u1', naam: 'Anna', avatarUrl: null, benIk: false });
    expect(Object.keys(profiel ?? {})).not.toContain('best_streak');
  });

  it('geven null bij nul of meer dan één rij', () => {
    expect(leesProfiel([])).toBeNull();
    expect(leesProfiel(null)).toBeNull();
  });

  it('slaan een doel over dat niet de beloofde vorm heeft, en kleven klaar vast aan totaal', () => {
    const goed = {
      goal_id: 'g',
      titel: 'T',
      categorie: 'fitness',
      voltooid: false,
      mijlpalen_totaal: '2',
      mijlpalen_klaar: 5,
    };
    const doelen = leesDoelen([goed, { ...goed, titel: 3 }, 'x']);
    expect(doelen).toHaveLength(1);
    expect(doelen[0]?.mijlpalenKlaar).toBe(2);
    expect(Object.keys(doelen[0] ?? {})).not.toContain('target_date');
  });

  it('lezen groepen', () => {
    expect(leesGroepen([{ group_id: 'a', naam: 'N', icoon: null }])).toEqual([
      { groupId: 'a', naam: 'N', icoon: null },
    ]);
    expect(leesGroepen('kapot')).toEqual([]);
  });

  it('delen de kolomlijst met de database-test', () => {
    expect(PROFIEL_RPC_KOLOMMEN.doelen).not.toContain('target_date');
    expect(PROFIEL_RPC_KOLOMMEN.doelen).not.toContain('status');
  });
});
