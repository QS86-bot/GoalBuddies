import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * De eigenaarsconjunct van `weekly_plan_steps_update` en `_delete` — QS8-280.
 *
 * ⚠️ **De belofte is: de weekplanstap van een ander is niet van jou.** Niet "de
 *    policy bevat een eigenaarsclausule" — dat is de vorm — maar: een
 *    groepsgenoot die je doel deelt, krijgt jouw stap niet weg en niet
 *    veranderd. Beide policies dragen daar een conjunct voor, en tot vandaag
 *    bewaakte geen enkele test hem.
 *
 * ## ⚠️ Waarom dit ooit "niet te ijken" heette, en waarom dat niet klopte
 *
 * De dossierrij van 03-09 en de kop van `schrijfgrenzen.test.ts` zetten dit weg
 * als onbereikbaar: `weekly_plan_steps_select` is eigenaar-only, dus een client
 * zíet de stap van een ander niet, zijn `where` raakt nul rijen, en de `using`
 * komt er nooit aan te pas.
 *
 * **Die redenering klopt voor een schrijfopdracht mét `where`, en alleen
 * daarvoor.** Postgres past het SELECT-beleid op een UPDATE of DELETE toe
 * zodra die kolommen leest — dus bij een `where` of een `returning`. Een
 * opdracht **zonder** filter leest niets, en dan is de eigenaarsconjunct van de
 * schrijfpolicy de énige grendel die er nog staat.
 *
 * ⚠️⚠️ **En dat is geen theoretisch pad.** Gemeten op 05-09: PostgREST
 *    accepteert een ongefilterde DELETE gewoon — `HTTP 204`, geen foutmelding —
 *    en `supabase-js` stuurt hem zonder te klagen (`{error: null, status: 204}`,
 *    en de eigen stap was daarna weg). Deze tests gaan daarom door de harness en
 *    niet langs psql: dit is wat een gewone client kan doen, niet wat een
 *    beheerder met een supergebruiker kan.
 *
 * 📏 Gemeten met de policies zoals ze zijn, en met de eigenaarsconjunct
 *    verruimd tot `... or shares_group_with_goal(goal_id)`:
 *
 * ```
 * Bob DELETE zonder filter  policy zoals hij is  -> stap blijft staan
 * Bob DELETE zonder filter  _delete.using ruim   -> stap WEG, HTTP 204, geen fout
 * Bob UPDATE zonder filter  policy zoals hij is  -> stap ongewijzigd, geen fout
 * Bob UPDATE zonder filter  _update.using ruim   -> fout 42501 (de `check` vangt hem)
 * Bob UPDATE zonder filter  using én check ruim  -> titel overschreven
 * ```
 *
 * ⚠️ **De DELETE-kant is de gevaarlijke helft.** Op een DELETE staat geen
 *    `with check`, dus daar is die ene conjunct het hele slot: valt hij weg, dan
 *    verdwijnt de stap van een ander zonder fout en zonder spoor.
 *
 * ⚠️ **De UPDATE-kant heeft er vandaag twee**, want de `check` draagt dezelfde
 *    eis. Dat is een reden om ze allebei te toetsen en geen reden om er één
 *    ongedekt te laten: wie ooit één van de twee verruimt, hoort rood te
 *    krijgen. Daarom eist de UPDATE-test niet alleen dat de titel gelijk blijft
 *    maar óók dat er géén fout kwam — bij een verruimde `using` verandert de
 *    uitkomst van "niets geraakt" naar "geweigerd", en een test die alleen naar
 *    de titel kijkt, blijft dan groen.
 *
 * ## ⚠️ Waarom hier ongefilterd geschreven wordt, en waarom dat veilig is
 *
 * Een ongefilterde `delete()` klinkt als een botte bijl in een gedeelde
 * database. Hij is hier het meetinstrument én ongevaarlijk om dezelfde reden:
 * **RLS begrenst hem tot de rijen die de acteur mag raken.** Precies dat is wat
 * gemeten wordt. Bob heeft zelf geen stappen, dus als er iets sneuvelt, is dat
 * de bevinding en niet de schade.
 *
 * ⚠️ **Elke test zet daarom zijn eigen stap neer en deelt er geen.** De eerste
 *    versie hing ze alle vier aan één rij uit `beforeAll`, en toen maakte de
 *    mutatie op `_delete.using` drie tests rood in plaats van één: de stap was
 *    na de eerste test weg, en de twee erna maten een kapotte opstelling. Rood
 *    is dan geen aanwijzing meer maar ruis — dezelfde reden waarom de RLS-suite
 *    sinds 27-08 op `fileParallelism: false` staat. Eén mutatie hoort precies
 *    één test rood te maken.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

let alice: TestUser;
let bob: TestUser;
let goalId = '';

const OORSPRONKELIJKE_TITEL = 'De stap van Alice';

/** Zet één open weekplanstap onder het doel van Alice en geeft zijn id terug. */
async function zetStap(titel: string): Promise<string> {
  const stap = await adminDb()
    .from('weekly_plan_steps')
    .insert({ goal_id: goalId, order_index: 1, title: titel })
    .select('id')
    .single();
  if (stap.error || stap.data === null) throw new Error(`stap: ${stap.error?.message}`);
  return stap.data.id;
}

/** Wat staat er nu op die stap — en staat hij er nog? */
async function stand(id: string): Promise<{ over: number; titel: string }> {
  const rij = await adminDb().from('weekly_plan_steps').select('title').eq('id', id);
  if (rij.error) throw new Error(`stand: ${rij.error.message}`);
  return { over: rij.data.length, titel: rij.data[0]?.title ?? 'WEG' };
}

describe.skipIf(!rlsTestsConfigured)('De weekplanstap van een ander is niet van jou', () => {
  beforeAll(async () => {
    alice = await createTestUser('planstap-alice');
    bob = await createTestUser('planstap-bob');

    // ⚠️ Via `create_group()` en `join_group_with_code()`, niet met rauwe
    //    inserts: dan is het lidmaatschap echt en klopt `shares_group_with_goal`
    //    aan beide kanten — de kijker én de eigenaar moeten actief lid zijn.
    const gemaakt = await alice.db.rpc('create_group', { group_name: 'Planstapgroep' });
    if (gemaakt.error) throw new Error(`groep: ${gemaakt.error.message}`);
    const g = (gemaakt.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (g.ok !== true || !g.group) throw new Error(`groep: ${JSON.stringify(gemaakt.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: g.group.invite_code });
    if (mee.error) throw new Error(`bob erbij: ${mee.error.message}`);

    const doel = await adminDb()
      .from('goals')
      .insert({
        owner_id: alice.id,
        title: 'Planstapdoel',
        target_date: '2027-12-31',
        status: 'active',
      })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    goalId = doel.data.id;

    // Het doel is gedeeld met de groep waar Bob in zit. Zonder deze regel is Bob
    // de zwákke aanvaller: hij wordt dan al door `shares_group_with_goal` zelf
    // tegengehouden en de eigenaarsconjunct komt er niet aan te pas.
    const deling = await adminDb()
      .from('goal_group_links')
      .insert({ goal_id: goalId, group_id: g.group.id });
    if (deling.error) throw new Error(`deling: ${deling.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'geeft Bob de stap van Alice niet te zien — de aanname waar de rest op rust',
    async () => {
      // ⚠️ De must-see vooraf, en hij is hier dubbel nodig. Ziet Bob de stap
      //    wél, dan is `_select` verruimd en meten de tests hieronder iets
      //    anders dan ze denken. Ziet hij hem níet en gaat er tóch iets stuk,
      //    dan is dat aantoonbaar de schrijfpolicy en niet de leespolicy.
      const stapId = await zetStap(OORSPRONKELIJKE_TITEL);
      const zicht = await bob.db.from('weekly_plan_steps').select('id').eq('id', stapId);

      expect(zicht.error, 'lezen mag geen fout geven, alleen nul rijen').toBeNull();
      expect(zicht.data, 'Bob hoort de stap van Alice niet te zien').toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'houdt de stap van Alice heel bij een ongefilterde delete van Bob',
    async () => {
      // ⚠️ **Zonder filter, en dat is het hele punt.** Met `?id=eq.…` erbij
      //    ketst Bob af op `_select` en bewijst deze test niets over de
      //    schrijfpolicy. Gemeten met een verruimde eigenaarsconjunct: de stap
      //    is dan weg, met `HTTP 204` en zonder foutmelding.
      const stapId = await zetStap(OORSPRONKELIJKE_TITEL);
      const uit = await bob.db.from('weekly_plan_steps').delete();
      const na = await stand(stapId);

      expect(uit.error, 'PostgREST weigert een ongefilterde delete niet — hij raakt nul rijen').toBeNull();
      expect(
        na,
        'de eigenaarsconjunct van `weekly_plan_steps_delete.using` is het enige slot ' +
          'hier: op een DELETE staat geen `with check`',
      ).toEqual({ over: 1, titel: OORSPRONKELIJKE_TITEL });
    },
    TEST_TIMEOUT,
  );

  it(
    'laat de stap van Alice ongemoeid bij een ongefilterde update van Bob',
    async () => {
      const stapId = await zetStap(OORSPRONKELIJKE_TITEL);
      const uit = await bob.db.from('weekly_plan_steps').update({ title: 'Gekaapt door Bob' });
      const na = await stand(stapId);

      // ⚠️ **De uitkomst hoort er net zo goed bij als de titel.** Verruim je
      //    alleen de `using`, dan bereikt de update de rij en weigert de `check`
      //    hem met 42501 — de titel blijft dan óók gelijk, en een test die daar
      //    stopt, blijft groen terwijl de eerste grendel weg is.
      expect(
        uit.error,
        'niets geraakt hoort geen fout te geven; een fout betekent dat de update de ' +
          'rij wél bereikte en pas door de `check` is tegengehouden',
      ).toBeNull();
      expect(na, 'de titel van Alice hoort onaangeroerd te blijven').toEqual({
        over: 1,
        titel: OORSPRONKELIJKE_TITEL,
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'laat Alice haar eigen stap wél bijwerken en verwijderen',
    async () => {
      // ⚠️ **De must-see achteraf.** Zonder deze helft is elke nul hierboven
      //    ook te halen met een policy die iederéén weigert, of met een
      //    opstelling waarin die stap helemaal niet bestaat.
      const eigen = await zetStap('Nog een stap van Alice');

      const bij = await alice.db
        .from('weekly_plan_steps')
        .update({ title: 'Alice past hem aan' })
        .eq('id', eigen);
      expect(bij.error, 'de eigenaar mag zijn eigen open stap bijwerken').toBeNull();
      expect((await stand(eigen)).titel).toBe('Alice past hem aan');

      const weg = await alice.db.from('weekly_plan_steps').delete().eq('id', eigen);
      expect(weg.error, 'de eigenaar mag zijn eigen open stap verwijderen').toBeNull();
      expect((await stand(eigen)).over, 'en dan is hij ook echt weg').toBe(0);
    },
    TEST_TIMEOUT,
  );
});
