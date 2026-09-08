/**
 * Een weekafsluiting verhuist niet naar een andere groep — QS8-362.
 *
 * ⚠️ **Wat er lekte was de tekst van een ánder lid.** Alice zit in groep A (met
 *    Bob) en in B (met Carol). Bob reageert onder Alice' weekafsluiting in A.
 *    Eén PATCH van `group_id` naar B, en Carol leest Bob zijn reactie — terwijl
 *    Bob nooit in B gezeten heeft. Domeinregel 7, tweede vraag: kan iemand dit
 *    met één API-verzoek uitlezen buiten de UI om?
 *
 * ⚠️ **Beide helften van `week_reviews_write` blijven waar bij zo'n verhuizing**
 *    (`user_id = auth.uid() and is_group_member(group_id)`), want Alice ís lid
 *    van B. De policy is hier dus niet de grens; de kolom is dat.
 *
 * ⚠️⚠️ **De reparatie is een pin en géén `revoke`, tegen wat het issue voorstelt.**
 *    📏 Gemeten via de echte PostgREST met de revoke erop: het opslaan van een
 *    weekafsluiting gaf `42501` — niet alleen het bijwerken, ook de eerste keer.
 *    `bewaarWeekafsluiting()` is een upsert, PostgREST maakt daar
 *    `on conflict do update set …` van met álle body-kolommen erin, en Postgres
 *    toetst het UPDATE-recht op die kolommen sowieso. "Verandert de kolom nooit"
 *    en "schrijft de kolom nooit" zijn niet hetzelfde. Uitleg in 0205.
 *
 * 📏 IJKING, gedraaid 08-09-2026, één mutatie per grendel:
 *
 *   A  `drop trigger week_reviews_pin`        -> 3 rood: de verhuizing, de reactie
 *      die Carol dan wél ziet, en user_id/group_period_start. Beide must-allows
 *      blijven groen.
 *   B  de NULL-uitzondering uit de pin halen  -> 1 rood: alléén het opruimpad van
 *      een verwijderd profiel. Die uitzondering draagt dus echt iets.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const TIMEOUT = 240_000;

let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let groepA: string;
let groepB: string;
let periode: string;
let reviewId: string;

function uitkomst(fout: { code?: string } | null): string {
  return fout === null ? 'toegelaten' : `geweigerd ${fout.code}`;
}

async function maakGroep(eigenaar: TestUser, naam: string): Promise<string> {
  const res = await eigenaar.db.rpc('create_group', { group_name: naam });
  if (res.error) throw new Error(`${naam}: ${res.error.message}`);
  const g = (res.data ?? {}) as { ok?: boolean; group?: { id: string } };
  if (g.ok !== true || !g.group) throw new Error(`${naam}: ${JSON.stringify(res.data)}`);
  return g.group.id;
}

describe.runIf(rlsTestsConfigured)('een weekafsluiting verhuist niet naar een andere groep', () => {
  beforeAll(async () => {
    alice = await createTestUser('wrverhuis-a');
    bob = await createTestUser('wrverhuis-b');
    carol = await createTestUser('wrverhuis-c');

    groepA = await maakGroep(alice, 'Groep A');
    groepB = await maakGroep(alice, 'Groep B');

    const leden = await adminDb().from('group_members').insert([
      { group_id: groepA, user_id: bob.id, role: 'member', status: 'active' },
      { group_id: groepB, user_id: carol.id, role: 'member', status: 'active' },
    ]);
    if (leden.error) throw new Error(`leden: ${leden.error.message}`);

    periode = groepsperiodeVan({ huddle_day: 0, tz: 'Europe/Amsterdam' }, now()).startDate;

    const review = await adminDb()
      .from('week_reviews')
      .insert({ group_id: groepA, user_id: alice.id, group_period_start: periode, did_text: 'mijn week' })
      .select('id')
      .single();
    if (review.error) throw new Error(`review: ${review.error.message}`);
    reviewId = review.data.id;

    const reactie = await adminDb()
      .from('week_review_replies')
      .insert({ week_review_id: reviewId, author_id: bob.id, body: 'Bob zijn prive reactie in groep A' });
    if (reactie.error) throw new Error(`reactie: ${reactie.error.message}`);
  }, TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TIMEOUT);

  it(
    'weigert een verhuizing naar een andere groep, luid',
    async () => {
      const { error } = await alice.db.from('week_reviews').update({ group_id: groepB }).eq('id', reviewId);

      expect(uitkomst(error)).not.toBe('toegelaten');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De belofte is niet "de update faalt" maar "Carol ziet Bob niet".** Een
   *    test op alleen de foutcode blijft groen als er ooit een tweede weg naar
   *    dezelfde verhuizing bijkomt.
   */
  it(
    'en Carol ziet de reactie van Bob nog steeds niet',
    async () => {
      const { data } = await carol.db
        .from('week_review_replies')
        .select('body')
        .eq('week_review_id', reviewId);

      expect(data ?? []).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    'weigert ook een wijziging van user_id en van group_period_start',
    async () => {
      const eigenaar = await alice.db.from('week_reviews').update({ user_id: bob.id }).eq('id', reviewId);
      expect(uitkomst(eigenaar.error)).not.toBe('toegelaten');

      const vorige = new Date(`${periode}T00:00:00Z`);
      vorige.setUTCDate(vorige.getUTCDate() - 7);
      const period = await alice.db
        .from('week_reviews')
        .update({ group_period_start: vorige.toISOString().slice(0, 10) })
        .eq('id', reviewId);
      expect(uitkomst(period.error)).not.toBe('toegelaten');
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De tweede must-allow, en zonder deze breekt het verwijderen van een
   *    account.** `week_reviews_user_id_fkey` is `on delete set null`, dus
   *    Postgres doet zélf een UPDATE die `user_id` op NULL zet zodra een profiel
   *    verdwijnt. Die tak moet langs de pin — het is de foreign key en geen
   *    client. QS8-359 gaat over precies dat opruimpad.
   */
  it(
    'laat de foreign key user_id op null zetten als een profiel verdwijnt',
    async () => {
      const dave = await createTestUser('wrverhuis-d');
      const lid = await adminDb()
        .from('group_members')
        .insert({ group_id: groepA, user_id: dave.id, role: 'member', status: 'active' });
      if (lid.error) throw new Error(`lid dave: ${lid.error.message}`);

      const review = await adminDb()
        .from('week_reviews')
        .insert({ group_id: groepA, user_id: dave.id, group_period_start: periode, did_text: 'dave' })
        .select('id')
        .single();
      if (review.error) throw new Error(`review dave: ${review.error.message}`);

      const weg = await adminDb().from('profiles').delete().eq('id', dave.id);
      expect(uitkomst(weg.error)).toBe('toegelaten');

      const na = await adminDb().from('week_reviews').select('user_id').eq('id', review.data.id).single();
      expect(na.data?.user_id).toBeNull();
    },
    TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De must-allow, en die is hier het hele ontwerp.** `bewaarWeekafsluiting()`
   *    is een `upsert` op de natuurlijke sleutel, dus PostgREST schrijft bij de
   *    tweede keer opslaan óók `group_id`, `user_id` en `group_period_start` —
   *    met dezelfde waarden. Een grendel die op schrijven let in plaats van op
   *    veránderen, breekt precies dat pad.
   */
  it(
    'laat opslaan en daarna bijwerken gewoon door',
    async () => {
      const eerste = await alice.db.from('week_reviews').upsert(
        { group_id: groepB, user_id: alice.id, group_period_start: periode, did_text: 'eerste' },
        { onConflict: 'group_id,user_id,group_period_start' },
      );
      expect(uitkomst(eerste.error)).toBe('toegelaten');

      const tweede = await alice.db.from('week_reviews').upsert(
        { group_id: groepB, user_id: alice.id, group_period_start: periode, did_text: 'bijgewerkt' },
        { onConflict: 'group_id,user_id,group_period_start' },
      );
      expect(uitkomst(tweede.error)).toBe('toegelaten');
    },
    TIMEOUT,
  );
});
