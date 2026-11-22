import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ORGANISATIE_AANMAKEN_ZICHTBAAR } from '../../src/modules/organisaties/zichtbaarheid';

import { adminDb, anonDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { laatOrganisatieAanmaken } from './organisatie-toelating';

/**
 * Een organisatie aanmaken vraagt toelating — QS8-776, migratie 0337.
 *
 * Besluit van Quinten, 22-11-2026: een allowlist per persoon (`organisatie_aanmakers`) die leeg begint, en de knop
 * in Profiel blijft verborgen. De belofte is niet dat de knop weg is (dat deed QS8-663 al), maar dat **een gewone
 * ingelogde gebruiker via de API geen organisatie kan maken**. Dat is de naad: de UI verbergt, de database weigert,
 * en alleen de tweede houdt een directe aanroeper tegen.
 *
 * Daarom staan hier bij elkaar, zoals het issue vraagt:
 *
 * - de knop: `ORGANISATIE_AANMAKEN_ZICHTBAAR` is `false` (de profieltoets zelf staat in
 *   `src/modules/organisaties/zichtbaarheid.test.ts`);
 * - de database: een gewone gebruiker krijgt `niet_toegelaten` en er landt niets;
 * - een toegelaten gebruiker maakt nog steeds een organisatie;
 * - de allowlist is voor `anon` en `authenticated` niet te lezen en niet te beschrijven, dus niemand zet zichzelf
 *   erop.
 *
 * ⚠️ Gaat de constante ooit om, dan wordt de eerste toets rood. Dat is met opzet: de knop en de databaseregel gaan
 *    samen om (issue QS8-776), en wie de een omzet, leest hier dat de ander bestaat.
 */

const SETUP_TIMEOUT = 240_000;
const TEST_TIMEOUT = 90_000;

interface Antwoord {
  readonly data: unknown;
  readonly error: { code?: string; message?: string } | null;
}

async function maak(wie: TestUser, naam: string): Promise<Antwoord> {
  const { data, error } = await wie.db.rpc('maak_organisatie' as never, { p_naam: naam } as never);
  return { data, error };
}

/** `ok`, de reden, of `fout <code>`. */
function uitkomst(a: Antwoord): string {
  if (a.error) return `fout ${a.error.code ?? '?'}`;
  const d = a.data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? 'ok' : (d?.reason ?? 'null');
}

async function organisatiesVan(userId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from('organizations' as never)
    .select('id', { count: 'exact', head: true })
    .eq('created_by' as never, userId as never);
  expect(error).toBeNull();
  return count ?? 0;
}

const aangemaakt: string[] = [];

describe('de knop "Organisatie aanmaken" blijft verborgen (besluit Quinten 22-11-2026)', () => {
  it('ORGANISATIE_AANMAKEN_ZICHTBAAR staat uit', () => {
    expect(ORGANISATIE_AANMAKEN_ZICHTBAAR).toBe(false);
  });
});

describe.runIf(rlsTestsConfigured)('maak_organisatie() vraagt toelating (QS8-776, 0337)', () => {
  let gewoon: TestUser; // staat niet op de lijst
  let toegelaten: TestUser; // staat erop

  beforeAll(async () => {
    [gewoon, toegelaten] = await Promise.all([
      createTestUser('orgtoelating-gewoon'),
      createTestUser('orgtoelating-toegelaten'),
    ]);
    await laatOrganisatieAanmaken(toegelaten);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    const admin = adminDb();
    if (aangemaakt.length > 0) {
      await admin.from('organization_members' as never).delete().in('organization_id' as never, aangemaakt as never);
      await admin.from('organizations' as never).delete().in('id' as never, aangemaakt as never);
    }
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'een gewone gebruiker krijgt via de API niet_toegelaten, en er landt geen organisatie',
    async () => {
      // Een geldige naam: de weigering mag niet van de naam komen, anders toetst dit de verkeerde grendel.
      expect(uitkomst(await maak(gewoon, 'Gewoon BV'))).toBe('niet_toegelaten');
      expect(await organisatiesVan(gewoon.id)).toBe(0);

      // Ook met een ongeldige naam is de reden niet_toegelaten: de toelating komt eerst, dus de weigering zegt
      // niets over naam, dagteller of plafond.
      expect(uitkomst(await maak(gewoon, ''))).toBe('niet_toegelaten');
    },
    TEST_TIMEOUT,
  );

  it(
    'een weigering verbruikt de dagteller niet: na toelating kan dezelfde gebruiker meteen aanmaken',
    async () => {
      // Vier weigeringen: zou elk ervan tellen, dan stond de teller boven het plafond van drie.
      for (let i = 0; i < 4; i++) {
        expect(uitkomst(await maak(gewoon, `Poging ${i}`))).toBe('niet_toegelaten');
      }
      await laatOrganisatieAanmaken(gewoon);
      const a = await maak(gewoon, 'Na toelating BV');
      expect(uitkomst(a)).toBe('ok');
      aangemaakt.push((a.data as { organization_id: string }).organization_id);

      // En hij gaat ook weer dicht: van de lijst af is weer niet_toegelaten.
      const weg = await adminDb()
        .from('organisatie_aanmakers' as never)
        .delete()
        .eq('user_id' as never, gewoon.id as never);
      expect(weg.error).toBeNull();
      expect(uitkomst(await maak(gewoon, 'Weer dicht BV'))).toBe('niet_toegelaten');
    },
    TEST_TIMEOUT,
  );

  it(
    'een toegelaten gebruiker maakt nog steeds een organisatie, met zichzelf als beheerder',
    async () => {
      const a = await maak(toegelaten, 'Toegelaten BV');
      expect(uitkomst(a)).toBe('ok');
      const org = (a.data as { organization_id: string }).organization_id;
      aangemaakt.push(org);

      const { data, error } = await adminDb()
        .from('organization_members' as never)
        .select('role, status')
        .eq('organization_id' as never, org as never)
        .eq('user_id' as never, toegelaten.id as never);
      expect(error).toBeNull();
      expect(data).toEqual([{ role: 'admin', status: 'active' }]);
    },
    TEST_TIMEOUT,
  );

  it(
    'authenticated kan de allowlist niet lezen en zichzelf er niet op zetten',
    async () => {
      const lees = await gewoon.db.from('organisatie_aanmakers' as never).select('user_id');
      expect(lees.error?.code).toBe('42501');

      const zet = await gewoon.db
        .from('organisatie_aanmakers' as never)
        .insert({ user_id: gewoon.id, reden: 'ikzelf' } as never);
      expect(zet.error?.code).toBe('42501');

      const wijzig = await toegelaten.db
        .from('organisatie_aanmakers' as never)
        .update({ user_id: gewoon.id } as never)
        .eq('user_id' as never, toegelaten.id as never);
      expect(wijzig.error?.code).toBe('42501');

      const wis = await toegelaten.db
        .from('organisatie_aanmakers' as never)
        .delete()
        .eq('user_id' as never, toegelaten.id as never);
      expect(wis.error?.code).toBe('42501');

      // De poging heeft niets veranderd: de gewone gebruiker mag nog steeds niet.
      expect(uitkomst(await maak(gewoon, 'Via de achterdeur BV'))).toBe('niet_toegelaten');
    },
    TEST_TIMEOUT,
  );

  it(
    'anon kan de allowlist niet lezen en niet beschrijven, en maak_organisatie() niet aanroepen',
    async () => {
      const anon = anonDb();
      const lees = await anon.from('organisatie_aanmakers' as never).select('user_id');
      expect(lees.error?.code).toBe('42501');

      const zet = await anon
        .from('organisatie_aanmakers' as never)
        .insert({ user_id: gewoon.id, reden: 'anoniem' } as never);
      expect(zet.error?.code).toBe('42501');

      // ⚠️ De weigering moet het recht zijn en niet de inlogtoets in het lichaam: die geeft óók 42501
      //    ('Niet ingelogd'), dus alleen op de code toetsen blijft groen als anon ooit EXECUTE krijgt.
      const rpc = await anon.rpc('maak_organisatie' as never, { p_naam: 'Anoniem BV' } as never);
      expect(rpc.data).toBeNull();
      expect(rpc.error?.message ?? '').toMatch(/permission denied for function maak_organisatie/);
    },
    TEST_TIMEOUT,
  );
});
