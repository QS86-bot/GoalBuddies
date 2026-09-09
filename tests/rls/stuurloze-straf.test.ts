/**
 * Een stuurloze straf krijgt de eigenaar weer in handen — QS8-333, migratie 0212.
 *
 * **De belofte die dit bestand bewaakt:**
 *
 *      Verdwijnt de getuige van een verschuldigde straf, dan is die straf niet
 *      langer een rij die niemand meer kan aanraken: de eigenaar wijst een
 *      nieuwe getuige aan of wikkelt hem af. Verdwijnt de getuige níet, dan
 *      verandert er niets.
 *
 * ⚠️⚠️ **De keten en niet de tak (AC2).** Het gat was niet "de RPC ontbreekt"
 *    maar "na een accountverwijdering is de rij onbereikbaar". §1 loopt daarom
 *    het hele pad af — straf op `due`, getuige verwijdert zijn éigen account via
 *    `verwijder_mijn_account()`, en pas dán de RPC. Een test die de kolom met de
 *    adminclient op `null` zet, meet een toestand die geen enkele gebruiker kan
 *    maken; 📏 gemeten: `bewaak_begunstigde()` weigert dat met *"De begunstigde
 *    van een commitment is niet weg te halen zolang hij bestaat"*.
 *
 * ⚠️ **§3 is de must-deny en draagt het meeste gewicht.** De RPC opent één deur,
 *    en de vraag is niet of hij opengaat maar of hij dicht blijft in élk ander
 *    geval. Zonder §3 zou "de eigenaar mag zijn verschuldigde straf afwikkelen"
 *    de belofte zijn, en dat is precies de ontsnapping die QS8-322 dichtdeed.
 *
 * ⚠️ **Dit vernauwt de belofte van QS8-312**, en dat staat ook in de kop van
 *    `tests/rls/getuige-blijft.test.ts`. Daar staat de andere helft: de directe
 *    tabelroute blijft dicht, en de RPC weigert zolang de getuige nog bestaat.
 *
 * **Met de hand rood gemaakt, grendel voor grendel (regel 18, vraag 3):**
 *
 *      1. de toets `c.status <> 'due'` eruit
 *         → §3 'weigert een straf die nog niet verschuldigd is' rood
 *      2. de toets op `beneficiary_user_id is not null` eruit
 *         → §3 'weigert zolang de getuige er nog is' rood
 *      3. de toets `p_bevestigd is not true` eruit
 *         → §3 'wikkelt niet af zonder bevestiging' rood
 *      4. de toets `shares_group_with_user()` eruit
 *         → §3 'weigert een getuige buiten je groepen' rood
 *      5. `or c.beneficiary_group_id is not null` uit dezelfde toets
 *         → §3 'weigert een straf waarvan de groep begunstigde is' rood
 *
 *    Vijf mutaties voor vijf grendels. Eén mutatie voor de hele functie zou
 *    niets zeggen over welke toets welk geval afvangt.
 *
 * ⚠️⚠️ **De vijfde stond hier eerst niet, en dat was de gevaarlijkste van de
 *    vijf.** De poort is één `if` met twee disjuncten; élk testgeval had een
 *    persoon als begunstigde, dus de groeps-disjunct kon weg zonder dat er iets
 *    rood werd. De security-ronde mat het: `beneficiary_group_id` kwam nul keer
 *    voor in dit bestand. Sneuvelt die disjunct ooit bij een refactor, dan wikkelt
 *    een eigenaar een straf af waar zijn hele groep naar kijkt — het commitment
 *    device dat zichzelf uitzet, domeinregel 5.
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
  inviteCode: string;
  vandaag: IsoDate;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean; reason?: string; actie?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string; actie?: string };
}

/** Een straf op `due`, met `getuige` als persoon-begunstigde. */
async function straf(titel: string, getuige: TestUser): Promise<string> {
  const doel = await adminDb()
    .from('goals')
    .insert({ owner_id: w.alice.id, title: titel, target_date: addDays(w.vandaag, 30) })
    .select('id')
    .single();
  if (doel.error) throw new Error(`doel ${titel}: ${doel.error.message}`);

  const c = await w.alice.db
    .from('commitments')
    .insert({
      goal_id: doel.data.id as string,
      type: 'penalty',
      body: `${titel} — ik trakteer de groep`,
      beneficiary_user_id: getuige.id,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (c.error) throw new Error(`straf ${titel}: ${c.error.message}`);

  const due = await adminDb()
    .from('commitments')
    .update({ status: 'due' })
    .eq('id', c.data.id as string);
  if (due.error) throw new Error(`verschuldigd maken ${titel}: ${due.error.message}`);

  return c.data.id as string;
}

async function lees(id: string): Promise<{ status: string; getuige: string | null }> {
  const r = await adminDb()
    .from('commitments')
    .select('status, beneficiary_user_id')
    .eq('id', id)
    .single();
  if (r.error) throw new Error(`lezen: ${r.error.message}`);
  return {
    status: r.data.status as string,
    getuige: (r.data.beneficiary_user_id as string | null) ?? null,
  };
}

describe.skipIf(!rlsTestsConfigured)('een stuurloze straf', () => {
  beforeAll(async () => {
    const alice = await createTestUser('stuurloos-alice');
    const bob = await createTestUser('stuurloos-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Stuurloosgroep' });
    const d = gemaakt.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (d.ok !== true || !d.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: d.group.invite_code });
    if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
      throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
    }

    w = {
      alice,
      bob,
      groupId: d.group.id,
      inviteCode: d.group.invite_code,
      vandaag,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('1. het hele pad — de getuige verwijdert zijn account', () => {
    it(
      'daarna wijst de eigenaar een nieuwe getuige aan, en de straf blijft verschuldigd',
      async () => {
        const carol = await createTestUser('stuurloos-carol-1');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Nieuwe getuige', carol);
        expect(await lees(strafId)).toEqual({ status: 'due', getuige: carol.id });

        // De echte route: de getuige zegt zijn eigen account op.
        const weg = await carol.db.rpc('verwijder_mijn_account');
        expect(uit(weg.data).ok, JSON.stringify(weg.data)).toBe(true);

        expect(
          await lees(strafId),
          'de foreign key hoort de getuige leeg te zetten en de straf te laten staan',
        ).toEqual({ status: 'due', getuige: null });

        const herstel = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'nieuwe_getuige',
          p_getuige: w.bob.id,
        });
        expect(uit(herstel.data).ok, JSON.stringify(herstel.data)).toBe(true);

        expect(
          await lees(strafId),
          'de straf hoort verschuldigd te blijven — er komt een toezichthouder bij, ' +
            'geen uitweg',
        ).toEqual({ status: 'due', getuige: w.bob.id });
      },
      TEST_TIMEOUT,
    );

    it(
      'of hij wikkelt hem af, en dat laat een auditspoor achter',
      async () => {
        const carol = await createTestUser('stuurloos-carol-2');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Afwikkelen', carol);
        const weg = await carol.db.rpc('verwijder_mijn_account');
        expect(uit(weg.data).ok, JSON.stringify(weg.data)).toBe(true);

        const af = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'afwikkelen',
          p_bevestigd: true,
        });
        expect(uit(af.data).ok, JSON.stringify(af.data)).toBe(true);

        expect((await lees(strafId)).status).toBe('resolved');

        const spoor = await adminDb()
          .from('commitment_events')
          .select('event_type')
          .eq('commitment_id', strafId)
          .eq('event_type', 'resolved');
        expect(
          (spoor.data ?? []).length,
          'domeinregel 5: een commitment device gaat niet uit zonder spoor',
        ).toBeGreaterThanOrEqual(1);
      },
      TEST_TIMEOUT,
    );
  });

  describe('2. de deur gaat één kant op', () => {
    it(
      'de eigenaar kan een stuurloze straf niet annuleren via de RPC',
      async () => {
        const carol = await createTestUser('stuurloos-carol-3');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Niet annuleren', carol);
        await carol.db.rpc('verwijder_mijn_account');

        const poging = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'annuleren',
          p_bevestigd: true,
        });
        expect(uit(poging.data).reason).toBe('onbekende_actie');
        expect((await lees(strafId)).status).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'en ook niet via de tabel — de kolomgrant blijft de eerste grendel',
      async () => {
        const carol = await createTestUser('stuurloos-carol-4');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Niet via de tabel', carol);
        await carol.db.rpc('verwijder_mijn_account');

        const poging = await w.alice.db
          .from('commitments')
          .update({ status: 'cancelled' })
          .eq('id', strafId)
          .select('id');
        expect(
          (poging.data ?? []).length,
          'commitments_update blijft `status = set`; 0212 verruimt die policy niet',
        ).toBe(0);
        expect((await lees(strafId)).status).toBe('due');
      },
      TEST_TIMEOUT,
    );
  });

  describe('3. en blijft dicht in elk ander geval', () => {
    it(
      'weigert zolang de getuige er nog is',
      async () => {
        const strafId = await straf('Getuige leeft nog', w.bob);

        const poging = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'afwikkelen',
          p_bevestigd: true,
        });
        expect(
          uit(poging.data).reason,
          'dit is de belofte van QS8-312: een straf in werking mét getuige verandert niet',
        ).toBe('heeft_nog_een_begunstigde');
        expect((await lees(strafId)).status).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een straf die nog niet verschuldigd is',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .insert({ owner_id: w.alice.id, title: 'Nog op set', target_date: addDays(w.vandaag, 30) })
          .select('id')
          .single();
        if (doel.error) throw new Error(doel.error.message);

        const c = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: doel.data.id as string,
            type: 'penalty',
            body: 'Straf die nog op set staat',
            beneficiary_user_id: w.bob.id,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (c.error) throw new Error(c.error.message);

        const poging = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: c.data.id as string,
          p_actie: 'afwikkelen',
          p_bevestigd: true,
        });
        expect(
          uit(poging.data).reason,
          'een straf op `set` is gewoon in te trekken; daar is deze functie niet voor',
        ).toBe('niet_verschuldigd');
      },
      TEST_TIMEOUT,
    );

    it(
      'wikkelt niet af zonder bevestiging',
      async () => {
        const carol = await createTestUser('stuurloos-carol-5');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Zonder bevestiging', carol);
        await carol.db.rpc('verwijder_mijn_account');

        const poging = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'afwikkelen',
        });
        expect(
          uit(poging.data).reason,
          'domeinregel 5: een commitment device gaat nooit stilzwijgend uit',
        ).toBe('niet_bevestigd');
        expect((await lees(strafId)).status).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een getuige buiten je groepen, en jezelf',
      async () => {
        const carol = await createTestUser('stuurloos-carol-6');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);
        const vreemde = await createTestUser('stuurloos-vreemde');

        const strafId = await straf('Vreemde getuige', carol);
        await carol.db.rpc('verwijder_mijn_account');

        const buiten = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'nieuwe_getuige',
          p_getuige: vreemde.id,
        });
        expect(uit(buiten.data).reason).toBe('geen_groepsgenoot');

        const zelf = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'nieuwe_getuige',
          p_getuige: w.alice.id,
        });
        expect(
          uit(zelf.data).reason,
          'jezelf aanwijzen is geen getuige hebben — dezelfde lege kring als 0168',
        ).toBe('niet_jezelf');

        expect(await lees(strafId)).toEqual({ status: 'due', getuige: null });
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een straf waarvan de groep begunstigde is',
      async () => {
        const doel = await adminDb()
          .from('goals')
          .insert({
            owner_id: w.alice.id,
            title: 'Groep als begunstigde',
            target_date: addDays(w.vandaag, 30),
          })
          .select('id')
          .single();
        if (doel.error) throw new Error(doel.error.message);

        const c = await w.alice.db
          .from('commitments')
          .insert({
            goal_id: doel.data.id as string,
            type: 'penalty',
            body: 'Ik trakteer de hele groep',
            beneficiary_group_id: w.groupId,
            confirmed_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (c.error) throw new Error(c.error.message);

        const due = await adminDb()
          .from('commitments')
          .update({ status: 'due' })
          .eq('id', c.data.id as string);
        if (due.error) throw new Error(due.error.message);

        const poging = await w.alice.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: c.data.id as string,
          p_actie: 'afwikkelen',
          p_bevestigd: true,
        });
        expect(
          uit(poging.data).reason,
          'een groep verdwijnt niet — `groups_delete` staat op false — dus deze straf ' +
            'is nooit stuurloos, en hem laten afwikkelen zou de eigenaar zijn eigen ' +
            'straf laten opheffen voor het oog van zijn groep',
        ).toBe('heeft_nog_een_begunstigde');

        const na = await adminDb()
          .from('commitments')
          .select('status')
          .eq('id', c.data.id as string)
          .single();
        expect(na.data?.status).toBe('due');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert iemand die de straf niet van hem is',
      async () => {
        const carol = await createTestUser('stuurloos-carol-7');
        const meeC = await carol.db.rpc('join_group_with_code', { code: w.inviteCode });
        expect((meeC.data as { ok?: boolean } | null)?.ok, JSON.stringify(meeC.data)).toBe(true);

        const strafId = await straf('Niet van bob', carol);
        await carol.db.rpc('verwijder_mijn_account');

        const poging = await w.bob.db.rpc('herstel_stuurloze_straf', {
          p_commitment_id: strafId,
          p_actie: 'afwikkelen',
          p_bevestigd: true,
        });
        expect(uit(poging.data).reason).toBe('not_owner');
        expect((await lees(strafId)).status).toBe('due');
      },
      TEST_TIMEOUT,
    );
  });
});
