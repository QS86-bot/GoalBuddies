/**
 * Vier routes scheiden een wachtende week van zijn beoordelaars — migratie 0109.
 *
 * ⚠️ **De bevinding van 27-08 telde er twee en het zijn er vier.** Hij noemde
 *    `verlaat_groep()` en het ontkoppelen van een doel, en schreef als
 *    voorwaarde op: *"wordt zwaarder als er een tweede route bijkomt die een
 *    doel van zijn beoordelaars scheidt"*. Die waren er toen al, en één ervan
 *    (`archiveer_groep()`, 0092) was twee dagen éérder gebouwd.
 *
 * ⚠️ **Elke route krijgt een eigen groep én een eigen gebruikerspaar.** Dat is
 *    de les uit `hulpfuncties.test.ts`: een gedeelde fixture hield daar een
 *    antwoord overeind dat allang veranderd was, omdat een ánder geval het lid
 *    nog in een groep had. Een suite over "er is niemand meer die kan
 *    goedkeuren" is precies het soort suite waar dat stil misgaat.
 *
 * ⚠️ **De belofte is niet "0109 geeft een rij terug".** Dat zou zichzelf
 *    toetsen. De belofte is dat élke route waarlangs een week zijn beoordelaars
 *    kwijtraakt, zichtbaar wordt — en dat een gezonde week dat niet is. Zonder
 *    die tweede helft bewijst een gevulde uitkomst alleen dat er íets misgaat.
 *
 * ⚠️ **0109 repareert de vastloper niet, en dat is geen omissie.** De echte
 *    oplossing is de goedkeuringstermijn uit beslisdocument 001 §2.6b.3, en
 *    welke uitkomst een verlopen `pending` krijgt is een productbeslissing die
 *    het puntenmodel raakt. Deze suite bewaakt de teller, niet de reparatie —
 *    zodat route vijf opvalt in plaats van stil te blijven.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addDays, localDateIn, now, type IsoDate, type TimeZone } from '../../src/shared/time';
import {
  adminDb,
  createTestUser,
  removeTestUsers,
  rlsTestsConfigured,
  type TestUser,
} from './harness';

const SETUP_TIMEOUT = 180_000;
const TEST_TIMEOUT = 60_000;

interface Opstelling {
  /** De eigenaar van het doel — degene wiens week op goedkeuring wacht. */
  eigenaar: TestUser;
  /** Het enige lid dat die week zou mógen beoordelen. */
  beoordelaar: TestUser;
  groupId: string;
  goalId: string;
  completionId: string;
}

/** Wat 0109 over dit doel meldt: de reden, of `null` als er niets vastligt. */
async function vastgelopenReden(goalId: string): Promise<string | null> {
  const { data, error } = await adminDb().rpc('vastgelopen_goedkeuringen');
  if (error) throw new Error(`vastgelopen_goedkeuringen: ${error.message}`);

  const rijen = (data ?? []) as { goal_id: string; reden: string }[];
  return rijen.find((r) => r.goal_id === goalId)?.reden ?? null;
}

/**
 * Bouwt een verse groep met een eigenaar, één beoordelaar en een week die op
 * goedkeuring wacht.
 *
 * ⚠️ De `pending`-status wordt niet gezet maar verdíend: `completions_mark_pending`
 *    doet dat bij het invoegen van de voltooiing. Een fixture die de status zelf
 *    schrijft, toetst een toestand die de app misschien nooit maakt.
 */
async function bouwOpstelling(label: string): Promise<Opstelling> {
  const eigenaar = await createTestUser(`${label}-eigenaar`);
  const beoordelaar = await createTestUser(`${label}-beoordelaar`);

  const groep = await eigenaar.db.rpc('create_group', { group_name: `Vastgelopen-${label}` });
  const groepData = groep.data as unknown as {
    ok?: boolean;
    group?: { id: string; invite_code: string };
  };
  if (groepData.ok !== true || !groepData.group) {
    throw new Error(`groep aanmaken mislukte: ${JSON.stringify(groep.data)}`);
  }

  const meedoen = await beoordelaar.db.rpc('join_group_with_code', {
    code: groepData.group.invite_code,
  });
  const mee = (meedoen.data ?? {}) as { ok?: boolean; reason?: string };
  if (mee.ok !== true) throw new Error(`beoordelaar werd geen lid: ${mee.reason ?? 'geen reden'}`);

  const admin = adminDb();
  const vandaag = localDateIn('UTC' as TimeZone, now()) as IsoDate;

  const doel = await eigenaar.db
    .from('goals')
    .insert({ owner_id: eigenaar.id, title: 'VASTDOEL', target_date: addDays(vandaag, 90) })
    .select('id')
    .single();
  if (doel.error || doel.data === null) throw new Error(`doel: ${doel.error?.message}`);

  const koppeling = await eigenaar.db
    .from('goal_group_links')
    .insert({ goal_id: doel.data.id, group_id: groepData.group.id });
  if (koppeling.error) throw new Error(`koppeling: ${koppeling.error.message}`);

  // ⚠️ Via de beheerdersclient: `authenticated` heeft geen insert-recht op
  //    `weekly_goals` — die lopen in de app via een RPC. Dat is opstelling en
  //    niet wat hier getoetst wordt.
  const weekdoel = await admin
    .from('weekly_goals')
    .insert({
      goal_id: doel.data.id,
      title: 'VASTWEEK',
      points_ceiling: 2,
      points_floor: 1,
      points_miss: -1,
      cycle_start_date: vandaag,
      cycle_index: 1,
    })
    .select('id')
    .single();
  if (weekdoel.error || weekdoel.data === null) throw new Error(`weekdoel: ${weekdoel.error?.message}`);

  const voltooiing = await eigenaar.db
    .from('completions')
    .insert({
      weekly_goal_id: weekdoel.data.id,
      user_id: eigenaar.id,
      achieved_level: 'ceiling',
      note: 'af',
      cycle_start_date: vandaag,
    })
    .select('id')
    .single();
  if (voltooiing.error || voltooiing.data === null) {
    throw new Error(`voltooiing: ${voltooiing.error?.message}`);
  }

  return {
    eigenaar,
    beoordelaar,
    groupId: groepData.group.id,
    goalId: doel.data.id,
    completionId: voltooiing.data.id,
  };
}

describe.skipIf(!rlsTestsConfigured)('een week die zijn beoordelaars kwijtraakt', () => {
  afterAll(async () => {
    await removeTestUsers();
  }, SETUP_TIMEOUT);

  describe('de gezonde kant', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('gezond');
    }, SETUP_TIMEOUT);

    it(
      'meldt niets zolang er een beoordelaar is',
      async () => {
        // ⚠️ **Dit is de helft die deze suite bruikbaar houdt.** Een teller die
        //    élke wachtende week meldt, leert je hem te negeren — en dan is de
        //    dag dat er echt iets vastligt niet te onderscheiden.
        expect(await vastgelopenReden(o.goalId)).toBeNull();
      },
      TEST_TIMEOUT,
    );

    it(
      'meldt niets meer zodra de week is goedgekeurd',
      async () => {
        const { error } = await o.beoordelaar.db.from('completion_approvals').insert({
          completion_id: o.completionId,
          approver_id: o.beoordelaar.id,
          subject_id: o.eigenaar.id,
          group_id: o.groupId,
          status: 'approved',
        });
        expect(error).toBeNull();
        expect(await vastgelopenReden(o.goalId)).toBeNull();
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 1 — de eigenaar ontkoppelt zijn doel van de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r1');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder koppeling',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        const { error } = await o.eigenaar.db
          .from('goal_group_links')
          .delete()
          .eq('goal_id', o.goalId)
          .eq('group_id', o.groupId);
        expect(error).toBeNull();

        expect(await vastgelopenReden(o.goalId)).toBe('geen_koppeling');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 2 — de eigenaar verlaat de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r2');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder koppeling',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        // ⚠️ **Drie argumenten, en de bevestiging is er één van.** Bij het meten
        //    van deze bevinding gaf een aanroep met één argument
        //    `{"ok": false, "reason": "not_confirmed"}` — en dat las als bewijs
        //    dat deze route niet bestond. Een handeling die niets deed, ziet
        //    eruit als een dichte deur. Vandaar dat de uitkomst hier getoetst
        //    wordt en niet aangenomen.
        const { data } = await o.eigenaar.db.rpc('verlaat_groep', {
          p_group_id: o.groupId,
          p_bevestigd: true,
          p_nieuwe_beheerder: o.beoordelaar.id,
        });
        expect((data as { ok?: boolean } | null)?.ok).toBe(true);

        expect(await vastgelopenReden(o.goalId)).toBe('geen_koppeling');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 3 — de beheerder zet de enige beoordelaar op inactive', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r3');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter zonder iemand die mag oordelen',
      async () => {
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        // ⚠️ **Door de beheerder en niet door het lid zelf.**
        //    `guard_group_member_update()` zet de `status` van een gewoon lid
        //    stilzwijgend terug; een meting die dat niet naleest, concludeert
        //    ten onrechte dat deze route dicht zit. Hier is de eigenaar de
        //    beheerder van zijn eigen groep.
        const { error } = await o.eigenaar.db
          .from('group_members')
          .update({ status: 'inactive' })
          .eq('group_id', o.groupId)
          .eq('user_id', o.beoordelaar.id);
        expect(error).toBeNull();

        const na = await adminDb()
          .from('group_members')
          .select('status')
          .eq('group_id', o.groupId)
          .eq('user_id', o.beoordelaar.id)
          .single();
        expect(na.data?.status).toBe('inactive');

        expect(await vastgelopenReden(o.goalId)).toBe('geen_beoordelaar');
      },
      TEST_TIMEOUT,
    );
  });

  describe('route 4 — de beheerder archiveert de groep', () => {
    let o: Opstelling;
    beforeAll(async () => {
      o = await bouwOpstelling('r4');
    }, SETUP_TIMEOUT);

    it(
      'laat de week achter in een groep die niemand meer opent',
      async () => {
        // ⚠️ **Deze route kwam met 0092 op 25-08, twee dagen vóór de bevinding
        //    werd opgeschreven, en stond er niet in.** Dat is precies wat de
        //    "wordt zwaarder als"-zin had moeten vangen.
        expect(await vastgelopenReden(o.goalId)).toBeNull();

        const { data } = await o.eigenaar.db.rpc('archiveer_groep', {
          p_group_id: o.groupId,
          p_bevestigd: true,
        });
        expect((data as { ok?: boolean } | null)?.ok).toBe(true);

        expect(await vastgelopenReden(o.goalId)).toBe('geen_actieve_groep');
      },
      TEST_TIMEOUT,
    );
  });
});
