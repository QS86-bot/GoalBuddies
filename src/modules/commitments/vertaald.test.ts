import { afterEach, describe, expect, it } from 'vitest';

import { STANDAARDTAAL, zetTaal } from '../../shared/i18n';

import { commitmentSchema } from './commitment-schemas';

/**
 * QS8-115, modules-laag: `commitments`.
 *
 * ⚠️ Zie de kop van `../completions/vertaald.test.ts` voor waarom dit bestand
 *    bestaat: deze schema's waren al vertaald, verhuisden op `main` naar een
 *    eigen bestand, en verloren daarbij stilzwijgend hun catalogus-aanroep.
 *
 * ⚠️ De https-regel is er in migratie 0068 bij gekomen, ná de vertaalronde. Die
 *    had dus nog nooit een sleutel; `validatie.link_https` is op 24-08 toegevoegd.
 *    Een nieuwe melding hoort meteen in de catalogus — anders groeit de
 *    Nederlandse tekst weer terug in de code.
 */

afterEach(() => {
  zetTaal(STANDAARDTAAL);
});

function meldingIn(taalcode: 'nl' | 'en', invoer: { body: string; image_url: string | null }) {
  zetTaal(taalcode);
  const uitkomst = commitmentSchema.safeParse(invoer);
  const eerste = uitkomst.error?.issues[0]?.message;

  expect(eerste, `${taalcode}: er hoort een foutmelding te zijn`).toBeDefined();
  return eerste as string;
}

describe('een commitment', () => {
  it('vertaalt de melding bij een te korte tekst', () => {
    const invoer = { body: 'ab', image_url: null };

    expect(meldingIn('nl', invoer)).not.toBe(meldingIn('en', invoer));
  });

  it('vertaalt de melding bij een link zonder https', () => {
    // ⚠️ Dit is de domeinregel-11-grens, geen opmaakregel: een commitment wordt
    //    leesbaar voor de begunstigde groep zodra de straf verschuldigd wordt,
    //    dus een `javascript:`-link is opgeslagen XSS richting je groepsgenoten.
    //    De database weigert het sinds 0068 ook; dit schema geeft de nette zin.
    const invoer = { body: 'Ik doneer aan een goed doel.', image_url: 'http://voorbeeld.nl/x.png' };

    expect(meldingIn('nl', invoer)).not.toBe(meldingIn('en', invoer));
  });
});
