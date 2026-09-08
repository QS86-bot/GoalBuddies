import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  WEIGERCODES,
  type TestUser,
} from './harness';

/**
 * Een blokkade is van de blokkeerder — QS8-262, ronde 6.
 *
 * `rls:dekking` mat op 04-09 dat `user_blocks_insert` en `user_blocks_delete`
 * door geen enkele test bewaakt worden. `user_blocks_select` en `_update` wél:
 * `veiligheid.test.ts` leest de tabel en `alleenlezen.test.ts` legt vast dat
 * `_update` op `false` staat. **De schrijfkant is nooit aangeraakt** — en die
 * bepaalt wie er een blokkade bíj mag zetten en wie hem weer weg mag halen.
 *
 * ⚠️ **Wat een gat hier kost.** Een blokkade is de enige handeling waarmee een
 *    gebruiker zich tegen een ander beschermt (QS8-232): een geblokkeerde komt
 *    niet in een groep waar jij in zit, en andersom. Kan iemand anders jouw
 *    blokkade weghalen, dan verdwijnt die bescherming zonder dat je het merkt.
 *    Kan iemand een blokkade op jóuw naam zetten, dan houdt hij jou buiten
 *    groepen waar je wél in wilt — beide kanten van dezelfde policy en beide
 *    stil.
 *
 * ⚠️ **De primaire sleutel is `(blocker_id, blocked_id)` en die mag de meting
 *    niet doen.** Een tweede poging op hetzelfde paar geeft `23505`, en dat
 *    staat níét in `WEIGERCODES` — dan valt de test om met "geweigerd door iets
 *    anders" in plaats van groen te worden om de verkeerde reden. Elke poging
 *    hieronder gebruikt daarom een paar dat nog niet bestaat. Dezelfde valstrik
 *    als in ronde 1, waar een unieke index drie fixtures groen hield.
 *
 * ## ⚠️ `user_blocks_delete` is per helft niet te breken — en dat is een nieuwe vorm
 *
 * Gemeten, niet geredeneerd, met drie mutaties:
 *
 * | Opengezet | Uitslag |
 * |---|---|
 * | `user_blocks_delete` alleen | 4 groen — er wordt niets rood |
 * | `user_blocks_select` alleen | 4 groen — de delete-policy houdt hem nog tegen |
 * | **allebei tegelijk** | **1 rood**, en het is de juiste test |
 *
 * De reden staat in PostgREST en niet in het schema: een DELETE gaat als
 * `DELETE … RETURNING`, en met een RETURNING moet de rij óók door de
 * SELECT-policy. `user_blocks_select` is letterlijk dezelfde uitdrukking als
 * `user_blocks_delete`, dus bob ziet de rij van alice niet en komt nooit tot de
 * delete-policy. Zet je alleen de delete-policy open, dan verandert er niets.
 *
 * ⚠️ **Dat is een ándere vorm dan de kolomgrant-schaduw uit ronde 4.** Daar
 *    dekten de `using` en de `check` van één policy elkaar; hier dekt de
 *    SELECT-policy van de tabel een DELETE-policy. Het gevolg is algemener dan
 *    deze tabel: **elke DELETE-policy die samenvalt met de leespolicy van
 *    dezelfde tabel is per helft onbreekbaar**, en `rls:dekking` — dat één helft
 *    tegelijk openzet — zal zo'n policy altijd als "onbewaakt" melden. Lees die
 *    uitslag dus als een vráág en niet als een uitslag.
 *
 *    De test hieronder bewaakt de belofte wél: hij is geijkt door béide helften
 *    tegelijk open te zetten, en dat is hier de grendel. Eén mutatie per grendel
 *    blijft dus kloppen — de grendel is alleen het paar en niet de helft.
 *
 *    **Wordt per helft toetsbaar zodra de twee uitdrukkingen uit elkaar lopen**,
 *    bijvoorbeeld als een groepsbeheerder ooit blokkades van anderen mag lezen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Fixture {
  /** Blokkeert carol. Eigenaar van de rij waar de rest naar wijst. */
  alice: TestUser;
  /** Doet de pogingen die moeten falen. */
  bob: TestUser;
  carol: TestUser;
}

describe.skipIf(!rlsTestsConfigured)('Een blokkade is van de blokkeerder', () => {
  let f: Fixture;

  beforeAll(async () => {
    f = {
      alice: await createTestUser('blokkade-alice'),
      bob: await createTestUser('blokkade-bob'),
      carol: await createTestUser('blokkade-carol'),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** De rij zoals `service_role` hem ziet — buiten elke policy om. */
  const rij = (blocker: string, blocked: string) => () =>
    adminDb()
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .eq('blocker_id', blocker)
      .eq('blocked_id', blocked);

  /**
   * ⚠️⚠️ **Deze must-allow liep tot 0197 langs een rechtstreekse INSERT, en dat
   *    was niet de knop die hij zei te bewaken.** 📏 Nagemeten: geen enkel
   *    bestand in `src/` of `app/` schrijft naar `user_blocks`; de knop roept
   *    `blokkeer()` aan. De test toetste dus een grant die niemand gebruikte —
   *    de klasse van QS8-351.
   *
   *    Hij loopt nu langs de RPC, en dat is strenger dan het lijkt: `blokkeer()`
   *    geeft met opzet hetzelfde antwoord voor een bestaand en een onbestaand
   *    profiel-id, zodat je er niet mee kunt toetsen óf een account bestaat. Het
   *    rechtstreekse pad miste die gelijkmaker (📏 `23503` tegen `201`), en dat
   *    is de reden dat het weg is en niet alleen dat het ongebruikt was.
   */
  it(
    'laat een gebruiker zijn eigen blokkade zetten, langs blokkeer()',
    async () => {
      const uit = await f.alice.db.rpc('blokkeer', { p_user: f.carol.id });

      expect(uit.error, 'de RPC hoort te werken').toBeNull();
      expect((uit.data ?? {}) as { ok?: boolean }).toMatchObject({ ok: true });

      const na = await rij(f.alice.id, f.carol.id)();
      expect(na.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **En dit is wat de intrekking kost, opgeschreven in plaats van
   *    weggelaten.** `user_blocks_insert` (`blocker_id = auth.uid()`) is vanaf nu
   *    niet meer vanaf een client te bereiken: het ontbrekende INSERT-recht
   *    weigert eerder. De policy is daarmee dode grendel achter een dichte deur.
   *
   *    Dezelfde vorm als de CHECK uit 0007 bij QS8-352, en om dezelfde reden hier
   *    genoteerd: **een intrekking verandert wélke grendel als eerste weigert**,
   *    en daarmee wat elke bestaande must-deny in dit bestand nog toetst. De twee
   *    weigertoetsen hieronder meten sinds 0197 het récht en niet meer de policy.
   *    Ze staan er nog omdat de belofte ("een blokkade is van de blokkeerder")
   *    blijft gelden; wat ze bewijzen is smaller geworden.
   */
  it(
    'weigert een rechtstreekse INSERT, ook op je eigen naam',
    async () => {
      const { error } = await f.alice.db
        .from('user_blocks')
        .insert({ blocker_id: f.alice.id, blocked_id: f.bob.id });

      expect(error?.code, 'het rechtstreekse pad staat weer open').toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand een blokkade op andermans naam zetten',
    async () => {
      // ⚠️ `blocked_id` is bob zelf en niet carol: het paar (alice, carol)
      //    bestaat al na de test hierboven, en dan zou de primaire sleutel deze
      //    poging afwijzen in plaats van de policy. De grendel die je meet moet
      //    de énige zijn die dicht staat.
      const { error } = await f.bob.db
        .from('user_blocks')
        .insert({ blocker_id: f.alice.id, blocked_id: f.bob.id });

      expect(error, 'een blokkade op andermans naam hoort geweigerd te worden').not.toBeNull();
      expect(
        WEIGERCODES as readonly string[],
        `geweigerd met ${error?.code} — ${error?.message}. Dat is geen policy-weigering ` +
          'maar iets anders, en dan bewaakt deze test de verkeerde grendel',
      ).toContain(error?.code);

      const na = await rij(f.alice.id, f.bob.id)();
      expect(na.data ?? [], 'de rij landde alsnog').toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat niemand de blokkade van een ander weghalen',
    async () => {
      // ⚠️ Een DELETE die op de `using` afketst raakt nul rijen en geeft géén
      //    fout: PostgREST antwoordt met 204 en de test zou dat voor succes
      //    aanzien. `magNietLanden()` leest daarom vóór en ná met `adminDb()`.
      await magNietLanden(
        () =>
          f.bob.db
            .from('user_blocks')
            .delete()
            .eq('blocker_id', f.alice.id)
            .eq('blocked_id', f.carol.id),
        rij(f.alice.id, f.carol.id),
      );
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de blokkeerder zijn eigen blokkade wél weghalen',
    async () => {
      // ⚠️ Als laatste, want hij ruimt de rij op waar de twee tests hierboven
      //    naar wijzen. En het is de tweede must-allow: een blokkade die je niet
      //    meer kwijtraakt is net zo stuk als een die iedereen kan weghalen.
      const { error } = await f.alice.db
        .from('user_blocks')
        .delete()
        .eq('blocker_id', f.alice.id)
        .eq('blocked_id', f.carol.id);

      expect(error).toBeNull();

      const na = await rij(f.alice.id, f.carol.id)();
      expect(na.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});
