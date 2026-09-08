import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, now, userCycle, type IsoDate } from '../../src/shared/time';
import { adminDb, createTestUser, removeTestUsers, rlsTestsConfigured, type TestUser } from './harness';
import { psql } from './psql-stack';

/**
 * De cyclus van een weekdoel is geen invoerveld — QS8-354, migratie 0197.
 *
 * ⚠️ **De belofte is niet "er staat een CHECK op de kolom".** Dat is een
 *    eigenschap van het onderdeel. De belofte is: *je punten komen uit de weken
 *    die je werkelijk had.* 0195 sloot het plafond (wat een week waard is); dit
 *    sluit het volume (hoeveel weken er zijn).
 *
 * ⚠️⚠️ **Wat er kon, volledig nagespeeld met twee gewone accounts in één open
 *    groep** — drie verzoeken per week, en Anna's `week_start_day` is maandag:
 *
 *      POST /weekly_goals {cycle_start_date: '2021-03-03'}  -> 201
 *      POST /completions                                     -> 201
 *      POST /completion_approvals (door de buddy)            -> 201
 *
 *    Drie willekeurige woensdagen in 2021 gaven Anna +6 en Bram +3, en
 *    `groep_klassement()` zette Anna op positie 1. Dat klassement telt per
 *    ontwerp alleen op — precies wat hem verenigbaar maakt met domeinregel 7, en
 *    ook waarom dit niet te corrigeren is zonder die belofte te breken.
 *
 * ⚠️⚠️ **De valstrik uit het issue, en hij is echt.** De dagtoets en de
 *    venstertoets zitten in dezelfde trigger, en een datum in 2021 valt door
 *    allebei. Een ijkgeval dat op een woensdag ligt, meet dus de dagtoets en
 *    zegt niets over het venster. Elk vensterageval hieronder ligt daarom op een
 *    **maandag** — de startdag van de gebruiker — zodat alleen het venster het
 *    kan weigeren. Regel 18, vraag 3.
 *
 * ⚠️ **Geen enkel geval hieronder ligt op de rand van het venster, en dat is een
 *    keuze.** De achtergrens is `eigenaarsdatum - 357`, en de eigenaar staat op
 *    dag `k` van zijn cyclus; de 52e cyclusstart terug valt er dus op maandag
 *    precies op en de rest van de week net buiten. Een geval op die rand is
 *    afwisselend groen en rood naar de dag van de week — dat meet de kalender en
 *    niet de grendel. De gevallen liggen daarom ruim aan weerszijden.
 *
 * IJKING — met de hand gedraaid op 08-09-2026, per grendel apart, telkens tegen
 * de héle RLS-suite en met `pg_get_functiondef()` erna om te zien dát de mutatie
 * er stond:
 *
 *   A  de dagtoets uit `weekdoel_cyclus_klopt()` halen
 *      → 1 rood: 'een cyclus begint op je eigen week-startdag'
 *   B  de venstertoets eruit halen
 *      → 1 rood: 'een cyclus ver in het verleden gaat er niet in'
 *   C  de trigger `goedkeuringen_dagplafond` droppen
 *      → 1 rood: 'een batch goedkeuringen boven het plafond wordt geweigerd'
 *   D  de teller de batch zélf laten overslaan (`and a.id not in (select id from
 *      nieuw)`) — de fout van QS8-343, met de trigger gewoon op zijn plek
 *      → 1 rood: 'een batch goedkeuringen boven het plafond wordt geweigerd'
 *   E  de eigenaarspoort (`v_owner is distinct from v_uid`) eruit halen
 *      → 1 rood: 'de trigger zwijgt over het profiel van een ander'
 *
 * ⚠️ **D is de ijking die telt bij criterium 3.** C bewijst alleen dat er een
 *    trigger hangt; een teller die de rijen uit dít verzoek niet ziet begrenst
 *    wanneer je mag beginnen en niet hoeveel je invoegt, en die haalt C
 *    moeiteloos. Eén mutatie voor de hele grendel was hier dus te weinig
 *    geweest.
 */

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 30_000;

interface Wereld {
  alice: TestUser;
  goalId: string;
  /** De huidige cyclusstart van Alice — altijd haar week-startdag. */
  cyclus: IsoDate;
}

let w: Wereld;

describe.skipIf(!rlsTestsConfigured)('de cyclus van een weekdoel is geen invoerveld', () => {
  beforeAll(async () => {
    const alice = await createTestUser('cyclus-alice');

    // ⚠️ De startdag vastzetten, anders hangt elk geval hieronder af van wat het
    //    profiel toevallig meekreeg — en dan meet de test de fixture.
    psql(`update profiles set tz = 'Europe/Amsterdam', week_start_day = 1 where id = '${alice.id}'`);

    const cyclus = userCycle({ weekStartDay: 1, tz: 'Europe/Amsterdam' }, now()).startDate;

    const doel = await alice.db
      .from('goals')
      .insert({ owner_id: alice.id, title: 'Cyclusdoel', target_date: addDays(cyclus, 90) })
      .select('id')
      .single();
    if (doel.error) throw new Error(`doel: ${doel.error.message}`);
    w = { alice, goalId: doel.data.id, cyclus };
  }, SETUP_TIMEOUT);

  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  async function maakWeek(datum: IsoDate, titel = 'Week') {
    return w.alice.db
      .from('weekly_goals')
      .insert({ goal_id: w.goalId, title: titel, cycle_start_date: datum })
      .select('id, cycle_start_date');
  }

  it(
    'een cyclus begint op je eigen week-startdag',
    async () => {
      // ⚠️ Eén dag naast de startdag, en verder helemaal binnen het venster: dan
      //    kan alleen de dagtoets dit weigeren.
      const poging = await maakWeek(addDays(w.cyclus, 2), 'Woensdag');

      expect(poging.error, 'een dinsdag/woensdag hoort geweigerd te worden').not.toBeNull();
      expect(poging.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'een cyclus ver in het verleden gaat er niet in',
    async () => {
      // ⚠️⚠️ **Zestig cycli terug, en met opzet op een máándag.** Lag dit geval op
      //    een woensdag, dan ving de dagtoets het al af en bewaakte deze test het
      //    venster niet — de valstrik die het issue met zoveel woorden noemt.
      const poging = await maakWeek(addDays(w.cyclus, -7 * 60), 'Lang geleden');

      expect(poging.error, 'buiten het venster hoort geweigerd te worden').not.toBeNull();
      expect(poging.error?.code).toBe('23514');
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: de lopende cyclus, acht terug, veertig terug en één vooruit',
    async () => {
      // ⚠️⚠️ **De must-allow draagt hier het meeste, en de eerste versie van deze
      //    migratie is er precies op omgevallen.** "Je kunt niets aanmaken" is
      //    gratis groen zodra de trigger te streng staat. Er stond hier eerst
      //    `vijf cycli terug` met "de diepste cliëntzijdige schrijfactie in deze
      //    suite" eronder — 📏 en dat was verkeerd geteld: `ingediend(doelVeel, 8)`
      //    in `goedkeuringsdrempel.test.ts` gaat er acht terug. Het venster van
      //    56 dagen brak daar tien bestaande tests op.
      //
      //    Vandaar dat de acht hier nu met naam en al staat, én een geval veel
      //    dieper: veertig cycli terug is nog steeds gewoon geschiedenis van een
      //    account dat een jaar meeloopt.
      const nu = await maakWeek(w.cyclus, 'Deze week');
      expect(nu.error, `de huidige cyclus werd geweigerd: ${nu.error?.message}`).toBeNull();

      const acht = await maakWeek(addDays(w.cyclus, -7 * 8), 'Acht terug');
      expect(acht.error, `acht cycli terug werd geweigerd: ${acht.error?.message}`).toBeNull();

      const veertig = await maakWeek(addDays(w.cyclus, -7 * 40), 'Veertig terug');
      expect(veertig.error, `veertig cycli terug werd geweigerd: ${veertig.error?.message}`).toBeNull();

      const vooruit = await maakWeek(addDays(w.cyclus, 7), 'Volgende week');
      expect(vooruit.error, `één cyclus vooruit werd geweigerd: ${vooruit.error?.message}`).toBeNull();
    },
    TEST_TIMEOUT,
  );

  it(
    'de trigger zwijgt over het profiel van een ander',
    async () => {
      // ⚠️⚠️ **Een `before insert`-trigger draait vóór de `with check` van de
      //    policy.** Zonder eigenaarspoort antwoordt de dagtoets dus óók op een
      //    rij die de policy daarna weigert — en dan is zeven pogingen genoeg om
      //    `profiles.week_start_day` van een ander uit te lezen, een kolom waarop
      //    `profiles` aan geen enkele client leesrecht geeft. Gevonden in de
      //    security-review van 08-09-2026.
      //
      // ⚠️ **De belofte is niet "het wordt geweigerd" maar "het wordt geweigerd
      //    zónder iets te zeggen".** Vandaar dat deze test op de foutcode zit en
      //    niet op het uitblijven van de rij: die laatste blijft groen zodra de
      //    poort weg is, want de policy weigert hem toch. Regel 18, vraag 3.
      const carla = await createTestUser('cyclus-carla');

      const poging = await carla.db
        .from('weekly_goals')
        .insert({ goal_id: w.goalId, title: 'Van een ander', cycle_start_date: addDays(w.cyclus, 2) })
        .select('id');

      expect(poging.error, 'een weekdoel in andermans doel hoort geweigerd te worden').not.toBeNull();
      expect(
        poging.error?.code,
        `42501 is de policy, 23514 is de trigger — die laatste verraadt de startdag ` +
          `van de eigenaar (kreeg ${poging.error?.code}: ${poging.error?.message})`,
      ).toBe('42501');
    },
    TEST_TIMEOUT,
  );

  it(
    'MUST-ALLOW: de rollover en de opbouw schrijven nog wél ver terug',
    async () => {
      // ⚠️ De grendel geldt alleen voor een client (`auth.uid() is not null`,
      //    de vorm van 0192). De rollover en `service_role` schrijven weken die
      //    ver terug liggen en dat is legitiem — een grendel die de rollover
      //    breekt is geen grendel maar een storing.
      const ver = await adminDb()
        .from('weekly_goals')
        .insert({
          goal_id: w.goalId,
          title: 'Van de rollover',
          cycle_start_date: addDays(w.cyclus, -7 * 80),
        })
        .select('id');

      expect(ver.error, `service_role werd geweigerd: ${ver.error?.message}`).toBeNull();
      expect(ver.data ?? []).toHaveLength(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'een batch goedkeuringen boven het plafond wordt geweigerd',
    async () => {
      // ⚠️⚠️ **De teller moet de batch zelf meetellen, en dat is de les van
      //    QS8-343.** Een `STABLE SECURITY DEFINER`-teller leest de snapshot van
      //    vóór het statement, dus rijen uit dít verzoek tellen niet mee — die
      //    begrenst wanneer je mag beginnen, niet hoeveel je invoegt. Vandaar de
      //    `AFTER INSERT ... FOR EACH STATEMENT` met een transitietabel, de vorm
      //    van 0192.
      //
      // ⚠️ Het plafond gaat hier even omlaag zodat de proef klein blijft; met 200
      //    zou dit geval tweehonderd voltooiingen vragen en dan meet je geduld.
      const bob = await createTestUser('cyclus-bob');
      const groep = await w.alice.db.rpc('create_group', { group_name: 'Cyclusgroep' });
      const gd = groep.data as unknown as { ok?: boolean; group?: { id: string } };
      if (gd.ok !== true || !gd.group) throw new Error(`groep: ${JSON.stringify(groep.data)}`);

      const code = psql(`select invite_code from public.groups where id = '${gd.group.id}'`).trim();
      await bob.db.rpc('join_group_with_code', { code });
      await w.alice.db.from('goal_group_links').insert({ goal_id: w.goalId, group_id: gd.group.id });

      // vijf voltooiingen klaarzetten, buiten de client om
      const weken = psql(`
        insert into public.weekly_goals (goal_id, title, cycle_start_date)
        select '${w.goalId}', 'Batch ' || i, date '${w.cyclus}' - (7 * i)
        from generate_series(1, 5) i returning id
      `).trim().split('\n');
      for (const id of weken) {
        psql(`insert into public.completions (weekly_goal_id, user_id, achieved_level, note)
              values ('${id.trim()}', '${w.alice.id}', 'ceiling', 'af')`);
      }

      psql(`create or replace function public.goedkeuringen_plafond() returns integer
            language sql immutable set search_path to 'public','pg_temp' as $fn$ select 3 $fn$`);
      try {
        const ids = psql(`select c.id from public.completions c
                          join public.weekly_goals wg on wg.id = c.weekly_goal_id
                          where wg.goal_id = '${w.goalId}'`).trim().split('\n');
        const poging = await bob.db.from('completion_approvals').insert(
          // ⚠️ `subject_id` gaat mee omdat het gegenereerde type hem eist; de
          //    trigger `fill_approval_subject` overschrijft hem toch met de
          //    eigenaar van de voltooiing.
          ids.map((id) => ({
            completion_id: id.trim(),
            approver_id: bob.id,
            subject_id: w.alice.id,
            status: 'approved',
            group_id: gd.group!.id,
          })),
        );

        expect(poging.error, 'vijf goedkeuringen tegen een plafond van 3 horen te falen').not.toBeNull();
        expect(poging.error?.code).toBe('23514');
        expect(poging.error?.message, 'de melding hoort de batch te noemen').toContain('erbij');
      } finally {
        psql(`create or replace function public.goedkeuringen_plafond() returns integer
              language sql immutable set search_path to 'public','pg_temp' as $fn$ select 200 $fn$`);
      }
    },
    TEST_TIMEOUT,
  );
});
