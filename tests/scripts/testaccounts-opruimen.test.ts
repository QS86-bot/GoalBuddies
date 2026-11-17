import { describe, expect, it } from 'vitest';

// ⚠️ Een `.mjs` zonder eigen typings, zoals de andere scriptstests.
import { deelIn, leesArgumenten, TEST_EMAIL, weigering } from '../../scripts/testaccounts-opruimen.mjs';

/**
 * QS8-693 — het opruimscript verwijdert alleen wat van de RLS-suite is.
 *
 * ⚠️ **De belofte is wat er NIET verwijderd wordt.** Dit is bulk-verwijderen van
 *    gebruikers op productie; de gevaarlijke fout is een kandidaat te veel, niet
 *    een te weinig. Daarom toetst elke test hieronder één van de drie voorwaarden
 *    los, en één test dat niets zonder backup verwijderd wordt.
 */

const UUID = '3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c';
const test = (extra = {}) => ({
  id: 'a',
  email: `rls-weekdoel-${UUID}@example.com`,
  last_sign_in_at: null,
  created_at: '2026-11-16T18:50:00Z',
  ...extra,
});
const DAGEN = ['2026-11-09', '2026-11-16'];

describe('deelIn — wie een kandidaat is', () => {
  it('neemt een testaccount dat nooit inlogde op een opgegeven dag', () => {
    expect(deelIn([test()], DAGEN).kandidaten).toEqual(['a']);
  });

  it.each([
    ['een echt adres', { email: 'quinten@gmail.com' }, 'geenTestmail'],
    ['een los rls-adres zonder uuid', { email: 'rls-x@example.com' }, 'geenTestmail'],
    ['een ander domein', { email: `rls-x-${UUID}@example.org` }, 'geenTestmail'],
    ['geen e-mailadres', { email: null }, 'geenTestmail'],
    ['een account dat ooit inlogde', { last_sign_in_at: '2026-11-10T08:00:00Z' }, 'ooitIngelogd'],
    ['een andere aanmaakdag', { created_at: '2026-11-12T10:00:00Z' }, 'andereDag'],
  ])('slaat %s over', (_naam, afwijking, reden) => {
    const uit = deelIn([test(afwijking)], DAGEN);
    expect(uit.kandidaten).toEqual([]);
    expect(uit.overgeslagen[reden as keyof typeof uit.overgeslagen]).toBe(1);
  });

  it('gebruikt dezelfde mailvorm als het harnas', () => {
    expect(TEST_EMAIL.test(`rls-ketting-${UUID}@example.com`)).toBe(true);
  });
});

describe('weigering — niets verwijderen zonder backup', () => {
  it('weigert zonder dagen', () => {
    expect(weigering(leesArgumenten([]))).toMatch(/--dagen/);
  });

  it('staat een telling toe zonder backup', () => {
    expect(weigering(leesArgumenten(['--dagen=2026-11-09']))).toBeNull();
  });

  it('weigert --uitvoeren zonder backup', () => {
    expect(weigering(leesArgumenten(['--dagen=2026-11-09', '--uitvoeren']))).toMatch(/vraagt --backup-gedaan/);
  });

  it('weigert --uitvoeren met een backupbestand dat niet bestaat', () => {
    const args = leesArgumenten(['--dagen=2026-11-09', '--uitvoeren', '--backup-gedaan=weg.sql']);
    expect(weigering(args, () => false)).toMatch(/bestaat niet/);
  });

  it('staat --uitvoeren toe met een bestaande backup', () => {
    const args = leesArgumenten(['--dagen=2026-11-09', '--uitvoeren', '--backup-gedaan=dump.sql']);
    expect(weigering(args, () => true)).toBeNull();
  });
});
