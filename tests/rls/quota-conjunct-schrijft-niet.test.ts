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
 * conjunct `<iets>_over() > 0`, en de vier andere droegen er geen toets op.
 *
 * ⚠️⚠️ **"Geen toets" is niet hetzelfde als "niets werd rood", en dat verschil is
 *    op 21-09-2026 nagemeten omdat de eerste versie van deze kop het door elkaar
 *    haalde.** Haal je de conjunct uit `chat_messages_insert`,
 *    `day_checkins_insert` of `weekly_goals_insert`, dan wórdt er iets rood —
 *    📏 `rem.test.ts:144`, `afvinkgrens.test.ts:213` en `bulkschrijf.test.ts:239`,
 *    elk precies één toets. Maar alle drie vallen om op de **foutcode**
 *    (`23514` waar `42501` verwacht werd), en geen van die drie gevallen meet de
 *    schijf: `rem.test.ts` zet er een rijtelling achter, de andere twee niets.
 *    (`bulkschrijf.test.ts` méét de schijf wel — maar in zijn eigen toets over
 *    `weekly_plan_steps`, niet in deze.)
 *
 *    ⚠️ En een rijtelling kán deze belofte niet zien. 📏 Dat volgt uit de
 *       ijking hieronder: de tabel groeit terwijl assertie 1 (*"elk verzoek
 *       wordt geweigerd"*) groen blijft — de rijen zijn dus geschreven en
 *       daarna teruggerold, en een telling achteraf klopt precies zoals ze
 *       klopte.
 *
 * ⚠️⚠️ **Dat is de gevaarlijkste vorm, niet de veiligste.** Die drie toetsen
 *    zeggen wat er rood is en dat is niet wat er stuk is, en `bulkschrijf.test.ts`
 *    zegt het met zoveel woorden verkeerd: zijn boodschap luidt *"23514 betekent
 *    dat de rem het venster telt in plaats van dit verzoek"*, en dat is onder
 *    déze mutatie een onjuiste diagnose die de volgende lezer naar de rem stuurt.
 *    De belofte — de rijen worden niet geschreven — stond bij alle vier even
 *    onbewaakt.
 *
 * ⚠️ 📏 En bij de vierde wordt er inderdaad niets rood: met
 *    `weekreacties_over() > 0` uit `week_review_replies_insert` liep de hele
 *    `tests/rls`-boom zonder dit bestand groen door op **185 bestanden en 2143
 *    toetsen** (21-09-2026).
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
 * gehaald heeft. Het gat erachter staat als open risico **Hoog** in de rij
 * *Er staat geen rate limit vóór PostgREST* (08-09-2026) van
 * `docs/ENGINEER-REVIEW.md`.
 *
 * ## De vulkant verschilt per tabel, en dat is geen detail
 *
 * 📏 `berichten_over()` en `weekreacties_over()` tellen op **auteur**
 * (`sender_id` / `author_id`); `dagafvinkingen_over()` en `weekdoelen_over()`
 * tellen via de **eigenaar** van het doel. De opvulling moet die kolom dus
 * vullen met de id van de testgebruiker, anders staat hij bij de meting helemaal
 * niet op zijn plafond en meet de toets niets terwijl hij groen is.
 *
 * ⚠️ **Wat daar níet uit volgt, en wat QS8-557 er wél uit afleidde: dat de
 *    gebruiker zijn opvulling zelf moet schrijven.** 📏 Nagemeten op 21-09-2026:
 *    een rij die buiten de sessie van de gebruiker geschreven wordt mét
 *    `sender_id` op zijn id telt gewoon mee — `berichten_over()` ging van 500
 *    naar 499 — want `berichten_over()` leest de **kolom** en niet de schrijver,
 *    en `stamp_chat_message()` zet `sender_id` alleen bij UPDATE terug
 *    (`new.sender_id := old.sender_id`), nooit bij INSERT.
 *
 *    De toetsen hieronder laten de gebruiker zijn chatopvulling tóch zelf
 *    schrijven — dat is dichter bij de werkelijkheid en kost niets — maar de
 *    regel eronder is *"de kolom draagt zijn id"*, en die geldt voor alle vier.
 *
 * ## ⚠️ De volgorde van de asserties is de ijkbaarheid
 *
 * De schijfmeting staat vóór de foutcode-assertie. Andersom is geen van deze
 * toetsen te ijken: de mutatie flipt óók de code, die assertie gooit als eerste,
 * en de meting die de belófte raakt draait nooit. Die val is in QS8-557 in de
 * eerste versie van de toets gelopen.
 *
 * IJKING — met de hand gedraaid op 19-09-2026 en op 21-09-2026 opnieuw,
 * **per conjunct apart**: de policy opnieuw aangemaakt zónder `<iets>_over() > 0`
 * en verder woordelijk gelijk, de suite erna, en daarna de policy teruggezet en
 * `pg_get_expr()` ernaast gelegd om te tonen dat hij woordelijk terug is. Elke
 * mutatie maakt precies één toets uit dít bestand rood, en telkens op de
 * schijfassertie. En 📏 in alle vier de gevallen bleef assertie 1 (*"elk verzoek
 * wordt geweigerd"*) groen — dat is de bevinding van QS8-557 nog een keer: de
 * weigering is niet wat deze conjunct levert.
 *
 * ⚠️ Vier mutaties en geen één voor alle vier, want dat zou niets zeggen over de
 *    drie andere policies.
 *
 * ⚠️⚠️ **De groei is geen getal maar een spreiding, en dat is op 21-09-2026
 *    rechtgezet.** De eerste versie van deze kop noemde één meting per tabel
 *    alsof het dé waarde was; 📏 `weekly_goals` kwam daar op 344 kB uit en dat
 *    getal is in vijf latere metingen **niet één keer** teruggekomen. Het is
 *    precies de grootheid die volgens de `DREMPEL`-kop hieronder varieert met
 *    vrijgemaakte ruimte, dus één monster zégt niets — en het was uitgerekend
 *    het monster waar de drempel op verantwoord werd.
 *
 *   tabel                  gemeten zonder de conjunct        kleinste   factor
 *   weekly_goals           344*, 448, 584, 688, 704, 736 kB   448 kB     3,0
 *   week_review_replies    464, 504, 528 kB                   464 kB     3,1
 *   day_checkins           1304, 1368, 1480 kB               1304 kB     8,7
 *   chat_messages          3360, 3456, 3520 kB               3360 kB    22,4
 *
 *   (*) de 344 kB van 19-09-2026, één keer gezien en nooit gereproduceerd.
 */

const SETUP_TIMEOUT = 300_000;
const TEST_TIMEOUT = 300_000;

/** Genoeg herhalingen om het signaal ruim boven de drempel te tillen. */
const RONDES = 10;

/**
 * De drempel waaronder de groei van een tabel nog "niet gegroeid" heet.
 *
 * 📏 Dezelfde 150 kB als in `bulkschrijf.test.ts`, en hij houdt het voor alle
 *    vier. Het **kleinste** signaal zónder de conjunct, over alle metingen in de
 *    IJKING-tabel hierboven, is `weekly_goals` met 448 kB — factor 3,0. De
 *    andere drie liggen ruimer: 464 kB (`week_review_replies`), 1304 kB
 *    (`day_checkins`) en 3360 kB (`chat_messages`). Gemeten op 19- en 21-09-2026
 *    met `RONDES = 10`.
 *
 * ⚠️ **Het kleinste en niet het gemiddelde.** Een drempel die op een gemiddelde
 *    leunt, laat de helft van de metingen aan de verkeerde kant vallen.
 *
 * ⚠️ **De marge is er niet voor parallelle ruis.** 📏 `vitest.config.mts` zet voor
 *    de `rls`-groep `fileParallelism: false` én `sequence: { concurrent: false }`.
 *    Hij is er voor **vrijgemaakte ruimte**: eerdere bestanden laten dode tuples
 *    en halfvolle pagina's achter, en dan groeit een tabel onder de mutatie
 *    minder hard omdat hij die ruimte hergebruikt.
 *
 * ⚠️ **Dit bestand is daar zelf een bron van**, en dat verklaart de spreiding in
 *    de IJKING-tabel hierboven: de opvulling van vier tabellen (200 + 216
 *    weekdoelen, 500 afvinkingen, 500 berichten, 100 reacties) verdwijnt in
 *    `afterAll` met `removeTestUsers()`, maar de ruimte komt pas met een vacuum
 *    terug bij de vrije lijst. Een volgende run meet daardoor niet dezelfde
 *    beginstand als deze.
 *
 * ⚠️ Wie deze drempel ooit ruimer zet omdat een toets rood werd, repareert het
 *    verkeerde: er is geen ruisbron die hem legitiem over de 150 kB tilt. De
 *    opvulling staat vóór de nulmeting, dus die telt niet mee.
 */
const DREMPEL = 150 * 1024;

/** De vier tellers die de conjunct leest — één naam per tabel. */
type Quotateller = 'berichten_over' | 'dagafvinkingen_over' | 'weekdoelen_over' | 'weekreacties_over';

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

  // Assertie 3 — de diagnose: wélke grendel sprak. 23514 betekent dat een
  // grendel ná het begin van het schrijven het overnam, en dan staan er rijen
  // op schijf.
  expect(
    [...new Set(codes)],
    `42501 is de policy die vóór het schrijven weigert; 23514 is een grendel die pas ná het ` +
      `begin van het schrijven weigert (de handhaver of de rem) — dan is de conjunct weg`,
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

  /**
   * De naad tussen de opvulling en de meting — regel 18 vraag 3 in zijn
   * goedkoopste vorm.
   *
   * ⚠️⚠️ **Zonder deze assertie is elke toets hieronder groen te houden met een
   *    fixture die de toestand niet maakt die hij beweert te maken.** Vult de
   *    opvulling de verkeerde kolom (de vulkant hierboven), of verschuift een
   *    `*_plafond()` ooit weg van de waarde die hier hardgecodeerd staat, dan
   *    staat de gebruiker niet op nul, passeert een deel van de aanvalsbatch de
   *    conjunct gewoon, en meet de schijfassertie iets anders dan haar naam zegt.
   *
   * IJKING — 21-09-2026, met de hand: de chatopvulling via `adminDb()` met
   * `sender_id: bob.id` in plaats van dat van alice. 📏 `staatOpZijnPlafond()`
   * wordt rood met `500` waar `0` hoort — en dat is precies de fixture-fout
   * die QS8-557 als regel opschreef en die hier dus wél te maken is met
   * `adminDb()`: niet omdat de schrijver de verkeerde is, maar omdat de kolom de
   * verkeerde id draagt.
   *
   * ⚠️ Hij gooit vóór de meting, dus wat de schijfassertie daarná gedaan zou
   *    hebben is niet gemeten en staat hier niet. Dát is de winst: een kapotte
   *    fixture komt eruit als een kapotte fixture, en niet als een groeigetal
   *    dat de lezer moet duiden.
   */
  async function staatOpZijnPlafond(teller: Quotateller, tabel: string): Promise<void> {
    const over = await alice.db.rpc(teller);
    expect(over.data, `${teller}() hoort na de opvulling van ${tabel} op nul te staan`).toBe(0);
  }

  // -------------------------------------------------------------------------
  // weekly_goals — plafond 200, telt via de eigenaar
  // -------------------------------------------------------------------------

  it(
    'weekly_goals: wie op zijn dagplafond zit, laat de tabel niet groeien',
    async () => {
      const PLAFOND = 200;
      const doelId = await doelVan('QUOTA weekdoelen');

      // Opvullen via `adminDb()` kan hier zonder de eigenaar mee te geven:
      // `weekdoelen_over()` telt het venster van de **doel-eigenaar**, en dat is
      // alice via `doelVan()`. 📏 `weekdoel_cyclus_klopt()` keert vroeg terug
      // zodra `auth.uid()` null is, dus de cyclus knelt niet.
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

      await staatOpZijnPlafond('weekdoelen_over', 'weekly_goals');

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

      beoordeel('weekly_goals', codes, groei, DREMPEL, '448-736 kB over vijf metingen, kleinste factor 3,0 op de drempel');
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

      await staatOpZijnPlafond('dagafvinkingen_over', 'day_checkins');

      const vooraf = tabelbytes('day_checkins');
      const codes: (string | undefined)[] = [];
      for (let ronde = 0; ronde < RONDES; ronde += 1) {
        // Dezelfde rijen elke ronde: ze worden geweigerd, dus ze committen nooit
        // en botsen nooit met zichzelf op `day_checkins_een_per_dag`.
        //
        // ⚠️ De opvulling (500) plus deze batch (1000) tilt het venster boven de
        //    remgrens van `plafond * 2`. Met de conjunct intact doet dat niets —
        //    de rem is `before insert … for each row` en telt bij rij 1 pas 500 —
        //    maar bij de ijking kan hij de weigering overnemen van de handhaver.
        //    Voor de schijfassertie maakt dat niet uit: allebei weigeren ze
        //    nadat er rijen geschreven zijn, en dat is wat hier gemeten wordt.
        codes.push(
          (await alice.db.from('day_checkins').insert(afvinkingen(aanvalIds, PLAFOND * 2))).error?.code,
        );
      }
      const groei = tabelbytes('day_checkins') - vooraf;

      beoordeel('day_checkins', codes, groei, DREMPEL, '1304-1480 kB over drie metingen, kleinste factor 8,7 op de drempel');
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

      // ⚠️ **Alice schrijft haar eigen opvulling**, en dat is hier de vorm die
      //    het dichtst bij de werkelijkheid ligt. De *eis* is smaller: 📏
      //    `berichten_over()` telt op de kolom `sender_id`, dus een opvulling via
      //    `adminDb()` mét `sender_id: alice.id` telt net zo goed mee (gemeten
      //    21-09-2026: 500 -> 499). Wat niet mag is de kolom een ándere id geven.
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

      await staatOpZijnPlafond('berichten_over', 'chat_messages');

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

      beoordeel('chat_messages', codes, groei, DREMPEL, '3360-3520 kB over drie metingen, kleinste factor 22,4 op de drempel');
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

      await staatOpZijnPlafond('weekreacties_over', 'week_review_replies');

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

      beoordeel('week_review_replies', codes, groei, DREMPEL, '464-528 kB over drie metingen, kleinste factor 3,1 op de drempel');
    },
    TEST_TIMEOUT,
  );
});
