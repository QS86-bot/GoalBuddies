import { describe, expect, it } from 'vitest';

import { oordeelSchema } from './approval-schemas';

/**
 * QS8-121. Dit bestand kón niet bestaan zolang het schema in `approvals.ts`
 * stond: dat importeert `lib/supabase` en trekt React Native mee.
 *
 * ⚠️ Peer-goedkeuring is volgens domeinregel 3 een autorisatiegrens. Wat hier
 *    níét doorheen mag is belangrijker dan wat er wel doorheen mag.
 */

describe('oordeelSchema — wat er wél mag', () => {
  it('accepteert een goedkeuring zonder toelichting', () => {
    expect(oordeelSchema.safeParse({ status: 'approved', comment: null }).success).toBe(true);
  });

  it('accepteert een verzoek om meer informatie met toelichting', () => {
    const uit = oordeelSchema.safeParse({ status: 'more_info', comment: 'Hoe ver ben je gekomen?' });

    expect(uit.success).toBe(true);
  });

  it('trimt de toelichting', () => {
    const uit = oordeelSchema.safeParse({ status: 'approved', comment: '  goed gedaan  ' });

    expect(uit.success && uit.data.comment).toBe('goed gedaan');
  });
});

/**
 * ⚠️ De positieve controles hierboven bewijzen niets zonder deze. Er bestaat
 *    géén 'rejected' en géén 'denied': een buddy kan bevestigen of om meer
 *    informatie vragen, en dat is alles. Afkeuren is een publiek faalsignaal en
 *    botst met domeinregel 7. De database dwingt dat af met
 *    `completion_approvals_status_valid`; dit is de kopie in de app.
 */
describe('oordeelSchema — wat er niet doorheen mag', () => {
  it.each(['rejected', 'denied', 'declined', 'failed', 'missed', ''])(
    'weigert status %s',
    (status) => {
      expect(oordeelSchema.safeParse({ status, comment: null }).success).toBe(false);
    },
  );

  it('weigert een toelichting boven de duizend tekens', () => {
    const uit = oordeelSchema.safeParse({ status: 'approved', comment: 'x'.repeat(1001) });

    expect(uit.success).toBe(false);
  });

  it('laat precies duizend tekens door', () => {
    expect(
      oordeelSchema.safeParse({ status: 'approved', comment: 'x'.repeat(1000) }).success,
    ).toBe(true);
  });

  it('weigert een ontbrekende toelichting in plaats van hem te raden', () => {
    expect(oordeelSchema.safeParse({ status: 'approved' }).success).toBe(false);
  });
});
