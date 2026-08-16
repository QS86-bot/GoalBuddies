import { describe, expect, it } from 'vitest';

import { initialen } from './naming';

/**
 * De terugval op initialen is een acceptatiecriterium van QS8-27, en komt uit de
 * Habit Huddle-analyse: een ontbrekende avatar mag nooit een leeg vlak worden.
 * De functie is los getest omdat juist de rare namen het gevaar zijn.
 */
describe('initialen', () => {
  it('neemt de eerste en de laatste bij meerdere woorden', () => {
    expect(initialen('Quinten Strijdonk')).toBe('QS');
    expect(initialen('Anne van der Meer')).toBe('AM');
  });

  it('neemt één letter bij één woord', () => {
    expect(initialen('Quinten')).toBe('Q');
  });

  it('slikt rommel zonder leeg te worden', () => {
    expect(initialen('   ')).toBe('?');
    expect(initialen('')).toBe('?');
    expect(initialen('  quinten  ')).toBe('Q');
  });

  it('werkt met accenten en niet-Latijnse letters', () => {
    expect(initialen('Émile Zola')).toBe('ÉZ');
    expect(initialen('Ольга Иванова')).toBe('ОИ');
  });

  it('kapt een emoji niet doormidden', () => {
    // Een naam met een emoji erin bestaat echt. `charAt(0)` zou hier de helft
    // van een surrogaatpaar teruggeven en een kapot teken tonen.
    expect(initialen('🎯 Doelen')).toBe('🎯D');
  });
});
