import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ⚠️ Rechtstreeks uit `voorkeur.ts` en niet uit `index.ts`: die trekt de
//    datalaag en daarmee React Native mee (zie `helden.test.ts`).
import {
  DICHTHEDEN,
  KLEURVARIANTEN,
  STANDAARD_VOORKEUR,
  STIJLEN,
  WEERGAVEN,
} from '../../src/modules/uiterlijk/voorkeur';

import {
  adminDb,
  anonDb,
  createTestUser,
  magNietLanden,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const TEST_TIMEOUT = 30_000;
/**
 * ⚠️ Een ongetypeerde rand, want `database.types.ts` kent de tabel pas na de
 *    uitrol en `npm run types:db` (de migratie wacht op Quintens backup).
 */
const voorkeuren = (db: unknown) => (db as SupabaseClient).from('gebruikersvoorkeuren');

const KOLOMMEN = 'stijl, kleurvariant, weergave, dichtheid, emoji, bijgewerkt_op';

/**
 * De uiterlijkvoorkeur is van de eigenaar en van niemand anders — QS8-729,
 * migratie 0303.
 *
 * ⚠️ **`ander` is een groepsgenoot en geen willekeurige vreemde**, om dezelfde
 *    reden als in `helden.test.ts`: een vreemde toetst niets wat hier gevaarlijk
 *    is. Een groepstak op `gebruikersvoorkeuren_select` laat een vreemde buiten
 *    en een groepsgenoot binnen; alleen de tweede opzet wordt dan rood.
 *
 * ⚠️ **De schrijfvorm is insert of voorwaardelijke update, nooit `upsert`.**
 *    `user_id` staat in `grant insert` en niet in `grant update`; PostgREST zet
 *    bij `merge-duplicates` elke payloadkolom in de `do update`-lijst en dat
 *    geeft 42501. Hieronder staat dat als bewijs, zodat niemand de module
 *    terug naar een upsert herschrijft.
 *
 * IJKING (met de hand, 19-11-2026, één mutatie per grendel): zie de PR-tekst
 * van QS8-729 voor de uitkomsten per mutatie.
 */
describe.skipIf(!rlsTestsConfigured)('gebruikersvoorkeuren', () => {
  let eigenaar: TestUser;
  let ander: TestUser;

  beforeAll(async () => {
    eigenaar = await createTestUser('voorkeur-eigenaar');
    ander = await createTestUser('voorkeur-ander');

    const groep = await eigenaar.db.rpc('create_group', {
      group_name: 'Voorkeur',
    });
    const groepData = groep.data as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }
    registreerGroep(groepData.group.id);
    const mee = await ander.db.rpc('join_group_with_code', {
      code: groepData.group.invite_code,
    });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) throw new Error('ander werd geen lid');

    const nieuw = await voorkeuren(eigenaar.db).insert({
      user_id: eigenaar.id,
      stijl: 'c',
      kleurvariant: 'koraal',
    });
    if (nieuw.error) throw new Error(`opstelling: ${nieuw.error.message}`);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TEST_TIMEOUT);

  describe('een ander ziet niets', () => {
    it(
      'leest nul rijen, ook als groepsgenoot, en anon krijgt een weigering',
      async () => {
        const mijn = await voorkeuren(eigenaar.db).select(KOLOMMEN);
        expect(mijn.error).toBeNull();
        expect(mijn.data ?? []).toHaveLength(1);

        const vreemd = await voorkeuren(ander.db).select(KOLOMMEN);
        expect(vreemd.error).toBeNull();
        expect(vreemd.data ?? []).toHaveLength(0);

        const anon = await voorkeuren(anonDb()).select('user_id');
        expect(anon.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot kan de rij niet wijzigen',
      async () => {
        await magNietLanden(
          () =>
            voorkeuren(ander.db)
              .update({ stijl: 'a', kleurvariant: 'geen' })
              .eq('user_id', eigenaar.id)
              .select('user_id'),
          () => voorkeuren(eigenaar.db).select(KOLOMMEN),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'een ander kan geen rij op andermans naam aanmaken',
      async () => {
        const r = await voorkeuren(ander.db).insert({ user_id: eigenaar.id });
        expect(r.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'niemand kan een rij weghalen: er is geen DELETE-grant',
      async () => {
        const eigen = await voorkeuren(eigenaar.db).delete().eq('user_id', eigenaar.id);
        expect(eigen.error?.code).toBe('42501');
        const vreemd = await voorkeuren(ander.db).delete().eq('user_id', eigenaar.id);
        expect(vreemd.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de schrijfvorm', () => {
    it(
      'een upsert geeft 42501, en daarom is de module insert-of-update',
      async () => {
        const r = await voorkeuren(eigenaar.db).upsert({
          user_id: eigenaar.id,
          stijl: 'b',
          kleurvariant: 'geen',
        });
        expect(r.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'de client kan bijgewerkt_op niet zetten',
      async () => {
        const r = await voorkeuren(eigenaar.db)
          .update({ bijgewerkt_op: '2001-01-01T00:00:00Z' })
          .eq('user_id', eigenaar.id);
        expect(r.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );

    it(
      'user_id is na het aanmaken niet meer te verzetten',
      async () => {
        const r = await voorkeuren(eigenaar.db)
          .update({ user_id: ander.id })
          .eq('user_id', eigenaar.id);
        expect(r.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('de database bepaalt wat nieuwer is', () => {
    it(
      'een wijziging schuift bijgewerkt_op op, en de voorwaardelijke update raakt hem één keer',
      async () => {
        const voor = await voorkeuren(eigenaar.db).select('bijgewerkt_op').single();
        const basis = voor.data?.bijgewerkt_op as string;
        expect(typeof basis).toBe('string');

        const eerste = await voorkeuren(eigenaar.db)
          .update({ stijl: 'c', kleurvariant: 'baai' })
          .eq('user_id', eigenaar.id)
          .eq('bijgewerkt_op', basis)
          .select('bijgewerkt_op');
        expect(eerste.error).toBeNull();
        expect(eerste.data ?? []).toHaveLength(1);
        expect(eerste.data?.[0]?.bijgewerkt_op).not.toBe(basis);

        // Het "tweede apparaat" kwam te laat: de basis is nu verouderd.
        const tweede = await voorkeuren(eigenaar.db)
          .update({ stijl: 'a', kleurvariant: 'geen' })
          .eq('user_id', eigenaar.id)
          .eq('bijgewerkt_op', basis)
          .select('bijgewerkt_op');
        expect(tweede.error).toBeNull();
        expect(tweede.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('de waarden en de standaard', () => {
    it(
      'de kolomdefaults zijn de standaard van de module',
      async () => {
        const nieuweling = await createTestUser('voorkeur-nieuw');
        const r = await voorkeuren(nieuweling.db)
          .insert({ user_id: nieuweling.id })
          .select(KOLOMMEN)
          .single();
        expect(r.error).toBeNull();
        const { bijgewerkt_op: tijd, ...rest } = r.data as Record<string, unknown>;
        expect(typeof tijd).toBe('string');
        expect(rest).toEqual(STANDAARD_VOORKEUR);
      },
      TEST_TIMEOUT,
    );

    it(
      'elke bekende waarde wordt aangenomen en een onbekende geweigerd',
      async () => {
        const u = await createTestUser('voorkeur-waarden');
        await voorkeuren(u.db).insert({ user_id: u.id });
        const zet = (v: Record<string, unknown>) =>
          voorkeuren(u.db).update(v).eq('user_id', u.id).select('user_id');

        for (const stijl of STIJLEN) {
          const kleurvariant = stijl === 'c' ? 'baai' : 'geen';
          expect((await zet({ stijl, kleurvariant })).error).toBeNull();
        }
        for (const kleurvariant of KLEURVARIANTEN.filter((k) => k !== 'geen')) {
          expect((await zet({ stijl: 'c', kleurvariant })).error).toBeNull();
        }
        for (const weergave of WEERGAVEN) expect((await zet({ weergave })).error).toBeNull();
        for (const dichtheid of DICHTHEDEN) expect((await zet({ dichtheid })).error).toBeNull();

        for (const slecht of [{ stijl: 'd' }, { weergave: 'navy' }, { dichtheid: 'krap' }]) {
          expect((await zet(slecht)).error?.code).toBe('23514');
        }
        expect((await zet({ stijl: 'c', kleurvariant: 'roze' })).error?.code).toBe('23514');
      },
      TEST_TIMEOUT,
    );

    it(
      'een variant hoort bij C en niets anders, in beide richtingen',
      async () => {
        const u = await createTestUser('voorkeur-koppeling');
        const b = await voorkeuren(u.db).insert({
          user_id: u.id,
          stijl: 'b',
          kleurvariant: 'koraal',
        });
        expect(b.error?.code).toBe('23514');
        const c = await voorkeuren(u.db).insert({
          user_id: u.id,
          stijl: 'c',
          kleurvariant: 'geen',
        });
        expect(c.error?.code).toBe('23514');
      },
      TEST_TIMEOUT,
    );
  });

  describe('geen groepsoppervlak, geen realtime', () => {
    it(
      'realtime_bewaking() kent de tabel, buiten de publicatie en zonder REPLICA IDENTITY FULL',
      async () => {
        const { data, error } = await adminDb().rpc('realtime_bewaking');
        expect(error).toBeNull();
        const rijen = (data ?? []) as {
          tabel: string;
          in_publicatie: boolean;
          replica_identity: string;
        }[];
        // ⚠️ Eerst bewijzen dat de tabel er staat: een lijst zonder haar is "niet in de publicatie" gratis.
        const rij = rijen.find((r) => r.tabel === 'gebruikersvoorkeuren');
        expect(rij).toBeDefined();
        expect(rij?.in_publicatie).toBe(false);
        expect(rij?.replica_identity).toBe('default');
      },
      TEST_TIMEOUT,
    );
  });

  it(
    'neemt de rij mee bij accountverwijdering',
    async () => {
      const vertrekker = await createTestUser('voorkeur-vertrekker');
      await voorkeuren(vertrekker.db).insert({ user_id: vertrekker.id });
      const admin = adminDb();
      const voor = await voorkeuren(admin).select('user_id').eq('user_id', vertrekker.id);
      expect(voor.data ?? []).toHaveLength(1);

      await admin.from('profiles').delete().eq('id', vertrekker.id);

      const na = await voorkeuren(admin).select('user_id').eq('user_id', vertrekker.id);
      expect(na.data ?? []).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );
});
