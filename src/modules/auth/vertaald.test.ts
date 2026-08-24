import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import { aanmeldenSchema, inloggenSchema, profielSchema } from './schemas';

/**
 * QS8-115, modules-laag: de Zod-meldingen van `auth`.
 *
 * ⚠️ **Dit is de subtielste val van de hele migratie.** Een Zod-schema wordt op
 *    moduleniveau opgebouwd — één keer, bij het importeren. Staat er
 *    `{ error: t('...') }`, dan wordt die tekst dáár vastgelegd, en dat is
 *    vóórdat het profiel geladen is. De melding blijft dan in de apparaattaal
 *    staan, ook nadat de gebruiker Engels heeft gekozen, en er is niets aan te
 *    zien: het schema werkt, de validatie klopt, alleen de taal is bevroren.
 *
 *    De oplossing is `{ error: () => t('...') }` — Zod v4 roept die functie bij
 *    élke `parse` opnieuw aan. Deze tests bewaken dat: ze wisselen van taal
 *    tússen twee parses van hetzelfde, al geïmporteerde schema.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

function eersteMelding(uitkomst: { success: boolean; error?: { issues: { message: string }[] } }) {
  return uitkomst.error?.issues[0]?.message ?? '';
}

describe('Zod-meldingen volgen de taal', () => {
  it('vertaalt de wachtwoordeis van een al opgebouwd schema', () => {
    const kort = { email: 'iemand@example.com', wachtwoord: 'kort' };

    zetTaal('nl');
    expect(eersteMelding(aanmeldenSchema.safeParse(kort))).toBe(
      'Gebruik minstens 12 tekens. Een korte zin werkt prima.',
    );

    // ⚠️ Hetzelfde schema-object, alleen een andere taal. Zou de melding hier
    //    Nederlands blijven, dan staat `{ error: t(...) }` er weer in plaats van
    //    `{ error: () => t(...) }`.
    zetTaal('en');
    expect(eersteMelding(aanmeldenSchema.safeParse(kort))).toBe(
      'Use at least 12 characters. A short phrase works fine.',
    );
  });

  it('vertaalt de e-mailmelding', () => {
    const fout = { email: 'geen adres', wachtwoord: 'een lange zin die voldoet' };

    zetTaal('nl');
    expect(eersteMelding(aanmeldenSchema.safeParse(fout))).toBe(
      'Dit ziet er niet uit als een e-mailadres.',
    );

    zetTaal('en');
    expect(eersteMelding(aanmeldenSchema.safeParse(fout))).toBe(
      'This does not look like an email address.',
    );
  });

  it('vertaalt een leeg wachtwoord bij inloggen', () => {
    const leeg = { email: 'iemand@example.com', wachtwoord: '' };

    zetTaal('nl');
    expect(eersteMelding(inloggenSchema.safeParse(leeg))).toBe('Vul je wachtwoord in.');

    zetTaal('en');
    expect(eersteMelding(inloggenSchema.safeParse(leeg))).toBe('Enter your password.');
  });

  it('vertaalt de profielmeldingen', () => {
    zetTaal('en');

    expect(eersteMelding(profielSchema.safeParse({ display_name: '' }))).toBe('Enter a name.');
  });

  it('laat geen enkele melding leeg of in de sleutelvorm staan', () => {
    // Een ontbrekende vertaling valt in `t()` terug op het Nederlands en anders
    // op de kale sleutel. Dat laatste zou hier als "validatie.iets" opduiken.
    for (const taalcode of ['nl', 'en'] as const) {
      zetTaal(taalcode);

      const melding = eersteMelding(
        aanmeldenSchema.safeParse({ email: 'x', wachtwoord: 'y' }),
      );

      expect(melding, taalcode).not.toMatch(/^validatie\./);
      expect(melding.length, taalcode).toBeGreaterThan(5);
    }
  });
});
