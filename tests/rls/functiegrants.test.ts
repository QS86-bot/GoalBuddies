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
    'kent geen enkele functie die anon of authenticated erft zonder dat een migratie hem gunt',
    async () => {
      // De grondwaarheid is de database, niet het migratiebestand: een latere
      // migratie kan een grant hebben teruggedraaid.
      const db = adminDb() as unknown as {
        rpc: (naam: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      };

      const inventaris = await db.rpc('functies_met_uitvoerrecht');
      expect(inventaris.error).toBeNull();
      const mag = inventaris.data as readonly {
        readonly rol: string;
        readonly naam: string;
        readonly handtekening: string;
      }[];
      expect(mag.filter((r) => r.rol === 'authenticated').length).toBeGreaterThan(50);

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

      // Elke grant met zijn handtekening én de rollen die hij noemt.
      const gegund = new Map<string, Set<string>>();
      const grants = platteMigraties.matchAll(
        /grant execute on function\s+(?:public\.)?([a-z0-9_]+\s*\([^)]*\))\s*to\s+([^;]*);/gi,
      );
      for (const treffer of grants) {
        const sig = (treffer[1] ?? '').replace(/\s+/g, '');
        const rollen = (treffer[2] ?? '').toLowerCase();
        const bestaand = gegund.get(sig) ?? new Set<string>();
        for (const rol of ['anon', 'authenticated']) if (rollen.includes(rol)) bestaand.add(rol);
        gegund.set(sig, bestaand);
      }

      // ⚠️⚠️ **Postgres normaliseert de types, niet wij.** 📏 De migraties
      //    schrijven `timestamptz` (13×) waar Postgres `timestamp with time zone`
      //    rendert; `integer`/`int4` en `boolean`/`bool` dragen hetzelfde risico.
      //    Een aliastabel hier zou drift zijn — `to_regprocedure()` kent ze
      //    allemaal, want het is dezelfde parser die de functies aanmaakte.
      const omgezet = await db.rpc('kanonieke_handtekeningen', {
        p_signaturen: [...gegund.keys()],
      });
      expect(omgezet.error).toBeNull();
      const kanoniek = new Map(
        (omgezet.data as readonly { readonly invoer: string; readonly kanoniek: string | null }[])
          .filter((r) => r.kanoniek !== null)
          .map((r) => [r.invoer, r.kanoniek as string]),
      );

      /** Per rol: de handtekeningen die een migratie met zoveel woorden gunt. */
      const perRol = new Map<string, Set<string>>([
        ['anon', new Set()],
        ['authenticated', new Set()],
      ]);
      for (const [sig, rollen] of gegund) {
        const vorm = kanoniek.get(sig);
        if (vorm === undefined) continue;
        for (const rol of rollen) perRol.get(rol)?.add(vorm.replace(/\s+/g, ''));
      }

      const geerfd = mag
        .filter((r) => !perRol.get(r.rol)?.has(r.handtekening.replace(/\s+/g, '')))
        .map((r) => `${r.rol}: ${r.handtekening}`);

      expect(geerfd).toEqual([]);
    },
    TEST_TIMEOUT,
  );
});
