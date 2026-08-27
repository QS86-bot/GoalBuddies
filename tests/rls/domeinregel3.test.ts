import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { userCycle } from '../../src/shared/time/cycle';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const TEST_TIMEOUT = 30_000;
const SETUP_TIMEOUT = 180_000;

/**
 * Domeinregel 3 heeft twee sloten, en één ervan stond niet onder test.
 *
 * ⚠️ **CLAUDE.md, domeinregel 3:** *"Alleen een lid van dezelfde buddy-groep mag
 *    een voltooiing goedkeuren. Nooit jezelf. Afgedwongen in RLS **én** met een
 *    database-constraint, niet alleen in de UI. Test dit expliciet."*
 *
 *    De constraint-helft is uitgebreid getest in `policies.test.ts` en werkt.
 *    De RLS-helft — de clausule `c.user_id <> auth.uid()` in
 *    `completion_approvals_insert` — was vanuit een client niet los te toetsen:
 *    Postgres draait `before insert`-triggers vóór de RLS `with check`, dus
 *    `fill_approval_subject()` en de CHECK gooien altijd als eerste. De test
 *    daar zegt dat ook met zoveel woorden.
 *
 * ⚠️ **Op 27-08-2026 gemeten in plaats van beredeneerd.** Op de lokale stack is
 *    die clausule uit de policy gehaald en daarna draaide de héle suite:
 *    **24 bestanden, 428 tests, alles groen.** Het gedrag bleef goed — de
 *    constraint vangt de gebruiker nog steeds — maar de dúbbele beveiliging die
 *    domeinregel 3 met zoveel woorden eist, was een enkele geworden, en niets
 *    zou dat gemeld hebben.
 *
 * ⚠️ **Dat is regel 18, vraag 3:** kan deze test groen blijven terwijl de
 *    belofte breekt? Hier was het antwoord ja. Nog een gedragstest erbij zou
 *    niet helpen — die raakt hetzelfde onderste slot. Vandaar een bewaking op
 *    het bestáán van beide sloten, naast de gedragstests die bewijzen dat de
 *    deur dicht is.
 *
 * ⚠️ Met de hand gebroken vóór hij hier kwam te staan, in een teruggedraaide
 *    transactie: clausule weg gaf `rls`, daarbovenop de constraint weg gaf
 *    `rls` + `constraint`, en daarbovenop de trigger weg gaf alle drie. Met
 *    alles op zijn plek: nul.
 */
describe.skipIf(!rlsTestsConfigured)('Domeinregel 3 — twee sloten op peer-goedkeuring', () => {
  it(
    'beide sloten staan er, en de trigger die het tweede voedt',
    async () => {
      const { data, error } = await adminDb().rpc('domeinregel3_bewaking');

      expect(error).toBeNull();
      // Bij een treffer staat in de melding wélk slot weg is en wat er precies
      // ontbreekt, zodat de volgende lezer niet hoeft te zoeken.
      expect(data ?? [], JSON.stringify(data)).toEqual([]);
    },
    TEST_TIMEOUT,
  );

  it(
    'is niet aanroepbaar als gewone gebruiker',
    async () => {
      // ⚠️ De positieve controle. Deze functie leest het systeemcatalogus en
      //    hoort alleen voor `service_role` te bestaan. En niet alleen "er is
      //    een fout": PostgREST geeft ook een fout als de functie helemáál niet
      //    bestaat, en dan is deze test groen terwijl de bewaking weg is.
      const alice = await createTestUser('domeinregel3-alice');

      try {
        const { error } = await alice.db.rpc('domeinregel3_bewaking');
        expect(error?.code, JSON.stringify(error)).toBe('42501');
      } finally {
        await removeTestUsers();
      }
    },
    SETUP_TIMEOUT,
  );
});

/**
 * Het tweede slot voedt zichzelf niet — de trigger overschrijft, hij vult niet aan.
 *
 * ⚠️ **Waarom dit er apart bij moet.** `domeinregel3_bewaking()` toetst dat de
 *    drie sloten bestáán. Dat is precies wat een structuurcontrole kan, en het is
 *    niet genoeg: verandert `new.subject_id := owner` ooit in
 *    `if new.subject_id is null then …`, dan staan alle drie de sloten er nog
 *    en meldt de bewaking niets, terwijl de client de kolom voortaan zelf vult
 *    waar de CHECK op kijkt.
 *
 * ⚠️ **Dat wórdt vandaag gevangen, maar per ongeluk.** Op 27-08-2026 gemeten op
 *    de lokale stack: met die ene regel omgezet vielen er tien tests om, verspreid
 *    over vier bestanden. Alleen doen die dat omdat hun opbouw toevallig
 *    `subject_id: bob.id` meegeeft terwijl bob óók de goedkeurder is — dan botst
 *    de CHECK. Ruimt iemand die overbodige regel op (en dat is precies wat je met
 *    een veld doet dat een trigger vult), dan is de dekking weg zonder dat er iets
 *    rood wordt. Regel 18, vraag 3.
 *
 * ⚠️ **De tweede test hieronder is degene die er echt niet was.** Een vervalste
 *    `subject_id` die naar een dérde wijst, komt langs de CHECK — `approver_id <>
 *    subject_id` klopt dan gewoon. Alleen het overschrijven zelf houdt hem tegen,
 *    en dus is dat het enige wat hem toetst.
 */
describe.skipIf(!rlsTestsConfigured)('Domeinregel 3 — de trigger overschrijft', () => {
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let groupId: string;
  const voltooiingen: string[] = [];

  beforeAll(async () => {
    [alice, bob, carol] = await Promise.all([
      createTestUser('dr3-alice'),
      createTestUser('dr3-bob'),
      createTestUser('dr3-carol'),
    ]);

    const groep = await alice.db.rpc('create_group', { group_name: 'Vervalsing' });
    const uit = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groep.error || uit.ok !== true || uit.group === undefined) {
      throw new Error(`Groep niet aangemaakt: ${groep.error?.message ?? 'geen groep'}`);
    }
    groupId = uit.group.id;

    for (const lid of [bob, carol]) {
      const mee = await lid.db.rpc('join_group_with_code', { code: uit.group.invite_code });
      const m = (mee.data ?? {}) as { ok?: boolean; reason?: string };
      if (mee.error || m.ok !== true) {
        throw new Error(`lid worden mislukte: ${mee.error?.message ?? m.reason}`);
      }
    }

    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Vervalsingsdoel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppel = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    // Twee weekdoelen en twee voltooiingen: één goedkeuring per voltooiing, want
    // een tweede is met een unieke constraint uitgesloten (domeinregel 3).
    for (const index of [1, 2]) {
      const weekdoel = await alice.db
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `Vervalsingsweek ${index}`,
          cycle_start_date: cycle.startDate,
          cycle_index: index,
        })
        .select('id')
        .single();
      if (weekdoel.error || weekdoel.data === null) {
        throw new Error(`weekdoel: ${weekdoel.error?.message}`);
      }

      const voltooiing = await alice.db
        .from('completions')
        .insert({
          weekly_goal_id: weekdoel.data.id,
          user_id: alice.id,
          achieved_level: 'ceiling',
          // De groep staat standaard op `evidence_policy = 'optional'` en vraagt
          // dan om een korte notitie. Die is hier verder niet interessant.
          note: 'Vervalsingsproef',
          cycle_start_date: cycle.startDate,
        })
        .select('id')
        .single();
      if (voltooiing.error || voltooiing.data === null) {
        throw new Error(`voltooiing: ${voltooiing.error?.message}`);
      }
      voltooiingen.push(voltooiing.data.id);
    }
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function keurGoed(completionId: string, vervalst: string): Promise<string | null> {
    const { error } = await bob.db.from('completion_approvals').insert({
      completion_id: completionId,
      approver_id: bob.id,
      subject_id: vervalst,
      group_id: groupId,
      status: 'approved',
    });
    if (error) throw new Error(`goedkeuring: ${error.message}`);

    const { data, error: leesfout } = await adminDb()
      .from('completion_approvals')
      .select('subject_id')
      .eq('completion_id', completionId)
      .single();
    if (leesfout) throw new Error(`teruglezen: ${leesfout.message}`);

    return data?.subject_id ?? null;
  }

  it(
    'zet een subject_id die naar de goedkeurder zelf wijst terug op de eigenaar',
    async () => {
      expect(await keurGoed(voltooiingen[0] ?? '', bob.id)).toBe(alice.id);
    },
    TEST_TIMEOUT,
  );

  it(
    'zet ook een subject_id die naar een derde wijst terug op de eigenaar',
    async () => {
      // ⚠️ Deze komt langs `completion_approvals_not_self`: carol is niet bob.
      //    Alleen het overschrijven houdt hem tegen — er is geen tweede slot dat
      //    dit vangt, en dat is precies waarom deze test bestaat.
      expect(await keurGoed(voltooiingen[1] ?? '', carol.id)).toBe(alice.id);
    },
    TEST_TIMEOUT,
  );
});
