import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;
const MIGRATIES = join(__dirname, '..', '..', 'supabase', 'migrations');

/**
 * Welke functies `authenticated` mag uitvoeren, en of iemand dat ooit besloten heeft.
 *
 * ⚠️ **`revoke ... from public` betekent in Supabase niet "van iedereen".**
 *    `alter default privileges` geeft élke nieuwe functie in `public` een
 *    `execute` aan `anon`, `authenticated` én `service_role`. Wie er `public` en
 *    `anon` afhaalt, houdt `authenticated` over — de rol waar iedere ingelogde
 *    gebruiker onder draait. 0112 deed precies dat bij
 *    `seizoensrecap_cijfers()`, en die functie is `SECURITY DEFINER` zonder
 *    lidmaatschapstoets. 0115 dicht het.
 *
 * ⚠️ **Waarom een tweede slot in de functie geen optie was.**
 *    `maak_seizoensrecaps()` roept hem aan als `service_role`, waar `auth.uid()`
 *    NULL is. Een `is_group_member()`-toets zou de recap voor elke groep op nul
 *    zetten. De grant is hier dus de enige grendel — en een grendel zonder test
 *    is een aanname (regel 18, vraag 3). Dit bestand ís dat tweede slot.
 *
 * ⚠️ **De tweede test is de generieke vorm, en die is het punt.** De eerste pint
 *    één functie vast; de tweede vraagt van élke functie die `authenticated` kan
 *    uitvoeren of een migratie dat ooit met zoveel woorden gunt. Zo niet, dan
 *    komt het recht uit de Supabase-standaard en heeft niemand het besloten.
 *    Dat is de klasse, niet het geval.
 */
describe('functiegrants — wat authenticated mag uitvoeren is besloten, niet geërfd', () => {
  let alice: TestUser;

  beforeAll(async () => {
    if (!rlsTestsConfigured) return;
    alice = await createTestUser('functiegrants-alice');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    if (!rlsTestsConfigured) return;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.runIf(rlsTestsConfigured)(
    'laat een ingelogde gebruiker seizoensrecap_cijfers() niet aanroepen',
    async () => {
      // ⚠️ Het lek dat 0115 dicht: Mallory hoeft geen lid te zijn en zelfs geen
      //    bestaande groep te kennen. Vóór 0115 gaf dit gewoon cijfers terug.
      const db = alice.db as unknown as {
        rpc: (naam: string, args: Record<string, unknown>) => Promise<{ error: { code?: string } | null }>;
      };

      const uitkomst = await db.rpc('seizoensrecap_cijfers', {
        p_group_id: '00000000-0000-0000-0000-000000000000',
        p_van: '2026-01-01',
        p_tot: '2026-12-31',
      });

      expect(uitkomst.error).not.toBeNull();
    },
    TEST_TIMEOUT,
  );

  it.runIf(rlsTestsConfigured)(
    'kent geen enkele functie die authenticated erft zonder dat een migratie hem gunt',
    async () => {
      // De grondwaarheid is de database, niet het migratiebestand: een latere
      // migratie kan een grant hebben teruggedraaid.
      const { data, error } = await (
        adminDb() as unknown as {
          rpc: (naam: string) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc('functies_voor_authenticated');

      expect(error).toBeNull();
      const uitvoerbaar = (data as readonly { readonly naam: string }[]).map((r) => r.naam);
      expect(uitvoerbaar.length).toBeGreaterThan(50);

      // ⚠️ Commentaar eruit én witruimte plat: een grant loopt vaak over twee
      //    regels (`grant execute on function f(...)\n  to authenticated;`) en
      //    een rollback-kop noemt dezelfde regel in commentaar. Zonder allebei
      //    telt dit bestand het verkeerde en meldt het niets.
      const platteMigraties = readdirSync(MIGRATIES)
        .filter((n) => n.endsWith('.sql'))
        .map((n) => readFileSync(join(MIGRATIES, n), 'utf8'))
        .join('\n')
        .split('\n')
        .map((regel) => regel.split('--')[0] ?? '')
        .join(' ')
        .replace(/\s+/g, ' ');

      const geerfd = uitvoerbaar.filter((naam) => {
        const patroon = new RegExp(
          `grant execute on function (public\\.)?${naam}\\s*\\([^)]*\\)\\s*to[^;]*authenticated`,
          'i',
        );
        return !patroon.test(platteMigraties);
      });

      expect(geerfd).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
