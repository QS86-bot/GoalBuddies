import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  magNietLanden,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Reacties op een weekafsluiting — QS8-262, ronde 6.
 *
 * `rls:dekking` mat op 04-09 dat `week_review_replies_select` en
 * `week_review_replies_delete` door geen enkele test bewaakt worden. Dat is niet
 * de rand van het schema: **vraag 2 van de weekafsluiting is een van de drie
 * routes waarlangs tegenslag de groep überhaupt bereikt** (domeinregel 7), en de
 * reacties erop zijn het gesprek dat daarop volgt. Wie die reacties buiten zijn
 * groep om kan lezen, leest precies wat die regel beschermt.
 *
 * ⚠️ **`epic7` toetst de INSERT-kant al** — een buitenstaander mag niet
 *    reageren, en niemand mag namens een ander reageren — en `alleenlezen`
 *    toetst dat `_update` op `false` staat. Dat maakte de leeskant onzichtbaar:
 *    het bestand handelt overal als lid, en dan komt de rij netjes terug. Regel
 *    18, vraag 2 in zijn bekendste vorm — de tests toetsen dat de query wérkt,
 *    niet dat een ander er niet bij kan.
 *
 * ## Waarom de gearchiveerde groep hier staat
 *
 * `week_review_replies_delete` is `author_id = auth.uid()` **en**
 * `is_group_member(r.group_id)`. Die tweede conjunct los toetsen vraagt een
 * acteur die de rij wél mag lézen maar geen lid meer is — anders ketst de poging
 * af op de leespolicy en toetst de test die, niet de schrijfpolicy. Dat is de
 * val uit ronde 4, en PostgREST loopt er recht in: een DELETE gaat als
 * `DELETE … RETURNING`, en dan geldt de SELECT-policy ook.
 *
 * ⚠️ **Het verschil tussen de twee hulpfuncties is precies dat gaatje.**
 *    `mag_groep_lezen()` vraagt alleen een actief lidmaatschap;
 *    `is_group_member()` eist er `g.status <> 'archived'` bij. Archiveer je de
 *    groep, dan blijft de auteur lezen en verliest hij het recht om te wissen —
 *    één verschil tussen twee acteurs, en dus een test die maar één ding kan
 *    bewijzen.
 *
 *    Dat is bovendien de belofte zelf en geen truc: in een gearchiveerde groep
 *    is de geschiedenis terug te lezen (QS8-217) en niet meer te wissen
 *    (domeinregel 6, append-only).
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Groep {
  id: string;
  reviewId: string;
  /** De reactie van alice — de rij waar bijna elke test hieronder naar wijst. */
  replyId: string;
}

interface Fixture {
  /** Schrijft de weekafsluiting én de reactie eronder. */
  alice: TestUser;
  /** Groepsgenoot van alice: mag lezen, mag niets van haar wissen. */
  bob: TestUser;
  /** Lid van een ándere groep. Ziet niets van deze. */
  carol: TestUser;
  levend: Groep;
  /** Zelfde opstelling, maar de groep is gearchiveerd. */
  archief: Groep;
}

function moetLukken<T extends { error: { message?: string } | null }>(uit: T, wat: string): T {
  if (uit.error !== null) throw new Error(`${wat}: ${uit.error.message ?? 'onbekende fout'}`);
  return uit;
}

/** Maakt een groep met alice als oprichter en bob als lid, met één reactie erin. */
async function bouwGroep(alice: TestUser, bob: TestUser, naam: string): Promise<Groep> {
  const groep = await alice.db.rpc('create_group', { group_name: naam });
  const data = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (data.ok !== true || !data.group) {
    throw new Error(`groep ${naam} aanmaken mislukte: ${JSON.stringify(groep.data)}`);
  }

  const meedoen = await bob.db.rpc('join_group_with_code', { code: data.group.invite_code });
  const uit = (meedoen.data ?? {}) as { ok?: boolean; reason?: string };
  if (uit.ok !== true) throw new Error(`bob werd geen lid van ${naam}: ${uit.reason ?? 'geen reden'}`);

  const rij = moetLukken(
    await adminDb().from('groups').select('huddle_day, tz').eq('id', data.group.id).single(),
    `groep ${naam} uitlezen`,
  );
  const periode = groepsperiodeVan(rij.data as { huddle_day: number; tz: string }, now());

  const review = moetLukken(
    await alice.db
      .from('week_reviews')
      .insert({
        group_id: data.group.id,
        user_id: alice.id,
        group_period_start: periode.startDate,
        did_text: 'Drie ochtenden geschreven.',
      })
      .select('id')
      .single(),
    `weekafsluiting in ${naam}`,
  );

  const reactie = moetLukken(
    await alice.db
      .from('week_review_replies')
      .insert({
        week_review_id: (review.data as { id: string }).id,
        author_id: alice.id,
        body: 'Dank voor het meedenken.',
      })
      .select('id')
      .single(),
    `reactie in ${naam}`,
  );

  return {
    id: data.group.id,
    reviewId: (review.data as { id: string }).id,
    replyId: (reactie.data as { id: string }).id,
  };
}

describe.skipIf(!rlsTestsConfigured)('Reacties op een weekafsluiting', () => {
  let f: Fixture;

  beforeAll(async () => {
    const alice = await createTestUser('weekreactie-alice');
    const bob = await createTestUser('weekreactie-bob');
    const carol = await createTestUser('weekreactie-carol');

    const levend = await bouwGroep(alice, bob, 'Weekreacties-levend');
    const archief = await bouwGroep(alice, bob, 'Weekreacties-archief');

    // ⚠️ Carol krijgt een eigen groep en niet "geen groep". Een gebruiker zónder
    //    groep ziet niets omdat er niets is; deze test moet bewijzen dat een lid
    //    van groep B de reactie in groep A niet ziet, en dat is iets anders.
    const eigen = await carol.db.rpc('create_group', { group_name: 'Weekreacties-carol' });
    const eigenData = eigen.data as unknown as { ok?: boolean };
    if (eigenData.ok !== true) throw new Error(`groep van carol: ${JSON.stringify(eigen.data)}`);

    moetLukken(
      await adminDb().from('groups').update({ status: 'archived' }).eq('id', archief.id),
      'groep archiveren',
    );

    f = { alice, bob, carol, levend, archief };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('wie de reactie mag lezen', () => {
    it(
      'laat een groepsgenoot de reactie zien',
      async () => {
        // ⚠️ De must-see, en zonder haar bewijst de test hieronder niets: "carol
        //    ziet nul rijen" is gratis zodra de rij er helemaal niet is. Dit is
        //    de tegenhanger die `magNietLanden()` voor de schrijfkant al ingebakken
        //    heeft en die een leestest zelf moet meebrengen.
        const { data, error } = await f.bob.db
          .from('week_review_replies')
          .select('id')
          .eq('id', f.levend.replyId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid van een andere groep de reactie niet zien',
      async () => {
        const { data, error } = await f.carol.db
          .from('week_review_replies')
          .select('id')
          .eq('id', f.levend.replyId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een lid van een andere groep ook niet tellen hoeveel er zijn',
      async () => {
        // ⚠️ Een aparte assertie omdat een `count` een ánder pad door PostgREST
        //    loopt dan een rijenselectie. Een leeg antwoord met een teller van
        //    één is nog steeds een lek: dan weet carol dát er over deze
        //    weekafsluiting gepraat is.
        const { count, error } = await f.carol.db
          .from('week_review_replies')
          .select('id', { count: 'exact', head: true })
          .eq('week_review_id', f.levend.reviewId);

        expect(error).toBeNull();
        expect(count ?? 0).toBe(0);
      },
      TEST_TIMEOUT,
    );
  });

  describe('wie de reactie mag wissen', () => {
    /** De rij zoals `adminDb()` hem ziet — de enige lezer die er altijd bij kan. */
    function rij(replyId: string) {
      return () => adminDb().from('week_review_replies').select('id, body').eq('id', replyId);
    }

    it(
      'houdt de reactie van een ander tegen, ook voor een groepsgenoot',
      async () => {
        // ⚠️ **De gevaarlijke acteur is de buddy en niet de vreemde** — de les van
        //    ronde 4. Carol wordt twee keer tegengehouden (de leespolicy laat haar
        //    de rij niet zien én de delete-policy weigert), dus met haar is deze
        //    grendel niet te isoleren. Bob mag lezen; alleen `author_id` houdt hem
        //    tegen.
        await magNietLanden(
          () => f.bob.db.from('week_review_replies').delete().eq('id', f.levend.replyId),
          rij(f.levend.replyId),
        );
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de auteur zijn eigen reactie in een levende groep wél wissen',
      async () => {
        // ⚠️ De must-allow. Zonder haar is elke weigering hierboven net zo groen
        //    met een policy die iedereen tegenhoudt, en dan is het gesprek onder
        //    een weekafsluiting niet meer terug te nemen.
        const { error } = await f.alice.db
          .from('week_review_replies')
          .delete()
          .eq('id', f.levend.replyId);
        expect(error).toBeNull();

        const na = await adminDb()
          .from('week_review_replies')
          .select('id')
          .eq('id', f.levend.replyId);
        expect(na.data ?? []).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'laat de auteur zijn eigen reactie in een gearchiveerde groep lézen',
      async () => {
        // ⚠️ De helft van het paar dat de tweede conjunct isoleert. Blijft dit
        //    leesbaar, dan komt de weigering hieronder niet van de leespolicy.
        const { data, error } = await f.alice.db
          .from('week_review_replies')
          .select('id')
          .eq('id', f.archief.replyId);

        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(1);
      },
      TEST_TIMEOUT,
    );

    it(
      'houdt diezelfde reactie tegen zodra de groep gearchiveerd is',
      async () => {
        // ⚠️ Alice is auteur én actief lid, dus `author_id = auth.uid()` klopt en
        //    `mag_groep_lezen()` klopt. Het enige dat verschilt met de test
        //    hierboven is `g.status <> 'archived'` in `is_group_member()`. Wordt
        //    deze test rood terwijl de vorige groen blijft, dan is precies die
        //    conjunct weg.
        await magNietLanden(
          () => f.alice.db.from('week_review_replies').delete().eq('id', f.archief.replyId),
          rij(f.archief.replyId),
        );
      },
      TEST_TIMEOUT,
    );
  });
});
