import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { groepsperiodeVan } from '../../src/modules/buddies/periods';
import { addDays, now, userCycle, type IsoDate, type TimeZone } from '../../src/shared/time';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * De quota-conjunct in vier insert-policies schrijft niet — QS8-561, uit QS8-557.
 *
 * `tests/rls/bulkschrijf.test.ts` bewaakt deze belofte voor `weekly_plan_steps`.
 * 📏 Gemeten op 19-09-2026 in `pg_policy`: **vijf** insert-policies dragen een
 * conjunct `<iets>_over() > 0`, en de vier andere stonden even onbewaakt als die
 * ene stond toen QS8-557 hem wagenwijd openzette zonder dat iets rood werd.
 *
 * ## Wat de conjunct wél en niet doet — per tabel nagemeten, niet overgenomen
 *
 * 📏 Gemeten uit `pg_get_functiondef()` en `pg_trigger`, voor alle vier:
 *
 *   - de conjunct weigert zodra `<iets>_over() = 0`, dus zodra de teller op het
 *     plafond staat;
 *   - `begrens_<iets>()` hangt als **`after insert … for each statement`** aan
 *     dezelfde tabel, telt dezelfde populatie en toetst tegen hetzelfde
 *     `<iets>_plafond()`;
 *   - `rem_<iets>()` is `before insert … for each row` op tweemaal dat plafond.
 *
 * ⚠️⚠️ **Daarmee is de conjunct voor de weigering redundant, en dat is de reden
 *    dat een toets op "dit wordt geweigerd" hier niets bewaakt.** Haal de
 *    conjunct weg en de handhaver weigert hetzelfde verzoek — één rij later.
 *    Wat de conjunct in zijn eentje levert is dat de rijen **niet geschreven
 *    worden**: hij is een `with check` en weigert vóór het schrijven, de
 *    handhaver is `after insert` en weigert nadat alles op schijf staat.
 *
 * ⚠️ De drempels: `chat_messages` 500, `day_checkins` 500,
 *    `week_review_replies` 100, `weekly_goals` 200 — 📏 uitgelezen uit de
 *    `*_plafond()`-functies zelf en niet uit een migratiebestand.
 *
 * ## ⚠️⚠️ Wat deze toetsen NIET zijn: een grendel tegen misbruik
 *
 * Dezelfde beperking als in `bulkschrijf.test.ts`, en ze geldt hier woordelijk.
 * Een aanvaller komt nooit in de toestand die hier getoetst wordt: zijn rijen
 * worden geweigerd, dus ze committen nooit, dus zijn teller blijft nul en
 * `<iets>_over()` geeft altijd het volle plafond. Wat de conjunct wél levert is
 * de nette afhandeling van een legitieme herhaling door wie zijn plafond écht
 * gehaald heeft. Het gat erachter staat als open risico **Hoog** in rij 609 van
 * `docs/ENGINEER-REVIEW.md`: er staat geen rate limit vóór PostgREST.
 *
 * ## De vulkant verschilt per tabel, en dat is geen detail
 *
 * 📏 `berichten_over()` en `weekreacties_over()` tellen op **auteur**
 * (`sender_id` / `author_id`); `dagafvinkingen_over()` en `weekdoelen_over()`
 * tellen via de **eigenaar** van het doel. Opvullen via `adminDb()` telt dus
 * alleen mee voor die laatste twee — voor de eerste twee moet de gebruiker zijn
 * eigen rijen schrijven, anders staat hij bij de meting helemaal niet op zijn
 * plafond en meet de toets niets.
 *
 * ## ⚠️ De volgorde van de asserties is de ijkbaarheid
 *
 * De schijfmeting staat vóór de foutcode-assertie. Andersom is geen van deze
 * toetsen te ijken: de mutatie flipt óók de code, die assertie gooit als eerste,
 * en de meting die de belófte raakt draait nooit. Die val is in QS8-557 in de
 * eerste versie van de toets gelopen.
 *
 * IJKING — met de hand gedraaid op 19-09-2026, **per conjunct apart**: de policy
 * opnieuw aangemaakt zónder `<iets>_over() > 0` en verder woordelijk gelijk, de
 * suite erna, en daarna `npm run rls:stack` om hem terug te zetten. Elke mutatie
 * maakt precies één toets rood, en telkens op de schijfassertie:
 *
 *   `weekdoelen_over` weg          -> weekly_goals groeide 344 kB
 *   `dagafvinkingen_over` weg      -> day_checkins groeide 1368 kB
 *   `berichten_over` weg           -> chat_messages groeide 3520 kB
 *   `weekreacties_over` weg        -> week_review_replies groeide 464 kB
 *
 * ⚠️ Vier mutaties en geen één voor alle vier, want dat zou niets zeggen over de
 *    drie andere policies. En 📏 in alle vier de gevallen bleef assertie 1
 *    (*"elk verzoek wordt geweigerd"*) groen — dat is de bevinding van QS8-557
 *    nog een keer: de weigering is niet wat deze conjunct levert.
 */

const SETUP_TIMEOUT = 300_000;
const TEST_TIMEOUT = 300_000;

/** Genoeg herhalingen om het signaal ruim boven de drempel te tillen. */
const RONDES = 10;

/**
 * De drempel waaronder de groei van een tabel nog "niet gegroeid" heet.
 *
 * 📏 Dezelfde 150 kB als in `bulkschrijf.test.ts`, en hij houdt het voor alle
 *    vier — het kleinste gemeten signaal zónder de conjunct is `weekly_goals`
 *    met 344 kB, dus factor 2,3. De andere drie liggen ruimer: 464 kB
 *    (`week_review_replies`), 1368 kB (`day_checkins`) en 3520 kB
 *    (`chat_messages`). Alle vier gemeten op 19-09-2026 met `RONDES = 10`.
 *
 * ⚠️ **De marge is er niet voor parallelle ruis.** 📏 `vitest.config.mts` zet voor
 *    de `rls`-groep `fileParallelism: false` én `sequence: { concurrent: false }`.
 *    Hij is er voor **vrijgemaakte ruimte**: eerdere bestanden laten dode tuples
 *    en halfvolle pagina's achter, en dan groeit een tabel onder de mutatie
 *    minder hard omdat hij die ruimte hergebruikt.
 *
 * ⚠️ Wie deze drempel ooit ruimer zet omdat een toets rood werd, repareert het
 *    verkeerde: er is geen ruisbron die hem legitiem over de 150 kB tilt. De
 *    opvulling staat vóór de nulmeting, dus die telt niet mee.
 */
const DREMPEL = 150 * 1024;

function tabelbytes(tabel: string): number {
  return Number(psql(`select pg_total_relation_size('public.${tabel}')`).trim());
}

function moetLukken<T extends { error: { message?: string } | null }>(uit: T, wat: string): T {
  if (uit.error !== null) throw new Error(`${wat}: ${uit.error.message ?? 'onbekende fout'}`);
  return uit;
}

/**
 * De gedeelde staart van elke toets hieronder.
 *
 * ⚠️ `drempel` is per tabel gemeten en geen ronde schatting; de waarde staat bij
 *    de aanroep, met het signaal zónder de conjunct ernaast.
 */
function beoordeel(
  tabel: string,
  codes: readonly (string | undefined)[],
  groei: number,
  drempel: number,
  signaal: string,
): void {
  // Assertie 1 — blijft met opzet groen onder de mutatie: de weigering is niet
  // wat deze conjunct levert, de handhaver doet dat ook.
  expect(
    codes.every((c) => c !== undefined),
    `elk verzoek boven het dagplafond van ${tabel} hoort geweigerd te worden`,
  ).toBe(true);

  // Assertie 2 — de belofte, en daarom vóór de foutcode.
  expect(
    groei,
    `${tabel} groeide met ${Math.round(groei / 1024)} kB na ${RONDES} geweigerde verzoeken; ` +
      `met de conjunct hoort dat nul te zijn (📏 zonder hem: ${signaal})`,
  ).toBeLessThan(drempel);

  // Assertie 3 — de diagnose: wélke grendel sprak. 23514 betekent dat de
  // handhaver het overnam, en dan stonden de rijen al op schijf.
  expect(
    [...new Set(codes)],
    `42501 is de policy die vóór het schrijven weigert; 23514 is de handhaver die ná het ` +
      `schrijven weigert — dan is de conjunct weg`,
  ).toEqual(['42501']);
}

describe.skipIf(!rlsTestsConfigured)('de quota-conjunct schrijft niet', () => {
  let alice: TestUser;
  let bob: TestUser;
  let cyclus: IsoDate;

  beforeAll(async () => {
    alice = await createTestUser('quota-alice');
    bob = await createTestUser('quota-bob');
    psql(`update profiles set tz = 'Europe/Amsterdam', week_start_day = 1 where id = '${alice.id}'`);
    cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' as TimeZone }, now()).startDate;
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Een doel van alice — de haak waar weekdoelen en afvinkingen aan hangen. */
  async function doelVan(titel: string): Promise<string> {
    const doel = moetLukken(
      await adminDb()
        .from('goals')
        .insert({ owner_id: alice.id, title: titel, target_date: addDays(cyclus, 90) })
        .select('id')
        .single(),
      `doel ${titel}`,
    );
    return (doel.data as { id: string }).id;
  }

  // -------------------------------------------------------------------------
  // weekly_goals — plafond 200, telt via de eigenaar
  // -------------------------------------------------------------------------

  it(
    'weekly_goals: wie op zijn dagplafond zit, laat de tabel niet groeien',
    async () => {
      const PLAFOND = 200;
      const doelId = await doelVan('QUOTA weekdoelen');

      // Opvullen via `adminDb()` mag hier: `weekdoelen_over()` telt het venster
      // van de eigenaar en niet van de schrijver. 📏 `weekdoel_cyclus_klopt()`
      // keert vroeg terug zodra `auth.uid()` null is, dus de cyclus knelt niet.
      moetLukken(
        await adminDb()
          .from('weekly_goals')
          .insert(
            Array.from({ length: PLAFOND }, (_, i) => ({
              goal_id: doelId,
              title: `opvulling ${i}`,
              cycle_start_date: cyclus,
            })),
          ),
        'weekdoelen opvullen tot het plafond',
      );

      const vooraf = tabelbytes('weekly_goals');
      const codes: (string | undefined)[] = [];
      for (let ronde = 0; ronde < RONDES; ronde += 1) {
        const rijen = Array.from({ length: PLAFOND * 2 }, (_, i) => ({
          goal_id: doelId,
          title: `poging ${ronde}-${i}`,
          cycle_start_date: cyclus,
        }));
        codes.push((await alice.db.from('weekly_goals').insert(rijen)).error?.code);
      }
      const groei = tabelbytes('weekly_goals') - vooraf;

      beoordeel('weekly_goals', codes, groei, DREMPEL, '344 kB (352.256 bytes), factor 2,3 op de drempel');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // day_checkins — plafond 500, telt via de eigenaar
  // -------------------------------------------------------------------------

  it(
    'day_checkins: wie op zijn dagplafond zit, laat de tabel niet groeien',
    async () => {
      const PLAFOND = 500;
      const doelId = await doelVan('QUOTA afvinkingen');

      // ⚠️ **Zeven per weekdoel en geen achtste.** `afvinking_binnen_de_cyclus()`
      //    keert níet vroeg terug bij een lege `auth.uid()` — hij eist altijd dat
      //    `local_date` binnen `[cycle_start, cycle_start + 6]` valt — en
      //    `day_checkins_een_per_dag` is uniek op `(weekly_goal_id, local_date)`.
      //    Eén weekdoel levert dus hoogstens zeven afvinkingen, en de opvulling
      //    plus de aanvalsbatch vragen daarom hun eigen weekdoelen.
      const perWeekdoel = 7;
      const nodig = Math.ceil(PLAFOND / perWeekdoel) + Math.ceil((PLAFOND * 2) / perWeekdoel) + 1;
      const weekdoelen = moetLukken(
        await adminDb()
          .from('weekly_goals')
          .insert(
            Array.from({ length: nodig }, (_, i) => ({
              goal_id: doelId,
              title: `afvinkhaak ${i}`,
              cycle_start_date: cyclus,
            })),
          )
          .select('id'),
        'weekdoelen voor de afvinkingen',
      );
      const ids = (weekdoelen.data as { id: string }[]).map((r) => r.id);
      const vulIds = ids.slice(0, Math.ceil(PLAFOND / perWeekdoel));
      const aanvalIds = ids.slice(Math.ceil(PLAFOND / perWeekdoel));

      /**
       * ⚠️ De `??` is geen voorzichtigheid maar een grendel: valt hij ooit aan,
       *    dan zijn er te weinig weekdoelen gemaakt en zou de aanvalsbatch stil
       *    kleiner worden dan `plafond * 2` — en dan meet de toets iets anders
       *    dan hij zegt. Een ontbrekend weekdoel is hier een harde fout.
       */
      const afvinkingen = (bron: readonly string[], hoeveel: number) =>
        Array.from({ length: hoeveel }, (_, i) => {
          const haak = bron[Math.floor(i / perWeekdoel)];
          if (haak === undefined) throw new Error(`te weinig weekdoelen voor rij ${i}`);
          return { weekly_goal_id: haak, local_date: addDays(cyclus, i % perWeekdoel) };
        });

      moetLukken(
        await adminDb().from('day_checkins').insert(afvinkingen(vulIds, PLAFOND)),
        'afvinkingen opvullen tot het plafond',
      );

      const vooraf = tabelbytes('day_checkins');
      const codes: (string | undefined)[] = [];
      for (let ronde = 0; ronde < RONDES; ronde += 1) {
        // Dezelfde rijen elke ronde: ze worden geweigerd, dus ze botsen nooit
        // met zichzelf op `day_checkins_een_per_dag`.
        codes.push(
          (await alice.db.from('day_checkins').insert(afvinkingen(aanvalIds, PLAFOND * 2))).error?.code,
        );
      }
      const groei = tabelbytes('day_checkins') - vooraf;

      beoordeel('day_checkins', codes, groei, DREMPEL, '1368 kB (1.400.832 bytes), factor 9,1 op de drempel');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // chat_messages — plafond 500, telt op de afzender
  // -------------------------------------------------------------------------

  it(
    'chat_messages: wie op zijn dagplafond zit, laat de tabel niet groeien',
    async () => {
      const PLAFOND = 500;

      const groep = await alice.db.rpc('create_group', { group_name: 'QUOTA berichten' });
      const uit = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);
      const groepId = uit.group.id;

      // ⚠️ **Alice schrijft haar eigen opvulling.** `berichten_over()` telt op
      //    `sender_id`; via `adminDb()` opvullen zou haar teller niet raken en de
      //    meting zou dan niets meten.
      moetLukken(
        await alice.db.from('chat_messages').insert(
          Array.from({ length: PLAFOND }, (_, i) => ({
            group_id: groepId,
            sender_id: alice.id,
            body: `opvulling ${i}`,
          })),
        ),
        'berichten opvullen tot het plafond',
      );

      const vooraf = tabelbytes('chat_messages');
      const codes: (string | undefined)[] = [];
      for (let ronde = 0; ronde < RONDES; ronde += 1) {
        const rijen = Array.from({ length: PLAFOND * 2 }, (_, i) => ({
          group_id: groepId,
          sender_id: alice.id,
          body: `poging ${ronde}-${i} `.repeat(8),
        }));
        codes.push((await alice.db.from('chat_messages').insert(rijen)).error?.code);
      }
      const groei = tabelbytes('chat_messages') - vooraf;

      beoordeel('chat_messages', codes, groei, DREMPEL, '3520 kB (3.604.480 bytes), factor 23,4 op de drempel');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // week_review_replies — plafond 100, telt op de auteur
  // -------------------------------------------------------------------------

  it(
    'week_review_replies: wie op zijn dagplafond zit, laat de tabel niet groeien',
    async () => {
      const PLAFOND = 100;

      const groep = await alice.db.rpc('create_group', { group_name: 'QUOTA weekreacties' });
      const uit = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (uit.ok !== true || !uit.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

      const meedoen = await bob.db.rpc('join_group_with_code', { code: uit.group.invite_code });
      const mee = (meedoen.data ?? {}) as { ok?: boolean; reason?: string };
      if (mee.ok !== true) throw new Error(`bob werd geen lid: ${mee.reason ?? 'geen reden'}`);

      const rij = moetLukken(
        await adminDb().from('groups').select('huddle_day, tz').eq('id', uit.group.id).single(),
        'groep uitlezen',
      );
      const periode = groepsperiodeVan(rij.data as { huddle_day: number; tz: string }, now());

      const review = moetLukken(
        await alice.db
          .from('week_reviews')
          .insert({
            group_id: uit.group.id,
            user_id: alice.id,
            group_period_start: periode.startDate,
            did_text: 'Drie ochtenden geschreven.',
          })
          .select('id')
          .single(),
        'weekafsluiting',
      );
      const reviewId = (review.data as { id: string }).id;

      // Ook hier schrijft alice zelf: `weekreacties_over()` telt op `author_id`.
      moetLukken(
        await alice.db.from('week_review_replies').insert(
          Array.from({ length: PLAFOND }, (_, i) => ({
            week_review_id: reviewId,
            author_id: alice.id,
            body: `opvulling ${i}`,
          })),
        ),
        'weekreacties opvullen tot het plafond',
      );

      const vooraf = tabelbytes('week_review_replies');
      const codes: (string | undefined)[] = [];
      for (let ronde = 0; ronde < RONDES; ronde += 1) {
        const rijen = Array.from({ length: PLAFOND * 2 }, (_, i) => ({
          week_review_id: reviewId,
          author_id: alice.id,
          body: `poging ${ronde}-${i} `.repeat(8),
        }));
        codes.push((await alice.db.from('week_review_replies').insert(rijen)).error?.code);
      }
      const groei = tabelbytes('week_review_replies') - vooraf;

      beoordeel('week_review_replies', codes, groei, DREMPEL, '464 kB (475.136 bytes), factor 3,1 op de drempel');
    },
    TEST_TIMEOUT,
  );
});
