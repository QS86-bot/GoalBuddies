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
 * De Risico-radar rekent "vandaag" op de kalender van de eigenaar — QS8-172.
 *
 * `herbereken_risico()` droeg tot migratie 0155 drie losse `current_date`-en:
 * de weken tot de streefdatum, de start van het terugkijkvenster, en "cycli die
 * al begonnen zijn". Alle drie beantwoorden **"vandaag" voor één mens**, en dat
 * is per domeinregel 1 de klok van díe mens en niet die van de server. Een
 * gebruiker in Auckland zit twaalf uur naast UTC, een gebruiker in Los Angeles
 * zeven de andere kant op; op elke dagovergang rekende de radar met de
 * verkeerde dag.
 *
 * ⚠️ **Waarom dit met een afwijkende zone moet.** Zolang de klok van de eigenaar
 *    dezelfde dag aanwijst als die van de server, geeft `current_date` exact
 *    hetzelfde antwoord als `eigenaarsdatum()` en kan geen enkele assertie de
 *    twee onderscheiden. Een test in Europe/Amsterdam zou tweeëntwintig uur per
 *    dag groen zijn zonder iets te bewijzen — de fout die vanochtend in
 *    `klokgrens.test.ts` en `epic8.test.ts` zat (QS8-267). Pacific/Kiritimati
 *    (UTC+14) en Pacific/Niue (UTC−11) spannen samen 25 uur, dus op élk moment
 *    wijkt er minstens één van de serverdatum af.
 *
 * ⚠️ **De uitkomst hangt van de richting af en dat is met opzet zichtbaar.**
 *    Loopt de eigenaar vóór op de server, dan is zijn "vandaag" een dag later en
 *    heeft hij één week mínder over; loopt hij achter, dan een week méér. Beide
 *    kanten worden hieronder uitgerekend uit de gemeten afwijking, niet
 *    aangenomen.
 *
 * ## Waarom de asserties naar `reason` kijken en niet naar de stand
 *
 * `herbereken_risico()` schrijft zijn ruwe getallen mee in `goal_risk.reason`
 * (acceptatiecriterium 5 van EPIC 12). `weken_over` en `cycli_bekeken` zijn
 * daarmee rechtstreeks af te lezen, en dat is scherper dan de stand: de stand is
 * het gevolg van acht takken, dus een rode stand zegt niet wélke `current_date`
 * eronder zat. Eén assertie per getal betekent één mutatie per grendel.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const UTC = 'UTC' as TimeZone;

/**
 * De serverdatum — `current_date` aan deze kant van de lijn.
 *
 * ⚠️ **Dit is een model van `current_date`, en het klopt alleen als de database
 *    in UTC staat.** Die aanname draagt élke assertie hieronder: reken de test
 *    in UTC terwijl de server ergens anders staat, dan wijst "de serverklok" de
 *    verkeerde dag aan en toetst de suite iets anders dan ze zegt.
 *
 *    Gemeten op 04-09-2026: de lokale stack staat op `Etc/UTC`, en de
 *    Postgres-container van CI ook. **Er staat geen grendel op.** Er is vandaag
 *    geen `*_bewaking()`-functie die de zone van de server teruggeeft, en er
 *    eentje bijmaken hoort niet in een migratie die over de Risico-radar gaat.
 *    Staat in `docs/ENGINEER-REVIEW.md` met de voorwaarde waaronder het zwaarder
 *    wordt: zodra de suite ergens draait waar de database níet in UTC staat.
 */
function serverdatum(): IsoDate {
  return localDateIn(UTC, now());
}

/**
 * Een tijdzone waarvan de datum nú van de serverdatum verschilt.
 *
 * Zelfde helper en zelfde reden als in `klokgrens.test.ts` en
 * `respijtdag.test.ts`: zonder afwijking is er niets te onderscheiden.
 */
function afwijkendeZone(): TimeZone {
  const vandaagUtc = serverdatum();
  for (const kandidaat of ['Pacific/Kiritimati', 'Pacific/Niue'] as const) {
    if (localDateIn(kandidaat as TimeZone, now()) !== vandaagUtc) return kandidaat as TimeZone;
  }
  throw new Error('UTC+14 en UTC−11 spannen 25 uur; dit kan niet voorkomen.');
}

/** Het verschil in hele dagen tussen twee ISO-datums. */
function dagenTussen(van: IsoDate, tot: IsoDate): number {
  const a = Date.parse(`${van}T00:00:00Z`);
  const b = Date.parse(`${tot}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

interface Reden {
  weken_over?: number;
  cycli_bekeken?: number;
  open_mijlpalen?: number;
}

interface Fixture {
  eigenaar: TestUser;
  zone: TimeZone;
  /** De datum op de klok van de eigenaar. */
  eigenDatum: IsoDate;
  /** `+1` als de eigenaar vóórloopt op de server, `-1` als hij achterloopt. */
  richting: number;
  /** Doel met één open mijlpaal, streefdatum op de weekgrens. */
  grensGoalId: string;
  /** Doel met één cyclus die precies tussen de twee klokken in valt. */
  vensterGoalId: string;
  /** Doel met één cyclus precies op de rand van het terugkijkvenster. */
  vensterrandGoalId: string;
}

describe.skipIf(!rlsTestsConfigured)('De Risico-radar rekent op de eigen klok', () => {
  let f: Fixture;

  beforeAll(async () => {
    const eigenaar = await createTestUser('risicoklok-eigenaar');
    const zone = afwijkendeZone();

    const profiel = await adminDb().from('profiles').update({ tz: zone }).eq('id', eigenaar.id);
    if (profiel.error) throw new Error(`tz zetten: ${profiel.error.message}`);

    const eigenDatum = localDateIn(zone, now());
    const richting = dagenTussen(serverdatum(), eigenDatum);
    if (richting === 0) {
      throw new Error(
        'de eigenaar staat op dezelfde dag als de server; dan kan deze suite de ' +
          'twee klokken niet onderscheiden en bewijst ze niets',
      );
    }

    // ⚠️ **De streefdatum ligt op een weekgrens, en aan welke kant hangt van de
    //    richting af.** Loopt de eigenaar vóór (`richting = +1`), dan geeft zes
    //    dagen hem nul weken en de server één. Loopt hij achter, dan geeft zeven
    //    dagen hem één week en de server nul. In beide gevallen verschillen de
    //    twee klokken precies één week — en zonder die grens geven ze hetzelfde
    //    getal en toetst deze suite niets.
    const dagenTotStreefdatum = richting > 0 ? 6 : 7;

    const grensDoel = await eigenaar.db
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'RISICOKLOK-GRENS',
        target_date: addDays(eigenDatum, dagenTotStreefdatum),
      })
      .select('id')
      .single();
    if (grensDoel.error || grensDoel.data === null) {
      throw new Error(`grensdoel: ${grensDoel.error?.message}`);
    }

    const mijlpaal = await eigenaar.db
      .from('milestones')
      .insert({
        goal_id: grensDoel.data.id,
        title: 'RISICOKLOK-MIJLPAAL',
        order_index: 1,
        status: 'todo',
      });
    if (mijlpaal.error) throw new Error(`mijlpaal: ${mijlpaal.error.message}`);

    // ⚠️ Het tweede doel toetst het terugkijkvenster en niet de streefdatum, dus
    //    de streefdatum ligt hier bewust ver weg: hij mag de stand niet sturen.
    const vensterDoel = await eigenaar.db
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'RISICOKLOK-VENSTER',
        target_date: addDays(eigenDatum, 200),
      })
      .select('id')
      .single();
    if (vensterDoel.error || vensterDoel.data === null) {
      throw new Error(`vensterdoel: ${vensterDoel.error?.message}`);
    }

    // ⚠️ **De cyclus valt precies tussen de twee klokken in.** `herbereken_risico()`
    //    telt cycli met `cycle_start_date < vandaag`. Zet je hem op de vróegste
    //    van de twee datums, dan telt de late klok hem wél en de vroege niet —
    //    welke van de twee dat is, hangt van de richting af, en het verschil is
    //    één rij in `cycli_bekeken`.
    const vroegste = richting > 0 ? serverdatum() : eigenDatum;

    const weekdoel = await eigenaar.db.from('weekly_goals').insert({
      goal_id: vensterDoel.data.id,
      title: 'RISICOKLOK-WEEKDOEL',
      points_ceiling: 2,
      points_floor: 1,
      // ⚠️ `points_miss` staat bewust níet in deze insert: de kolom zit niet in
      //    de INSERT-grant van `authenticated` (hij hoort bij het puntenmodel en
      //    niet bij de invoer) en de standaardwaarde is al `-1`. Wie hem toch
      //    meestuurt krijgt "permission denied for table weekly_goals", en dat
      //    leest als een policyweigering terwijl het een kolomgrant is.
      cycle_start_date: vroegste,
      cycle_index: 1,
    });
    if (weekdoel.error) throw new Error(`weekdoel: ${weekdoel.error.message}`);

    // ⚠️ **Een derde doel, want de rand van het venster is een ándere grendel.**
    //    Zou de cyclus hieronder bij `vensterDoel` staan, dan telt hij mee in
    //    dezelfde `cycli_bekeken` als de cyclus hierboven en zegt een rode
    //    assertie niet meer wélke van de twee `current_date`-en eronder zat.
    const randDoel = await eigenaar.db
      .from('goals')
      .insert({
        owner_id: eigenaar.id,
        title: 'RISICOKLOK-VENSTERRAND',
        target_date: addDays(eigenDatum, 200),
      })
      .select('id')
      .single();
    if (randDoel.error || randDoel.data === null) {
      throw new Error(`vensterranddoel: ${randDoel.error?.message}`);
    }

    // ⚠️ **De cyclus ligt precies op de rand van het terugkijkvenster van vier
    //    weken.** Het venster begint op `vandaag - 28`, en de twee klokken
    //    liggen één dag uit elkaar — dus één van beide sluit deze cyclus uit en
    //    de ander telt hem mee. Welke, hangt van de richting af:
    //
    //      richting +1 (eigenaar loopt vóór): eigen venster begint op
    //        eigenDatum-28, de server die van hem op eigenDatum-29. Een cyclus
    //        op eigenDatum-29 valt dus buiten het eigen venster en binnen dat
    //        van de server.
    //      richting -1: precies andersom, met de cyclus op eigenDatum-28.
    const randDag = addDays(eigenDatum, richting > 0 ? -29 : -28);

    const randWeekdoel = await eigenaar.db.from('weekly_goals').insert({
      goal_id: randDoel.data.id,
      title: 'RISICOKLOK-RANDWEEKDOEL',
      points_ceiling: 2,
      points_floor: 1,
      cycle_start_date: randDag,
      cycle_index: 1,
    });
    if (randWeekdoel.error) throw new Error(`randweekdoel: ${randWeekdoel.error.message}`);

    f = {
      eigenaar,
      zone,
      eigenDatum,
      richting,
      grensGoalId: grensDoel.data.id,
      vensterGoalId: vensterDoel.data.id,
      vensterrandGoalId: randDoel.data.id,
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  /** Draait de radar en geeft de onderbouwing terug die hij wegschreef. */
  async function reden(goalId: string): Promise<Reden> {
    const draai = await adminDb().rpc('herbereken_risico', { p_goal_id: goalId });
    if (draai.error) throw new Error(`herbereken_risico: ${draai.error.message}`);

    const rij = await adminDb()
      .from('goal_risk')
      .select('status, reason')
      .eq('goal_id', goalId)
      .single();
    if (rij.error || rij.data === null) throw new Error(`goal_risk: ${rij.error?.message}`);

    return (rij.data.reason ?? {}) as Reden;
  }

  it(
    'telt de weken tot de streefdatum op de dag van de eigenaar',
    async () => {
      const r = await reden(f.grensGoalId);

      // Op de klok van de eigenaar: zes dagen is nul weken, zeven dagen is één.
      const opEigenKlok = f.richting > 0 ? 0 : 1;
      const opServerklok = f.richting > 0 ? 1 : 0;

      expect(
        r.weken_over,
        `de eigenaar staat in ${f.zone} en dat is ${f.richting > 0 ? 'vóór' : 'achter'} ` +
          `op de server. Op zijn kalender heeft hij ${opEigenKlok} week/weken over, ` +
          `op die van de server ${opServerklok} — kwam dat laatste eruit, dan rekent ` +
          'de radar nog in UTC',
      ).toBe(opEigenKlok);
    },
    TEST_TIMEOUT,
  );

  it(
    'laat die dag ook het oordeel bepalen, niet alleen het getal',
    async () => {
      // ⚠️ De stand is het gevolg van acht takken en dus niet scherp genoeg om
      //    een klok mee aan te wijzen — maar hij is wél wat de gebruiker ziet.
      //    Zonder deze assertie kan `weken_over` kloppen terwijl de tak die hem
      //    gebruikt verschoven is, en dan is de belofte alsnog weg.
      const rij = await adminDb()
        .from('goal_risk')
        .select('status')
        .eq('goal_id', f.grensGoalId)
        .single();
      if (rij.error) throw new Error(`goal_risk: ${rij.error.message}`);

      // Nul weken over met een openstaande mijlpaal is de enige stand die geen
      // schatting is maar een feit; één week over laat hem door naar de
      // tempotakken, en zonder geschiedenis is dat 'on_track'.
      expect(rij.data?.status).toBe(f.richting > 0 ? 'unreachable' : 'on_track');
    },
    TEST_TIMEOUT,
  );

  it(
    'telt een cyclus als begonnen op de dag van de eigenaar',
    async () => {
      const r = await reden(f.vensterGoalId);

      // De cyclus staat op de vroegste van de twee datums. De late klok ziet hem
      // als begonnen, de vroege nog niet.
      const opEigenKlok = f.richting > 0 ? 1 : 0;
      const opServerklok = f.richting > 0 ? 0 : 1;

      expect(
        r.cycli_bekeken,
        `de cyclus begint op de vroegste van de twee kalenders. Op die van de ` +
          `eigenaar telt hij ${opEigenKlok} keer mee, op die van de server ` +
          `${opServerklok} keer — kwam dat laatste eruit, dan rekent de radar nog in UTC`,
      ).toBe(opEigenKlok);
    },
    TEST_TIMEOUT,
  );

  it(
    'legt de rand van het terugkijkvenster op de dag van de eigenaar',
    async () => {
      const r = await reden(f.vensterrandGoalId);

      // Het venster begint op `vandaag - 28`. De cyclus staat er precies op de
      // rand van, dus de late klok telt hem mee en de vroege niet.
      const opEigenKlok = f.richting > 0 ? 0 : 1;
      const opServerklok = f.richting > 0 ? 1 : 0;

      expect(
        r.cycli_bekeken,
        `de cyclus ligt op de rand van het terugkijkvenster van vier weken. Op de ` +
          `kalender van de eigenaar telt hij ${opEigenKlok} keer mee, op die van de ` +
          `server ${opServerklok} keer — kwam dat laatste eruit, dan rekent het ` +
          'venster nog in UTC',
      ).toBe(opEigenKlok);
    },
    TEST_TIMEOUT,
  );
});
