/**
 * Reacties pagineren met een cursor — migratie 0121.
 *
 * ⚠️ **De belofte is niet "de functie geeft een pagina terug".** Dat is groen bij
 *    `offset` net zo goed als bij een cursor. De belofte is: *wie de lijst
 *    doorbladert, ziet elke reactie precies één keer — ook als er ondertussen
 *    een verdwijnt*. Daarom verwijdert deze test er tussen twee pagina's een.
 *
 * ⚠️ **De verwijdering staat vóór de cursor, en dat is het hele geval.** Een
 *    verwijdering áchter de cursor merk je niet: die rij was je toch nog niet
 *    gepasseerd. Met `offset` schuift een verwijdering ervóór de hele staart één
 *    plek naar voren, en dan valt precies de rij weg die net over de paginagrens
 *    lag. Gemeten vóór 0121: pagina 2 gaf alleen `reactie 4`.
 *
 * ⚠️ **De must-allow-helft is de ongestoorde ronde.** Zonder die zou een functie
 *    die altijd álles teruggeeft deze suite ook halen, en dan bewaakt hij niets
 *    over pagineren.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Rij {
  id: string;
  body: string;
  created_at: string;
}

let eigenaar: TestUser;
let groupId: string;
let periode: string;
let reviewId: string;

/** De ids van vier reacties, oplopend in tijd. */
const REACTIE_EEN = 'aaaaaaaa-0000-0000-0000-000000000001';
const REACTIES = [REACTIE_EEN, ...[2, 3, 4].map((i) => `aaaaaaaa-0000-0000-0000-00000000000${i}`)];

async function pagina(limit: number, na: Rij | null): Promise<Rij[]> {
  const { data, error } = await eigenaar.db.rpc('weekafsluiting_reacties', {
    p_group_id: groupId,
    p_period_start: periode,
    p_limit: limit,
    p_na_at: na?.created_at ?? null,
    p_na_id: na?.id ?? null,
  });
  if (error) throw new Error(`weekafsluiting_reacties: ${error.message}`);
  return (data ?? []) as Rij[];
}

describe.runIf(rlsTestsConfigured)('reacties pagineren met een cursor (0121)', () => {
  beforeAll(async () => {
    eigenaar = await createTestUser('reactie-eigenaar');

    const g = await eigenaar.db.rpc('create_group', { group_name: 'Reacties' });
    const data = g.data as unknown as { ok?: boolean; group?: { id: string } };
    if (data.ok !== true || !data.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(g.data)}`);
    }
    groupId = data.group.id;

    // ⚠️ De periodestart moet de huddledag van de groep zijn — 0108 weigert al
    //    het andere. Uit de database halen en niet zelf uitrekenen.
    const dag = await adminDb().rpc('groepsdatum', { gid: groupId });
    if (dag.error) throw new Error(`groepsdatum: ${dag.error.message}`);
    const groep = await adminDb().from('groups').select('huddle_day').eq('id', groupId).single();
    if (groep.error) throw new Error(`groep lezen: ${groep.error.message}`);

    const vandaag = new Date(`${dag.data as unknown as string}T00:00:00Z`);
    const terug = (vandaag.getUTCDay() - (groep.data.huddle_day % 7) + 7) % 7;
    vandaag.setUTCDate(vandaag.getUTCDate() - terug);
    periode = vandaag.toISOString().slice(0, 10);

    const review = await adminDb()
      .from('week_reviews')
      .insert({
        group_id: groupId,
        user_id: eigenaar.id,
        group_period_start: periode,
        did_text: 'gedaan',
      })
      .select('id')
      .single();
    if (review.error || review.data === null) throw new Error(`review: ${review.error?.message}`);
    reviewId = review.data.id;

    const nu = Date.now();
    const rijen = REACTIES.map((id, i) => ({
      id,
      week_review_id: reviewId,
      author_id: eigenaar.id,
      body: `reactie ${i + 1}`,
      created_at: new Date(nu - (4 - i) * 60_000).toISOString(),
    }));
    const invoegen = await adminDb().from('week_review_replies').insert(rijen);
    if (invoegen.error) throw new Error(`reacties: ${invoegen.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'ongestoord doorbladeren geeft elke reactie precies één keer',
    async () => {
      const een = await pagina(2, null);
      const twee = await pagina(2, een.at(-1) ?? null);

      expect([...een, ...twee].map((r) => r.body)).toEqual([
        'reactie 1',
        'reactie 2',
        'reactie 3',
        'reactie 4',
      ]);
    },
    TEST_TIMEOUT,
  );

  it(
    'een verwijdering vóór de cursor slaat geen enkele reactie over',
    async () => {
      const een = await pagina(2, null);
      expect(een.map((r) => r.body)).toEqual(['reactie 1', 'reactie 2']);

      // Reactie 1 verdwijnt: met `offset` schuift alles één plek op en viel
      // reactie 3 hier weg. Gemeten vóór 0121 gaf pagina 2 alleen reactie 4.
      const weg = await adminDb().from('week_review_replies').delete().eq('id', REACTIE_EEN);
      if (weg.error) throw new Error(`verwijderen: ${weg.error.message}`);

      const twee = await pagina(2, een.at(-1) ?? null);

      expect(
        twee.map((r) => r.body),
        'er is een reactie overgeslagen na een verwijdering vóór de cursor',
      ).toEqual(['reactie 3', 'reactie 4']);
    },
    TEST_TIMEOUT,
  );
});
