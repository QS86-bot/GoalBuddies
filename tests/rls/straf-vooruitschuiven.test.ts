/**
 * Een openstaande straf laat de deadline niet vooruit schuiven — QS8-317,
 * migratie 0184.
 *
 * ⚠️ **De belofte is domeinregel 11 en niet een tak in een functie.** "Een straf
 *    treedt alleen in werking bij een verstreken deadline" is leeg zodra de
 *    gestrafte die deadline zelf kan verzetten. Deze suite toetst daarom de
 *    keten en niet de weigering: straf → verstreken deadline → poging → job →
 *    `due`. Een test die alleen `straf_staat_open` afleest, blijft groen zodra
 *    iemand de job aan iets anders ophangt.
 *
 * ⚠️ **De naad zat tussen twee correcte onderdelen** (regel 18, vraag 1).
 *    `commitments_insert` eist een begunstigde, en dat klopt.
 *    `zet_streefdatum()` weigert bij een gekoppeld doel, en dat klopt ook. Maar
 *    de begunstigde is een groep waar de **eigenaar** lid van is, niet een groep
 *    waar het **doel** aan hangt — dus een ongekoppeld doel kon een straf dragen
 *    én vrij verzetbaar zijn. Geen van beide onderdelen was stuk.
 *
 * ⚠️ **Vooruit is de grens, niet "er staat een straf".** Een deadline naar voren
 *    halen maakt de straf eerder verschuldigd. Dat blokkeren zou de gebruiker
 *    straffen voor het strengste dat hij kan doen, dus daar staat een must-allow
 *    op — en zonder die must-allow is een te brede grendel niet te onderscheiden
 *    van de juiste.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  groupId: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string; changed?: boolean } {
  return (data ?? {}) as { ok?: boolean; reason?: string; changed?: boolean };
}

describe.skipIf(!rlsTestsConfigured)('een openstaande straf en de streefdatum', () => {
  beforeAll(async () => {
    const alice = await createTestUser('vooruit-alice');
    const bob = await createTestUser('vooruit-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Vooruitgroep' });
    const gd = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    // ⚠️ Zelfde reden als in `straf-plafond.test.ts`: `mijn_datum()` rekent in
    //    `profiles.tz` en `vandaag` hierboven is UTC. Zonder dit wordt deze suite
    //    tussen 22:00 en 24:00 UTC rood op de klok in plaats van op de code.
    const zone = await adminDb()
      .from('profiles')
      .update({ tz: 'UTC' })
      .in('id', [alice.id, bob.id]);
    if (zone.error) throw new Error(`tijdzone vastzetten: ${zone.error.message}`);

    w = { alice, bob, groupId: gd.group.id, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een ongekoppeld doel van Alice met een streefdatum die je meegeeft. */
  async function losDoel(titel: string, datum: IsoDate): Promise<string> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: datum })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    return doel.data.id as string;
  }

  /** Een straf op dat doel, oud genoeg om de dagrem van 0171 te passeren. */
  async function strafOp(doelId: string): Promise<string> {
    const gisteren = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const straf = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doelId,
        type: 'penalty',
        body: 'Ik trakteer de groep',
        beneficiary_group_id: w.groupId,
        confirmed_at: gisteren,
        created_at: gisteren,
      })
      .select('id')
      .single();
    if (straf.error) throw new Error(`straf: ${straf.error.message}`);
    return straf.data.id as string;
  }

  async function standVan(strafId: string): Promise<string> {
    const rij = await adminDb().from('commitments').select('status').eq('id', strafId).single();
    if (rij.error) throw new Error(`stand: ${rij.error.message}`);
    return rij.data.status as string;
  }

  async function datumVan(doelId: string): Promise<string> {
    const rij = await adminDb().from('goals').select('target_date').eq('id', doelId).single();
    if (rij.error) throw new Error(`datum: ${rij.error.message}`);
    return rij.data.target_date as string;
  }

  // -------------------------------------------------------------------------
  describe('de belofte: je koopt je niet uit je eigen straf', () => {
    it(
      'de eigenaar kan zijn verschuldigd-worden niet vooruit schuiven, en de job maakt de straf alsnog verschuldigd',
      async () => {
        // ⚠️ **Dit is de hele keten en niet de weigering.** De deadline is
        //    verstreken; zonder 0184 gaf de poging `{ok: true}` en telde de job
        //    daarna 0. Gemeten vóór de fix, precies zo.
        const doelId = await losDoel('VOORUIT ontsnapping', addDays(w.vandaag, -1));
        const strafId = await strafOp(doelId);

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, 30),
        });
        expect(poging.error, `rpc: ${poging.error?.message}`).toBeNull();
        expect(uit(poging.data).ok, 'de deadline schoof vooruit met een straf erop').toBe(false);
        expect(uit(poging.data).reason).toBe('straf_staat_open');

        // De datum staat er nog zoals hij stond — de weigering is geen halve.
        expect(await datumVan(doelId)).toBe(addDays(w.vandaag, -1));

        const job = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: w.alice.id,
          p_vandaag: w.vandaag,
        });
        expect(job.error, `job: ${job.error?.message}`).toBeNull();
        expect(await standVan(strafId)).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'herhalen helpt niet — drie pogingen achter elkaar verzetten niets',
      async () => {
        // ⚠️ De vorm van QS8-317: het gat was niet dat één verschuiving lukte,
        //    maar dat er geen bovengrens aan zat. Eén geslaagde poging is genoeg
        //    om de straf voor altijd weg te houden.
        const doelId = await losDoel('VOORUIT herhaald', addDays(w.vandaag, -1));
        await strafOp(doelId);

        for (const dagen of [10, 20, 30]) {
          const poging = await w.alice.db.rpc('zet_streefdatum', {
            p_goal_id: doelId,
            p_date: addDays(w.vandaag, dagen),
          });
          expect(uit(poging.data).ok, `poging op +${dagen} kwam erdoor`).toBe(false);
        }

        expect(await datumVan(doelId)).toBe(addDays(w.vandaag, -1));
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de must-allows: de grendel is niet breder dan de belofte', () => {
    it(
      'de deadline naar vóren halen mag wél, ook met een straf erop',
      async () => {
        // ⚠️ **Zonder deze test is een te brede grendel niet te zien.** Naar
        //    voren halen maakt de straf eerder verschuldigd; dat blokkeren zou
        //    de gebruiker beletten strenger voor zichzelf te zijn.
        const doelId = await losDoel('VOORUIT naar voren', addDays(w.vandaag, 30));
        await strafOp(doelId);

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, 5),
        });
        expect(poging.error, `rpc: ${poging.error?.message}`).toBeNull();
        expect(uit(poging.data).ok, `naar voren halen geweigerd: ${JSON.stringify(poging.data)}`).toBe(
          true,
        );
        expect(await datumVan(doelId)).toBe(addDays(w.vandaag, 5));
      },
      TEST_TIMEOUT,
    );

    it(
      'een doel zonder straf schuift gewoon vooruit',
      async () => {
        // ⚠️ De grendel hangt aan de straf en niet aan het doel. Zonder deze
        //    test is "niemand kan meer iets verzetten" ook groen.
        const doelId = await losDoel('VOORUIT zonder straf', addDays(w.vandaag, 10));

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, 40),
        });
        expect(uit(poging.data).ok, `zonder straf geweigerd: ${JSON.stringify(poging.data)}`).toBe(
          true,
        );
        expect(await datumVan(doelId)).toBe(addDays(w.vandaag, 40));
      },
      TEST_TIMEOUT,
    );

    it(
      'een straf die al verschuldigd is blokkeert het opnieuw plannen niet',
      async () => {
        // ⚠️ Alleen `set` is de stand die de job nog kan omzetten. Vanaf `due`
        //    zet alleen `beslis_deadline_verzoek()` hem terug (0177), en dat
        //    vraagt een buddy — dus daar valt niets te ontsnappen.
        const doelId = await losDoel('VOORUIT al due', addDays(w.vandaag, -1));
        const strafId = await strafOp(doelId);

        const job = await adminDb().rpc('maak_straffen_verschuldigd', {
          p_owner_id: w.alice.id,
          p_vandaag: w.vandaag,
        });
        expect(job.error, `job: ${job.error?.message}`).toBeNull();
        expect(await standVan(strafId)).toBe('due');

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, 30),
        });
        expect(uit(poging.data).ok, `opnieuw plannen geweigerd: ${JSON.stringify(poging.data)}`).toBe(
          true,
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'een gekoppeld doel leest nog steeds "vraag je groep" en niet "er staat een straf"',
      async () => {
        // ⚠️ De volgorde van de takken is zelf een belofte: bij een gekoppeld
        //    doel bestaat de route via `vraag_deadline_verschuiving()` wél, en
        //    die moet de gebruiker aangeboden krijgen. Zet iemand de nieuwe tak
        //    vóór `needs_group_approval`, dan wordt deze rood.
        const doelId = await losDoel('VOORUIT gekoppeld', addDays(w.vandaag, 10));
        await strafOp(doelId);

        const koppel = await adminDb()
          .from('goal_group_links')
          .insert({ goal_id: doelId, group_id: w.groupId });
        expect(koppel.error, `koppelen: ${koppel.error?.message}`).toBeNull();

        const poging = await w.alice.db.rpc('zet_streefdatum', {
          p_goal_id: doelId,
          p_date: addDays(w.vandaag, 40),
        });
        expect(uit(poging.data).ok).toBe(false);
        expect(uit(poging.data).reason).toBe('needs_group_approval');
      },
      TEST_TIMEOUT,
    );
  });
});
