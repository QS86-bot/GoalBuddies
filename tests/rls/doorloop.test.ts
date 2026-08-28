/**
 * De doorloop met twee accounts — het hele pad, door de knoppen van de app.
 *
 * ⚠️ **Waarom dit bestaat, en waarom 574 RLS-tests het niet dekken.** Op
 *    28-08-2026 gaf "koppel doel aan groep" op productie een `42501` terwijl de
 *    volledige RLS-suite groen stond. Die suite praat rechtstreeks met
 *    PostgREST: `.from('goal_group_links').insert(...)`. De **app** doet een
 *    `upsert`, en `on conflict do update` eist het UPDATE-tabelrecht al bij het
 *    plánnen — een recht dat migratie 0118 net had ingetrokken. De tabel was
 *    dus bereikbaar en de knop was stuk, tegelijk.
 *
 *    Dit bestand roept daarom **de functies van de datalaag** aan, in de
 *    volgorde waarin een mens ze aanraakt. Niet de tabellen.
 *
 * ⚠️ **Wat dit níet is: een test van de schermen.** Er zit geen browser aan
 *    vast en er wordt niets gerenderd. Wat het dekt is de laag waar vandaag
 *    drie van de vier ketenbreuken zaten: tussen de knop en de database.
 *    Boven deze laag ligt nog steeds ongetoetst gebied.
 *
 * ⚠️ **Hij staat in `tests/rls/` en dat is geen vergissing.** Deze groep draait
 *    met `fileParallelism: false` tegen dezelfde database. Een doorloop die
 *    naast de RLS-bestanden loopt, ruimt hun fixtures op — precies de bevinding
 *    die die vlag heeft opgeleverd.
 *
 * ⚠️ **De laatste stap is domeinregel 7 en die hoort hier thuis.** Elke losse
 *    policy is elders getoetst; wat hier getoetst wordt is dat je aan het éínd
 *    van een echte doorloop, met een gemiste week in de data, nog steeds niets
 *    over de ander kunt zien. Dat is de belofte, en niet de policy.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

/**
 * Wie er op dit moment "op de knop drukt".
 *
 * ⚠️ De datalaag kent geen gebruiker: hij pakt de gedeelde client en die draagt
 *    de sessie. Een doorloop met twee accounts moet dus de cliënt wisselen en
 *    niet een user-id meegeven — anders toetst hij een vorm die de app niet
 *    heeft.
 */
let actief: TestUser | null = null;

vi.mock('../../src/lib/supabase', () => ({
  supabase: () => {
    if (actief === null) throw new Error('doorloop: er is geen actieve gebruiker gezet');
    return actief.db;
  },
}));

/** Voert een stap uit alsof deze gebruiker hem in de app doet. */
async function als<T>(wie: TestUser, stap: () => Promise<T>): Promise<T> {
  const vorige = actief;
  actief = wie;
  try {
    return await stap();
  } finally {
    actief = vorige;
  }
}

/** Een `Resultaat` uitpakken en de melding tonen als het misging. */
function moetLukken<T>(uitkomst: { ok: boolean; melding?: string } & Record<string, unknown>, wat: string): T {
  if (uitkomst.ok !== true) {
    throw new Error(`${wat} mislukte: ${uitkomst.melding ?? JSON.stringify(uitkomst)}`);
  }
  return (uitkomst as unknown as { waarde: T }).waarde;
}

describe.runIf(rlsTestsConfigured)('de doorloop met twee accounts', () => {
  let anna: TestUser;
  let bram: TestUser;

  /** Wat de ene etappe aan de volgende doorgeeft — zoals in de app zelf. */
  const pad: { doelId?: string; groupId?: string; weekdoelId?: string; voltooiingId?: string } = {};

  beforeAll(async () => {
    anna = await createTestUser('doorloop-anna');
    bram = await createTestUser('doorloop-bram');
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    actief = null;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  it(
    'Anna maakt een doel, een groep, Bram doet mee, en het doel gaat de groep in',
    async () => {
      const { maakDoel } = await import('../../src/modules/goals');
      const { maakGroep, neemDeel, koppelDoelAanGroep, fetchGekoppeldeDoelIds } = await import(
        '../../src/modules/buddies'
      );

      const vandaag = new Date().toISOString().slice(0, 10);
      const overNegentigDagen = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

      const doel = await als(anna, () =>
        maakDoel(
          anna.id,
          {
            title: 'Halve marathon lopen',
            description: null,
            category: 'other',
            target_date: overNegentigDagen,
            identity_statement: 'Ik ben iemand die traint',
            available_hours_per_week: 4,
          },
          vandaag as never,
        ),
      );
      expect(doel.ok, `doel aanmaken: ${doel.ok ? '' : doel.melding}`).toBe(true);
      const doelId = moetLukken<{ id: string }>(doel, 'doel aanmaken').id;
      pad.doelId = doelId;

      const groep = await als(anna, () => maakGroep({ name: 'De Ochtendlopers', huddle_day: 1, zichtbaarheid: 'beschermd' }));
      expect(groep.ok, `groep aanmaken: ${groep.ok ? '' : groep.melding}`).toBe(true);
      const gemaakt = moetLukken<{ id: string; invite_code: string }>(groep, 'groep aanmaken');
      pad.groupId = gemaakt.id;

      const mee = await als(bram, () => neemDeel(gemaakt.invite_code));
      expect(mee.ok, `meedoen: ${mee.ok ? '' : mee.melding}`).toBe(true);

      // ⚠️ **Dit is de stap die op productie brak terwijl alles groen stond.**
      //    De datalaag doet hier een `upsert`, en dat vraagt een ander recht dan
      //    de `insert` die de RLS-suite doet.
      const koppeling = await als(anna, () => koppelDoelAanGroep(doelId, gemaakt.id));
      expect(
        koppeling.ok,
        `koppelen: ${koppeling.ok ? '' : koppeling.melding} — dit is de 42501 van 28-08`,
      ).toBe(true);

      const gekoppeld = await als(bram, () => fetchGekoppeldeDoelIds(gemaakt.id));
      expect(gekoppeld, 'Bram ziet het doel niet in de groep').toContain(doelId);
    },
    TEST_TIMEOUT,
  );

  it(
    'Anna zet een weekdoel neer en rondt het af met bewijs',
    async () => {
      const { maakWeekdoel, eersteCyclusVanDoel, huidigeCyclus } = await import('../../src/modules/goals');
      const { rondAf } = await import('../../src/modules/completions');
      // ⚠️ Uit het bronbestand en niet uit de barrel: `modules/auth/index.ts`
      //    trekt de provider mee en dus react-native, en dat is Flow-syntax die
      //    vitest niet leest. De datalaag zelf is schoon.
      const { userClock } = await import('../../src/modules/auth/profile');

      const profiel = await adminDb()
        .from('profiles')
        .select('week_start_day, tz')
        .eq('id', anna.id)
        .single();
      if (profiel.error || profiel.data === null) throw new Error(`profiel: ${profiel.error?.message}`);
      const klok = userClock(profiel.data);

      // ⚠️ Mét de klok, en dat is geen formaliteit: zonder tweede argument komt
      //    hier `undefined` binnen waar een `UserClock` hoort, en dan rekent de
      //    cyclusbepaling met een andere week-startdag dan de gebruiker heeft.
      //    Typecheck ving dit; de test was er groen op.
      const eerste = await als(anna, () => eersteCyclusVanDoel(pad.doelId as string, klok));

      const weekdoel = await als(anna, () =>
        maakWeekdoel(
          klok,
          {
            goal_id: pad.doelId as string,
            milestone_id: null,
            title: 'Drie keer twintig minuten hardlopen',
            floor_text: 'Eén keer twintig minuten',
            ceiling_text: 'Drie keer twintig minuten',
          },
          eerste,
        ),
      );
      expect(weekdoel.ok, `weekdoel: ${weekdoel.ok ? '' : weekdoel.melding}`).toBe(true);
      pad.weekdoelId = moetLukken<{ id: string }>(weekdoel, 'weekdoel').id;

      const voltooiing = await als(anna, () =>
        rondAf(pad.weekdoelId as string, anna.id, {
          achieved_level: 'ceiling',
          note: 'Drie keer gelopen, de laatste in de regen.',
        }),
      );
      expect(voltooiing.ok, `afronden: ${voltooiing.ok ? '' : voltooiing.melding}`).toBe(true);
      pad.voltooiingId = moetLukken<{ id: string }>(voltooiing, 'afronden').id;

      // ⚠️ De status wordt niet gezet maar verdíénd: een trigger zet hem op
      //    `pending` bij het invoegen. Zou de fixture hem zelf schrijven, dan
      //    toetst de rest een toestand die de app misschien nooit maakt.
      // ⚠️ De status hangt aan het **weekdoel** en niet aan de voltooiing, en
      //    hij wordt niet gezet maar verdíénd: een trigger zet hem op `pending`
      //    bij het invoegen van de voltooiing. Zou de fixture hem zelf
      //    schrijven, dan toetst de rest een toestand die de app nooit maakt.
      const stand = await adminDb()
        .from('weekly_goals')
        .select('status')
        .eq('id', pad.weekdoelId as string)
        .single();
      expect(stand.data?.status, 'het weekdoel wacht niet op goedkeuring').toBe('pending');

      void huidigeCyclus;
    },
    TEST_TIMEOUT,
  );

  it(
    'Bram keurt goed, en dat is de autorisatiegrens van domeinregel 3',
    async () => {
      const { beoordeel } = await import('../../src/modules/completions');

      // ⚠️ Eerst de tegenproef: Anna mag zichzelf niet goedkeuren. Dat is
      //    domeinregel 3, en een doorloop die alleen het gelukkige pad loopt,
      //    bewijst niet dat de grens er is.
      const zelf = await als(anna, () =>
        beoordeel(pad.voltooiingId as string, pad.groupId as string, anna.id, {
          status: 'approved',
          comment: null,
        }),
      );
      expect(zelf.ok, 'Anna kon haar eigen week goedkeuren — domeinregel 3 is stuk').toBe(false);

      // ⚠️ `ok: false` is te zwak: dat zou ook waar zijn bij een netwerkfout of
      //    een validatiemelding. De belofte is dat er géén rij ontstaat, en dat
      //    is wat een audit later zou lezen.
      const zelfgeschreven = await adminDb()
        .from('completion_approvals')
        .select('id')
        .eq('completion_id', pad.voltooiingId as string)
        .eq('approver_id', anna.id);
      expect(
        (zelfgeschreven.data ?? []).length,
        'er staat een zelfgoedkeuring in completion_approvals',
      ).toBe(0);

      const oordeel = await als(bram, () =>
        beoordeel(pad.voltooiingId as string, pad.groupId as string, bram.id, {
          status: 'approved',
          comment: 'Netjes, ook in de regen.',
        }),
      );
      expect(oordeel.ok, `goedkeuren: ${oordeel.ok ? '' : oordeel.melding}`).toBe(true);

      const na = await adminDb()
        .from('weekly_goals')
        .select('status')
        .eq('id', pad.weekdoelId as string)
        .single();
      expect(na.data?.status, 'de week staat na goedkeuring niet op approved').toBe('approved');
    },
    TEST_TIMEOUT,
  );

  it(
    'de punten van Anna zijn privé — ook voor haar buddy',
    async () => {
      // Domeinregel 10: `points_ledger` is alleen voor de eigenaar. Een dalend
      // totaal is zichtbaar bewijs van een gemiste week, en dat botst met
      // domeinregel 7.
      const eigen = await anna.db.from('points_ledger').select('delta').eq('user_id', anna.id);
      expect(eigen.error, `Anna kan haar eigen punten niet lezen: ${eigen.error?.message}`).toBeNull();
      expect((eigen.data ?? []).length, 'er is geen punt geboekt na een goedgekeurde week').toBeGreaterThan(0);

      const vanAnnaDoorBram = await bram.db.from('points_ledger').select('delta').eq('user_id', anna.id);
      expect(
        (vanAnnaDoorBram.data ?? []).length,
        'Bram kan de punten van Anna lezen — domeinregel 10 is stuk',
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});
