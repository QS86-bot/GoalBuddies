import { describe, expect, it } from 'vitest';

import { belofteuitslag } from './weekbelofte';

/**
 * De uitslag van een besliste belofte — QS8-815.
 *
 * ⚠️ De drie wegen naar `cancelled` (0057/0220/0313) staan hier als spoorregel
 *    zoals de database hem schrijft: de rollover zonder actor, `rond_doel_af()`
 *    met de eigenaar en `doelstatus: 'completed'`, intrekken met de eigenaar en
 *    het doel nog actief.
 */

const IK = '00000000-0000-0000-0000-00000000000a';
const ANDER = '00000000-0000-0000-0000-00000000000b';

const regel = (actor: string | null, doelstatus: string | null = 'active') => ({
  actor_id: actor,
  payload: { type: 'penalty', van: 'set', naar: 'cancelled', doelstatus },
});

describe('belofteuitslag()', () => {
  it('in werking: `due`, ongeacht het spoor', () => {
    expect(belofteuitslag({ status: 'due' }, undefined, IK)).toBe('in_werking');
  });

  it('gehouden: `cancelled` door de rollover, zonder actor (0313)', () => {
    expect(belofteuitslag({ status: 'cancelled' }, regel(null), IK)).toBe('gehouden');
  });

  it('gehouden: `cancelled` doordat de eigenaar zijn doel binnen de week afrondde (doelstatus completed)', () => {
    expect(belofteuitslag({ status: 'cancelled' }, regel(IK, 'completed'), IK)).toBe('gehouden');
  });

  it('ingetrokken: `cancelled` door de eigenaar, doel nog actief', () => {
    expect(belofteuitslag({ status: 'cancelled' }, regel(IK), IK)).toBe('ingetrokken');
  });

  it('bij twijfel niets: geen spoorregel, een vreemde actor, of een payload zonder doelstatus van een ander', () => {
    expect(belofteuitslag({ status: 'cancelled' }, undefined, IK)).toBeNull();
    expect(belofteuitslag({ status: 'cancelled' }, regel(ANDER), IK)).toBeNull();
    expect(belofteuitslag({ status: 'cancelled' }, { actor_id: ANDER, payload: null }, IK)).toBeNull();
    expect(belofteuitslag({ status: 'cancelled' }, { actor_id: ANDER, payload: ['completed'] }, IK)).toBeNull();
  });

  it('geen regel voor `set` en `resolved`', () => {
    expect(belofteuitslag({ status: 'set' }, regel(null), IK)).toBeNull();
    expect(belofteuitslag({ status: 'resolved' }, regel(null), IK)).toBeNull();
  });
});
