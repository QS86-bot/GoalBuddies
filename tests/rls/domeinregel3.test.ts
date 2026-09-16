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
 * één mutatie per grendel, en van élke mutatie is eerst op de database
 * bevestigd dát hij erin zat. Vooraf 20 groen, na herstel 20 groen (dit bestand
 * plus `tests/rls/opruiming.test.ts`, want de `null`-tak raakt het wisrecht).
 *
 *   M1  de lidmaatschapstoets eruit                      -> 6 rood
 *   M2  de koppelingstoets (`goal_group_links`) eruit     -> 4 rood
 *   M4  op UPDATE altijd hertoetsen                       -> 2 rood
 *   M5  de lidmaatschapstoets omgekeerd                   -> 11 rood, incl. de
 *                                                            controlemeting
 *   M6  de `elsif new.approver_id is null`-tak eruit      -> 5 rood, waarvan
 *                                                            **vier over het
 *                                                            wisrecht**
 *   M7  `completion_id` uit de hertoetsvoorwaarde          -> 1 rood
 *   M8  weer twee verschillende foutteksten                -> 2 rood
 *
 * En vier op de bewaking zelf, die tot deze ronde alle vier **stil** bleven —
 * gevonden door de security-ronde en daarna hier nagemeten:
 *
 *   M9a  de trigger uitgezet (`tgenabled = 'D'`)           -> 9 rood
 *   M9b  de trigger opnieuw als `before insert` **only**   -> 3 rood
 *   M10  het lichaam uitgehold, de twee gezochte zinnen
 *        in een `/* … *\/`-blokcommentaar                  -> 7 rood
 *
 * (Een vierde — de trigger naar een lege functie laten wijzen — is direct op
 * `domeinregel3_bewaking()` gemeten en meldt sindsdien `trigger`.)
 *
 * ⚠️⚠️ **Twee keer klopte een bevestigingsquery niet, en dat hoort hier te
 *    staan, want het is precies de fout waar CLAUDE.md bij regel 18 voor
 *    waarschuwt.** De eerste zocht `toets_clausule2 := true;` voor M4 — maar
 *    die regel stáát ook in de ongemuteerde versie, in de INSERT-tak. De tweede
 *    zocht `old.completion_id then` voor M7 en trof daarmee de `null`-tak in
 *    plaats van de hertoetsvoorwaarde. Allebei lazen ze `true` in élke stand:
 *    **indicatoren die nergens op reageren.** Opnieuw bevestigd op
 *    `is distinct from old.group_id` en op
 *    `or new.completion_id is distinct from old.completion_id`, allebei `false`
 *    met mutatie en `true` na herstel.
 *
 *    De uitslagen waren geen van beide fout — de goede tests werden rood. Maar
 *    de **bevestiging** bewees niets, en dat is aan de uitslag niet te zien.
 *    *Een meting die op "er werd iets rood" leunt, moet weten wat er veranderd
 *    is.*
 */
describe.skipIf(!rlsTestsConfigured)('Domeinregel 3 — clausule 2 geldt ook buiten RLS', () => {
  let alice: TestUser;
  let bob: TestUser;
  let dave: TestUser;
  let groupId: string;
  let andereGroep: string;
  /** Een voltooiing van Dave, op een doel dat alleen aan Daves groep hangt. */
  let vreemdeVoltooiing: string;
  /** De cyclus van de opstelling, om diezelfde reden. */
  let aliceCyclus = { startDate: '', endDate: '' };
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

    aliceCyclus = cycle;

    vreemdeVoltooiing = await maakVoltooiingVoorDave(cycle);
  }, SETUP_TIMEOUT);

  /** Doel + weekdoel + voltooiing van Dave, gekoppeld aan Daves eigen groep. */
  async function maakVoltooiingVoorDave(
    cycle: { startDate: string; endDate: string },
  ): Promise<string> {
    const doel = await dave.db
      .from('goals')
      .insert({ owner_id: dave.id, title: 'Daves doel', target_date: cycle.endDate })
      .select('id')
      .single();
    if (doel.error || doel.data === null) throw new Error(`doel dave: ${doel.error?.message}`);

    const koppel = await dave.db
      .from('goal_group_links')
      .insert({ goal_id: doel.data.id, group_id: andereGroep });
    if (koppel.error) throw new Error(`koppeling dave: ${koppel.error.message}`);

    const weekdoel = await dave.db
      .from('weekly_goals')
      .insert({ goal_id: doel.data.id, title: 'Daves week', cycle_start_date: cycle.startDate })
      .select('id')
      .single();
    if (weekdoel.error || weekdoel.data === null) {
      throw new Error(`weekdoel dave: ${weekdoel.error?.message}`);
    }

    const voltooiing = await dave.db
      .from('completions')
      .insert({
        weekly_goal_id: weekdoel.data.id,
        user_id: dave.id,
        achieved_level: 'ceiling',
        note: 'Daves proef',
        cycle_start_date: cycle.startDate,
      })
      .select('id')
      .single();
    if (voltooiing.error || voltooiing.data === null) {
      throw new Error(`voltooiing dave: ${voltooiing.error?.message}`);
    }
    return voltooiing.data.id;
  }

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
      // ⚠️ Dezelfde tekst als de vorige test, en dat is met opzet — zie de test
      //    "beide helften weigeren met exact dezelfde tekst" hieronder.
      expect(uitslag.message).toContain('buddy-groep');
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
   * ⚠️⚠️ **`completion_id` telt net zo hard mee als `group_id` en `approver_id`.**
   *
   * 📏 De eerste versie hertoetste alleen op die twee, en de security-ronde op
   *    QS8-480 verplaatste een bestaande goedkeuring daarmee naar een voltooiing
   *    van een doel dat aan een ándere groep hangt: geval C van de migratiekop,
   *    maar dan op het UPDATE-pad. Het slot sloot INSERT helemaal en UPDATE half.
   *
   * ⚠️ **De tweede helft van deze test is de reden dat de eerste iets zegt.**
   *    Een goedkeuring verplaatsen naar een andere voltooiing van hetzelfde doel
   *    hóórt te mogen — de hertoets is een toets en geen verbod. Zonder die
   *    controlemeting zou "geweigerd" net zo goed kunnen betekenen dat elke
   *    `completion_id`-wijziging klapt.
   */
  it(
    'hertoetst ook als alleen completion_id verandert',
    async () => {
      const nieuw = await adminDb()
        .from('completion_approvals')
        .insert({
          completion_id: voltooiingen[3] ?? '',
          approver_id: bob.id,
          subject_id: alice.id,
          group_id: groupId,
          status: 'approved',
        })
        .select('id')
        .single();
      expect(nieuw.error?.message ?? null).toBeNull();
      const id = nieuw.data?.id ?? '';

      try {
        const omhangen = await adminDb()
          .from('completion_approvals')
          .update({ completion_id: vreemdeVoltooiing })
          .eq('id', id);
        expect(omhangen.error?.code, omhangen.error?.message ?? '').toBe('23514');

        // De controlemeting: binnen hetzelfde doel mag het wél.
        const legitiem = await adminDb()
          .from('completion_approvals')
          .update({ completion_id: voltooiingen[1] ?? '' })
          .eq('id', id);
        expect(legitiem.error?.message ?? null).toBeNull();
      } finally {
        await adminDb().from('completion_approvals').delete().eq('id', id);
      }
    },
    TEST_TIMEOUT,
  );

  /**
   * ⚠️⚠️ **De twee helften van clausule 2 weigeren met exact dezelfde tekst, en
   *    dat is een beveiligingseis en geen stijlkeuze.**
   *
   * Een BEFORE-trigger draait vóór de RLS `with check`, en hij toetst
   * `new.approver_id` — een waarde die de client zélf meestuurt. Verschillen de
   * twee meldingen, dan is dit slot een aftastinstrument: stuur je eigen
   * voltooiing in met een vreemd profiel als goedkeurder en de `group_id` van
   * een groep waar je niet in zit, en het antwoord verklapt of die persoon daar
   * lid is — precies wat `group_members_select` afschermt.
   *
   * 📏 Gemeten als `authenticated` op de eerste versie van 0262: de proeven
   *    gaven *"hoort niet bij de opgegeven groep"* tegenover *"alleen een lid
   *    van dezelfde buddy-groep"*, terwijl `select count(*) from group_members`
   *    voor dezelfde gebruiker **0** gaf. Met de functie van vóór 0262 gaven
   *    allebei de proeven letterlijk *"new row violates row-level security
   *    policy"* — één antwoord werd er twee.
   *
   * ⚠️ Er zit geen rem op: `goedkeuringen_rem` en `begrens_goedkeuringen`
   *    tellen rijen die er kómen, en een geweigerde probe schrijft niets.
   *
   * ⚠️ **Deze test vergelijkt de twee meldingen met elkaar en niet met een
   *    letterlijke zin.** Een assertie op de tekst zelf zou groen blijven zodra
   *    iemand allebei de teksten verandert maar verschillend houdt, en de
   *    belofte is juist dat ze gelijk zijn. Regel 18, vraag 2.
   */
  it(
    'weigert beide helften van clausule 2 met exact dezelfde tekst en errcode',
    async () => {
      // Dave is geen lid van `groupId` -> de eerste helft weigert.
      const geenLid = await keurGoedLangsRls(voltooiingen[1] ?? '', dave.id, groupId);
      // Dave is wél lid van `andereGroep`, maar het doel hangt daar niet aan
      // -> de tweede helft weigert.
      const geenKoppeling = await keurGoedLangsRls(voltooiingen[2] ?? '', dave.id, andereGroep);

      expect(geenLid.code).toBe('23514');
      expect(geenKoppeling.code).toBe(geenLid.code);
      expect(
        geenKoppeling.message,
        'de twee helften van clausule 2 mogen niet uit elkaar te houden zijn',
      ).toBe(geenLid.message);
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
   *
   * ⚠️⚠️ **En de uitzondering beschrijft de vórm van de referentiële actie, niet
   *    alleen zijn uitkomst.** Dat is niet netjesheid maar een gat dat er anders
   *    in zit: één UPDATE die `approver_id` op `null` zet **én** tegelijk
   *    `group_id` verplaatst, glipt langs een uitzondering die alleen naar
   *    `new.approver_id is null` kijkt — met precies de bewering die deze
   *    migratie wil toetsen. 📏 Gemeten met die smallere vorm: toegelaten. Met
   *    de drie voorwaarden samen (van gevuld naar leeg, en `group_id` blijft
   *    staan): `23514`.
   */
  it(
    'laat de anonimisering van een vertrokken goedkeurder door, maar geen lege goedkeuring',
    async () => {
      const { data } = await adminDb()
        .from('completion_approvals')
        .select('id')
        .eq('completion_id', voltooiingen[0] ?? '');
      const goedkeuringId = (data ?? [])[0]?.id ?? '';

      // Eerst het gat: null zetten én verplaatsen in dezelfde UPDATE.
      const sluiproute = await adminDb()
        .from('completion_approvals')
        .update({ approver_id: null, group_id: andereGroep })
        .eq('id', goedkeuringId);
      expect(sluiproute.error?.code, sluiproute.error?.message ?? '').toBe('23514');

      // En dan de echte referentiële vorm: alleen de ene kolom.
      const anonimiseren = await adminDb()
        .from('completion_approvals')
        .update({ approver_id: null })
        .eq('id', goedkeuringId);
      expect(anonimiseren.error?.message ?? null).toBeNull();

      // Een al geanonimiseerde rij blijft bewerkbaar, maar niet verplaatsbaar.
      const bewerken = await adminDb()
        .from('completion_approvals')
        .update({ comment: 'na de anonimisering' })
        .eq('id', goedkeuringId);
      expect(bewerken.error?.message ?? null).toBeNull();

      const verplaatsen = await adminDb()
        .from('completion_approvals')
        .update({ group_id: andereGroep })
        .eq('id', goedkeuringId);
      expect(verplaatsen.error?.code, verplaatsen.error?.message ?? '').toBe('23514');

      const leeg = await keurGoedLangsRls(voltooiingen[1] ?? '', null, groupId);
      expect(leeg.code, leeg.message).toBe('23514');
      expect(leeg.message).toContain('buddy-groep');
    },
    TEST_TIMEOUT,
  );

  // ---------------------------------------------------------------------------
  // Clausule 4 — de voltooiing is nog de actieve (QS8-503, migratie 0275)
  // ---------------------------------------------------------------------------
  //
  // ⚠️⚠️ **De vierde clausule van `completion_approvals_insert` stond tot 0275
  //    alleen in RLS.** 0262 nam er drie over; deze niet. 📏 Gemeten vóór de
  //    reparatie: een goedkeuring op een vervangen voltooiing kwam er als
  //    `service_role` gewoon in (`INSERT 0 1`), terwijl dezelfde rij als
  //    `authenticated` door de policy geweigerd wordt.
  //
  // ⚠️ **En de schade is een andere dan de agenda zei.** `award_points_on_approval()`
  //    slaat een vervangen voltooiing zelf al over, dus er kwamen géén punten
  //    bij. Wat er wél gebeurde: een `completion_approved`-systeembericht de
  //    groep in, over een week die al opnieuw ingediend was, plus een badge —
  //    `meld_goedkeuring()`, `risico_na_goedkeuring()` en
  //    `badge_na_gebeurtenis()` noemen `superseded` geen van drieën. Een
  //    systeembericht is een onveranderlijke kopie (beslisdocument 002 §3), dus
  //    dat oppervlak was niet meer weg te krijgen.
  describe('clausule 4 — de voltooiing is nog de actieve', () => {
    /**
     * ⚠️⚠️ **Eigen voltooiingen en niet `voltooiingen[2]`/`[3]`.** 📏 Die twee
     *    worden door eerdere toetsen in dit bestand gemuteerd — er hangt al een
     *    stem aan, een koppeling is verlegd, of een lidmaatschap is omgezet en
     *    weer terug. De eerste versie van deze toetsen viel daardoor om op
     *    clausule **2** (*"Alleen een lid van dezelfde buddy-groep"*), en dan
     *    meet je de opstelling en niet de grendel.
     */
    // ⚠️⚠️ **Een eigen paar per toets, en dat is een gemeten reparatie.** Eerst
    //    deelden de weiger- en de intrektoets één voltooiing. Bij de ijking —
    //    clausule 4 eruit — landde de goedkeuring in de eerste toets alsnog, en
    //    dan botste de tweede op `completion_approvals_one_vote`. Die viel dus
    //    om op een grendel die niets met zijn eigen belofte te maken heeft.
    //
    //    **Een must-allow-toets die rood wordt van een mutatie in een ándere
    //    grendel, meet die andere grendel.** Zelfde klasse als de
    //    `already_open`-val bij QS8-501.
    const paren: Record<string, { oud: string; vervanger: string }> = {};

    beforeAll(async () => {
      // ⚠️⚠️ **En een eigen goedkeurder.** 📏 Gemeten met een diagnostische regel
      //    in de toets zelf: op dit punt is Bobs rij in `group_members`
      //    **weg** — niet op `inactive`, maar verwijderd door de toets over een
      //    vertrekkend lid. Zonder deze regel valt de opstelling om op clausule
      //    2 en meet dit blok de opstelling in plaats van de grendel.
      //
      //    Dat is de derde keer in dit bestand dat een gedeelde opstelling iets
      //    anders bleek dan hij leek; vandaar dat dit blok álles zelf zet.
      const lid = await adminDb()
        .from('group_members')
        .upsert(
          { group_id: groupId, user_id: bob.id, role: 'member', status: 'active' },
          { onConflict: 'group_id,user_id' },
        );
      if (lid.error !== null) throw new Error(`lidmaatschap: ${lid.error.message}`);

      // ⚠️ Een eigen doel én een eigen koppeling, niet alleen eigen weekdoelen.
      //    📏 Met alleen eigen weekdoelen op `aliceDoel` viel de opstelling nog
      //    steeds om op clausule 2: eerdere toetsen in dit bestand raken ook de
      //    koppeling doel-groep. Wie een gedeelde opstelling half overneemt,
      //    erft de mutaties die hij niet ziet.
      const doel = await alice.db
        .from('goals')
        .insert({
          owner_id: alice.id,
          title: 'Clausule-vier-doel',
          target_date: aliceCyclus.endDate,
        })
        .select('id')
        .single();
      if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

      const koppel = await alice.db
        .from('goal_group_links')
        .insert({ goal_id: doel.data.id, group_id: groupId });
      if (koppel.error !== null) throw new Error(`koppeling: ${koppel.error.message}`);

      async function maakVoltooiing(naam: string): Promise<string> {
        const week = await alice.db
          .from('weekly_goals')
          .insert({
            goal_id: doel.data?.id ?? '',
            title: naam,
            cycle_start_date: aliceCyclus.startDate,
          })
          .select('id')
          .single();
        if (week.error || week.data === null) throw new Error(`${naam}: ${week.error?.message}`);

        const voltooiing = await alice.db
          .from('completions')
          .insert({
            weekly_goal_id: week.data.id,
            user_id: alice.id,
            achieved_level: 'ceiling',
            note: naam,
            cycle_start_date: aliceCyclus.startDate,
          })
          .select('id')
          .single();
        if (voltooiing.error || voltooiing.data === null) {
          throw new Error(`${naam}: ${voltooiing.error?.message}`);
        }
        return voltooiing.data.id;
      }

      for (const toets of ['weigeren', 'intrekken']) {
        paren[toets] = {
          oud: await maakVoltooiing(`clausule4-${toets}-oud`),
          vervanger: await maakVoltooiing(`clausule4-${toets}-vervanger`),
        };
      }
    }, SETUP_TIMEOUT);

    /** Zet een voltooiing op vervangen, met een andere voltooiing als vervanger. */
    async function zetVervangen(oud: string, vervanger: string): Promise<void> {
      const uit = await adminDb()
        .from('completions')
        .update({ superseded_by: vervanger })
        .eq('id', oud);
      if (uit.error !== null) throw new Error(`vervangen zetten: ${uit.error.message}`);
    }

    async function zetActief(id: string): Promise<void> {
      const uit = await adminDb().from('completions').update({ superseded_by: null }).eq('id', id);
      if (uit.error !== null) throw new Error(`actief zetten: ${uit.error.message}`);
    }

    it(
      'weigert een goedkeuring op een vervangen voltooiing, ook langs RLS om',
      async () => {
        const { oud, vervanger } = paren.weigeren ?? { oud: '', vervanger: '' };

        // ⚠️ De bevestigende helft eerst: zolang de voltooiing actief is, mág
        //    deze goedkeuring. Zonder deze regel is de weigering hieronder ook
        //    waar als er iets ánders in de weg zat.
        const actief = await keurGoedLangsRls(oud, bob.id, groupId);
        expect(actief.code, `de opstelling zelf mislukte: ${actief.message}`).toBeNull();

        const weg = await adminDb()
          .from('completion_approvals')
          .delete()
          .eq('completion_id', oud);
        expect(weg.error?.message ?? null).toBeNull();

        await zetVervangen(oud, vervanger);
        try {
          const uitslag = await keurGoedLangsRls(oud, bob.id, groupId);
          expect(uitslag.code, uitslag.message).toBe('23514');
          // ⚠️ Een eigen melding en niet die van clausule 2: dit gaat niet over
          //    wíe mag goedkeuren maar over wélke voltooiing nog de actieve is.
          expect(uitslag.message).toContain('vervangen');
        } finally {
          await zetActief(oud);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'laat een goedkeuring op een vervangen voltooiing wél intrekken',
      async () => {
        // ⚠️⚠️ **Dit is de must-allow-helft en de belangrijkste van de twee.**
        //    Zou clausule 4 óók op de intrek-tak gelden, dan zit een goedkeuring
        //    op een vervangen voltooiing vast — woordelijk de klasse van
        //    QS8-371, waar wie ooit een goedkeuring introk zijn account niet
        //    meer kon verwijderen. QS8-456 hangt aan dezelfde tak.
        //
        // 📏 En dit is geen randgeval: bij een quorum is één goedkeuring niet
        //    genoeg, blijft de week `pending`, en accepteert `dien_opnieuw_in()`
        //    een nieuwe poging. De oude goedkeuring blijft dan legitiem staan op
        //    een voltooiing die vervangen is.
        const { oud, vervanger } = paren.intrekken ?? { oud: '', vervanger: '' };

        const gemaakt = await keurGoedLangsRls(oud, bob.id, groupId);
        expect(gemaakt.code, `de opstelling zelf mislukte: ${gemaakt.message}`).toBeNull();

        await zetVervangen(oud, vervanger);
        try {
          const { data } = await adminDb()
            .from('completion_approvals')
            .select('id')
            .eq('completion_id', oud);
          const id = (data ?? [])[0]?.id ?? '';

          const intrekken = await adminDb()
            .from('completion_approvals')
            .update({ approver_id: null })
            .eq('id', id);
          expect(
            intrekken.error?.message ?? null,
            'het intrekken van een goedkeuring op een vervangen voltooiing werd geblokkeerd',
          ).toBeNull();
        } finally {
          await zetActief(oud);
          await adminDb().from('completion_approvals').delete().eq('completion_id', oud);
        }
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt het zodra de policy en de trigger weer uiteen lopen',
      async () => {
        // ⚠️ De bewaking is de reden dat deze reparatie geen momentopname is.
        //    Hij vond tijdens het bouwen zijn eigen bug: de policy rendert
        //    `superseded_by IS NULL` in hoofdletters, en de eerste versie van
        //    deze tak zocht met `like` in plaats van `ilike`.
        const { data, error } = await adminDb().rpc('domeinregel3_bewaking');
        expect(error).toBeNull();
        expect(
          (data ?? []) as unknown[],
          `de bewaking meldt iets: ${JSON.stringify(data)}`,
        ).toHaveLength(0);
      },
      TEST_TIMEOUT,
    );

    /**
     * ⚠️⚠️ **Wat hier bewust níet staat, en waarom.** De toets hierboven eist
     *    stilte, en stilte is ook wat je krijgt als de bewaking haar takken
     *    kwíjt is — regel 18 vraag 3. 📏 Concreet: hij bleef groen terwijl de
     *    trigger-tak van 0275 verzwakt was van `tgenabled = 'O'` naar
     *    `<> 'D'`, en een wildvreemde daardoor andermans week kon goedkeuren.
     *
     *    De toets die dát vindt, moet de bewaking iets láten zeggen, en dat
     *    vraagt `alter table … enable replica trigger`. Deze suite draait óók
     *    tegen productie (`RLS_DOEL`), en DDL hoort daar niet in een test; er
     *    is bovendien geen helper om een `alter table` via PostgREST te sturen,
     *    en er eentje bijbouwen is een groter gat dan het dicht.
     *
     *    Het is daarom met de hand gemeten en het staat als Laag-rij op de
     *    agenda, mét de voorwaarde waaronder het zwaarder wordt. Een toets die
     *    niet kán draaien is geen grendel maar een geruststelling.
     */
  });
});
