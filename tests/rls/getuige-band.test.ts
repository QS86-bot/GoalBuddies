import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

/**
 * Het oppervlak van de getuige volgt de groepsband — QS8-306, migratie 0182.
 *
 * ⚠️ **De belofte is niet "`getuigenissen()` filtert op lidmaatschap".** Dat is
 *    een eigenschap van een ónderdeel. De belofte is: *wie de groep verlaat,
 *    leest de straf van zijn oud-groepsgenoot niet meer* — en die belofte hangt
 *    aan twee sloten die los van elkaar kunnen breken:
 *
 *      1. `getuigenissen()` (0169), het scherm;
 *      2. de derde tak van `commitments_select` (0168), de rij eronder.
 *
 *    📏 Gemeten op de draaiende database vóór 0182, met Bob als getuige die de
 *    groep verlaat:
 *
 *    ```
 *    B0 lidmaatschap van bob         = inactive
 *    B3 melding voor bob             = 0     <- QS8-298 doet zijn werk
 *    B1 bob ziet in getuigenissen()  = 1     <- het scherm niet
 *    B2 bob leest de rij             = 1     <- de policy ook niet
 *    ```
 *
 *    Vandaar dat elke gedragstest hieronder **allebei** de kanten leest. Een
 *    test op alleen `getuigenissen()` blijft groen bij een reparatie die het
 *    blok leegmaakt en het leesrecht laat staan — precies de vorm waar CLAUDE.md
 *    voor waarschuwt: de schermen hielden de regel aan terwijl de database hem
 *    lekte.
 *
 * ⚠️ **De must-allow staat vóór de must-deny, en dat is geen volgorde maar een
 *    grendel.** De eerste versie van 0182 rekende de band ín de policy uit, met
 *    een join op `goals`. Die subquery draait ónder RLS en de getuige mag het
 *    doel van de eigenaar niet lezen, dus 📏 `bob leest de rij = 0` terwijl hij
 *    gewoon lid was. Een suite die alleen het vertrek toetst, was daar groen op
 *    gebleven — hij mat dan een gat in plaats van een grens.
 *
 * ⚠️ **En de terugkeer hoort erbij**, want die draagt het verschil tussen wat
 *    dit besluit wél en niet doet: het oppervlak wordt opgeschort, de aanwijzing
 *    niet vernietigd. `bewaak_begunstigde()` (0168) laat de kolom niet leeghalen
 *    en zichzelf aanwijzen mag niet, dus zonder deze eigenschap zou een vertrek
 *    een straf voorgoed getuigeloos maken. Een straf een níeuwe getuige geven is
 *    een eigen vraag; die staat als QS8-312.
 *
 * IJKING — met de hand gedraaid op 07-09-2026, mutatie per grendel:
 *
 *   A  `and deelt_groep_met_eigenaar(c.goal_id)` uit `getuigenissen()`
 *      → 1 rood: 'toont een vertrokken getuige zijn getuigenis niet meer'
 *   B  `and deelt_groep_met_eigenaar(goal_id)` uit `commitments_select`
 *      → 1 rood: 'laat een vertrokken getuige de rij ook niet meer lezen'
 *   C  de helper zijn `select owner_id from goals` vervangen door de
 *      policy-eigen join (de eerste versie van 0182)
 *      → 1 rood op de must-allow: een lid dat er gewoon is, ziet zijn rij niet
 *   D  `deelt_groep_met_eigenaar()` naar de verkeerde buurman laten delegeren
 *      (`shares_group_with_goal(g)` in plaats van `shares_group_with_user()`)
 *      → 3 rood, waaronder de must-allow
 *
 * ⚠️ **D is er na de security-review van 07-09-2026**, die vroeg of een functie
 *    die alleen maar dóórgeeft wel ergens bewaakt wordt — hij valt buiten de
 *    afleiding van `hulpfunctiemodel.test.ts`, want die zoekt op het woord
 *    `group_members` en deze zegt het nooit. 📏 Nagemeten: de twee mutaties die
 *    er echt toe doen worden allebei gevangen, alleen door verschillende
 *    suites. De join alsnog inlijnen maakt `hulpfunctiemodel.test.ts` rood (hij
 *    staat niet in het register); naar de verkeerde buurman delegeren maakt dit
 *    bestand rood. Het register bewaakt wat een functie bedenkt, de gedragstest
 *    aan wie hij het vraagt. Uitgeschreven in
 *    `docs/decisions/2026-09-07-de-band-droeg-de-aanwijzing.md`.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  /** Eigenaar van het doel en instelster van de straf. */
  alice: TestUser;
  /** Groepsgenoot van alice, en de aangewezen getuige. */
  bob: TestUser;
  groupId: string;
  goalId: string;
  strafId: string;
}

let w: Wereld;

function uit(data: unknown): { ok?: boolean } {
  return (data ?? {}) as { ok?: boolean };
}

/**
 * Zet Bobs lidmaatschap, en meet daarna wat hij van de straf ziet.
 *
 * ⚠️ **Via `adminDb()` en niet als Bob.** Hij zou zichzelf met `leave_group()`
 *    ook op `inactive` kunnen zetten, maar dan meet de test die functie mee — en
 *    een uitzetting door een beheerder komt langs een ándere weg op dezelfde
 *    status uit. De belofte gaat over de status, niet over de weg ernaartoe.
 */
async function zetLidmaatschap(status: 'active' | 'inactive'): Promise<void> {
  const { error } = await adminDb()
    .from('group_members')
    .update({ status })
    .eq('group_id', w.groupId)
    .eq('user_id', w.bob.id);
  if (error) throw new Error(`lidmaatschap op ${status}: ${error.message}`);
}

/** Wat Bob langs beide wegen van de straf ziet. */
async function watBobZiet(): Promise<{ scherm: number; rij: number }> {
  const scherm = await w.bob.db.rpc('getuigenissen');
  if (scherm.error) throw new Error(`getuigenissen: ${scherm.error.message}`);

  const rij = await w.bob.db.from('commitments').select('id').eq('id', w.strafId);
  if (rij.error) throw new Error(`commitments: ${rij.error.message}`);

  return { scherm: (scherm.data ?? []).length, rij: (rij.data ?? []).length };
}

describe.skipIf(!rlsTestsConfigured)('het oppervlak van de getuige volgt de groepsband', () => {
  beforeAll(async () => {
    const alice = await createTestUser('band-alice');
    const bob = await createTestUser('band-bob');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const groep = await alice.db.rpc('create_group', { group_name: 'Bandgroep' });
    const gd = groep.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

    const mee = await bob.db.rpc('join_group_with_code', { code: gd.group.invite_code });
    if (uit(mee.data).ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'BANDDOEL', target_date: addDays(vandaag, 60) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    // ⚠️ Via `adminDb()` en meteen op `due`: `status` is voor de client niet te
    //    kiezen (0006) — een straf gaat alleen in werking door een verstreken
    //    deadline. Deze suite gaat over wie hem dán ziet, niet over de weg
    //    ernaartoe; die staat in `straf-met-een-persoon.test.ts`.
    const straf = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doel.data.id,
        type: 'penalty',
        body: 'Ik trakteer de hele groep op taart',
        beneficiary_user_id: bob.id,
        status: 'due',
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (straf.error || straf.data === null) throw new Error(`straf: ${straf.error?.message}`);

    w = { alice, bob, groupId: gd.group.id, goalId: doel.data.id, strafId: straf.data.id };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'toont een getuige die gewoon lid is zijn getuigenis, langs beide wegen',
    async () => {
      // ⚠️ **De must-allow, en hij staat hier vooraan omdat hij al eens gebroken
      //    is.** Zie ijking C in de kop: een policy die de band zelf uitrekent,
      //    leest `goals` onder RLS en sluit dan de getuige buiten die er wél
      //    hoort te zijn.
      await zetLidmaatschap('active');

      expect(await watBobZiet()).toEqual({ scherm: 1, rij: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'toont een vertrokken getuige zijn getuigenis niet meer',
    async () => {
      await zetLidmaatschap('inactive');

      const gezien = await watBobZiet();
      expect(gezien.scherm, 'het scherm van de getuige volgt de band').toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat een vertrokken getuige de rij ook niet meer lezen',
    async () => {
      // ⚠️ **Het tweede slot, en het slot dat ertoe doet.** Dit gaat langs
      //    `getuigenissen()` heen: PostgREST kent `commitments` en de derde tak
      //    van `commitments_select` besliste tot 0182 zonder naar lidmaatschap te
      //    kijken. Een reparatie in alleen de functie maakt het blok leeg en laat
      //    het leesrecht staan.
      await zetLidmaatschap('inactive');

      const gezien = await watBobZiet();
      expect(gezien.rij, 'de database dwingt de regel pas af als de policy hem draagt').toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'geeft de getuigenis terug zodra hij weer lid is — opgeschort, niet vernietigd',
    async () => {
      // ⚠️ Deze test draagt wat dit besluit níet doet. De aanwijzing blijft
      //    staan: `bewaak_begunstigde()` (0168) weigert `beneficiary_user_id =
      //    null` met *"De begunstigde van een commitment is niet weg te halen
      //    zolang hij bestaat"*, en zichzelf aanwijzen met *"Je kunt niet je
      //    eigen getuige zijn"*. Zou 0182 de kolom leeghalen in plaats van het
      //    oppervlak af te knijpen, dan was deze test rood — en dan was het een
      //    veel zwaarder besluit geweest dan het is.
      await zetLidmaatschap('inactive');

      const aanwijzing = await adminDb()
        .from('commitments')
        .select('beneficiary_user_id')
        .eq('id', w.strafId)
        .single();
      expect(aanwijzing.data?.beneficiary_user_id, 'de aanwijzing hoort er nog te staan').toBe(
        w.bob.id,
      );

      await zetLidmaatschap('active');
      expect(await watBobZiet()).toEqual({ scherm: 1, rij: 1 });
    },
    TEST_TIMEOUT,
  );

  it(
    'zegt langs de meldingenkant hetzelfde als langs de leeskant',
    async () => {
      // ⚠️ **De naad, en de reden dat deze test bestaat.** Dezelfde invariant
      //    staat op twee plekken in het schema: `getuigenissen_voor()` (0178,
      //    QS8-298) spelt hem zelf uit, want die krijgt de persoon als argument
      //    en kan de helper met `auth.uid()` niet gebruiken. Twee spellingen van
      //    één regel lopen uit elkaar zodra iemand er één aanraakt, en dan is er
      //    geen test die dát ziet: beide kanten hebben hun eigen groene suite.
      //
      // ⚠️ Wat hier geen gelijkheid van rijen kan zijn: de meldingenkant draagt
      //    een anti-join en een dagplafond die de leeskant niet heeft. Getoetst
      //    wordt dus of ze het over hetzelfde *lidmaatschap* eens zijn — in een
      //    wereld waar over deze straf nog geen melding uitging.
      for (const status of ['active', 'inactive'] as const) {
        await zetLidmaatschap(status);

        const melding = await adminDb().rpc('getuigenissen_voor', { p_user_id: w.bob.id });
        if (melding.error) throw new Error(`getuigenissen_voor: ${melding.error.message}`);

        const gezien = await watBobZiet();
        const verwacht = status === 'active' ? 1 : 0;

        expect(
          { melding: (melding.data ?? []).length, ...gezien },
          `de twee spellingen van de band lopen uiteen bij status=${status}`,
        ).toEqual({ melding: verwacht, scherm: verwacht, rij: verwacht });
      }

      await zetLidmaatschap('active');
    },
    TEST_TIMEOUT,
  );
});
