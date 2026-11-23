import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zetTaal } from '../../shared/i18n';

/**
 * Wat een buitenstaander leest als `join_group_with_code()` `invalid` zegt — QS8-813.
 *
 * ⚠️ **De server geeft `invalid` óók bij een werkende teamcode**, aan iemand die
 *    geen actief lid van die organisatie is (0317, QS8-653 criterium 8). Dat is
 *    met opzet: een eigen reden zou bevestigen dat de code bij een team hoort.
 *    De tekst ervoor mag dus niet zeggen dat de link niet meer werkt — dat is
 *    voor die lezer onwaar — en hij mag ook geen team noemen. Besluit Quinten
 *    23-11-2026, optie A: één neutrale tekst voor iedereen.
 *
 * ⚠️ **De belofte is een eigenschap van de keten, niet van de catalogus.** Deze
 *    test loopt daarom van het RPC-antwoord via `neemDeel()` naar de echte
 *    catalogus in beide talen, en grijpt niet naar het bestand waar de zin
 *    vandaag staat (regel 18, vraag 4).
 *
 * IJking met de hand (23-11-2026), per grendel:
 *   - de oude zin in `nl.ts` en `en.ts` teruggezet → alle drie rood;
 *   - `invalid` in `meldingen()` naar `groep.deelnemen_mislukt` → de twee
 *     letterlijke toetsen rood (de derde blijft groen: die tekst noemt geen
 *     van de verboden woorden, en dat is precies wat hij toetst).
 */

const rpc = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ rpc }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

const { neemDeel } = await import('./api');

async function meldingBijOngeldig(): Promise<string> {
  rpc.mockResolvedValue({ data: { ok: false, reason: 'invalid' }, error: null });
  const uit = await neemDeel('TEAMC2DE3456');
  if (uit.ok) throw new Error('verwacht een mislukking');
  return uit.melding;
}

describe('invalid bij toetreden: één neutrale tekst (QS8-813)', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  afterEach(() => {
    zetTaal('nl');
  });

  it('nl: de besloten zin, letterlijk', async () => {
    zetTaal('nl');
    expect(await meldingBijOngeldig()).toBe(
      'Met deze link kun je nu niet meedoen. Hoort hij bij je werk, word dan eerst lid ' +
        'van je organisatie met de code van je werkgever.',
    );
  });

  it('en: dezelfde zin in het Engels', async () => {
    zetTaal('en');
    expect(await meldingBijOngeldig()).toBe(
      'You cannot join with this link right now. If it is from your work, first join ' +
        "your organisation with your employer's code.",
    );
  });

  it('zegt in geen van beide talen dat de link niet meer werkt, en noemt geen team', async () => {
    for (const taal of ['nl', 'en'] as const) {
      zetTaal(taal);
      const tekst = (await meldingBijOngeldig()).toLowerCase();
      for (const verboden of ['werkt niet meer', 'ingetrokken', 'no longer works', 'withdrawn', 'team']) {
        expect(tekst, `${taal}: ${verboden}`).not.toContain(verboden);
      }
    }
  });
});
