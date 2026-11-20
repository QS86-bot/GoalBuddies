import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { addDays, now, type TimeZone, type UserClock, type Weekday } from '../../src/shared/time';
import { t } from '../../src/shared/i18n';
import { datumOver } from './datums';
import {
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Het beloftescherm tegen de echte database — QS8-761 (x.4 van de poort QS8-744).
 *
 * Hier draaien de functies die het scherm aanroept (`gaWeekbelofteAan()`,
 * `trekIn()`, `fetchBelofteBegunstigden()`, `fetchBelofteStand()`) zélf, met de
 * gedeelde client vervangen door die van een testgebruiker: de vorm van
 * `tests/rls/doorloop.test.ts`. Zo toetst dit de naad en niet een kopie ervan.
 *
 * ⚠️⚠️ **Criterium 4, de naad TypeScript ↔ SQL.** `belofteperiode()` rekent de
 *    start met `userCycle()`; `bevries_belofteperiode()` (0314) accepteert alleen
 *    de lopende cyclus op `week_start_day`. Voor startdag 1 én 0 moet wat de
 *    client uitrekent er doorheen, en de rij moet `periode_einde = start + 7`
 *    dragen zonder dat de client het einde stuurde.
 *
 * ⚠️ **De begunstigdenlijst en de policy op dezelfde invoer.** Een getuige die
 *    je alleen uit een automatische groep kent, staat niet in de lijst, én de
 *    database weigert hem. Het eerste zonder het tweede is gebruiksgemak; het
 *    tweede zonder het eerste is een knop die faalt.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const stackErIs = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'bevries_belofteperiode'",
  import.meta.url,
);

let actief: TestUser | null = null;

/**
 * De gedeelde client van de app, als de actieve testgebruiker.
 *
 * ⚠️ `auth.getUser()` vraagt GoTrue, en de lokale stack heeft geen GoTrue
 *    (`scripts/lokale-stack.sh`). Alleen dat ene antwoord wordt hier gegeven: de
 *    id van wie er "op de knop drukt". Al het andere is de echte client.
 */
vi.mock('../../src/lib/supabase', () => ({
  supabase: () => {
    const wie = actief;
    if (wie === null) throw new Error('weekbelofte-scherm: geen actieve gebruiker');
    return new Proxy(wie.db, {
      get(doel, sleutel) {
        if (sleutel === 'auth') {
          return { getUser: async () => ({ data: { user: { id: wie.id } }, error: null }) };
        }
        const waarde: unknown = Reflect.get(doel, sleutel);
        return typeof waarde === 'function' ? (waarde as (...a: unknown[]) => unknown).bind(doel) : waarde;
      },
    });
  },
}));

async function als<T>(wie: TestUser, stap: () => Promise<T>): Promise<T> {
  const vorige = actief;
  actief = wie;
  try {
    return await stap();
  } finally {
    actief = vorige;
  }
}

const commitments = await import('../../src/modules/commitments');

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  dave: TestUser;
  groep: string;
  automatisch: string;
  doelen: string[];
}

let w: Wereld;

const INVOER = { body: 'Ik trakteer mijn groep op koffie', image_url: null };

function doel(i: number): string {
  const d = w.doelen[i];
  if (d === undefined) throw new Error(`doel ${i} bestaat niet`);
  return d;
}

function zetKlok(weekStartDay: Weekday, tz: string): UserClock {
  psql(`update profiles set tz = '${tz}', week_start_day = ${weekStartDay} where id = '${w.alice.id}'`);
  return { weekStartDay, tz: tz as TimeZone };
}

function ruimOp(): void {
  psql(`update commitments c set status = 'cancelled'
          from goals g where g.id = c.goal_id and g.owner_id = '${w.alice.id}' and c.status in ('set', 'due')`);
}

function aantal(): number {
  return Number(psql(`select count(*) from commitments c join goals g on g.id = c.goal_id
                       where g.owner_id = '${w.alice.id}'`).trim());
}

const groep = (): { soort: 'groep'; id: string } => ({ soort: 'groep', id: w.groep });

async function beloof(i: number, klok: UserClock, start?: string) {
  const s = start ?? commitments.belofteperiode(klok, now()).start;
  return await als(w.alice, () => commitments.gaWeekbelofteAan(doel(i), INVOER, groep(), klok, s));
}

describe.skipIf(!rlsTestsConfigured || !stackErIs)('het beloftescherm tegen de database (QS8-761)', () => {
  beforeAll(async () => {
    const alice = await createTestUser('scherm-alice');
    const bob = await createTestUser('scherm-bob');
    const dave = await createTestUser('scherm-dave');

    async function maakGroep(door: TestUser, naam: string, lid: TestUser): Promise<string> {
      const r = await door.db.rpc('create_group', { group_name: naam });
      const gd = r.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(r.data)}`);
      registreerGroep(gd.group.id);
      const mee = await lid.db.rpc('join_group_with_code', { code: gd.group.invite_code });
      if ((mee.data as { ok?: boolean })?.ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
      return gd.group.id;
    }

    const g = await maakGroep(alice, 'Schermgroep', bob);
    // Een groep waarin alleen Alice zit: geen getuige (security-ronde, M1).
    const leeg = await alice.db.rpc('create_group', { group_name: 'Lege schermgroep' });
    const leegId = (leeg.data as unknown as { group?: { id: string } }).group?.id;
    if (leegId === undefined) throw new Error(`lege groep: ${JSON.stringify(leeg.data)}`);
    registreerGroep(leegId);
    const automatisch = await maakGroep(alice, 'Automatische schermgroep', dave);
    psql(`update groups set automatisch = true, zichtbaarheid = 'beschermd', ontdekbaar = false
           where id = '${automatisch}'`);

    const doelen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: `Schermdoel ${i}`, target_date: datumOver(90) })
        .select('id')
        .single();
      if (d.error) throw new Error(`doel: ${d.error.message}`);
      doelen.push(d.data.id);
    }
    w = { alice, bob, dave, groep: g, automatisch, doelen };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    actief = null;
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  for (const startdag of [1, 0] as const) {
    it(
      `criterium 4: week_start_day ${startdag} — wat belofteperiode() uitrekent, accepteert de trigger`,
      async () => {
        ruimOp();
        const klok = zetKlok(startdag, 'Europe/Amsterdam');
        const periode = commitments.belofteperiode(klok, now());

        const uitkomst = await beloof(0, klok);
        expect(uitkomst.ok, uitkomst.ok ? '' : uitkomst.melding).toBe(true);
        if (!uitkomst.ok) return;
        expect(uitkomst.waarde.periode_start).toBe(periode.start);
        expect(
          psql(`select periode_einde - periode_start, (periode_einde - 1)::text, status
                  from commitments where id = '${uitkomst.waarde.id}'`).trim(),
        ).toBe(`7|${periode.laatsteDag}|set`);
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'een week die sinds de bevestigstap voorbij is, gaat niet de deur uit',
    async () => {
      ruimOp();
      const klok = zetKlok(1, 'Europe/Amsterdam');
      const voor = aantal();
      const vorige = addDays(commitments.belofteperiode(klok, now()).start, -7);

      const uitkomst = await beloof(0, klok, vorige);
      expect(uitkomst).toEqual({ ok: false, melding: t('belofte.fout.week_voorbij') });
      expect(aantal()).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  it(
    'criterium 5: intrekken op set geeft cancelled, op due de melding al_afgegaan',
    async () => {
      ruimOp();
      const klok = zetKlok(1, 'Europe/Amsterdam');

      const eerste = await beloof(1, klok);
      if (!eerste.ok) throw new Error(eerste.melding);
      expect(await als(w.alice, () => commitments.trekIn(eerste.waarde.id))).toEqual({ ok: true, waarde: true });
      expect(psql(`select status from commitments where id = '${eerste.waarde.id}'`).trim()).toBe('cancelled');

      const tweede = await beloof(1, klok);
      if (!tweede.ok) throw new Error(tweede.melding);
      psql(`update commitments set status = 'due' where id = '${tweede.waarde.id}'`);
      expect(await als(w.alice, () => commitments.trekIn(tweede.waarde.id))).toEqual({
        ok: false,
        melding: t('commitment.fout.al_afgegaan'),
      });
      expect(psql(`select status from commitments where id = '${tweede.waarde.id}'`).trim()).toBe('due');
    },
    TEST_TIMEOUT,
  );

  it(
    'de begunstigdenlijst laat de automatische groep en wie je alleen daaruit kent weg — en de database weigert die ook',
    async () => {
      ruimOp();
      const klok = zetKlok(1, 'Europe/Amsterdam');
      const lijsten = await als(w.alice, () => commitments.fetchBelofteBegunstigden());

      expect(lijsten.groepen.map((g) => g.id)).toEqual([w.groep]);
      expect(lijsten.getuigen.map((m) => m.id)).toEqual([w.bob.id]);

      const start = commitments.belofteperiode(klok, now()).start;
      const viaDave = await als(w.alice, () =>
        commitments.gaWeekbelofteAan(doel(2), INVOER, { soort: 'persoon', id: w.dave.id }, klok, start),
      );
      expect(viaDave).toEqual({ ok: false, melding: t('belofte.fout.geweigerd') });
      const viaAutomatisch = await als(w.alice, () =>
        commitments.gaWeekbelofteAan(doel(2), INVOER, { soort: 'groep', id: w.automatisch }, klok, start),
      );
      expect(viaAutomatisch).toEqual({ ok: false, melding: t('belofte.fout.geweigerd') });
    },
    TEST_TIMEOUT,
  );

  it(
    'de weigeringen van de database komen als eigen zin terug, nooit als de terugval',
    async () => {
      ruimOp();
      const klok = zetKlok(1, 'Europe/Amsterdam');

      // Tweede belofte op een doel met een lopende: de unieke index (23505).
      const eerste = await beloof(0, klok);
      if (!eerste.ok) throw new Error(eerste.melding);
      expect(await beloof(0, klok)).toEqual({ ok: false, melding: t('belofte.fout.al_deze_week') });

      // Een doelstraf ernaast: de uitsluiting van de trigger (23514).
      // En andersom: een doelstraf naast de lopende belofte krijgt een eigen zin (critical-user).
      expect(await als(w.alice, () => commitments.zetStraf(doel(0), INVOER, groep()))).toEqual({
        ok: false,
        melding: t('straf.belofte_loopt'),
      });
      const straf = await als(w.alice, () => commitments.zetStraf(doel(3), INVOER, groep()));
      if (!straf.ok) throw new Error(straf.melding);
      expect(await beloof(3, klok)).toEqual({ ok: false, melding: t('belofte.fout.doelstraf') });
      const stand = await als(w.alice, () => commitments.fetchBelofteStand(doel(3)));
      expect(stand).toEqual({ beloftes: [], doelstrafOpen: true });

      // Het plafond van drie (23514).
      for (const i of [1, 2]) {
        const r = await beloof(i, klok);
        if (!r.ok) throw new Error(r.melding);
      }
      expect(await beloof(4, klok)).toEqual({ ok: false, melding: t('belofte.fout.plafond') });

      const lopend = await als(w.alice, () => commitments.fetchBelofteStand(doel(0)));
      // Nieuwste eerst; de eerdere gevallen hierboven lieten op dit doel ingetrokken beloftes achter.
      expect(lopend.beloftes[0]?.id).toBe(eerste.waarde.id);
      expect(lopend.beloftes.slice(1).every((b) => b.status === 'cancelled')).toBe(true);
      expect(lopend.beloftes.length).toBeLessThanOrEqual(5);
      expect(lopend.doelstrafOpen).toBe(false);
    },
    TEST_TIMEOUT,
  );
});
