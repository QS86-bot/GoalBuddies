import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Een auditrij voor een verdwenen commitment — QS8-361, migratie 0220.
 *
 * ⚠️ **De belofte is niet "`noteer_commitment()` schrijft de goede rijen".** Dat
 *    is het onderdeel. De belofte is: *een verwijdering valt niet om over een
 *    spoorregel die toch mee zou cascaderen.*
 *
 * ⚠️⚠️ **Waarom dit alleen met `psql` te toetsen is.** Het gaat om twee cascades
 *    binnen **één statement**: via `goals` verdwijnt het commitment, via
 *    `profiles` wordt `beneficiary_user_id` op NULL gezet. Dat tweede is een
 *    UPDATE en vuurt de AFTER-trigger voor een rij die er niet meer is. De
 *    admin-API verwijdert één gebruiker per aanroep en komt dus nooit in dit
 *    geval — precies de reden dat dit tot 08-09-2026 onopgemerkt bleef.
 *
 * ⚠️ **De opstelling moet gecommit zijn vóór de verwijdering.** Postgres slaat de
 *    hercontrole van een foreign key over als de sleutel niet verandert, behálve
 *    wanneer de oude rij door de huidige transactie is ingevoegd. Een opbouw en
 *    een verwijdering in één transactie meten dáárom iets anders — dat is de
 *    meetfout die de eerste versie van dit issue de verkeerde kant op stuurde.
 *    Elke `psql()`-aanroep hieronder is een eigen transactie, dus dat komt hier
 *    vanzelf goed.
 *
 * IJKING — met de hand, 08-09-2026, door de grendel uit de functie in de
 * draaiende database te halen:
 *
 *   A  de `not exists`-tak eruit           → 1 rood: de bulkverwijdering valt om
 *      met `commitment_events_commitment_id_fkey`
 *   B  de grendel verbreden naar "sla over zodra de begunstigde verdwijnt"
 *      → 1 rood: de `edited`-rij van een getuige die alleen zíjn account
 *      verwijdert verdwijnt dan, terwijl het commitment gewoon blijft bestaan.
 *      Dat is de voor de hand liggende reparatie, en dit is de test die hem
 *      tegenhoudt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Straf {
  eigenaar: TestUser;
  getuige: TestUser;
  commitmentId: string;
}

/** Een doel met een bevestigde straf waarvan een persoon de getuige is. */
async function strafMetGetuige(label: string): Promise<Straf> {
  const eigenaar = await createTestUser(`${label}-eigenaar`);
  const getuige = await createTestUser(`${label}-getuige`);

  const doelId = psql(
    `insert into goals (owner_id, title, target_date)
     values ('${eigenaar.id}', 'QS361 ${label}', current_date + 30)
     returning id`,
  );

  // ⚠️ `penalty` en niet `reward`: `commitments_persoon_alleen_bij_straf` staat
  //    een persoon als begunstigde alleen toe bij een straf.
  const commitmentId = psql(
    `insert into commitments (goal_id, type, body, status, beneficiary_user_id, confirmed_at)
     values ('${doelId}', 'penalty', 'Ik trakteer de groep', 'set', '${getuige.id}', now())
     returning id`,
  );

  return { eigenaar, getuige, commitmentId };
}

function sporen(commitmentId: string): readonly string[] {
  const uit = psql(
    `select event_type from commitment_events
      where commitment_id = '${commitmentId}' order by created_at`,
  );
  return uit === '' ? [] : uit.split('\n');
}

describe.skipIf(!rlsTestsConfigured)('een bulkverwijdering met een straf erin', () => {
  let bulk: Straf;
  let blijft: Straf;

  beforeAll(async () => {
    bulk = await strafMetGetuige('bulk');
    blijft = await strafMetGetuige('blijft');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'verwijdert de eigenaar én de getuige in één statement',
    () => {
      expect(() =>
        psql(
          `delete from auth.users where id in ('${bulk.eigenaar.id}', '${bulk.getuige.id}')`,
        ),
      ).not.toThrow();

      expect(psql(`select count(*) from commitments where id = '${bulk.commitmentId}'`)).toBe('0');
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De must-allow, en hij is hier het zwaarste deel.** Domeinregel 5: alles
   *    wat een consequentie oplegt is auditeerbaar. Een grendel die de trigger
   *    stiller maakt dan nodig, haalt precies dat weg.
   */
  it(
    'schrijft nog steeds een spoorregel bij een gewone statuswijziging',
    () => {
      psql(`update commitments set status = 'due' where id = '${blijft.commitmentId}'`);
      expect(sporen(blijft.commitmentId)).toEqual(['confirmed', 'triggered']);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **En dit is de tak die de voor de hand liggende reparatie afkeurt.**
   *    Verdwijnt alléén de getuige, dan blijft het commitment bestaan en is "de
   *    begunstigde is weg" een echte gebeurtenis — 0059 noemt hem `edited`. Een
   *    grendel op "de begunstigde verdwijnt" zou die rij wegnemen; de grendel
   *    van 0207 staat daarom op het bestáán van het commitment.
   */
  it(
    'houdt de edited-rij als alleen de getuige zijn account verwijdert',
    () => {
      psql(`delete from auth.users where id = '${blijft.getuige.id}'`);

      expect(psql(`select count(*) from commitments where id = '${blijft.commitmentId}'`)).toBe('1');
      expect(sporen(blijft.commitmentId)).toEqual(['confirmed', 'triggered', 'edited']);
    },
    TEST_TIMEOUT,
  );
});
