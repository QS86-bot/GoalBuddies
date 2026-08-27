/**
 * Elke foreign key staat vooraan in een index — migratie 0097.
 *
 * ⚠️ **De rij van 19-08 in ENGINEER-REVIEW noemde één ontbrekende index; het
 *    waren er vijftien.** Die rij ging over `breathers.goal_id` en klopte voor
 *    die kolom. Ze is alleen nooit tegen de hele database gelegd, en dat is de
 *    vorm die regel 18 beschrijft: de bevinding toetste een ónderdeel terwijl
 *    onwrikbare regel 11 over het gehéél gaat. Vandaar dat hier niet één kolom
 *    getoetst wordt maar álle foreign keys, via `indexdekking_bewaking()` —
 *    zelfde vorm als `realtime_bewaking()` (0027) en `viewrechten_bewaking()`
 *    (0095).
 *
 * ⚠️ **Waarom dit niet vanzelf goed gaat.** Postgres indexeert de kindkant van
 *    een foreign key nooit. De ouderkant heeft er altijd een — anders mag de
 *    constraint niet bestaan — dus het vóélt gedekt. En een ontbrekende index
 *    breekt niets: er komt geen fout, en op een lege tabel is een seq scan zelfs
 *    sneller. Dat is precies de bevinding die geen enkele test vindt zolang je
 *    er niet expliciet naar vraagt.
 *
 * ⚠️ **De duurste plek is een cascade, geen query.** Dertien tabellen hangen met
 *    `on delete cascade` aan `profiles` (zie 0095). Zonder index op de
 *    kindkolom is het verwijderen van één account een seq scan per tabel over de
 *    geschiedenis van iedereen.
 *
 * ⚠️ De bewaking is met de hand gebroken vóór hij hier kwam te staan, zoals
 *    CLAUDE.md regel 18 eist. Op de lokale stack, in een teruggedraaide
 *    transactie: een tabel met een foreign key en géén index gaf één regel; met
 *    een index erop nul; met een index waarin de kolom níét vooraan staat weer
 *    één. Die derde is de interessante — `user_streaks`, `week_pass_events` en
 *    `chain_links` hadden allemaal zo'n index, en "komt ergens in een index
 *    voor" zou ze ten onrechte hebben vrijgepleit.
 */
import { describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
} from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;

describe.skipIf(!rlsTestsConfigured)('Indexdekking op foreign keys', () => {
  it(
    'geen enkele foreign key in public mist een index op zijn voorste kolommen',
    async () => {
      const { data, error } = await adminDb().rpc('indexdekking_bewaking');

      expect(error).toBeNull();
      // Bij een treffer staat tabel, constraint én kolommen in de melding, zodat
      // de volgende lezer niet hoeft te zoeken wélke het is.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'is niet aanroepbaar als gewone gebruiker',
    async () => {
      // ⚠️ De positieve controle, en niet de flauwe variant. `indexdekking_bewaking()`
      //    is SECURITY DEFINER en leest het systeemcatalogus; hij hoort alleen
      //    voor `service_role` te bestaan. Precies zo'n grant is er in 0095 stil
      //    bijgekomen langs de standaardrechten van Supabase — daar ging het om
      //    views, en hier gaat het om een functie die het hele schema uitleest.
      const alice = await createTestUser('indexdekking-alice');

      try {
        const { error } = await alice.db.rpc('indexdekking_bewaking');

        // ⚠️ Niet alleen "er is een fout". PostgREST geeft ook een fout als de
        //    functie helemaal niet bestaat (PGRST202), en dan is deze test
        //    groen terwijl de bewaking weg is. Het moet een weigering zijn.
        expect(error?.code, JSON.stringify(error)).toBe('42501');
      } finally {
        await removeTestUsers();
      }
    },
    SETUP_TIMEOUT,
  );
});
