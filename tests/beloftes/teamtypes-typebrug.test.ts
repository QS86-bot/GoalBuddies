import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * De typebrug van het straf-scherm voor teamaandelen is tijdelijk — QS8-698.
 *
 * ⚠️ `src/modules/commitments/teamtypes.tijdelijk.ts` kent `team_goal_shares`,
 *    `team_goals` en `groups.organization_id` met een cast, omdat
 *    `src/lib/database.types.ts` een afschrift van productie is en de teamketen
 *    daar nog niet op staat. Zonder deze toets blijft de brug staan nadat hij
 *    overbodig is, en dan typt een cast wat de generator inmiddels zelf kent.
 */
const TYPES = fileURLToPath(new URL('../../src/lib/database.types.ts', import.meta.url));

describe('de teamtypebrug van het strafscherm', () => {
  it('is weg zodra de gegenereerde types team_goal_shares kennen', () => {
    const bron = readFileSync(TYPES, 'utf8');

    expect(
      bron.includes('team_goal_shares'),
      'database.types.ts kent team_goal_shares nu zelf: haal ' +
        '`src/modules/commitments/teamtypes.tijdelijk.ts` weg en vervang `teamDb()` ' +
        'door `supabase()` in `strafkeuzes.ts`.',
    ).toBe(false);
  });
});
