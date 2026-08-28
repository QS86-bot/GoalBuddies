import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * `auth.uid()` staat in geen enkele policy meer kaal — migratie 0121.
 *
 * ⚠️ **Wat er mis was.** `auth.uid()` is geen goedkope functie: hij is
 *    `coalesce(current_setting('request.jwt.claim.sub'), (current_setting('request.jwt.claims')::jsonb ->> 'sub'))::uuid`.
 *    Kaal in een policy komt die hele keten in het rij-filter terecht en draait
 *    hij één keer per gescande rij. `(select auth.uid())` maakt er een InitPlan
 *    van: één keer per query, filter `user_id = $0`. 49 policies over 30 tabellen
 *    deden het kaal, nul deden het goed.
 *
 * ⚠️ **Hoe groot dat is, en wanneer het nul is.** Gemeten op 500.000 rijen:
 *    zonder index op de kolom 633 ms tegenover 41 ms, mét index 2,3 tegenover
 *    2,0. `auth.uid()` is `stable`, dus voor een indexzoekopdracht rekent
 *    Postgres hem sowieso één keer uit. Nooit langzamer, soms vijftien keer
 *    sneller.
 *
 * ⚠️ **Waarom hier twee tests staan en niet één.** De bewaking ziet de vórm. Dat
 *    is precies genoeg om de terugval te vangen en precies te weinig om te zeggen
 *    dat de policies nog hetzelfde bewaken — een herschrijving van 49
 *    autorisatieregels kan de vorm halen en de betekenis missen. Dat tweede is
 *    hier niet met een test te doen: het bewijs zit in de 573 gedragstests van
 *    deze suite, plus de vóór/ná-vergelijking van alle 73 policies die bij de
 *    migratie hoort (59 uitdrukkingen veranderd, nul semantische verschillen na
 *    het wegnormaliseren van de subselect).
 */
describe.skipIf(!rlsTestsConfigured)('0121 — auth.uid() draait één keer per query', () => {
  let gebruiker: TestUser;

  beforeAll(async () => {
    gebruiker = await createTestUser('initplan');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'kent geen enkele policy met een kale auth.uid()',
    async () => {
      const { data, error } = await adminDb().rpc('initplan_bewaking');

      expect(error).toBeNull();
      // Tabel, policy en of het de `using` of de `with check` is — genoeg om er
      // meteen naartoe te lopen.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De positieve controle op de bewaking zelf. Niet "er is een fout":
   *    PostgREST geeft óók een fout als de functie helemáál niet bestaat, en dan
   *    is de test hierboven groen terwijl de bewaking weg is.
   */
  it(
    'de bewaking is niet aanroepbaar als gewone gebruiker',
    async () => {
      const { error } = await gebruiker.db.rpc('initplan_bewaking');

      expect(error?.code, JSON.stringify(error)).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De tegentest, en zonder deze bewijst de nulmeting niets.** Nul rijen is
   *    ook wat je krijgt van een zeef die niets kán vinden — bijvoorbeeld omdat
   *    de negatieve vooruitblik in het patroon te gulzig is. Deze test voedt de
   *    bewaking allebei de vormen als losse tekst.
   */
  it(
    'ziet het verschil tussen de kale en de gehesen vorm',
    async () => {
      const db = adminDb() as unknown as {
        rpc: (
          naam: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      };

      const proef = async (uitdrukking: string): Promise<boolean> => {
        const { data, error } = await db.rpc('is_kale_auth_uid', { p_uitdrukking: uitdrukking });
        expect(error, `${uitdrukking}: ${JSON.stringify(error)}`).toBeNull();
        return data as boolean;
      };

      expect(await proef('(user_id = auth.uid())')).toBe(true);
      expect(await proef('(user_id = ( SELECT auth.uid() AS uid ))')).toBe(false);
      // Twee in één uitdrukking: één kale is genoeg om te melden.
      expect(await proef('((a = ( SELECT auth.uid() AS uid )) OR (b = auth.uid()))')).toBe(true);
      // En iets zonder auth.uid() erin hoort niets te melden.
      expect(await proef('(is_group_member(group_id))')).toBe(false);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **En de gedragskant: de policies doen nog wat ze deden.** Deze suite heeft
   *    573 tests die dat op elke tabel afzonderlijk toetsen; wat hier staat is de
   *    grofste van allemaal — kan een gebruiker zijn eigen rij nog lezen. Zonder
   *    dat is een groene vormtest ook waar op een schema waar niemand meer iets
   *    mag.
   */
  it(
    'en de herschreven policies laten een gebruiker nog steeds bij zijn eigen rij',
    async () => {
      const { data, error } = await gebruiker.db
        .from('profiles')
        .select('id')
        .eq('id', gebruiker.id);

      expect(error, JSON.stringify(error)).toBeNull();
      expect(data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});
