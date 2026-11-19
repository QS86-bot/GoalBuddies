import { describe, expect, it } from 'vitest';

import { BERICHT_MAX } from '../../modules/buddies/chat-schemas';
import { zetTaal } from '../i18n';

import { ADEMPAUZE_BERICHT_MAX, adempauzeBerichtVoorstel } from './adempauze-bericht';

describe('adempauzeBerichtVoorstel', () => {
  /**
   * ⚠️ De belangrijkste test van dit bestand, naar het voorbeeld van
   *    `hulpvraag.test.ts`: het voorstel mag de aankondiging niet oprekken tot een
   *    verslag. Gelezen in beide talen, want de gebruiker kiest er één.
   */
  it('noemt geen doel, datum, gemiste week, reeks of punten, in nl en en', () => {
    for (const taal of ['nl', 'en'] as const) {
      zetTaal(taal);
      const tekst = adempauzeBerichtVoorstel().toLowerCase();

      expect(tekst.length, taal).toBeGreaterThan(10);
      for (const verboden of [
        'gemist', 'reeks', 'streak', 'punt', 'point', 'missed', 'doel', 'goal', 'achterstand', 'behind',
      ]) {
        expect(tekst, `${taal}: ${verboden}`).not.toContain(verboden);
      }
      expect(tekst, taal).not.toMatch(/\d/);
      expect(tekst, taal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    zetTaal('nl');
  });

  it('past ruim binnen de berichtlengte, en de grens is gelijk aan die van de chat', () => {
    expect(adempauzeBerichtVoorstel().length).toBeLessThan(200);
    expect(ADEMPAUZE_BERICHT_MAX).toBe(BERICHT_MAX);
  });
});
