import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  claimsVan,
  createTestUser,
  gebruikerDb,
  echteSessie,
  removeTestUsers,
  rlsTestsConfigured,
  tekenGebruikersToken,
  type TestUser,
} from './harness';

/**
 * De poort onder de hele RLS-suite — QS8-116.
 *
 * ⚠️ **Draai dit bestand eerst.** Alle andere bestanden in `tests/rls/` gaan
 *    ervan uit dat een zelfgetekend token doet wat een token van GoTrue doet.
 *    Klopt die aanname niet, dan worden ze allemaal rood om dezelfde reden, en
 *    dan wil je één bestand zien dat de oorzaak benoemt in plaats van zeven die
 *    naar de policies wijzen. Dat is exact de fout die QS8-116 kwam repareren.
 *
 * Twee dingen worden hier bewezen en verder nergens:
 *
 *   1. Het token werkt — PostgREST accepteert het en `auth.uid()` klopt.
 *   2. Het token is niet te onderscheiden van een echt token, op de claims waar
 *      autorisatie aan hangt.
 */

const SETUP_TIMEOUT = 30_000;

describe.skipIf(!rlsTestsConfigured)('QS8-116 — zelfgetekende tokens', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    alice = await createTestUser('token-alice');
    bob = await createTestUser('token-bob');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('het token doet wat een token hoort te doen', () => {
    it('laat de eigenaar zijn eigen profielrij lezen', async () => {
      const { data, error } = await alice.db
        .from('profiles')
        .select('id')
        .eq('id', alice.id)
        .single();

      expect(error).toBeNull();
      expect(data?.id).toBe(alice.id);
    });

    /**
     * ⚠️ De negatieve helft. Zonder deze test bewijst de vorige niets: een
     *    kapotte RLS zou hem net zo goed groen laten. Zie de valkuil uit
     *    CLAUDE.md — een "de groep mag dit niet zien"-test hoort altijd een
     *    positieve controle naast zich te hebben, en andersom.
     */
    it('laat een ander die rij niet lezen', async () => {
      const { data, error } = await bob.db
        .from('profiles')
        .select('id')
        .eq('id', alice.id)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).toBeNull();
    });

    it('geeft een token dat bij de juiste gebruiker hoort', () => {
      expect(claimsVan(alice.token).sub).toBe(alice.id);
      expect(claimsVan(bob.token).sub).toBe(bob.id);
      expect(alice.token).not.toBe(bob.token);
    });

    /**
     * Een token met een verkeerde handtekening moet stuiten. Anders zegt het
     * bovenstaande alleen dat PostgREST íets accepteert, niet dat hij controleert.
     */
    it('weigert een token waarvan de handtekening niet klopt', async () => {
      const stukken = alice.token.split('.');
      const vervalst = `${stukken[0]}.${stukken[1]}.${'x'.repeat(43)}`;

      const { error } = await gebruikerDb(vervalst).from('profiles').select('id');

      expect(error).not.toBeNull();
    });
  });

  /**
   * De controletest — het gat dat richting C openlaat.
   *
   * ⚠️ Dit is de énige plek in de hele suite waar nog echt wordt ingelogd. Wat
   *    we met C opgeven is het bewijs dat GoTrue zelf correcte claims uitgeeft;
   *    hier wordt dat één keer per run alsnog gecontroleerd. Voeg hier geen
   *    tweede `echteSessie()` aan toe — dan is de limiet terug.
   */
  describe('de controle tegen een echt token', () => {
    it(
      'draagt dezelfde autorisatieclaims als een token van GoTrue',
      async () => {
        const echt = await echteSessie('token-echt');
        const eigen = tekenGebruikersToken(echt.userId, echt.email);

        const vanGoTrue = claimsVan(echt.accessToken);
        const vanOns = claimsVan(eigen);

        // ⚠️ Gelijkheid toetsen, claim voor claim. Twee insluitingen zijn geen
        //    gelijkheid — dat staat niet voor niets in de valkuilenlijst.
        for (const claim of ['sub', 'role', 'aud', 'iss'] as const) {
          expect(vanOns[claim], `claim ${claim}`).toEqual(vanGoTrue[claim]);
        }
      },
      SETUP_TIMEOUT,
    );
  });
});
