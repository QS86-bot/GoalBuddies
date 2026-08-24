import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import { oordeelSchema } from './approval-schemas';
import { afrondSchema, dagzetSchema } from './completion-schemas';

/**
 * QS8-115, modules-laag: `completions`.
 *
 * ⚠️ **Waarom dit bestand er pas op 24-08 kwam, en waarom dat het punt is.**
 *    Deze drie schema's waren op 22-08 al naar de catalogus gebracht — in
 *    `api.ts` en `approvals.ts`, waar ze toen stonden. Daarna verhuisden ze op
 *    `main` naar een eigen bestand (QS8-120/QS8-121, om ze los te trekken van de
 *    Supabase-client), en bij die verhuizing zijn de Nederlandse zinnen
 *    teruggekomen. **Geen enkele test werd daar rood van**, want de tests op deze
 *    schema's toetsen de inhoud van de melding en niet de herkomst.
 *
 *    Bij het samenvoegen van beide takken op 24-08 kwam dat boven. Dit bestand
 *    zorgt dat de volgende verhuizing wél een rode test geeft.
 *
 * ⚠️ Zoals overal in deze migratie: dit toetst óf de tekst nog van de taal
 *    afhangt, niet wat er staat.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

/** De eerste foutmelding van een schema in de opgegeven taal. */
function meldingIn(taalcode: 'nl' | 'en', parse: () => { error?: { issues: { message: string }[] } }) {
  zetTaal(taalcode);
  const uitkomst = parse();
  const eerste = uitkomst.error?.issues[0]?.message;

  expect(eerste, `${taalcode}: er hoort een foutmelding te zijn`).toBeDefined();
  return eerste as string;
}

describe('het oordeel van een beoordelaar', () => {
  it('vertaalt de melding bij een te lange reactie', () => {
    const parse = () => oordeelSchema.safeParse({ status: 'approved', comment: 'x'.repeat(1001) });

    expect(meldingIn('nl', parse)).not.toBe(meldingIn('en', parse));
  });
});

describe('een week afronden', () => {
  it('vertaalt de melding bij een te lange notitie', () => {
    const parse = () =>
      afrondSchema.safeParse({ achieved_level: 'ceiling', note: 'x'.repeat(2001) });

    expect(meldingIn('nl', parse)).not.toBe(meldingIn('en', parse));
  });
});

describe('de Dagzet', () => {
  it('vertaalt de melding bij een lege regel', () => {
    const parse = () =>
      dagzetSchema.safeParse({ body: '   ', weekly_goal_id: null, visibility: 'private' });

    expect(meldingIn('nl', parse)).not.toBe(meldingIn('en', parse));
  });
});
