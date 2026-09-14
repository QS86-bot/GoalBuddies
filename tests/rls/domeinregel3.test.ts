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
 *    sloten bestáán — sinds 0262 zijn dat er zes. Dat is precies wat een
 *    structuurcontrole kan, en het is niet genoeg: verandert
 *    `new.subject_id := owner` ooit in `if new.subject_id is null then …`, dan
 *    staan alle sloten er nog en meldt de bewaking niets, terwijl de client de
 *    kolom voortaan zelf vult waar de CHECK op kijkt.
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

/**
 * Clausule 2 — *alleen een lid van dezelfde buddy-groep* — buiten RLS om.
 *
 * ⚠️ **Waarom deze tests langs `adminDb()` lopen en niet langs een gebruiker.**
 *    Domeinregel 3 eist twee sloten: RLS **én** de database. De policy
 *    `completion_approvals_insert` toetst clausule 2 al, dus een test via
 *    `bob.db` bewijst alleen dat de pólicy werkt en zou groen blijven als het
 *    tweede slot er nooit kwam. `adminDb()` draait als `service_role`, en die
 *    rol heeft BYPASSRLS — precies wat een `security definer`-functie doet, en
 *    dat is het dreigingsmodel dat 0252 zelf aanneemt.
 *
 * 📏 **Wat er vóór 0262 gebeurde, gemeten op 14-09-2026 met de trigger uit:**
 *    een wildvreemde goedkeurder werd TOEGELATEN, en een `group_id` waar het
 *    doel niet aan hing ook. Een gelogen `subject_id` gaf in dezelfde opzet
 *    `23503` — dat was de controlemeting die bewees dat het instrument iets
 *    kón vangen.
 *
 * ⚠️ **De gelukte goedkeuring hoort erbij en is geen plichtnummer.** Zonder
 *    hem betekent "geweigerd" net zo goed dat de fixture stuk is; met hem staat
 *    vast dat dezelfde weg voor een groepsgenoot wél openstaat.
 *
 * IJKING — met de hand gedraaid op 14-09-2026 tegen de lokale stack op 0262,
 * één mutatie per grendel, en van elke mutatie is eerst op de database
 * bevestigd dát hij erin zat. Vooraf: 9 groen. Na herstel: 9 groen.
 *
 *   M1  de lidmaatschapstoets uit `fill_approval_subject()`
 *       -> 3 rood: bewakingsslot `clausule2-lidmaatschap`, plus "weigert een
 *          goedkeurder die geen lid is" en "weigert een lid dat op inactief staat"
 *   M2  de koppelingstoets (`goal_group_links`) eruit
 *       -> 2 rood: bewakingsslot `clausule2-koppeling`, plus "weigert een groep
 *          waar het doel niet aan hangt"
 *   M3  de foreign key van 0252 gedropt
 *       -> 1 rood: bewakingsslot `eigenaar-fk`
 *   M4  op UPDATE altijd hertoetsen (`toets_clausule2 := true`)
 *       -> 1 rood: "laat een gegeven goedkeuring staan nadat de goedkeurder de
 *          groep verlaat" — precies de vorm die een foreign key zou opleggen
 *   M5  de lidmaatschapstoets omgekeerd (`status = 'inactive'`)
 *       -> 6 rood, waaronder de controlemeting "laat een groepsgenoot erdoor"
 *   M6  de `elsif new.approver_id is null`-tak eruit
 *       -> 5 rood, en dat is de belangrijkste uitslag van deze ijking: vier
 *          ervan staan in `tests/rls/opruiming.test.ts` en gaan over het
 *          wisrecht, niet over domeinregel 3. Zie de kop van de laatste test
 *          hieronder
 *
 * ⚠️⚠️ **En één ding aan die ijking klopte eerst niet, en dat hoort hier te
 *    staan.** De eerste bevestigingsquery voor M4 zocht `toets_clausule2 :=
 *    true;` in het functielichaam — maar die regel stáát ook in de ongemuteerde
 *    versie, in de INSERT-tak. Hij las dus `true` in élke stand, ook zonder
 *    mutatie: een indicator die nergens op reageert. M4 is daarna opnieuw
 *    bevestigd op `is distinct from old.group_id` (false met mutatie, true na
 *    herstel). **Een ijking die op "er werd iets rood" leunt, moet weten dat
 *    er ook echt iets veránderd is** — CLAUDE.md bij regel 18.
 */
describe.skipIf(!rlsTestsConfigured)('Domeinregel 3 — clausule 2 geldt ook buiten RLS', () => {
  let alice: TestUser;
  let bob: TestUser;
  let dave: TestUser;
  let groupId: string;
  let andereGroep: string;
  const voltooiingen: string[] = [];

  beforeAll(async () => {
    [alice, bob, dave] = await Promise.all([
      createTestUser('dr3c2-alice'),
      createTestUser('dr3c2-bob'),
      createTestUser('dr3c2-dave'),
    ]);

    const groep = await alice.db.rpc('create_group', { group_name: 'Clausule twee' });
    const uit = (groep.data ?? {}) as { ok?: boolean; group?: { id: string; invite_code: string } };
    if (groep.error || uit.ok !== true || uit.group === undefined) {
      throw new Error(`Groep niet aangemaakt: ${groep.error?.message ?? 'geen groep'}`);
    }
    groupId = uit.group.id;

    const mee = await bob.db.rpc('join_group_with_code', { code: uit.group.invite_code });
    const m = (mee.data ?? {}) as { ok?: boolean; reason?: string };
    if (mee.error || m.ok !== true) {
      throw new Error(`lid worden mislukte: ${mee.error?.message ?? m.reason}`);
    }

    // Dave zit in een eigen groep en nergens anders — de wildvreemde.
    const eigen = await dave.db.rpc('create_group', { group_name: 'Daves eigen groep' });
    const e = (eigen.data ?? {}) as { ok?: boolean; group?: { id: string } };
    if (eigen.error || e.ok !== true || e.group === undefined) {
      throw new Error(`Tweede groep niet aangemaakt: ${eigen.error?.message ?? 'geen groep'}`);
    }
    andereGroep = e.group.id;

    const cycle = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, new Date());

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Clausule-twee-doel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

    const koppel = await alice.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: groupId });
    if (koppel.error) throw new Error(`koppeling: ${koppel.error.message}`);

    // Vier voltooiingen: één per geval, want `completion_approvals_one_vote`
    // staat één stem per beoordelaar per voltooiing toe.
    for (const index of [1, 2, 3, 4]) {
      const weekdoel = await alice.db
        .from('weekly_goals')
        .insert({
          goal_id: doel.data.id,
          title: `Clausule-twee-week ${index}`,
          cycle_start_date: cycle.startDate,
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
          note: 'Clausule-twee-proef',
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

  /** Schrijft rechtstreeks als `service_role` — dus zonder policy ertussen. */
  async function keurGoedLangsRls(
    completionId: string,
    approverId: string | null,
    groep: string,
  ): Promise<{ code: string | null; message: string }> {
    const { error } = await adminDb().from('completion_approvals').insert({
      completion_id: completionId,
      approver_id: approverId,
      subject_id: alice.id,
      group_id: groep,
      status: 'approved',
    });
    return { code: error?.code ?? null, message: error?.message ?? '' };
  }

  it(
    'laat een groepsgenoot erdoor — de controlemeting',
    async () => {
      const uitslag = await keurGoedLangsRls(voltooiingen[0] ?? '', bob.id, groupId);
      expect(uitslag.code, uitslag.message).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een goedkeurder die geen lid van de groep is',
    async () => {
      const uitslag = await keurGoedLangsRls(voltooiingen[1] ?? '', dave.id, groupId);
      expect(uitslag.code, uitslag.message).toBe('23514');
      expect(uitslag.message).toContain('buddy-groep');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een groep waar het doel van de voltooiing niet aan hangt',
    async () => {
      // ⚠️ Dave is hier wél lid van `andereGroep`. Zonder de tweede helft van
      //    clausule 2 is "dezelfde buddy-groep" dus geen grens maar een
      //    invulveld: je noemt een groep waar je toevallig in zit.
      const uitslag = await keurGoedLangsRls(voltooiingen[2] ?? '', dave.id, andereGroep);
      expect(uitslag.code, uitslag.message).toBe('23514');
      expect(uitslag.message).toContain('hoort niet bij de opgegeven groep');
    },
    TEST_TIMEOUT,
  );

  it(
    'weigert een lid dat op inactief staat',
    async () => {
      await adminDb()
        .from('group_members')
        .update({ status: 'inactive' })
        .eq('group_id', groupId)
        .eq('user_id', bob.id);

      try {
        const uitslag = await keurGoedLangsRls(voltooiingen[3] ?? '', bob.id, groupId);
        expect(uitslag.code, uitslag.message).toBe('23514');
      } finally {
        await adminDb()
          .from('group_members')
          .update({ status: 'active' })
          .eq('group_id', groupId)
          .eq('user_id', bob.id);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️ **De reden dat dit geen foreign key is, als test.**
   *
   * 📏 Gemeten op 14-09-2026 met de voorgestelde FK naar `group_members` erin:
   *    met `on delete cascade` verdween de goedkeuring bij een vertrek (1 -> 0
   *    rijen), met `on delete restrict` werd het vertrek geblokkeerd met
   *    `23503`. Allebei fout: de eerste sloopt domeinregel 6 (append-only), de
   *    tweede breekt 0102 — *"een vertrek is een handeling"*.
   *
   *    Clausule 2 is een feit van het **moment van goedkeuren**, en deze test is
   *    de enige plek waar dat onderscheid vastligt. Zonder hem leest de trigger
   *    als een omslachtige foreign key en bouwt de volgende lezer hem alsnog om.
   */
  it(
    'laat een gegeven goedkeuring staan nadat de goedkeurder de groep verlaat',
    async () => {
      const vertrek = await bob.db.rpc('verlaat_groep', {
        p_group_id: groupId,
        p_bevestigd: true,
      });
      const v = (vertrek.data ?? {}) as { ok?: boolean; reason?: string };
      expect(vertrek.error?.message ?? v.reason ?? 'ok').toBe('ok');
      expect(v.ok, JSON.stringify(vertrek.data)).toBe(true);

      const { data, error } = await adminDb()
        .from('completion_approvals')
        .select('id')
        .eq('completion_id', voltooiingen[0] ?? '');
      expect(error?.message ?? null).toBeNull();
      expect(data ?? []).toHaveLength(1);

      // En hij blijft bewerkbaar: de trigger hertoetst alleen als de rij naar
      // een ánder lidmaatschap gaat wijzen.
      const bijwerken = await adminDb()
        .from('completion_approvals')
        .update({ comment: 'later toegevoegd' })
        .eq('id', (data ?? [])[0]?.id ?? '');
      expect(bijwerken.error?.message ?? null).toBeNull();
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **Een referentiële actie ís een UPDATE, en die vuurt deze trigger.**
   *
   * 📏 Gemeten tijdens het bouwen van 0262, en het was bijna het wisrecht:
   *    `completion_approvals.approver_id` staat op `on delete set null`, dus
   *    `verwijder_mijn_account()` laat Postgres
   *    `update only completion_approvals set approver_id = null` doen. Die
   *    UPDATE verándert `approver_id`, dus de hertoets van clausule 2 vuurde,
   *    keek naar het lidmaatschap van `null` en wierp — **niemand die ooit een
   *    goedkeuring gaf, kon nog weg**. Dat is letterlijk de belofte van QS8-371,
   *    over dezelfde kolom.
   *
   *    Het wérd gevangen, door `tests/rls/opruiming.test.ts` — die toetst de
   *    hele veeg en niet deze trigger. Deze test staat hier omdat de belofte
   *    hier woont: een `approver_id` die op `null` gezet wordt is de
   *    anonimisering van een vertrokken account en geen nieuwe bewering.
   *
   * ⚠️ De keerzijde staat er met opzet bij. Op een INSERT weigert `null` wél —
   *    een goedkeuring zonder goedkeurder is geen goedkeuring, en clausule 2
   *    zou er anders langs kunnen. Zonder die tweede helft is de uitzondering
   *    een gat.
   */
  it(
    'laat de anonimisering van een vertrokken goedkeurder door, maar geen lege goedkeuring',
    async () => {
      const { data } = await adminDb()
        .from('completion_approvals')
        .select('id')
        .eq('completion_id', voltooiingen[0] ?? '');

      const anonimiseren = await adminDb()
        .from('completion_approvals')
        .update({ approver_id: null })
        .eq('id', (data ?? [])[0]?.id ?? '');
      expect(anonimiseren.error?.message ?? null).toBeNull();

      const leeg = await keurGoedLangsRls(voltooiingen[1] ?? '', null, groupId);
      expect(leeg.code, leeg.message).toBe('23514');
      expect(leeg.message).toContain('buddy-groep');
    },
    TEST_TIMEOUT,
  );
});
