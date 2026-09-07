import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * De grens om je eigen afvinkingen en je eigen pushtokens — QS8-262, ronde 8.
 *
 * 📏 `rls:dekking` mat op 07-09 dat `day_checkins_insert`, `day_checkins_delete`
 * en `push_tokens_delete` door geen enkele test bewaakt worden. Alle drie stonden
 * in de reactie van 03-09 als *"vastgelegd mét terugkeervoorwaarde"* — ⚠️ **die
 * vastlegging bestond niet.** Niet in een testkop, niet in het dossier. Ze waren
 * niet weggezet met een reden; ze waren niet getest.
 *
 * ## Wat er wél te breken bleek, en wat niet
 *
 * 📏 Per helft opengezet, met een opstelling waarin bob aan alice haar spullen komt:
 *
 * | Helft opengezet | Uitslag |
 * |---|---|
 * | `day_checkins_insert.check`, eigenaarsconjunct eruit | **bob vinkt af op alice haar weekdoel** |
 * | `day_checkins_insert.check`, quotumconjunct eruit | 1169 tests groen — ook een gat |
 * | `day_checkins_delete.using` | niets: de rij blijft staan |
 * | `push_tokens_delete.using` | niets: het token blijft staan |
 *
 * ⚠️ **De twee deletes zijn per helft niet te breken, en dat is dezelfde vorm als
 *    `user_blocks_delete`.** PostgREST stuurt een DELETE als `DELETE … RETURNING`,
 *    dus de rij moet óók door de SELECT-policy — en die is bij allebei letterlijk
 *    dezelfde uitdrukking als de DELETE-policy. Zet je alleen de delete open, dan
 *    verandert er niets. Beide staan daarom in `NIET_PER_HELFT_TE_METEN`
 *    (`scripts/rls-dekking.mjs`) met de meting en de terugkeervoorwaarde.
 *
 *    De tests hieronder bewaken ze wél als **paar**: ze worden rood zodra de
 *    delete- én de leespolicy samen verruimd worden. Eén mutatie per grendel
 *    blijft dus kloppen — de grendel is hier het paar en niet de helft.
 *
 * ⚠️ **De twee conjuncten van `day_checkins_insert` zijn afzonderlijk geijkt**, en
 *    dat is de les van ronde 2: twee conjuncten in één helft zijn twee grendels.
 *    De eigenaarstoets houdt bob buiten; het dagquotum (`dagafvinkingen_over()`,
 *    500 per etmaal) is onwrikbare regel 5 en houdt de tabel heel.
 *
 * ⚠️ **Domeinregel 7 hangt hieraan.** `day_checkins` is eigenaar-only, óók in een
 *    open groep (A41): een rooster met gaten is fijnmaziger tegenslag dan een
 *    gemiste week. Kan een ander erin schrijven of eruit wissen, dan is dat
 *    rooster niet meer van jou.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  de eigenaarsconjunct uit `day_checkins_insert.check`
 *      → 1 rood: 'je vinkt niet af op het weekdoel van een ander'
 *   B  de quotumconjunct eruit
 *      → 1 rood: 'het dagquotum weigert de vijfhonderdeneerste afvinking'
 *   C  `day_checkins_delete` én `day_checkins_select` samen open
 *      → 1 rood: 'je verwijdert de afvinking van een ander niet'
 *   D  `push_tokens_delete` én `push_tokens_select` samen open
 *      → 1 rood: 'je verwijdert het pushtoken van een ander niet'
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/** Het dagquotum uit `dagafvinkingen_over()`. */
const DAGQUOTUM = 500;

interface Wereld {
  /** Eigenaar van het doel, het weekdoel, de afvinking en het pushtoken. */
  alice: TestUser;
  /** Komt aan alles van alice. Deelt met opzet geen enkele groep met haar. */
  bob: TestUser;
  weekdoelId: string;
  afvinkingId: string;
  tokenId: string;
  vandaag: IsoDate;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de grens om je eigen afvinkingen', () => {
  beforeAll(async () => {
    const alice = await createTestUser('afvinkgrens-alice');
    const bob = await createTestUser('afvinkgrens-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    // ⚠️ Via `adminDb()`: dit bestand gaat over wie er bíj mag, niet over de weg
    //    ernaartoe. Die staat in `ritme.test.ts`.
    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: alice.id, title: 'AFVINKGRENS', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);

    const weekdoel = await adminDb()
      .from('weekly_goals')
      .insert({
        goal_id: doel.data.id,
        title: 'AFVINKGRENS week',
        cycle_start_date: vandaag,
        ceiling_days: 5,
      })
      .select('id')
      .single();
    if (weekdoel.error) throw new Error(`weekdoel: ${weekdoel.error.message}`);

    const afvinking = await adminDb()
      .from('day_checkins')
      .insert({ weekly_goal_id: weekdoel.data.id, local_date: vandaag })
      .select('id')
      .single();
    if (afvinking.error) throw new Error(`afvinking: ${afvinking.error.message}`);

    // ⚠️ Een uniek token per run: `push_tokens_token_uniek` weigert een tweede,
    //    en `23505` is geen weigercode — dan valt de test om met "geweigerd door
    //    iets anders" in plaats van te meten wat hij zegt te meten.
    const token = await adminDb()
      .from('push_tokens')
      .insert({
        user_id: alice.id,
        token: `afvinkgrens-${crypto.randomUUID()}`.padEnd(64, 'x'),
        platform: 'android',
      })
      .select('id')
      .single();
    if (token.error) throw new Error(`token: ${token.error.message}`);

    w = {
      alice,
      bob,
      weekdoelId: weekdoel.data.id,
      afvinkingId: afvinking.data.id,
      tokenId: token.data.id,
      vandaag,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'je vinkt niet af op het weekdoel van een ander',
    async () => {
      const poging = await w.bob.db
        .from('day_checkins')
        .insert({ weekly_goal_id: w.weekdoelId, local_date: addDays(w.vandaag, 1) });

      expect(poging.error?.code, 'de eigenaarsconjunct hoort bob buiten te houden').toBe('42501');

      const na = await adminDb()
        .from('day_checkins')
        .select('id')
        .eq('weekly_goal_id', w.weekdoelId);
      expect(na.data ?? [], 'er hoort geen rij bij te zijn gekomen').toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'maar de eigenaar vinkt zijn eigen weekdoel wél af',
    async () => {
      // ⚠️ **De must-allow.** Zonder deze helft is "bob wordt geweigerd" ook waar
      //    bij een policy die iederéén weigert, en dan bewaakt de vorige test de
      //    eigenaarsconjunct niet maar het bestaan van de tabel.
      const poging = await w.alice.db
        .from('day_checkins')
        .insert({ weekly_goal_id: w.weekdoelId, local_date: addDays(w.vandaag, 2) })
        .select('id');

      expect(poging.error).toBeNull();
      expect(poging.data ?? []).toHaveLength(1);

      const opruimen = await adminDb()
        .from('day_checkins')
        .delete()
        .eq('id', (poging.data ?? [])[0]?.id ?? '');
      expect(opruimen.error).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'het dagquotum weigert de vijfhonderdeneerste afvinking',
    async () => {
      // ⚠️ **Onwrikbare regel 5, en de tweede conjunct van dezelfde helft.** Hij
      //    is los te breken van de eigenaarstoets, dus hij hoort los geijkt —
      //    de les van ronde 2 over `weekly_plan_steps`.
      //
      // ⚠️ De vulling gaat langs `day_checkins_binnen_de_cyclus` heen, want die
      //    trigger eist een datum binnen de cyclus van zeven dagen en er zijn er
      //    vijfhonderd nodig. Dat is geen omweg om de policy heen: het quotum
      //    telt rijen van het laatste etmaal en niet welke datum ze dragen.
      psql(`
        alter table public.day_checkins disable trigger day_checkins_binnen_de_cyclus;
        insert into public.day_checkins (weekly_goal_id, local_date)
        select '${w.weekdoelId}', date '${w.vandaag}' + (n || ' days')::interval
        from generate_series(10, ${DAGQUOTUM + 9}) as n;
        alter table public.day_checkins enable trigger day_checkins_binnen_de_cyclus;
      `);

      try {
        const over = await w.alice.db.rpc('dagafvinkingen_over');
        expect(over.data, 'het quotum hoort op nul te staan').toBe(0);

        const poging = await w.alice.db
          .from('day_checkins')
          .insert({ weekly_goal_id: w.weekdoelId, local_date: addDays(w.vandaag, 3) });

        expect(poging.error?.code, 'het dagquotum hoort de insert te weigeren').toBe('42501');
      } finally {
        psql(`delete from public.day_checkins where weekly_goal_id = '${w.weekdoelId}'
                and local_date > date '${w.vandaag}' + 9;`);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'je verwijdert de afvinking van een ander niet',
    async () => {
      // ⚠️ **Dit bewaakt het páár en niet de helft** — zie de kop. Alleen
      //    `day_checkins_delete` openzetten verandert niets, want de leespolicy
      //    is dezelfde uitdrukking en een DELETE gaat als `DELETE … RETURNING`.
      const poging = await w.bob.db.from('day_checkins').delete().eq('id', w.afvinkingId);
      expect(poging.error, 'PostgREST weigert niet, hij raakt niets').toBeNull();

      const na = await adminDb().from('day_checkins').select('id').eq('id', w.afvinkingId);
      expect(na.data ?? [], 'de afvinking van alice hoort er nog te staan').toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'je verwijdert het pushtoken van een ander niet',
    async () => {
      // ⚠️ Zelfde paarvorm als hierboven. En het gevolg is groter dan het lijkt:
      //    wie andermans token wist, zet stilletjes zijn meldingen uit — en dat
      //    merk je pas als er iets niet aankomt.
      const poging = await w.bob.db.from('push_tokens').delete().eq('id', w.tokenId);
      expect(poging.error, 'PostgREST weigert niet, hij raakt niets').toBeNull();

      const na = await adminDb().from('push_tokens').select('id').eq('id', w.tokenId);
      expect(na.data ?? [], 'het token van alice hoort er nog te staan').toHaveLength(1);
    },
    TEST_TIMEOUT,
  );
});
