/**
 * Een weekafsluiting is niet te wissen — QS8-486, migratie 0263.
 *
 * ⚠️ **Domeinregel 6: streaks en voltooiingen zijn append-only.** Corrigeren
 *    gaat via een correctie-record en niet door geschiedenis weg te halen. De
 *    weekafsluiting ís de afsluiting van die week, en tot 0263 haalde de
 *    eigenaar hem met één DELETE weg.
 *
 * 📏 **Gemeten vóór de reparatie**, als gewone ingelogde eigenaar via de policy:
 *
 *   STAP 1 na insert : wr=1 chain=1
 *   STAP 2 na delete : wr=0 chain=1     <- DELETE 1
 *   STAP 3 opnieuw   : wr=1 chain=1
 *
 *    De schakel in De Ketting bleef dus staan terwijl de afsluiting verdween:
 *    de twee spraken elkaar tegen en niets merkte dat op.
 *
 * ⚠️⚠️ **Waarom dit bestand naast `archief-leesbaar.test.ts` staat en niet erin.**
 *    Daar staat een geval dat "laat niemand zijn eigen weekafsluiting meer
 *    wissen" heet en dat al die tijd groen was. 📏 Nagemeten waaróm: die
 *    opstelling archiveert de groep vóór de poging, en in een gearchiveerde
 *    groep is `is_group_member()` onwaar. De delete botste daar op het archief
 *    en niet op een append-only-regel.
 *
 *    Dat is regel 18 vraag 2 — de naam noemt de belofte, de meting is een
 *    eigenschap van het archief — en vraag 3 erachteraan: hij bleef groen
 *    terwijl de belofte in élke lopende groep brak. **Een grendel die de
 *    verkeerde kant op kijkt is duurder dan geen grendel**, want een omissie
 *    valt op en een groene test met de juiste naam niet. Daarom voert dit
 *    bestand een **lopende** groep; die andere bewaakt de archiefkant en dat is
 *    een eigen eigenschap die mag blijven.
 *
 * 📏 IJKING, gedraaid 14-09-2026 — en de uitkomst was niet wat hier eerst stond:
 *
 *   A  alleen `grant delete … to authenticated` terug      -> **groen**
 *   B  alleen de policy terug op `for all`                 -> **groen**
 *   C  allebei terug                                       -> **1 rood**, precies
 *      de belofte-test; beide must-allows blijven groen.
 *
 * ⚠️⚠️ **0263 legt dus twee onafhankelijke sloten, en elk van de twee houdt in
 *    zijn eentje.** Hier stond eerst dat A de grendel was; dat was geredeneerd
 *    en niet gemeten, en het klopte niet. Wie later één van de twee weghaalt,
 *    ziet daar niets van — deze test blijft dan groen, en terecht, want de
 *    belófte houdt. Dat is regel 18 vraag 2 zoals het hoort: dit bestand bewaakt
 *    dat de weekafsluiting blijft staan, niet wélk slot dat doet.
 *
 * ⚠️ **De prijs staat erbij**, want gratis is het niet: verdwijnt ooit één van
 *    de twee, dan is er geen enkele melding, en de volgende die de ander
 *    aanraakt opent het gat alsnog. Het `revoke` en de gesplitste policy horen
 *    daarom bij elkaar gelezen te worden — zie de kop van 0263.
 *
 * ⚠️ **En de opstelling zelf was de eerste vondst van de ijking.** Met één
 *    gedeelde rij gaf C **twee** rode tests: de belofte en de must-allow erna,
 *    die niets meer te updaten had. Een ijking die twee dingen tegelijk omgooit,
 *    meet er geen van beide — vandaar dat de belofte-test zijn eigen rij maakt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { now } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

const TIMEOUT = 240_000;

let anna: TestUser;
let groep: string;
let periode: string;
let reviewId: string;
let tweeWekenTerug: string;

describe.runIf(rlsTestsConfigured)('een weekafsluiting is geen klad', () => {
  beforeAll(async () => {
    anna = await createTestUser('wrklad-anna');

    const res = await anna.db.rpc('create_group', { group_name: 'Kladgroep' });
    if (res.error) throw new Error(`groep: ${res.error.message}`);
    const g = (res.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(res.data)}`);
    groep = g.group.id;

    periode = groepsperiodeVan({ huddle_day: 0, tz: 'Europe/Amsterdam' }, now()).startDate;
    tweeWekenTerug = groepsperiodeVan(
      { huddle_day: 0, tz: 'Europe/Amsterdam' },
      new Date(now().getTime() - 14 * 24 * 60 * 60 * 1000),
    ).startDate;

    const review = await adminDb()
      .from('week_reviews')
      .insert({ group_id: groep, user_id: anna.id, group_period_start: periode, did_text: 'mijn week' })
      .select('id')
      .single();
    if (review.error) throw new Error(`review: ${review.error.message}`);
    reviewId = review.data.id;
  }, TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, TIMEOUT);

  /**
   * ⚠️ **De belofte, en hij wordt op de rij getoetst en niet op de foutcode.**
   *    Een DELETE die nul rijen raakt geeft in PostgREST gewoon 200 met een lege
   *    lijst; een test die op `42501` wacht, wacht hier mogelijk op iets dat
   *    nooit komt — en zou groen zijn zodra de grendel van vorm verandert. Wat
   *    telt is dat de rij er ná de poging nog steeds is.
   */
  it(
    'de eigenaar wist zijn eigen weekafsluiting niet, in een lopende groep',
    async () => {
      // ⚠️⚠️ **Een eigen rij, en dat is geen netheid maar een ijkingseis.**
      //    📏 Met de gedeelde rij gaf de ijking (grant én `for all` terug) twee
      //    rode tests: deze, en de must-allow erna die niets meer te updaten
      //    had. Dan is niet meer te zien welke grendel wát bewaakt — en een
      //    ijking die twee dingen tegelijk omgooit, meet er geen van beide.
      const eigen = await adminDb()
        .from('week_reviews')
        .insert({
          group_id: groep,
          user_id: anna.id,
          group_period_start: tweeWekenTerug,
          did_text: 'deze mag niet weg',
        })
        .select('id')
        .single();
      if (eigen.error) throw new Error(`eigen review: ${eigen.error.message}`);

      await anna.db.from('week_reviews').delete().eq('id', eigen.data.id);

      const { data } = await adminDb().from('week_reviews').select('id').eq('id', eigen.data.id);

      expect((data ?? []).length, 'de weekafsluiting is weg').toBe(1);
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **De must-allow die 0263 het duurst had kunnen kosten.**
   *    `bewaarWeekafsluiting()` is een upsert; PostgREST maakt daar
   *    `insert … on conflict … do update set …` van, en Postgres eist het
   *    UPDATE-recht bij het plannen — ook als er niets botst. Zou 0263 de
   *    UPDATE-tak hebben meegenomen, dan was het opslaan van een weekafsluiting
   *    stuk en zou de belofte-test daar niets van zien.
   */
  it(
    'MUST-ALLOW: de eigenaar werkt zijn eigen weekafsluiting nog wél bij',
    async () => {
      const { error } = await anna.db
        .from('week_reviews')
        .update({ did_text: 'bijgewerkt' })
        .eq('id', reviewId);

      expect(error, `bijwerken geweigerd: ${error?.code ?? ''}`).toBeNull();

      const { data } = await adminDb().from('week_reviews').select('did_text').eq('id', reviewId).single();

      expect(data?.did_text).toBe('bijgewerkt');
    },
    TIMEOUT,
  );

  /**
   * ⚠️ **En de andere helft van de upsert.** Zonder dit geval is "bijwerken
   *    werkt" ook waar in een wereld waarin invoegen kapot is, en dan valt de
   *    breuk pas op bij de eerste gebruiker die een nieuwe week afsluit.
   */
  it(
    'MUST-ALLOW: de eigenaar legt een nieuwe weekafsluiting nog wél vast',
    async () => {
      const vorige = groepsperiodeVan(
        { huddle_day: 0, tz: 'Europe/Amsterdam' },
        new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000),
      ).startDate;

      const { error } = await anna.db.from('week_reviews').insert({
        group_id: groep,
        user_id: anna.id,
        group_period_start: vorige,
        did_text: 'week ervoor',
      });

      expect(error, `invoegen geweigerd: ${error?.code ?? ''}`).toBeNull();
    },
    TIMEOUT,
  );
});
