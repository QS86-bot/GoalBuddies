/**
 * De belofte: terugnemen en bewerken zijn twee routes, en het verschil tussen
 * hun nalatenschap is besloten en geen ongeluk — QS8-487.
 *
 * ⚠️⚠️ **Waarom dit bestand bestaat terwijl beide routes op zichzelf kloppen.**
 *    Regel 18, vraag 1: *waar knopen twee correcte onderdelen aan elkaar?*
 *    `epic7` toetst dat terugnemen de reacties meeneemt. Niets toetste wat
 *    bewerken doet, en niets legde de twee naast elkaar. Een lezer die alleen de
 *    kop van `verwijderWeekafsluiting()` leest — *"een reactie op een antwoord
 *    dat niet meer bestaat, is een halve zin over iets dat niemand kan
 *    nalezen"* — leidt daar redelijkerwijs uit af dat *inhoud weg ⇒ reacties
 *    weg* een eigenschap van het systeem is. Dat is het niet.
 *
 * ⚠️ **En bewerken is geen exotische API-aanroep maar de gewone opslaanknop.**
 *    `bewaarWeekafsluiting()` is een `upsert` op
 *    `(group_id, user_id, group_period_start)`, dus wie zijn weekafsluiting
 *    terugbrengt tot één teken, komt hier langs de knop die er al staat.
 *    \U0001f4cf Gemeten op 14-09-2026, beide routes op een verse opbouw:
 *
 *    ```
 *    ROUTE 1 (terugnemen)  afsluitingen 1 -> 0   reacties 1 -> 0   schakels 1 -> 1
 *    ROUTE 2 (bewerken)    afsluitingen 1 -> 1   reacties 1 -> 1   schakels 1 -> 1
 *    ```
 *
 * ⚠️⚠️ **Dit bestand legt vast, het repareert niet.** Het verschil is met reden
 *    zo gelaten: reacties wissen bij een bewérking betekent dat het herstellen
 *    van een typefout de aanmoediging van je buddies opruimt, en dat is een
 *    zwaardere prijs dan wat het oplost. De afweging, met de prijs van elk
 *    alternatief, staat in
 *    `docs/decisions/2026-09-14-twee-routes-naar-een-lege-weekafsluiting.md`.
 *
 * ⚠️ **De schakel blijft bij allebei staan, en dát is al besloten** — in
 *    migratie `0037`, tegen ketting-inflatie (wissen en herhalen om schakels te
 *    farmen). Wat 0037 níet behandelt is wat een schakel betekent zónder
 *    afsluiting; die vraag ligt bij de engineer-review. Er stond tot nu toe geen
 *    enkele test onder dat de schakel blijft staan, dus het besluit van 0037
 *    leunde op een leesbeurt van de migratie.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Opstelling {
  groupId: string;
  reviewId: string;
  replyId: string;
  periodStart: string;
}

let schrijver: TestUser;
let lezer: TestUser;

function moetLukken<T extends { error: { message?: string } | null }>(uit: T, wat: string): T {
  if (uit.error !== null) throw new Error(`${wat}: ${uit.error.message ?? 'onbekende fout'}`);
  return uit;
}

/** Een groep met een weekafsluiting van de schrijver en een reactie van de lezer. */
async function bouwOpstelling(naam: string): Promise<Opstelling> {
  const groep = await schrijver.db.rpc('create_group', { group_name: naam });
  const data = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (data.ok !== true || !data.group) {
    throw new Error(`groep ${naam} aanmaken mislukte: ${JSON.stringify(groep.data)}`);
  }

  const meedoen = await lezer.db.rpc('join_group_with_code', { code: data.group.invite_code });
  const uit = (meedoen.data ?? {}) as { ok?: boolean; reason?: string };
  if (uit.ok !== true) throw new Error(`de lezer werd geen lid: ${uit.reason ?? 'geen reden'}`);

  const rij = moetLukken(
    await adminDb().from('groups').select('huddle_day, tz').eq('id', data.group.id).single(),
    'groep uitlezen',
  );
  const periode = groepsperiodeVan(rij.data as { huddle_day: number; tz: string }, now());

  const review = moetLukken(
    await schrijver.db
      .from('week_reviews')
      .insert({
        group_id: data.group.id,
        user_id: schrijver.id,
        group_period_start: periode.startDate,
        did_text: 'Drie ochtenden geschreven.',
        blocked_text: 'De donderdag liep vast.',
        next_text: 'Volgende week eerder beginnen.',
      })
      .select('id')
      .single(),
    'weekafsluiting',
  );
  const reviewId = (review.data as { id: string }).id;

  const reactie = moetLukken(
    await lezer.db
      .from('week_review_replies')
      .insert({ week_review_id: reviewId, author_id: lezer.id, body: 'Knap dat je doorging.' })
      .select('id')
      .single(),
    'reactie',
  );

  return {
    groupId: data.group.id,
    reviewId,
    replyId: (reactie.data as { id: string }).id,
    periodStart: periode.startDate,
  };
}

/** Wat er ná een route nog overeind staat. */
async function stand(o: Opstelling): Promise<Record<string, number>> {
  const afsluitingen = await adminDb().from('week_reviews').select('id').eq('id', o.reviewId);
  const reacties = await adminDb().from('week_review_replies').select('id').eq('id', o.replyId);
  const schakels = await adminDb()
    .from('chain_links')
    .select('id')
    .eq('group_id', o.groupId)
    .eq('group_period_start', o.periodStart);

  return {
    afsluitingen: (afsluitingen.data ?? []).length,
    reacties: (reacties.data ?? []).length,
    schakels: (schakels.data ?? []).length,
  };
}

describe.runIf(rlsTestsConfigured)('terugnemen en bewerken laten verschillende sporen na', () => {
  beforeAll(async () => {
    schrijver = await createTestUser('tweeroutes-schrijver');
    lezer = await createTestUser('tweeroutes-lezer');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'route 1 — terugnemen haalt de afsluiting én de reacties weg, en laat de schakel staan',
    async () => {
      const o = await bouwOpstelling('QS8-487 terugnemen');
      expect(await stand(o), 'de opstelling zelf klopt niet').toEqual({
        afsluitingen: 1,
        reacties: 1,
        schakels: 1,
      });

      // Precies wat `verwijderWeekafsluiting()` doet.
      const weg = await schrijver.db
        .from('week_reviews')
        .delete()
        .eq('group_id', o.groupId)
        .eq('user_id', schrijver.id)
        .eq('group_period_start', o.periodStart);
      expect(weg.error, 'terugnemen moet blijven werken — dat is de must-allow').toBeNull();

      expect(await stand(o)).toEqual({ afsluitingen: 0, reacties: 0, schakels: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'route 2 — bewerken tot één teken laat de afsluiting, de reacties én de schakel staan',
    async () => {
      const o = await bouwOpstelling('QS8-487 bewerken');
      expect(await stand(o), 'de opstelling zelf klopt niet').toEqual({
        afsluitingen: 1,
        reacties: 1,
        schakels: 1,
      });

      // Precies wat de opslaanknop doet: `bewaarWeekafsluiting()` is een upsert,
      // en `week_reviews_iets_ingevuld` eist alleen dat één veld niet blanco is.
      const bewerkt = await schrijver.db
        .from('week_reviews')
        .update({ did_text: '.', blocked_text: null, next_text: null })
        .eq('id', o.reviewId);
      expect(bewerkt.error, 'bewerken hoort te mogen').toBeNull();

      expect(await stand(o)).toEqual({ afsluitingen: 1, reacties: 1, schakels: 1 });

      const na = await adminDb().from('week_reviews').select('did_text').eq('id', o.reviewId).single();
      expect((na.data as { did_text: string } | null)?.did_text).toBe('.');
    },
    TEST_TIMEOUT,
  );
});
