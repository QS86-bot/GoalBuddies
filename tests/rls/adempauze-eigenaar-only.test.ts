import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';

import {
  adminDb,
  anonDb,
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een adempauze is van jou alleen — migratie 0307, besluit Quinten 19-11-2026.
 *
 * ⚠️ **De belofte is niet "de policy zegt `user_id = auth.uid()`".** Dat is het
 *    onderdeel. De belofte is een eigenschap van het geheel:
 *
 *      Geen enkel pad leest de rij van een ander dan de eigenaar: niet de
 *      tabel, niet een view erop, niet een functie die als de aanroeper draait,
 *      niet realtime.
 *
 *    Daarom staan hieronder vijf helften: (1) de tabel zelf, met een JWT per
 *    gebruiker en in beide groepssoorten, (2) de policytekst, (3) geen view,
 *    (4) de functies die de tabel lezen staan in een register mét reden, en
 *    (5) realtime. Een test op alleen de eerste blijft groen bij een view die
 *    de tabel opnieuw openzet; een test op alleen de policytekst blijft groen
 *    bij een invoker-functie die ze langs een andere weg uitdeelt.
 *
 * ⚠️ **Eerst de eigenaar, dan de ander.** Een groepsgenoot die nul rijen ziet
 *    bewijst niets zolang niet vaststaat dat de rij er is — dezelfde tegentest
 *    als in `leesgrenzen.test.ts`.
 *
 * ⚠️ **Beschermd én open, vooruit én terugwerkend.** Het besluit van A41 laat
 *    de groepssoort variëren op oppervlakken; hier mag hij dat niet. De test
 *    staat er om te bewijzen dat "open" niets opent, en 8 weken terug is de
 *    pauze achteraf waarvan QS8-227 de aankondiging als rem had.
 *
 * ⚠️ **`ketting_stand()` stond hier tot 0328 als benoemd restant (B1) en staat er
 *    niet meer:** sinds QS8-769 leest hij `breathers` niet meer en telt een lid in
 *    een pauze mee. Dat een pauze er niet uit af te leiden is, staat in
 *    `tests/rls/ketting-pauze-meetelt.test.ts`; het register hieronder ziet alleen
 *    wie de tabel leest.
 *
 * IJKING: zie de PR-tekst van deze wijziging. De grendel die geijkt wordt is
 * de policy; zet je de groepstak van 0122 terug, dan vallen de groepsgenoot-
 * tests en de policytekst-test om, en de eigenaarstegentest blijft groen.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

/**
 * Elke functie in `public` die `breathers` leest of schrijft, met de reden
 * waarom de policy hem niet raakt. Een nieuwe functie die de tabel aanraakt is
 * hier rood tot iemand de reden opschrijft — en is hij geen definer, dan draait
 * hij onder de RLS van de aanroeper en is dat een bevinding, geen register-rij.
 */
const REGISTER: Readonly<Record<string, string>> = {
  plan_adempauze:
    'SECURITY DEFINER; leest eigen rijen (`user_id = v_uid`) voor de overlapcontrole en schrijft de rij.',
  annuleer_adempauze:
    'SECURITY DEFINER; leest en verwijdert alleen de eigen rij (`user_id = v_uid`).',
};

interface Wereld {
  eigenaar: TestUser;
  groepsgenoot: TestUser;
  beschermdGoalId: string;
  openGoalId: string;
  /** Per doel: de lopende pauze en een pauze 8 weken terug. */
  rijIds: string[];
}

let w: Wereld;

async function maakGroep(
  eigenaar: TestUser,
  genoot: TestUser,
  naam: string,
  zichtbaarheid: 'beschermd' | 'open',
): Promise<string> {
  const g = await eigenaar.db.rpc('create_group', { group_name: naam, zichtbaarheid });
  const d = g.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
  if (d.ok !== true || !d.group) throw new Error(`groep ${naam}: ${JSON.stringify(g.data)}`);
  registreerGroep(d.group.id);
  const mee = await genoot.db.rpc('join_group_with_code', { code: d.group.invite_code });
  if ((mee.data as { ok?: boolean } | null)?.ok !== true) {
    throw new Error(`genoot in ${naam}: ${JSON.stringify(mee.data)}`);
  }
  const echt = await adminDb().from('groups').select('zichtbaarheid').eq('id', d.group.id).single();
  if (echt.data?.zichtbaarheid !== zichtbaarheid) {
    throw new Error(`groep ${naam} is ${echt.data?.zichtbaarheid}, bedoeld ${zichtbaarheid}`);
  }
  return d.group.id;
}

describe.skipIf(!rlsTestsConfigured)('een adempauze is van jou alleen', () => {
  beforeAll(async () => {
    const eigenaar = await createTestUser('pauze-eigen-eigenaar');
    const groepsgenoot = await createTestUser('pauze-eigen-genoot');
    const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

    const beschermd = await maakGroep(eigenaar, groepsgenoot, 'Pauze beschermd', 'beschermd');
    const open = await maakGroep(eigenaar, groepsgenoot, 'Pauze open', 'open');

    const maakDoel = async (titel: string, groep: string): Promise<string> => {
      const d = await eigenaar.db
        .from('goals')
        .insert({ owner_id: eigenaar.id, title: titel, target_date: addDays(vandaag, 90) })
        .select('id')
        .single();
      if (d.error || d.data === null) throw new Error(`doel ${titel}: ${d.error?.message}`);
      const k = await eigenaar.db.from('goal_group_links').insert({ goal_id: d.data.id, group_id: groep });
      if (k.error) throw new Error(`koppeling ${titel}: ${k.error.message}`);
      return d.data.id;
    };
    const beschermdGoalId = await maakDoel('PAUZE-BESCHERMD', beschermd);
    const openGoalId = await maakDoel('PAUZE-OPEN', open);

    // ⚠️ Via `adminDb()`: dit bestand toetst wie de rij mag lézen, niet de
    //    schrijfroute (die staat in `adempauze-grendels.test.ts`).
    const terug = addDays(vandaag, -56);
    const rijen = [beschermdGoalId, openGoalId].flatMap((goal_id) => [
      { user_id: eigenaar.id, goal_id, starts_cycle: vandaag, ends_cycle: addDays(vandaag, 7) },
      { user_id: eigenaar.id, goal_id, starts_cycle: terug, ends_cycle: addDays(terug, 7) },
    ]);
    const ins = await adminDb().from('breathers').insert(rijen).select('id');
    if (ins.error || ins.data === null) throw new Error(`adempauzes: ${ins.error?.message}`);

    w = {
      eigenaar,
      groepsgenoot,
      beschermdGoalId,
      openGoalId,
      rijIds: ins.data.map((r) => r.id),
    };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function tel(wie: TestUser, goalId: string): Promise<{ n: number; count: number | null }> {
    const { data, count, error } = await wie.db
      .from('breathers')
      .select('id', { count: 'exact' })
      .eq('goal_id', goalId);
    if (error) throw new Error(`breathers lezen: ${error.message}`);
    return { n: (data ?? []).length, count };
  }

  describe('de tabel, met een eigen JWT per gebruiker', () => {
    it(
      'de eigenaar ziet zijn lopende en zijn terugwerkende pauze, in beide groepssoorten',
      async () => {
        for (const goalId of [w.beschermdGoalId, w.openGoalId]) {
          const r = await tel(w.eigenaar, goalId);
          expect(r.n, 'lopende pauze plus die van 8 weken terug').toBe(2);
          expect(r.count).toBe(2);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot leest nul rijen in een beschermde groep, ook geen count',
      async () => {
        expect(await tel(w.groepsgenoot, w.beschermdGoalId)).toEqual({ n: 0, count: 0 });
      },
      TEST_TIMEOUT,
    );

    it(
      'een groepsgenoot leest nul rijen in een open groep, ook geen count',
      async () => {
        expect(await tel(w.groepsgenoot, w.openGoalId)).toEqual({ n: 0, count: 0 });
      },
      TEST_TIMEOUT,
    );

    it(
      'ook zonder doelfilter komt er niets van de eigenaar terug, vooruit noch terugwerkend',
      async () => {
        const { data, error } = await w.groepsgenoot.db
          .from('breathers')
          .select('id, starts_cycle')
          .eq('user_id', w.eigenaar.id);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);

        const alles = await w.groepsgenoot.db.from('breathers').select('id').in('id', w.rijIds);
        expect(alles.error).toBeNull();
        expect(alles.data ?? [], 'ook niet op id').toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    it(
      'anon krijgt een weigering',
      async () => {
        const r = await anonDb().from('breathers').select('id');
        expect(r.error?.code).toBe('42501');
      },
      TEST_TIMEOUT,
    );
  });

  describe('realtime', () => {
    it(
      'realtime_bewaking() toont breathers buiten de publicatie en op REPLICA IDENTITY default',
      async () => {
        const { data, error } = await adminDb().rpc('realtime_bewaking');
        expect(error).toBeNull();
        const rijen = (data ?? []) as {
          tabel: string;
          in_publicatie: boolean;
          replica_identity: string;
        }[];
        // ⚠️ Eerst bewijzen dat de tabel er staat: een lijst zonder haar is "niet in de publicatie" gratis.
        const rij = rijen.find((r) => r.tabel === 'breathers');
        expect(rij).toBeDefined();
        expect(rij?.in_publicatie).toBe(false);
        expect(rij?.replica_identity).toBe('default');
      },
      TEST_TIMEOUT,
    );
  });
});

/**
 * De catalogushelften: de policytekst, de views en het functieregister.
 *
 * ⚠️ **Waarom psql en niet de harness.** `pg_policies`, `pg_views` en `pg_proc`
 *    zijn via PostgREST niet te lezen. Er wordt niets geschreven.
 */
const beschikbaar = stackBeschikbaarOfFaal(
  "select count(*) from pg_policies where tablename = 'breathers'",
  import.meta.url,
);

describe.skipIf(!beschikbaar)('een adempauze is van jou alleen — de catalogus', () => {
  it('breathers_select is de enige policy en kent geen groepstak', () => {
    const regels = psql(
      "select policyname || '|' || cmd || '|' || coalesce(qual, '') from pg_policies " +
        "where schemaname = 'public' and tablename = 'breathers' order by policyname",
    )
      .split('\n')
      .filter((r) => r !== '');

    expect(regels, 'er hoort precies één policy te zijn, en geen schrijfpolicy').toHaveLength(1);
    const [naam, cmd, qual] = (regels[0] ?? '').split('|');
    expect(naam).toBe('breathers_select');
    expect(cmd).toBe('SELECT');
    // Tegentest: de eigenaarshelft staat er wel in.
    expect(qual).toContain('user_id');
    expect(qual).toContain('auth.uid()');
    expect(qual, 'de groepstak van 0122 is terug').not.toContain('shares_group_with_goal');
    expect(qual).not.toContain('group');
    expect(qual).not.toContain('goals');
    expect(qual).not.toMatch(/\bor\b/i);
  });

  it('geen enkele view of materialized view leest breathers', () => {
    const uit = (soort: 'pg_views' | 'pg_matviews', tabel: string): number =>
      Number(
        psql(
          `select count(*) from ${soort} where schemaname = 'public' and definition ~* '\\m${tabel}\\M'`,
        ),
      );

    // ⚠️ Tegentest: dezelfde regex vindt `goals` wél in een view (goal_dashboard).
    //    Zonder dit is "0 views op breathers" gratis, bij een regex die niets vindt.
    expect(uit('pg_views', 'goals'), 'de zoekregex vindt geen enkele view').toBeGreaterThan(0);

    expect(uit('pg_views', 'breathers')).toBe(0);
    expect(uit('pg_matviews', 'breathers')).toBe(0);
  });

  it('de functies die breathers lezen zijn precies het register, en alle SECURITY DEFINER', () => {
    // ⚠️ Commentaar wordt eruit gestript, zoals in `pauze-bestaat-niet.test.ts`:
    //    een migratie die opschrijft wat er weg is, is geen lezer.
    const rijen = psql(
      `select p.proname || '|' || p.prosecdef::text
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and regexp_replace(p.prosrc, '--[^\\n]*', '', 'g') ~* '\\mbreathers\\M'
        order by p.proname`,
    )
      .split('\n')
      .filter((r) => r !== '');

    const gevonden = new Map<string, boolean[]>();
    for (const r of rijen) {
      const [naam, definer] = r.split('|');
      if (naam === undefined) continue;
      gevonden.set(naam, [...(gevonden.get(naam) ?? []), definer === 'true']);
    }

    expect(
      [...gevonden.keys()].sort(),
      'een functie leest breathers zonder dat er in het register een reden bij staat (of andersom)',
    ).toEqual(Object.keys(REGISTER).sort());

    for (const [naam, definers] of gevonden) {
      expect(definers.every(Boolean), `${naam} draait als de aanroeper en valt onder de RLS`).toBe(true);
    }
  });
});
