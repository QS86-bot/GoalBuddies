import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De typebrug van de organisatiemodule is tijdelijk — QS8-657.
 *
 * ⚠️ `src/modules/organisaties/database.ts` kent de organisatiefuncties en
 *    -tabellen met een cast, omdat `src/lib/database.types.ts` een afschrift van
 *    productie is en 0299, 0300 en 0305 daar nog niet op staan. Zonder deze
 *    toets blijft de brug staan nadat hij overbodig is, en dan typt een cast wat
 *    de generator inmiddels zelf kent: de twee kunnen uit elkaar lopen zonder
 *    dat iets rood wordt.
 */
const TYPES = fileURLToPath(new URL('../../src/lib/database.types.ts', import.meta.url));

describe('de organisatie-typebrug', () => {
  it('is weg zodra de gegenereerde types maak_organisatie kennen', () => {
    const bron = readFileSync(TYPES, 'utf8');

    expect(
      bron.includes('maak_organisatie'),
      'database.types.ts kent maak_organisatie nu zelf: haal de typebrug ' +
        '`src/modules/organisaties/database.ts` weg en vervang `db()` door `supabase()` in de module.',
    ).toBe(false);
  });
});
