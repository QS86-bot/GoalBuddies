import { describe, expect, it } from 'vitest';

import { metSchuineStrepen } from '../../scripts/paden.mjs';

/**
 * Paduitzonderingen werken ook op Windows.
 *
 * ⚠️ **Geleerd in GoalBuddies (26-08-2026).** Een controle schrijft zijn
 *    uitzonderingen met schuine strepen, `join()` levert op Windows backslashes,
 *    en de uitzondering matcht dan nóóit — dus de controle scant juist de
 *    bestanden die hij moest overslaan, en meldt onzin. Een controle die onzin
 *    meldt, leer je te negeren.
 *
 * ⚠️ **Waarom `metSchuineStrepen()` béide scheidingstekens omzet en niet alleen
 *    `sep`.** Met alleen `sep` is de functie op Linux een no-op voor een
 *    Windows-pad, en dan is elke test die het geval nabootst groen zonder iets
 *    te bewijzen. Vandaar letterlijke backslashes hieronder.
 */
describe('metSchuineStrepen', () => {
  it.each([
    ['een Windows-pad', 'web\\src\\zelftest.tsx', 'web/src/zelftest.tsx'],
    ['een POSIX-pad blijft zoals het is', 'web/src/x.ts', 'web/src/x.ts'],
    ['gemengd', 'supabase\\functions/spiegel.ts', 'supabase/functions/spiegel.ts'],
    ['zonder scheidingsteken', 'index.ts', 'index.ts'],
  ])('%s', (_naam, invoer, verwacht) => {
    expect(metSchuineStrepen(invoer)).toBe(verwacht);
  });
});
