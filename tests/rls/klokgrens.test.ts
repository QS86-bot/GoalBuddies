/**
 * De klokgrens — wat er in de nacht met een periodestart gebeurt.
 *
 * ⚠️ **De belofte is niet "de grens staat op `current_date + 1`" maar "een
 *    periodestart die in de tijdzone van de groep vandaag is, wordt
 *    geaccepteerd".** `current_date` is de serverdatum in UTC; `groupPeriod()`
 *    rekent in de tijdzone van de groep. In Europe/Amsterdam is een geldige
 *    periodestart tussen 00:00 en 02:00 lokale tijd één dag "in de toekomst",
 *    in Pacific/Auckland twaalf uur lang. Vóór 0037 weigerde de ketting die
 *    aanroepen — het middernachtprobleem uit domeinregel 2, in een grenscontrole
 *    in plaats van in een berekening, en dus precies waar niemand het zoekt.
 *
 * ⚠️ **0037 repareerde het en niets bewaakte het.** Deze suite is die bewaking:
 *    morgen mag, overmorgen niet. Wie de `+ 1` ooit weghaalt omdat hij er
 *    overbodig uitziet, krijgt hier drie rode tests in plaats van een klacht van
 *    een gebruiker in Auckland.
 *
 * ⚠️ De statische helft staat in `scripts/klokgrens-controle.mjs`: elk voorkomen
 *    van `current_date` in het schema met de reden waarom het daar mag staan.
 *    Deze suite toetst de drie grenzen die je van buitenaf kunt bereiken; het
 *    register vangt de dertiende die er ooit bij komt.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const UTC = 'UTC' as TimeZone;

/**
 * De serverdatum, aan deze kant van de lijn — `current_date` is niets anders.
 *
 * ⚠️ Bewust in elke test opnieuw en niet één keer in `beforeAll`. Deze suite is
 *    de enige die op één dag scherp staat, en dus de enige die om middernacht
 *    UTC naast kan zitten. Door hem vlak voor de aanroep te lezen is het
 *    tijdvenster waarin dat kan een fractie van een seconde in plaats van de
 *    looptijd van de hele suite.
 */
function serverdatum(): IsoDate {
  return localDateIn(UTC, now());
}

interface Fixture {
  alice: TestUser;
  /** Lid zonder weekafsluiting — zijn schakels worden hier met de hand gezet. */
  bob: TestUser;
  groupId: string;
}

function uitkomst(data: unknown): { ok?: boolean; reason?: string } {
  return (data ?? {}) as { ok?: boolean; reason?: string };
}

describe.skipIf(!rlsTestsConfigured)('De klokgrens rond middernacht UTC', () => {
  let f: Fixture;

  beforeAll(async () => {
    const alice = await createTestUser('klokgrens-alice');
    const bob = await createTestUser('klokgrens-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Klokgrens-test' });
    if (groep.error) throw new Error(`groep aanmaken (HTTP): ${groep.error.message}`);
    const groepData = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (meedoen.error) throw new Error(`bob werd geen lid (HTTP): ${meedoen.error.message}`);
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    f = { alice, bob, groupId: groepData.group.id };

    // ⚠️ **De huddledag op de weekdag van mórgen**, zodat "morgen" hier een
    //    échte periodestart is. Vóór 0108 deed die dag er niet toe en kon elke
    //    dag in het venster een weekafsluiting dragen; sindsdien is een periode
    //    iets met een vorm, en dan moet een suite over de vensterrand die vorm
    //    aanhouden om nog over de ránd te gaan.
    const morgenDow = new Date(`${addDays(serverdatum(), 1)}T00:00:00Z`).getUTCDay();
    const huddle = await adminDb()
      .from('groups')
      .update({ huddle_day: morgenDow })
      .eq('id', f.groupId);
    if (huddle.error) throw new Error(`huddledag zetten: ${huddle.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // ⚠️ Hier stond tot 31-08 een blok `ketting_schakel()` met dezelfde twee
  //    grenstests (morgen mag, overmorgen niet). Die functie is in migratie 0133
  //    verwijderd omdat hij nul aanroepers had (QS8-144). De grens zelf is niet
  //    verdwenen: het blok hieronder toetst hem op `bewaak_week_review_periode()`,
  //    de trigger die op de overgebleven route dezelfde +1/−35 bewaakt — en die
  //    bovendien eist dat de datum een échte periodestart is.

  /**
   * `bewaak_week_review_periode()` — dezelfde grens, maar als trigger, en die
   * wéigert de rij in plaats van een reden terug te geven.
   */
  /**
   * ⚠️ **De huddledag van deze groep staat op de weekdag van mórgen**, gezet in
   *    `beforeAll`. Daardoor is "morgen" hier een échte periodestart en niet
   *    zomaar een dag in het venster — precies het geval dat 0037 wilde
   *    toelaten: een periode die in de zone van de groep vandaag begint, maar in
   *    UTC morgen is.
   *
   * ⚠️ **Elke test hieronder toetst een ándere SQLSTATE, en dat is de hele
   *    reden dat 0108 een eigen code kreeg.** Zouden de venstergrens en de
   *    huddledagtoets allebei `22007` geven, dan wordt de weigertest groen zodra
   *    een datum om wélke van de twee redenen dan ook wordt tegengehouden — en
   *    bewaakt hij niet meer welke grens hem tegenhield.
   */
  describe('de weekafsluiting', () => {
    it(
      'accepteert een periodestart die in UTC pas morgen begint',
      async () => {
        const morgen = addDays(serverdatum(), 1);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: morgen,
          did_text: 'afgesloten op een dag die in UTC nog moet beginnen',
        });

        expect(error).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een periodestart die te ver vooruit ligt',
      async () => {
        // ⚠️ Een week verder, dus nog steeds de huddledag van deze groep. Alleen
        //    zó toetst dit de vénstergrens en niet per ongeluk de dagtoets.
        const volgendePeriode = addDays(serverdatum(), 8);

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: volgendePeriode,
          did_text: 'te ver vooruit',
        });

        // 22007 — `invalid_datetime_format`, de code die 0037 meegeeft.
        expect(error?.code).toBe('22007');
      },
      TEST_TIMEOUT,
    );

    it(
      'weigert een dag binnen het venster die geen periodestart van deze groep is',
      async () => {
        // ⚠️ **Dit is de belofte van 0108.** Vóór die migratie stond hier elke
        //    dag in het venster open, en `ketting_uit_weekafsluiting` maakte er
        //    een schakel van: één lid schreef in één statement 30 rijen en de
        //    groep kreeg twee mijlpaalaankondigingen. Vandaag is de huddledag de
        //    weekdag van morgen, dus vandáág is er geen.
        const vandaag = serverdatum();

        const { error } = await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: vandaag,
          did_text: 'een dag die geen periode begint',
        });

        // 22023 — `invalid_parameter_value`, en met opzet níet 22007.
        expect(error?.code).toBe('22023');
      },
      TEST_TIMEOUT,
    );

    it(
      'maakt geen kettingschakel van een geweigerde weekafsluiting',
      async () => {
        // ⚠️ De belofte is niet "de rij wordt geweigerd" maar "er komt geen
        //    schakel bij". De weigerende trigger staat BEFORE en de
        //    kettingschrijver AFTER; deze test bewijst dat die volgorde het
        //    gevolg heeft dat de kop van 0108 belooft, in plaats van dat aan te
        //    nemen.
        const admin = adminDb();
        const voor = await admin
          .from('chain_links')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', f.groupId);

        // ⚠️ **Gisteren, en niet overmorgen.** Overmorgen valt al buiten het
        //    venster van 0037, dus die rij wordt óók zonder 0108 geweigerd en
        //    deze test zou groen blijven terwijl de belofte weg is. Gisteren
        //    ligt binnen het venster en is geen huddledag: alleen 0108 houdt
        //    hem tegen.
        await f.alice.db.from('week_reviews').insert({
          group_id: f.groupId,
          user_id: f.alice.id,
          group_period_start: addDays(serverdatum(), -1),
          did_text: 'geen periodestart',
        });

        const na = await admin
          .from('chain_links')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', f.groupId);

        expect(na.count).toBe(voor.count);
      },
      TEST_TIMEOUT,
    );
  });

  /**
   * `group_overview()` — dezelfde grens, en hier bepaalt hij wat de groep ziet.
   *
   * ⚠️ Bob krijgt twee schakels met de hand, één op morgen en één op overmorgen.
   *    Dat is wat deze test onderscheidend maakt: de schakel bestáát in beide
   *    gevallen, dus `closed_this_period` kan alleen op de vensterregel afketsen.
   *    Zonder die tweede schakel zou de test net zo groen zijn met een grens op
   *    `current_date`, en dan bewaakte hij niets.
   */
  describe('het groepsoverzicht', () => {
    beforeAll(async () => {
      const vandaag = serverdatum();
      const { error } = await adminDb()
        .from('chain_links')
        .insert([
          { group_id: f.groupId, user_id: f.bob.id, group_period_start: addDays(vandaag, 1) },
          { group_id: f.groupId, user_id: f.bob.id, group_period_start: addDays(vandaag, 2) },
        ]);
      if (error) throw new Error(`schakels zetten: ${error.message}`);
    }, SETUP_TIMEOUT);

    /**
     * ⚠️ `null` zit sinds 0104 in het antwoord en betekent "geen antwoord over
     *    deze periode". `undefined` betekent iets anders: bob staat niet in de
     *    uitslag. Die twee worden hier niet samengevoegd — dan zou een test die
     *    op `null` toetst ook groen worden als de rij helemaal verdwijnt.
     */
    async function geslotenVoor(periode: IsoDate): Promise<boolean | null | undefined> {
      const { data, error } = await f.alice.db.rpc('group_overview', {
        p_group_id: f.groupId,
        p_period_start: periode,
      });
      if (error) throw new Error(`group_overview: ${error.message}`);

      const rijen = (data ?? []) as { user_id: string; closed_this_period: boolean | null }[];
      return rijen.find((r) => r.user_id === f.bob.id)?.closed_this_period;
    }

    it(
      'toont de schakel van morgen als afgesloten',
      async () => {
        expect(await geslotenVoor(addDays(serverdatum(), 1))).toBe(true);
      },
      TEST_TIMEOUT,
    );

    it(
      'toont die van overmorgen niet, ook al staat hij in de tabel',
      async () => {
        const uitkomst = await geslotenVoor(addDays(serverdatum(), 2));

        // ⚠️ De belofte is "onthult geen aanwezigheid", en die staat voorop:
        //    wat er ook uitkomt, `true` mag het niet zijn.
        expect(uitkomst).not.toBe(true);

        // ⚠️ En sinds 0104 is het `null` en niet `false`. Dat verschil is het
        //    hele punt van die migratie: `false` zou hier "bob heeft die periode
        //    niets afgerond" betekenen, terwijl de database weigert antwoord te
        //    geven over een periode buiten het venster. Stond hier `toBe(false)`,
        //    dan legde deze test die verwarring vast als correct gedrag — en een
        //    test die een gat bekrachtigt is erger dan geen test.
        expect(uitkomst).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });
});

/**
 * `ketting_stand()` — de énige péiling tussen twaalf voorkomens van `current_date`.
 *
 * ⚠️ **De belofte is "de adempauze wordt afgelezen op de kalender van het lid
 *    zelf", en niet "de peiling staat een dag ruimer".** Dat verschil is de hele
 *    reden dat deze twee tests er twee zijn: een `± 1`-verruiming, die de
 *    bevinding van 25-08 als goedkope reparatie overwoog, komt door de eerste
 *    test heen en zakt op de tweede. Ruimer is niet hetzelfde als juist.
 *
 * ⚠️ **De richting van de oude fout is waarom dit ertoe doet.** `starts_cycle` en
 *    `ends_cycle` staan al in de persoonlijke cyclus van dát lid; alleen het punt
 *    waarmee ze vergeleken werden stond op de serverklok. Een lid dat op zijn
 *    eigen kalender in zijn adempauze zat, bleef in de noemer staan — en dan
 *    krijgt de groep zijn voltallige week niet te zien. Gemeten in de lokale
 *    stack op 28-08-2026: `{schakels: 1, in_aanmerking: 2, voltallig: false}`
 *    waar het `{schakels: 1, in_aanmerking: 1, voltallig: true}` moest zijn. De
 *    Ketting draagt alleen positieve signalen (domeinregel 7), dus dit is een
 *    aanmoediging die niemand mist omdat hij er nooit stond.
 *
 * ⚠️ **De zone wordt per run gekozen en niet vastgezet.** Pacific/Kiritimati
 *    (UTC+14) en Pacific/Niue (UTC−11) spannen samen 25 uur, dus op élk moment
 *    wijkt er minstens één van de serverdatum af. Een vaste zone zou deze suite
 *    het grootste deel van de dag groen maken zonder iets te toetsen — precies
 *    het groen waar dit project voor waarschuwt.
 */
describe.skipIf(!rlsTestsConfigured)('ketting_stand peilt de adempauze per lid', () => {
  let f: Fixture;
  let zone: TimeZone;
  let doelId: string;

  /** Een zone waarvan de datum nú van de serverdatum verschilt. */
  function afwijkendeZone(): TimeZone {
    const vandaagUtc = serverdatum();
    for (const kandidaat of ['Pacific/Kiritimati', 'Pacific/Niue'] as const) {
      if (localDateIn(kandidaat as TimeZone, now()) !== vandaagUtc) return kandidaat as TimeZone;
    }
    throw new Error('UTC+14 en UTC−11 spannen 25 uur; dit kan niet voorkomen.');
  }

  /** De stand zoals een lid hem ziet. */
  async function stand(): Promise<{ in_aanmerking?: number }> {
    const { data, error } = await f.alice.db.rpc('ketting_stand', {
      p_group_id: f.groupId,
      p_period_start: serverdatum(),
    });
    if (error) throw new Error(`ketting_stand: ${error.message}`);
    return (data ?? {}) as { in_aanmerking?: number };
  }

  /** Legt één adempauze op `dag` en ruimt hem na afloop weer op. */
  async function metAdempauzeOp(dag: string, doen: () => Promise<void>): Promise<void> {
    const admin = adminDb();
    const pauze = await admin
      .from('breathers')
      .insert({ user_id: f.bob.id, goal_id: doelId, starts_cycle: dag, ends_cycle: dag })
      .select('id')
      .single();
    if (pauze.error || pauze.data === null) throw new Error(`adempauze: ${pauze.error?.message}`);

    try {
      await doen();
    } finally {
      await admin.from('breathers').delete().eq('id', pauze.data.id);
    }
  }

  beforeAll(async () => {
    const alice = await createTestUser('peiling-alice');
    const bob = await createTestUser('peiling-bob');

    const groep = await alice.db.rpc('create_group', { group_name: 'Peiling-test' });
    const groepData = groep.data as unknown as {
      ok?: boolean;
      group?: { id: string; invite_code: string };
    };
    if (groepData.ok !== true || !groepData.group) {
      throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
    }

    const meedoen = await bob.db.rpc('join_group_with_code', { code: groepData.group.invite_code });
    if (uitkomst(meedoen.data).ok !== true) {
      throw new Error(`bob werd geen lid: ${uitkomst(meedoen.data).reason ?? 'geen reden'}`);
    }

    f = { alice, bob, groupId: groepData.group.id };
    zone = afwijkendeZone();

    // ⚠️ Alleen `tz` wijkt af. Zou `week_start_day` meeveranderen, dan toetst
    //    deze suite twee dingen tegelijk en zegt een rode test niet meer welke.
    const profiel = await adminDb().from('profiles').update({ tz: zone }).eq('id', bob.id);
    if (profiel.error) throw new Error(`tz zetten: ${profiel.error.message}`);

    const doel = await bob.db
      .from('goals')
      .insert({ owner_id: bob.id, title: 'PEILDOEL', target_date: addDays(serverdatum(), 90) })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);
    doelId = doel.data.id;

    const koppeling = await bob.db
      .from('goal_group_links')
      .insert({ goal_id: doelId, group_id: f.groupId });
    if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'haalt een lid uit de noemer op de dag die hij zélf vandaag noemt',
    async () => {
      const voor = (await stand()).in_aanmerking ?? 0;

      await metAdempauzeOp(localDateIn(zone, now()), async () => {
        expect((await stand()).in_aanmerking).toBe(voor - 1);
      });
    },
    TEST_TIMEOUT,
  );

  it(
    'laat hem staan op de dag die alleen de sérver vandaag noemt',
    async () => {
      // ⚠️ **Dit is de test die de belofte draagt.** De vorige zou ook groen
      //    zijn met een peiling die simpelweg een dag ruimer is; deze zakt daar
      //    op, want dan valt de serverdatum er alsnog binnen. Juist en ruim zijn
      //    niet hetzelfde, en dat onderscheid was de reden dat de bevinding de
      //    goedkope reparatie afwees.
      const voor = (await stand()).in_aanmerking ?? 0;

      await metAdempauzeOp(serverdatum(), async () => {
        expect((await stand()).in_aanmerking).toBe(voor);
      });
    },
    TEST_TIMEOUT,
  );
});
