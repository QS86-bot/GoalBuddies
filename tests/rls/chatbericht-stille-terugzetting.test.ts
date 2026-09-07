/**
 * Een chatbericht meldt geen succes over wat het niet wijzigt — QS8-326,
 * migratie 0187.
 *
 * ⚠️ **De belofte is niet "de metagegevens liggen vast" maar "de server liegt
 *    niet over wat hij gedaan heeft".** Vastliggen deden ze al: `stamp_chat_message()`
 *    zette acht kolommen terug. Wat ontbrak was de melding — een verzoek dat
 *    alleen `payload` wijzigde kreeg HTTP 200 en een rij waarin niets veranderd
 *    was. Dat is de vorm van QS8-314.
 *
 * ⚠️⚠️ **De naad zit tussen de trigger en de foreign key** (regel 18, vraag 1).
 *    `chat_messages` heeft drie `on delete set null`-verwijzingen naar
 *    `profiles`, dus een verwijderd account laat Postgres zélf een UPDATE doen
 *    dwars door deze trigger. Een kale `is distinct from` zou daarop afgaan en
 *    het verwijderen van een account breken — precies wat 0033 belooft te laten
 *    werken. Alleen gevuld → NULL op die drie kolommen gaat daarom door.
 *    De test op die overgang is de belangrijkste van dit bestand.
 *
 * ⚠️ De must-allows staan er even hard in: `body` en `attachment_url` blijven
 *    bewerkbaar, en een verzoek dat niets verandert blijft een gewone update.
 *    Een grendel die ook de bedoelde bewerking tegenhoudt, is geen grendel maar
 *    een storing.
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

describe.skipIf(!rlsTestsConfigured)('een chatbericht en zijn stille terugzetting', () => {
  beforeAll(async () => {
    const alice = await createTestUser('stilchat-alice');
    const groep = await alice.db.rpc('create_group', { group_name: 'Stille chat' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
    w = { alice, groupId: gd.group.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een vers bericht van Alice — binnen het bewerkvenster van vijftien minuten. */
  async function versBericht(tekst: string): Promise<string> {
    const rij = await adminDb()
      .from('chat_messages')
      .insert({ group_id: w.groupId, sender_id: w.alice.id, type: 'text', body: tekst })
      .select('id')
      .single();
    if (rij.error) throw new Error(`bericht: ${rij.error.message}`);
    return rij.data.id as string;
  }

  // -------------------------------------------------------------------------
  describe('de belofte: geen succes over wat niet gebeurd is', () => {
    it(
      'een verzoek dat alleen een vastliggende kolom wijzigt, meldt geen succes',
      async () => {
        // ⚠️ Dit was vóór 0187 HTTP 200 met een ongewijzigde rij. Gemeten.
        const id = await versBericht('payload-poging');

        const uit = await w.alice.db.from('chat_messages').update({ payload: { x: 1 } }).eq('id', id);

        expect(uit.error, 'een payload-wijziging kwam er stil doorheen').not.toBeNull();

        const na = await adminDb().from('chat_messages').select('payload').eq('id', id).single();
        expect(na.data?.payload, 'payload is tóch veranderd').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een verzoek dat de tekst wél en het type niet mag wijzigen, wijzigt geen van beide',
      async () => {
        // ⚠️ De halve vorm: vóór 0187 veranderde `body` en bleef `type` staan, met
        //    succes erop. Half doen en heel melden is de ergste van de twee.
        const id = await versBericht('half-poging');

        const uit = await w.alice.db
          .from('chat_messages')
          .update({ body: 'nieuw', type: 'system' })
          .eq('id', id);

        expect(uit.error, 'een type-wijziging kwam er stil doorheen').not.toBeNull();

        const na = await adminDb().from('chat_messages').select('body, type').eq('id', id).single();
        expect(na.data?.body, 'de body is half doorgevoerd').toBe('half-poging');
        expect(na.data?.type).toBe('text');
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de naad: de foreign key mag er wél doorheen', () => {
    it(
      'een verwijderd account leegt de persoonskolommen en het bericht blijft staan',
      async () => {
        // ⚠️⚠️ **De belangrijkste test van dit bestand.** `on delete set null`
        //    voert een UPDATE uit door deze trigger heen. Werpt de grendel daar
        //    ook, dan is een account niet meer te verwijderen — en dat is precies
        //    wat 0033 belooft: anonimiseren, niet wissen.
        const bob = await createTestUser('stilchat-bob');
        const rij = await adminDb()
          .from('chat_messages')
          .insert({
            group_id: w.groupId,
            sender_id: bob.id,
            actor_id: bob.id,
            subject_id: bob.id,
            type: 'text',
            body: 'van bob',
          })
          .select('id')
          .single();
        expect(rij.error, `bericht van bob: ${rij.error?.message}`).toBeNull();
        const id = rij.data!.id as string;

        const weg = await adminDb().from('profiles').delete().eq('id', bob.id);
        expect(weg.error, `het account is niet te verwijderen: ${weg.error?.message}`).toBeNull();

        const na = await adminDb()
          .from('chat_messages')
          .select('body, sender_id, actor_id, subject_id')
          .eq('id', id)
          .single();
        expect(na.data?.body, 'het bericht is meeverdwenen').toBe('van bob');
        expect(na.data?.sender_id).toBeNull();
        expect(na.data?.actor_id).toBeNull();
        expect(na.data?.subject_id).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  // -------------------------------------------------------------------------
  describe('de must-allows: de bedoelde bewerking blijft werken', () => {
    it(
      'de tekst wijzigen binnen het venster gaat gewoon door',
      async () => {
        const id = await versBericht('voor');

        const uit = await w.alice.db.from('chat_messages').update({ body: 'na' }).eq('id', id);
        expect(uit.error, `een gewone bewerking werd geweigerd: ${uit.error?.message}`).toBeNull();

        const na = await adminDb().from('chat_messages').select('body').eq('id', id).single();
        expect(na.data?.body).toBe('na');
      },
      TEST_TIMEOUT,
    );

    it(
      'een verzoek dat niets verandert blijft een gewone update',
      async () => {
        // ⚠️ `is distinct from` en niet "is de kolom meegestuurd": een client die
        //    de hele rij terugstuurt, verandert niets en hoort niets te merken.
        const id = await versBericht('gelijk');

        const uit = await w.alice.db.from('chat_messages').update({ body: 'gelijk' }).eq('id', id);
        expect(uit.error, `een no-op werd geweigerd: ${uit.error?.message}`).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
