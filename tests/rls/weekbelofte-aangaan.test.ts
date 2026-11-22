import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate, type TimeZone, type Weekday } from '../../src/shared/time';
import { datumOver } from './datums';
import {
  createTestUser,
  registreerGroep,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';
import { psql, psqlMetInvoer, stackBeschikbaarOfFaal } from './psql-stack';

/**
 * Een weekbelofte aangaan: de insertgrendel, het plafond en de begunstigde —
 * QS8-760 (x.3 van de poort QS8-744), migratie 0314.
 *
 * Dit is de eerste schrijfweg voor een belofte. Alles wat een gebruiker kan,
 * gaat hier via PostgREST met een echt JWT; alleen wat een client per
 * constructie niet kan (een status op `due` zetten, een groep automatisch
 * maken, een profiel vastzetten) gaat via `psql` als `postgres`.
 *
 * ⚠️⚠️ **De naad waar dit bestand voor bestaat: criterium 3.** De trigger
 *    `bevries_belofteperiode()` draait vóór `commitments_insert`. Antwoordde hij
 *    B (die het `goal_id` van A kan lezen) met een `check_violation` over de
 *    weekdag, dan las B daaruit `week_start_day` van A; antwoordde hij over de
 *    uitsluiting, dan las B dát A een belofte of straf heeft. B krijgt daarom in
 *    elk geval de 42501 van de policy, en nooit 23514.
 *
 * ⚠️ **"Auckland zondag 23:30" staat in het issue met "in UTC nog zaterdag";
 *    dat klopt niet** (NZDT is UTC+13: zondag 23:30 is zondag 10:30 UTC). De
 *    klokregel `belofteperiode_klopt()` neemt daarom een vaste klok, en §2 toetst
 *    het letterlijke geval én de twee gevallen waarin de dag wél verschilt:
 *    maandag 08:00 NZDT (zondag in UTC) en zondag 09:00 NZDT (zaterdag in UTC).
 *    Per geval ligt `userCycle()` uit `src/shared/time` ernaast: de client rekent
 *    de start uit, de database accepteert precies die.
 *
 * Ijking (regel 18 vraag 3): per grendel met de hand gebroken; het verslag
 * staat in het PR-verslag van QS8-760.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

const stackErIs = stackBeschikbaarOfFaal(
  "select count(*) from pg_proc where proname = 'bevries_belofteperiode'",
  import.meta.url,
);

interface Wereld {
  alice: TestUser;
  bob: TestUser;
  carol: TestUser;
  dave: TestUser;
  /** Groep van Alice en Bob. */
  groep: string;
  /** Automatisch gevormde groep van Alice en Dave. */
  automatisch: string;
  doelen: string[];
}

let w: Wereld;

interface Uitkomst {
  readonly data: unknown;
  readonly error: { readonly code?: string; readonly message?: string } | null;
}

interface Belofte {
  start: string;
  groep?: string | null;
  getuige?: string | null;
  extra?: Record<string, unknown>;
}

/** Een belofte via PostgREST. */
function belofte(door: TestUser, doel: string, b: Belofte): PromiseLike<Uitkomst> {
  const rij: Record<string, unknown> = {
    goal_id: doel,
    type: 'penalty',
    body: 'Ik trakteer als ik mijn week niet haal',
    confirmed_at: 'now',
    beneficiary_group_id: b.groep === undefined ? w.groep : b.groep,
    beneficiary_user_id: b.getuige ?? null,
    periode_start: b.start,
    ...b.extra,
  };
  return door.db.from('commitments').insert(rij as never).select('id');
}

/** Een doelstraf via PostgREST. */
function doelstraf(door: TestUser, doel: string): PromiseLike<Uitkomst> {
  return door.db
    .from('commitments')
    .insert({
      goal_id: doel,
      type: 'penalty',
      body: 'Ik trakteer de groep',
      confirmed_at: 'now',
      beneficiary_group_id: w.groep,
    })
    .select('id');
}

function idVan(u: Uitkomst): string {
  if (u.error) throw new Error(`insert: ${u.error.code} ${u.error.message}`);
  const rijen = u.data as { id: string }[];
  const eerste = rijen[0];
  if (eerste === undefined) throw new Error('insert gaf geen rij');
  return eerste.id;
}

/** Zet Alice' klok vast en geeft de start van haar lopende cyclus. */
function zetKlok(weekStartDay: Weekday, tz: string): IsoDate {
  psql(`update profiles set tz = '${tz}', week_start_day = ${weekStartDay} where id = '${w.alice.id}'`);
  return userCycle({ weekStartDay, tz: tz as TimeZone }, now()).startDate;
}

/** Trekt alles van Alice op `set` in, zodat elke toets op een leeg plafond begint. */
function ruimOp(): void {
  psql(`update commitments c set status = 'cancelled'
          from goals g where g.id = c.goal_id and g.owner_id = '${w.alice.id}' and c.status = 'set'`);
}

function aantalVan(doel: string): number {
  return Number(psql(`select count(*) from commitments where goal_id = '${doel}'`).trim());
}

function doel(i: number): string {
  const d = w.doelen[i];
  if (d === undefined) throw new Error(`doel ${i} bestaat niet`);
  return d;
}

describe.skipIf(!rlsTestsConfigured || !stackErIs)('een weekbelofte aangaan (0314)', () => {
  beforeAll(async () => {
    const alice = await createTestUser('aangaan-alice');
    const bob = await createTestUser('aangaan-bob');
    const carol = await createTestUser('aangaan-carol');
    const dave = await createTestUser('aangaan-dave');

    async function maakGroep(door: TestUser, naam: string, leden: TestUser[]): Promise<string> {
      const r = await door.db.rpc('create_group', { group_name: naam });
      const gd = r.data as unknown as { ok?: boolean; group?: { id: string; invite_code: string } };
      if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(r.data)}`);
      registreerGroep(gd.group.id);
      for (const lid of leden) {
        const mee = await lid.db.rpc('join_group_with_code', { code: gd.group.invite_code });
        if ((mee.data as { ok?: boolean })?.ok !== true) throw new Error(`meedoen: ${JSON.stringify(mee.data)}`);
      }
      return gd.group.id;
    }

    const groep = await maakGroep(alice, 'Beloftegroep', [bob]);
    await maakGroep(carol, 'Andere groep', []);
    const automatisch = await maakGroep(alice, 'Automatische groep', [dave]);
    psql(`update groups set automatisch = true, zichtbaarheid = 'beschermd', ontdekbaar = false, klassement_aan = false
           where id = '${automatisch}'`);

    const doelen: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const d = await alice.db
        .from('goals')
        .insert({ owner_id: alice.id, title: `Beloftedoel ${i}`, target_date: datumOver(90) })
        .select('id')
        .single();
      if (d.error) throw new Error(`doel: ${d.error.message}`);
      doelen.push(d.data.id);
    }

    w = { alice, bob, carol, dave, groep, automatisch, doelen };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  // -------------------------------------------------------------------------
  // 1. Criterium 1 — de lopende week, op de eigen startdag (echte klok)
  // -------------------------------------------------------------------------

  for (const startdag of [1, 0] as const) {
    it(
      `week_start_day ${startdag} in Auckland: de lopende cyclus mag, vorige, volgende en een andere weekdag niet`,
      async () => {
        ruimOp();
        const start = zetKlok(startdag, 'Pacific/Auckland');
        const voor = aantalVan(doel(0));

        for (const [datum, melding] of [
          [addDays(start, -7), 'lopende week'],
          [addDays(start, 7), 'lopende week'],
          [addDays(start, 1), 'week-startdag'],
        ] as const) {
          const fout = await belofte(w.alice, doel(0), { start: datum });
          expect(fout.error?.code, datum).toBe('23514');
          expect(fout.error?.message, datum).toContain(melding);
        }
        expect(aantalVan(doel(0))).toBe(voor);

        const goed = await belofte(w.alice, doel(0), { start });
        const id = idVan(goed);
        // Het einde zet de trigger, en de zone is de bevroren zone van 0280.
        expect(psql(`select periode_einde - periode_start, tz from commitments where id = '${id}'`).trim()).toBe(
          '7|Pacific/Auckland',
        );
      },
      TEST_TIMEOUT,
    );
  }

  // -------------------------------------------------------------------------
  // 2. Criterium 1 — de klokregel met een vaste klok, naast userCycle()
  // -------------------------------------------------------------------------

  const AUCKLAND = 'Pacific/Auckland' as TimeZone;
  const GEVALLEN: readonly {
    naam: string;
    moment: string;
    startdag: Weekday;
    goed: string;
    fout: string;
  }[] = [
    // Het letterlijke geval uit het issue: zondag 23:30 NZDT is zondag 10:30 UTC.
    { naam: 'zondag 23:30, startdag 0', moment: '2026-11-22T10:30:00Z', startdag: 0, goed: '2026-11-22', fout: '2026-11-15' },
    { naam: 'zondag 23:30, startdag 1', moment: '2026-11-22T10:30:00Z', startdag: 1, goed: '2026-11-16', fout: '2026-11-23' },
    // Lokaal maandag, in UTC nog zondag: een UTC-klok zou de vorige week nemen.
    { naam: 'maandag 08:00, startdag 1', moment: '2026-11-22T19:00:00Z', startdag: 1, goed: '2026-11-23', fout: '2026-11-16' },
    // Lokaal zondag, in UTC nog zaterdag.
    { naam: 'zondag 09:00, startdag 0', moment: '2026-11-21T20:00:00Z', startdag: 0, goed: '2026-11-22', fout: '2026-11-15' },
  ];

  for (const g of GEVALLEN) {
    it(
      `Auckland ${g.naam}: de database accepteert precies wat userCycle() uitrekent`,
      () => {
        expect(userCycle({ weekStartDay: g.startdag, tz: AUCKLAND }, new Date(g.moment)).startDate).toBe(g.goed);
        const uit = psql(`select coalesce(belofteperiode_klopt('${g.goed}', ${g.startdag}::smallint, '${AUCKLAND}', '${g.moment}'), 'ok')
                              || ',' || coalesce(belofteperiode_klopt('${g.fout}', ${g.startdag}::smallint, '${AUCKLAND}', '${g.moment}'), 'ok')`);
        expect(uit.trim()).toBe('ok,week');
      },
      TEST_TIMEOUT,
    );
  }

  it(
    'de klokregel is voor geen client uit te voeren: een klok die de aanroeper zet, is geen klok',
    () => {
      const uit = psql(`select string_agg(r || '=' || has_function_privilege(r,
        'public.belofteperiode_klopt(date, smallint, text, timestamptz)', 'EXECUTE')::text, ',' order by r)
        from unnest(array['anon', 'authenticated', 'service_role']) r`);
      expect(uit.trim()).toBe('anon=false,authenticated=false,service_role=false');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 3. Criterium 2 en 3 — het einde, en B met het doel van A
  // -------------------------------------------------------------------------

  it(
    'een gewone JWT kan periode_einde niet inserten (42501)',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const voor = aantalVan(doel(0));
      const uit = await belofte(w.alice, doel(0), { start, extra: { periode_einde: addDays(start, 7) } });
      expect(uit.error?.code).toBe('42501');
      expect(aantalVan(doel(0))).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  it(
    'B met het goal_id van A krijgt de 42501 van de policy, nooit de check_violation van de trigger',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      // Een doelstraf op doel 1, zodat ook de uitsluiting iets te zeggen zou hebben.
      idVan(await doelstraf(w.alice, doel(1)));
      const voor = aantalVan(doel(1));

      for (const datum of [start, addDays(start, 1), addDays(start, 7)]) {
        const uit = await belofte(w.bob, doel(1), { start: datum });
        expect(uit.error?.code, datum).toBe('42501');
      }
      // En op een doel met een belofte: een doelstraf van B zegt niet dát er een is.
      idVan(await belofte(w.alice, doel(2), { start }));
      const straf = await doelstraf(w.bob, doel(2));
      expect(straf.error?.code).toBe('42501');

      expect(aantalVan(doel(1))).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 4. Criterium 4 — wie leest wat, via direct REST
  // -------------------------------------------------------------------------

  it(
    'groepslid en getuige lezen 0 rijen bij set en 1 na due, ook met select=periode_start; een andere groep altijd 0',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const viaGroep = idVan(await belofte(w.alice, doel(3), { start }));
      const viaGetuige = idVan(await belofte(w.alice, doel(4), { start, groep: null, getuige: w.bob.id }));

      async function leest(wie: TestUser, id: string): Promise<number> {
        const r = await wie.db.from('commitments').select('periode_start' as never).eq('id', id);
        if (r.error) throw new Error(`lezen: ${r.error.message}`);
        return (r.data as unknown[]).length;
      }

      for (const id of [viaGroep, viaGetuige]) {
        expect(await leest(w.bob, id)).toBe(0);
        expect(await leest(w.carol, id)).toBe(0);
      }

      psql(`update commitments set status = 'due' where id in ('${viaGroep}', '${viaGetuige}')`);

      for (const id of [viaGroep, viaGetuige]) {
        expect(await leest(w.bob, id)).toBe(1);
        expect(await leest(w.carol, id)).toBe(0);
        expect(await leest(w.dave, id)).toBe(0);
      }
      // Na due ziet de begunstigde ook de week (beslisdocument §5).
      const r = await w.bob.db.from('commitments').select('periode_start, body' as never).eq('id', viaGroep);
      expect(r.data).toEqual([{ periode_start: start, body: 'Ik trakteer als ik mijn week niet haal' }]);
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 5. Criterium 5 — geen begunstigde, of een onbekende
  // -------------------------------------------------------------------------

  it(
    'zonder groep en zonder getuige weigert de database',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const voor = aantalVan(doel(5));
      const uit = await belofte(w.alice, doel(5), { start, groep: null, getuige: null });
      expect(['23514', '42501']).toContain(uit.error?.code);
      expect(aantalVan(doel(5))).toBe(voor);
    },
    TEST_TIMEOUT,
  );

  it(
    'een automatische groep is geen begunstigde van een belofte, en een getuige uit alleen die groep ook niet',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const voor = aantalVan(doel(5));

      const groep = await belofte(w.alice, doel(5), { start, groep: w.automatisch });
      expect(groep.error?.code).toBe('42501');
      const getuige = await belofte(w.alice, doel(5), { start, groep: null, getuige: w.dave.id });
      expect(getuige.error?.code).toBe('42501');
      expect(aantalVan(doel(5))).toBe(voor);

      // Tegenproef: met Bob als getuige (een gekozen groep) lukt dezelfde belofte.
      idVan(await belofte(w.alice, doel(5), { start, groep: null, getuige: w.bob.id }));
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 6. Criterium 6 — het plafond
  // -------------------------------------------------------------------------

  it(
    'de vierde belofte op set wordt geweigerd',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      for (const i of [5, 6, 7]) idVan(await belofte(w.alice, doel(i), { start }));
      const vierde = await belofte(w.alice, doel(0), { start });
      expect(vierde.error?.code).toBe('23514');
      expect(vierde.error?.message).toContain('lopende weekbeloftes');
    },
    TEST_TIMEOUT,
  );

  it(
    'vier beloftes in één bulkverzoek: de rijtrigger telt de eerder verwerkte rijen mee',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const rijen = [5, 6, 7, 0].map((i) => ({
        goal_id: doel(i),
        type: 'penalty',
        body: 'Ik trakteer',
        confirmed_at: 'now',
        beneficiary_group_id: w.groep,
        periode_start: start,
      }));
      const bulk = await w.alice.db.from('commitments').insert(rijen as never).select('id');
      expect(bulk.error?.code).toBe('23514');
      expect(psql(`select count(*) from commitments c join goals g on g.id = c.goal_id
                    where g.owner_id = '${w.alice.id}' and c.status = 'set'`).trim()).toBe('0');
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 7. Criterium 7 — een belofte en een doelstraf sluiten elkaar uit
  // -------------------------------------------------------------------------

  it(
    'een belofte naast een doelstraf op hetzelfde doel wordt geweigerd, en andersom',
    async () => {
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');

      idVan(await doelstraf(w.alice, doel(6)));
      const belofteErbij = await belofte(w.alice, doel(6), { start });
      expect(belofteErbij.error?.code).toBe('23514');
      expect(belofteErbij.error?.message).toContain('staat een straf');

      ruimOp();
      idVan(await belofte(w.alice, doel(7), { start }));
      const strafErbij = await doelstraf(w.alice, doel(7));
      expect(strafErbij.error?.code).toBe('23514');
      expect(strafErbij.error?.message).toContain('loopt een weekbelofte');

      // Een ingetrokken belofte houdt niets meer tegen.
      ruimOp();
      idVan(await doelstraf(w.alice, doel(7)));
    },
    TEST_TIMEOUT,
  );

  // -------------------------------------------------------------------------
  // 8. De week ligt vast, en de triggervolgorde
  // -------------------------------------------------------------------------

  it(
    'de week van een belofte is niet te verzetten, ook niet door service_role',
    async () => {
      // ⚠️ Eerst bewijzen dat er iets te verzetten valt: een update op nul rijen
      //    "lukt" altijd en vuurt geen trigger (gemeten bij de ijking, toen deze
      //    test met \`-t\` los draaide). Zelf een belofte neerzetten dus.
      ruimOp();
      const start = zetKlok(1, 'Europe/Amsterdam');
      const id = idVan(await belofte(w.alice, doel(5), { start }));
      const uit = psqlMetInvoer(`
begin;
create temp table uitslag (regel text);
do $$
begin
  update commitments set periode_start = periode_start + 7, periode_einde = periode_einde + 7
   where id = '${id}';
  if not found then raise exception 'niets te verzetten'; end if;
  insert into uitslag values ('gelukt');
exception when others then
  insert into uitslag values ('sqlstate=' || sqlstate || ' ' || sqlerrm);
end $$;
select regel from uitslag;
rollback;`);
      expect(uit.trim()).toBe('sqlstate=23514 De week van een weekbelofte ligt vast vanaf het aangaan');
    },
    TEST_TIMEOUT,
  );

  it(
    'de periodetrigger vuurt ná de zonetrigger, zodat beide aan dezelfde bevroren klok meten',
    () => {
      const uit = psql(`select string_agg(tgname, ',' order by tgname) from pg_trigger
                          where tgrelid = 'public.commitments'::regclass and not tgisinternal
                            and tgname in ('commitments_zone', 'commitments_zone_belofteperiode')`);
      expect(uit.trim()).toBe('commitments_zone,commitments_zone_belofteperiode');
    },
    TEST_TIMEOUT,
  );
});
