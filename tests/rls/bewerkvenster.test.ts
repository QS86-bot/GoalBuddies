import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * Het bewerkvenster op een chatbericht — QS8-262, ronde 7.
 *
 * 📏 `rls:dekking` mat op 07-09 dat `chat_messages_update.using` door geen enkele
 * test bewaakt wordt, terwijl de `check`-helft dat wél is. Dat verschil wijst
 * precies aan wát er ongedekt was: beide helften eisen `sender_id = auth.uid()`,
 * dus die conjunct wordt aan de checkkant al bewaakt. Wat alléén in de `using`
 * staat, is het **venster van vijftien minuten**:
 *
 * ```
 * using: sender_id = auth.uid() and created_at > now() - '00:15:00'
 * ```
 *
 * ⚠️ **Waarom dat venster ertoe doet.** Een bericht is een onveranderlijke kopie
 *    zodra de groep het gelezen heeft — dat is de redenering onder domeinregel 7
 *    en onder beslisdocument 002 §3: een systeembericht overleeft de autorisatie
 *    waaronder het gemaakt is. Het bewerkvenster is de smalle uitzondering voor
 *    een typefout. Valt die grens weg, dan kan iemand een bericht van vorige week
 *    herschrijven nadat zijn groep erop gereageerd heeft, en dan is de chat geen
 *    geschiedenis meer.
 *
 * ⚠️ **De test moet op geráákte rijen letten en niet op een fout.** Een UPDATE
 *    die door de `using` wordt uitgefilterd raakt nul rijen, en PostgREST geeft
 *    daar `200` met een lege lijst op — er is niets misgegaan, er is niets
 *    gebeurd. Zelfde les als bij `group_members_update` in ronde 6, en een test
 *    die op `42501` wacht, wacht hier op iets dat nooit komt.
 *
 * ⚠️⚠️ **Het bericht ouder máken kan niet met een UPDATE, en dat is gemeten en
 *    niet geredeneerd.** De eerste opstelling zette `created_at` terug via
 *    `adminDb()` en de test bleef groen: het oude bericht was gewoon te
 *    bewerken. 📏 De oorzaak staat in `stamp_chat_message()`, dat op de
 *    UPDATE-tak `new.created_at := old.created_at` doet — óók voor
 *    `service_role`, want een trigger is geen policy. Op de INSERT-tak zet hij
 *    `now()`. **Er is dus langs geen enkele gewone weg een oud bericht te
 *    maken.**
 *
 *    Dat is precies de valstrik die ronde 1 drie keer opleverde: een fixture die
 *    groen is om een andere reden dan hij zegt. Hier was het omgekeerd — rood om
 *    een andere reden — en dat was maar goed ook, want een groene versie had een
 *    venster "bewaakt" dat nooit gesloten was.
 *
 *    De backdate zet de trigger daarom even uit, net als de zelfgetuige-opstelling
 *    in `getuigemelding.test.ts`. Dat is geen kunstgreep maar de enige manier om
 *    de toestand te bouwen waar de policy over gaat.
 *
 * IJKING — met de hand gedraaid op 07-09-2026:
 *
 *   A  de conjunct `created_at > now() - '00:15:00'` uit de `using` halen
 *      → 1 rood: 'een bericht van twintig minuten oud is niet meer te bewerken'
 *   B  de `using`-helft op `true`
 *      → 1 rood, dezelfde test
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  groupId: string;
  verseId: string;
  oudeId: string;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('chat_messages_update — het bewerkvenster', () => {
  beforeAll(async () => {
    const alice = await createTestUser('venster-alice');

    const groep = await alice.db.rpc('create_group', { group_name: 'Venstergroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    // ⚠️ Twee berichten en niet één: het oude bericht wordt teruggezet in de tijd
    //    en het verse blijft staan waar het staat. Met één bericht zou de
    //    must-allow de backdate moeten terugdraaien, en dan toetst de volgorde
    //    van de tests mee in plaats van de policy.
    const berichten = await alice.db
      .from('chat_messages')
      .insert([
        { group_id: gd.group.id, sender_id: alice.id, type: 'text', body: 'VERS' },
        { group_id: gd.group.id, sender_id: alice.id, type: 'text', body: 'OUD' },
      ])
      .select('id, body');
    if (berichten.error) throw new Error(`berichten: ${berichten.error.message}`);

    const vers = (berichten.data ?? []).find((r) => r.body === 'VERS');
    const oud = (berichten.data ?? []).find((r) => r.body === 'OUD');
    if (!vers || !oud) throw new Error('berichten niet teruggekregen');

    // ⚠️ Met de trigger even uit — zie de kop. Een UPDATE op `created_at` wordt
    //    anders door `stamp_chat_message()` teruggedraaid, ook als service_role.
    psql(`
      alter table public.chat_messages disable trigger chat_messages_stamp;
      update public.chat_messages set created_at = now() - interval '20 minutes'
        where id = '${oud.id}';
      alter table public.chat_messages enable trigger chat_messages_stamp;
    `);

    const leeftijd = psql(
      `select round(extract(epoch from (now() - created_at)) / 60) from public.chat_messages where id = '${oud.id}'`,
    );
    if (Number(leeftijd) < 16) {
      throw new Error(`het oude bericht is ${leeftijd} minuten oud en dat is binnen het venster`);
    }

    w = { alice, groupId: gd.group.id, verseId: vers.id, oudeId: oud.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'laat je je eigen verse bericht bewerken',
    async () => {
      // ⚠️ **De must-allow, en hij draagt hier meer dan gebruikelijk.** "Nul
      //    rijen" is gratis zodra het filter nergens op past, de groep leeg is of
      //    het token verlopen. Deze helft bewijst dat de weg openstaat voor het
      //    geval dat er wél doorheen hoort.
      const poging = await w.alice.db
        .from('chat_messages')
        .update({ body: 'VERS, bijgewerkt' })
        .eq('id', w.verseId)
        .select('id, body');

      expect(poging.error).toBeNull();
      expect(poging.data ?? []).toHaveLength(1);
      expect(poging.data?.[0]?.body).toBe('VERS, bijgewerkt');
    },
    TEST_TIMEOUT,
  );

  it(
    'een bericht van twintig minuten oud is niet meer te bewerken',
    async () => {
      const poging = await w.alice.db
        .from('chat_messages')
        .update({ body: 'HERSCHREVEN' })
        .eq('id', w.oudeId)
        .select('id, body');

      expect(poging.error, 'PostgREST weigert niet, hij raakt niets').toBeNull();
      expect(poging.data ?? [], 'het venster hoort dicht te zijn').toEqual([]);

      // ⚠️ En de rij zelf, gelezen buiten de policy om: het gaat erom dat er
      //    niets veranderd is, niet alleen dat er niets terugkwam.
      const na = await adminDb().from('chat_messages').select('body').eq('id', w.oudeId).single();
      expect(na.data?.body).toBe('OUD');
    },
    TEST_TIMEOUT,
  );
});
