/**
 * Een bevestigde straf verdwijnt niet zonder spoor — QS8-331, migratie 0189.
 *
 * ⚠️ **De belofte is het spoor en niet de tak.** Domeinregel 5 zegt dat een
 *    commitment device auditeerbaar moet zijn; domeinregel 6 dat geschiedenis
 *    met een correctie-record wordt bijgesteld en niet overschreven. Een
 *    auditregel die met één knop meecascadeert, haalt geen van beide.
 *
 * ⚠️⚠️ **De poort van 0058 was te smal, en dat is de hele wijziging.** Die
 *    blokkeerde alleen `unlocked`, `due` en `resolved` — de standen die de groep
 *    ziet. Maar 📏 `commitments.confirmed_at` is `NOT NULL`, dus élke rij is een
 *    bevestigde afspraak; een straf op `set` is vastgelegd, ook al kan niemand
 *    anders hem lezen. De vraag is niet wie het gezien heeft maar of het gebeurd
 *    is.
 *
 * ⚠️ De must-allow staat er even hard in: een doel zonder commitment blijft
 *    binnen de bedenktijd gewoon te verwijderen. Zonder die test is "niemand kan
 *    meer iets verwijderen" ook groen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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
  groupId: string;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('een bevestigde straf en het spoor dat blijft', () => {
  beforeAll(async () => {
    const alice = await createTestUser('spoor-alice');
    const groep = await alice.db.rpc('create_group', { group_name: 'Spoorgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    w = { alice, groupId: gd.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een vers, ongekoppeld doel binnen de bedenktijd van 24 uur. */
  async function versDoel(titel: string): Promise<string> {
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: w.alice.id, title: titel, target_date: '2027-01-01' })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);
    return doel.data.id as string;
  }

  /** Een straf via precies de kolommen die de client mag schrijven. */
  async function strafOp(doelId: string, soort: 'penalty' | 'reward' = 'penalty'): Promise<void> {
    const r = await w.alice.db.from('commitments').insert({
      goal_id: doelId,
      type: soort,
      body: 'Ik trakteer de groep',
      beneficiary_group_id: w.groupId,
      confirmed_at: new Date().toISOString(),
    });
    if (r.error) throw new Error(`commitment: ${r.error.message}`);
  }

  // -------------------------------------------------------------------------
  describe('de belofte: geen straf verdwijnt zonder spoor', () => {
    it(
      'een doel met een bevestigde straf is niet te verwijderen, en de auditregel blijft staan',
      async () => {
        // ⚠️ Dit is de keten en niet de tak: straf → auditregel → poging →
        //    weigering → de auditregel staat er nog. Vóór 0189 gaf dit
        //    `{ok:true}` en waren beide rijen weg.
        const doelId = await versDoel('SPOOR met straf');
        await strafOp(doelId);

        const vooraf = await adminDb()
          .from('commitment_events')
          .select('id, commitment_id, commitments!inner(goal_id)')
          .eq('commitments.goal_id', doelId);
        expect(vooraf.error, `auditregels: ${vooraf.error?.message}`).toBeNull();
        expect((vooraf.data ?? []).length, 'er is geen auditregel gemaakt').toBeGreaterThan(0);

        const weg = await w.alice.db.rpc('verwijder_doel', { p_goal_id: doelId });
        expect(uit(weg.data).ok, 'het doel is mét straf verwijderd').toBe(false);
        expect(uit(weg.data).reason).toBe('heeft_commitment');

        const na = await adminDb()
          .from('commitment_events')
          .select('id, commitments!inner(goal_id)')
          .eq('commitments.goal_id', doelId);
        expect((na.data ?? []).length, 'het auditspoor is verdwenen').toBe((vooraf.data ?? []).length);
      },
      TEST_TIMEOUT,
    );

    it(
      'intrekken en dan verwijderen werkt ook niet — de intrekking ís het spoor',
      async () => {
        // ⚠️ De omweg die een smallere poort zou openlaten. Een ingetrokken straf
        //    is `cancelled` en blijft als rij staan; zou die niet meetellen, dan
        //    is intrekken-dan-weggooien precies het gat dat 0189 sluit.
        const doelId = await versDoel('SPOOR ingetrokken');
        await strafOp(doelId);

        const rij = await adminDb()
          .from('commitments')
          .select('id')
          .eq('goal_id', doelId)
          .single();
        const trek = await w.alice.db
          .from('commitments')
          .update({ status: 'cancelled' })
          .eq('id', rij.data!.id);
        expect(trek.error, `intrekken: ${trek.error?.message}`).toBeNull();

        const weg = await w.alice.db.rpc('verwijder_doel', { p_goal_id: doelId });
        expect(uit(weg.data).ok, 'intrekken opende de weg naar verwijderen').toBe(false);
        expect(uit(weg.data).reason).toBe('heeft_commitment');
      },
      TEST_TIMEOUT,
    );

    it(
      'ook een beloning houdt het doel vast — het spoor is niet alleen van straffen',
      async () => {
        // ⚠️ `noteer_commitment()` schrijft voor beide soorten een auditregel, dus
        //    de geschiedenis die domeinregel 6 bedoelt is er ook bij een beloning.
        const doelId = await versDoel('SPOOR beloning');
        await strafOp(doelId, 'reward');

        const weg = await w.alice.db.rpc('verwijder_doel', { p_goal_id: doelId });
        expect(uit(weg.data).ok).toBe(false);
        expect(uit(weg.data).reason).toBe('heeft_commitment');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de must-allow: zonder commitment blijft verwijderen gewoon werken', () => {
    it(
      'een vers doel zonder commitment is binnen de bedenktijd te verwijderen',
      async () => {
        // ⚠️ Zonder deze test is een te brede poort niet te zien: "niemand kan
        //    meer iets verwijderen" zou de drie tests hierboven ook groen laten.
        const doelId = await versDoel('SPOOR schoon');

        const weg = await w.alice.db.rpc('verwijder_doel', { p_goal_id: doelId });
        expect(uit(weg.data).ok, `een schoon doel werd geweigerd: ${JSON.stringify(weg.data)}`).toBe(
          true,
        );

        const na = await adminDb().from('goals').select('id').eq('id', doelId).maybeSingle();
        expect(na.data, 'het doel staat er nog').toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
