/**
 * Een chatbericht meldt geen succes over wat het niet wijzigt — QS8-326,
 * migratie 0188.
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
 *
 * ⚠️⚠️ **Sinds 0193 (QS8-327) loopt élke UPDATE hier via `adminDb()`, en dat is
 *    geen gemak maar de enige manier waarop dit bestand nog meet wat het zegt.**
 *    Die migratie haalde `chat_messages_update` en de tien UPDATE-kolomrechten
 *    weg, want het bewerkrecht had nooit een knop. Gevolg: een client krijgt
 *    `42501` vóór de trigger ook maar draait.
 *
 *    Twee gevallen hieronder vielen daardoor om — de must-allows, die een
 *    geslaagde bewerking eisen. **De andere vier bleven groen, en dát was het
 *    gevaar:** ze toetsen `error not toBeNull()`, en `42501` is ook een fout. Ze
 *    zouden dus zijn blijven staan als bewijs voor een trigger die ze niet meer
 *    aanraakten. Precies de valstrik die dit bestand bij `type: 'photo'` al een
 *    keer opleverde — groen om de verkeerde reden.
 *
 *    Een trigger is geen policy: `stamp_chat_message()` vuurt óók voor
 *    `service_role` en voor de referentiële actie van de foreign key. Dat is na
 *    0193 het enige overgebleven pad ernaartoe, en dus het pad waarlangs deze
 *    tests hem moeten benaderen. De redenering stond hier al bij `system_event`
 *    en `created_at`; ze geldt nu voor het hele bestand.
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

  /** Een vers bericht van Alice. Er is geen bewerkvenster meer; zie de kop. */
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
        // ⚠️ Dit was vóór 0188 HTTP 200 met een ongewijzigde rij. Gemeten.
        const id = await versBericht('payload-poging');

        const uit = await adminDb().from('chat_messages').update({ payload: { x: 1 } }).eq('id', id);

        expect(uit.error, 'een payload-wijziging kwam er stil doorheen').not.toBeNull();

        const na = await adminDb().from('chat_messages').select('payload').eq('id', id).single();
        expect(na.data?.payload, 'payload is tóch veranderd').toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'een verzoek dat de tekst wél en het type niet mag wijzigen, wijzigt geen van beide',
      async () => {
        // ⚠️ De halve vorm: vóór 0188 veranderde `body` en bleef `type` staan, met
        //    succes erop. Half doen en heel melden is de ergste van de twee.
        //
        // ⚠️⚠️ **`photo` en niet `system`, en dat verschil was ooit de hele test.**
        //    Zolang `chat_messages_update` bestond, eiste zijn `with check`
        //    `type <> 'system'`: een poging met `system` werd al door de policy
        //    geweigerd en bereikte deze trigger nooit. De eerste versie deed dat
        //    wél en was groen om de verkeerde reden — gevonden doordat `type` uit
        //    de toets halen niets rood maakte.
        //
        //    Sinds 0193 is die policy weg en loopt dit geval via `adminDb()`, dus
        //    het onderscheid doet er technisch niet meer toe. `photo` blijft
        //    staan omdat het de zuiverste vorm is: één kolom die alleen de
        //    trigger tegenhoudt, zonder een tweede reden waarom het misgaat.
        const id = await versBericht('half-poging');

        const uit = await adminDb()
          .from('chat_messages')
          .update({ body: 'nieuw', type: 'photo' })
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
  describe('elke gepinde kolom heeft zijn eigen ijking', () => {
    // ⚠️⚠️ **Deze vier stonden er niet, en dat kwam uit de security-review.** De
    //    eerste versie ijkte drie grendels van de acht: `payload`, `type` en de
    //    FK-uitzondering. 📏 Gemeten dat `group_id`, `system_event`, `created_at`
    //    en `id` stuk voor stuk uit toets én pin te halen waren met vijf groene
    //    tests als uitslag — met een `pg_get_functiondef`-controle erbij dat de
    //    mutatie de database echt gehaald had.
    //
    //    `group_id` is de scherpste: zonder die grendel verplaatst een afzender
    //    zijn eigen bericht naar een andere groep waar hij lid
    //    van is, en `groepschat()` toont het daar woordelijk. Domeinregel 7.

    it(
      'de groep van een bericht ligt vast',
      async () => {
        const tweede = await w.alice.db.rpc('create_group', { group_name: 'Tweede groep' });
        const td = tweede.data as unknown as { ok?: boolean; group?: { id: string } };
        expect(td.ok, `tweede groep: ${JSON.stringify(tweede.data)}`).toBe(true);

        const id = await versBericht('groep-poging');
        const uit = await adminDb()
          .from('chat_messages')
          .update({ group_id: td.group!.id })
          .eq('id', id);

        expect(uit.error, 'een bericht is naar een andere groep verplaatst').not.toBeNull();

        const na = await adminDb().from('chat_messages').select('group_id').eq('id', id).single();
        expect(na.data?.group_id).toBe(w.groupId);
      },
      TEST_TIMEOUT,
    );

    it(
      'het systeemgebeurtenisveld ligt vast',
      async () => {
        // ⚠️ Via `adminDb()` en niet via de client, en dat is geen gemak. De
        //    `with check` eist `system_event is null`, dus een client wordt al
        //    door de policy gestopt en raakt deze grendel niet. Wie hem alsnog
        //    langs de client toetst, meet de policy en denkt de trigger te meten —
        //    precies wat de eerste versie van dit bestand deed.
        const id = await versBericht('systeem-poging');
        const uit = await adminDb()
          .from('chat_messages')
          .update({ system_event: 'member_joined' })
          .eq('id', id);

        expect(uit.error, 'system_event is stil doorgekomen').not.toBeNull();

        const na = await adminDb()
          .from('chat_messages')
          .select('system_event')
          .eq('id', id)
          .single();
        expect(na.data?.system_event).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'het tijdstip ligt vast, ook voor de rol die er wél een grant op heeft',
      async () => {
        // ⚠️ `authenticated` heeft sinds 0173 geen UPDATE-grant op `created_at`,
        //    dus dit pad loopt via `adminDb()`. Dat is met opzet: de trigger geldt
        //    óók voor de rol die om de kolomgrant heen komt, en juist daar is het
        //    de enige grendel. Zonder deze test is die kolom ongeijkt.
        const id = await versBericht('tijd-poging');
        const uit = await adminDb()
          .from('chat_messages')
          .update({ created_at: '2020-01-01T00:00:00Z' })
          .eq('id', id);

        expect(uit.error, 'created_at is stil teruggezet in plaats van geweigerd').not.toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'de identiteit van een bericht ligt vast',
      async () => {
        // ⚠️ Gevonden in de security-review: `authenticated` heeft een
        //    UPDATE-kolomgrant op `id` en de trigger pinde hem niet. 📏 Gemeten
        //    dat een afzender het id van zijn eigen bericht herschreef.
        const id = await versBericht('id-poging');
        const uit = await adminDb()
          .from('chat_messages')
          .update({ id: '00000000-0000-0000-0000-0000000000ff' })
          .eq('id', id);

        expect(uit.error, 'de primaire sleutel is herschreven').not.toBeNull();

        const na = await adminDb().from('chat_messages').select('id').eq('id', id).maybeSingle();
        expect(na.data?.id, 'het bericht staat niet meer op zijn eigen id').toBe(id);
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
  describe('de must-allows: de trigger houdt niet álles tegen', () => {
    it(
      'de tekst wijzigen laat de trigger gewoon door',
      async () => {
        const id = await versBericht('voor');

        const uit = await adminDb().from('chat_messages').update({ body: 'na' }).eq('id', id);
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

        const uit = await adminDb().from('chat_messages').update({ body: 'gelijk' }).eq('id', id);
        expect(uit.error, `een no-op werd geweigerd: ${uit.error?.message}`).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});
