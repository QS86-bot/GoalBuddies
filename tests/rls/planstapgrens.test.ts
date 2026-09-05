import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  adminDb,
  createTestUser,
  magNietLanden,
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
 * **Die redenering klopt voor een schrijfopdracht die kolommen van de doeltabel
 * leest, en alleen daarvoor.** Postgres past het SELECT-beleid op een UPDATE of
 * DELETE pas toe zodra dat gebeurt.
 *
 * ⚠️ **En "leest kolommen" is niet hetzelfde als "heeft een `where`".** Dat
 *    stond hier eerst wél zo, en het is te ruim. Gemeten met een verruimde
 *    `_delete.using`, als groepsgenoot:
 *
 * ```
 * delete ... (zonder where)                    -> landt   (leest niets)
 * delete ... where true                        -> landt   (leest niets)
 * delete ... where exists (select 1 from groups) -> landt (geen kolom van de doeltabel)
 * delete ... where order_index > 0             -> nul rijen (leest een kolom)
 * delete ... returning id                      -> nul rijen (leest een kolom)
 * ```
 *
 *    De grens loopt dus bij *"raakt een kolom van de doeltabel"*, niet bij de
 *    aanwezigheid van een filter. Via PostgREST komt dat vandaag op hetzelfde
 *    neer — elk filter dat een client stuurt noemt een kolom — maar wie de zin
 *    "een gefilterd verzoek is door `_select` gedekt" als regel leest, leest te
 *    veel.
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
 * ⚠️ **De UPDATE-kant heeft er twee**, want de `check` draagt dezelfde eis over
 *    de níeuwe rij. Ze worden allebei apart getoetst, en dat is geen
 *    volledigheidsdrang: de eerste versie van dit bestand toetste alleen de
 *    `using`, en de security-review mat dat alléén de `check`-helft verruimen de
 *    hele suite groen liet — 962 tests, nul rood.
 *
 *    De `using`-test eist daarom niet alleen dat de titel gelijk blijft maar óók
 *    dat er géén fout kwam: bij een verruimde `using` verandert de uitkomst van
 *    "niets geraakt" naar "geweigerd door de `check`", en een test die alleen
 *    naar de titel kijkt, blijft dan groen.
 *
 * ⚠️⚠️ **Wat de `check`-helft tegenhoudt is geen formaliteit.** Hij verhindert
 *    dat iemand een stap uit zijn éigen weekplan bij jou in het weekplan schuift
 *    — `update weekly_plan_steps set goal_id = <jouw doel>` zonder filter.
 *    `weekplanstap_naar_weekdoel()` maakt daar bij de eerstvolgende activering
 *    een weekdoel van op jóuw doel, met zíjn tekst, mét puntenplafond, en met
 *    het minpunt voor jou als je die week mist. Dat is dezelfde uitkomst die op
 *    03-09 aan de INSERT-kant is dichtgezet; de UPDATE-verplaatsing stond nog
 *    open in de tests. 📏 Gemeten:
 *
 * ```
 * policy zoals hij is, ongefilterd  -> 42501, de stap hangt nog aan Bobs doel
 * alleen de `check` verruimd        -> gelukt, de stap hangt aan het doel van Alice
 * alleen de `check` verruimd, mét where -> 42501, want dan geldt `_select` als
 *                                       extra check op de níeuwe rij
 * ```
 *
 *    Die derde regel is de reden dat dit gat zo lang onzichtbaar bleef: **in een
 *    gefilterde opstelling is de `check`-helft niet te raken.** Het ongefilterde
 *    pad is de enige weg erheen.
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
let bobGoalId = '';

const OORSPRONKELIJKE_TITEL = 'De stap van Alice';

/** Zet één open weekplanstap onder een doel en geeft zijn id terug. */
async function zetStap(titel: string, doel = ''): Promise<string> {
  const stap = await adminDb()
    .from('weekly_plan_steps')
    .insert({ goal_id: doel === '' ? goalId : doel, order_index: 1, title: titel })
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

    // ⚠️ Bob heeft een éigen doel in dezelfde groep, en dat is geen decor: de
    //    `check`-test hieronder verplaatst zíjn stap naar het doel van Alice, en
    //    daarvoor moet hij een stap hebben die hij legitiem bezit.
    const doelBob = await adminDb()
      .from('goals')
      .insert({
        owner_id: bob.id,
        title: 'Planstapdoel van Bob',
        target_date: '2027-12-31',
        status: 'active',
      })
      .select('id')
      .single();
    if (doelBob.error || doelBob.data === null) throw new Error(`doel bob: ${doelBob.error?.message}`);
    bobGoalId = doelBob.data.id;

    // Beide doelen zijn gedeeld met de groep waar allebei in zitten. Zonder deze
    // regels is Bob de zwákke aanvaller: hij wordt dan al door
    // `shares_group_with_goal` zelf tegengehouden en de eigenaarsconjunct komt
    // er niet aan te pas.
    const deling = await adminDb()
      .from('goal_group_links')
      .insert([
        { goal_id: goalId, group_id: g.group.id },
        { goal_id: bobGoalId, group_id: g.group.id },
      ]);
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
    'laat Bob zijn eigen stap niet naar het doel van Alice verhuizen',
    async () => {
      // ⚠️ **Dit is de `check`-helft, en die had nul dekking.** De `using` kijkt
      //    naar de rij zoals hij ís — die is van Bob, dus die grendel laat hem
      //    door. De `check` kijkt naar de rij zoals hij wórdt, en dáár staat het
      //    doel van Alice in. Alleen die tweede houdt dit tegen.
      //
      // ⚠️ **Ongefilterd, en dat is hier geen stijlkeuze maar de enige weg.**
      //    Met een `where` erbij geldt `_select` als extra toets op de níeuwe
      //    rij en weigert díe hem al — gemeten: `42501`, ook met een verruimde
      //    `check`. In een gefilterde opstelling is deze grendel dus niet te
      //    raken, en precies daarom bleef het gat onzichtbaar.
      const stapVanBob = await zetStap('Stap van Bob', bobGoalId);

      await magNietLanden(
        () => bob.db.from('weekly_plan_steps').update({ goal_id: goalId }),
        () => adminDb().from('weekly_plan_steps').select('goal_id').eq('id', stapVanBob),
      );

      const na = await adminDb()
        .from('weekly_plan_steps')
        .select('goal_id')
        .eq('id', stapVanBob)
        .single();

      expect(
        na.data?.goal_id,
        'de stap van Bob hoort aan zijn eigen doel te blijven hangen — een stap die ' +
          'bij Alice in het weekplan schuift, wordt bij de eerstvolgende activering ' +
          'een weekdoel op háár doel, met zijn tekst en haar minpunt',
      ).toBe(bobGoalId);

      await adminDb().from('weekly_plan_steps').delete().eq('id', stapVanBob);
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

      // ⚠️ **En één keer ongefilterd, want dát is het meetinstrument van dit
      //    bestand.** Zonder deze regel bewijzen de tests hierboven alleen dat
      //    er níets gebeurt — en dat is ook precies wat je ziet als het verzoek
      //    de tabel helemaal niet meer bereikt. Gemeten door in beide
      //    aanvalsregels een filter te zetten dat nul rijen raakt: alle vier
      //    bleven groen. Dwingt PostgREST of `supabase-js` ooit een filter af op
      //    een schrijfopdracht, of zet iemand er bij een refactor een `.eq()`
      //    bij "omdat dat netter is", dan hoort dit bestand rood te worden en
      //    niet stil door te meten. Dezelfde vorm als QS8-270.
      const nogEen = await zetStap('Alice ruimt ongefilterd op');
      const opgeruimd = await alice.db.from('weekly_plan_steps').delete();

      expect(opgeruimd.error, 'een ongefilterde delete hoort gewoon door te gaan').toBeNull();
      expect(
        (await stand(nogEen)).over,
        'de ongefilterde opdracht bereikt de tabel écht — anders meet dit bestand niets',
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
