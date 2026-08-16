import { describe, expect, it } from 'vitest';

import {
  FLOOR_MARK,
  milestoneProgress,
  rangeState,
  streakLabel,
  type WeeklyGoalStatus,
} from './metrics';

const owner = { viewer: 'owner' } as const;
const group = { viewer: 'group' } as const;

describe('rangeState — wat de groep te zien krijgt', () => {
  // Dit is de belangrijkste test in dit bestand. Domeinregel 7 is niet "we
  // proberen aardig te zijn" maar de reden dat de app in groepen van drie
  // overleeft.
  const tegenslag: WeeklyGoalStatus[] = ['todo', 'missed', 'carried', 'excused'];

  it.each(tegenslag)('verbergt status %s volledig voor de groep', (status) => {
    const state = rangeState({ status, achieved: 'none', hasFloor: true, ...group });

    expect(state.hidden).toBe(true);
    expect(state.label).toBe('');
    expect(state.fill).toBe(0);
  });

  it('toont een goedgekeurde week wél aan de groep', () => {
    const state = rangeState({
      status: 'approved',
      achieved: 'ceiling',
      hasFloor: true,
      ...group,
    });

    expect(state.hidden).toBe(false);
    expect(state.tone).toBe('progress');
    expect(state.fill).toBe(1);
  });

  it('toont een week die op goedkeuring wacht aan de groep — daar moeten ze juist iets mee', () => {
    const state = rangeState({ status: 'pending', achieved: 'floor', hasFloor: true, ...group });

    expect(state.hidden).toBe(false);
    expect(state.awaitingApproval).toBe(true);
  });

  it('geeft nooit de rode rol terug, voor geen enkele status', () => {
    // Rood is in dit stelsel uitsluitend deadline-risico. Een gemiste week
    // rood maken is de schaamteprikkel die groepen opblaast.
    const alle: WeeklyGoalStatus[] = [
      'todo',
      'pending',
      'approved',
      'missed',
      'carried',
      'excused',
    ];

    for (const status of alle) {
      for (const viewer of ['owner', 'group'] as const) {
        const state = rangeState({ status, achieved: 'none', hasFloor: false, viewer });
        expect(['progress', 'pending', 'neutral']).toContain(state.tone);
      }
    }
  });
});

describe('rangeState — wat de eigenaar ziet', () => {
  it('noemt een gemiste week zakelijk, niet bestraffend', () => {
    const state = rangeState({ status: 'missed', achieved: 'none', hasFloor: true, ...owner });

    expect(state.hidden).toBe(false);
    expect(state.label).toBe('Niet afgerond');
    expect(state.tone).toBe('neutral');
  });

  it('vult tot de vloermarkering bij een gehaalde vloer', () => {
    const state = rangeState({ status: 'approved', achieved: 'floor', hasFloor: true, ...owner });

    expect(state.fill).toBe(FLOOR_MARK);
    expect(state.label).toBe('Vloer gehaald');
  });

  it('vult helemaal als er geen vloer is — dan zijn er maar twee uitkomsten', () => {
    const state = rangeState({ status: 'approved', achieved: 'floor', hasFloor: false, ...owner });

    expect(state.fill).toBe(1);
    expect(state.label).toBe('Gehaald');
  });

  it('zegt erbij dat er op een buddy gewacht wordt', () => {
    const state = rangeState({ status: 'pending', achieved: 'ceiling', hasFloor: true, ...owner });

    expect(state.label).toContain('wacht op je buddy');
    expect(state.awaitingApproval).toBe(true);
  });

  it('behandelt een adempauze als neutraal, niet als verlies', () => {
    const state = rangeState({ status: 'excused', achieved: 'none', hasFloor: true, ...owner });

    expect(state.label).toBe('Adempauze');
    expect(state.tone).toBe('neutral');
  });
});

describe('milestoneProgress', () => {
  it('rekent mijlpalen om naar een deel van 1', () => {
    expect(milestoneProgress(3, 12)).toBe(0.25);
  });

  it('geeft 0 als er nog geen mijlpalen zijn — niet NaN', () => {
    expect(milestoneProgress(0, 0)).toBe(0);
  });

  it('kan niet boven 1 of onder 0 uitkomen', () => {
    expect(milestoneProgress(15, 12)).toBe(1);
    expect(milestoneProgress(-3, 12)).toBe(0);
  });
});

describe('streakLabel', () => {
  it('telt in weken, niet in dagen', () => {
    expect(streakLabel(1)).toBe('1 week op rij');
    expect(streakLabel(7)).toBe('7 weken op rij');
  });

  it('maakt van nul geen "0 weken op rij"', () => {
    expect(streakLabel(0)).toBe('Nog geen reeks');
  });
});
