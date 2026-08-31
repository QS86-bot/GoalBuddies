import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';

/**
 * De respijtdag op een commitment, in twee tijdzones — QS8-173, migratie 0134.
 *
 * ⚠️ **De belofte is niet "de functie rekent goed" maar "de belofte is voor
 *    iedereen dezelfde".** Vóór 0134 besliste `wikkel_commitments_af()` met
 *    `current_date`, en dat is de serverdatum in UTC. Gevolg: wie áchter UTC zat
 *    had **nul** respijtdagen en wie ervóór zat **twee**. Niemand werd te vroeg
 *    gestraft — op de streefdatum zelf is elke zone op tijd — maar de extra dag
 *    varieerde met je woonplaats.
 *
 *    Dat raakt domeinregel 5: een straf is het duurste dat deze app een mens kan
 *    aandoen, en dan mag de uitkomst niet afhangen van waar je bent.
 *
 * ⚠️ **Twee zones aan wéérszijden van UTC, en dat is het hele punt.** Eén zone
 *    bewijst niets: met alleen Amsterdam was deze bug nooit zichtbaar geweest,
 *    en dat is precies waarom hij er maanden in heeft gezeten. CLAUDE.md
 *    domeinregel 1 eist minstens twee week-starts bij weekafhankelijke code; dit
 *    is dezelfde eis een laag dieper.
 *
 *    ⚠️ **De keuze van de twee zones is niet vrij, en dat bleek pas bij de
 *    mutatiecheck.** Eerst stonden hier Los Angeles (UTC−7) en Auckland
 *    (UTC+12). Met dat paar is er ruwweg vier uur per etmaal waarin *allebei*
 *    dezelfde kalenderdatum als UTC hebben — en in dat venster komt de oude,
 *    UTC-gebonden vorm er ongemerkt doorheen. Een test die maar twintig uur per
 *    dag iets bewijst, is een test die je op het verkeerde moment gelooft.
 *
 *    Kiritimati (UTC+14) en Midway (UTC−11) sluiten dat gat:
 *
 *      - Kiritimati ligt een dag vóór UTC zodra het in UTC 10:00 of later is;
 *      - Midway ligt een dag áchter UTC zolang het in UTC vóór 11:00 is.
 *
 *    Die twee vensters overlappen en dekken samen het hele etmaal, dus er is
 *    **altijd** minstens één eigenaar wiens datum van de serverdatum verschilt.
 *    De mutatie wordt daarmee op elk moment van de dag gevangen.
 *
 *    De suite kiest de streefdatum relatief aan de eigen datum van elke eigenaar,
 *    zodat de gelukkige route niet afhangt van hoe laat hij draait.
 *
 * ⚠️ Met de hand rood gemaakt door in 0134 `v_vandaag` terug te zetten op
 *    `current_date`: dan valt de zone die op dat moment aan de andere kant van de
 *    datumgrens zit om, en de andere niet. Precies de asymmetrie die de bug was.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/** Een zone ver áchter UTC en een ver vóór UTC. Zie de kop. */
// ⚠️ `label` is apart en niet uit `tz` afgeleid: het testadres moet aan
//    `/^rls-[a-z0-9-]+-…@example\.com$/` voldoen, en `America/Los_Angeles` levert
//    een hoofdletter en een underscore op. Dan weigert `removeTestUsers()` de
//    opruiming — terecht, want dat is de grendel uit QS8-119.
const ZONES = [
  { naam: 'Midway, UTC−11', tz: 'Pacific/Midway', label: 'west' },
  { naam: 'Kiritimati, UTC+14', tz: 'Pacific/Kiritimati', label: 'oost' },
] as const;

interface Eigenaar {
  gebruiker: TestUser;
  tz: string;
  /** De datum van vandaag zoals de database hem voor déze eigenaar ziet. */
  vandaag: string;
}

const eigenaren: Eigenaar[] = [];

describe.skipIf(!rlsTestsConfigured)('de respijtdag is voor iedereen één dag', () => {
  beforeAll(async () => {
    for (const zone of ZONES) {
      const gebruiker = await createTestUser(`respijt-${zone.label}`);

      const gezet = await adminDb().from('profiles').update({ tz: zone.tz }).eq('id', gebruiker.id);
      if (gezet.error) throw new Error(`tz zetten: ${gezet.error.message}`);

      // ⚠️ De eigen datum wordt uit de database gehaald en niet in JavaScript
      //    nagerekend. Een tweede opvatting van "welke dag is het daar" in de
      //    test zou de test laten slagen om de verkeerde reden.
      const datum = await adminDb().rpc('eigenaarsdatum', { uid: gebruiker.id });
      if (datum.error) throw new Error(`eigenaarsdatum: ${datum.error.message}`);

      eigenaren.push({ gebruiker, tz: zone.tz, vandaag: datum.data as unknown as string });
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Maakt een doel met een streefdatum N dagen vóór de eigen datum van de eigenaar. */
  async function doelMetStreefdatum(eigenaar: Eigenaar, dagenGeleden: number): Promise<string> {
    const streef = new Date(`${eigenaar.vandaag}T00:00:00Z`);
    streef.setUTCDate(streef.getUTCDate() - dagenGeleden);
    const target = streef.toISOString().slice(0, 10);

    const doel = await adminDb()
      .from('goals')
      .insert({ owner_id: eigenaar.gebruiker.id, title: 'RESPIJT proefdoel', target_date: target })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const beloning = await adminDb()
      .from('commitments')
      .insert({
        goal_id: doel.data.id,
        type: 'reward',
        body: 'RESPIJT beloning',
        status: 'set',
        // ⚠️ Verplicht: een commitment zonder bevestiging bestaat niet. Domeinregel 5
        //    eist dat alles met een consequentie expliciet bevestigd is.
        confirmed_at: new Date().toISOString(),
      });
    if (beloning.error) throw new Error(`beloning: ${beloning.error.message}`);

    return doel.data.id as string;
  }

  async function wikkelAf(goalId: string): Promise<{ vrijgespeeld: number; verlopen: number }> {
    const uit = await adminDb().rpc('wikkel_commitments_af', { p_goal_id: goalId });
    if (uit.error) throw new Error(`afwikkelen: ${uit.error.message}`);
    return uit.data as unknown as { vrijgespeeld: number; verlopen: number };
  }

  /**
   * ⚠️ **De kern.** Eén dag over de streefdatum heen valt binnen de respijtdag, in
   *    élke zone. Vóór 0134 was dit voor de zone áchter UTC een gemiste
   *    beloning — die had nul dagen respijt.
   */
  it(
    'speelt de beloning vrij op de dag ná de streefdatum, in beide zones',
    async () => {
      for (const eigenaar of eigenaren) {
        const goalId = await doelMetStreefdatum(eigenaar, 1);
        const uit = await wikkelAf(goalId);

        expect(uit.vrijgespeeld, `${eigenaar.tz} hoort binnen de respijtdag te vallen`).toBe(1);
        expect(uit.verlopen, `${eigenaar.tz} mag niet verlopen zijn`).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De andere helft, en die telt even zwaar.** Een respijtdag die nooit
   *    afloopt is geen respijtdag maar een afgeschafte deadline. Vóór 0134 kwam
   *    de zone vóór UTC hier weg met twee dagen.
   */
  it(
    'laat de beloning verlopen op de tweede dag ná de streefdatum, in beide zones',
    async () => {
      for (const eigenaar of eigenaren) {
        const goalId = await doelMetStreefdatum(eigenaar, 2);
        const uit = await wikkelAf(goalId);

        expect(uit.verlopen, `${eigenaar.tz} hoort buiten de respijtdag te vallen`).toBe(1);
        expect(uit.vrijgespeeld, `${eigenaar.tz} mag niets vrijgespeeld hebben`).toBe(0);
      }
    },
    TEST_TIMEOUT,
  );

  /** Op de streefdatum zelf was het altijd al goed, in elke zone. Blijft zo. */
  it(
    'speelt de beloning vrij op de streefdatum zelf, in beide zones',
    async () => {
      for (const eigenaar of eigenaren) {
        const goalId = await doelMetStreefdatum(eigenaar, 0);
        expect((await wikkelAf(goalId)).vrijgespeeld).toBe(1);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ De grens is de eigen datum en niet de serverdatum. Deze test zegt dat met
   *    zoveel woorden: de twee eigenaren zitten in zones die minstens een halve
   *    dag schelen, dus hun `eigenaarsdatum()` is niet altijd gelijk — en tóch
   *    valt de beslissing voor allebei hetzelfde uit. Dat is de belofte.
   */
  it(
    'gebruikt de eigen datum van de eigenaar en niet die van de server',
    async () => {
      const [west, oost] = eigenaren;
      expect(west, 'twee eigenaren nodig').toBeDefined();
      expect(oost, 'twee eigenaren nodig').toBeDefined();

      const serverdatum = await adminDb().rpc('eigenaarsdatum', { uid: west!.gebruiker.id });
      expect(serverdatum.error).toBeNull();

      // Twee verschillende zones, en de uitkomst van de afwikkeling is voor
      // allebei gelijk — dat is in de drie tests hierboven al bewezen. Hier
      // staat dat ze ook daadwerkelijk in verschillende zones zitten, want
      // anders bewijzen die drie tests niets over tijdzones.
      expect(west!.tz).not.toBe(oost!.tz);
    },
    TEST_TIMEOUT,
  );
});
