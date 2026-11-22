import { expect } from 'vitest';

import { adminDb, type TestUser } from './harness';

/**
 * Zet een testgebruiker op de allowlist van `maak_organisatie()` — QS8-776, migratie 0337.
 *
 * Sinds 0337 weigert `maak_organisatie()` iedereen die niet in `organisatie_aanmakers` staat, en die tabel begint
 * leeg (besluit van Quinten, 22-11-2026). Elke suite die een organisatie nodig heeft, laat haar maker daarom eerst
 * hier toe, zoals Quinten dat op productie met de hand doet: als `service_role`, want `authenticated` heeft op die
 * tabel geen enkel recht.
 *
 * ⚠️ **Toelaten is een handeling van de test en geen eigenschap van `createTestUser()`.** Zou elke testgebruiker
 *    vanzelf op de lijst staan, dan toetst geen enkele suite meer wat een gewone gebruiker overkomt, en dat is
 *    precies de belofte van 0337. De weigering staat in `tests/rls/organisatie-aanmaken.test.ts`.
 *
 * De rij verdwijnt met het account (`on delete cascade` naar `profiles`), dus `removeTestUsers()` ruimt hem op.
 */
export async function laatOrganisatieAanmaken(wie: TestUser | { readonly id: string }): Promise<void> {
  const { error } = await adminDb()
    .from('organisatie_aanmakers' as never)
    .upsert({ user_id: wie.id, reden: 'RLS-suite (QS8-776)' } as never, {
      onConflict: 'user_id',
      ignoreDuplicates: true,
    });
  expect(error).toBeNull();
}
