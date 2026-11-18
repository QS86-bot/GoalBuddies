import { afterEach, describe, expect, it, vi } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';
import { en } from '../../shared/i18n/en';
import { nl } from '../../shared/i18n/nl';

/**
 * ⚠️ **De vertaling van een GoTrue-antwoord is een filter, en bij het wachtwoord
 *    was hij een omkering — QS8-672.** `vertaal()` in `api.ts` stuurt elke
 *    melding met "password" erin naar *"Gebruik een langere zin"*. GoTrue's
 *    antwoord op een wachtwoord van meer dan 72 bytes is *"Password cannot be
 *    longer than 72 characters"*, en wie dat kreeg, kreeg dus het omgekeerde
 *    advies. Het schema vangt die grens vóór het verzoek af; deze tak is er
 *    voor als client en server ooit anders tellen — een andere GoTrue-versie,
 *    een andere route — en dan moet het advies tenminste de goede kant op
 *    wijzen. Gevonden door de security-review op QS8-672.
 */
const signUp = vi.fn();

// `api.ts` leest `Platform.OS` voor de OAuth-route; vitest kan de Flow-bron van
// react-native niet laden, en hier doet dat veld niets.
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

vi.mock('../../lib/supabase', () => ({
  supabase: () => ({ auth: { signUp } }),
}));

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
}));

const { signUpWithEmail } = await import('./api');

const INVOER = { email: 'iemand@example.com', wachtwoord: 'een zin die aan het schema voldoet' };

afterEach(() => {
  zetTaal(STANDAARDTAAL);
  signUp.mockReset();
});

describe('de servermelding over een te lang wachtwoord', () => {
  it('wijst naar korter en niet naar langer', async () => {
    signUp.mockResolvedValue({
      error: { message: 'Password cannot be longer than 72 characters' },
    });

    zetTaal('nl');
    expect(await signUpWithEmail(INVOER)).toEqual({
      ok: false,
      melding: nl['validatie.wachtwoord_lang'],
      veld: 'wachtwoord',
    });

    zetTaal('en');
    expect(await signUpWithEmail(INVOER)).toEqual({
      ok: false,
      melding: en['validatie.wachtwoord_lang'],
      veld: 'wachtwoord',
    });
  });

  it('en laat elke andere wachtwoordmelding bij "gebruik een langere zin"', async () => {
    signUp.mockResolvedValue({
      error: { message: 'Password should be at least 8 characters' },
    });

    expect(await signUpWithEmail(INVOER)).toEqual({
      ok: false,
      melding: nl['auth.fout.zwak_wachtwoord'],
      veld: 'wachtwoord',
    });
  });
});
