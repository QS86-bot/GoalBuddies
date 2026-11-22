import { describe, expect, it } from 'vitest';

import type { Commitment } from '../../src/modules/commitments/api';
import { COMMITMENT_KOLOMMEN } from '../../src/modules/commitments/kolommen';

/**
 * De kolomlijst van `commitments` volgt het type dat de client belooft — QS8-760.
 *
 * ⚠️ Het `Record` hieronder compileert alleen als het precies de sleutels van
 *    {@link Commitment} noemt, en de lijst moet er precies mee overeenkomen: een
 *    vergeten kolom zou anders `undefined` op runtime zijn onder een type dat
 *    iets anders zegt.
 *
 * Ijking: `periode_start` uit de lijst gehaald maakt de toets rood; een sleutel
 * uit het `Record` gehaald maakt de typecheck rood.
 */
const SLEUTELS: Record<keyof Commitment, true> = {
  id: true,
  goal_id: true,
  type: true,
  body: true,
  image_url: true,
  beneficiary_group_id: true,
  beneficiary_user_id: true,
  status: true,
  confirmed_at: true,
  created_at: true,
  periode_start: true,
};

describe('de kolomlijst van commitments', () => {
  it('noemt precies de velden van het type Commitment', () => {
    const lijst = COMMITMENT_KOLOMMEN.split(',').map((k) => k.trim()).sort();
    expect(lijst).toEqual(Object.keys(SLEUTELS).sort());
  });

  it('vraagt tz en periode_einde niet op', () => {
    const lijst = COMMITMENT_KOLOMMEN.split(',').map((k) => k.trim());
    expect(lijst).not.toContain('tz');
    expect(lijst).not.toContain('periode_einde');
  });
});
