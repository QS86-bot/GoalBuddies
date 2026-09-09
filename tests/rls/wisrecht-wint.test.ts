/**
 * Het wisrecht wint helemaal — QS8-335, migratie 0213.
 *
 * **De belofte die dit bestand bewaakt:**
 *
 *      Verwijdert de eigenaar zijn account, dan blijft er over zijn commitments
 *      nergens iets staan — niet in de administratie en niet in de groep. En
 *      niets ánders dan dat gaat mee.
 *
 * ⚠️⚠️ **Waarom dit issue er was: het was een halve wissing en de verkeerde helft
 *    overleefde.** 📏 Gemeten vóór 0213, met de groep als begunstigde:
 *
 *      vooraf:  commitment 1   auditregels 3   systeemberichten 2
 *      verwijder_mijn_account (eigenaar): {"ok": true}
 *      na:      commitment 0   auditregels 0   systeemberichten 2
 *
 *      blijft staan:
 *        "De inzet die Alice zelf heeft ingesteld, is verschuldigd geworden."
 *
 *    Vier cascades wisten de rij en het spoor; de foreign keys van
 *    `chat_messages` naar `profiles` staan op `set null`, dus de zin bleef — met
 *    de naam er als platte tekst in. De groep hield de bewering en verloor de
 *    administratie die haar kon staven.
 *
 * ⚠️ **Deze test toetst de belofte en niet de vorm van één cascade (AC3).** Hij
 *    telt wat er ná de verwijdering nog over die straf te vinden is, langs élke
 *    weg die er is: de commitmentrij, het auditspoor en de groepsfeed. Een test
 *    die alleen `confdeltype` van één foreign key zou controleren, verhuist niet
 *    mee als iemand de cascade verlegt — en blijft groen terwijl de belofte breekt.
 *
 * ⚠️ **§2 is even belangrijk als §1, en dat is niet vanzelfsprekend.** Het besluit
 *    is *het wisrecht wint*, niet *er wordt zoveel mogelijk gewist*. Zonder een
 *    must-allow die vastlegt dat gewone berichten en `goal_completed` blijven
 *    staan, is de goedkoopste manier om §1 groen te houden: alles wissen wat de
 *    naam van de vertrekker draagt. Dat zou de chat van drie andere mensen
 *    opruimen op grond van een besluit dat over commitments ging.
 *
 * **Met de hand rood gemaakt, grendel voor grendel (regel 18, vraag 3):**
 *
 *      1. het delete-blok uit `verwijder_mijn_account()`
 *         → §1 'de groep houdt niets over de straf' rood, §2 groen
 *      2. de filter `system_event in (...)` eruit, zodat élk bericht met mij als
 *         onderwerp wordt gewist
 *         → §2 'een gewoon bericht blijft staan' rood, §1 groen
 *
 *    Twee mutaties voor twee grendels: de eerste bewaakt dat er genóeg weggaat,
 *    de tweede dat er niet te véél weggaat. Eén mutatie zou de tweede helft niet
 *    kunnen aantonen.
 *
 * ⚠️ **§3 bewaakt geen gedrag maar een aanname**, en die staat nergens anders
 *    vast. Het delete-blok selecteert op `subject_id = mij`, en dat klopt alleen
 *    zolang een `commitment_*`-bericht altijd de doel-eigenaar als onderwerp
 *    heeft. Sinds QS8-333 kan een straf een persoon-getuige hebben die nog geen
 *    oppervlak heeft; zodra iemand dat bouwt, is "het bericht gaat over de
 *    getuige" de voor de hand liggende keuze — en dan wist die getuige bij zijn
 *    vertrek het bericht over andermans straf. De security-ronde wees erop.
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
  bob: TestUser;
  groupId: string;
  inviteCode: string;
  vandaag: IsoDate;
}

let w: Wereld;

/**
 * Een eigenaar met een verschuldigde straf waarvan zijn eigen groep de
 * begunstigde is — de opstelling waarin het systeembericht daadwerkelijk
 * geplaatst wordt. `meld_commitment()` doet dat alleen bij een **groep** als
 * begunstigde, niet bij een persoon.
 */
async function eigenaarMetVerschuldigdeStraf(
  naam: string,
): Promise<{ eigenaar: TestUser; commitmentId: string; doelId: string; berichtId: string }> {
  const eigenaar = await createTestUser(naam);
  const mee = await eigenaar.db.rpc('join_group_with_code', { code: w.inviteCode });
  if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`meedoen ${naam}: ${JSON.stringify(mee.data)}`);
  }

  const doel = await adminDb()
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: `Doel van ${naam}`, target_date: addDays(w.vandaag, 30) })
    .select('id')
    .single();
  if (doel.error) throw new Error(`doel ${naam}: ${doel.error.message}`);
  const doelId = doel.data.id as string;

  const koppel = await adminDb()
    .from('goal_group_links')
    .insert({ goal_id: doelId, group_id: w.groupId });
  if (koppel.error) throw new Error(`koppelen ${naam}: ${koppel.error.message}`);

  const c = await eigenaar.db
    .from('commitments')
    .insert({
      goal_id: doelId,
      type: 'penalty',
      body: 'Ik trakteer de groep',
      beneficiary_group_id: w.groupId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (c.error) throw new Error(`straf ${naam}: ${c.error.message}`);

  // Verschuldigd maken laat `meld_commitment()` het systeembericht plaatsen.
  const due = await adminDb()
    .from('commitments')
    .update({ status: 'due' })
    .eq('id', c.data.id as string);
  if (due.error) throw new Error(`verschuldigd ${naam}: ${due.error.message}`);

  // ⚠️⚠️ **Het id van het systeembericht wordt hier vastgelegd en niet later
  //    opgezocht, en dat is de hele reden dat deze test iets bewaakt.** De
  //    eerste versie zocht het bericht ná de verwijdering op via
  //    `subject_id = <eigenaar>` — maar de foreign key zet juist díe kolom op
  //    `null`. De query vond dus nul rijen omdat de sleutel weg was, niet omdat
  //    het bericht weg was. 📏 Gemeten: met het hele delete-blok uit
  //    `verwijder_mijn_account()` gesloopt bleef de suite groen. Regel 18 vraag 3
  //    en vraag 4 in één: de test greep naar een plek in plaats van naar de
  //    belofte, en die plek werd door de handeling zelf gewist.
  const bericht = await adminDb()
    .from('chat_messages')
    .select('id')
    .eq('group_id', w.groupId)
    .eq('subject_id', eigenaar.id)
    .eq('system_event', 'commitment_due')
    .single();
  if (bericht.error) throw new Error(`systeembericht ${naam}: ${bericht.error.message}`);

  return {
    eigenaar,
    commitmentId: c.data.id as string,
    doelId,
    berichtId: bericht.data.id as string,
  };
}

/**
 * Alles wat er over deze straf nog te vinden is, langs elke weg.
 *
 * ⚠️ Het bericht wordt op **id** gezocht en niet op `subject_id`. Zie de kop van
 *    `eigenaarMetVerschuldigdeStraf()`: die kolom overleeft de handeling niet die
 *    hier gemeten wordt, en een test die erop zoekt meet zijn eigen blindheid.
 */
async function watErOverIs(commitmentId: string, berichtId: string) {
  const rij = await adminDb().from('commitments').select('id').eq('id', commitmentId);
  const spoor = await adminDb()
    .from('commitment_events')
    .select('id')
    .eq('commitment_id', commitmentId);
  const feed = await adminDb().from('chat_messages').select('id').eq('id', berichtId);

  return {
    commitmentrijen: (rij.data ?? []).length,
    auditregels: (spoor.data ?? []).length,
    groepsberichten: (feed.data ?? []).length,
  };
}

describe.skipIf(!rlsTestsConfigured)('het wisrecht wint helemaal', () => {
  beforeAll(async () => {
    const bob = await createTestUser('wisrecht-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    // Bob is beheerder en blijft; anders weigert `verwijder_mijn_account()` met
    // `last_admin` en meet deze suite de verkeerde tak.
    const gemaakt = await bob.db.rpc('create_group', { group_name: 'Wisrechtgroep' });
    const d = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (d.ok !== true || !d.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    w = { bob, groupId: d.group.id, inviteCode: d.group.invite_code, vandaag };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('1. na de verwijdering is er over de straf niets meer te vinden', () => {
    it(
      'niet in de administratie, en niet in de groep',
      async () => {
        const { eigenaar, commitmentId, berichtId } =
          await eigenaarMetVerschuldigdeStraf('wisrecht-alice-1');

        const vooraf = await watErOverIs(commitmentId, berichtId);
        expect(vooraf.commitmentrijen).toBe(1);
        expect(vooraf.auditregels).toBeGreaterThanOrEqual(1);
        expect(
          vooraf.groepsberichten,
          'de opstelling klopt alleen als het systeembericht er ook echt staat',
        ).toBe(1);

        const weg = await eigenaar.db.rpc('verwijder_mijn_account');
        expect((weg.data as { ok?: boolean } | null)?.ok, JSON.stringify(weg.data)).toBe(true);

        expect(
          await watErOverIs(commitmentId, berichtId),
          'blijft hier een groepsbericht staan, dan is het weer een halve wissing: ' +
            'de bewering blijft en de administratie gaat',
        ).toEqual({ commitmentrijen: 0, auditregels: 0, groepsberichten: 0 });
      },
      TEST_TIMEOUT,
    );
  });

  describe('3. de aanname waar het delete-blok op leunt', () => {
    it(
      'een commitment-systeembericht heeft altijd de doel-eigenaar als onderwerp',
      async () => {
        const { eigenaar, berichtId } = await eigenaarMetVerschuldigdeStraf('wisrecht-alice-5');

        const bericht = await adminDb()
          .from('chat_messages')
          .select('subject_id, system_event')
          .eq('id', berichtId)
          .single();
        if (bericht.error) throw new Error(bericht.error.message);

        expect(
          bericht.data.subject_id,
          'het blok in `verwijder_mijn_account()` selecteert op `subject_id = mij`. ' +
            'Komt er ooit een `commitment_*`-bericht met de **getuige** als onderwerp — ' +
            'de natuurlijke keuze zodra die een oppervlak krijgt — dan wist die getuige ' +
            'met zijn accountverwijdering stilletjes het bericht over de straf van een ' +
            'ánder. Geen enkele andere test hier wordt daar rood van, want ze zetten ' +
            'allemaal de eigenaar. Regel 18 vraag 1 en vraag 6.',
        ).toBe(eigenaar.id);
      },
      TEST_TIMEOUT,
    );
  });

  describe('2. en niets anders gaat mee (must-allow)', () => {
    it(
      'een gewoon bericht van de vertrekker blijft staan, met een lege afzender',
      async () => {
        const { eigenaar } = await eigenaarMetVerschuldigdeStraf('wisrecht-alice-2');

        const bericht = await eigenaar.db
          .from('chat_messages')
          // ⚠️ `sender_id` moet mee: `chat_messages_insert` eist
          //    `sender_id = auth.uid()`. Weglaten geeft geen null maar een
          //    policyweigering.
          .insert({
            group_id: w.groupId,
            body: 'Tot ziens allemaal',
            type: 'text',
            sender_id: eigenaar.id,
          })
          .select('id')
          .single();
        if (bericht.error) throw new Error(`bericht: ${bericht.error.message}`);

        await eigenaar.db.rpc('verwijder_mijn_account');

        const na = await adminDb()
          .from('chat_messages')
          .select('id, sender_id')
          .eq('id', bericht.data.id as string);
        expect(
          (na.data ?? []).length,
          'het besluit gaat over commitments, niet over alles wat iemand ooit zei — ' +
            'een chatbericht blijft een onveranderlijke kopie (domeinregel 7)',
        ).toBe(1);
        expect((na.data ?? [])[0]?.sender_id).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'het bericht dat hij een doel afrondde blijft ook staan',
      async () => {
        const { eigenaar, doelId } = await eigenaarMetVerschuldigdeStraf('wisrecht-alice-3');

        // Mijlpalen zijn er niet, dus afronden kan meteen.
        const af = await eigenaar.db.rpc('rond_doel_af', { p_goal_id: doelId });
        expect((af.data as { ok?: boolean } | null)?.ok, JSON.stringify(af.data)).toBe(true);

        const voor = await adminDb()
          .from('chat_messages')
          .select('id')
          .eq('group_id', w.groupId)
          .eq('subject_id', eigenaar.id)
          .eq('system_event', 'goal_completed');
        expect((voor.data ?? []).length).toBe(1);

        await eigenaar.db.rpc('verwijder_mijn_account');

        const na = await adminDb()
          .from('chat_messages')
          .select('id')
          .eq('id', (voor.data ?? [])[0]?.id as string);
        expect(
          (na.data ?? []).length,
          '`goal_completed` gaat over een doel en niet over een consequentie; ' +
            'de grens van 0213 loopt daar, en verleggen is een besluit',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'de straf van een ánder blijft onaangeroerd',
      async () => {
        const blijft = await eigenaarMetVerschuldigdeStraf('wisrecht-carol');
        const gaat = await eigenaarMetVerschuldigdeStraf('wisrecht-alice-4');

        await gaat.eigenaar.db.rpc('verwijder_mijn_account');

        const na = await watErOverIs(blijft.commitmentId, blijft.berichtId);
        expect(na.commitmentrijen).toBe(1);
        expect(na.auditregels).toBeGreaterThanOrEqual(1);
        expect(
          na.groepsberichten,
          'de verwijdering van de één hoort de straf van de ander niet te raken',
        ).toBe(1);
      },
      TEST_TIMEOUT,
    );
  });
});
