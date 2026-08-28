/**
 * `profiles.tz` en `groups.tz` zijn vrije tekst die een ander z'n functie breekt
 * — migratie 0119.
 *
 * ⚠️ **De belofte is niet "de trigger weigert een onzinstring".** Dat is een
 *    eigenschap van het ónderdeel, en regel 18 vraag 2 zegt dat zo'n test groen
 *    blijft zodra iemand de toets verplaatst. De belofte is: *geen lid kan met
 *    een waarde in zijn eigen rij een functie stukmaken voor iemand anders*.
 *    Daarom eindigt elke weigering hieronder met een aanroep dóór een medelid.
 *
 * ⚠️ **Waarom dit een naad is en geen kolom.** `profiles.tz` was correct (NOT
 *    NULL, met default), `ketting_stand()` was correct (leest de tijdzone van
 *    het lid, migratie 0107), en tussen die twee stond niets dat afdwong dat de
 *    inhoud een tijdzone ís. `at time zone` op een onbekende naam geeft geen
 *    NULL maar een **fout**, en die landt bij de aanroeper — dus bij het
 *    medelid, niet bij de schrijver.
 *
 * ⚠️ **De must-allow-helft telt even zwaar.** Een controle die alles weigert,
 *    leert je hem te omzeilen. Er staat hieronder dus ook een echte zone die
 *    erdóór moet.
 *
 * ⚠️ **De zones hier komen met opzet uit de doorsnede van ICU en Postgres.**
 *    De lokale stack kent er 499 en productie 1196: achttien oude aliassen
 *    (`Asia/Calcutta`, `Europe/Kiev`, …) bestaan wél op productie en niet op
 *    Debian-tzdata. Een test met zo'n alias zou lokaal rood zijn en op
 *    productie groen — hij zou de omgeving toetsen en niet de regel. Zie de rij
 *    van 28-08 in `docs/ENGINEER-REVIEW.md`.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Zones die élke Postgres kent, lokaal zowel als op productie. Zie de kop. */
const ECHTE_ZONE = 'Pacific/Auckland';
const ECHTE_ZONE_TWEE = 'Asia/Tokyo';

/** Waarden die geen tijdzone zijn en dus nooit mogen landen. */
const GEEN_ZONES = [
  'Bogus/Zone',
  '', // komt langs NOT NULL heen; `at time zone ''` faalt even hard
  'UTC+1', // ziet eruit als een zone en is er geen
  'Europe/Amsterdam ', // met spatie — de vergelijking is exact
];

describe.runIf(rlsTestsConfigured)('een tz-waarde die geen tijdzone is (0119)', () => {
  let eigenaar: TestUser;
  let medelid: TestUser;
  let groupId: string;

  beforeAll(async () => {
    eigenaar = await createTestUser('tz-eigenaar');
    medelid = await createTestUser('tz-medelid');

    const groep = await eigenaar.db.rpc('create_group', { group_name: 'Tijdzone' });
    const data = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (data.ok !== true || !data.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    groupId = data.group.id;

    const mee = await medelid.db.rpc('join_group_with_code', { code: data.group.invite_code });
    const uitkomst = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (uitkomst.ok !== true) {
      throw new Error(`medelid werd geen lid: ${uitkomst.reason ?? 'geen reden'}`);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it.each(GEEN_ZONES)(
    'weigert %j in profiles.tz, en De Ketting blijft voor het medelid werken',
    async (waarde) => {
      const { error } = await eigenaar.db
        .from('profiles')
        .update({ tz: waarde })
        .eq('id', eigenaar.id);

      // ⚠️ **Eerst meten, dán pas beweren — en dat is hier geen stijlkwestie.**
      //    Stond de `expect` op de weigering hierboven, dan gooit die bij een
      //    kapotte grendel meteen en wordt de naadregel eronder nóóit bereikt.
      //    De test zou dan rood worden om de goede reden en de naad zelf zou
      //    ongetoetst blijven: regel 18 vraag 3, in het klein.
      const stand = await medelid.db.rpc('ketting_stand', {
        p_group_id: groupId,
        p_period_start: new Date().toISOString().slice(0, 10),
      });

      expect(error, `"${waarde}" landde in profiles.tz`).not.toBeNull();
      // Dít is de naad: niet dát er geweigerd werd, maar dat de schade die het
      // geval interessant maakt — een fout bij een ánder lid — is uitgebleven.
      expect(stand.error, `ketting_stand brak voor het medelid na "${waarde}"`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een onzinzone in groups.tz, en de seizoensrecap blijft draaien',
    async () => {
      const { error } = await eigenaar.db
        .from('groups')
        .update({ tz: 'Bogus/Zone' })
        .eq('id', groupId);

      expect(error, 'Bogus/Zone landde in groups.tz').not.toBeNull();

      // `maak_seizoensrecaps()` loopt in één lus over álle groepen: één kapotte
      // zone zette de recap voor iedereen stil. Daarom draait hij hier echt.
      const recap = await adminDb().rpc('maak_seizoensrecaps', {
        p_op: new Date().toISOString(),
      });
      expect(recap.error, 'maak_seizoensrecaps brak op een groep').toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een echte tijdzone gewoon door — beide kolommen',
    async () => {
      const profiel = await eigenaar.db
        .from('profiles')
        .update({ tz: ECHTE_ZONE })
        .eq('id', eigenaar.id);
      expect(profiel.error, `${ECHTE_ZONE} werd geweigerd in profiles.tz`).toBeNull();

      const groep = await eigenaar.db
        .from('groups')
        .update({ tz: ECHTE_ZONE_TWEE })
        .eq('id', groupId);
      expect(groep.error, `${ECHTE_ZONE_TWEE} werd geweigerd in groups.tz`).toBeNull();

      const na = await adminDb().from('groups').select('tz').eq('id', groupId).single();
      expect(na.data?.tz).toBe(ECHTE_ZONE_TWEE);
    },
    TEST_TIMEOUT,
  );
});
