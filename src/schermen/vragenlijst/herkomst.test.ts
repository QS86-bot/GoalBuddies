import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HERKOMST_PARAM, komtVanProfiel, vragenlijstVanafProfiel } from './herkomst';

/** QS8-817: de herkomstparameter is een allowlist van één waarde. */
describe('de herkomst van de vragenlijst', () => {
  it('telt alleen precies "profiel"', () => {
    expect(komtVanProfiel('profiel')).toBe(true);
    expect(komtVanProfiel(undefined)).toBe(false);
    expect(komtVanProfiel('')).toBe(false);
    expect(komtVanProfiel('Profiel')).toBe(false);
    expect(komtVanProfiel('doelen')).toBe(false);
    expect(komtVanProfiel(['profiel'])).toBe(false);
  });

  it('de ingang wijst naar een route die bestaat, met de parameter die de vragenlijst leest', () => {
    const href = vragenlijstVanafProfiel();
    expect(href.pathname).toBe('/onboarding/vragenlijst');
    expect(readdirSync(join(__dirname, '..', '..', '..', 'app', 'onboarding'))).toContain('vragenlijst.tsx');
    expect(komtVanProfiel(href.params[HERKOMST_PARAM])).toBe(true);
  });
});
